// Synthetic Acme spend accounting; never calls a provider or reads credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, rm, chmod, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeWorkspace } from '../lib/web/workspace.mjs';
import { evaluations, withEvaluationWriter, withEvaluationSpendWriter } from '../lib/evaluation-ledger.mjs';
import { sealRecord } from '../lib/evaluation-records.mjs';
import { acmeEvaluationPlan, acmeCaseEnvironments } from './helpers/evaluation-plan.mjs';
import { ceilingMicroUsd, quoteSpend, reserveComparisonSpend, reserveSpend, authorizeSpendDispatch, settleSpend, inspectSpend } from '../lib/evaluation-spend.mjs';
const H = 'a'.repeat(64), appRoot = fileURLToPath(new URL('..', import.meta.url));
const ref = r => ({ kind: r.kind, id: r.id, digest: r.digest });
function prices() {
  return { schemaVersion: 1, sourceHash: H, observedAt: '2020-01-01T00:00:00.000Z', validUntil: '2099-01-01T00:00:00.000Z', model: 'acme-alias', serviceTier: 'default', scope: { organization: 'acme', project: 'widget' },
    rates: Object.fromEntries(['count', 'generation', 'recovery'].map(k => [k, { inputTokens: { microUsd: 1, units: 3 }, outputTokens: { microUsd: 2, units: 3 }, requests: { microUsd: 1, units: 1 } }])) };
}
const quote = (extra = {}) => quoteSpend({ kind: 'generation', packetDigest: H, inputTokens: 3, maxOutputTokens: 3, priceEvidence: prices(), ...extra });
async function world(t, { legacy = false, retention = {}, currency = 0.00001 } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-spend-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'inputs'));
  const opts = { appRoot, manifest: join(root, 'inputs/workspace.json'), state: join(root, 'state') };
  await writeFile(opts.manifest, JSON.stringify({ version: 1, id: 'acme', name: 'Acme', repo: 'Acme/private', projects: [{ id: 'widget', repo: 'Acme/widget' }] }));
  const b = legacy ? acmeEvaluationPlan() : acmeCaseEnvironments();
  b.cases = b.cases.map(c => sealRecord({ ...c, limits: { ...c.limits, currencyUsd: currency } }));
  if (!legacy) b.configurations = b.configurations.map(c => sealRecord({ ...c, environments: c.environments.map(e => ({ ...e, case: ref(b.cases.find(task => task.id === e.case.id)) })) }));
  b.comparison = sealRecord({ ...b.comparison, baseline: ref(b.configurations[0]), candidate: ref(b.configurations[1]), cases: b.cases.map(ref), pairs: b.comparison.pairs.map(p => ({ ...p, case: ref(b.cases.find(c => c.id === p.case.id)) })), allowance: { ...b.comparison.allowance, currencyUsd: currency === null ? null : 1 }, retention: { ...b.comparison.retention, maxEvents: 500, ...retention } });
  const bundle = join(root, 'inputs/bundle.json'); await writeFile(bundle, JSON.stringify(b));
  await initializeWorkspace(opts);
  const preview = await evaluations({ ...opts, bundle, action: 'freeze' });
  const frozen = await evaluations({ ...opts, bundle, action: 'freeze', yes: true, digest: preview.digest });
  const options = { ...opts, experiment: b.comparison.id }, planDigest = frozen.receipt.plan.digest, dir = frozen.receipt.plan.destination;
  const request = (operationId = 'acme-op', q = quote(), trialId = `${b.comparison.pairs[0].id}-baseline`) => ({ planDigest, trialId, operationId, requestDigest: H, quote: q, quoteDigest: q.digest });
  const inspect = () => evaluations({ ...options, action: 'inspect' });
  const init = () => reserveComparisonSpend(options, { planDigest });
  const reserve = async (id, q, trial) => {
    const r = await reserveSpend(options, request(id, q, trial));
    const dispatchInput = { planDigest, operationId: r.receipt.operationId, reservationDigest: r.receipt.digest };
    return { r, dispatchInput, d: await authorizeSpendDispatch(options, dispatchInput) };
  };
  const observation = (d, extra = {}) => ({ planDigest, operationId: 'acme-op', observationId: 'acme-observation', previousDigest: d.receipt.digest, outcome: 'unknown', usage: null, evidenceDigest: H, ...extra });
  return { root, options, planDigest, dir, frozen, request, inspect, init, reserve, observation };
}

