// Fixed installed-source coverage; no working-tree scan or private inputs.
import { open } from 'node:fs/promises';
import { checkEvaluation as check, byteDigest, fingerprint } from './evaluation-records.mjs';
export const CONTROLLER_SOURCES = Object.freeze([
  'cli.mjs', 'evaluation-artifacts.mjs', 'evaluation-docker.mjs', 'evaluation-execution-input.mjs',
  'evaluation-execution.mjs', 'evaluation-comparison.mjs', 'evaluation-comparison-report.mjs', 'evaluation-ledger.mjs', 'evaluation-provenance.mjs', 'evaluation-records.mjs', 'evaluation-spend.mjs',
  'evaluation-provider.mjs', 'evaluation-credential-pipe.mjs', 'evaluation-public-packet.mjs',
  'evaluation-input-partition.mjs', 'evaluation-corpus.mjs',
  'evaluation-live-reconcile.mjs', 'evaluation-live-recovery-execution.mjs',
  'evaluation-live.mjs', 'evaluation-live-generation.mjs', 'evaluation-live-input.mjs', 'evaluation-live-inspection.mjs',
  'evaluation-live-records.mjs', 'evaluation-live-state.mjs', 'evaluation-live-transfer.mjs', 'evaluation-live-writer.mjs',
  'evaluation-corpus/catalog.json', 'evaluation-corpus/input-classification-v1.json',
  'evaluation-corpus/private/coordinator-guidance.json',
  'evaluation-corpus/probes/canvas-retirement-support.mjs', 'evaluation-corpus/probes/canvas-retirement.mjs',
  'evaluation-corpus/probes/consumer-options.mjs', 'evaluation-corpus/probes/coordinator-guidance.mjs',
  'evaluation-corpus/probes/package-entry.mjs', 'evaluation-corpus/probes/rename-ownership.mjs',
  'evaluation-corpus/probes/rename-support.mjs', 'evaluation-corpus/probes/workspace-command-doc.mjs',
  'evaluation-corpus/probes/workspace-original.txt',
  'lesson-screening-criteria.mjs', 'evaluation-screening.mjs', 'session-ledger-io.mjs', 'validation-budget.mjs', 'web/update-container.mjs', 'web/workspace.mjs',
]);
async function observe() {
  const sources = await Promise.all(CONTROLLER_SOURCES.map(async path => {
    const handle = await open(new URL(path, import.meta.url));
    try {
      const stat = await handle.stat(); check(stat.isFile() && stat.size <= 1024 * 1024, 'controller source unavailable');
      const buffer = Buffer.alloc(1024 * 1024 + 1); let length = 0;
      while (length < buffer.length) { const r = await handle.read(buffer, length, buffer.length - length, length); if (!r.bytesRead) break; length += r.bytesRead; }
      check(length <= 1024 * 1024, 'controller source exceeds bound');
      return { path: 'lib/' + path, byteDigest: byteDigest(buffer.subarray(0, length)) };
    } finally { await handle.close(); }
  }));
  const body = { nodeVersion: process.version, sources };
  return { ...body, digest: fingerprint(body) };
}
const loadedSource = await observe();
export async function controllerIdentity() {
  const current = await observe();
  check(current.digest === loadedSource.digest, 'controller source changed in running process; restart before preview');
  return structuredClone(loadedSource);
}
