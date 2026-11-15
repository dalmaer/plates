// Sessions waiting on you: a plate's home session ("🏠 [plate] Home …") that ended on a question to the owner.
// The transcript reading, the snapshot a device pushes, Home's row in both forms, the hosted store (SQL022 on
// PGlite, through the service's own sealing), the push route and the CLI's push.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, utimes, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { parseSession, QUESTION_CHARS as LOOSE_QUESTION_CHARS } from '../lib/looseends.mjs';
import { homePlateOf, validSnapshot, waitingRows, runmeRows, scriptPlate, QUESTION_CHARS } from '../lib/waiting-sessions.mjs';
import { scanWaitingSessions, scanRunme } from '../lib/waiting-scan.mjs';
import { createHash } from 'node:crypto';
import { createWaitingStore } from '../lib/web/waiting-store.mjs';
import { push } from '../lib/sessions.mjs';
import { homeSnapshot, homeSections } from '../lib/work-items.mjs';
import { projectHarness } from './helpers/web-projects.mjs';

const L = value => JSON.stringify(value);
const at = minutes => new Date(Date.parse('2026-11-15T10:00:00Z') + minutes * 60_000).toISOString();
/** A transcript: a title, the owner's message, then the assistant's entries. */
const transcript = (id, title, ...assistant) => [
  ...(title ? [L({ type: 'custom-title', customTitle: 'An older title', sessionId: id }), L({ type: 'custom-title', customTitle: title, sessionId: id })] : []),
  L({ type: 'user', sessionId: id, timestamp: at(0), message: { role: 'user', content: 'Keep the Acme anvils moving' } }),
  ...assistant.map((content, i) => L({ type: content.type === 'tool_result' ? 'user' : 'assistant', sessionId: id, timestamp: at(i + 1), message: { role: content.type === 'tool_result' ? 'user' : 'assistant', content: [content] } })),
].join('\n');
const ask = question => ({ type: 'tool_use', id: 'ask1', name: 'AskUserQuestion', input: { questions: [{ question }] } });

test('a session is waiting only on a question still unanswered, and says what it asked', () => {
  const pending = parseSession(transcript('s1', '🏠 [acme] Home Remote Control', { type: 'text', text: 'Shaped it.' }, ask('Ship the Acme anvils on Monday?')), 'f');
  assert.deepEqual([pending.title, pending.ending, pending.question], ['🏠 [acme] Home Remote Control', 'question', 'Ship the Acme anvils on Monday?'], 'the last title wins');
  const answered = parseSession(transcript('s2', '🏠 [acme] Home', ask('Ship on Monday?'), { type: 'tool_result', tool_use_id: 'ask1', content: 'Yes' }, { type: 'text', text: 'Shipped.' }), 'f');
  assert.equal(answered.ending, 'done', 'a question answered earlier in the turn is not waiting');
  const said = parseSession(transcript('s3', null, { type: 'text', text: 'Built the Acme page.\n\nShould I deploy it now?' }), 'f');
  assert.deepEqual([said.ending, said.question, said.title], ['question', 'Should I deploy it now?', null], 'the last paragraph of text ending in a question');
  assert.equal(LOOSE_QUESTION_CHARS, QUESTION_CHARS, 'one bound in both modules');
  const long = parseSession(transcript('s4', null, { type: 'text', text: `${'a'.repeat(900)}?` }), 'f');
  assert.equal(long.question.length, QUESTION_CHARS);
  assert.equal(parseSession(transcript('s5', null, { type: 'text', text: 'Done.' }), 'f').question, null);
});

test('only a home session names its plate', () => {
  assert.equal(homePlateOf('🏠 [acme] Home Remote Control'), 'acme');
  assert.equal(homePlateOf('🏠 [Acme-Studio] Home Capture'), 'acme-studio');
  assert.equal(homePlateOf('🏠 [acme] Remote Control'), 'acme', 'as the desktop app keeps the title');
  for (const title of ['[acme] Home', '🏠 acme Home', '🏠 Remote Control', '🏠 [a/b] Home', null]) assert.equal(homePlateOf(title), null, String(title));
});

