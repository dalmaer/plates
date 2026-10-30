import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { runsUiHarness } from './helpers/web-runs-ui.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { hostDigest, validateHostReport, hostReportObservation } from '../lib/web/host-observation-model.mjs';
import { createHostObservations } from '../lib/web/host-observations.mjs';
import { hostIdentity, hostSourceBinding, hostObservationReport } from '../lib/routines/host-report.mjs';
import { webConfig } from '../lib/web/config.mjs';
const SOURCE=hostSourceBinding('acme-local-host','acme-selected-source','codex');
async function fixture(t) {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon;create role authenticated;create role service_role;');
  await db.exec(await readFile(new URL('../lib/web/migrations/017-host-observations.sql',import.meta.url),'utf8'));
  const h=await runsUiHarness({projectCount:1});h.state.now=Date.now();
  const proof=new Date(h.state.now-1000).toISOString();h.config.hostObservations={enabled:true,verifiedAt:proof,restoreReconciledAt:proof};
  const calls=[],controls={lostApply:false,after:null,afterUpstream:null};
  const fetcher=async(url,options={})=>{
    if(new URL(url).pathname==='/rest/v1/rpc/plates_host_observation_rpc') {
      const p=JSON.parse(options.body);calls.push(p);
      const result=await db.query('select public.plates_host_observation_rpc($1,$2,$3,$4,$5::jsonb) value',[p.p_operation,p.p_instance,p.p_actor,p.p_id,JSON.stringify(p.p_data)]);
      if(controls.lostApply&&p.p_operation==='apply'){controls.lostApply=false;throw Error('synthetic lost response');}
      const value=result.rows[0].value;
      if(controls.after)await controls.after(p,value);
      return Response.json(value);
    }
    const response=await h.fetcher(url,options);if(controls.afterUpstream)await controls.afterUpstream(url,options);return response;
  };
  const service=createWebService(h.config,{fetcher,now:()=>h.state.now});
  const signed=await h.login();
  const post=(path,data,{cookie=signed.cookie,csrf=true,headers={}}={})=>service(new Request(h.config.origin+path,{method:'POST',headers:{'Content-Type':'application/json',origin:h.config.origin,...(cookie?{cookie}:{}),...headers},body:JSON.stringify({...data,...(csrf?{csrf:signed.session.csrf}:{})})}));
  const enroll=async()=>{
    const input={hostId:hostIdentity('acme-local-host'),sources:[SOURCE],projects:[{id:'studio',repoId:102}],expiresAt:new Date(h.state.now+3600000).toISOString()};
    const response=await post('/api/host-observations/enrollment/preview',input);assert.equal(response.status,200,await response.clone().text());
    const preview=await response.json();assert.equal(preview.credentialIncluded,false);assert.doesNotMatch(JSON.stringify(preview),/sessionRef|token|acme-local-host|acme-selected-source/);
    const applied=await post('/api/host-observations/enrollment/apply',{previewId:preview.previewId,digest:preview.digest});assert.equal(applied.status,200,await applied.clone().text());
    return {preview,applied:await applied.json()};
  };
  const report=(grantId,sequence=1)=>({version:1,grantId,sequence,project:{id:'studio',repoId:102},observedAt:new Date(h.state.now).toISOString(),expiresAt:new Date(h.state.now+240000).toISOString(),routines:[{id:'a'.repeat(64),sourceId:SOURCE.id,source:'codex',status:'active',scheduleKind:'manual'}],attempts:[{id:'b'.repeat(64),routineId:'a'.repeat(64),sourceId:SOURCE.id,source:'codex',state:'succeeded',startedAt:new Date(h.state.now-2000).toISOString(),completedAt:new Date(h.state.now-1000).toISOString()}],coverage:{state:'complete-page',gaps:[]}});
  const upload=(token,value,headers={})=>service(new Request(h.config.origin+'/api/host-observations/report',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...headers},body:JSON.stringify({report:value,digest:hostDigest(value)})}));
  const history=()=>service(h.request('/api/projects/studio/activity',{cookie:signed.cookie}));
  return {...h,db,fetcher,service,signed,post,enroll,report,upload,history,calls,controls};
}

