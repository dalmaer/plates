import test from 'node:test';
import assert from 'node:assert/strict';
import { agentRecommendations } from '../lib/agent-recommendations.mjs';
import { sealRecord, fingerprint } from '../lib/evaluation-records.mjs';
import { acmeQualityEpisode, acmeQualityBundle, QUALITY_HASH } from './helpers/agent-quality.mjs';
import { observation } from './helpers/web-capacity.mjs';

const NOW='2026-10-30T01:00:00.000Z', EXPIRY='2026-10-30T01:04:00.000Z';
function fixture() {
  const episodes=Array.from({length:3},(_,n)=>{const e=structuredClone(acmeQualityEpisode(`acme-task-${n}`));e.attempts[0].agent.provider='codex';e.attempts[0].agent.model='acme-model';return sealRecord(e);});
  const candidate={id:'acme-choice',actorId:'alice',workspaceId:'acme',projectId:'widget',repositoryId:102,policyDigest:QUALITY_HASH,provider:'codex',model:'acme-model',accountId:'acme-alice',poolId:'acme-pool',fundingKind:'person',connectionId:'acme-connection',connectionGeneration:1,expiresAt:EXPIRY,stages:['coding','review'],capabilities:['acme-tools'],requiredWindows:[{kind:'subscription',unit:'percent',durationMinutes:300}],agent:{...episodes[0].attempts[0].agent}};
  const capacity=observation({identity:{account:'acme-alice',workspace:null,scope:'account',provenance:'authenticated-reporter'},pool:{id:'acme-pool',provenance:'authenticated-reporter'},observedAt:NOW,expiresAt:EXPIRY,window:{durationMinutes:300,resetAt:'2026-10-30T06:00:00.000Z'}});
  const input={actorId:'alice',workspaceId:'acme',projectId:'widget',repositoryId:102,project:'Acme/widget',policyDigest:QUALITY_HASH,task:{stage:'coding',family:'feature',specialty:'frontend',difficultyBand:'medium',risk:'medium',requiredCapabilities:['acme-tools'],independentFromProvider:null},candidates:[candidate],observations:[capacity],qualityBundle:acmeQualityBundle(episodes),preferenceOrder:[]};
  return {input,authority:attest(input)};
}
function attest(input) {
  const {actorId,workspaceId,projectId,repositoryId,project,policyDigest}=input;
  return {actorId,workspaceId,projectId,repositoryId,project,policyDigest,checkedAt:NOW,expiresAt:EXPIRY,candidateDigests:input.candidates.map(fingerprint),capacityDigests:input.observations.map(fingerprint),qualityEpisodeDigests:input.qualityBundle.episodes.map(e=>e.digest),accountBindings:[...new Map(input.candidates.map(c=>[c.accountId,{provider:c.provider,accountId:c.accountId,actorId:c.actorId}])).values()],connections:[...new Map(input.candidates.map(c=>[c.connectionId,{id:c.connectionId,generation:c.connectionGeneration,expiresAt:EXPIRY}])).values()]};
}
const run=(f,options={})=>agentRecommendations(f.input,{authority:f.authority,now:NOW,...options});
const reasons=r=>r.candidates[0].reasons;

test('current caller authority, all windows and real AQ cohorts produce advisory choices without execution',()=>{
  const f=fixture(),before=structuredClone(f),r=run(f);
  assert.equal(r.candidates[0].status,'available');assert.equal(r.authorization,'caller-attested');assert.equal(r.candidates[0].quality.state,'descriptive');
  assert.equal(r.candidates[0].quality.samples,3);assert.equal(r.candidates[0].quality.distribution.mean,3);assert.equal(r.candidates[0].latency.mean,2000);assert.equal(r.candidates[0].cost.observedUsd.mean,2);
  assert.equal(r.recommendation.suggestedCandidateId,'acme-choice');assert.equal(r.recommendation.automaticRouting,false);assert.equal(r.recommendation.reserved,false);assert.equal(r.recommendation.executed,false);
  assert.equal(r.candidates[0].quality.superiority,null);assert.equal(r.task.stage,'coding');assert.equal(r.candidates[0].configuration.agentBuild,'1.0.0');assert.match(r.candidates[0].configuration.digest,/^[a-f0-9]{64}$/);assert.equal(Object.hasOwn(r.capacity,'total'),false);assert.deepEqual(f,before);
  assert.doesNotMatch(JSON.stringify(r),/acme-human|acme-task-0|checkpointDigest|promptDigest|acme-evaluation/);
});

