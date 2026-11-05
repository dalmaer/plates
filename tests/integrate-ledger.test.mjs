// plates integrate's gate runs in the test ledger. The baseline of 2026-11-04
// (docs/research/2026-11-04-integration-delays-baseline.md) found plates time
// with no gate observation after 2026-10-17, when integrate came in: the gate
// runs in integrate's temporary worktree, the ledger writes its record into that
// worktree's .plates/test-runs, and `git clean -ffdx` before the next gate and
// the worktree's removal after the run delete it. One bare Acme origin and a
// clone; no network, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ready, integrate } from '../lib/integrate.mjs';
import { platesTime } from '../lib/time.mjs';

const PLATES = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(PLATES, 'scripts', 'plates', 'test-ledger.mjs');
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function acme(t, check) {
  const dir = await mkdtemp(join(tmpdir(), 'plates-integrate-ledger-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const seed = join(dir, 'seed'), origin = join(dir, 'origin.git'), a = join(dir, 'a');
  await mkdir(join(seed, '.plates'), { recursive: true });
  await writeFile(join(seed, '.plates', 'plates.json'), JSON.stringify({ name: 'Acme', repo: 'acme/app', check }));
  await writeFile(join(seed, 'gate.mjs'), 'process.exit(0);\n');
  await writeFile(join(seed, 'anvil.txt'), 'one anvil\n');
  execFileSync('git', ['init', '-q', '-b', 'main', seed]);
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'acme');
  execFileSync('git', ['clone', '-q', '--bare', seed, origin]);
  execFileSync('git', ['clone', '-q', origin, a]);
  const env = { ...process.env, PLATES_PROVIDER: 'claude', PLATES_SESSION: 'session-m1', PLATES_MACHINE: 'm1' };
  return { dir, a, env };
}

test('the gate runs integrate makes in its worktree reach this checkout\'s test ledger, so plates time counts them', async t => {
  // The project's check goes through the test ledger, as plates's own `npm run check` does.
  const { dir, a, env } = await acme(t, `node ${JSON.stringify(LEDGER)} --run "node gate.mjs"`);
  git(a, 'checkout', '-q', '-b', 'claude/anvil');
  await writeFile(join(a, 'anvil.txt'), 'two anvils\n');
  git(a, 'commit', '-q', '-am', 'acme: two anvils');
  assert.equal((await ready({ root: a }, { env, now: Date.now() - 1000 })).data.ok, true);
  git(a, 'checkout', '-q', 'main');
  const r = await integrate({ root: a }, { env, record: false });
  assert.equal(r.exitCode ?? 0, 0, r.text);
  assert.equal(r.data.gates, 1);
  const home = join(dir, 'home');
  await mkdir(home);
  const time = await platesTime({ root: a, weeks: 1, home, env: { ...process.env, HOME: home } });
  assert.equal(time.data.coverage.gateRuns, 1, 'the one gate run is a root-project gate in this checkout\'s ledger');
  const lane = time.data.weeks.at(-1).lanes.find(l => l.kind === 'gate');
  assert.equal(lane.successful, 1);
  assert.deepEqual(time.data.coverage.excludedGates, []);
  // Each copy says where it came from.
  const names = (await readdir(join(a, '.plates', 'test-runs'))).filter(n => n.endsWith('.json'));
  const gates = (await Promise.all(names.map(async n => JSON.parse(await readFile(join(a, '.plates', 'test-runs', n), 'utf8'))))).filter(x => x.kind === 'gate');
  assert.equal(gates.length, 1);
  assert.equal(gates[0].attributedBy.source, 'plates-integrate');
  assert.equal(gates[0].dir, '.');
  assert.equal(git(a, 'status', '--porcelain'), '', 'the ledger ignores itself: the checkout stays clean');
});
