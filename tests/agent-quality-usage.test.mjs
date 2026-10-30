import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { sealRecord, fingerprint } from '../lib/evaluation-records.mjs';
import { validateQualityBundle } from '../lib/agent-quality-records.mjs';
import { sealUsageObservation, validateUsageObservation } from '../lib/agent-quality-usage-records.mjs';
import { qualityUsageReport, appendUsageObservation } from '../lib/agent-quality-usage.mjs';
import { qualityOperation } from '../lib/agent-quality-ledger.mjs';
import { initializeWorkspace } from '../lib/web/workspace.mjs';
import { acmeQualityEpisode, acmeQualityBundle, QUALITY_TIME, QUALITY_HASH } from './helpers/agent-quality.mjs';
const at = n => new Date(Date.parse(QUALITY_TIME)+n*1000).toISOString();
const h = fingerprint;
function observation(request='acme-request', extra={}) {
  return sealUsageObservation({schemaVersion:1,revision:1,previousDigest:null,attemptId:'acme-code',actorId:'alice',
    funding:{kind:'person',principalId:'alice',accountId:'acme-alice'},provider:'acme',model:'acme-model',modelVersion:'1.0',source:{id:h(request),kind:'provider-response',evidenceDigest:QUALITY_HASH},observedAt:at(1),
    counter:{mode:'request',sessionId:h('acme-session'),segmentId:h('acme-segment'),requestIds:[h(request)],includesChildren:'no'},
    tokens:{input:80,output:20,cacheRead:30,cacheWrite:10,reasoning:5,tokens:100},semantics:{version:1,cacheRead:'included-input',cacheWrite:'included-input',reasoning:'included-output'},
    cost:{currency:'USD',kind:'observed',amount:1,basisDigest:QUALITY_HASH,priceDate:null},attribution:{repositoryId:102,prs:[{number:1,weight:1}],commits:['b'.repeat(40)],evidenceDigest:QUALITY_HASH},visibility:'project',...extra});
}
function episode(records=[],attempts=null) {
  const e=acmeQualityEpisode();if(attempts)e.attempts=attempts;e.usage=records;return sealRecord(e);
}
const report = (e,opts={}) => qualityUsageReport(acmeQualityBundle(Array.isArray(e)?e:[e]),{projects:['acme/widget'],repositoryBindings:[{project:'acme/widget',repositoryId:102}],now:at(100),...opts});
const secondAttempt = (id='acme-review',stage='review',status='failed') => ({...acmeQualityEpisode().attempts[0],id,parentId:'acme-code',stage,status,checkpointDigest:null,inputCheckpointDigest:null,agent:null});
async function world(t) {
  const root=await realpath(await mkdtemp(join(tmpdir(),'acme-usage-')));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'inputs'));
  const opts={appRoot:fileURLToPath(new URL('..',import.meta.url)),manifest:join(root,'inputs/workspace.json'),state:join(root,'state'),now:at(1)};
  await writeFile(opts.manifest,JSON.stringify({version:1,id:'acme',name:'Acme',repo:'Acme/private',projects:[{id:'widget',repo:'Acme/widget'}]}));await initializeWorkspace(opts);
  const inputBundle=acmeQualityBundle(),p=await qualityOperation({...opts,action:'collect',inputBundle});await qualityOperation({...opts,action:'collect',inputBundle,yes:true,digest:p.digest});
  return {...opts,root};
}

test('schema2 episodes remain compatible; usage keeps provider token subsets and rejects private text fields',()=>{
  assert.doesNotThrow(()=>validateQualityBundle(acmeQualityBundle()));
  const r=report(episode([observation()]));assert.equal(r.totals.tokens.total,100);assert.equal(r.totals.input.total,80);assert.equal(r.totals.cacheRead.total,30);assert.equal(r.coverage.state,'complete');
  for(const change of [v=>v.prompt='Acme private prompt',v=>v.tokens.tokens=140,v=>v.tokens.cacheRead=81,v=>v.attribution.prs=[{number:1,weight:.6},{number:2,weight:.6}],v=>v.source.kind='token-counter',v=>v.cost={...v.cost,kind:'estimate',basisDigest:null}]) {
    const v=structuredClone(observation());change(v);assert.throws(()=>validateUsageObservation(sealRecord(v)),/evaluations:/);
  }
});

