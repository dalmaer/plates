// What happened to each backlog item (plates phase 184; docs/specs/web-backlog.md,
// "Events"). Append-only and metadata only: **no source text and no owner
// words**. A record is
//
//   { schema, id, at, actor, key, action, reason, route, lane, position, takes, outcome, receipt }
//
//   actor     'owner', or 'agent:<provider>'
//   key       the item's key (lib/work-items.mjs itemKey): plate, kind and its own id
//   action    view | attach | assist | dispatch | release | answer | not-now
//   reason    not-now only: a code (NOT_NOW_REASONS), never the owner's reason
//   route     the route an agent works by (attach, assist), else null
//   lane      the backlog lane the item was in, when known, else null
//   position  its display position in that lane (1-based), when known, else null
//   takes     the item's estimate in minutes, when known, else null
//   outcome   a short code: attached, recovered, taken, drafted, released, or the answer's id
//   receipt   '<store>:<digest>' naming the receipt that holds the rest, else null
//
// Every string field is a short code checked by pattern, so a sentence cannot
// fit in one, and a record with any other field is refused.
//
// Local store: <project>/.plates/backlog-events/, one create-only file per
// event, with feedback-store's private modes: the directory 0700, each file
// 0600 with one link, git-ignored through info/exclude and refused when Git
// tracks it. The hosted store is SQL019 (lib/web/backlog-events-store.mjs).
//
// Writing an event never fails the action it records: recordBacklogEvent
// returns a note instead of throwing. Events never order the backlog either:
// withEvents only annotates cards, in the order it was given.
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath, unlink, link } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';

export const BACKLOG_ACTIONS = Object.freeze(['view', 'attach', 'assist', 'dispatch', 'release', 'answer', 'not-now']);
/** Why an item was put off, as a code. The owner's words stay in the Not now record (sealed, hosted). */
export const NOT_NOW_REASONS = Object.freeze(['none', 'stated']);
export const EVENT_FIELDS = Object.freeze(['schema', 'id', 'at', 'actor', 'key', 'action', 'reason', 'route', 'lane', 'position', 'takes', 'outcome', 'receipt']);
export const EVENTS_DIR = '.plates/backlog-events';
export const EVENT_LIMITS = Object.freeze({ events: 20000, file: 2048 });

export class BacklogEventError extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new BacklogEventError(code); };

const PATTERNS = Object.freeze({
  actor: /^(?:owner|agent:[a-z][a-z0-9-]{0,31})$/,
  key: /^[a-z][a-z0-9-]{0,63}:[a-z][a-z-]{0,31}:[A-Za-z0-9][A-Za-z0-9._/#@+-]{0,199}$/,
  route: /^[a-z][a-z0-9-]{0,31}$/,
  lane: /^[a-z][a-z-]{0,31}$/,
  outcome: /^[a-z][a-z0-9-]{0,63}$/,
  receipt: /^[a-z][a-z-]{0,31}:[a-f0-9]{12,64}$/,
  id: /^(?:[a-f0-9]{24}|h[1-9][0-9]{0,18})$/,
  at: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
});
const INPUT = Object.freeze(EVENT_FIELDS.filter(f => !['schema', 'id', 'at'].includes(f)));

/** The reason code for a Not now, from whether the owner gave one. The words themselves are never passed on. */
export const notNowReason = words => typeof words === 'string' && words.trim() ? 'stated' : 'none';

const code = (field, value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !PATTERNS[field].test(value)) refuse(`invalid_${field}`);
  return value;
};
const count = (field, value, max) => {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < (field === 'position' ? 1 : 0) || value > max) refuse(`invalid_${field}`);
  return value;
};

/**
 * One event, checked: its fields and nothing else. input: { actor, key,
 * action, reason?, route?, lane?, position?, takes?, outcome?, receipt? }.
 * Throws BacklogEventError (invalid_<field>, unknown_field) on anything else.
 */
