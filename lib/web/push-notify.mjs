// What reaches the owner's phone: one notification per waiting item, with a
// deep link to it and fixed text that carries nothing private.
import { hash, WebError } from './common.mjs';
import { describeRoute } from './navigation-routes.mjs';
import { sendPush, vapidKeys } from './push.mjs';

const slug = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value);
// Fixed words per kind. No title, project name, path, question or reason
// from the event ever enters the notification.
const TEXT = {
  check: { title: 'Plates: a decision to check', body: 'A decision is due for a check.' },
  walk: { title: 'Plates: a walk is ready', body: 'A guided walk is ready for you.' },
  door: { title: 'Plates: approval needed', body: 'A step that cannot be undone waits for your approval. Open it to review; nothing runs from this notification.' },
  night: { title: 'Plates: the night went red', body: 'Last night needs a look.' },
};

// The item's stable identity, by kind. Returns null for events that do not
// wait on the owner (a broken record, an unready walk, a two-way door, a green night).
function identify(event) {
  if (!event || typeof event !== 'object' || !Object.hasOwn(TEXT, event.kind)) return null;
  if (event.waits !== undefined && event.waits !== 'owner') return null;
  const explicit = typeof event.id === 'string' && event.id.length > 0 && event.id.length <= 1024 ? event.id : null;
  if (event.kind === 'check') {
    const ref = explicit ?? (typeof event.ref === 'string' && event.ref ? event.ref : null);
    // A re-dated check is a new check; the same check on the same date is not.
    return ref && `${ref}@${date(event.checkBy) ? event.checkBy : ''}`;
  }
  if (event.kind === 'walk') return event.ready === false ? null : explicit ?? (slug(event.walkId) && slug(event.project) ? `${event.project}/${event.walkId}` : null);
  if (event.kind === 'door') return event.door !== 'irreversible' ? null : explicit ?? (hex(event.operationId) ? event.operationId : null);
  if (event.kind === 'night') return event.state !== 'red' ? null : explicit ?? (date(event.date) ? `${slug(event.project) ? event.project : ''}/${event.date}` : null);
  return null;
}

// A link straight to the item, always one of the workspace's own routes.
function deepLink(event) {
  const project = slug(event.project) ? event.project : null, home = project ? `/projects/${project}` : '/';
  const candidates = [typeof event.url === 'string' ? event.url : null];
  if (event.kind === 'walk' && project && slug(event.walkId)) candidates.push(`${home}/walks/${event.walkId}`);
  if (event.kind === 'door' && project && hex(event.operationId)) candidates.push(`${home}/operations/${event.operationId}`);
  if (event.kind === 'night') candidates.push(project ? `${home}/activity?routine=night` : '/activity?routine=night');
  candidates.push(home);
  return candidates.find(path => path && describeRoute(path)) ?? '/';
}

/**
 * Pure: waiting-on-owner events to notifications. Duplicate items in one batch
 * collapse to one. key is the ledger identity; tag is the stable item id the
 * browser uses to replace rather than stack a notification for the same item.
 */
export function notificationsFor(events) {
  const seen = new Set(), out = [];
  for (const event of Array.isArray(events) ? events : []) {
    const id = identify(event);
    if (!id) continue;
    const key = hash(JSON.stringify(['push-item-v1', event.kind, id]));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, kind: event.kind, title: TEXT[event.kind].title, body: TEXT[event.kind].body, url: deepLink(event), tag: `plates-${key.slice(0, 32)}` });
  }
  return out;
}

/**
 * Pure: the waiting-on-owner events in one freshly read Home project (the
 * model lib/web/projects.mjs returns). The workspace learns two of the four
 * kinds here: a walk the board marks ready and a night whose latest record has
 * a failed item. Decision checks (phase 150) are collected only by the local
 * board, and irreversible-door approvals (phase 145) have no hosted queue, so
 * neither has a server-side point to raise them from. Titles enter only the
 * item identity, which the notifier hashes; they never reach the payload.
 */
export function waitingEvents(project) {
  if (!project || typeof project !== 'object' || !slug(project.id)) return [];
  const events = [];
  for (const walk of Array.isArray(project.walks) ? project.walks : []) {
    if (walk?.ready !== true || typeof walk.id !== 'string' || walk.projectId !== project.id) continue;
    // A different walk in the same phase is a new item; the same walk at a new revision is not.
    events.push({ waits: 'owner', kind: 'walk', project: project.id, id: `${walk.id}\n${typeof walk.title === 'string' ? walk.title : ''}`, ready: true });
  }
  const night = project.daily;
  if (night?.state === 'read' && date(night.date) && Number.isSafeInteger(night.counts?.failed) && night.counts.failed > 0) {
    events.push({ waits: 'owner', kind: 'night', state: 'red', project: project.id, date: night.date, url: `/projects/${project.id}/daily?date=${night.date}` });
  }
  return events;
}

