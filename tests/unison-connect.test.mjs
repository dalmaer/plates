// Plates phase 200: plates unison connect and sync, through the CLI, against a stub `unison`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { run } from './helpers/run.mjs';
import { unisonCommand } from '../lib/unison.mjs';
import { collect } from '../practices/phases/files/scripts/roadmap.mjs';
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
  assert.deepEqual(r.data.applied.map(a => [a.op, a.key, a.item]), [['create', 'phase:acme/tools:2', 40], ['create', 'phase:acme/tools:3', 41]]);
  let state = await w.state();
  assert.deepEqual(state.items.map(i => i.title), ['Phase 2: Acme counts anvils', 'Phase 3: Acme orders anvils']);
  // Each item links back to its own phase; the copied Done when cannot name another.
  assert.equal(parseLink(state.items[0].body, ['acme/tools']).url, phaseUrl('acme/tools', '2-acme-counts-anvils.md'));
  assert.deepEqual((await mapOf(w)).entries, { 'phase:acme/tools:2': { item: 40, closedBySync: false }, 'phase:acme/tools:3': { item: 41, closedBySync: false } });
  r = cli(w, ['sync']);
  assert.deepEqual([r.code, r.data.applied], [0, []]);

  // Phase 2 built: sync closes its item with a note; a rename retitles; nothing is moved, assigned or started.
  const phase = join(w.plate, 'docs/phases/2-acme-counts-anvils.md');
  await writeFile(phase, (await readFile(phase, 'utf8')).replace('status: planned', 'status: built').replace('evidence: []', 'evidence: ["evidence/acme.md"]').replace('- [ ]', '- [x]'));
  const three = join(w.plate, 'docs/phases/3-acme-orders-anvils.md');
  await writeFile(three, (await readFile(three, 'utf8')).replace('# Acme orders anvils', '# Acme orders anvils by size'));
  const before = (await w.calls()).length;
  assert.deepEqual(cli(w, ['status']).data.plan.counts, { create: 0, retitle: 1, relink: 0, close: 1, reopen: 0 });
  assert.equal(mutating((await w.calls()).slice(before)).length, 0);
  r = cli(w, ['sync']);
  assert.deepEqual(r.data.applied.map(a => [a.op, a.item]), [['close', 40], ['retitle', 41]]);
  state = await w.state();
  assert.deepEqual([state.items[0].status, state.items[0].close_note, state.items[1].title], ['done', 'plates: phase 2 is built', 'Phase 3: Acme orders anvils by size']);
  assert.equal((await mapOf(w)).entries['phase:acme/tools:2'].closedBySync, true);
  assert.ok(mutating(await w.calls()).every(c => ['create', 'add', 'edit', 'close'].includes(c.argv[1])));

  // A person closes phase 3's item while the phase is open: a suggestion, not a reopen.
  await w.setState({ items: state.items.map(i => (i.id === 41 ? { ...i, status: 'done' } : i)) });
  r = cli(w, ['sync']);
  assert.deepEqual([r.data.applied, r.data.suggestions], [[], [{ kind: 'closed-by-hand', key: 'phase:acme/tools:3', item: 41 }]]);

  // A failed write stops the sync; what was applied stays in the map.
  await writeFile(join(w.plate, 'docs/phases/4-acme-ships-anvils.md'), (await readFile(three, 'utf8')).replace('# Acme orders anvils by size', '# Acme ships anvils'));
  await w.setState({ failAdd: true });
  r = cli(w, ['sync']);
  assert.equal(r.code, 1);
  assert.equal(r.data.failed.key, 'phase:acme/tools:4');
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

test('a .gitignore negation cannot leave the map visible, and npm pack never ships it', async t => {
  // /.plates/unison/* then !map.json: a stand-in probe reads as ignored while the map would not be.
  let w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')] });
  await writeFile(join(w.plate, '.gitignore'), '/.plates/unison/*\n!/.plates/unison/map.json\n');
  await writeFile(join(w.plate, 'package.json'), JSON.stringify({ name: 'acme-tools', version: '1.0.0' }));
  assert.equal(cli(w, ['connect']).code, 0);
  assert.doesNotMatch(execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: w.plate, encoding: 'utf8' }), /\.plates\/unison/);
  const pack = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: w.plate, env: { ...process.env, npm_config_cache: join(w.root, 'npm-cache') } });
  assert.equal(pack.status, 0, pack.stderr);
  const files = JSON.parse(pack.stdout)[0].files.map(f => f.path);
  assert.ok(files.includes('package.json'));
  assert.deepEqual(files.filter(f => f.startsWith('.plates/unison')), []);
  // The package exclusion changed: refused, not trusted.
  await writeFile(join(w.plate, '.plates/unison/.npmignore'), '!map.json\n', { mode: 0o600 });
  assert.equal(cli(w, ['connect']).code, 1);
  // A rule that un-ignores the directory itself: refused, and no map is written.
  w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')] });
  await writeFile(join(w.plate, '.gitignore'), '!/.plates/unison/\n!/.plates/unison/map.json\n');
  const r = cli(w, ['connect']);
  assert.equal(r.code, 1);
  assert.match(r.data.error, /not git-ignored/);
  await assert.rejects(mapOf(w));
});

