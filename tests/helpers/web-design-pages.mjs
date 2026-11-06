// The representative workspace pages, rendered from fixed Acme inputs. The
// markup golden (tests/web-design.test.mjs, phase 167) and the look capture
// (scripts/look.mjs, phase 172) read this one list, so a page type added for
// one is covered by the other.
import { homeView, projectView, signinView } from '../../lib/web/views.mjs';
import { decisionView } from '../../lib/web/decision-views.mjs';
import { changeIndexView } from '../../lib/web/change-views.mjs';
import { reviewView } from '../../lib/web/review-views.mjs';
import { backlogView, recurringView, agentsView } from '../../lib/web/backlog-views.mjs';
import { agentsFor, agentCounts } from '../../lib/web/agents-model.mjs';
import { recurringOf } from '../../lib/web/recurring-model.mjs';
import { changesHarness, token } from './web-changes.mjs';
import { reviewSnapshot } from './review-fixture.mjs';
import { itemKey, docketOf, homeSnapshot, backlogFor, roadmapOf, phaseRoadmap } from '../../lib/work-items.mjs';

export const access = { workspace: { id: 'acme', name: 'Acme workspace' }, userId: 1, projects: [{ id: 'studio', repo: 'acme/studio', name: 'Acme Studio' }], sourceRevision: 'a'.repeat(40), csrf: 'fake-csrf-acme' };
export const project = { id: 'studio', repo: 'acme/studio', name: 'Acme Studio' };
const action = (id, kind) => ({ id, projectId: 'studio', projectName: 'Acme Studio', kind, title: `Acme ${kind} ${id}`, why: 'Source asks for an owner observation.', next: 'Read the current source.', link: 'https://github.com/acme/studio/blob/main/docs/phases/1.md', phase: '1', ready: true, details: { ask: 'Does publishing work?', why: 'A human uses the real surface.', look: 'Open the preview.', then: 'Record what happened.', takes: 'About five minutes', choices: ['Verified', 'Needs changes', 'Cannot check yet'] } });
export function snapshot() {
  const decision = action('decision-one', 'decision'), walk = action('walk-one', 'walk'), waiting = action('wait-one', 'waiting');
  // Phase 174: Needs you carries its keys and the docket, so Home's Start panel counts them.
  for (const item of [decision, walk]) item.key = itemKey(item);
  const change = { id: 'change-one', projectId: 'studio', projectName: 'Acme Studio', title: 'Publish from a phone', date: '2026-10-21', revision: 'b'.repeat(40), link: 'https://github.com/acme/studio/commit/abc', kind: 'commit', media: null, previewUrl: null, acceptance: 'not established' };
  const value = { schema: 1, cursor: 'a'.repeat(64), cursorState: 'initial', generatedAt: '2026-10-21T16:00:00.000Z', coverage: { state: 'complete', gaps: [] },
    projects: [{ id: 'studio', repoId: 100, repo: 'acme/studio', name: 'Acme Studio', tagline: 'Publishing, made reliable.', stack: ['node', 'web'], version: '0.8.32', revision: 'b'.repeat(40), readAt: '2026-10-21T15:59:00.000Z', state: 'complete', gaps: [], planning: { source: 'files', built: 8, total: 12, livedIn: 3, headline: 'Make publishing reliable on every screen', goals: [], next: 'Review publishing on a phone' }, decisions: [decision], walks: [walk], waiting: [waiting], changes: [change] }],
    decisions: [decision], walks: [walk], waiting: [waiting], changes: [change], docket: docketOf({ decisions: [decision], walks: [walk] }), quota: { remaining: 150, resetAt: '2026-10-21T17:00:00.000Z', state: 'known' } };
  // Phase 166: home's four sections, as the server's model builds them from this plate.
  value.home = homeSnapshot([{ ...value.projects[0], decisions: [decision], walks: [walk], waiting: [waiting], changes: [change], reviews: [] }], { can: { form: 'web' }, today: '2026-10-21' }).home;
  return value;
}
/** The backlog's model from Acme phases: one claimed, one owing a walk, two free (one not yet spec: 2), one waiting, one built this week; and a plate not read. */
export function backlog() {
  const now = '2026-10-21T16:00:00.000Z', phase = (id, status, more = {}) => ({ id, file: `${id}-acme.md`, title: `Acme phase ${id}: publish from every screen`, status, goal: 'G1', depends: [], since: '2026-10-01', spec: 2, next: 'Build it.', ...more });
  const phases = [phase(1, 'partial'), phase(2, 'partial', { owes: 'walk' }), phase(3, 'planned', { depends: [2] }), phase(4, 'planned', { spec: 1 }), phase(5, 'planned', { depends: [9] }), phase(9, 'planned', { goal: 'G2' }), phase(8, 'built', { since: '2026-10-20' })];
  const walk = { id: 'studio:phase:2:walk', projectId: 'studio', projectName: 'Acme Studio', kind: 'walk', itemKind: 'walk', ref: '2', phase: '2', since: '2026-10-11', ready: true, title: 'Publish from a phone', details: { ask: 'Does publishing from your phone work end to end?', takes: 'About five minutes', choices: ['Works', 'Needs changes'], recommend: 'Works' }, sets: [] };
  const studio = { id: 'studio', repoId: 100, repo: 'acme/studio', name: 'Acme Studio', revision: 'b'.repeat(40), readAt: now, state: 'complete', gaps: [], changes: [], decisions: [], walks: [walk], reviews: [], waiting: [], roadmap: phaseRoadmap(phases, [{ id: 'G1', title: 'Publishing works everywhere' }, { id: 'G2', title: 'Owners walk less' }]) };
  const unread = { id: 'anvils', repo: 'acme/anvils', name: 'Acme Anvils', state: 'unavailable', gaps: [{ source: 'project', reason: 'The App cannot read acme/anvils.' }], changes: [], decisions: [], walks: [], reviews: [], waiting: [] };
  const model = homeSnapshot([studio, unread], { can: { form: 'web' }, today: '2026-10-21' });
  const claims = { state: 'read', claims: [{ phase: 1, branch: 'claims/phase-1', provider: 'claude', machine: 'acme-mac', at: '2026-10-19T16:00:00.000Z' }], prs: [] };
  const roadmaps = [roadmapOf(studio, claims, { now }), roadmapOf(unread, null, { now })];
  return { schema: 1, generatedAt: now, lane: null, ...backlogFor(model, roadmaps, { now }), sidebar: sidebar() };
}
const sidebar = () => ({ humans: [{ login: 'acme-owner', role: 'owner' }], links: [{ projectId: 'studio', projectName: 'Acme Studio', repo: 'https://github.com/acme/studio', canvas: 'https://canvas.acme.example', production: 'https://studio.acme.example' }] });
/** Agents' model from Acme claims, policy and PRs, read at a fixed time. */
export function agents() {
  const now = '2026-10-21T16:00:00.000Z';
  const model = agentsFor([
    { projectId: 'studio', projectName: 'Acme Studio', config: { agents: { claude: {}, codex: {} }, backlog: { routes: ['session', 'tonight'] }, robot: { on: false } },
      claims: [{ phase: 178, branch: 'claims/phase-178', provider: 'claude', machine: 'acme-mac', at: '2026-10-21T09:00:00.000Z' }], titles: { 178: 'The backlog shows every plate\'s work in lanes' },
      prs: { state: 'read', items: [{ number: 41, title: 'Acme anvils, sharper', url: 'https://github.com/acme/studio/pull/41', createdAt: '2026-10-18T10:00:00Z', isDraft: false, reviewDecision: 'REVIEW_REQUIRED', autoMerge: false, author: 'acme' }] } },
    { projectId: 'anvils', projectName: 'Acme Anvils', config: { agents: { claude: {} } }, claims: [], titles: {}, prs: { state: 'unavailable', why: 'the Plates GitHub App has no Pull requests read on this plate' } },
  ], { now });
  return { ...model, sidebar: { ...sidebar(), counts: agentCounts(model) } };
}
/** Recurring's model from Acme workflows and plates.json, read at a fixed time; one plate not read. */
export function recurring() {
  const now = '2026-10-21T16:00:00.000Z', wf = (id, crons, triggers = ['schedule']) => ({ path: `.github/workflows/plates-${id}.yml`, name: `plates-${id}`, crons, triggers });
  const studio = { projectId: 'studio', projectName: 'Acme Studio', state: 'read', config: { practices: ['night', 'climb', 'delivery'], climb: { schedule: 'weekly', budget: { minutes: 45 } }, robot: { on: false, budgetMinutes: 60 } },
    workflows: [wf('night', ['23 7 * * *']), wf('climb', ['17 10 * * *']), wf('robot', ['37 11 * * 1']), wf('publish', [], ['workflow_run'])], daily: { state: 'read', date: '2026-10-21', counts: { done: 4, failed: 1 }, allocatedMinutes: 90 },
    runs: { state: 'read', items: [{ path: '.github/workflows/plates-publish.yml', name: 'plates-publish', status: 'completed', conclusion: 'success', at: '2026-10-21T15:00:00Z', url: 'https://github.com/acme/studio/actions/runs/7' }] } };
  return { ...recurringOf([studio, { projectId: 'anvils', projectName: 'Acme Anvils', state: 'not read', na: 'The App cannot read acme/anvils.' }], { now }), links: sidebar().links, sidebar: sidebar() };
}
const decision = () => ({ schema: 1, project, source: { path: 'docs/reviews/2026-10-21.md', head: 'c'.repeat(40), blob: 'd'.repeat(40), branch: 'main', visibility: 'public', link: 'https://github.com/acme/studio/blob/main/docs/reviews/2026-10-21.md' }, target: { kind: 'shaping', path: 'docs/shaping/next.json', question: 'scope' },
  question: { title: 'Which Acme scope should we build?', body: 'The owner chooses.', choices: [], recommendation: { text: 'Build the broader scope.', evidence: ['docs/evidence/acme.md'], alternatives: ['Keep this release small.'] } } });

