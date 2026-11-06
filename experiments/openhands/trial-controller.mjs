// Experimental local single-owner controller. Native SDK is trusted orchestration;
// model-controlled effects run only through the bounded file capability.
import { spawn } from 'node:child_process';
import { createHash, randomUUID, verify, createPublicKey } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, realpathSync, lstatSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Evaluation } from './evaluation.mjs';
import { spawnContained } from './containment.mjs';
import { score } from './contained-score.mjs';
import { checkCandidate } from './check-candidate.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
export const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(canonical(value))).digest('hex');
const fileHash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sourceIdentity=config=>Object.fromEntries([config.python,...['trial-controller.mjs','sdk-trial.py','evaluation.mjs','containment.mjs','workspace-file-tool.mjs','capture-candidate.mjs','contained-score.mjs','check-candidate.mjs','check-runner.mjs'].map(n=>join(HERE,n))].map(p=>[p,fileHash(p)]));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const fail=code=>{throw Error(code);};
const inside=(root,p)=>p===root||p.startsWith(root+'/');
const write=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
const alive=pid=>{if(!Number.isInteger(pid)||pid<=0)return null;try{process.kill(pid,0);return true;}catch(e){return e.code==='ESRCH'?false:null;}};
const bounded=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail(label);};
export function validateConfig(config,root) {
  const fields=new Set(['mode','workspace','python','sdk','task','regression','actorId','project','account','model','prompt','maxRequests','maxInputTokens','maxOutputTokens','maxSeconds','requestTimeoutSeconds','scriptedApprovals','script','funding','apiBase','apiKeyEnv','brokerEnforcement','fundingProof']);
  if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!fields.has(k)))fail('unknown_configuration_field');
  if(!['scripted','api'].includes(config.mode))fail('mode');
  for(const name of ['workspace','python','sdk']){const p=config[name];if(typeof p!=='string'||!p.startsWith('/')||(name!=='python'&&realpathSync(p)!==p))fail('canonical_'+name);}
  if(!lstatSync(realpathSync(config.python)).isFile()||inside(config.workspace,config.python)||inside(config.workspace,realpathSync(config.python))||inside(root,config.python)||inside(root,realpathSync(config.python)))fail('trusted_python_outside_worker_required');
  if(inside(config.workspace,root)||inside(root,config.workspace)||inside(config.workspace,HERE)||inside(config.workspace,config.sdk))fail('private_root_overlap');
  if(!lstatSync(config.workspace).isDirectory()||typeof config.prompt!=='string'||!config.prompt||Buffer.byteLength(config.prompt)>64000)fail('workspace_or_prompt');
  if(!['task-a','task-b','synthetic'].includes(config.task))fail('task');
  if(config.regression!=null&&!/^tests\/[A-Za-z0-9_-]+\.test\.mjs$/.test(config.regression))fail('explicit_regression');
  bounded(config.maxRequests,1,60,'request_bound');bounded(config.maxInputTokens,1024,128000,'input_bound');bounded(config.maxOutputTokens,1,8192,'output_bound');bounded(config.maxSeconds,1,3600,'time_bound');bounded(config.requestTimeoutSeconds,1,120,'request_timeout');
  if(config.requestTimeoutSeconds>config.maxSeconds)fail('request_timeout_exceeds_run');
  if(!Number.isSafeInteger(config.actorId)||config.actorId<=0||typeof config.project!=='string'||!config.project||typeof config.account!=='string'||!config.account)fail('identity');
  if(config.mode==='scripted') {if(!Array.isArray(config.script)||config.script.length>60||config.model!=='openai/gpt-4o-mini')fail('scripted_config');}
  else {
    if(config.maxSeconds>240)fail('api_trial_must_fit_five_minute_funding_evidence');
    if(!/^openai\/[a-zA-Z0-9._:-]+$/.test(config.model)||typeof config.apiBase!=='string'||!config.apiBase.startsWith('https://')||!/^PLATES_TRIAL_[A-Z0-9_]+$/.test(config.apiKeyEnv??''))fail('api_config');
    const u=new URL(config.apiBase);if(u.username||u.password||u.search||u.hash)fail('api_base');
    if(!config.funding||!config.brokerEnforcement||typeof config.brokerEnforcement.reference!=='string'||!config.brokerEnforcement.reference||config.brokerEnforcement.currencyCap<=0)fail('explicit_funding_and_broker_ceiling_required');
    if(!config.fundingProof||typeof config.fundingProof.publicKey!=='string'||typeof config.fundingProof.signature!=='string'||createPublicKey(config.fundingProof.publicKey).asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(JSON.stringify(canonical({funding:config.funding,account:config.account,model:config.model,project:config.project,brokerEnforcement:config.brokerEnforcement}))),config.fundingProof.publicKey,Buffer.from(config.fundingProof.signature,'base64')))fail('signed_broker_funding_required');
    if(config.script||config.scriptedApprovals)fail('no_scripted_api_authority');
    if(config.funding.binding?.accountIdentity?.account!==config.account||config.funding.binding?.ownerActorId!==config.actorId||config.funding.context?.model!==config.model||config.funding.context?.project?.id!==config.project)fail('funding_configuration_mismatch');
  }
  return config;
}
// Synthetic admission evidence is created only for mode=scripted. API configuration
// must provide its separately authorized real binding/context/capacity; never infer it.
export function syntheticFunding(config,now=Date.now()) {
  const policy='c'.repeat(64),connection='d'.repeat(64),broker='b'.repeat(64),expiry=new Date(now+7200000).toISOString();
  return {binding:{version:1,ownerActorId:config.actorId,provider:'openai',accountIdentity:{account:config.account,workspace:null,scope:'account'},poolId:'acme-offline',brokerScope:broker,connectionGeneration:1,connectionPolicyDigest:connection,
    grant:{id:'1'.repeat(64),version:1,state:'active',projects:[{id:config.project,repoId:101,modelPolicyDigest:policy}],models:[config.model],expiresAt:expiry},evidence:{digest:'e'.repeat(64),observedAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString()}},
    context:{project:{id:config.project,repoId:101},model:config.model,modelPolicyDigest:policy,connectionPolicyDigest:connection,connectionGeneration:1,brokerScope:broker},capacity:{id:'acme-offline-window',remaining:1,expiresAt:now+7200000}};
}
export function openTrial(root) {
  root=realpathSync(root);const config=read(join(root,'config.json'));validateConfig(config,root);
  const owner=read(join(config.workspace,'.plates-openhands-owner'));if(owner.root!==root||owner.uid!==process.getuid())fail('workspace_owner_changed');
  const identity=read(join(root,'identity.json'));if(identity.uid!==process.getuid()||identity.configSHA256!==hash(config)||hash(identity.sourceIdentity)!==hash(sourceIdentity(config)))fail('local_owner_or_configuration_changed');
  const token='local-owner-'+identity.uid;let adapter;
  adapter=new Evaluation({file:join(root,'state.sqlite'),client:{inspect:async id=>{const s=adapter.read().trial;return{id,tags:{platesoperation:s.operation,platesproject:config.project},execution_status:s.worker?.outcome==='finished'?'finished':s.worker?.exited?'error':'idle'};}},
    authenticate:t=>t===token?{actorId:config.actorId,projects:[config.project],execute:true,review:true}:null,
    funding:()=>config.funding,authorizeProfile:run=>({profile:run.profile,account:config.account,workspace:config.workspace}),
    termination:run=>{const w=adapter.read().trial.worker;return{conversation:run.conversation,epoch:run.epoch,exited:w?.exited===true,launchFenced:w?.fenced===true};}});
  return {root,config,identity,token,adapter};
}
export function initializeTrial(root,config) {
  root=resolve(root);config=structuredClone(config);if(config.mode==='scripted')config.funding=syntheticFunding(config);
  validateConfig(config,root);mkdirSync(root,{mode:0o700});root=realpathSync(root);
  write(join(config.workspace,'.plates-openhands-owner'),{root,uid:process.getuid(),configSHA256:hash(config)});
  write(join(root,'config.json'),config);write(join(root,'identity.json'),{uid:process.getuid(),configSHA256:hash(config),sourceIdentity:sourceIdentity(config),identityKind:'local-OS-owner; explicit Plates actor mapping in trusted configuration'});
  const t=openTrial(root);try{
    const run=t.adapter.admit(t.token,{project:config.project,task:config.task,pr:'acme-local-trial',stage:'build',source:'local-cli',eventId:randomUUID(),profile:'openhands-bounded-file-v1'});
    t.adapter.change(s=>{s.trial={operation:run.id,configSHA256:hash(config),createdAt:Date.now(),worker:null,requests:[],actions:{},pendingApprovals:[],modelAuthorization:null,artifact:null};});
    return {root,operation:run.id,configSHA256:hash(config),mode:config.mode};
  }finally{t.adapter.close();}
}
export function approveTrial(root,{digest,model=false,fixture=false}={}) {
  const t=openTrial(root);try{
    if(!process.stdin.isTTY&&!(fixture&&t.config.mode==='scripted'))fail('approval_requires_local_owner_terminal');
    return t.adapter.change(s=>{
      const state=s.trial;
      if(model){if(digest!==state.configSHA256||t.config.mode!=='api')fail('model_approval_digest');state.modelAuthorization={actor:t.config.actorId,uid:process.getuid(),configSHA256:digest,at:Date.now(),source:'explicit-local-owner-terminal'};return state.modelAuthorization;}
      const action=state.actions[digest];if(!action||action.state!=='awaiting-approval')fail('exact_pending_action_required');
      action.approval={actor:t.config.actorId,uid:process.getuid(),operation:state.operation,actionSHA256:action.actionSHA256,actionKey:digest,at:Date.now(),source:fixture?'scripted-offline-fixture':'explicit-local-owner-terminal'};action.state='approved';return action.approval;
    });
  }finally{t.adapter.close();}
}
export function statusTrial(root) {const t=openTrial(root);try{return {trial:t.adapter.read().trial,operation:t.adapter.read().runs[t.adapter.read().trial.operation]};}finally{t.adapter.close();}}
export async function recoverTrial(root) {
  const t=openTrial(root);try{
    const state=t.adapter.read().trial,w=state.worker;if(!w)return {status:'not-launched'};
    if(w.exited&&w.fenced)return {status:'already-confirmed',worker:w};
    const observation={owner:alive(w.ownerPid),worker:alive(w.pid),tools:Object.values(state.actions).filter(a=>a.state==='dispatching').map(a=>({key:a.key,pid:a.pid,alive:alive(a.pid)}))};
    // An unrecorded launch PID is ambiguous, even when the coordinator disappeared.
    const safe=observation.owner===false&&observation.worker===false&&observation.tools.every(a=>a.alive===false);
    if(!safe)return {status:'unknown-retained',observation};
    t.adapter.change(s=>{s.trial.worker={...s.trial.worker,exited:true,fenced:true,outcome:'error',recovered:true,exitCode:null,reason:'owner-worker-tool-absence; provider/effect outcomes remain unknown'};});
    await t.adapter.observe(t.token,state.operation);await t.adapter.confirmTermination(t.token,state.operation);
    return {status:'execution-fenced; effects-not-replayed',observation,learning:'pending'};
  }finally{t.adapter.close();}
}
export async function runTrial(root) {
  const t=openTrial(root),{adapter,config,token}=t;const initial=adapter.read().trial,operation=initial.operation;
  if(initial.worker){adapter.close();fail('original_launch_exists_use_status_or_recover_never_redispatch');}
  if(config.mode==='api'&&initial.modelAuthorization?.configSHA256!==hash(config)){adapter.close();fail('explicit_model_account_spend_approval_missing');}
  if(config.mode==='api'&&!process.env[config.apiKeyEnv]){adapter.close();fail('approved_key_environment_missing');}
  const launch=randomUUID(),deadline=Date.now()+config.maxSeconds*1000;
  adapter.change(s=>{if(s.trial.worker)fail('worker_already_reserved');s.trial.worker={launch,ownerPid:process.pid,pid:null,state:'launch-intent',startedAt:Date.now(),deadline,exited:false,fenced:false};});
  const runtime=join(t.root,'sdk-runtime');mkdirSync(runtime,{mode:0o700});
  const runnerConfig={...config,liveAuthorized:config.mode==='api',operation,conversationId:adapter.read().runs[operation].conversation};delete runnerConfig.funding;delete runnerConfig.brokerEnforcement;
  write(join(t.root,'runner-config.json'),runnerConfig);
  const env={PATH:'/usr/bin:/bin',OH_PERSISTENCE_DIR:runtime,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',LITELLM_LOCAL_MODEL_COST_MAP:'True',DO_NOT_TRACK:'1'};
  if(config.mode==='api') {const value=process.env[config.apiKeyEnv];if(!value){adapter.close();fail('approved_key_environment_missing');}env[config.apiKeyEnv]=value;}
  const child=spawn(config.python,['-I',join(HERE,'sdk-trial.py'),'--sdk',config.sdk,'--config',join(t.root,'runner-config.json'),'--runtime',runtime],{env,cwd:t.root,stdio:['pipe','pipe','pipe'],detached:true});
  let lastRpc=0,failure=null,finished=false,bytes=0,stderr='',closed=false,activeTool=null;
  const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}if(activeTool)try{process.kill(-activeTool.child.pid,'SIGKILL');}catch{}};
  const timer=setTimeout(()=>{failure='wall_deadline';kill();},Math.max(1,deadline-Date.now()));
  const exit=new Promise(resolve=>{child.once('error',e=>resolve({code:null,signal:null,error:e.code}));child.once('close',(code,signal)=>{closed=true;resolve({code,signal});});});
  try {
  adapter.change(s=>{s.trial.worker.pid=child.pid??null;s.trial.worker.state='running';});
  const guard=()=>{const s=adapter.read().trial;if(Date.now()>=deadline||s.worker.launch!==launch||s.worker.fenced)fail('trial_fenced_or_expired');adapter.authorized(token,operation,true);adapter.capacity(adapter.actor(token,config.project,true),config.project,adapter.read().runs[operation].funding);};
  child.stderr.on('data',chunk=>{if(stderr.length<65536)stderr+=chunk.toString();else{failure='stderr_limit';kill();}});
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>8*1024*1024){failure='stdout_limit';kill();}});
  child.stdin.on('error',()=>{});
  const lines=createInterface({input:child.stdout});
  const reply=(rpcId,data)=>{if(!closed)child.stdin.write(JSON.stringify({rpcId,ok:true,...data})+'\n');};
  const actionKey=(m,a)=>hash([operation,m.toolCallId??m.eventId??a.actionSHA256,a.actionSHA256]);
  const handle=async m=>{
    guard();if(m.rpcId!==++lastRpc||typeof m.kind!=='string')fail('rpc_contract');
    if(m.kind==='provider-intent'){
      bounded(m.inputTokens,1,config.maxInputTokens,'input_token_limit');if(m.maxOutputTokens!==config.maxOutputTokens)fail('output_limit_changed');
      adapter.change(s=>{const rows=s.trial.requests;if(rows.length>=config.maxRequests||m.index!==rows.length+1||rows.some(r=>r.state==='uncertain'))fail('request_limit_or_uncertain_prior');rows.push({index:m.index,state:'uncertain',requestSHA256:m.requestSHA256,inputTokens:m.inputTokens,counting:m.inputCounting,outputCeiling:m.maxOutputTokens,at:Date.now()});});
      reply(m.rpcId,{authorized:true});
    }else if(m.kind==='provider-result'){
      adapter.change(s=>{const row=s.trial.requests[m.index-1];if(!row||row.state!=='uncertain'||row.requestSHA256!==m.requestSHA256)fail('provider_receipt_conflict');row.state='received';row.tokens=m.tokens??null;row.synthetic=config.mode==='scripted';});
      adapter.recordUsage(token,operation,{id:`provider-${operation}-${m.index}`,tokens:Number.isSafeInteger(m.tokens)?m.tokens:null,synthetic:config.mode==='scripted',cost:null});reply(m.rpcId,{});
    }else if(m.kind==='provider-error'){reply(m.rpcId,{});failure='provider_delivery_uncertain';kill();
    }else if(m.kind==='approval-request'){
      if(!Array.isArray(m.actions)||!m.actions.length||m.actions.length>16)fail('approval_actions');const keys=[];
      for(const a of m.actions){if(hash(a.action)!==a.actionSHA256)fail('action_digest');const key=actionKey(a,a);keys.push(key);adapter.change(s=>{const old=s.trial.actions[key];if(old&&old.actionSHA256!==a.actionSHA256)fail('action_identity_conflict');if(!old)s.trial.actions[key]={key,eventId:a.eventId,toolCallId:a.toolCallId,action:a.action,actionSHA256:a.actionSHA256,state:'awaiting-approval'};});
        if(config.mode==='scripted'&&config.scriptedApprovals===true&&adapter.read().trial.actions[key].state==='awaiting-approval')approveTrial(t.root,{digest:key,fixture:true});}
      while(keys.some(k=>!adapter.read().trial.actions[k].approval)){guard();if(closed)fail('worker_closed_waiting_for_approval');await new Promise(r=>setTimeout(r,100));}
      reply(m.rpcId,{approvedActionSHA256:m.actions.map(a=>a.actionSHA256)});
    }else if(m.kind==='tool'){
      if(hash(m.action)!==m.actionSHA256)fail('tool_digest');const key=actionKey(m,m),a=adapter.read().trial.actions[key];
      if(!a?.approval||a.approval.operation!==operation||a.actionSHA256!==m.actionSHA256)fail('exact_action_approval_missing');
      if(a.state==='completed'){reply(m.rpcId,{result:a.result});return;}
      if(a.state!=='approved')fail('uncertain_effect_no_retry');
      adapter.change(s=>{s.trial.actions[key].state='dispatching';s.trial.actions[key].pid=null;});
      const receipt=await adapter.effect(token,operation,'file:'+key,async()=>{
        guard();activeTool=spawnContained({workspace:config.workspace,runner:join(HERE,'workspace-file-tool.mjs'),writable:m.action.operation==='write',args:[config.workspace],timeoutMs:Math.max(1,Math.min(10000,deadline-Date.now()))});
        adapter.change(s=>{s.trial.actions[key].pid=activeTool.child.pid;});
        const chunks=[];let size=0;activeTool.child.stdout.on('data',b=>{size+=b.length;if(size>2*1024*1024){try{process.kill(-activeTool.child.pid,'SIGKILL');}catch{}}else chunks.push(b);});activeTool.child.stderr.resume();activeTool.child.stdin.on('error',()=>{});activeTool.child.stdin.end(JSON.stringify(m.action));
        const toolExit=await activeTool.closed;const policy=activeTool.policySHA256;activeTool=null;
        adapter.change(s=>{s.trial.actions[key].exit=toolExit;s.trial.actions[key].policySHA256=policy;});
        if(toolExit.timedOut||toolExit.signal||size>2*1024*1024)fail('tool_outcome_unknown');
        const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        adapter.change(s=>{s.trial.actions[key].state='completed';s.trial.actions[key].result=result;});return result;
      });
      const result=adapter.read().trial.actions[key].result;if(!result||receipt.state!=='acknowledged')fail('tool_effect_uncertain');reply(m.rpcId,{result});
    }else if(m.kind==='finished'){if(m.conversationId!==adapter.read().runs[operation].conversation)fail('native_conversation_identity');finished=m.status==='finished';adapter.change(s=>{s.trial.worker.nativeConversation=m.conversationId;});reply(m.rpcId,{});}
    else fail('unknown_rpc');
  };
  let chain=Promise.resolve();lines.on('line',line=>{chain=chain.then(async()=>{if(failure)return;if(line.length>1024*1024)fail('rpc_line_bound');await handle(JSON.parse(line));}).catch(error=>{failure=error.message;kill();});});
  const result=await exit;await chain;clearTimeout(timer);lines.close();
  if(activeTool){kill();await activeTool.closed;activeTool=null;}
  const groupGone=alive(child.pid)===false;
  adapter.change(s=>{s.trial.worker={...s.trial.worker,exited:groupGone,fenced:groupGone,state:groupGone?'terminated':'unknown',outcome:finished&&result.code===0&&!failure?'finished':'error',exit:result,error:failure,stderr,endedAt:Date.now()};});
  if(groupGone){await adapter.observe(token,operation);await adapter.confirmTermination(token,operation);}
  const report=statusTrial(t.root);write(join(t.root,'run-receipt.json'),report);return report;
  } finally {
    clearTimeout(timer);if(!closed){kill();await exit;}if(activeTool){try{process.kill(-activeTool.child.pid,'SIGKILL');}catch{}await activeTool.closed;}
    adapter.close();
  }
}
export async function scoreTrial(root,output) {
  const t=openTrial(root);try{
    const state=t.adapter.read().trial;if(!state.worker?.exited||!state.worker.fenced||Object.values(state.actions).some(a=>a.state==='dispatching'))fail('worker_or_effect_unsettled');
    if(state.artifact)fail('artifact_already_captured');
    output=resolve(output);if(!inside(t.root,output)||output===t.root)fail('capture_must_be_private_trial_child');
    const result=await score({candidate:t.config.workspace,task:t.config.task,output,regression:t.config.regression??null});
    const linkage={operation:state.operation,workerLaunch:state.worker.launch,sourceSHA256:hash(result.sourceHashes),regressionHashes:result.regressionHashes,output:realpathSync(output),acceptancePassed:result.acceptancePassed??false};
    t.adapter.change(s=>{s.trial.artifact=linkage;});return linkage;
  }finally{t.adapter.close();}
}
export async function checkTrial(root,output){
  const t=openTrial(root);try{const state=t.adapter.read().trial,a=state.artifact;if(!a||!state.worker?.fenced||!state.worker.exited)fail('private_capture_required');output=resolve(output);if(!inside(t.root,output)||output===t.root)fail('check_output_must_be_private');
    const result=await checkCandidate({captured:join(a.output,'subject'),task:t.config.task,output,regression:t.config.regression??null});
    const production=Object.fromEntries(Object.entries(result.sourceHashes).filter(([p])=>p.startsWith('lib/')));if(hash(production)!==a.sourceSHA256)fail('captured_source_changed');for(const [p,h] of Object.entries(a.regressionHashes??{}))if(result.sourceHashes[p]!==h)fail('regression_changed');
    t.adapter.change(s=>{s.trial.checks={operation:state.operation,workerLaunch:state.worker.launch,artifactSHA256:a.sourceSHA256,regressionHashes:a.regressionHashes,report:join(output,'check.json'),passed:result.passed};});return result;
  }finally{t.adapter.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const [command,root,arg]=process.argv.slice(2);let result;
    if(command==='init')result=initializeTrial(root,read(arg));else if(command==='run')result=await runTrial(root);else if(command==='status')result=statusTrial(root);else if(command==='recover')result=await recoverTrial(root);else if(command==='approve')result=approveTrial(root,{digest:arg});else if(command==='authorize-model')result=approveTrial(root,{digest:arg,model:true});else if(command==='score')result=await scoreTrial(root,arg);else if(command==='check')result=await checkTrial(root,arg);else fail('Usage: trial-controller.mjs init ROOT CONFIG | run/status/recover ROOT | approve/authorize-model ROOT EXACT_DIGEST | score/check ROOT NEW_PRIVATE_OUTPUT');
    console.log(JSON.stringify(result,null,2));if(command==='run'&&result.trial.worker.outcome!=='finished')process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=2;}
}