test('two overlapping syncs make one item: the second is not run', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')], items: [], next: 1 }, { phases: { '2-acme-counts-anvils.md': { status: 'planned', title: 'Acme counts anvils' } } });
  cli(w, ['connect']);
  await w.setState({ addDelayMs: 1500 });
  // The first sync runs in this process (it waits on the stub's slow answer while holding the lock); the second is the CLI.
  const first = unisonCommand({ args: ['sync'], root: w.plate, config: JSON.parse(await readFile(join(w.plate, '.plates/plates.json'), 'utf8')), env: w.env, readPhases: async () => (await collect(w.plate)).phases });
  // Wait until the first sync's add has landed, then start the second while it still holds the lock.
  for (let i = 0; i < 100 && !(await w.state()).items.length; i++) await new Promise(done => setTimeout(done, 50));
  const second = cli(w, ['sync']);
  assert.equal(second.code, 1);
  assert.match(second.data.why, /another sync is running/);
  assert.equal((await first).exitCode ?? 0, 0);
  assert.equal((await w.state()).items.length, 1);
  // The lock is released: a third sync runs and changes nothing.
  await w.setState({ addDelayMs: 0 });
  assert.deepEqual(cli(w, ['sync']).data.applied, []);
});

test('a close Unison made before the run died is recorded as sync\'s on the next run', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')], items: [], next: 1 }, { phases: { '2-acme-counts-anvils.md': { status: 'planned', title: 'Acme counts anvils' } } });
  cli(w, ['connect']);
  cli(w, ['sync']);
  const phase = join(w.plate, 'docs/phases/2-acme-counts-anvils.md');
  await writeFile(phase, (await readFile(phase, 'utf8')).replace('status: planned', 'status: built').replace('evidence: []', 'evidence: ["evidence/acme.md"]').replace('- [ ]', '- [x]'));
  await w.setState({ dieOnClose: true });
  assert.equal(cli(w, ['sync']).code, 1);
  assert.equal((await w.state()).items[0].status, 'done');
  assert.equal((await mapOf(w)).entries['phase:acme/tools:2'].pendingClose, 'plates: phase 2 is built');
  assert.deepEqual(cli(w, ['sync']).data.applied, []);
  assert.deepEqual((await mapOf(w)).entries['phase:acme/tools:2'], { item: 1, closedBySync: true });
  // So reopening the phase reopens the item plates closed.
  await writeFile(phase, (await readFile(phase, 'utf8')).replace('status: built', 'status: partial').replace('- [x]', '- [ ]'));
  const reopened = cli(w, ['sync']);
  assert.deepEqual(reopened.data.applied?.map(a => a.op), ['reopen'], JSON.stringify(reopened.data));
});

