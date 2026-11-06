// Backlog events (plates phase 184): what happened to each item, append-only and
// metadata only. One Acme checkout on this disk and a PGlite stand-in for the
// hosted store; no network, no agent process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { backlogEvent, storedEvent, createBacklogEventStore, recordBacklogEvent, readBacklogEvents, eventsReadout, eventsText, withEvents, notNowReason, BACKLOG_ACTIONS, EVENTS_DIR } from '../lib/backlog-events.mjs';
import { createBacklogEventStore as hostedStore } from '../lib/web/backlog-events-store.mjs';
import { createHomeAnswers } from '../lib/web/home-answers.mjs';
import { homeAnswer } from '../lib/home-answer.mjs';
import { attach } from '../lib/attach.mjs';
import { run } from './helpers/run.mjs';

const BIN = fileURLToPath(new URL('../bin/plates.mjs', import.meta.url));
const MIGRATIONS = new URL('../lib/web/migrations/', import.meta.url);
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const CONFIG = { name: 'Acme', repo: 'acme/app', practices: ['phases'], agents: { claude: {} } };
const KEY = 'app:phase:1';
// The owner's words: long, and nothing an event may hold.
const REASON = 'Waiting on the Acme anvil vendor to confirm the drop height, which they promised by the end of the quarter, and I do not want to walk it twice before then'.slice(0, 300);
const TITLE = 'Build the Acme anvil';

async function acme(t) {
  const dir = await mkdtemp(join(tmpdir(), 'plates-events-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const w = async (p, text) => { await mkdir(dirname(join(dir, p)), { recursive: true }); await writeFile(join(dir, p), text); };
  await w('.plates/plates.json', JSON.stringify(CONFIG));
  await w('docs/goals.json', JSON.stringify([{ id: 'G0', title: 'Anvils', outcome: 'They land.' }]));
  await w('docs/phases/01-anvil.md', `---\nstatus: planned\nsince: 2026-10-01\ngoal: G0\nspec: 2\ndepends: []\nnote: "Acme."\nevidence: []\n---\n\n# ${TITLE}\n\n## Done when\n\nIt lands.\n\n## Scope\n\nSmall.\n\n## Acceptance\n\n- [ ] Lands.\n\n## Proof\n\nA command.\n\n## Deliberately open\n\nNothing.\n\n## Next action\n\nBuild it.\n`);
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  git(dir, 'add', '-A'); git(dir, '-c', 'user.name=Acme', '-c', 'user.email=a@acme.test', 'commit', '-q', '-m', 'acme');
  return dir;
}
/** Every window of `size` characters of `text`: none may appear in an event's bytes. */
const windows = (text, size = 12) => Array.from({ length: Math.max(1, text.length - size + 1) }, (_, i) => text.slice(i, i + size)).filter(w => w.trim().length === size);
const storedBytes = async root => { const dir = join(root, EVENTS_DIR); return (await Promise.all((await readdir(dir)).filter(n => n.endsWith('.json')).map(n => readFile(join(dir, n), 'utf8')))).join('\n'); };

async function hostedDb() {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const file of (await readdir(MIGRATIONS)).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file, MIGRATIONS), 'utf8'));
  return db;
}
const CONFIG_WEB = { appId: 1, installationId: 2, workspace: { id: 'acme', repoId: 3 }, storageUrl: 'https://store.acme.test', storageKey: 'acme-key' };
/** A fetcher that answers plates_backlog_events_rpc from PGlite as service_role, and records each body it was sent. */
const pgFetcher = (db, sent) => async (url, options) => {
  const body = JSON.parse(options.body); sent.push(body);
  if (!url.endsWith('/rest/v1/rpc/plates_backlog_events_rpc')) return new Response('{}', { status: 404 });
  await db.exec('SET ROLE service_role');
  try { return Response.json((await db.query('SELECT public.plates_backlog_events_rpc($1,$2,$3,$4) v', [body.p_operation, body.p_scope, body.p_event, body.p_since])).rows[0].v); }
  catch (error) { return Response.json({ message: error.message }, { status: 400 }); }
  finally { await db.exec('RESET ROLE'); }
};

