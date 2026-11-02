import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebService } from '../lib/web/server.mjs';
import { readManagementObservation } from '../lib/web/observations.mjs';
import { runsUiHarness } from './helpers/web-runs-ui.mjs';
function envelope(input) {
  const {actorId,workspaceId,projectId,repoId,now}=input,scope={actorId,workspaceId,projectId,repoId};
  return {schema:1,scope,observedAt:now,expiresAt:new Date(Date.parse(now)+60000).toISOString(),observation:{schema:1,observedAt:now,coverage:{state:'complete-page',gaps:[]},reports:[],routines:[{id:'PRIVATE-NATIVE',name:'Acme schedule',source:'declared',scope:{...scope,accountId:'PRIVATE-ACCOUNT'},schedule:{kind:'cron'},status:'declared',observedAt:now}],attempts:[]},usage:{schemaVersion:1,kind:'quality-usage-report',scope:{projects:[input.project.repo],pr:null,visibility:'project'},coverage:{state:'partial',expectedAttempts:2,observedAttempts:1,gaps:[{code:'usage-missing'}]},totals:{...Object.fromEntries(['input','output','cacheRead','cacheWrite','reasoning','tokens'].map(k=>[k,{knownSubtotal:100,total:null,complete:false}])),costs:[]},attempts:[],measurements:[{funding:{accountId:'PRIVATE-ACCOUNT'}}]}};
}
test('authenticated existing history shows scoped observations and lifecycle usage independent of date filters',async()=>{
  const h=await runsUiHarness({projectCount:2}),signed=await h.login(),seen=[];
  h.config.projectSets=[{id:'active',name:'Active',projects:['studio']},{id:'research',name:'Research',projects:['studio']}];
  const service=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now,observationReader:async input=>{seen.push(input);return envelope(input);}});
  const get=path=>service(h.request(path,{cookie:signed.cookie}));
  for(const path of ['/api/activity?set=active&days=1','/api/activity?set=research&days=90']) {
    const response=await get(path);assert.equal(response.status,200,await response.clone().text());const model=await response.json();assert.equal(model.observations.length,1);assert.equal(model.observations[0].usage.totals.tokens.knownSubtotal,100);assert.equal(model.observations[0].usage.totals.tokens.total,null);assert.doesNotMatch(JSON.stringify(model.observations),/PRIVATE|accountId|actorId|measurements/);
  }
  assert.deepEqual(seen.map(v=>v.projectId),['studio','studio']);assert.ok(seen.every(v=>v.actorId==='1'&&v.workspaceId==='acme'&&!('days' in v)));
  const html=await(await get('/projects/studio/routines')).text();assert.match(html,/Acme schedule/);assert.match(html,/Billing not independently verified/);assert.doesNotMatch(html,/PRIVATE/);
  const prior=seen.length;for(const path of ['/api/projects/secret/activity','/api/activity?actorId=2','/api/activity?set=missing'])assert.ok((await get(path)).status>=400);assert.equal(seen.length,prior);
  assert.notEqual((await service(h.request('/api/activity'))).status,200);assert.equal(seen.length,prior);
});
test('disabled transport, actor mismatch, stale envelope and revoked access never widen private metadata',async()=>{
  const h=await runsUiHarness({projectCount:1}),signed=await h.login();
  let response=await h.service(h.request('/api/projects/studio/activity',{cookie:signed.cookie}));let model=await response.json();assert.match(model.observations[0].coverage.gaps.join(),/transport_unavailable/);
  for(const change of [v=>v.scope.actorId='2',v=>v.observation.routines[0].scope.actorId='2',v=>v.expiresAt='2020-01-01T00:00:00Z',v=>v.usage.scope.visibility='personal',v=>v.usage.scope.projects=['acme/other'],v=>v.scope.repoId=999,v=>v.observation.routines[0].scope.projectId=null,v=>v.observation.attempts={},v=>v.observation.coverage=null,v=>v.usage.totals.tokens.complete=true,v=>v.observation.routines[0].name={secret:'PRIVATE'}]) {
    const service=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now,observationReader:async input=>{const v=envelope(input);change(v);return v;}});
    response=await service(h.request('/api/projects/studio/activity',{cookie:signed.cookie}));model=await response.json();assert.deepEqual(model.observations[0].routines,[]);assert.equal(model.observations[0].usage,null);assert.doesNotMatch(JSON.stringify(model.observations),/PRIVATE/);
  }
  let calls=0;const service=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now,observationReader:async input=>{calls++;h.state.members=[];return envelope(input);}});
  response=await service(h.request('/api/projects/studio/activity',{cookie:signed.cookie}));assert.equal(calls,1);assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/Acme schedule|PRIVATE/);
});
test('numeric pin intersection is checked before invoking the hosted reader',async()=>{
  let calls=0;const project={id:'studio',repoId:102,repo:'acme/studio'},access={userId:1,workspace:{id:'acme'},projects:[project]};
  const result=await readManagementObservation({reader:async()=>{calls++;},access,project,config:{projectRepoIds:{studio:999}},now:Date.now()});assert.equal(calls,0);assert.equal(result.usage,null);
});

