// The chat outbox: every post Plates makes goes through it.
//
//   pending → claimed → delivered | uncertain | refused
//
// A post is claimed (durably) before it is handed to the transport. A claimed post
// that has no outcome when the store is reopened may have reached the platform, so it
// becomes uncertain, never pending again. An uncertain post is never retried
// automatically; it leaves uncertain only with a platform receipt found by
// reconciliation. The store is a JSON-lines journal under the given directory.
import { createHash } from 'node:crypto';
import { openJournal } from './journal.mjs';

export const OUTBOX_STATES = Object.freeze(['pending', 'claimed', 'delivered', 'uncertain', 'refused']);
const NEXT = Object.freeze({
  pending: ['claimed', 'refused'],
  claimed: ['delivered', 'uncertain', 'refused'],
  uncertain: ['delivered'],
  delivered: [],
  refused: [],
});
const POST_KINDS = ['reply', 'observation', 'handoff'];
const ID = /^[A-Za-z0-9@_.:/-]{1,200}$/;

export class OutboxError extends Error {}
const fail = message => { throw new OutboxError(message); };
const digest = post => createHash('sha256').update(JSON.stringify(post)).digest('hex');

/** A transport error that proves the platform did not accept the post (for example a 4xx before any effect). */
export class RefusedByTransport extends Error {}

export function openOutbox(dir, { now = () => new Date().toISOString() } = {}) {
  const journal = openJournal(dir, 'outbox.jsonl');
  /** @type {Map<string, any>} */
  const posts = new Map();
  for (const [i, line] of journal.read().entries()) {
    if (line.op === 'enqueue' && !posts.has(line.id)) posts.set(line.id, { id: line.id, post: line.post, digest: line.digest, state: 'pending', history: [] });
    else if (line.op === 'transition' && posts.get(line.id)?.state === line.from && NEXT[line.from].includes(line.to)) apply(posts.get(line.id), line);
    else fail(`outbox.jsonl line ${i + 1} is not a valid step; refusing to guess.`);
  }

  function apply(entry, line) {
    entry.state = line.to;
    entry.history.push({ from: line.from, to: line.to, at: line.at, ...(line.receipt ? { receipt: line.receipt } : {}), ...(line.reason ? { reason: line.reason } : {}) });
    if (line.receipt) entry.receipt = line.receipt;
    if (line.reason) entry.reason = line.reason;
  }
  function move(id, to, extra = {}) {
    const entry = posts.get(id) ?? fail(`No outbox post ${id}.`);
    if (!NEXT[entry.state].includes(to)) fail(`Outbox post ${id} cannot go from ${entry.state} to ${to}.`);
    const line = { op: 'transition', id, from: entry.state, to, at: now(), ...extra };
    journal.append(line);
    apply(entry, line);
    return view(entry);
  }
  const view = entry => structuredClone({ id: entry.id, state: entry.state, post: entry.post, receipt: entry.receipt, reason: entry.reason, history: entry.history });

  // Anything claimed before a restart has an unknown outcome.
  for (const entry of posts.values()) if (entry.state === 'claimed') move(entry.id, 'uncertain', { reason: 'interrupted-after-claim' });

  return {
    /** Idempotent by id: the same id and body returns the existing post; a different body conflicts. */
    enqueue(id, post) {
      if (typeof id !== 'string' || !ID.test(id)) fail('An outbox post needs a string id.');
      if (!post || !POST_KINDS.includes(post.kind) || typeof post.conversationId !== 'string' || typeof post.text !== 'string') {
        fail('An outbox post names its kind, conversation and text.');
      }
      const d = digest(post);
      const existing = posts.get(id);
      if (existing) return existing.digest === d ? view(existing) : fail(`Outbox post ${id} already exists with different content.`);
      journal.append({ op: 'enqueue', id, post, digest: d, at: now() });
      const entry = { id, post: structuredClone(post), digest: d, state: 'pending', history: [] };
      posts.set(id, entry);
      return view(entry);
    },
    claim: id => move(id, 'claimed'),
    deliver: (id, receipt) => (typeof receipt === 'string' && receipt ? move(id, 'delivered', { receipt }) : fail('Delivery needs the platform receipt.')),
    uncertain: (id, reason) => move(id, 'uncertain', { reason: String(reason || 'unknown') }),
    refuse: (id, reason) => move(id, 'refused', { reason: String(reason || 'refused') }),
    /** The only way out of uncertain: explicit evidence the original post landed. */
    reconcile: (id, receipt) => (typeof receipt === 'string' && receipt ? move(id, 'delivered', { receipt, reason: 'reconciled' }) : fail('Reconciliation needs the platform receipt.')),
    get: id => (posts.has(id) ? view(posts.get(id)) : undefined),
    list: state => [...posts.values()].filter(e => !state || e.state === state).map(view),
  };
}

/**
 * Hand every pending post to the transport once. `transport.send(post)` resolves to
 * `{ receipt: string }`. A RefusedByTransport error refuses the post; any other error
 * or a missing receipt leaves it uncertain. Uncertain posts are never sent again here.
 */
export async function flushOutbox(outbox, transport) {
  const results = [];
  for (const { id, post } of outbox.list('pending')) {
    outbox.claim(id);
    try {
      const sent = await transport.send(post);
      results.push(typeof sent?.receipt === 'string' && sent.receipt ? outbox.deliver(id, sent.receipt) : outbox.uncertain(id, 'no-receipt'));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push(e instanceof RefusedByTransport ? outbox.refuse(id, message) : outbox.uncertain(id, message));
    }
  }
  return results;
}
