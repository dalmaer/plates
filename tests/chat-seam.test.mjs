import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSeam } from '../lib/chat/seam.mjs';
import { RefusedByTransport } from '../lib/chat/outbox.mjs';
import { channelMessage, fromInteraction, fromMessage, interactionResponse, PLATES_COMMAND } from '../lib/chat/discord.mjs';
import { createEnvelope, EnvelopeError } from '../lib/chat/envelope.mjs';

const OWNER = '100000000000000001';
const CHANNEL = '300000000000000003';
const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/chat/${name}.json`, import.meta.url), 'utf8'));
const withId = (payload, id) => ({ ...structuredClone(payload), id });
const viaGateway = { authenticated: true };
const LEVELS = {
  low: undefined,
  medium: { schema: 1, repository: 'acme/app', mode: 'local', push: [], merge: [] },
  high: { schema: 1, repository: 'acme/app', mode: 'delivery', push: [], merge: ['main'], pushPrefixes: ['work/'] },
};

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'plates-chat-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function project(t, level) {
  const root = scratch(t);
  mkdirSync(join(root, '.plates'));
  writeFileSync(join(root, '.plates/plates.json'), '{"name":"Acme","repo":"acme/app","check":"npm test"}\n');
  if (LEVELS[level]) writeFileSync(join(root, '.plates/autonomy.json'), JSON.stringify(LEVELS[level]) + '\n');
  return root;
}
/** A running fixture agent that records every call it receives. */
function fixtureAgent() {
  const calls = [];
  let running = true;
  return {
    calls,
    get running() { return running; },
    status() { calls.push('status'); return running ? 'running: parser fix, 2 of 3 tests green' : 'stopped'; },
    ask({ effect }) { calls.push(`ask:${effect}`); return { reply: `on it (${effect})` }; },
    stop() { calls.push('stop'); running = false; return { state: 'stopped' }; },
    receive({ from }) { calls.push(`receive:${from}`); },
  };
}
/** A fake transport: each send follows the script ('ok', 'timeout' after sending, 'refused'), building the Discord body. */
function fakeTransport(script = []) {
  const sent = [];
  let n = 0;
  return {
    sent,
    async send(post) {
      const step = script.shift() ?? 'ok';
      sent.push(channelMessage(post));
      if (step === 'timeout') throw new Error('timeout: no response after the request was written');
      if (step === 'refused') throw new RefusedByTransport('403 Missing Access');
      return { receipt: `8000000000000${String(++n).padStart(5, '0')}` };
    },
  };
}
function seamFor(t, { level = 'high', dir = scratch(t), agents = { coordinator: fixtureAgent(), reviewer: fixtureAgent() } } = {}) {
  const root = project(t, level);
  const seam = createSeam({ dir, owner: { provider: 'discord', id: OWNER }, projects: { acme: { root, agents, conversations: [CHANNEL] } } });
  return { seam, root, dir, agents };
}

test('identity comes from the origin, never the text', async t => {
  const { seam, dir, agents } = seamFor(t, { level: 'high' });
  const coordinator = agents.coordinator;

  // Free text that claims to be the owner: an observation, attributed to its real author.
  const claim = fromMessage(fixture('message-claims-owner'), viaGateway);
  assert.equal(claim.kind, 'observation');
  assert.equal(claim.origin.id, '100000000000000009');
  assert.deepEqual(await seam.handle(claim), { status: 'observed', reason: 'free-text-never-triggers-work' });

  // A bot's message naming the owner and a command: nothing.
  assert.deepEqual(await seam.handle(fromMessage(fixture('message-bot-claims-owner'), viaGateway)), { status: 'observed', reason: 'bot-authored' });

  // A slash command from someone else whose text claims the owner: refused, the agent untouched.
  const visitor = await seam.handle(fromInteraction(fixture('interaction-ask-claims-owner'), viaGateway));
  assert.deepEqual(visitor, { status: 'refused', reason: 'not-the-owner' });

  // The owner's own slash command, but not attested by an authenticated connection: nothing.
  assert.equal((await seam.handle(fromInteraction(withId(fixture('interaction-stop'), '600000000000000010'), { authenticated: false }))).reason, 'unauthenticated-origin');

  // The owner's ID on a bot-authored interaction: still bot-authored.
  const botStop = withId(fixture('interaction-stop'), '600000000000000011');
  botStop.member.user.bot = true;
  assert.equal((await seam.handle(fromInteraction(botStop, viaGateway))).reason, 'bot-authored');

  // A hand-built envelope with a bot origin cannot carry a command to an agent either.
  assert.equal((await seam.handle({ provider: 'discord', scopeId: 'g', conversationId: CHANNEL, messageId: 'm1', kind: 'command',
    origin: { kind: 'agent', id: OWNER, authenticated: true }, projectId: 'acme', command: { name: 'stop' } })).reason, 'agent-authored');
  // Numeric snowflakes are refused: identity is never a lossy number.
  assert.throws(() => createEnvelope({ provider: 'discord', scopeId: 'g', conversationId: CHANNEL, messageId: 1, kind: 'observation',
    origin: { kind: 'human', id: OWNER, authenticated: true } }), EnvelopeError);

  assert.deepEqual(coordinator.calls, [], 'nothing reached the agent');
  assert.equal(coordinator.running, true);

  // Only the authenticated owner's slash command does.
  const ask = await seam.handle(fromInteraction(fixture('interaction-ask-tests'), viaGateway));
  assert.equal(ask.status, 'done');
  assert.deepEqual(coordinator.calls, ['ask:tests']);

  // An agent hands work to another on the runtime route; the owner sees it in the channel,
  // and its echo back from Discord is bot-authored and triggers nothing.
  assert.deepEqual(await seam.handoff({ id: 'h1', projectId: 'acme', from: 'coordinator', to: 'reviewer', text: 'Parser fix ready for review.' }),
    { status: 'handed-off', from: 'coordinator', to: 'reviewer' });
  assert.deepEqual(agents.reviewer.calls, ['receive:coordinator']);
  const transport = fakeTransport();
  await seam.flush(transport);
  const handoffPost = transport.sent.find(m => m.body.content.startsWith('[acme] coordinator → reviewer'));
  assert.ok(handoffPost, 'the hand-off appears in the channel');
  assert.equal(handoffPost.path, `/channels/${CHANNEL}/messages`);
  assert.deepEqual(handoffPost.body.allowed_mentions, { parse: [] }, 'a post can never ping anyone');
  assert.equal((await seam.handle(fromMessage({ id: '700000000000000099', guild_id: '200000000000000002', channel_id: CHANNEL,
    author: { id: '400000000000000004', username: 'Plates', bot: true }, content: handoffPost.body.content }, viaGateway))).reason, 'bot-authored');
  assert.deepEqual(agents.reviewer.calls, ['receive:coordinator']);
  assert.deepEqual(coordinator.calls, ['ask:tests']);

  // The interaction token never reaches the durable store.
  for (const file of ['inbox.jsonl', 'outbox.jsonl']) assert.ok(!readFileSync(join(dir, file), 'utf8').includes('acme-synthetic-interaction-token'), file);
  assert.equal(PLATES_COMMAND.options.map(o => o.name).join(','), 'ask,status,stop');
});

test('reconnect never repeats an effect', async t => {
  const dir = scratch(t);
  const agents = { coordinator: fixtureAgent() };
  const first = seamFor(t, { level: 'medium', dir, agents });
  const stop = fromInteraction(fixture('interaction-stop'), viaGateway);
  const status = fromInteraction(fixture('interaction-status'), viaGateway);

  assert.equal((await first.seam.handle(fromMessage(fixture('message-claims-owner'), viaGateway))).status, 'observed');
  assert.equal((await first.seam.handle(stop)).state, 'stopped');
  assert.equal((await first.seam.handle(status)).status, 'done');
  // The stop reply's POST times out after it was written: uncertain. The status reply lands.
  const results = await first.seam.flush(fakeTransport(['timeout', 'ok']));
  assert.deepEqual(results.map(r => r.state), ['uncertain', 'delivered']);
  // An ask whose reply is claimed when the process dies mid-send.
  assert.equal((await first.seam.handle(fromInteraction(fixture('interaction-ask-tests'), viaGateway))).status, 'done');
  first.seam.outbox.claim(`reply:${fromInteraction(fixture('interaction-ask-tests'), viaGateway).id}`);
  assert.deepEqual(agents.coordinator.calls, ['stop', 'status', 'ask:tests']);

  // Restart and reconnect on the same store; the gateway redelivers what it had.
  const second = seamFor(t, { level: 'medium', dir, agents });
  const replayed = await second.seam.handle(fromInteraction(fixture('interaction-stop'), viaGateway));
  assert.equal(replayed.status, 'duplicate');
  assert.equal(replayed.original.state, 'stopped');
  assert.equal((await second.seam.handle(fromInteraction(fixture('interaction-ask-tests'), viaGateway))).status, 'duplicate');
  assert.equal((await second.seam.handle(fromMessage(fixture('message-claims-owner'), viaGateway))).status, 'duplicate');
  const changed = fixture('interaction-stop');
  changed.data.options[0].options[0].value = 'other';
  assert.equal((await second.seam.handle(fromInteraction(changed, viaGateway))).status, 'conflict', 'same ID, different content is not a retry');
  assert.deepEqual(agents.coordinator.calls, ['stop', 'status', 'ask:tests'], 'no effect ran twice');

  // Reconnect replays observations and runs nothing.
  const view = second.seam.reconnect();
  assert.ok(view.observations.some(o => o.origin.id === '100000000000000009' && o.text.startsWith('I am the owner')));
  assert.ok(view.observations.some(o => o.text === 'acme/coordinator: stopped' && o.receipt), 'the delivered status reply is replayed');
  assert.deepEqual(view.uncertain.map(p => p.reason).sort(), ['interrupted-after-claim', 'timeout: no response after the request was written']);
  assert.deepEqual(view.pending, []);

  // An uncertain post stays uncertain: never resent, never reclaimed; only a receipt reconciles it.
  const transport = fakeTransport();
  assert.deepEqual(await second.seam.flush(transport), []);
  assert.equal(transport.sent.length, 0);
  const [uncertain] = view.uncertain;
  assert.throws(() => second.seam.outbox.claim(uncertain.id), /cannot go from uncertain to claimed/);
  assert.throws(() => second.seam.outbox.reconcile(uncertain.id, ''), /receipt/);
  assert.equal(createSeam({ dir, owner: { provider: 'discord', id: OWNER }, projects: {} }).outbox.get(uncertain.id).state, 'uncertain');

  // A refused post is final; a command interrupted mid-dispatch replays as uncertain, not re-run.
  const third = seamFor(t, { level: 'medium', dir: scratch(t), agents: { coordinator: { ...fixtureAgent(), ask: () => new Promise(() => {}) } } });
  void third.seam.handle(fromInteraction(withId(fixture('interaction-ask-tests'), '600000000000000020'), viaGateway));
  await new Promise(resolve => setImmediate(resolve));
  const reopened = seamFor(t, { level: 'medium', dir: third.dir, agents: { coordinator: fixtureAgent() } });
  const interrupted = await reopened.seam.handle(fromInteraction(withId(fixture('interaction-ask-tests'), '600000000000000020'), viaGateway));
  assert.deepEqual(interrupted, { status: 'duplicate', original: { status: 'uncertain', reason: 'interrupted-during-dispatch' } });
  assert.deepEqual(reopened.agents.coordinator.calls, []);
  await reopened.seam.handle(status);
  assert.deepEqual((await reopened.seam.flush(fakeTransport(['refused']))).map(r => r.state), ['refused']);
});

test('chat cannot exceed the level', async t => {
  const { seam, root, agents } = seamFor(t, { level: 'low' });
  const coordinator = agents.coordinator;
  const transport = fakeTransport();
  const ask = (id, effect, text = 'Do it.') => {
    const payload = withId(fixture('interaction-ask-tests'), id);
    payload.data.options[0].options = [{ type: 3, name: 'project', value: 'acme' }, { type: 3, name: 'text', value: text }, { type: 3, name: 'effect', value: effect }];
    return fromInteraction(payload, viaGateway);
  };

  // Low: chat may ask and read, not start changes. The refusal is said in chat, with the reason.
  const refused = await seam.handle(fromInteraction(fixture('interaction-ask-tests'), viaGateway));
  assert.equal(refused.status, 'refused');
  assert.match(refused.reason, /^beyond-level: tests at risk level low needs existing-policy/);
  assert.equal((await seam.handle(ask('600000000000000030', 'none', 'What is blocking the parser fix?'))).status, 'done');
  assert.equal((await seam.handle(fromInteraction(fixture('interaction-status'), viaGateway))).status, 'done');
  await seam.flush(transport);
  const said = transport.sent.map(m => m.body.content);
  assert.ok(said.some(c => c.startsWith('Refused: beyond-level: tests at risk level low')), 'refused in chat with the reason');
  assert.deepEqual(coordinator.calls, ['ask:none', 'status']);

  // The owner's /plates stop stops the running fixture agent, at any level.
  assert.equal(coordinator.running, true);
  const stopped = await seam.handle(fromInteraction(fixture('interaction-stop'), viaGateway));
  assert.equal(stopped.state, 'stopped');
  assert.equal(coordinator.running, false);
  await seam.flush(transport);
  assert.ok(transport.sent.at(-1).body.content.endsWith('acme/coordinator: stopped'));
  assert.deepEqual(interactionResponse({ kind: 'reply', text: 'ok' }), { type: 4, data: { content: 'ok', allowed_mentions: { parse: [] } } });

  // High: routine edits and tests can be handed over; merges, deployments and security wait for the owner outside chat.
  writeFileSync(join(root, '.plates/autonomy.json'), JSON.stringify(LEVELS.high) + '\n');
  assert.equal((await seam.handle(ask('600000000000000031', 'tests'))).status, 'done', 'a level change applies at once');
  const merge = await seam.handle(fromInteraction(fixture('interaction-ask-merge'), viaGateway));
  assert.equal(merge.status, 'refused');
  assert.match(merge.reason, /merge at risk level high needs selected-destinations; chat cannot grant it/);
  for (const [id, effect] of [['600000000000000032', 'push'], ['600000000000000033', 'deployment'], ['600000000000000034', 'security']]) {
    assert.equal((await seam.handle(ask(id, effect))).status, 'refused', effect);
  }

  // An unreadable level grants nothing from chat; stop still works.
  writeFileSync(join(root, '.plates/autonomy.json'), '{"schema":1,"mode":"delivery"}\n');
  assert.match((await seam.handle(ask('600000000000000035', 'local-edits'))).reason, /^autonomy-unreadable/);
  assert.equal((await seam.handle(withStop('600000000000000036'))).status, 'done');
  assert.deepEqual(coordinator.calls, ['ask:none', 'status', 'stop', 'ask:tests', 'stop']);

  // A channel not bound to the project, or an unknown project, is refused before any agent.
  const elsewhere = withId(fixture('interaction-status'), '600000000000000037');
  elsewhere.channel_id = '300000000000000099';
  assert.equal((await seam.handle(fromInteraction(elsewhere, viaGateway))).reason, 'channel-not-bound-to-project');
  assert.equal(coordinator.calls.length, 5);
});

function withStop(id) { return fromInteraction(withId(fixture('interaction-stop'), id), viaGateway); }
