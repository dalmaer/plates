// plates integrate's durable run records (phase 158's baseline: 36 of 110 runs
// landed nothing, and nothing said why). One bare Acme origin and clones of it
// on this machine's disk; no network, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ready, integrate, LOCK } from '../lib/integrate.mjs';
import { INTEGRATIONS_BRANCH, INTEGRATIONS_FILE, integrationRuns, integrationSummary } from '../lib/integration-records.mjs';
import { readObservations, waitsModel, waitsSourceOf } from '../lib/integration-observations.mjs';
import { waitsFixture, fakeApi } from './helpers/waits.mjs';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// The project's gate: fails when a tracked .txt file says BREAK.
const GATE = `import { readdirSync, readFileSync } from 'node:fs';
process.exit(readdirSync('.').filter(f => f.endsWith('.txt')).some(f => readFileSync(f, 'utf8').includes('BREAK')) ? 1 : 0);
`;

async function acme(t, { check = 'node gate.mjs' } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'plates-integrate-records-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const seed = join(dir, 'seed'), origin = join(dir, 'origin.git');
  await mkdir(join(seed, '.plates'), { recursive: true });
  await writeFile(join(seed, '.plates', 'plates.json'), JSON.stringify({ name: 'Acme', repo: 'acme/app', check }));
  await writeFile(join(seed, 'gate.mjs'), GATE);
  await writeFile(join(seed, 'anvil.txt'), 'one anvil\n');
  execFileSync('git', ['init', '-q', '-b', 'main', seed]);
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'acme');
  execFileSync('git', ['clone', '-q', '--bare', seed, origin]);
  const a = join(dir, 'a'), b = join(dir, 'b');
  for (const clone of [a, b]) execFileSync('git', ['clone', '-q', origin, clone]);
  const env = machine => ({ ...process.env, PLATES_PROVIDER: 'claude', PLATES_SESSION: `session-${machine}`, PLATES_MACHINE: machine });
  const records = () => { try { return integrationRuns(git(origin, 'show', `${INTEGRATIONS_BRANCH}:${INTEGRATIONS_FILE}`)).runs; } catch { return []; } };
  return { dir, origin, a, b, env, records };
}

let clock = Date.parse('2026-11-04T10:00:00.000Z');
async function change(clone, branch, files, env) {
  git(clone, 'fetch', '-q', 'origin');
  git(clone, 'checkout', '-q', '-B', branch, 'origin/main');
  for (const [f, text] of Object.entries(files)) await writeFile(join(clone, f), text);
  git(clone, 'add', '-A');
  git(clone, 'commit', '-q', '-m', `acme: ${branch}`);
  const r = await ready({ root: clone }, { env, now: (clock += 1000) });
  assert.equal(r.data.ok, true, r.text);
  return git(clone, 'rev-parse', 'HEAD');
}
const fakeGate = async dir => {
  const files = (await readdir(dir)).filter(f => f.endsWith('.txt'));
  const text = await Promise.all(files.map(f => readFile(join(dir, f), 'utf8')));
  return { status: text.some(x => x.includes('BREAK')) ? 1 : 0 };
};