export function backlogEvent(input, { now = Date.now(), id = randomBytes(12).toString('hex') } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) refuse('invalid_event');
  for (const field of Object.keys(input)) if (!INPUT.includes(field)) refuse('unknown_field');
  if (!BACKLOG_ACTIONS.includes(input.action)) refuse('invalid_action');
  const reason = input.action === 'not-now' ? input.reason ?? 'none' : input.reason ?? null;
  if (input.action === 'not-now' ? !NOT_NOW_REASONS.includes(reason) : reason !== null) refuse('invalid_reason');
  const actor = code('actor', input.actor), key = code('key', input.key);
  if (!actor) refuse('invalid_actor');
  if (!key) refuse('invalid_key');
  const at = new Date(now).toISOString();
  return { schema: 1, id: code('id', id), at, actor, key, action: input.action, reason,
    route: code('route', input.route), lane: code('lane', input.lane), position: count('position', input.position, 10000),
    takes: count('takes', input.takes, 1440), outcome: code('outcome', input.outcome), receipt: code('receipt', input.receipt) };
}

/** A stored record read back: exactly the fields, each as backlogEvent writes it, or null. */
export function storedEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).length !== EVENT_FIELDS.length || EVENT_FIELDS.some(f => !Object.hasOwn(value, f))) return null;
  if (value.schema !== 1 || typeof value.at !== 'string' || !PATTERNS.at.test(value.at)) return null;
  try {
    const { schema, id, at, ...input } = value;
    const again = backlogEvent(input, { now: Date.parse(at), id });
    return EVENT_FIELDS.every(f => again[f] === value[f]) ? again : null;
  } catch { return null; }
}

const missing = e => e?.code === 'ENOENT';
const fileName = event => `${event.at.replace(/[-:.]/g, '')}-${event.id}.json`;
const NAME = /^\d{8}T\d{9}Z-[a-f0-9]{24}\.json$/;

/**
 * The local store, in one project's checkout. Its privacy is checked on every
 * read and write: the checkout's top level is `root`, Git tracks nothing under
 * it, it is ignored, the directory is 0700 and each file 0600 with one link.
 */
