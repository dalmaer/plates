// Synthetic Acme ledgers: target selection does no model work or real GitHub reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { acme, load, write, climb, json, stubGh, commit, step, WORKFLOW, NIGHT } from './helpers/climb.mjs';

const date = new Date().toISOString().slice(0, 10);
const before = nights => new Date(Date.parse(date) - nights * 86400000).toISOString().slice(0, 10);
const settings = { jobs: ['test-time'], budget: { minutes: 10 }, testCommand: 'node fixed.mjs', testTarget: 'slowest-fit', testTemplate: 'node {file}' };
const run = (files, extra = {}) => ({ date: `${date}T00:00:00Z`, completed: true, tests: Object.entries(files).map(([file, ms]) => ({ file, name: 'Acme passes', outcome: 'pass', ms })), ...extra });
async function fixture(t, runs = [run({ 'slow.test.mjs': 24000, 'fast.test.mjs': 10000, 'huge.test.mjs': 60000 })]) {
  const config = { climb: { ...settings } };
  const root = await acme(t, { config, files: { 'slow.test.mjs': '// Acme slow\n', 'fast.test.mjs': '// Acme fast\n', 'huge.test.mjs': '// Acme huge\n', 'fixed.mjs': '// Acme fixed\n' } });
  await write(root, Object.fromEntries(runs.map((r, i) => [`.plates/test-runs/${i}.json`, JSON.stringify(r)])));
  const m = await load(root);
  const pick = (opts = {}) => m.pick({ root, config, date, readPrs: () => [], ...opts });
  return { root, config, m, pick };
}

test('slowest-fit picks the slowest fitting file and names an oversized skip', async t => {
  const f = await fixture(t);
  const p = await f.pick();
  assert.equal(p.target.file, 'slow.test.mjs');
  assert.equal(p.target.expectedMs, 24000);
  assert.equal(p.command, "node 'slow.test.mjs'");
  assert.match(p.target.why, /concurrent ledger fallback/);
  assert.deepEqual(p.target.skipped.map(s => s.file), ['huge.test.mjs']);
  assert.match(p.target.skipped[0].why, /12 comparison executions.*reserve/);
  // 5 baselines + 12 comparisons would not fit with reserve: these allowances are separate.
  assert.ok(24000 * 17 + 300000 > 600000);
});

test('absent mode and removal restore exactly the fixed command', async t => {
  const f = await fixture(t);
  delete f.config.climb.testTarget;
  let p = await f.pick();
  assert.equal(p.command, settings.testCommand);
  assert.equal(p.target, undefined);
  delete f.config.climb.testTemplate;
  p = await f.pick();
  assert.equal(p.command, settings.testCommand);
  assert.equal(f.m.climbConfigOf(f.config).testCommand, settings.testCommand);
});

test('dry target cool-down survives later nights and ends after seven nights', async t => {
  const f = await fixture(t);
  const lastNight = join(f.root, 'last-night.json');
  await write(f.root, { 'last-night.json': JSON.stringify({ job: 'test-time', date: before(1), target: { file: 'fast.test.mjs' }, kept: 1,
    targetHistory: [{ file: 'slow.test.mjs', date: before(7), kept: 0 }] }) });
  let p = await f.pick({ lastNight });
  assert.equal(p.target.file, 'fast.test.mjs');
  assert.match(p.target.skipped.find(s => s.file === 'slow.test.mjs').why, /cooling down/);
  const tomorrow = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
  p = await f.pick({ lastNight, date: tomorrow });
  assert.equal(p.target.file, 'slow.test.mjs');
  await write(f.root, { '.plates/climb.json': JSON.stringify({ last: { job: 'test-time', date: before(1), target: { file: 'slow.test.mjs' }, kept: 0 } }) });
  assert.equal((await f.pick()).target.file, 'fast.test.mjs');
});

test('injected open PR reader skips only its target; legacy unknown target holds all files', async t => {
  const f = await fixture(t);
  const pr = { headRefName: 'plates-climb/test-time/2026-01-01', body: '<!-- plates-climb-target: {"file":"slow.test.mjs"} -->' };
  let p = await f.pick({ readPrs: (_root, _env, state) => state === 'open' ? [pr] : [] });
  assert.equal(p.target.file, 'fast.test.mjs');
  assert.match(p.target.skipped.find(s => s.file === 'slow.test.mjs').why, /open climb PR/);
  p = await f.pick({ readPrs: (_root, _env, state) => state === 'open' ? [{ ...pr, body: '' }] : [] });
  assert.equal(p.job, null);
  assert.equal(p.reason, 'no test file fits the budget');
});