test('checked microUSD arithmetic rounds each category up and ceilings down', () => {
  assert.equal(ceilingMicroUsd(0.0000019), 1);
  assert.equal(ceilingMicroUsd(1e-6), 1);
  assert.equal(ceilingMicroUsd(1.0000009), 1000000);
  for (const n of [null, 0, -1, Infinity, 1e-7, Number.MAX_VALUE]) assert.throws(() => ceilingMicroUsd(n));
  assert.equal(quote({ inputTokens: 1, maxOutputTokens: 1 }).maximumMicroUsd, 3);
  const p = prices(); p.rates.generation.inputTokens = { microUsd: Number.MAX_SAFE_INTEGER, units: 1 };
  assert.throws(() => quote({ priceEvidence: p }), /overflow/);
  assert.throws(() => quote({ inputTokens: 0.1 }), /bounds/);
});

test('all categories and operation kinds require explicit supplied rates', () => {
  for (const kind of ['count', 'generation', 'recovery']) for (const category of ['inputTokens', 'outputTokens', 'requests']) {
    const p = prices(); delete p.rates[kind][category]; assert.throws(() => quote({ priceEvidence: p }), /fields/);
  }
  const p = prices(); p.rates.generation.cached = { microUsd: 0, units: 1 };
  assert.throws(() => quote({ priceEvidence: p }), /fields/);
  for (const kind of ['count', 'generation', 'recovery']) assert.equal(quote({ kind }).operationKind, kind);
});

test('schema-3 missing spend is a gap; explicit initialization preserves frozen receipt', async t => {
  const w = await world(t), before = await readFile(join(w.dir, 'state.json'));
  assert.equal((await w.inspect()).spend.state, 'gap');
  await assert.rejects(reserveSpend(w.options, w.request()), /missing spend/);
  assert.equal((await w.init()).recovered, false);
  assert.equal((await w.init()).recovered, true);
  const result = await w.inspect(); assert.equal(result.spend.state, 'ready');
  assert.deepEqual(result.receipt, w.frozen.receipt); assert.deepEqual(await readFile(join(w.dir, 'state.json')), before);
  assert.equal(result.spend.reservation.trials.length, 20);
});

test('legacy roots reject spend and null frozen currency does not invent an allowance', async t => {
  const w = await world(t, { legacy: true });
  assert.equal(Object.hasOwn(await w.inspect(), 'spend'), false);
  await assert.rejects(w.init(), /plan mismatch/);
  await mkdir(join(w.dir, 'spend')); await assert.rejects(w.inspect(), /foreign experiment/);
  const unknown = await world(t, { currency: null }); await assert.rejects(unknown.init(), /currency ceiling/);
});

test('original reservation and dispatch recover exactly without duplicate effect authority', async t => {
  const w = await world(t); await w.init(); const { r, d, dispatchInput } = await w.reserve();
  assert.equal(d.dispatch, true); assert.equal((await authorizeSpendDispatch(w.options, dispatchInput)).dispatch, false);
  assert.equal((await reserveSpend(w.options, w.request())).recovered, true);
  await assert.rejects(reserveSpend(w.options, { ...w.request(), requestDigest: 'b'.repeat(64) }), /conflicting/);
  await assert.rejects(authorizeSpendDispatch(w.options, { ...dispatchInput, reservationDigest: H }), /mismatch/);
  assert.equal((await w.inspect()).spend.heldMicroUsd, r.receipt.maximumMicroUsd);
});

test('trial ceiling and exact model, plan, quote, date and operation identity bind admission', async t => {
  const w = await world(t); await w.init(); await w.reserve(); await w.reserve('acme-second');
  await assert.rejects(reserveSpend(w.options, w.request('acme-third')), /ceiling exhausted/);
  await assert.rejects(reserveSpend(w.options, w.request('../escape')), /identity/);
  await assert.rejects(reserveSpend(w.options, { ...w.request('acme-third'), quoteDigest: H }), /quote digest/);
  await assert.rejects(reserveSpend(w.options, { ...w.request('acme-third'), planDigest: H }), /plan mismatch/);
  const wrong = prices(); wrong.model = 'acme-other';
  await assert.rejects(reserveSpend(w.options, w.request('acme-third', quote({ priceEvidence: wrong }))), /model differs/);
  const stale = prices(); stale.validUntil = '2021-01-01T00:00:00.000Z';
  await assert.rejects(reserveSpend(w.options, w.request('acme-third', quote({ priceEvidence: stale }))), /expired/);
});

