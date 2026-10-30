import test from 'node:test';
import assert from 'node:assert/strict';
import {CHECKS,validateChecks,cleanupAll} from '../experiments/gas-city/containment-evidence.mjs';
import {cleanEnvironment} from '../experiments/gas-city/containment.mjs';
function receipt() {
  return Object.fromEntries(CHECKS.map(name => [name,
    ['allowedRead','allowedWrite','sanitizedEnvironment'].includes(name) ? true :
      name === 'childInheritance' ? {denied:true,status:0,output:'EPERM'} : {denied:true,code:'EPERM'}]));
}
test('containment requires complete positive and denial evidence, not claimed booleans', () => {
  assert.equal(validateChecks(receipt()).allowedRead,true);
  assert.throws(()=>validateChecks({}));
  for(const name of CHECKS) { const copy=receipt();delete copy[name];assert.throws(()=>validateChecks(copy),name); }
  for(const code of ['ENOENT','ECONNREFUSED','TIMEOUT','CONNECTED']) { const copy=receipt();copy.tcpNetwork.code=code;assert.throws(()=>validateChecks(copy)); }
  const copy=receipt();copy.childInheritance.status=1;assert.throws(()=>validateChecks(copy));
  assert.throws(()=>validateChecks({...receipt(),forged:true}));
});
test('cleanup attempts every owned resource after another closer fails or stalls', async () => {
  const seen=[];
  const errors=await cleanupAll([()=>{seen.push(1);throw Error('first');},()=>new Promise(()=>{}),()=>{seen.push(3);}],10);
  assert.deepEqual(seen,[1,3]);assert.deepEqual(errors,['first','timeout: resource cleanup']);
});
test('worker environment is an explicit whitelist without auth, preload or user config', () => {
  const env=cleanEnvironment({scratch:'/tmp'});
  assert.deepEqual(Object.keys(env).sort(),['PATH','TMPDIR','GIT_CONFIG_GLOBAL','GIT_CONFIG_NOSYSTEM','GIT_TERMINAL_PROMPT','GIT_OPTIONAL_LOCKS','GIT_CONFIG_COUNT','GIT_CONFIG_KEY_0','GIT_CONFIG_VALUE_0','GIT_CONFIG_KEY_1','GIT_CONFIG_VALUE_1'].sort());
  assert.equal(env.GIT_CONFIG_GLOBAL,'/dev/null');assert.equal(env.GIT_CONFIG_VALUE_0,'/dev/null');
});
