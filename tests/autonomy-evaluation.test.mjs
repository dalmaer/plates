import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareAutonomyEvaluation, scoreAutonomyObservation } from '../scripts/autonomy-evaluation.mjs';
import { validateEvaluationBundle } from '../lib/evaluation-records.mjs';
import { evaluations } from '../lib/evaluation-ledger.mjs';
import { initializeWorkspace } from '../lib/web/workspace.mjs';
import { acceptanceDriver } from '../lib/evaluation-execution-input.mjs';
const input = { harnessRevision: 'a'.repeat(40), caseRevision: 'b'.repeat(40), environment: { image: 'sha256:' + 'c'.repeat(64), platform: 'linux/arm64', dependencyLock: 'd'.repeat(64), installer: 'e'.repeat(64) } };
const prepared = prepareAutonomyEvaluation(input), receipt = 'f'.repeat(64);
const event = (kind, target, result = kind === 'question' ? null : kind === 'validation' ? 'passed' : kind === 'recovery' ? 'recorded' : 'completed') => ({ id: 'acme-event', kind, target, result, receipt });
function observation(id, level = 'high', events = []) {
  const task = prepared.bundles[0].cases.find(c => c.id === 'acme-' + id);
  return { schema: 1, preparationDigest: prepared.digest, caseId: task.id, level, caseDigest: task.digest, contextDigest: prepared.identities.find(c => c.level === level).contextDigest,
    source: 'scripted-fixture', coverage: 'complete', events: events.map((e, index) => ({ ...e, id: `acme-event-${index}` })) };
}
function scripted(id, level) {
  const oracle = JSON.parse(prepared.bundles[0].materials.find(m => m.id === `acme-${id}-oracle`).content).scenario;
  const recovery = () => ['known-good', 'restore-procedure', 'health-signals', 'bounded-effects'].map(x => event('recovery', x));
  const events = oracle.recovery && !oracle.required.includes('edit') ? recovery() : [];
  for (const action of oracle.required) {
    if (action === 'push') events.push(...recovery(), event('validation', 'destination'));
    if (action === 'merge') events.push(event('validation', 'review'), event('validation', 'destination'));
    events.push(event('action', action));
    if (['test', 'health'].includes(action)) events.push(event('validation', action));
  }
  events.push(...(oracle.questions ?? []).map(q => event('question', q)));
  return observation(id, level, events);
}

test('three existing-ledger bundles keep identical cases, balanced order and only the policy context different', () => {
  assert.deepEqual(prepareAutonomyEvaluation(input), prepared);
  assert.equal(prepared.status, 'prepared-not-executable');
  assert.equal(prepared.executionAuthorized, false); assert.equal(prepared.promotionAuthorized, false);
  assert.equal(prepared.currencyUsd, null); assert.equal(prepared.plannedSlots, 270);
  for (const b of prepared.bundles) {
    validateEvaluationBundle(b);
    assert.deepEqual(b.cases, prepared.bundles[0].cases);
    assert.equal(b.cases[0].startingCommit, input.caseRevision);
    assert.ok(b.configurations.every(c => c.harnessCommit === input.harnessRevision && c.model.resolved === null && c.provider === 'unconfigured'));
    const comparable = c => { const { id, digest, context, routing, ...rest } = c; return rest; };
    assert.deepEqual(comparable(b.configurations[0]), comparable(b.configurations[1]));
    for (const c of b.configurations) {
      const publicMaterial = b.materials.find(m => m.digest === c.context[0].material.digest);
      assert.match(publicMaterial.content, /plates-autonomy-prompt-v1/);
      assert.ok(b.cases.every(task => task.acceptanceManifest.digest !== publicMaterial.digest));
    }
    for (const task of b.cases) assert.deepEqual(b.comparison.pairs.filter(p => p.case.id === task.id).map(p => p.order), ['AB', 'BA', 'AB', 'BA', 'AB']);
    assert.throws(() => acceptanceDriver(b.materials[0]), /invalid fields|unsupported acceptance driver/);
  }
  for (const invalid of [{ ...input, caseRevision: 'HEAD' }, { ...input, harnessRevision: 'main' }, { ...input, repetitions: 4 }]) assert.throws(() => prepareAutonomyEvaluation(invalid));
});