test('metadata only', async t => {
  // The record is its fields and nothing else; each string is a short code, so a sentence does not fit.
  const e = backlogEvent({ actor: 'owner', key: KEY, action: 'not-now', reason: 'stated', takes: 5, outcome: 'not-now' }, { now: Date.parse('2026-11-06T09:00:00Z') });
  assert.deepEqual(Object.keys(e), ['schema', 'id', 'at', 'actor', 'key', 'action', 'reason', 'route', 'lane', 'position', 'takes', 'outcome', 'receipt']);
  assert.deepEqual(storedEvent(e), e);
  for (const [input, code] of [
    [{ actor: 'owner', key: KEY, action: 'not-now', reason: REASON }, 'invalid_reason'],
    [{ actor: 'owner', key: KEY, action: 'not-now', why: REASON }, 'unknown_field'],
    [{ actor: 'owner', key: KEY, action: 'answer', title: TITLE }, 'unknown_field'],
    [{ actor: 'owner', key: KEY, action: 'answer', outcome: REASON }, 'invalid_outcome'],
    [{ actor: 'owner', key: `app:phase:${REASON}`, action: 'answer' }, 'invalid_key'],
    [{ actor: 'the owner, who was busy', key: KEY, action: 'answer' }, 'invalid_actor'],
    [{ actor: 'owner', key: KEY, action: 'answer', reason: 'stated' }, 'invalid_reason'],
    [{ actor: 'owner', key: KEY, action: 'comment' }, 'invalid_action'],
    [{ actor: 'owner', key: KEY, action: 'answer', receipt: 'https://acme.test/?q=words' }, 'invalid_receipt'],
  ]) assert.throws(() => backlogEvent(input), { code }, code);
  assert.deepEqual([notNowReason(REASON), notNowReason('  '), notNowReason(undefined)], ['stated', 'none', 'none']);
  assert.equal(storedEvent({ ...e, note: REASON }), null, 'a stored record with any other field is not an event');

  // A Not now from the terminal with the owner's long reason: put off, and its event holds the code, never the words or the title.
  const root = await acme(t), state = await mkdtemp(join(tmpdir(), 'plates-events-state-'));
  t.after(() => rm(state, { recursive: true, force: true }));
  const item = { key: KEY, title: TITLE, why: REASON, details: { takes: 'About 5 minutes' }, answers: [{ id: 'not-now', label: 'Not now', writer: 'not now', needsWhy: 'never' }] };
  const answered = await homeAnswer({ root, key: KEY, answerId: 'not-now', why: REASON, until: '2026-12-01', yes: true },
    { env: { ...process.env, XDG_STATE_HOME: state, PLATES_GH: '/nonexistent' }, now: () => Date.parse('2026-11-06T09:00:00Z'), home: async () => ({ decisions: [item], projects: [] }) });
  assert.deepEqual([answered.exitCode, answered.data.state, answered.data.eventNote], [0, 'written', undefined]);
  const bytes = await storedBytes(root);
  for (const w of [...windows(REASON), ...windows(TITLE)]) assert.ok(!bytes.includes(w), `the event holds "${w}"`);
  const [stored] = await (await createBacklogEventStore({ root })).list();
  assert.deepEqual([stored.action, stored.reason, stored.actor, stored.key, stored.takes, stored.outcome], ['not-now', 'stated', 'owner', KEY, 5, 'not-now']);
  assert.ok((await readFile(join(state, 'plates', 'snoozed.json'), 'utf8')).includes(REASON), 'the words stay in the owner\'s own Not now record');
  // The private modes feedback-store uses, and Git never sees it.
  assert.equal((await stat(join(root, EVENTS_DIR))).mode & 0o777, 0o700);
  for (const n of await readdir(join(root, EVENTS_DIR))) assert.equal((await stat(join(root, EVENTS_DIR, n))).mode & 0o777, 0o600, n);
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '');

  // Hosted: the same answer on the web sends codes only, and SQL019 keeps codes only.
  const db = await hostedDb(), sent = [];
  t.after(() => db.close());
  const events = hostedStore(CONFIG_WEB, pgFetcher(db, sent), { once: { noted: false } });
  const answer = createHomeAnswers(CONFIG_WEB, { now: () => Date.parse('2026-11-06T09:00:00Z'), readHome: async () => ({ decisions: [item] }), events,
    notNow: { put: async (userId, key, { until, reason }) => ({ key, until, reason }) } });
  const written = await answer({ userId: 7, projects: [{ id: 'app' }] }, 'token', { key: KEY, answer: 'not-now', why: REASON, until: '2026-12-01' });
  assert.equal(written.state, 'written');
  for (const w of [...windows(REASON), ...windows(TITLE)]) assert.ok(!JSON.stringify(sent).includes(w), `the hosted request holds "${w}"`);
  const rows = (await db.query('SELECT * FROM plates_home.backlog_events')).rows;
  assert.equal(rows.length, 1);
  for (const w of [...windows(REASON), ...windows(TITLE)]) assert.ok(!JSON.stringify(rows).includes(w), `the hosted row holds "${w}"`);
  assert.deepEqual([rows[0].action, rows[0].reason, rows[0].key, rows[0].takes], ['not-now', 'stated', KEY, 5]);
  // The database refuses words too, whatever a caller sends.
  await db.exec('SET ROLE service_role');
  await assert.rejects(db.query('SELECT public.plates_backlog_events_rpc($1,$2,$3)', ['append', 'ab'.repeat(32), { actor: 'owner', key: KEY, action: 'not-now', reason: REASON }]), /invalid backlog event/);
  await assert.rejects(db.query('SELECT public.plates_backlog_events_rpc($1,$2,$3)', ['append', 'ab'.repeat(32), { actor: 'owner', key: KEY, action: 'answer', why: REASON }]), /invalid backlog event/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.exec("UPDATE plates_home.backlog_events SET lane = 'yours'"), /append-only/);
});

