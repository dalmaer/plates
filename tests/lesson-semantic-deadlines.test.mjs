// Test-only semantic budgets and independent production deadline controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { invokeSemanticLearning } from './helpers/evaluated-learning.mjs';
import { screeningWorld } from './helpers/lesson-screening.mjs';
import { evaluationSection } from '../lib/evaluated-lessons.mjs';
import { byteDigest } from '../lib/evaluation-records.mjs';

test('semantic learning deadlines are fresh for preview, apply and original-operation replay without mutating saved options', async () => {
  let now = 1_000, clockReads = 0;
  const captured = [], original = Object.freeze({ input: '/acme/request.json', action: 'decide', deadline: 17 });
  const invoke = options => invokeSemanticLearning({ evaluatedLearning: async actual => {
    captured.push(actual);
    const held = actual.deadline;
    now += 400_000; // Earlier invocation exhausts more than the entire allowance.
    await Promise.resolve();
    assert.equal(actual.deadline, held, 'deadline never renews within an invocation');
    return { digest: 'acme-original-preview' };
  } }, options, () => { clockReads++; return now; });
  const preview = await invoke(original);
  const applied = Object.freeze({ ...original, yes: true, digest: preview.digest });
  await invoke(applied);
  await invoke(applied); // Same original operation, not a new request.
  assert.deepEqual(captured.map(v => v.deadline), [301_000, 701_000, 1_101_000]);
  assert.equal(clockReads, 3);
  assert.equal(original.deadline, 17); assert.equal(applied.deadline, 17);
  for (const value of captured.slice(1)) assert.deepEqual(value, { ...applied, deadline: value.deadline });
  let calls = 0;
  await assert.rejects(async () => invokeSemanticLearning({ evaluatedLearning: () => {
    calls++; throw new Error('Acme refused');
  } }, original, () => now), /Acme refused/);
  assert.equal(calls, 1, 'failure does not retry the invocation');
});

async function bytesUnder(root) {
  const entries = [];
  async function visit(dir, prefix = '') {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name), relative = prefix + entry.name;
      if (entry.isDirectory()) { entries.push([relative + '/', null]); await visit(path, relative + '/'); }
      else { assert.ok(entry.isFile(), 'synthetic evidence must be regular'); entries.push([relative, byteDigest(await readFile(path))]); }
    }
  }
  await visit(root); return entries;
}

test('production candidate and binding refuse expired caller and default deadlines without publishing', async t => {
  const w = await screeningWorld(t, { register: false, worldOptions: { semanticDeadline: true } });
  const binding = await w.load('evaluated-learning-binding');
  const history = evaluationSection(w.bound.outputBytes).value;
  const proposal = history.records.find(r => r.kind === 'learning-proposal');
  const candidate = w.proposal(w.lessonRef);
  const payload = { proposalRef: w.proposalRef, experimentId: w.b.comparison.id, expectedPlanDigest: w.draft.digest,
    targetCaseIds: ['acme-case-0'], controlCaseIds: ['acme-case-1'], heldOutCaseIds: [] };
  const options = { ...w.options, root: w.repo, repository: 'Acme/widget', decisionTarget: { kind: 'phase', ref: '1' } };
  const before = { inbox: await bytesUnder(join(w.repo, 'docs/inbox')), ledger: await bytesUnder(w.dir) };
  for (const [name, call] of [
    ['deriveCandidate', opts => binding.deriveCandidate(opts, candidate)],
    ['bindLearningPlan', opts => binding.bindLearningPlan(opts, payload, proposal)],
  ]) {
    // Positive control proves these are valid inputs, not an earlier refusal.
    await call({ ...options, deadline: Date.now() + 300_000 });
    await assert.rejects(call({ ...options, deadline: 0 }), /source export preparation deadline/, name + ': absolute caller deadline is retained');
    let reads = 0;
    const start = Date.now();
    const clock = t.mock.method(Date, 'now', () => reads++ === 0 ? start : start + 30_001);
    try {
      await assert.rejects(call(options), /source export preparation deadline/, name + ': default budget includes work before export');
      assert.ok(reads >= 2, 'default deadline is established then checked');
    } finally { clock.mock.restore(); }
    assert.deepEqual({ inbox: await bytesUnder(join(w.repo, 'docs/inbox')), ledger: await bytesUnder(w.dir) }, before, name + ': no publication or journal change');
  }
});
