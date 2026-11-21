// Plates phase 200: the link line, the map and the plan, against a stub `unison`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeRepo, parseLink, escapeCopied, writeBody, planSync, phaseSources, issueSources, readMap, mapAfter, phaseUrl, issueUrl } from '../lib/unison-link.mjs';
import { unisonCommand, callUnison, findWorkspace } from '../lib/unison.mjs';
import { collect } from '../practices/phases/files/scripts/roadmap.mjs';
import { world, workspace } from './helpers/unison-stub.mjs';

const REPOS = ['acme/tools'];
const P = file => phaseUrl('acme/tools', file);
const run = async (w, sub) => unisonCommand({ args: sub ? [sub] : [], root: w.plate, config: JSON.parse(await readFile(join(w.plate, '.plates/plates.json'), 'utf8')), env: w.env, readPhases: async () => (await collect(w.plate)).phases });

test('a repo is one key however its URL is written', () => {
  for (const url of ['acme/tools', 'Acme/Tools', 'https://github.com/acme/tools', 'http://github.com/Acme/tools', 'https://www.github.com/acme/tools/', 'https://github.com/acme/tools.git', 'git@github.com:acme/tools.git', 'http://github.com/acme/tools.git/'])
    assert.equal(normalizeRepo(url), 'acme/tools', url);
  for (const url of ['https://gitlab.com/acme/tools', 'acme', 'https://github.com/acme', 'ftp://github.com/acme/tools', 'https://user:pw@github.com/acme/tools', 'acme/tools/extra', null])
    assert.equal(normalizeRepo(url), null, String(url));
  const list = [workspace('ws_a', 'http://github.com/Acme/Tools'), workspace('ws_b', 'https://github.com/acme/anvils')];
  assert.equal(findWorkspace(list, 'acme/tools').workspace.id, 'ws_a');
  assert.deepEqual(findWorkspace([...list, workspace('ws_c', 'https://www.github.com/acme/tools.git')], 'acme/tools').ambiguous, ['ws_a', 'ws_c']);
  assert.equal(findWorkspace(list, 'acme/forge').none, true);
});

test("only the link line links, and only to the workspace's repos", () => {
  const phase = P('2-acme-counts-anvils.md');
  assert.deepEqual(parseLink(`Notes\nPhase: ${phase}`, REPOS), { kind: 'phase', repo: 'acme/tools', file: '2-acme-counts-anvils.md', id: 2, url: phase });
  assert.deepEqual(parseLink('Issue: https://github.com/Acme/Tools/issues/12', REPOS), { kind: 'issue', repo: 'acme/tools', number: 12, url: 'https://github.com/Acme/Tools/issues/12' });
  // Not at a line start, in prose, as a Markdown link, or another repo's: prose.
  for (const body of [
    `See ${phase}`,
    ` Phase: ${phase}`,
    `> Phase: ${phase}`,
    `Phase: [2](${phase})`,
    `phase: ${phase}`,
    `Source: ${issueUrl('acme/tools', 12)}`,
    'Issue: https://github.com/acme/other/issues/12',
    'Phase: https://github.com/acme/other/blob/main/docs/phases/2-x.md',
    'Issue: https://github.com/acme/tools/pull/12',
    'Issue: https://github.com/acme/tools/issues/12#comment',
    'Phase: https://example.com/acme/tools/blob/main/docs/phases/2-x.md',
    `\\Phase: ${phase}`,
  ]) assert.equal(parseLink(body, REPOS), null, body);
  // The first link line naming a workspace repo counts; another repo's line before it does not.
  assert.equal(parseLink(`Issue: https://github.com/acme/other/issues/1\nPhase: ${phase}\nIssue: ${issueUrl('acme/tools', 3)}`, REPOS).kind, 'phase');
  assert.equal(parseLink(`Issue: ${issueUrl('acme/tools', 3)}\nPhase: ${phase}`, REPOS).number, 3);
  // A repo listed by a workspace in any spelling is that repo.
  assert.equal(parseLink(`Phase: ${phase}`, ['http://github.com/Acme/tools.git']).id, 2);
});

