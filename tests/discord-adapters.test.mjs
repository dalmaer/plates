import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { readFileSync, writeFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonRpc } from '../lib/discord-pilot/rpc.mjs';
import { createCodexAdapter, codexConversationConfig } from '../lib/discord-pilot/codex.mjs';
import { createClaudeAdapter } from '../lib/discord-pilot/claude.mjs';
import { createDiscordAdapter } from '../lib/discord-pilot/discord.mjs';
import { inspectDeployment, issueLivePermit } from '../lib/discord-pilot/activation.mjs';
import { startPilot } from '../lib/discord-pilot/service.mjs';
import { createAdmissionGuard, runtimeBinding, usageResult } from '../lib/discord-pilot/runtime.mjs';
import { reviewHost, runEntrypoint } from '../lib/discord-pilot/entrypoint.mjs';
import { openBridge } from '../lib/discord-pilot/bridge.mjs';
import { mockAdapters, mockConfig, mockMessage } from '../lib/discord-pilot/mock.mjs';
import { failureDetails, rpcFailure } from '../lib/discord-pilot/diagnostics.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const policy = runtime => ({ model: `acme-${runtime}`, accountScope: 'acme-project', authMode: 'api-key', version: 'acme-1', cwd: `/acme/state/runtimes/${runtime}/workspace`, microUsdPerToken: 2 });
const guard = { async admit(r) { return { binding: r.binding, budgetPolicy: 'admission-estimates', maxTokens: r.maxTokens, maxCostMicros: r.maxCostMicros }; } };
function request() {
  const controller = new AbortController(), bound = [], cancellations = [];
  const r = { sessionId: 'acme-local-session', providerSession: null, system: 'Conversation only', history: [], tools: [],
    input: { text: 'Acme discussion', provenance: { kind: 'human', messageId: '30000000000000001' } },
    peerBotId: '10000000000000006', maxTokens: 1000, maxCostMicros: 10_000, signal: controller.signal,
    bindProviderSession(value) { bound.push(value); r.providerSession = value; }, recordCancellation(value) { cancellations.push(value); } };
  return { r, controller, bound, cancellations };
}
function codexRpc({ complete = true, tool = false, onStart } = {}) {
  const calls = [], listeners = new Set(); let turns = 0;
  const emit = (method, params) => { for (const listener of listeners) listener({ method, params }); };
  const rpc = { calls, emit, notify(method) { calls.push({ method }); }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async request(method, params) {
      calls.push({ method, params });
      if (method === 'thread/start' || method === 'thread/resume') return { model: 'acme-codex', cwd: policy('codex').cwd, instructionSources: [], thread: { id: 'acme-provider-thread' } };
      if (method === 'turn/start') {
        const turnId = `turn-${++turns}`; onStart?.(params);
        queueMicrotask(() => {
          const context = { threadId: params.threadId, turnId };
          if (tool) emit('item/started', { ...context, item: { type: 'commandExecution' } });
          if (complete) {
            emit('item/agentMessage/delta', { ...context, delta: '{"text":"Acme reply","handoff":true}' });
            emit('thread/tokenUsage/updated', { ...context, tokenUsage: { last: { totalTokens: 100 } } });
            emit('turn/completed', { threadId: params.threadId, turn: { id: turnId, status: 'completed' } });
          }
        });
        return { turn: { id: turnId } };
      }
      if (method === 'turn/interrupt') queueMicrotask(() => emit('turn/completed', { threadId: params.threadId, turn: { id: params.turnId, status: 'interrupted' } }));
      return {};
    } };
  return rpc;
}

test('JSONL RPC correlates responses, decodes split Unicode, refuses server requests and redacts errors', async () => {
  const input = new PassThrough(), writes = [];
  const output = new Writable({ write(chunk, _, done) { writes.push(JSON.parse(chunk.toString())); done(); } });
  const rpc = createJsonRpc({ input, output, timeoutMs: 100 }), events = [];
  rpc.subscribe(e => events.push(e));
  const pending = rpc.request('initialize', {}); input.write(JSON.stringify({ id: writes[0].id, result: { ok: true } }) + '\n');
  assert.deepEqual(await pending, { ok: true });
  const bytes = Buffer.from(JSON.stringify({ method: 'acme', params: { text: 'é' } }) + '\n');
  const index = bytes.indexOf(Buffer.from('é')) + 1; input.write(bytes.subarray(0, index)); input.write(bytes.subarray(index));
  assert.equal(events[0].params.text, 'é');
  input.write(JSON.stringify({ id: 99, method: 'item/commandExecution/requestApproval', params: {} }) + '\n');
  assert.equal(writes.at(-1).error.code, -32601);
  const rejected = rpc.request('acme'); input.write(JSON.stringify({ id: writes.at(-1).id, error: { message: 'Acme-secret' } }) + '\n');
  await assert.rejects(rejected, error => error.message === 'rpc_remote_error');
  const invalid = rpc.request('thread/start');
  input.write(JSON.stringify({ id: writes.at(-1).id, error: { code: -32602, message: 'Acme-secret', data: { apiKey: 'Acme-secret' } } }) + '\n');
  await assert.rejects(invalid, error => {
    assert.deepEqual(failureDetails(error), { code: 'rpc_invalid_params', method: 'thread/start', rpcCode: -32602 });
    assert.equal(JSON.stringify(error).includes('Acme-secret'), false); return true;
  }); rpc.close();
});

