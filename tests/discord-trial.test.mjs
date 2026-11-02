import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBridge, validateConfig } from '../lib/discord-pilot/bridge.mjs';
import { mockAdapters, mockConfig, mockEcho, mockMessage } from '../lib/discord-pilot/mock.mjs';
import { superviseTrial, validateTrial } from '../lib/discord-pilot/trial.mjs';

const trial = () => ({ threadId: '10000000000000007', maxTurns: 3, durationMs: 180000,
  idleMs: 10000, inputChars: 800, replyChars: 600, outputTokens: 2048 });
function config() {
  const c = mockConfig(); c.userIds = []; c.limits.maxTasks = 1; c.limits.maxHandoffs = 2;
  c.trial = trial(); return c;
}
function fixture(t, reply) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'acme-trial-'))), c = config(), adapters = mockAdapters(reply);
  const bridge = openBridge({ config: c, directory, ...adapters });
  t.after(() => { bridge.close(); rmSync(directory, { recursive: true }); });
  return { directory, c, bridge, adapters, message: changes => mockMessage(c, changes) };
}

test('trial validation requires exact scope and refuses unknown or excessive limits', () => {
  assert.deepEqual(validateConfig(config()).trial, trial());
  for (const change of [{ threadId: null }, { maxTurns: 6 }, { outputTokens: 2049 }, { idleMs: 180000 }, { inputChars: 1001 }, { extra: true }]) {
    assert.throws(() => validateTrial({ ...trial(), ...change }), /invalid_trial/);
  }
  for (const change of [c => c.userIds.push('10000000000000999'), c => c.ownerIds.push('10000000000000999'),
    c => c.limits.maxTasks = 2, c => c.limits.maxHandoffs = 3, c => c.trial.threadId = c.channelIds[0]]) {
    const c = config(); change(c); assert.throws(() => validateConfig(c), /invalid_trial_scope/);
  }
});

test('trial admits only its exact thread and owner; oversized input and spoofed stop do not create work', t => {
  const f = fixture(t);
  assert.equal(f.bridge.admit(f.message({ threadId: '10000000000000999' })), 'wrong_thread');
  assert.equal(f.bridge.admit(f.message({ text: `<@${f.c.bots[0].id}> ` + 'x'.repeat(800) })), 'input_too_long');
  assert.equal(f.bridge.admit(f.message({ authorId: '10000000000000999', text: `<@${f.c.bots[0].id}> stop` })), 'unauthorized');
  assert.equal(f.bridge.admit(f.message({ bot: true, text: `<@${f.c.bots[0].id}> stop` })), 'unauthorized');
  assert.deepEqual(f.bridge.snapshot().tasks, {});
  assert.equal(f.bridge.admit(f.message({ text: `<@${f.c.bots[0].id}> stop` })), 'stopped');
  assert.equal(f.bridge.admit(f.message()), 'stopped');
  assert.equal(f.adapters.calls.length, 0);
});

test('three turns preserve separate sessions and bound peer handoffs; a used trial cannot reopen', async t => {
  const f = fixture(t), m = f.message(); f.bridge.admit(m); await f.bridge.drain(m.threadId);
  for (let i = 0; i < 2; i++) {
    assert.equal(f.bridge.admit(mockEcho(f.c, f.adapters.sent[i])), 'queued'); await f.bridge.drain(m.threadId);
  }
  assert.equal(f.adapters.calls.length, 3);
  const task = f.bridge.snapshot().tasks[m.threadId];
  assert.equal(task.handoffs, 2); assert.equal(task.sessions.codex.history.length, 2); assert.equal(task.sessions.claude.history.length, 1);
  assert.notEqual(task.sessions.codex.id, task.sessions.claude.id);
  assert.equal(f.adapters.calls[0].maxOutputTokens, 2048); assert.equal(f.adapters.calls[0].maxReplyChars, 600);
  assert.deepEqual(f.adapters.sent.at(-1).allowed_mentions.users, []);
  f.bridge.admit(f.message({ id: '30000000000000099' })); await f.bridge.drain(m.threadId);
  assert.equal(f.adapters.calls.length, 3); assert.equal(f.bridge.snapshot().tasks[m.threadId].queue.length, 0);
  f.bridge.close();
  assert.throws(() => openBridge({ config: f.c, directory: f.directory, ...f.adapters }), /trial_already_used/);
});

test('owner stop aborts active work, discards queued followups and suppresses late replies', async t => {
  let resolve;
  const f = fixture(t, () => new Promise(r => { resolve = r; })), m = f.message();
  f.bridge.admit(m); const pending = f.bridge.drain(m.threadId); await new Promise(r => setImmediate(r));
  f.bridge.admit(f.message({ id: '30000000000000002' }));
  assert.equal(f.bridge.admit(f.message({ id: '30000000000000003', text: `<@${f.c.bots[0].id}> stop` })), 'stopped');
  await pending; resolve({ text: 'Acme late output', nextBotId: null }); await new Promise(r => setImmediate(r));
  assert.equal(f.bridge.snapshot().tasks[m.threadId].queue.length, 0); assert.equal(f.adapters.sent.length, 0);
  assert.equal(f.adapters.calls[0].signal.aborted, true);
});

