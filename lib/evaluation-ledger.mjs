// Frozen schema-2 records; offline execution extends them without rewriting history.
import { lstat, mkdir, readdir, open } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { constants } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import { inspectWorkspace } from './web/workspace.mjs';
import { safePath, readJson, store, ledgerLock, inspectHarnessLock } from './session-ledger-io.mjs';
import { EVALUATION_BYTES, validateEvaluationBundle, checkEvaluation as check, evaluationId, byteDigest, fingerprint, fields } from './evaluation-records.mjs';

export async function evaluationBytes(path, max) {
  check(isAbsolute(path) && await safePath(path, false), 'explicit regular input required');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    check(stat.isFile() && stat.nlink === 1 && stat.size <= max, 'unsafe or oversized input');
    const result = Buffer.alloc(max + 1); let size = 0;
    while (size < result.length) { const r = await handle.read(result, size, result.length - size, size); if (!r.bytesRead) break; size += r.bytesRead; }
    check(size <= max, 'input exceeds byte bound'); return result.subarray(0, size);
  } finally { await handle.close(); }
}
async function privatePath(path, directory = true) {
  if (!await safePath(path, directory)) return false;
  const stat = await lstat(path);
  check((stat.mode & 0o077) === 0 && (directory || stat.nlink === 1), 'ledger must be private and unlinked'); return true;
}
async function scope(options) {
  check(isAbsolute(options.manifest ?? '') && isAbsolute(options.state ?? ''), 'explicit absolute workspace paths required');
  await safePath(options.manifest, false); await safePath(options.state);
  const before = await evaluationBytes(options.manifest, EVALUATION_BYTES);
  const workspace = await inspectWorkspace(options);
  check(byteDigest(before) === byteDigest(await evaluationBytes(options.manifest, EVALUATION_BYTES)), 'manifest changed during inspection');
  check(workspace.state === 'ready', 'initialize workspace separately first');
  return { paths: workspace.paths, workspace: workspace.workspace, projects: workspace.projects, manifestHash: byteDigest(before) };
}
function authorize(bound, bundle) {
  check([bound.workspace.repo, ...bound.projects.map(p => p.repo)].some(repo => repo.toLowerCase() === bundle.comparison.repository.toLowerCase()), 'comparison repository is not authorized by manifest');
}
function frozenLedger(plan, createdAt = new Date().toISOString()) {
  const body = { schemaVersion: 2, kind: 'harness', generation: 1, createdAt, events: [{ action: 'freeze', generation: 1, digest: plan.digest, at: createdAt }], plan };
  return { ...body, digest: fingerprint(body) };
}
function attachmentMaterials(plan) {
  return new Map(plan.bundle.materials.map(m => [byteDigest(Buffer.from(m.content)), m.content]));
}
function retainedBytes(plan) {
  // ISO timestamps have fixed width; the actual receipt is the same size.
  return Buffer.byteLength(JSON.stringify(frozenLedger(plan), null, 2) + '\n') + [...attachmentMaterials(plan).values()].reduce((n, s) => n + Buffer.byteLength(s), 0);
}
async function preview(options) {
  const bound = await scope(options), raw = await evaluationBytes(options.bundle, EVALUATION_BYTES);
  let bundle; try { bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { check(false, 'invalid UTF-8 JSON bundle'); }
  validateEvaluationBundle(bundle); authorize(bound, bundle);
  const destination = join(bound.paths.state, 'session-trials', bundle.comparison.id);
  const input = { binding: bound, bundlePath: resolve(options.bundle), bundleHash: byteDigest(raw), planHash: fingerprint(bundle), destination };
  const plan = { schemaVersion: 2, kind: 'harness', status: 'draft', preview: true, digest: fingerprint(input), ...input, bundle, budgetReserved: false, acceptance: 'unknown' };
  check(retainedBytes(plan) <= bundle.comparison.retention.maxBytes, 'retention byte limit exhausted');
  return plan;
}
async function readFrozen(dir, bound, experiment) {
  check(await privatePath(dir), 'experiment missing');
  const entries = await readdir(dir);
  check(entries.includes('state.json') && entries.includes('attachments'), 'partial or foreign experiment state');
  check(await privatePath(join(dir, 'state.json'), false), 'missing ledger');
  const ledger = await readJson(join(dir, 'state.json'), EVALUATION_BYTES * 4);
  fields(ledger, ['schemaVersion', 'kind', 'generation', 'createdAt', 'events', 'plan', 'digest']);
  check(ledger.schemaVersion === 2 && ledger.kind === 'harness' && ledger.generation === 1 && typeof ledger.createdAt === 'string' && Number.isFinite(Date.parse(ledger.createdAt)) && new Date(ledger.createdAt).toISOString() === ledger.createdAt, 'corrupt frozen ledger');
  const { digest, ...body } = ledger; check(fingerprint(body) === digest, 'ledger hash mismatch');
  const p = ledger.plan;
  fields(p, ['schemaVersion', 'kind', 'status', 'preview', 'digest', 'binding', 'bundlePath', 'bundleHash', 'planHash', 'destination', 'bundle', 'budgetReserved', 'acceptance']);
  validateEvaluationBundle(p.bundle); authorize(bound, p.bundle);
  const allowed = ['state.json', 'attachments', 'execution', 'reports', ...(p.bundle.schemaVersion === 3 ? ['spend'] : [])];
  check(entries.length <= allowed.length && entries.every(e => allowed.includes(e)), 'partial or foreign experiment state');
  check(p.schemaVersion === 2 && p.kind === 'harness' && p.status === 'draft' && p.preview === true && p.budgetReserved === false && p.acceptance === 'unknown' && p.bundle.comparison.id === experiment && fingerprint(p.bundle) === p.planHash && p.destination === dir, 'corrupt frozen plan');
  const input = Object.fromEntries(['binding', 'bundlePath', 'bundleHash', 'planHash', 'destination'].map(k => [k, p[k]]));
  check(fingerprint(input) === p.digest && fingerprint(p.binding) === fingerprint(bound), 'workspace binding changed');
  check(JSON.stringify(ledger.events) === JSON.stringify([{ action: 'freeze', generation: 1, digest: p.digest, at: ledger.createdAt }]), 'invalid frozen events');
  const attachments = join(dir, 'attachments'); check(await privatePath(attachments), 'missing attachments');
  const expected = [...new Set(p.bundle.materials.map(m => byteDigest(Buffer.from(m.content))))].sort();
  check(JSON.stringify((await readdir(attachments)).sort()) === JSON.stringify(expected), 'partial or foreign attachments');
  for (const name of expected) {
    const path = join(attachments, name); check(await privatePath(path, false), 'missing attachment');
    check(byteDigest(await evaluationBytes(path, EVALUATION_BYTES)) === name, 'attachment hash mismatch');
  }
  await (await import('./evaluation-screening.mjs')).inspectReports(dir, ledger);
  return ledger;
}
export async function evaluations(options, invocationStartedAt = Date.now()) {
  const { action = 'plan', yes = false, digest, experiment } = options;
  if (['run', 'reconcile', 'resume'].includes(action) && evaluationId(experiment)) {
    const bound = await scope(options), ledger = await readFrozen(join(bound.paths.state, 'session-trials', experiment), bound, experiment);
    const live = ledger.plan.bundle.schemaVersion === 3 && ledger.plan.bundle.configurations.every(c => c.policy.execution === 'host-gateway-v1');
    if (live) {
      check(digest === undefined || yes, 'digest requires --yes');
      check(action !== 'resume', 'live aggregate resume unavailable; approve one original slot');
      const controller = await import('./evaluation-live.mjs');
      return action === 'run' ? controller.runLiveEvaluation(options, { scope, readFrozen }, invocationStartedAt)
        : controller.reconcileLiveEvaluation(options, { scope, readFrozen }, invocationStartedAt);
    }
  }
  check(options.credentialFd === undefined, 'credential pipe only applies to explicit live run or recovery');
  if (['compare', 'resume', 'reconcile', 'cancel'].includes(action)) {
    check(digest === undefined || yes, 'digest requires --yes');
    return (await import('./evaluation-comparison.mjs')).comparisonOperation(options, { scope, readFrozen });
  }
  if (action === 'run') {
    check(digest === undefined || yes, 'digest requires --yes');
    return (await import('./evaluation-execution.mjs')).runEvaluation(options, { scope, readFrozen });
  }
  check(options.execution === undefined, 'execution only applies to run');
  check(['plan', 'freeze', 'inspect'].includes(action), 'operation unavailable; only plan, freeze, inspect and offline run are implemented');
  check(action === 'freeze' || (!yes && digest === undefined), 'approval only applies to freeze');
  check(digest === undefined || yes, 'digest requires --yes');
  if (action === 'inspect') {
    check(evaluationId(experiment) && options.bundle === undefined, 'inspect needs experiment only');
    const bound = await scope(options), home = join(bound.paths.state, 'session-trials');
    check(await privatePath(home), 'ledger missing'); check(!await safePath(join(home, '.lock'), false), 'storage locked');
    const ledger = await readFrozen(join(home, experiment), bound, experiment);
    return { action, preview: false, status: 'frozen', receipt: ledger, execution: await (await import('./evaluation-execution.mjs')).inspectExecutions(ledger.plan.destination, ledger.plan),
      ...(ledger.plan.bundle.schemaVersion === 3 ? { spend: await (await import('./evaluation-spend.mjs')).inspectSpend(ledger.plan.destination, ledger) } : {}) };
  }
  check(experiment === undefined && typeof options.bundle === 'string', 'plan/freeze needs bundle only');
  const plan = await preview(options);
  if (action === 'plan' || !yes) return { action, ...plan };
  check(digest === plan.digest, 'stale or missing preview digest');
  const home = join(plan.binding.paths.state, 'session-trials');
  if (!await privatePath(home)) await mkdir(home, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  await privatePath(home);
  const release = await ledgerLock(home);
  try {
    const current = await preview(options);
    check(current.digest === plan.digest, 'inputs or ownership changed before mutation');
    const entries = await readdir(home); check(entries.length <= 1001 && entries.every(e => e === '.lock' || e === '.quality' || e === '.harness-lock-guard' || /^\.harness-recovered-[a-f0-9-]{36}$/.test(e) || evaluationId(e)), 'foreign or exhausted session storage');
    const dir = plan.destination;
    if (await privatePath(dir)) {
      const ledger = await readFrozen(dir, plan.binding, plan.bundle.comparison.id);
      check(ledger.plan.digest === plan.digest, 'comparison identity already frozen with different inputs');
      return { action, preview: false, status: 'frozen', recovered: true, receipt: ledger };
    }
    check(entries.length < 1001, 'experiment limit exhausted');
    // Directory creation is durable intent. Failure leaves it for inspection, never overwrite.
    await mkdir(dir, { mode: 0o700 });
    const attachments = join(dir, 'attachments'); await mkdir(attachments, { mode: 0o700 });
    const materials = attachmentMaterials(plan);
    for (const [hash, content] of materials) {
      const file = await open(join(attachments, hash), 'wx', 0o600);
      try { await file.writeFile(content); await file.sync(); } finally { await file.close(); }
    }
    const attachmentDir = await open(attachments, constants.O_RDONLY); try { await attachmentDir.sync(); } finally { await attachmentDir.close(); }
    const ledger = frozenLedger(plan);
    await store(join(dir, 'state.json'), ledger);
    return { action, preview: false, status: 'frozen', recovered: false, receipt: ledger };
  } finally { await release(); }
}
export async function evaluationsCommand({ args, appRoot, cwd }) {
  const invocationStartedAt = Date.now();
  const [action, ...rest] = args, opts = {}, seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]; check(['--manifest', '--state', '--bundle', '--execution', '--experiment', '--digest', '--credential-fd', '--yes', '--json'].includes(flag) && !seen.has(flag), 'unknown or repeated option'); seen.add(flag);
    if (['--yes', '--json'].includes(flag)) opts[flag.slice(2)] = true;
    else { check(rest[i + 1] && !rest[i + 1].startsWith('--'), 'option requires value'); opts[flag.slice(2)] = rest[++i]; }
  }
  if (opts.bundle) opts.bundle = resolve(cwd, opts.bundle);
  if (opts['credential-fd'] !== undefined) {
    check(/^[1-9][0-9]*$/.test(opts['credential-fd']) && Number.isSafeInteger(Number(opts['credential-fd'])) && Number(opts['credential-fd']) >= 3
      && Number(opts['credential-fd']) <= 2147483647, 'credential fd must be an integer at least 3');
    opts.credentialFd = Number(opts['credential-fd']); delete opts['credential-fd'];
  }
  let data;
  try { data = await evaluations({ ...opts, action, appRoot }, invocationStartedAt); }
  catch (error) {
    if (error?.code !== 'evaluation_live_writer_stuck') throw error;
    (await import('./evaluation-live-writer.mjs')).terminateStuckLiveWriter(error);
  }
  return { data, text: action === 'compare' && !opts.json ? data.markdown : JSON.stringify(data, null, 2), exitCode: ['freeze', 'run', 'resume', 'reconcile', 'cancel'].includes(action) && !opts.yes ? 3 : 0 };
}

