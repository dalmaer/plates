// The frozen task handoff and evaluator the executor trials used (phase 146):
// hash-bound artifacts, the fixture-helper integrity policy, and the receipt
// disclosure scoring rule for the held-out task pair. Pure functions over bytes,
// paths and observations; nothing here runs a candidate, a model or git.
//
// Ported from the stopped trials:
//   codex/gas-city-evaluation@1f9b083d experiments/gas-city/run-frozen-evaluator.mjs
//     (handoff digest, artifact pins, artifacts and report outside the worker root)
//   codex/openhands-evaluation@9d891e96 experiments/openhands/real-receipt-evaluator.mjs
//     (helper integrity before any candidate import, helper manifest digest, case
//     list and per-case checks), contained-score.mjs (same checks, sandboxed subject)
//   codex/openhands-evaluation@9d891e96 docs/research/openhands-containment/shared-handoff.json
//     and shared-selected-spec.json (the pins; recorded in tests/fixtures/executor/)
// Left out: driving the evaluator itself. It imports lib/web modules from the
// baseline commit 037e13b4, which exists only on the unpublished trial and
// codex/switchboard-consolidation branches, and runs the subject under macOS
// sandbox-exec; observations are scored here, not produced.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

export const HANDOFF_KIND = 'plates-receipt-race-handoff';
export const sha256 = (/** @type {string | Uint8Array} */ bytes) => createHash('sha256').update(bytes).digest('hex');
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const within = (child, parent) => child === parent || child.startsWith(parent.endsWith('/') ? parent : parent + '/');

/**
 * Verify a frozen handoff before an evaluator runs (trusted controller only).
 * `bytes` are the handoff file's bytes and `expectedSHA256` comes from outside
 * the worker. `artifacts` maps each pinned artifact name to its resolved real
 * path and bytes, as read by the host; a pinned artifact the host could not
 * read is a refusal, never a pass. `workerRoot` and `reportPath` are real paths.
 * @param {{ bytes: Uint8Array | string, expectedSHA256: string, artifacts?: Record<string, { path?: string, bytes: Uint8Array | string }>, workerRoot?: string, reportPath?: string }} input
 * @returns {{ verified: boolean, refusals: string[], handoff: any }}
 */
export function verifyHandoff({ bytes, expectedSHA256, artifacts = {}, workerRoot, reportPath }) {
  const refusals = [];
  if (!/^[a-f0-9]{64}$/.test(expectedSHA256 ?? '') || sha256(bytes) !== expectedSHA256) return { verified: false, refusals: ['handoff-digest-mismatch'], handoff: null };
  let handoff;
  try { handoff = JSON.parse(typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('utf8')); } catch { return { verified: false, refusals: ['handoff-unreadable'], handoff: null }; }
  if (!object(handoff) || handoff.schema !== 1 || handoff.kind !== HANDOFF_KIND || handoff.modelExecution !== 'not-authorized' || !object(handoff.artifacts)) {
    return { verified: false, refusals: ['wrong-frozen-handoff'], handoff };
  }
  for (const [name, pin] of Object.entries(handoff.artifacts)) {
    const actual = artifacts[name];
    if (!object(pin) || !/^[a-f0-9]{64}$/.test(pin.sha256)) { refusals.push(`artifact-pin-invalid:${name}`); continue; }
    if (!actual) { refusals.push(`artifact-unavailable:${name}`); continue; }
    if (sha256(actual.bytes) !== pin.sha256) refusals.push(`artifact-changed:${name}`);
    if (workerRoot && actual.path && within(actual.path, workerRoot)) refusals.push(`artifact-in-worker-root:${name}`);
  }
  if (workerRoot && !isAbsolute(workerRoot)) refusals.push('worker-root-not-absolute');
  if (workerRoot && reportPath && within(reportPath, workerRoot)) refusals.push('report-in-worker-root');
  return { verified: refusals.length === 0, refusals, handoff };
}

/**
 * Check a recorded evaluation against the frozen handoff it claims: the same
 * handoff digest, baseline and evaluator pin, with helper integrity passed.
 * @param {{ manifestSHA256?: string, evaluatorSHA256?: string, baseline?: string, integrityPassed?: boolean }} report
 * @param {{ handoff: any, handoffSHA256: string }} frozen
 */
export function checkEvaluationReport(report, { handoff, handoffSHA256 }) {
  const refusals = [];
  if (report?.manifestSHA256 !== handoffSHA256) refusals.push('handoff-changed');
  if (report?.baseline !== handoff?.baseline) refusals.push('baseline-changed');
  if (report?.evaluatorSHA256 !== handoff?.artifacts?.evaluator?.sha256) refusals.push('evaluator-changed');
  if (report?.integrityPassed !== true) refusals.push('helper-integrity-not-passed');
  return { accepted: refusals.length === 0, refusals };
}

/**
 * The helper manifest digest the trial evaluator recorded: sha256 over the JSON
 * of [{ path, originalSHA256, actualSHA256 }] in baseline path order.
 * @param {Array<[string, string]>} baseline  [path, sha256] pairs at the baseline
 * @param {Record<string, string>} [actual]   path -> sha256 in the candidate (defaults to the baseline)
 */
export function helperManifestDigest(baseline, actual = Object.fromEntries(baseline)) {
  const sorted = [...baseline].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256(JSON.stringify(sorted.map(([path, originalSHA256]) => ({ path, originalSHA256, actualSHA256: actual[path] }))));
}

/**
 * List a candidate's helper tree without following links: regular `.mjs` files
 * with their sha256, plus every symlink (always refused).
 * @param {string} root  candidate root
 * @param {string} [relative]
 * @returns {Array<{ path: string, type: 'file' | 'symlink', sha256?: string }>}
 */