/** Each page type: its markup, and the JSON its client reads back (GET path → body), as the server would answer it. */
export async function designPages() {
  const h = changesHarness(), model = await h.changes.detail(h.access, token, h.project, 'acme-search');
  const home = snapshot(), review = reviewSnapshot(), reviewEmpty = { ...reviewSnapshot(), docket: [] };
  return {
    home: { html: homeView(access, home), api: { '/api/home': home } },
    project: { html: projectView(project, access, snapshot()), api: { '/api/projects/studio/home': snapshot() } },
    signin: { html: signinView('fake-csrf-acme', '/projects/studio'), api: {} },
    decision: { html: decisionView(decision(), access), api: {} },
    changes: { html: changeIndexView({ ...model, items: [model.change] }, access), api: {} },
    // Phase 174: the review session's first card, and its end when nothing waits.
    review: { html: reviewView(access, review, null), api: { '/api/home': review } },
    reviewEmpty: { html: reviewView(access, reviewEmpty, project), api: { '/api/projects/studio/home': reviewEmpty } },
    // Phase 178: the backlog, a list beside the sidebar, with a row in four lanes and one plate not read.
    backlog: { html: backlogView(access, backlog()), api: { '/api/backlog': backlog() } },
    // Phase 179: the same backlog by goal, one card per phase.
    backlogGoals: { html: backlogView(access, backlog(), { arrangement: 'goals' }), api: { '/api/backlog': backlog() } },
    // Phase 185: Recurring, beside the same sidebar: a scheduled routine, a weekly one whose config disagrees, an off one, an event one.
    recurring: { html: recurringView(access, recurring()), api: { '/api/recurring': recurring() } },
    // Phase 186: Agents and Pending review: one provider working, one idle, routes on and off, a pending PR, and a plate whose PRs were not read.
    agents: { html: agentsView(access, agents()), api: { '/api/agents': agents() } },
  };
}

/** Page type → markup, the golden's shape. */
export async function pages() {
  return Object.fromEntries(Object.entries(await designPages()).map(([name, { html }]) => [name, html]));
}
