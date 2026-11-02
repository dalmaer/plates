import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, chmodSync, statSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRuntimeHome } from '../scripts/discord-pilot/runtime-home.mjs';
import { failureDetails, stageError, rpcFailure } from '../lib/discord-pilot/diagnostics.mjs';
import { openBridge } from '../lib/discord-pilot/bridge.mjs';
import { mockConfig, mockMessage, mockAdapters } from '../lib/discord-pilot/mock.mjs';

function home(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'acme-runtime-home-')));
  t.after(() => rmSync(root, { recursive: true })); return root;
}

test('fresh worker homes exist privately before CLI startup and existing session files survive', t => {
  const root = home(t);
  for (const runtime of ['codex', 'claude']) {
    const directory = prepareRuntimeHome(root, runtime);
    assert.equal(directory, join(root, `.${runtime}`));
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    writeFileSync(join(directory, 'acme-session'), 'Acme retained session', { mode: 0o600 });
    assert.equal(prepareRuntimeHome(root, runtime), directory);
    assert.equal(readFileSync(join(directory, 'acme-session'), 'utf8'), 'Acme retained session');
  }
});

test('worker home preparation refuses broad permissions, links, files and mismatched owners', t => {
  const root = home(t);
  chmodSync(root, 0o755); assert.throws(() => prepareRuntimeHome(root, 'codex'), /permissions/); chmodSync(root, 0o700);
  assert.throws(() => prepareRuntimeHome(root, 'codex', process.getuid() + 1), /permissions/);
  mkdirSync(join(root, 'other'), { mode: 0o700 }); symlinkSync(join(root, 'other'), join(root, '.codex'));
  assert.throws(() => prepareRuntimeHome(root, 'codex'), /permissions/);
  writeFileSync(join(root, '.claude'), 'Acme file'); assert.throws(() => prepareRuntimeHome(root, 'claude'), /permissions/);
  assert.throws(() => prepareRuntimeHome(root, '../acme'), /scope/);
});

test('diagnostics retain only known codes, phases and numeric RPC status', () => {
  const failure = stageError(rpcFailure('thread/start', -32602), 'session_start');
  assert.deepEqual(failureDetails(failure), { code: 'rpc_invalid_params', method: 'thread/start', rpcCode: -32602, phase: 'session_start' });
  const remote = new Error('Acme-secret-key in provider error'); remote.code = 'Acme-secret-key'; remote.phase = 'Acme-private-prompt';
  assert.deepEqual(failureDetails(stageError(remote, 'generation')), { code: 'unclassified_failure', phase: 'generation' });
  assert.deepEqual(failureDetails(rpcFailure('Acme-private-method', 'Acme-secret-key')), { code: 'rpc_remote_error' });
});

test('bridge persists sanitized initialization failure and preserves uncertain reservations', async t => {
  let bridge; t.after(() => bridge?.close());
  const root = home(t), config = mockConfig();
  const adapters = mockAdapters(() => { throw stageError(new Error('rpc_closed'), 'initialize'); });
  bridge = openBridge({ config, directory: root, ...adapters });
  const message = mockMessage(config); bridge.admit(message); await bridge.drain(message.threadId);
  const receipt = bridge.snapshot().tasks[message.threadId].receipts[0];
  assert.deepEqual(receipt.failure, { code: 'rpc_closed', phase: 'initialize' });
  assert.equal(receipt.status, 'uncertain'); assert.equal(adapters.sent.length, 0);
  const disk = JSON.parse(readFileSync(join(root, 'state.json')));
  assert.deepEqual(disk.tasks[message.threadId].receipts[0].failure, receipt.failure);
  assert.equal(disk.micros, config.limits.turnMicros);
});

test('untrusted runtime errors cannot put keys, payloads or stacks in persisted diagnostics', async t => {
  let bridge; t.after(() => bridge?.close());
  const root = home(t), config = mockConfig(), secret = 'Acme-private-provider-key';
  const adapters = mockAdapters(() => { throw new Error(secret); });
  bridge = openBridge({ config, directory: root, ...adapters });
  const message = mockMessage(config); bridge.admit(message); await bridge.drain(message.threadId);
  assert.equal(readFileSync(join(root, 'state.json'), 'utf8').includes(secret), false);
  assert.deepEqual(bridge.snapshot().tasks[message.threadId].receipts[0].failure, { code: 'unclassified_failure' });
});

test('bridge runtime diagnostics are bounded, sanitized and durable', async t => {
  let bridge; t.after(() => bridge?.close());
  const root = home(t), config = mockConfig(), secret = 'Acme-private-provider-key';
  const adapters = mockAdapters(request => {
    request.recordRuntimeEvent({ event: secret, message: secret });
    for (let i = 0; i < 40; i++) request.recordRuntimeEvent({ event: 'provider_error', providerCode: 'unauthorized', httpStatus: 401,
      retrying: false, message: secret, additionalDetails: secret });
    throw new Error('codex_turn_failed');
  });
  bridge = openBridge({ config, directory: root, ...adapters });
  const message = mockMessage(config); bridge.admit(message); await bridge.drain(message.threadId);
  const raw = readFileSync(join(root, 'state.json'), 'utf8'), receipt = JSON.parse(raw).tasks[message.threadId].receipts[0];
  assert.equal(raw.includes(secret), false); assert.equal(receipt.runtimeEvents.length, 32);
  assert.deepEqual(Object.keys(receipt.runtimeEvents[0]).sort(), ['elapsedMs', 'event', 'httpStatus', 'providerCode', 'retrying']);
  assert.equal(receipt.runtimeEvents[0].providerCode, 'unauthorized');
});

test('bridge distinguishes its turn deadline from an owner interruption', async t => {
  let bridge; t.after(() => bridge?.close());
  const root = home(t), config = mockConfig(); config.limits.turnTimeoutMs = 10;
  const adapters = mockAdapters(() => new Promise(() => {}));
  bridge = openBridge({ config, directory: root, ...adapters });
  const message = mockMessage(config); bridge.admit(message); await bridge.drain(message.threadId);
  assert.deepEqual(bridge.snapshot().tasks[message.threadId].receipts[0].failure, { code: 'turn_timeout' });
});