test('source claims and supplied hashes do not authenticate local JSON',()=>{
  const f=fixture();for(const authority of [null,{...f.authority,actorId:'bob'},{...f.authority,workspaceId:'other'},{...f.authority,repositoryId:103},{...f.authority,expiresAt:NOW}]) {
    const r=run(f,{authority});assert.equal(r.recommendation.suggestedCandidateId,null);assert.equal(r.authorization,'unverified');assert.deepEqual(r.capacity.pools,[]);assert.equal(r.candidates[0].funding,null);assert.equal(r.candidates[0].quality.samples,0);
  }
  assert.equal(run(f,{authority:{...f.authority,capacityDigests:[]}}).candidates[0].status,'unavailable');
  assert.throws(()=>agentRecommendations({...f.input,authority:f.authority},{now:NOW}),/invalid input scope/);
});

test('two contributors on one plate never reveal or borrow the other contributor account, quota or quality',()=>{
  const f=fixture(),bob={...f.input.candidates[0],id:'bob-private-choice',actorId:'bob',accountId:'bob-private-account',connectionId:'bob-private-connection'};
  f.input.candidates.push(bob);f.input.observations.push({...f.input.observations[0],identity:{...f.input.observations[0].identity,account:bob.accountId},measurement:{used:0,remaining:100,limit:100}});
  const foreign=structuredClone(acmeQualityEpisode('bob-private-task'));foreign.project='Acme/private';f.input.qualityBundle.episodes.push(sealRecord(foreign));
  f.authority=attest(f.input);f.input.observations[0].measurement={used:100,remaining:0,limit:100};f.authority.capacityDigests=f.input.observations.map(fingerprint);
  const r=run(f);assert.equal(r.candidates.length,1);assert.equal(r.recommendation.state,'wait');assert.equal(r.recommendation.suggestedCandidateId,null);assert.doesNotMatch(JSON.stringify(r),/bob|private-task|Acme\/private/);
  f.authority.accountBindings[0].actorId='bob';assert.ok(reasons(run(f)).includes('account-identity-unverified'));
});

test('policy, connection generation, expiry and unsupported organization grants refuse availability',()=>{
  for(const change of [c=>c.policyDigest='b'.repeat(64),c=>c.connectionGeneration=2,c=>c.expiresAt=NOW,c=>c.fundingKind='organization',c=>c.accountId=null,c=>c.poolId=null]){
    const f=fixture();change(f.input.candidates[0]);f.authority.candidateDigests=f.input.candidates.map(fingerprint);
    const r=run(f);assert.equal(r.candidates[0].status,'unavailable');assert.equal(r.recommendation.suggestedCandidateId,null);assert.deepEqual(r.capacity.pools,[]);
  }
  const f=fixture();f.authority.connections[0].expiresAt=NOW;assert.ok(reasons(run(f)).includes('connection-unverified-or-changed'));
});

test('same account reached through multiple choices or source aliases has one pool per window',()=>{
  const f=fixture();f.input.candidates.push({...f.input.candidates[0],id:'acme-second-choice'});
  f.input.observations.push({...f.input.observations[0],source:{kind:'local-reporter',id:'acme-other-set'}});f.authority=attest(f.input);
  const r=run(f);assert.equal(r.capacity.pools.length,1);assert.deepEqual(r.candidates[0].windowIds,r.candidates[1].windowIds);assert.equal(r.capacity.pools[0].measurement.remaining,80);assert.equal(r.recommendation.suggestedCandidateId,null);
  f.input.preferenceOrder=['acme-second-choice'];assert.equal(run(f).recommendation.suggestedCandidateId,'acme-second-choice');
});