test('full PR lifecycle retains contributors, failed retries and missing telemetry instead of final-success totals',()=>{
  const attempts=[acmeQualityEpisode().attempts[0],secondAttempt(),secondAttempt('acme-retry','iteration','completed')];
  const records=[observation(),observation('review',{attemptId:'acme-review',actorId:'bob',funding:{kind:'person',principalId:'bob',accountId:'acme-bob'}}),observation('retry',{attemptId:'acme-retry'})];
  const r=report(episode(records,attempts),{pr:{repositoryId:102,number:1}});
  assert.equal(r.totals.tokens.total,300);assert.deepEqual(r.attempts.map(a=>a.status),['completed','failed','completed']);
  assert.doesNotMatch(JSON.stringify(r),/acme-alice|acme-bob|"actorId"|"principalId"|source/);
  const missing=report(episode(records.slice(0,2),attempts));assert.equal(missing.totals.tokens.total,null);assert.equal(missing.totals.tokens.knownSubtotal,200);assert.ok(missing.coverage.gaps.some(g=>g.code==='usage-missing'));
});

test('private measurements never enter shared totals or another actor view',()=>{
  const attempts=[acmeQualityEpisode().attempts[0],secondAttempt()];
  const e=episode([observation(),observation('review',{attemptId:'acme-review',actorId:'bob',funding:{kind:'person',principalId:'bob',accountId:'acme-bob-private'},visibility:'personal'})],attempts);
  const shared=report(e);assert.equal(shared.totals.tokens.total,null);assert.equal(shared.totals.tokens.knownSubtotal,100);assert.doesNotMatch(JSON.stringify(shared),/acme-bob-private|"bob"/);
  const alice=report(e,{shared:false,actorId:'alice'});assert.equal(alice.measurements.length,1);assert.equal(alice.measurements[0].funding.accountId,'acme-alice');assert.doesNotMatch(JSON.stringify(alice),/acme-bob-private/);
  assert.throws(()=>qualityUsageReport(acmeQualityBundle(),{}),/explicit authorized/);
  assert.equal(report(e,{projects:[],repositoryBindings:[]}).attempts.length,0);
});

test('cross-PR allocation conserves consumption and missing allocation is nonadditive',()=>{
  const a={repositoryId:102,prs:[{number:1,weight:.25},{number:2,weight:.75}],commits:[],evidenceDigest:QUALITY_HASH};
  const e=episode([observation('shared',{attribution:a})]);
  assert.equal(report(e).totals.tokens.total,100);
  assert.equal(report(e,{pr:{repositoryId:102,number:1}}).totals.tokens.total,25);
  assert.equal(report(e,{pr:{repositoryId:102,number:2}}).totals.tokens.total,75);
  const unknown=episode([observation('shared',{attribution:{...a,prs:[{number:1,weight:null},{number:2,weight:null}]}})]);
  const r=report(unknown,{pr:{repositoryId:102,number:1}});assert.equal(r.totals.tokens.total,null);assert.equal(r.totals.tokens.knownSubtotal,0);assert.equal(r.measurements[0].attribution,'shared-unallocated');
  assert.equal(report(unknown).totals.tokens.total,100,'set/project associated usage counts the request once');
  assert.equal(report(e,{pr:{repositoryId:999,number:1}}).attempts.length,0,'name-only links never bind another repository numeric identity');
});

test('import aliases deduplicate canonical requests; conflicting attempts or funding refuse complete totals',()=>{
  const a=episode([observation()]),b=structuredClone(a);b.id='another-task';b.source.id='another-source';b.usage=[observation('acme-request',{source:{id:h('import-alias'),kind:'authenticated-reporter',evidenceDigest:h('import-evidence')}})];
  assert.equal(report([a,sealRecord(b)]).totals.tokens.total,100);
  b.attempts[0].id='other-code';b.evaluations=[];b.usage=[observation('acme-request',{attemptId:'other-code'})];
  const conflicting=report([a,sealRecord(b)]);assert.equal(conflicting.totals.tokens.total,null);assert.ok(conflicting.coverage.gaps.some(g=>g.code==='conflicting-measurement'));
  const unbound=report(episode([observation('unknown',{funding:{kind:'person',principalId:'alice',accountId:null}})]));assert.equal(unbound.totals.tokens.total,null);assert.ok(unbound.coverage.gaps.some(g=>g.code==='funding-identity-unknown'));
});

test('cumulative revisions replace observations; reset requires a new segment and preserves prior totals',()=>{
  const counter={mode:'cumulative',sessionId:h('session'),segmentId:h('segment-1'),requestIds:[h('one')],includesChildren:'no'};
  const first=observation('one',{counter,cost:{currency:'USD',kind:'unknown',amount:null,basisDigest:null,priceDate:null}});
  const second=observation('two',{counter:{...counter,requestIds:[h('one'),h('two')]},revision:2,previousDigest:first.digest,observedAt:at(2),tokens:{input:160,output:40,cacheRead:60,cacheWrite:20,reasoning:10,tokens:200},cost:first.cost});
  assert.equal(report(episode([first,second])).totals.tokens.total,200);
  assert.throws(()=>report(episode([first,second,observation('reset',{...second,tokens:first.tokens,revision:3,previousDigest:second.digest})])),/revision chain|reset/);
  const reset=observation('reset',{counter:{...counter,segmentId:h('segment-2'),requestIds:[h('three')]}});
  assert.equal(report(episode([first,second,reset])).totals.tokens.total,300);
});

