// Synthetic Acme callers and provider observations; real PostgreSQL RPCs,
// production stores, encryption, funding checks and model service. No live calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createConnectionStore} from '../lib/web/connection-store.mjs';
import {createModelStore} from '../lib/web/model-store.mjs';
import {createModelTasks} from '../lib/web/model-tasks.mjs';
import {fundingBroker,fundingDigest,fundingPin,fundingMetadata,personalDescriptor,checkFundingBinding,sharedFundingSummary} from '../lib/web/funding.mjs';
import {hash} from '../lib/web/common.mjs';
import {modelHarness,sourceInput,token} from './helpers/web-model-tasks.mjs';
const H=s=>hash(s),stamp=n=>new Date(n).toISOString();
async function world(t){
 const h=await modelHarness(),db=new PGlite();t.after(()=>db.close());
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
 // Inject only the clock dependency while executing the real migration bodies.
 // Both service and SQL time stay fixed until a test advances a known boundary.
 await db.exec(`CREATE FUNCTION public.acme_test_now() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$ SELECT current_setting('acme.test_now')::timestamptz $$;`);
 const syncClock=()=>db.query("SELECT set_config('acme.test_now',$1,false)",[stamp(h.state.now)]);
 await syncClock();
 async function advanceTime(ms){h.state.now+=ms;await syncClock();}
 const directory=new URL('../lib/web/migrations/',import.meta.url);
 for(const file of (await readdir(directory)).filter(f=>f.endsWith('.sql')&&Number(f.slice(0,3))<=19).sort())await db.exec((await readFile(new URL(file,directory),'utf8')).replaceAll('clock_timestamp()','public.acme_test_now()'));
 const config={...h.config,projectRepoIds:{...h.config.projectRepoIds,other:103},personalFunding:{enabled:true,verifiedAt:stamp(h.state.now-1000),restoreReconciledAt:stamp(h.state.now-1000),brokerScope:fundingBroker(h.config)}};
 const calls=[];let loseNext=false,capacityTtl=60000,beforeBegin=null;
 async function fetcher(url,options={}){
  if(new URL(url).pathname.startsWith('/rest/v1/rpc/')){
   const name=new URL(url).pathname.split('/').at(-1);assert.match(name,/^(keel|plates)_[a-z_]+$/);const p=JSON.parse(options.body),entries=Object.entries(p);calls.push({name,p});
   if(p.p_operation==='begin'&&beforeBegin){const hook=beforeBegin;beforeBegin=null;await hook(p);}
   const output=await db.query(`SELECT public.${name}(${entries.map(([k],i)=>`${k} => $${i+1}`).join(',')}) value`,entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v));
   if(loseNext&&p.p_operation==='reserve'){loseNext=false;throw Error('Acme lost reservation response');}return Response.json(output.rows[0].value);
  }
  return h.fetcher(url,options);
 }
 const store=createModelStore(config,fetcher),vault=createConnectionStore(config,fetcher,{now:()=>h.state.now}),descriptor=JSON.parse(h.workspace.files['connections/acme-openai.json']),connectionPolicyDigest=hash(h.workspace.files['connections/acme-openai.json']),modelPolicyDigest=hash(JSON.stringify([hash(h.workspace.files['routing/workspace.json']),null]));
 const project={id:'studio',repoId:102,repo:'acme/studio'},other={id:'other',repoId:103,repo:'acme/other'};
 function binding(actor=1,account=`acme-account-${actor}`){return {version:1,ownerActorId:actor,provider:'openai',accountIdentity:{account,workspace:null,scope:'account'},poolId:'acme-provider-pool',brokerScope:store.scope,connectionGeneration:1,connectionPolicyDigest,grant:{id:H(`acme-grant-${actor}-${account}`),version:1,state:'active',projects:[project,other].map(p=>({id:p.id,repoId:p.repoId,modelPolicyDigest})),models:['acme-model-2026-10-21'],expiresAt:stamp(h.state.now+3600000)},evidence:{digest:H('synthetic-provider-attestation'),observedAt:stamp(h.state.now),expiresAt:stamp(h.state.now+240000)}};}
 const context=(b,p=project)=>({actorId:b.ownerActorId,project:p,modelPolicyDigest,connectionPolicyDigest,connectionGeneration:1,brokerScope:store.scope,model:b.grant.models[0],now:h.state.now});
 const observation=b=>({provider:'openai',identity:{...b.accountIdentity,provenance:'authenticated-reporter'},pool:{id:b.poolId,provenance:'authenticated-reporter'},kind:'api-rate',unit:'tokens',models:{ids:b.grant.models,provenance:'authenticated-reporter'},measurement:{used:0,remaining:100000,limit:100000},window:{durationMinutes:60,resetAt:stamp(h.state.now+3600000)},observedAt:stamp(h.state.now),expiresAt:stamp(h.state.now+60000),source:{kind:'local-reporter',id:'synthetic-acme-attestation'},confidence:'observed',nonAdditive:false});
 const fundingSource=async scope=>({version:1,actorId:scope.actorId,brokerScope:scope.binding.brokerScope,projectId:scope.project.id,repositoryId:scope.project.repoId,bindingDigest:fundingDigest(scope.binding),checkedAt:stamp(h.state.now),expiresAt:stamp(h.state.now+capacityTtl),observations:[{...observation(scope.binding),expiresAt:stamp(h.state.now+capacityTtl)}]});
 async function enroll(b,d=descriptor){return vault.personalPut(d,{actor:b.ownerActorId,binding:b,requestId:H(`enroll-${d.id}-${b.ownerActorId}`),key:'fake-acme-personal-provider-key',health:{synthetic:true},expectedVersion:0});}
 async function reservation(b,p=project,suffix='one',d=descriptor,remaining=3000){
  const id=H(`attempt-${suffix}`),task=H(`task-${suffix}`),quote=H(`quote-${suffix}`),digest=H(`digest-${suffix}`),tuple=[b.provider,b.accountIdentity.scope,b.accountIdentity.account,b.accountIdentity.workspace,b.poolId,'api-rate','tokens',60,stamp(h.state.now+3600000)];
  const funding=fundingPin(b,context(b,p),[{poolId:JSON.stringify(tuple),unit:'tokens',amount:2000,remaining,limit:remaining,observedAt:stamp(h.state.now),resetAt:tuple[8]}],{inputTokens:1000,maxOutputTokens:1000});
  const owned=personalDescriptor(d,b.ownerActorId),credential={scope:hash(JSON.stringify(['connection-vault-v1',config.appId,config.installationId,config.workspace.id,config.workspace.repoId])),connection:hash(JSON.stringify([owned.id,owned.secretRef])),policy:connectionPolicyDigest,version:1};
  const q={id:quote,digest,ceilingMicroUsd:3000,inputTokens:1000,maxOutputTokens:1000,model:b.grant.models[0]},preview={taskId:task,stage:1,actorId:b.ownerActorId,selection:{selected:{connectionVersion:1,connectionPolicyDigest,connectionId:d.id,model:b.grant.models[0]}}};
  await store.save('quote',quote,b.ownerActorId,p,q);
  const data={task,stage:1,connection:store.connectionFor(d.id),digest,quote,fence:H(`fence-${suffix}`),value:{id,taskId:task,stage:1,actorId:b.ownerActorId,project:p,digest,preview,quote:q,evidence:{inputMicroUsdPerMillion:1000000,outputMicroUsdPerMillion:2000000},taskAllowance:100000,funding},ceiling:3000,taskLimit:100000,workspaceLimit:1000000,projectLimit:1000000,connectionLimit:1000000,concurrency:20,windows:funding.windows.map(w=>({pool:hash(JSON.stringify(w.tuple)),amount:w.amount,available:w.available,expiresAt:w.expiresAt})),credential,funding};
  return {id,actor:b.ownerActorId,project:p,data,apply:()=>store.reserve(id,b.ownerActorId,p,data)};
 }
 return {...h,config,db,fetcher,calls,store,vault,descriptor,project,other,binding,context,observation,enroll,reservation,lose:()=>{loseNext=true;},setCapacityTtl:ms=>{capacityTtl=ms;},advanceTime,beforeBegin:hook=>{beforeBegin=hook;},models:createModelTasks(config,{fetcher,now:()=>h.state.now,fundingSource})};
}