test('disabled and unverified runtime adapters never touch the connection', async () => {
  const rpc = codexRpc(), f = request();
  await assert.rejects(createCodexAdapter({ rpc, policy: policy('codex'), guard }).turn(f.r), /live_disabled/);
  await assert.rejects(createCodexAdapter({ enabled: true, rpc, policy: policy('codex') }).turn(f.r), /guard_unavailable/);
  assert.equal(rpc.calls.length, 0);
  let invoked = false;
  await assert.rejects(createClaudeAdapter({ query() { invoked = true; }, policy: policy('claude'), guard }).turn(f.r), /live_disabled/);
  assert.equal(invoked, false);
});

test('Codex binds the returned provider thread before generation, then resumes that exact thread', async () => {
  const f = request(), rpc = codexRpc({ onStart() { assert.equal(f.bound.length > 0, true); } });
  const provider = createCodexAdapter({ enabled: true, rpc, policy: policy('codex'), guard });
  const first = await provider.turn(f.r); assert.equal(first.text, 'Acme reply'); assert.equal(first.tokens, 100); assert.equal(first.costMicros, 200);
  await provider.turn(f.r);
  assert.equal(rpc.calls.filter(c => c.method === 'initialize').length, 1);
  assert.equal(rpc.calls.find(c => c.method === 'thread/resume').params.threadId, 'acme-provider-thread');
  const start = rpc.calls.find(c => c.method === 'thread/start'); assert.deepEqual(start.params.dynamicTools, []);
  assert.equal(start.params.config['features.shell_tool'], false); assert.equal(start.params.permissions, 'discord-conversation');
  assert.equal(start.params.sandbox, undefined);
  assert.deepEqual(start.params.config['permissions.discord-conversation.filesystem'], { ':root': 'deny', ':minimal': 'read', ':workspace_roots': { '.': 'read' } });
  assert.equal(start.params.config['permissions.discord-conversation.network.enabled'], false);
  assert.equal('environments' in rpc.calls.find(c => c.method === 'thread/resume').params, false);
  assert.equal(Object.values(codexConversationConfig).includes(true), false);
});

test('Codex cancellation sends interrupt and waits for streamed terminal status', async () => {
  const f = request(), rpc = codexRpc({ complete: false });
  const pending = createCodexAdapter({ enabled: true, rpc, policy: policy('codex'), guard }).turn(f.r);
  await tick(); f.controller.abort(); await assert.rejects(pending, /runtime_interrupted/);
  assert.equal(rpc.calls.at(-1).method, 'turn/interrupt'); assert.deepEqual(f.cancellations, [{ confirmed: true }]);
});

test('Codex records initialization versus session failure without exposing remote messages', async () => {
  for (const [method, phase] of [['initialize', 'initialize'], ['thread/start', 'session_start']]) {
    const rpc = codexRpc(), original = rpc.request;
    rpc.request = (name, params) => name === method ? Promise.reject(rpcFailure(method, -32602)) : original(name, params);
    await assert.rejects(createCodexAdapter({ enabled: true, rpc, policy: policy('codex'), guard }).turn(request().r), error => {
      assert.deepEqual(failureDetails(error), { code: 'rpc_invalid_params', method, rpcCode: -32602, phase }); return true;
    });
    assert.equal(rpc.calls.some(c => c.method === 'turn/start'), false);
  }
});

test('Codex accepts omitted empty instruction sources but rejects explicit nonempty or malformed sources', async () => {
  for (const sources of [undefined, null, ['Acme instructions'], {}]) {
    const rpc = codexRpc(), original = rpc.request;
    rpc.request = async (method, params) => { const result = await original(method, params);
      if (method === 'thread/start') { if (sources === undefined) delete result.instructionSources; else result.instructionSources = sources; } return result; };
    const pending = createCodexAdapter({ enabled: true, rpc, policy: policy('codex'), guard }).turn(request().r);
    if (sources === undefined) assert.equal((await pending).text, 'Acme reply');
    else await assert.rejects(pending, error => { assert.equal(failureDetails(error).phase, 'session_validate'); return true; });
  }
});

test('Codex cancellation without terminal acknowledgement stays uncertain', async () => {
  const f = request(), rpc = codexRpc({ complete: false }), original = rpc.request;
  rpc.request = async (method, params) => method === 'turn/interrupt' ? {} : original(method, params);
  const pending = createCodexAdapter({ enabled: true, rpc, policy: policy('codex'), guard, cancellationMs: 10 }).turn(f.r);
  await tick(); f.controller.abort(); await assert.rejects(pending, /runtime_interrupted/);
  assert.deepEqual(f.cancellations, [{ confirmed: false }]);
});

