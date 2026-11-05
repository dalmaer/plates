// Local reporting transaction: reuse the collection ledger, retain report bytes.
import { lstat, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluationScope } from './evaluation-ledger.mjs';
import { qualityOperation, qualitySourceUsage } from './agent-quality-ledger.mjs';
import { qualityReport } from './agent-quality-report.mjs';
import { summarizeComparison } from './evaluation-comparison-report.mjs';
import { fingerprint, sealRecord, checkEvaluation as check } from './evaluation-records.mjs';
import { ledgerLock, safePath, readJson, storeImmutable } from './session-ledger-io.mjs';

export async function qualityWeekly({ inputBundle, previous, referenceMix, ...options }) {
  const { yes = false, digest } = options;
  check(digest === undefined || yes, 'weekly digest requires --yes');
  const before = await qualityOperation({ ...options, action: 'inspect', yes: false, digest: undefined });
  const input = inputBundle ?? { ...before.bundle, episodes: [] };
  const bound = await evaluationScope(options);
  const identity = fingerprint({ bound, input, previous: previous ?? null, referenceMix: referenceMix ?? null });
  if (yes && /^[a-f0-9]{64}$/.test(digest)) {
    const recovered = await readSaved(bound, digest, identity);
    if (recovered) return recovered;
  }
  const collectionOptions = { ...options, action: 'collect', inputBundle: input, yes: false, digest: undefined };
  const preview = await qualityOperation(collectionOptions);
  // Report inputs are part of the reviewed operation, not mutable side inputs.
  const expected = fingerprint({ collection: preview.digest, previous: previous ?? null, referenceMix: referenceMix ?? null });
  if (yes) check(digest === expected, 'stale or missing weekly preview digest');
  // Validate report options before any collection is committed.
  qualityReport(before.bundle, { previous, referenceMix, collectionCoverage: before.coverage });
  const collected = yes ? await qualityOperation({ ...collectionOptions, yes: true, digest: preview.digest }) : preview;
  const collection = { status: collected.status, added: collected.added, duplicates: collected.duplicates,
    digest: preview.digest, receiptDigest: collected.receipt?.digest ?? null };
  const observed = yes ? await qualityOperation({ ...options, action: 'inspect', yes: false, digest: undefined }) : before;
  const comparisons = observed.frozen.map(({ plan, execution }) => summarizeComparison(plan, execution));
  const report = qualityReport(observed.bundle, { previous, referenceMix, comparisons, collectionCoverage: observed.coverage });
  const result = { schemaVersion: 1, kind: 'agent-quality-weekly', readOnly: !yes, digest: expected,
    collection, report, saved: yes ? { digest: report.digest, name: `${expected}.json`, recovered: false } : null,
    scheduler: 'not-configured-by-command', modelRuns: 0, automaticRouting: false };
  return yes ? retainReport(options, bound, identity, result, observed.bundle.retention) : result;
}

async function readSaved(bound, id, identity) {
  const path = join(bound.paths.state, 'session-trials/.quality/reports', `${id}.json`);
  if (!await safePath(path, false)) return null;
  const stat = await lstat(path);
  check(stat.nlink === 1 && (stat.mode & 0o077) === 0, 'quality report must be private and unlinked');
  const receipt = await readJson(path, 4194304);
  check(receipt.kind === 'quality-weekly-receipt' && receipt.id === id && receipt.identity === identity
    && sealRecord(receipt).digest === receipt.digest, 'weekly receipt identity or bytes changed');
  return { ...receipt.result, saved: { ...receipt.result.saved, recovered: true } };
}

async function retainReport(options, bound, identity, result, retention) {
  const home = join(bound.paths.state, 'session-trials');
  if (!await safePath(home)) await mkdir(home, { mode: 0o700 });
  const release = await ledgerLock(home);
  try {
    check(fingerprint(await evaluationScope(options)) === fingerprint(bound), 'weekly workspace changed');
    const recovered = await readSaved(bound, result.digest, identity);
    if (recovered) return recovered;
    const directory = join(home, '.quality'), reports = join(directory, 'reports');
    for (const path of [directory, reports]) {
      if (!await safePath(path)) await mkdir(path, { mode: 0o700 });
      check(((await lstat(path)).mode & 0o077) === 0, 'quality reports must be private');
    }
    const names = await readdir(reports);
    check(names.every(n => /^[a-f0-9]{64}\.json$/.test(n)), 'foreign quality report');
    let bytes = (await qualitySourceUsage(directory)).bytes;
    for (const folder of [reports, join(directory, 'batches')]) {
      if (!await safePath(folder)) continue;
      for (const n of await readdir(folder)) {
        check(/^[a-f0-9]{64}\.json$/.test(n), 'foreign quality receipt');
        const file = join(folder, n); check(await safePath(file, false), 'unsafe quality report');
        const stat = await lstat(file);
        check(stat.nlink === 1 && (stat.mode & 0o077) === 0, 'quality report must be private and unlinked');
        bytes += stat.size;
      }
    }
    const receipt = sealRecord({ schemaVersion: 1, kind: 'quality-weekly-receipt', id: result.digest, identity, result });
    check(names.length < retention.maxEvents && bytes + Buffer.byteLength(JSON.stringify(receipt) + '\n') <= retention.maxBytes, 'quality report retention capacity exhausted; collection remains retained');
    await storeImmutable(join(reports, result.saved.name), receipt);
    return result;
  } finally { await release(); }
}
