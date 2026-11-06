// Agents and Pending review (plates phase 186): who may work, what each holds,
// and the fleet's open PRs not set to auto-merge. Pure: synthetic Acme inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentsOf, pendingOf, presenceOf, prOf, agentsFor, agentCounts, agentsText, agentsInputOf, ROUTES, PRESENCE_STALE_DAYS, WORKER_OFF } from '../lib/web/agents-model.mjs';

const NOW = '2026-11-05T12:00:00Z';
const claim = (phase, provider, at = '2026-11-04T12:00:00.000Z') => ({ phase, branch: `claims/phase-${phase}`, provider, machine: 'acme-mac', at });
const plates = () => [
  { projectId: 'anvils', projectName: 'Acme Anvils', config: { agents: { claude: {}, codex: {} }, robot: { on: true } }, claims: [claim(178, 'claude'), claim(12, 'claude', '2026-10-20T00:00:00.000Z')], titles: { 178: 'The backlog in lanes', 12: 'Old work' } },
  { projectId: 'forge', projectName: 'Acme Forge', config: { agents: { claude: {} }, backlog: { routes: ['session', 'tonight'] } }, claims: [claim(4, 'gemini')], titles: {} },
  { projectId: 'sprockets', projectName: 'Acme Sprockets', na: 'The App cannot read acme/sprockets.' },
];

