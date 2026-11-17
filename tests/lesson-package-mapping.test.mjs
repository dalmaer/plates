// Package schema and mapping cases split from lesson-package.test.mjs to run independently of its lifecycle case.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {screeningWorld,syntheticTerminalReceipts} from './helpers/lesson-screening.mjs';
import {evaluationSection,ref,validateRequest} from '../lib/evaluated-lessons.mjs';
import {fingerprint,canonical,byteDigest} from '../lib/evaluation-records.mjs';
import {validatePublicPackage} from '../lib/evaluated-learning-package.mjs';
async function evaluated(t,{semanticDeadline=false}={}){const w=await screeningWorld(t,{worldOptions:{semanticDeadline}});await syntheticTerminalReceipts(w);const applied=(await w.call('evaluate',{proposalRef:w.proposalRef,evaluationPlanRef:w.evaluationPlanRef},{previous:w.registered,apply:true})).result;const history=evaluationSection(applied.outputBytes).value,evaluation=history.records.find(r=>r.kind==='learning-evaluation');return {...w,applied,history,evaluation};}
test('Acme package schema refuses nested fields and caller-ready flags',async t=>{const w=await evaluated(t),m=await w.load('evaluated-learning'),p=await m.evaluatedLearning({...w.options,dir:w.repo,env:w.env,slug:'2026-10-24-acme',action:'package'});const changed=structuredClone(p.payload);changed.mapping.entries[0].approved=true;assert.throws(()=>validatePublicPackage(changed));const request={schemaVersion:1,operationId:'e1a5ac91-1d10-4dee-a7c7-aab394fef3d0',expected:{fileDigest:w.applied.outputDigest,generation:w.applied.generation},actor:'Acme',at:'2026-10-24T00:00:00.000Z',reason:'Acme',decisionTarget:{kind:'phase',ref:'1'},action:'ready',payload:{proposalRef:w.proposalRef,packageRef:ref(w.evaluation),ready:true}};assert.throws(()=>validateRequest(request));});

test('Acme differing tested overlay cannot establish installed base; binary prior bytes retain exact size with inverse unavailable',async t=>{
  const {promotionWorld}=await import('./helpers/lesson-promotion.mjs');
  for(const [baselineContent,gitBefore,baseMatches]of [['Acme overlay\n','Acme installed\n',false],['Acme\0binary','Acme\0binary',true]]){
    const w=await promotionWorld(t,{worldOptions:{baselineContent,gitBefore}}),pack=await w.learning.evaluatedLearning(w.packageOptions),entry=pack.payload.mapping.entries[0];
    assert.equal(entry.before.byteLength,Buffer.byteLength(gitBefore));assert.equal(entry.before.byteDigest,byteDigest(gitBefore));assert.equal(entry.baseMatches,baseMatches);assert.equal(pack.payload.inverse.available,false);assert.ok(pack.readiness.gaps.includes('inverse_unavailable'));
  }
});