export async function createBacklogEventStore({ root, env = process.env }) {
  const { safeDirectory, safeRead } = await import('./feedback-store.mjs');
  root = await safeDirectory(resolve(root));
  const dir = join(root, EVENTS_DIR);
  const git = args => new Promise((done, fail) => execFile('git', ['-C', root, ...args], { env, encoding: 'utf8', timeout: 10000, maxBuffer: 1 << 20 }, (error, stdout) => error ? fail(error) : done(stdout.trim())));
  const ignoredProbe = async () => { try { await git(['check-ignore', '--no-index', '-q', '--', `${EVENTS_DIR}/__privacy_probe__`]); return true; } catch (e) { if (e.code === 1) return false; throw e; } };
  async function privacy(create = false) {
    let top;
    try { top = await git(['rev-parse', '--show-toplevel']); } catch { refuse('git_unavailable'); }
    if (await realpath(top).catch(() => top) !== await realpath(root).catch(() => root)) refuse('project_root_mismatch');
    if (await git(['ls-files', '--', EVENTS_DIR])) refuse('tracked_private_store');
    let ignored = await ignoredProbe();
    if (!ignored && create) {
      const exclude = resolve(root, await git(['rev-parse', '--git-path', 'info/exclude']));
      await safeDirectory(dirname(exclude), { create: true });
      let previous = '';
      try { previous = (await safeRead(exclude, 1 << 20)).toString(); } catch (e) { if (!missing(e)) throw e; }
      const h = await open(exclude, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
      try { const s = await h.stat(); if (!s.isFile() || s.nlink !== 1) refuse('unsafe_exclude'); await h.writeFile(`${previous && !previous.endsWith('\n') ? '\n' : ''}/${EVENTS_DIR}/\n`); await h.sync(); } finally { await h.close(); }
      ignored = await ignoredProbe();
    }
    if (!ignored) { try { await lstat(dir); } catch (e) { if (missing(e)) return false; throw e; } refuse('unprotected_private_store'); }
    if (create) await safeDirectory(dir, { create: true, privateMode: true });
    try { await safeDirectory(dir, { privateMode: true }); return true; } catch (e) { if (missing(e)) return false; throw e; }
  }
  /** Every event at or after `since` (an ISO time or date; all when absent), oldest first. A file that is not an event is refused, never skipped. */
  async function list({ since } = {}) {
    if (!await privacy()) return [];
    const names = (await readdir(dir)).filter(n => n !== '.npmignore');
    if (names.length > EVENT_LIMITS.events) refuse('capacity_exceeded');
    if (names.some(n => !NAME.test(n))) refuse('invalid_store');
    const from = since ? new Date(Date.parse(since)).toISOString().replace(/[-:.]/g, '') : null;
    const out = [];
    for (const name of names.sort()) {
      if (from && name.slice(0, from.length) < from) continue;
      let value;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await safeRead(join(dir, name), EVENT_LIMITS.file, { privateMode: true }))); } catch (e) { if (e?.code && e.code !== 'ERR_ENCODING_INVALID_ENCODED_DATA') throw e; refuse('invalid_store'); }
      const event = storedEvent(value);
      if (!event || fileName(event) !== name) refuse('invalid_store');
      out.push(event);
    }
    return out;
  }
  /** Append one event (backlogEvent's input): a new file, never an overwrite. Returns the record. */
  async function append(input, { now = Date.now() } = {}) {
    const event = backlogEvent(input, { now });
    await privacy(true);
    const npm = join(dir, '.npmignore');
    try { await lstat(npm); } catch (e) { if (!missing(e)) throw e; const h = await open(npm, 'wx', 0o600); try { await h.writeFile('*\n'); await h.sync(); } finally { await h.close(); } }
    const names = await readdir(dir);
    if (names.length > EVENT_LIMITS.events) refuse('capacity_exceeded');
    const file = join(dir, fileName(event)), temp = join(dir, `.tmp-${randomBytes(8).toString('hex')}`);
    const h = await open(temp, 'wx', 0o600);
    try { await h.writeFile(`${JSON.stringify(event)}\n`); await h.sync(); } finally { await h.close(); }
    // link refuses an existing name, so an event is never overwritten.
    try { await link(temp, file); } finally { await unlink(temp).catch(() => {}); }
    return event;
  }
  return { dir, list, append, privacy };
}

/**
 * Record one event, best effort: { event, note }. A failure is a note
 * ("backlog event not recorded: <code>"), never thrown, so the action it
 * records stands. deps: store (tests), env, now.
 */
export async function recordBacklogEvent(root, input, deps = {}) {
  try {
    const store = deps.store ?? await createBacklogEventStore({ root, env: deps.env ?? process.env });
    return { event: await store.append(input, { now: deps.now ?? Date.now() }), note: null };
  } catch (error) {
    return { event: null, note: `backlog event not recorded: ${error?.code ?? error?.message ?? 'unknown'}` };
  }
}

/** Each card with the events on its key, as `history: { count, last: { action, at } }`; the lanes and their order exactly as given. */
export function withEvents(backlog, events) {
  const byKey = new Map();
  for (const e of events ?? []) { const all = byKey.get(e.key) ?? []; all.push(e); byKey.set(e.key, all); }
  return { ...backlog, lanes: (backlog?.lanes ?? []).map(lane => ({ ...lane, items: lane.items.map(item => {
    const mine = byKey.get(item.key);
    if (!mine?.length) return item;
    const last = mine.reduce((a, b) => (b.at > a.at || (b.at === a.at && b.id > a.id) ? b : a));
    return { ...item, history: { count: mine.length, last: { action: last.action, at: last.at } } };
  }) })) };
}

