import test from 'node:test';
import assert from 'node:assert/strict';
import { readCodexCapacity } from '../lib/capacity/codex-app-server.mjs';
import { bindCodexCapacity } from '../lib/capacity/codex-capacity.mjs';
import { capacityModel } from '../lib/web/capacity.mjs';
import { protocolFixture,usage,binding,NOW } from './helpers/codex-capacity.mjs';
const read=f=>readCodexCapacity({launch:f.launch},f.dependencies);
test('fixed read-only protocol is private and requires independent pool/model authority',async t=>{
 const f=await protocolFixture(t),raw=await read(f),calls=await f.requests();
 assert.deepEqual(calls.map(c=>c.method),['initialize','initialized','account/read','account/rateLimits/read']);
 assert.deepEqual(calls[2].params,{refreshToken:false});assert.deepEqual(calls[3].params,{supportsLunaReserve:false,excludeResetCreditDetails:true});
 assert.equal(calls[0].params.capabilities.explicitGatewayOauth,true);assert.doesNotMatch(JSON.stringify(raw),/PRIVATE|explicit-home|email|credit|upsell/i);
 assert.equal(raw.compatibility,'source-schema-only');assert.equal(raw.buckets.length,1);
 const selected=bindCodexCapacity(raw,binding(),{now:NOW});assert.deepEqual(selected.gaps,[]);assert.equal(selected.observations.length,2);assert.equal(capacityModel(selected.observations,{now:NOW}).pools.every(p=>p.eligible),true);
 assert.deepEqual(selected.observations[0].models.ids,['acme-model']);assert.equal(selected.observations[0].measurement.remaining,75);
 assert.equal(bindCodexCapacity(raw,{...binding(),pools:[]},{now:NOW}).observations.length,0);
});
test('no default start, noncanonical launch, expired or mismatched authorization never spawns',async t=>{
 const f=await protocolFixture(t);await assert.rejects(readCodexCapacity({launch:f.launch}),/not_authorized/);
 for(const change of [{args:['app-server','--help']},{executable:'codex'}])await assert.rejects(readCodexCapacity({launch:{...f.launch,...change}},f.dependencies),/not_authorized/);
 for(const change of [{expiresAt:new Date(NOW).toISOString()},{launchDigest:'a'.repeat(64)},{expectedAccountId:null}])await assert.rejects(readCodexCapacity({launch:f.launch},{...f.dependencies,authorizeStart:async()=>({...f.grant,...change})}),/not_authorized/);
 assert.equal(f.starts(),0);
});
test('authorization is checked again after the response; changed account cannot escape',async t=>{
 const f=await protocolFixture(t);let n=0;
 await assert.rejects(readCodexCapacity({launch:f.launch},{...f.dependencies,authorizeStart:async()=>({...f.grant,...(++n===2?{expectedAccountId:'another'}:{})})}),/authorization_changed/);
});
test('absent account identity, email, permission null/false and past reset never imply recovery',async t=>{
 for(const patch of [{accountId:null},{accountId:'another'},{ordinaryUsageAllowed:false},{ordinaryUsageAllowed:null}]) {
  const f=await protocolFixture(t,{response:{...usage(),...patch}}),raw=await read(f);assert.ok(raw.gaps.length);assert.equal(bindCodexCapacity(raw,binding(),{now:NOW}).observations.length,0);if(Object.hasOwn(patch,'accountId')){assert.equal(raw.accountId,null);assert.deepEqual(raw.buckets,[]);assert.doesNotMatch(JSON.stringify(raw),/another/);}
 }
 const response=usage();response.rateLimitsByLimitId['acme-limit'].primary.resetsAt=NOW/1000-1;
 const raw=await read(await protocolFixture(t,{response}));assert.equal(raw.buckets[0].primary.usedPercent,25);assert.equal(bindCodexCapacity(raw,binding(),{now:NOW}).observations.length,0);
});
test('backend blocking, contradictory buckets, new windows and model aliases remain conservative',async t=>{
 const raw=await read(await protocolFixture(t));
 for(const changed of [{...binding(),expectedAccountId:'another'},{...binding(),pools:[{...binding().pools[0],windows:[{slot:'primary',durationMinutes:300}]}]}])assert.equal(bindCodexCapacity(raw,changed,{now:NOW}).observations.length,0);
 for(const patch of [{spendControlReached:true},{rateLimitReachedType:'rate_limit_reached'}]){const r=usage();Object.assign(r.rateLimitsByLimitId['acme-limit'],patch);assert.equal(bindCodexCapacity(await read(await protocolFixture(t,{response:r})),binding(),{now:NOW}).observations.length,0);}
 const mismatch=usage();mismatch.rateLimitsByLimitId['acme-limit'].limitId='other';await assert.rejects(read(await protocolFixture(t,{response:mismatch})),/protocol_invalid/);
});
test('actual fake processes enforce framing, request, byte and stderr boundaries without echoing input',async t=>{
 for(const mode of ['request','notification','wrong-id','duplicate','invalid-utf8','oversize','stderr','error']){
  const f=await protocolFixture(t,{mode});await assert.rejects(read(f),error=>{assert.doesNotMatch(error.message,/PRIVATE/);return /codex_/.test(error.message);});
 }
 const f=await protocolFixture(t,{mode:'utf8'});assert.equal((await read(f)).accountId,'acme-account');
});
test('stalled process ignores TERM then is killed; cancellation and deadlines close the owned transport',async t=>{
 const f=await protocolFixture(t,{mode:'hang'}),start=Date.now();await assert.rejects(readCodexCapacity({launch:f.launch},{...f.dependencies,timeoutMs:100}),/read_timeout/);assert.ok(Date.now()-start<1500);
 const abort=new AbortController();abort.abort();const no=await protocolFixture(t);await assert.rejects(readCodexCapacity({launch:no.launch,signal:abort.signal},no.dependencies),/unavailable/);assert.equal(no.starts(),0);
});
test('initial/final authorization callbacks share the deadline and late expiry is refused',async t=>{
 for(const late of [false,true]){const f=await protocolFixture(t);let calls=0;const start=Date.now();await assert.rejects(readCodexCapacity({launch:f.launch},{...f.dependencies,timeoutMs:150,authorizeStart:async()=>{if(++calls===(late?2:1))return new Promise(()=>{});return f.grant;}}),/read_timeout/);assert.ok(Date.now()-start<1000);if(!late)assert.equal(f.starts(),0);}
 const f=await protocolFixture(t);let calls=0;await assert.rejects(readCodexCapacity({launch:f.launch},{...f.dependencies,authorizeStart:async()=>({...f.grant,...(++calls===2?{expiresAt:new Date(NOW).toISOString()}: {})})}),/authorization_changed/);
 const renewed=await protocolFixture(t);let clock=NOW,renewals=0;await assert.rejects(readCodexCapacity({launch:renewed.launch},{...renewed.dependencies,now:()=>clock,authorizeStart:async()=>{if(++renewals===1)return {...renewed.grant,expiresAt:new Date(NOW+1000).toISOString()};clock=NOW+1001;return {...renewed.grant,checkedAt:new Date(clock).toISOString(),expiresAt:new Date(clock+1000).toISOString()};}}),/authorization_changed/);
});
test('owned process group is killed when an exited parent leaves a descendant holding pipes',async t=>{
 const f=await protocolFixture(t,{mode:'descendant'}),start=Date.now(),abort=new AbortController(),spawnProcess=f.dependencies.spawnProcess;await assert.rejects(readCodexCapacity({launch:f.launch,signal:abort.signal},{...f.dependencies,timeoutMs:4000,spawnProcess:(...args)=>{const child=spawnProcess(...args);child.once('exit',()=>abort.abort());return child;}}),/read_aborted/);assert.ok(Date.now()-start<6000);const pid=(await f.requests()).find(row=>row.descendant)?.descendant;assert.ok(pid>1);
 // Only inspect the known synthetic descendant; no ambient process inventory.
 let gone=false;for(let i=0;i<100;i++){try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH'){gone=true;break;}}await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(gone,true,'owned descendant no longer exists');
});