test('an agent shows what it holds', () => {
  const { providers, routes, plates: read } = agentsOf(plates(), { now: NOW });
  const by = Object.fromEntries(providers.map(p => [p.id, p]));
  // Each provider in any plate's agents map, then one a claim names that is not listed there.
  assert.deepEqual(providers.map(p => [p.id, p.listed, p.state]), [['claude', true, 'working'], ['codex', true, 'idle'], ['gemini', false, 'working']]);
  // Claude holds two items, oldest first, each with its presence word: a claim older than STALE_DAYS is stale.
  assert.deepEqual(by.claude.holds.map(h => [h.projectId, h.phase, h.title, h.presence]), [['anvils', 12, 'Old work', 'stale'], ['anvils', 178, 'The backlog in lanes', 'claimed']]);
  assert.deepEqual(by.codex.holds, [], 'idle: it holds nothing');
  assert.deepEqual(by.claude.plates, ['anvils', 'forge']);
  // Routes: with no backlog policy, session only; tonight on where the policy lists it; the robot off by robot.on; the worker off until activated.
  const r = Object.fromEntries(routes.map(x => [x.id, x]));
  assert.deepEqual(routes.map(x => x.id), ROUTES.map(x => x.id));
  assert.deepEqual([r.session.state, r.session.plates], ['on', ['anvils', 'forge']]);
  assert.deepEqual([r.tonight.state, r.tonight.plates], ['on', ['forge']]);
  assert.equal(r.robot.state, 'off');
  assert.deepEqual(r.robot.off, [{ key: 'backlog.routes', why: 'not in policy (no "backlog" key: session only)', plates: ['anvils'] }, { key: 'robot.on', why: 'robot.on is not true', plates: ['forge'] }]);
  assert.deepEqual(r.worker.off, [{ key: 'worker', why: WORKER_OFF, plates: ['anvils', 'forge'] }]);
  assert.deepEqual(r['local-host'].off.map(o => o.key), ['backlog.routes', 'backlog.routes']);
  // A plate not read says so; it adds no agent and no route.
  assert.deepEqual(read.find(p => p.projectId === 'sprockets'), { projectId: 'sprockets', projectName: 'Acme Sprockets', state: 'not read', reason: 'The App cannot read acme/sprockets.' });
  // Presence: claimed, or stale after STALE_DAYS, with its source and time.
  assert.deepEqual(presenceOf(claim(1, 'claude', '2026-11-05T00:00:00Z'), NOW), { word: 'claimed', source: 'claim branch', since: '2026-11-05T00:00:00.000Z' });
  assert.equal(presenceOf(claim(1, 'claude', '2026-10-29T12:00:00Z'), NOW).word, 'stale');
  assert.equal(PRESENCE_STALE_DAYS, 7);
  // In words, as the terminal says it.
  const text = agentsText(agentsFor(plates(), { now: NOW }));
  assert.match(text, /^ {2}claude: working on Acme Anvils #178 The backlog in lanes · claimed on acme-mac$/m);
  assert.match(text, /^ {2}codex: idle$/m);
  assert.match(text, /^ {2}gemini \(not in agents\): working on Acme Forge #4 · claimed on acme-mac$/m);
  assert.match(text, /^ {2}Worker: off — durable workers are disabled/m);
  assert.match(text, /^Acme Sprockets: not read — The App cannot read acme\/sprockets\.$/m);
});

test('auto-merge is not waiting on you', async () => {
  const pr = (number, createdAt, more = {}) => ({ number, title: `Acme PR ${number}`, url: `https://github.com/acme/anvils/pull/${number}`, createdAt, isDraft: false, reviewDecision: null, autoMergeRequest: null, author: { login: 'acme' }, ...more });
  const input = [
    { projectId: 'anvils', projectName: 'Acme Anvils', prs: { state: 'read', items: [pr(9, '2026-11-04T00:00:00Z'), pr(7, '2026-11-01T00:00:00Z', { reviewDecision: 'CHANGES_REQUESTED' }), pr(8, '2026-10-30T00:00:00Z', { autoMergeRequest: { enabledAt: '2026-10-30T01:00:00Z' } })].map(prOf) } },
    { projectId: 'forge', projectName: 'Acme Forge', prs: { state: 'read', items: [pr(3, '2026-11-02T00:00:00Z', { isDraft: true })].map(prOf) } },
    { projectId: 'sprockets', projectName: 'Acme Sprockets', prs: { state: 'unavailable', why: 'the Plates GitHub App has no Pull requests read on this plate' } },
  ];
  const { items, plates: read } = pendingOf(input, { now: NOW });
  // The auto-merge PR is gone; the rest, oldest first, across the fleet.
  assert.deepEqual(items.map(i => i.key), ['anvils:review:7', 'forge:review:3', 'anvils:review:9']);
  assert.ok(!items.some(i => i.number === 8), 'set to auto-merge: it merges itself, it does not wait on you');
  assert.deepEqual(items.map(i => [i.ageDays, i.draft, i.review]), [[4, false, 'changes requested'], [3, true, null], [1, false, null]]);
  // A plate whose PRs could not be read is not read, never zero.
  assert.deepEqual(read.find(p => p.projectId === 'sprockets'), { projectId: 'sprockets', projectName: 'Acme Sprockets', state: 'not read', reason: 'the Plates GitHub App has no Pull requests read on this plate' });
  // The sidebar's counts: agents at work, and pending reviews (unknown when no plate's PRs were read).
  assert.deepEqual(agentCounts({ agents: agentsOf(plates(), { now: NOW }), pending: pendingOf(input, { now: NOW }) }), { agents: 2, pending: 3 });
  assert.deepEqual(agentCounts({ agents: { providers: [] }, pending: pendingOf([input[2]], { now: NOW }) }), { agents: 0, pending: null });
  // The same PR from gh pr list --json and from the App's GraphQL reads the same.
  assert.deepEqual(prOf({ number: 8, title: 't', url: 'u', createdAt: 'c', isDraft: false, reviewDecision: 'APPROVED', autoMergeRequest: { enabledAt: 'x' }, author: { login: 'a' } }),
    { number: 8, title: 't', url: 'u', createdAt: 'c', isDraft: false, reviewDecision: 'APPROVED', autoMerge: true, author: 'a' });
  // The presence threshold is lib/claim.mjs's.
  const { STALE_DAYS } = await import('../lib/claim.mjs');
  assert.equal(PRESENCE_STALE_DAYS, STALE_DAYS);
});

test('a plate value becomes the agents input the same way in both forms', () => {
  const project = { id: 'anvils', name: 'Acme Anvils', repo: 'acme/anvils', state: 'complete', gaps: [], roadmap: { phases: [{ id: 178, title: 'Lanes' }] }, recurring: { config: { agents: { claude: {} } } } };
  const claims = { state: 'read', claims: [claim(178, 'claude')], prs: [] }, prs = { state: 'read', items: [] };
  assert.deepEqual(agentsInputOf(project, claims, prs), { projectId: 'anvils', projectName: 'Acme Anvils', repo: 'acme/anvils', config: { agents: { claude: {} } }, claims: claims.claims, titles: { 178: 'Lanes' }, prs });
  assert.match(agentsInputOf(project, { state: 'unavailable', why: 'quota' }, prs).na, /its claims could not be read: quota/);
  assert.equal(agentsInputOf({ ...project, state: 'loading' }, null, null).state, 'loading');
  assert.deepEqual(agentsInputOf(project, { state: 'none', why: 'no remote' }, prs).claims, [], 'nowhere to hold a claim: nothing held');
});
