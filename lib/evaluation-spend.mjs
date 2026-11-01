// Inert spend receipts within the existing evaluation writer and retention budget.
// Supplied price evidence is attribution, not authenticated pricing or permission.
import { mkdir, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { fields, fingerprint, sealRecord, evaluationId, checkEvaluation as check } from './evaluation-records.mjs';
import { withEvaluationSpendWriter, readEvaluationForScreening, evaluationBytes } from './evaluation-ledger.mjs';
import { safePath, storeImmutable } from './session-ledger-io.mjs';
import { usage, admissionClosed } from './evaluation-execution.mjs';

/**
 * @typedef {'count'|'generation'|'recovery'} SpendKind
 * @typedef {{microUsd: number, units: number}} SpendRate
 * @typedef {{inputTokens: number, outputTokens: number, requests: number}} SpendUsage
 * @typedef {{inputTokens: SpendRate, outputTokens: SpendRate, requests: SpendRate}} SpendRates
 * @typedef {{schemaVersion: 1, sourceHash: string, observedAt: string, validUntil: string,
 *   model: string, serviceTier: string, scope: {organization: string, project: string},
 *   rates: {count: SpendRates, generation: SpendRates, recovery: SpendRates}}} SpendPriceEvidence
 * @typedef {{appRoot: string, manifest: string, state: string, experiment: string}} SpendOptions
 * @typedef {{planDigest: string, trialId: string, operationId: string, requestDigest: string,
 *   quote: ReturnType<typeof quoteSpend>, quoteDigest: string}} SpendRequest
 * @typedef {{planDigest: string, operationId: string, observationId: string, previousDigest: string,
 *   outcome: 'complete'|'unknown'|'http-error'|'cancel-requested', usage: SpendUsage|null,
 *   evidenceDigest: string}} SpendObservation
 */
const KINDS = ['count', 'generation', 'recovery'], CATEGORIES = ['inputTokens', 'outputTokens', 'requests'];
const MAX_RECORD = 16384, EVENT_BYTES = 4096, MAX_OBSERVATIONS = 8, MAX_OPERATIONS = 1024;
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const integer = x => Number.isSafeInteger(x) && x >= 0;
const text = x => typeof x === 'string' && x.length > 0 && x.length <= 256 && !/[\x00-\x1f]/.test(x);
const sum = xs => { const n = xs.reduce((a, b) => a + BigInt(b), 0n); check(n <= BigInt(Number.MAX_SAFE_INTEGER), 'spend arithmetic overflow'); return Number(n); };
const same = (a, b) => fingerprint(a) === fingerprint(b);
const bytes = r => Buffer.byteLength(JSON.stringify(r) + '\n');
const record = (kind, body) => sealRecord({ schemaVersion: 1, kind, ...body });

/** Convert an authored USD ceiling without rounding it upward. */
export function ceilingMicroUsd(value) {
  check(typeof value === 'number' && Number.isFinite(value) && value > 0, 'spend currency ceiling required');
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const shift = 6 + Number(exponent) - fraction.length;
  const digits = BigInt(whole + fraction);
  const n = shift >= 0 ? digits * 10n ** BigInt(shift) : digits / 10n ** BigInt(-shift);
  check(n > 0n && n <= BigInt(Number.MAX_SAFE_INTEGER), 'unrepresentable spend ceiling');
  return Number(n);
}
function priceEvidence(p) {
  fields(p, ['schemaVersion', 'sourceHash', 'observedAt', 'validUntil', 'model', 'serviceTier', 'scope', 'rates']);
  check(p.schemaVersion === 1 && hash(p.sourceHash) && text(p.model) && text(p.serviceTier), 'invalid price evidence');
  fields(p.scope, ['organization', 'project']); check(text(p.scope.organization) && text(p.scope.project), 'explicit price scope required');
  for (const key of ['observedAt', 'validUntil']) check(typeof p[key] === 'string' && Number.isFinite(Date.parse(p[key])) && new Date(p[key]).toISOString() === p[key], 'invalid price date');
  check(p.observedAt < p.validUntil, 'invalid price interval'); fields(p.rates, KINDS);
  for (const kind of KINDS) {
    fields(p.rates[kind], CATEGORIES);
    for (const category of CATEGORIES) {
      const rate = p.rates[kind][category]; fields(rate, ['microUsd', 'units']);
      check(integer(rate.microUsd) && integer(rate.units) && rate.units > 0, 'explicit nonnegative rational rate required');
    }
  }
}
function exactCharge(p, kind, quantities) {
  fields(quantities, CATEGORIES);
  return CATEGORIES.reduce((total, c) => {
    check(integer(quantities[c]), 'invalid spend quantity');
    const r = p.rates[kind][c], product = BigInt(quantities[c]) * BigInt(r.microUsd);
    const n = (product + BigInt(r.units) - 1n) / BigInt(r.units);
    return total + n;
  }, 0n);
}
function charge(p, kind, quantities) {
  const n = exactCharge(p, kind, quantities);
  check(n <= BigInt(Number.MAX_SAFE_INTEGER), 'spend arithmetic overflow'); return Number(n);
}
// Overflow is an observation, never a rounded balance or a reason to lose evidence.
// Ordinary projections keep their original shape; exact overflow strings are JSON-safe.
function projectMicroUsd(field, n) {
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? { [field]: Number(n) }
    : { [field]: null, arithmeticOverflow: true, [`${field}Exact`]: n.toString() };
}
/** @param {{kind: SpendKind, packetDigest: string, inputTokens: number, maxOutputTokens: number, priceEvidence: SpendPriceEvidence}} input */
export function quoteSpend(input) {
  fields(input, ['kind', 'packetDigest', 'inputTokens', 'maxOutputTokens', 'priceEvidence']);
  check(KINDS.includes(input.kind) && hash(input.packetDigest) && integer(input.inputTokens) && integer(input.maxOutputTokens), 'invalid quote bounds');
  priceEvidence(input.priceEvidence);
  const maximumMicroUsd = charge(input.priceEvidence, input.kind, { inputTokens: input.inputTokens, outputTokens: input.maxOutputTokens, requests: 1 });
  const { kind: operationKind, ...bounds } = input;
  return record('spend-quote', { operationKind, ...bounds, priceDigest: fingerprint(input.priceEvidence), maximumMicroUsd });
}
function validateQuote(q) {
  fields(q, ['schemaVersion', 'kind', 'operationKind', 'packetDigest', 'inputTokens', 'maxOutputTokens', 'priceEvidence', 'priceDigest', 'maximumMicroUsd', 'digest']);
  check(same(q, quoteSpend({ kind: q.operationKind, packetDigest: q.packetDigest, inputTokens: q.inputTokens, maxOutputTokens: q.maxOutputTokens, priceEvidence: q.priceEvidence })), 'quote mismatch');
}
function currentPrice(q) {
  const now = new Date().toISOString();
  check(q.priceEvidence.observedAt <= now && now <= q.priceEvidence.validUntil, 'price evidence expired or future');
}
function comparisonReservation(plan) {
  check(plan.bundle.schemaVersion === 3, 'spend requires new schema-3 plan');
  const trials = plan.bundle.comparison.pairs.flatMap(pair => ['baseline', 'candidate'].map(arm => {
    const task = plan.bundle.cases.find(c => c.digest === pair.case.digest);
    return { trialId: `${pair.id}-${arm}`, caseDigest: task.digest, ceilingMicroUsd: ceilingMicroUsd(task.limits.currencyUsd) };
  }));
  const ceiling = ceilingMicroUsd(plan.bundle.comparison.allowance.currencyUsd);
  check(sum(trials.map(t => t.ceilingMicroUsd)) <= ceiling, 'trial ceilings exceed comparison ceiling');
  return record('spend-reservation', { planDigest: plan.digest, ceilingMicroUsd: ceiling, trials });
}
async function directory(path) {
  check(await safePath(path), 'missing spend directory');
  check(((await lstat(path)).mode & 0o077) === 0, 'nonprivate spend directory');
  return readdir(path);
}
async function readRecord(path, keys, max = MAX_RECORD) {
  check(await safePath(path, false), 'missing spend receipt');
  const st = await lstat(path); check(st.nlink === 1 && (st.mode & 0o277) === 0, 'spend receipt must be private immutable');
  const raw = await evaluationBytes(path, max), r = JSON.parse(raw.toString('utf8'));
  fields(r, ['schemaVersion', 'kind', ...keys, 'digest']);
  check(r.schemaVersion === 1 && sealRecord(r).digest === r.digest && raw.toString('utf8') === JSON.stringify(r) + '\n', 'invalid spend receipt hash or encoding');
  return r;
}
function observationRecord(op, input, sequence, previousDigest) {
  fields(input, ['planDigest', 'operationId', 'observationId', 'previousDigest', 'outcome', 'usage', 'evidenceDigest']);
  check(input.planDigest === op.planDigest && input.operationId === op.operationId && evaluationId(input.observationId) && hash(input.evidenceDigest), 'observation identity mismatch');
  check(['complete', 'unknown', 'http-error', 'cancel-requested'].includes(input.outcome), 'invalid spend outcome');
  check(input.previousDigest === previousDigest, 'stale observation predecessor');
  if (input.usage !== null) exactCharge(op.quote.priceEvidence, op.operationKind, input.usage);
  check(input.outcome !== 'complete' || input.usage !== null, 'complete usage required');
  return record('spend-observation', { ...input, reservationDigest: op.digest, sequence });
}
const OP_KEYS = ['planDigest', 'trialId', 'operationId', 'operationKind', 'requestDigest', 'quoteDigest', 'priceDigest', 'maximumMicroUsd', 'quote'];
const OBS_KEYS = ['planDigest', 'operationId', 'observationId', 'previousDigest', 'outcome', 'usage', 'evidenceDigest', 'reservationDigest', 'sequence'];
function operationRecord(plan, request) {
  fields(request, ['planDigest', 'trialId', 'operationId', 'requestDigest', 'quote', 'quoteDigest']);
  check(request.planDigest === plan.digest && evaluationId(request.operationId) && /^[a-z][a-z0-9-]{0,63}-(baseline|candidate)$/.test(request.trialId) && hash(request.requestDigest), 'invalid spend operation identity');
  validateQuote(request.quote);
  const arm = request.trialId.endsWith('-baseline') ? 'baseline' : 'candidate';
  const config = plan.bundle.configurations.find(c => c.digest === plan.bundle.comparison[arm].digest);
  check(request.quote.priceEvidence.model === (config.model.resolved ?? config.model.requested), 'price model differs from frozen trial');
  check(request.quoteDigest === request.quote.digest, 'exact quote digest required');
  return record('spend-operation', { planDigest: plan.digest, trialId: request.trialId, operationId: request.operationId, operationKind: request.quote.operationKind, requestDigest: request.requestDigest, quoteDigest: request.quoteDigest, priceDigest: request.quote.priceDigest, maximumMicroUsd: request.quote.maximumMicroUsd, quote: request.quote });
}
function dispatchRecord(op) {
  return record('spend-dispatch', { planDigest: op.planDigest, operationId: op.operationId, reservationDigest: op.digest });
}
async function replay(dir, ledger) {
  const home = join(dir, 'spend'), names = await directory(home);
  check(same(names.sort(), ['operations', 'reservation.json']), 'partial or foreign spend state');
  const reservation = await readRecord(join(home, 'reservation.json'), ['planDigest', 'ceilingMicroUsd', 'trials']);
  check(same(reservation, comparisonReservation(ledger.plan)), 'spend reservation binding mismatch');
  const ids = await directory(join(home, 'operations'));
  check(ids.length <= MAX_OPERATIONS && ids.every(evaluationId), 'invalid spend operation directories');
  const operations = [], balances = []; let breached = false;
  for (const id of ids.sort()) {
    const path = join(home, 'operations', id), entries = await directory(path);
    check(entries.includes('reservation.json') && entries.includes('observations') && entries.every(n => ['reservation.json', 'dispatch.json', 'observations'].includes(n)), 'partial or foreign spend operation');
    const op = await readRecord(join(path, 'reservation.json'), OP_KEYS);
    check(op.operationId === id && same(op, operationRecord(ledger.plan, { planDigest: op.planDigest, trialId: op.trialId, operationId: id, requestDigest: op.requestDigest, quote: op.quote, quoteDigest: op.quoteDigest })), 'operation binding mismatch');
    check(reservation.trials.some(t => t.trialId === op.trialId), 'unknown trial');
    const dispatch = entries.includes('dispatch.json') ? await readRecord(join(path, 'dispatch.json'), ['planDigest', 'operationId', 'reservationDigest'], EVENT_BYTES) : null;
    check(dispatch === null || same(dispatch, dispatchRecord(op)), 'dispatch binding mismatch');
    const files = (await directory(join(path, 'observations'))).sort();
    check(files.length <= MAX_OBSERVATIONS && files.every((n, i) => n === `${i + 1}.json`) && (dispatch !== null || files.length === 0), 'observation sequence gap');
    let previousDigest = dispatch?.digest, knownExact = 0n, lastUsage = null, complete = false;
    const observations = [], seen = new Set();
    for (const name of files) {
      const r = await readRecord(join(path, 'observations', name), OBS_KEYS, EVENT_BYTES);
      const input = Object.fromEntries(['planDigest', 'operationId', 'observationId', 'previousDigest', 'outcome', 'usage', 'evidenceDigest'].map(k => [k, r[k]]));
      check(!complete && !seen.has(r.observationId) && same(r, observationRecord(op, input, observations.length + 1, previousDigest)), 'invalid observation chain');
      seen.add(r.observationId);
      if (r.usage !== null) {
        check(lastUsage === null || CATEGORIES.every(c => r.usage[c] >= lastUsage[c]), 'usage cannot decrease');
        lastUsage = r.usage; knownExact = exactCharge(op.quote.priceEvidence, op.operationKind, r.usage);
      }
      if (knownExact > BigInt(op.maximumMicroUsd)) breached = true;
      complete = r.outcome === 'complete'; previousDigest = r.digest; observations.push(r);
    }
    const overflow = knownExact > BigInt(Number.MAX_SAFE_INTEGER);
    const heldMicroUsd = overflow ? op.maximumMicroUsd : complete ? 0 : Math.max(0, op.maximumMicroUsd - Number(knownExact));
    balances.push({ trialId: op.trialId, knownExact, committedExact: knownExact + BigInt(heldMicroUsd) });
    operations.push({ reservation: op, dispatch, observations, ...projectMicroUsd('knownMicroUsd', knownExact), heldMicroUsd, complete });
  }
  const knownExact = balances.reduce((n, b) => n + b.knownExact, 0n), heldMicroUsd = sum(operations.map(o => o.heldMicroUsd));
  const trials = reservation.trials.map(t => ({ ...t, ...projectMicroUsd('committedMicroUsd', balances.filter(b => b.trialId === t.trialId).reduce((n, b) => n + b.committedExact, 0n)) }));
  check(breached || (knownExact + BigInt(heldMicroUsd) <= BigInt(reservation.ceilingMicroUsd) && trials.every(t => t.committedMicroUsd !== null && t.committedMicroUsd <= t.ceilingMicroUsd)), 'invalid spend balances');
  // Future capacity remains reserved even after settlement, so recovery never prunes history.
  const reservedEvents = sum(operations.map(o => (o.dispatch ? 0 : 1) + MAX_OBSERVATIONS - o.observations.length));
  return { state: 'ready', gaps: [], admissionClosed: breached || await admissionClosed(dir), breached, reservation, operations, trials, ...projectMicroUsd('knownMicroUsd', knownExact), heldMicroUsd, reservedEvents, reservedBytes: reservedEvents * EVENT_BYTES };
}
/** Read-only: gaps have null balances and never grant dispatch authority. */
export async function inspectSpend(dir, ledger) {
  if (ledger.plan.bundle.schemaVersion !== 3) return { state: 'not-applicable', admissionClosed: true, gaps: [], knownMicroUsd: null, heldMicroUsd: null };
  try {
    if (ledger.plan.bundle.comparison.allowance.currencyUsd === null) {
      // Verify the experiment itself before treating an absent child as an
      // unconfigured allowance. Any retained spend intent still requires care.
      check(!(await directory(dir)).includes('spend'), 'unexpected spend state without currency allowance');
      return { state: 'not-configured', admissionClosed: true, gaps: [], knownMicroUsd: null, heldMicroUsd: null };
    }
    return await replay(dir, ledger);
  }
  catch { return { state: 'gap', admissionClosed: true, gaps: ['missing-or-invalid-spend-state'], knownMicroUsd: null, heldMicroUsd: null }; }
}
async function capacity(dir, plan, state, additionalBytes, additionalEvents) {
  const retained = await usage(dir), policy = plan.bundle.comparison.retention;
  check(retained.bytes + state.reservedBytes + additionalBytes <= policy.maxBytes && retained.count + state.reservedEvents + additionalEvents <= policy.maxEvents, 'spend retention capacity exhausted');
}
async function write(path, r, max = MAX_RECORD) {
  check(bytes(r) <= max, 'spend record too large'); await storeImmutable(path, r);
}
async function writer(options, planDigest, work) {
  check(hash(planDigest), 'explicit frozen plan digest required');
  return withEvaluationSpendWriter(options, async () => {
    const context = await readEvaluationForScreening(options), ledger = context.receipt;
    check(ledger.plan.digest === planDigest && ledger.plan.bundle.schemaVersion === 3, 'spend plan mismatch');
    await context.observeWriter(); return work(ledger.plan.destination, ledger);
  });
}
/** Explicit initialization only; freeze does not reserve or activate spend.
 * @param {SpendOptions} options
 * @param {{planDigest: string}} binding
 */
export async function reserveComparisonSpend(options, { planDigest }) {
  return writer(options, planDigest, async (dir, ledger) => {
    const reservation = comparisonReservation(ledger.plan), home = join(dir, 'spend');
    if (await safePath(home)) { const state = await replay(dir, ledger); return { recovered: true, receipt: state.reservation }; }
    check(!await admissionClosed(dir), 'comparison admission closed');
    await capacity(dir, ledger.plan, { reservedBytes: 0, reservedEvents: 0 }, bytes(reservation), 1);
    check(bytes(reservation) <= MAX_RECORD, 'spend reservation too large');
    await mkdir(home, { mode: 0o700 }); await mkdir(join(home, 'operations'), { mode: 0o700 });
    await write(join(home, 'reservation.json'), reservation); return { recovered: false, receipt: reservation };
  });
}
/** Reserve one exact public request; quoteDigest is the caller's reviewed quote.
 * @param {SpendOptions} options
 * @param {SpendRequest} request
 */
export async function reserveSpend(options, request) {
  request = structuredClone(request);
  return writer(options, request.planDigest, async (dir, ledger) => {
    const op = operationRecord(ledger.plan, request), state = await replay(dir, ledger);
    const old = state.operations.find(o => o.reservation.operationId === op.operationId);
    if (old) { check(same(old.reservation, op), 'conflicting spend identity'); return { recovered: true, receipt: old.reservation }; }
    check(!state.admissionClosed && state.operations.length < MAX_OPERATIONS, 'spend admission closed'); currentPrice(op.quote);
    const trial = state.trials.find(t => t.trialId === op.trialId); check(trial, 'unknown trial');
    check(sum([state.knownMicroUsd, state.heldMicroUsd, op.maximumMicroUsd]) <= state.reservation.ceilingMicroUsd && sum([trial.committedMicroUsd, op.maximumMicroUsd]) <= trial.ceilingMicroUsd, 'spend ceiling exhausted');
    await capacity(dir, ledger.plan, state, bytes(op) + (MAX_OBSERVATIONS + 1) * EVENT_BYTES, MAX_OBSERVATIONS + 2);
    check(bytes(op) <= MAX_RECORD, 'spend operation too large');
    const path = join(dir, 'spend', 'operations', op.operationId);
    await mkdir(path, { mode: 0o700 }); await mkdir(join(path, 'observations'), { mode: 0o700 });
    await write(join(path, 'reservation.json'), op); return { recovered: false, receipt: op };
  });
}
/** Only a newly persisted dispatch returns dispatch:true. Recovery never redispatches.
 * @param {SpendOptions} options
 * @param {{planDigest: string, operationId: string, reservationDigest: string}} request
 */
export async function authorizeSpendDispatch(options, request) {
  request = structuredClone(request);
  fields(request, ['planDigest', 'operationId', 'reservationDigest']);
  check(evaluationId(request.operationId) && hash(request.reservationDigest), 'invalid dispatch identity');
  return writer(options, request.planDigest, async (dir, ledger) => {
    const state = await replay(dir, ledger), op = state.operations.find(o => o.reservation.operationId === request.operationId);
    check(op && op.reservation.digest === request.reservationDigest, 'dispatch reservation mismatch');
    if (op.dispatch) return { recovered: true, dispatch: false, receipt: op.dispatch };
    check(!state.admissionClosed, 'spend admission closed'); currentPrice(op.reservation.quote);
    await capacity(dir, ledger.plan, state, 0, 0);
    const receipt = dispatchRecord(op.reservation);
    await write(join(dir, 'spend', 'operations', request.operationId, 'dispatch.json'), receipt, EVENT_BYTES);
    return { recovered: false, dispatch: true, receipt };
  });
}
/** Usage is cumulative for the original operation, never a refund on an error/cancel.
 * @param {SpendOptions} options
 * @param {SpendObservation} input
 */
export async function settleSpend(options, input) {
  input = structuredClone(input);
  check(evaluationId(input.operationId), 'invalid spend operation');
  return writer(options, input.planDigest, async (dir, ledger) => {
    const state = await replay(dir, ledger), op = state.operations.find(o => o.reservation.operationId === input.operationId);
    check(op?.dispatch, 'original dispatch required');
    const old = op.observations.find(o => o.observationId === input.observationId);
    if (old) { check(same(old, observationRecord(op.reservation, input, old.sequence, old.previousDigest)), 'conflicting observation identity'); return { recovered: true, receipt: old }; }
    check(!op.complete && op.observations.length < MAX_OBSERVATIONS, 'spend observation capacity exhausted or complete');
    const previous = op.observations.at(-1)?.digest ?? op.dispatch.digest;
    const receipt = observationRecord(op.reservation, input, op.observations.length + 1, previous);
    const lastUsage = op.observations.findLast(o => o.usage !== null)?.usage;
    check(input.usage === null || !lastUsage || CATEGORIES.every(c => input.usage[c] >= lastUsage[c]), 'usage cannot decrease');
    await capacity(dir, ledger.plan, state, 0, 0);
    await write(join(dir, 'spend', 'operations', input.operationId, 'observations', `${receipt.sequence}.json`), receipt, EVENT_BYTES);
    return { recovered: false, receipt, state: await replay(dir, ledger) };
  });
}
