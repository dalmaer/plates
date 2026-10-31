import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Bridge, DESTINATION, commands, validateConfig } from '../experiments/discord-bridge/core.mjs';
import { DiscordHTTP, effectivePermissions, verifyIdentityAndScope, registerCommands } from '../experiments/discord-bridge/transport.mjs';
import { syntheticConfig, interaction, demo } from '../experiments/discord-bridge/demo.mjs';
import { start } from '../experiments/discord-bridge/live.mjs';

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'acme-discord-test-')); let now = 100000;
  const file = join(root, 'journal.sqlite'), bridge = new Bridge(file, syntheticConfig(), () => now);
  t.after(() => { bridge.close(); rmSync(root, { recursive: true, force: true }); });
  return { bridge, file, advance: n => { now += n; } };
}
const id = n => String(1000000000000000000n + BigInt(n));

test('Discord bridge validates exact string destination and explicit unique human identity', () => {
  const c = syntheticConfig();
  for (const bad of [{ ...c, guildId: Number(c.guildId) }, { ...c, channelId: id(9) }, { ...c, mode: 'live-backend' }, { ...c, humans: {} }, { ...c, humans: { ...c.humans, [id(2)]: Object.values(c.humans)[0] } }]) assert.throws(() => validateConfig(bad));
});
test('Discord bridge denies off-scope, DMs, bots, webhooks, unmapped humans and widened permissions without writes', t => {
  const { bridge } = setup(t), base = interaction(id(10));
  const cases = [{ guild_id: id(8) }, { channel_id: id(9) }, { guild_id: undefined }, { application_id: id(11) }, { type: 0 }, { member: { ...base.member, user: { id: id(1), bot: true } } }, { member: { ...base.member, user: { id: id(5) } } }, { webhook_id: id(3) }, { app_permissions: '8' }, { member: { ...base.member, permissions: '1024' } }];
  for (const patch of cases) assert.throws(() => bridge.receive({ ...base, ...patch }));
  assert.equal(bridge.summary().inbox, 0);
});
test('Discord bridge rejects duplicate option keys, unknown options and unroutable targets', t => {
  const { bridge } = setup(t);
  for (const raw of [interaction(id(2), { target: 'agent:someone-else' }), interaction(id(3), { backend: 'shell' }), interaction(id(4), { text: 'x'.repeat(1001) })]) assert.throws(() => bridge.receive(raw));
  const raw = interaction(id(5)); raw.data.options.push(raw.data.options[0]); assert.throws(() => bridge.receive(raw));
  raw.data.options.pop(); raw.data.options.push({ name: 'approve', type: 3, value: 'yes' }); assert.throws(() => bridge.receive(raw));
});
test('Discord bridge routes four synthetic identities and never interprets approval text', async () => {
  const result = await demo(); assert.equal(result.result, 'passed'); assert.equal(result.modelCalls, 0); assert.equal(result.backendCalls, 0);
  assert.equal(new Set(result.routedReplies.map(x => x.content.split('\n')[0])).size, 4);
});
test('Discord bridge deduplicates and detects conflicting replay, excluding interaction secrets', t => {
  const { bridge, file } = setup(t), raw = interaction(id(10));
  bridge.receive(raw); assert.equal(bridge.receive(raw).duplicate, true);
  const conflict = interaction(id(10), { text: 'other text' }); assert.throws(() => bridge.receive(conflict), /conflict/);
  assert.equal(JSON.stringify(bridge.read()).includes(raw.token), false);
  for (const suffix of ['', '-wal']) assert.equal(readFileSync(file + suffix).includes(Buffer.from(raw.token)), false);
});
test('Discord bridge records stop requested without asserting termination', t => {
  const { bridge } = setup(t); bridge.receive(interaction(id(2), { command: 'stop' }));
  const c = Object.values(bridge.read().conversations)[0]; assert.equal(c.stopRequested, true); assert.equal(c.terminationConfirmed, false);
  assert.match(bridge.read().outbox[id(2)].content, /termination is NOT confirmed/);
});
test('Discord bridge bounds human rate and retains original receipts', t => {
  const { bridge, advance } = setup(t);
  for (let n = 10; n < 15; n++) bridge.receive(interaction(id(n)));
  assert.throws(() => bridge.receive(interaction(id(15))), /rate_limited/);
  advance(10000); bridge.receive(interaction(id(15))); assert.equal(bridge.summary().inbox, 6);
});
test('Discord bridge never resends a claimed or timed-out delivery after reopening', async t => {
  const { bridge, file, advance } = setup(t); bridge.receive(interaction(id(20)));
  let calls = 0; await bridge.deliverOne({ send: async () => { calls++; throw Error('lost acknowledgement'); } }); advance(10000);
  const other = new Bridge(file, syntheticConfig(), () => 200000);
  try { assert.equal(await other.deliverOne({ send: async () => { calls++; } }), null); assert.equal(other.read().outbox[id(20)].state, 'uncertain'); } finally { other.close(); }
  assert.equal(calls, 1);
  bridge.receive(interaction(id(21))); assert.equal(bridge.claim().state, 'uncertain'); advance(10000); assert.equal(bridge.claim(), null);
});
test('Discord bridge atomically claims across two store connections', t => {
  const { bridge, file } = setup(t); bridge.receive(interaction(id(20))); const other = new Bridge(file, syntheticConfig());
  try { assert.ok(bridge.claim()); assert.equal(other.claim(), null); } finally { other.close(); }
});
test('Discord bridge retries explicit 429 only after retry_after, preserving same identity', async t => {
  const { bridge, advance } = setup(t); bridge.receive(interaction(id(20)));
  assert.equal((await bridge.deliverOne({ send: async () => ({ kind: 'rate-limited', retryAfterMs: 5000 }) })).state, 'pending');
  advance(4999); assert.equal(bridge.claim(), null); advance(1);
  assert.equal((await bridge.deliverOne({ send: async row => ({ kind: 'delivered', messageId: id(30), receipt: row.id }) })).state, 'delivered');
  assert.equal(bridge.read().outbox[id(20)].messageId, id(30));
});
test('Discord bridge rejects config changes on existing durable state and emits only one smoke intent', t => {
  const { bridge, file } = setup(t); bridge.smoke(); bridge.smoke(); assert.equal(bridge.summary().outbox.length, 1);
  const changed = syntheticConfig(); changed.humans[id(1)].routes.pop(); assert.throws(() => new Bridge(file, changed), /configuration_changed/);
});
test('Discord HTTP scopes every send, suppresses mentions and treats failures as uncertain', async () => {
  const calls = [], http = new DiscordHTTP('acme-token', { fetcher: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ id: id(30), channel_id: DESTINATION.channelId, author: { id: DESTINATION.applicationId } }), { status: 200 }); } });
  await assert.rejects(http.send({ channelId: id(1) }), /scope/); assert.equal(calls.length, 0);
  const row = { id: id(20), channelId: DESTINATION.channelId, content: '@everyone synthetic' };
  assert.equal((await http.send(row)).kind, 'delivered'); const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.allowed_mentions, { parse: [], replied_user: false }); assert.equal(body.enforce_nonce, true); assert.equal(calls[0].options.redirect, 'error');
  for (const response of [new Response('broken', { status: 200 }), new Response('{}', { status: 503 }), new Response('{}', { status: 200 })]) {
    const failed = new DiscordHTTP('acme-token', { fetcher: async () => response }); assert.equal((await failed.send(row)).kind, 'uncertain');
  }
});
test('Discord HTTP honors global retry_after and does not retry the wire automatically', async () => {
  let count = 0, now = 1000;
  const http = new DiscordHTTP('acme-token', { now: () => now, fetcher: async () => { count++; return new Response(JSON.stringify({ retry_after: 10, global: true }), { status: 429 }); } });
  const row = { id: id(20), channelId: DESTINATION.channelId, content: 'Acme' };
  assert.equal((await http.send(row)).retryAfterMs, 10000); now += 5000; assert.equal((await http.send(row)).retryAfterMs, 5000); assert.equal(count, 1);
});
test('Discord HTTP waits through exhausted read buckets and 429s under a deadline', async () => {
  let now = 1000, calls = 0; const waits = [];
  const http = new DiscordHTTP('acme-token', { now: () => now, sleep: async ms => { waits.push(ms); now += ms; }, fetcher: async () => {
    calls++;
    if (calls === 1) return new Response('{}', { status: 200, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '2' } });
    if (calls === 2) return new Response('{"retry_after":3}', { status: 429 });
    return new Response('{"ready":true}', { status: 200 });
  } });
  await http.get('/acme'); assert.deepEqual(await http.get('/acme'), { ready: true }); assert.deepEqual(waits, [2000, 3000]); assert.equal(calls, 3);
  http.nextAt = now + 60000; await assert.rejects(http.get('/acme'), /rate_limited/); assert.equal(calls, 3);
});
function permissionFixture() {
  return { guild: { id: DESTINATION.guildId, owner_id: id(1) }, roles: [{ id: DESTINATION.guildId, permissions: '0' }, { id: id(2), permissions: '3072' }], member: { user: { id: DESTINATION.applicationId }, roles: [id(2)] }, channel: { id: DESTINATION.channelId, guild_id: DESTINATION.guildId, type: 0, name: 'test', permission_overwrites: [] }, botId: DESTINATION.applicationId };
}
test('Discord permission calculation follows everyone, role union and member overwrite; admin denied', () => {
  const f = permissionFixture(); assert.equal(effectivePermissions(f), 3072n);
  f.channel.permission_overwrites.push({ type: 0, id: f.guild.id, deny: '2048', allow: '0' }); assert.equal(effectivePermissions(f), 1024n);
  f.channel.permission_overwrites.push({ type: 0, id: id(2), deny: '0', allow: '2048' }); assert.equal(effectivePermissions(f), 3072n);
  f.channel.permission_overwrites.push({ type: 1, id: f.botId, deny: '2048', allow: '0' }); assert.equal(effectivePermissions(f), 1024n);
  f.roles[1].permissions = '8'; assert.throws(() => effectivePermissions(f), /administrator/);
});
test('Discord live preflight verifies application, bot, channel, guild and exact permissions', async () => {
  const f = permissionFixture(), objects = { '/oauth2/applications/@me': { id: DESTINATION.applicationId }, '/users/@me': { id: DESTINATION.applicationId, bot: true }, [`/guilds/${DESTINATION.guildId}`]: f.guild, [`/channels/${DESTINATION.channelId}`]: f.channel, [`/guilds/${DESTINATION.guildId}/members/${DESTINATION.applicationId}`]: f.member, [`/guilds/${DESTINATION.guildId}/roles`]: f.roles };
  const http = { get: async path => { assert.ok(Object.hasOwn(objects, path), `Unexpected route: ${path}`); return structuredClone(objects[path]); } }; assert.equal((await verifyIdentityAndScope(http)).permissions, '3072');
  f.channel.name = 'tasks'; await assert.rejects(verifyIdentityAndScope(http), /mismatch/); f.channel.name = 'test';
  f.roles[1].permissions = '11264'; await assert.rejects(verifyIdentityAndScope(http), /exact/);
});
test('Discord guild registration never overwrites unrelated commands or retries ambiguous creates', async t => {
  const { bridge } = setup(t); let calls = 0;
  const http = { get: async () => [], request: async (method, path) => { calls++; assert.equal(method, 'POST'); assert.match(path, new RegExp(`/guilds/${DESTINATION.guildId}/commands$`)); return { status: 0 }; } };
  await assert.rejects(registerCommands(http, bridge), /unconfirmed/); await assert.rejects(registerCommands(http, bridge), /reconciliation/); assert.equal(calls, 1);
  http.get = async () => [{ ...commands[0], id: id(2), options: commands[0].options.map(o => ({ name_localizations: null, ...Object.fromEntries(Object.entries(o).reverse()) })) }, { name: 'unrelated', type: 1 }];
  http.request = async (_method, _path, body) => ({ status: 201, data: { ...body, id: id(3) } });
  await registerCommands(http, bridge); assert.equal(bridge.read().registration.ask.state, 'verified');
});
test('Discord live runtime refuses before Keychain or network without separate approvals', async () => {
  await assert.rejects(start({ root: '/acme-unavailable', provisionApproved: true }), /approval/);
  await assert.rejects(start({ root: '/acme-unavailable', validateApproved: true }), /approval/);
});
