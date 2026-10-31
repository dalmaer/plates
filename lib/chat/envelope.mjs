// The transport-neutral chat envelope (phase 149). Every transport adapter maps its
// events to this shape, and the seam decides only from it.
//
// - Every platform ID is a string: a Discord snowflake does not survive a JS number.
// - Identity comes from the authenticated origin the transport attests, never from
//   the text. Text is an untrusted body: a claimed name, role or approval in it
//   supplies nothing.
// - kind: `observation` (something said or posted; never triggers work), `request`
//   (the owner asks an agent something), `command` (status or stop).
import { createHash } from 'node:crypto';

export const ENVELOPE_KINDS = Object.freeze(['observation', 'request', 'command']);
export const ORIGIN_KINDS = Object.freeze(['human', 'bot', 'agent']);
export const COMMANDS = Object.freeze({ ask: 'request', status: 'command', stop: 'command' });
export const ASK_EFFECTS = Object.freeze(['none', 'local-edits', 'tests', 'push', 'merge', 'deployment', 'security']);
const ID = /^[A-Za-z0-9@_.:-]{1,100}$/;
const PROJECT = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_TEXT = 4000;

export class EnvelopeError extends Error {}
const fail = message => { throw new EnvelopeError(message); };
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const id = (value, name) => (typeof value === 'string' && ID.test(value) ? value : fail(`${name} must be a string ID.`));
const optionalId = (value, name) => (value === undefined ? undefined : id(value, name));

/**
 * Build a validated, frozen envelope. `origin.authenticated` is set by the transport
 * from the connection the event arrived on, never derived from message content.
 */
export function createEnvelope(input) {
  if (!record(input)) fail('An envelope is an object.');
  const provider = id(input.provider, 'provider');
  const scopeId = id(input.scopeId, 'scopeId');
  const messageId = id(input.messageId, 'messageId');
  const kind = ENVELOPE_KINDS.includes(input.kind) ? input.kind : fail('kind must be observation, request or command.');
  const o = record(input.origin) ? input.origin : fail('origin is required.');
  if (!ORIGIN_KINDS.includes(o.kind)) fail('origin.kind must be human, bot or agent.');
  if (typeof o.authenticated !== 'boolean') fail('origin.authenticated must be stated by the transport.');
  const origin = { kind: o.kind, id: id(o.id, 'origin.id'), authenticated: o.authenticated };
  const text = input.text === undefined ? '' : typeof input.text === 'string' ? input.text.slice(0, MAX_TEXT) : fail('text must be a string.');
  let command;
  if (kind === 'observation') {
    if (input.command !== undefined) fail('An observation carries no command.');
  } else {
    const c = record(input.command) ? input.command : fail('A request or command names its command.');
    if (COMMANDS[c.name] !== kind) fail(`Command ${String(c.name)} is not a ${kind}.`);
    const effect = c.effect ?? 'none';
    if (!ASK_EFFECTS.includes(effect) || (c.name !== 'ask' && effect !== 'none')) fail('Unknown or misplaced effect.');
    command = { name: c.name, effect };
  }
  const projectId = input.projectId === undefined ? undefined
    : typeof input.projectId === 'string' && PROJECT.test(input.projectId) ? input.projectId : fail('projectId is a lower-case project name.');
  const t = input.target ?? { kind: 'coordinator', id: 'coordinator' };
  if (!record(t) || !['coordinator', 'agent'].includes(t.kind)) fail('target.kind must be coordinator or agent.');
  const envelope = {
    schema: 1,
    id: `${provider}/${scopeId}/${messageId}`,
    provider,
    accountId: optionalId(input.accountId, 'accountId'),
    scopeId,
    conversationId: id(input.conversationId, 'conversationId'),
    messageId,
    kind,
    origin,
    target: { kind: t.kind, id: id(t.id, 'target.id') },
    projectId,
    command,
    text,
  };
  for (const key of Object.keys(envelope)) if (envelope[key] === undefined) delete envelope[key];
  return deepFreeze(envelope);
}

/** Content digest: the same ingress ID with different content is a conflict, not a retry. */
export const envelopeDigest = envelope => createHash('sha256').update(canonical(envelope)).digest('hex');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (record(value)) for (const v of Object.values(value)) deepFreeze(v);
  return Object.freeze(value);
}