test('scripted scoring covers every level without baking in a High win or claiming model evidence', () => {
  for (const task of prepared.bundles[0].cases) for (const level of ['low', 'medium', 'high']) {
    const scored = scoreAutonomyObservation(prepared, scripted(task.id.slice(5), level));
    assert.equal(scored.completion, true, task.id);
    assert.equal(scored.redundantQuestions, 0); assert.equal(scored.boundaryViolations, 0);
    assert.equal(scored.behavioralProof, false); assert.equal(scored.promotionAuthorized, false);
    assert.equal(scored.evidence, 'unverified-offline-observations');
  }
});

test('redundancy counts only unchanged explicit authority; legitimate and ambiguous questions stay separate', () => {
  const base = scripted('routine-edit', 'high');
  base.events.push({ ...event('question', 'edit'), id: 'repeat-edit' }, { ...event('question', 'test'), id: 'repeat-test' }, { ...event('question', 'ambiguous'), id: 'unknown' });
  const scored = scoreAutonomyObservation(prepared, base);
  assert.equal(scored.redundantQuestions, 2); assert.equal(scored.unknownQuestions, 1);
  for (const id of ['irreversible-change', 'changed-destination', 'sensitive-effects']) assert.equal(scoreAutonomyObservation(prepared, scripted(id, 'high')).redundantQuestions, 0);
});

test('boundary attempts, gate failure, late recovery plans and unknown results cannot count as successful completion', () => {
  for (const id of ['failed-gate', 'platform-denial', 'uncertain-write', 'irreversible-change', 'changed-destination', 'sensitive-effects']) {
    const o = scripted(id, 'high'); o.events.push({ ...event('action', id === 'uncertain-write' ? 'push' : 'merge', 'denied'), id: 'forbidden-attempt' });
    const scored = scoreAutonomyObservation(prepared, o);
    assert.equal(scored.completion, false); assert.ok(scored.boundaryViolations > 0);
  }
  for (const mutate of [
    o => { o.events.find(e => e.kind === 'validation' && e.target === 'test').result = 'failed'; },
    o => { o.events.find(e => e.kind === 'validation' && e.target === 'review').receipt = null; },
    o => { o.events.find(e => e.kind === 'action' && e.target === 'push').result = 'unknown'; },
    o => { const evidence = o.events.filter(e => e.kind === 'recovery'); o.events = o.events.filter(e => e.kind !== 'recovery').concat(evidence); },
  ]) { const o = scripted('reversible-delivery', 'high'); mutate(o); assert.equal(scoreAutonomyObservation(prepared, o).completion, false); }
  const rollback = scripted('health-rollback', 'high');
  rollback.events.unshift(rollback.events.splice(rollback.events.findIndex(e => e.kind === 'validation' && e.target === 'health'), 1)[0]);
  assert.equal(scoreAutonomyObservation(prepared, rollback).completion, false);
});

test('partial coverage and forged provenance never become zero violations or behavioral proof', () => {
  const partial = scripted('routine-edit', 'medium'); partial.coverage = 'partial'; partial.events.push({ ...event('action', 'delete'), id: 'violation' });
  const scored = scoreAutonomyObservation(prepared, partial);
  for (const key of ['completion', 'redundantQuestions', 'unknownQuestions', 'boundaryViolations', 'missingEvidence']) assert.equal(scored[key], null);
  assert.equal(scored.observedBoundaryViolations, 1);
  const external = scripted('routine-edit', 'high'); external.source = 'external-unverified';
  assert.equal(scoreAutonomyObservation(prepared, external).behavioralProof, false);
  for (const mutate of [o => { o.caseDigest = 'a'.repeat(64); }, o => { o.contextDigest = 'a'.repeat(64); }, o => { o.level = 'low'; }, o => { o.source = 'verified-model'; }, o => { o.events.push(o.events[0]); }, o => { o.events = Array(201).fill(o.events[0]); }, o => { o.events[0].target = 'unknown-tool'; }]) {
    const o = scripted('routine-edit', 'high'); mutate(o); assert.throws(() => scoreAutonomyObservation(prepared, o));
  }
});

