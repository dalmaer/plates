// Non-timing climb suites (hygiene counter, printed perf output, lessons/loop proposals,
// deterministic guard checks) must not be classified as wall-clock suite-timing files or
// re-executed under SIGSTOP stalls in every gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stallsPins } from '../practices/night/files/scripts/plates/test-ledger.mjs';
import { timesASuite, timingProblems } from './timing-hygiene.test.mjs';

const PLATES = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const NON_TIMING_CLIMB_FILES = [
  'tests/climb-guard.test.mjs',
  'tests/climb-guard-isolation.test.mjs',
  'tests/climb-hygiene.test.mjs',
  'tests/climb-pick.test.mjs',
  'tests/climb-tend.test.mjs',
  'tests/phase63-climb-loop.test.mjs',
];

const TIMED_STALLS_FILES = [
  'tests/climb.test.mjs',
  'tests/climb-admission.test.mjs',
  'tests/climb-codex.test.mjs',
  'tests/climb-execution-regression.test.mjs',
  'tests/evidence.test.mjs',
];

test('non-timing climb files are neither classified as wall-clock suites nor pinned to stalls', async () => {
  const config = JSON.parse(await readFile(join(PLATES, '.plates/plates.json'), 'utf8'));
  const pins = stallsPins(config);
  for (const file of NON_TIMING_CLIMB_FILES) {
    const text = await readFile(join(PLATES, file), 'utf8');
    assert.equal(timesASuite(text), false, `${file} does not judge wall-clock timing`);
    assert.equal(pins.includes(file), false, `${file} must not be re-executed under stalls`);
  }
  for (const file of TIMED_STALLS_FILES) {
    assert.equal(pins.includes(file), true, `${file} remains pinned to stalls`);
  }
});

test('non-wall-clock climb jobs stay exempt, while mixing a wall-clock test in the same file still requires a pin', () => {
  const cmp = 'compare', meas = 'measure';
  const perfTest = `test('Acme perf output', async t => {
    const perf = better => ({ jobs: ['perf'], perf: { command: 'node bench.mjs', better } });
    const dir = await acme(t, { climb: perf('higher'), files: { 'bench.mjs': "console.log('100');\\n" } });
    climb(dir, ['${meas}', 'perf', '--runs', '1', '--json']);
    climb(dir, ['${cmp}', '--base', 'HEAD~1', '--candidate', 'HEAD', '--runs', '1', '--json']);
  });\n`;
  assert.equal(timesASuite(perfTest), false, 'printed-output perf comparison does not time the wall clock');
  for (const job of ['hygiene', 'lessons', 'loop', 'perf']) {
    assert.equal(timesASuite(`climb(dir, ['${meas}', '${job}', '--baseline', '--json']);\n`), false, job);
  }
  for (const timed of [
    `test('Acme timed compare', async t => {\n  const dir = await acme(t, { files: { 't.mjs': 'setTimeout(() => {}, 500);' } });\n  climb(dir, ['${cmp}', '--json']);\n});\n`,
    `test('Acme build-time baseline', async t => {\n  climb(dir, ['${meas}', 'build-time', '--baseline', '--json']);\n});\n`,
  ]) {
    for (const combined of [perfTest + timed, timed + perfTest]) {
      assert.equal(timesASuite(combined), true);
      assert.equal(timingProblems('tests/acme.test.mjs', combined, []).length, 1);
    }
  }
});
