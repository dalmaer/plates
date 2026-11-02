// What the stopped executor trials learned, kept as one contract (phase 146).
// Executor-free: declarations, recorded trial observations and temp files only.
// No OpenHands, Gas City, sandbox-exec, network or model is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { qualifyExecutor, REFUSALS } from '../lib/executor/contract.mjs';
import { openJournal } from '../lib/executor/journal.mjs';
import { verifyHandoff, checkEvaluationReport, helperManifestDigest, readHelperTree, checkHelperIntegrity, receiptCases, scoreReceiptTask, sha256 } from '../lib/executor/frozen-evaluator.mjs';
import { sandboxProfile, sandboxArgs, sandboxEnvironment, SANDBOX_POLICY } from '../lib/executor/sandbox-policy.mjs';

const FIXTURES = new URL('./fixtures/executor/', import.meta.url);
const trial = async () => JSON.parse(await readFile(new URL('receipt-trial.json', FIXTURES), 'utf8'));

/** An executor that can be held to policy: every declared capability is the safe one. */
const conforming = () => ({
  schema: 1, executor: 'acme-runner',
  identity: { perCaller: true },
  permissions: { approval: 'ask', defaultAccess: 'workspace' },
  presets: [{ name: 'acme-default', bypassesApprovals: false, bypassesSandbox: false }],
  dedupe: { create: 'durable', inbound: 'durable' },
  posts: { idempotencyKey: true },
  usage: { reported: 'per-step' },
  budget: { check: 'before-step' },
  deadline: { enforced: true },
  environment: { inherits: false },
  autonomy: { level: true, doorClasses: true },
});

