// Follow-up and stale approval cases split from lesson-promotion.test.mjs to shorten its serial path.
import {parseProposal,inboxText} from '../lib/learn.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {promotionWorld} from './helpers/lesson-promotion.mjs';
import {ref,evaluationSection,seal,validateHistory,serializeEvaluation,replay} from '../lib/evaluated-lessons.mjs';
import {validatePromotionRecord,validateInverse} from '../lib/evaluated-learning-promotion-records.mjs';
import {fingerprint,byteDigest} from '../lib/evaluation-records.mjs';
import {artifactFor} from '../lib/evaluated-learning-package.mjs';
// Explicitly synthetic observations for pure record/replay tests only.
const syntheticRepair=()=>{const identity={kind:'phase',repository:'Acme/widget',ref:'1',identity:{issueId:null,path:'docs/phases/1-acme.md'}};return {...identity,identityDigest:fingerprint(identity),state:'planned',sourceDigest:'a'.repeat(64)};};
test('Acme follow-up selected source deduplicates and cannot invent exposure, cross-proposal decisions or unresolved relations',async t=>{
  const w=await promotionWorld(t),p={...w.followup,selections:w.capture.selections};
  const op=await w.call('follow-up',p,{previous:w.applied,apply:true}),history=evaluationSection(op.result.outputBytes).value,follow=history.records.at(-1);
  assert.equal(follow.data.sourceCoverage.selected,1);assert.equal(follow.data.sourceCoverage.distinctVerifiedIncidents,0);assert.equal(follow.data.sourceCoverage.unknownIncidentSources,1);assert.equal(history.records.filter(r=>r.kind==='learning-source').length,1);
  assert.equal((await w.learning.evaluatedLearning({...op.opts,yes:true,digest:op.preview.digest})).alreadyApplied,true);
  const forged=structuredClone(history),prior=forged.records.at(-1);forged.records[forged.records.length-1]=seal({...Object.fromEntries(Object.entries(prior).filter(([k])=>k!=='digest')),data:{...prior.data,eligibleExposure:0}});const e=forged.events.at(-1);forged.events[forged.events.length-1]=seal({...Object.fromEntries(Object.entries(e).filter(([k])=>k!=='digest')),recordRefs:[ref(forged.records.at(-1))]});assert.throws(()=>validateHistory(forged));
  await assert.rejects(w.call('follow-up',{...p,decisionRef:w.proposalRef},{previous:op.result}),/followup_wrong_decision/);
  await assert.rejects(w.call('follow-up',{...p,relation:{recordRef:{...w.proposalRef,digest:'e'.repeat(64)},relation:'related'}},{previous:op.result}),/unresolved_or_ambiguous/);
});
test('Acme stale package approval preserves inbox and report; rejected evidence remains packageable',async t=>{
  const w=await promotionWorld(t),p={proposalRef:w.proposalRef,evaluationRef:ref(w.evaluation)},preview=await w.call('record-package',p,{previous:w.applied});
  const before=await readFile(join(w.repo,'docs/inbox/2026-10-24-acme.md'));
  await assert.rejects(w.learning.evaluatedLearning({...preview.opts,yes:true,digest:'0'.repeat(64)}),/stale_learning_preview/);assert.deepEqual(await readFile(join(w.repo,'docs/inbox/2026-10-24-acme.md')),before);
  const rejected=(await w.call('reject',{evidenceRefs:[ref(w.evaluation)]},{previous:w.applied,apply:true})).result;assert.equal(rejected.status,'rejected');
  assert.equal((await w.learning.evaluatedLearning(w.packageOptions)).payload.disposition,'inconclusive');
  await assert.rejects(w.call('revise',{supersedesRef:w.proposalRef,proposal:w.proposal(w.lessonRef),scopeChangeReason:'Acme'},{previous:rejected}),/invalid_proposal_state/);
});