test('personal ownership is explicit and encrypted; legacy mutation actor never becomes ownership',async t=>{
 const w=await world(t),b=w.binding();
 await w.enroll(b);assert.deepEqual((await w.vault.readFunding(w.descriptor,1)).binding,b);assert.equal(await w.vault.readFunding(w.descriptor,2),null);
 const rows=(await w.db.query('select funding_metadata,funding_value,value from keel_private.connection_credentials')).rows;assert.doesNotMatch(rows[0].funding_value,/acme-account|fake-acme|ownerActorId/);assert.doesNotMatch(rows[0].value,/fake-acme/);
 const owned=personalDescriptor(w.descriptor,1);assert.equal(await w.vault.metadata(owned),null);await assert.rejects(w.vault.readKey(owned,{policyDigest:b.connectionPolicyDigest,expectedVersion:1}),/connection_generation_changed/);
 assert.deepEqual(sharedFundingSummary(fundingPin(b,w.context(b),[{poolId:JSON.stringify(['openai','account',b.accountIdentity.account,null,b.poolId,'api-rate','tokens',60,stamp(w.state.now+3600000)]),unit:'tokens',amount:2,remaining:3,observedAt:stamp(w.state.now)}],{inputTokens:1,maxOutputTokens:1})),{kind:'person',label:'Personal account'});
 const another={...w.descriptor,id:'acme-legacy'};await w.vault.put(personalDescriptor(another,1),{expectedVersion:0,policyDigest:b.connectionPolicyDigest,requestId:H('legacy'),actor:1,key:'fake-acme-legacy-provider-key',health:{synthetic:true}});
 await assert.rejects(w.enroll(b,another),/funding_conflict/);assert.equal((await w.vault.metadata(personalDescriptor(another,1))).version,1);
 await assert.rejects(createConnectionStore({...w.config,personalFunding:{...w.config.personalFunding,enabled:false}},w.fetcher).readFunding(w.descriptor,1),/personal_funding_disabled/);
});

