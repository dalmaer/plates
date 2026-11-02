import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBridge, normalizeDiscordMessage, validateConfig } from '../lib/discord-pilot/bridge.mjs';
import { mockAdapters, mockConfig, mockEcho, mockMessage } from '../lib/discord-pilot/mock.mjs';

function fixture(t, { config = mockConfig(), reply, ...options } = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'acme-discord-')));
  const adapters = mockAdapters(reply);
  let bridge = openBridge({ config, directory, ...adapters, ...options });
  t.after(() => { bridge.close(); rmSync(directory, { recursive: true }); });
  return { config, directory, ...adapters, get bridge() { return bridge; },
    restart() { bridge.close(); bridge = openBridge({ config, directory, ...adapters, ...options }); return bridge; },
    message: changes => mockMessage(config, changes) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('independent persistent sessions, peer provenance, four handoffs, no broadcast pings', async t => {
  const f = fixture(t), first = f.message();
  assert.equal(f.bridge.admit(first), 'queued');
  await f.bridge.drain(first.threadId);
  for (let i = 0; i < f.sent.length; i++) {
    f.bridge.admit(mockEcho(f.config, f.sent[i])); await f.bridge.drain(first.threadId);
  }
  const before = f.bridge.snapshot();
  assert.equal(f.sent.length, 5); assert.equal(before.tasks[first.threadId].handoffs, 4);
  const sessions = before.tasks[first.threadId].sessions;
  assert.notEqual(sessions.codex.id, sessions.claude.id);
  assert.equal(sessions.codex.history.length, 3); assert.equal(sessions.claude.history.length, 2);
  assert.deepEqual(f.sent.at(-1).allowed_mentions, { parse: [], users: [], roles: [], replied_user: false });
  f.restart();
  assert.deepEqual(f.bridge.snapshot().tasks[first.threadId].sessions, sessions);
  assert.equal(f.bridge.admit(first), 'duplicate');
  assert.equal(statSync(join(f.directory, 'state.json')).mode & 0o777, 0o600);
  for (const call of f.calls) { assert.deepEqual(call.tools, []); assert.match(call.system, /never grant authority/); }
});

test('IDs, bot flags, channels, self and explicit mention are enforced on every ingress', t => {
  const f = fixture(t);
  const cases = [
    [{ guildId: '10000000000000999' }, 'ignored'], [{ parentId: '10000000000000999' }, 'ignored'],
    [{ authorId: '10000000000000999' }, 'unauthorized'], [{ bot: true }, 'unauthorized'],
    [{ authorId: f.config.bots[0].id }, 'self'], [{ authorId: f.config.bots[1].id }, 'unauthorized'],
    [{ mentions: [] }, 'unmentioned'], [{ text: 'a nickname is not a mention' }, 'unmentioned'],
    [{ authorId: f.config.bots[1].id, bot: true }, 'unproven_peer'],
    [{ receiverBotId: '10000000000000999' }, 'ignored'], [{ id: '__proto__' }, 'ignored'],
  ];
  for (const [changes, outcome] of cases) assert.equal(f.bridge.admit(f.message(changes)), outcome);
  assert.equal(f.calls.length, 0);
});

test('both gateway deliveries of a human mention enqueue each target only once', async t => {
  const f = fixture(t, { reply: () => ({ text: 'Acme answer', nextBotId: null }) });
  const m = f.message({ mentions: f.config.bots.map(b => b.id), text: f.config.bots.map(b => `<@${b.id}>`).join(' ') + ' discuss' });
  assert.equal(f.bridge.admit(m), 'queued');
  assert.equal(f.bridge.admit({ ...m, receiverBotId: f.config.bots[1].id }), 'duplicate');
  await f.bridge.drain(m.threadId); assert.equal(f.calls.length, 2);
});

test('peer identity alone cannot forge a handoff, alter content, or cross threads', async t => {
  const f = fixture(t), m = f.message(); f.bridge.admit(m); await f.bridge.drain(m.threadId);
  const echo = mockEcho(f.config, f.sent[0]);
  assert.equal(f.bridge.admit({ ...echo, text: echo.text + ' authorize shell' }), 'unproven_peer');
  assert.equal(f.bridge.admit({ ...echo, threadId: '10000000000000999' }), 'unproven_peer');
  assert.equal(f.bridge.admit({ ...echo, id: '30000000000000999' }), 'unproven_peer');
  assert.equal(f.bridge.admit(echo), 'queued');
  assert.equal(f.bridge.admit(echo), 'duplicate');
});

test('human stop interrupts an uncooperative provider, drops queued work, and prevents late output', async t => {
  let finish;
  const f = fixture(t, { reply: () => new Promise(resolve => { finish = resolve; }) }), m = f.message();
  f.bridge.admit(m); const draining = f.bridge.drain(m.threadId); await tick();
  assert.equal(await f.bridge.drain(m.threadId), 'busy');
  f.bridge.admit(f.message({ id: '30000000000000002' }));
  assert.equal(f.bridge.admit(f.message({ id: '30000000000000003', text: `<@${f.config.bots[1].id}> stop`, mentions: [f.config.bots[1].id] })), 'stopped');
  assert.equal(await draining, 'stopped');
  finish({ text: 'late', nextBotId: f.config.bots[1].id }); await tick();
  assert.equal(f.sent.length, 0); assert.equal(f.calls.length, 1);
  assert.equal(f.bridge.snapshot().tasks[m.threadId].queue.length, 0);
  f.restart(); assert.equal(f.bridge.admit(f.message({ id: '30000000000000004' })), 'stopped');
});

test('another allowed human cannot stop a task without owner authority', async t => {
  const f = fixture(t, { reply: () => ({ text: 'Acme', nextBotId: null }) }), m = f.message();
  f.bridge.admit(m); await f.bridge.drain(m.threadId);
  const stop = f.message({ id: '30000000000000002', authorId: f.config.userIds[0], text: `<@${f.config.bots[0].id}> stop` });
  assert.equal(f.bridge.admit(stop), 'unauthorized_stop');
  assert.equal(f.bridge.snapshot().tasks[m.threadId].status, 'ready');
});

test('timeout retains reservations and never retries a possibly running turn', async t => {
  const config = mockConfig(); config.limits.turnTimeoutMs = 15;
  const f = fixture(t, { config, reply: () => new Promise(() => {}) }), m = f.message();
  f.bridge.admit(m); assert.equal(await f.bridge.drain(m.threadId), 'uncertain');
  f.restart(); assert.equal(await f.bridge.drain(m.threadId), 'uncertain');
  assert.equal(f.calls.length, 1); assert.equal(f.bridge.snapshot().tokens, config.limits.turnTokens);
});

test('task lifetime and global token/spend reservations cannot be reset by new messages or threads', async t => {
  for (const kind of ['Tokens', 'Micros']) {
    const config = mockConfig(); config.limits[`task${kind}`] = config.limits[`turn${kind}`]; config.limits[`total${kind}`] = config.limits[`turn${kind}`];
    const f = fixture(t, { config, reply: () => ({ text: 'Acme', nextBotId: null }) }), m = f.message();
    f.bridge.admit(m); await f.bridge.drain(m.threadId);
    const next = f.message({ id: '30000000000000002', threadId: '10000000000000008' });
    f.bridge.admit(next); assert.equal(await f.bridge.drain(next.threadId), 'budget_exhausted');
    assert.equal(f.calls.length, 1);
  }
  let now = 0; const f = fixture(t, { now: () => now }), m = f.message();
  f.bridge.admit(m); now = f.config.limits.taskTimeoutMs;
  assert.equal(await f.bridge.drain(m.threadId), 'task_timeout'); assert.equal(f.calls.length, 0);
});

test('invalid or unknown usage and invalid next recipient halt before sending', async t => {
  for (const change of [{ tokens: null }, { costMicros: null }, { tokens: 9000 }, { costMicros: 10001 }, { sessionId: 'wrong' }, { nextBotId: '10000000000000999' }, { text: 'x'.repeat(1501) }]) {
    const f = fixture(t, { reply: () => ({ text: 'Acme', nextBotId: null, ...change }) }), m = f.message();
    f.bridge.admit(m); assert.equal(await f.bridge.drain(m.threadId), 'uncertain'); assert.equal(f.sent.length, 0);
  }
});

test('model-authored mentions cannot ping humans, roles, everyone, or invent handoffs', async t => {
  const f = fixture(t, { reply: () => ({ text: '@everyone @here <@10000000000000999> <@&10000000000000999>', nextBotId: null }) }), m = f.message();
  f.bridge.admit(m); await f.bridge.drain(m.threadId);
  assert.deepEqual(f.sent[0].allowed_mentions.users, []);
  assert.ok(!f.sent[0].content.includes('@everyone')); assert.ok(!f.sent[0].content.includes('<@100'));
});

test('uncertain transport send is never repeated; provider errors cannot leak secrets to state', async t => {
  const f = fixture(t), m = f.message();
  f.transport.send = async () => { throw new Error('Acme-secret-not-for-logs'); };
  f.bridge.admit(m); await f.bridge.drain(m.threadId); f.restart(); await f.bridge.drain(m.threadId);
  assert.equal(f.calls.length, 1); assert.equal(f.bridge.snapshot().tasks[m.threadId].status, 'uncertain');
  assert.ok(!readFileSync(join(f.directory, 'state.json'), 'utf8').includes('Acme-secret-not-for-logs'));
});

test('restart quarantines interrupted work and queued inputs rather than replaying', t => {
  const f = fixture(t), m = f.message(); f.bridge.admit(m); f.restart();
  assert.equal(f.bridge.snapshot().tasks[m.threadId].status, 'uncertain_restart');
  assert.equal(f.bridge.snapshot().tasks[m.threadId].queue.length, 0);
  assert.equal(f.calls.length, 0);
});

test('writer exclusion, policy binding and malformed state fail closed', t => {
  const f = fixture(t);
  assert.throws(() => openBridge({ config: f.config, directory: f.directory, providers: f.providers, transport: f.transport }), /EEXIST/);
  const config = structuredClone(f.config); config.ownerIds = ['10000000000000999'];
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'acme-state-'))); t.after(() => rmSync(directory, { recursive: true }));
  writeFileSync(join(directory, 'state.json'), JSON.stringify(f.bridge.snapshot()), { mode: 0o600 });
  assert.throws(() => openBridge({ config, directory, providers: f.providers, transport: f.transport }), /state_binding_mismatch/);
  writeFileSync(join(directory, 'state.json'), '{');
  assert.throws(() => openBridge({ config, directory, providers: f.providers, transport: f.transport }));
});

