import '../helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../helpers/run.mjs';
import { inspectBudgetTarget, inspectBudget, reserveRequestBudget, settleRequestBudget, reconcileRequestBudget,
  isRequestCapacityRefusal, reserveExternalBudget } from '../../lib/validation-budget.mjs';
import { createEvaluationProvider } from '../../lib/evaluation-provider.mjs';

let seq=0;
const end=()=>Date.now()+5000;
async function fixture(t){
 const dir=await realpath(await mkdtemp(join(tmpdir(),'plates-acme-request-')));t.after(()=>rm(dir,{recursive:true,force:true}));
 const root=join(dir,'repo'),manifest=join(dir,'manifest.json'),stateDir=join(dir,'budget');
 await mkdir(join(root,'.plates'),{recursive:true});
 await writeFile(join(root,'.plates','plates.json'),JSON.stringify({repo:'acme/request'}));
 await writeFile(manifest,JSON.stringify([{repo:'acme/request',role:'managed'}]));
 for(const args of [['init','-q'],['add','.'],['commit','-qm','Acme baseline'],['remote','add','origin','https://github.com/acme/request.git']]){
  const r=run('git',['-C',root,...args]);assert.equal(r.status,0,r.stderr);
 }
 const target=await inspectBudgetTarget({manifest,root,repo:'acme/request',deadline:end()});
 const options={stateDir,capacity:1,weight:1,target,id:(++seq).toString(16).padStart(32,'0'),commandDigest:'a'.repeat(64),operationId:`acme-request-${seq}`,requestKind:'count',deadline:end()};
 return {options,stateDir,dir};
}
async function witness(operationId, started=true){
 const adapter=createEvaluationProvider({timeoutMs:100,fetcher:async()=>new Response(JSON.stringify({object:'response.input_tokens',input_tokens:1}))});
 const request=adapter.beginEvaluationRequest({operationId,operation:'count',timeoutMs:100,input:started?{
  key:'acme-synthetic-credential',scope:{organization:'acme',project:'acme'},model:{requested:'acme',resolved:'acme'},packet:{instructions:'Acme instructions',input:'Acme input'}
 }: {}});
 await request.result.catch(()=>{});return request.localCompletion;
}
const settle=(o,lease,completion=null)=>settleRequestBudget({stateDir:o.stateDir,capacity:1,lease,completion,deadline:end()});
const reconcile=(o,lease,extra={})=>reconcileRequestBudget({stateDir:o.stateDir,capacity:1,lease,deadline:end(),...extra});
test('request budget shares capacity with container leases and requires real inspected target',async t=>{
 const {options:o}=await fixture(t);
 await assert.rejects(reserveRequestBudget({...o,target:{...o.target}}),/invalid_request_admission/);
 await reserveExternalBudget({...o,operations:[`plates-eval-${o.id}-builder`]});
 await assert.rejects(reserveRequestBudget({...o,id:'f'.repeat(32)}),e=>isRequestCapacityRefusal(e));
 assert.equal((await inspectBudget({stateDir:o.stateDir})).leases.length,1);
});
test('opaque operation-bound completion releases host capacity and recovers exact history once',async t=>{
 const {options:o}=await fixture(t),lease=await reserveRequestBudget(o);
 await assert.rejects(settle(o,lease,{state:'transport-closed'}),/evaluation_provider_input/);
 const other=await witness('acme-wrong-operation');await assert.rejects(settle(o,lease,other),/evaluation_provider_input/);
 const completion=await witness(o.operationId),receipt=await settle(o,lease,completion);
 assert.equal(receipt.released,true);assert.deepEqual(receipt.observation,{state:'transport-closed'});
 assert.deepEqual(await settle(o,lease,completion),receipt);assert.deepEqual(await reconcile(o,lease),receipt);
 const state=await inspectBudget({stateDir:o.stateDir});assert.equal(state.leases.length,0);assert.equal(state.history.length,1);
 await assert.rejects(reserveRequestBudget(o),/already_reserved/);
});
test('unknown completion retains exact lease without loose fields, then timely closure settles original lease',async t=>{
 const {options:o}=await fixture(t),lease=await reserveRequestBudget(o);
 const receipt=await settle(o,lease);assert.equal(receipt.released,false);
 const state=await inspectBudget({stateDir:o.stateDir});assert.deepEqual(state.leases,[{...lease,state:'uncertain'}]);
 const completion=await witness(o.operationId);
 assert.equal((await settle(o,lease,completion)).released,true);
});
test('not-started witness releases without a transport, changed owner or binding refuses',async t=>{
 const {options:o}=await fixture(t),lease=await reserveRequestBudget(o),completion=await witness(o.operationId,false);
 await assert.rejects(settle(o,{...lease,commandDigest:'b'.repeat(64)},completion),/lease_ownership_changed/);
 await assert.rejects(settle(o,{...lease,pid:process.pid+1},completion),/lease_ownership_changed/);
 assert.deepEqual((await settle(o,lease,completion)).observation,{state:'not-started'});
});
test('reconciliation refuses caller death assertions; live original PID retains unknown',async t=>{
 const {options:o}=await fixture(t),lease=await reserveRequestBudget(o);
 await assert.rejects(reconcile(o,lease,{dead:true}),/invalid_request_reconciliation/);
 await assert.rejects(reconcile(o,lease,{observation:{state:'owner-exited',pid:lease.pid}}),/invalid_request_reconciliation/);
 const receipt=await reconcile(o,lease);assert.equal(receipt.released,false);assert.deepEqual(receipt.observation,{state:'unknown'});
});
test('verified ESRCH releases; EPERM and reused/live PID retain unknown under same coordinator',async t=>{
 const {options:o}=await fixture(t),lease=await reserveRequestBudget(o);
 const kill=process.kill;
 try{
  process.kill=()=>{throw Object.assign(Error('Acme denied'),{code:'EPERM'})};
  assert.equal((await reconcile(o,lease)).released,false);
  process.kill=()=>true; // PID reuse is deliberately indistinguishable from alive.
  assert.equal((await reconcile(o,lease)).released,false);
  process.kill=(pid,signal)=>{assert.equal(pid,lease.pid);assert.equal(signal,0);throw Object.assign(Error('Acme absent'),{code:'ESRCH'})};
  const receipt=await reconcile(o,lease);assert.equal(receipt.released,true);
  assert.deepEqual(receipt.observation,{state:'owner-exited',pid:lease.pid});
 }finally{process.kill=kill;}
});
test('expired deadlines refuse mutation; coordinator contention cannot reset remaining time',async t=>{
 const {options:o}=await fixture(t);
 await assert.rejects(reserveRequestBudget({...o,deadline:Date.now()-1}),/request_budget_deadline/);
 const lease=await reserveRequestBudget(o);
 await mkdir(join(o.stateDir,'coordination'),{mode:0o700});
 const start=Date.now();
 await assert.rejects(reconcileRequestBudget({stateDir:o.stateDir,capacity:1,lease,deadline:Date.now()+30}),/coordination_busy|request_budget_deadline/);
 assert.ok(Date.now()-start<500,'must not wait the legacy 2s after action deadline');
});
test('request state reader rejects extra fields and impossible released history',async t=>{
 const {options:o}=await fixture(t);await reserveRequestBudget(o);
 const path=join(o.stateDir,'state.json'),state=JSON.parse(await readFile(path));
 state.leases[0].reason='Acme invented';await writeFile(path,JSON.stringify(state));
 await assert.rejects(inspectBudget({stateDir:o.stateDir}),/invalid_request_lease/);
 delete state.leases[0].reason;
 const lease=state.leases[0];
 state.history=[{id:lease.id,foregroundContract:lease.foregroundContract,commandDigest:lease.commandDigest,
  operationId:lease.operationId,repo:lease.repo,root:lease.root,createdAt:lease.createdAt,endedAt:new Date().toISOString(),
  observation:{state:'unknown'},released:true}];
 await writeFile(path,JSON.stringify(state));
 await assert.rejects(inspectBudget({stateDir:o.stateDir}),/invalid_request_settlement/);
});