test('real SQL/store/HTTP enrollment, typed report and history preserve private metadata and actor scope',async t=>{
  const h=await fixture(t),{preview,applied}=await h.enroll(),r=h.report(preview.previewId);
  const response=await h.upload(applied.credential.token,r);assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).execution,false);
  const before=h.state.records.values().find(r=>r.actor==='1').expires;
  const repeated=await h.upload(applied.credential.token,r);assert.equal(repeated.status,200);assert.equal((await repeated.json()).replayed,true);
  assert.equal(h.state.records.values().find(r=>r.actor==='1').expires,before,'observer does not renew browser idle lifetime');
  const history=await h.history();assert.equal(history.status,200,await history.clone().text());const observation=(await history.json()).observations[0];
  assert.equal(observation.routines.length,1);assert.equal(observation.attempts.length,1);assert.equal(observation.coverage.state,'partial');assert.ok(observation.coverage.gaps.includes('host_provider_state_unverified'));assert.equal(observation.usage,null);assert.deepEqual(observation.actions,[]);
  assert.doesNotMatch(JSON.stringify(observation),new RegExp(`${applied.credential.token}|${SOURCE.id}|acme-local-host|accountId|sessionRef`));
  const raw=(await h.db.query('select value from keel_private.host_observation_grants union all select value from keel_private.host_observation_reports')).rows;
  assert.equal(raw.length,2);for(const row of raw)assert.doesNotMatch(row.value,/codex|studio|succeeded|Bearer|acme-local-host/);
  h.config.ownerIds.push(2);h.state.members=[1,2];h.state.userId=2;const bob=await h.login();
  const other=await h.service(h.request('/api/projects/studio/activity',{cookie:bob.cookie}));assert.equal(other.status,200);assert.equal((await other.json()).observations[0].routines.length,0);
});

test('atomic sequence checks accept one concurrent report and reject altered replay, gaps and revoked tokens',async t=>{
  const h=await fixture(t),{preview,applied}=await h.enroll(),token=applied.credential.token,r=h.report(preview.previewId);
  assert.equal((await h.upload(token,r)).status,200);
  const altered=structuredClone(r);altered.routines[0].status='paused';assert.equal((await h.upload(token,altered)).status,409);
  assert.equal((await h.upload(token,{...r,sequence:3})).status,409);
  const left={...r,sequence:2},right=structuredClone(left);right.routines[0].status='paused';
  assert.deepEqual((await Promise.all([h.upload(token,left),h.upload(token,right)])).map(r=>r.status).sort(),[200,409]);
  assert.equal((await h.db.query('select last_sequence from keel_private.host_observation_grants')).rows[0].last_sequence,2);
  assert.equal((await h.post('/api/host-observations/revoke',{grantId:preview.previewId,digest:'f'.repeat(64)})).status,409);
  assert.equal((await h.post('/api/host-observations/revoke',{grantId:preview.previewId,digest:preview.digest})).status,200);
  assert.equal((await h.post('/api/host-observations/revoke',{grantId:preview.previewId,digest:preview.digest})).status,200);
  assert.equal((await h.upload(token,{...r,sequence:3})).status,401);
  assert.equal((await(await h.history()).json()).observations[0].routines.length,0);
});

