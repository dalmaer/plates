// Discord adapter for the chat seam: pure mapping, no gateway, no token, no network.
//
// Inbound: an APPLICATION_COMMAND interaction for `/plates ask|status|stop` becomes a
// request or command envelope; a MESSAGE_CREATE event becomes an observation (Plates
// asks for no message-content intent and never acts on free text). The caller — the
// gateway connection, when it exists — states whether the event arrived on its
// authenticated connection. Snowflakes stay strings.
//
// Outbound: neutral outbox posts become Discord message bodies that cannot ping
// anyone (`allowed_mentions.parse: []`). The interaction token never enters the
// envelope or the outbox; the live connection holds it in memory.
import { ASK_EFFECTS, createEnvelope, EnvelopeError } from './envelope.mjs';

export const PROVIDER = 'discord';
const APPLICATION_COMMAND = 2;
const SUB_COMMAND = 1;
const STRING = 3;
const MAX_CONTENT = 2000;
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);

const project = { type: STRING, name: 'project', description: 'Project name', required: true };
const agent = { type: STRING, name: 'agent', description: 'Agent (default: coordinator)', required: false };
/** The `/plates` command definition to register with Discord (data only). */
export const PLATES_COMMAND = Object.freeze({
  name: 'plates',
  description: 'Talk to Plates agents',
  type: 1,
  options: [
    { type: SUB_COMMAND, name: 'ask', description: 'Ask an agent something', options: [
      project,
      { type: STRING, name: 'text', description: 'What to ask', required: true },
      agent,
      { type: STRING, name: 'effect', description: 'What it may change (default: none)', required: false,
        choices: ASK_EFFECTS.map(value => ({ name: value, value })) },
    ] },
    { type: SUB_COMMAND, name: 'status', description: "A project agent's status", options: [project, agent] },
    { type: SUB_COMMAND, name: 'stop', description: 'Stop a project agent', options: [project, agent] },
  ],
});

/**
 * @param {any} payload Discord interaction JSON
 * @param {{ authenticated: boolean }} via what the receiving connection attests
 */
export function fromInteraction(payload, { authenticated }) {
  if (!record(payload) || payload.type !== APPLICATION_COMMAND || payload.data?.name !== 'plates') throw new EnvelopeError('Not a /plates command interaction.');
  const user = payload.member?.user ?? payload.user;
  if (!record(user)) throw new EnvelopeError('The interaction names no user.');
  const sub = payload.data.options?.[0];
  if (!record(sub) || sub.type !== SUB_COMMAND || !['ask', 'status', 'stop'].includes(sub.name)) throw new EnvelopeError('Unknown /plates subcommand.');
  const options = Object.fromEntries((sub.options ?? []).filter(o => o?.type === STRING && typeof o.value === 'string').map(o => [o.name, o.value]));
  const target = options.agent && options.agent !== 'coordinator' ? { kind: 'agent', id: options.agent } : { kind: 'coordinator', id: 'coordinator' };
  return createEnvelope({
    provider: PROVIDER,
    accountId: payload.application_id,
    scopeId: payload.guild_id ?? '@dm',
    conversationId: payload.channel_id,
    messageId: payload.id,
    kind: sub.name === 'ask' ? 'request' : 'command',
    origin: { kind: user.bot === true ? 'bot' : 'human', id: user.id, authenticated: authenticated === true },
    target,
    projectId: options.project,
    command: { name: sub.name, ...(sub.name === 'ask' && options.effect ? { effect: options.effect } : {}) },
    text: sub.name === 'ask' ? options.text ?? '' : '',
  });
}

/**
 * A MESSAGE_CREATE event: always an observation, whatever its text says.
 * @param {any} payload Discord message JSON
 * @param {{ authenticated: boolean }} via
 */
export function fromMessage(payload, { authenticated }) {
  if (!record(payload) || !record(payload.author)) throw new EnvelopeError('Not a Discord message.');
  const bot = payload.author.bot === true || payload.webhook_id !== undefined;
  return createEnvelope({
    provider: PROVIDER,
    scopeId: payload.guild_id ?? '@dm',
    conversationId: payload.channel_id,
    messageId: payload.id,
    kind: 'observation',
    origin: { kind: bot ? 'bot' : 'human', id: payload.author.id, authenticated: authenticated === true },
    text: typeof payload.content === 'string' ? payload.content : '',
  });
}

function content(post) {
  const label = post.kind === 'handoff' ? `[${post.projectId}] ${post.from} → ${post.to}: ` : '';
  const text = label + post.text;
  return text.length > MAX_CONTENT ? `${text.slice(0, MAX_CONTENT - 1)}…` : text;
}

/** The body for answering an interaction in place (CHANNEL_MESSAGE_WITH_SOURCE). */
export function interactionResponse(post) {
  return { type: 4, data: { content: content(post), allowed_mentions: { parse: [] } } };
}

/** A channel message for an outbox post: route and body, nothing sent. */
export function channelMessage(post) {
  if (typeof post?.conversationId !== 'string' || !/^\d{1,25}$/.test(post.conversationId)) throw new EnvelopeError('A Discord channel ID is a snowflake string.');
  return { method: 'POST', path: `/channels/${post.conversationId}/messages`, body: { content: content(post), allowed_mentions: { parse: [] } } };
}
