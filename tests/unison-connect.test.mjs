// Plates phase 200: plates unison connect and sync, through the CLI, against a stub `unison`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { run } from './helpers/run.mjs';
import { world, workspace } from './helpers/unison-stub.mjs';
import { parseLink, phaseUrl } from '../lib/unison-link.mjs';

const BIN = resolve('bin/plates.mjs');
const cli = (w, args, env = {}) => {
  const r = run(process.execPath, [BIN, 'unison', ...args, '--json'], { cwd: w.plate, env: { ...w.env, ...env } });
  assert.equal(r.stderr, '', r.stderr);
  return { code: r.status, data: JSON.parse(r.stdout) };
};
const mapOf = async w => JSON.parse(await readFile(join(w.plate, '.plates/unison/map.json'), 'utf8'));
const mutating = calls => calls.filter(c => ['create', 'add', 'edit', 'close', 'reopen', 'move', 'assign', 'start', 'claim'].includes(c.argv[1]));

test('the repo finds the workspace, or connect makes one', async t => {
  // Found: the workspace lists the repo as http://, mixed case; it is found, not duplicated.
  let w = await world(t, { workspaces: [workspace('ws_acme1', 'http://github.com/Acme/Tools'), workspace('ws_other', 'https://github.com/acme/anvils')] });
  let r = cli(w, ['connect']);
  assert.equal(r.code, 0, JSON.stringify(r.data));
  assert.deepEqual([r.data.connected, r.data.created, r.data.workspace.id], [true, false, 'ws_acme1']);
  assert.deepEqual(mutating(await w.calls()), []);
  const map = await mapOf(w);
  assert.deepEqual([map.workspace, map.repo, map.entries], ['ws_acme1', 'acme/tools', {}]);
  // The map is private: 0600 in a 0700 directory, git-ignored, never tracked.
  assert.equal((await stat(join(w.plate, '.plates/unison/map.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(w.plate, '.plates/unison'))).mode & 0o777, 0o700);
  assert.equal(execFileSync('git', ['status', '--porcelain', '--', '.plates/unison'], { cwd: w.plate, encoding: 'utf8' }), '');
  // Every call went to the configured server, from outside the checkout.
  for (const c of await w.calls()) { assert.equal(c.server, 'http://127.0.0.1:4600'); assert.ok(!c.cwd.startsWith(w.plate)); }

  // None: connect makes one, named for the plate, listing https://github.com/<repo>; again finds it.
  w = await world(t, { workspaces: [workspace('ws_other', 'https://github.com/acme/anvils')] });
  r = cli(w, ['connect']);
  assert.deepEqual([r.code, r.data.created, r.data.workspace.id], [0, true, 'ws_acme2']);
  assert.deepEqual(mutating(await w.calls()).map(c => c.argv), [['workspace', 'create', 'Acme Tools', '--repo', 'https://github.com/acme/tools']]);
  r = cli(w, ['connect']);
  assert.deepEqual([r.code, r.data.created, r.data.workspace.id], [0, false, 'ws_acme2']);
  assert.equal(mutating(await w.calls()).length, 1);

  // Two workspaces list the repo: refused, nothing made or cached.
  w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools'), workspace('ws_acme9', 'https://www.github.com/acme/tools.git')] });
  r = cli(w, ['connect']);
  assert.equal(r.code, 1);
  assert.deepEqual(r.data.ambiguous, ['ws_acme1', 'ws_acme9']);
  assert.deepEqual(mutating(await w.calls()), []);
  await assert.rejects(mapOf(w));

  // Not signed in: a sign-in card, exit 3, nothing created.
  w = await world(t, { signedIn: false });
  r = cli(w, ['connect']);
  assert.equal(r.code, 3);
  assert.deepEqual([r.data.created, r.data.signIn.command, r.data.signIn.server], [false, 'unison login', 'http://127.0.0.1:4600']);
  assert.deepEqual(mutating(await w.calls()), []);
  await assert.rejects(mapOf(w));

  // Unison not read (the CLI missing): nothing created.
  w = await world(t, {});
  r = cli(w, ['connect'], { PATH: w.systemPath });
  assert.deepEqual([r.code, r.data.created, r.data.read], [1, false, false]);
  await assert.rejects(mapOf(w));

  // No repo in the plate's config: usage, exit 2.
  w = await world(t, {}, { config: { repo: undefined } });
  assert.equal(cli(w, ['connect']).code, 2);
});

test('sync applies the plan, keeps the map, and a second sync changes nothing', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'http://github.com/acme/tools')], items: [], next: 40 });
  // Not connected: sync refuses before reading anything remote.
  assert.equal(cli(w, ['sync']).code, 2);
  assert.deepEqual(await w.calls(), []);
  cli(w, ['connect']);
  let r = cli(w, ['sync']);
  assert.equal(r.code, 0, JSON.stringify(r.data));
  assert.deepEqual(r.data.applied.map(a => [a.op, a.key, a.item]), [['create', 'phase:2', 40], ['create', 'phase:3', 41]]);
  let state = await w.state();
  assert.deepEqual(state.items.map(i => i.title), ['Phase 2: Acme counts anvils', 'Phase 3: Acme orders anvils']);
  // Each item links back to its own phase; the copied Done when cannot name another.
  assert.equal(parseLink(state.items[0].body, ['acme/tools']).url, phaseUrl('acme/tools', '2-acme-counts-anvils.md'));
  assert.deepEqual((await mapOf(w)).entries, { 'phase:2': { item: 40, closedBySync: false }, 'phase:3': { item: 41, closedBySync: false } });
  r = cli(w, ['sync']);
  assert.deepEqual([r.code, r.data.applied], [0, []]);

  // Phase 2 built: sync closes its item with a note; a rename retitles; nothing is moved, assigned or started.
  const phase = join(w.plate, 'docs/phases/2-acme-counts-anvils.md');
  await writeFile(phase, (await readFile(phase, 'utf8')).replace('status: planned', 'status: built').replace('evidence: []', 'evidence: ["evidence/acme.md"]').replace('- [ ]', '- [x]'));
  const three = join(w.plate, 'docs/phases/3-acme-orders-anvils.md');
  await writeFile(three, (await readFile(three, 'utf8')).replace('# Acme orders anvils', '# Acme orders anvils by size'));
  const before = (await w.calls()).length;
  assert.deepEqual(cli(w, ['status']).data.plan.counts, { create: 0, retitle: 1, close: 1, reopen: 0 });
  assert.equal(mutating((await w.calls()).slice(before)).length, 0);
  r = cli(w, ['sync']);
  assert.deepEqual(r.data.applied.map(a => [a.op, a.item]), [['close', 40], ['retitle', 41]]);
  state = await w.state();
  assert.deepEqual([state.items[0].status, state.items[0].note, state.items[1].title], ['done', 'plates: phase 2 is built', 'Phase 3: Acme orders anvils by size']);
  assert.equal((await mapOf(w)).entries['phase:2'].closedBySync, true);
  assert.ok(mutating(await w.calls()).every(c => ['create', 'add', 'edit', 'close'].includes(c.argv[1])));

  // A person closes phase 3's item while the phase is open: a suggestion, not a reopen.
  await w.setState({ items: state.items.map(i => (i.id === 41 ? { ...i, status: 'done' } : i)) });
  r = cli(w, ['sync']);
  assert.deepEqual([r.data.applied, r.data.suggestions], [[], [{ kind: 'closed-by-hand', key: 'phase:3', item: 41 }]]);

  // A failed write stops the sync; what was applied stays in the map.
  await writeFile(join(w.plate, 'docs/phases/4-acme-ships-anvils.md'), (await readFile(three, 'utf8')).replace('# Acme orders anvils by size', '# Acme ships anvils'));
  await w.setState({ failAdd: true });
  r = cli(w, ['sync']);
  assert.equal(r.code, 1);
  assert.equal(r.data.failed.key, 'phase:4');
  assert.equal(Object.keys((await mapOf(w)).entries).length, 2);
});