test('oversized model replies fail closed before transport', async t => {
  const f = fixture(t, () => ({ text: 'x'.repeat(601), nextBotId: null })), m = f.message();
  f.bridge.admit(m); await f.bridge.drain(m.threadId);
  assert.equal(f.adapters.sent.length, 0); assert.equal(f.bridge.snapshot().tasks[m.threadId].status, 'uncertain');
});

function supervision(state = { tasks: {} }, fail = false, policy = trial()) {
  let now = 0, next, stops = [];
  const supervisor = superviseTrial({ policy, snapshot: () => state, now: () => now,
    schedule(fn) { next = fn; return 1; }, unschedule() { next = undefined; },
    async stop(reason) { stops.push(reason); if (fail) throw new Error('Acme kill not confirmed'); } });
  return { supervisor, stops, advance(ms) { now += ms; const fn = next; next = undefined; fn?.(); } };
}
const ready = changes => ({ threadId: trial().threadId, status: 'ready', active: null, queue: [], receipts: [], handoffs: 0, ...changes });

test('supervisor automatically terminates idle, deadline, stop, failed, overrun and completed runs', async () => {
  const cases = [
    [{ tasks: {} }, 180000, 'run_timeout'],
    [{ tasks: {}, trialRun: { stopped: true } }, 100, 'stopped'],
    [{ tasks: { a: ready({ status: 'uncertain' }) } }, 100, 'uncertain'],
    [{ tasks: {}, budgetOverrun: true }, 100, 'budget_overrun'],
    [{ tasks: { a: ready({ receipts: [{}, {}, {}] }) } }, 100, 'turn_limit'],
    [{ tasks: { a: ready({ threadId: '10000000000000999' }) } }, 100, 'scope_violation'],
  ];
  for (const [state, ms, reason] of cases) {
    const f = supervision(state); f.advance(ms);
    assert.deepEqual(await f.supervisor.done, { reason, cleanup: 'confirmed' }); assert.deepEqual(f.stops, [reason]);
  }
  const idle = supervision({ tasks: { a: ready({ receipts: [{}] }) } }); idle.advance(100); idle.advance(10000);
  assert.equal((await idle.supervisor.done).reason, 'idle');
});

test('active work cannot defeat run deadline; unconfirmed shutdown stays uncertain without retry', async () => {
  const f = supervision({ tasks: { a: ready({ active: 'Acme active', queue: [{}] }) } }, true);
  f.advance(100); assert.deepEqual(f.stops, []); f.advance(180000);
  assert.deepEqual(await f.supervisor.done, { reason: 'run_timeout', cleanup: 'uncertain' });
  await f.supervisor.stop('operator'); assert.deepEqual(f.stops, ['run_timeout']);
});


test('readiness is bounded independently and execution starts exactly once at the owner trigger', async () => {
  const policy = { ...trial(), waitMs: 300000 };
  for (const waitMs of [0, -1, 300001, '300000']) assert.throws(() => validateTrial({ ...policy, waitMs }));
  const f = supervision({ tasks: {} }, false, policy);
  f.advance(299900); assert.equal(f.supervisor.readiness().phase, 'waiting_for_owner');
  assert.equal(f.supervisor.begin(), true); assert.equal(f.supervisor.readiness().executionDeadline, 479900);
  f.advance(179900); assert.equal(f.supervisor.begin(), true);
  assert.equal(f.supervisor.readiness().executionDeadline, 479900);
  f.advance(100); assert.deepEqual(await f.supervisor.done, { reason: 'run_timeout', cleanup: 'confirmed' });
  assert.equal(f.supervisor.begin(), false);
  const idle = supervision({ tasks: {} }, false, policy); idle.advance(300000);
  assert.equal(idle.supervisor.begin(), false);
  assert.deepEqual(await idle.supervisor.done, { reason: 'wait_timeout', cleanup: 'confirmed' });
});

test('readiness requires an explicit owner start and stop still has priority', t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'acme-ready-'))), c = config(); c.trial.waitMs = 300000;
  const bridge = openBridge({ config: c, directory, ...mockAdapters() });
  t.after(() => { bridge.close(); rmSync(directory, { recursive: true }); });
  assert.equal(bridge.admit(mockMessage(c)), 'start_required');
  assert.equal(bridge.admit(mockMessage(c, { authorId: '10000000000000999', text: `<@${c.bots[0].id}> start Acme` })), 'unauthorized');
  assert.deepEqual(bridge.snapshot().tasks, {});
  assert.equal(bridge.admit(mockMessage(c, { text: `<@${c.bots[0].id}> start Acme` })), 'queued');
  assert.equal(bridge.admit(mockMessage(c, { id: '30000000000000009', text: `<@${c.bots[0].id}> stop` })), 'stopped');
  assert.equal(bridge.snapshot().tasks[c.trial.threadId].queue.length, 0);
});