test('the scan lists this machine\'s waiting home sessions, oldest first, and nothing else', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-waiting-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const project = join(dir, 'projects', '-Users-acme-code-anvils');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'a.jsonl'), transcript('a', '🏠 [anvils] Home Remote Control', ask('Which anvil first?')));
  await writeFile(join(project, 'b.jsonl'), transcript('b', 'A side task', ask('Not a home session?')));
  await writeFile(join(project, 'c.jsonl'), transcript('c', '🏠 [forge] Home', { type: 'text', text: 'All done.' }));
  await writeFile(join(project, 'd.jsonl'), transcript('d', '🏠 [forge] Home', { type: 'text', text: 'Old news?' }));
  await utimes(join(project, 'd.jsonl'), new Date('2026-10-01'), new Date('2026-10-01'));
  const snap = await scanWaitingSessions({ env: { PLATES_CLAUDE_DIR: dir, RUNME_DIR: join(dir, 'no-queue') }, machine: 'Acme Mac', now: Date.parse('2026-11-15T12:00:00Z') });
  assert.deepEqual(snap.sessions, [{ id: 'a', plate: 'anvils', title: '🏠 [anvils] Home Remote Control', question: 'Which anvil first?', since: at(1) }]);
  assert.deepEqual(snap.scripts, []);
  assert.deepEqual(validSnapshot(snap), snap);
});

test('a scan that cannot read a transcript refuses, so a push never clears what it could not read', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-waiting-unread-'));
  t.after(async () => { await chmod(join(dir, 'projects', 'p'), 0o755).catch(() => {}); await rm(dir, { recursive: true, force: true }); });
  assert.deepEqual((await scanWaitingSessions({ env: { PLATES_CLAUDE_DIR: join(dir, 'none'), RUNME_DIR: join(dir, 'none') } })).sessions, [], 'no transcript directory is no sessions');
  await mkdir(join(dir, 'projects', 'p'), { recursive: true });
  await writeFile(join(dir, 'projects', 'p', 'a.jsonl'), transcript('a', '🏠 [anvils] Home', ask('Which?')));
  await chmod(join(dir, 'projects', 'p'), 0o000);
  if (process.getuid?.() === 0) return; // root reads through any mode
  await assert.rejects(scanWaitingSessions({ env: { PLATES_CLAUDE_DIR: dir, RUNME_DIR: join(dir, 'none') } }), /could not all be read \(EACCES\); nothing was sent/);
});

test('a pushed snapshot is untrusted: every field is checked', () => {
  const good = { schema: 1, machine: 'Acme Mac', scannedAt: at(5), sessions: [{ id: 'a', plate: 'anvils', title: '🏠 [anvils] Home', question: 'Which?', since: at(1) }] };
  assert.ok(validSnapshot(good));
  for (const bad of [{ ...good, extra: 1 }, { ...good, schema: 2 }, { ...good, machine: '<script>' },
    { ...good, sessions: [{ ...good.sessions[0], plate: 'forge' }] }, { ...good, sessions: [{ ...good.sessions[0], id: '../x' }] },
    { ...good, sessions: [{ ...good.sessions[0], question: 'x'.repeat(QUESTION_CHARS + 1) }] }, { ...good, sessions: Array(51).fill(good.sessions[0]) }]) assert.equal(validSnapshot(bad), null, JSON.stringify(bad).slice(0, 80));
});

