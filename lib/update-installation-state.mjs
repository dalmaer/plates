// Local continuation of the update operation, never a transferable permission.
import { mkdir, open, readFile, rename, lstat, realpath, rm, readdir } from 'node:fs/promises';
import { join, resolve, parse, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { digest, fail } from './update-installation-contract.mjs';
import { mergeArtifact } from './update-installation-git.mjs';
import { validateRestoration } from './update-installation-restore.mjs';
export const operationId = plan => `install-${digest(plan)}`;
// Proof observations may be refreshed, but never rewrite the originally
// approved plan or change its source, implementation, destination or actions.
export const approvalScope = ({proof, ...scope}) => scope;
export function observeProof(j, fresh) {
  const scopeDigest=digest(approvalScope(j.plan));
  if(digest(approvalScope(fresh))!==scopeDigest)fail('source or authority changed; reinspect exact preview');
  const previous=j.proofObservations?.at(-1)?.proof??j.plan.proof;
  if(digest(previous)===digest(fresh.proof))return false;
  j.proofObservations??=[];
  j.proofObservations.push({observedAt:new Date().toISOString(),scopeDigest,proof:fresh.proof});
  return true;
}
async function directory(path,create) {
  path=resolve(path);
  if (process.platform==='darwin') for (const alias of ['/tmp','/var']) if(path===alias||path.startsWith(alias+'/')) {
    if (await realpath(alias)!==`/private${alias}`) fail('unsafe state alias');
    path='/private'+path;break;
  }
  let current=parse(path).root;
  for (const part of path.slice(current.length).split('/').filter(Boolean)) {
    current=join(current,part);
    let s; try { s=await lstat(current); } catch(e) { if(e.code!=='ENOENT'||!create)throw e; await mkdir(current,{mode:0o700}); s=await lstat(current); }
    if(!s.isDirectory()||s.isSymbolicLink())fail('unsafe installation directory');
  }
  return path;
}
export async function installationStore(root,create=false) {
  const dir=await directory(join(root,'.plates/update/operations'),create);
  if(create){
    const ignore=join(dir,'.gitignore');
    try { const h=await open(ignore,'wx',0o600);try{await h.writeFile('*\n');await h.sync();}finally{await h.close();} }
    catch(e){if(e.code!=='EEXIST')throw e;const s=await lstat(ignore);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||await readFile(ignore,'utf8')!=='*\n')fail('unsafe operation ignore');}
  }
  const file=id=>{if(!/^install-[a-f0-9]{64}$/.test(id??''))fail('invalid original operation id');return join(dir,`${id}.json`);};
  async function read(id) {
    const path=file(id),s=await lstat(path);
    if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||(s.mode&0o077)!==0||s.size>2*1024*1024)fail('unsafe installation receipt');
    const j=JSON.parse(await readFile(path,'utf8'));
    if(j.schema!==1||j.operationId!==id||operationId(j.plan)!==id||j.ownerRoot!==await realpath(root)||j.approval?.digest!==digest(j.plan)||j.approval?.kind!=='explicit-install-digest'||!Array.isArray(j.actions)||j.actions.some(a=>!['disable','merge','restore'].includes(a.kind)||!['prepared','attempted','verified'].includes(a.state)))fail('foreign or invalid installation receipt');
    if(j.plan.barrier.some(b=>b.newId===null&&b.priorState!=='active'))fail('unsupported original restoration scope');
    const expected=actionPlan(j.plan);
    if(digest(j.actions.map(({state,...a})=>a))!==digest(expected.map(({state,...a})=>a)))fail('installation action scope changed');
    if(j.mergeArtifact!==undefined)mergeArtifact(j.plan,j.mergeArtifact);
    validateRestoration(j);
    if(j.proofObservations!==undefined&&(!Array.isArray(j.proofObservations)||j.proofObservations.some(o=>
      !o||typeof o.observedAt!=='string'||!Number.isFinite(Date.parse(o.observedAt))||o.scopeDigest!==digest(approvalScope(j.plan))||
      !o.proof||o.proof.gate?.head!==j.plan.head||o.proof.review?.head!==j.plan.head||o.proof.review?.repo!==j.plan.repo||o.proof.review?.ok!==true
    )))fail('foreign or invalid proof observation');
    if(j.mappings!==undefined){
      if(!j.mappings||typeof j.mappings!=='object'||Array.isArray(j.mappings))fail('invalid replacement mappings');
      for(const [path,m] of Object.entries(j.mappings)){
        const expected=j.plan.compatibility.installed.find(f=>f.path===path&&!f.absent);
        if(!expected||!j.actions.some(a=>a.kind==='restore'&&a.path===path&&a.id===null)||m.path!==path||!Number.isSafeInteger(m.id)||m.id<1||m.sha256!==expected.sha256||m.mergeRevision!==j.installation?.mergeRevision)fail('foreign replacement mapping');
      }
    }
    return j;
  }
  async function save(j) {
    const path=file(j.operationId),temp=`${path}.${randomUUID()}.tmp`,h=await open(temp,'wx',0o600);
    try{await h.writeFile(JSON.stringify(j));await h.sync();}finally{await h.close();}
    await rename(temp,path);
    if(process.platform!=='win32'){const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}}
  }
  async function lock(repo) {
    const path=join(dir,`repo-${digest(repo)}.lock`);
    try{await mkdir(path,{mode:0o700});}catch(e){
      if(e.code!=='EEXIST')throw e;
      const s=await lstat(path),f=join(path,'owner.json'),fs=await lstat(f);
      if(!s.isDirectory()||s.isSymbolicLink()||!fs.isFile()||fs.isSymbolicLink()||fs.nlink!==1||fs.size>4096)fail('unknown installation writer');
      const owner=JSON.parse(await readFile(f,'utf8'));
      if(owner.host!==hostname()||!Number.isSafeInteger(owner.pid)||owner.pid<1)fail('unknown installation writer');
      try{process.kill(owner.pid,0);fail('installation writer busy');}catch(error){if(error.code!=='ESRCH')throw error;}
      const guard=`${path}.reaper`;
      await mkdir(guard,{mode:0o700});
      try{
        if(await readFile(f,'utf8')!==JSON.stringify(owner))fail('installation writer changed');
        const orphan=`${path}.${randomUUID()}`;await rename(path,orphan);await rm(orphan,{recursive:true});
        await mkdir(path,{mode:0o700});
      }finally{await rm(guard,{recursive:true});}
    }
    const token=randomUUID(),h=await open(join(path,'owner.json'),'wx',0o600);
    try{await h.writeFile(JSON.stringify({pid:process.pid,host:hostname(),token}));await h.sync();}finally{await h.close();}
    return async()=>{const owner=JSON.parse(await readFile(join(path,'owner.json'),'utf8'));if(owner.token===token)await rm(path,{recursive:true});};
  }
  async function original(candidate) {
    const entries=await readdir(dir);
    if(entries.length>10000)fail('installation receipt coverage capped');
    for(const name of entries.filter(n=>/^install-[a-f0-9]{64}\.json$/.test(n))){const j=await read(name.slice(0,-5));if(j.plan.candidate===candidate)return j;}
    return null;
  }
  return {read,save,lock,original};
}
export function actionPlan(plan) {
  return [...plan.barrier.filter(b=>b.priorState==='active').map(b=>({kind:'disable',id:b.oldId,path:b.oldPath,state:'prepared'})),
    {kind:'merge',head:plan.head,state:'prepared'},
    ...plan.barrier.filter(b=>b.priorState==='active').map(b=>({kind:'restore',id:b.newId,path:b.newPath,state:'prepared'}))];
}
export function continuation(j) {
  return {operationId:j.operationId,candidate:j.plan.candidate,source:{head:j.plan.head,base:j.plan.base},digest:j.approval.digest,
    scope:{repo:j.plan.repo,repositoryId:j.plan.repositoryId,mutations:j.plan.mutations,budget:j.plan.budget},
    priorStates:j.plan.barrier,registeredMappings:j.mappings??{},proof:j.plan.proof,proofObservations:j.proofObservations??[],pending:j.restoration?j.restoration.actions.filter(a=>a.state!=='verified'):j.actions.filter(a=>a.state!=='verified'),
    ...(j.restoration?{installationAborted:true,restoration:j.restoration}:{}),
    authority:'retained original explicit approval; summary grants no authority',
    invalidation:{head:'new exact preview and approval',permissions:'new approval',checks:'fresh inspection',workflowIdentity:'new exact barrier approval',unrelatedRecords:'unchanged scope retained'}};
}
