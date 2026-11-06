// One card per phase or PR, and the backlog by goal (plates phase 179;
// docs/specs/web-backlog.md, "Combined cards" and "By goal"; web-ui.md,
// Ranking and deduplication). Pure, deterministic and browser-safe: it reads
// the backlog model (lib/work-items.mjs backlogFor) and nothing else, and no
// rule here is learned. Both renderers (plates home --backlog --by-goal and
// /backlog/goals) arrange the same cards.
//
// The rules, in order:
// 1. A card is a phase (plate + phase), a pull request (plate + PR number),
//    or, for an item that names neither, the item itself.
// 2. Every item joins exactly one card: its phase's or its PR's when it names
//    one, else its own. A phase card's nested walk or step joins it too.
// 3. Within a card, members are deduplicated by plate + phase + acceptance
//    item (the walk's box, or the phase itself); a merged member keeps every
//    source link.
// 4. The plate is part of every key: similar items in two plates never merge.
// 5. A card sits in the first lane of its members, in the backlog's priority:
//    Yours, In flight, Agent-ready, Waiting, Recently done.

/** The lanes a card can sit in, most pressing first. */
export const LANE_PRIORITY = Object.freeze(['yours', 'in-flight', 'agent-ready', 'waiting', 'done']);
/** A goal's header shows this many cards; the rest are behind "more". */
export const GOAL_SHOWN = 7;
const list = v => Array.isArray(v) ? v : [];

/** The card an item joins: its phase's, its PR's, or its own. */
export function cardKeyOf(item) {
  if (item.phase !== null && item.phase !== undefined && item.phase !== '') return `${item.projectId}:phase:${item.phase}`;
  if (item.kind === 'review' && /^\d+$/.test(item.ref ?? '')) return `${item.projectId}:pr:${item.ref}`;
  return item.key;
}
/** A member's identity for deduplication: plate + phase + acceptance item; an item naming no phase is only ever itself. */
export function memberIdentity(item) {
  if (item.phase === null || item.phase === undefined || item.phase === '') return `${item.projectId}:item:${item.key}`;
  return `${item.projectId}:phase:${item.phase}:${Number.isSafeInteger(item.box) ? `box ${item.box}` : 'phase'}`;
}
const sourceOf = item => item.url ?? item.source?.url ?? item.source?.file ?? null;

/**
 * The backlog's cards: [{ key, projectId, projectName, kind: 'phase' | 'pr' |
 * <the item's kind>, phase, lane, goal, lead, members, keys }], in display
 * order. `lead` is the phase's own item when the backlog lists it, else the
 * card's first item, with `sources` every link it was seen at; `members` are
 * the rest, deduplicated, each { identity, keys, kinds, box, lane, sources,
 * title }; `keys` is every item key the card holds.
 */
export function cardsOf(backlog) {
  const flat = [];
  list(backlog?.lanes).forEach(l => list(l.items).forEach(item => flat.push({ item: { ...item, lane: item.lane ?? l.lane }, order: flat.length })));
  const cards = new Map();
  const cardFor = item => {
    const key = cardKeyOf(item);
    if (!cards.has(key)) cards.set(key, { key, projectId: item.projectId, projectName: item.projectName ?? item.projectId, kind: key.includes(':phase:') && key === `${item.projectId}:phase:${item.phase}` ? 'phase' : key.includes(':pr:') ? 'pr' : item.kind,
      phase: item.phase ?? null, lead: null, members: new Map(), keys: [], first: Infinity });
    // (A phase item leads its card; otherwise the card's first item does.)
    return cards.get(key);
  };
  const join = (card, member) => {
    const id = memberIdentity(member), had = card.members.get(id);
    const src = sourceOf(member);
    if (had) {
      had.keys.push(member.key); if (!had.kinds.includes(member.kind)) had.kinds.push(member.kind);
      if (src && !had.sources.includes(src)) had.sources.push(src);
      if (LANE_PRIORITY.indexOf(member.lane) < LANE_PRIORITY.indexOf(had.lane)) had.lane = member.lane;
    } else card.members.set(id, { identity: id, keys: [member.key], kinds: [member.kind], box: Number.isSafeInteger(member.box) ? member.box : null, lane: member.lane, sources: src ? [src] : [], title: member.title ?? null });
    card.keys.push(member.key);
  };
  for (const { item, order } of flat) {
    const card = cardFor(item);
    card.first = Math.min(card.first, order);
    if (item.kind === 'phase' && !card.lead) { card.lead = item; card.keys.push(item.key); }
    else join(card, item);
    // What a phase card already holds (the walk or step backlogOf nested in it) joins the same card, never a second one.
    for (const n of list(item.nested)) join(card, { key: n.key, kind: n.kind, projectId: item.projectId, phase: item.phase, box: n.box, lane: item.lane, url: n.url, title: null });
  }
  const out = [];
  for (const card of cards.values()) {
    const members = [...card.members.values()];
    // A card with no phase item of its own is led by its first member's item.
    const lead = card.lead ?? flat.find(f => f.item.key === members[0].keys[0]).item;
    // The lead's own identity is not repeated among its members; what was merged into it keeps its sources on the card.
    const leadId = card.lead ? null : memberIdentity(lead), merged = members.find(m => m.identity === leadId);
    const rest = members.filter(m => m.identity !== leadId);
    const sources = merged ? merged.sources : [sourceOf(lead)].filter(Boolean);
    const lanes = [lead.lane, ...rest.map(m => m.lane)].filter(Boolean);
    const lane = LANE_PRIORITY.find(l => lanes.includes(l)) ?? lead.lane;
    out.push({ key: card.key, projectId: card.projectId, projectName: card.projectName, kind: card.kind, phase: card.phase, lane, goal: lead.goal ?? null,
      lead, sources, members: rest, keys: card.keys, first: card.first });
  }
  return out.sort((a, b) => LANE_PRIORITY.indexOf(a.lane) - LANE_PRIORITY.indexOf(b.lane) || a.first - b.first).map(({ first, ...c }) => c);
}

