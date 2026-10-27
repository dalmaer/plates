// Explicit abandonment of an unattempted installation. Only its confirmed
// pauses may be undone, after checking the old workflow preimages on default.
import { digest, hash, oid, fail } from './update-installation-contract.mjs';
import { repository, sourceTree, sourceFile, workflows, parseCandidate } from './update-installation-github.mjs';
import { namesRead } from './names-actions.mjs';

const restorationScope=({defaultRevision,...scope})=>scope;
function observeRestoration(r,current) {
  const scopeDigest=digest(restorationScope(r.plan));
  if(digest(restorationScope(current))!==scopeDigest)fail('restoration source or authority changed; owner inspection required');
  if((r.observations?.at(-1)?.defaultRevision??r.plan.defaultRevision)===current.defaultRevision)return false;
  r.observations??=[];
  r.observations.push({observedAt:new Date().toISOString(),scopeDigest,defaultRevision:current.defaultRevision});
  return true;
}
export function restorationTargets(j) {
  if(j.actions.find(a=>a.kind==='merge')?.state!=='prepared'||j.installation?.state==='installed')fail('attempted or uncertain merge forbids restore-only; inspect original operation');
  if(j.actions.some(a=>a.kind==='disable'&&a.state==='attempted'))fail('uncertain disable requires owner inspection before restore-only');
  const targets=j.actions.filter(a=>a.kind==='disable'&&a.state==='verified').map(a=>{
    const b=j.plan.barrier.find(b=>b.oldId===a.id&&b.oldPath===a.path&&b.priorState==='active');
    if(!b||!/^[a-f0-9]{64}$/.test(b.oldSha256??'')||!['100644','100755'].includes(b.oldMode))fail('approved old workflow preimage unavailable');
    return {id:a.id,path:a.path,sha256:b.oldSha256,mode:b.oldMode};
  });
  if(!targets.length)fail('no confirmed original pauses to restore');
  return targets;
}
export function validateRestoration(j) {
  if(j.restoration===undefined)return;
  const r=j.restoration,p=r?.plan,targets=restorationTargets(j);
  if(!p||p.schema!==1||p.kind!=='restore-only'||p.operationId!==j.operationId||
    ['repo','repositoryId','repositoryNodeId','defaultBranch'].some(k=>p[k]!==j.plan[k])||!oid(p.defaultRevision)||
    digest(p.targets)!==digest(targets)||r.approval?.kind!=='explicit-restore-digest'||r.approval.digest!==digest(p)||
    !['pending','restored'].includes(r.state)||!Array.isArray(r.actions)||
    r.actions.some(a=>!['prepared','attempted','verified'].includes(a.state))||
    digest(r.actions.map(({state,...a})=>a))!==digest(targets)||r.state==='restored'&&r.actions.some(a=>a.state!=='verified'))fail('foreign or invalid restoration receipt');
  if(r.observations!==undefined&&(!Array.isArray(r.observations)||r.observations.some(o=>!o||!oid(o.defaultRevision)||
    typeof o.observedAt!=='string'||!Number.isFinite(Date.parse(o.observedAt))||o.scopeDigest!==digest(restorationScope(p)))))fail('foreign restoration observation');
}
async function inspectRestoration(j,github) {
  const targets=restorationTargets(j),plan=j.plan,meta=await repository(github,plan.repo);
  if(['repo','repositoryId','repositoryNodeId','defaultBranch'].some(k=>meta[k]!==plan[k]))fail('original repository identity changed');
  const pr=await namesRead(github,`/repos/${plan.repo}/pulls/${parseCandidate(plan.candidate).number}`);
  if(pr.number!==parseCandidate(plan.candidate).number||pr.merged!==false||pr.base?.repo?.id!==plan.repositoryId||pr.base?.ref!==plan.defaultBranch)fail('original merge state or destination unavailable');
  const current=await namesRead(github,`/repos/${plan.repo}/commits/${encodeURIComponent(plan.defaultBranch)}`);
  if(!oid(current.sha))fail('default source unavailable');
  const tree=await sourceTree(github,plan.repo,current.sha),inventory=await workflows(github,plan.repo);
  for(const target of targets){
    const file=await sourceFile(github,plan.repo,tree,target.path);
    if(!file||hash(file.text)!==target.sha256||file.mode!==target.mode)fail(`old workflow preimage differs: ${target.path}`);
    const actual=inventory.find(w=>w.id===target.id&&w.path===target.path);
    const action=j.restoration?.actions.find(a=>a.id===target.id&&a.path===target.path);
    const allowed=action?.state==='verified'?['active']:action?.state==='attempted'?['disabled_manually','active']:['disabled_manually'];
    if(!actual||!allowed.includes(actual.state))fail(`original paused workflow identity/state differs: ${target.id} ${target.path}`);
  }
  return {schema:1,kind:'restore-only',operationId:j.operationId,...meta,defaultRevision:current.sha,targets};
}
export function restorationResult(j) {
  const r=j.restoration,complete=r.state==='restored'&&!r.problem;
  const data={schema:1,operationId:j.operationId,state:complete?'aborted-restored':'aborted-restoration-pending',installation:{state:'aborted'},
    restoration:{state:complete?'restored':'pending',targets:r.plan.targets,pending:r.actions.filter(a=>a.state!=='verified'),digest:r.approval.digest,observations:r.observations??[]},
    verification:{state:'unavailable'},retirement:{state:'unavailable'},...(r.problem?{problem:r.problem}:{})};
  return {data,text:`${j.operationId}: ${data.state}${r.problem?` (${r.problem})`:''}`,exitCode:complete?0:1};
}
export async function restoreOnly(j,store,github,{yes=false,digest:approved}={}) {
  const current=await inspectRestoration(j,github),plan=j.restoration?.plan??current,d=digest(plan);
  if(digest(restorationScope(plan))!==digest(restorationScope(current)))fail('restoration source or authority changed; owner inspection required');
  if(!yes)return {data:{...plan,digest:d,currentDefaultRevision:current.defaultRevision,installation:{state:j.restoration?'aborted':'pending'},restoration:{state:j.restoration?.state??'preview'}},text:`Restore original pauses for ${j.operationId}; approve exact preview ${d}`,exitCode:3};
  if(approved!==d)fail('restore-only preview changed; explicit digest approval required');
  if(!j.restoration){
    j.restoration={plan:current,approval:{kind:'explicit-restore-digest',digest:approved},state:'pending',actions:current.targets.map(a=>({...a,state:'prepared'}))};
    await store.save(j); // This terminal installation decision precedes any enable.
  }
  const r=j.restoration;
  if(observeRestoration(r,current))await store.save(j);
  delete r.problem;
  try {
    for(const action of r.actions){
      if(observeRestoration(r,await inspectRestoration(j,github)))await store.save(j);
      if(action.state==='prepared'){
        action.state='attempted';await store.save(j);
        await github({method:'PUT',path:`/repos/${j.plan.repo}/actions/workflows/${action.id}/enable`});
      }
      const after=(await workflows(github,j.plan.repo)).find(w=>w.id===action.id&&w.path===action.path);
      if(after?.state!=='active')fail(`restoration uncertain for ${action.id} ${action.path}; original enable will not be repeated`);
      action.state='verified';await store.save(j);
    }
    if(observeRestoration(r,await inspectRestoration(j,github)))await store.save(j);
    r.state='restored';await store.save(j);
  }catch(e){r.problem=e.message;r.state='pending';await store.save(j);}
  return restorationResult(j);
}