test('exact enrollment retry recovers the same bearer after a lost SQL response; no new grant or authority',async t=>{
  const h=await fixture(t),input={hostId:hostIdentity('acme-local-host'),sources:[SOURCE],projects:[{id:'studio',repoId:102}],expiresAt:new Date(h.state.now+3600000).toISOString()};
  const preview=await(await h.post('/api/host-observations/enrollment/preview',input)).json();
  const body={previewId:preview.previewId,digest:preview.digest};h.controls.lostApply=true;
  assert.equal((await h.post('/api/host-observations/enrollment/apply',body)).status,503);
  const one=await(await h.post('/api/host-observations/enrollment/apply',body)).json(),two=await(await h.post('/api/host-observations/enrollment/apply',body)).json();
  assert.equal(one.credential.token,two.credential.token);assert.equal((await h.db.query('select count(*)::int n from keel_private.host_observation_grants')).rows[0].n,1);
  assert.equal((await h.post('/api/host-observations/enrollment/apply',{...body,digest:'f'.repeat(64)})).status,409);
});

test('mixed scope, raw private text, unknown fields, stale metadata and browser cookies are rejected before report persistence',async t=>{
  const h=await fixture(t),{preview,applied}=await h.enroll(),r=h.report(preview.previewId);
  const changes=[v=>v.project.repoId=999,v=>v.routines[0].source='launchd',v=>v.routines[0].sourceId='f'.repeat(64),v=>v.routines[0].name='/private/acme/task',v=>v.quota=100,v=>v.attempts[0].recordRef='/private/acme/transcript',v=>v.coverage.gaps=['raw-private-error'],v=>v.observedAt=new Date(h.state.now-300001).toISOString(),v=>v.expiresAt=new Date(h.state.now).toISOString(),v=>v.attempts[0].routineId='f'.repeat(64)];
  for(const change of changes){const value=structuredClone(r);change(value);const response=await h.upload(applied.credential.token,value);assert.equal(response.status,400,await response.clone().text());assert.doesNotMatch(await response.text(),/private\/acme/);}
  for(const headers of [{cookie:h.signed.cookie},{origin:h.config.origin}])assert.equal((await h.upload(applied.credential.token,r,headers)).status,401);
  assert.equal((await h.upload('a'.repeat(43),r)).status,401);
  assert.equal((await h.db.query('select count(*)::int n from keel_private.host_observation_reports')).rows[0].n,0);
  assert.equal((await h.post('/api/host-observations/enrollment/preview',{hostId:hostIdentity('x'),sources:[SOURCE],projects:[{id:'studio',repoId:999}],expiresAt:new Date(h.state.now+10000).toISOString()})).status,409);
  assert.equal((await h.post('/api/host-observations/enrollment/apply',{previewId:preview.previewId,digest:preview.digest},{csrf:false})).status,403);
});

test('off switch, restore epoch, current ownership and session revocation fence reports and reads',async t=>{
  const h=await fixture(t),{preview,applied}=await h.enroll(),r=h.report(preview.previewId),token=applied.credential.token;
  assert.equal((await h.upload(token,r)).status,200);
  h.config.hostObservations.enabled=false;const before=h.calls.length;assert.equal((await h.upload(token,r)).status,403);assert.equal(h.calls.length,before);h.config.hostObservations.enabled=true;
  h.state.members=[];assert.ok((await h.upload(token,{...r,sequence:2})).status>=400);h.state.members=[1];
  h.config.ownerIds=[];assert.ok((await h.upload(token,{...r,sequence:2})).status>=400);h.config.ownerIds=[1];
  const start=new Date(h.state.now).toISOString();h.config.recovery={epoch:'a'.repeat(32),startedAt:start,reconciledAt:null};assert.equal((await h.upload(token,r)).status,503);
  h.config.recovery.reconciledAt=start;h.config.hostObservations.restoreReconciledAt=start;assert.equal((await h.upload(token,r)).status,401,'old epoch token remains unusable after reopening');
  delete h.config.recovery;
  for(const [key] of h.state.records)if(key.startsWith('session:'))h.state.records.delete(key);
  assert.equal((await h.upload(token,{...r,sequence:2})).status,401);
  assert.equal((await h.db.query('select last_sequence from keel_private.host_observation_grants')).rows[0].last_sequence,1);
});