test('Home\'s row: an owner\'s item an agent waits on, for the plates shown, the newest snapshot first', () => {
  const now = Date.parse(at(10));
  const mac = { schema: 1, machine: 'Acme Mac', scannedAt: at(9), sessions: [{ id: 'a', plate: 'anvils', title: '🏠 [anvils] Home', question: 'Which anvil first?', since: at(1) }, { id: 'z', plate: 'elsewhere', title: '🏠 [elsewhere] Home', question: null, since: at(2) }] };
  const older = { ...mac, machine: 'Old Mac', scannedAt: at(-60), sessions: [{ id: 'a', plate: 'anvils', title: '🏠 [anvils] Home', question: 'An older read', since: at(1) }] };
  const row = waitingRows([older, mac], { plates: ['anvils'], now });
  assert.equal(row.items.length, 1, 'one session, from the newest snapshot that has it');
  assert.equal(row.items[0].why, 'Which anvil first?');
  assert.match(row.why, /1 for plates not shown here/);
  assert.equal(waitingRows([{ ...mac, scannedAt: at(-60 * 25) }], { plates: ['anvils'], now }).na.includes('more than a day old'), true);
  assert.match(waitingRows([], { plates: ['anvils'], now }).na, /plates sessions push/);
  const quiet = waitingRows([{ ...mac, scannedAt: at(-40) }], { plates: ['anvils'], now });
  assert.match(quiet.why, /^Acme Mac last sent 2026-11-15 09:20 UTC/, 'a snapshot past half an hour says when');
  assert.match(quiet.items[0].why, /\(as of 2026-11-15 09:20 UTC, the last Acme Mac sent\)$/, 'and so does each of its items');
  // A Mac that stopped sending never borrows another's current time.
  const mixed = waitingRows([{ ...mac, sessions: [], machine: 'Online Mac' }, { ...older, machine: 'Offline Mac', scannedAt: at(-240) }], { plates: ['anvils'], now });
  assert.match(mixed.why, /^from Online Mac; Offline Mac last sent 2026-11-15 06:00 UTC/);
  assert.match(mixed.items[0].why, /as of 2026-11-15 06:00 UTC, the last Offline Mac sent/);
  // Through the shared model: it is in Needs you, the docket's unblock group, and the plate's card says an agent waits.
  const project = { id: 'anvils', name: 'Anvils', repo: 'acme/anvils', state: 'complete', gaps: [], planning: { built: null, total: null }, decisions: [], walks: [], reviews: [], waiting: [], changes: [] };
  const model = homeSnapshot([project], { sections: homeSections({ sessions: row }), can: { form: 'web' } });
  assert.deepEqual(model.docket.map(e => [e.kind, e.group]), [['session', 'unblock']]);
  const card = model.home.sections.find(s => s.id === 'plates').items[0];
  assert.equal(card.agentWaiting.count, 1);
  assert.equal(card.agentWaiting.items[0].title, '🏠 [anvils] Home is waiting on you');
});

test('a waiting session is answered in the session, and can be put off from Home', async () => {
  const { createHomeAnswers } = await import('../lib/web/home-answers.mjs');
  const row = waitingRows([{ schema: 1, machine: 'Acme Mac', scannedAt: at(9), sessions: [{ id: 'a', plate: 'anvils', title: '🏠 [anvils] Home', question: 'Which?', since: null }] }], { plates: ['anvils'], now: Date.parse(at(10)) });
  const project = { id: 'anvils', name: 'Anvils', repo: 'acme/anvils', state: 'complete', gaps: [], planning: { built: null, total: null }, decisions: [], walks: [], reviews: [], waiting: [], changes: [] };
  const model = homeSnapshot([project], { sections: homeSections({ sessions: row }), can: { form: 'web' } });
  const item = model.sections.find(s => s.id === 'sessions').items[0];
  assert.equal(item.key, 'anvils:session:a');
  assert.deepEqual(item.answers.map(a => [a.id, a.unavailable?.command ?? null]), [['answer', 'claude --resume a'], ['not-now', null]], 'answered in its session (its command), or put off here');
  const put = [];
  const answer = createHomeAnswers(projectHarness().config, { readHome: async () => model, now: () => Date.parse(at(10)),
    notNow: { put: async (userId, key, record) => { put.push(key); return { key, until: '2026-11-22', count: 1 }; } }, events: { record: async () => {} } });
  const result = await answer({ userId: 1, projects: [{ id: 'anvils' }] }, 'token', { key: 'anvils:session:a', answer: 'not-now' });
  assert.deepEqual([result.state, put], ['written', ['anvils:session:a']]);
});

async function storeHarness(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(await readFile(new URL('../lib/web/migrations/022-waiting-sessions.sql', import.meta.url), 'utf8'));
  const fetcher = async (url, options) => {
    assert.match(url, /\/rest\/v1\/rpc\/plates_waiting_rpc$/);
    const entries = Object.entries(JSON.parse(options.body));
    await db.exec('SET ROLE service_role');
    try {
      const result = await db.query(`SELECT public.plates_waiting_rpc(${entries.map(([key], i) => `${key} => $${i + 1}${key === 'p_at' ? '::timestamptz' : ''}`).join(',')}) value`, entries.map(([, value]) => value));
      return Response.json(result.rows[0].value);
    } finally { await db.exec('RESET ROLE'); }
  };
  return { db, fetcher, config: projectHarness().config };
}

