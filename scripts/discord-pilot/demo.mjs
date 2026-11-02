import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBridge } from '../../lib/discord-pilot/bridge.mjs';
import { mockAdapters, mockConfig, mockEcho, mockMessage } from '../../lib/discord-pilot/mock.mjs';

// Source-only offline demonstration; deliberately no live flag or credential loading.
if (process.argv.slice(2).some(a => a !== '--json')) throw new Error('Only --json is supported; live connections are disabled.');
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'plates-discord-demo-')));
const config = mockConfig(), adapters = mockAdapters();
const bridge = openBridge({ config, directory, ...adapters });
try {
  const first = mockMessage(config);
  bridge.admit(first); await bridge.drain(first.threadId);
  for (let cursor = 0; cursor < adapters.sent.length; cursor++) {
    bridge.admit(mockEcho(config, adapters.sent[cursor])); await bridge.drain(first.threadId);
  }
  const task = bridge.snapshot().tasks[first.threadId];
  console.log(JSON.stringify({ mode: 'offline', networkCalls: 0, paidCalls: 0,
    handoffs: task.handoffs, sessions: Object.fromEntries(Object.entries(task.sessions).map(([key, s]) => [key, { id: s.id, turns: s.history.length }])),
    messages: adapters.sent.map(({ botId, content, allowed_mentions }) => ({ botId, content, allowed_mentions })) }, null, 2));
} finally { bridge.close(); rmSync(directory, { recursive: true }); }