// An opaque async context is established only after actual harness acquisition.
// Public evaluations(inspect) deliberately does not consult this context.
const screeningWriter = new AsyncLocalStorage();
const spendOperation = new AsyncLocalStorage();
export async function withEvaluationWriter(options, work, recovery) {
  check(!screeningWriter.getStore(), 'nested evaluation writer refused');
  if (recovery !== undefined) { fields(recovery, ['recover']); check(recovery.recover?.status === 'recoverable', 'verified recovery observation required'); }
  const bound = await scope(options), home = join(bound.paths.state, 'session-trials');
  check(await privatePath(home), 'ledger missing');
  const release = await ledgerLock(home, { harness: true, ...(recovery === undefined ? {} : { recover: structuredClone(recovery.recover) }) });
  let context;
  try {
    const owner = await inspectHarnessLock(home);
    check(owner?.owner?.pid === process.pid && owner.status === 'active-or-unverifiable', 'screening lock unavailable');
    let deadlineFailure;
    const lifecycle = new Promise((_, reject) => { deadlineFailure = reject; });
    context = { home, owner, spendTail: Promise.resolve(), acceptingSpend: true, liveFence: null, deadlineFailure };
    return await Promise.race([screeningWriter.run(context, work), lifecycle]);
  } finally {
    if (context) {
      context.acceptingSpend = false;
      if (context.liveFence) await context.liveFence.close();
      else await context.spendTail;
    }
    // A stuck live fence throws above: retain the original lock, never release
    // behind an outstanding registered filesystem mutation.
    await release(); context?.liveFence?.released();
  }
}

