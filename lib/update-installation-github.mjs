import { prGate } from './review.mjs';
import { conditionalGit } from './update-installation-git.mjs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { namesGithub, namesRead, namesPages } from './names-actions.mjs';
import { environmentValue } from './names.mjs';
import { installationContract, digest, hash, oid, fail } from './update-installation-contract.mjs';
import { createHash } from 'node:crypto';
// Reuse the bounded read adapter. Merge publication uses an exact Git ref lease.
export function installationGithub(env = process.env) {
  const read = namesGithub(env);
  const github = async request => {
    if (request.method !== 'PUT') return read(request);
    if (!/^\/repos\/[\w.-]+\/[\w.-]+\/actions\/workflows\/[1-9]\d*\/(?:enable|disable)$/.test(request.path)) fail('invalid installation mutation');
    const args = ['api','--include','--method','PUT',request.path];
    if (request.body !== undefined) args.push('--input','-');
    const r = spawnSync(environmentValue('variable:KEEL_GH',env) ?? 'gh',args,{env,input:request.body === undefined ? undefined : JSON.stringify(request.body),encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
    const match = /^HTTP\/[\d.]+ (\d+)[^\n]*\r?\n[\s\S]*?\r?\n\r?\n([\s\S]*)$/.exec(r.stdout ?? '');
    if (r.error || !match) fail('installation response unavailable');
    return {status:Number(match[1]),data:match[2].trim() ? JSON.parse(match[2]) : null};
  };
  github.reviewGate = ({repo,number}) => prGate({repo,number},{env});
  Object.assign(github, conditionalGit(env));
  github.requiredChecks = ({repo,number}) => {
    const r=spawnSync(environmentValue('variable:KEEL_GH',env)??'gh',['pr','checks',String(number),'--repo',repo,'--required','--json','name,state,bucket'],{env,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
    if(r.error||r.status!==0)fail('current required checks unavailable or not passing');
    const rows=JSON.parse(r.stdout);
    if(!Array.isArray(rows)||rows.length>200||rows.some(r=>typeof r.name!=='string'||!['pass','skipping'].includes(r.bucket)))fail('current required checks not passing');
    return rows;
  };
  return github;
}
export const parseCandidate = value => {
  const m = /^([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)#([1-9]\d*)$/.exec(value ?? '');
  if (!m || !Number.isSafeInteger(Number(m[2])) || ['.','..'].includes(m[1].split('/')[1])) fail('expected owner/repo#PR');
  return {repo:m[1],number:Number(m[2])};
};
const unique = rows => {
  if (rows.some(r => !Number.isSafeInteger(r.id) || r.id < 1) || new Set(rows.map(r=>r.id)).size !== rows.length) fail('provider identities incomplete');
  return rows;
};
export async function repository(github,repo) {
  const m = await namesRead(github,`/repos/${repo}`);
  if (m.full_name !== repo || !Number.isSafeInteger(m.id) || m.id < 1 || typeof m.node_id !== 'string' || !m.default_branch || m.permissions?.push !== true) fail('repository identity/permission unavailable');
  return {repo,repositoryId:m.id,repositoryNodeId:m.node_id,defaultBranch:m.default_branch,permissions:m.permissions};
}
export async function sourceTree(github,repo,revision) {
  if (!oid(revision)) fail('invalid source revision');
  const result = await namesRead(github,`/repos/${repo}/git/trees/${revision}?recursive=1`);
  if (result.truncated !== false || !Array.isArray(result.tree) || result.tree.length > 100000 || new Set(result.tree.map(f=>f.path)).size !== result.tree.length) fail('source tree incomplete');
  return new Map(result.tree.map(f=>[f.path,f]));
}
export async function sourceFile(github,repo,tree,path) {
  const f = tree.get(path);
  if (!f) return null;
  if (f.type !== 'blob' || !['100644','100755'].includes(f.mode) || !oid(f.sha)) fail(`unsupported file type: ${path}`);
  const b = await namesRead(github,`/repos/${repo}/git/blobs/${f.sha}`);
  if (b.encoding !== 'base64' || typeof b.content !== 'string' || b.content.length > 350000) fail('source bytes unavailable');
  const bytes = Buffer.from(b.content,'base64');
  if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== f.sha) fail('source blob mismatch');
  return {mode:f.mode,text:new TextDecoder('utf-8',{fatal:true}).decode(bytes)};
}
export async function workflows(github,repo) {
  const rows = unique(await namesPages(github,`/repos/${repo}/actions/workflows`,'workflows'));
  if (rows.some(w=>typeof w.path !== 'string' || typeof w.state !== 'string') || new Set(rows.map(w=>w.path)).size !== rows.length) fail('workflow identity incomplete');
  return rows.map(({id,path,state})=>({id,path,state}));
}
export async function inspectCandidate(candidate,github,contractOptions,{paused=[]}={}) {
  const {repo,number} = parseCandidate(candidate), prefix = `/repos/${repo}`;
  const meta = await repository(github,repo);
  const pr = await namesRead(github,`${prefix}/pulls/${number}`);
  if (pr.number !== number || pr.state !== 'open' || pr.draft !== false || pr.merged !== false || pr.head?.repo?.id !== meta.repositoryId || pr.base?.repo?.id !== meta.repositoryId || pr.base.ref !== meta.defaultBranch || !oid(pr.head.sha) || !oid(pr.base.sha) || pr.mergeable !== true || pr.mergeable_state !== 'clean') fail('candidate is not a clean same-repository open PR');
  const head = pr.head.sha, base = pr.base.sha;
  const current = await namesRead(github,`${prefix}/commits/${encodeURIComponent(meta.defaultBranch)}`);
  if (current.sha !== base) fail('base moved; reinspect');
  const files = await namesPages(github,`${prefix}/pulls/${number}/files`);
  if (files.length !== pr.changed_files || files.length > 200 || files.some(f=>!['modified','added','removed','renamed'].includes(f.status))) fail('diff incomplete or unsupported change');
  const trees = Object.fromEntries(await Promise.all(['base','head'].map(async side=>[side,await sourceTree(github,repo,side==='head'?head:base)])));
  const actual = [...new Set([...trees.base.keys(),...trees.head.keys()])].filter(path => {
    const a=trees.base.get(path),b=trees.head.get(path);
    return (a?.type !== 'tree' || b?.type !== 'tree') && (a?.sha !== b?.sha || a?.mode !== b?.mode);
  }).sort();
  if (digest(actual) !== digest(files.flatMap(f=>f.status==='renamed'?[f.previous_filename,f.filename]:[f.filename]).sort())) fail('diff does not cover exact trees');
  const read = (side,path) => sourceFile(github,repo,trees[side],path);
  const compatibility = await installationContract({repo,files:actual,read},contractOptions);
  const config = JSON.parse((await read('base','.plates/plates.json')).text);
  const gatePath = config.ci?.gateWorkflow ?? config.gateWorkflow ?? 'check.yml';
  if (typeof gatePath !== 'string' || !/^[\w.-]+\.ya?ml$/.test(gatePath)) fail('configured gate workflow unsupported');
  const inventory = await workflows(github,repo);
  const gate = inventory.find(w=>w.path===`.github/workflows/${gatePath}`);
  if (!gate) fail('applicable gate unavailable');
  const runs = unique(await namesPages(github,`${prefix}/actions/workflows/${gate.id}/runs?head_sha=${head}`,'workflow_runs'));
  const applicable = runs.filter(r=>r.head_sha===head && r.event==='pull_request').sort((a,b)=>b.id-a.id);
  if (!applicable.length || applicable[0].status !== 'completed' || applicable[0].conclusion !== 'success') fail('applicable exact-head gate not successful');
  const tested = applicable[0];
  if (tested.workflow_id !== gate.id || tested.head_repository?.id !== meta.repositoryId || !Array.isArray(tested.pull_requests) ||
      tested.pull_requests.length !== 1 || tested.pull_requests[0].number !== number ||
      tested.pull_requests[0].head?.sha !== head || tested.pull_requests[0].base?.sha !== base) fail('gate candidate/base binding unavailable or stale');
  const checks = unique(await namesPages(github,`${prefix}/commits/${head}/check-runs`,'check_runs'));
  if (!checks.length || checks.some(c=>c.head_sha!==head || c.status!=='completed' || !['success','neutral','skipped'].includes(c.conclusion))) fail('exact-head checks stale or unsuccessful');
  const statuses = await namesRead(github,`${prefix}/commits/${head}/status`);
  if (statuses.sha !== head || !Array.isArray(statuses.statuses) || statuses.total_count !== statuses.statuses.length || statuses.statuses.some(s=>s.state!=='success')) fail('status coverage stale or unsuccessful');
  if(typeof github.reviewGate!=='function'||typeof github.requiredChecks!=='function')fail('configured review/check reader unavailable');
  const review=await github.reviewGate({repo,number});
  if(review?.ok!==true||review.head!==head||review.repo!==repo||review.number!==number)fail(`configured exact-head review gate unavailable: ${review?.why??'incomplete'}`);
  const required=await github.requiredChecks({repo,number});
  if(!Array.isArray(required)||required.some(r=>!['pass','skipping'].includes(r.bucket)||!checks.some(c=>c.name===r.name)&&!statuses.statuses.some(s=>s.context===r.name)))fail('required checks do not match exact-head evidence');
  const barrier = compatibility.barrier.map(b=>{
    const old=inventory.find(w=>w.path===b.oldPath),next=inventory.find(w=>w.path===b.newPath);
    if (!old || !['active','disabled_manually'].includes(old.state) || next&&!['active','disabled_manually'].includes(next.state)) fail('exact affected workflow state unavailable');
    if(next&&old.id!==next.id && next.state!=='disabled_manually')fail('replacement workflow must already be disabled before approval');
    if(!next&&old.state!=='active'&&!paused.some(p=>p.oldId===old.id&&p.oldPath===b.oldPath&&p.newPath===b.newPath&&p.priorState==='active'))fail('new workflow registration cannot preserve a disabled prior state');
    return {...b,oldId:old.id,newId:next?.id??null,priorState:old.state,newPriorState:next?.state??null};
  });
  const implementation=await Promise.all(['update-installation.mjs','update-installation-contract.mjs','update-installation-github.mjs','update-installation-git.mjs','update-installation-restore.mjs','update-installation-state.mjs','name-concurrency.mjs','names-actions.mjs','practices.mjs','rename.mjs','review.mjs'].map(async path=>({path,sha256:hash(await readFile(new URL(path,import.meta.url)))})));
  return {schema:1,implementation,kind:'update-installation',candidate,...meta,head,base,compatibility,barrier,
    proof:{gate:{id:tested.id,attempt:tested.run_attempt,head,base,number,workflowId:gate.id,repositoryId:meta.repositoryId},checks:checks.map(c=>({id:c.id,head:c.head_sha,conclusion:c.conclusion,completedAt:c.completed_at})),review,required,statuses:statuses.statuses.map(s=>({id:s.id,context:s.context,state:s.state}))},
    mutations:['merge-reviewed-head',...(barrier.length?['disable-exact-workflows','restore-prior-active-workflows']:[])],budget:null};
}
export async function readback(plan,github,artifact) {
  const meta = await repository(github,plan.repo);
  if (digest(meta) !== digest(Object.fromEntries(['repo','repositoryId','repositoryNodeId','defaultBranch','permissions'].map(k=>[k,plan[k]])))) fail('repository identity or permissions changed');
  const pr = await namesRead(github,`/repos/${plan.repo}/pulls/${parseCandidate(plan.candidate).number}`);
  if (pr.head?.sha !== plan.head || pr.base?.repo?.id !== plan.repositoryId || pr.base?.ref !== plan.defaultBranch) fail('original PR identity changed');
  if (pr.merged !== true) return {state:'unknown',reason:'original merge not observed'};
  if (!oid(pr.merge_commit_sha)) fail('merge revision unavailable');
  if (!artifact || pr.merge_commit_sha !== artifact.sha) fail('merge differs from the retained conditional artifact');
  const mergedCommit=await namesRead(github,`/repos/${plan.repo}/commits/${pr.merge_commit_sha}`);
  if(mergedCommit.sha!==pr.merge_commit_sha || digest(mergedCommit.parents?.map(p=>p.sha)??null)!==digest([plan.base,plan.head]))fail('merge parents differ from reviewed base/head');
  const current = await namesRead(github,`/repos/${plan.repo}/commits/${encodeURIComponent(plan.defaultBranch)}`);
  if (!oid(current.sha)) fail('default revision unavailable');
  // Both the actual merge and current default must contain the reviewed bytes.
  for (const revision of new Set([pr.merge_commit_sha,current.sha])) {
    const tree = await sourceTree(github,plan.repo,revision);
    for (const f of plan.compatibility.installed) {
      const actual = await sourceFile(github,plan.repo,tree,f.path);
      if (f.absent ? actual!==null : !actual || hash(actual.text)!==f.sha256 || actual.mode!==f.mode) fail(`installed source differs: ${f.path}`);
    }
  }
  if (current.sha !== pr.merge_commit_sha) {
    const compare = await namesRead(github,`/repos/${plan.repo}/compare/${pr.merge_commit_sha}...${current.sha}`);
    if (!['ahead','identical'].includes(compare.status) || compare.merge_base_commit?.sha!==pr.merge_commit_sha) fail('merge not on current default history');
  }
  return {state:'installed',mergeRevision:pr.merge_commit_sha,defaultRevision:current.sha,targetRelease:plan.compatibility.targetRelease,identities:plan.compatibility.installed};
}