test('one canonical pool contends atomically across actors, projects, aliases and sets',async t=>{
 const w=await world(t),a=w.binding(1,'acme-shared-verified-account'),b=w.binding(2,'acme-shared-verified-account'),alias={...w.descriptor,id:'acme-alias'};
 await w.enroll(a);await w.enroll(b,alias);const first=await w.reservation(a,w.project,'set-one'),second=await w.reservation(b,w.other,'set-two',alias);
 const results=await Promise.all([first.apply(),second.apply()]);assert.equal(results.filter(r=>r?.changed).length,1);assert.equal(results.filter(r=>r?.conflict==='capacity').length,1);
 assert.equal((await w.db.query('select count(*)::int n from keel_private.model_reservations')).rows[0].n,1);
 assert.equal(first.data.windows[0].pool,second.data.windows[0].pool);
});

test('revocation, changed grants and expired identity stop begin without changing the original reservation',async t=>{
 const w=await world(t),b=w.binding();await w.enroll(b);const plan=await w.reservation(b),r=await plan.apply();
 const revoked={...b,grant:{...b.grant,version:2,state:'revoked'}};await w.vault.updateFunding(w.descriptor,{actor:1,binding:revoked,requestId:H('revoke'),expectedVersion:1});
 assert.deepEqual(await w.store.transition('begin',r.row),{conflict:'funding'});assert.deepEqual((await w.store.read(plan.id,1,w.project)).row.value.funding,plan.data.funding);
 assert.equal((await w.db.query('select count(*)::int n from keel_private.model_reservations')).rows[0].n,1);
 const retry=await plan.apply();assert.equal(retry.changed,false);assert.equal(retry.row.state,'reserved');
 for(const mutate of [x=>x.evidence.expiresAt=stamp(w.state.now-1),x=>x.evidence.observedAt=stamp(w.state.now+1),x=>x.grant.projects[0].modelPolicyDigest=H('other-policy')]){const bad=structuredClone(b);mutate(bad);assert.throws(()=>checkFundingBinding(bad,w.context(bad)),/funding_/);}
});

