import assert from 'node:assert/strict';
export const CHECKS = ['allowedRead','allowedWrite','scorer','heldout','sibling','credentialCanary','scoreWrite','symlinkRead','hardlinkCreate','parentSignal','childInheritance','tcpNetwork','unixNetwork','udpNetwork','sanitizedEnvironment'];
export function validateChecks(checks) {
  assert.ok(checks && typeof checks === 'object' && !Array.isArray(checks));
  assert.deepEqual(Object.keys(checks).sort(), [...CHECKS].sort(), 'complete probe evidence required');
  for (const name of CHECKS) {
    const value = checks[name];
    if (['allowedRead','allowedWrite','sanitizedEnvironment'].includes(name)) assert.equal(value, true, name);
    else if (name === 'childInheritance') {
      assert.deepEqual(Object.keys(value).sort(), ['denied','output','status']);
      assert.equal(value.denied, true); assert.equal(value.status, 0);
      assert.ok(['EPERM','EACCES'].includes(value.output));
    } else {
      assert.deepEqual(Object.keys(value).sort(), ['code','denied']);
      assert.equal(value.denied, true, name);
      assert.ok(['EPERM','EACCES'].includes(value.code), name);
    }
  }
  return checks;
}
export function bounded(promise, label, ms = 10000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`timeout: ${label}`)), ms); })]).finally(() => clearTimeout(timer));
}
// Register ownership immediately after acquisition, before any fallible setup.
export async function cleanupAll(closers, ms = 3000) {
  return (await Promise.allSettled(closers.map(async close => bounded(Promise.resolve().then(close), 'resource cleanup', ms))))
    .filter(result => result.status === 'rejected').map(result => result.reason.message);
}