test('expiry and revoke during async history reads suppress previously read observations',async t=>{
  const h=await fixture(t),{preview,applied}=await h.enroll(),r=h.report(preview.previewId);assert.equal((await h.upload(applied.credential.token,r)).status,200);
  h.controls.after=async p=>{if(p.p_operation==='list'){h.controls.after=null;await h.db.query("update keel_private.host_observation_grants set state='revoked'");}};
  let response=await h.history();assert.equal(response.status,200);assert.equal((await response.json()).observations[0].routines.length,0);
  await h.db.query("update keel_private.host_observation_grants set state='active'");
  h.controls.after=async p=>{if(p.p_operation==='list'){h.controls.after=null;h.state.now+=240001;}};
  response=await h.history();assert.equal(response.status,200);assert.equal((await response.json()).observations[0].routines.length,0);
});

test('host normalization redacts local private fields before the transport schema',()=>{
  const observedAt=new Date().toISOString(),scope={actorId:'1',workspaceId:'acme',hostId:'acme-local-host',projectId:'studio',accountId:'PRIVATE-account'};
  const observation={observedAt,routines:[{id:'a'.repeat(64),sourceId:'acme-selected-source',source:'codex',scope,name:'PRIVATE task /Users/acme',status:'active',schedule:{kind:'manual',raw:'PRIVATE'},recordRef:'PRIVATE'}],attempts:[],coverage:{state:'partial',gaps:[{code:'source-failed',message:'PRIVATE exception'}]}};
  const result=hostObservationReport(observation,{grantId:'c'.repeat(64),sequence:1,project:{id:'studio',repoId:102},scope,expiresAt:new Date(Date.parse(observedAt)+60000).toISOString()});
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|acme-selected-source|acme-local-host|accountId|name|raw|recordRef/);assert.equal(result.routines[0].sourceId,SOURCE.id);
  observation.routines[0].scope={...scope,projectId:'other'};assert.throws(()=>hostObservationReport(observation,{grantId:'c'.repeat(64),sequence:1,project:{id:'studio',repoId:102},scope,expiresAt:new Date(Date.parse(observedAt)+60000).toISOString()}),/scope/);
});

test('migration grants service RPC only, keeps ciphertext tables private and optional config fail-closed',async t=>{
  const h=await fixture(t);
  const privileges=(await h.db.query("select has_function_privilege('anon','public.plates_host_observation_rpc(text,text,text,text,jsonb)','execute') anon,has_function_privilege('authenticated','public.plates_host_observation_rpc(text,text,text,text,jsonb)','execute') authenticated,has_function_privilege('service_role','public.plates_host_observation_rpc(text,text,text,text,jsonb)','execute') service,has_table_privilege('service_role','keel_private.host_observation_grants','select') direct")).rows[0];
  assert.deepEqual(privileges,{anon:false,authenticated:false,service:true,direct:false});
  const {encryptionKey,connectionEncryptionKey,clientSecret,storageUrl,storageKey,...input}=h.config;
  const secrets={encryptionKey:encryptionKey.toString('base64'),clientSecret,storageUrl,storageKey};
  assert.equal(webConfig(input,secrets).hostObservations.enabled,true);
  assert.throws(()=>webConfig({...input,hostObservations:{enabled:true,verifiedAt:null,restoreReconciledAt:null}},secrets));
  assert.throws(()=>webConfig({...input,hostObservations:{...input.hostObservations,execution:true}},secrets));
});

