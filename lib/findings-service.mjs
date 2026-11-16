// One private decision ledger for findings; source tools retain execution authority.
import { readdir, readFile, lstat, realpath } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { safeDirectory, safeRead, atomicNew } from './feedback-store.mjs';
import { normalizeAudit, normalizeReview, normalizeObservation, groupFindings, priorityScore, evaluateDecision } from './findings.mjs';
import { shapeProblems } from '../practices/audits/files/scripts/plates/audit.mjs';
const DECISION_LIMIT = 1024 * 1024;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => { const e = new Error(message); e.exitCode = 2; throw e; };
const json = async file => JSON.parse((await safeRead(file, 4 * 1024 * 1024)).toString('utf8'));
async function storePath(root, env) {
  const canonical = await realpath(root);
  const base = resolve(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local/state'));
  const path = join(base, 'plates', 'findings', hash(canonical));
  // Never put private decisions in a checkout, even through an XDG override.
  let ancestor = path;
  while (true) { try { await lstat(ancestor); break; } catch (e) { if (e.code !== 'ENOENT') throw e; const p = dirname(ancestor); if (p === ancestor) throw e; ancestor = p; } }
  await safeDirectory(ancestor);
  try { if (execFileSync('git', ['-C', ancestor, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'], env }).trim() === 'true') fail('findings state must be outside Git working trees'); } catch (e) { if (e.exitCode === 2) throw e; }
  if (path === canonical || path.startsWith(canonical + '/')) fail('findings state must be outside the project');
  return path;
}
async function decisionsAt(path) {
  let files; try { await safeDirectory(path, { privateMode: true }); files = await readdir(path); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const records = [];
  for (const file of files.filter(f => /^[a-f0-9]{64}\.json$/.test(f)).sort()) {
    const record = JSON.parse((await safeRead(join(path, file), DECISION_LIMIT, { privateMode: true })).toString());
    if (record.version !== 1 || hash(record.payload) + '.json' !== file) fail('invalid findings decision record');
    records.push(record.payload);
  }
  return records;
}
export async function collectFindings({ root, reviews = [], observations = [], env = process.env }, { readReview } = {}) {
  const config = JSON.parse(await readFile(join(root,'.plates','plates.json'),'utf8'));
  const findings = [], gaps = [];
  const dir = join(root, 'docs', 'audits');
  let files = [];
  try { files = await readdir(dir); } catch(e) { if(e.code !== 'ENOENT') gaps.push({source:'audits',reason:e.message}); }
  for (const name of files.filter(f => /^\d{4}-\d{2}-\d{2}-.+\.json$/.test(f)).sort()) {
    try {
      const doc = await json(join(dir,name));
      const problems = shapeProblems({lens:doc.lens,commit:doc.commit,findings:doc.findings,rejected:doc.rejected,notAudited:doc.notAudited},doc.lens);
      if(problems.length) throw new Error(problems.join('; '));
      findings.push(...normalizeAudit(doc,{repo:config.repo,page:`docs/audits/${name.replace(/\.json$/,'.md')}`}));
    } catch(e) { gaps.push({source:`docs/audits/${name}`,reason:e.message}); }
  }
  for(const target of [...new Set(reviews)]) {
    try {
      const result = await (readReview || (await import('./review.mjs')).review)({root,target},{env});
      findings.push(...normalizeReview(result.data));
    } catch(e) { gaps.push({source:target,reason:e.message}); }
  }
  for (const file of observations) {
    try { const doc=await json(file); if (!Array.isArray(doc.findings)) throw new Error('observations.findings must be an array'); findings.push(...doc.findings.map(normalizeObservation)); } catch(e) { gaps.push({source:file,reason:e.message}); }
  }
  const path = await storePath(root,env), records = await decisionsAt(path);
  const unique=new Map(), conflicted=new Set();
  for(const f of findings) {
    const prior=unique.get(f.id);
    if(prior && prior.fingerprint!==f.fingerprint) conflicted.add(f.id);
    else if(!prior) unique.set(f.id,f);
  }
  for(const id of conflicted) {unique.delete(id);gaps.push({source:id,reason:'conflicting observation revisions; excluded all copies'});}
  const items = [...unique.values()].map(f => {
    const digest=hash(f), history=records.filter(r=>r.findingId===f.id);
    const revision=history.filter(r=>r.findingDigest===digest);
    const superseded=new Set(revision.flatMap(r=>r.supersedes || []));
    const current=revision.filter(r=>!superseded.has(hash(r))).map(r=>({...r,decisionId:hash(r)}));
    // Repeated decisions are retained rather than picking a winner by wall clock.
    return {...f,digest,priority:priorityScore(current.length===1 ? {...f,...current[0].assessment} : f),decisions:current,decisionHistory:revision.map(r=>({...r,decisionId:hash(r)})),staleDecisions:history.filter(r=>r.findingDigest!==digest),decisionConflict:current.length>1};
  });
  items.sort((a,b)=>(b.priority.score ?? -1)-(a.priority.score ?? -1)||a.id.localeCompare(b.id));
  const links=items.flatMap(f=>f.decisions.filter(d=>d.duplicateOf && items.some(other=>other.id===d.duplicateOf)).map(d=>({from:f.id,to:d.duplicateOf})));
  return {version:1,findings:items,groups:groupFindings(items,links),gaps,coverage:{audits:true,reviews:[...new Set(reviews)],note:'Only recorded audits and explicitly selected PRs; not proof of whole-project health.'}};
}
export async function decideFinding({root,from,yes=false,env=process.env,reviews=[],observations=[]},deps={}) {
  const request=await json(resolve(from));
  const collected=await collectFindings({root,reviews,observations,env},deps);
  const finding=collected.findings.find(f=>f.id===request.findingId);
  if(!finding) fail('finding is unavailable; read findings with the same sources first');
  if(request.findingDigest!==finding.digest) fail('finding changed; read it and reconsider the decision');
  const assessment=request.assessment ?? {};
  if(Object.keys(assessment).some(k=>!['severity','effort','confidence','risk'].includes(k))) fail('assessment accepts only severity, effort, confidence and risk');
  if(Object.keys(assessment).some(k=>priorityScore({...finding,...assessment}).missing.includes(k))) fail('invalid assessment factor');
  if(request.duplicateOf && (request.duplicateOf===finding.id || !collected.findings.some(f=>f.id===request.duplicateOf))) fail('duplicateOf must name another observed finding');
  const evaluation=evaluateDecision({...finding,...assessment},request.decision);
  const supersedes=request.supersedes ?? [];
  if(!Array.isArray(supersedes) || supersedes.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))) fail('supersedes must be decision IDs');
  const history=(await decisionsAt(await storePath(root,env))).filter(r=>r.findingId===finding.id && r.findingDigest===finding.digest);
  if(supersedes.some(id=>!history.some(r=>hash(r)===id))) fail('superseded decision is unavailable at this revision');
  const payload={...(supersedes.length?{supersedes:[...new Set(supersedes)].sort()}:{}),findingId:finding.id,findingDigest:finding.digest,decision:request.decision,assessment,...(request.duplicateOf?{duplicateOf:request.duplicateOf}:{})};
  const result={version:1,status:yes?'recorded':'preview',payload,evaluation,authority:'Local triage only: never executes, grants budget, closes a PR thread, or proves a fix.'};
  const bytes=JSON.stringify({version:1,payload})+'\n';
  if(Buffer.byteLength(bytes)>DECISION_LIMIT) fail('decision exceeds the 1 MiB record limit');
  if(yes) {
    const dir=await storePath(root,env); await safeDirectory(dir,{create:true,privateMode:true});
    const file=join(dir,hash(payload)+'.json');
    try { await atomicNew(file,bytes,async()=>{await safeDirectory(dir,{privateMode:true});}); } catch(e) { if(e.code!=='EEXIST') throw e; if((await safeRead(file,DECISION_LIMIT,{privateMode:true})).toString()!==bytes) fail('decision record conflict'); result.status='already-recorded'; }
  }
  return {data:result,text:JSON.stringify(result,null,2),exitCode:yes?0:3};
}
export async function findingsCommand({root,cwd,args,env=process.env},deps={}) {
  const a=[...args],verb=a.shift()||'list',reviews=[],observations=[]; let from,yes=false;
  while(a.length) { const k=a.shift(); if(k==='--review'||k==='--from'||k==='--observations') {const v=a.shift();if(!v||v.startsWith('--')) fail(`${k} needs a value`);if(k==='--review')reviews.push(v);else if(k==='--observations')observations.push(resolve(cwd,v));else from=resolve(cwd,v);}else if(k==='--yes')yes=true;else fail(`unknown findings option ${k}`); }
  if(verb==='decide'&&from) return decideFinding({root,from,yes,reviews,observations,env},deps);
  if(verb!=='list'||from||yes) fail('usage: plates findings list [--review owner/repo#N] | decide --from decision.json [--review owner/repo#N] [--yes]');
  const data=await collectFindings({root,reviews,observations,env},deps);
  return {data,text:JSON.stringify(data,null,2),exitCode:data.gaps.length?1:0};
}
