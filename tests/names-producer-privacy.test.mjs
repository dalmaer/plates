import {test} from 'node:test';
import assert from 'node:assert/strict';
import {namesObservation,namesGeneratedFragment,namesDigest,namesLocalWrite} from '../practices/night/files/scripts/plates/verification.mjs';

test('generated observation fragments retain table tokens and never private prose',()=>{
  const observation=namesObservation('brief',{repositoryId:7});
  const body='Private Acme customer note\n<!-- plates:health-report:begin -->\nPrivate Acme health detail';
  const intended=namesGeneratedFragment(observation,'issue',body);
  assert.ok(intended);
  assert.ok(observation.fragments[0].text.includes('plates:health-report:begin'));
  assert.ok(!observation.fragments[0].text.includes('Private'));
  assert.ok(intended.names.every(n=>body.includes(n.value)));
  assert.notEqual(intended.sha256,namesDigest(body));
  const empty=namesGeneratedFragment(observation,'plain','Private Acme full issue body without markers');
  assert.equal(observation.fragments.find(f=>f.path===empty.fragment).text,'');
});
