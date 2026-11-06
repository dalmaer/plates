// One card per phase or PR, and the backlog by goal (plates phase 179). Pure:
// synthetic Acme plates run through the real pipeline (homeSnapshot, roadmapOf,
// backlogFor), and a golden of the cards and goal groups they make.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { homeSnapshot, homeSections, roadmapOf, backlogFor, phaseRoadmap } from '../lib/work-items.mjs';
import { cardsOf, byGoal, byGoalText, GOAL_SHOWN, memberIdentity } from '../lib/web/backlog-grouping.mjs';

const NOW = '2026-11-05T12:00:00Z';
const GOLDEN = new URL('./fixtures/backlog-grouping/golden.json', import.meta.url);
const phase = (id, status, more = {}) => ({ id, file: `${id}-acme.md`, title: `Acme phase ${id}`, status, goal: 'G1', depends: [], since: '2026-10-01', spec: 2, next: 'Build it.', ...more });

/** Two Acme plates with look-alike work: the same phase numbers, the same titles, a walk, a ⚑ step seen twice, a review and a claim. */
function fleet() {
  const anvilsPhases = [phase(84, 'planned', { next: '⚑ Choose the anvil policy.' }), phase(3, 'partial', { owes: 'walk', goal: 'G2' }), phase(8, 'partial'), phase(9, 'planned', { goal: 'G2' }),
    ...Array.from({ length: 9 }, (_, i) => phase(20 + i, 'planned', { goal: 'G3', since: `2026-10-${String(10 + i).padStart(2, '0')}` }))];
  const forgePhases = [phase(84, 'planned', { next: '⚑ Choose the anvil policy.' }), phase(5, 'planned')];
  const goals = [{ id: 'G1', title: 'Dependable anvils' }, { id: 'G2', title: 'Owners walk less' }, { id: 'G3', title: 'Many small phases' }];
  const plate = (id, name, phases, more) => ({ id, name, repo: `acme/${id}`, state: 'complete', revision: 'a'.repeat(40), readAt: NOW, gaps: [], changes: [], roadmap: phaseRoadmap(phases, goals),
    decisions: phases.filter(p => p.next.startsWith('⚑')).map(p => ({ id: `${id}:phase:${p.id}:decision`, projectId: id, kind: 'decision', itemKind: 'step', ref: String(p.id), phase: String(p.id), since: '2026-10-20', title: `phase ${p.id}: ${p.title}`, link: `https://github.com/acme/${id}/blob/main/docs/phases/${p.file}`, sets: [] })),
    walks: [], reviews: [], waiting: [], ...more });
  const anvils = plate('anvils', 'Acme Anvils', anvilsPhases, {
    walks: [{ id: 'anvils:phase:3:walk', projectId: 'anvils', kind: 'walk', itemKind: 'walk', ref: '3', phase: '3', box: 2, since: '2026-10-15', ready: true, title: 'Ring the anvil?', link: 'https://github.com/acme/anvils/blob/main/docs/phases/3-acme.md', details: { ask: 'Ring the anvil?', choices: ['Rings', 'Thuds'], recommend: 'Rings' }, sets: [] }],
    reviews: [{ id: 'anvils:review:7', projectId: 'anvils', kind: 'review', itemKind: 'review', ref: '7', title: 'acme/anvils#7: 1 review comment unanswered', link: 'https://github.com/acme/anvils/pull/7', review: { number: 7, rounds: 1, limit: 3 } }],
    decisions: [...anvilsPhases.filter(p => p.next.startsWith('⚑')).map(p => ({ id: `anvils:phase:${p.id}:decision`, projectId: 'anvils', kind: 'decision', itemKind: 'step', ref: String(p.id), phase: String(p.id), since: '2026-10-20', title: `phase ${p.id}: ${p.title}`, link: `https://github.com/acme/anvils/blob/main/docs/phases/${p.file}`, sets: [] })),
      // A ⚑ step on a claimed phase: Yours, though its phase is in flight.
      { id: 'anvils:phase:8:decision', projectId: 'anvils', kind: 'decision', itemKind: 'step', ref: '8', phase: '8', since: '2026-10-22', title: 'phase 8: approve the Acme lane', link: 'https://github.com/acme/anvils/blob/main/docs/phases/8-acme.md', sets: [] }] });
  const forge = plate('forge', 'Acme Forge', forgePhases);
  // Loose ends (another checkout of acme/anvils, and of acme/forge) see the same ⚑ steps: the same plate + phase, another source link.
  const sections = homeSections({ local: { items: [
    { kind: 'phase', waits: 'owner', title: 'acme/anvils: phase 84: Acme phase 84', plate: 'anvils', ref: 'a1b2c3', id: 'a1b2c3', phase: 84, link: 'https://github.com/acme/anvils/issues/84' },
    { kind: 'phase', waits: 'owner', title: 'acme/forge: phase 84: Acme phase 84', plate: 'forge', ref: 'd4e5f6', id: 'd4e5f6', phase: 84, link: 'https://github.com/acme/forge/issues/84' },
    { kind: 'repo', waits: 'owner', title: 'acme/stray: not a plate', plate: 'anvils', ref: 'stray', id: 'stray' }] } });
  const snapshot = homeSnapshot([anvils, forge], { sections, today: '2026-11-05' });
  const claims = { anvils: { state: 'read', claims: [{ phase: 8, branch: 'claims/phase-8', provider: 'claude', machine: 'acme-mac', at: '2026-11-04T00:00:00.000Z' }], prs: [] }, forge: { state: 'none', why: 'no remote' } };
  return backlogFor(snapshot, [anvils, forge].map(p => roadmapOf(p, claims[p.id], { now: NOW })), { now: NOW });
}

