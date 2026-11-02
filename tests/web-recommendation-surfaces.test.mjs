import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebService } from '../lib/web/server.mjs';
import { runsUiHarness } from './helpers/web-runs-ui.mjs';
import { recommendationFixture, attestRecommendation } from './helpers/recommendation-surfaces.mjs';
const envelope=input=>({version:1,...recommendationFixture(input)});
async function fixture(){const h=await runsUiHarness({projectCount:1});h.state.now=Date.parse('2026-10-30T01:00:00.000Z');return h;}
test('project-only capacity shows current authenticated actor with separate windows and no set aggregation',async()=>{
  const h=await fixture();h.config.ownerIds=[1,2];h.state.members=[1,2];h.config.projectSets=[{id:'active',name:'Active',projects:['studio']},{id:'research',name:'Research',projects:['studio']}];
  const alice=await h.login();h.state.userId=2;const bob=await h.login(),seen=[];
  const service=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now,recommendationReader:async input=>{seen.push(input);return envelope(input);}});
  const get=(path,cookie)=>service(h.request(path,{cookie}));
  for(const set of ['active','research']){const response=await get('/api/activity?set='+set,bob.cookie);assert.equal(response.status,200);assert.equal((await response.json()).personalRecommendation,null);}assert.equal(seen.length,0);
  let response=await get('/api/projects/studio/activity',bob.cookie);assert.equal(response.status,200);let m=(await response.json()).personalRecommendation;assert.equal(m.recommendation.state,'choices-available');assert.equal(m.capacity.pools.length,1);assert.equal(m.capacity.pools[0].measurement.remaining,80);assert.equal(m.capacity.pools[0].maxAgeSeconds,300);assert.equal(m.candidates[0].quality.samples,3);assert.doesNotMatch(JSON.stringify(m),/PRIVATE|accountId|actorId|connectionId|poolId/);assert.equal(m.recommendation.executed,false);
  h.state.userId=1;response=await get('/api/projects/studio/activity?days=1&status=failed',alice.cookie);m=(await response.json()).personalRecommendation;assert.equal(m.recommendation.state,'choices-available');assert.deepEqual(seen.map(s=>s.actorId),['2','1']);
  const html=await(await get('/projects/studio/activity',alice.cookie)).text();assert.match(html,/Your agent choices/);assert.match(html,/maximum age 300 seconds/);assert.match(html,/Historical matching latency/);assert.doesNotMatch(html,/PRIVATE/);
  const before=seen.length;for(const path of ['/api/projects/studio/activity?actorId=2','/api/projects/other/activity'])assert.ok((await get(path,alice.cookie)).status>=400);assert.equal(seen.length,before);
});
test('hosted recommendation rejects forged scope, stale authority, unknown/reset/exhausted capacity and revoked access',async()=>{
  const h=await fixture(),signed=await h.login();const get=service=>service(h.request('/api/projects/studio/activity',{cookie:signed.cookie}));
  let response=await get(h.service);const absent=(await response.json()).personalRecommendation;assert.equal(absent.recommendation.state,'unavailable');assert.deepEqual(absent.scope,{projectId:'studio',repositoryId:102,project:'acme/studio',visibility:'personal'});assert.equal(absent.task,null);assert.deepEqual(absent.capacity.pools,[]);
  for(const change of [v=>v.authority.actorId='2',v=>v.input.actorId='2',v=>v.authority.repositoryId=999,v=>v.authority.expiresAt=v.authority.checkedAt,v=>v.authority.checkedAt='2026-10-29T01:00:00.000Z',v=>v.authority.expiresAt='2027-01-01T00:00:00.000Z',v=>v.input.qualityBundle={invalid:true}]) {
    const service=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now,recommendationReader:async input=>{const v=envelope(input);change(v);return v;}});response=await get(service);assert.equal(response.status,200);const m=(await response.json()).personalRecommendation;assert.equal(m.recommendation.state,'unavailable');assert.deepEqual(m.candidates,[]);assert.doesNotMatch(JSON.stringify(m),/PRIVATE/);
  }
  for(const change of [o=>o.measurement={used:100,remaining:0,limit:100},o=>o.measurement.remaining=null,o=>o.window.resetAt='2026-10-30T01:00:00.000Z',o=>o.observedAt='2026-10-30T00:50:00.000Z']) {
    const service=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now,recommendationReader:async input=>{const v=envelope(input);change(v.input.observations[0]);v.authority=attestRecommendation(v.input,input.now);return v;}});const m=(await(await get(service)).json()).personalRecommendation;assert.equal(m.candidates[0].status,'unavailable');assert.equal(m.recommendation.suggestedCandidateId,null);
  }
  let calls=0;const revoked=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now,recommendationReader:async input=>{calls++;h.state.members=[];return envelope(input);}});response=await get(revoked);assert.equal(calls,1);assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/PRIVATE|choices-available/);
});

test('capacity expiring during the adapter read or final authorization cannot leave an available choice',async()=>{
  for(const phase of ['adapter','authorization']) {
    const h=await fixture(),signed=await h.login();let armed=false;
    const service=createWebService(h.config,{now:()=>h.state.now,fetcher:async(url,options)=>{const response=await h.fetcher(url,options);if(phase==='authorization'&&armed&&new URL(url).pathname==='/user'){h.state.now+=2000;armed=false;}return response;},recommendationReader:async input=>{
      const v=envelope(input);v.input.observations[0].window.resetAt=new Date(h.state.now+1000).toISOString();v.authority=attestRecommendation(v.input,input.now);
      if(phase==='adapter')h.state.now+=2000;else armed=true;return v;
    }});
    const response=await service(h.request('/api/projects/studio/activity',{cookie:signed.cookie}));assert.equal(response.status,200);const model=(await response.json()).personalRecommendation;assert.notEqual(model.recommendation.state,'choices-available',phase);assert.equal(model.recommendation.suggestedCandidateId,null);assert.ok(model.candidates.every(c=>c.status!=='available'));
    if(phase==='authorization')assert.equal(armed,false,'clock advanced during final authorization');
  }
});
