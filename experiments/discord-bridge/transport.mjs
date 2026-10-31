// Discord API v10. Native fetch intentionally avoids SDK retries of mutating calls.
import { commands, DESTINATION, fail, hash, snowflake } from './core.mjs';
import { setTimeout as delay } from 'node:timers/promises';
export class DiscordHTTP {
  constructor(token, { fetcher = fetch, now = Date.now, sleep = delay } = {}) { this.token = token; this.fetcher = fetcher; this.now = now; this.sleep = sleep; this.nextAt = 0; }
  async request(method, path, body, authenticated = true) {
    if (this.now() < this.nextAt) return { status: 429, data: { retry_after: (this.nextAt - this.now()) / 1000 } };
    // Never include request URLs, headers, raw errors or response bodies in logs.
    let response;
    try {
      response = await this.fetcher(`https://discord.com/api/v10${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bot ${this.token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { return { status: 0, data: null }; }
    let data; try { data = response.status === 204 ? null : await response.json(); } catch { return { status: 0, data: null }; }
    const reset = Number(response.headers.get('x-ratelimit-reset-after'));
    if (response.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset) && reset >= 0) this.nextAt = Math.max(this.nextAt, this.now() + reset * 1000);
    if (response.status === 429 && Number.isFinite(data?.retry_after) && data.retry_after >= 0) this.nextAt = Math.max(this.nextAt, this.now() + data.retry_after * 1000);
    return { status: response.status, data };
  }
  async get(path) {
    const deadline = this.now() + 30000;
    for (let attempt = 0; attempt < 8; attempt++) {
      const wait = this.nextAt - this.now();
      if (wait > 0) { if (this.now() + wait >= deadline) fail('discord_read_rate_limited'); await this.sleep(wait); }
      const r = await this.request('GET', path);
      if (r.status === 200) return r.data;
      if (r.status !== 429 || !Number.isFinite(r.data?.retry_after) || r.data.retry_after < 0) fail('discord_read_unavailable');
      this.nextAt = Math.max(this.nextAt, this.now() + Math.max(1000, r.data.retry_after * 1000));
    }
    fail('discord_read_rate_limited');
  }
  async send(row) {
    if (row.channelId !== DESTINATION.channelId) fail('send_scope_denied');
    const r = await this.request('POST', `/channels/${DESTINATION.channelId}/messages`, {
      content: row.content, allowed_mentions: { parse: [], replied_user: false },
      nonce: hash(row.id).slice(0, 24), enforce_nonce: true,
    });
    if (r.status === 200 && snowflake(r.data?.id) && r.data.channel_id === DESTINATION.channelId && r.data.author?.id === DESTINATION.applicationId) return { kind: 'delivered', messageId: r.data.id };
    if (r.status === 429 && Number.isFinite(r.data?.retry_after) && r.data.retry_after >= 0) return { kind: 'rate-limited', retryAfterMs: r.data.retry_after * 1000 };
    if ([400, 401, 403, 404].includes(r.status)) return { kind: 'rejected' };
    return { kind: 'uncertain' };
  }
  async acknowledge(raw, duplicate) {
    if (!snowflake(raw.id) || typeof raw.token !== 'string' || !/^[\w.-]{1,512}$/.test(raw.token)) return false;
    const r = await this.request('POST', `/interactions/${raw.id}/${raw.token}/callback`, {
      type: 4, data: { flags: 64, content: `[Plates TEST · SYNTHETIC] ${duplicate ? 'Original receipt retained.' : 'Recorded locally; watch #test for the synthetic reply.'} Receipt: ${raw.id}`, allowed_mentions: { parse: [] } },
    }, false);
    // No retry of an ambiguous interaction callback; outbox delivery is independent.
    return r.status === 204 || r.status === 200;
  }
}

export function effectivePermissions({ guild, roles, member, channel, botId }) {
  if (guild.owner_id === botId) fail('bot_must_not_own_guild');
  if (!Array.isArray(roles) || !Array.isArray(member.roles) || !Array.isArray(channel.permission_overwrites)) fail('permissions_unavailable');
  const everyone = roles.find(r => r.id === guild.id);
  if (!everyone || member.roles.some(id => !roles.some(r => r.id === id))) fail('roles_unavailable');
  const bits = value => { if (typeof value !== 'string' || !/^\d+$/.test(value)) fail('invalid_permissions'); return BigInt(value); };
  let permissions = roles.filter(r => r.id === guild.id || member.roles.includes(r.id)).reduce((n, r) => n | bits(r.permissions), 0n);
  if (permissions & 8n) fail('administrator_permission_denied');
  const overwrite = o => { permissions = (permissions & ~bits(o.deny)) | bits(o.allow); };
  const all = channel.permission_overwrites.find(o => o.type === 0 && o.id === guild.id); if (all) overwrite(all);
  let deny = 0n, allow = 0n;
  for (const o of channel.permission_overwrites.filter(o => o.type === 0 && member.roles.includes(o.id))) { deny |= bits(o.deny); allow |= bits(o.allow); }
  permissions = (permissions & ~deny) | allow;
  const own = channel.permission_overwrites.find(o => o.type === 1 && o.id === botId); if (own) overwrite(own);
  return permissions;
}

export async function verifyIdentityAndScope(http) {
  const d = DESTINATION;
  const app = await http.get('/oauth2/applications/@me'), bot = await http.get('/users/@me');
  if (app.id !== d.applicationId || bot.id !== d.applicationId || bot.bot !== true || app.bot && app.bot.id !== bot.id) fail('bot_application_mismatch');
  const guild = await http.get(`/guilds/${d.guildId}`), channel = await http.get(`/channels/${d.channelId}`);
  if (guild.id !== d.guildId || channel.id !== d.channelId || channel.guild_id !== d.guildId || channel.type !== 0 || channel.name !== 'test') fail('guild_channel_mismatch');
  const member = await http.get(`/guilds/${d.guildId}/members/${bot.id}`), roles = await http.get(`/guilds/${d.guildId}/roles`);
  if (member.user?.id !== bot.id || effectivePermissions({ guild, channel, member, roles, botId: bot.id }) !== 3072n) fail('exact_view_send_permissions_required');
  return { applicationId: app.id, botId: bot.id, guildId: guild.id, channelId: channel.id, permissions: '3072' };
}

function commandShape(c) {
  const option = o => Object.fromEntries(['name', 'description', 'type', 'required', 'max_length', 'choices'].filter(k => o[k] !== undefined).map(k => [k, k === 'choices' ? o[k].map(v => ({ name: v.name, value: v.value })) : o[k]]));
  return { name: c.name, type: c.type, description: c.description, default_member_permissions: c.default_member_permissions, options: c.options?.map(option) };
}
export async function registerCommands(http, bridge) {
  const path = `/applications/${DESTINATION.applicationId}/guilds/${DESTINATION.guildId}/commands`;
  const existing = await http.get(path);
  if (!Array.isArray(existing)) fail('commands_unavailable');
  // Never bulk overwrite or mutate an existing command with differing bytes.
  for (const command of commands) {
    const found = existing.find(c => c.name === command.name && c.type === 1);
    if (found && hash(commandShape(found)) !== hash(command)) fail('existing_command_conflict');
  }
  for (const command of commands) {
    const found = existing.find(c => c.name === command.name && c.type === 1);
    if (found) { bridge.change(s => { s.registration[command.name] = { state: 'verified', id: found.id }; }); continue; }
    const claimed = bridge.change(s => { if (s.registration[command.name]) return false; s.registration[command.name] = { state: 'uncertain', digest: hash(command) }; return true; });
    if (!claimed) fail('command_registration_requires_reconciliation');
    const r = await http.request('POST', path, command);
    if (![200, 201].includes(r.status) || !snowflake(r.data?.id) || hash(commandShape(r.data)) !== hash(command)) fail('command_registration_unconfirmed');
    bridge.change(s => { s.registration[command.name] = { state: 'verified', id: r.data.id }; });
  }
}