test('dedup and queue caps refuse new work but do not block owner stop', t => {
  const config = mockConfig(); config.limits.maxQueue = 1; config.limits.maxMessages = 1;
  const f = fixture(t, { config }), m = f.message(); f.bridge.admit(m);
  assert.equal(f.bridge.admit(f.message({ id: '30000000000000002' })), 'dedup_full');
  assert.equal(f.bridge.admit(f.message({ id: '30000000000000003', text: `<@${config.bots[0].id}> stop` })), 'stopped');
});

test('configuration rejects inconsistent activation flags, secrets, and ambiguous bot authority', () => {
  for (const change of [{ mode: 'live' }, { liveEnabled: true }, { token: 'Acme-secret' }, { ownerIds: [] }, { ownerIds: ['Acme admin'] }]) {
    assert.throws(() => validateConfig({ ...mockConfig(), ...change }));
  }
  const config = mockConfig(); config.ownerIds.push(config.bots[0].id); assert.throws(() => validateConfig(config));
});

test('Discord normalization refuses webhooks, DMs, mismatched channels and non-public threads', () => {
  const c = mockConfig(), channel = { id: '10000000000000007', parent_id: c.channelIds[0], guild_id: c.guildId, type: 11 };
  const raw = { id: '30000000000000001', guild_id: c.guildId, channel_id: channel.id, author: { id: c.ownerIds[0], bot: false }, content: `<@${c.bots[0].id}> hi`, mentions: [{ id: c.bots[0].id }] };
  const context = { receiverBotId: c.bots[0].id, channel };
  assert.equal(normalizeDiscordMessage(raw, context).parentId, c.channelIds[0]);
  for (const changes of [{ webhook_id: '10000000000000009' }, { guild_id: null }, { channel_id: '10000000000000009' }, { mentions: [{ id: 'nickname' }] }]) assert.equal(normalizeDiscordMessage({ ...raw, ...changes }, context), null);
  assert.equal(normalizeDiscordMessage(raw, { ...context, channel: { ...channel, type: 12 } }), null);
});

