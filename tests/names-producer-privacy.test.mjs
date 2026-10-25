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


test('producer transfer refuses duplicate embedded projection keys before export',async()=>{
  const {namesProducerTransfer,decodeNamesProducerTransfer}=await import('../lib/names-verify.mjs');
  const texts=[
    '{"date":"Private Acme payload","date":"2026-10-24","items":[]}',
    '{"date":"Private Acme payload","\\u0064ate":"2026-10-24","items":[]}',
    '{"date":"2026-10-24","items":[{"id":"Private Acme payload","id":"acme","kind":"task","status":"planned"}]}',
    '{"date":"2026-10-24","items":[{"id":"Private Acme payload","\\u0069d":"acme","kind":"task","status":"planned"}]}',
    '[{"sha":"Private Acme payload","sha":"'+ 'a'.repeat(40)+'","ok":true,"at":"2026-10-24T10:00:00Z"}]',
    '{"before":[],"after":[],"actions":[{"number":"Private Acme payload","number":1,"head":"plates/acme","action":"leave","done":false}]}',
  ];
  for(const text of texts){
    const value={producerId:'improve',writes:[],reads:[],fragments:[{path:'fragments/projection.txt',kind:'projection',text}],gaps:[]};
    const encoded=await namesProducerTransfer({producerId:'improve',value,manifest:{files:[],gaps:[]}});
    assert.ok(!Buffer.from(encoded,'base64').toString().includes('Private Acme'),text);
    assert.equal(decodeNamesProducerTransfer(encoded).value.gaps[0]?.code,'producer-output-unavailable');
  }
});