test('events refuse a tracked directory', async t => {
  const root = await acme(t);
  await mkdir(join(root, EVENTS_DIR), { recursive: true });
  await writeFile(join(root, EVENTS_DIR, 'README'), 'Acme\n');
  git(root, 'add', '-A'); git(root, '-c', 'user.name=Acme', '-c', 'user.email=a@acme.test', 'commit', '-q', '-m', 'tracked');
  await assert.rejects((await createBacklogEventStore({ root })).append({ actor: 'owner', key: KEY, action: 'answer' }), { code: 'tracked_private_store' });
  await assert.rejects((await createBacklogEventStore({ root })).list(), { code: 'tracked_private_store' });
  // Best effort: the note, never a throw, and nothing written.
  const r = await recordBacklogEvent(root, { actor: 'owner', key: KEY, action: 'answer' });
  assert.deepEqual(r, { event: null, note: 'backlog event not recorded: tracked_private_store' });
  assert.deepEqual(await readdir(join(root, EVENTS_DIR)), ['README']);
  // The action it records stands: an attach whose event cannot be written is still attached, with the note.
  const done = await attach({ root, projectId: 'app', phase: 1, title: TITLE, route: 'session', provider: 'claude', config: CONFIG, yes: true },
    { claim: async () => ({ data: { ok: true, claimed: true, sha: 'a'.repeat(40) } }), journal: { read: async () => null, write: async () => {} } });
  assert.deepEqual([done.exitCode, done.data.state, done.data.eventNote], [0, 'attached', 'backlog event not recorded: tracked_private_store']);
  // The CLI's read says it could not read them, never that nothing happened.
  const read = await readBacklogEvents([root]);
  assert.deepEqual(read.events, []);
  assert.match(read.note, /events not read in .*tracked_private_store/);
  // A store that is not ignored, or holds a file that is not an event, is refused too.
  const other = await acme(t);
  await mkdir(join(other, EVENTS_DIR), { recursive: true, mode: 0o700 });
  await assert.rejects((await createBacklogEventStore({ root: other })).list(), { code: 'unprotected_private_store' });
  const third = await acme(t);
  await (await createBacklogEventStore({ root: third })).append({ actor: 'owner', key: KEY, action: 'answer' });
  await writeFile(join(third, EVENTS_DIR, 'notes.txt'), REASON, { mode: 0o600 });
  await assert.rejects((await createBacklogEventStore({ root: third })).list(), { code: 'invalid_store' });
});

test('the hosted store is skipped, noted once, before 019', async () => {
  const warned = [], once = { noted: false };
  const missing = async () => new Response('{"message":"Could not find the function public.plates_backlog_events_rpc"}', { status: 404 });
  const store = hostedStore(CONFIG_WEB, missing, { warn: m => warned.push(m), once });
  for (let i = 0; i < 3; i++) assert.deepEqual((await store.record(7, { actor: 'owner', key: KEY, action: 'answer' })).event, null);
  assert.equal(warned.length, 1, 'one note, not one per action');
  assert.match(warned[0], /backlog events are not stored .*SQL019 stores them/);
  // A Not now on the web is still written.
  const answer = createHomeAnswers(CONFIG_WEB, { now: () => Date.parse('2026-11-06T09:00:00Z'), events: store,
    readHome: async () => ({ decisions: [{ key: KEY, answers: [{ id: 'not-now', writer: 'not now', needsWhy: 'never' }] }] }),
    notNow: { put: async (userId, key, { until }) => ({ key, until }) } });
  assert.equal((await answer({ userId: 7, projects: [{ id: 'app' }] }, 't', { key: KEY, answer: 'not-now', until: '2026-12-01' })).state, 'written');
  await assert.rejects(store.list(7), /upstream_unavailable|invalid_backlog_event_storage/, 'an unread store is never an empty one');
});