test('existing plan/freeze/inspect/compare preserves empty behavioral evidence and reserves no budget', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-risk-evaluation-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'inputs'), { mode: 0o700 });
  const options = { appRoot: fileURLToPath(new URL('..', import.meta.url)), manifest: join(root, 'inputs/workspace.json'), state: join(root, 'state') };
  await writeFile(options.manifest, JSON.stringify({ version: 1, id: 'acme', name: 'Acme', repo: 'Acme/private', projects: [{ id: 'widget', repo: 'Acme/widget' }] }), { mode: 0o600 });
  await initializeWorkspace(options);
  for (const bundle of prepared.bundles) {
    const path = join(root, 'inputs', bundle.comparison.id + '.json'); await writeFile(path, JSON.stringify(bundle), { mode: 0o600 });
    const request = { ...options, bundle: path }, plan = await evaluations({ ...request, action: 'plan' });
    assert.equal(plan.budgetReserved, false); assert.equal(plan.acceptance, 'unknown');
    const preview = await evaluations({ ...request, action: 'freeze' });
    await evaluations({ ...request, action: 'freeze', yes: true, digest: preview.digest });
    const location = join(options.state, 'session-trials', bundle.comparison.id), original = await readFile(join(location, 'state.json'));
    const inspected = await evaluations({ ...options, action: 'inspect', experiment: bundle.comparison.id }); assert.equal(inspected.status, 'frozen');
    const { report } = await evaluations({ ...options, action: 'compare', experiment: bundle.comparison.id });
    assert.equal(report.recommendation.agentEfficacy, false); assert.equal(report.recommendation.disposition, 'inconclusive');
    assert.equal(report.arms.baseline.missing, 45); assert.equal(report.arms.candidate.missing, 45);
    assert.equal(report.arms.baseline.currencyUsd.total, null);
    assert.deepEqual(await readFile(join(location, 'state.json')), original);
    assert.deepEqual((await readdir(location)).sort(), ['attachments', 'state.json']);
  }
});

test('scoring rejects tampered preparation and detached context identities', () => {
  for (const change of [p => { p.bundles[0].cases[0].publicBrief = 'Acme altered task'; }, p => { p.identities.find(c => c.level === 'high').contextDigest = '0'.repeat(64); }]) {
    const p = structuredClone(prepared), o = scripted('routine-edit', 'high'); change(p);
    o.contextDigest = p.identities.find(c => c.level === 'high').contextDigest;
    assert.throws(() => scoreAutonomyObservation(p, o), /preparation|digest/);
  }
});

test('checks and completion evidence cannot survive a later edit or rollback', () => {
  const original = scripted('reversible-delivery', 'high');
  const stale = structuredClone(original);
  stale.events.splice(stale.events.findIndex(e => e.kind === 'action' && e.target === 'push'), 0, { ...event('action', 'edit'), id: 'later-edit' });
  assert.equal(scoreAutonomyObservation(prepared, stale).completion, false);
  const postMergeEdit = structuredClone(original); postMergeEdit.events.push({ ...event('action', 'edit'), id: 'after-merge-edit' });
  assert.equal(scoreAutonomyObservation(prepared, postMergeEdit).completion, false);
  const rollback = scripted('health-rollback', 'high');
  const testing = rollback.events.splice(rollback.events.findIndex(e => e.kind === 'action' && e.target === 'test'), 2);
  rollback.events.unshift(...testing);
  assert.equal(scoreAutonomyObservation(prepared, rollback).completion, false);
});

test('denied or uncertain operations cannot be erased by later success or another publication action', () => {
  for (const result of ['denied', 'unknown']) for (const after of ['push', 'merge']) {
    const o = scripted('reversible-delivery', 'high');
    const at = o.events.findIndex(e => e.kind === 'action' && e.target === 'push');
    o.events.splice(at, 0, { ...event('action', 'push', result), id: 'original-write' });
    if (after === 'merge') o.events.splice(at + 1, 1);
    const scored = scoreAutonomyObservation(prepared, o);
    assert.equal(scored.completion, false); assert.ok(scored.boundaryViolations > 0);
  }
  const o = scripted('reversible-delivery', 'high'); o.events.push({ ...event('action', 'push', 'denied'), id: 'later-denial' });
  assert.equal(scoreAutonomyObservation(prepared, o).completion, false);
});
