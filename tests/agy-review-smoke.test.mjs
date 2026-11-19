import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, lstat, mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { shellProblems } from './helpers/workflows.mjs';

const workflow = await readFile(new URL('../.github/workflows/plates-agy-verify.yml', import.meta.url), 'utf8');
const models = ['gemini-4-neon-high', 'gemini-4-carbon-high', 'gemini-4-hydrogen-high'];
const source = workflow.split("node --input-type=module <<'NODE'\n")[1].split('\n          NODE')[0].split('\n').map(l => l.slice(10)).filter(l => !l.startsWith('import ')).join('\n');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const smoke = new AsyncFunction('mkdir', 'writeFile', 'readFile', 'lstat', 'join', 'runAgyReview', 'process', 'Date', source);

function guards(text) {
  const out = [];
  if (!/^on:\n  workflow_dispatch:\npermissions:/m.test(text)) out.push('manual-only');
  if (!/^permissions:\n  contents: read\nconcurrency:/m.test(text) || /\b(?:contents|issues|pull-requests|id-token): write\b/.test(text)) out.push('read-only');
  if (!text.includes('timeout-minutes: 15') || !text.includes('started * 1000 + 180000') || !text.includes('Math.min(deadlineMs,') || !text.includes('install_deadline=$(( $(date +%s) + 180 ))')) out.push('bounds');
  if (!text.includes('if [ "$RUN_ATTEMPT" != 1 ]') || !text.includes("process.env.RUN_ATTEMPT !== '1'")) out.push('rerun');
  if (!text.includes('models: [row.model]') || (text.match(/await runAgyReview\(/g) ?? []).length !== 1) out.push('singleton');
  if (/schedule:|pull_request:|\n  push:|strategy:|matrix:|--retry|dangerously-skip|set -x/.test(text)) out.push('activation-or-retry');
  if (!text.includes('path: ${{ runner.temp }}/plates-agy-verify-metadata.json') || /\n          path:.*(?:\*|private|attempts)/.test(text)) out.push('artifact');
  if ((text.match(/secrets\./g) ?? []).length !== 1 || !text.includes('GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}')) out.push('credential');
  return out;
}

test('manual smoke keeps a read-only token, exact pins, singleton attempts and bounded retention', async () => {
  assert.deepEqual(guards(workflow), []);
  assert.deepEqual(await shellProblems('plates-agy-verify.yml', workflow), []);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
  assert.match(workflow, /1\.5\.12-5281398513336320\/linux-x64\/cli_linux_x64\.tar\.gz/);
  assert.match(workflow, /26de25fccb3fbf0b093e090ce14a14ac1df1ec3e90ef4ea6106887d3a81b0cc9edb0dadea7b9101d07f9606eba159062a6fb7b78e91b73f7520684a24db73428/);
  assert.ok(workflow.indexOf('sha512sum --check --status') < workflow.indexOf('tar -xOzf'));
  assert.match(workflow, /retention-days: 7/);
  assert.equal((workflow.match(/uses: actions\/upload-artifact@/g) ?? []).length, 1);
});

test('negative controls catch extra triggers permissions reruns retries and broad artifacts', () => {
  for (const changed of [workflow.replace('  workflow_dispatch:', '  schedule:'), workflow.replace('contents: read', 'contents: write'),
    workflow.replace('started * 1000 + 180000', 'started * 1000 + 900000'), workflow.replace('models: [row.model]', 'models'),
    workflow.replace('"$RUN_ATTEMPT" != 1', '"$RUN_ATTEMPT" != 2'), workflow.replace('curl --fail', 'curl --retry 3 --fail'),
    workflow.replace('path: ${{ runner.temp }}/plates-agy-verify-metadata.json', 'path: ${{ runner.temp }}/*')]) assert.ok(guards(changed).length > 0);
});

async function fixture(t, { deadline = 1900, attempt = '1', tick = 0, failAt = -1, failureReason = null } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'acme-agy-smoke-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = 1000000;
  const process = { env: { RUNNER_TEMP: root, RUN_ATTEMPT: attempt, AGY_VERIFY_DEADLINE: String(deadline) }, exitCode: 0 };
  const calls = [];
  const runner = async options => {
    calls.push(options);
    const dir = options.out + '.attempts'; await mkdir(dir);
    await writeFile(join(dir, 'catalog.json'), JSON.stringify({ state: 'success', available: models, diagnosticPresent: false, raw: 'Acme-secret' }));
    await writeFile(join(dir, 'generation-intent.json'), '{}');
    now += tick;
    if (calls.length - 1 === failAt) throw Error('Acme-secret raw provider error');
    return { ok: failureReason === null, message: 'Acme-private review prose', reason: failureReason ?? 'Acme-secret', usage: { input_tokens: 12, output_tokens: 2, total_tokens: 14, secret: 'Acme-secret' }, cost: 99, raw: 'Acme-secret' };
  };
  return { root, calls, process, run: () => smoke(mkdir, writeFile, readFile, lstat, join, runner, process, { now: () => now }), metadata: async () => JSON.parse(await readFile(join(root, 'plates-agy-verify-metadata.json'), 'utf8')) };
}

test('embedded smoke invokes each exact model once and emits only sanitized metadata', async t => {
  const f = await fixture(t); await f.run();
  assert.deepEqual(f.calls.map(c => c.models), models.map(m => [m]));
  assert.ok(f.calls.every(c => c.minutes === 3 && c.started === 1000));
  assert.equal(f.process.exitCode, 0);
  const meta = await f.metadata();
  assert.deepEqual(Object.keys(meta).sort(), ['deadlineMs', 'models', 'schema']);
  for (const row of meta.models) {
    assert.deepEqual(Object.keys(row).sort(), ['catalog', 'cost', 'generationIntentRecorded', 'model', 'reason', 'state', 'usage']);
    assert.equal(row.cost, null); assert.equal(row.state, 'completed'); assert.equal(row.catalog, 'listed');
    assert.deepEqual(row.usage, { input_tokens: 12, output_tokens: 2, thinking_tokens: null, cache_read_tokens: null, total_tokens: 14 });
  }
  assert.doesNotMatch(JSON.stringify(meta), /Acme-secret|private review|raw provider|message/);
  assert.match(await readFile(f.calls[0].diff, 'utf8'), /acme\.mjs/);
});

test('unsuccessful models retain all results, continue other models once, then fail', async t => {
  const f = await fixture(t, { failAt: 1 }); await f.run();
  assert.equal(f.calls.length, 3); assert.equal(f.process.exitCode, 1);
  assert.deepEqual((await f.metadata()).models.map(r => r.state), ['completed', 'unsuccessful', 'completed']);
  assert.doesNotMatch(JSON.stringify(await f.metadata()), /Acme-secret/);
});

test('original overall deadline caps individual allowances and stops further calls', async t => {
  const f = await fixture(t, { deadline: 1430, tick: 160000 }); await f.run();
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls.map(c => c.minutes), [3, 3]);
  assert.equal((await f.metadata()).models[2].reason, 'original-deadline-exhausted');
  assert.equal(f.process.exitCode, 1);
  const g = await fixture(t, { deadline: 1150 }); await g.run();
  assert.ok(g.calls.every(c => c.started * 1000 + c.minutes * 60000 <= 1150000));
  assert.equal(g.calls[0].minutes, 2.5);
});

test('rerun refuses before any files or calls, and exhausted run retains unattempted rows', async t => {
  const f = await fixture(t, { attempt: '2' });
  await assert.rejects(f.run(), /Rerun refused/);
  assert.equal(f.calls.length, 0); assert.deepEqual(await readdir(f.root), []);
  const g = await fixture(t, { deadline: 1000 }); await g.run();
  assert.equal(g.calls.length, 0); assert.equal(g.process.exitCode, 1);
  assert.ok((await g.metadata()).models.every(r => r.state === 'not-attempted'));
});


test('fixed contract reasons survive while provider text is excluded', async t => {
  for (const reason of ['unsafe-or-mismatched-init', 'malformed-evidence', 'credential-unavailable', 'Acme-secret raw error']) {
    const f = await fixture(t, { failureReason: reason }); await f.run();
    assert.equal(f.process.exitCode, 1);
    assert.ok((await f.metadata()).models.every(r => r.reason === (reason.startsWith('Acme') ? 'review-unavailable' : reason)));
  }
});
