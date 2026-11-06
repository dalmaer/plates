// The owner's open work is one item model, lib/work-items.mjs (plates phase 156).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, kindOf, looseItems, fleetOf, reviewItems, WRITERS, itemKey, answersFor, homeSnapshot, homeSections, notNowRecord, takesMinutes, DEFAULT_MINUTES, QUICK_MINUTES, phaseSets, rollbackItems, backlogOf, BACKLOG_LANES, BACKLOG_STALE_DAYS, NEEDS_SHAPING } from '../lib/work-items.mjs';
import { deployResults, openRollbacks, rollbackLine } from '../practices/night/files/scripts/plates/morning.mjs';

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
    { plate: 'studio', kind: 'check', ref: 'd1', waits: 'owner' }, { plate: 'studio', kind: 'verify', ref: 'v1', waits: 'owner' }, { plate: 'studio', kind: 'rollback', ref: 'r1', waits: 'owner' }, { plate: 'studio', kind: 'feedback', ref: 'f'.repeat(64), waits: 'owner' },
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
    reviews: [{ id: 'studio:review:7', projectId: 'studio', kind: 'review', itemKind: 'review', ref: '7', title: 'acme/studio#7: review round 3 of 3', review: { number: 7, rounds: 3, limit: 3 } },
      { id: 'studio:review:8', projectId: 'studio', kind: 'review', itemKind: 'review', ref: '8', title: 'acme/studio#8: 1 review comment unanswered', review: { number: 8, rounds: 1, limit: 3 } }], waiting: [] };
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
    ['studio:proposal:docs/health/2026-10-20.md', 'decide'], ['studio:walk:4', 'decide'], ['studio:proposal:docs/health/2026-10-30.md', 'decide'], ['studio:review:8', 'decide'],
    ['studio:walk:6', 'walk'], ['studio:walk:3', 'walk'],
  ]);
  assert.ok(!web.some(e => e.key === 'studio:walk:8'), 'a walk that is not ready is not in the docket');
  // Only a PR at its review-round limit blocks: #7 (round 3 of 3) does, #8 (round 1 of 3, findings unanswered) is a decision.
  const group = key => web.find(e => e.key === key)?.group;
  assert.equal(group('studio:review:7'), 'unblock'); assert.equal(group('studio:review:8'), 'decide');
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
  assert.equal(total, 10 + 1 + 10 + 1 + 5 + 5 + 5 + 2 + 2);
  const { renderReviewStart } = await import('../lib/web/review-views.mjs');
  assert.match(renderReviewStart(snapshot), new RegExp(`<strong>9 need you · about ${total} min</strong>`));
  const { homeText } = await import('../lib/home.mjs');
  assert.match(homeText({ ...snapshot, generatedAt: '2026-11-03T12:00:00Z' }), new RegExp(`^ {2}9 need you · about ${total} min — plates home --review \\(--quick: the ${quick} quick ones\\)$`, 'm'));
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