test('parent and child coverage reconciles without adding inclusive totals; unknown overlap stays partial',()=>{
  const attempts=[acmeQualityEpisode().attempts[0],secondAttempt('acme-child','review','completed')];
  const one=observation('one'),two=observation('two',{attemptId:'acme-child'});
  const parent=observation('parent',{counter:{...one.counter,mode:'parent',requestIds:[h('one'),h('two')],includesChildren:'yes'},tokens:{input:160,output:40,cacheRead:60,cacheWrite:20,reasoning:10,tokens:200},cost:{...one.cost,amount:2}});
  assert.equal(report(episode([one,two,parent],attempts)).totals.tokens.total,200);
  const ambiguous=observation('parent',{counter:{...parent.counter,requestIds:[],includesChildren:'unknown'},tokens:parent.tokens});
  const r=report(episode([one,two,ambiguous],attempts));assert.equal(r.totals.tokens.total,null);assert.equal(r.totals.tokens.knownSubtotal,200);assert.ok(r.coverage.gaps.some(g=>g.code==='unresolved-counter-overlap'));
});

test('retention, retrospective capture, unknown units and mixed monetary evidence stay explicit',()=>{
  const original=observation(),withUnknown=observation('unknown',{tokens:{...original.tokens,input:null},cost:{...original.cost,kind:'estimate',priceDate:'2026-10-30'}});
  const e=episode([original,withUnknown]);
  const r=report(e,{ledgerCoverage:{expired:1,sourceIssues:[{state:'uncertain'}]}});assert.equal(r.totals.tokens.total,null);assert.equal(r.totals.input.knownSubtotal,80);assert.equal(r.totals.costs.length,2);assert.ok(r.totals.costs.every(c=>c.total===null));
  const old=structuredClone(e);old.passport.timing='retrospective';assert.ok(report(sealRecord(old)).coverage.gaps.some(g=>g.code==='retrospective-lifecycle'));
});

test('late usage appends to the existing ledger, exact replay recovers, and terminal attempt bytes stay fixed',async t=>{
  const w=await world(t),before=await qualityOperation({...w,action:'inspect'}),attempt=JSON.stringify(before.bundle.episodes[0].attempts[0]),record=observation();
  const options={...w,project:'Acme/widget',episodeId:'acme-task',observation:record};
  const preview=await appendUsageObservation(options),batches=join(w.state,'session-trials/.quality/batches'),files=await readdir(batches);
  assert.equal(files.length,1,'preview writes nothing');
  await assert.rejects(appendUsageObservation({...options,yes:true,digest:'0'.repeat(64)}),/stale/);
  const result=await appendUsageObservation({...options,yes:true,digest:preview.digest,now:at(10)}),path=join(batches,`${result.receipt.id}.json`),bytes=await readFile(path);
  const replay=await appendUsageObservation({...options,yes:true,digest:preview.digest,now:at(20)});assert.equal(replay.recovered,true);assert.deepEqual(await readFile(path),bytes);
  const after=await qualityOperation({...w,action:'inspect'});assert.equal(after.bundle.episodes[0].usage.length,1);assert.equal(JSON.stringify(after.bundle.episodes[0].attempts[0]),attempt);assert.equal(report(after.bundle.episodes[0]).totals.tokens.total,100);
  const rewrite=structuredClone(after.bundle.episodes[0]);rewrite.previousDigest=rewrite.digest;rewrite.source.id='acme-drop-usage';rewrite.usage=[];
  await assert.rejects(qualityOperation({...w,action:'collect',inputBundle:acmeQualityBundle([sealRecord(rewrite)])}),/prior usage/);
  assert.deepEqual(await readdir(join(w.state,'session-trials')),['.quality'],'no second telemetry store');
});


