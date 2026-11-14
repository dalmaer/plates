// Phase 181: actual local SQL, not a mock state machine. No hosted acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createOperationStore } from '../lib/web/operation-store.mjs';
import { prepareClaimIntent } from '../lib/web/attach-github.mjs';
import { hash, seal } from '../lib/web/common.mjs';
const migrations = new URL('../lib/web/migrations/', import.meta.url);
const config = { storageUrl:'https://acme.example', storageKey:'fake-acme-key', encryptionKey:Buffer.alloc(32,7) };
const sql = name => readFile(new URL(name,migrations),'utf8');
const observation = stage => ({stage,at:'2026-11-14T12:00:00.000Z'});
async function harness(t,{latest=true}={}) {
 const db=new PGlite(); t.after(()=>db.close());
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql')&&n<'020-').sort())await db.exec(await sql(name));
 if(latest) {await db.exec(await sql('020-attach-operation-stages.sql'));await db.exec(await sql('021-attach-outcomes.sql'));}
 let counter=0;
 const state={calls:[],alter:null,lose:false};
 const raw=async(operation,identity,value=null,name='plates_decision_rpc')=>{
  const p={p_operation:operation,p_id:identity.id,p_scope:identity.scope,p_project:identity.project,p_preview:identity.previewId,p_fence:identity.fence,p_value:value};
  return execute(p,name);
 };
 async function execute(p,name='plates_decision_rpc') {
  assert.ok(['plates_decision_rpc','keel_decision_rpc'].includes(name));
  await db.exec('SET ROLE service_role');
  try {return (await db.query(`SELECT public.${name}($1,$2,$3,$4,$5,$6,$7) value`,[p.p_operation,p.p_id,p.p_scope,p.p_project,p.p_preview,p.p_fence,p.p_value])).rows[0].value;}
  finally {await db.exec('RESET ROLE');}
 }
 const store=createOperationStore(config,async(url,options)=>{
  const p=JSON.parse(options.body);state.calls.push(p);
  const row=await execute(p,new URL(url).pathname.split('/').at(-1));
  if(state.lose) {state.lose=false;throw Error('synthetic lost acknowledgment');}
  state.alter?.(row,p);
  return Response.json(row);
 });
 async function fresh() {
  const key=String(++counter), identity=Object.fromEntries(['id','scope','project','previewId','fence'].map(k=>[k,hash('Acme-'+key+'-'+k)]));
  const intent=prepareClaimIntent({operationId:identity.id,repoId:102,repositoryNodeId:'R_acme',repo:'acme/studio',phase:1,provider:'codex',machine:'acme-hosted',
   at:'2026-11-14T12:00:00Z',parent:'b'.repeat(40),tree:'c'.repeat(40),identity:{name:'Acme',email:'builder@acme.example'}});
  await store.createPreview(identity.previewId,identity.scope,{kind:'attach',digest:hash('Acme preview')});
  return {identity,intent};
 }
 const step=(op,f)=>store.attachTransition(op,f.identity,op.endsWith('-begin')?null:observation(op==='refuse'?'ready':op.replace(/-(record|reconcile)$/,'-recorded')));
 return {db,store,state,raw,fresh,step};
}

test('three fixed SQL fences grant once, preserve intent and append encrypted history',async t=>{
 const h=await harness(t),f=await h.fresh();
 const reserved=await h.store.attachReserve(f.identity,f.intent);
 assert.equal(reserved.created,true);assert.equal(reserved.granted,false);
 assert.equal((await h.store.attachReserve(f.identity,f.intent)).created,false);
 const original=(await h.db.query('SELECT value FROM keel_private.decision_operations WHERE id=$1',[f.identity.id])).rows[0].value;
 for(const effect of ['mint','commit','ref']) {
  assert.equal((await h.step(effect+'-begin',f)).granted,true);
  assert.equal(await h.step(effect+'-begin',f),null);
  const read=await h.store.attachRead(f.identity);assert.equal(read.granted,false);assert.equal(read.changed,false);
  const report=await h.step(effect+'-record',f);assert.equal(report.granted,false);
  assert.equal(await h.step(effect+'-record',f),null);
  assert.equal(await h.step(effect+'-uncertain',f),null);
  assert.equal(report.state,effect==='ref'?'committed':'dispatched');
 }
 const final=await h.store.attachRead(f.identity);
 assert.deepEqual(Object.keys(final.observations).sort(),['commit-recorded','mint-recorded','ref-recorded']);
 assert.deepEqual(final.value.intent,f.intent);
 const row=(await h.db.query('SELECT value,attach_observations FROM keel_private.decision_operations WHERE id=$1',[f.identity.id])).rows[0];
 assert.equal(row.value,original);
 assert.ok(!row.value.includes('acme/studio'));
 assert.ok(Object.values(row.attach_observations).every(v=>typeof v==='string'&&!v.includes('2026-11-14')));
 // Reads through the legacy name never manufacture a grant.
 assert.equal((await h.raw('attach-read',f.identity,null,'keel_decision_rpc')).granted,false);
});

