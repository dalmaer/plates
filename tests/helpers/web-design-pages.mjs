// The representative workspace pages, rendered from fixed Acme inputs. The
// markup golden (tests/web-design.test.mjs, phase 167) and the look capture
// (scripts/look.mjs, phase 172) read this one list, so a page type added for
// one is covered by the other.
import { homeView, projectView, signinView } from '../../lib/web/views.mjs';
import { decisionView } from '../../lib/web/decision-views.mjs';
import { changeIndexView } from '../../lib/web/change-views.mjs';
import { reviewView } from '../../lib/web/review-views.mjs';
import { changesHarness, token } from './web-changes.mjs';
import { reviewSnapshot } from './review-fixture.mjs';
import { itemKey, docketOf, homeSnapshot } from '../../lib/work-items.mjs';

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
  };
}

/** Page type → markup, the golden's shape. */
export async function pages() {
  return Object.fromEntries(Object.entries(await designPages()).map(([name, { html }]) => [name, html]));
}
