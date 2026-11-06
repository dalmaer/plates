// Historical v1 receipt preparation; final comparison requires frozen shared v3 handoff qualification.
// Preparation only: exact-baseline probes, never model execution or patched scoring.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync, copyFileSync, constants } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const BASELINE = '037e13b4f78c061405cef899b528badb536584ad';
const SPEC_SHA = '0b7610603f865b91b59f680b485aea544e154a4571e15dd7044cd3c7753d531c';
const EVALUATOR_SHA = '723feab106853c71b2016f65904ec9f7880379ddde4804ec4c1dfb0400037548';
const HERE = dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (Object.hasOwn(options, flag)) throw Error('duplicate option');
  if (flag === '--reuse-existing') options[flag] = true;
  else if (['--output', '--repo'].includes(flag) && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) options[flag] = process.argv[++i];
  else throw Error('Usage: node prepare-real-trial.mjs --output DIRECTORY [--repo LOCAL_CHECKOUT] [--reuse-existing]');
}
if (!options['--output']) throw Error('--output required');
const requestedRoot = resolve(options['--output']);
const root = join(realpathSync(dirname(requestedRoot)), basename(requestedRoot));
const repo = realpathSync(resolve(options['--repo'] ?? join(HERE, '../..')));
const inRepo = relative(repo, root);
if (!inRepo || (!(inRepo === '..' || inRepo.startsWith('../')) && !isAbsolute(inRepo))) throw Error('output must be outside source checkout');
const env = { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
const git = (cwd, ...args) => {
  const r = spawnSync('/usr/bin/git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', cwd, ...args], { encoding: 'utf8', env, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw Error(`git ${args[0]} failed: ${r.error?.message ?? r.stderr}`);
  return r.stdout.trim();
};
const specBytes = readFileSync(join(HERE, 'real-receipt-spec.json'));
const evaluator = join(HERE, 'real-receipt-evaluator.mjs');
if (sha(specBytes) !== SPEC_SHA || sha(readFileSync(evaluator)) !== EVALUATOR_SHA) throw Error('shared spec/evaluator bytes changed');
const spec = JSON.parse(specBytes);
if (spec.baseline !== BASELINE || spec.evaluatorSHA256 !== EVALUATOR_SHA || git(repo, 'rev-parse', `${BASELINE}^{commit}`) !== BASELINE) throw Error('frozen baseline mismatch');
const reuse = options['--reuse-existing'] === true;
if (reuse) {
  if (realpathSync(root) !== root) throw Error('existing root alias refused');
  const previous = JSON.parse(readFileSync(join(root, 'manifest.json')));
  if (previous.baseline !== BASELINE || previous.status !== 'prepared-not-launched' || previous.targetBlob !== '831fff6973aaf1001725407fde341f964c90e1c4') throw Error('reuse only migrates the untouched RRULE preparation');
  if (existsSync(join(root, 'history-rrule'))) throw Error('RRULE history already exists');
} else mkdirSync(root); // Existing destinations are refused.
const assertBaseline = worktree => {
  if (realpathSync(worktree) !== worktree || git(worktree, 'rev-parse', 'HEAD') !== BASELINE || git(worktree, 'status', '--porcelain', '--untracked-files=all', '--ignored')) throw Error('baseline probe refuses changed, extra or aliased candidate files');
};
const manifest = {
  version: 2, status: 'preparation-in-progress', createdAt: new Date().toISOString(), baseline: BASELINE,
  backend: 'OpenHands SDK 1.59.0', taskSelection: 'parent-selected-shared-receipt-pair', modelAccess: 'not-configured-or-invoked',
  account: null, budget: null, modelCalls: 0, specSHA256: SPEC_SHA, evaluatorSHA256: EVALUATOR_SHA,
  fixturePolicy: spec.fixturePolicy, distinctFrozenCases: 13, immutableHelperModules: 59,
  scorer: { baselineOnly: evaluator, patchedCandidate: join(HERE, 'contained-score.mjs'), containmentStatus: 'see-2026-10-30-openhands-containment-report; final-shared-v3-qualification-required', protocol: 'node contained-score.mjs CANDIDATE task-a|task-b NEW_OUTPUT', hostCandidateImportForbidden: true },
  isolation: 'Worktrees share the local Git object store. Required worker/evaluator containment is separate and not established by preparation.',
  runs: [], history: reuse ? 'history-rrule/manifest.json' : null,
};
for (const [name, task, lessonMode] of [['primary', 'task-a', 'capture'], ['followup-control', 'task-b', 'none'], ['followup-lesson', 'task-b', 'reviewed-exact-digest']]) {
  const worktree = join(root, name);
  if (!reuse) git(repo, 'worktree', 'add', '--detach', worktree, BASELINE);
  assertBaseline(worktree);
  const result = spawnSync(process.execPath, [evaluator, worktree, task], { encoding: 'utf8', env, timeout: 40000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 1) throw Error(`baseline must fail acceptance: ${result.error?.message ?? result.stderr}`);
  const before = JSON.parse(result.stdout);
  const total = task === 'task-a' ? 6 : 7;
  if (before.task !== task || before.baseline !== BASELINE || before.evaluatorSHA256 !== EVALUATOR_SHA || before.acceptancePassed !== false || !before.integrity?.passed || before.integrity.checkedFiles !== 59 || before.total !== total || before.passed !== 4 || before.failed !== total - 4 || before.results.some(r => r.fixtureWritesBefore !== r.fixtureWritesAfter)) throw Error('baseline evidence differs from frozen shared cases');
  assertBaseline(worktree);
  const selected = spec.tasks.find(t => t.id === task);
  manifest.runs.push({ name, task, worktree, lessonMode, before, request: selected.prompt, promptSHA256: sha(selected.prompt), status: 'prepared-not-launched',
    allowedChanges: 'Production code and independent tests for this task; existing helper bytes immutable and no helper-directory additions.',
    requiredChecks: selected.tests.map(test => `node --import ./tests/helpers/hermetic.mjs --test ${test}`),
    independentReview: 'required; no manually supplied target fix', noRemoteWrites: true, worktreeCleanBeforeAndAfter: true });
}
if (reuse) {
  const history = join(root, 'history-rrule');
  mkdirSync(history);
  for (const name of ['manifest.json', 'primary-request.md', 'followup-control-request.md', 'followup-lesson-request.md']) copyFileSync(join(root, name), join(history, name), constants.COPYFILE_EXCL);
}
for (const run of manifest.runs) {
  writeFileSync(join(root, `${run.name}-request.md`), run.request);
  writeFileSync(join(root, `${run.name}-receipt-baseline.json`), JSON.stringify(run.before, null, 2) + '\n');
}
manifest.status = 'prepared-not-launched';
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ manifest: join(root, 'manifest.json'), status: manifest.status, baseline: BASELINE, worktrees: manifest.runs.map(r => r.worktree), distinctFrozenCases: 13, immutableHelperModules: 59, modelCalls: 0 }, null, 2));