test('skipped stages wrong identities and generic transitions cannot bypass SQL fences',async t=>{
 const h=await harness(t),f=await h.fresh();await h.store.attachReserve(f.identity,f.intent);
 for(const op of ['commit-begin','ref-begin','mint-record','commit-reconcile','ref-record'])assert.equal(await h.step(op,f),null,op);
 for(const key of ['id','scope','project','previewId','fence']) {
  const wrong={...f.identity,[key]:hash('wrong-'+key)};
  assert.equal(await h.store.attachRead(wrong),null,key);
  assert.equal(await h.store.attachTransition('mint-begin',wrong),null,key);
 }
 for(const op of ['dispatched','uncertain','committed','refused'])assert.equal(await h.raw(op,f.identity,'opaque'),null,op);
 assert.equal(await h.raw('reserve',f.identity,'opaque'),null);
 for(const key of ['id','project','fence'])assert.equal(await h.raw('attach-reserve',{...f.identity,[key]:hash('wrong-'+key)},'opaque'),null);
 await h.step('mint-begin',f);
 for(const op of ['dispatched','uncertain','committed','refused'])assert.equal(await h.raw(op,f.identity,'opaque'),null,op);
 assert.equal((await h.store.attachRead(f.identity)).stage,'mint-started');
});

test('lost begin acknowledgment is inspection only and uncertain mint never resumes',async t=>{
 const h=await harness(t),f=await h.fresh();await h.store.attachReserve(f.identity,f.intent);
 h.state.lose=true;
 await assert.rejects(h.step('mint-begin',f));
 assert.equal((await h.store.attachRead(f.identity)).granted,false);
 assert.equal(await h.step('mint-begin',f),null);
 await h.step('mint-uncertain',f);
 assert.equal(await h.step('mint-record',f),null);
 assert.equal(await h.step('commit-begin',f),null);
 await assert.rejects(h.raw('attach-mint-reconcile',f.identity,'opaque'),/unsupported attach operation/);
});

test('commit and ref reconciliation preserve uncertain evidence without execution grants',async t=>{
 const h=await harness(t),f=await h.fresh();await h.store.attachReserve(f.identity,f.intent);
 await h.step('mint-begin',f);await h.step('mint-record',f);
 for(const effect of ['commit','ref']) {
  await h.step(effect+'-begin',f);await h.step(effect+'-uncertain',f);
  assert.equal(await h.step(effect+'-record',f),null);
  const reconciled=await h.step(effect+'-reconcile',f);
  assert.equal(reconciled.granted,false);assert.equal(reconciled.changed,true);
  assert.deepEqual(reconciled.observations[effect+'-uncertain'],observation(effect+'-uncertain'));
  assert.deepEqual(reconciled.observations[effect+'-recorded'],observation(effect+'-recorded'));
  assert.equal(await h.step(effect+'-reconcile',f),null);
 }
 assert.equal(Object.keys((await h.store.attachRead(f.identity)).observations).length,5);
});

