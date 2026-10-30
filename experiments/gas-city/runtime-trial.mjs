// Explicit local component trial. No install/build/download; supply the pinned driver binary.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { UPSTREAM } from './client.mjs';
import { cleanupRuntime } from './runtime-cleanup.mjs';
const here=dirname(fileURLToPath(import.meta.url)),binary=resolve(process.argv[2]??'');
if(process.argv.length!==3)throw new Error('Usage: node experiments/gas-city/runtime-trial.mjs <built-driver>');
const root=mkdtempSync('/tmp/plates-gcp-'),db=join(root,'journal.sqlite');
const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:root,TEST_TMPDIR:root};
function bounded(promise,label,ms=15000) {
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`timeout: ${label}`)),ms);})]).finally(()=>clearTimeout(timer));
}
function ownedExit(child) {
 // Retain the promise immediately; a fast exit must not disappear before cleanup.
 const exit=once(child,'exit');exit.catch(()=>{});return exit;
}
const driver=spawn(binary,[join(root,'sockets')],{env,stdio:['ignore','pipe','pipe']});
const driverExit=ownedExit(driver);
const lines=createInterface({input:driver.stdout}),iterator=lines[Symbol.asyncIterator](),children=new Map();let stderr='';driver.stderr.on('data',b=>{stderr+=b;if(stderr.length>20000)driver.kill('SIGTERM');});
let startup,report,cleanup,failure=null,cleanupFailure=null;
async function coordinator(action,keep=false) {
 const child=spawn(process.execPath,[join(here,'runtime-coordinator.mjs'),db,startup.base,action],{env,stdio:['ignore','pipe','pipe']});
 const exit=ownedExit(child);children.set(child,exit);let err='';child.stderr.on('data',b=>{err+=b;if(err.length>20000)child.kill('SIGKILL');});
 const reader=createInterface({input:child.stdout}),messages=reader[Symbol.asyncIterator]();
 const line=await bounded(messages.next(),`${action} output`);assert.equal(line.done,false,`coordinator ${action} produced no result: ${err}`);const payload=JSON.parse(line.value);
 if(keep)return {child,exit,payload,reader};
 const [code]=await bounded(exit,`${action} exit`);children.delete(child);reader.close();return {payload,code};
}
try {
 const first=await bounded(iterator.next(),'driver startup');assert.equal(first.done,false,stderr);startup=JSON.parse(first.value);assert.equal(startup.revision,UPSTREAM);
 const launched=await coordinator('launch',true);assert.equal(launched.payload.ok,true,JSON.stringify(launched.payload));const original=launched.payload.result;
 assert.equal(original.native.running,true);assert.equal(original.native.exitConfirmed,false);assert.ok(original.native.pid>1);assert.ok(original.native.startIdentity);
 launched.child.kill('SIGKILL');const [,signal]=await bounded(launched.exit,'crashed coordinator exit');assert.equal(signal,'SIGKILL');children.delete(launched.child);launched.reader.close();
 const recovered=await coordinator('recover');assert.equal(recovered.code,0);assert.equal(recovered.payload.result.run.fence,original.run.fence);assert.equal(recovered.payload.result.observation.pid,original.native.pid);assert.equal(recovered.payload.result.observation.creates,1);assert.equal(recovered.payload.result.observation.running,true);
 const early=await coordinator('confirm');assert.equal(early.code,1);assert.equal(early.payload.error,'native-termination-not-proven');
 const stale=await fetch(`${startup.base}/component`,{method:'POST',body:JSON.stringify({action:'stale-interrupt'}),signal:AbortSignal.timeout(5000)});assert.equal(stale.status,409);
 const miss=await stale.json();assert.equal(miss.code,'fence-mismatch');assert.equal(miss.partial,false);assert.equal(miss.found,original.native.inputFenceDigest);assert.ok(miss.found);
 const still=await coordinator('recover');assert.equal(still.payload.result.observation.running,true);assert.equal(still.payload.result.run.hold,true);
 const stopped=await coordinator('stop');assert.equal(stopped.code,0);assert.equal(stopped.payload.result.run.state,'stop-pending');assert.equal(stopped.payload.result.run.hold,true);assert.equal(stopped.payload.result.native.exitConfirmed,true);
 const rejected=await coordinator('stale-confirm');assert.equal(rejected.code,1);assert.equal(rejected.payload.error,'stale-termination');
 const retained=await coordinator('recover');assert.equal(retained.payload.result.run.hold,true);
 const confirmed=await coordinator('confirm');assert.equal(confirmed.code,0);assert.equal(confirmed.payload.result.hold,false);assert.equal(confirmed.payload.result.capacityHold,true);
 report={revision:UPSTREAM,binarySHA256:createHash('sha256').update(readFileSync(binary)).digest('hex'),scope:'real subprocess provider + local Plates bridge; not supervisor API',coordinatorKilled:signal,originalPID:original.native.pid,startIdentity:original.native.startIdentity,createCount:recovered.payload.result.observation.creates,checks:{restartRetainsOriginalWorker:true,earlyTerminationRefused:true,typedStaleNativeInterruptRefused:true,staleInterruptDidNotKillWorker:true,stopAcknowledgmentRetainsLane:true,kernelExitConfirmed:true,staleCallbackRefused:true,confirmedExitReleasesLane:true,unknownFundingRetained:true}};
} catch(error) {failure=error.stack;}
finally {
 const settled=await cleanupRuntime({children,driver,driverExit,bounded,readReceipt:async()=>{const finalLine=await iterator.next();return finalLine.done?null:JSON.parse(finalLine.value);}});
 cleanup=settled.cleanup;cleanupFailure=settled.errors.length?settled.errors:null;lines.close();
 if(!failure&&!cleanupFailure)rmSync(root,{recursive:true,force:true});
}

console.log(JSON.stringify({...report,status:failure||cleanupFailure?'failed':'passed',failure,cleanupFailure,retainedRoot:failure||cleanupFailure?root:null,cleanup,stderr},null,2));
if(failure||cleanupFailure)process.exitCode=1;