test('every integrate run appends one record: what landed, what was sent back and why, nothing ready, and a refused lock', async t => {
  const { a, b, origin, env, records } = await acme(t);
  const anvil = await change(a, 'claude/anvil', { 'anvil.txt': 'two anvils\n' }, env('m1'));
  const broken = await change(b, 'codex/broken', { 'broken.txt': 'BREAK\n' }, env('m2'));

  const first = await integrate({ root: a }, { env: env('m1'), gate: fakeGate });
  assert.equal(first.exitCode, 1, 'a change was sent back: the exit code is the gate\'s, not the record\'s');
  assert.equal(first.data.record.recorded, true, first.text);
  assert.equal(first.data.record.branch, INTEGRATIONS_BRANCH);
  let runs = records();
  assert.equal(runs.length, 1);
  const [one] = runs;
  assert.equal(one.outcome, 'partial');
  assert.equal(one.lock.result, 'held');
  assert.equal(one.exitCode, 1);
  assert.equal(one.machine, 'm1');
  assert.ok(Date.parse(one.endedAt) >= Date.parse(one.startedAt) && Number.isFinite(one.ms));
  assert.deepEqual(one.considered.map(c => [c.branch, c.head]), [['claude/anvil', anvil], ['codex/broken', broken]]);
  assert.deepEqual(one.landed, [{ branch: 'claude/anvil', head: anvil }]);
  assert.equal(one.pushed, git(origin, 'rev-parse', 'main'));
  assert.deepEqual(one.blocked.map(x => x.branch), ['codex/broken']);
  assert.match(one.blocked[0].reason, /fails the gate on main/);
  assert.ok(one.gates.length >= 2, 'each gate run is recorded');
  assert.ok(one.gates.every(g => g.mode === 'gate' && Number.isInteger(g.status) && Number.isFinite(g.ms)));
  assert.ok(one.gates.some(g => g.status !== 0), 'the failing gate run is there with its exit');

  // Nothing ready (the broken one stays blocked): a record, and no gate ran.
  const second = await integrate({ root: a }, { env: env('m1'), gate: fakeGate });
  assert.equal(second.exitCode ?? 0, 0);
  runs = records();
  assert.equal(runs.length, 2);
  assert.equal(runs[1].outcome, 'nothing-ready');
  assert.deepEqual(runs[1].gates, []);
  assert.deepEqual(runs[1].stillBlocked.map(x => x.branch), ['codex/broken']);

  // A held lock: refused, and recorded with its holder.
  git(origin, 'branch', LOCK, 'main');
  const third = await integrate({ root: b }, { env: env('m2'), gate: fakeGate });
  assert.equal(third.data.refused, true);
  assert.equal(third.exitCode, 1);
  runs = records();
  assert.equal(runs.length, 3);
  assert.equal(runs[2].outcome, 'refused');
  assert.equal(runs[2].lock.result, 'refused');
  assert.ok(runs[2].lock.holder && 'machine' in runs[2].lock.holder);
  assert.equal(runs[2].machine, 'm2');

  const summary = integrationSummary(integrationRuns(git(origin, 'show', `${INTEGRATIONS_BRANCH}:${INTEGRATIONS_FILE}`)));
  assert.deepEqual([summary.runs, summary.landedNothing, summary.outcomes.partial, summary.outcomes['nothing-ready'], summary.outcomes.refused], [3, 2, 1, 1, 1]);
});