test("copied text cannot name the item's link", () => {
  const own = { kind: 'phase', url: P('3-acme-orders-anvils.md') };
  const copied = `Done when: it works.\nPhase: ${P('2-acme-counts-anvils.md')}\nIssue: ${issueUrl('acme/tools', 9)}\n\\Phase: already escaped`;
  const body = writeBody(copied, own);
  assert.equal(parseLink(body, REPOS).id, 3);
  assert.equal(body.split('\n').at(-1), `Phase: ${own.url}`);
  assert.match(body, /^\\Phase: https/m);
  assert.match(body, /^\\Issue: https/m);
  assert.match(body, /^\\\\Phase: already escaped$/m);
  // Escaping is one backslash more, so the copy reads back exactly.
  assert.equal(escapeCopied(copied).split('\n').map(l => l.replace(/^\\(\\*(?:Phase|Issue):)/, '$1')).join('\n'), copied);
  // An issue item gets its own line only.
  assert.equal(writeBody('', { kind: 'issue', url: issueUrl('acme/tools', 4) }), `Issue: ${issueUrl('acme/tools', 4)}`);
});

const phases = [
  { id: 1, file: '1-a.md', title: 'A', status: 'built' },
  { id: 2, file: '2-b.md', title: 'B', status: 'planned' },
  { id: 3, file: '3-c.md', title: 'C', status: 'partial' },
  { id: 4, file: '4-d.md', title: 'D', status: 'superseded' },
];
const item = (id, source, extra = {}) => ({ id, title: source ? `Phase ${source}: ${'ABCD'[source - 1]}` : 'Hand-made', body: source ? `Text\n\nPhase: ${P(`${source}-${'abcd'[source - 1]}.md`)}` : 'No link', status: 'open', ...extra });