test('the hosted store: a key shown once, sealed records, a revoked key refused', async t => {
  const { db, fetcher, config } = await storeHarness(t), now = () => Date.parse(at(10));
  const store = createWaitingStore(config, fetcher, { now });
  const { key, device } = await store.createKey(1, 'Acme Mac');
  assert.match(key, /^pdk_[A-Za-z0-9_-]{43}$/);
  const resolved = await store.resolve(key);
  assert.deepEqual([resolved.userId, resolved.device, resolved.label], [1, device, 'Acme Mac']);
  await assert.rejects(store.resolve(`pdk_${'x'.repeat(43)}`), e => e.status === 401, 'an unknown key');
  await assert.rejects(store.resolve('not-a-key'), e => e.status === 401, 'a malformed key');
  const snap = { schema: 1, machine: 'Acme Mac', scannedAt: at(9), sessions: [{ id: 'a', plate: 'anvils', title: '🏠 [anvils] Home', question: 'Which anvil first?', since: at(1) }], scripts: [] };
  assert.deepEqual(await store.push(resolved, snap), { pushed: true, sessions: 1 });
  assert.deepEqual(await store.list(1), [snap]);
  assert.deepEqual(await store.list(2), [], 'another owner sees nothing');
  // Two overlapping runs: the older scan arriving last changes nothing.
  assert.deepEqual(await store.push(resolved, { ...snap, scannedAt: at(8), sessions: [] }), { pushed: true, sessions: 0, superseded: true });
  assert.deepEqual(await store.list(1), [snap], 'the newest scan is kept');
  await assert.rejects(store.push(resolved, { ...snap, sessions: [{ ...snap.sessions[0], plate: 'forge' }] }), e => e.code === 'invalid_waiting_snapshot');
  await assert.rejects(store.push(resolved, { ...snap, scannedAt: at(60) }), e => e.code === 'invalid_waiting_snapshot', 'from the future');
  // The database holds digests, ciphertext and times: never the key, the title or the question.
  const dump = JSON.stringify([(await db.query('SELECT * FROM plates_home.device_keys')).rows, (await db.query('SELECT * FROM plates_home.waiting_sessions')).rows]);
  for (const plain of [key, 'Acme Mac', 'anvils', 'Which anvil first?']) assert.ok(!dump.includes(plain), plain);
  assert.deepEqual((await store.listKeys(1)).map(d => [d.label, d.device]), [['Acme Mac', device]]);
  assert.deepEqual(await store.revokeKey(1, device), { revoked: true });
  assert.deepEqual(await store.list(1), [], 'revoking removes its snapshot');
  await assert.rejects(store.resolve(key), e => e.status === 401, 'a revoked key is refused');
  await assert.rejects(store.push(resolved, snap), e => e.status === 401, 'and cannot push');
});