test('newest single-file and serial ledgers outrank concurrent estimates; filtered data is ignored', async t => {
  const f = await fixture(t, [
    run({ 'slow.test.mjs': 18000 }, { date: `${before(2)}T00:00:00Z`, wallMs: 20000 }),
    run({ 'slow.test.mjs': 19000 }, { date: `${before(1)}T00:00:00Z`, wallMs: 21000 }),
    run({ 'slow.test.mjs': 60000, 'fast.test.mjs': 15000 }),
    run({ 'slow.test.mjs': 1 }, { filtered: true }),
  ]);
  let p = await f.pick();
  assert.equal(p.target.expectedMs, 21000);
  assert.match(p.target.why, /single-file/);
  await write(f.root, { '.plates/test-runs/serial.json': JSON.stringify(run({ 'slow.test.mjs': 22000, 'fast.test.mjs': 5000 }, { flags: ['--test-concurrency=1'] })) });
  p = await f.pick();
  assert.equal(p.target.expectedMs, 22000);
  assert.match(p.target.why, /serial ledger/);
});

test('nothing fits or no ledger gives a named reason; baseline limit has its own skip', async t => {
  const f = await fixture(t, [run({ 'huge.test.mjs': 200000 })]);
  let p = await f.pick();
  assert.equal(p.job, null);
  assert.equal(p.reason, 'no test file fits the budget');
  assert.match(p.target.skipped[0].why, /baseline allowance/);
  const selected = await f.m.chooseTestTarget({ root: f.root, minutes: 10, date, runs: [] });
  assert.equal(selected.file, null);
  assert.equal(selected.why, 'no test file fits the budget');
});

test('baseline pins the pick, later measurements and comparison keep it, report and rotation carry target', async t => {
  const f = await fixture(t);
  const p = await f.pick();
  let clock = 0;
  const commands = [];
  await f.m.measure({ root: f.root, config: f.config, job: 'test-time', baseline: true, selection: p,
    now: () => clock, execute: command => { commands.push(command); clock += 10; return { status: 0 }; } });
  assert.deepEqual(commands, Array(5).fill(p.command));
  const night = JSON.parse(await readFile(join(f.root, '.plates/climb/night.json'), 'utf8'));
  assert.deepEqual(night.target, p.target);
  await write(f.root, { 'fixed.mjs': 'throw new Error("fixed fallback must not run");\n' });
  assert.equal(json(climb(f.root, ['measure', 'test-time', '--runs', '1', '--json'])).command, p.command);
  await commit(f.root, { 'slow.test.mjs': '// Acme changed\n', '.gitignore': '.plates/climb/\n.plates/test-runs/\n' }, 'Acme candidate');
  const comparison = await f.m.compare({ root: f.root, config: f.config, runs: 1 });
  assert.equal(comparison.rounds.length, 2, 'compare uses the pinned file, never the failing fixed command');
  const r = await f.m.report({ root: f.root, config: f.config, state: true });
  assert.deepEqual(r.target, p.target);
  assert.match(r.line, /slow.test.mjs.*kept nothing/);
  const state = JSON.parse(await readFile(join(f.root, '.plates/climb.json'), 'utf8'));
  assert.equal(state.last.target.file, p.target.file);
  assert.equal(state.targetHistory[0].kept, 0);
  assert.equal((await f.pick()).target.file, 'fast.test.mjs');
});

test('workflow gathers CI ledgers before pick and passes the exact saved selection into baseline', async t => {
  const f = await fixture(t);
  const p = await f.pick();
  await write(f.root, { 'temp/pick.json': JSON.stringify(p), 'temp/summary': '' });
  const r = await step(t, f.root, 'Baseline', { JOB: 'test-time', MINUTES: '10', BRANCH: 'acme-climb', RUNNER_TEMP: join(f.root, 'temp'), GITHUB_STEP_SUMMARY: join(f.root, 'temp/summary') });
  assert.equal(r.status, 0, r.out);
  assert.equal(JSON.parse(await readFile(join(f.root, '.plates/climb/night.json'), 'utf8')).target.file, p.target.file);
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.ok(workflow.indexOf('- name: Gather the test ledger') < workflow.indexOf('- name: Pick tonight'));
  const gh = await stubGh(t, []);
  const cfg = json(climb(f.root, ['config', '--json'], { PLATES_GH: gh }));
  assert.equal(cfg.target.file, p.target.file);
  assert.equal(cfg.testCommand, settings.testCommand);
});