// Phase 177: a deploy that rolled itself back is the owner's until a later deploy passes; one whose rollback failed is first.
test('a failed rollback is the first thing the owner sees', async () => {
  const sha = c => c.repeat(40);
  const rec = (at, commit, more) => JSON.stringify({ schema: 1, at, project: 'anvils', commit: sha(commit), action: 'deploy', deployment: { id: `dpl_${commit}`, url: null }, target: { id: 'dpl_a', url: null },
    checks: [{ check: 'revision', ok: true, detail: 'ok' }, { check: 'smoke', ok: more.ok, detail: more.ok ? '1 matched' : 'GET /: expected 200, got 500' }], ok: more.ok, failed: more.ok ? null : 'smoke', rolledBack: more.rolledBack ?? false, serving: { id: more.serving ?? `dpl_${commit}`, url: null } });
  // b passed; c rolled back; d's rollback failed. Newest first: d, c, then b, which closes everything before it.
  const deploys = deployResults([rec('2026-11-02T10:00:00Z', 'b', { ok: true }), rec('2026-11-03T09:00:00Z', 'c', { ok: false, rolledBack: true, serving: 'dpl_b' }), rec('2026-11-03T10:00:00Z', 'd', { ok: false, rolledBack: 'failed', serving: 'dpl_d' })].join('\n'));
  const items = rollbackItems(deploys, { openRollbacks, rollbackLine });
  assert.deepEqual(items.map(i => [i.kind, i.waits, i.urgent ?? false, i.title]), [
    ['rollback', 'owner', true, "Production's rollback failed: smoke failed on ddddddd"],
    ['rollback', 'owner', false, 'Production rolled back: smoke failed on ccccccc'],
  ]);
  assert.match(items[0].why, /^Production's rollback FAILED: smoke failed on `ddddddd` \(dpl_d\) at 2026-11-03T10:00:00Z \(GET \/: expected 200, got 500\), and moving back to dpl_a did not take/);
  assert.match(items[1].why, /^Production rolled back: smoke failed on `ccccccc` \(dpl_c\) at 2026-11-03T09:00:00Z \(GET \/: expected 200, got 500\)\. It serves dpl_b again, until a deploy passes\.$/);
  // In the docket, above the claim, the steps and every decision and walk, in both forms; the plain rollback is a quick decision.
  const { project, sections } = docketFixture();
  const verify = homeSections({ verify: { items: items.map(i => ({ ...i, plate: 'studio', ref: i.id })), why: 'the latest verify passed' } }).find(r => r.id === 'verify');
  for (const can of [{ form: 'cli' }, { form: 'web', decisionWrites: true }]) {
    const docket = homeSnapshot([structuredClone(project)], { sections: [...structuredClone(sections), structuredClone(verify)], can, today: '2026-11-03' }).docket;
    assert.equal(docket[0].key, `studio:rollback:${items[0].id}`, `${can.form}: the failed rollback is first`);
    assert.equal(docket[0].urgent, true);
    assert.equal(docket[1].key, 'studio:claim:claims/phase-2', 'then what blocks agents, as before');
    assert.equal(docket.find(e => e.key === `studio:rollback:${items[1].id}`).group, 'decide');
  }
  // A later deploy that passes closes them all.
  assert.deepEqual(rollbackItems(deployResults([rec('2026-11-03T09:00:00Z', 'c', { ok: false, rolledBack: true }), rec('2026-11-03T11:00:00Z', 'e', { ok: true })].join('\n')), { openRollbacks, rollbackLine }), []);
});

// Phase 166: home's first section is one ranked list of the owner's turn, one verb a row.
test("needs you holds only the owner's turn", () => {
  const { project, sections } = docketFixture();
  const plate = { ...structuredClone(project), name: 'Acme Studio', repo: 'acme/studio', revision: 'c'.repeat(40),
    waiting: [{ id: 'studio:phase:10:waiting', projectId: 'studio', kind: 'waiting', itemKind: 'dated', ref: '10', title: 'Not before December', ready: false }],
    // The newest night record has a failed item; a plate file that does not validate is the owner's to repair; a read bound is neither.
    daily: { state: 'read', date: '2026-11-02', from: 'docs/night/2026-11-02.json', counts: { planned: 0, running: 0, done: 2, failed: 1, skipped: 0, 'left-alone': 0 }, readiness: { why: 'every build item is terminal' } },
    gaps: [{ source: 'evidence', reason: 'Phase 4 names evidence absent from this revision.' }, { source: 'GitHub operations', reason: 'Issues are not covered.' }] };
  const rows = [...structuredClone(sections), { id: 'fleet', title: 'Fleet', command: 'plates fleet', state: 'read', reason: null, count: 2, items: [
    { kind: 'ci', waits: 'broken', title: 'acme/studio: CI red on main', plate: 'studio', ref: 'ci', read: 'gh run list -R acme/studio' },
    { kind: 'pr', waits: 'agent', title: 'acme/studio: the agent\'s PR', plate: 'studio', ref: 'pr' }] }];
  const four = can => homeSnapshot([structuredClone(plate)], { sections: structuredClone(rows), can, today: '2026-11-03' }).home;
  const home = four({ form: 'cli' }), needs = home.sections.find(s => s.id === 'needs-you');
  assert.deepEqual(home.sections.map(s => s.title), ['Needs you', 'Since you last looked', 'What should happen next?', 'Your plates']);
  // Fix, then decide, then try; the oldest first within each, undated after.
  assert.deepEqual(needs.items.map(i => [i.verb, i.kind, i.key]), [
    ['fix', 'night', 'studio:night:2026-11-02'], ['fix', 'review', 'studio:review:7'], ['fix', 'ci', null], ['fix', 'repair', 'studio:repair:source'],
    ['decide', 'claim', 'studio:claim:claims/phase-2'], ['decide', 'proposal', 'studio:proposal:docs/health/2026-10-20.md'], ['decide', 'proposal', 'studio:proposal:docs/health/2026-10-30.md'], ['decide', 'step', 'studio:step:5'], ['decide', 'review', 'studio:review:8'],
    ['try', 'walk', 'studio:walk:6'], ['try', 'walk', 'studio:walk:3'], ['try', 'walk', 'studio:walk:4'],
  ]);
  assert.deepEqual([...new Set(needs.items.map(i => i.label))], ['Fix', 'Decide', 'Try it']);
  // Nothing waiting on time or agents: not the dated phase, the walk that is not ready, nor the agent's PR. They stay on the plate's page.
  for (const title of ['Not before December', 'Not ready yet', "acme/studio: the agent's PR"]) assert.ok(!needs.items.some(i => i.title === title), title);
  const strip = home.sections.find(s => s.id === 'plates').items[0];
  assert.deepEqual([strip.status, strip.count, strip.waiting], ['broken', needs.items.length, 2]);
  // Scope notes are not missing reads: the counts are not "known", and no source problem is listed above Needs you or under Your plates.
  assert.equal(needs.known, false); assert.equal(home.sections.find(s => s.id === 'plates').problems.count, 0);
  // Every answerable row keeps phase 173's answers; the same list in both forms.
  assert.ok(needs.items.filter(i => i.key && !['night', 'repair'].includes(i.kind) && i.kind !== 'ci').every(i => i.answers.length > 0));
  const formless = h => h.sections[0].items.map(({ answers, ...i }) => i);
  assert.deepEqual(formless(four({ form: 'web', decisionWrites: true })), formless(home));
});

// Phase 178: the backlog, every plate's work in lanes, derived from what Home reads.
// A synthetic Acme fleet: one plate read (its phases as plates next --json gives them), one that could not be read.
const NOW = '2026-11-05T12:00:00Z';
function backlogFixture() {
  const phase = (id, status, more = {}) => ({ id, status, title: `Acme phase ${id}`, goal: 'G1', depends: [], since: '2026-10-01', spec: 2, next: `Build ${id}.`, file: `${id}-acme.md`, ...more });
  const phases = [
    phase(1, 'built', { since: '2026-11-03' }),                       // done this week
    phase(2, 'built', { since: '2026-09-01' }),                       // done long ago: not in Recently done
    phase(3, 'partial', { owes: 'walk', goal: 'G2' }),                // owes a ready walk: Yours, the walk its child
    phase(4, 'planned', { depends: [2], since: '2026-10-20' }),       // free, unblocks 6
    phase(5, 'planned', { goal: 'G2', since: '2026-10-02' }),         // free, later goal
    phase(6, 'planned', { depends: [4] }),                            // waits on 4
    phase(7, 'planned', { spec: 1 }),                                 // free but an older spec: needs shaping
    phase(8, 'partial'),                                              // claimed
    phase(9, 'partial', { owes: 'walk' }),                            // its walk is not ready
    phase(10, 'planned', { after: '2026-12-01' }),                    // dated
    phase(11, 'planned', { next: '⚑ Approve the Acme lane.' }),       // free, but its next action is the owner's
    phase(12, 'planned', { since: '2026-10-10' }),                    // free, same goal as 4, nothing waits on it
    phase(13, 'superseded'),
    phase(15, 'partial', { owes: 'walk', goal: 'G2' }),               // owes a ten-minute walk, older than 3's
  ];
  const holder = { by: 'branch', branch: 'claims/phase-8', provider: 'claude', machine: 'acme-mac', at: '2026-11-03T12:00:00.000Z', mine: false, here: false, pr: null, work: [] };
  const roadmap = { projectId: 'anvils', phases, goals: [{ id: 'G1' }, { id: 'G2' }],
    free: phases.filter(p => [4, 5, 7, 11, 12].includes(p.id)), claimed: [{ id: 8, title: 'Acme phase 8', file: '8-acme.md', status: 'partial', holder }], behind: [] };
  const project = { id: 'anvils', name: 'Acme Anvils', state: 'complete', revision: 'a'.repeat(40), readAt: NOW, gaps: [], changes: [],
    decisions: [
      { id: 'anvils:phase:11:decision', projectId: 'anvils', kind: 'decision', itemKind: 'step', ref: '11', phase: '11', since: '2026-11-01', title: 'Approve the Acme lane', sets: [{ kind: 'phase', phase: '11', title: 'Acme phase 11' }] },
      { id: 'anvils:health:docs/health/2026-10-30.md', projectId: 'anvils', kind: 'decision', itemKind: 'proposal', ref: 'docs/health/2026-10-30.md', title: 'Update the anvils', decisionTarget: { kind: 'health', path: 'docs/health/2026-10-30.md' } },
    ],
    walks: [
      { id: 'anvils:phase:3:walk', projectId: 'anvils', kind: 'walk', itemKind: 'walk', ref: '3', phase: '3', since: '2026-10-15', ready: true, title: 'Ring the anvil', details: { takes: 'A minute.', choices: ['Rings', 'Thuds'], then: 'Rings: built.' }, sets: [] },
      { id: 'anvils:phase:15:walk', projectId: 'anvils', kind: 'walk', itemKind: 'walk', ref: '15', phase: '15', since: '2026-10-05', ready: true, title: 'A week at the forge', details: { takes: 'About 10 minutes.' }, sets: [] },
    ],
    reviews: [{ id: 'anvils:review:7', projectId: 'anvils', kind: 'review', itemKind: 'review', ref: '7', title: 'acme/anvils#7: review round 3 of 3', review: { number: 7, rounds: 3, limit: 3 } }],
    waiting: [{ id: 'anvils:phase:9:waiting', projectId: 'anvils', kind: 'waiting', itemKind: 'walk', ref: '9', phase: '9', ready: false, title: 'Acme phase 9', why: 'Ready when: the anvil is deployed' }] };
  const unread = { id: 'sprockets', name: 'Acme Sprockets', state: 'unavailable', gaps: [{ source: 'project', reason: 'The App cannot read acme/sprockets.' }], changes: [], decisions: [], walks: [], reviews: [], waiting: [] };
  const snapshot = homeSnapshot([structuredClone(project), structuredClone(unread)], { sections: [], today: '2026-11-05' });
  return { snapshot, roadmaps: [roadmap, { projectId: 'sprockets', na: 'not read' }], project, unread, roadmap };
}
const laneOf = (backlog, key) => backlog.lanes.find(l => l.items.some(i => i.key === key))?.lane ?? null;

test("a phase owing a walk is yours, not an agent's", async () => {
  const { snapshot, roadmaps } = backlogFixture();
  const backlog = backlogOf(snapshot, roadmaps, { now: NOW });
  assert.deepEqual(backlog.lanes.map(l => l.lane), BACKLOG_LANES.map(l => l.id));
  assert.deepEqual(BACKLOG_LANES.map(l => l.id), ['in-flight', 'yours', 'agent-ready', 'waiting', 'done']);
  const card = backlog.lanes.find(l => l.lane === 'yours').items.find(i => i.key === 'anvils:phase:3');
  assert.ok(card, 'the phase owing a walk is under Yours');
  assert.deepEqual(card.children, ['anvils:walk:3'], 'with the walk as its child');
  assert.equal(card.takes, 1, "its minutes are the walk's Takes");
  assert.ok(card.answers.length > 0 && card.answers.every(a => typeof a.id === 'string'), "it carries the walk's answers");
  assert.equal(card.next, 'Rings: built.');
  // The walk is nested, never a row of its own; the phase is in exactly one lane, and not Agent-ready.
  assert.equal(laneOf(backlog, 'anvils:walk:3'), null);
  assert.equal(backlog.lanes.flatMap(l => l.items).filter(i => i.key === 'anvils:phase:3').length, 1);
  // Even if a reader listed it as free, owing a walk wins.
  const r = structuredClone(roadmaps); r[0].free.push(r[0].phases.find(p => p.id === 3));
  assert.equal(laneOf(backlogOf(snapshot, r, { now: NOW }), 'anvils:phase:3'), 'yours');
  // A free phase whose next action is the owner's is Yours too, with its step as the child.
  assert.deepEqual(backlog.lanes.find(l => l.lane === 'yours').items.find(i => i.key === 'anvils:phase:11').children, ['anvils:step:11']);
  // The rest, lane by lane.
  const lanes = Object.fromEntries(backlog.lanes.map(l => [l.lane, l.items.map(i => i.key)]));
  assert.deepEqual(lanes['in-flight'], ['anvils:phase:8']);
  assert.deepEqual(lanes['agent-ready'], ['anvils:phase:4', 'anvils:phase:12', 'anvils:phase:5']);
  assert.deepEqual(lanes.waiting.toSorted(), ['anvils:phase:10', 'anvils:phase:6', 'anvils:phase:7', 'anvils:phase:9']);
  assert.deepEqual(lanes.done, ['anvils:phase:1']);
  const all = Object.fromEntries(backlog.lanes.flatMap(l => l.items).map(i => [i.key, i]));
  assert.deepEqual(all['anvils:phase:9'].why.slice(0, 1), ['Ready when: the anvil is deployed']);
  assert.deepEqual(all['anvils:phase:6'].why.slice(0, 1), ['Waits on 4']);
  assert.deepEqual(all['anvils:phase:10'].why.slice(0, 1), ['Not before 2026-12-01']);
  // Agent-ready needs spec: 2; an older free phase waits for shaping, and is counted (the spec's open question).
  assert.deepEqual(all['anvils:phase:7'].why.slice(0, 1), [NEEDS_SHAPING]);
  assert.equal(backlog.needsShaping, 1);
  // A claimed phase: the holder unchanged from plates next, presence "claimed" only, and the claim's days left of STALE_DAYS.
  assert.equal(all['anvils:phase:8'].presence, 'claimed');
  assert.equal(all['anvils:phase:8'].holder.provider, 'claude');
  assert.equal(all['anvils:phase:8'].ageLeft, 5);
  // The default is lib/claim.mjs's STALE_DAYS (kept as its own constant so plates home's closure stays bounded); a caller may pass another.
  const { STALE_DAYS } = await import('../lib/claim.mjs');
  assert.equal(BACKLOG_STALE_DAYS, STALE_DAYS);
  assert.equal(backlogOf(snapshot, roadmaps, { now: NOW, staleDays: 3 }).lanes[0].items[0].ageLeft, 1);
  // What a phase unblocks comes from depends:.
  assert.deepEqual(all['anvils:phase:4'].unblocks, ['6']);
  assert.deepEqual(all['anvils:phase:4'].why, ['Unblocks 1 phase', 'G1', 'Waiting 16 days']);
  assert.equal(all['anvils:phase:4'].source.file, 'docs/phases/4-acme.md');
  // Every lane is present even when nothing is in it.
  const empty = backlogOf({ projects: [], docket: [] }, [], { now: NOW });
  assert.deepEqual(empty.lanes.map(l => [l.lane, l.count]), BACKLOG_LANES.map(l => [l.id, 0]));
  assert.throws(() => backlogOf(snapshot, roadmaps), /needs `now`/);
});

/** A lane's order rebuilt from nothing but each card's why-keys and key (spec Ordering 1–5). goals: the plate's goal order. */
function orderFromWhy(items, { goals, quickFirst = false, lane }) {
  const keyOf = item => {
    const has = s => item.why.includes(s), match = re => item.why.map(w => re.exec(w)).find(Boolean);
    const goal = item.why.find(w => goals.includes(w));
    const minutes = match(/^~(\d+) min$/), age = match(/^(?:Waiting|Claimed|Done) (\d+) days?/), today = item.why.some(w => /^(?:Waiting since|Claimed|Done) today$/.test(w));
    return [has('Urgent') ? 0 : 1, has('An agent waits on this') ? 0 : 1, -(Number(match(/^Unblocks (\d+) phases?$/)?.[1] ?? 0)),
      goal ? goals.indexOf(goal) : Infinity, quickFirst && lane === 'yours' && minutes && Number(minutes[1]) <= QUICK_MINUTES ? 0 : 1,
      -(age ? Number(age[1]) : today ? 0 : -1)];
  };
  return items.map(i => [keyOf(i), i.key]).sort(([a, x], [b, y]) => { for (let n = 0; n < a.length; n++) if (a[n] !== b[n]) return a[n] < b[n] ? -1 : 1; return x < y ? -1 : x > y ? 1 : 0; }).map(([, key]) => key);
}

test('backlog order is reproducible from its why-keys', () => {
  const { snapshot, roadmaps } = backlogFixture();
  for (const quickFirst of [false, true]) {
    const backlog = backlogOf(snapshot, roadmaps, { now: NOW, quickFirst });
    for (const l of backlog.lanes) assert.deepEqual(orderFromWhy(l.items, { goals: ['G1', 'G2'], quickFirst, lane: l.lane }), l.items.map(i => i.key), `${l.lane}, quick first ${quickFirst}`);
    // The same inputs in another order give the same backlog.
    const shuffled = structuredClone(snapshot); shuffled.docket.reverse();
    const r = structuredClone(roadmaps); r[0].phases.reverse(); r.reverse();
    assert.deepEqual(backlogOf(shuffled, r, { now: NOW, quickFirst }), backlog);
  }
  // Yours: what an agent waits on first (the review at its limit, then the step's phase), then the oldest; quick first moves the minute walk up.
  const yours = q => backlogOf(snapshot, roadmaps, { now: NOW, quickFirst: q }).lanes.find(l => l.lane === 'yours').items.map(i => i.key);
  assert.deepEqual(yours(false), ['anvils:phase:11', 'anvils:review:7', 'anvils:phase:15', 'anvils:phase:3', 'anvils:proposal:docs/health/2026-10-30.md']);
  assert.deepEqual(yours(true), ['anvils:phase:11', 'anvils:review:7', 'anvils:phase:3', 'anvils:phase:15', 'anvils:proposal:docs/health/2026-10-30.md']);
  const all = Object.fromEntries(backlogOf(snapshot, roadmaps, { now: NOW }).lanes.flatMap(l => l.items).map(i => [i.key, i.why]));
  assert.deepEqual(all['anvils:phase:11'], ['An agent waits on this', 'G1', '~5 min', 'Waiting 4 days']);
  assert.deepEqual(all['anvils:review:7'], ['An agent waits on this', '~5 min']);
  assert.deepEqual(all['anvils:phase:15'], ['G2', '~10 min', 'Waiting 31 days']);
  assert.deepEqual(all['anvils:phase:3'], ['G2', '~1 min', 'Waiting 21 days']);
  // Cards whose why-keys are all equal fall back to `key`, so the tie-break is stable.
  const tie = backlogOf(snapshot, [{ ...roadmaps[0], phases: [...roadmaps[0].phases, { ...roadmaps[0].phases[11], id: 14, file: '14-acme.md' }] }], { now: NOW }).lanes.find(l => l.lane === 'agent-ready').items.map(i => i.key);
  assert.deepEqual(tie, ['anvils:phase:4', 'anvils:phase:12', 'anvils:phase:14', 'anvils:phase:5']);
});

// Phase 184: events annotate cards with what happened; they never move one. The same backlog, with every
// card's events in any order and with every action, lists the same keys in the same order in every lane.
test('events never reorder', async () => {
  const { withEvents, backlogEvent, BACKLOG_ACTIONS } = await import('../lib/backlog-events.mjs');
  const { snapshot, roadmaps } = backlogFixture();
  for (const quickFirst of [false, true]) {
    const backlog = backlogOf(snapshot, roadmaps, { now: NOW, quickFirst });
    const order = b => b.lanes.map(l => [l.lane, l.items.map(i => i.key)]);
    const keys = backlog.lanes.flatMap(l => l.items.map(i => i.key)).filter(k => /^[a-z][a-z0-9-]*:[a-z-]+:[A-Za-z0-9]/.test(k));
    // Most events on the last card, none on the first: a count or a recent action is never a rank.
    const events = keys.flatMap((key, n) => Array.from({ length: n + 1 }, (_, i) => backlogEvent({ actor: i % 2 ? 'owner' : 'agent:claude', key, action: BACKLOG_ACTIONS[(n + i) % BACKLOG_ACTIONS.length],
      ...(BACKLOG_ACTIONS[(n + i) % BACKLOG_ACTIONS.length] === 'not-now' ? { reason: 'stated' } : {}), takes: n }, { now: Date.parse(NOW) - (n * 60 + i) * 60000 })));
    assert.ok(keys.length > 5 && events.length > keys.length);
    for (const given of [events, events.toReversed()]) {
      const annotated = withEvents(backlog, given);
      assert.deepEqual(order(annotated), order(backlog), `quick first ${quickFirst}`);
      assert.deepEqual(annotated.lanes.map(l => l.count), backlog.lanes.map(l => l.count));
      assert.ok(annotated.lanes.flatMap(l => l.items).every(i => i.history?.count >= 1));
    }
    // The ordering is read from the backlog's inputs alone: events are not one of them.
    assert.deepEqual(backlogOf({ ...snapshot, events }, roadmaps, { now: NOW, quickFirst }), backlog);
  }
});

test('an unread plate is not an empty lane', () => {
  const { snapshot, roadmaps, project, unread } = backlogFixture();
  const backlog = backlogOf(snapshot, roadmaps, { now: NOW });
  const plate = id => backlog.plates.find(p => p.projectId === id);
  assert.deepEqual(plate('sprockets'), { projectId: 'sprockets', projectName: 'Acme Sprockets', state: 'not read', reason: 'The App cannot read acme/sprockets.', counts: null });
  assert.equal(plate('anvils').state, 'read');
  assert.deepEqual(plate('anvils').counts, { 'in-flight': 1, yours: 5, 'agent-ready': 3, waiting: 4, done: 1 });
  assert.ok(!backlog.lanes.some(l => l.items.some(i => i.projectId === 'sprockets')));
  // A plate whose phases could not be read is not read either, even with its other sources read; one with no roadmap at all the same.
  const noPhases = backlogOf(snapshot, [{ projectId: 'anvils', na: 'docs/phases could not be listed' }], { now: NOW });
  assert.deepEqual([noPhases.plates[0].state, noPhases.plates[0].reason, noPhases.plates[0].counts], ['not read', 'docs/phases could not be listed', null]);
  assert.equal(backlogOf(snapshot, [], { now: NOW }).plates[0].counts, null);
  // A plate read with nothing in it says 0 in every lane: an empty lane is a read, never a stand-in for an unread one.
  const quiet = { ...structuredClone(unread), id: 'quiet', name: 'Acme Quiet', state: 'complete', gaps: [] };
  const read = backlogOf(homeSnapshot([structuredClone(project), quiet], { sections: [], today: '2026-11-05' }), [roadmaps[0], { projectId: 'quiet', phases: [], goals: [], free: [], claimed: [] }], { now: NOW });
  assert.deepEqual(read.plates.find(p => p.projectId === 'quiet'), { projectId: 'quiet', projectName: 'Acme Quiet', state: 'read', coverage: 'complete', counts: { 'in-flight': 0, yours: 0, 'agent-ready': 0, waiting: 0, done: 0 } });
});

test('the terminal backlog names an unread plate, never a zero', async () => {
  const { backlogText } = await import('../lib/home.mjs');
  const { snapshot, roadmaps } = backlogFixture();
  const text = backlogText({ schema: 1, generatedAt: NOW, lane: null, ...backlogOf(snapshot, roadmaps, { now: NOW }) });
  assert.match(text, /^Acme Sprockets: not read — The App cannot read acme\/sprockets\.$/m);
  assert.doesNotMatch(text, /Acme Sprockets #/);
  assert.match(text, /^In flight 1\n {2}1\. Acme Anvils #8 {2}Acme phase 8 · G1 {2}\[claude · claimed\] {2}— claim 5d left$/m);
  assert.match(text, /^ {2}\d+\. Acme Anvils #4 {2}Acme phase 4 · Unblocks 1 phase · G1 {2}— added 16 days ago$/m);
  assert.match(text, /^1 free phase waits for shaping \(not spec: 2\), so it is not agent-ready$/m);
});

// Phase 178, increment 3: both forms turn a plate's value and its claims into the backlog's input the same way.
test('a plate\'s claims are read the way plates next reads them', async () => {
  const { roadmapOf, claimFromRef, phaseOfWorkBranch, phaseRoadmap } = await import('../lib/work-items.mjs');
  const { claimMessage, phaseOfBranch } = await import('../lib/claim.mjs');
  // The claim commit as plates phase claim writes it, read back field by field.
  assert.deepEqual(claimFromRef('claims/phase-12', claimMessage({ phase: 12, provider: 'codex', machine: 'acme-mac', at: '2026-11-01T00:00:00Z', token: 't' }), '2026-11-01T00:00:00Z'),
    { phase: 12, branch: 'claims/phase-12', provider: 'codex', machine: 'acme-mac', at: '2026-11-01T00:00:00.000Z' });
  assert.equal(claimFromRef('claims/other', '', null), null);
  for (const name of ['claude/phase-54-robot', 'codex/phase-7', 'work/phase-007', 'claims/phase-3', 'main', 'feature/phases-2', 'acme_phase-9x']) assert.equal(phaseOfWorkBranch(name), phaseOfBranch(name), name);
  const phase = (id, more = {}) => ({ id, file: `${id}-acme.md`, title: `Acme ${id}`, status: 'planned', goal: 'G1', depends: [], since: '2026-10-01', spec: 2, next: 'Build.', tests: ['x'], done: 'y', ...more });
  const project = { id: 'anvils', state: 'complete', gaps: [], roadmap: phaseRoadmap([phase(1), phase(2), phase(3, { goal: 'G0' }), phase(4, { depends: [9] }), phase(9, { status: 'built', evidence: ['e'] })], [{ id: 'G0', retired: true }, { id: 'G1' }]) };
  assert.deepEqual(Object.keys(project.roadmap.phases[0]).toSorted(), ['depends', 'file', 'goal', 'id', 'next', 'since', 'spec', 'status', 'title'], 'only what the backlog reads');
  const now = '2026-11-05T12:00:00Z';
  const read = roadmapOf(project, { state: 'read', claims: [{ phase: 1, branch: 'claims/phase-1', provider: 'claude', machine: 'acme-mac', at: '2026-11-04T00:00:00.000Z' }],
    prs: [{ phase: 2, number: 7, url: 'https://github.com/acme/anvils/pull/7', branch: 'codex/phase-2-anvil', author: 'acme', at: '2026-11-03T00:00:00Z' }] }, { now });
  // Ready as nextPhase says (a retired goal's phase is not); a claim branch first, else an open PR naming the phase.
  assert.deepEqual(read.free.map(p => p.id), [4]);
  assert.deepEqual(read.claimed.map(c => [c.id, c.holder.by, c.holder.provider]), [[1, 'branch', 'claude'], [2, 'pr', 'codex']]);
  assert.deepEqual(read.claims, { read: true, prs: true });
  // Nowhere to hold a claim: everything ready is free, and says why. Claims that could not be read: the plate is not read.
  const none = roadmapOf(project, { state: 'none', why: 'no git remote here' }, { now });
  assert.deepEqual([none.free.map(p => p.id), none.claimed, none.claims], [[1, 2, 4], [], { read: false, why: 'no git remote here' }]);
  assert.deepEqual(roadmapOf(project, { state: 'unavailable', why: 'quota' }, { now }), { projectId: 'anvils', na: 'its claims could not be read: quota' });
  assert.deepEqual(roadmapOf(project, undefined, { now }).na, 'its claims could not be read: not read');
  assert.match(roadmapOf({ id: 'anvils', state: 'complete', gaps: [] }, { state: 'none' }, { now }).na, /not plates phase files/);
  assert.equal(roadmapOf({ id: 'anvils', state: 'unavailable', gaps: [{ source: 'project', reason: 'No checkout.' }] }, null, { now }).na, 'No checkout.');
});

// Phase 178: a Your part's Recommend is carried to the walk's answers and marked in every form that shows them.
test('the recommended answer is marked', async () => {
  const { questionOf } = await import('../lib/work-items.mjs');
  const walk = { id: 'anvils:phase:51:walk', projectId: 'anvils', projectName: 'Acme Anvils', kind: 'walk', itemKind: 'walk', ref: '51', phase: '51', ready: true, title: 'Retire the Acme board?',
    details: { ask: 'Retire the Acme board?', why: 'Two lists are one too many.', choices: ['Retire it', 'Keep both'], recommend: 'Retire it', then: null, takes: '1 minute' } };
  for (const can of [{ form: 'cli' }, { form: 'web', decisionWrites: true }]) {
    const answers = answersFor(walk, can);
    assert.deepEqual(answers.filter(a => a.recommended).map(a => a.label), ['Retire it'], can.form);
    assert.ok(!answers.find(a => a.label === 'Keep both').recommended);
  }
  // A recommendation that is not one of the choices marks nothing, and no recommendation marks nothing.
  assert.ok(answersFor({ ...walk, details: { ...walk.details, recommend: 'Retire' } }).every(a => !a.recommended));
  assert.ok(answersFor({ ...walk, details: { ...walk.details, recommend: null } }).every(a => !a.recommended));
  assert.deepEqual(questionOf(walk), { ask: 'Retire the Acme board?', choices: ['Retire it', 'Keep both'], recommend: 'Retire it' });
  assert.equal(questionOf({ ...walk, details: { ...walk.details, recommend: 'Retire' } }).recommend, null);
  assert.equal(questionOf({ kind: 'review', title: 'acme/anvils#7' }), null, 'no Ask, no question');
  // The review session's card says it in words, and Home's answers line too.
  const keyed = { ...walk, key: itemKey(walk), answers: answersFor(walk, { form: 'web', decisionWrites: true }) };
  const { renderReviewCard } = await import('../lib/web/review-views.mjs');
  const card = renderReviewCard({ key: keyed.key, kind: 'walk', label: 'Walk', minutes: 1, sets: [], item: keyed });
  assert.match(card, /<button type="button" class="p-lg" data-answer="choice-retire-it" data-recommended aria-keyshortcuts="1">Retire it · Recommended<\/button>/);
  assert.match(card, /<button type="button" class="p-lg p-quiet" data-answer="choice-keep-both" aria-keyshortcuts="2">Keep both<\/button>/);
  const { homeView } = await import('../lib/web/views.mjs');
  const snapshot = homeSnapshot([{ id: 'anvils', name: 'Acme Anvils', state: 'complete', gaps: [], changes: [], decisions: [], walks: [structuredClone(walk)], reviews: [], waiting: [] }], { can: { form: 'web', decisionWrites: true }, today: '2026-11-05' });
  assert.match(homeView({ workspace: { name: 'Acme' }, projects: [], csrf: 'x', sourceRevision: 'a'.repeat(40) }, { ...snapshot, cursor: 'a'.repeat(64), quota: { state: 'unknown' } }), /Answers: Retire it \(Recommended\) · Keep both/);
});

// Phase 181: presence says claimed unless an execution source says more.
test('a claim is not a running agent', async () => {
  const { EXECUTION_STATES } = await import('../lib/work-items.mjs');
  const { snapshot, roadmaps } = backlogFixture();
  const at = executions => backlogOf(snapshot, [{ ...roadmaps[0], executions }, roadmaps[1]], { now: NOW }).lanes[0].items.find(i => i.key === 'anvils:phase:8');
  // The claim alone: claimed, from the claim branch.
  assert.deepEqual([at(undefined).presence, at(undefined).presenceSource], ['claimed', 'claim branch']);
  // A session handed its brief, or an attach receipt, is not an execution: still claimed.
  assert.equal(at([{ phase: 8, state: 'handed', source: 'attach receipt' }]).presence, 'claimed');
  assert.equal(at([{ phase: 8, state: 'attached', source: 'attach receipt' }]).presence, 'claimed');
  // Only an execution source says running, and says which.
  assert.deepEqual([at([{ phase: 8, state: 'running', source: 'night journal 2026-11-05' }]).presence, at([{ phase: 8, state: 'running', source: 'night journal 2026-11-05' }]).presenceSource], ['running', 'night journal 2026-11-05']);
  assert.equal(at([{ phase: 9, state: 'running', source: 'night journal' }]).presence, 'claimed', 'another phase\'s run is not this one\'s');
  assert.deepEqual(EXECUTION_STATES, ['running', 'ready', 'integrating', 'blocked']);
});