test('the push route takes a device key and nothing else; the CLI pushes this machine\'s snapshot', async t => {
  const { fetcher: rpc, config } = await storeHarness(t);
  const { createWebService } = await import('../lib/web/server.mjs');
  const h = projectHarness();
  const fetcher = async (url, options) => (new URL(url).pathname === '/rest/v1/rpc/plates_waiting_rpc' ? rpc(url, options) : h.fetcher(url, options));
  const clock = () => Date.parse(at(30)); // one clock for the service and the push, so the test never ages
  const service = createWebService({ ...h.config, storageUrl: config.storageUrl }, { fetcher, now: clock });
  const { key } = await createWaitingStore(h.config, fetcher, { now: clock }).createKey(1, 'Acme Mac');
  const call = (authorization, body = '{}') => service(new Request(`${h.config.origin}/api/sessions/waiting`, { method: 'POST', headers: { ...(authorization ? { authorization } : {}), 'content-type': 'application/json' }, body }));
  assert.equal((await call(null)).status, 401, 'no key');
  assert.equal((await call('Bearer pdk_short')).status, 401, 'a malformed key');
  assert.equal((await call(`Bearer pdk_${'y'.repeat(43)}`)).status, 401, 'an unknown key');
  assert.equal((await call(`Bearer ${key}`, JSON.stringify({ schema: 1 }))).status, 400, 'a malformed snapshot');

  const dir = await mkdtemp(join(tmpdir(), 'plates-waiting-push-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'projects', 'p'), { recursive: true });
  await writeFile(join(dir, 'projects', 'p', 'a.jsonl'), transcript('a', '🏠 [studio] Home Remote Control', ask('Which Acme anvil first?')));
  const sent = await push({ site: h.config.origin, env: { PLATES_CLAUDE_DIR: dir, RUNME_DIR: join(dir, 'no-queue') }, now: Date.parse(at(30)), machine: 'Acme Mac', key: async () => key,
    fetcher: (url, options) => service(new Request(url, options)) });
  assert.deepEqual([sent.data.pushed, sent.data.sessions], [true, 1]);
  assert.deepEqual((await createWaitingStore(h.config, fetcher, { now: clock }).list(1))[0].sessions.map(s => s.question), ['Which Acme anvil first?']);
  await assert.rejects(push({ site: h.config.origin, env: {}, key: async () => null }), /no device key/);
  await assert.rejects(push({ site: 'http://acme.example', env: {}, key: async () => key }), /must be https/);
});

test('the runme queue: checked scripts are items an agent waits on, on the plate they name, never their contents', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-runme-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const script = (name, why) => `#!/usr/bin/env bash\n# runme: ${name}\n# why: ${why}\nset -euo pipefail\necho "acme secret step"\n`;
  const put = async (file, text, checked) => { await writeFile(join(dir, `${file}.sh`), text); if (checked) await writeFile(join(dir, `${file}.sh.ok`), `${createHash('sha256').update(text).digest('hex')}\n`); };
  await put('20261115-0817-anvils-install', script('anvils-install', 'Install the Acme anvils app on your phone'), true);
  await put('20261115-0900-tidy-disk', script('tidy-disk', 'Free space on the Acme disk'), true);
  await put('20261115-0930-forge-setup', script('forge-setup', 'Set up the forge'), false);
  await writeFile(join(dir, '20261115-1000-edited.sh'), script('edited', 'Changed after its check'));
  await writeFile(join(dir, '20261115-1000-edited.sh.ok'), 'f'.repeat(64));
  const scripts = await scanRunme({ env: { RUNME_DIR: dir } });
  assert.deepEqual(scripts.map(x => [x.name, x.checked]), [['20261115-0817-anvils-install', true], ['20261115-0900-tidy-disk', true], ['20261115-0930-forge-setup', false], ['20261115-1000-edited', false]]);
  assert.ok(!JSON.stringify(scripts).includes('acme secret step'), 'a script\'s contents stay on this machine');
  assert.deepEqual(await scanRunme({ env: { RUNME_DIR: join(dir, 'none') } }), [], 'no queue is no scripts');

  assert.equal(scriptPlate('20261115-0817-anvils-install', ['anvils', 'forge'], 'workshop'), 'anvils');
  assert.equal(scriptPlate('20261115-0900-tidy-disk', ['anvils'], 'workshop'), 'workshop');
  const snap = validSnapshot({ schema: 1, machine: 'Acme Mac', scannedAt: at(9), sessions: [], scripts });
  const row = runmeRows([snap], { plates: ['anvils', 'workshop'], home: 'workshop', now: Date.parse(at(10)) });
  assert.deepEqual(row.items.map(i => [i.plate, i.title, i.read]), [['anvils', 'Run anvils-install', 'runme run anvils-install'], ['workshop', 'Run tidy-disk', 'runme run tidy-disk']]);
  assert.match(row.why, /type runme on Acme Mac; 2 not checked yet/);
  const project = id => ({ id, name: id, repo: `acme/${id}`, state: 'complete', gaps: [], planning: { built: null, total: null }, decisions: [], walks: [], reviews: [], waiting: [], changes: [] });
  const model = homeSnapshot([project('anvils'), project('workshop')], { sections: homeSections({ runme: row }), can: { form: 'web' } });
  assert.deepEqual(model.docket.map(e => [e.kind, e.group]), [['runme', 'unblock'], ['runme', 'unblock']], 'a script an agent left is something it waits on');
  const item = model.sections.find(s => s.id === 'runme').items[0];
  assert.deepEqual(item.answers.map(a => [a.id, a.unavailable?.command ?? null]), [['run', 'runme run anvils-install'], ['not-now', null]], 'run on the Mac (its command), or put off here');
  assert.equal(model.home.sections.find(s => s.id === 'plates').items.find(p => p.projectId === 'anvils').agentWaiting.items[0].title, 'Run anvils-install');
  assert.equal(validSnapshot({ ...snap, scripts: [{ ...scripts[0], contents: 'x' }] }), null, 'a script field the snapshot does not hold is refused');
});