test('Codex rejects tool events, changed session bindings, missing usage and incorrect host models', async () => {
  const f = request();
  await assert.rejects(createCodexAdapter({ enabled: true, rpc: codexRpc({ tool: true }), policy: policy('codex'), guard }).turn(f.r));
  f.r.providerSession = { runtime: 'codex', id: 'acme-other-thread', binding: 'wrong' };
  const rpc = codexRpc(); await assert.rejects(createCodexAdapter({ enabled: true, rpc, policy: policy('codex'), guard }).turn(f.r), /session_binding/);
  assert.equal(rpc.calls.length, 0);
  const bad = codexRpc(), original = bad.request;
  bad.request = async (method, params) => { const result = await original(method, params); if (method === 'thread/start') result.model = 'other'; return result; };
  await assert.rejects(createCodexAdapter({ enabled: true, rpc: bad, policy: policy('codex'), guard }).turn(request().r), /runtime_mismatch/);
});

function claudeQuery({ pause = false, tools = [], resultChange = {}, queued = [] } = {}) {
  const calls = []; let interruptResolve;
  const query = args => {
    calls.push(args);
    const interrupted = new Promise(resolve => { interruptResolve = resolve; });
    const stream = (async function* () {
      yield { type: 'system', subtype: 'init', session_id: 'acme-claude-session', model: 'acme-claude', tools };
      if (pause) await interrupted;
      yield { type: 'result', subtype: 'success', session_id: 'acme-claude-session', is_error: false,
        result: '{"text":"Acme Claude reply","handoff":false}', usage: { input_tokens: 50, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        total_cost_usd: 0.0002, modelUsage: { 'acme-claude': {} }, permission_denials: [], ...resultChange };
    })();
    stream.interrupt = async () => { interruptResolve(); return { still_queued: queued }; };
    return stream;
  };
  return { query, calls };
}
const environment = { HOME: '/acme/state/runtimes/claude/home', PATH: '/usr/bin', ANTHROPIC_API_KEY: 'Acme-fake-key' };

test('Claude uses deny-all policy, isolated env, streamed session binding and explicit resume', async () => {
  const f = request(), sdk = claudeQuery();
  const adapter = createClaudeAdapter({ enabled: true, ...sdk, policy: policy('claude'), guard, environment });
  const result = await adapter.turn(f.r); assert.equal(result.text, 'Acme Claude reply'); assert.equal(f.bound[0].id, 'acme-claude-session');
  await adapter.turn(f.r);
  assert.equal(sdk.calls[1].options.resume, 'acme-claude-session'); assert.equal('continue' in sdk.calls[1].options, false);
  assert.equal(sdk.calls[0].options.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  assert.deepEqual(sdk.calls[0].options.disallowedTools, ['*']); assert.deepEqual(sdk.calls[0].options.tools, []);
  assert.deepEqual(sdk.calls[0].options.settingSources, []); assert.equal(sdk.calls[0].options.maxTurns, 1);
  assert.deepEqual(Object.keys(sdk.calls[0].options.env).sort(), ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'CLAUDE_CODE_MAX_RETRIES', 'HOME', 'MAX_STRUCTURED_OUTPUT_RETRIES', 'PATH']);
  assert.equal(sdk.calls[0].options.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, '1000');
  assert.equal(sdk.calls[0].options.strictMcpConfig, true);
  const message = (await sdk.calls[0].prompt.next()).value;
  assert.equal(message.type, 'user'); assert.ok(!message.message.content.includes('Acme-fake-key'));
});

test('Claude interrupts its stream and treats post-stop output as cancellation, not a reply', async () => {
  const f = request(), sdk = claudeQuery({ pause: true });
  const pending = createClaudeAdapter({ enabled: true, ...sdk, policy: policy('claude'), guard, environment }).turn(f.r);
  await tick(); f.controller.abort(); await assert.rejects(pending, /runtime_interrupted/);
  assert.deepEqual(f.cancellations, [{ confirmed: true }]);
});

test('Claude rejects unexpected tools, missing cost and leaked transport environment', async () => {
  for (const options of [{ tools: ['Bash'] }, { resultChange: { total_cost_usd: null } }, { resultChange: { usage: {} } }]) {
    await assert.rejects(createClaudeAdapter({ enabled: true, ...claudeQuery(options), policy: policy('claude'), guard, environment }).turn(request().r));
  }
  await assert.rejects(createClaudeAdapter({ enabled: true, ...claudeQuery(), policy: policy('claude'), guard,
    environment: { ...environment, DISCORD_TOKEN: 'Acme-secret' } }).turn(request().r), /environment/);
});

function discordFixture(t, { post429 = false, early = false, identityWrong = false, trial = null, threadOwner = null } = {}) {
  const config = mockConfig(), messages = [], faults = [], fetches = [], sockets = [], posts = [];
  if (trial) config.trial = trial;
  const tokens = Object.fromEntries(config.bots.map((b, i) => [b.id, `Acme-token-${i}`]));
  const threadId = '10000000000000007';
  class Socket {
    constructor(url) { this.url = url; this.readyState = 1; this.listeners = new Map(); sockets.push(this); queueMicrotask(() => this.emit({ op: 10, d: { heartbeat_interval: 45000 } })); }
    addEventListener(name, fn) { this.listeners.set(name, [...this.listeners.get(name) ?? [], fn]); }
    emit(packet) { for (const fn of this.listeners.get('message') ?? []) fn({ data: JSON.stringify(packet) }); }
    send(bytes) {
      const packet = JSON.parse(bytes); this.sent ??= []; this.sent.push(packet);
      if (packet.op === 2) {
        const id = config.bots.find(b => tokens[b.id] === packet.d.token).id;
        queueMicrotask(() => this.emit({ op: 0, t: 'READY', s: 1, d: { user: { id, bot: true }, session_id: `session-${id}`, resume_gateway_url: 'wss://gateway.discord.gg/', guilds: [{ id: config.guildId }] } }));
      }
      if (packet.op === 6) queueMicrotask(() => this.emit({ op: 0, t: 'RESUMED', s: 2, d: {} }));
      if (packet.op === 1) queueMicrotask(() => this.emit({ op: 11, d: null }));
    }
    close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; for (const fn of this.listeners.get('close') ?? []) fn({ code }); }
  }
  const fetcher = async (url, options) => {
    fetches.push({ url, options }); const bot = config.bots.find(b => options.headers.Authorization === `Bot ${tokens[b.id]}`);
    assert.ok(bot);
    let value;
    if (url.endsWith('/users/@me')) value = { id: identityWrong ? '10000000000000999' : bot.id, bot: true };
    else if (url.endsWith('/gateway/bot')) value = { url: 'wss://gateway.discord.gg/', session_start_limit: { remaining: 10 } };
    else if (options.method === 'GET') value = { id: url.split('/').at(-1), guild_id: config.guildId, parent_id: config.channelIds[0], type: 11, owner_id: threadOwner ?? config.ownerIds[0] };
    else {
      const body = JSON.parse(options.body); posts.push(body);
      value = { id: '20000000000000001', channel_id: threadId, guild_id: config.guildId, author: { id: bot.id, bot: true }, content: body.content, mentions: body.allowed_mentions.users.map(id => ({ id })) };
      if (early) { sockets[1].emit({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: value }); await tick(); }
      if (post429) return new Response(JSON.stringify({ retry_after: 1 }), { status: 429 });
    }
    return new Response(JSON.stringify(value), { status: 200 });
  };
  const adapter = createDiscordAdapter({ enabled: true, config, credentials: tokens, fetcher, Socket, reconnectMs: 1,
    onMessage: m => messages.push(m), onFault: code => faults.push(code) });
  t.after(() => adapter.stop());
  const outbound = () => ({ botId: config.bots[0].id, guildId: config.guildId, threadId,
    content: `Acme reply <@${config.bots[1].id}>`, allowed_mentions: { parse: [], users: [config.bots[1].id], roles: [], replied_user: false }, operationId: 'acme-operation', signal: new AbortController().signal });
  return { config, adapter, sockets, fetches, posts, messages, faults, outbound, tokens, fetcher, Socket };
}