test('a real exited request owner is reconciled locally without a provider call',async t=>{
 const {options:o,dir}=await fixture(t);
 const moduleUrl=new URL('../../lib/validation-budget.mjs',import.meta.url).href;
 const script=join(dir,'owner.mjs');
 await writeFile(script,`import {inspectBudgetTarget,reserveRequestBudget} from ${JSON.stringify(moduleUrl)};
 const o=${JSON.stringify(o)};
 o.target=await inspectBudgetTarget({manifest:${JSON.stringify(join(dir,'manifest.json'))},root:o.target.root,repo:o.target.repo,deadline:o.deadline});
 console.log(JSON.stringify(await reserveRequestBudget(o)));`);
 const r=run(process.execPath,[script],{timeout:5000});assert.equal(r.status,0,r.stderr);
 const lease=JSON.parse(r.stdout);assert.notEqual(lease.pid,process.pid);
 const receipt=await reconcile(o,lease);assert.equal(receipt.released,true);
 assert.deepEqual(receipt.observation,{state:'owner-exited',pid:lease.pid});
});
test('concurrent request reservations cannot exceed existing coordinator capacity',async t=>{
 const {options:o}=await fixture(t),first=await reserveRequestBudget(o);
 await settle(o,first,await witness(o.operationId,false));
 const candidates=[1,2].map(n=>({...o,id:String(n).repeat(32),operationId:`acme-concurrent-${n}`}));
 const results=await Promise.allSettled(candidates.map(reserveRequestBudget));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const state=await inspectBudget({stateDir:o.stateDir});assert.equal(state.leases.length,1);assert.equal(state.leases[0].weight,1);
 const refused=results.find(r=>r.status==='rejected').reason;
 assert.match(refused.code,/coordination_busy|capacity_busy/);
});