test('uncertain attempts retain payer and holds; lost reserve response recovers one immutable intent',async t=>{
 const w=await world(t),b=w.binding();await w.enroll(b);const plan=await w.reservation(b);w.lose();await assert.rejects(plan.apply(),/upstream_unavailable/);
 const r=await plan.apply();assert.equal(r.changed,false);const begun=await w.store.transition('begin',r.row);assert.equal(begun.granted,true);
 const uncertain=await w.store.transition('update',begun.row,{state:'uncertain',responseId:null,result:null,actual:null});assert.equal(uncertain.row.value.funding.owner,1);
 const changed={...plan.data,funding:{...plan.data.funding,owner:2}};assert.deepEqual(await w.store.reserve(plan.id,1,w.project,changed),{conflict:'funding'});
 assert.equal((await w.db.query('select count(*)::int n from keel_private.model_attempts')).rows[0].n,1);assert.equal((await w.db.query('select sum(amount)::int n from keel_private.model_reservations')).rows[0].n,2000);
});

test('both RPC aliases reject legacy bypass and malformed funding metadata or null pins',async t=>{
 const w=await world(t),b=w.binding();await w.enroll(b);const plan=await w.reservation(b);const storeCall=async(name,data)=>{const p={p_operation:'reserve',p_scope:w.store.scope,p_id:plan.id,p_actor:1,p_project:w.store.projectFor(w.project),p_data:data};return w.fetcher(`https://acme.supabase.co/rest/v1/rpc/${name}`,{body:JSON.stringify(p)});};
 const encrypted={...plan.data,value:'Acme synthetic encrypted placeholder'};delete encrypted.funding;
 for(const name of ['keel_model_rpc','plates_model_rpc'])await assert.rejects(storeCall(name,encrypted),/personal funding required/);
 for(const key of ['evidenceObservedAt','evidenceExpiresAt','expiresAt','state','owner']){
  await w.db.query(`update keel_private.connection_credentials set funding_metadata=jsonb_set(funding_metadata,$1,'null'::jsonb)`,[[key]]);
  assert.deepEqual(await plan.apply(),{conflict:'funding'});
  await w.db.query('update keel_private.connection_credentials set funding_metadata=$1',[JSON.stringify(fundingMetadata(b))]);
 }
 for(const key of Object.keys(plan.data.funding)){const changed={...plan.data,funding:{...plan.data.funding,[key]:null}};assert.deepEqual(await w.store.reserve(plan.id,1,w.project,changed),{conflict:'funding'});}
 const privileges=await w.db.query("select bool_or(has_function_privilege('service_role',oid,'EXECUTE')) allowed from pg_proc where pronamespace='keel_private'::regnamespace and proname in('model_rpc_v1','connection_rpc_v1','personal_model_rpc','funding_check')");assert.equal(privileges.rows[0].allowed,false);
});

test('real service requires explicit funding choice, reserves through SQL and preserves disabled defaults',async t=>{
 const w=await world(t),b=w.binding();await w.enroll(b);
 await assert.rejects(w.models.prepare(w.access,token,w.project,sourceInput()),/invalid_model_preparation/);
 const p=await w.models.prepare(w.access,token,w.project,{...sourceInput(),fundingConnectionId:w.descriptor.id});assert.equal(p.canCount,true,JSON.stringify({reason:p.reason,selection:p.selection}));assert.equal(p.selection.selected.funding.owner,1);
 const quote=await w.models.quote(w.access,token,w.project,{previewId:p.id,digest:p.digest},{reauthorize:w.reauthorize});
 const run=await w.models.run(w.access,token,w.project,{quoteId:quote.id,digest:quote.digest,requestId:H('service-run')},{reauthorize:w.reauthorize});
 assert.deepEqual(run.funding,{kind:'person',label:'Personal account'});assert.doesNotMatch(JSON.stringify(run),/acme-account|grantVersion|connectionPolicyDigest/);
 assert.equal(w.model.calls.filter(c=>new URL(c.url).pathname==='/v1/responses').length,1);assert.equal((await w.db.query('select count(*)::int n from keel_private.model_reservations')).rows[0].n,1);
 const noAdapter=createModelTasks(w.config,{fetcher:w.fetcher,now:()=>w.state.now});const unavailable=await noAdapter.prepare(w.access,token,w.project,{...sourceInput(),fundingConnectionId:w.descriptor.id});assert.equal(unavailable.canCount,false);
});


