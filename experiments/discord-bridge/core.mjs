// Local, synthetic-only conversation bridge. No backend executor or model client.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { textPermissionsAllowed } from './permissions.mjs';

export const DESTINATION = Object.freeze({ applicationId: '1565878548068311060', guildId: '1565876613382410342', channelId: '1565878881473265775' });
export const LABEL = '[Plates TEST · SYNTHETIC]';
export const snowflake = value => typeof value === 'string' && /^[1-9][0-9]{16,19}$/.test(value);
const slug = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const fail = code => { throw new Error(code); };

export function validateConfig(value) {
  if (!value || value.mode !== 'synthetic' || Object.entries(DESTINATION).some(([k, v]) => value[k] !== v)) fail('fixed_destination_and_synthetic_mode_required');
  if (!value.humans || !Object.keys(value.humans).length) fail('explicit_human_mapping_required');
  for (const [id, human] of Object.entries(value.humans)) {
    if (!snowflake(id) || !slug(human?.actorId) || !Array.isArray(human.routes) || !human.routes.length) fail('invalid_human_mapping');
    for (const route of human.routes) {
      if (!/^(gas-city|openhands)\/(coordinator|agent:[a-zA-Z0-9_-]{1,64})$/.test(route)) fail('invalid_route');
    }
  }
  if (new Set(Object.values(value.humans).map(h => h.actorId)).size !== Object.keys(value.humans).length) fail('actor_mapping_must_be_unique');
  return structuredClone(value);
}

export const commands = ['ask', 'status', 'stop'].map(name => ({
  name, type: 1, description: `Plates TEST: ${name === 'ask' ? 'ask a synthetic coordinator or agent' : name === 'stop' ? 'record a synthetic stop request; no termination claim' : 'inspect synthetic conversation status'}`,
  default_member_permissions: '2048',
  options: [
    { name: 'backend', description: 'Experiment namespace (synthetic only)', type: 3, required: true, choices: [{ name: 'Gas City', value: 'gas-city' }, { name: 'OpenHands', value: 'openhands' }] },
    { name: 'target', description: 'coordinator or agent:ID from the local allowlist', type: 3, required: true, max_length: 70 },
    ...(name === 'ask' ? [{ name: 'text', description: 'Conversation text; never grants approval or starts work', type: 3, required: true, max_length: 1000 }] : []),
  ],
}));

export function normalizeInteraction(raw, config) {
  if (raw?.type !== 2 || raw.application_id !== config.applicationId || raw.guild_id !== config.guildId || raw.channel_id !== config.channelId) fail('scope_denied');
  const user = raw.member?.user, human = config.humans[user?.id];
  if (!snowflake(raw.id) || !snowflake(user?.id) || user.bot || user.system || !human || raw.webhook_id) fail('human_denied');
  if (typeof raw.member.permissions !== 'string' || !/^\d+$/.test(raw.member.permissions) || (BigInt(raw.member.permissions) & 3072n) !== 3072n) fail('human_permissions_denied');
  if (!textPermissionsAllowed(raw.app_permissions)) fail('app_permissions_changed');
  if (!['ask', 'status', 'stop'].includes(raw.data?.name) || raw.data.type !== 1) fail('command_denied');
  const values = {}, expected = raw.data.name === 'ask' ? ['backend', 'target', 'text'] : ['backend', 'target'];
  if (!Array.isArray(raw.data.options)) fail('invalid_options');
  for (const option of raw.data.options) {
    if (!expected.includes(option.name) || option.type !== 3 || typeof option.value !== 'string' || Object.hasOwn(values, option.name)) fail('invalid_options');
    values[option.name] = option.value;
  }
  if (Object.keys(values).length !== expected.length || !human.routes.includes(`${values.backend}/${values.target}`)) fail('route_denied');
  if (raw.data.name === 'ask' && (!values.text.trim() || values.text.length > 1000)) fail('invalid_text');
  // Only these fields cross the boundary. Interaction tokens and raw payloads never enter SQLite.
  return { id: raw.id, userId: user.id, actorId: human.actorId, command: raw.data.name, backend: values.backend, target: values.target, text: values.text ?? '' };
}