test('unknown, HTTP error and cancellation observations preserve holds; known completion can settle', async t => {
  const w = await world(t); await w.init(); const { d } = await w.reserve();
  let previous = d;
  for (const outcome of ['unknown', 'http-error', 'cancel-requested']) {
    const input = w.observation(previous, { observationId: `acme-${outcome}`, outcome });
    const result = await settleSpend(w.options, input);
    assert.equal(result.state.heldMicroUsd, 4); assert.equal(result.state.operations[0].observations.at(-1).usage, null);
    assert.equal((await settleSpend(w.options, input)).recovered, true); previous = result;
  }
  const result = await settleSpend(w.options, w.observation(previous, { outcome: 'complete', usage: { inputTokens: 1, outputTokens: 0, requests: 1 } }));
  assert.equal(result.state.knownMicroUsd, 2); assert.equal(result.state.heldMicroUsd, 0);
  await assert.rejects(settleSpend(w.options, w.observation(result, { observationId: 'acme-later' })), /complete/);
});

test('usage cannot decrease, conflicting observations refuse, and breach permanently closes admission', async t => {
  const w = await world(t); await w.init(); const { d } = await w.reserve();
  const input = w.observation(d, { outcome: 'http-error', usage: { inputTokens: 30, outputTokens: 0, requests: 1 } });
  const breached = await settleSpend(w.options, input);
  assert.equal(breached.state.breached, true); assert.equal(breached.state.admissionClosed, true);
  assert.equal(breached.state.knownMicroUsd, 11);
  await assert.rejects(reserveSpend(w.options, w.request('acme-next')), /admission closed/);
  await assert.rejects(settleSpend(w.options, { ...input, evidenceDigest: 'b'.repeat(64) }), /conflicting/);
  await assert.rejects(settleSpend(w.options, w.observation(breached, { observationId: 'acme-lower', outcome: 'complete', usage: { inputTokens: 1, outputTokens: 0, requests: 1 } })), /decrease/);
  const unknown = await settleSpend(w.options, w.observation(breached, { observationId: 'acme-unknown' }));
  assert.equal(unknown.state.breached, true);
});

test('retention reserves authorization and observation capacity before any operation intent', async t => {
  const w = await world(t, { retention: { maxEvents: 5 } }); await w.init();
  await assert.rejects(reserveSpend(w.options, w.request()), /retention capacity/);
  assert.deepEqual(await readdir(join(w.dir, 'spend/operations')), []);
});