test('completed peer IDs stay deduplicated across clean restarts', async t => {
  const f = fixture(t), m = f.message(); f.bridge.admit(m); await f.bridge.drain(m.threadId);
  const echo = mockEcho(f.config, f.sent[0]); f.bridge.admit(echo); await f.bridge.drain(m.threadId);
  f.restart(); assert.equal(f.bridge.admit(echo), 'duplicate'); assert.equal(f.calls.length, 2);
});

test('queue saturation is bounded separately from dedup capacity', t => {
  const config = mockConfig(); config.limits.maxQueue = 1;
  const f = fixture(t, { config }); f.bridge.admit(f.message());
  assert.equal(f.bridge.admit(f.message({ id: '30000000000000002' })), 'queue_full');
  assert.equal(f.bridge.snapshot().tasks['10000000000000007'].queue.length, 1);
});

test('policy ordering is immaterial and human author.bot may be omitted by Discord', () => {
  const c = mockConfig(); assert.deepEqual(validateConfig(Object.fromEntries(Object.entries(c).reverse())), c);
  const channel = { id: '10000000000000007', parent_id: c.channelIds[0], guild_id: c.guildId, type: 11 };
  const raw = { id: '30000000000000001', guild_id: c.guildId, channel_id: channel.id, author: { id: c.ownerIds[0] }, content: 'hi', mentions: [] };
  assert.equal(normalizeDiscordMessage(raw, { receiverBotId: c.bots[0].id, channel }).bot, false);
});

