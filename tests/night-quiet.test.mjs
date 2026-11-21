// The quiet night (plates phase 207): the night fails, as a red workflow the
// owner is emailed about, only when CI on main is red, a test is flaky, or the
// gate ran no tests; otherwise it is green with one summary line. It writes no
// branch, opens no pull request and files no proposal, in any case. Fixtures
// are synthetic (Acme Anvils).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, cleanEnv } from './helpers/run.mjs';
import { runBlocks } from './helpers/workflows.mjs';
import { nightCauses, verdict, ask, NIGHT_MEASURES, CAUSES } from '../practices/night/files/scripts/plates/night-verdict.mjs';

const PLATES = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(PLATES, 'practices/night/files/scripts/plates');
const NIGHT_YML = join(PLATES, 'practices/night/files/.github/workflows/plates-night.yml');
const MORNING_YML = join(PLATES, 'practices/night/files/.github/workflows/plates-morning.yml');

// improve.mjs measure()'s result shape, for each of the three measures.
const gate = (over = {}) => ({ id: 'gate', state: 'ok', value: 0, detail: '`npm run check` exit 0; 41 tests', facts: { empty: false, status: 0, tests: 41 }, ...over });
const flaky = (over = {}) => ({ id: 'flaky_tests', state: 'ok', value: 0, detail: 'none; the newest 5 eligible of 9 runs, 3 clean trees', facts: {}, ...over });
const red = (over = {}) => ({ id: 'ci_red_streak', state: 'ok', value: 0, detail: 'check.yml: the latest verdict is green (100 read, 40 verdicts)', facts: {}, ...over });
const NIGHTS = {
  quiet: [gate(), flaky(), red()],
  'main red (CI on main)': [gate(), flaky(), red({ state: 'outside', value: 2, detail: 'check.yml: 2 failed runs in a row (100 read, 40 verdicts)' })],
  'main red (the gate on main\'s tree)': [gate({ state: 'outside', value: 1, detail: 'reused CI .github/workflows/check.yml on abc: failure', facts: { empty: false, reused: true, status: 1, tests: null } }), flaky(), red()],
  flaky: [gate(), flaky({ state: 'outside', value: 1, detail: 'tests/anvil.test.mjs > "the anvil rings" (passed 3, failed 1); the newest 5 eligible of 9 runs' }), red()],
  'no tests': [gate({ state: 'outside', value: 1, detail: '`npm run check` exit 0; 0 tests — passed while running nothing (lesson 14)', facts: { empty: true, status: 0, tests: 0 } }), flaky(), red()],
  'no tests (the ledger\'s rule)': [gate({ state: 'outside', value: 1, detail: '`npm run check` exit 1; no node test summary', facts: { empty: false, status: 1, tests: null, diagnostics: { stdout: { text: 'plates test ledger: no tests ran. A gate that ran nothing passes anything, so this run fails.' }, stderr: { text: '' } } } }), flaky(), red()],
};

