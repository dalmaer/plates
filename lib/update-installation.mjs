import { realpath } from 'node:fs/promises';
import { namesPages } from './names-actions.mjs';
import { concurrencyPreflight } from './name-concurrency.mjs';
import { digest, fail } from './update-installation-contract.mjs';
import { installationGithub, inspectCandidate, workflows, readback } from './update-installation-github.mjs';
import { installationStore, operationId, actionPlan, continuation, observeProof } from './update-installation-state.mjs';
import { mergeArtifact } from './update-installation-git.mjs';
import { restoreOnly as restoreInstallation } from './update-installation-restore.mjs';

function result(j) {
  const installation=j.installation??{state:'pending'};
  const complete=!j.problem&&installation.state==='installed'&&j.actions.every(a=>a.state==='verified');
  const data={schema:1,operationId:j.operationId,state:complete?'complete':installation.state==='installed'?'installed-restoration-pending':'pending',installation,
    verification:{state:'unavailable',gaps:['No revision-bound operational verification collected by installation']},retirement:{state:'unavailable',gaps:['No alias retirement evidence collected by installation']},
    continuation:continuation(j),...(j.problem?{problem:j.problem}:{})};
  return {data,text:`${j.operationId}: ${data.state}${j.problem?` (${j.problem})`:''}`,exitCode:complete?0:1};
}
async function barrierCheck(plan,github) {
  if(!plan.barrier.length)return;
  const inventory=await workflows(github,plan.repo),runs=[];
  for(const b of plan.barrier){
    // Both identities must have been approved. No path-pattern replacement.
    for(const [id,path] of [[b.oldId,b.oldPath],...(b.newId===null?[]:[[b.newId,b.newPath]])]) {
      if(!inventory.some(w=>w.id===id&&w.path===path&&w.state==='disabled_manually'))fail('approved barrier is not held');
    }
    for(const id of new Set([b.oldId,b.newId].filter(id=>id!==null))) {
    const rows=await namesPages(github,`/repos/${plan.repo}/actions/workflows/${id}/runs`,'workflow_runs');
    if(new Set(rows.map(r=>r.id)).size!==rows.length)fail('run coverage duplicate');
    for(const r of rows){
      if(r.workflow_id!==id)fail('run workflow identity differs');
      runs.push({...r,repo:plan.repo,path:b.oldPath,headBranch:r.head_branch});
    }
    }
  }
  const paths=plan.barrier.map(b=>b.oldPath);
  const assessed=concurrencyPreflight({repo:plan.repo,workflows:paths,runs,coverage:{repo:plan.repo,complete:true,allBranches:true,workflows:paths},barrier:{repo:plan.repo,ownerApproved:true,heldThroughInstallation:true,disabledWorkflows:paths}});
  if(!assessed.ok)fail(`barrier drain pending: ${JSON.stringify({gaps:assessed.gaps,blocked:assessed.blocked})}`);
}
// Every inspection normalizes only this operation's own confirmed/attempted
// pauses. All other source, implementation and authority facts remain exact.
async function inspectApproved(j,store,github,contractOptions) {
  const plan=j.plan;
  const paused=plan.barrier.filter(b=>j.actions.some(a=>a.kind==='disable'&&a.id===b.oldId&&a.state!=='prepared'));
  const fresh=await inspectCandidate(plan.candidate,github,contractOptions,{paused});
  for(const b of fresh.barrier){
    const old=paused.find(x=>x.oldId===b.oldId&&x.newId===b.newId&&x.oldPath===b.oldPath&&x.newPath===b.newPath);
    if(old&&b.priorState==='disabled_manually'){
      b.priorState=old.priorState;
      if(b.oldId===b.newId)b.newPriorState=old.newPriorState;
    }
  }
  if(observeProof(j,fresh))await store.save(j);
}
// Recovery observes attempted writes; it never repeats them. Prepared writes may
// resume only with unchanged original scope and freshly inspected source facts.
async function advance(j,store,github,contractOptions) {
  if(j.restoration){const r=await restoreInstallation(j,store,github,{yes:true,digest:j.restoration.approval.digest});r.data.continuation=continuation(j);return r;}
  const plan=j.plan,merge=j.actions.find(a=>a.kind==='merge');
  delete j.problem;
  try {
    if(merge.state==='prepared') {
      await inspectApproved(j,store,github,contractOptions);
      for(const action of j.actions.filter(a=>a.kind==='disable')) {
        const current=(await workflows(github,plan.repo)).find(w=>w.id===action.id&&w.path===action.path);
        if(action.state==='prepared') {
          if(current?.state!=='active')fail('workflow prior state changed');
          action.state='attempted';await store.save(j);
          await github({method:'PUT',path:`/repos/${plan.repo}/actions/workflows/${action.id}/disable`});
        }
        const after=(await workflows(github,plan.repo)).find(w=>w.id===action.id&&w.path===action.path);
        if(after?.state!=='disabled_manually')fail('disable uncertain; inspect original operation');
        action.state='verified';await store.save(j);
      }
      await barrierCheck(plan,github);
      await inspectApproved(j,store,github,contractOptions);
      await barrierCheck(plan,github);
      if(typeof github.prepareMerge!=='function'||typeof github.mergeConditional!=='function')fail('conditional merge adapter unavailable');
      if(!j.mergeArtifact){
        const prepared=await github.prepareMerge(plan);
        mergeArtifact(plan,prepared);
        j.mergeArtifact=prepared;
        await store.save(j);
      }
      // The adapter invokes this only after local Git reads/validation and
      // immediately before its push. Local failures leave the intent prepared.
      await github.mergeConditional(plan,j.mergeArtifact,{beforePublish:async()=>{
        await inspectApproved(j,store,github,contractOptions);
        await barrierCheck(plan,github);
        merge.state='attempted';await store.save(j);
      }});
    }
    j.installation=await readback(plan,github,j.mergeArtifact);await store.save(j);
    if(j.installation.state!=='installed')fail('merge outcome unknown; original merge will not be repeated');
    merge.state='verified';await store.save(j);
    for(const action of j.actions.filter(a=>a.kind==='restore')) {
      // Readback also rechecks current repository permission before any restore.
      await readback(plan,github,j.mergeArtifact);
      const inventory=await workflows(github,plan.repo);
      let id=action.id;
      if(id===null){
        j.mappings??={};
        const mapped=j.mappings[action.path];
        const found=inventory.find(w=>w.path===action.path);
        if(!found||!['active','disabled_manually'].includes(found.state))fail('new workflow registration unavailable; inspect original receipt');
        if(mapped&&mapped.id!==found.id)fail('registered workflow identity changed');
        if(!mapped){
          const expected=plan.compatibility.installed.find(f=>f.path===action.path&&!f.absent);
          if(!expected)fail('replacement source missing');
          j.mappings[action.path]={id:found.id,path:action.path,sha256:expected.sha256,mergeRevision:j.installation.mergeRevision};await store.save(j);
        }
        id=found.id;
      }
      const current=inventory.find(w=>w.id===id&&w.path===action.path);
      if(!current)fail('exact restore mapping unavailable; no replacement inferred');
      // GitHub may register a new file active. Old runs were drained before
      // merge; verified new bytes and this retained ID establish restoration.
      if(action.id===null&&action.state==='prepared'&&current.state==='active'){action.state='verified';await store.save(j);continue;}
      if(action.state==='prepared') {
        if(current.state!=='disabled_manually')fail('restore prior state changed');
        action.state='attempted';await store.save(j);
        await github({method:'PUT',path:`/repos/${plan.repo}/actions/workflows/${id}/enable`});
      }
      const after=(await workflows(github,plan.repo)).find(w=>w.id===id&&w.path===action.path);
      if(after?.state!=='active')fail('restoration uncertain; original enable will not be repeated');
      action.state='verified';await store.save(j);
    }
    if(plan.barrier.length){
      const inventory=await workflows(github,plan.repo);
      j.installation.workflowStates=plan.barrier.map(b=>{
        const id=b.newId??j.mappings?.[b.newPath]?.id;
        const actual=inventory.find(w=>w.id===id&&w.path===b.newPath);
        if(!actual||actual.state!==b.priorState)fail('restored workflow state differs from prior state');
        return {...actual,priorState:b.priorState,oldId:b.oldId,oldPath:b.oldPath};
      });
      await store.save(j);
    }
  } catch(e) {j.problem=e.message;await store.save(j);}
  return result(j);
}
export async function installUpdate({root,install,recover,restoreOnly=false,yes=false,digest:approved}, {github=installationGithub(),contractOptions}={}) {
  if(Boolean(install)===Boolean(recover)||restoreOnly&&!recover||recover&&!restoreOnly&&(yes||approved)||yes&&!approved||!yes&&approved)fail('choose --install [--yes --digest] or --recover [--restore-only [--yes --digest]]');
  if(recover) {
    const store=await installationStore(root),j=await store.read(recover);
    // A restoration preview performs only reads, including no lock-file writes.
    if(restoreOnly&&!yes)return restoreInstallation(j,store,github);
    const release=await store.lock(j.plan.repo);
    // The first read selects the repository lane only. A writer may finish
    // between that read and lock acquisition, so never advance its stale state.
    try{
      const current=await store.read(recover);
      if(restoreOnly){const r=await restoreInstallation(current,store,github,{yes,digest:approved});r.data.continuation=continuation(current);return r;}
      return await advance(current,store,github,contractOptions);
    }finally{await release();}
  }
  if(!yes) {
    const plan=await inspectCandidate(install,github,contractOptions),d=digest(plan);
    return {data:{...plan,digest:d,operationId:operationId(plan),installation:{state:'pending'},verification:{state:'unavailable'},retirement:{state:'unavailable',gaps:['No alias retirement evidence collected by installation']}},text:`Install ${install}; approve exact preview ${d}`,exitCode:3};
  }
  if(!/^[a-f0-9]{64}$/.test(approved??''))fail('expected exact preview digest');
  const store=await installationStore(root,true);
  // Recover a retained original before re-previewing a possibly already merged PR.
  try {const prior=await store.read(`install-${approved}`);if(prior.plan.candidate!==install)fail('foreign installation candidate');return installUpdate({root,recover:prior.operationId},{github,contractOptions});}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const plan=await inspectCandidate(install,github,contractOptions);
  if(digest(plan)!==approved)fail('preview changed; explicit digest approval required');
  const release=await store.lock(plan.repo);
  try {
    const original=await store.original(install);
    if(original)fail(`original operation exists; recover ${original.operationId}`);
    // A competing caller cannot overwrite a receipt reserved while inspecting.
    try {await store.read(operationId(plan));fail('original operation already reserved; recover it');}catch(e){if(e.code!=='ENOENT')throw e;}
    const j={schema:1,operationId:operationId(plan),ownerRoot:await realpath(root),plan,approval:{kind:'explicit-install-digest',digest:approved},actions:actionPlan(plan)};
    await store.save(j);
    return await advance(j,store,github,contractOptions);
  } finally {await release();}
}