test('what happened since, read back', async t => {
  const db = await hostedDb();
  t.after(() => db.close());
  const store = hostedStore(CONFIG_WEB, pgFetcher(db, []), { once: { noted: false } });
  await store.record(7, { actor: 'agent:claude', key: KEY, action: 'attach', route: 'session', lane: 'agent-ready', outcome: 'attached', receipt: `attach:${'a'.repeat(64)}` });
  await store.record(7, { actor: 'owner', key: 'app:phase:2', action: 'answer', takes: 5, outcome: 'choice-1' });
  const listed = await store.list(7);
  assert.deepEqual(listed.map(e => [e.action, e.key]), [['attach', KEY], ['answer', 'app:phase:2']]);
  assert.deepEqual(await store.list(8), [], 'another owner sees none of them');
  assert.deepEqual(await store.list(7, '2099-01-01T00:00:00.000Z'), []);
  // The readout: routes that landed phases (phase 1 is in Recently done), owner minutes per week, never a guessed minute.
  const backlog = { lanes: [{ lane: 'done', items: [{ key: KEY }] }] };
  const more = [...listed, backlogEvent({ actor: 'owner', key: 'app:phase:3', action: 'not-now', reason: 'none' })];
  const r = eventsReadout(more, { since: '2026-01-01T00:00:00.000Z', backlog });
  assert.deepEqual(r.routes, [{ route: 'session', attached: 1, landed: 1 }]);
  assert.equal(r.actions.attach, 1);
  assert.deepEqual(Object.keys(r.actions), [...BACKLOG_ACTIONS]);
  assert.equal(r.weeks.reduce((n, w) => n + w.minutes, 0), 5);
  assert.equal(r.weeks.reduce((n, w) => n + w.unknown, 0), 1);
  assert.match(eventsText(r), /route session: 1 attached, 1 landed/);
  assert.match(eventsText(r), /at least 5 min|5 min/);

  // From the terminal: plates home --backlog --since prints them, and its JSON carries the readout.
  const root = await acme(t);
  await (await createBacklogEventStore({ root })).append({ actor: 'agent:claude', key: KEY, action: 'attach', route: 'session', lane: 'agent-ready', outcome: 'attached' });
  const cli = run(process.execPath, [BIN, 'home', '--backlog', '--since', '2026-01-01', '--json'], { cwd: root, env: { ...process.env, PLATES_GH: '/nonexistent', XDG_STATE_HOME: join(root, '.git', 'state') } });
  assert.equal(cli.status, 0, cli.stderr);
  const data = JSON.parse(cli.stdout);
  assert.equal(data.events.count, 1);
  assert.deepEqual(data.events.events.map(e => [e.action, e.key]), [['attach', KEY]]);
  const card = data.lanes.flatMap(l => l.items).find(i => i.key === KEY);
  assert.equal(card?.history?.last.action, 'attach');
  const text = run(process.execPath, [BIN, 'home', '--backlog', '--since', '2026-01-01'], { cwd: root, env: { ...process.env, PLATES_GH: '/nonexistent', XDG_STATE_HOME: join(root, '.git', 'state') } });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /What happened since 2026-01-01 \(1 event\)/);
  assert.equal(run(process.execPath, [BIN, 'home', '--since', '2026-01-01'], { cwd: root, env: { ...process.env, PLATES_GH: '/nonexistent' } }).status, 2, '--since goes with --backlog');
  assert.equal(run(process.execPath, [BIN, 'home', '--backlog', '--since', 'last week'], { cwd: root, env: { ...process.env, PLATES_GH: '/nonexistent' } }).status, 2);
  // No events: the backlog exactly as it was (tests/work-items.test.mjs "events never reorder" holds the order with them).
  const plain = { lanes: [{ lane: 'yours', items: [{ key: 'app:phase:2' }, { key: KEY }] }] };
  assert.deepEqual(withEvents(plain, []), plain);
});