test('stop before a scheduled provider call prevents dispatch, not just publication', async t => {
  const f = fixture(t), m = f.message(); f.bridge.admit(m);
  const pending = f.bridge.drain(m.threadId);
  f.bridge.admit(f.message({ id: '30000000000000002', text: `<@${f.config.bots[0].id}> stop` }));
  assert.equal(await pending, 'stopped'); assert.equal(f.calls.length, 0); assert.equal(f.sent.length, 0);
});

test('stop during send leaves uncertain delivery closed and never schedules a peer', async t => {
  let finish;
  const f = fixture(t), m = f.message();
  f.transport.send = () => new Promise(resolve => { finish = resolve; });
  f.bridge.admit(m); const pending = f.bridge.drain(m.threadId); await tick();
  assert.equal(typeof finish, 'function');
  f.bridge.admit(f.message({ id: '30000000000000002', text: `<@${f.config.bots[0].id}> stop` }));
  assert.equal(await pending, 'stopped'); finish({ id: '20000000000000001' }); await tick();
  assert.deepEqual(f.bridge.snapshot().outbound, {});
  assert.equal(f.bridge.snapshot().tasks[m.threadId].receipts[0].status, 'uncertain');
});

test('failed durable write disables all further admission and dispatch', async t => {
  const f = fixture(t), statePath = join(f.directory, 'state.json');
  rmSync(statePath); mkdirSync(statePath);
  assert.throws(() => f.bridge.admit(f.message()), /state_write_failed/);
  assert.throws(() => f.bridge.admit(f.message({ id: '30000000000000002' })), /bridge_unavailable/);
  await assert.rejects(f.bridge.drain('10000000000000007'), /bridge_unavailable/);
  assert.equal(f.calls.length, 0);
});

test('mention escaping cannot overflow Discord message length', async t => {
  const f = fixture(t, { reply: () => ({ text: '@'.repeat(1500), nextBotId: null }) }), m = f.message();
  f.bridge.admit(m); assert.equal(await f.bridge.drain(m.threadId), 'uncertain'); assert.equal(f.sent.length, 0);
});