test('renewed same-account authorization can retrieve and cancel an original response after identity expiry',async t=>{
 const w=await world(t),b=w.binding();
 await w.enroll(b);const plan=await w.reservation(b),reserved=await plan.apply(),begun=await w.store.transition('begin',reserved.row);
 const responseId='resp_acme_recovery';const queued=await w.store.transition('update',begun.row,{state:'queued',responseId,result:null,actual:null});
 w.model.responses.set(responseId,{model:b.grant.models[0]});
 assert.equal(queued.row.state,'queued');
 await w.advanceTime(6*60000);
 assert.equal(w.state.now-Date.parse(queued.row.created_at),6*60000);
 await assert.rejects(w.vault.readPersonalRecoveryKey(w.descriptor,{actor:1,attemptId:plan.id,attemptScope:w.store.scope,policyDigest:b.connectionPolicyDigest,expectedVersion:1}),/funding_conflict/);
 const renewed={...b,grant:{...b.grant,version:2},evidence:{...b.evidence,observedAt:stamp(w.state.now),expiresAt:stamp(w.state.now+240000)}};
 await w.vault.updateFunding(w.descriptor,{actor:1,binding:renewed,requestId:H('renew'),expectedVersion:1});
 await assert.rejects(w.vault.readPersonalKey(w.descriptor,{actor:1,policyDigest:b.connectionPolicyDigest,expectedVersion:1,funding:plan.data.funding}),/funding_conflict/);
 const original=await w.models.reconcile(w.access,token,w.project,plan.id,{reauthorize:w.reauthorize});assert.equal(original.state,'queued');
 for(const bad of [{actor:2,attemptId:plan.id},{actor:1,attemptId:H('absent')}])await assert.rejects(w.vault.readPersonalRecoveryKey(w.descriptor,{...bad,policyDigest:b.connectionPolicyDigest,expectedVersion:1,attemptScope:w.store.scope}),/funding_conflict/);
 const pending=await w.reservation(renewed,w.other,'no-response',w.descriptor,100000);await pending.apply();await assert.rejects(w.vault.readPersonalRecoveryKey(w.descriptor,{actor:1,attemptId:pending.id,attemptScope:w.store.scope,policyDigest:b.connectionPolicyDigest,expectedVersion:1}),/funding_conflict/);
 const changed={...renewed,accountIdentity:{...renewed.accountIdentity,account:'acme-other-personal-account'},grant:{...renewed.grant,version:3}};
 await w.vault.updateFunding(w.descriptor,{actor:1,binding:changed,requestId:H('different-account'),expectedVersion:1});
 await assert.rejects(w.models.reconcile(w.access,token,w.project,plan.id,{reauthorize:w.reauthorize}),/funding_conflict/);
 const revoked={...renewed,grant:{...renewed.grant,version:4,state:'revoked'}};await w.vault.updateFunding(w.descriptor,{actor:1,binding:revoked,requestId:H('revoke-recovery'),expectedVersion:1});
 await assert.rejects(w.models.cancel(w.access,token,w.project,plan.id,{reauthorize:w.reauthorize}),/model_connection_changed/);
 assert.equal((await w.models.receipt(w.access,token,w.project,plan.id)).state,'queued');
 await w.vault.updateFunding(w.descriptor,{actor:1,binding:{...renewed,grant:{...renewed.grant,version:5}},requestId:H('renew-recovery'),expectedVersion:1});
 const cancelled=await w.models.cancel(w.access,token,w.project,plan.id,{reauthorize:w.reauthorize});assert.equal(cancelled.state,'cancelled');
 assert.deepEqual((await w.store.read(plan.id,1,w.project)).row.value.funding,queued.row.value.funding);assert.equal(w.model.calls.filter(c=>new URL(c.url).pathname==='/v1/responses').length,0);
 await w.vault.updateFunding(w.descriptor,{actor:1,binding:{...renewed,poolId:'acme-other-pool',grant:{...renewed.grant,version:6}},requestId:H('changed-pool'),expectedVersion:1});await assert.rejects(w.vault.readPersonalRecoveryKey(w.descriptor,{actor:1,attemptId:plan.id,attemptScope:w.store.scope,policyDigest:b.connectionPolicyDigest,expectedVersion:1}),/funding_conflict/);
});