/**
 * Claims each item in the ledger before sending (at most once, even when a
 * send fails), then sends to every device the owner subscribed. Dead
 * subscriptions (404/410) are removed. fetcher is injected: tests use a fake
 * push service and nothing here reaches the network on its own.
 */
export function createPushNotifier(config, { store, fetcher, now = Date.now }) {
  const keys = vapidKeys(config.encryptionKey);
  return {
    async notify(userId, events) {
      const result = { sent: [], skipped: [], failed: [] };
      for (const notification of notificationsFor(events)) {
        let claimed;
        try { claimed = await store.claim(userId, notification.key); }
        catch (error) { if (!(error instanceof WebError)) throw error; result.failed.push({ tag: notification.tag, reason: error.code }); continue; }
        if (!claimed) { result.skipped.push(notification.tag); continue; }
        const devices = await store.list(userId);
        if (!devices.length) { result.failed.push({ tag: notification.tag, reason: 'no_subscription' }); continue; }
        const payload = { title: notification.title, body: notification.body, url: notification.url, tag: notification.tag };
        let delivered = 0;
        for (const subscription of devices) {
          const outcome = await sendPush({ subscription, payload, keys, subject: config.origin, fetcher, now: now(), topic: notification.key.slice(0, 32) });
          if (outcome.ok) delivered++;
          else if (outcome.gone) await store.unsubscribe(userId, subscription.endpoint);
        }
        if (delivered) result.sent.push(notification.tag); else result.failed.push({ tag: notification.tag, reason: 'push_unavailable' });
      }
      return result;
    },
  };
}

// ---- "N new for you" (plates phase 175) -----------------------------------------
//
// When the count of items in "Needs you" rises above what the owner was last
// told of, one notification says how many are new and opens the review session.
// At most one a day (the owner's local day, claimed in phase 152's ledger before
// sending), never in the owner's quiet hours (config.quietHours), and only to
// devices the owner subscribed. Only the count enters the payload.

export const DOCKET_URL = '/review';
const minutesOf = clock => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/** The owner's local date and minute of the day at `at`, in timeZone. */
export function localTime(at, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(at)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) % 24 * 60 + Number(parts.minute) };
}

/** Whether a minute of the day falls in quiet hours { from, to } ('HH:MM'); the window may cross midnight, and `to` is not quiet. */
export function inQuietHours(minutes, { from, to }) {
  const start = minutesOf(from), end = minutesOf(to);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/**
 * Pure: what the docket's count does now. last: { count, date } | null.
 * { action: 'send', n, next } | { action: 'lower', next } (the count fell: the
 * next rise is counted from here) | { action: 'none' | 'today' | 'quiet' }.
 */
export function docketDecision({ count, last, local, quiet }) {
  const base = last?.count ?? 0;
  if (count < base) return { action: 'lower', next: { count, date: last?.date ?? null } };
  if (count === base) return { action: 'none' };
  if (last?.date === local.date) return { action: 'today' };
  if (quiet) return { action: 'quiet' };
  return { action: 'send', n: count - base, next: { count, date: local.date } };
}

/** The notification itself: fixed words and the count, opening the session. */
export const docketNotification = n => ({ title: 'Plates: new for you', body: `${n} new for you`, url: DOCKET_URL, tag: 'plates-docket' });

/**
 * notify(userId, count): count is the items in "Needs you" from a full Home
 * read. store is phase 152's push store (devices, the ledger); state keeps the
 * last count (createDocketState). Returns { state, n? }; it never throws for a
 * push service that refuses.
 */
export function createDocketNotifier(config, { store, state, fetcher, now = Date.now }) {
  const keys = vapidKeys(config.encryptionKey);
  return {
    async notify(userId, count) {
      if (!Number.isSafeInteger(count) || count < 0) throw new WebError('invalid_push_item', 400);
      const quiet = config.quietHours;
      if (!quiet) return { state: 'quiet_hours_unset' };
      const at = now(), local = localTime(at, quiet.timeZone);
      const decision = docketDecision({ count, last: await state.read(userId), local, quiet: inQuietHours(local.minutes, quiet) });
      if (decision.action === 'lower') { await state.write(userId, decision.next, at); return { state: 'lower' }; }
      if (decision.action !== 'send') return { state: decision.action };
      const devices = await store.list(userId);
      if (!devices.length) return { state: 'no_subscription' };
      // One a day: the owner's local day is claimed before anything is sent, so two reads never both send.
      if (!await store.claim(userId, hash(JSON.stringify(['push-docket-day-v1', local.date])))) return { state: 'today' };
      await state.write(userId, decision.next, at);
      const payload = docketNotification(decision.n);
      let delivered = 0;
      for (const subscription of devices) {
        const outcome = await sendPush({ subscription, payload, keys, subject: config.origin, fetcher, now: at, topic: 'plates-docket' });
        if (outcome.ok) delivered++;
        else if (outcome.gone) await store.unsubscribe(userId, subscription.endpoint);
      }
      return delivered ? { state: 'sent', n: decision.n } : { state: 'push_unavailable', n: decision.n };
    },
  };
}
