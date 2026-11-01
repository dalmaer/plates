// Phase 155: deterministic wall-clock admission around real command invocations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { acme, climb, json, load, step, WORKFLOW } from './helpers/climb.mjs';
import { climbLine } from '../scripts/plates/lib.mjs';

async function fixture(t, { wall = 645000, output = '1', job = 'test-time' } = {}) {
  const config = { climb: { jobs: [job], budget: { minutes: 45 }, ...(job === 'perf' ? { perf: { command: 'node probe.mjs', better: 'lower' } } : { testCommand: 'node probe.mjs' }) } };
  const dir = await acme(t, { config, files: {
    'count': '0',
    'probe.mjs': `import {readFileSync, writeFileSync} from 'node:fs'; const n = Number(readFileSync('count', 'utf8')); writeFileSync('count', String(n+1)); console.log(${JSON.stringify(output)});`,
    'clock.mjs': `import {readFileSync} from 'node:fs'; Object.defineProperty(performance, 'now', {value: () => Number(readFileSync(${JSON.stringify('count')}, 'utf8')) * ${wall}});`,
  } });
  return { dir, config, env: { NODE_OPTIONS: `--import=${join(dir, 'clock.mjs')}` }, count: async () => Number(await readFile(join(dir, 'count'), 'utf8')) };
}

for (const [label, wall, minutes, output, job, count, state] of [
  ['slow first probe', 645000, 45, '1', 'test-time', 1, 'blocked'],
  ['fast baseline', 75000, 45, '1', 'test-time', 5, 'admitted'],
  ['perf tiny value slow wall', 645000, 45, '0.001', 'perf', 1, 'blocked'],
  ['perf huge value fast wall', 75000, 45, '999999999', 'perf', 5, 'admitted'],
  ['smaller picked allowance', 75000, 10, '1', 'test-time', 1, 'blocked'],
  ['invalid benchmark', 75000, 45, 'unknown', 'perf', 1, 'blocked'],
]) test(label, async t => {
  const f = await fixture(t, { wall, output, job });
  const r = climb(f.dir, ['measure', job, '--baseline', '--minutes', String(minutes), '--json'], f.env);
  assert.equal(await f.count(), count, 'actual benchmark invocations');
  assert.equal(r.status, state === 'blocked' ? 1 : 0, r.stdout + r.stderr);
  const data = json(r);
  assert.equal(data.admission.state, state);
  assert.equal(data.admission.minutes, minutes);
  assert.equal(data.admission.reserveMs, minutes * 30000);
  assert.equal(data.admission.probeWallMs, wall);
  assert.equal(data.admission.comparisonExecutions, 12);
  const night = JSON.parse(await readFile(join(f.dir, '.plates/climb/night.json'), 'utf8'));
  assert.deepEqual(night.admission, data.admission);
  assert.equal(night.tried.length, 0);
  if (output === 'unknown') assert.equal(night.baseline.median, null);
  else assert.equal(night.baseline.times.length, count);
  if (state === 'blocked') {
    assert.match(climbLine(f.config, night), /blocked before model launch/);
    const report = json(climb(f.dir, ['report', '--json']));
    assert.equal(report.state, 'blocked');
    assert.equal(report.kept, 0);
    assert.equal(report.tried, 0);
    assert.match(report.line, /focused measurement command/);
    assert.doesNotMatch(report.line, /no-improvement|none beat/);
  }
});