test('freshest grant reports replace old snapshots; same-host concurrent conflicting identities remain gaps',async t=>{
  const h=await fixture(t),one=await h.enroll(),two=await h.enroll();
  const first=h.report(one.preview.previewId),second=h.report(two.preview.previewId);second.routines[0].status='paused';
  assert.equal((await h.upload(one.applied.credential.token,first)).status,200);assert.equal((await h.upload(two.applied.credential.token,second)).status,200);
  let model=(await(await h.history()).json()).observations[0];assert.equal(model.routines.length,0);assert.equal(model.attempts.length,0);assert.ok(model.coverage.gaps.includes('host_identity_conflict'));
  h.state.now+=1;const fresh=h.report(one.preview.previewId,2);fresh.routines[0].status='disabled';assert.equal((await h.upload(one.applied.credential.token,fresh)).status,200);
  model=(await(await h.history()).json()).observations[0];assert.equal(model.routines.length,1);assert.equal(model.routines[0].status,'disabled');assert.equal(model.attempts.length,1);
  assert.equal((await h.db.query('select count(*)::int n from keel_private.host_observation_reports')).rows[0].n,2,'one freshest snapshot per grant/project');
});

test('source identities separate identical native hashes and a wrong resolved actor or abort cannot authorize reads',async t=>{
  const h=await fixture(t),{preview,applied}=await h.enroll(),r=h.report(preview.previewId),other=hostSourceBinding('acme-local-host','acme-other-source','codex');
  const grant={...preview.grant,sources:[SOURCE,other]};
  r.routines.push({...r.routines[0],sourceId:other.id});r.attempts.push({...r.attempts[0],sourceId:other.id});
  validateHostReport(r,grant,h.state.now);const observation=hostReportObservation(r,grant);
  assert.equal(new Set(observation.routines.map(r=>r.id)).size,2);assert.equal(new Set(observation.attempts.map(a=>a.id)).size,2);
  assert.notEqual(observation.attempts[0].routineId,observation.attempts[1].routineId);
  const valid=h.report(preview.previewId);assert.equal((await h.upload(applied.credential.token,valid)).status,200);
  const bridge=createHostObservations({...h.config,ownerIds:[1,2]},{fetcher:h.fetcher,now:()=>h.state.now,resolveInitiator:async()=>({access:{userId:2,workspace:{id:'acme'},projects:h.projects}})});
  await assert.rejects(bridge.ingest(applied.credential.token,{report:{...valid,sequence:2},digest:hostDigest({...valid,sequence:2})}),/host_scope_denied/);
  const signal=AbortSignal.abort();await assert.rejects(bridge.reader({actorId:'1',workspaceId:'acme',projectId:'studio',repoId:102,project:h.projects[0],signal}),/abort/i);
});

test('a second valid viewer session cannot keep revoked initiating-session reports visible at final authorization',async t=>{
  const h=await fixture(t),{preview,applied}=await h.enroll(),r=h.report(preview.previewId);assert.equal((await h.upload(applied.credential.token,r)).status,200);
  const originalKey=[...h.state.records.keys()].find(key=>key.startsWith('session:')),viewer=await h.login();let armed=false,users=0;
  h.controls.after=async p=>{if(p.p_operation==='list'){armed=true;h.controls.after=null;}};
  h.controls.afterUpstream=async url=>{if(armed&&new URL(url).pathname==='/user'&&++users===2)h.state.records.delete(originalKey);};
  const response=await h.service(h.request('/api/projects/studio/activity',{cookie:viewer.cookie}));assert.equal(response.status,200,await response.clone().text());
  assert.equal(users,2,'source authorization then final viewer authorization');assert.equal((await response.json()).observations[0].routines.length,0);
});

test('bounded multi-host merge remains partial and reports omitted inventory rather than implying full coverage',async t=>{
  const h=await fixture(t);
  for(let n=0;n<3;n++) {
    const {preview,applied}=await h.enroll(),r=h.report(preview.previewId);r.attempts=[];
    r.routines=Array.from({length:200},(_,i)=>({...r.routines[0],id:hostDigest(['acme-routine',n,i])}));
    assert.equal((await h.upload(applied.credential.token,r)).status,200);
  }
  const response=await h.history();assert.equal(response.status,200,await response.clone().text());const observation=(await response.json()).observations[0];
  assert.equal(observation.routines.length,500);assert.equal(observation.coverage.state,'partial');assert.ok(observation.coverage.gaps.includes('host_merge_truncated'));
});