test('stale, reset, conflicting, unknown and missing independent windows cannot become available',()=>{
  for(const change of [o=>o.expiresAt=NOW,o=>o.window.resetAt=NOW,o=>o.identity.account=null,o=>o.identity.provenance='unknown',o=>o.models.provenance='unknown',o=>o.source.kind='owner-claim',o=>o.measurement.remaining=null,o=>o.nonAdditive=true]){
    const f=fixture();change(f.input.observations[0]);f.authority.capacityDigests=f.input.observations.map(fingerprint);assert.equal(run(f).candidates[0].status,'unavailable');
  }
  const conflict=fixture();conflict.input.observations.push({...conflict.input.observations[0],measurement:{used:40,remaining:60,limit:100}});conflict.authority=attest(conflict.input);assert.ok(reasons(run(conflict)).includes('capacity-conflict'));
  const missing=fixture();missing.input.candidates[0].requiredWindows.push({kind:'subscription',unit:'percent',durationMinutes:10080});missing.authority=attest(missing.input);assert.ok(reasons(run(missing)).includes('capacity-window-missing'));
  missing.input.observations.push({...missing.input.observations[0],window:{durationMinutes:10080,resetAt:'2026-11-06T00:00:00.000Z'},measurement:{used:100,remaining:0,limit:100}});missing.authority=attest(missing.input);const r=run(missing);assert.equal(r.capacity.pools.length,2);assert.ok(reasons(r).includes('capacity-exhausted'));assert.equal(r.recommendation.state,'wait');
});

test('quality is unknown for sparse, mismatched model/build/configuration, role, task or stale observations',()=>{
  const changes=[f=>f.input.qualityBundle.episodes=f.input.qualityBundle.episodes.slice(0,1),f=>f.input.candidates[0].agent.agentBuild='2.0',f=>f.input.candidates[0].agent.toolsDigest='b'.repeat(64),f=>{f.input.candidates[0].model='acme-new';f.input.candidates[0].agent.model='acme-new';},f=>f.input.task.stage='review',f=>f.input.task.specialty='backend',f=>f.input.task.risk='high'];
  for(const change of changes){const f=fixture();change(f);f.authority=attest(f.input);assert.equal(run(f).candidates[0].quality.state,'unknown');assert.equal(run(f).candidates[0].quality.superiority,null);}
  const f=fixture(),future='2026-12-01T00:00:00.000Z';f.authority.checkedAt=future;f.authority.expiresAt='2026-12-01T00:04:00.000Z';f.authority.connections[0].expiresAt=f.authority.expiresAt;f.input.candidates[0].expiresAt=f.authority.expiresAt;f.authority.candidateDigests=f.input.candidates.map(fingerprint);
  assert.ok(run(f,{now:future}).candidates[0].quality.uncertainty.includes('quality-stale-or-undated'));
});

test('task capability and review independence remain separate refusals; quality never overrides capacity',()=>{
  const f=fixture();f.input.task.requiredCapabilities.push('unsupported-isolation');assert.ok(reasons(run(f)).includes('task-capability-unsupported'));
  f.input.task.requiredCapabilities=[];f.input.task.stage='review';f.input.task.independentFromProvider='codex';assert.ok(reasons(run(f)).includes('review-independence-unsupported'));
  const high=fixture();high.input.observations[0].measurement={used:100,remaining:0,limit:100};high.authority=attest(high.input);const r=run(high);assert.equal(r.candidates[0].quality.state,'descriptive');assert.equal(r.recommendation.suggestedCandidateId,null);
});

