// Exact live policy authoring; no runtime activation or provider calls.
import './helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { acmeCaseEnvironments, acmeEvaluationPlan } from './helpers/evaluation-plan.mjs';
import { sealRecord, validateEvaluationBundle } from '../lib/evaluation-records.mjs';
import { fingerprint } from '../lib/evaluation-records.mjs';
import { validateTrialChain } from '../lib/evaluation-execution.mjs';
const ref = r => ({ kind: r.kind, id: r.id, digest: r.digest });
function reseal(b) {
  b.cases = b.cases.map(sealRecord);
  b.configurations = b.configurations.map(c => sealRecord({ ...c, environments: [...b.cases].sort((a, b) => a.id.localeCompare(b.id)).map(t => ({ case: ref(t), environment: t.environment })) }));
  b.comparison = sealRecord({ ...b.comparison, baseline: ref(b.configurations[0]), candidate: ref(b.configurations[1]), cases: b.cases.map(ref),
    pairs: b.comparison.pairs.map(p => ({ ...p, case: ref(b.cases.find(c => c.id === p.case.id)) })) });
  return b;
}
function fixture() {
  const b = acmeCaseEnvironments();
  for (const c of b.cases) c.limits.currencyUsd = 1;
  for (const c of b.configurations) {
    c.provider = c.routing.provider = 'openai'; c.model = { requested: 'acme-alias', resolved: 'acme-resolved', unresolvedReason: null };
    c.runtime = { name: 'single-generation-container-v1', version: '1.0.0', settings: { temperature: null, maxTokens: 1000 } };
    c.policy.execution = 'host-gateway-v1';
  }
  b.comparison.allowance.currencyUsd = 20; return reseal(b);
}
test('explicit mapped live policy validates without changing legacy offline bytes', () => {
  const legacy = acmeEvaluationPlan(), before = JSON.stringify(legacy);
  validateEvaluationBundle(legacy); assert.equal(JSON.stringify(legacy), before);
  const b = fixture(), bytes = JSON.stringify(b); validateEvaluationBundle(b); assert.equal(JSON.stringify(b), bytes);
});
test('live policy refuses mixed arms, unsupported runtime and unknown funding', () => {
  for (const mutate of [
    b => { b.configurations[0].policy.execution = 'offline-only'; },
    b => { b.configurations[0].runtime.version = '1'; },
    b => { b.configurations[0].runtime.settings.temperature = 0; },
    b => { b.configurations[0].model.resolved = null; b.configurations[0].model.unresolvedReason = 'Acme unknown'; },
    b => { b.cases[0].limits.currencyUsd = null; },
    b => { b.cases[0].limits.currencyUsd = 0.0000001; },
    b => { b.comparison.allowance.currencyUsd = null; },
  ]) { const b = fixture(); mutate(b); assert.throws(() => validateEvaluationBundle(reseal(b))); }
});
test('live builder chains bind the sealed intent snapshot and original attempt identity', () => {
  const b = fixture(), task = b.cases[0], config = b.configurations[0], pair = b.comparison.pairs[0], slot = pair.id + '-baseline', id = 'a'.repeat(32);
  const plan = { bundle: b, digest: 'b'.repeat(64) };
  const input = { planDigest: plan.digest, taskDigest: task.digest, configurationDigest: config.digest, checkManifestDigest: task.acceptanceManifest.digest,
    request: { pairId: pair.id, arm: 'baseline' }, environment: task.environment, image: { requested: task.environment.image, platform: task.environment.platform } };
  const intent = sealRecord({ schemaVersion: 2, kind: 'evaluation-intent', id, slot, input, previewDigest: fingerprint(input),
    operations: [`plates-eval-${id}-builder`], dispatchProtocol: 'ordered-live-authorization-v1' });
  validateTrialChain({ intent }, plan, slot);
  const changed = structuredClone(intent); changed.input.unapprovedField = 'Acme changed source';
  assert.throws(() => validateTrialChain({ intent: sealRecord(changed) }, plan, slot), /snapshot mismatch/);
  const marker = sealRecord({ schemaVersion: 2, kind: 'evaluation-dispatch', id: 'c'.repeat(32), intentDigest: intent.digest, operation: intent.operations[0], index: 0 });
  assert.throws(() => validateTrialChain({ intent, 'dispatch-builder': marker }, plan, slot), /identity mismatch/);
});