test('an issue item whose repo was renamed stays linked through GitHub, and its line is brought current', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')], next: 2,
    items: [{ id: 1, title: 'Issue #5: Anvils rust', body: 'Issue: https://github.com/acme/old-tools/issues/5', status: 'open', workspace_id: 'ws_acme1' }] }, { config: { unison: { sources: ['issues'] } } });
  const gh = join(w.bin, 'gh'), ghState = join(w.root, 'gh-state.json');
  await writeFile(ghState, JSON.stringify({ open: [{ node_id: 'I_acme5', number: 5, title: 'Anvils rust', state: 'open' }], nodes: [] }));
  await writeFile(gh, `#!${process.execPath}\nconst s = JSON.parse(require('node:fs').readFileSync(${JSON.stringify(ghState)}, 'utf8'));\nconst a = process.argv.slice(2);\nif (a[1] === 'graphql' && a.some(x => x.includes('resource(url'))) { const url = a.find(x => x.startsWith('url=')).slice(4); console.log(JSON.stringify({ data: { resource: url === 'https://github.com/acme/old-tools/issues/5' ? { id: 'I_acme5' } : null } })); process.exit(0); }\nif (a[1] === 'graphql') { console.log(JSON.stringify({ data: { nodes: s.nodes } })); process.exit(0); }\nif (/^repos\\/acme\\/tools\\/issues\\?state=open/.test(a[1])) { console.log(JSON.stringify(a[1].includes('page=1') ? s.open : [])); process.exit(0); }\nprocess.exit(1);\n`, { mode: 0o755 });
  const env = { PLATES_GH: gh };
  cli(w, ['connect'], env);
  const map = join(w.plate, '.plates/unison/map.json');
  await writeFile(map, JSON.stringify({ schema: 1, workspace: 'ws_acme1', repo: 'acme/tools', entries: { 'issue:I_acme5': { item: 1, closedBySync: false } } }), { mode: 0o600 });
  // Open: not lost, not made again; a relink brings the line to the current URL.
  let r = cli(w, ['sync'], env);
  assert.deepEqual([r.data.unlinked, r.data.applied.map(a => a.op)], [[], ['relink']]);
  assert.equal((await w.state()).items.length, 1);
  assert.equal((await w.state()).items[0].body, 'Issue: https://github.com/acme/tools/issues/5');
  // Put the old line back and close the issue: the item still closes.
  await w.setState({ items: [{ ...(await w.state()).items[0], body: 'Issue: https://github.com/acme/old-tools/issues/5' }] });
  await writeFile(ghState, JSON.stringify({ open: [], nodes: [{ id: 'I_acme5', number: 5, title: 'Anvils rust', state: 'CLOSED', repository: { nameWithOwner: 'acme/tools' } }] }));
  r = cli(w, ['sync'], env);
  assert.deepEqual(r.data.applied.map(a => [a.op, a.item]), [['close', 1]]);
});

test('an item reopened by hand is no longer closed by sync, so a later hand close is a suggestion', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')], items: [], next: 1 }, { phases: { '2-acme-counts-anvils.md': { status: 'planned', title: 'Acme counts anvils' } } });
  cli(w, ['connect']);
  cli(w, ['sync']);
  const phase = join(w.plate, 'docs/phases/2-acme-counts-anvils.md');
  const planned = await readFile(phase, 'utf8');
  await writeFile(phase, planned.replace('status: planned', 'status: built').replace('evidence: []', 'evidence: ["evidence/acme.md"]').replace('- [ ]', '- [x]'));
  assert.deepEqual(cli(w, ['sync']).data.applied.map(a => a.op), ['close']);
  // The owner reopens the item by hand, and the phase goes back to planned.
  await writeFile(phase, planned);
  await w.setState({ items: (await w.state()).items.map(i => ({ ...i, status: 'open' })) });
  // Status writes nothing, but plans as if sync had not closed it.
  assert.equal(cli(w, ['status']).data.plan.counts.reopen, 0);
  assert.equal((await mapOf(w)).entries['phase:acme/tools:2'].closedBySync, true);
  assert.deepEqual(cli(w, ['sync']).data.applied, []);
  assert.equal((await mapOf(w)).entries['phase:acme/tools:2'].closedBySync, false);
  // Then closes it by hand while the phase is open: a suggestion, not a reopen.
  await w.setState({ items: (await w.state()).items.map(i => ({ ...i, status: 'done', close_note: 'not now' })) });
  const r = cli(w, ['sync']);
  assert.deepEqual([r.data.applied, r.data.suggestions], [[], [{ kind: 'closed-by-hand', key: 'phase:acme/tools:2', item: 1 }]]);
});

test('an existing item for an already-closed issue is adopted and closed from an empty map', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')], next: 2,
    items: [{ id: 1, title: 'Issue #5: Anvils rust', body: 'Notes.\n\nIssue: https://github.com/acme/tools/issues/5', status: 'open', workspace_id: 'ws_acme1' }] }, { config: { unison: { sources: ['issues'] } } });
  const gh = join(w.bin, 'gh');
  await writeFile(gh, `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (/^repos\\/acme\\/tools\\/issues\\?state=open/.test(a[1])) { console.log('[]'); process.exit(0); }\nif (a[1] === 'repos/acme/tools/issues/5') { console.log(JSON.stringify({ node_id: 'I_acme5', number: 5, title: 'Anvils rust', state: 'closed' })); process.exit(0); }\nconsole.error('gh: HTTP 404: Not Found'); process.exit(1);\n`, { mode: 0o755 });
  cli(w, ['connect'], { PLATES_GH: gh });
  const r = cli(w, ['sync'], { PLATES_GH: gh });
  assert.equal(r.code, 0, JSON.stringify(r.data));
  assert.deepEqual(r.data.adopted, [{ key: 'issue:I_acme5', item: 1 }]);
  assert.deepEqual(r.data.applied.map(a => [a.op, a.item]), [['close', 1]]);
  assert.equal((await w.state()).items.length, 1);
});

