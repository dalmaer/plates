import './helpers/hermetic.mjs';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { home } from '../lib/home.mjs';
import { readVerify } from '../practices/night/files/scripts/plates/morning.mjs';
import { phaseFile } from './helpers/web-projects.mjs';

const git = (root, ...args) => childProcess.execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function fixture(t, count = 1, phases = 30) {
  const dir = await mkdtemp(join(tmpdir(), 'plates-home-perf-')), roots = [];
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (let i = 0; i < count; i++) {
    const root = join(dir, `acme${i}`); roots.push(root);
    await mkdir(join(root, '.plates'), { recursive: true });
    await mkdir(join(root, 'docs/phases'), { recursive: true });
    await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Acme', repo: `acme/acme${i}`, ...(count > 1 && i === 0 ? { plates: 'self' } : {}), phases: { shape: 'files' } }));
    await writeFile(join(root, 'docs/goals.json'), JSON.stringify([{ id: 'G1', title: 'Acme', outcome: 'Acme works' }]));
    for (let p = 1; p <= phases; p++) await writeFile(join(root, `docs/phases/${p}-acme.md`), phaseFile(p, { next: `Build Acme café ${p}.` }));
    git(root, 'init', '-q', '-b', 'main'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'Acme');
    git(root, 'remote', 'add', 'origin', `https://github.com/acme/acme${i}`);
  }
  if (count > 1) await writeFile(join(roots[0], 'plates.json'), JSON.stringify(roots.slice(1).map((_, i) => ({ role: 'managed', repo: `acme/acme${i + 1}` }))));
  const deps = { me: null, reviews: async () => ({}), waits: null, release: async () => ({ state: 'unknown' }),
    workItems: async () => ({ items: [] }), queues: async () => ({}), claims: async () => new Map(), prs: async () => new Map(), runs: async () => new Map(),
    env: { ...process.env, PLATES_STATE: join(dir, 'state'), XDG_STATE_HOME: join(dir, 'state') } };
  return { dir, root: roots[0], deps };
}
function spy(t, method, observe) {
  const original = childProcess[method];
  const wrapped = mock.method(childProcess, method, function (...args) { observe(args); return Reflect.apply(original, this, args); });
  syncBuiltinESMExports();
  t.after(() => { wrapped.mock.restore(); syncBuiltinESMExports(); });
}

test('home batches phase blobs, preserving UTF-8 content and source results', async t => {
  const { root, deps } = await fixture(t);
  const calls = [];
  spy(t, 'execFile', ([bin, args]) => { if (bin === 'git' && args.includes('cat-file')) calls.push(args); });
  const result = await home({ root, backlog: true }, { ...deps, claims: async () => new Map([['acme0', { state: 'none', why: 'Acme' }]]), drafts: async x => x });
  assert.ok(JSON.stringify(result).includes('café'), 'phase text survives byte framing');
  assert.ok(calls.some(a => a.includes('--batch')), 'batch prefetch is used');
  assert.ok(calls.length < 10, `bounded cat-file processes: ${calls.length}`);
});

test('malformed batch output falls back to checked single blob reads', async t => {
  const { root, deps } = await fixture(t, 1, 3);
  const options = { ...deps, claims: async () => new Map([['acme0', { state: 'none', why: 'Acme' }]]), drafts: async x => x, now: () => Date.parse('2026-11-16T12:00:00Z') };
  const expected = await home({ root, backlog: true }, options);
  const original = childProcess.execFile;
  let batches = 0, singles = 0;
  const wrapped = mock.method(childProcess, 'execFile', function (bin, args, opts, callback) {
    if (bin === 'git' && args.includes('--batch')) {
      batches++;
      return original(bin, args, opts, (error, bytes) => callback(error, bytes.subarray(0, bytes.length - 1)));
    }
    if (args.includes('cat-file')) singles++;
    return original(bin, args, opts, callback);
  });
  syncBuiltinESMExports();
  t.after(() => { wrapped.mock.restore(); syncBuiltinESMExports(); });
  assert.deepEqual(await home({ root, backlog: true }, options), expected);
  assert.ok(batches > 0 && singles >= 3, 'incomplete batches are not trusted');
});

test('agents and recurring never read discarded reviews, waits or release', async t => {
  const { root, deps } = await fixture(t, 1, 1);
  const calls = [];
  for (const name of ['reviews', 'waits', 'release']) deps[name] = async () => { calls.push(name); return {}; };
  for (const mode of ['agents', 'recurring']) {
    await home({ root, [mode]: true }, deps);
    assert.deepEqual(calls, [], mode);
  }
});

test('home overlaps at most four plate reads and preserves fleet order', async t => {
  const { root, deps } = await fixture(t, 8, 1);
  let active = 0, peak = 0, pending = [];
  const flush = () => { const batch = pending; pending = []; for (const done of batch) done(); };
  // The timeout permits the serial negative control to finish, never establishes concurrency.
  const timer = setInterval(flush, 3000);
  t.after(() => clearInterval(timer));
  deps.release = async () => {
    peak = Math.max(peak, ++active);
    await new Promise(done => { pending.push(done); if (pending.length === 4) flush(); });
    active--;
    return { state: 'unknown' };
  };
  const result = await home({ root }, deps);
  assert.equal(peak, 4);
  assert.deepEqual(result.projects.map(p => p.id), Array.from({ length: 8 }, (_, i) => `acme${i}`));
});

test('readVerify fetches each present ref once and retains missing and invalid source distinctions', async t => {
  const { root, dir } = await fixture(t, 1, 1), remote = join(dir, 'origin.git');
  await mkdir(remote); git(remote, 'init', '--bare', '-q'); git(root, 'remote', 'set-url', 'origin', remote);
  await writeFile(join(root, 'verify.json'), '{"results":[]}');
  await writeFile(join(root, 'deploys.jsonl'), '');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'Acme verification');
  git(root, 'push', '-q', 'origin', 'HEAD:plates-verify');
  const calls = [];
  spy(t, 'spawnSync', ([bin, args]) => { if (bin === 'git') calls.push(args); });
  const result = readVerify(root);
  assert.deepEqual(result, { results: [], deploys: [] });
  assert.equal(calls.filter(a => a[0] === 'fetch').length, 1);
  assert.equal(calls.filter(a => a[0] === 'ls-remote' && a.at(-1) === 'plates-verify').length, 1);
  git(root, 'rm', '-q', 'verify.json'); git(root, 'commit', '-qm', 'Acme deploy only'); git(root, 'push', '-q', 'origin', 'HEAD:plates-verify');
  assert.deepEqual(readVerify(root), { results: [], deploys: [] }, 'deploy-only branch still readable');
  await writeFile(join(root, 'deploys.jsonl'), 'invalid'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'Acme invalid'); git(root, 'push', '-q', 'origin', 'HEAD:plates-verify');
  assert.match(readVerify(root).unread, /not JSON/);
  git(root, 'push', '-q', 'origin', ':plates-verify');
  assert.deepEqual(readVerify(root), { results: [], deploys: [] }, 'deleted remote ref cannot reuse a stale local ref');
});
