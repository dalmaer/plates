// Passive observations extend the existing private session-trials namespace.
// No provider calls, scheduler, automatic cleanup, route changes or execution.
import { lstat, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { evaluationScope, readFrozenEvaluation, evaluationBytes } from './evaluation-ledger.mjs';
import { inspectExecutions } from './evaluation-execution.mjs';
import { safePath, readJson, ledgerLock, storeImmutable } from './session-ledger-io.mjs';
import { fingerprint, sealRecord, fields, checkEvaluation as check } from './evaluation-records.mjs';
import { QUALITY_BYTES, validateQualityBundle, qualityEpisodeKey, qualitySourceKey } from './agent-quality-records.mjs';

const DEFAULT_RETENTION = { days: 90, maxBytes: QUALITY_BYTES, maxEvents: 1000 };
const emptyBundle = retention => ({ schemaVersion: 2, kind: 'agent-quality', retention, episodes: [] });
async function privatePath(path, directory = true) {
  if (!await safePath(path, directory)) return false;
  const s = await lstat(path);
  check((s.mode & 0o077) === 0 && (directory || s.nlink === 1), 'quality storage must be private and unlinked');
  return true;
}
function authorize(bound, bundle) {
  const permitted = new Set([bound.workspace.repo, ...bound.projects.map(p => p.repo)].map(r => r.toLowerCase()));
  for (const e of bundle.episodes) check(permitted.has(e.project.toLowerCase()), 'quality project outside workspace manifest');
}
async function source(options) {
  check(!(options.bundle && options.inputBundle), 'choose one quality input');
  if (options.inputBundle) return { bundle: validateQualityBundle(JSON.parse(JSON.stringify(options.inputBundle))), bundlePath: null, bundleHash: fingerprint(options.inputBundle) };
  check(typeof options.bundle === 'string', 'quality collect needs explicit bundle');
  const bytes = await evaluationBytes(resolve(options.bundle), QUALITY_BYTES);
  let bundle;
  try { bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { check(false, 'invalid quality UTF-8 JSON'); }
  return { bundle: validateQualityBundle(bundle), bundlePath: resolve(options.bundle), bundleHash: fingerprint(bundle) };
}
function refinesKnown(before, after, path = '') {
  if (before === null) return true;
  if (path === 'resources.currencySource' && before === 'unknown') return ['unknown', 'actual', 'estimate'].includes(after);
  if (Array.isArray(before)) return Array.isArray(after) && after.length >= before.length && before.every((v, i) => refinesKnown(v, after[i], `${path}.${i}`));
  if (typeof before === 'object') return after !== null && typeof after === 'object' && Object.keys(before).every(k => refinesKnown(before[k], after[k], path ? `${path}.${k}` : k));
  return before === after;
}
function preservesAttempt(before, after) {
  if (!after) return false;
  if (fingerprint(before) === fingerprint(after)) return true;
  if (!['running', 'unknown'].includes(before.status) || after.status === 'running' || before.status === 'unknown' && after.status === 'unknown') return false;
  if (before.id !== after.id || before.parentId !== after.parentId || before.stage !== after.stage) return false;
  // The immutable source receipt keeps the original uncertainty. Only unknown
  // fields may be filled as that same attempt reaches a terminal observation.
  const { status: ignoredBefore, ...known } = before, { status: ignoredAfter, ...observed } = after;
  return refinesKnown(known, observed);
}
function mergeEpisodes(episodes) {
  const bySource = new Map(), byEpisode = new Map();
  for (const e of episodes) {
    const sourceKey = qualitySourceKey(e), known = bySource.get(sourceKey);
    check(!known || known.digest === e.digest, 'quality source identity changed');
    if (known) continue;
    bySource.set(sourceKey, e);
    const key = qualityEpisodeKey(e), history = byEpisode.get(key) ?? [];
    history.push(e); byEpisode.set(key, history);
  }
  const latest = new Map();
  for (const [key, history] of byEpisode) {
    const roots = history.filter(e => e.previousDigest === null);
    check(roots.length === 1, 'quality episode needs exactly one original record');
    let current = roots[0], seen = 1;
    while (true) {
      const next = history.filter(e => e.previousDigest === current.digest);
      check(next.length <= 1, 'conflicting quality episode revision');
      if (!next.length) break;
      const update = next[0];
      check(current.links.every(link => update.links.includes(link)), 'prior task mapping removed');
      check(update.passport.timing === current.passport.timing, 'retrospective classification cannot become prospective');
      check(update.createdAt >= current.createdAt && (current.passport.timing !== 'prospective' || fingerprint(current.passport) === fingerprint(update.passport)), 'frozen passport changed');
      check((current.workflow === null || current.workflow === update.workflow) && (current.assignedAt === null || current.assignedAt === update.assignedAt), 'observed assignment changed');
      // Work cannot disappear or reorder. Known fields and terminal outcomes
      // remain fixed; a retry is a new attempt, not an edited failure.
      check(update.attempts.length >= current.attempts.length && current.attempts.every((a, index) => preservesAttempt(a, update.attempts[index])), 'prior attempt changed, reordered or omitted');
      for (const v of current.evaluations) check(update.evaluations.some(x => x.id === v.id && fingerprint(x) === fingerprint(v)), 'prior adjudication changed or omitted');
      for (const f of current.followup) check(update.followup.some(x => fingerprint(x) === fingerprint(f)), 'prior follow-up omitted');
      check((current.usage ?? []).every((v,i) => update.usage?.[i] && fingerprint(v) === fingerprint(update.usage[i])), 'prior usage changed, reordered or omitted');
      current = update; seen++;
      check(seen <= history.length, 'cyclic quality history');
    }
    check(seen === history.length, 'unresolved quality episode predecessor');
    latest.set(key, current);
  }
  return { bySource, latest };
}
export async function qualitySourceUsage(directory) {
  const root = join(directory, 'sources'), result = { bytes: 0, events: 0, issues: [] };
  if (!await privatePath(root)) return result;
  const names = await readdir(root);
  check(names.length <= 10000 && names.every(name => /^command-[a-f0-9]{64}$/.test(name)), 'foreign quality source');
  for (const name of names) {
    const dir = join(root, name); check(await privatePath(dir), 'unsafe quality source');
    const files = await readdir(dir);
    check(files.every(file => ['intent.json', 'result.json'].includes(file)), 'foreign quality source record');
    result.events += Math.max(1, files.length);
    const records = {};
    for (const file of files) {
      const path = join(dir, file); check(await privatePath(path, false), 'unsafe quality source record');
      const size = (await lstat(path)).size; result.bytes += size;
      check(size <= 65536 && result.bytes <= QUALITY_BYTES, 'quality source exceeds retention byte bound');
      try {
        const record = await readJson(path, 65536);
        check(record.kind === `quality-command-${file.slice(0, -5)}` && sealRecord(record).digest === record.digest, 'invalid source record'); records[file] = record;
      } catch { result.issues.push({ source: name, record: file, state: 'uncertain', reason: 'record-unavailable' }); }
    }
    if (!records['intent.json']) result.issues.push({ source: name, state: 'uncertain', reason: 'intent-unavailable' });
    else if (!records['result.json']) result.issues.push({ source: name, state: 'uncertain', reason: 'result-unavailable' });
    else if (records['result.json'].intentDigest !== records['intent.json'].digest) result.issues.push({ source: name, state: 'uncertain', reason: 'result-binding-mismatch' });
  }
  return result;
}
async function readCollection(bound, now) {
  const home = join(bound.paths.state, 'session-trials'), directory = join(home, '.quality');
  if (!await privatePath(directory)) return { directory, receipts: [], bundle: emptyBundle(DEFAULT_RETENTION), allEpisodes: [], coverage: { events: 0, expired: 0, retainedBytes: 0, rawTranscripts: false, cleanup: 'manual-only' } };
  const entries = await readdir(directory);
  check(entries.every(e => e === 'batches' || e === 'reports' || e === 'sources'), 'foreign quality storage');
  const sources = await qualitySourceUsage(directory);
  let reportBytes = 0;
  const reports = join(directory, 'reports');
  if (await privatePath(reports)) {
    const names = await readdir(reports);
    check(names.length <= 10000 && names.every(name => /^[a-f0-9]{64}\.json$/.test(name)), 'foreign quality report');
    for (const name of names) {
      const path = join(reports, name); check(await privatePath(path, false), 'missing quality report');
      reportBytes += (await lstat(path)).size; check(reportBytes <= QUALITY_BYTES, 'quality reports exceed retention byte bound');
    }
  }
  const batches = join(directory, 'batches');
  if (!await privatePath(batches)) {
    check(!entries.includes('batches'), 'unsafe quality batches');
    return { directory, receipts: [], bundle: emptyBundle(DEFAULT_RETENTION), allEpisodes: [], coverage: { events: 0, expired: 0, retainedBytes: reportBytes + sources.bytes, reportBytes, sourceBytes: sources.bytes, sourceEvents: sources.events, sourceIssues: sources.issues, rawTranscripts: false, cleanup: 'manual-only' } };
  }
  const files = (await readdir(batches)).sort();
  check(files.length <= 10000 && files.every(f => /^[a-f0-9]{64}\.json$/.test(f)), 'partial or foreign quality receipt');
  let retainedBytes = reportBytes + sources.bytes, retention = null;
  const receipts = [], collectedAt = new Map();
  for (const filename of files) {
    const path = join(batches, filename); check(await privatePath(path, false), 'missing quality receipt');
    retainedBytes += (await lstat(path)).size;
    check(retainedBytes <= QUALITY_BYTES, 'quality storage exceeds byte bound');
    const receipt = await readJson(path, QUALITY_BYTES);
    fields(receipt, ['schemaVersion', 'kind', 'id', 'createdAt', 'bindingDigest', 'inputDigest', 'bundle', 'digest']);
    check(receipt.schemaVersion === 2 && receipt.kind === 'quality-collection' && receipt.id === filename.slice(0, -5) && /^[a-f0-9]{64}$/.test(receipt.inputDigest) && fingerprint(bound) === receipt.bindingDigest && sealRecord(receipt).digest === receipt.digest && new Date(receipt.createdAt).toISOString() === receipt.createdAt, 'invalid quality receipt provenance');
    validateQualityBundle(receipt.bundle); authorize(bound, receipt.bundle);
    if (retention) check(fingerprint(retention) === fingerprint(receipt.bundle.retention), 'quality retention policy changed');
    retention = receipt.bundle.retention;
    for (const e of receipt.bundle.episodes) collectedAt.set(e.digest, receipt.createdAt);
    receipts.push(receipt);
  }
  const allEpisodes = receipts.flatMap(r => r.bundle.episodes), merged = mergeEpisodes(allEpisodes);
  retention ??= DEFAULT_RETENTION;
  check(allEpisodes.length + sources.events <= retention.maxEvents && retainedBytes <= retention.maxBytes, 'quality retention capacity exceeded');
  const active = [...merged.latest.values()].filter(e => Date.parse(collectedAt.get(e.digest)) + retention.days * 86400000 > now);
  return { directory, receipts, allEpisodes, bundle: { ...emptyBundle(retention), episodes: active.sort((a, b) => qualityEpisodeKey(a).localeCompare(qualityEpisodeKey(b))) },
    coverage: { events: allEpisodes.length, expired: merged.latest.size - active.length, retainedBytes, reportBytes, sourceBytes: sources.bytes, sourceEvents: sources.events, sourceIssues: sources.issues, rawTranscripts: false, cleanup: 'manual-only' } };
}
async function frozenJoins(bound, episodes) {
  const frozen = new Map(), owners = new Map();
  for (const e of episodes) for (const a of e.attempts) {
    if (!a.experiment) continue;
    const x = a.experiment;
    const identity = `${x.id}:${x.slot}:${x.attemptId}`, owner = qualityEpisodeKey(e);
    check(!owners.has(identity) || owners.get(identity) === owner, 'frozen attempt belongs to another episode'); owners.set(identity, owner);
    if (!frozen.has(x.id)) {
      const dir = join(bound.paths.state, 'session-trials', x.id), ledger = await readFrozenEvaluation(dir, bound, x.id);
      frozen.set(x.id, { experiment: x.id, plan: ledger.plan, execution: await inspectExecutions(dir, ledger.plan) });
    }
    const f = frozen.get(x.id), pair = f.plan.bundle.comparison.pairs.find(p => p.id === x.pairId);
    check(f.plan.digest === x.planDigest && f.plan.bundle.comparison.repository.toLowerCase() === e.project.toLowerCase() && pair, 'quality frozen plan join mismatch');
    const caseRecord = f.plan.bundle.cases.find(c => c.id === pair.case.id);
    check(e.passport.baseCommit === caseRecord.startingCommit && e.passport.acceptanceDigest === caseRecord.acceptanceManifest.digest, 'quality frozen task mismatch');
    const trial = f.execution?.trials.find(t => t.slot === x.slot);
    const intent = trial?.records?.intent;
    check(intent?.id === x.attemptId && intent.input?.planDigest === x.planDigest && intent.input?.request?.pairId === x.pairId && intent.input?.request?.arm === x.arm, 'quality attempt join mismatch');
  }
  return [...frozen.values()];
}

export async function qualityOperation(options) {
  const { action, yes = false, digest } = options;
  check(['collect', 'inspect'].includes(action), 'unknown quality storage operation');
  check(action === 'collect' || (!yes && digest === undefined && !options.bundle && !options.inputBundle), 'inspect is read only');
  check(digest === undefined || yes, 'quality digest requires --yes');
  const now = options.now === undefined ? Date.now() : Date.parse(options.now);
  check(Number.isFinite(now), 'invalid quality observation time');
  const bound = await evaluationScope(options), home = join(bound.paths.state, 'session-trials');
  check(!await safePath(join(home, '.lock'), false), 'session storage locked');
  const existing = await readCollection(bound, now);
  if (action === 'inspect') return { action, status: 'observed', preview: false, bundle: existing.bundle, receipts: existing.receipts, coverage: existing.coverage, frozen: await frozenJoins(bound, existing.bundle.episodes) };
  const input = await source(options); authorize(bound, input.bundle);
  if (existing.receipts.length) check(fingerprint(existing.bundle.retention) === fingerprint(input.bundle.retention), 'quality retention policy already frozen');
  const merged = mergeEpisodes([...existing.allEpisodes, ...input.bundle.episodes]);
  const old = new Set(existing.allEpisodes.map(qualitySourceKey));
  const added = input.bundle.episodes.filter(e => !old.has(qualitySourceKey(e)));
  await frozenJoins(bound, [...merged.latest.values()]);
  const identity = { bindingDigest: fingerprint(bound), bundlePath: input.bundlePath, bundleHash: input.bundleHash };
  const inputId = fingerprint(identity), original = existing.receipts.find(r => r.id === inputId);
  if (yes && original) {
    check(digest === original.inputDigest, 'stale quality recovery digest');
    return { action, status: 'collected', preview: false, recovered: true, receipt: original, added: 0, duplicates: input.bundle.episodes.length };
  }
  const previewDigest = original?.inputDigest ?? fingerprint({ ...identity, previous: existing.receipts.map(r => r.digest), retainedBytes: existing.coverage.retainedBytes });
  const receipt = sealRecord({ schemaVersion: 2, kind: 'quality-collection', id: inputId, createdAt: new Date(now).toISOString(), bindingDigest: fingerprint(bound), inputDigest: previewDigest, bundle: { ...input.bundle, episodes: added } });
  check(merged.bySource.size + (existing.coverage.sourceEvents ?? 0) <= input.bundle.retention.maxEvents && existing.coverage.retainedBytes + (added.length ? Buffer.byteLength(JSON.stringify(receipt) + '\n') : 0) <= input.bundle.retention.maxBytes, 'quality retention capacity exhausted');
  const result = { action, status: 'preview', preview: true, digest: previewDigest, added: added.length, duplicates: input.bundle.episodes.length - added.length, episodes: merged.latest.size, retention: input.bundle.retention, rawTranscripts: false };
  if (!yes) return result;
  check(digest === previewDigest, 'stale or missing quality preview digest');
  if (!added.length) return { ...result, status: 'collected', preview: false, recovered: true };
  if (!await privatePath(home)) await mkdir(home, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  check(await privatePath(home), 'missing session storage');
  const release = await ledgerLock(home);
  try {
    const freshBound = await evaluationScope(options), freshSource = await source(options), fresh = await readCollection(freshBound, now);
    check(fingerprint(bound) === fingerprint(freshBound) && input.bundleHash === freshSource.bundleHash && fingerprint(existing.receipts) === fingerprint(fresh.receipts) && existing.coverage.retainedBytes === fresh.coverage.retainedBytes, 'quality inputs changed before collection');
    await frozenJoins(bound, freshSource.bundle.episodes);
    const directory = existing.directory;
    if (!await privatePath(directory)) await mkdir(directory, { mode: 0o700 });
    const batches = join(directory, 'batches'); if (!await privatePath(batches)) await mkdir(batches, { mode: 0o700 });
    await storeImmutable(join(batches, `${inputId}.json`), receipt);
    return { ...result, status: 'collected', preview: false, recovered: false, receipt };
  } finally { await release(); }
}

/** Internal command adapter writes after its exact command approval, never dispatches. */
export async function qualitySourceOperation(options) {
  const { id, kind, record } = options;
  check(/^command-[a-f0-9]{64}$/.test(id) && ['intent', 'result'].includes(kind), 'invalid quality command source identity');
  check(record?.schemaVersion === 2 && record.kind === `quality-command-${kind}` && sealRecord(record).digest === record.digest && record.output === 'discarded', 'invalid quality command metadata');
  const bytes = Buffer.byteLength(JSON.stringify(record) + '\n'); check(bytes <= 65536, 'quality command metadata exceeds bound');
  const bound = await evaluationScope(options), home = join(bound.paths.state, 'session-trials');
  check(await privatePath(home), 'begin an episode before reserving command work');
  const release = await ledgerLock(home);
  try {
    const currentBound = await evaluationScope(options);
    check(fingerprint(currentBound) === fingerprint(bound), 'quality source workspace changed before mutation');
    const existing = await readCollection(bound, options.now === undefined ? Date.now() : Date.parse(options.now));
    const root = join(existing.directory, 'sources'), directory = join(root, id), path = join(directory, `${kind}.json`);
    if (await privatePath(path, false)) {
      const original = await readJson(path, 65536);
      check(fingerprint(original) === fingerprint(record), 'original quality command record differs');
      return { recovered: true, record: original, path };
    }
    const exists = await privatePath(directory);
    if (kind === 'intent') {
      check(!exists, 'original command reservation is uncertain; never redispatch');
      check(existing.bundle.episodes.some(e => e.project.toLowerCase() === record.identity?.project?.toLowerCase() && e.id === record.identity?.episodeId), 'command source has no active authorized episode');
      check(id === `command-${fingerprint({ project: record.identity.project.toLowerCase(), episodeId: record.identity.episodeId, id: record.id })}`, 'command source target mismatch');
    } else {
      check(exists && await privatePath(join(directory, 'intent.json'), false), 'original command intent missing');
      const intent = await readJson(join(directory, 'intent.json'), 65536);
      check(sealRecord(intent).digest === intent.digest && intent.kind === 'quality-command-intent' && record.intentDigest === intent.digest && record.id === intent.id, 'command result does not bind original intent');
    }
    check(existing.coverage.events + (existing.coverage.sourceEvents ?? 0) + 1 <= existing.bundle.retention.maxEvents && existing.coverage.retainedBytes + bytes <= existing.bundle.retention.maxBytes, 'quality retention capacity exhausted');
    if (!await privatePath(root)) await mkdir(root, { mode: 0o700 });
    if (!exists) await mkdir(directory, { mode: 0o700 });
    await storeImmutable(path, record);
    return { recovered: false, record, path };
  } finally { await release(); }
}
