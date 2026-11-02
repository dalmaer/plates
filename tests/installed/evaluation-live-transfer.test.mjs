// Raw transfer timing proof with a real frozen ledger/writer and synthetic fetch.
import '../helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, rm, cp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeWorkspace } from '../../lib/web/workspace.mjs';
import { evaluations, withEvaluationWriter, evaluationLiveFence } from '../../lib/evaluation-ledger.mjs';
import { sealRecord } from '../../lib/evaluation-records.mjs';
import { acmeCaseEnvironments } from '../helpers/evaluation-plan.mjs';
import { quoteSpend, reserveComparisonSpend, reserveSpend, inspectSpend } from '../../lib/evaluation-spend.mjs';
import { dispatchLive } from '../../lib/evaluation-live-transfer.mjs';
import { recoveredCountReleased } from '../../lib/evaluation-live-recovery-execution.mjs';
import { inspectHarnessLock } from '../../lib/session-ledger-io.mjs';
import { run } from '../helpers/run.mjs';
const H = 'a'.repeat(64), ref = r => ({ kind: r.kind, id: r.id, digest: r.digest });
async function world(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-live-transfer-'))); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'inputs'));
  const options = { appRoot: fileURLToPath(new URL('../..', import.meta.url)), manifest: join(root, 'inputs/workspace.json'), state: join(root, 'state') };
  await writeFile(options.manifest, JSON.stringify({ version: 1, id: 'acme', name: 'Acme', repo: 'Acme/private', projects: [{ id: 'widget', repo: 'Acme/widget' }] }));
  const b = acmeCaseEnvironments();
  b.cases = b.cases.map(c => sealRecord({ ...c, limits: { ...c.limits, currencyUsd: 1 } }));
  b.configurations = b.configurations.map(c => sealRecord({ ...c, provider: 'openai', routing: { ...c.routing, provider: 'openai' },
    model: { requested: 'acme-alias', resolved: 'acme-resolved', unresolvedReason: null },
    runtime: { name: 'single-generation-container-v1', version: '1.0.0', settings: { temperature: null, maxTokens: 1000 } },
    policy: { ...c.policy, execution: 'host-gateway-v1' }, environments: c.environments.map(e => ({ ...e, case: ref(b.cases.find(t => t.id === e.case.id)) })) }));
  b.comparison = sealRecord({ ...b.comparison, baseline: ref(b.configurations[0]), candidate: ref(b.configurations[1]), cases: b.cases.map(ref),
    pairs: b.comparison.pairs.map(p => ({ ...p, case: ref(b.cases.find(c => c.id === p.case.id)) })), allowance: { minutes: 1000, currencyUsd: 100 }, retention: { days: 30, maxEvents: 2000, maxBytes: 67108864 } });
  const bundle = join(root, 'inputs/bundle.json'); await writeFile(bundle, JSON.stringify(b)); await initializeWorkspace(options);
  const preview = await evaluations({ ...options, bundle, action: 'freeze' });
  const frozen = await evaluations({ ...options, bundle, action: 'freeze', yes: true, digest: preview.digest });
  options.experiment = b.comparison.id;
  const planDigest = frozen.receipt.plan.digest;
  const model = { requested: 'acme-alias', resolved: 'acme-resolved' }, scope = { organization: 'acme', project: 'widget' };
  const priceEvidence = { schemaVersion: 1, sourceHash: H, observedAt: '2020-01-01T00:00:00.000Z', validUntil: '2099-01-01T00:00:00.000Z', model: model.resolved, serviceTier: 'default', scope,
    rates: Object.fromEntries(['count', 'generation', 'recovery'].map(k => [k, { inputTokens: { microUsd: 0, units: 1 }, outputTokens: { microUsd: 0, units: 1 }, requests: { microUsd: 1, units: 1 } }])) };
  const quote = quoteSpend({ kind: 'recovery', packetDigest: H, inputTokens: 0, maxOutputTokens: 0, priceEvidence });
  const prepared = { input: { planDigest }, identity: { operationId: 'acme-recovery-' + root.split('-').at(-1).toLowerCase() }, responseId: 'resp_acmeOriginal',
    loaded: { descriptor: { stage: 'recovery', live: { model, scope } } } };
  return { root, options, prepared, quote, frozen, request: { planDigest, trialId: b.comparison.pairs[0].id + '-baseline', operationId: prepared.identity.operationId, requestDigest: H, quote, quoteDigest: quote.digest } };
}
test('a separately allocated subsecond GET interval dispatches once through the real writer and spend authorization', async t => {
  const w = await world(t), originalFetch = globalThis.fetch; let calls = 0;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, input) => {
    calls++; assert.equal(input.method, 'GET'); assert.equal(new URL(url).pathname, '/v1/responses/resp_acmeOriginal');
    return new Response(JSON.stringify({ object: 'response', id: 'resp_acmeOriginal', model: 'acme-resolved', service_tier: 'default', status: 'completed', created_at: Math.floor(Date.now() / 1000),
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Acme original response' }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }), { status: 200 });
  };
  await withEvaluationWriter(w.options, async () => {
    const fence = await evaluationLiveFence(w.options, { planDigest: w.request.planDigest, deadline: Date.now() + 5000, cleanupDeadline: Date.now() + 6000 });
    await reserveComparisonSpend(w.options, { planDigest: w.request.planDigest }); const reserved = await reserveSpend(w.options, w.request);
    const start = Date.now(), stepDeadline = start + 1000;
    const result = await dispatchLive(w.options, w.prepared, reserved.receipt, fence, { key: 'acme-synthetic-key-only', transportDeadline: stepDeadline - 200, completionDeadline: stepDeadline });
    assert.equal(result.error, null); assert.equal(result.response.id, 'resp_acmeOriginal'); assert.equal(calls, 1); assert.ok(await result.completion());
    assert.ok(Date.now() <= stepDeadline, 'GET plus local completion must fit its one-second step');
    await assert.rejects(dispatchLive(w.options, w.prepared, reserved.receipt, fence, { key: 'acme-synthetic-key-only', transportDeadline: Date.now() + 800, completionDeadline: Date.now() + 1000 }), /dispatch consumed/);
    assert.equal(calls, 1);
  });
});
test('an already exhausted transport interval refuses before durable dispatch', async t => {
  const w = await world(t);
  await withEvaluationWriter(w.options, async () => {
    const fence = await evaluationLiveFence(w.options, { planDigest: w.request.planDigest, deadline: Date.now() + 5000, cleanupDeadline: Date.now() + 6000 });
    await reserveComparisonSpend(w.options, { planDigest: w.request.planDigest }); const reserved = await reserveSpend(w.options, w.request);
    await assert.rejects(dispatchLive(w.options, w.prepared, reserved.receipt, fence, { key: 'acme-synthetic-key-only', transportDeadline: Date.now() - 1, completionDeadline: Date.now() + 1000 }), /interval exhausted/);
    const state = await inspectSpend(w.frozen.receipt.plan.destination, w.frozen.receipt);
    assert.equal(state.operations[0].dispatch, null);
  });
});
test('verified dead-owner recovery establishes one new writer context for spend and fence drain', async t => {
  const w = await world(t), home = join(w.options.state, 'session-trials');
  const child = run(process.execPath, ['--input-type=module', '-e', `import {ledgerLock} from ${JSON.stringify(new URL('../../lib/session-ledger-io.mjs', import.meta.url).href)}; await ledgerLock(${JSON.stringify(home)}, {harness:true}); process.exit(0);`]);
  assert.equal(child.status, 0, child.stderr);
  const original = await inspectHarnessLock(home); assert.equal(original.status, 'recoverable'); assert.notEqual(original.owner.pid, process.pid);
  const altered = structuredClone(original); altered.owner.id = '00000000-0000-0000-0000-000000000000';
  let entered = false;
  await assert.rejects(withEvaluationWriter(w.options, () => { entered = true; }, { recover: altered })); assert.equal(entered, false);
  assert.deepEqual(await inspectHarnessLock(home), original);
  await withEvaluationWriter(w.options, async () => {
    const current = await inspectHarnessLock(home); assert.equal(current.owner.pid, process.pid); assert.notEqual(current.owner.id, original.owner.id);
    await evaluationLiveFence(w.options, { planDigest: w.request.planDigest, deadline: Date.now() + 5000, cleanupDeadline: Date.now() + 6000 });
    await reserveComparisonSpend(w.options, { planDigest: w.request.planDigest });
    assert.equal((await reserveSpend(w.options, w.request)).recovered, false);
    await assert.rejects(withEvaluationWriter(w.options, () => {}), /nested evaluation writer/);
  }, { recover: original });
  assert.equal(await inspectHarnessLock(home), null);
  assert.equal((await inspectSpend(w.frozen.receipt.plan.destination, w.frozen.receipt)).heldMicroUsd, 1);
});
test('a real opened receipt that never finishes forces bounded process exit with the writer retained', async t => {
  const w = await world(t), isolated = join(w.root, 'isolated'), home = join(w.options.state, 'session-trials');
  await cp(join(w.options.appRoot, 'lib'), join(isolated, 'lib'), { recursive: true });
  const io = join(isolated, 'lib/session-ledger-io.mjs'), original = await readFile(io, 'utf8');
  const needle = 'try { await handle.writeFile(data); await handle.chmod(0o400);';
  assert.ok(original.includes(needle));
  await writeFile(io, original.replace(needle, 'try { await new Promise(() => {}); await handle.writeFile(data); await handle.chmod(0o400);'));
  const receipt = sealRecord({ schemaVersion: 2, kind: 'evaluation-reservation', id: w.options.experiment, createdAt: new Date().toISOString(),
    planDigest: w.request.planDigest, allowance: w.frozen.receipt.plan.bundle.comparison.allowance, currencyUsage: null });
  const script = join(isolated, 'stuck.mjs');
  await writeFile(script, `import {withEvaluationWriter,evaluationLiveFence} from './lib/evaluation-ledger.mjs';
import {terminateStuckLiveWriter} from './lib/evaluation-live-writer.mjs';
try { await withEvaluationWriter(${JSON.stringify(w.options)}, async()=>{
 const fence=await evaluationLiveFence(${JSON.stringify(w.options)}, {planDigest:${JSON.stringify(w.request.planDigest)},deadline:Date.now()+500,cleanupDeadline:Date.now()+800});
 await fence.persistReservation(${JSON.stringify(receipt)});
}); process.exitCode=99; } catch(error) { terminateStuckLiveWriter(error); }
`);
  const child = run(process.execPath, [script], { timeout: 5000 });
  assert.equal(child.status, 2, child.stderr);
  assert.deepEqual(JSON.parse(child.stderr), { error: 'evaluation_live_writer_stuck', retainedLock: true });
  assert.equal((await inspectHarnessLock(home)).status, 'recoverable');
  const pending = await stat(join(w.frozen.receipt.plan.destination, 'execution/reservation.json'));
  assert.equal(pending.size, 0); assert.equal(pending.mode & 0o777, 0o600);
});
test('already-released count recovery preserves exact original completion and refuses missing or changed history', () => {
  const originalIntent = { digest: 'b'.repeat(64), operationId: 'acme-count' }, settlement = { released: true, operationId: 'acme-count', observation: { state: 'transport-closed' } };
  const local = sealRecord({ schemaVersion: 1, kind: 'live-local-completion', planDigest: H, operationId: originalIntent.operationId,
    intentDigest: originalIntent.digest, coordinatorReceipt: settlement });
  const prepared = { input: { planDigest: H }, originalIntent, original: { count: { local } } }, before = JSON.stringify(prepared);
  assert.equal(recoveredCountReleased(prepared, settlement), true); assert.equal(JSON.stringify(prepared), before);
  assert.throws(() => recoveredCountReleased({ ...prepared, original: { count: { local: null } } }, settlement), /original released count receipt unavailable/);
  assert.throws(() => recoveredCountReleased(prepared, { ...settlement, observation: { state: 'not-started' } }), /original released count receipt unavailable/);
  assert.throws(() => recoveredCountReleased({ ...prepared, originalIntent: { ...originalIntent, digest: 'c'.repeat(64) } }, settlement), /original released count receipt unavailable/);
  assert.equal(recoveredCountReleased({ ...prepared, original: { count: { local: null } } }, { ...settlement, observation: { state: 'owner-exited', pid: 123 } }), true);
  assert.equal(recoveredCountReleased(prepared, { ...settlement, released: false, observation: { state: 'unknown' } }), false);
});