test('issues, when the plate turns them on, come from GitHub by node id', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')], items: [], next: 1 }, { config: { unison: { sources: ['issues'] } } });
  const gh = join(w.bin, 'gh'), ghState = join(w.root, 'gh-state.json');
  await writeFile(ghState, JSON.stringify({ open: [{ node_id: 'I_acme5', number: 5, title: 'Anvils rust', state: 'open' }, { node_id: 'PR_acme6', number: 6, title: 'A PR', pull_request: {} }], nodes: [] }));
  await writeFile(gh, `#!${process.execPath}\nconst s = JSON.parse(require('node:fs').readFileSync(${JSON.stringify(ghState)}, 'utf8'));\nconst a = process.argv.slice(2);\nif (a[1] === 'graphql') { console.log(JSON.stringify({ data: { nodes: s.nodes } })); process.exit(0); }\nif (/^repos\\/acme\\/tools\\/issues\\?state=open/.test(a[1])) { console.log(JSON.stringify(a[1].includes('page=1') ? s.open : [])); process.exit(0); }\nprocess.exit(1);\n`, { mode: 0o755 });
  const env = { PLATES_GH: gh };
  cli(w, ['connect'], env);
  let r = cli(w, ['sync'], env);
  assert.deepEqual(r.data.applied.map(a => [a.op, a.key]), [['create', 'issue:I_acme5']]);
  assert.equal((await w.state()).items[0].body, 'Issue: https://github.com/acme/tools/issues/5');
  // Closed on GitHub: no longer open, so its state is read by node id, and its item closes.
  await writeFile(ghState, JSON.stringify({ open: [], nodes: [{ id: 'I_acme5', number: 5, title: 'Anvils rust', state: 'CLOSED', repository: { nameWithOwner: 'acme/tools' } }] }));
  r = cli(w, ['sync'], env);
  assert.deepEqual(r.data.applied.map(a => [a.op, a.item]), [['close', 1]]);
  // GitHub not read: the plan is not read either, and nothing changes.
  await writeFile(gh, '#!/bin/sh\necho "gh: HTTP 502" >&2\nexit 1\n', { mode: 0o755 });
  r = cli(w, ['status'], env);
  assert.deepEqual([r.code, r.data.read, r.data.plan], [1, false, null]);
});