async function project(t, check) {
  const root = await mkdtemp(join(tmpdir(), 'plates-night-quiet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.plates'), { recursive: true });
  await writeFile(join(root, '.plates/plates.json'), `${JSON.stringify({ name: 'Acme Anvils', practices: ['night'], check }, null, 2)}\n`);
  await writeFile(join(root, '.gitignore'), '.plates/test-runs/\n');
  await cp(SCRIPTS, join(root, 'scripts/plates'), { recursive: true });
  const git = (...args) => { const r = run('git', ['-C', root, ...args]); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=Acme', '-c', 'user.email=acme@example.com', 'add', '-A');
  git('-c', 'user.name=Acme', '-c', 'user.email=acme@example.com', 'commit', '-q', '-m', 'Acme Anvils');
  return { root, git };
}

/** The night's two steps as the workflow runs them, in a project; returns the verdict step's result and the summary. */
function night(root, temp) {
  const env = { ...cleanEnv(), PLATES_GH: join(temp, 'no-gh'), GH_TOKEN: '', RUNNER_TEMP: temp };
  const answers = join(temp, 'night.json'), summary = join(temp, 'summary.md');
  const asked = run(process.execPath, [join(root, 'scripts/plates/night-verdict.mjs'), 'ask', '--out', answers], { cwd: root, env });
  assert.equal(asked.status, 0, asked.stderr);
  const said = run(process.execPath, [join(root, 'scripts/plates/night-verdict.mjs'), 'verdict', '--in', answers, '--summary', summary], { cwd: root, env });
  return { said, summary };
}

test('the night fails only on a red main, a flaky test or a gate with no tests', async t => {
  // Each cause is red with its own name, alone; a quiet night is green with one line.
  const expect = { quiet: [], 'main red (CI on main)': ['main'], 'main red (the gate on main\'s tree)': ['main'], flaky: ['flaky'], 'no tests': ['empty'], 'no tests (the ledger\'s rule)': ['empty'] };
  for (const [name, results] of Object.entries(NIGHTS)) {
    const v = verdict(results, { date: '2026-11-22' });
    assert.deepEqual(v.causes.map(c => c.cause), expect[name], name);
    assert.equal(v.exitCode, expect[name].length ? 1 : 0, `${name}: exit`);
    const errors = v.lines.filter(l => l.startsWith('::error'));
    assert.equal(errors.length, expect[name].length, `${name}: one ::error:: per cause`);
    for (const c of expect[name]) {
      assert.ok(errors.some(l => l.includes(CAUSES[c])), `${name}: ::error:: names "${CAUSES[c]}"`);
      assert.ok(v.summary.includes(`**${CAUSES[c]}**`), `${name}: the summary names "${CAUSES[c]}"`);
    }
    if (!expect[name].length) {
      assert.equal(v.summary.trim().split('\n').length, 1, 'a quiet night is one summary line');
      assert.match(v.summary, /main is green, no test is flaky, and the gate ran tests/);
    }
  }
  // All three at once: each named, in order.
  const all = verdict([NIGHTS['no tests'][0], NIGHTS.flaky[1], NIGHTS['main red (CI on main)'][2]]);
  assert.deepEqual(all.causes.map(c => c.cause), ['main', 'flaky', 'empty']);
  assert.equal(all.exitCode, 1);

  // Nothing else is red: a measure outside on no cause, one that cannot answer, or one broken.
  for (const results of [
    [gate(), flaky({ state: 'n/a', value: null, detail: '3 recorded runs, fewer than the window of 5' }), red({ state: 'n/a', value: null, detail: 'no repo in .plates/plates.json' })],
    [gate(), flaky({ state: 'broken', value: null, detail: 'ledger unreadable' }), red()],
    [gate(), flaky(), red(), { id: 'slow_tests', state: 'outside', value: 4, detail: 'four slower' }],
  ]) {
    const v = verdict(results);
    assert.equal(v.exitCode, 0, JSON.stringify(results.map(r => [r.id, r.state])));
    assert.deepEqual(nightCauses(results), []);
    assert.ok(!v.lines.some(l => l.startsWith('::error')));
  }
  const broken = verdict([gate(), flaky({ state: 'broken', value: null, detail: 'ledger unreadable' }), red()]);
  assert.ok(broken.lines.some(l => l.startsWith('::warning') && l.includes('flaky_tests')), 'a broken check is a warning, said');
  assert.match(broken.summary, /flaky_tests could not answer tonight \(broken\): ledger unreadable/);

  // ask runs exactly improve's three measures, the gate first, and nothing else.
  const seen = [];
  const results = await ask({ root: PLATES, env: {}, measures: [{ id: 'slow_tests' }, { id: 'ci_red_streak' }, { id: 'flaky_tests' }, { id: 'gate' }, { id: 'escapes' }], measure: async ({ measures }) => { seen.push(...measures.map(m => m.id)); return NIGHTS.quiet; } });
  assert.deepEqual(seen, NIGHT_MEASURES);
  assert.deepEqual(seen, ['gate', 'flaky_tests', 'ci_red_streak']);
  assert.equal(results.length, 3);

  // The workflow, as GitHub runs it: the token only reads, nothing pushes, no PR, no proposal.
  const yml = await readFile(NIGHT_YML, 'utf8');
  assert.match(yml, /^permissions:\n  contents: read\n  actions: read\n\n/m);
  assert.doesNotMatch(yml, /: write\b/, 'no job may write');
  assert.deepEqual(yml.split('\njobs:\n')[1].match(/^  [a-z][\w-]*:$/gm), ['  night:'], 'one job: the night');
  const shell = runBlocks(yml).map(b => b.script).join('\n');
  for (const never of [/\bgh pr\b/, /\bgit push\b/, /\bgit commit\b/, /\bgit checkout\b/, /drain\.mjs/, /plates\.mjs learn/, /night-plan\.mjs/, /improve\.mjs --report/, /docs\/inbox/, /pr-body\.mjs/, /canvas night/]) {
    assert.doesNotMatch(shell, never, `the night's shell never runs ${never}`);
  }
  const steps = runBlocks(yml).map(b => b.step).filter(Boolean);
  assert.equal(steps.at(-1), 'Verdict', 'the verdict is the last step');
  assert.ok(steps.indexOf('Gather the test ledger') < steps.indexOf('Ask the three questions'), 'the history is gathered before flaky reads it');
  assert.match(yml, /- name: Keep the test ledger\n        if: always\(\)\n[\s\S]*?name: plates-test-runs\n/, 'the ledger artifact is kept, red or green');
  assert.match(runBlocks(yml).find(b => b.step === 'Verdict').script, /night-verdict\.mjs verdict --in "\$RUNNER_TEMP\/night\.json" --summary "\$GITHUB_STEP_SUMMARY"/);
  // Nor does the morning open the "as it finished" PR any longer.
  const morning = await readFile(MORNING_YML, 'utf8');
  assert.doesNotMatch(morning, /pull-requests: write|contents: write|\bgh pr\b|\bgit push\b|morning\.mjs finalize/);
  // Nor do they retain name-transition evidence: its producers were the night's PR, plan, drain and the final PR.
  for (const text of [yml, morning]) assert.doesNotMatch(text, /names_evidence|names-loader|PLATES_NAMES_/);

  // End to end in a project, with improve's real instruments: a passing gate is quiet, a gate that ran
  // nothing is red, a failing gate on main is red; and in every case the tree is as it was: no file, no
  // branch, no proposal. The ledger directory is the night's keepsake, git-ignored, and never committed.
  const cases = [
    ['quiet', "node -e \"console.log('ℹ tests 3')\"", 0, null],
    ['no tests', "node -e \"console.log('ℹ tests 0')\"", 1, CAUSES.empty],
    ['main red', "node -e \"console.log('ℹ tests 3'); process.exit(1)\"", 1, CAUSES.main],
    ['the ledger\'s no tests', "node -e \"console.log('plates test ledger: no tests ran. A gate that ran nothing passes anything, so this run fails.'); process.exit(1)\"", 1, CAUSES.empty],
  ];
  for (const [name, check, code, cause] of cases) {
    const { root, git } = await project(t, check);
    const temp = await mkdtemp(join(tmpdir(), 'plates-night-quiet-run-'));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const { said, summary } = night(root, temp);
    assert.equal(said.status, code, `${name}: ${said.stdout}${said.stderr}`);
    const text = await readFile(summary, 'utf8');
    if (cause) {
      assert.match(said.stdout, new RegExp(`^::error title=${cause}::${cause}: `, 'm'), name);
      assert.ok(text.includes(`**${cause}**`), `${name}: the summary names its cause`);
    } else {
      assert.doesNotMatch(said.stdout, /::error/);
      assert.match(text, /^The night on \d{4}-\d{2}-\d{2}: main is green/);
    }
    assert.equal(git('status', '--porcelain'), '', `${name}: the night left the tree as it was`);
    assert.equal(git('branch', '--list').trim(), '* main', `${name}: no branch`);
    assert.deepEqual((await readdir(root)).sort(), ['.git', '.gitignore', '.plates', 'scripts'], `${name}: no health page, inbox or plan`);
    assert.deepEqual((await readdir(join(root, '.plates'))).filter(n => n !== 'test-runs').sort(), ['plates.json'], `${name}: no bounds, plan or proposal`);
  }
});
