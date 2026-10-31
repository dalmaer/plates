// The chat seam (phase 149): decides what an inbound chat event may do.
//
// - Only an authenticated owner's slash command (ask, status, stop) can reach an
//   agent. Bot-authored events, agent posts, free text and unauthenticated or
//   non-owner origins trigger nothing, whatever their text says.
// - An ask that would change something is checked against the project's autonomy
//   level, read fresh from `.plates/autonomy.json` through the autonomy module. Chat
//   may hand an agent only work its level allows within a task; anything else is
//   refused in chat with the reason. Status and stop never exceed a level.
// - Every inbound ID is persisted before dispatch. A replayed event (a gateway
//   reconnect, a redelivery) returns its recorded outcome and never repeats the
//   effect; one interrupted mid-dispatch is uncertain, not re-run.
// - Agent hand-offs travel on Plates' own runtime route with agent provenance and
//   are posted to the channel so the owner sees them; their echo back from the
//   platform is bot-authored and ignored.
//
// Accepting a request hands it to the agent; the agent's host permissions and
// Plates' command gates still apply to whatever it then does.
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autonomyReport } from '../autonomy.mjs';
import { createEnvelope, envelopeDigest } from './envelope.mjs';
import { openJournal } from './journal.mjs';
import { flushOutbox, openOutbox } from './outbox.mjs';

const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);

function readBounded(file, optional) {
  let info;
  try { info = lstatSync(file); } catch (e) { if (optional && /** @type {any} */ (e).code === 'ENOENT') return null; throw e; }
  if (!info.isFile() || info.nlink !== 1 || info.size > 65536) throw new Error(`${file} must be a bounded regular file without links.`);
  return readFileSync(file, 'utf8');
}