test('Discord remains inert by default and verifies bot identity before Gateway identify', async t => {
  let calls = 0;
  const disabled = createDiscordAdapter({ config: mockConfig(), fetcher() { calls++; }, Socket: class { constructor() { calls++; } } });
  await assert.rejects(disabled.start(), /disabled/); assert.equal(calls, 0);
  const f = discordFixture(t, { identityWrong: true }); await assert.rejects(f.adapter.start(), /start_failed/); assert.equal(f.sockets.length, 0);
});

test('exact trial thread is checked before Discord metadata fetch or message send', async t => {
  const f = discordFixture(t, { trial: { threadId: '10000000000000007' } }); await f.adapter.start();
  const before = f.fetches.length;
  f.sockets[0].emit({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: { id: '30000000000000001', guild_id: f.config.guildId,
    channel_id: '10000000000000999', author: { id: f.config.ownerIds[0] },
    content: `<@${f.config.bots[0].id}> Acme`, mentions: [{ id: f.config.bots[0].id }] } });
  await tick(); assert.equal(f.fetches.length, before); assert.equal(f.messages.length, 0);
  await assert.rejects(f.adapter.send({ ...f.outbound(), threadId: '10000000000000999' }), /scope/);
  assert.equal(f.fetches.length, before); assert.equal(f.posts.length, 0);
});

test('runtime output schemas carry the reply bound and Claude receives a separate output ceiling', async () => {
  const f = request(); f.r.maxReplyChars = 600; f.r.maxOutputTokens = 256;
  const rpc = codexRpc(); await createCodexAdapter({ enabled: true, rpc, policy: policy('codex'), guard }).turn(f.r);
  assert.equal(rpc.calls.find(c => c.method === 'turn/start').params.outputSchema.properties.text.maxLength, 600);
  const g = request(); g.r.maxReplyChars = 600; g.r.maxOutputTokens = 256;
  const sdk = claudeQuery(); await createClaudeAdapter({ enabled: true, ...sdk, policy: policy('claude'), guard, environment }).turn(g.r);
  assert.equal(sdk.calls[0].options.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, '256');
  assert.equal(sdk.calls[0].options.outputFormat.schema.properties.text.maxLength, 600);
});

