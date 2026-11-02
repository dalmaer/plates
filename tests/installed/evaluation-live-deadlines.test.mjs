import '../helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, rmdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../helpers/run.mjs';
import { inspectDockerOperation } from '../../lib/evaluation-docker.mjs';
import { inspectBudgetTarget, reserveExternalBudget, settleExternalBudget, reconcileExternalBudget } from '../../lib/validation-budget.mjs';

const id='a'.repeat(32), operation=`plates-eval-${id}-builder`, containerId='b'.repeat(64), image={id:'sha256:'+'c'.repeat(64)};
async function temp(t) {
 const dir=await realpath(await mkdtemp(join(tmpdir(),'plates-acme-live-deadline-')));
 t.after(()=>rm(dir,{recursive:true,force:true}));return dir;
}
async function docker(t,{delays={},running=false,paused=false}={}) {
 const dir=await temp(t),log=join(dir,'calls.jsonl');
 await writeFile(log,'');
 await writeFile(join(dir,'docker'),`#!${process.execPath}
import {appendFileSync} from 'node:fs';
const args=process.argv.slice(2), command=args[0];
appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');
const found=${JSON.stringify({Name:'/'+operation,Image:image.id,Id:containerId,State:{Running:running,Paused:paused}})};
setTimeout(()=>{console.log(command==='inspect'?(args[2]==='{{json .}}'?JSON.stringify(found):'false'):'');},(${JSON.stringify(delays)})[command]??0);
`,{mode:0o700});
 const old=process.env.PATH;process.env.PATH=dir;t.after(()=>{process.env.PATH=old;});
 return Object.assign(async()=> (await readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse),{log});
}
test('Docker recovery expired/invalid absolute deadlines start no command and retain unknown',async t=>{
 const calls=await docker(t);
 for(const deadline of [Date.now()-1,0,null,NaN,Infinity,'123',1.5])
  assert.deepEqual(await inspectDockerOperation(operation,image,{deadline,cancel:true,expectedId:containerId}),{operation,state:'unknown'});
 assert.deepEqual(await calls(),[]);
});
test('Docker recovery preserves omitted deadline and caps supplied future deadline at one second',async t=>{
 // Accounting proof only: real timer/child deadline behavior remains covered
 // by the installed CLI and independent deadline-negative tests.
 const calls=await docker(t),seen=[],signal=new AbortController().signal,base=Date.now();
 t.mock.method(Date,'now',()=>base);
 t.mock.method(AbortSignal,'timeout',ms=>{seen.push(ms);return signal;});
 for(const options of [{expectedId:containerId},{expectedId:containerId,deadline:Date.now()+10000}])
  assert.deepEqual(await inspectDockerOperation(operation,image,options),{operation,state:'terminated',containerId,running:false});
 assert.deepEqual(seen,[1000,1000]);assert.equal((await calls()).length,4);
});
test('Docker recovery shares remaining time across inspect/unpause and never starts a later kill after exhaustion',async t=>{
 // Real fake children finish immediately; no OS-startup race against400ms.
 // The un-aborted signal makes the absolute pre/post-observe guard causal.
 const calls=await docker(t,{running:true,paused:true}),seen=[],signal=new AbortController().signal,base=Date.now();
 t.mock.method(AbortSignal,'timeout',ms=>{seen.push(ms);return signal;});
 t.mock.method(Date,'now',()=>readFileSync(calls.log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).some(args=>args[0]==='unpause')?base+401:base);
 const result=await inspectDockerOperation(operation,image,{deadline:base+400,cancel:true,expectedId:containerId});
 assert.deepEqual(seen,[400],'one signal allocated from remaining deadline');
 assert.equal(signal.aborted,false,'logical deadline, not timer abort, refuses the late step');
 const commands=(await calls()).map(args=>args[0]);
 assert.deepEqual(commands,['inspect','unpause'],'no kill or final inspect after deadline');
 assert.deepEqual(result,{operation,state:'unknown'});
});
async function admission(t) {
 const dir=await temp(t),root=join(dir,'repo'),manifest=join(dir,'manifest.json'),stateDir=join(dir,'budget');
 await mkdir(join(root,'.plates'),{recursive:true});
 await writeFile(join(root,'.plates','plates.json'),JSON.stringify({repo:'acme/deadlines'}));
 await writeFile(manifest,JSON.stringify([{repo:'acme/deadlines',role:'managed'}]));
 for(const args of [['init','-q'],['add','.'],['commit','-qm','Acme baseline'],['remote','add','origin','https://github.com/acme/deadlines.git']]) {
  const r=run('git',['-C',root,...args]);assert.equal(r.status,0,r.stderr);
 }
 const target=await inspectBudgetTarget({manifest,root,repo:'acme/deadlines'});
 return {stateDir,capacity:1,weight:1,target,id,commandDigest:'d'.repeat(64),operations:[operation]};
}
const observations=[{operation,state:'terminated',containerId,running:false}];
test('external reserve rejects an expired deadline before state creation, while omitted deadline preserves lease shape',async t=>{
 const a=await admission(t);
 await assert.rejects(reserveExternalBudget({...a,deadline:Date.now()-1}),{code:'request_budget_deadline'});
 await assert.rejects(readFile(join(a.stateDir,'state.json')),{code:'ENOENT'});
 const lease=await reserveExternalBudget(a);
 assert.equal(Object.hasOwn(lease,'deadline'),false);assert.equal(Object.hasOwn(lease,'deadlineEpochMs'),false);
 assert.equal((await settleExternalBudget({...a,lease,observations})).released,true);
});
test('external settle and reconcile refuse expired deadlines without changing original leases or history',async t=>{
 const a=await admission(t),lease=await reserveExternalBudget(a),path=join(a.stateDir,'state.json'),original=await readFile(path);
 for(const method of [settleExternalBudget,reconcileExternalBudget]) {
  await assert.rejects(method({...a,lease,observations,deadline:Date.now()-1}),{code:'request_budget_deadline'});
  assert.deepEqual(await readFile(path),original);
 }
 const receipt=await reconcileExternalBudget({...a,lease,observations});
 assert.equal(receipt.released,true);
 assert.deepEqual(await reconcileExternalBudget({...a,lease,observations}),receipt);
});
test('external settlement and recovery propagate the remaining deadline through coordinator contention',async t=>{
 const a=await admission(t),lease=await reserveExternalBudget(a),path=join(a.stateDir,'state.json'),original=await readFile(path);
 const guard=join(a.stateDir,'coordination');await mkdir(guard,{mode:0o700});
 for(const method of [settleExternalBudget,reconcileExternalBudget]) {
  const start=Date.now();
  await assert.rejects(method({...a,lease,observations,deadline:start+40}),/coordination_busy|request_budget_deadline/);
  assert.ok(Date.now()-start<1000,'must not use the omitted-deadline 2000ms wait');
  assert.deepEqual(await readFile(path),original);
 }
 await rmdir(guard);
 assert.equal((await settleExternalBudget({...a,lease,observations,deadline:Date.now()+3000})).released,true);
});
test('external reserve rechecks an initially valid deadline inside the existing lock before insertion',async t=>{
 const a=await admission(t),base=Date.now();let calls=0;
 // Entry check succeeds; the coordinator check sees time exhausted after target preparation.
 t.mock.method(Date,'now',()=>++calls===1?base:base+100);
 await assert.rejects(reserveExternalBudget({...a,deadline:base+50}),{code:'request_budget_deadline'});
 assert.ok(calls>=2);
 await assert.rejects(readFile(join(a.stateDir,'state.json')),{code:'ENOENT'});
});