test('trusted short expiry bounds actual SQL begin; known refusal releases only an unsent original attempt',async t=>{
 const w=await world(t),b=w.binding();await w.enroll(b);
 const p=await w.models.prepare(w.access,token,w.project,{...sourceInput(),fundingConnectionId:w.descriptor.id});const q=await w.models.quote(w.access,token,w.project,{previewId:p.id,digest:p.digest},{reauthorize:w.reauthorize});
 w.setCapacityTtl(150);let beginReached=false;
 w.beforeBegin(async()=>{
  beginReached=true;
  const reserved=(await w.store.read(H('short-expiry'),1,w.project)).row;
  assert.equal(reserved.state,'reserved');
  assert.equal(reserved.value.funding.windows[0].expiresAt,stamp(w.state.now+150));
  assert.equal((await w.db.query('select count(*)::int n from keel_private.model_reservations')).rows[0].n,1);
  await w.advanceTime(250);
 });
 await assert.rejects(w.models.run(w.access,token,w.project,{quoteId:q.id,digest:q.digest,requestId:H('short-expiry')},{reauthorize:w.reauthorize}),/funding_changed/);
 assert.equal(beginReached,true);
 const row=(await w.store.read(H('short-expiry'),1,w.project)).row;assert.equal(row.state,'refused');assert.equal(row.charged,0);assert.equal(row.settled,true);
 assert.equal((await w.db.query('select count(*)::int n from keel_private.model_reservations')).rows[0].n,0);assert.equal(w.model.calls.filter(c=>new URL(c.url).pathname==='/v1/responses').length,0);
});


test('enabling personal funding never retargets legacy running attempts or removes their existing recovery',async t=>{
 const w=await world(t),b=w.binding();await w.vault.put(w.descriptor,{expectedVersion:0,policyDigest:b.connectionPolicyDigest,requestId:H('legacy-service'),actor:1,key:'fake-acme-legacy-api-key',health:{synthetic:true}});
 w.config.personalFunding.enabled=false;
 const legacy=createModelTasks(w.config,{fetcher:w.fetcher,now:()=>w.state.now});
 const p=await legacy.prepare(w.access,token,w.project,sourceInput()),q=await legacy.quote(w.access,token,w.project,{previewId:p.id,digest:p.digest},{reauthorize:w.reauthorize});
 const id=H('legacy-running');await legacy.run(w.access,token,w.project,{quoteId:q.id,digest:q.digest,requestId:id},{reauthorize:w.reauthorize});
 const original=(await w.store.read(id,1,w.project)).row;assert.equal(original.funding,null);
 assert.equal((await legacy.reconcile(w.access,token,w.project,id,{reauthorize:w.reauthorize})).state,'queued');
 w.config.personalFunding.enabled=true;await w.enroll(b);
 assert.equal((await w.models.reconcile(w.access,token,w.project,id,{reauthorize:w.reauthorize})).state,'queued');
 assert.deepEqual((await w.store.read(id,1,w.project)).row.credential,original.credential);assert.equal((await w.store.read(id,1,w.project)).row.funding,null);
 const cancelled=await w.models.cancel(w.access,token,w.project,id,{reauthorize:w.reauthorize});assert.equal(cancelled.state,'cancelled');assert.equal(w.model.calls.filter(c=>new URL(c.url).pathname==='/v1/responses').length,1);
});
