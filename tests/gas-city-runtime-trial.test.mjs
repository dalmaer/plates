import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupRuntime} from '../experiments/gas-city/runtime-cleanup.mjs';
const receipt={cleanup:true,observation:{creates:1,running:false,exitConfirmed:true}};

test('runtime failure cleanup signals driver even when coordinator exit rejects or times out',async()=>{
 for(const reason of ['spawn failed','timeout']){
  const calls=[],child={kill:signal=>calls.push(['coordinator',signal])},driver={kill:signal=>calls.push(['driver',signal])};
  const result=await cleanupRuntime({children:new Map([[child,Promise.reject(new Error(reason))]]),driver,driverExit:Promise.resolve([0,null]),readReceipt:async()=>receipt,bounded:promise=>{assert.equal(calls.length,2,'both shutdown signals precede every awaited exit');return promise;}});
  assert.deepEqual(calls,[['coordinator','SIGKILL'],['driver','SIGTERM']]);assert.deepEqual(result.cleanup,receipt);assert.equal(result.errors.length,1);assert.match(result.errors[0],new RegExp(reason));
 }
});

test('signal errors cannot skip other process cleanup and unknown exit proof stays a failure',async()=>{
 let signaled=false;
 const result=await cleanupRuntime({children:new Map([[{kill:()=>{throw new Error('signal refused');}},Promise.resolve([1,null])]]),driver:{kill:()=>{signaled=true;}},driverExit:Promise.resolve([0,null]),readReceipt:async()=>({cleanup:true,observation:{creates:1,running:false,exitConfirmed:false}}),bounded:p=>p});
 assert.equal(signaled,true);assert.deepEqual(result.errors,['coordinator signal: signal refused','driver exit proof unavailable']);
});

test('successful cleanup requires joined exits and a bounded matching driver result',async()=>{
 const result=await cleanupRuntime({children:new Map(),driver:{kill:()=>{}},driverExit:Promise.resolve([0,null]),readReceipt:async()=>receipt,bounded:p=>p});assert.deepEqual(result,{errors:[],cleanup:receipt});
 const failed=await cleanupRuntime({children:new Map(),driver:{kill:()=>{}},driverExit:Promise.reject(new Error('unconfirmed')),readReceipt:async()=>{throw new Error('must not read after unknown exit');},bounded:p=>p});assert.deepEqual(failed.errors,['driver exit: unconfirmed']);
});