test('the exact trial thread must also have the configured human owner', async t => {
  const f = discordFixture(t, { trial: { threadId: '10000000000000007' }, threadOwner: '10000000000000999' });
  await f.adapter.start();
  f.sockets[0].emit({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: { id: '30000000000000001', guild_id: f.config.guildId,
    channel_id: '10000000000000007', author: { id: f.config.ownerIds[0] },
    content: `<@${f.config.bots[0].id}> Acme`, mentions: [{ id: f.config.bots[0].id }] } });
  await tick(); assert.equal(f.messages.length, 0);
  await assert.rejects(f.adapter.send(f.outbound()), /channel_scope/); assert.equal(f.posts.length, 0);
});

test('Discord REST preserves allowed_mentions, uses stable nonce, and gates early echoes on durable commit', async t => {
  const f = discordFixture(t, { early: true }); await f.adapter.start();
  const sent = await f.adapter.send(f.outbound());
  assert.deepEqual(f.posts[0].allowed_mentions, f.outbound().allowed_mentions); assert.equal(f.posts[0].enforce_nonce, true);
  assert.equal(f.posts[0].nonce.length, 24); assert.equal(f.messages.length, 0);
  f.adapter.committed(sent.id); assert.equal(f.messages.length, 1); assert.equal(f.messages[0].authorId, f.config.bots[0].id);
  assert.equal(f.sockets[0].sent[0].d.intents, 513);
});

test('Discord never retries rate-limited sends or allows arbitrary mentions', async t => {
  const f = discordFixture(t, { post429: true }); await f.adapter.start();
  await assert.rejects(f.adapter.send({ ...f.outbound(), allowed_mentions: { parse: ['everyone'], users: [], roles: [], replied_user: false } }), /scope/);
  await assert.rejects(f.adapter.send(f.outbound()), /uncertain/); assert.equal(f.posts.length, 1);
  await assert.rejects(f.adapter.send(f.outbound())); assert.equal(f.posts.length, 1);
});

test('Discord resumes an authenticated Gateway session with sequence, and persistent core owns dedup', async t => {
  const f = discordFixture(t); await f.adapter.start();
  f.sockets[0].emit({ op: 0, t: 'ACME_EVENT', s: 12, d: {} });
  f.sockets[0].emit({ op: 7 }); await new Promise(resolve => setTimeout(resolve, 10));
  const resumed = f.sockets.at(-1).sent.find(p => p.op === 6);
  assert.equal(resumed.d.seq, 12); assert.equal(resumed.d.session_id, `session-${f.config.bots[0].id}`); assert.deepEqual(f.faults, []);
});

test('deployment validation and start refuse missing approval/host before reading credentials', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../scripts/discord-pilot/deployment.example.json', import.meta.url)));
  const report = inspectDeployment(manifest); assert.equal(report.liveStarted, false); assert.equal(report.credentialReads, 0);
  assert.ok(report.blockers.includes('live_disabled'));
  let reads = 0; const host = { loadSecret() { reads++; } };
  await assert.rejects(startPilot({ manifest, approvalDigest: report.digest, host }), /not_approved/);
  manifest.enabled = true; manifest.stateDirectory = '/acme/state'; manifest.runtimes = { codex: policy('codex'), claude: policy('claude') };
  manifest.authSecrets = { codex: 'keychain:acme.codex', claude: 'keychain:acme.claude' };
  const ready = inspectDeployment(manifest); assert.equal(ready.readyForHostValidation, true);
  await assert.rejects(startPilot({ manifest, approvalDigest: 'wrong', host }), /not_approved/);
  await assert.rejects(startPilot({ manifest, approvalDigest: ready.digest, host }), /isolated_host/);
  assert.equal(reads, 0);
});

test('admission allowances do not claim provider billing guarantees and reject larger or rebound turns', async () => {
  const f = request(), binding = runtimeBinding('codex', policy('codex'));
  const admission = createAdmissionGuard({ codex: binding }, { turnTokens: 1000, turnMicros: 10_000 });
  const turn = { ...f.r, runtime: 'codex', binding };
  assert.equal((await admission.admit(turn)).budgetPolicy, 'admission-estimates');
  await assert.rejects(admission.admit({ ...turn, binding: 'changed' }), /denied/);
  await assert.rejects(admission.admit({ ...turn, maxCostMicros: 10_001 }), /denied/);
  await assert.rejects(admission.admit({ ...turn, maxTokens: 1001 }), /denied/);
  assert.throws(() => usageResult(f.r, policy('codex'), 1001), /usage/);
  assert.throws(() => usageResult(f.r, policy('codex'), 100, 10_001), /cost/);
  f.controller.abort(); await assert.rejects(admission.admit(turn), /denied/);
});

