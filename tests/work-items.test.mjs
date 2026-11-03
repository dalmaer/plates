// The owner's open work is one item model, lib/work-items.mjs (plates phase 156).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, kindOf, looseItems, fleetOf, reviewItems, WRITERS, itemKey, answersFor, homeSnapshot, notNowRecord, takesMinutes, DEFAULT_MINUTES, QUICK_MINUTES, phaseSets } from '../lib/work-items.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));

/** Every .mjs source under the given roots, repo-relative. */
async function sources(...roots) {
  const out = [];
  const visit = async dir => {
    for (const entry of await readdir(join(repo, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') await visit(path); }
      else if (entry.isFile() && entry.name.endsWith('.mjs')) out.push(path);
    }
  };
  for (const root of roots) await visit(root);
  return out;
}

// A static or dynamic import whose specifier ends in board.mjs.
const importsBoard = text => /(?:from\s*|import\s*\(\s*)['"][^'"]*\bboard\.mjs['"]/.test(text);

test('one item model: no module imports the retired board', async () => {
  // plates board retired (it names plates home and exits 2), and lib/board.mjs with it: nothing may import it.
  const allowed = new Set();
  const offenders = [];
  for (const path of await sources('lib', 'bin', 'scripts', 'practices')) {
    if (allowed.has(path)) continue;
    if (importsBoard(await readFile(join(repo, path), 'utf8'))) offenders.push(path);
  }
  assert.deepEqual(offenders, [], 'these import lib/board.mjs; the item model is lib/work-items.mjs');
  // The named consumers read the model itself.
  for (const path of ['lib/web/projects.mjs', 'lib/web/decisions.mjs', 'lib/web/walks.mjs', 'lib/goodnight.mjs', 'lib/morning.mjs']) {
    assert.match(await readFile(join(repo, path), 'utf8'), /work-items\.mjs['"]/, `${path} reads the item model`);
  }
  // The guard itself catches both import forms.
  assert.ok(importsBoard("import { x } from '../board.mjs';") && importsBoard("await import('./board.mjs')"));
  assert.ok(!importsBoard("import { x } from './work-items.mjs';"));
});

test('every item kind is defined once, in the model', () => {
  for (const [kind, def] of Object.entries(KINDS)) {
    assert.equal(def.kind, kind); assert.equal(typeof def.label, 'string'); assert.ok(def.sources.length);
    assert.ok(Object.isFrozen(def));
  }
  // Items the sources raise, from synthetic Acme reads: each kind is listed.
  const loose = looseItems({ projects: [{ repo: 'acme/studio', dir: '/acme/studio', items: [
    { kind: 'file', title: 'a.txt' }, { kind: 'branch', title: 'work/x' }, { kind: 'worktree', title: 'wt' }, { kind: 'pr', title: '#1' },
    { kind: 'session', title: 'Acme chat', ending: 'question' }, { kind: 'repo', title: 'tidy' }, { kind: 'gap', title: 'unread' },
    { kind: 'phase', title: 'phase 1', move: '⚑ yours' }, { kind: 'lessons', title: 'lessons' },
  ] }] });
  const fleet = fleetOf({ rows: [{ role: 'managed', repo: 'acme/api', adopted: true, practice: { behind: 'current', version: '1.0.0' }, health: { last: '2026-11-01' },
    ci: { state: 'red', workflow: 'gate', conclusion: 'failure', at: '2026-11-01' }, machinePrs: { drafts: [{ head: 'plates/update-v1.2.0', number: 4 }] } }] });
  for (const item of [...loose, ...fleet.items]) assert.ok(kindOf(item), `kind ${item.kind} is defined in KINDS`);
  assert.equal(kindOf({ kind: 'invented' }), undefined);
  assert.equal(kindOf({ kind: 'toString' }), undefined, 'only listed kinds, never a prototype key');
});

test('review items carry their kind from the model', async () => {
  const r = await reviewItems([{ repo: 'acme/studio', rounds: 3 }], { me: 'acme', read: async () => ({ prs: [{ number: 2, title: 'Acme', state: 'open', url: 'https://github.com/acme/studio/pull/2', author: 'acme', unanswered: 1, oldest: '2026-11-01' }], rounds: [] }) });
  assert.equal(r.items.length, 1); assert.equal(kindOf(r.items[0]).label, 'Review');
});

// Phase 173: every item waiting on the owner can be answered where it is shown.
// Kinds that never wait on the owner: each one is named here on purpose, so a new kind must either say its answers or be added to this list.
const NEVER_THE_OWNERS = ['dated', 'ci', 'update', 'robot', 'files', 'branch', 'worktree', 'pr', 'gap'];
// A kind whose only writer plates cannot run from home, with the reason (phase 173's table names it).
const ANSWERED_ELSEWHERE = { feedback: 'a resolution needs an authored record file and its digest approval' };

test('every owner item can be answered', () => {
  for (const [kind, def] of Object.entries(KINDS)) {
    if (NEVER_THE_OWNERS.includes(kind)) { assert.equal(def.answers, null, `${kind} never waits on the owner`); continue; }
    assert.equal(typeof def.answers, 'function', `${kind} can wait on the owner, so KINDS names its answers`);
  }
  // A kind added without answers, and not named as never the owner's, fails here.
  assert.ok(Object.keys(KINDS).every(kind => NEVER_THE_OWNERS.includes(kind) || KINDS[kind].answers), 'no owner kind without answers');
  // One synthetic owner item of every kind that has answers, as each source raises it.
  const owner = [
    { projectId: 'studio', itemKind: 'walk', ref: '2', details: { choices: ['Works', 'Close, but (say what)', 'Not yet'] } },
    { projectId: 'studio', itemKind: 'walk', ref: '5', details: null },
    { projectId: 'studio', itemKind: 'step', ref: '1' },
    { projectId: 'studio', itemKind: 'proposal', ref: 'docs/health/2026-11-01.md', decisionTarget: { kind: 'health', path: 'docs/health/2026-11-01.md' } },
    { projectId: 'studio', itemKind: 'review', ref: '7' },
    ...looseItems({ projects: [{ repo: 'acme/studio', dir: '/acme/studio', items: [
      { kind: 'session', title: 'Acme chat', ending: 'question', id: 'aa1' }, { kind: 'repo', title: 'acme/tidy', id: 'aa2' }, { kind: 'phase', title: 'phase 1', move: '⚑ yours', id: 'aa3' },
      { kind: 'lessons', title: 'lessons', id: 'aa4' }, { kind: 'health', title: 'health', id: 'aa5' }, { kind: 'inbox', title: 'inbox', id: 'aa6' },
    ] }] }).map(it => ({ ...it, plate: 'studio', ref: it.id })),
    { plate: 'studio', kind: 'lesson', ref: 'acme-lesson', waits: 'owner' }, { plate: 'studio', kind: 'claim', ref: 'claims/phase-3', phase: 3, waits: 'owner' },
    { plate: 'studio', kind: 'check', ref: 'd1', waits: 'owner' }, { plate: 'studio', kind: 'verify', ref: 'v1', waits: 'owner' }, { plate: 'studio', kind: 'feedback', ref: 'f'.repeat(64), waits: 'owner' },
  ];
  const kinds = new Set(owner.map(i => i.itemKind ?? i.kind));
  for (const kind of Object.keys(KINDS).filter(k => !NEVER_THE_OWNERS.includes(k))) assert.ok(kinds.has(kind), `the fixture has an owner ${kind}`);
  for (const item of owner) {
    const key = itemKey(item);
    assert.ok(key, `${item.kind ?? item.itemKind} has a stable key`);
    for (const form of [{ form: 'cli' }, { form: 'web', decisionWrites: true }]) {
      const answers = answersFor(item, form);
      assert.ok(answers.length >= 2, `${key}: answers beyond Not now`);
      assert.equal(new Set(answers.map(a => a.id)).size, answers.length, `${key}: answer ids are unique`);
      assert.equal(answers.filter(a => a.writer === 'not now').length, 1, `${key}: one Not now`);
      for (const a of answers) {
        assert.ok(Object.hasOwn(WRITERS, a.writer), `${key} ${a.id}: its writer ${a.writer} is a known write path`);
        assert.ok(['always', 'decline', 'never'].includes(a.needsWhy));
        assert.deepEqual(Object.keys(a).filter(k => !['id', 'label', 'needsWhy', 'writer', 'recommended', 'unavailable'].includes(k)), [], `${key} ${a.id}: the answer shape`);
        if (a.unavailable) assert.ok(a.unavailable.reason && a.unavailable.command, `${key} ${a.id}: unavailable says why and how`);
      }
    }
    // In the terminal, no item's only answer is "go and do this somewhere else".
    const real = answersFor(item, { form: 'cli' }).filter(a => a.writer !== 'not now' && !a.unavailable);
    if (Object.hasOwn(ANSWERED_ELSEWHERE, item.kind)) assert.equal(real.length, 0, 'named as answered elsewhere');
    else assert.ok(real.length, `${key}: an answer the terminal writes`);
  }
  const walk = answersFor(owner[0]);
  assert.deepEqual(walk.map(a => [a.id, a.needsWhy]), [['choice-works', 'never'], ['choice-close-but-say-what', 'always'], ['choice-not-yet', 'never'], ['not-now', 'never']]);
  assert.deepEqual(answersFor(owner[1]).map(a => [a.id, a.writer, a.needsWhy]), [['done', 'walk done', 'always'], ['not-now', 'not now', 'never']], 'a walk without choices: Done, with what you saw, or Not yet');
  assert.equal(answersFor(owner[1]).at(-1).label, 'Not yet');
  // An item no owner waits on has no answers.
  assert.deepEqual(answersFor({ plate: 'studio', kind: 'branch', ref: 'b' }), []);
});

test('not now hides an item until its date and counts it', () => {
  const project = { id: 'studio', gaps: [], changes: [], state: 'complete',
    decisions: [{ id: 'studio:phase:1:decision', projectId: 'studio', kind: 'decision', itemKind: 'step', ref: '1', title: 'Choose the policy' }],
    walks: [{ id: 'studio:phase:2:walk', projectId: 'studio', kind: 'walk', itemKind: 'walk', ref: '2', ready: true, title: 'Try it', details: null }], reviews: [], waiting: [] };
  const sections = [{ id: 'claims', title: 'Stale claims', command: 'plates home', state: 'read', reason: null, count: 1,
    items: [{ kind: 'claim', waits: 'owner', title: 'phase 3: claimed, idle 9 days', plate: 'studio', ref: 'claims/phase-3', phase: 3 }] }];
  const snoozed = { 'studio:walk:2': { until: '2026-11-10', reason: 'after the trip' }, 'studio:claim:claims/phase-3': { until: '2026-11-05' } };
  const before = homeSnapshot([structuredClone(project)], { sections: structuredClone(sections), snoozed, today: '2026-11-04' });
  assert.deepEqual(before.walks, [], 'the walk is put off');
  assert.equal(before.decisions.length, 1, 'what was not put off stays');
  assert.deepEqual(before.sections[0].items, [], 'a section row is put off too');
  assert.equal(before.sections[0].count, 0, 'and its count says so');
  assert.equal(before.putOff.count, 2, 'counted, never silently gone');
  assert.deepEqual(before.putOff.items.map(p => [p.key, p.until, p.reason ?? null]), [['studio:claim:claims/phase-3', '2026-11-05', null], ['studio:walk:2', '2026-11-10', 'after the trip']]);
  assert.ok(before.putOff.items.every(p => p.item.answers.length), 'a put-off item keeps its answers');
  // On its date it returns.
  const on = homeSnapshot([structuredClone(project)], { sections: structuredClone(sections), snoozed, today: '2026-11-05' });
  assert.equal(on.sections[0].items.length, 1, 'the claim is back on its date');
  assert.equal(on.walks.length, 0); assert.equal(on.putOff.count, 1);
  const after = homeSnapshot([structuredClone(project)], { sections: structuredClone(sections), snoozed, today: '2026-11-10' });
  assert.deepEqual([after.walks.length, after.putOff.count], [1, 0], 'both back');
  // The record itself: a date after today, one line of reason; seven days when no date is given.
  assert.deepEqual(notNowRecord({ today: '2026-11-03' }), { until: '2026-11-10' });
  assert.throws(() => notNowRecord({ until: '2026-11-03', today: '2026-11-03' }), /after today/);
  assert.throws(() => notNowRecord({ until: 'soon', today: '2026-11-03' }), /YYYY-MM-DD/);
  // Records that cannot be read hide nothing, and say so.
  const unread = homeSnapshot([structuredClone(project)], { sections: structuredClone(sections), notNowGap: 'unreadable', today: '2026-11-04' });
  assert.deepEqual([unread.walks.length, unread.putOff.count, unread.putOff.unavailable], [1, 0, 'unreadable']);
});

test('a decline needs a why', async t => {
  const { homeAnswer } = await import('../lib/home-answer.mjs');
  const { createHomeAnswers } = await import('../lib/web/home-answers.mjs');
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const proposal = { id: 'studio:health:docs/health/2026-11-01.md', projectId: 'studio', projectName: 'Acme Studio', kind: 'decision', itemKind: 'proposal',
    ref: 'docs/health/2026-11-01.md', title: 'Review dependency_age proposal', decisionTarget: { kind: 'health', path: 'docs/health/2026-11-01.md' } };
  const model = can => homeSnapshot([{ id: 'studio', repo: 'acme/studio', gaps: [], changes: [], state: 'complete', decisions: [structuredClone(proposal)], walks: [], reviews: [], waiting: [] }], { sections: [], can, today: '2026-11-03' });
  // The terminal: refused before anything is read or written.
  const root = await mkdtemp(join(tmpdir(), 'plates-decline-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.plates'), { recursive: true });
  await writeFile(join(root, '.plates', 'plates.json'), JSON.stringify({ name: 'Acme Studio', repo: 'acme/studio' }));
  const answer = (answerId, why) => homeAnswer({ root, key: 'studio:proposal:docs/health/2026-11-01.md', answerId, why }, { home: async () => model({ form: 'cli' }), now: () => Date.parse('2026-11-03T12:00:00Z') });
  for (const why of [undefined, '', '   ']) await assert.rejects(answer('decline', why), e => e.exitCode === 2 && /Decline needs a why/.test(e.message), `CLI, why ${JSON.stringify(why)}`);
  // The web: the same answer, refused the same way, and nothing reaches the decision writer.
  const previews = [];
  const decisions = { preview: async (...args) => { previews.push(args); return { id: 'p1' }; } };
  const web = createHomeAnswers({}, { readHome: async () => model({ form: 'web', decisionWrites: true }), decisions, notNow: { put: async () => assert.fail('no Not now write') } });
  const access = { userId: 1, projects: [{ id: 'studio', repoId: 102, repo: 'acme/studio' }] };
  for (const why of [undefined, '', '   ']) await assert.rejects(web(access, 'token', { key: 'studio:proposal:docs/health/2026-11-01.md', answer: 'decline', ...(why === undefined ? {} : { why }) }), e => e.code === 'why_required' && e.status === 400, `web, why ${JSON.stringify(why)}`);
  assert.equal(previews.length, 0, 'nothing reached the writer');
  // With a why, the web hands it to the existing decision preview; accepting needs none.
  const declined = await web(access, 'token', { key: 'studio:proposal:docs/health/2026-11-01.md', answer: 'decline', why: 'Renovate takes these' });
  assert.equal(declined.state, 'preview');
  assert.deepEqual(previews[0].slice(2), [access.projects[0], { target: proposal.decisionTarget, choice: 'decline', reason: 'Renovate takes these' }]);
  assert.equal((await web(access, 'token', { key: 'studio:proposal:docs/health/2026-11-01.md', answer: 'accept' })).state, 'preview');
  // Without decision writes, the web lists the answer as unavailable and refuses it.
  const off = createHomeAnswers({}, { readHome: async () => model({ form: 'web', decisionWrites: false }), decisions });
  await assert.rejects(off(access, 'token', { key: 'studio:proposal:docs/health/2026-11-01.md', answer: 'decline', why: 'x' }), e => e.code === 'answer_unavailable');
});

// Phase 175: the docket's order, estimates and what each answer sets moving, in the model.
// A synthetic Acme fleet: one plate's decisions and walks, a review, and a stale claim row.
function docketFixture() {
  const project = { id: 'studio', projectName: 'Acme Studio', gaps: [], changes: [], state: 'complete',
    decisions: [
      { id: 'studio:health:docs/health/2026-10-30.md', projectId: 'studio', kind: 'decision', itemKind: 'proposal', ref: 'docs/health/2026-10-30.md', title: 'Update anvils', decisionTarget: { kind: 'health', path: 'docs/health/2026-10-30.md' } },
      { id: 'studio:health:docs/health/2026-10-20.md', projectId: 'studio', kind: 'decision', itemKind: 'proposal', ref: 'docs/health/2026-10-20.md', title: 'Retire the old sprocket', decisionTarget: { kind: 'health', path: 'docs/health/2026-10-20.md' } },
      { id: 'studio:phase:5:decision', projectId: 'studio', kind: 'decision', itemKind: 'step', ref: '5', phase: '5', since: '2026-11-01', title: 'Approve the night lane', sets: [{ kind: 'phase', phase: '5', title: 'The night lane' }] },
    ],
    walks: [
      { id: 'studio:phase:3:walk', projectId: 'studio', kind: 'walk', itemKind: 'walk', ref: '3', phase: '3', since: '2026-10-01', ready: true, title: 'Publish from a phone', details: { takes: 'About 10 minutes', choices: ['Verified', 'Needs changes'] }, sets: [{ kind: 'phase', phase: '9', title: 'Share to the team' }] },
      { id: 'studio:phase:4:walk', projectId: 'studio', kind: 'walk', itemKind: 'walk', ref: '4', phase: '4', since: '2026-10-25', ready: true, title: 'Is the badge right?', details: { takes: 'A minute.', choices: ['Yes', 'No'] }, sets: [] },
      { id: 'studio:phase:6:walk', projectId: 'studio', kind: 'walk', itemKind: 'walk', ref: '6', phase: '6', since: '2026-09-01', ready: true, title: 'A week of use', details: null, sets: [] },
      { id: 'studio:phase:8:walk', projectId: 'studio', kind: 'walk', itemKind: 'walk', ref: '8', phase: '8', ready: false, title: 'Not ready yet', details: null },
    ],
    reviews: [{ id: 'studio:review:7', projectId: 'studio', kind: 'review', itemKind: 'review', ref: '7', title: 'acme/studio#7: review round 3 of 3', review: { number: 7 } }], waiting: [] };
  const sections = [{ id: 'claims', title: 'Stale claims', command: 'plates home', state: 'read', reason: null, count: 1,
    items: [{ kind: 'claim', waits: 'owner', title: 'phase 2: claimed, idle 9 days', plate: 'studio', ref: 'claims/phase-2', phase: 2, since: '2026-10-10' }] }];
  return { project, sections };
}

test('the docket starts with what blocks agents', async () => {
  const { project, sections } = docketFixture();
  const docket = can => homeSnapshot([structuredClone(project)], { sections: structuredClone(sections), can, today: '2026-11-03' }).docket;
  const web = docket({ form: 'web', decisionWrites: true }), cli = docket({ form: 'cli' });
  // What an agent or the night waits on (the claim, the review at its limit, the step: oldest first, the undated review last of them),
  // then quick decisions (a proposal dated by its page, the minute walk with choices, the newer proposal), then walks that need a device or time (oldest first).
  assert.deepEqual(web.map(e => [e.key, e.group]), [
    ['studio:claim:claims/phase-2', 'unblock'], ['studio:step:5', 'unblock'], ['studio:review:7', 'unblock'],
    ['studio:proposal:docs/health/2026-10-20.md', 'decide'], ['studio:walk:4', 'decide'], ['studio:proposal:docs/health/2026-10-30.md', 'decide'],
    ['studio:walk:6', 'walk'], ['studio:walk:3', 'walk'],
  ]);
  assert.ok(!web.some(e => e.key === 'studio:walk:8'), 'a walk that is not ready is not in the docket');
  // The same in both forms: the order, the estimates and what each sets moving are the model's, not a form's.
  assert.deepEqual(cli, web);
  // The forms' readers walk it in that order (the browser's own reader, and the terminal's).
  const { docketItems } = await import('../lib/web/review-views.mjs');
  const snapshot = homeSnapshot([structuredClone(project)], { sections: structuredClone(sections), today: '2026-11-03' });
  assert.deepEqual(docketItems(snapshot).map(e => e.key), web.map(e => e.key));
});

test('every item says how long it takes', async () => {
  const { project, sections } = docketFixture();
  const snapshot = homeSnapshot([structuredClone(project)], { sections: structuredClone(sections), today: '2026-11-03' });
  for (const e of snapshot.docket) assert.ok(Number.isSafeInteger(e.minutes) && e.minutes >= 1, `${e.key} has an estimate`);
  const by = Object.fromEntries(snapshot.docket.map(e => [e.key, [e.minutes, e.estimate, e.quick]]));
  // From the Your part's Takes line where there is one; else the kind's default.
  assert.deepEqual(by['studio:walk:3'], [10, 'takes', false]);
  assert.deepEqual(by['studio:walk:4'], [1, 'takes', true]);
  assert.deepEqual(by['studio:walk:6'], [DEFAULT_MINUTES.walk, 'kind', false]);
  assert.deepEqual(by['studio:claim:claims/phase-2'], [DEFAULT_MINUTES.claim, 'kind', true]);
  assert.deepEqual(by['studio:proposal:docs/health/2026-10-20.md'], [DEFAULT_MINUTES.proposal, 'kind', true]);
  assert.ok(snapshot.docket.every(e => e.quick === (e.minutes <= QUICK_MINUTES)));
  // Every owner kind has a default, so no item goes without one.
  for (const [kind, def] of Object.entries(KINDS)) if (def.answers) assert.ok(Number.isSafeInteger(DEFAULT_MINUTES[kind]), `${kind} has a default estimate`);
  // Takes lines as the fleet writes them.
  for (const [text, minutes] of [['About 10 minutes.', 10], ['2 minutes to install; two weeks of use.', 2], ['About five minutes once review and checks finish.', 5],
    ['About 1–2 hours for the session; then a week of normal use.', 120], ['A minute, the next day.', 1], ['30 seconds', 1], ['One setup or testing session; record the actual duration.', null], [undefined, null]])
    assert.equal(takesMinutes(text), minutes, String(text));
  // The Start panel's total is their sum, in both forms.
  const total = snapshot.docket.reduce((n, e) => n + e.minutes, 0), quick = snapshot.docket.filter(e => e.quick).length;
  assert.equal(total, 10 + 1 + 10 + 1 + 5 + 5 + 2 + 2);
  const { renderReviewStart } = await import('../lib/web/review-views.mjs');
  assert.match(renderReviewStart(snapshot), new RegExp(`<strong>8 for you · about ${total} min</strong>`));
  const { homeText } = await import('../lib/home.mjs');
  assert.match(homeText({ ...snapshot, generatedAt: '2026-11-03T12:00:00Z' }), new RegExp(`^8 for you · about ${total} min — plates home --review \\(--quick: the ${quick} quick ones\\)$`, 'm'));
});

test('what an answer sets moving comes from the phase files and the claim', () => {
  const p = (id, status, depends = [], more = {}) => ({ id, status, depends, title: `Phase ${id}`, ...more });
  // 3 is partial (not yet satisfying depends); 4 waits only on 3; 5 also on 9, not yet built; 6 is built; 7 only owes a walk.
  const phases = [p(3, 'partial'), p(4, 'planned', [3]), p(5, 'planned', [3, 9]), p(9, 'planned'), p(6, 'built', [3]), p(7, 'partial', [], { owes: 'walk' }), p(8, 'planned', [7])];
  assert.deepEqual(phaseSets(phases[0], phases, 'walk'), [{ kind: 'phase', phase: '4', title: 'Phase 4' }], 'only a phase this one gates, with every other dependency met');
  assert.deepEqual(phaseSets(phases[0], phases, 'step'), [{ kind: 'phase', phase: '3', title: 'Phase 3' }, { kind: 'phase', phase: '4', title: 'Phase 4' }], 'a ⚑ step frees its own phase too');
  assert.deepEqual(phaseSets(phases[5], phases, 'walk'), [], 'a phase that owes only a walk already satisfies depends: answering it starts nothing new');
  const { project, sections } = docketFixture();
  const docket = homeSnapshot([project], { sections, today: '2026-11-03' }).docket;
  const sets = Object.fromEntries(docket.map(e => [e.key, e.sets]));
  assert.deepEqual(sets['studio:claim:claims/phase-2'], [{ kind: 'claim', branch: 'claims/phase-2', phase: '2' }]);
  assert.deepEqual(sets['studio:walk:3'], [{ kind: 'phase', phase: '9', title: 'Share to the team' }]);
  assert.deepEqual(sets['studio:proposal:docs/health/2026-10-20.md'], [], 'otherwise nothing');
});