test('invalid or unknown wall time blocks; timeout is allocation bounded without a cleanup claim', async t => {
  const f = await fixture(t);
  const { measure } = await load(f.dir);
  for (const elapsed of [NaN, -1, 0]) {
    let calls = 0, tick = 0;
    const r = await measure({ root: f.dir, config: f.config, job: 'test-time', baseline: true,
      now: () => ++tick <= 2 ? 0 : elapsed,
      execute: () => { calls++; return { status: 0, stdout: '' }; } });
    assert.equal(calls, 1);
    assert.equal(r.admission.state, 'blocked');
    assert.equal(r.admission.probeWallMs, null);
    assert.equal(r.median, null);
  }
  let options;
  const r = await measure({ root: f.dir, config: f.config, job: 'test-time', baseline: true, minutes: 10,
    now: () => 0,
    execute: (_command, opts) => { options = opts; return { status: null, error: { code: 'ETIMEDOUT' } }; } });
  assert.equal(options.timeout, 570000);
  assert.equal(options.killSignal, 'SIGKILL');
  assert.equal(r.admission.state, 'blocked');
  assert.match(r.admission.reason, /deadline/);
  assert.match(r.admission.termination, /descendant cleanup unverified/);
  for (const minutes of [0, -1, NaN, Infinity]) await assert.rejects(measure({ root: f.dir, config: f.config, job: 'test-time', baseline: true, minutes }), /finite positive/);
});

test('ordinary measure remains unrestricted by baseline admission', async t => {
  const f = await fixture(t);
  const r = climb(f.dir, ['measure', 'test-time', '--runs', '5', '--json'], f.env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(await f.count(), 5);
  assert.equal(json(r).admission, undefined);
});

test('blocked workflow retains reason and night before provider launch; publish and plan remain reachable', async t => {
  const f = await fixture(t);
  const temp = join(f.dir, 'runner-temp');
  await mkdir(temp);
  const summary = join(temp, 'summary');
  await writeFile(summary, '');
  const r = await step(t, f.dir, 'Baseline', { ...f.env, JOB: 'test-time', MINUTES: '10', BRANCH: 'acme-climb', RUNNER_TEMP: temp, GITHUB_STEP_SUMMARY: summary });
  assert.equal(r.status, 1, r.out);
  const finalized = await step(t, f.dir, 'Finalize baseline admission', { JOB: 'test-time', OUTCOME: 'failure', RUNNER_TEMP: temp, GITHUB_STEP_SUMMARY: summary });
  assert.equal(finalized.status, 0, finalized.out);
  assert.equal(finalized.outputs.state, 'blocked');
  assert.match(finalized.outputs.line, /picked allowance is 10 min/);
  assert.equal(await f.count(), 1);
  const handoff = await step(t, f.dir, 'Hand the night on', { RUNNER_TEMP: temp, BRANCH: 'acme-climb', AGENT: 'codex' });
  assert.equal(handoff.status, 0, handoff.out);
  assert.equal(JSON.parse(await readFile(join(temp, 'handoff/climb-admission.json'), 'utf8')).state, 'blocked');
  assert.equal(JSON.parse(await readFile(join(temp, 'handoff/record/night.json'), 'utf8')).admission.state, 'blocked');
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /id: baseline\n[^]*?timeout-minutes: \$\{\{ fromJSON\(steps.pick.outputs.minutes\) \}\}\n        if:/);
  assert.match(workflow, /- name: Hand the night on\n        if: always\(\)/);
  for (const id of ['climb', 'climb_codex']) assert.match(workflow, new RegExp(`id: ${id}\\n        if: [^\\n]*steps.admission.outputs.state == 'admitted'`));
  assert.match(workflow, /execution:.*steps.admission.outputs.state/);
  assert.match(workflow, /publish:\n    needs: \[agent, judge\]\n    if: always\(\)/);
  assert.match(workflow, /ADMISSION_LINE:.*needs.agent.outputs.admission_line/);
  assert.match(workflow, /e.ADMISSION_LINE\?\.startsWith\("blocked:"\)/);
  assert.match(workflow, /pre-agent baseline wall time is separate/i);
});