test('late charge evidence refines unknown cost while known observed invoices remain immutable',()=>{
  const unknown=observation('cost',{cost:{currency:'USD',kind:'unknown',amount:null,basisDigest:null,priceDate:null}});
  const invoice=observation('cost',{revision:2,previousDigest:unknown.digest,observedAt:at(2)});
  const r=report(episode([unknown,invoice]));assert.equal(r.totals.costs[0].total,1);assert.equal(r.coverage.billingVerified,false);
  assert.match(r.coverage.provenance,/not independently authenticated/);
  const rewrite=observation('cost',{revision:3,previousDigest:invoice.digest,observedAt:at(3),cost:{...invoice.cost,amount:2}});
  assert.throws(()=>report(episode([unknown,invoice,rewrite])),/observed charge cannot/);
});

test('unbound account aliases never add to a known subtotal',()=>{
  const first=observation('aliased',{funding:{kind:'person',principalId:'alice',accountId:null}});
  const second=observation('aliased',{funding:first.funding,source:{...first.source,id:h('second-import')}});
  const r=report(episode([first,second]));assert.equal(r.totals.tokens.total,null);assert.equal(r.totals.tokens.knownSubtotal,0);assert.equal(r.totals.tokens.observed,0);
  assert.ok(r.measurements.every(m=>m.weight===null&&m.attribution==='unbound-nonadditive'));
});

test('private-only attempts and episodes expose no identifiers, model, stage or state in a shared projection',()=>{
  const hidden=acmeQualityEpisode('private-episode-sentinel');hidden.evaluations=[];
  hidden.attempts=[{...hidden.attempts[0],id:'private-attempt-sentinel',stage:'planning',status:'aborted'}];
  hidden.usage=[observation('private',{attemptId:'private-attempt-sentinel',visibility:'personal',actorId:'bob',model:'model-private-sentinel'})];
  const r=report(sealRecord(hidden));assert.deepEqual(r.attempts,[]);assert.deepEqual(r.measurements,[]);assert.equal(r.coverage.expectedAttempts,null);
  assert.doesNotMatch(JSON.stringify(r),/private-episode-sentinel|private-attempt-sentinel|model-private-sentinel|planning|aborted|bob/);
  assert.deepEqual(r.coverage.gaps,[{code:'restricted-usage'}]);
  const owner=report(sealRecord(hidden),{shared:false,actorId:'bob'});assert.equal(owner.attempts[0].id,'private-attempt-sentinel');
  const missing=structuredClone(hidden);delete missing.usage;
  assert.doesNotMatch(JSON.stringify(report(sealRecord(missing))),/private-episode-sentinel|private-attempt-sentinel|planning|aborted/);
});

test('global parent/leaf allocation reconciliation happens before PR filtering',()=>{
  const leaf=observation('leaf',{attribution:{repositoryId:102,prs:[{number:1,weight:1}],commits:[],evidenceDigest:QUALITY_HASH}});
  const parent=observation('parent',{counter:{...leaf.counter,mode:'parent',requestIds:[h('leaf'),h('unobserved-child')],includesChildren:'yes'},tokens:{input:160,output:40,cacheRead:60,cacheWrite:20,reasoning:10,tokens:200},attribution:{repositoryId:102,prs:[{number:2,weight:1}],commits:[],evidenceDigest:QUALITY_HASH}});
  for(const pr of [null,{repositoryId:102,number:1},{repositoryId:102,number:2}]) {
    const r=report(episode([leaf,parent]),{pr});assert.equal(r.totals.tokens.total,null);assert.equal(r.totals.tokens.knownSubtotal,0);assert.ok(r.coverage.gaps.some(g=>g.code==='overlap-allocation-conflict'));
  }
});

test('parent charge mismatch and unbounded session overlap cannot become complete usage',()=>{
  const one=observation('one'),two=observation('two');
  const parent=observation('parent',{counter:{...one.counter,mode:'parent',requestIds:[h('one'),h('two')],includesChildren:'yes'},tokens:{input:160,output:40,cacheRead:60,cacheWrite:20,reasoning:10,tokens:200},cost:{...one.cost,amount:3}});
  const mismatch=report(episode([one,two,parent]));assert.equal(mismatch.totals.costs[0].total,null);assert.equal(mismatch.totals.costs[0].knownSubtotal,2);assert.ok(mismatch.coverage.gaps.some(g=>g.code==='aggregate-cost-reconciliation'));
  for(const cost of [{...one.cost,kind:'estimate',priceDate:'2026-10-30'},{currency:'USD',kind:'unknown',amount:null,basisDigest:null,priceDate:null}]) {
    const mixed=report(episode([observation('one',{cost}),observation('two',{cost}),parent]));
    assert.equal(mixed.coverage.state,'partial');assert.ok(mixed.coverage.gaps.some(g=>g.code==='aggregate-cost-coverage'));assert.ok(mixed.totals.costs.every(c=>c.total===null));
  }
  const cumulative=observation('cumulative',{counter:{...one.counter,mode:'cumulative',requestIds:[],includesChildren:'no'}});
  const r=report(episode([one,cumulative]));assert.equal(r.totals.tokens.total,null);assert.equal(r.totals.tokens.knownSubtotal,100);assert.ok(r.coverage.gaps.some(g=>g.code==='unresolved-counter-overlap'));
});