test('an add that timed out but landed is not added again: the next sync waits, then adopts it', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')], items: [], next: 1 }, { phases: { '2-acme-counts-anvils.md': { status: 'planned', title: 'Acme counts anvils' } } });
  cli(w, ['connect']);
  await w.setState({ delayedCommit: true, hiddenLists: 2 });
  assert.equal(cli(w, ['sync']).code, 1);
  assert.equal((await mapOf(w)).pendingCreates['phase:acme/tools:2'].title, 'Phase 2: Acme counts anvils');
  // The item has not shown yet: the second sync waits rather than adding again.
  const second = cli(w, ['sync']);
  assert.deepEqual([second.data.applied, second.data.waiting.map(x => x.key)], [[], ['phase:acme/tools:2']]);
  assert.match(cli(w, ['status'], {}).data.plan.waiting[0].key, /phase:acme\/tools:2/);
  // It shows: adopted by its line, and the pending clears. One item in all.
  const third = cli(w, ['sync']);
  assert.deepEqual(third.data.adopted, [{ key: 'phase:acme/tools:2', item: 1 }]);
  const map = await mapOf(w);
  assert.deepEqual([map.entries['phase:acme/tools:2'].item, map.pendingCreates], [1, undefined]);
  assert.equal((await w.state()).items.length, 1);
});

test('the writer lock: eight contenders over a dead holder make exactly one owner, and only the owner releases', async t => {
  const w = await world(t, {});
  const { createMapStore } = await import('../lib/unison.mjs');
  const store = await createMapStore({ root: w.plate, env: w.env });
  await store.write({ schema: 1, workspace: null, repo: 'acme/tools', entries: {} });
  const lock = join(w.plate, '.plates/unison/writer.lock');
  const dead = run(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']).stdout;
  await writeFile(lock, `${dead}:${Date.now()}:acmedead`, { mode: 0o600 });
  let inside = 0, most = 0;
  const work = async () => { inside++; most = Math.max(most, inside); await new Promise(done => setTimeout(done, 400)); inside--; return 'acme'; };
  const results = await Promise.all(Array.from({ length: 8 }, async () => (await createMapStore({ root: w.plate, env: w.env })).withLock(work, { waitMs: 150 })));
  assert.equal(results.filter(r => r.ran).length, 1);
  assert.equal(most, 1);
  // A release by someone who is no longer the owner leaves the new owner's lock in place.
  const other = `${process.pid}:${Date.now()}:acmeother`;
  await store.withLock(async () => { await writeFile(lock, other); });
  assert.equal(await readFile(lock, 'utf8'), other);
});

test('a workspace create whose answer was lost is waited for, not made twice', async t => {
  const w = await world(t, { workspaces: [], delayedWorkspace: true, hiddenWsLists: 1 });
  let r = cli(w, ['connect']);
  assert.equal(r.code, 1);
  assert.equal((await mapOf(w)).pendingWorkspace.repo, 'acme/tools');
  // It has not listed yet: the second connect waits instead of creating another.
  r = cli(w, ['connect']);
  assert.deepEqual([r.code, r.data.created, r.data.waiting.repo], [1, false, 'acme/tools']);
  // It lists: adopted, the pending cleared, one workspace in all.
  r = cli(w, ['connect']);
  assert.deepEqual([r.code, r.data.created, r.data.workspace.id], [0, false, 'ws_acme1']);
  assert.equal((await mapOf(w)).pendingWorkspace, undefined);
  assert.equal((await w.state()).workspaces.length, 1);
  assert.deepEqual(mutating(await w.calls()).map(c => c.argv[1]), ['create']);
  // Past 15 minutes with nothing listing the repo, connect creates again.
  const v = await world(t, {});
  const { createMapStore } = await import('../lib/unison.mjs');
  await (await createMapStore({ root: v.plate, env: v.env })).write({ schema: 1, workspace: null, repo: 'acme/tools', entries: {}, pendingWorkspace: { repo: 'acme/tools', name: 'Acme Tools', at: new Date(Date.now() - 16 * 60_000).toISOString() } });
  r = cli(v, ['connect']);
  assert.deepEqual([r.code, r.data.created], [0, true]);
});

test('connect joins the workspace once as the account, and the session stays outside the checkout', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')], displayName: 'Wile E. Coyote' });
  let r = cli(w, ['connect']);
  assert.deepEqual([r.code, r.data.joined], [0, true], JSON.stringify(r.data));
  const file = join(w.root, '.config/plates/unison/127.0.0.1_4600/ws_acme1.json');
  assert.equal(r.data.sessionDir, dirname(file));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await stat(dirname(file))).mode & 0o777, 0o700);
  assert.ok(!file.startsWith(w.plate));
  const joins = (await w.calls()).filter(c => c.argv[0] === 'join');
  assert.deepEqual(joins.map(c => c.argv.slice(1, 5)), [['http://127.0.0.1:4600/w/ws_acme1', '--account', '--name', 'Wile']]);
  // No token in what plates prints, and nothing of the session inside the checkout.
  assert.doesNotMatch(JSON.stringify(r.data), /acmetok_/);
  assert.doesNotMatch(execFileSync('git', ['status', '--porcelain', '-uall', '--ignored'], { cwd: w.plate, encoding: 'utf8' }), /ws_acme1\.json/);
  // Again: the session is reused, no second join.
  r = cli(w, ['connect']);
  assert.deepEqual([r.code, r.data.joined], [0, false]);
  assert.equal((await w.calls()).filter(c => c.argv[0] === 'join').length, 1);
  // Honours XDG_CONFIG_HOME.
  const v = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')] });
  cli(v, ['connect'], { XDG_CONFIG_HOME: join(v.root, 'xdg') });
  assert.equal((await stat(join(v.root, 'xdg/plates/unison/127.0.0.1_4600/ws_acme1.json'))).mode & 0o777, 0o600);
});

