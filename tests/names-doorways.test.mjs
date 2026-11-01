import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as canonical from '../practices/night/files/scripts/plates/names.mjs';

// Source doorways expose the same live bindings; installed runtimes own the
// canonical file. No source-only climb lib.mjs or CLI activation is needed.
for (const path of [
  '../lib/names.mjs',
  '../practices/loop/files/scripts/plates/names.mjs',
  '../practices/climb/files/scripts/plates/names.mjs',
  '../practices/reconciliation/files/scripts/plates/names.mjs',
]) {
  test(`canonical names export parity and identity: ${path}`, async () => {
    const doorway = await import(path);
    assert.deepEqual(Object.keys(doorway).sort(), Object.keys(canonical).sort());
    for (const key of Object.keys(canonical)) assert.equal(doorway[key], canonical[key], `${path}: ${key} is the canonical binding`);
  });
}

test('climb source doorway provides the branchSuffix binding required by waitingJobs', async () => {
  const doorway = await import('../practices/climb/files/scripts/plates/names.mjs');
  assert.equal(doorway.branchSuffix, canonical.branchSuffix);
  assert.equal(doorway.branchSuffix('plates-climb/acme/1', 'git ref:keel-climb/'), 'acme/1');
  assert.equal(doorway.branchSuffix('keel-climb/acme/1', 'git ref:keel-climb/'), 'acme/1');
  assert.equal(doorway.branchSuffix('acme/other', 'git ref:keel-climb/'), null);
});

test('checked environment facade retains canonical identity function and conflict validation',async()=>{
 const facade=await import('../practices/night/files/scripts/plates/names-environment.mjs');
 assert.deepEqual(Object.keys(facade),['identityEnvironmentValue']);
 assert.equal(facade.identityEnvironmentValue,canonical.identityEnvironmentValue);
 assert.throws(()=>facade.identityEnvironmentValue('variable:KEEL_SUITE_PLAN',{PLATES_SUITE_PLAN:'acme-one',KEEL_SUITE_PLAN:'acme-two'}),{code:'conflicting_names'});
});