test('a reduced pick allowance is retained and the judge refuses target substitution', async t => {
  const f = await fixture(t);
  const p = await f.pick();
  p.minutes = 5;
  let clock = 0;
  const m = await f.m.measure({ root: f.root, config: f.config, job: 'test-time', baseline: true, selection: p,
    now: () => clock, execute: () => { clock += 10; return { status: 0 }; } });
  assert.equal(m.admission.minutes, 5);
  const path = '.plates/climb/night.json';
  const night = JSON.parse(await readFile(join(f.root, path), 'utf8'));
  await write(f.root, { [path]: JSON.stringify({ ...night, target: { ...night.target, file: 'fast.test.mjs' } }) });
  await assert.rejects(f.m.compare({ root: f.root, config: f.config, final: true, selection: p }), /differs from the original pick/);
});

test('kept PR metadata and the nightly health line identify the selected file', async t => {
  const f = await fixture(t);
  const p = await f.pick();
  let clock = 0;
  await f.m.measure({ root: f.root, config: f.config, job: 'test-time', baseline: true, selection: p,
    now: () => clock, execute: () => { clock += 10; return { status: 0 }; } });
  const path = '.plates/climb/night.json';
  const night = JSON.parse(await readFile(join(f.root, path), 'utf8'));
  night.tried = [{ verdict: 'keep', what: 'Acme improved', candidate: night.base, rounds: [{ base: 10, candidate: 5, change: -0.5 }] }];
  await write(f.root, { [path]: JSON.stringify(night) });
  const report = await f.m.report({ root: f.root, config: f.config });
  assert.match(report.text, /<!-- plates-climb-target: {"file":"slow.test.mjs"} -->/);
  assert.match(report.line, /slow.test.mjs/);
  const { climbLine } = await import('../scripts/plates/lib.mjs');
  assert.match(climbLine(f.config, night), /slow.test.mjs.*kept 1/);
  const restored = f.m.rotationState(JSON.parse(await readFile(join(f.root, path), 'utf8')));
  assert.equal(restored.targetHistory[0].kept, 1);
});


test('the plan selects against its lower budget and records a skip when none can run', async t => {
  const f = await fixture(t);
  for (const file of ['night-plan.mjs', 'verification.mjs']) await cp(join(NIGHT, file), join(f.root, 'scripts/plates', file));
  const item = { id: 'acme-tests', title: 'Acme tests', kind: 'build', source: 'owner', number: { measure: 'slow_tests', bound: 0, better: 'lower' }, lane: 'climb:test-time', budget: { minutes: 5 }, status: 'planned', result: null };
  const plan = { schema: 1, date, shapedBy: 'owner', readyBy: null, willNotTouch: [], settledToday: [], leftOpen: [], items: [item] };
  await write(f.root, { 'plan.json': JSON.stringify(plan) });
  let p = await f.pick({ plan: join(f.root, 'plan.json') });
  assert.equal(p.minutes, 5);
  assert.equal(p.target.file, 'fast.test.mjs');
  item.budget.minutes = 1;
  await write(f.root, { 'plan.json': JSON.stringify(plan) });
  p = await f.pick({ plan: join(f.root, 'plan.json') });
  assert.equal(p.job, null);
  assert.equal(p.plan.item, null);
  assert.equal(p.plan.skipped[0].id, item.id);
  assert.equal(p.plan.skipped[0].note, 'no test file fits the budget');
});


test('a blocked baseline night does not cool the target down after rotation serialization', async t => {
  const f = await fixture(t);
  const p = await f.pick();
  p.targetHistory = [{ file: 'fast.test.mjs', date: before(1), kept: 1 }];
  let clock = 0, executions = 0;
  const measured = await f.m.measure({ root: f.root, config: f.config, job: 'test-time', baseline: true, selection: p,
    now: () => clock, execute: () => { executions++; clock += 60000; return { status: 0 }; } });
  assert.equal(measured.admission.state, 'blocked');
  assert.equal(executions, 1, 'the first probe blocks admission before a model can run');
  const reported = await f.m.report({ root: f.root, config: f.config, state: true });
  assert.equal(reported.state, 'blocked');
  assert.equal(reported.kept, 0);
  assert.equal((await f.pick()).target.file, p.target.file, 'blocked is not a dry night');
  const state = JSON.parse(await readFile(join(f.root, '.plates/climb.json'), 'utf8'));
  assert.equal(state.last.admission.state, 'blocked');
  assert.deepEqual(state.targetHistory, p.targetHistory, 'prior completed outcomes survive');
  // The publish step uses this same serializer with its explicit kept count.
  const night = JSON.parse(await readFile(join(f.root, '.plates/climb/night.json'), 'utf8'));
  assert.deepEqual(f.m.rotationState({ ...night, kept: reported.kept }), state);
});