test('an executor that cannot be held to policy is refused', () => {
  assert.deepEqual(qualifyExecutor(conforming()), { qualified: true, refusals: [] });

  // The acceptance fixture: auto-approves permissions, loses dedupe on restart, checks budget after a step.
  const careless = { ...conforming(), permissions: { approval: 'auto', defaultAccess: 'workspace' }, dedupe: { create: 'memory', inbound: 'durable' }, budget: { check: 'after-step' } };
  assert.deepEqual(qualifyExecutor(careless), { qualified: false, refusals: ['permissions-auto-approved', 'dedupe-lost-on-restart', 'budget-checked-after-step'] });

  // Each trial finding is its own named reason.
  const one = (patch, reason) => assert.deepEqual(qualifyExecutor({ ...conforming(), ...patch }).refusals, [reason], reason);
  one({ permissions: { approval: 'ask', defaultAccess: 'full' } }, 'full-access-by-default');
  one({ presets: [{ name: 'acme-codex', bypassesApprovals: true, bypassesSandbox: true }] }, 'preset-bypasses-policy');
  one({ identity: { perCaller: false } }, 'callers-share-one-identity');
  one({ dedupe: { create: 'durable', inbound: 'memory' } }, 'dedupe-lost-on-restart');
  one({ posts: { idempotencyKey: false } }, 'posts-not-idempotent');
  one({ usage: { reported: 'none' } }, 'usage-not-reported');
  one({ deadline: { enforced: false } }, 'no-deadline');
  one({ environment: { inherits: true } }, 'environment-inherited');
  one({ autonomy: { level: false, doorClasses: true } }, 'autonomy-level-ignored');
  one({ autonomy: { level: true, doorClasses: false } }, 'door-classes-ignored');

  // The stopped trials' recorded gaps, as declarations: refused for each finding.
  const openhands = { ...conforming(), executor: 'openhands-acp', identity: { perCaller: false }, permissions: { approval: 'auto', defaultAccess: 'full' }, posts: { idempotencyKey: false }, budget: { check: 'after-step' } };
  assert.deepEqual(qualifyExecutor(openhands).refusals, ['permissions-auto-approved', 'full-access-by-default', 'callers-share-one-identity', 'posts-not-idempotent', 'budget-checked-after-step']);
  const gasCity = { ...conforming(), executor: 'gas-city', presets: [{ name: 'codex', bypassesApprovals: true, bypassesSandbox: true }], dedupe: { create: 'memory', inbound: 'memory' }, deadline: { enforced: false }, environment: { inherits: true } };
  assert.deepEqual(qualifyExecutor(gasCity).refusals, ['preset-bypasses-policy', 'dedupe-lost-on-restart', 'no-deadline', 'environment-inherited']);

  // Unknown is refused, never assumed: a missing capability fails closed under its reason.
  const silent = conforming(); delete /** @type {any} */ (silent).budget; delete /** @type {any} */ (silent).presets;
  assert.deepEqual(qualifyExecutor(silent).refusals, ['preset-bypasses-policy', 'budget-checked-after-step']);
  assert.deepEqual(qualifyExecutor({ executor: 'acme' }), { qualified: false, refusals: ['declaration-invalid'] });
  assert.deepEqual(qualifyExecutor(null).refusals, ['declaration-invalid']);
  assert.equal(qualifyExecutor({ schema: 1 }).refusals.length, Object.keys(REFUSALS).length);
  for (const [reason, { finding }] of Object.entries(REFUSALS)) assert.match(finding, /OpenHands|Gas City|Both trials/, reason);

  // The child sandbox a host holds an executor's processes in: default deny, built as data.
  const paths = { node: '/opt/acme/bin/node', workspace: '/private/var/acme/work', runner: '/opt/acme/runner.mjs' };
  const readOnly = sandboxProfile(paths);
  assert.match(readOnly, /^\(version 1\)\n\(deny default\)\n/);
  assert.equal(readOnly, sandboxProfile(paths), 'deterministic for the same inputs');
  assert.deepEqual(readOnly.match(/\(allow process-exec[^\n]*/g), ['(allow process-exec (literal "/opt/acme/bin/node"))'], 'only the exact Node executable');
  assert.doesNotMatch(readOnly, /process-fork|network|signal|file-write\* \(subpath "\/private\/var\/acme\/work"\)/);
  assert.match(readOnly, /\(allow file-read\* \(subpath "\/private\/var\/acme\/work"\) \(literal "\/opt\/acme\/runner\.mjs"\)\)/);
  const writable = sandboxProfile({ ...paths, writable: true, scratch: '/private/var/acme/scratch', protect: ['.plates-executor-owner'] });
  const lines = writable.split('\n');
  const allowWrite = lines.indexOf('(allow file-write* (subpath "/private/var/acme/work"))');
  const denyProtected = lines.indexOf('(deny file-write* (subpath "/private/var/acme/work/.git") (subpath "/private/var/acme/work/tests/helpers") (subpath "/private/var/acme/work/.plates-executor-owner"))');
  assert.ok(allowWrite > 0 && denyProtected > allowWrite, 'protected paths are denied after the workspace write grant');
  assert.match(writable, /\(allow file-read\* file-write\* \(subpath "\/private\/var\/acme\/scratch"\)\)/);
  assert.deepEqual(SANDBOX_POLICY.protected, ['.git', 'tests/helpers']);
  assert.deepEqual(sandboxArgs({ ...paths, args: ['task-a'] }).slice(2), ['/opt/acme/bin/node', '--disable-proto=throw', '--no-addons', '/opt/acme/runner.mjs', 'task-a']);
  assert.deepEqual(Object.keys(sandboxEnvironment({ tmp: '/private/var/acme/scratch' })).sort(), ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_OPTIONAL_LOCKS', 'PATH', 'TMPDIR']);
  const refused = (input, code) => assert.throws(() => sandboxProfile({ ...paths, ...input }), { code }, code);
  refused({ workspace: 'work' }, 'invalid-path');
  refused({ workspace: '/private/var/acme/work\n(allow default)' }, 'invalid-path');
  refused({ runner: '/private/var/acme/../acme/runner.mjs' }, 'invalid-path');
  refused({ workspace: '/' }, 'bounded-workspace-required');
  refused({ workspace: '/Users' }, 'bounded-workspace-required');
  refused({ workspace: '/private/tmp' }, 'bounded-workspace-required');
  refused({ runner: '/private/var/acme/work/runner.mjs' }, 'bounded-workspace-required');
  refused({ scratch: '/private/var/acme/work/tmp' }, 'separate-bounded-scratch-required');
  refused({ scratch: '/private/tmp' }, 'separate-bounded-scratch-required');
  refused({ writable: true, protect: ['../escape'] }, 'invalid-protected-path');
  assert.throws(() => sandboxArgs({ ...paths, args: ['a\0b'] }), { code: 'explicit-argv-required' });
});

test('the frozen evaluator is the one the trials used', async () => {
  const t = await trial();
  const { handoff, handoffSHA256 } = t;

  // The held-out task pair: the selected spec's bytes and both prompts hash to the handoff's pins.
  const specBytes = await readFile(new URL('selected-spec.json', FIXTURES));
  const spec = JSON.parse(specBytes.toString('utf8'));
  assert.equal(sha256(specBytes), handoff.artifacts.selectedSpec.sha256);
  assert.deepEqual(spec.tasks.map(task => task.id), ['task-a', 'task-b']);
  assert.equal(sha256(spec.tasks[0].prompt), handoff.artifacts.taskAPrompt.sha256);
  assert.equal(sha256(spec.tasks[1].prompt), handoff.artifacts.taskBPrompt.sha256);
  assert.equal(spec.evaluatorSHA256, handoff.artifacts.evaluator.sha256);
  assert.equal(spec.baseline, handoff.baseline);

  // The helper manifest digest the trial evaluator recorded, reproduced from its 59 baseline helpers.
  assert.equal(t.helpers.files.length, 59);
  assert.equal(helperManifestDigest(t.helpers.files), t.helpers.manifestSHA256);

  // On the unfixed baseline the frozen checks score as recorded: A 4/6, B 4/7 (control and lesson arms).
  const scores = [];
  for (const run of t.runs) {
    assert.deepEqual(checkEvaluationReport(run.report, { handoff, handoffSHA256 }), { accepted: true, refusals: [] }, run.arm);
    const score = scoreReceiptTask(run.task, run.results);
    scores.push(`${run.arm} ${run.task} ${score.passed}/${score.total}`);
    assert.equal(score.passed, run.report.passed); assert.equal(score.total, run.report.total);
    // Case by case, the ported checks equal the checks the trial evaluator recorded.
    for (const [i, result] of score.results.entries()) {
      assert.equal(result.name, run.results[i].name);
      assert.deepEqual(result.checks, run.results[i].recordedChecks, result.name);
      assert.equal(result.passed, run.results[i].recordedPassed, result.name);
    }
  }
  assert.deepEqual(scores, ['primary task-a 4/6', 'followup-control task-b 4/7', 'followup-lesson task-b 4/7']);
  assert.deepEqual(receiptCases('task-b').map(c => c.name).at(-1), 'task-b/html/unknown-operation/mid-read-loss');
  const missing = scoreReceiptTask('task-a', t.runs[0].results.slice(1));
  assert.deepEqual([missing.passed, missing.total, missing.results[0].error], [3, 6, 'observation-missing']);
  assert.throws(() => scoreReceiptTask('task-a', [...t.runs[0].results, t.runs[0].results[0]]), /repeated case/);

  // A changed evaluator is refused: in a recorded report, and as bytes against the handoff's pin.
  const changed = { ...t.runs[0].report, evaluatorSHA256: t.baselineObservationEvaluatorSHA256 };
  assert.deepEqual(checkEvaluationReport(changed, { handoff, handoffSHA256 }).refusals, ['evaluator-changed']);
  assert.deepEqual(checkEvaluationReport({ ...t.runs[0].report, manifestSHA256: '0'.repeat(64) }, { handoff, handoffSHA256 }).refusals, ['handoff-changed']);
  const bytes = JSON.stringify(handoff);
  const available = { selectedSpec: { bytes: specBytes }, taskAPrompt: { bytes: spec.tasks[0].prompt }, taskBPrompt: { bytes: spec.tasks[1].prompt } };
  const partial = verifyHandoff({ bytes, expectedSHA256: sha256(bytes), artifacts: available });
  assert.equal(partial.verified, false, 'an artifact the host cannot read is never a pass');
  assert.deepEqual(partial.refusals.filter(r => !r.startsWith('artifact-unavailable:')), []);
  const pinned = Object.fromEntries(Object.keys(handoff.artifacts).map(name => [name, { bytes: `acme ${name}` }]));
  const synthetic = { ...handoff, artifacts: Object.fromEntries(Object.entries(pinned).map(([name, a]) => [name, { sha256: sha256(a.bytes) }])) };
  const syntheticBytes = JSON.stringify(synthetic);
  assert.deepEqual(verifyHandoff({ bytes: syntheticBytes, expectedSHA256: sha256(syntheticBytes), artifacts: pinned }).refusals, []);
  const tampered = { ...pinned, evaluator: { bytes: 'acme evaluator, edited' } };
  assert.deepEqual(verifyHandoff({ bytes: syntheticBytes, expectedSHA256: sha256(syntheticBytes), artifacts: tampered }).refusals, ['artifact-changed:evaluator']);
  assert.deepEqual(verifyHandoff({ bytes: syntheticBytes + ' ', expectedSHA256: sha256(syntheticBytes), artifacts: pinned }).refusals, ['handoff-digest-mismatch']);
  const exposed = { ...pinned, evaluator: { path: '/private/var/acme/worker/evaluator.mjs', bytes: pinned.evaluator.bytes } };
  assert.deepEqual(verifyHandoff({ bytes: syntheticBytes, expectedSHA256: sha256(syntheticBytes), artifacts: exposed, workerRoot: '/private/var/acme/worker', reportPath: '/private/var/acme/worker/score.json' }).refusals, ['artifact-in-worker-root:evaluator', 'report-in-worker-root']);

  // A changed helper hash is refused, from the recorded manifest and from a real tree.
  const edited = Object.fromEntries(t.helpers.files);
  edited[t.helpers.files[0][0]] = '0'.repeat(64);
  assert.notEqual(helperManifestDigest(t.helpers.files, edited), t.helpers.manifestSHA256);
  const root = await mkdtemp(join(tmpdir(), 'plates-executor-helpers-'));
  try {
    await mkdir(join(root, 'tests/helpers/web'), { recursive: true });
    await writeFile(join(root, 'tests/helpers/acme.mjs'), 'export const acme = 1;\n');
    await writeFile(join(root, 'tests/helpers/web/acme-http.mjs'), 'export const http = 1;\n');
    const baseline = readHelperTree(root).map(e => /** @type {[string, string]} */ ([e.path, /** @type {string} */ (e.sha256)]));
    assert.equal(checkHelperIntegrity(baseline, readHelperTree(root)).passed, true);
    await writeFile(join(root, 'tests/helpers/acme.mjs'), 'export const acme = 2;\n');
    await writeFile(join(root, 'tests/helpers/extra.mjs'), 'export {};\n');
    await unlink(join(root, 'tests/helpers/web/acme-http.mjs'));
    await symlink(join(root, 'tests/helpers/acme.mjs'), join(root, 'tests/helpers/web/acme-http.mjs'));
    const report = checkHelperIntegrity(baseline, readHelperTree(root));
    assert.equal(report.passed, false);
    assert.deepEqual(report.issues.map(i => `${i.reason} ${i.path}`).sort(), [
      'helper-added tests/helpers/extra.mjs', 'helper-changed tests/helpers/acme.mjs', 'helper-symlink tests/helpers/web/acme-http.mjs',
    ]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('uncertain stays uncertain', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-executor-journal-'));
  const file = join(dir, 'journal.json');
  const capacity = { pool: 'acme-pool', remaining: 2 };
  try {
    let journal = openJournal(file);
    const { run, admitted } = journal.admit({ id: 'acme-run-1', project: 'acme', pool: 'acme-pool', input: { task: 'task-a' }, capacity });
    assert.equal(admitted, true);
    assert.equal(journal.admit({ id: 'acme-run-1', project: 'acme', pool: 'acme-pool', input: { task: 'task-a' }, capacity }).admitted, false, 'same input returns the original run');
    assert.throws(() => journal.admit({ id: 'acme-run-1', project: 'acme', pool: 'acme-pool', input: { task: 'task-b' }, capacity }), { code: 'operation-conflict' });

    // A create that times out: written as uncertain before the send, and left uncertain after.
    let sends = 0, keys = [];
    const create = async ({ idempotencyKey }) => { sends++; keys.push(idempotencyKey); throw new Error('acme upstream timeout'); };
    const first = await journal.perform('acme-run-1', 'create', create);
    assert.deepEqual([first.state, first.sent, first.attempt, sends], ['uncertain', true, 1, 1]);
    assert.deepEqual(keys, ['acme-run-1:create:1']);

    // A run that dies mid-send: the intent is durable before the action resolves.
    let release;
    const pending = journal.perform('acme-run-1', 'run', () => new Promise(resolve => { release = resolve; }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(openJournal(file).effect('acme-run-1', 'run').state, 'uncertain', 'durable while in flight');

    // Restart: a new journal on the same file reads every hold and intent back.
    journal = openJournal(file);
    assert.equal(journal.effect('acme-run-1', 'create').state, 'uncertain');
    const again = await journal.perform('acme-run-1', 'create', create);
    assert.deepEqual([again.state, again.sent, sends], ['uncertain', false, 1], 'never retried blindly');
    const runAgain = await journal.perform('acme-run-1', 'run', () => { sends++; });
    assert.deepEqual([runAgain.state, runAgain.sent, sends], ['uncertain', false, 1]);
    release('late'); await pending;

    // Holds survive the restart: the lane refuses a second run in the project, and the pool counts the first.
    assert.throws(() => journal.admit({ id: 'acme-run-2', project: 'acme', pool: 'acme-pool', capacity }), { code: 'project-lane-held' });
    assert.throws(() => journal.admit({ id: 'acme-run-3', project: 'acme-other', pool: 'acme-pool', units: 2, capacity }), { code: 'capacity-exhausted' });

    // Only an observation with evidence settles it; absent means a new, keyed attempt.
    assert.throws(() => journal.reconcile('acme-run-1', 'create', { observed: 'absent', evidence: '' }), { code: 'reconciliation-evidence-required' });
    journal.reconcile('acme-run-1', 'create', { observed: 'absent', evidence: 'acme upstream lists no conversation for acme-run-1' });
    const retried = await journal.perform('acme-run-1', 'create', async () => 'acme-conversation');
    assert.deepEqual([retried.state, retried.attempt, retried.result], ['acknowledged', 2, 'acme-conversation']);
    assert.throws(() => journal.reconcile('acme-run-1', 'create', { observed: 'acknowledged', evidence: 'acme' }), { code: 'effect-not-uncertain' });

    // Stop is sent once and stays pending when uncertain; the lane waits for fenced termination.
    let kills = 0;
    const stopped = await journal.stop('acme-run-1', () => { kills++; throw new Error('acme kill unconfirmed'); });
    assert.deepEqual([stopped.state, kills, journal.run('acme-run-1').state], ['uncertain', 1, 'stop-pending']);
    await journal.stop('acme-run-1', () => { kills++; });
    assert.equal(kills, 1);
    await assert.rejects(journal.perform('acme-run-1', 'message', () => {}), { code: 'execution-stopped' });
    assert.throws(() => journal.terminated('acme-run-1', { fence: 'acme-stale-fence', evidence: 'acme exit observed' }), { code: 'stale-fence' });
    journal.terminated('acme-run-1', { fence: run.fence, evidence: 'acme process group absent' });
    assert.equal(journal.admit({ id: 'acme-run-2', project: 'acme', pool: 'acme-pool', capacity }).admitted, true, 'lane released by confirmed termination');
    assert.equal(journal.run('acme-run-1').capacityHold, true, 'capacity hold is separate from the lane');

    // Outcome, then one reviewed learning decision.
    assert.throws(() => journal.decideLearning('acme-run-1', { status: 'no-useful-lesson' }), { code: 'outcome-required' });
    assert.throws(() => journal.complete('acme-run-1', { fence: 'acme-stale-fence', outcome: 'success' }), { code: 'stale-fence' });
    assert.equal(journal.complete('acme-run-1', { fence: run.fence, outcome: 'success' }).learning, 'pending');
    assert.throws(() => journal.decideLearning('acme-run-1', { status: 'captured', text: 'acme' }), { code: 'lesson-evidence-required' });
    assert.equal(journal.decideLearning('acme-run-1', { status: 'captured', text: 'Recheck access after the read.', evidence: 'acme-receipt-1' }).learning, 'captured');
    assert.throws(() => journal.decideLearning('acme-run-1', { status: 'no-useful-lesson' }), { code: 'learning-conflict' });

    // One writer at a time; a held lock is refused, never reclaimed.
    await writeFile(`${file}.lock`, '');
    assert.throws(() => journal.admit({ id: 'acme-run-4', project: 'acme-4', pool: 'acme-pool', capacity: { pool: 'acme-pool', remaining: 9 } }), { code: 'journal-busy' });
    assert.ok(existsSync(`${file}.lock`));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