test('each item has one home', () => {
  const backlog = fleet(), cards = cardsOf(backlog);
  // Every item key, and every key a phase card nests, is in exactly one card.
  const all = backlog.lanes.flatMap(l => l.items.flatMap(i => [i.key, ...i.children]));
  const homes = new Map();
  for (const c of cards) for (const k of c.keys) homes.set(k, [...(homes.get(k) ?? []), c.key]);
  for (const k of all) assert.equal(homes.get(k)?.length, 1, `${k} has one home: ${homes.get(k)}`);
  assert.equal(new Set(cards.map(c => c.key)).size, cards.length, 'one card per key');
  const by = Object.fromEntries(cards.map(c => [c.key, c]));
  // The phase owing a walk: one card, the walk nested, its box kept.
  assert.deepEqual(by['anvils:phase:3'].members.map(m => [m.kinds, m.box]), [[['walk'], 2]]);
  // A ⚑ step on a claimed phase joins the phase's card, and the card is Yours: the owner's turn shows first.
  assert.deepEqual([by['anvils:phase:8'].lead.lane, by['anvils:phase:8'].lane, by['anvils:phase:8'].members.map(m => m.kinds)], ['in-flight', 'yours', [['step']]]);
  // A review is a PR's card.
  assert.equal(by['anvils:pr:7'].kind, 'pr');
  // An item naming no phase is its own card.
  assert.equal(by['anvils:repo:stray'].members.length, 0);
  // Cards in the backlog's priority: Yours first.
  assert.deepEqual([...new Set(cards.map(c => c.lane))], ['yours', 'agent-ready'], 'the claimed phase with a step waiting on you is Yours');
  // By goal: a header per goal in each plate's order, then its cards with no goal; counts per lane; collapsed after seven.
  const { groups, notRead } = byGoal(backlog);
  assert.deepEqual(groups.map(g => [g.key, g.cards.length, g.more]), [['anvils:goal:G1', 2, 0], ['anvils:goal:G2', 2, 0], ['anvils:goal:G3', 9, 2], ['anvils:goal:none', 2, 0], ['forge:goal:G1', 2, 0]]);
  assert.equal(groups[2].shown.length, GOAL_SHOWN);
  assert.deepEqual(groups[0].counts, { yours: 2, 'in-flight': 0, 'agent-ready': 0, waiting: 0, done: 0 });
  assert.deepEqual(notRead, []);
  // The golden: the cards and groups these plates make, so a change to the rules shows in review.
  const shape = { cards: cards.map(c => ({ key: c.key, lane: c.lane, goal: c.goal, lead: c.lead.key, sources: c.sources, members: c.members.map(m => ({ identity: m.identity, keys: m.keys, sources: m.sources })) })),
    groups: groups.map(g => ({ key: g.key, title: g.title, counts: g.counts, shown: g.shown, more: g.more })), text: byGoalText({ ...backlog, generatedAt: NOW }).split('\n') };
  if (process.env.PLATES_WRITE_GROUPING_GOLDEN === '1') writeFileSync(GOLDEN, `${JSON.stringify(shape, null, 1)}\n`);
  assert.deepEqual(shape, JSON.parse(readFileSync(GOLDEN, 'utf8')));
  // Deterministic: the same backlog groups the same way.
  assert.deepEqual(cardsOf(fleet()), cards);
});

test('plates never merge across projects', () => {
  const cards = cardsOf(fleet());
  // Phase 84 in both plates: same number, same title, same ⚑ step text. Two cards, one per plate.
  const p84 = cards.filter(c => c.phase === '84');
  assert.deepEqual(p84.map(c => c.key), ['anvils:phase:84', 'forge:phase:84']);
  for (const c of p84) assert.ok(c.keys.every(k => k.startsWith(`${c.projectId}:`)), `${c.key} holds only its plate's items`);
  // The identity every rule keys on carries the plate.
  assert.notEqual(memberIdentity({ projectId: 'anvils', phase: '84', box: null, key: 'x' }), memberIdentity({ projectId: 'forge', phase: '84', box: null, key: 'x' }));
  for (const c of cards) assert.ok(c.members.every(m => m.identity.startsWith(`${c.projectId}:`)));
});

test('a merged item keeps both sources', () => {
  const by = Object.fromEntries(cardsOf(fleet()).map(c => [c.key, c]));
  // The roadmap's ⚑ step on phase 84 and loose ends' copy of it: one member, both keys, both links.
  const step = by['anvils:phase:84'].members.find(m => m.identity === 'anvils:phase:84:phase');
  assert.deepEqual(step.keys.toSorted(), ['anvils:phase:a1b2c3', 'anvils:step:84']);
  assert.deepEqual(step.sources.toSorted(), ['https://github.com/acme/anvils/blob/main/docs/phases/84-acme.md', 'https://github.com/acme/anvils/issues/84']);
  assert.deepEqual(by['anvils:phase:84'].members.length, 1, 'merged, not listed twice');
  // A card led by an item with no phase card of its own keeps what merged into its lead.
  const lone = cardsOf({ plates: [], goals: [], lanes: [{ lane: 'yours', items: [
    { key: 'anvils:step:99', projectId: 'anvils', kind: 'step', phase: '99', box: null, source: { url: 'https://github.com/acme/anvils/a' }, nested: [] },
    { key: 'anvils:phase:ffff', projectId: 'anvils', kind: 'phase-loose', phase: '99', box: null, source: { url: 'https://github.com/acme/anvils/b' }, nested: [] }] }] });
  assert.deepEqual([lone.length, lone[0].lead.key, lone[0].members.length, lone[0].sources], [1, 'anvils:step:99', 0, ['https://github.com/acme/anvils/a', 'https://github.com/acme/anvils/b']]);
});
