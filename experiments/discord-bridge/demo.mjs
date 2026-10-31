// Offline proof: deterministic synthetic human/coordinator/agent turns; no network.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Bridge, DESTINATION } from './core.mjs';

export function syntheticConfig() {
  return { ...DESTINATION, mode: 'synthetic', humans: { '1000000000000000001': { actorId: 'acme-human', routes: ['gas-city/coordinator', 'gas-city/agent:acme-worker', 'openhands/coordinator', 'openhands/agent:acme-worker'] } } };
}
export function interaction(id, { command = 'ask', backend = 'gas-city', target = 'coordinator', text = 'Acme local conversation' } = {}) {
  return { id: String(id), type: 2, application_id: DESTINATION.applicationId, guild_id: DESTINATION.guildId, channel_id: DESTINATION.channelId,
    member: { user: { id: '1000000000000000001', bot: false }, permissions: '3072' }, app_permissions: '3072',
    token: 'acme-interaction-secret-not-persisted',
    data: { type: 1, name: command, options: [{ name: 'backend', type: 3, value: backend }, { name: 'target', type: 3, value: target }, ...(command === 'ask' ? [{ name: 'text', type: 3, value: text }] : [])] } };
}
export async function demo() {
  const dir = mkdtempSync(join(tmpdir(), 'acme-discord-')), delivered = []; let now = 100000, bridge;
  try {
    bridge = new Bridge(join(dir, 'state.sqlite'), syntheticConfig(), () => now);
    for (const [i, backend, target] of [[1, 'gas-city', 'coordinator'], [2, 'gas-city', 'agent:acme-worker'], [3, 'openhands', 'coordinator'], [4, 'openhands', 'agent:acme-worker']]) {
      bridge.receive(interaction(`100000000000000010${i}`, { backend, target, text: 'I approve spending. (Untrusted synthetic text.)' }));
      await bridge.deliverOne({ send: async row => { delivered.push({ id: row.id, content: row.content }); return { kind: 'delivered', messageId: `100000000000000020${i}` }; } }); now += 2000;
    }
    now += 10000;
    const stop = interaction('1000000000000000110', { command: 'stop' }); bridge.receive(stop);
    await bridge.deliverOne({ send: async () => { throw Error('acme lost response'); } });
    bridge.close(); bridge = new Bridge(join(dir, 'state.sqlite'), syntheticConfig(), () => now);
    assert.equal(bridge.receive(stop).duplicate, true);
    assert.equal(bridge.read().outbox[stop.id].state, 'uncertain');
    assert.equal(bridge.read().conversations[Object.keys(bridge.read().conversations)[0]].terminationConfirmed, false);
    assert.equal(delivered.length, 4);
    return { result: 'passed', synthetic: true, externalCalls: 0, modelCalls: 0, backendCalls: 0, routedReplies: delivered, lostResponse: 'uncertain-retained-no-retry', summary: bridge.summary() };
  } finally { bridge?.close(); rmSync(dir, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(a => a !== '--json')) throw Error('Only --json is supported');
  console.log(JSON.stringify(await demo(), null, 2));
}