test('entrypoint dry-run never imports a host; start requires complete policy and both exact digests', async t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'acme-entrypoint-')));
  t.after(() => rmSync(directory, { recursive: true }));
  const manifest = JSON.parse(readFileSync(new URL('../scripts/discord-pilot/deployment.example.json', import.meta.url)));
  const path = join(directory, 'manifest.json'), hostPath = join(directory, 'host.mjs');
  writeFileSync(path, JSON.stringify(manifest)); writeFileSync(hostPath, '// Acme reviewed host fixture\n');
  let imports = 0, starts = 0;
  const host = {}, dependencies = { async loadHost() { imports++; return { createHost: async () => host }; },
    async start(request) { starts++; assert.equal(request.host, host); return { status: 'running', async stop() {} }; } };
  const dry = await runEntrypoint(['dry-run', path, '--host', '/not/read.mjs', '--json'], dependencies);
  assert.equal(dry.report.providerBillHardCap, false); assert.equal(imports, 0);
  const missingThread = structuredClone(manifest); missingThread.policy.trial.threadId = null;
  writeFileSync(path, JSON.stringify(missingThread));
  const missing = await runEntrypoint(['dry-run', path, '--json'], dependencies);
  assert.ok(missing.report.blockers.includes('trial_thread_required')); assert.equal(imports, 0);
  await assert.rejects(runEntrypoint(['start', path, '--approve', missing.report.digest], dependencies), /not_approved/);
  writeFileSync(path, JSON.stringify(manifest));
  const flags = ['--host', hostPath, '--approve-host', reviewHost(hostPath)];
  await assert.rejects(runEntrypoint(['start', path, ...flags, '--approve', dry.report.digest], dependencies), /not_approved/);
  manifest.enabled = true; manifest.stateDirectory = '/acme/state'; manifest.runtimes = { codex: policy('codex'), claude: policy('claude') };
  manifest.authSecrets = { codex: 'keychain:acme.codex', claude: 'keychain:acme.claude' };
  writeFileSync(path, JSON.stringify(manifest));
  const report = inspectDeployment(manifest);
  await assert.rejects(runEntrypoint(['start', path, ...flags, '--approve', dry.report.digest], dependencies), /not_approved/);
  writeFileSync(hostPath, '// Acme changed host\n');
  await assert.rejects(runEntrypoint(['start', path, ...flags, '--approve', report.digest], dependencies), /host_module_not_approved/);
  assert.equal(imports, 0); assert.equal(starts, 0);
  const started = await runEntrypoint(['start', path, '--host', hostPath, '--approve-host', reviewHost(hostPath), '--approve', report.digest], dependencies);
  assert.equal(started.report.liveStarted, true); assert.equal(imports, 1); assert.equal(starts, 1);
  manifest.hostPolicy.mode = 'model-api';
  assert.ok(inspectDeployment(manifest).blockers.includes('unsupported_host_policy'));
});

test('core durably binds provider sessions and refuses live adapters without a permit', async t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'acme-live-contract-'))); t.after(() => rmSync(directory, { recursive: true }));
  const config = { ...mockConfig(), mode: 'live', liveEnabled: true }, adapters = mockAdapters(() => ({ text: 'Acme', nextBotId: null }));
  const providers = Object.fromEntries(['codex', 'claude'].map(runtime => [runtime, { mode: 'live', async turn(r) {
    r.bindProviderSession({ runtime, binding: 'a'.repeat(64), id: `acme-${runtime}-session` });
    const disk = JSON.parse(readFileSync(join(directory, 'state.json')));
    assert.equal(disk.tasks['10000000000000007'].sessions[runtime].provider.id, `acme-${runtime}-session`);
    return { sessionId: r.sessionId, text: 'Acme', nextBotId: null, tokens: 10, costMicros: 10 };
  } }]));
  const transport = { ...adapters.transport, mode: 'live' };
  assert.throws(() => openBridge({ config, directory, providers, transport }), /authorization_required/);
  const livePermit = issueLivePermit(config, 'acme-deployment');
  let bridge = openBridge({ config, directory, providers, transport, livePermit });
  const m = mockMessage(config); bridge.admit(m); await bridge.drain(m.threadId); bridge.close();
  bridge = openBridge({ config, directory, providers, transport, livePermit });
  assert.equal(bridge.snapshot().tasks[m.threadId].sessions.codex.provider.id, 'acme-codex-session'); bridge.close();
});

test('reported budget overruns retain evidence and stop new tasks across restart', async t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'acme-overrun-')));
  t.after(() => rmSync(directory, { recursive: true }));
  const config = mockConfig(), adapters = mockAdapters();
  adapters.providers.codex.turn = async r => {
    r.recordUsage({ tokens: r.maxTokens + 1, costMicros: r.maxCostMicros + 1 });
    throw new Error('Acme overrun');
  };
  let bridge = openBridge({ config, directory, ...adapters });
  const m = mockMessage(config); bridge.admit(m); await bridge.drain(m.threadId);
  const state = bridge.snapshot();
  assert.equal(state.budgetOverrun, true); assert.equal(state.tasks[m.threadId].status, 'budget_overrun');
  assert.equal(state.tasks[m.threadId].receipts[0].costMicros, config.limits.turnMicros + 1);
  bridge.close(); bridge = openBridge({ config, directory, ...adapters });
  assert.equal(bridge.admit({ ...m, id: '30000000000000999', threadId: '10000000000000999' }), 'budget_overrun');
  assert.equal(bridge.admit({ ...m, id: '30000000000000998', text: `<@${config.bots[0].id}> stop` }), 'stopped');
  bridge.close();
});

