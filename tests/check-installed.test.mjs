import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodePlan } from '../scripts/plates/time-receipts.mjs';
import { shellWords, flagsIn } from '../scripts/plates/test-ledger.mjs';
import { run } from './helpers/run.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const launcher = join(ROOT, 'scripts/check-installed.mjs');
const prefix = 'node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout';

test('source gate requires installed stage once and a disjoint complete test-file union', async () => {
  const { scripts } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(scripts.check, 'node scripts/plates/test-ledger.mjs --run "npm test && npm run test:installed && npm run roadmap:check && npm run render:check && npm run inbox:check"', 'mandatory installed stage must remain in the configured gate');
  assert.equal(scripts.test, prefix + ' --test-concurrency=32 tests/*.test.mjs tests/helpers/*.test.mjs');
  assert.equal(scripts['test:installed'], 'node scripts/check-installed.mjs');
  assert.equal(scripts['test:installed:node'], prefix + ' --test-concurrency=1 tests/installed/evaluation-live-cli.test.mjs tests/installed/evaluation-live-deadlines.test.mjs tests/installed/evaluation-live-transfer.test.mjs tests/installed/validation-request-budget.test.mjs tests/installed/evaluation-credential-pipe.test.mjs');
  const plans = await Promise.all(['test', 'test:installed:node'].map(key => nodePlan({ root: ROOT, script: scripts[key], words: shellWords, flags: flagsIn })));
  for (const plan of plans) assert.equal(plan.available, true, JSON.stringify(plan));
  const selected = plans.flatMap(p => p.expectedFiles);
  assert.equal(new Set(selected).size, selected.length, 'stages must not duplicate files');
  const expected = (await Promise.all(['tests', 'tests/helpers', 'tests/installed'].map(async dir =>
    (await readdir(join(ROOT, dir))).filter(n => n.endsWith('.test.mjs')).map(n => dir + '/' + n)))).flat().sort();
  assert.deepEqual([...selected].sort(), expected, 'every source/helper/installed test must be selected');
  assert.deepEqual(plans[1].expectedFiles, ['tests/installed/evaluation-credential-pipe.test.mjs', 'tests/installed/evaluation-live-cli.test.mjs', 'tests/installed/evaluation-live-deadlines.test.mjs', 'tests/installed/evaluation-live-transfer.test.mjs', 'tests/installed/validation-request-budget.test.mjs']);
});

async function fixture(t, source) {
  const root = await mkdtemp(join(tmpdir(), 'plates-installed-stage-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'tests'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { 'test:installed:node': 'node --test --test-concurrency=1 tests/acme.test.mjs' } }));
  if (source !== null) await writeFile(join(root, 'tests/acme.test.mjs'), source);
  return root;
}

test('installed launcher propagates an actual child assertion failure once', async t => {
  const root = await fixture(t, "import test from 'node:test'; import assert from 'node:assert/strict'; import {appendFileSync} from 'node:fs'; test('Acme deliberate failure',()=>{appendFileSync('calls','once\\n');assert.fail('Acme retained failure');});\n");
  const result = run(process.execPath, [launcher], { cwd: root });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /Acme retained failure/);
  assert.equal(await readFile(join(root, 'calls'), 'utf8'), 'once\n');
});

test('installed launcher supplies its own literal receipt plan and preserves gate identity', async t => {
  const root = await fixture(t, "import test from 'node:test';import assert from 'node:assert/strict';test('Acme receipt',()=>{const p=JSON.parse(process.env.PLATES_SUITE_PLAN);assert.equal(p.available,true);assert.deepEqual(p.expectedFiles,['tests/acme.test.mjs']);assert.equal(p.executionSettings.concurrency,'1');assert.notEqual(p.invocationId,'ordinary-plan');assert.equal(process.env.PLATES_GATE_INVOCATION,'Acme-outer-gate');assert.equal(process.env.KEEL_SUITE_PLAN,undefined);});\n");
  const result = run(process.execPath, [launcher], { cwd: root, env: { ...process.env, PLATES_SUITE_PLAN: '{"invocationId":"ordinary-plan"}', KEEL_SUITE_PLAN: '{"invocationId":"ordinary-plan"}', PLATES_GATE_INVOCATION: 'Acme-outer-gate' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Acme receipt/);
});

test('installed launcher refuses a missing declared file before launching', async t => {
  const root = await fixture(t, null);
  const result = run(process.execPath, [launcher], { cwd: root });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /declared selection matched no files/);
});