test('missing latency/cost and private unapproved quality remain unknown without leaking metadata',()=>{
  const f=fixture();f.input.qualityBundle.episodes=f.input.qualityBundle.episodes.map(original=>{const e=structuredClone(original);e.attempts[0].resources={...e.attempts[0].resources,currencyUsd:null,currencySource:'unknown',wallMs:null};return sealRecord(e);});f.authority=attest(f.input);
  const r=run(f);assert.equal(r.candidates[0].cost.observedUsd.mean,null);assert.equal(r.candidates[0].latency.mean,null);assert.equal(r.candidates[0].quality.samples,3);
  f.authority.qualityEpisodeDigests=[];assert.equal(run(f).candidates[0].quality.samples,0);
});


test('five-minute freshness bounds cannot be extended by future expiry or stale fallback',()=>{
  const old=fixture();old.input.observations[0].observedAt='2026-10-30T00:50:00.000Z';old.input.observations[0].expiresAt='2026-11-01T00:00:00.000Z';old.authority=attest(old.input);
  const r=run(old);assert.ok(reasons(r).includes('capacity-stale'));assert.equal(r.capacity.pools[0].freshness,'stale');assert.equal(r.recommendation.suggestedCandidateId,null);
  const future=fixture();future.authority.expiresAt='2026-11-01T00:00:00.000Z';assert.equal(run(future).authorization,'unverified');
  future.authority=attest(future.input);future.authority.checkedAt='2026-10-30T01:01:00.000Z';assert.equal(run(future).authorization,'unverified');
  const fallback=fixture();fallback.input.observations.push({...fallback.input.observations[0],observedAt:'2026-10-30T00:59:00.000Z'});fallback.input.observations[0].measurement.remaining=null;fallback.authority=attest(fallback.input);assert.equal(run(fallback).candidates[0].status,'unavailable');
  const boundary=fixture();boundary.input.observations[0].observedAt='2026-10-30T00:55:00.000Z';boundary.authority=attest(boundary.input);assert.ok(reasons(run(boundary)).includes('capacity-stale'));
});


test('fresh reset observations replace only completed same-duration cycles, never independent or ambiguous windows',()=>{
  const f=fixture(),old={...f.input.observations[0],observedAt:'2026-10-30T00:58:00.000Z',expiresAt:'2026-10-30T01:03:00.000Z',window:{durationMinutes:300,resetAt:'2026-10-30T00:59:00.000Z'},measurement:{used:100,remaining:0,limit:100}};
  f.input.observations.unshift(old);f.authority=attest(f.input);
  const r=run(f);assert.equal(r.candidates[0].status,'available');assert.equal(r.capacity.pools.length,1);assert.equal(r.capacity.pools[0].measurement.remaining,80);
  old.window.durationMinutes=10080;f.authority=attest(f.input);assert.equal(run(f).candidates[0].status,'unavailable');
  old.window.durationMinutes=300;old.window.resetAt='2026-10-30T01:01:00.000Z';f.authority=attest(f.input);assert.equal(run(f).candidates[0].status,'unavailable');
  old.window.resetAt='2026-10-30T00:59:00.000Z';f.input.observations[1].measurement.remaining=null;f.authority=attest(f.input);assert.equal(run(f).candidates[0].status,'unavailable');
});

test('verified capacity for another model is inapplicable while unknown model scope cannot be ignored',()=>{
  const f=fixture(),other={...f.input.observations[0],models:{ids:['acme-other-model'],provenance:'authenticated-reporter'},window:{durationMinutes:10080,resetAt:'2026-11-06T00:00:00.000Z'},measurement:{used:100,remaining:0,limit:100}};
  f.input.observations.push(other);f.authority=attest(f.input);assert.equal(run(f).candidates[0].status,'available');assert.equal(run(f).capacity.pools.length,1);
  other.models={ids:[],provenance:'unknown'};f.authority=attest(f.input);assert.equal(run(f).candidates[0].status,'unavailable');
  const unverified=run(f,{authority:null});assert.deepEqual(unverified.authorityFreshness,{checkedAt:null,expiresAt:null,maxAgeSeconds:300});assert.equal(run(f).authorityFreshness.checkedAt,NOW);
});
