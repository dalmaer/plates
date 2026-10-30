import { exact, hash, numeric, projectId, WebError } from './common.mjs';
import { hex, textFields, validText } from './learning-model.mjs';
import { createLearning } from './learning.mjs';
import { createPrivateLearningStore } from './private-learning-store.mjs';
const fail=(code='invalid_private_lesson',status=400)=>{throw new WebError(code,status);};
const digest=value=>hash(JSON.stringify(value));
const text=value=>{if(!exact(value,textFields)||!textFields.every(k=>validText(value[k]))||!value.shape.trim())fail();return Object.fromEntries(textFields.map(k=>[k,value[k]]));};
const binding=p=>({id:p.id,repoId:p.repoId,repo:p.repo});
export function createPrivateLearning(config,{fetcher=fetch,now=Date.now}={}) {
 const learning=createLearning(config,{fetcher}),store=createPrivateLearningStore(config,fetcher);
 function enabled() {
  const c=config.lessons,t=now(),valid=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=t;
  if(c?.enabled!==true||!valid(c.verifiedAt)||!valid(c.restoreReconciledAt)||!Buffer.isBuffer(config.encryptionKey)||config.encryptionKey.length!==32)fail('private_lessons_unavailable',404);
  if(config.recovery&&(!valid(config.recovery.reconciledAt)||Date.parse(c.restoreReconciledAt)<Date.parse(config.recovery.startedAt)))fail('private_lessons_quarantined',503);
 }
 async function context(access,token) {enabled();return learning.workspace(access,token);}
 function project(access,id) {const p=access.projects.find(p=>p.id===id);if(!p)fail('access_denied',404);learning.authorizedProject(access,p);return binding(p);}
 function destination(access,input) {
  if(!exact(input,['kind','id'])||!['project','set'].includes(input.kind)||!projectId(input.id))fail();
  const ids=input.kind==='project'?[input.id]:config.projectSets?.find(s=>s.id===input.id)?.projects;
  if(!ids?.length)fail('access_denied',404);
  return {kind:input.kind,id:input.id,projects:ids.map(id=>project(access,id)).sort((a,b)=>a.id.localeCompare(b.id))};
 }
 function checkDestination(access,d) {if(digest(destination(access,{kind:d.kind,id:d.id}))!==digest(d))fail('lesson_destination_changed',409);}
 function recipients(resolved,ids) {
  if(!Array.isArray(ids)||!ids.length||ids.length>20||!ids.every(numeric)||new Set(ids).size!==ids.length)fail();
  if(ids.some(id=>!config.ownerIds.includes(id)||!resolved.memberIds.includes(id)))fail('lesson_audience_changed',409);
  return [...ids].sort((a,b)=>a-b);
 }
 function original(row,access) {
  if(!row||row.kind!=='original'||row.owner!==store.actor(access.userId)||row.revoked)fail('lesson_not_found',404);
  const v=row.value;
  if(v.kind!=='original'||v.ownerId!==access.userId||v.id!==row.id||v.sourceDigest!==digest({text:v.text,provenance:v.provenance,project:v.project})||digest(project(access,v.project.id))!==digest(v.project))fail('lesson_source_changed',409);
  return v;
 }
 async function select(access,s) {
  if(!exact(s,['id','digest'])||!hex(s.id)||!hex(s.digest))fail();
  const v=original(await store.read(access.userId,s.id),access);
  if(v.sourceDigest!==s.digest)fail('lesson_source_changed',409);
  return v;
 }
 function receipt(row,access) {
  if(!row||row.kind!=='receipt'||row.owner!==store.actor(access.userId)||row.value.ownerId!==access.userId)fail('lesson_operation_not_found',404);
  const v=row.value;
  if(digest(project(access,v.project.id))!==digest(v.project))fail('access_denied',404);
  if(v.destination)checkDestination(access,v.destination);
  return {schema:1,kind:'private-lesson-operation',id:row.id,state:row.revoked?'revoked':'committed',action:v.action,recordId:v.recordId,destination:v.destination??null,recipients:v.recipients??[],digest:row.digest,at:v.at,revocation:row.revocation??null,notice:'Revocation stops future catalogue reads. It cannot recall content already delivered.'};
 }
 async function preview(access,token,action,input) {
  const resolved=await context(access,token);
  const fields=action==='capture'?['requestId','projectId','text']:action==='promote'?['requestId','source','destination','recipients','text']:action==='revoke'?['requestId','operationId']:null;
  if(!fields||!exact(input,fields)||!hex(input.requestId))fail();
  const operationId=action==='revoke'?input.operationId:hash(JSON.stringify([store.instance,access.userId,action,input.requestId]));
  if(!hex(operationId))fail();
  let payload;
  if(action==='capture')payload={project:project(access,input.projectId),text:text(input.text)};
  else if(action==='promote') {
   const source=await select(access,input.source);
   payload={project:source.project,source:{id:source.id,digest:source.sourceDigest,revision:1},destination:destination(access,input.destination),recipients:recipients(resolved,input.recipients),text:text(input.text)};
  } else {const r=receipt(await store.read(access.userId,operationId),access);if(r.action!=='promote')fail();payload={project:project(access,r.destination.projects[0].id),target:operationId,destination:r.destination,recipients:r.recipients};}
  const reviewed={schema:1,kind:'private-lesson-preview',action,operationId,ownerId:access.userId,sourceRevision:access.sourceRevision,payload};
  const approval=digest(reviewed),id=hash(JSON.stringify([operationId,approval]));
  const prior=await store.read(access.userId,id);
  const value=prior?.kind==='preview'?prior.value:{...reviewed,id,digest:approval,expiresAt:new Date(now()+900000).toISOString()};
  if(prior&&prior.digest!==approval)fail('lesson_identity_conflict',409);
  if(!prior)await store.preview(access.userId,id,operationId,approval,value);
  return value;
 }
 async function recheck(access,token,reauthorize) {
  if(typeof reauthorize!=='function')fail('access_denied',404);
  const fresh=await reauthorize();
  if(fresh.userId!==access.userId||fresh.workspace.id!==access.workspace.id||fresh.sourceRevision!==access.sourceRevision)fail('lesson_scope_changed',409);
  const resolved=await context(fresh,token);return {fresh,resolved};
 }
 async function apply(access,token,input,{reauthorize,action=null}={}) {
  await context(access,token);
  if(!exact(input,['previewId','digest'])||!hex(input.previewId)||!hex(input.digest))fail();
  const saved=await store.read(access.userId,input.previewId),p=saved?.value;
  if(action!==null&&p?.action!==action)fail('lesson_preview_changed',409);
  if(saved?.kind!=='preview'||saved.owner!==store.actor(access.userId)||saved.digest!==input.digest||p.ownerId!==access.userId||p.digest!==input.digest)fail('lesson_preview_changed',409);
  const {fresh,resolved}=await recheck(access,token,reauthorize);
  // An existing original operation is the only permissible retry result.
  const existing=await store.read(access.userId,p.operationId);
  if(p.action!=='revoke'&&existing) {
   if(existing.digest!==p.digest)fail('lesson_identity_conflict',409);
   return receipt(existing,fresh);
  }
  if(Date.parse(p.expiresAt)<=now()||p.sourceRevision!==fresh.sourceRevision)fail('lesson_preview_expired',409);
  const data=p.payload;
  if(digest(project(fresh,data.project.id))!==digest(data.project))fail('lesson_source_changed',409);
  if(data.destination)checkDestination(fresh,data.destination);
  if(data.recipients&&p.action!=='revoke')recipients(resolved,data.recipients);
  if(p.action==='promote')await select(fresh,{id:data.source.id,digest:data.source.digest});
  const at=new Date(now()).toISOString(),recordId=hash(JSON.stringify([p.operationId,'record']));
  const rows=[];
  if(p.action==='revoke') {
   const target=await store.read(fresh.userId,data.target);receipt(target,fresh);
   const checked=await recheck(fresh,token,reauthorize);
   receipt(target,checked.fresh);
   if(Date.parse(p.expiresAt)<=now())fail('lesson_preview_expired',409);
   return receipt(await store.revoke(fresh.userId,data.target,{digest:p.digest,at:new Date(now()).toISOString()}),checked.fresh);
  }
  if(p.action==='capture') {
   const provenance={kind:'authored',actorId:fresh.userId,at,sourceRevision:fresh.sourceRevision};
   const value={schema:1,kind:'original',id:recordId,ownerId:fresh.userId,revision:1,project:data.project,text:data.text,provenance,sourceDigest:digest({text:data.text,provenance,project:data.project})};
   rows.push({user:fresh.userId,id:recordId,kind:'original',value});
  } else {
   for(const user of data.recipients)rows.push({user,id:recordId,kind:'copy',value:{schema:1,kind:'copy',id:recordId,text:data.text,destination:data.destination,recipientId:user,provenance:{kind:'reviewed-personal-copy',at,reviewDigest:p.digest},operationId:p.operationId}});
  }
  rows.push({user:fresh.userId,id:p.operationId,kind:'receipt',value:{schema:1,ownerId:fresh.userId,action:p.action,recordId,project:data.project,source:data.source??null,destination:data.destination??null,recipients:data.recipients??[],at}});
  const checked=await recheck(fresh,token,reauthorize);
  if(digest(project(checked.fresh,data.project.id))!==digest(data.project))fail('lesson_source_changed',409);
  if(data.destination)checkDestination(checked.fresh,data.destination);
  if(data.recipients)recipients(checked.resolved,data.recipients);
  if(Date.parse(p.expiresAt)<=now())fail('lesson_preview_expired',409);
  return receipt(await store.commit(fresh.userId,p.operationId,p.digest,rows),checked.fresh);
 }
 async function recover(access,token,id,{reauthorize}={}) {
  await context(access,token);if(!hex(id))fail();
  const row=await store.read(access.userId,id),{fresh}=await recheck(access,token,reauthorize);
  return receipt(row,fresh);
 }
 async function catalogue(access,token,{mode='personal',setId=null,projectId:pid=null,after=null}={}, {reauthorize}={}) {
  const resolved=await context(access,token);
  if(!['personal','copies'].includes(mode)||after!==null&&!hex(after)||setId!==null&&!projectId(setId)||pid!==null&&!projectId(pid)||setId&&pid)fail();
  if(setId)destination(access,{kind:'set',id:setId});if(pid)project(access,pid);
  const page=await store.list(access.userId,after??'0'.repeat(64));
  const {fresh}=await recheck(access,token,reauthorize);
  const records=[];
  for(const row of page.rows) {
   if(mode==='personal'&&row.kind!=='original'||mode==='copies'&&row.kind!=='copy')continue;
   try {
    if(row.kind==='original') {const v=original(row,fresh);if(pid&&v.project.id!==pid||setId&&!destination(fresh,{kind:'set',id:setId}).projects.some(p=>p.id===v.project.id))continue;records.push(v);}
    else {const v=row.value;if(v.kind!=='copy'||v.id!==row.id||v.recipientId!==fresh.userId)fail('invalid_lesson_store',503);checkDestination(fresh,v.destination);if(setId&&(v.destination.kind!=='set'||v.destination.id!==setId)||pid&&!v.destination.projects.some(p=>p.id===pid))continue;records.push(v);}
   }catch(error){if(['access_denied','lesson_destination_changed','lesson_source_changed'].includes(error.code))continue;throw error;}
  }
  const destinations=[...fresh.projects.map(p=>({kind:'project',id:p.id,label:p.name??p.id})),...(config.projectSets??[]).flatMap(s=>{try{destination(fresh,{kind:'set',id:s.id});return [{kind:'set',id:s.id,label:s.name}];}catch{return [];}})];
  return {schema:1,kind:'private-learning',mode,records,after:page.after,projectId:pid,setId,workspace:fresh.workspace,projects:fresh.projects.map(binding),destinations,recipients:config.ownerIds.filter(id=>resolved.memberIds.includes(id)),notice:'Explicit recipients still need current workspace and destination project access. Revocation cannot recall content already delivered.'};
 }
 return {preview,apply,recover,catalogue};
}