test('tool-policy violations quarantine the runtime for subsequent turns', async () => {
  const rpc = codexRpc({ tool: true }), provider = createCodexAdapter({ enabled: true, rpc, policy: policy('codex'), guard });
  await assert.rejects(provider.turn(request().r)); const before = rpc.calls.length;
  await assert.rejects(provider.turn(request().r), /quarantined/); assert.equal(rpc.calls.length, before);
  const sdk = claudeQuery({ tools: ['Bash'] }), claude = createClaudeAdapter({ enabled: true, ...sdk, policy: policy('claude'), guard, environment });
  await assert.rejects(claude.turn(request().r)); await assert.rejects(claude.turn(request().r), /quarantined/); assert.equal(sdk.calls.length, 1);
});

test('Codex rejects missing final token usage rather than recording zero', async () => {
  const rpc = codexRpc({ complete: false }), original = rpc.request;
  rpc.request = async (method, params) => {
    const result = await original(method, params);
    if (method === 'turn/start') queueMicrotask(() => {
      rpc.emit('item/completed', { threadId: params.threadId, turnId: result.turn.id, item: { type: 'agentMessage', text: '{"text":"Acme","handoff":false}' } });
      rpc.emit('turn/completed', { threadId: params.threadId, turn: { ...result.turn, status: 'completed' } });
    });
    return result;
  };
  await assert.rejects(createCodexAdapter({ enabled: true, rpc, policy: policy('codex'), guard }).turn(request().r));
});

test('unmentioned messages from an allowed human do not fetch channel metadata or halt the service', async t => {
  const f = discordFixture(t); await f.adapter.start(); const before = f.fetches.length;
  f.sockets[0].emit({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: { guild_id: f.config.guildId, channel_id: '10000000000000999', author: { id: f.config.ownerIds[0] }, content: 'ordinary Acme chat', mentions: [] } });
  await tick(); assert.equal(f.fetches.length, before); assert.deepEqual(f.faults, []);
});

test('failed host capability validation reads no secrets and invokes no runtime', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../scripts/discord-pilot/deployment.example.json', import.meta.url)));
  manifest.enabled = true; manifest.stateDirectory = '/acme/state'; manifest.runtimes = { codex: policy('codex'), claude: policy('claude') };
  manifest.authSecrets = { codex: 'keychain:acme.codex', claude: 'keychain:acme.claude' };
  let effects = 0;
  const host = { inspect: async () => ({ tools: 'unknown' }), guard, loadSecret() { effects++; }, codex() { effects++; }, claude() { effects++; }, async close() {} };
  await assert.rejects(startPilot({ manifest, approvalDigest: inspectDeployment(manifest).digest, host }), /capabilities_unverified/);
  assert.equal(effects, 0);
});

test('Claude interrupt receipts with queued work never claim confirmed cancellation', async () => {
  const f = request(), sdk = claudeQuery({ pause: true, queued: ['acme-unknown-trigger'] });
  const pending = createClaudeAdapter({ enabled: true, ...sdk, policy: policy('claude'), guard, environment }).turn(f.r);
  await tick(); f.controller.abort(); await assert.rejects(pending, /runtime_interrupted/);
  assert.deepEqual(f.cancellations, [{ confirmed: false }]);
});