export class Bridge {
  constructor(file, config, now = Date.now) {
    this.config = validateConfig(config); this.now = now;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=2000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    this.db.prepare('INSERT OR IGNORE INTO state VALUES(1,?)').run(JSON.stringify({ configHash: hash(this.config), inbox: {}, outbox: {}, conversations: {}, registration: {}, nextSendAt: 0 }));
    if (this.read().configHash !== hash(this.config)) { this.close(); fail('configuration_changed_reconciliation_required'); }
  }
  close() { this.db.close(); }
  read() { return JSON.parse(this.db.prepare('SELECT data FROM state WHERE id=1').get().data); }
  change(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const state = this.read(), result = fn(state); this.db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(state)); this.db.exec('COMMIT'); return structuredClone(result); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  receive(raw) {
    const input = normalizeInteraction(raw, this.config), now = this.now();
    return this.change(state => {
      const previous = state.inbox[input.id];
      if (previous) { if (previous.digest !== hash(input)) fail('interaction_conflict'); return { duplicate: true, id: input.id }; }
      if (Object.keys(state.inbox).length >= 10000) fail('journal_capacity_requires_review');
      const recent = Object.values(state.inbox).filter(x => x.userId === input.userId && now - x.at < 10000);
      if (recent.length >= 5) fail('human_rate_limited');
      const key = hash([input.userId, input.backend, input.target]);
      const conversation = state.conversations[key] ?? { turns: 0, stopRequested: false, terminationConfirmed: false };
      if (input.command === 'ask') conversation.turns++;
      if (input.command === 'stop') conversation.stopRequested = true;
      state.conversations[key] = conversation;
      const description = input.command === 'ask'
        ? `Received ${input.text.length} characters from ${input.actorId}. Synthetic reply only; no task launched, no model called. Chat text grants no approval.`
        : input.command === 'stop' ? 'Stop REQUESTED for this synthetic conversation. No backend stop was sent; termination is NOT confirmed.'
          : `${conversation.turns} synthetic turns; stop requested: ${conversation.stopRequested}; termination confirmed: false. No backend is connected.`;
      const content = `${LABEL} ${input.backend}/${input.target}\n${description}\nReceipt: ${input.id}`;
      state.inbox[input.id] = { ...input, digest: hash(input), at: now, state: 'handled-synthetic' };
      state.outbox[input.id] = { id: input.id, channelId: this.config.channelId, content, state: 'pending', at: now, retryAt: 0 };
      return { duplicate: false, id: input.id };
    });
  }
  smoke() {
    this.change(s => { s.outbox['validation-v1'] ??= { id: 'validation-v1', channelId: this.config.channelId, content: `${LABEL} Connected only to #test. Use /ask, /status or /stop with an allowed backend and target. All replies are synthetic; coding and model execution are disabled.`, state: 'pending', at: this.now(), retryAt: 0 }; });
  }
  claim() {
    return this.change(s => {
      const now = this.now();
      if (s.nextSendAt > now) return null;
      const row = Object.values(s.outbox).find(r => r.state === 'pending' && r.retryAt <= now);
      if (!row) return null;
      if (row.channelId !== this.config.channelId) fail('outbox_scope_denied');
      row.state = 'uncertain'; row.attemptedAt = now; s.nextSendAt = now + 1200;
      return row;
    });
  }
  async deliverOne(transport) {
    const row = this.claim(); if (!row) return null;
    let result;
    try { result = await transport.send(row); } catch { return { id: row.id, state: 'uncertain' }; }
    return this.change(s => {
      const current = s.outbox[row.id];
      if (result?.kind === 'delivered' && snowflake(result.messageId)) { current.state = 'delivered'; current.messageId = result.messageId; }
      else if (result?.kind === 'rate-limited' && Number.isFinite(result.retryAfterMs) && result.retryAfterMs >= 0) {
        current.state = 'pending'; current.retryAt = this.now() + Math.max(1000, result.retryAfterMs); s.nextSendAt = Math.max(s.nextSendAt, current.retryAt);
      } else if (result?.kind === 'rejected') current.state = 'rejected';
      // Timeout, malformed success, 5xx, process death: uncertain forever until separately reconciled.
      return { id: row.id, state: current.state };
    });
  }
  summary() {
    const s = this.read();
    return { mode: 'synthetic', ...DESTINATION, inbox: Object.keys(s.inbox).length, outbox: Object.values(s.outbox).map(({ id, state, messageId }) => ({ id, state, messageId })), backendExecution: 'disabled', terminationConfirmed: false };
  }
}