test('PR mapping requires trusted caller binding; supplied numeric identities cannot join projects',()=>{
  const e=episode([observation()]),pr={repositoryId:102,number:1};
  const unverified=report(e,{pr,repositoryBindings:[]});
  assert.equal(unverified.totals.tokens.total,null);assert.equal(unverified.totals.tokens.knownSubtotal,0);
  assert.ok(unverified.coverage.gaps.some(g=>g.code==='repository-binding-unverified'));
  assert.equal(unverified.measurements[0].attribution,'unverified-pr-association');
  assert.equal(unverified.measurements[0].weight,null);
  const wrong=report(e,{pr,repositoryBindings:[{project:'acme/widget',repositoryId:103}]});
  assert.equal(wrong.totals.tokens.knownSubtotal,0);assert.equal(wrong.measurements.length,0);
  assert.ok(wrong.coverage.gaps.some(g=>g.code==='repository-binding-mismatch'));
  const other=structuredClone(e);other.id='acme-other-task';other.project='Acme/other';other.source.id='acme-other-source';
  other.usage=[observation('other-request')];
  const conflict=report([e,sealRecord(other)],{projects:['acme/widget','acme/other'],repositoryBindings:[{project:'acme/widget',repositoryId:102},{project:'acme/other',repositoryId:103}],pr});
  assert.equal(conflict.totals.tokens.knownSubtotal,0);assert.equal(conflict.totals.tokens.total,null);
  assert.ok(conflict.coverage.gaps.some(g=>g.code==='repository-binding-conflict'));
  assert.equal(conflict.measurements.length,0);
  assert.equal(report(e,{pr}).measurements[0].repositoryBinding,'adapter-bound');
});


test('partially observed children bound containing token and cost totals without treating missing fields as zero',()=>{
  const one=observation('one'),two=observation('two');
  const parent=(count,cost,requests=['one','unobserved'])=>observation('parent',{counter:{...one.counter,mode:'parent',requestIds:requests.map(h),includesChildren:'yes'},tokens:{input:count*.8,output:count*.2,cacheRead:count*.3,cacheWrite:count*.1,reasoning:Math.floor(count*.05),tokens:count},cost:{...one.cost,amount:cost}});
  const tooSmall=report(episode([one,parent(50,.5)]));
  assert.equal(tooSmall.totals.tokens.total,null);assert.equal(tooSmall.totals.costs[0].total,null);assert.equal(tooSmall.coverage.state,'partial');
  for(const code of ['aggregate-reconciliation','aggregate-cost-reconciliation'])assert.ok(tooSmall.coverage.gaps.some(g=>g.code===code));
  const multiple=report(episode([one,two,parent(160,1.5,['one','two','unobserved'])]));
  for(const code of ['aggregate-reconciliation','aggregate-cost-reconciliation'])assert.ok(multiple.coverage.gaps.some(g=>g.code===code),'sum of disjoint leaves, not only individual comparisons');
  assert.equal(multiple.totals.tokens.total,null);assert.equal(multiple.totals.costs[0].total,null);
  const missingLeaf=observation('one',{tokens:{...one.tokens,input:null,tokens:null},cost:{currency:'USD',kind:'unknown',amount:null,basisDigest:null,priceDate:null}});
  const knownParent=parent(200,2);
  const missing=report(episode([missingLeaf,knownParent]));
  assert.ok(!missing.coverage.gaps.some(g=>g.code.startsWith('aggregate-')));assert.equal(missing.totals.tokens.total,200);
  const missingParent=observation('parent',{...knownParent,tokens:{...knownParent.tokens,input:null,tokens:null},cost:missingLeaf.cost});
  const partial=report(episode([one,missingParent]));
  assert.ok(!partial.coverage.gaps.some(g=>g.code.startsWith('aggregate-')));assert.equal(partial.totals.tokens.total,null);assert.equal(partial.totals.costs[0].total,null);
  const someKnown=report(episode([one,observation('two',{tokens:missingLeaf.tokens,cost:missingLeaf.cost}),parent(50,.5,['one','two','unobserved'])]));
  for(const code of ['aggregate-reconciliation','aggregate-cost-reconciliation'])assert.ok(someKnown.coverage.gaps.some(g=>g.code===code),'missing sibling does not erase a known lower bound');
});