/**
 * By goal: a header per goal of each read plate, in its docs/goals.json order,
 * then the plate's cards with no goal; each header with its lane counts and
 * its cards, the first GOAL_SHOWN shown and the rest counted. A goal with no
 * card has no header. { groups: [{ key, projectId, projectName, goal, title,
 * counts, cards, shown, more }], notRead }.
 */
export function byGoal(backlog) {
  const cards = cardsOf(backlog), groups = [];
  const plates = list(backlog?.plates), goals = list(backlog?.goals);
  for (const plate of plates) {
    const mine = cards.filter(c => c.projectId === plate.projectId);
    if (!mine.length) continue;
    const ids = goals.filter(g => g.projectId === plate.projectId).sort((a, b) => a.rank - b.rank);
    const known = new Set(ids.map(g => g.id));
    for (const g of [...ids, { id: null, title: null }]) {
      const inGoal = mine.filter(c => g.id === null ? !known.has(c.goal) : c.goal === g.id);
      if (!inGoal.length) continue;
      groups.push({ key: `${plate.projectId}:goal:${g.id ?? 'none'}`, projectId: plate.projectId, projectName: plate.projectName ?? plate.projectId, goal: g.id, title: g.title,
        counts: Object.fromEntries(LANE_PRIORITY.map(l => [l, inGoal.filter(c => c.lane === l).length])), cards: inGoal, shown: inGoal.slice(0, GOAL_SHOWN).map(c => c.key), more: Math.max(0, inGoal.length - GOAL_SHOWN) });
    }
  }
  return { groups, notRead: plates.filter(p => !['read', 'stale'].includes(p.state)).map(p => ({ projectId: p.projectId, projectName: p.projectName ?? p.projectId, state: p.state, reason: p.reason ?? null })) };
}

const LANE_WORDS = Object.freeze({ yours: 'yours', 'in-flight': 'in flight', 'agent-ready': 'agent-ready', waiting: 'waiting', done: 'done' });
/** A goal header's lane counts in words: "2 yours · 1 in flight". */
export const countsText = counts => LANE_PRIORITY.filter(l => counts[l]).map(l => `${counts[l]} ${LANE_WORDS[l]}`).join(' · ');
/** A member in words: its kinds (a nested 'phase' item is loose ends' copy) and acceptance box, and how many sources it was seen in. */
export const memberText = m => `${m.kinds.map(k => k === 'phase' ? 'loose end' : k).join(' + ')}${m.box !== null ? ` (box ${m.box})` : ''}${m.sources.length > 1 ? ` · ${m.sources.length} sources` : ''}`;

/** By goal in a terminal (plates home --backlog --by-goal): each goal's header and counts, then its cards, the first GOAL_SHOWN of each. */
export function byGoalText(data) {
  const { groups, notRead } = byGoal(data), out = [`plates home --backlog --by-goal — all plates (${String(data.generatedAt).slice(0, 10)})`, ''];
  if (!groups.length) out.push('  none');
  for (const g of groups) {
    out.push(`${g.projectName} · ${g.goal ?? 'No goal'}${g.title ? ` — ${g.title}` : ''}  (${countsText(g.counts)})`);
    for (const card of g.cards.slice(0, GOAL_SHOWN)) {
      const lead = card.lead, head = lead.question?.ask ?? lead.title ?? '';
      const ref = lead.kind === 'phase' ? `#${lead.ref}` : card.kind === 'pr' ? `PR #${lead.ref}` : lead.kind;
      out.push(`  ${LANE_WORDS[card.lane]} · ${lead.projectName ?? lead.projectId} ${ref}  ${head}`);
      for (const m of card.members) out.push(`      + ${memberText(m)}${m.title && m.title !== head ? `: ${m.title}` : ''}`);
    }
    if (g.more) out.push(`  … and ${g.more} more in this goal (plates home --backlog --by-goal --json lists them all)`);
    out.push('');
  }
  for (const p of notRead) out.push(`${p.projectName}: ${p.state}${p.reason ? ` — ${p.reason}` : ''}`);
  return out.join('\n').replace(/\n+$/, '');
}
