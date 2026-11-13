// What happened to each backlog item, read back (plates phase 184, increment 3):
// one read model, two renderers. Pure and browser-safe: plates home --backlog
// --since and the web's /backlog/history compute the readout and each card's
// history here, over the same event records (lib/backlog-events.mjs writes
// them locally, lib/web/backlog-events-store.mjs on the hosted store), and
// say each line with readoutLines and historyText.

export const BACKLOG_ACTIONS = Object.freeze(['view', 'attach', 'assist', 'dispatch', 'release', 'answer', 'not-now']);
/** The web's window when its path names no date: the last 28 days. */
export const HISTORY_DAYS = 28;

/** Each card with the events on its key, as `history: { count, last: { action, at }, text }`; the lanes and their order exactly as given. */
export function withEvents(backlog, events) {
  const byKey = new Map();
  for (const e of events ?? []) { const all = byKey.get(e.key) ?? []; all.push(e); byKey.set(e.key, all); }
  return { ...backlog, lanes: (backlog?.lanes ?? []).map(lane => ({ ...lane, items: lane.items.map(item => {
    const mine = byKey.get(item.key);
    if (!mine?.length) return item;
    const last = mine.reduce((a, b) => (b.at > a.at || (b.at === a.at && b.id > a.id) ? b : a));
    const history = { count: mine.length, last: { action: last.action, at: last.at } };
    return { ...item, history: { ...history, text: historyText(history) } };
  }) })) };
}

/** A card's history in words, the same on both: "2 events · last attach 2026-11-06". */
export const historyText = h => `${h.count} event${h.count === 1 ? '' : 's'} · last ${h.last.action} ${String(h.last.at).slice(0, 10)}`;

const isoWeek = at => {
  const d = new Date(`${at.slice(0, 10)}T00:00:00Z`), day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const year = d.getUTCFullYear(), first = new Date(Date.UTC(year, 0, 4));
  return `${year}-W${String(1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
};

/**
 * The owner's readout: what happened since a date. events: the store's
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

/**
 * The History model, the same for both forms: the backlog with each card's
 * history, `since`, `events` (the readout) and `eventsNote`. events null: the
 * store could not be read at all, so there is no readout, only the note.
 * whole: the backlog before a --lane kept one lane, so Recently done still says what landed.
 */
export function historyOf(backlog, events, { since, note = null, whole = backlog }) {
  return { ...(events ? withEvents(backlog, events) : backlog), since, events: events ? eventsReadout(events, { since, backlog: whole }) : null, eventsNote: note };
}

/**
 * The readout's lines, said once for both forms: { title, note, summary,
 * routes, weeks, events } of plain strings. readout null: the events could not
 * be read at all, so only the note is said, never a zero.
 */
export function readoutLines(readout, { since = null, note = null } = {}) {
  const from = (readout?.since ?? since ?? '').slice(0, 10) || 'the start';
  if (!readout) return { title: `What happened since ${from}`, note: note ?? 'Events are not stored yet, so what happened is not shown.', summary: null, routes: [], weeks: [], events: [] };
  return { title: `What happened since ${from} (${readout.count} event${readout.count === 1 ? '' : 's'})`, note,
    summary: BACKLOG_ACTIONS.filter(a => readout.actions[a]).map(a => `${a} ${readout.actions[a]}`).join(' · ') || 'nothing recorded',
    routes: readout.routes.map(r => `route ${r.route}: ${r.attached} attached, ${r.landed} landed`),
    weeks: readout.weeks.map(w => `${w.week}: ${w.answers} answered, ${w.unknown ? 'at least ' : ''}${w.minutes} min`),
    events: readout.events.map(e => `${e.at.slice(0, 16).replace('T', ' ')}  ${e.action}${e.reason ? `(${e.reason})` : ''}  ${e.key}  ${e.actor}${e.route ? `  route ${e.route}` : ''}${e.outcome ? `  ${e.outcome}` : ''}`) };
}

/** The readout in a terminal. */
export function eventsText(readout, { note = null, since = null } = {}) {
  const l = readoutLines(readout, { note, since });
  return [l.title, ...(l.note ? [`  ${l.note}`] : []), ...(l.summary ? [`  ${l.summary}`] : []), ...l.routes.map(x => `  ${x}`), ...l.weeks.map(x => `  ${x}`), ...l.events.map(x => `    ${x}`)].join('\n');
}
