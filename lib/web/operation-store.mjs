import { writeName } from '../names.mjs';
import { prepareClaimIntent } from './attach-github.mjs';
import { canonical } from '../attach.mjs';
import { requestJson, hash, seal, unseal, WebError, exact } from './common.mjs';
export function createOperationStore(config, fetcher = fetch) {
 const scopeFor = (actor, project) => hash(JSON.stringify([config.appId,config.installationId,config.workspace.repoId,config.workspace.id,actor,project.repoId,project.id]));
 const projectFor = project => hash(JSON.stringify([config.appId,config.installationId,config.workspace.repoId,project.repoId]));
 async function rpc(operation,id,scope,opts={},raw=false) {
  const result=await requestJson(fetcher,`${config.storageUrl}/rest/v1/rpc/${writeName('database:keel_decision_rpc')}`,{method:'POST',headers:{apikey:config.storageKey,Authorization:`Bearer ${config.storageKey}`,'Content-Type':'application/json'},body:JSON.stringify({p_operation:operation,p_id:id,p_scope:scope,p_project:null,p_preview:null,p_fence:null,p_value:null,...opts})},1100000);
  if(raw)return result;
  if(result?.granted===true)throw new WebError('invalid_operation_response');
  if(!result||result.conflict)return result;
  if(typeof result.value!=='string')throw new WebError('invalid_operation_response');
  return {...result,value:unseal(result.value,config.encryptionKey,`decision:${scope}:${result.id??id}`)};
 }
 const encrypted=(id,scope,value)=>seal(value,config.encryptionKey,`decision:${scope}:${id}`);

 // Three fixed effects only. These methods never invoke a provider or persist a credential.
 const attachStages = {
  'mint-begin':'mint-started', 'mint-record':'mint-recorded', 'mint-uncertain':'mint-uncertain',
  'commit-begin':'commit-started', 'commit-record':'commit-recorded', 'commit-uncertain':'commit-uncertain', 'commit-reconcile':'commit-recorded',
  'ref-begin':'ref-started', 'ref-record':'ref-recorded', 'ref-uncertain':'ref-uncertain', 'ref-reconcile':'ref-recorded', refuse:'ready', 'ref-decline':'ref-declined',
 };
 const identityKeys=['id','scope','project','previewId','fence'];
 const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const validObservation=v=>(v?.stage==='ref-declined'
  ? exact(v,['stage','at','reason','refEffect','observedCommit'])&&v.reason==='claim-taken'&&v.refEffect==='not-started'&&/^[a-f0-9]{40}$/.test(v.observedCommit)
  : exact(v,['stage','at']))&&['ready',...Object.values(attachStages)].includes(v.stage)
  &&typeof v.at==='string'&&Number.isFinite(Date.parse(v.at))&&new Date(v.at).toISOString()===v.at;
 function claimIntent(value,id) {
  const keys=['operationId','repoId','repositoryNodeId','repo','phase','provider','machine','at','parent','tree','identity'];
  const prepared=prepareClaimIntent(Object.fromEntries(keys.map(k=>[k,value?.[k]])));
  if(prepared.operationId!==id||canonical(prepared)!==canonical(value))throw new WebError('invalid_attach_journal',400);
  return prepared;
 }
 async function attach(operation,identity,input=null,brief=null) {
  // Snapshot caller-owned bytes before the first await.
  identity=structuredClone(identity); input=structuredClone(input); brief=structuredClone(brief);
  if(!exact(identity,identityKeys)||!identityKeys.every(k=>hex(identity[k]))
   ||!['reserve','read',...Object.keys(attachStages)].includes(operation))throw new WebError('invalid_attach_journal',400);
  const {id,scope,project,previewId,fence}=identity;
  const begin=operation.endsWith('-begin'), report=operation!=='reserve'&&operation!=='read'&&!begin;
  const validBrief=b=>exact(b,['text','bytes','sha256'])&&typeof b.text==='string'&&b.bytes===Buffer.byteLength(b.text)&&b.bytes<=16384&&hash(b.text)===b.sha256;
  if(brief!==null&&(!validBrief(brief)||operation!=='reserve'))throw new WebError('invalid_attach_journal',400);
  let value=null;
  if(operation==='reserve')value=encrypted(id,scope,{kind:'attach',...identity,intent:claimIntent(input,id),...(brief===null?{}:{brief})});
  else if(report) {
   if(!validObservation(input)||input.stage!==attachStages[operation])throw new WebError('invalid_attach_observation',400);
   if(operation==='ref-decline') {
    const original=await attach('read',identity);
    if(!original||input.observedCommit===original.value.intent.commit)throw new WebError('invalid_attach_observation',400);
   }
   value=seal(input,config.encryptionKey,`attach-observation:${scope}:${id}:${input.stage}`);
  } else if(input!==null)throw new WebError('invalid_attach_journal',400);
  const row=await rpc('attach-'+operation,id,scope,{p_project:project,p_preview:previewId,p_fence:fence,p_value:value},true);
  if(row===null)return null;
  if(operation==='reserve'&&exact(row,['conflict'])&&row.conflict===true)return row;
  const invalid=()=>{throw new WebError('invalid_attach_journal_response');};
  if(!exact(row,[...identityKeys,'state','value','leaseUntil','stage','observations','created','changed','granted'])
   ||!identityKeys.every(k=>row[k]===identity[k])||typeof row.value!=='string'||typeof row.leaseUntil!=='string'||!Number.isFinite(Date.parse(row.leaseUntil))
   ||!['ready',...Object.values(attachStages)].includes(row.stage)||!['created','changed','granted'].every(k=>typeof row[k]==='boolean'))invalid();
  const state=row.stage==='ready'?['prepared','refused']:row.stage==='ref-declined'?['refused']:row.stage==='ref-recorded'?['committed']:row.stage.endsWith('-uncertain')?['uncertain']:['dispatched'];
  if(!state.includes(row.state)||row.granted!==begin
   ||(operation==='read'&&(row.created||row.changed))
   ||(operation==='reserve'&&row.created!==row.changed)
   ||(operation!=='reserve'&&operation!=='read'&&(!row.changed||row.created||row.stage!==attachStages[operation])))invalid();
  let decoded,observations;
  try {
   decoded=unseal(row.value,config.encryptionKey,`decision:${scope}:${id}`);
   if(!exact(decoded,['kind',...identityKeys,'intent',...(Object.hasOwn(decoded??{},'brief')?['brief']:[])])||decoded.kind!=='attach'||!identityKeys.every(k=>decoded[k]===identity[k]))invalid();
   claimIntent(decoded.intent,id);
   if(Object.hasOwn(decoded,'brief')&&!validBrief(decoded.brief))invalid();
   if(operation==='reserve'&&(canonical(decoded.intent)!==canonical(input)||canonical(decoded.brief??null)!==canonical(brief)))invalid();

   const history={
    ready:[[],row.state==='refused'?['ready']:[]],
    'mint-started':[[],[]], 'mint-recorded':[['mint-recorded'],[]], 'mint-uncertain':[['mint-uncertain'],[]],
    'commit-started':[['mint-recorded'],[]], 'commit-recorded':[['mint-recorded','commit-recorded'],['commit-uncertain']],
    'commit-uncertain':[['mint-recorded','commit-uncertain'],[]],
    'ref-started':[['mint-recorded','commit-recorded'],['commit-uncertain']],
    'ref-uncertain':[['mint-recorded','commit-recorded','ref-uncertain'],['commit-uncertain']],
    'ref-recorded':[['mint-recorded','commit-recorded','ref-recorded'],['commit-uncertain','ref-uncertain']],
    'ref-declined':[['mint-recorded','commit-recorded','ref-declined'],['commit-uncertain']],
   };
   const [required,optional]=history[row.stage], entries=Object.entries(row.observations??{});
   if(!row.observations||Array.isArray(row.observations)||typeof row.observations!=='object'
    ||Buffer.byteLength(JSON.stringify(row.observations))>65536||required.some(k=>!Object.hasOwn(row.observations,k))
    ||entries.some(([k,v])=>![...required,...optional].includes(k)||typeof v!=='string'||Buffer.byteLength(v)>8192))invalid();
   observations=Object.fromEntries(entries.map(([k,v])=>{
    const observed=unseal(v,config.encryptionKey,`attach-observation:${scope}:${id}:${k}`);
    if(!validObservation(observed)||observed.stage!==k||k==='ref-declined'&&observed.observedCommit===decoded.intent.commit)invalid();
    return [k,observed];
   }));
   if(report&&canonical(observations[attachStages[operation]])!==canonical(input))invalid();
  } catch {invalid();}
  return {...row,value:decoded,observations};
 }
 async function list(scope,project,{after=null,limit=20}={}) {
  const id=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  if(!id(scope)||!id(project)||(after!==null&&!id(after))||!Number.isInteger(limit)||limit<1||limit>20)throw new WebError('invalid_history_page',400);
  const result=await requestJson(fetcher,`${config.storageUrl}/rest/v1/rpc/${writeName('database:keel_run_history')}`,{method:'POST',headers:{apikey:config.storageKey,Authorization:`Bearer ${config.storageKey}`,'Content-Type':'application/json'},body:JSON.stringify({p_scope:scope,p_project:project,p_after:after,p_limit:limit})},2200000);
  if(!result||!Array.isArray(result.rows)||result.rows.length>limit||typeof result.hasMore!=='boolean'||(result.after!==null&&!id(result.after))||result.hasMore!==(result.after!==null)||result.hasMore&&result.after!==result.rows.at(-1)?.id)throw new WebError('invalid_history_response');
  const seen=new Set();
  const rows=result.rows.map(row=>{
   if(!id(row.id)||seen.has(row.id)||!id(row.previewId)||!['prepared','dispatched','uncertain','committed','refused'].includes(row.state)||typeof row.value!=='string'||row.timeBasis!=='inferred-preview-created-at'||typeof row.recordedAt!=='string'||!Number.isFinite(Date.parse(row.recordedAt)))throw new WebError('invalid_history_response');
   seen.add(row.id);
   return {...row,recordedAt:new Date(row.recordedAt).toISOString(),value:unseal(row.value,config.encryptionKey,`decision:${scope}:${row.id}`)};
  });
  return {rows,after:result.after,hasMore:result.hasMore};
 }
 return {scopeFor,projectFor,list,
  attachReserve:(identity,intent,brief=null)=>attach('reserve',identity,intent,brief),
  attachRead:identity=>attach('read',identity),
  attachTransition:(operation,identity,observation=null)=>attach(operation,identity,observation),
  createPreview:(id,scope,value)=>rpc('preview-create',id,scope,{p_value:encrypted(id,scope,value)}),
  preview:(id,scope)=>rpc('preview-read',id,scope),
  reserve:(id,scope,project,preview,fence,value)=>rpc('reserve',id,scope,{p_project:project,p_preview:preview,p_fence:fence,p_value:encrypted(id,scope,value)}),
  read:(id,scope)=>rpc('read',id,scope),
  transition:(state,id,scope,fence,value)=>rpc(state,id,scope,{p_fence:fence,p_value:value?encrypted(id,scope,value):null}),
 };
}
