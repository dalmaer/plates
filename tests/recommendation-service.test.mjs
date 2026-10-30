import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecommendationService } from '../lib/web/recommendation-service.mjs';
import { validateModelPolicy } from '../lib/web/model-policy.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { runsUiHarness } from './helpers/web-runs-ui.mjs';
import { recommendationServiceFixture } from './helpers/recommendation-service.mjs';
const service=f=>createRecommendationService(f.config,f.options);
test('trusted composition remains private without checked effective-policy selection context',async()=>{
 const f=recommendationServiceFixture();await assert.rejects(service(f).read(f.request()),{code:'recommendation_selection_context_unavailable'});
 assert.equal(f.state.fundingReads,2);assert.equal(f.state.qualityReads,2);assert.equal(f.state.policyReads,2);
});
test('default service and foreign funding, unsupported provider or unauthorized models cannot attest choices',async()=>{
 const f=recommendationServiceFixture();await assert.rejects(createRecommendationService(f.config).read(f.request()),/unavailable/);
 for(const mutate of [f=>f.binding.ownerActorId=2,f=>f.binding.grant.state='revoked',f=>f.profile.candidates[0].agent.provider='codex',f=>f.binding.grant.models=['other']]){
  const f=recommendationServiceFixture();mutate(f);await assert.rejects(service(f).read(f.request()),{code:'recommendation_selection_context_unavailable'});assert.equal(f.state.capacityReads,0);
 }
});
test('full effective policies including restrictive review reproduction cannot bypass missing selection context',async()=>{
 const restrictions=[p=>p.taskClass='review',p=>p.requirements.privacy='no-provider-retention',p=>p.requirements.independentReview=true,p=>p.requirements.minimumContext=2000000,p=>{p.capacity.reservePercent=99;p.capacity.reentryPercent=99;},p=>p.capacity.maxAgeSeconds=1,p=>p.capacity.cooldownSeconds=86400,p=>p.capacity.reentryPercent=99,p=>p.limits.maxInputTokens=1,p=>p.limits.maxOutputTokens=1,p=>{for(const k of ['attemptMicroUsd','taskMicroUsd','workspaceMicroUsd','projectMicroUsd','connectionMicroUsd'])p.limits[k]=1;},p=>p.limits.concurrency=1];
 for(const mutate of [...restrictions,p=>restrictions.forEach(change=>change(p))]){const f=recommendationServiceFixture();mutate(f.model.policy);validateModelPolicy(f.model.policy);await assert.rejects(service(f).read(f.request()),{code:'recommendation_selection_context_unavailable'});}
 const project=recommendationServiceFixture();Object.assign(project.model.policy,{projectId:project.project.id,repoId:project.project.repoId});validateModelPolicy(project.model.policy,true);await assert.rejects(service(project).read(project.request()),{code:'recommendation_selection_context_unavailable'});
 project.model.policy.repoId++;await assert.rejects(service(project).read(project.request()),{code:'recommendation_service_unavailable'});
 for(const mutate of [p=>delete p.requirements,p=>p.candidates=[]]){const f=recommendationServiceFixture();mutate(f.model.policy);await assert.rejects(service(f).read(f.request()),{code:'invalid_model_policy'});assert.equal(f.state.fundingReads,0);}
});
test('policy, funding, connection and quality changes during a read prevent final attestation',async()=>{
 for(const mutate of [f=>f.model.digest='f'.repeat(64),f=>f.binding.grant.state='revoked',f=>f.binding.connectionGeneration++,f=>f.input.qualityBundle.episodes=[]]){
  const f=recommendationServiceFixture(),original=f.options.capacityReader;f.options.capacityReader=async(...args)=>{const r=await original(...args);mutate(f);return r;};
  if(mutate.toString().includes('qualityBundle')){let reads=0;const originalQuality=f.options.qualityReader;f.options.qualityReader=async(...args)=>{const result=await originalQuality(...args);if(++reads===1)f.input.qualityBundle.episodes=[];return result;};f.options.capacityReader=original;}
  await assert.rejects(service(f).read(f.request()));
 }
 const f=recommendationServiceFixture();let calls=0;await assert.rejects(service(f).read({...f.request(),reauthorize:async()=>({...f.access,userId:++calls===2?2:1})}),/unavailable/);
});
test('capacity provenance is constrained to the funded account and model, and partial evidence cannot imply availability',async()=>{
 const f=recommendationServiceFixture();f.input.observations[0].identity.account='another';await assert.rejects(service(f).read(f.request()),/unavailable/);
 const partial=recommendationServiceFixture();partial.options.capacityReader=async()=>({observations:partial.input.observations,gaps:['window-missing']});await assert.rejects(service(partial).read(partial.request()),{code:'recommendation_selection_context_unavailable'});
});
test('actual authenticated HTTP service supplies current actor/session to the optional service and keeps sets/default unavailable',async()=>{
 const h=await runsUiHarness({projectCount:1});h.state.now=Date.parse('2026-10-30T01:00:00.000Z');const signed=await h.login(),f=recommendationServiceFixture({config:h.config,project:h.projects[0]}),seen=[];
 const composed=service(f),http=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now,recommendationService:{read:async context=>{seen.push(context);return composed.read(context);}}});
 const get=path=>http(h.request(path,{cookie:signed.cookie}));
 const response=await get('/api/projects/studio/activity');assert.equal(response.status,200);const model=(await response.json()).personalRecommendation;assert.equal(model.recommendation.state,'unavailable');assert.ok(JSON.stringify(model).includes('authenticated_recommendation_unavailable'));assert.equal(seen.length,1);assert.equal(seen[0].access.userId,1);assert.equal(typeof seen[0].token,'string');assert.ok(seen[0].signal instanceof AbortSignal);assert.doesNotMatch(JSON.stringify(model),/PRIVATE|accountId|connectionId/);
 await get('/api/activity');assert.equal(seen.length,1);assert.ok((await get('/api/projects/studio/activity?actorId=2')).status>=400);assert.equal(seen.length,1);
 const no=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now});assert.equal((await(await no(h.request('/api/projects/studio/activity',{cookie:signed.cookie}))).json()).personalRecommendation.recommendation.state,'unavailable');
});