test('a record that cannot be written is said, never fatal: the run, what it pushed and its exit code are unchanged', async t => {
  const { a, origin, env, records } = await acme(t);
  await change(a, 'claude/anvil', { 'anvil.txt': 'two anvils\n' }, env('m1'));
  // Someone else's branch of that name: left alone.
  git(origin, 'branch', INTEGRATIONS_BRANCH, 'main');
  const r = await integrate({ root: a }, { env: env('m1'), gate: fakeGate });
  assert.equal(r.exitCode ?? 0, 0, r.text);
  assert.deepEqual(r.data.landed.map(l => l.branch), ['claude/anvil']);
  assert.equal(r.data.record.recorded, false);
  assert.match(r.data.record.why, /not plates's record, so it is left alone/);
  assert.match(r.text, /The run record could not be written to plates-integrations/);
  assert.equal(git(origin, 'rev-parse', INTEGRATIONS_BRANCH), git(origin, 'rev-parse', 'main^'), 'their branch is not moved');
  assert.deepEqual(records(), []);

  // A writer that throws, on a run that itself stops with an error: the run's error and exit code are the ones raised.
  git(origin, 'branch', '-D', INTEGRATIONS_BRANCH);
  git(origin, 'branch', LOCK, 'main');
  const refused = await integrate({ root: a }, { env: env('m1'), gate: fakeGate, writeRecord: async () => { throw new Error('disk full'); } });
  assert.equal(refused.exitCode, 1);
  assert.equal(refused.data.refused, true);
  assert.deepEqual(refused.data.record, { recorded: false, why: 'disk full' });
  git(origin, 'branch', '-D', LOCK);
  await change(a, 'claude/rocket', { 'rocket.txt': 'one rocket\n' }, env('m1'));
  const failing = await integrate({ root: a }, { env: env('m1'), gate: async () => { throw Object.assign(new Error('the gate could not start'), { exitCode: 2 }); } }).catch(e => e);
  assert.equal(failing.exitCode, 2, 'the run\'s own error, unchanged');
  assert.match(failing.message, /^the gate could not start/);
  assert.equal(failing.record.recorded, true, 'and the error is recorded');
  const [last] = records().slice(-1);
  assert.equal(last.outcome, 'error');
  assert.equal(last.error, 'the gate could not start');
  assert.deepEqual(last.considered.map(c => c.branch), ['claude/rocket']);
});

test('the waits read integrate\'s records from the plates-integrations branch, beside the other waits', async () => {
  const NOW = Date.parse('2026-11-04T18:30:00Z'), REPO = 'acme/anvils';
  const source = waitsSourceOf({ practices: ['delivery'], delivery: { tested: 'green', promote: 'vercel:anvils' } });
  const line = (outcome, minutes, extra = {}) => JSON.stringify({ schema: 1, kind: 'integrate', startedAt: new Date(NOW - minutes * 60_000).toISOString(), endedAt: new Date(NOW - minutes * 60_000 + 5000).toISOString(), ms: 5000, outcome, gates: [], landed: [], blocked: [], ...extra });
  const text = [line('landed', 90, { landed: [{ branch: 'claude/phase-4' }] }), line('blocked', 60, { blocked: [{ branch: 'codex/phase-9', reason: 'fails the gate on main' }] }), line('refused', 30), 'not json'].join('\n') + '\n';
  const answers = waitsFixture(REPO, NOW);
  const refsPath = `/repos/${REPO}/git/matching-refs/heads/`;
  const tip = '0123456789abcdef0123456789abcdef01234567', blob = 'fedcba9876543210fedcba9876543210fedcba98';
  answers[refsPath] = [...answers[refsPath], { ref: `refs/heads/${INTEGRATIONS_BRANCH}`, object: { sha: tip, type: 'commit' } }];
  answers[`/repos/${REPO}/git/trees/${tip}`] = { tree: [{ path: INTEGRATIONS_FILE, type: 'blob', sha: blob }] };
  answers[`/repos/${REPO}/git/blobs/${blob}`] = { encoding: 'base64', content: Buffer.from(text).toString('base64') };
  const f = fakeApi(answers);
  const { observations, gaps } = await readObservations({ repo: REPO, api: f.api, now: NOW, source, can: { pulls: true, checks: true, activity: true } });
  assert.equal(observations.integrations.state, 'read');
  assert.equal(observations.integrations.runs, 3);
  assert.equal(observations.integrations.skipped, 1, 'a line that is not a record is counted, not guessed at');
  assert.equal(observations.integrations.landedNothing, 2);
  assert.deepEqual(observations.integrations.recent.map(r => r.outcome), ['refused', 'blocked', 'landed']);
  assert.deepEqual(observations.integrations.recent[1].blocked, [{ branch: 'codex/phase-9', reason: 'fails the gate on main' }]);
  const model = waitsModel(observations, gaps, { now: NOW });
  assert.equal(model.integrations.runs, 3);
  assert.ok(!model.items.some(i => i.branch === INTEGRATIONS_BRANCH), 'the record branch is never a change waiting');
  // Without the branch: unavailable, with the reason, never zero runs.
  const without = await readObservations({ repo: REPO, api: fakeApi(waitsFixture(REPO, NOW)).api, now: NOW, source, can: { pulls: true, checks: true, activity: true } });
  assert.equal(without.observations.integrations.state, 'unavailable');
  assert.match(without.observations.integrations.why, /no plates-integrations branch/);
});
