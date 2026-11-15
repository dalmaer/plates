// Sessions waiting on you: each project's home session ("🏠 [project] …",
// the long-lived desktop session the owner steers from a phone) that ended on a
// question to the owner. One model, two readers: the CLI scans this machine's
// Claude transcripts (scanWaitingSessions); the hosted workspace reads the
// snapshot a device pushed (plates sessions push, lib/web/waiting-store.mjs).
// Both hand a snapshot to waitingRows, and Home's "Sessions waiting on you" row
// is the same in both forms. Only the snapshot's fields leave this machine:
// the session id, its plate, its title, when it began waiting and what it asked.
// This module imports nothing: the hosted workspace loads it; the scan is lib/waiting-scan.mjs.

export const SNAPSHOT_SCHEMA = 1;
/** A question is kept to at most this many characters (lib/looseends.mjs questionOf). */
export const QUESTION_CHARS = 500;
/** At most this many sessions in one snapshot, and transcripts older than this many days are not opened. */
export const SNAPSHOT_SESSIONS = 50;
export const SCAN_DAYS = 14;
/** A snapshot older than this is shown as of when it was sent; older than a day it is dropped. */
export const STALE_MS = 30 * 60_000, EXPIRE_MS = 24 * 3600_000;

const ID = /^[A-Za-z0-9._-]{1,100}$/, PLATE = /^[a-z0-9][a-z0-9._-]{0,63}$/, MACHINE = /^[A-Za-z0-9 ._-]{1,60}$/;
/** The plate a home session's title names ("🏠 [plates] Remote Control" → "plates"), or null. */
export function homePlateOf(title) {
  // The 🏠 and the bracketed plate are the mark ("🏠 [plates] Remote Control", "🏠 [ledger] Home Capture"); the rest is free.
  const m = /^🏠\s*\[([^\]]{1,64})\]/u.exec(String(title ?? '').trim());
  const plate = m?.[1].trim().toLowerCase();
  return plate && PLATE.test(plate) ? plate : null;
}

export const clipText = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** The snapshot, checked field by field (a device's push is untrusted input), or null. */
export function validSnapshot(s) {
  const keys = (o, list) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every(k => list.includes(k));
  if (!keys(s, ['schema', 'machine', 'scannedAt', 'sessions']) || s.schema !== SNAPSHOT_SCHEMA || !MACHINE.test(s.machine ?? '')
    || typeof s.scannedAt !== 'string' || !Number.isFinite(Date.parse(s.scannedAt)) || !Array.isArray(s.sessions) || s.sessions.length > SNAPSHOT_SESSIONS) return null;
  const ok = s.sessions.every(x => keys(x, ['id', 'plate', 'title', 'question', 'since']) && ID.test(x.id ?? '') && PLATE.test(x.plate ?? '')
    && typeof x.title === 'string' && x.title.length <= 120 && homePlateOf(x.title) === x.plate
    && (x.question === null || (typeof x.question === 'string' && x.question.length <= QUESTION_CHARS))
    && (x.since === null || (typeof x.since === 'string' && Number.isFinite(Date.parse(x.since)))));
  return ok ? { schema: s.schema, machine: s.machine, scannedAt: s.scannedAt, sessions: s.sessions.map(x => ({ id: x.id, plate: x.plate, title: x.title, question: x.question, since: x.since })) } : null;
}

/**
 * Home's "Sessions waiting on you" row from snapshots (one per device): { items, why } or { na }.
 * plates: the plate ids this form shows; a session for any other plate is counted in why, never listed.
 * Each item is an owner's item an agent waits on (kind 'session', the docket's unblock group).
 */
export function waitingRows(snapshots, { plates, now = Date.now() } = {}) {
  const fresh = snapshots.filter(Boolean).filter(s => now - Date.parse(s.scannedAt) < EXPIRE_MS);
  if (!fresh.length) return { na: snapshots.length ? 'the last waiting sessions sent are more than a day old; is the Mac awake and plates sessions push running?' : 'no device has sent waiting sessions yet (plates sessions push)' };
  const known = new Set(plates), seen = new Set(), items = [];
  let elsewhere = 0;
  // Freshness is each device's own: a Mac that stopped sending never borrows another's current time.
  const when = snap => new Date(Date.parse(snap.scannedAt)).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const stale = snap => now - Date.parse(snap.scannedAt) >= STALE_MS;
  for (const snap of [...fresh].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))) {
    for (const s of snap.sessions) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      if (!known.has(s.plate)) { elsewhere++; continue; }
      const asked = s.question ?? 'It ended on a question to you.';
      items.push({ kind: 'session', waits: 'owner', title: `${s.title} is waiting on you`, why: stale(snap) ? `${asked} (as of ${when(snap)}, the last ${snap.machine} sent)` : asked,
        read: `claude --resume ${s.id}`, link: null, plate: s.plate, ref: s.id, session: s.id, machine: snap.machine, ...(s.since ? { since: s.since.slice(0, 10) } : {}) });
    }
  }
  items.sort((a, b) => (a.since ?? '').localeCompare(b.since ?? '') || a.ref.localeCompare(b.ref));
  const current = fresh.filter(x => !stale(x)), behind = fresh.filter(stale);
  const why = [current.length ? `from ${current.map(x => x.machine).join(', ')}` : null,
    ...behind.map(x => `${x.machine} last sent ${when(x)}`), elsewhere ? `${elsewhere} for plates not shown here` : null].filter(Boolean).join('; ');
  return { items, why };
}
