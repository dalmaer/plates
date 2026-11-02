import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistry, scopedRegistry, observationId, schedule, uniqueObservations } from '../lib/routines/model.mjs';
import { fixture } from './helpers/routine-sources.mjs';

test('explicit registry scopes actor, account and host without granting project access',async t=>{
  const f=await fixture(t),source=f.source('declared',{file:await f.json('declared.json',[])}),registry=f.registry([source]);
  assert.deepEqual(validateRegistry(registry),registry);
  assert.equal(scopedRegistry(registry,{workspaceId:'acme',actorId:'alice',projectIds:[]}).sources.length,0);
  assert.throws(()=>scopedRegistry(registry,{workspaceId:'acme',actorId:'bob',projectIds:['studio']}),/source_access_denied/);
  assert.throws(()=>scopedRegistry(registry,{workspaceId:'other',actorId:'alice',projectIds:['studio']}),/source_access_denied/);
  const key=observationId(source.scope,'codex','daily');
  assert.notEqual(key,observationId({...source.scope,accountId:'second'},'codex','daily'));
  assert.notEqual(key,observationId({...source.scope,hostId:'second'},'codex','daily'));
  for(const changed of [{...registry,extra:true},{...registry,sources:[source,source]},{...registry,sources:[{...source,file:'/tmp/../secret'}]},{...registry,sources:[{...source,scope:{...source.scope,accountId:null}}]}])assert.throws(()=>validateRegistry(changed),/invalid_registry/);
});

test('schedule projection retains known syntax and excludes arbitrary task and metadata text',()=>{
  assert.deepEqual(schedule('cron','0 9 * * 1','UTC'),{kind:'cron',raw:'0 9 * * 1',timezone:'UTC',interpreted:false});
  assert.equal(schedule('rrule','FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=9').kind,'rrule');
  for(const raw of ['FREQ=DAILY;PROMPT=SECRET','FREQ=DAILY;BYHOUR=99','FREQ=DAILY;FREQ=WEEKLY','PRIVATE PROMPT'])assert.equal(schedule('rrule',raw).kind,'unknown');
  assert.equal(schedule('calendar',{Hour:9,Minute:5}).kind,'calendar');
  assert.equal(schedule('calendar',{Hour:9,Message:'PRIVATE'}).kind,'unknown');
  assert.equal(schedule('cron','run PRIVATE every day').raw,null);
});

test('duplicate observations count once while conflicting same identities are withheld',()=>{
  assert.deepEqual(uniqueObservations([{id:'a',state:'unknown'},{id:'a',state:'unknown'}]),{values:[{id:'a',state:'unknown'}],conflicts:0});
  assert.deepEqual(uniqueObservations([{id:'a',state:'unknown'},{id:'a',state:'succeeded'}]),{values:[],conflicts:1});
});

test('scope identity and duplicate facts do not depend on object insertion order',()=>{
  const scope={workspaceId:'acme',actorId:'alice',projectId:'studio',hostId:'host',accountId:'account'};
  const reordered=Object.fromEntries(Object.entries(scope).reverse());
  assert.equal(observationId(scope,'codex',['routine','daily']),observationId(reordered,'codex',['routine','daily']));
  assert.equal(uniqueObservations([{id:'a',scope,state:'unknown'},{state:'unknown',scope:reordered,id:'a'}]).conflicts,0);
});