test('writes carry the participant session; without it nothing is written and connect is the hint', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')], items: [], next: 1 }, { phases: { '2-acme-counts-anvils.md': { status: 'planned', title: 'Acme counts anvils' } } });
  cli(w, ['connect']);
  const file = join(w.root, '.config/plates/unison/127.0.0.1_4600/ws_acme1.json');
  let r = cli(w, ['sync']);
  assert.deepEqual(r.data.applied.map(a => a.op), ['create']);
  const add = (await w.calls()).find(c => c.argv[1] === 'add');
  assert.equal(add.config, file);
  // Reads and account calls do not pass it.
  assert.ok((await w.calls()).filter(c => c.argv[0] === 'workspace').every(c => c.config === undefined));
  // The session gone: refused before any write, nothing pending.
  await rm(file);
  await writeFile(join(w.plate, 'docs/phases/3-acme-ships.md'), (await readFile(join(w.plate, 'docs/phases/2-acme-counts-anvils.md'), 'utf8')).replace('# Acme counts anvils', '# Acme ships'));
  const before = (await w.calls()).length;
  r = cli(w, ['sync']);
  assert.deepEqual([r.code, r.data.hint], [1, 'plates unison connect']);
  assert.equal((await w.calls()).slice(before).filter(c => c.argv[1] === 'add').length, 0);
  // A session the server no longer knows (not joined): exit 1, the hint, and no pendingCreate holding.
  await writeFile(file, JSON.stringify({ server: 'http://127.0.0.1:4600', workspace: 'ws_acme1', token: 'acmetok_stale' }), { mode: 0o600 });
  r = cli(w, ['sync']);
  assert.deepEqual([r.code, r.data.hint], [1, 'plates unison connect']);
  assert.equal((await mapOf(w)).pendingCreates, undefined);
});

test('a definite refusal clears the pending create or workspace; only an uncertain failure holds', async t => {
  const w = await world(t, { workspaces: [workspace('ws_acme1', 'https://github.com/acme/tools')], items: [], next: 1 }, { phases: { '2-acme-counts-anvils.md': { status: 'planned', title: 'Acme counts anvils' } } });
  cli(w, ['connect']);
  await w.setState({ failAdd: true });
  assert.equal(cli(w, ['sync']).code, 1);
  assert.equal((await mapOf(w)).pendingCreates, undefined);
  // The next sync adds at once, no 15-minute wait.
  await w.setState({ failAdd: false });
  assert.deepEqual(cli(w, ['sync']).data.applied.map(a => a.op), ['create']);
  // A refused workspace create clears pendingWorkspace too.
  const v = await world(t, { workspaces: [], failCreate: true });
  assert.equal(cli(v, ['connect']).code, 1);
  await assert.rejects(mapOf(v).then(m => { if (!m.pendingWorkspace) throw new Error('none'); }));
  await v.setState({ failCreate: false });
  assert.deepEqual([cli(v, ['connect']).data.created], [true]);
});
