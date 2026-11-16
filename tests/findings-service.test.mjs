import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFindings, decideFinding, findingsCommand } from '../lib/findings-service.mjs';
async function fixture(t) {
 const dir=await mkdtemp(join(tmpdir(),'acme-findings-')); t.after(()=>rm(dir,{recursive:true,force:true}));
 const root=join(dir,'app'),env={...process.env,XDG_STATE_HOME:join(dir,'state')};
 await mkdir(join(root,'.plates'),{recursive:true}); await mkdir(join(root,'docs/audits'),{recursive:true});
 await writeFile(join(root,'.plates/plates.json'),JSON.stringify({repo:'acme/app'}));
 const finding={id:'sort',title:'Sorting loses ties',category:'correctness',evidence:[{path:'sort.mjs',line:1,what:'Equal values are discarded'}],severity:'high',effort:'S',confidence:'HIGH',risk:'LOW',impact:'Records disappear',fix:'Retain ties'};
 const doc={lens:'correctness',commit:'a'.repeat(40),findings:[finding]};
 const audit=join(root,'docs/audits/2026-11-16-correctness.json');await writeFile(audit,JSON.stringify(doc));
 return {root,env,dir,audit,doc};
}
const decision={action:'explore',rationale:'Check simplest fix first',payoff:{verdict:'unknown',benefit:'No lost records',cost:'One bounded probe',complexity:'Prefer existing sorter'},experiment:{question:'Can stable sort suffice?',minutes:20,success:'All ties retained',stop:'Stop at 20 minutes'}};
async function input(f,extra={}) {const listed=await collectFindings(f),item=listed.findings[0],from=join(f.dir,'decision.json');await writeFile(from,JSON.stringify({findingId:item.id,findingDigest:item.digest,decision,...extra}));return {item,from};}
test('one view retains source evidence, scoring and missing-source gaps',async t=>{
 const f=await fixture(t);const r=await collectFindings({...f,reviews:['acme/app#1']},{readReview:async()=>{throw new Error('offline');}});
 assert.equal(r.findings.length,1);assert.equal(r.findings[0].priority.score,3);assert.equal(r.gaps.length,1);assert.equal(r.groups.length,1);
});
test('preview writes nothing; explicit decision is private, idempotent and stale after source change',async t=>{
 const f=await fixture(t),{from}=await input(f);
 assert.equal((await decideFinding({...f,from})).exitCode,3);
 await assert.rejects(readdir(f.env.XDG_STATE_HOME),{code:'ENOENT'});
 assert.equal((await decideFinding({...f,from,yes:true})).data.status,'recorded');
 assert.equal((await decideFinding({...f,from,yes:true})).data.status,'already-recorded');
 let r=await collectFindings(f);assert.equal(r.findings[0].decisions.length,1);
 f.doc.commit='b'.repeat(40);await writeFile(f.audit,JSON.stringify(f.doc));
 r=await collectFindings(f);assert.equal(r.findings[0].decisions.length,0);assert.equal(r.findings[0].staleDecisions.length,1);
 await assert.rejects(decideFinding({...f,from,yes:true}),/changed/);
});
test('assessment preserves unknown inputs and permits bounded exploration',async t=>{
 const f=await fixture(t),review={repo:'acme/app',number:1,head:'a'.repeat(40),comments:[{id:'T1',text:'Review sorting',answered:false}]};
 const deps={readReview:async()=>({data:review})};let r=await collectFindings({...f,reviews:['acme/app#1']},deps);
 const item=r.findings.find(x=>x.source.kind==='review');assert.equal(item.priority.score,null);
 const from=join(f.dir,'review-decision.json');await writeFile(from,JSON.stringify({findingId:item.id,findingDigest:item.digest,decision,assessment:{severity:'high',effort:'M',confidence:'MED',risk:'LOW'},duplicateOf:r.findings[0].id}));
 await decideFinding({...f,from,yes:true,reviews:['acme/app#1']},deps);
 r=await collectFindings({...f,reviews:['acme/app#1']},deps);assert.equal(r.groups.length,1);assert.equal(r.findings.find(x=>x.id===item.id).priority.score,3 / 2 * .6);
});
test('conflicting decisions stay visible, invalid choices and linked audit files refused',async t=>{
 const f=await fixture(t),{from,item}=await input(f);await decideFinding({...f,from,yes:true});
 await writeFile(from,JSON.stringify({findingId:item.id,findingDigest:item.digest,decision:{...decision,action:'drop'}}));await decideFinding({...f,from,yes:true});
 assert.equal((await collectFindings(f)).findings[0].decisionConflict,true);
 await writeFile(from,JSON.stringify({findingId:item.id,findingDigest:item.digest,decision:{action:'build'}}));await assert.rejects(decideFinding({...f,from,yes:true}),/action/);
 await symlink(f.audit,join(f.root,'docs/audits/2026-11-17-correctness.json'));assert.equal((await collectFindings(f)).gaps.length,1);
});
test('CLI rejects accidental writes on list and keeps incomplete input nonzero',async t=>{
 const f=await fixture(t);await assert.rejects(findingsCommand({...f,cwd:f.root,args:['list','--yes']}),/usage/);
 const r=await findingsCommand({...f,cwd:f.root,args:['list','--review','acme/app#1']},{readReview:async()=>{throw new Error('offline');}});assert.equal(r.exitCode,1);
});
test('exploration can conclude explicitly without erasing history',async t=>{
 const f=await fixture(t),{from,item}=await input(f);await decideFinding({...f,from,yes:true});
 const old=(await collectFindings(f)).findings[0].decisions[0].decisionId;
 await writeFile(from,JSON.stringify({findingId:item.id,findingDigest:item.digest,supersedes:[old],decision:{...decision,action:'keep'}}));
 await decideFinding({...f,from,yes:true});
 const current=(await collectFindings(f)).findings[0];assert.equal(current.decisionConflict,false);assert.equal(current.decisions[0].decision.action,'keep');assert.equal(current.decisionHistory.length,2);
 assert.equal((await decideFinding({...f,from,yes:true})).data.status,'already-recorded');
});
test('oversized decisions are rejected before they can poison the ledger',async t=>{
 const f=await fixture(t),{from,item}=await input(f);
 await writeFile(from,JSON.stringify({findingId:item.id,findingDigest:item.digest,decision:{...decision,rationale:'a'.repeat(1024*1024)}}));
 await assert.rejects(decideFinding({...f,from,yes:true}),/record limit/);
 await assert.rejects(readdir(f.env.XDG_STATE_HOME),{code:'ENOENT'});
 assert.equal((await collectFindings(f)).findings.length,1);
});