/** The project's autonomy report, or why it cannot be read. Read on every use: a level change applies at once. */
export function readProjectAutonomy(root) {
  try {
    const config = JSON.parse(/** @type {string} */ (readBounded(join(root, '.plates/plates.json'), false)));
    const text = readBounded(join(root, '.plates/autonomy.json'), true);
    return { ok: true, report: autonomyReport(text === null ? undefined : JSON.parse(text), config.repo) };
  } catch (e) {
    return { ok: false, reason: `autonomy-unreadable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** What chat may start at this level. Status and stop never exceed a level; asks without an effect only read. */
export function chatCeiling(autonomy, command) {
  if (command.name !== 'ask' || command.effect === 'none') return { allowed: true };
  if (!autonomy.ok) return { allowed: false, reason: autonomy.reason };
  const { level, scopes } = autonomy.report;
  const scope = scopes.find(s => s.scope === command.effect);
  if (scope?.authority === 'within-authorized-task') return { allowed: true, level };
  return {
    allowed: false,
    level,
    reason: `beyond-level: ${command.effect} at risk level ${level} needs ${scope?.authority ?? 'specific-approval'}; chat cannot grant it`,
  };
}

/**
 * @param {object} options
 * @param {string} options.dir durable store for the inbox and outbox journals
 * @param {{ provider: string, id: string }} options.owner the owner's platform identity
 * @param {Record<string, { root: string, agents: Record<string, any>, conversations?: string[] }>} options.projects
 * @param {() => string} [options.now]
 */
export function createSeam({ dir, owner, projects, now = () => new Date().toISOString() }) {
  if (!record(owner) || typeof owner.provider !== 'string' || typeof owner.id !== 'string') throw new Error('The seam needs the owner identity as strings.');
  const inbox = openJournal(dir, 'inbox.jsonl');
  const outbox = openOutbox(dir, { now });
  /** @type {Map<string, any>} */
  const seen = new Map();
  for (const line of inbox.read()) {
    if (line.op === 'outcome') { const entry = seen.get(line.id); if (entry) entry.outcome = line.outcome; }
    else seen.set(line.id, { digest: line.digest, envelope: line.envelope, op: line.op, outcome: line.outcome });
  }

  const remember = (op, envelope, digest, outcome) => {
    inbox.append({ op, id: envelope.id, digest, envelope, ...(outcome ? { outcome } : {}), at: now() });
    seen.set(envelope.id, { digest, envelope, op, outcome });
    return outcome;
  };
  const reply = (envelope, text) => outbox.enqueue(`reply:${envelope.id}`, {
    kind: 'reply', conversationId: envelope.conversationId, replyTo: envelope.messageId, projectId: envelope.projectId ?? null, text,
  });
  const refuse = (envelope, digest, reason) => {
    const outcome = { status: 'refused', reason };
    remember('inbound', envelope, digest, outcome);
    reply(envelope, `Refused: ${reason}`);
    return outcome;
  };

  async function handle(input) {
    let envelope;
    try { envelope = createEnvelope(input); }
    catch (e) { return { status: 'ignored', reason: `malformed: ${e instanceof Error ? e.message : String(e)}` }; }
    const digest = envelopeDigest(envelope);
    const prior = seen.get(envelope.id);
    if (prior) {
      if (prior.digest !== digest) return { status: 'conflict', reason: 'same-id-different-content' };
      return { status: 'duplicate', original: prior.outcome ?? { status: 'uncertain', reason: 'interrupted-during-dispatch' } };
    }
    const { origin } = envelope;
    // Identity: the origin the transport attests, never the text.
    if (origin.kind !== 'human') return remember('inbound', envelope, digest, { status: 'observed', reason: `${origin.kind}-authored` });
    if (envelope.kind === 'observation') return remember('inbound', envelope, digest, { status: 'observed', reason: 'free-text-never-triggers-work' });
    if (!origin.authenticated) return remember('inbound', envelope, digest, { status: 'ignored', reason: 'unauthenticated-origin' });
    if (envelope.provider !== owner.provider || origin.id !== owner.id) return refuse(envelope, digest, 'not-the-owner');

    const project = envelope.projectId ? projects[envelope.projectId] : undefined;
    if (!project) return refuse(envelope, digest, `unknown-project: ${envelope.projectId ?? '(none)'}`);
    if (project.conversations && !project.conversations.includes(envelope.conversationId)) return refuse(envelope, digest, 'channel-not-bound-to-project');
    const agent = project.agents?.[envelope.target.id];
    if (!agent) return refuse(envelope, digest, `unknown-agent: ${envelope.target.id}`);
    const command = /** @type {{ name: string, effect: string }} */ (envelope.command);
    const ceiling = chatCeiling(readProjectAutonomy(project.root), command);
    if (!ceiling.allowed) return refuse(envelope, digest, /** @type {string} */ (ceiling.reason));

    // Persist the ingress before the effect, so a replay can never run it twice.
    remember('received', envelope, digest);
    let outcome;
    try {
      if (command.name === 'status') {
        outcome = { status: 'done', command: 'status', text: `${envelope.projectId}/${envelope.target.id}: ${String(await agent.status())}` };
      } else if (command.name === 'stop') {
        const result = await agent.stop();
        const state = result?.state === 'stopped' ? 'stopped' : 'stop-requested';
        outcome = { status: 'done', command: 'stop', state, text: `${envelope.projectId}/${envelope.target.id}: ${state === 'stopped' ? 'stopped' : 'stop requested; not yet confirmed stopped'}` };
      } else {
        const answer = await agent.ask({ text: envelope.text, effect: command.effect, envelopeId: envelope.id });
        outcome = { status: 'done', command: 'ask', effect: command.effect, text: `${envelope.projectId}/${envelope.target.id}: ${String(answer?.reply ?? answer)}` };
      }
    } catch (e) {
      outcome = { status: 'failed', command: command.name, text: `${envelope.projectId}/${envelope.target.id}: ${command.name} failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    inbox.append({ op: 'outcome', id: envelope.id, outcome, at: now() });
    /** @type {any} */ (seen.get(envelope.id)).outcome = outcome;
    reply(envelope, outcome.text);
    return outcome;
  }

  /** An agent hands work to another agent: delivered on the runtime route, posted for the owner to see. Idempotent by id. */
  async function handoff({ id, projectId, from, to, text, conversationId }) {
    const project = projects[projectId];
    if (!project) throw new Error(`unknown-project: ${projectId}`);
    const target = project.agents?.[to] ?? (() => { throw new Error(`unknown-agent: ${to}`); })();
    const conversation = conversationId ?? project.conversations?.[0];
    if (typeof conversation !== 'string') throw new Error('A hand-off needs the project conversation.');
    const envelope = createEnvelope({
      provider: 'plates', scopeId: projectId, conversationId: conversation, messageId: id, kind: 'observation',
      origin: { kind: 'agent', id: from, authenticated: true }, target: { kind: 'agent', id: to }, projectId, text,
    });
    const digest = envelopeDigest(envelope);
    const prior = seen.get(envelope.id);
    if (prior) return prior.digest === digest ? { status: 'duplicate', original: prior.outcome } : { status: 'conflict', reason: 'same-id-different-content' };
    remember('handoff', envelope, digest);
    outbox.enqueue(`handoff:${envelope.id}`, { kind: 'handoff', conversationId: conversation, projectId, from, to, text });
    await target.receive?.({ from, text, id: envelope.id });
    const outcome = { status: 'handed-off', from, to };
    inbox.append({ op: 'outcome', id: envelope.id, outcome, at: now() });
    /** @type {any} */ (seen.get(envelope.id)).outcome = outcome;
    return outcome;
  }

  /**
   * After a transport reconnect: replay what was seen and said, run nothing.
   * Claimed posts already became uncertain when the store opened; they stay so.
   */
  function reconnect() {
    const observations = [];
    for (const [id, entry] of seen) {
      if (entry.envelope.kind === 'observation') observations.push({ id, origin: entry.envelope.origin, text: entry.envelope.text, outcome: entry.outcome });
    }
    for (const post of outbox.list('delivered')) observations.push({ id: post.id, origin: { kind: 'plates' }, text: post.post.text, receipt: post.receipt });
    return { observations, uncertain: outbox.list('uncertain'), pending: outbox.list('pending') };
  }

  return { handle, handoff, reconnect, flush: transport => flushOutbox(outbox, transport), outbox };
}