test('expiry only frees pre-mint work and never releases uncertain project lane',async t=>{
 const h=await harness(t),f=await h.fresh();await h.store.attachReserve(f.identity,f.intent);
 await h.db.query("UPDATE keel_private.decision_operations SET lease_until=clock_timestamp()-interval '1 minute' WHERE id=$1",[f.identity.id]);
 assert.equal(await h.step('mint-begin',f),null);
 assert.equal((await h.step('refuse',f)).state,'refused');
 const active=await h.fresh();await h.store.attachReserve(active.identity,active.intent);await h.step('mint-begin',active);await h.step('mint-uncertain',active);
 await h.db.query("UPDATE keel_private.decision_operations SET lease_until=clock_timestamp()-interval '1 minute' WHERE id=$1",[active.identity.id]);
 const other=await h.fresh();other.identity.project=active.identity.project;
 assert.deepEqual(await h.store.attachReserve(other.identity,other.intent),{conflict:true});
 assert.equal((await h.store.attachRead(active.identity)).state,'uncertain');
 assert.equal(await h.step('refuse',active),null);
});

test('migration preserves legacy rows forwarders permissions and is idempotent',async t=>{
 const h=await harness(t,{latest:false}),f=await h.fresh();
 const legacy=await h.store.reserve(f.identity.id,f.identity.scope,f.identity.project,f.identity.previewId,f.identity.fence,{kind:'Acme legacy'});
 const original=(await h.db.query('SELECT id,scope,project,preview,fence,state,value,lease_until FROM keel_private.decision_operations')).rows;
 const alias=(await h.db.query("SELECT prosrc FROM pg_proc WHERE oid='public.keel_decision_rpc(text,text,text,text,text,text,text)'::regprocedure")).rows;
 const migration=await sql('020-attach-operation-stages.sql');await h.db.exec(migration);await h.db.exec(migration);
 assert.deepEqual((await h.db.query('SELECT id,scope,project,preview,fence,state,value,lease_until FROM keel_private.decision_operations')).rows,original);
 assert.deepEqual((await h.db.query("SELECT prosrc FROM pg_proc WHERE oid='public.keel_decision_rpc(text,text,text,text,text,text,text)'::regprocedure")).rows,alias);
 assert.equal(legacy.created,true);
 assert.equal((await h.raw('dispatched',f.identity,null,'keel_decision_rpc')).state,'dispatched');
 assert.equal((await h.raw('committed',f.identity,'opaque')).state,'committed');
 for(const name of ['plates_decision_rpc','keel_decision_rpc']) {
  const signature='public.'+name+'(text,text,text,text,text,text,text)';
  assert.deepEqual((await h.db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('authenticated',$1,'EXECUTE') authenticated,has_function_privilege('service_role',$1,'EXECUTE') service",[signature])).rows[0],{anon:false,authenticated:false,service:true});
 }
 await h.db.exec('SET ROLE service_role');
 await assert.rejects(h.db.query('SELECT * FROM keel_private.decision_operations'),/permission denied/);
 await h.db.exec('RESET ROLE');
});

test('missing migration and malformed encrypted replies cannot confer a stage grant',async t=>{
 const h=await harness(t,{latest:false}),f=await h.fresh();
 await assert.rejects(h.store.attachReserve(f.identity,f.intent));
 assert.equal(h.state.calls.at(-1).p_operation,'attach-reserve');
 await h.db.exec(await sql('020-attach-operation-stages.sql'));await h.store.attachReserve(f.identity,f.intent);
 for(const alter of [
  r=>r.granted=true,r=>r.changed=true,r=>r.fence=hash('wrong'),r=>r.stage='future-dispatch',r=>r.state='committed',
  r=>r.value='broken',r=>r.observations={token:'fake-acme-secret'},r=>r.observations={'mint-recorded':'broken'},
 ]) {
  h.state.alter=alter;
  await assert.rejects(h.store.attachRead(f.identity),{code:'invalid_attach_journal_response'});
 }
 h.state.alter=null;await h.step('mint-begin',f);await h.step('mint-record',f);
 for(const alter of [
  r=>r.observations={},
  r=>r.observations['mint-recorded']='x'.repeat(8193),
  r=>r.observations['mint-recorded']=seal(observation('mint-recorded'),config.encryptionKey,'wrong-binding'),
  r=>r.observations['mint-recorded']=seal({...observation('mint-recorded'),token:'fake-acme-secret'},config.encryptionKey,`attach-observation:${f.identity.scope}:${f.identity.id}:mint-recorded`),
 ]) {
  h.state.alter=alter;await assert.rejects(h.store.attachRead(f.identity),{code:'invalid_attach_journal_response'});
 }
 h.state.alter=null;
 const before=h.state.calls.length;
 await assert.rejects(h.store.attachTransition('dispatch-begin',f.identity),{code:'invalid_attach_journal'});
 await assert.rejects(h.store.attachTransition('mint-record',f.identity,{...observation('mint-recorded'),token:'fake-acme-secret'}),{code:'invalid_attach_observation'});
 assert.equal(h.state.calls.length,before);
});

test('020 requires migrated forwarder and rolls back before changing schema',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql')&&n<'014-').sort())await db.exec(await sql(name));
 await assert.rejects(db.exec(await sql('020-attach-operation-stages.sql')),/apply 014-plates-names.sql first/);
 await db.exec('ROLLBACK');
 assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='keel_private' AND table_name='decision_operations' AND column_name='attach_stage'")).rows[0].n,0);
 await db.exec(await sql('014-plates-names.sql'));
 await db.exec("CREATE OR REPLACE FUNCTION public.keel_decision_rpc(p_operation text,p_id text,p_scope text,p_project text default null,p_preview text default null,p_fence text default null,p_value text default null) RETURNS jsonb LANGUAGE sql AS 'SELECT null::jsonb'");
 await assert.rejects(db.exec(await sql('020-attach-operation-stages.sql')),/not the 014 forwarder/);
 await db.exec('ROLLBACK');
 assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='keel_private' AND table_name='decision_operations' AND column_name='attach_stage'")).rows[0].n,0);
});

test('SQL observation map is bounded and fixed-key and refuses replacing a retained report',async t=>{
 const h=await harness(t),f=await h.fresh();await h.store.attachReserve(f.identity,f.intent);await h.step('mint-begin',f);
 await assert.rejects(h.raw('attach-mint-record',f.identity,'x'.repeat(8193)),/invalid attach input/);
 await assert.rejects(h.db.query('UPDATE keel_private.decision_operations SET attach_observations=$1 WHERE id=$2',[JSON.stringify({unknown:'opaque'}),f.identity.id]),/check constraint/);
 await assert.rejects(h.db.query('UPDATE keel_private.decision_operations SET attach_observations=$1 WHERE id=$2',[JSON.stringify({'mint-recorded':'x'.repeat(65536)}),f.identity.id]),/check constraint/);
 // Simulate retained evidence with an inconsistent pre-report stage: even then no replacement.
 await h.db.query('UPDATE keel_private.decision_operations SET attach_observations=$1 WHERE id=$2',[JSON.stringify({'mint-recorded':'Acme retained'}),f.identity.id]);
 assert.equal(await h.raw('attach-mint-record',f.identity,'Acme replacement'),null);
 assert.deepEqual((await h.db.query('SELECT attach_observations FROM keel_private.decision_operations WHERE id=$1',[f.identity.id])).rows[0].attach_observations,{'mint-recorded':'Acme retained'});
});

test('own commit cannot terminalize a claim or release its lane before validation',async t=>{
 const h=await harness(t),f=await h.fresh();await h.store.attachReserve(f.identity,f.intent);
 for(const op of ['mint-begin','mint-record','commit-begin','commit-record'])await h.step(op,f);
 const before=h.state.calls.length;
 await assert.rejects(h.store.attachTransition('ref-decline',f.identity,{...observation('ref-declined'),reason:'claim-taken',refEffect:'not-started',observedCommit:f.intent.commit}),{code:'invalid_attach_observation'});
 assert.deepEqual(h.state.calls.slice(before).map(c=>c.p_operation),['attach-read']);
 assert.equal((await h.store.attachRead(f.identity)).stage,'commit-recorded');
 const other=await h.fresh();other.identity.project=f.identity.project;
 assert.deepEqual(await h.store.attachReserve(other.identity,other.intent),{conflict:true});
 const declined=await h.store.attachTransition('ref-decline',f.identity,{...observation('ref-declined'),reason:'claim-taken',refEffect:'not-started',observedCommit:'e'.repeat(40)});
 assert.equal(declined.state,'refused');assert.equal(declined.granted,false);
 assert.equal(await h.step('ref-begin',f),null);
 assert.equal((await h.store.attachReserve(other.identity,other.intent)).created,true);
});