// Only a real acquired writer can create a controller fence. This is an internal
// lifetime boundary, never an authority handle supplied by a descriptor.
export async function evaluationLiveFence(options, { planDigest, deadline, cleanupDeadline }) {
  const held = screeningWriter.getStore();
  check(held && held.acceptingSpend && held.liveFence === null, 'live writer context required');
  check(Number.isSafeInteger(deadline) && Number.isSafeInteger(cleanupDeadline)
    && Date.now() < deadline && deadline <= cleanupDeadline, 'invalid live writer deadline');
  const bound = await scope(options), dir = join(bound.paths.state, 'session-trials', options.experiment);
  const { plan } = await readFrozen(dir, bound, options.experiment);
  check(held.home === join(bound.paths.state, 'session-trials') && plan.digest === planDigest, 'live writer plan changed');
  const { createLiveWriterFence } = await import('./evaluation-live-writer.mjs');
  const fence = createLiveWriterFence({ dir, planDigest, plan, deadline, cleanupDeadline,
    owner: held.owner, inspectOwner: () => inspectHarnessLock(held.home),
    spendTail: () => held.spendTail, stopSpend: () => { held.acceptingSpend = false; }, onDeadline: held.deadlineFailure });
  held.liveFence = fence; return fence;
}

// Spend alone may compose with an existing controller writer. Queue insertion is
// synchronous, before scope reads: parallel calls cannot inspect the same balance.
// This does not make the general writer reentrant. The controller must await its
// spend calls and must not run other ledger mutations concurrently with them.
export function withEvaluationSpendWriter(options, work) {
  check(!spendOperation.getStore(), 'nested spend transaction refused');
  const held = screeningWriter.getStore();
  if (!held) return withEvaluationWriter(options, () => withEvaluationSpendWriter(options, work));
  check(held.acceptingSpend, 'evaluation writer is closing');
  const result = held.spendTail.then(async () => {
    const bound = await scope(options);
    check(join(bound.paths.state, 'session-trials') === held.home, 'spend writer workspace mismatch');
    check(fingerprint(await inspectHarnessLock(held.home)) === fingerprint(held.owner), 'spend writer changed');
    return spendOperation.run(true, work);
  });
  // Retain the caller's rejection while allowing later recovery and lock release.
  held.spendTail = result.then(() => {}, () => {});
  return result;
}
export async function readEvaluationForScreening(options) {
  check(evaluationId(options.experiment), 'invalid experiment');
  const bound = await scope(options), home = join(bound.paths.state, 'session-trials');
  check(await privatePath(home), 'ledger missing');
  const observeWriter = async () => {
    check(!await safePath(join(home, '.harness-lock-guard')), 'harness lock transition');
    const owner = await inspectHarnessLock(home), held = screeningWriter.getStore();
    check(held?.home === home ? fingerprint(owner) === fingerprint(held.owner) : owner === null, 'screening writer not inactive');
    return fingerprint(owner);
  };
  const before = await observeWriter();
  const receipt = await readFrozen(join(home, options.experiment), bound, options.experiment);
  const execution = await (await import('./evaluation-execution.mjs')).inspectExecutions(receipt.plan.destination, receipt.plan);
  check(before === await observeWriter(), 'screening writer changed');
  return { receipt, execution, observeWriter };
}

// Shared private workspace boundary for passive quality observations.
export { scope as evaluationScope, readFrozen as readFrozenEvaluation };