export function readHelperTree(root, relative = 'tests/helpers') {
  /** @type {Array<{ path: string, type: 'file' | 'symlink', sha256?: string }>} */
  const entries = [];
  const top =lstatSync(join(root, relative));
  if (top.isSymbolicLink()) return [{ path: relative, type: 'symlink' }];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) entries.push({ path, type: 'symlink' });
    else if (entry.isDirectory()) entries.push(...readHelperTree(root, path));
    else if (entry.isFile() && path.endsWith('.mjs')) entries.push({ path, type: 'file', sha256: sha256(readFileSync(join(root, path))) });
  }
  return entries;
}

/**
 * The fixture-helper policy: every baseline helper present, byte-identical and
 * regular; no additions, no links. Checked before any candidate module loads.
 * @param {Array<[string, string]>} baseline  [path, sha256] pairs at the baseline
 * @param {Array<{ path: string, type: 'file' | 'symlink', sha256?: string }>} candidate
 */
export function checkHelperIntegrity(baseline, candidate) {
  const expected = new Map(baseline), seen = new Map(), issues = [];
  for (const entry of candidate) {
    if (entry.type === 'symlink') { issues.push({ path: entry.path, reason: 'helper-symlink' }); continue; }
    seen.set(entry.path, entry.sha256);
    if (!expected.has(entry.path)) issues.push({ path: entry.path, reason: 'helper-added' });
  }
  for (const [path, original] of expected) {
    if (!seen.has(path)) { if (!issues.some(i => i.path === path)) issues.push({ path, reason: 'helper-missing' }); continue; }
    if (seen.get(path) !== original) issues.push({ path, reason: 'helper-changed', originalSHA256: original, actualSHA256: seen.get(path) });
  }
  const actual = Object.fromEntries(seen);
  return { passed: issues.length === 0, checkedFiles: expected.size, currentFiles: seen.size, helperManifestSHA256: helperManifestDigest(baseline, actual), issues };
}

const AUTH_ERRORS = new Set(['access_denied', 'sign_in_required', 'session_expired', 'session_revoked']);
const TASKS = ['task-a', 'task-b'];

/** The frozen case list: six for task A, seven for task B (an unknown-operation HTML read). @param {string} task */
export function receiptCases(task) {
  if (!TASKS.includes(task)) throw new Error('frozen evaluator: task-a or task-b required');
  const cases = [];
  for (const surface of ['api', 'html']) for (const scenario of ['authorized-control', 'before-read-loss', 'mid-read-loss']) cases.push({ surface, scenario, unknown: false });
  if (task === 'task-b') cases.push({ surface: 'html', scenario: 'mid-read-loss', unknown: true });
  return cases.map(c => ({ ...c, name: `${task}/${c.surface}/${c.unknown ? 'unknown-operation/' : ''}${c.scenario}` }));
}

/**
 * The per-case checks, from what the trusted parent observed of one receipt read.
 * @param {string} task
 * @param {{ surface: string, scenario: string, unknown: boolean }} spec
 * @param {{ status: number, error: string | null, returnedOriginalReceipt: boolean, revealedCommit: boolean, revealedPreview: boolean, injections: number, membersAfter: number[], fixtureWritesBefore: number, fixtureWritesAfter: number, repeat: { status: number, sameOriginal: boolean } | null, unknownHtmlFallbackShown: boolean }} o
 */
export function receiptChecks(task, spec, o) {
  /** @type {Record<string, boolean>} */
  const checks = {
    fixtureOnlyNoAdditionalSourceWrite: o.fixtureWritesAfter === o.fixtureWritesBefore,
    injectionObserved: spec.scenario !== 'mid-read-loss' || o.injections >= 1,
    retainedWorkspaceMembership: task !== 'task-b' || o.membersAfter.includes(1),
  };
  if (spec.scenario === 'authorized-control') {
    Object.assign(checks, { authorizedRead: o.status === 200 && o.returnedOriginalReceipt, authorizedRepeat: o.repeat?.status === 200 && o.repeat.sameOriginal === true });
  } else {
    Object.assign(checks, {
      authorizationRefusal: [401, 403, 404].includes(o.status),
      noBufferedReceipt: !o.revealedCommit && !o.revealedPreview,
      typedApiRefusal: spec.surface !== 'api' || AUTH_ERRORS.has(/** @type {string} */ (o.error)),
      noUnknownHtmlFallback: !spec.unknown || !o.unknownHtmlFallbackShown,
    });
  }
  return checks;
}

/**
 * Score one task: every frozen case must have exactly one observation, named as
 * the case; a missing observation fails its case, an unexpected one is refused.
 * @param {string} task
 * @param {Array<{ name: string } & Record<string, any>>} observations
 */
export function scoreReceiptTask(task, observations) {
  const cases = receiptCases(task), names = new Set(cases.map(c => c.name)), byName = new Map();
  for (const o of observations) {
    if (!names.has(o?.name) || byName.has(o.name)) throw new Error(`frozen evaluator: unexpected or repeated case ${o?.name}`);
    byName.set(o.name, o);
  }
  const results = cases.map(spec => {
    const o = byName.get(spec.name);
    if (!o) return { name: spec.name, passed: false, error: 'observation-missing', checks: null };
    const checks = receiptChecks(task, spec, o);
    return { name: spec.name, passed: Object.values(checks).every(Boolean), checks };
  });
  const passed = results.filter(r => r.passed).length;
  return { task, total: results.length, passed, failed: results.length - passed, acceptancePassed: passed === results.length, results };
}
