import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRoutinePolicy, routinePolicySummary, policyHash } from '../lib/routines/definitions.mjs';
const project={id:'studio',repoId:101,repo:'acme/studio'},context={workspaceId:'acme',actorId:'alice',projects:[project]};
const make=()=>({schemaVersion:1,id:'daily',scope:{workspaceId:'acme',actorId:'alice',project},purpose:'PRIVATE authored purpose',task:{sha256:'a'.repeat(64),bytes:30},trigger:{kind:'manual'},placement:{kind:'home',requirements:['benos']},adapters:[{id:'codex-cli',version:'1'}],connections:[],effects:[],bounds:{runtimeSeconds:600,modelCalls:0,maxCostMicroUsd:0},overlap:'wait',state:'dormant'});

test('dormant policy has explicit scope, task, adapter and bounds with canonical digests and safe summaries',()=>{
  const input=make(),policy=validateRoutinePolicy(input,context);
  assert.equal(policyHash(policy),policyHash(validateRoutinePolicy(Object.fromEntries(Object.entries(input).reverse()),context)));
  const summary=routinePolicySummary(policy);assert.equal(summary.dispatchEnabled,false);assert.equal(summary.authority,'declared-policy-only');assert.doesNotMatch(JSON.stringify(summary),/PRIVATE/);
  const personal=make();personal.scope={...personal.scope,project:null};assert.equal(validateRoutinePolicy(personal,context).scope.project,null);
});

test('scope and numeric repository identities cannot be changed or inferred from matching labels',()=>{
  for(const scope of [{...make().scope,actorId:'bob'},{...make().scope,workspaceId:'other'},{...make().scope,project:{...project,repoId:999}},{...make().scope,project:{...project,repo:'acme/other'}}])assert.throws(()=>validateRoutinePolicy({...make(),scope},context),/policy_scope_mismatch/);
  assert.throws(()=>validateRoutinePolicy({...make(),scope:{...make().scope,project:{...project,repoId:'101'}}},context),/invalid_routine_policy/);
});

test('canonical policy refuses imported grants, funding, commands, activation and unbounded execution',()=>{
  for(const extra of [{grant:true},{funding:{accountId:'acme'}},{command:'sh'},{enabled:true}])assert.throws(()=>validateRoutinePolicy({...make(),...extra},context),/invalid_routine_policy/);
  for(const replacement of [{state:'active'},{bounds:{runtimeSeconds:Infinity,modelCalls:1,maxCostMicroUsd:1}},{bounds:{runtimeSeconds:600,modelCalls:101,maxCostMicroUsd:0}},{overlap:'parallel'},{adapters:[{id:'codex-cli',version:'1',command:'/PRIVATE'}]}])assert.throws(()=>validateRoutinePolicy({...make(),...replacement},context),/invalid_routine_policy/);
});

test('cron policy preserves a strict supported expression and explicit real timezone without invented conversion',()=>{
  const trigger={kind:'cron',expression:'*/15 9-17 * * 1-5',timeZone:'America/Denver'};
  assert.deepEqual(validateRoutinePolicy({...make(),trigger},context).trigger,trigger);
  for(const expression of ['99 * * * *','0 24 * * *','0 0 0 * *','0 0 * 13 *','0 0 * * MON','@daily','0 0 * * * PRIVATE','*/0 * * * *','0 0 * * * '])assert.throws(()=>validateRoutinePolicy({...make(),trigger:{...trigger,expression}},context),/unsupported_policy_trigger/);
  for(const timeZone of [null,'local','PRIVATE','UTC;echo hi'])assert.throws(()=>validateRoutinePolicy({...make(),trigger:{...trigger,timeZone}},context),/unsupported_policy_trigger/);
});

test('event policy binds private match bytes and explicit catch-up policy, never inline task-derived permissions',()=>{
  const trigger={kind:'event',provider:'benos',event:'sync.completed',matchRef:{sha256:'b'.repeat(64),bytes:200},catchUp:{overlapSeconds:600,retentionDays:14,initial:'now'}};
  assert.equal(validateRoutinePolicy({...make(),trigger},context).trigger.kind,'event');
  for(const change of [{event:'anything'},{match:{from:'PRIVATE'}},{catchUp:{...trigger.catchUp,initial:'all-history'}}])assert.throws(()=>validateRoutinePolicy({...make(),trigger:{...trigger,...change}},context),/unsupported_policy_trigger/);
});

test('effect intent references exact target and connection policy but carries no approval or send permission',()=>{
  const policy=make();policy.connections=[{id:'drive',policyDigest:'c'.repeat(64),generation:2}];policy.effects=[{kind:'drive.file',targetRef:'d'.repeat(64),connectionId:'drive',review:'required'}];
  assert.equal(validateRoutinePolicy(policy,context).effects.length,1);
  for(const effect of [{...policy.effects[0],review:'none'},{...policy.effects[0],connectionId:'missing'},{...policy.effects[0],approved:true}])assert.throws(()=>validateRoutinePolicy({...policy,effects:[effect]},context),/invalid_routine_policy/);
});