for (const mode of ['legacy', 'wait', 'stop-wait']) test(`approved host orchestration isolates credentials with mocked IO: ${mode}`, async t => {
  const f = discordFixture(t), directory = realpathSync(mkdtempSync(join(tmpdir(), 'acme-service-')));
  t.after(() => rmSync(directory, { recursive: true }));
  const manifest = JSON.parse(readFileSync(new URL('../scripts/discord-pilot/deployment.example.json', import.meta.url)));
  manifest.enabled = true; manifest.stateDirectory = directory;
  if (mode !== 'legacy') manifest.policy.trial.waitMs = 300000;
  manifest.runtimes = Object.fromEntries(['codex', 'claude'].map(name => [name, { ...policy(name), cwd: `${directory}/runtimes/${name}/workspace` }]));
  manifest.authSecrets = { codex: 'keychain:acme.codex.api', claude: 'keychain:acme.claude.api' };
  const report = inspectDeployment(manifest), secrets = new Map([
    [manifest.discordSecrets.codex, f.tokens[f.config.bots[0].id]], [manifest.discordSecrets.claude, f.tokens[f.config.bots[1].id]],
    [manifest.authSecrets.codex, 'Acme-openai-key'], [manifest.authSecrets.claude, 'Acme-anthropic-key'],
  ]);
  let closed = false, reads = 0;
  const host = {
    async inspect() { return { deploymentDigest: report.digest, toolPolicy: 'conversation', isolation: 'separate-containers', hostAccess: 'none', sharedCredentials: false, auth: 'approved' }; },
    guard, async loadSecret(ref) { reads++; return secrets.get(ref); },
    async codex({ policy: p, auth }) {
      assert.deepEqual(auth, { mode: 'api-key', key: 'Acme-openai-key' });
      const rpc = codexRpc(), original = rpc.request;
      rpc.request = async (method, params) => { const answer = await original(method, params); if (method.startsWith('thread/')) answer.cwd = p.cwd; return answer; };
      return rpc;
    },
    async claude({ auth }) {
      assert.deepEqual(auth, { mode: 'api-key', key: 'Acme-anthropic-key' });
      const sdk = claudeQuery(), spawnClaudeCodeProcess = () => { throw new Error('Acme mock must not spawn'); };
      return { query(args) { assert.equal(args.options.spawnClaudeCodeProcess, spawnClaudeCodeProcess); return sdk.query(args); }, environment, spawnClaudeCodeProcess };
    },
    discordIO: { fetcher: f.fetcher, Socket: f.Socket }, async close() { closed = true; },
  };
  const service = await startPilot({ manifest, approvalDigest: report.digest, host });
  t.after(() => service.stop());
  assert.equal(service.status, mode === 'legacy' ? 'running' : 'waiting_for_owner');
  assert.equal(reads, mode === 'legacy' ? 4 : 2);
  if (mode === 'stop-wait') {
    f.sockets[0].emit({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: { id: '30000000000000001', guild_id: f.config.guildId,
      channel_id: '10000000000000007', author: { id: f.config.ownerIds[0] }, content: `<@${f.config.bots[0].id}> stop`, mentions: [{ id: f.config.bots[0].id }] } });
    assert.deepEqual(await service.done, { reason: 'stopped', cleanup: 'confirmed' });
    assert.equal(reads, 2); assert.equal(f.posts.length, 0); assert.equal(closed, true); return;
  }
  f.sockets[0].emit({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: { id: '30000000000000001', guild_id: f.config.guildId,
    channel_id: '10000000000000007', author: { id: f.config.ownerIds[0] }, content: `<@${f.config.bots[0].id}> start Acme discussion`, mentions: [{ id: f.config.bots[0].id }] } });
  await tick();
  assert.equal(reads, 4);
  assert.equal(f.posts.length, 1); assert.equal(service.snapshot().tasks['10000000000000007'].sessions.codex.provider.id, 'acme-provider-thread');
  assert.ok(!JSON.stringify(service.snapshot()).includes('Acme-openai-key'));
  f.sockets[0].emit({ op: 0, t: 'MESSAGE_CREATE', s: 3, d: { id: '30000000000000002', guild_id: f.config.guildId,
    channel_id: '10000000000000007', author: { id: f.config.ownerIds[0] }, content: `<@${f.config.bots[0].id}> stop`, mentions: [{ id: f.config.bots[0].id }] } });
  assert.deepEqual(await service.done, { reason: 'stopped', cleanup: 'confirmed' }); assert.equal(closed, true);
  assert.ok(f.sockets.every(socket => socket.readyState === 3)); assert.equal(f.posts.length, 1);
  const priorReads = reads;
  await assert.rejects(startPilot({ manifest, approvalDigest: report.digest, host }), /live_start_failed/);
  assert.equal(reads, priorReads);
});

test('Codex preserves sanitized streamed provider errors and usage before cancellation', async () => {
  const f = request(), rpc = codexRpc({ complete: false }), events = [], usage = [];
  f.r.recordRuntimeEvent = event => events.push(event); f.r.recordUsage = value => usage.push(value);
  const pending = createCodexAdapter({ enabled: true, rpc, policy: policy('codex'), guard }).turn(f.r);
  await tick();
  rpc.emit('error', { threadId: 'acme-other-thread', turnId: 'turn-1', willRetry: true, error: { codexErrorInfo: 'unauthorized' } });
  rpc.emit('error', { threadId: 'acme-provider-thread', turnId: 'turn-1', willRetry: true,
    error: { message: 'Acme-private-key', additionalDetails: 'Acme-private-key', codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 429, private: 'Acme-private-key' } } } });
  rpc.emit('thread/tokenUsage/updated', { threadId: 'acme-provider-thread', turnId: 'turn-1', tokenUsage: { last: { totalTokens: 12 } } });
  f.controller.abort(); await assert.rejects(pending, /runtime_interrupted/);
  assert.deepEqual(events.filter(e => e.event === 'provider_error'), [{ event: 'provider_error', providerCode: 'httpConnectionFailed', httpStatus: 429, retrying: true }]);
  assert.ok(events.some(e => e.event === 'generation_started'));
  assert.deepEqual(usage, [{ tokens: 12, costMicros: 24 }]);
  assert.equal(JSON.stringify(events).includes('Acme-private-key'), false);
});