test('overflow observations retain exact evidence and holds, close admission and recover without rewriting', async t => {
  for (const outcome of ['complete', 'unknown', 'http-error', 'cancel-requested']) {
    const w = await world(t); await w.init();
    const p = prices(); p.rates.generation.inputTokens = { microUsd: 2, units: 1 };
    const q = quote({ inputTokens: 0, maxOutputTokens: 0, priceEvidence: p });
    const { r, d } = await w.reserve('acme-op', q);
    const waiting = await reserveSpend(w.options, w.request('acme-waiting', q));
    const input = w.observation(d, { outcome, usage: { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0, requests: 1 } });
    const settled = await settleSpend(w.options, input);
    const exact = (2n * BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString();
    assert.equal(settled.state.knownMicroUsd, null);
    assert.equal(settled.state.knownMicroUsdExact, exact);
    assert.equal(settled.state.arithmeticOverflow, true);
    assert.equal(settled.state.breached, true); assert.equal(settled.state.admissionClosed, true);
    const op = settled.state.operations.find(o => o.reservation.operationId === 'acme-op');
    assert.equal(op.knownMicroUsd, null); assert.equal(op.knownMicroUsdExact, exact);
    assert.equal(op.heldMicroUsd, r.receipt.maximumMicroUsd);
    assert.deepEqual(op.reservation.quote.priceEvidence, p);
    assert.deepEqual(settled.receipt.usage, input.usage);
    assert.equal(settled.receipt.evidenceDigest, input.evidenceDigest);
    // Persisted schema and exact chain identity remain the original schema-1 shape.
    assert.deepEqual(settled.receipt, sealRecord({ schemaVersion: 1, kind: 'spend-observation', ...input, reservationDigest: r.receipt.digest, sequence: 1 }));
    const path = join(w.dir, 'spend/operations/acme-op/observations/1.json'), before = await readFile(path);
    assert.deepEqual((await w.inspect()).spend, settled.state);
    assert.equal((await settleSpend(w.options, input)).recovered, true);
    assert.deepEqual(await readFile(path), before);
    assert.equal((await readdir(join(w.dir, 'spend/operations/acme-op/observations'))).length, 1);
    await assert.rejects(reserveSpend(w.options, w.request('acme-new', q)), /admission closed/);
    await assert.rejects(authorizeSpendDispatch(w.options, { planDigest: w.planDigest, operationId: 'acme-waiting', reservationDigest: waiting.receipt.digest }), /admission closed/);
    if (outcome !== 'complete') {
      const unknown = await settleSpend(w.options, w.observation(settled, { observationId: 'acme-later', usage: null }));
      assert.equal(unknown.state.knownMicroUsdExact, exact);
      assert.equal(unknown.state.knownMicroUsd, null);
      assert.equal(unknown.state.heldMicroUsd, 2);
      assert.equal(unknown.state.breached, true);
    }
  }
});

test('overflow category sums retain observations even when each category charge is representable', async t => {
  const w = await world(t); await w.init(); const p = prices();
  p.rates.generation.inputTokens = p.rates.generation.outputTokens = { microUsd: 1, units: 1 };
  const q = quote({ inputTokens: 0, maxOutputTokens: 0, priceEvidence: p }), { d } = await w.reserve('acme-op', q);
  const quantity = 4503599627370496;
  const result = await settleSpend(w.options, w.observation(d, { outcome: 'complete', usage: { inputTokens: quantity, outputTokens: quantity, requests: 1 } }));
  assert.equal(result.state.knownMicroUsd, null);
  assert.equal(result.state.knownMicroUsdExact, '9007199254740993');
  assert.equal(result.state.heldMicroUsd, 1); assert.equal(result.state.admissionClosed, true);
  const trial = result.state.trials.find(t => t.trialId === w.request().trialId);
  assert.equal(trial.committedMicroUsd, null); assert.equal(trial.committedMicroUsdExact, '9007199254740994');
});

test('overflow aggregate totals remain inspectable after individually representable charges', async t => {
  const w = await world(t); await w.init(); const p = prices();
  p.rates.generation.inputTokens = { microUsd: 1, units: 1 };
  const q = quote({ inputTokens: 0, maxOutputTokens: 0, priceEvidence: p });
  const first = await w.reserve('acme-op', q), second = await w.reserve('acme-second', q);
  for (const [operationId, operation] of [['acme-op', first], ['acme-second', second]]) {
    await settleSpend(w.options, w.observation(operation.d, { operationId, outcome: 'complete', usage: { inputTokens: 4503599627370495, outputTokens: 0, requests: 1 } }));
  }
  const state = (await w.inspect()).spend;
  assert.equal(state.state, 'ready'); assert.equal(state.breached, true); assert.equal(state.admissionClosed, true);
  assert.equal(state.knownMicroUsd, null); assert.equal(state.knownMicroUsdExact, '9007199254740992');
  assert.ok(state.operations.every(o => o.knownMicroUsd === 4503599627370496));
  const trial = state.trials.find(t => t.trialId === w.request().trialId);
  assert.equal(trial.committedMicroUsd, null); assert.equal(trial.committedMicroUsdExact, '9007199254740992');
});

test('partial, foreign, symlink and chain gaps block spend but preserve read-only inspection', async t => {
  for (const corrupt of [
    async w => writeFile(join(w.dir, 'spend/foreign'), 'x'),
    async w => mkdir(join(w.dir, 'spend/operations/acme-partial'), { mode: 0o700 }),
    async w => symlink(w.root, join(w.dir, 'spend/operations/acme-link')),
    async w => { const { d } = await w.reserve(); await settleSpend(w.options, w.observation(d)); await rm(join(w.dir, 'spend/operations/acme-op/dispatch.json')); },
    async w => { const { d } = await w.reserve(); const o = await settleSpend(w.options, w.observation(d)); const path = join(w.dir, 'spend/operations/acme-op/observations/1.json'); await chmod(path, 0o600); await writeFile(path, JSON.stringify(sealRecord({ ...o.receipt, previousDigest: H })) + '\n'); await chmod(path, 0o400); }
  ]) {
    const w = await world(t); await w.init(); await corrupt(w);
    const state = (await w.inspect()).spend; assert.equal(state.state, 'gap'); assert.equal(state.heldMicroUsd, null);
    await assert.rejects(reserveSpend(w.options, w.request('acme-new')));
  }
});

test('existing writer excludes standalone competitors, then admits after release', async t => {
  const w = await world(t); await w.init();
  let release, entered; const ready = new Promise(r => { entered = r; }); const wait = new Promise(r => { release = r; });
  const held = withEvaluationWriter(w.options, async () => { entered(); await wait; });
  await ready;
  try { await assert.rejects(reserveSpend(w.options, w.request()), /lock/); } finally { release(); await held; }
  assert.equal((await reserveSpend(w.options, w.request())).recovered, false);
});

test('held controller composes spend calls serially and parallel admissions cannot overspend', async t => {
  const w = await world(t, { currency: 0.000005 }); await w.init();
  await withEvaluationWriter(w.options, async () => {
    const results = await Promise.allSettled([reserveSpend(w.options, w.request()), reserveSpend(w.options, w.request('acme-other'))]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    assert.match(results[1].reason.message, /ceiling exhausted/);
    const reservation = results[0].value.receipt;
    const d = await authorizeSpendDispatch(w.options, { planDigest: w.planDigest, operationId: 'acme-op', reservationDigest: reservation.digest });
    const settled = await settleSpend(w.options, w.observation(d)); assert.equal(settled.state.heldMicroUsd, 4);
  });
  assert.equal((await w.inspect()).spend.operations.length, 1);
});

test('held spend rejects a different workspace and writer drains queued work before release', async t => {
  const w = await world(t), other = await world(t); await w.init(); await other.init();
  let queued;
  await withEvaluationWriter(w.options, async () => {
    await assert.rejects(reserveSpend(other.options, other.request()), /workspace mismatch/);
    queued = reserveSpend(w.options, w.request());
  });
  assert.equal((await queued).recovered, false); assert.equal((await w.inspect()).spend.operations.length, 1);
});

test('read-only inspection is not mutation authority and does not initialize state', async t => {
  const w = await world(t);
  const state = await inspectSpend(w.dir, w.frozen.receipt); assert.equal(state.admissionClosed, true);
  assert.equal((await readdir(w.dir)).includes('spend'), false);
});

test('null currency is not-configured only with verified absent spend storage', async t => {
  const w = await world(t, { currency: null });
  const before = await readFile(join(w.dir, 'state.json'));
  assert.deepEqual((await w.inspect()).spend, {
    state: 'not-configured', admissionClosed: true, gaps: [], knownMicroUsd: null, heldMicroUsd: null
  });
  assert.equal((await readdir(w.dir)).includes('spend'), false);
  assert.deepEqual(await readFile(join(w.dir, 'state.json')), before);
  await assert.rejects(w.init(), /currency ceiling/);
  assert.equal((await inspectSpend(join(w.root, 'missing'), w.frozen.receipt)).state, 'gap');
  const alias = join(w.root, 'alias'); await symlink(w.dir, alias);
  assert.equal((await inspectSpend(alias, w.frozen.receipt)).state, 'gap');
  const path = join(w.dir, 'spend');
  for (const create of [
    () => mkdir(path, { mode: 0o700 }),
    () => writeFile(path, 'unexpected receipt', { mode: 0o400 }),
    () => symlink(join(w.root, 'missing'), path)
  ]) {
    await create();
    const state = (await w.inspect()).spend;
    assert.equal(state.state, 'gap'); assert.equal(state.admissionClosed, true);
    assert.equal(state.knownMicroUsd, null); assert.equal(state.heldMicroUsd, null);
    await rm(path, { recursive: true, force: true });
  }
  const funded = await world(t);
  assert.equal((await funded.inspect()).spend.state, 'gap');
});

test('nested spend transactions refuse promptly while parallel top-level calls still queue', { timeout: 5000 }, async t => {
  // Writer-only fixture: no frozen plan, Docker/source pins or provider transport.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-spend-writer-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'inputs'));
  const options = { appRoot, manifest: join(root, 'inputs/workspace.json'), state: join(root, 'state'), experiment: 'acme-comparison' };
  await writeFile(options.manifest, JSON.stringify({ version: 1, id: 'acme', name: 'Acme', repo: 'Acme/private', projects: [{ id: 'widget', repo: 'Acme/widget' }] }));
  await initializeWorkspace(options);
  await mkdir(join(options.state, 'session-trials'), { mode: 0o700, recursive: true });
  let timer;
  try {
    await assert.rejects(Promise.race([
      withEvaluationSpendWriter(options, () => reserveSpend(options, { planDigest: H })),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('nested spend failed to refuse promptly')), 1000); })
    ]), /nested spend transaction refused/);
  } finally { clearTimeout(timer); }
  await withEvaluationWriter(options, async () => {
    const order = []; let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const barrier = new Promise(resolve => { release = resolve; });
    const first = withEvaluationSpendWriter(options, async () => {
      order.push('first'); entered(); await barrier;
      // Async descendants retain the operation-local refusal context.
      await assert.rejects(reserveSpend(options, { planDigest: H }), /nested spend transaction refused/);
      order.push('first-done');
    });
    await started;
    const second = withEvaluationSpendWriter(options, () => { order.push('second'); });
    release(); await Promise.all([first, second]);
    assert.deepEqual(order, ['first', 'first-done', 'second']);
  });
});