test('interruption after initial receipt replaces previous night and finalizes blocked without model launch', async t => {
  const f = await fixture(t);
  const { measure } = await load(f.dir);
  const temp = join(f.dir, 'runner-temp');
  await mkdir(temp);
  const summary = join(temp, 'summary');
  await writeFile(summary, '');
  await mkdir(join(f.dir, '.plates/climb'), { recursive: true });
  await writeFile(join(f.dir, '.plates/climb/night.json'), JSON.stringify({ job: 'perf', tried: [{ verdict: 'keep' }], line: 'previous night' }));
  let attempted = 0;
  await assert.rejects(measure({ root: f.dir, config: f.config, job: 'test-time', baseline: true, minutes: 10,
    now: () => 0, execute: () => { attempted++; throw new Error('simulated interruption'); } }), /simulated interruption/);
  assert.equal(attempted, 1);
  assert.equal(await f.count(), 0, 'no fixture subprocess or model is launched');
  for (const name of ['night.json', 'admission.json']) {
    const initial = JSON.parse(await readFile(join(f.dir, '.plates/climb', name), 'utf8'));
    assert.equal(initial.job, 'test-time');
    assert.equal(initial.admission.state, 'pending');
    assert.equal(initial.baseline.median, null);
    assert.equal(initial.baseline.ended, null);
    assert.deepEqual(initial.baseline.times, []);
    assert.deepEqual(initial.tried, []);
    assert.doesNotMatch(initial.line, /previous night/);
  }
  // A timeout can leave partial stdout. The finalizer must use the durable receipt.
  await writeFile(join(temp, 'baseline-output.json'), '{"state":"admitted"');
  const finalized = await step(t, f.dir, 'Finalize baseline admission', { JOB: 'test-time', OUTCOME: 'failure', RUNNER_TEMP: temp, GITHUB_STEP_SUMMARY: summary });
  assert.equal(finalized.status, 0, finalized.out);
  assert.equal(finalized.outputs.state, 'blocked');
  assert.match(finalized.outputs.line, /interrupted/);
  const handoff = await step(t, f.dir, 'Hand the night on', { RUNNER_TEMP: temp, BRANCH: 'acme-climb', AGENT: 'codex' });
  assert.equal(handoff.status, 0, handoff.out);
  const retained = JSON.parse(await readFile(join(temp, 'handoff/record/night.json'), 'utf8'));
  assert.equal(retained.admission.state, 'blocked');
  assert.equal(retained.baseline.median, null);
  assert.equal(JSON.parse(await readFile(join(temp, 'handoff/climb-admission.json'), 'utf8')).state, 'blocked');
  const report = json(climb(f.dir, ['report', '--json']));
  assert.equal(report.state, 'blocked');
  assert.equal(report.tried, 0);
  assert.match(report.line, /interrupted/);
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /id: admission\n        if: always\(\)/);
  for (const id of ['climb', 'climb_codex']) assert.match(workflow, new RegExp(`id: ${id}\\n        if: [^\\n]*steps.admission.outputs.state == 'admitted'`));
  assert.match(workflow, /execution:.*steps.admission.outputs.state/);
});

test('finalizer admits only completed current receipts and bounds unavailable receipt interpretation', async t => {
  const f = await fixture(t, { wall: 75000 });
  assert.equal(climb(f.dir, ['measure', 'test-time', '--baseline', '--json'], f.env).status, 0);
  const { finalizeBaseline } = await load(f.dir);
  assert.equal((await finalizeBaseline({ root: f.dir, job: 'test-time', outcome: 'success', env: {} })).state, 'admitted');
  const path = join(f.dir, '.plates/climb/admission.json');
  const previous = await readFile(path, 'utf8');
  const stale = await finalizeBaseline({ root: f.dir, job: 'test-time', outcome: 'failure', env: { GITHUB_RUN_ID: 'acme-new-run', GITHUB_RUN_ATTEMPT: '1' } });
  assert.equal(stale.state, 'blocked');
  assert.equal(JSON.parse(await readFile(path, 'utf8')).baseline.median, null, 'previous workflow measurements are not transplanted');
  for (const content of ['{', ' '.repeat(1024 * 1024 + 1), JSON.stringify({ ...JSON.parse(previous), line: 'admitted\nstate=admitted' })]) {
    await writeFile(path, content);
    const r = await finalizeBaseline({ root: f.dir, job: 'test-time', outcome: 'success', env: {} });
    assert.equal(r.state, 'blocked', 'invalid/oversized/output-injecting receipts cannot admit a model');
    assert.doesNotMatch(r.line, /\n/);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).baseline.median, null);
  }
});
