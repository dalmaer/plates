import { createHash } from 'node:crypto';
import { normalizeDiscordMessage } from './bridge.mjs';

const snowflake = value => typeof value === 'string' && /^[1-9][0-9]{16,19}$/.test(value);
const origin = 'https://discord.com/api/v10';
const gatewayUrl = value => {
  const url = new URL(value);
  if (url.protocol !== 'wss:' || !/^gateway(?:-[a-z0-9-]+)?\.discord\.gg$/.test(url.hostname)
    || url.username || url.password || url.port || url.pathname !== '/') throw new Error('discord_gateway_url');
  url.search = '?v=10&encoding=json'; return url.href;
};

/** Real Discord REST/Gateway adapter, inert until explicit start(). No env/secret reads. */
export function createDiscordAdapter({ enabled = false, config, credentials, fetcher = fetch, Socket = WebSocket,
  onMessage, onFault = () => {}, now = Date.now, reconnectMs = 1000 }) {
  const clients = new Map(), channels = new Map(), earlyEchoes = new Map(), pendingSends = new Map();
  let stopped = true, started = false, readyResolve, readyReject, startupTimer;
  const assertEnabled = () => { if (!enabled || stopped) throw new Error('discord_disabled'); };
  function stop() {
    stopped = true; clearTimeout(startupTimer); readyReject?.(new Error('discord_start_stopped'));
    for (const c of clients.values()) { clearInterval(c.heartbeat); clearTimeout(c.reconnect); c.socket?.close(1000); }
    earlyEchoes.clear(); pendingSends.clear();
  }
  function fault(code) { if (stopped) return; stop(); onFault(code); }
  async function request(c, method, path, body, signal) {
    assertEnabled();
    if (now() < c.blockedUntil) throw new Error('discord_rate_limited');
    const response = await fetcher(`${origin}${path}`, { method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      headers: { Authorization: `Bot ${c.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.redirected || response.url && response.url !== `${origin}${path}`) throw new Error('discord_redirect');
    const length = Number(response.headers.get('content-length'));
    if (length > 512 * 1024) { void response.body?.cancel(); throw new Error('discord_response_size'); }
    // Read with a hard bound; never log response bodies or provider errors.
    const reader = response.body?.getReader(); if (!reader) throw new Error('discord_response');
    let size = 0; const chunks = [];
    try {
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
        if (size > 512 * 1024) throw new Error('discord_response_size'); chunks.push(part.value); }
    } finally { void reader.cancel().catch(() => {}); }
    let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('discord_response'); }
    if (response.status === 429) {
      c.blockedUntil = now() + Math.max(1000, Math.min(3_600_000, Number(value.retry_after) * 1000 || 60_000));
      throw new Error('discord_rate_limited'); // Never retry a message POST.
    }
    if (!response.ok) throw new Error('discord_http');
    if (response.headers.get('x-ratelimit-remaining') === '0') c.blockedUntil = now() + Math.max(1000, Number(response.headers.get('x-ratelimit-reset-after')) * 1000 || 1000);
    return value;
  }
  async function channel(c, threadId, signal) {
    const key = `${c.id}:${threadId}`;
    if (channels.has(key)) return channels.get(key);
    if (channels.size >= 200) throw new Error('discord_channel_capacity');
    const value = await request(c, 'GET', `/channels/${threadId}`, null, signal);
    if (value.id !== threadId || value.guild_id !== config.guildId || value.type !== 11 || !config.channelIds.includes(value.parent_id)) return null;
    if (config.trial && value.owner_id !== config.ownerIds[0]) return null;
    channels.set(key, value); return value;
  }
  async function message(c, raw) {
    if (stopped || raw.guild_id !== config.guildId || !snowflake(raw.channel_id) || raw.webhook_id) return;
    if (config.trial && raw.channel_id !== config.trial.threadId) return;
    // Unknown senders cannot cause metadata fetches or load the model.
    if (![...config.ownerIds, ...config.userIds, ...config.bots.map(b => b.id)].includes(raw.author?.id)) return;
    if (raw.author?.id === c.id || !raw.mentions?.some(m => m.id === c.id)) return;
    const metadata = await channel(c, raw.channel_id);
    if (!metadata) return;
    const normalized = normalizeDiscordMessage(raw, { receiverBotId: c.id, channel: metadata });
    if (!normalized || stopped) return;
    if (normalized.bot && pendingSends.has(`${raw.author.id}:${raw.channel_id}`)) {
      if (earlyEchoes.size >= 100) throw new Error('discord_echo_capacity');
      earlyEchoes.set(`${c.id}:${raw.id}`, normalized); return;
    }
    onMessage(normalized); // Callback admits synchronously; it must not await a model turn.
  }
  function connect(c, resume = false) {
    if (stopped) return;
    const socket = c.socket = new Socket(gatewayUrl(resume ? c.resumeUrl : c.gateway));
    let ack = true;
    const send = payload => { if (!stopped && c.socket === socket && socket.readyState === 1) socket.send(JSON.stringify(payload)); };
    const heartbeat = () => { if (!ack) { socket.close(4000); return; } ack = false; send({ op: 1, d: c.sequence }); };
    socket.addEventListener('message', event => {
      if (stopped || c.socket !== socket) return;
      try {
        if (typeof event.data !== 'string' || event.data.length > 1024 * 1024) throw new Error();
        const packet = JSON.parse(event.data);
        if (packet.s !== null && packet.s !== undefined) {
          if (!Number.isSafeInteger(packet.s) || packet.s < 0) throw new Error(); c.sequence = packet.s;
        }
        if (packet.op === 10) {
          const interval = packet.d?.heartbeat_interval;
          if (!Number.isFinite(interval) || interval < 100 || interval > 120_000) throw new Error();
          clearInterval(c.heartbeat); c.heartbeat = setInterval(heartbeat, interval);
          send(resume ? { op: 6, d: { token: c.token, session_id: c.session, seq: c.sequence } }
            : { op: 2, d: { token: c.token, intents: 513, properties: { os: 'linux', browser: 'plates-discord-pilot', device: 'plates-discord-pilot' } } });
        } else if (packet.op === 11) ack = true;
        else if (packet.op === 1) { ack = true; heartbeat(); }
        else if (packet.op === 7) socket.close(4000);
        else if (packet.op === 9) fault('discord_invalid_session');
        else if (packet.op === 0) {
          if (packet.t === 'READY') {
            if (packet.d?.user?.id !== c.id || !packet.d.user.bot || typeof packet.d.session_id !== 'string'
              || !packet.d.guilds?.some(g => g.id === config.guildId)) throw new Error();
            c.session = packet.d.session_id; c.resumeUrl = gatewayUrl(packet.d.resume_gateway_url); c.ready = true;
            if (clients.size === config.bots.length && [...clients.values()].every(client => client.ready)) readyResolve?.();
          } else if (packet.t === 'RESUMED') c.ready = true;
          else if (packet.t === 'CHANNEL_UPDATE' || packet.t === 'CHANNEL_DELETE' || packet.t === 'THREAD_UPDATE' || packet.t === 'THREAD_DELETE') channels.delete(`${c.id}:${packet.d?.id}`);
          else if (packet.t === 'GUILD_DELETE' && packet.d?.id === config.guildId) fault('discord_guild_unavailable');
          else if (packet.t === 'MESSAGE_CREATE' && c.ready) void message(c, packet.d).catch(() => fault('discord_ingress_failed'));
        }
      } catch { fault('discord_gateway_failed'); }
    });
    socket.addEventListener('close', event => {
      if (stopped || c.socket !== socket) return;
      c.ready = false; clearInterval(c.heartbeat);
      if ([4004, 4010, 4011, 4012, 4013, 4014].includes(event.code) || !c.session || ++c.reconnects > 3) { fault('discord_disconnected'); return; }
      c.reconnect = setTimeout(() => connect(c, true), reconnectMs * 2 ** (c.reconnects - 1));
    });
    socket.addEventListener('error', () => { if (!stopped && c.socket === socket) socket.close(4000); });
  }
  return { mode: 'live',
    async start() {
      if (!enabled) throw new Error('discord_disabled');
      if (started) throw new Error('discord_already_started');
      started = true; stopped = false;
      const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; }); void ready.catch(() => {});
      startupTimer = setTimeout(() => readyReject(new Error('discord_ready_timeout')), 10_000);
      try {
        for (const identity of config.bots) {
          const token = credentials?.[identity.id];
          if (typeof token !== 'string' || !token || /\s/.test(token)) throw new Error('discord_credentials');
          const c = { id: identity.id, token, blockedUntil: 0, sequence: null, reconnects: 0, ready: false }; clients.set(c.id, c);
          const self = await request(c, 'GET', '/users/@me');
          if (self.id !== c.id || self.bot !== true) throw new Error('discord_identity');
          const gateway = await request(c, 'GET', '/gateway/bot');
          if (!gateway.session_start_limit || gateway.session_start_limit.remaining < 1) throw new Error('discord_session_limit');
          c.gateway = gatewayUrl(gateway.url); connect(c);
        }
        await ready; clearTimeout(startupTimer); readyReject = null;
      } catch { stop(); throw new Error('discord_start_failed'); }
    },
    async send(outbound) {
      assertEnabled();
      const c = clients.get(outbound.botId), mentions = outbound.allowed_mentions;
      if (!c?.ready || outbound.guildId !== config.guildId || !snowflake(outbound.threadId)
        || config.trial && outbound.threadId !== config.trial.threadId
        || typeof outbound.content !== 'string' || outbound.content.length > 2000 || !outbound.content
        || !mentions || !Array.isArray(mentions.parse) || mentions.parse.length !== 0 || !Array.isArray(mentions.roles) || mentions.roles.length !== 0 || mentions.replied_user !== false
        || !Array.isArray(mentions.users) || mentions.users.length > 1
        || mentions.users.some(value => !config.bots.some(b => b.id === value && b.id !== c.id))
        || typeof outbound.operationId !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(outbound.operationId)) throw new Error('discord_outbound_scope');
      const key = `${c.id}:${outbound.threadId}`;
      if (pendingSends.has(key)) throw new Error('discord_send_unsettled');
      if (!await channel(c, outbound.threadId, outbound.signal)) throw new Error('discord_channel_scope');
      if (outbound.signal?.aborted) throw new Error('discord_interrupted');
      pendingSends.set(key, null);
      const nonce = createHash('sha256').update(outbound.operationId).digest('hex').slice(0, 24);
      let result;
      try { result = await request(c, 'POST', `/channels/${outbound.threadId}/messages`, {
        content: outbound.content, allowed_mentions: mentions, nonce, enforce_nonce: true,
      }, outbound.signal); } catch { throw new Error('discord_send_uncertain'); }
      if (!snowflake(result.id) || result.channel_id !== outbound.threadId || result.author?.id !== c.id || result.content !== outbound.content) throw new Error('discord_send_uncertain');
      pendingSends.set(key, result.id); return { id: result.id };
    },
    committed(messageId) {
      // Called only AFTER the core persists the send receipt. Early Gateway echoes wait here.
      for (const [key, id] of pendingSends) if (id === messageId) pendingSends.delete(key);
      for (const [key, message] of earlyEchoes) if (message.id === messageId) { earlyEchoes.delete(key); if (!stopped) onMessage(message); }
    },
    stop,
  };
}