test('two authorized people on one project get separate freshly authenticated reader context',async()=>{
  const h=await runsUiHarness({projectCount:1});h.config.ownerIds=[1,2];h.state.members=[1,2];
  const alice=await h.login();h.state.userId=2;const bob=await h.login();const seen=[];
  const service=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now,observationReader:async input=>{seen.push(input.actorId);return envelope(input);}});
  let response=await service(h.request('/api/projects/studio/activity',{cookie:bob.cookie}));assert.equal(response.status,200);assert.doesNotMatch(JSON.stringify((await response.json()).observations),/actorId|PRIVATE/);
  h.state.userId=1;response=await service(h.request('/api/projects/studio/activity',{cookie:alice.cookie}));assert.equal(response.status,200);assert.deepEqual(seen,['2','1']);
});

test('local attempts follow Activity window, outcome and routine filters while lifecycle usage keeps its full scope',async()=>{
  const h=await runsUiHarness({projectCount:1}),signed=await h.login();
  const service=createWebService(h.config,{fetcher:h.fetcher,now:()=>h.state.now,observationReader:async input=>{
    const v=envelope(input),at=days=>new Date(Date.parse(input.now)-days*86400000).toISOString();
    v.usage.scope.pr={repositoryId:102,number:7};v.usage.scope.actorId='PRIVATE-ACTOR';
    v.observation.window={since:at(30),until:input.now};
    v.observation.attempts=[['old-failure','failed',at(10)],['recent-failure','failed',at(.5)],['old-active','running',at(10)],['undated','succeeded',null],['recent-success','succeeded',at(.5)]].map(([id,state,startedAt])=>({id,routineId:'PRIVATE-NATIVE',source:'declared',scope:{...v.scope,accountId:'PRIVATE-ACCOUNT'},state,startedAt,completedAt:null}));return v;
  }});
  const get=async query=>{const r=await service(h.request('/api/projects/studio/activity'+query,{cookie:signed.cookie}));assert.equal(r.status,200,await r.clone().text());return (await r.json()).observations[0];};
  const all=await get('?days=30');assert.equal(all.attempts.length,5);assert.equal(all.sourceWindow.since,new Date(h.state.now-30*86400000).toISOString());
  const success=await get('?days=1&status=succeeded');assert.equal(success.attempts.length,2);assert.ok(success.attempts.every(a=>a.state==='succeeded'));assert.ok(success.coverage.gaps.includes('attempt_time_unavailable'));assert.deepEqual(success.usage,all.usage);
  const failed=await get('?days=1&status=failed');assert.equal(failed.attempts.length,1);assert.equal(failed.attempts[0].startedAt,new Date(h.state.now-.5*86400000).toISOString());
  const active=await get('?days=1&status=running');assert.equal(active.attempts.length,1,'same active-work exception as existing history');
  const routine=await get('?days=30&routine=night');assert.equal(routine.attempts.length,0);assert.equal(routine.routines.length,0);assert.deepEqual(routine.usage,all.usage);
  assert.deepEqual(all.usage.scope,{projects:['acme/studio'],pr:{repositoryId:102,number:7},visibility:'project'});assert.doesNotMatch(JSON.stringify(all.usage),/PRIVATE/);
  const html=await(await service(h.request('/projects/studio/activity?days=1&status=succeeded',{cookie:signed.cookie}))).text();assert.match(html,/Source window:/);assert.match(html,/Display window:/);assert.match(html,/acme\/studio · PR #7 \(repository 102\) · project visibility/);assert.doesNotMatch(html,/PRIVATE/);
});