test('the plan never makes a second item for one source', () => {
  const sources = phaseSources(phases, 'acme/tools');
  // Nothing yet: one item per open phase, none for built or superseded.
  let plan = planSync({ items: [], sources, map: readMap(null), repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions.map(a => [a.op, a.key]), [['create', 'phase:acme/tools:2'], ['create', 'phase:acme/tools:3']]);
  assert.equal(parseLink(plan.actions[0].body, REPOS).id, 2);
  // A hand-made item with phase 2's line is linked (taken into the map), not duplicated.
  plan = planSync({ items: [item(7, 2), item(8, null)], sources, map: readMap(null), repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.adopt, [{ key: 'phase:acme/tools:2', item: 7 }]);
  assert.deepEqual(plan.actions.map(a => [a.op, a.key]), [['create', 'phase:acme/tools:3']]);
  // A second line for a held source is a suggestion, never an action.
  const map = readMap({ schema: 1, workspace: 'ws_acme1', repo: 'acme/tools', entries: { 'phase:acme/tools:2': { item: 7, closedBySync: false }, 'phase:acme/tools:3': { item: 9, closedBySync: false } } });
  plan = planSync({ items: [item(7, 2), item(9, 3), item(10, 2)], sources, map, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.suggestions, [{ kind: 'duplicate', key: 'phase:acme/tools:2', item: 10 }]);
  // A rename retitles; it never makes another item.
  plan = planSync({ items: [item(7, 2), item(9, 3, { title: 'Phase 3: Old name' })], sources, map, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions, [{ op: 'retitle', key: 'phase:acme/tools:3', item: 9, title: 'Phase 3: C' }]);
  // Its line removed by hand: unlinked, left alone, and not made again.
  plan = planSync({ items: [item(7, 2), { ...item(9, 3), body: 'edited by hand' }], sources, map, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.unlinked, [{ key: 'phase:acme/tools:3', item: 9, why: 'lost-line' }]);
  assert.equal(plan.stopped, null);
  // Its item deleted: still not made again.
  plan = planSync({ items: [item(7, 2)], sources, map, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.unlinked, [{ key: 'phase:acme/tools:3', item: 9, why: 'gone' }]);
  // The map is not rebuilt from lines while a mapped item lacks its line: the plan stops whole.
  const partial = readMap({ schema: 1, workspace: 'ws_acme1', repo: 'acme/tools', entries: { 'phase:acme/tools:3': { item: 9, closedBySync: false } } });
  plan = planSync({ items: [item(7, 2), { ...item(9, 3), body: 'edited by hand' }], sources, map: partial, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.stopped, { reason: 'lost-lines', items: [9] });
  assert.deepEqual([plan.actions, plan.adopt], [[], []]);
  // Two hand-made lines for one source: the older is linked, the other suggested.
  plan = planSync({ items: [item(12, 2), item(11, 2)], sources, map: readMap(null), repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.adopt, [{ key: 'phase:acme/tools:2', item: 11 }]);
  assert.deepEqual(plan.suggestions, [{ kind: 'duplicate', key: 'phase:acme/tools:2', item: 12 }]);
  // Issues key by node id: the item's line resolves through the issue it names.
  const issues = issueSources([{ node_id: 'I_acme9', number: 9, title: 'Anvils rust', state: 'OPEN', repo: 'acme/tools' }]);
  plan = planSync({ items: [{ id: 20, title: 'x', body: `Issue: ${issueUrl('Acme/Tools', 9)}`, status: 'open' }], sources: issues, map: readMap(null), repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.adopt, [{ key: 'issue:I_acme9', item: 20 }]);
  assert.deepEqual(plan.actions, [{ op: 'retitle', key: 'issue:I_acme9', item: 20, title: 'Issue #9: Anvils rust' }]);
  assert.throws(() => readMap({ schema: 1, entries: { 'phase:acme/tools:2': { item: 'seven', closedBySync: false } } }));
});

test('plates closes and reopens only what it closed', () => {
  const sources = phaseSources([{ id: 2, file: '2-b.md', title: 'B', status: 'built' }, { id: 3, file: '3-c.md', title: 'C', status: 'planned' }], 'acme/tools');
  let map = readMap({ schema: 1, workspace: 'ws_acme1', repo: 'acme/tools', entries: { 'phase:acme/tools:2': { item: 7, closedBySync: false }, 'phase:acme/tools:3': { item: 9, closedBySync: false } } });
  // A built phase closes its item, with a note, and the map records that sync closed it.
  let plan = planSync({ items: [item(7, 2), item(9, 3)], sources, map, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions, [{ op: 'close', key: 'phase:acme/tools:2', item: 7, note: 'plates: phase 2 is built' }]);
  map = mapAfter(map, plan.actions[0], 7);
  assert.equal(map.entries['phase:acme/tools:2'].closedBySync, true);
  // The phase reopened (partial again): sync reopens the item it closed.
  const reopened = phaseSources([{ id: 2, file: '2-b.md', title: 'B', status: 'partial' }, { id: 3, file: '3-c.md', title: 'C', status: 'planned' }], 'acme/tools');
  plan = planSync({ items: [item(7, 2, { status: 'done' }), item(9, 3)], sources: reopened, map, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions, [{ op: 'reopen', key: 'phase:acme/tools:2', item: 7 }]);
  assert.equal(mapAfter(map, plan.actions[0], 7).entries['phase:acme/tools:2'].closedBySync, false);
  // An item a person or agent closed while its phase is open: a suggestion, never a reopen or a build.
  plan = planSync({ items: [item(7, 2), item(9, 3, { status: 'done' })], sources: reopened, map, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.suggestions, [{ kind: 'closed-by-hand', key: 'phase:acme/tools:3', item: 9 }]);
  // Closed in Unison and built: nothing to do.
  plan = planSync({ items: [item(7, 2, { status: 'done' }), item(9, 3)], sources, map, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions, []);
  // A closed issue closes its item too.
  const closed = issueSources([{ node_id: 'I_acme9', number: 9, title: 'Anvils rust', state: 'CLOSED', repo: 'acme/tools' }]);
  plan = planSync({ items: [{ id: 20, title: 'Issue #9: Anvils rust', body: `Issue: ${issueUrl('acme/tools', 9)}`, status: 'in_progress' }], sources: closed, map: readMap({ schema: 1, entries: { 'issue:I_acme9': { item: 20, closedBySync: false } } }), repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions, [{ op: 'close', key: 'issue:I_acme9', item: 20, note: 'plates: issue #9 is closed' }]);
});

test('Unison not read is never an empty backlog', async t => {
  const ok = { workspaces: [workspace('ws_acme1', 'http://github.com/Acme/Tools')], items: [] };
  // Read: an empty backlog plans one item per open phase.
  const w = await world(t, ok);
  let r = await run(w, 'status');
  assert.equal(r.exitCode ?? 0, 0, r.text);
  assert.equal(r.data.read, true);
  assert.deepEqual(r.data.plan.counts, { create: 2, retitle: 0, relink: 0, close: 0, reopen: 0 });
  // Fails, not JSON, answers without its array: not read, no plan, exit 1.
  for (const mode of ['fail', 'not-json', 'no-array']) {
    await w.setState({ mode });
    r = await run(w, 'status');
    assert.equal(r.exitCode, 1, mode);
    assert.equal(r.data.read, false, mode);
    assert.equal(r.data.plan, null, mode);
    assert.match(r.text, /^Unison not read: /, mode);
  }
  // The workspace read but its backlog answering without its array: still not read.
  await w.setState({ mode: 'backlog-no-array' });
  r = await run(w, 'status');
  assert.deepEqual([r.exitCode, r.data.read, r.data.plan, r.data.workspace.id], [1, false, null, 'ws_acme1']);
  await w.setState({ mode: 'ok' });
  // Missing binary: not on PATH.
  r = await unisonCommand({ args: ['status'], root: w.plate, config: { name: 'Acme Tools', repo: 'acme/tools' }, env: { ...w.env, PATH: w.systemPath }, readPhases: async () => [] });
  assert.equal(r.data.read, false);
  assert.equal(r.data.plan, null);
  assert.match(r.data.why, /not on PATH/);
  // Not signed in: not read, with the sign-in card.
  await w.setState({ signedIn: false });
  r = await run(w, 'status');
  assert.equal(r.data.read, false);
  assert.equal(r.data.signIn.command, 'unison login');
  // Slow: not read within the call's bound.
  await w.setState({ signedIn: true, mode: 'slow' });
  const slow = await callUnison(['workspace', 'list'], { env: w.env, server: 'http://127.0.0.1:4600', timeout: 300 });
  assert.deepEqual([slow.ok, slow.code], [false, 'timeout']);
  // Status changed nothing remote and wrote no map.
  assert.ok((await w.calls()).every(c => ['list', undefined, '--workspace'].includes(c.argv[1]) && !['add', 'edit', 'close', 'reopen', 'create'].includes(c.argv[1])));
  await assert.rejects(readFile(join(w.plate, '.plates/unison/map.json')));
});

test("another repo's phase with the same number is never this plate's", () => {
  const repos = ['acme/tools', 'acme/anvils'];
  const tools = phaseSources([{ id: 2, file: '2-b.md', title: 'B', status: 'built' }], 'acme/tools');
  const anvils = { id: 30, title: 'Phase 2: Anvils B', body: `Phase: ${phaseUrl('acme/anvils', '2-b.md')}`, status: 'open' };
  // Unmapped: acme/anvils' phase 2 item is neither adopted nor closed by acme/tools' built phase 2.
  let plan = planSync({ items: [anvils], sources: tools, map: readMap(null), repos, repo: 'acme/tools' });
  assert.deepEqual([plan.adopt, plan.actions], [[], []]);
  // Mapped to this plate's own item: only that item closes.
  const own = { id: 31, title: 'Phase 2: B', body: `Phase: ${phaseUrl('acme/tools', '2-b.md')}`, status: 'open' };
  plan = planSync({ items: [anvils, own], sources: tools, map: readMap(null), repos, repo: 'acme/tools' });
  assert.deepEqual(plan.adopt, [{ key: 'phase:acme/tools:2', item: 31 }]);
  assert.deepEqual(plan.actions.map(a => [a.op, a.item]), [['close', 31]]);
  // An old map's phase:<n> keys are the map's own repo's.
  assert.deepEqual(Object.keys(readMap({ schema: 1, repo: 'acme/tools', entries: { 'phase:2': { item: 31, closedBySync: false } } }).entries), ['phase:acme/tools:2']);
});

test('a malformed escape in a link line is prose, not a failed plan', () => {
  const body = 'Phase: https://github.com/acme/tools/blob/main/docs/phases/2-%ZZ.md';
  assert.equal(parseLink(body, REPOS), null);
  const plan = planSync({ items: [{ id: 5, title: 'x', body, status: 'open' }], sources: phaseSources(phases, 'acme/tools'), map: readMap(null), repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions.map(a => a.key), ['phase:acme/tools:2', 'phase:acme/tools:3']);
});

test('a close sync sent but never recorded is settled by the item and its close note', () => {
  const sources = phaseSources([{ id: 2, file: '2-b.md', title: 'B', status: 'built' }, { id: 3, file: '3-c.md', title: 'C', status: 'planned' }], 'acme/tools');
  const map = readMap({ schema: 1, repo: 'acme/tools', entries: {
    'phase:acme/tools:2': { item: 7, closedBySync: false, pendingClose: 'plates: phase 2 is built' },
    'phase:acme/tools:3': { item: 9, closedBySync: false, pendingClose: 'plates: phase 3 is built' } } });
  // Item 7 is done with sync's note: sync closed it. Item 9 is done with someone else's note: they did.
  const plan = planSync({ items: [item(7, 2, { status: 'done', close_note: 'plates: phase 2 is built' }), item(9, 3, { status: 'done', close_note: 'shipped by hand' })], sources, map, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.settled, [{ key: 'phase:acme/tools:2', closedBySync: true }, { key: 'phase:acme/tools:3', closedBySync: false }]);
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.suggestions, [{ kind: 'closed-by-hand', key: 'phase:acme/tools:3', item: 9 }]);
  const after = plan.settled.reduce((m, x) => mapAfter(m, { op: 'settle', ...x }), map);
  assert.deepEqual(after.entries['phase:acme/tools:2'], { item: 7, closedBySync: true });
});

test("a renamed phase file updates only its item's link line", () => {
  const old = { id: 7, title: 'Phase 2: B', body: `The owner's notes.\nPhase: ${P('2-old.md')}\nMore notes.`, status: 'open' };
  const map = readMap({ schema: 1, repo: 'acme/tools', entries: { 'phase:acme/tools:2': { item: 7, closedBySync: false } } });
  const sources = phaseSources([{ id: 2, file: '2-renamed.md', title: 'B', status: 'planned' }], 'acme/tools');
  const plan = planSync({ items: [old], sources, map, repos: REPOS, repo: 'acme/tools' });
  assert.deepEqual(plan.actions, [{ op: 'relink', key: 'phase:acme/tools:2', item: 7, body: `The owner's notes.\nPhase: ${P('2-renamed.md')}\nMore notes.` }]);
  // Brought current, nothing more to do.
  assert.deepEqual(planSync({ items: [{ ...old, body: plan.actions[0].body }], sources, map, repos: REPOS, repo: 'acme/tools' }).actions, []);
});