const isoWeek = at => {
  const d = new Date(`${at.slice(0, 10)}T00:00:00Z`), day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const year = d.getUTCFullYear(), first = new Date(Date.UTC(year, 0, 4));
  return `${year}-W${String(1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
};

/**
 * The owner's readout (pure): what happened since a date. events: the store's
 * records; backlog: the backlog read now (its Recently done lane says which
 * attached phases landed). Returns { since, count, actions: { <action>: n },
 * routes: [{ route, attached, landed }], weeks: [{ week, answers, minutes,
 * unknown }], events }. `unknown` counts answers with no estimate: a minute
 * total is "at least", never a guess.
 */
export function eventsReadout(events, { since = null, backlog = null } = {}) {
  const from = since ? new Date(Date.parse(since)).toISOString() : null;
  const kept = (events ?? []).filter(e => !from || e.at >= from).toSorted((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const actions = Object.fromEntries(BACKLOG_ACTIONS.map(a => [a, kept.filter(e => e.action === a).length]));
  const done = new Set((backlog?.lanes ?? []).find(l => l.lane === 'done')?.items.map(i => i.key) ?? []);
  const routes = new Map();
  for (const e of kept.filter(e => e.action === 'attach' && e.route && e.outcome !== 'taken')) {
    const r = routes.get(e.route) ?? { route: e.route, keys: new Set() };
    r.keys.add(e.key); routes.set(e.route, r);
  }
  const weeks = new Map();
  for (const e of kept.filter(e => e.action === 'answer' || e.action === 'not-now')) {
    const w = weeks.get(isoWeek(e.at)) ?? { week: isoWeek(e.at), answers: 0, minutes: 0, unknown: 0 };
    w.answers++; if (Number.isSafeInteger(e.takes)) w.minutes += e.takes; else w.unknown++;
    weeks.set(w.week, w);
  }
  return { since: from, count: kept.length, actions,
    routes: [...routes.values()].sort((a, b) => a.route.localeCompare(b.route)).map(r => ({ route: r.route, attached: r.keys.size, landed: [...r.keys].filter(k => done.has(k)).length })),
    weeks: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)), events: kept };
}

/** The readout in a terminal: the counts, routes that landed phases, owner minutes per week, then each event. */
export function eventsText(readout, { note = null } = {}) {
  const out = [`What happened since ${readout.since ? readout.since.slice(0, 10) : 'the start'} (${readout.count} event${readout.count === 1 ? '' : 's'})`];
  if (note) out.push(`  ${note}`);
  out.push(`  ${BACKLOG_ACTIONS.filter(a => readout.actions[a]).map(a => `${a} ${readout.actions[a]}`).join(' · ') || 'nothing recorded'}`);
  for (const r of readout.routes) out.push(`  route ${r.route}: ${r.attached} attached, ${r.landed} landed`);
  for (const w of readout.weeks) out.push(`  ${w.week}: ${w.answers} answered, ${w.unknown ? 'at least ' : ''}${w.minutes} min`);
  for (const e of readout.events) out.push(`    ${e.at.slice(0, 16).replace('T', ' ')}  ${e.action}${e.reason ? `(${e.reason})` : ''}  ${e.key}  ${e.actor}${e.route ? `  route ${e.route}` : ''}${e.outcome ? `  ${e.outcome}` : ''}`);
  return out.join('\n');
}

/**
 * The events kept in these checkouts (the CLI's read): { events, note }. A
 * checkout whose store cannot be read is a note naming it, never "nothing
 * happened"; a checkout with no store yet has no events.
 */
export async function readBacklogEvents(roots, { since, env = process.env } = {}) {
  const seen = new Set(), events = [], unread = [];
  for (const root of [...new Set(roots.filter(Boolean).map(r => resolve(r)))]) {
    try { for (const e of await (await createBacklogEventStore({ root, env })).list({ since })) if (!seen.has(e.id)) { seen.add(e.id); events.push(e); } }
    catch (error) { unread.push(`${root} (${error?.code ?? error?.message ?? 'unknown'})`); }
  }
  return { events: events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)), note: unread.length ? `events not read in ${unread.join(', ')}, so these are at least what happened` : null };
}
