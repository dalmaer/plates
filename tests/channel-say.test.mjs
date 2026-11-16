// Phase 194, increment 2: agents post with plates say. One line for this checkout's plate, sealed in the owner's
// workspace (SQL024 on PGlite, through the service's own sealing and its device-key route), tagged with the session,
// provider and claimed phase; refused, naming why, when it is too long, too frequent, key-shaped or keyless. The
// channel (lib/channel.mjs) shows it as a `say` line in both forms, and Here now counts it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { createWaitingStore } from '../lib/web/waiting-store.mjs';
import { createChannelStore } from '../lib/web/channel-store.mjs';
import { say, readSays, sayProblem, validPost, validSaid, SAY_CHARS, SAY_SEALED_BYTES } from '../lib/channel-say.mjs';
import { channelFor, channelInputOf, channelText } from '../lib/channel.mjs';
import { projectHarness } from './helpers/web-projects.mjs';

const MIGRATION = new URL('../lib/web/migrations/024-channel-posts.sql', import.meta.url);

/** SQL022 and SQL024 on PGlite; every RPC runs as service_role, as the hosted service calls it. */
async function storeHarness(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(await readFile(new URL('../lib/web/migrations/022-waiting-sessions.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(MIGRATION, 'utf8'));
  const casts = { p_at: '::timestamptz', p_since: '::timestamptz' };
  const call = async (fn, body) => {
    const entries = Object.entries(body);
    await db.exec('SET ROLE service_role');
    try { return (await db.query(`SELECT public.${fn}(${entries.map(([key], i) => `${key} => $${i + 1}${casts[key] ?? ''}`).join(',')}) value`, entries.map(([, value]) => value))).rows[0].value; }
    finally { await db.exec('RESET ROLE'); }
  };
  const fetcher = async (url, options) => {
    const fn = /\/rest\/v1\/rpc\/(plates_waiting_rpc|plates_channel_rpc)$/.exec(url)?.[1];
    assert.ok(fn, url);
    try { return Response.json(await call(fn, JSON.parse(options.body))); } catch (error) { return Response.json({ message: String(error.message) }, { status: 400 }); }
  };
  return { db, fetcher, call };
}

/** The hosted service with the store above, and a device key for owner 1. */
async function service(t) {
  const store = await storeHarness(t), h = projectHarness();
  const fetcher = async (url, options) => (/\/rest\/v1\/rpc\/plates_(waiting|channel)_rpc$/.test(new URL(url).pathname) ? store.fetcher(url, options) : h.fetcher(url, options));
  const { createWebService } = await import('../lib/web/server.mjs');
  const web = createWebService(h.config, { fetcher, now: Date.now });
  const { key, device } = await createWaitingStore(h.config, fetcher).createKey(1, 'Acme Mac');
  const send = (url, options) => web(new Request(url, options));
  return { ...store, h, web, send, key, device, fetcher, posts: createChannelStore(h.config, fetcher) };
}

/** A checkout of Acme Studio on a branch naming phase 2: what plates say reads for its plate and phase. */
async function checkout(t, branch = 'claude/phase-2-bellows') {
  const root = await mkdtemp(join(tmpdir(), 'plates-say-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.plates'), { recursive: true });
  await writeFile(join(root, '.plates', 'plates.json'), JSON.stringify({ name: 'Acme Studio', repo: 'acme/studio', practices: ['phases'] }));
  execFileSync('git', ['init', '-q', '-b', branch, root]);
  return root;
}
const ENV = { PLATES_SESSION: 'acme-session-1', PLATES_PROVIDER: 'claude' };

test('plates say posts one sealed line with session, provider and phase', async t => {
  const s = await service(t), root = await checkout(t), origin = s.h.config.origin;
  const posted = await say({ root, text: 'Starting the Acme bellows step: wiring the pump', env: { ...ENV, PLATES_SITE: origin }, key: async () => s.key, fetcher: s.send });
  assert.deepEqual([posted.data.posted, posted.data.project, posted.data.phase, posted.data.session, posted.data.provider], [true, 'studio', 2, 'acme-session-1', 'claude']);
  assert.match(posted.text, /^Posted to studio's channel on .* as studio#2 \(claude\): Starting the Acme bellows step/);
  // Read back through the store: the line, its session, provider, phase and the device that sent it.
  const lines = await s.posts.list(1, 'studio');
  assert.deepEqual(lines.map(({ at, ...l }) => l), [{ text: 'Starting the Acme bellows step: wiring the pump', session: 'acme-session-1', provider: 'claude', phase: 2, device: 'Acme Mac' }]);
  assert.equal(lines[0].at, posted.data.at);
  assert.deepEqual(await s.posts.list(2, 'studio'), [], 'another owner reads nothing');
  // A second session's line with no claimed phase is its session's.
  const other = await checkout(t, 'main');
  await say({ root: other, text: 'Holding 8 cores for the Acme build until 14:00', env: { PLATES_SESSION: 'acme-session-2', PLATES_PROVIDER: 'codex', PLATES_SITE: origin }, key: async () => s.key, fetcher: s.send });
  // The CLI reads them from the site with the device key; the web from the store: one model, the same say lines.
  const cliSays = await readSays({ plates: ['studio'], env: { PLATES_SITE: origin }, key: async () => s.key, fetcher: s.send });
  assert.equal(cliSays.studio.state, 'read');
  const webSays = { state: 'read', items: await s.posts.list(1, 'studio') };
  assert.deepEqual(cliSays.studio, webSays);
  const project = { id: 'studio', name: 'Acme Studio', repo: 'acme/studio', state: 'complete', gaps: [], roadmap: { phases: [{ id: 2, title: 'Acme bellows' }] },
    waits: { state: 'read', items: [], more: 0 }, release: { state: 'none', production: null } };
  const claims = { state: 'read', claims: [{ phase: 2, provider: 'claude', machine: 'acme-mac', at: new Date(Date.now() - 3 * 86_400_000).toISOString() }], prs: [] };
  const model = says => channelFor([channelInputOf(project, { claims, prs: { state: 'read', items: [] }, says })], { now: Date.now(), waiting: { items: [] } });
  const cli = model(cliSays.studio), web = model(webSays);
  assert.deepEqual(cli.lines, web.lines);
  const said = web.lines.filter(l => l.kind === 'say');
  assert.deepEqual(said.map(l => [l.actor, l.phase, l.session, l.provider, l.source, l.text]), [
    ['studio#2', 2, 'acme-session-1', 'claude', 'says', 'claude: Starting the Acme bellows step: wiring the pump'],
    ['studio@acme-session-2', null, 'acme-session-2', 'codex', 'says', 'codex: Holding 8 cores for the Acme build until 14:00'],
  ]);
  // Here now counts a say line as activity: a claim three days old with a line just now is active, its line the last.
  assert.deepEqual(web.hereNow.map(h => [h.actor, h.last.kind, h.last.age, h.unread]), [['studio#2', 'say', 'now', 1]]);
  assert.match(channelText(web), /studio#2 {2}say {2}claude: Starting the Acme bellows step/);
  // Not asked for is not a source (an increment-1 caller); asked for and unread is a gap naming why.
  assert.ok(!model(undefined).lines.some(l => l.source === 'says'));
  assert.deepEqual(model({ state: 'unavailable', why: 'the workspace\'s channel posts could not be read' }).lines.filter(l => l.source === 'says').map(l => [l.kind, l.text]),
    [['gap', 'agents\' own lines unread: the workspace\'s channel posts could not be read']]);
  assert.deepEqual((await readSays({ plates: ['studio'], env: {}, key: async () => { throw new Error('the key is never read without a site'); } })).studio,
    { state: 'unavailable', why: 'agents\' lines are kept on your Plates workspace; set PLATES_SITE and a device key to read them here' });
  // The hosted channel shows them, in the web's own read.
  const { createHomeReader } = await import('../lib/web/home.mjs');
  const read = await createHomeReader(s.h.config, { fetcher: s.fetcher, now: Date.now })(s.h.access, 'fake-user-access-token-for-tests', { channel: true });
  assert.deepEqual(read.channel.lines.filter(l => l.source === 'says').map(l => [l.actor, l.text]), said.map(l => [l.actor, l.text]));
});

test('over-long, too-frequent, key-shaped or keyless posts are refused naming why', async t => {
  const s = await service(t), root = await checkout(t), origin = s.h.config.origin;
  const never = async () => { throw new Error('nothing is sent'); };
  const refused = async (args, pattern, code = 2) => assert.rejects(say({ root, env: { ...ENV, PLATES_SITE: origin }, key: async () => s.key, fetcher: never, ...args }), e => pattern.test(e.message) && e.exitCode === code, String(pattern));
  await refused({ text: 'a'.repeat(SAY_CHARS + 1) }, /^not posted: a line is at most 280 characters; this one is 281$/);
  await refused({ text: 'deploy key ghp_abcdefghijklmnopqrstuvwxyz0123456789 works' }, /^not posted: the text is shaped like a credential \(a key or token\); name what it is, never its value$/);
  await refused({ text: `my device key ${s.key}` }, /shaped like a credential/);
  await refused({ text: '-----BEGIN RSA PRIVATE KEY-----' }, /shaped like a credential/);
  await refused({ text: 'Starting', key: async () => null }, /^not posted: no device key; create one on your workspace's Devices page/);
  await refused({ text: 'Starting', env: { PLATES_PROVIDER: 'claude', PLATES_SITE: origin } }, /^not posted: no session to post as; set PLATES_SESSION/);
  await refused({ text: 'Starting', env: ENV }, /^not posted: which workspace\? --site/);
  await refused({ text: '   ' }, /^not posted: a line needs some text$/);
  // The workspace: one line per session per minute; another session may post; a revoked key cannot.
  const post = (text, env = ENV) => say({ root, text, env: { ...env, PLATES_SITE: origin }, key: async () => s.key, fetcher: s.send });
  await post('Starting the Acme anvils step');
  await assert.rejects(post('And another'), e => /^not posted: too frequent; one line per session per minute \(acme-session-1 posted in the last minute\)$/.test(e.message) && e.exitCode === 1);
  await post('Blocked on the Acme fixture', { ...ENV, PLATES_SESSION: 'acme-session-9' });
  assert.equal((await s.posts.list(1, 'studio')).length, 2, 'the refused line was not stored');
  await createWaitingStore(s.h.config, s.fetcher).revokeKey(1, s.device);
  await assert.rejects(post('After revoking', { ...ENV, PLATES_SESSION: 'acme-session-3' }), e => /refused this device's key/.test(e.message) && e.exitCode === 1);
  // The same refusals hold on the route itself, whatever client calls it.
  const fresh = (await createWaitingStore(s.h.config, s.fetcher).createKey(1, 'Acme Mini')).key;
  const route = (body, { key = fresh, method = 'POST', path = '/api/channel/say' } = {}) => s.send(`${origin}${path}`, { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
  const body = over => ({ schema: 1, project: 'studio', text: 'Finished the Acme crates step', session: 'acme-session-4', provider: 'claude', phase: 3, ...over });
  assert.equal((await route(body(), { key: null })).status, 401, 'no key');
  assert.equal((await route(body(), { key: `pdk_${'z'.repeat(43)}` })).status, 401, 'an unknown key');
  for (const bad of [body({ text: 'a'.repeat(281) }), body({ text: 'sk-ant-abcdefghijklmnopqrstuvwxyz' }), body({ extra: 1 }), body({ session: '../x' }), body({ phase: -1 }), body({ provider: 'Claude Code' }),
    // Identifiers must be strings: a number, an array or an object is refused, never coerced to text and matched.
    body({ session: 12345 }), body({ session: ['acme-session-4'] }), body({ session: { toString: 'acme' } }), body({ project: ['studio'] }), body({ provider: ['claude'] }), body({ text: ['Finished'] })]) {
    const r = await route(bad);
    assert.deepEqual([r.status, (await r.json()).error], [400, 'invalid_channel_post'], JSON.stringify(bad).slice(0, 90));
  }
  const elsewhere = await route(body({ project: 'forge' }));
  assert.deepEqual([elsewhere.status, (await elsewhere.json()).error], [400, 'invalid_channel_project'], 'a plate the workspace does not pin');
  assert.equal((await route(body())).status, 200);
  const again = await route(body({ text: 'Again' }));
  assert.deepEqual([again.status, (await again.json()).error], [429, 'channel_too_frequent']);
  assert.equal((await route(null, { method: 'GET', path: '/api/channel/says?project=studio&extra=1' })).status, 400, 'the read takes project and since, nothing else');
  assert.equal((await route(null, { method: 'GET', path: '/api/channel/says?project=studio', key: null })).status, 401);
  assert.equal((await route(null, { method: 'GET', path: '/api/channel/say' })).status, 405);
  // The pure checks the CLI and the service share.
  assert.equal(sayProblem('Starting the Acme step'), null);
  assert.match(sayProblem('a\u0007b'), /control characters/);
  assert.match(sayProblem('\ud800'), /well-formed/);
  assert.equal(validPost(body(), ['forge']), null, 'a plate outside the list');
  for (const session of [12345, ['acme-session-4'], null, undefined]) assert.equal(validPost(body({ session })), null, String(session));
  assert.equal(validSaid({ at: new Date().toISOString(), text: 'Done', session: ['acme'], provider: null, phase: null, device: null }), null, 'a stored line is checked the same way');
});

test('the store holds ciphertext, digests and times only, within its bounds', async t => {
  const s = await service(t), origin = s.h.config.origin;
  // The largest line: 280 three-byte characters, the longest session, provider and device label, fits the sealed bound.
  const wide = '漢'.repeat(SAY_CHARS), session = `a${'b'.repeat(127)}`, provider = `p${'q'.repeat(39)}`;
  const { key: longKey } = await createWaitingStore(s.h.config, s.fetcher).createKey(1, 'A'.repeat(40));
  const big = await s.send(`${origin}/api/channel/say`, { method: 'POST', headers: { authorization: `Bearer ${longKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ schema: 1, project: 'studio', text: wide, session, provider, phase: 2 ** 53 - 1 }) });
  assert.equal(big.status, 200, await big.clone().text());
  const root = await checkout(t);
  await say({ root, text: 'Acme secret plan: ship the anvils Monday', env: { ...ENV, PLATES_SITE: origin }, key: async () => s.key, fetcher: s.send });
  const rows = (await s.db.query('SELECT * FROM plates_home.channel_posts ORDER BY id')).rows;
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['device', 'id', 'posted_at', 'project', 'scope', 'session', 'value']);
    for (const digest of ['scope', 'project', 'session', 'device']) assert.match(row[digest], /^[a-f0-9]{64}$/, digest);
    assert.ok(row.posted_at instanceof Date);
    assert.ok(Buffer.byteLength(row.value) <= SAY_SEALED_BYTES);
  }
  const dump = JSON.stringify(rows);
  for (const plain of ['Acme secret plan', 'anvils', 'acme-session-1', 'claude', 'studio', 'Acme Mac', s.key, '漢']) assert.ok(!dump.includes(plain), plain);
  // In SQL as well as the service: a sealed record over the bound, a second line from one session within a minute, and a device without a key are refused.
  const scope = rows[1].scope, project = rows[1].project, device = rows[1].device, session1 = rows[1].session;
  await assert.rejects(s.call('plates_channel_rpc', { p_operation: 'post', p_scope: scope, p_project: project, p_session: 'c'.repeat(64), p_device: device, p_value: 'x'.repeat(SAY_SEALED_BYTES + 1) }), /invalid channel post/);
  assert.deepEqual(await s.call('plates_channel_rpc', { p_operation: 'post', p_scope: scope, p_project: project, p_session: session1, p_device: device, p_value: 'sealed' }), { tooFrequent: true });
  assert.deepEqual(await s.call('plates_channel_rpc', { p_operation: 'post', p_scope: scope, p_project: project, p_session: 'd'.repeat(64), p_device: 'e'.repeat(64), p_value: 'sealed' }), { revoked: true });
  await assert.rejects(s.call('plates_channel_rpc', { p_operation: 'post', p_scope: 'NOT-HEX', p_project: project, p_session: 'd'.repeat(64), p_device: device, p_value: 'sealed' }), /invalid channel input/);
  // Only the service role may call it, and nobody reads the table directly.
  await s.db.exec('SET ROLE anon');
  await assert.rejects(s.db.query(`SELECT public.plates_channel_rpc('list', '${scope}', '${project}')`), /permission denied/);
  await assert.rejects(s.db.query('SELECT * FROM plates_home.channel_posts'), /permission denied/);
  await s.db.exec('RESET ROLE');
  await s.db.exec('SET ROLE service_role');
  await assert.rejects(s.db.query('SELECT * FROM plates_home.channel_posts'), /permission denied/);
  await s.db.exec('RESET ROLE');
  // Kept 14 days: an expired line is deleted on the next write. At most 500 per plate: the oldest go first.
  await s.db.exec(`UPDATE plates_home.channel_posts SET posted_at = now() - interval '15 days' WHERE id = ${rows[0].id}`);
  await s.db.exec(`INSERT INTO plates_home.channel_posts(scope, project, session, device, value, posted_at)
    SELECT '${scope}', '${project}', lpad(to_hex(n), 64, '0'), '${device}', 'sealed-' || n, now() - interval '1 day' + n * interval '1 second' FROM generate_series(1, 499) n`);
  assert.equal((await s.db.query('SELECT count(*)::int c FROM plates_home.channel_posts')).rows[0].c, 501);
  assert.equal((await s.call('plates_channel_rpc', { p_operation: 'post', p_scope: scope, p_project: project, p_session: 'f'.repeat(64), p_device: device, p_value: 'sealed-new' })).posted, true);
  const kept = (await s.db.query('SELECT value FROM plates_home.channel_posts ORDER BY posted_at, id')).rows.map(r => r.value);
  assert.equal(kept.length, 500, 'the expired line went, and then the oldest beyond 500');
  assert.deepEqual([kept[0], kept.at(-1)], ['sealed-2', 'sealed-new']);
  assert.ok(!kept.includes(rows[0].value), 'the fifteen-day-old line is gone');
  // A list never returns more than 500, oldest first, and since narrows it.
  const listed = await s.call('plates_channel_rpc', { p_operation: 'list', p_scope: scope, p_project: project });
  assert.equal(listed.items.length, 500);
  assert.equal(listed.items.at(-1).value, 'sealed-new');
  const since = (await s.call('plates_channel_rpc', { p_operation: 'list', p_scope: scope, p_project: project, p_since: new Date(Date.now() - 60_000).toISOString() })).items.map(i => i.value);
  assert.ok(since.includes('sealed-new') && !since.includes('sealed-2'));
});

test('the migration is named and shaped as the hosted migrations are', async () => {
  const sql = await readFile(MIGRATION, 'utf8');
  assert.match(sql, /^-- Channel posts /);
  assert.match(sql, /^-- Apply once, after 001-023, to the explicit private database using an owner\n-- SQL session and only with the owner's resource approval\./m);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on plates_home\.channel_posts from public, anon, authenticated, service_role;/);
  assert.match(sql, /grant execute on function public\.plates_channel_rpc\([^)]*\) to service_role;/);
  assert.match(sql, /security definer set search_path = ''/);
  for (const bound of ["interval '14 days'", "interval '1 minute'", 'limit 500', 'octet_length(value) <= 2048']) assert.ok(sql.includes(bound), bound);
});
