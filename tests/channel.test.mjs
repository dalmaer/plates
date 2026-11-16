// Phase 194, increment 1: each plate's channel, read only. lib/channel.mjs builds the lines and Here now from the
// sources plates already reads; `plates channel --json` and /channel render that one model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { run as runNode } from './helpers/run.mjs';
import { projectHarness } from './helpers/web-projects.mjs';
import { channelFor, channelInputOf, channelText, foldRoutine, KINDS, WINDOW_DAYS, FOLD, lineTime } from '../lib/channel.mjs';
import { channelView, channelSection, renderChannel } from '../lib/web/channel-views.mjs';
import { startBacklogClient } from '../lib/web/backlog-client.mjs';
import { claimMessage } from '../lib/claim.mjs';

const NOW = Date.parse('2026-11-15T18:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString(), MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const MAIN = 'a'.repeat(40);

/** One Acme plate's Home value, as both forms read it: phases with titles, changes in flight and main vs production. */
const studio = (over = {}) => ({ id: 'studio', name: 'Acme Studio', repo: 'acme/studio', state: 'complete', gaps: [],
  roadmap: { phases: [{ id: 1, title: 'Acme anvils' }, { id: 2, title: 'Acme bellows' }, { id: 3, title: 'Acme crates' }] },
  waits: { state: 'read', more: 0, items: [
    { branch: 'claude/phase-1-anvils', phase: 1, state: 'active', since: ago(50 * MIN), headAt: ago(50 * MIN), next: 'keep going' },
    { branch: 'codex/phase-2-bellows', phase: 2, state: 'ci', since: ago(30 * MIN), next: 'wait for PR #21\'s checks' },
    { branch: 'claude/tidy', phase: null, state: 'deploy', since: ago(20 * MIN), next: 'promote it' },
    { branch: 'claude/old', phase: null, state: 'done', since: ago(10 * MIN), next: 'nothing' },
  ] },
  release: { state: 'current', main: MAIN, production: { sha: MAIN, at: ago(15 * MIN), checkedAt: ago(15 * MIN), deployment: 'dpl_acme' }, ahead: 0, why: null },
  ...over });
const claims = (over = {}) => ({ state: 'read', claims: [{ phase: 1, branch: 'claims/phase-1', provider: 'claude', machine: 'acme-mac', at: ago(2 * HOUR) }],
  prs: [{ phase: 2, number: 21, url: 'https://github.com/acme/studio/pull/21', branch: 'codex/phase-2-bellows', author: 'acme-codex', at: ago(90 * MIN) }], ...over });
const prs = (over = {}) => ({ state: 'read', items: [
  { number: 21, title: 'Acme bellows', url: 'https://github.com/acme/studio/pull/21', createdAt: ago(90 * MIN), isDraft: false, author: 'acme-codex' },
  { number: 22, title: 'Acme bump', url: 'https://github.com/acme/studio/pull/22', createdAt: ago(70 * MIN), isDraft: true, author: 'renovate' },
], ...over });
const waiting = (over = {}) => ({ items: [{ kind: 'session', title: '🏠 [studio] Remote Control is waiting on you', why: 'Ship the anvils?', read: 'claude --resume acme-1', plate: 'studio', ref: 'acme-1', since: ago(5 * MIN).slice(0, 10), at: ago(5 * MIN) },
  { kind: 'session', title: '🏠 [anvils] Remote Control is waiting on you', why: 'Elsewhere?', read: 'claude --resume acme-2', plate: 'anvils', ref: 'acme-2', at: ago(4 * MIN) }], why: 'from acme-mac', ...over });
const model = ({ project = studio(), c = claims(), p = prs(), w = waiting(), since = null } = {}) => channelFor([channelInputOf(project, { claims: c, prs: p })], { now: NOW, since, waiting: w });

test('the feed is built from what plates already reads', () => {
  const m = model();
  // Time order, newest last, each line with its plate, kind, actor and link.
  assert.deepEqual(m.lines.map(l => [l.kind, l.actor]), [
    ['joined', 'studio#1'], ['joined', 'studio#2'], ['pr', 'studio#2'], ['pr', 'studio!22'], ['pushed', 'studio#1'], ['ci', 'studio#2'], ['deploy', 'studio'], ['deploy', 'studio'], ['waiting', 'studio'],
  ]);
  for (const l of m.lines) {
    assert.ok(KINDS.includes(l.kind), l.kind);
    assert.equal(l.plate, 'studio');
    assert.ok(l.ref, `${l.kind} ${l.text} has a link`);
  }
  assert.deepEqual([...m.lines].sort((a, b) => a.at.localeCompare(b.at)).map(l => l.at), m.lines.map(l => l.at), 'newest last');
  assert.deepEqual(new Set(m.lines.map(l => l.source)), new Set(['claims', 'prs', 'waits', 'deploys', 'waiting']), 'claims, PRs, CI, deploys and waiting sessions each give lines');
  const byKind = Object.groupBy(m.lines, l => l.kind);
  assert.equal(byKind.joined[0].text, 'claude claimed phase 1: Acme anvils on acme-mac');
  assert.equal(byKind.joined[0].ref, 'https://github.com/acme/studio/tree/claims/phase-1');
  assert.equal(byKind.joined[1].text, 'acme-codex joined phase 2: Acme bellows with #21', 'an open PR naming an unclaimed phase is its agent joining');
  assert.equal(byKind.pr[1].text, 'opened #22: Acme bump (draft) by renovate', 'a PR naming no phase is its own actor');
  assert.equal(byKind.ci[0].text, 'checks: wait for PR #21\'s checks');
  assert.equal(byKind.deploy.find(l => l.source === 'deploys').text, `deployed ${MAIN.slice(0, 7)} to production`);
  assert.equal(byKind.waiting[0].ref, 'claude --resume acme-1');
  assert.ok(!m.lines.some(l => l.text.includes('claude/old')), 'a change that is done is not in flight');
  assert.ok(!m.lines.some(l => l.text.includes('Elsewhere')), 'a session for a plate not shown is not on this channel');
  assert.deepEqual(m.plates, [{ projectId: 'studio', name: 'Acme Studio', state: 'read', count: m.lines.length }]);
  // The same input gives the same lines, whatever order the readers listed them in.
  const shuffled = model({ c: claims({ prs: [...claims().prs].reverse() }), p: prs({ items: [...prs().items].reverse() }), project: studio({ waits: { ...studio().waits, items: [...studio().waits.items].reverse() } }) });
  assert.deepEqual(shuffled, m);
  assert.deepEqual(model(), m);
});

test('an unread source is a gap, never quiet', () => {
  const unread = model({ c: { state: 'unavailable', why: 'the claim branches could not be read within the source bounds' }, p: { state: 'unavailable', why: 'the App has no Pull requests read' },
    project: studio({ waits: { state: 'unavailable', reason: 'Saving GitHub quota; waits are not read.' }, release: { state: 'unknown', main: MAIN, production: null, ahead: null, why: 'the deploy records could not be read whole' } }),
    w: { na: 'no device has sent waiting sessions yet (plates sessions push)' } });
  assert.deepEqual(unread.lines.map(l => [l.kind, l.source, l.text]), [
    ['gap', 'waiting', 'sessions waiting on you unread: no device has sent waiting sessions yet (plates sessions push)'],
    ['gap', 'claims', 'claims unread: the claim branches could not be read within the source bounds'],
    ['gap', 'deploys', 'deploys unread: the deploy records could not be read whole'],
    ['gap', 'prs', 'open pull requests unread: the App has no Pull requests read'],
    ['gap', 'waits', 'pushes and CI unread: Saving GitHub quota; waits are not read.'],
  ]);
  for (const source of ['claims', 'prs', 'waits', 'deploys', 'waiting']) assert.ok(unread.lines.some(l => l.kind === 'gap' && l.source === source), `${source} unread is a gap`);
  assert.ok(unread.lines.every(l => l.at === new Date(NOW).toISOString()), 'a gap is dated at the read, the newest end');
  // Sources read and empty are quiet, and say so: no gap, no line.
  const quiet = model({ c: { state: 'read', claims: [], prs: [] }, p: { state: 'read', items: [] }, project: studio({ waits: { state: 'read', items: [], more: 0 }, release: { state: 'none', main: MAIN, production: null, ahead: null, why: 'no production deploy recorded' } }), w: { items: [], why: 'from acme-mac' } });
  assert.deepEqual(quiet.lines, [], 'read and empty is quiet');
  assert.match(channelText(quiet), /^ {2}none in the window$/m);
  // A session waiting on you with no recorded time is kept, dated at this read and marked: never "no lines" while someone waits.
  const undated = model({ c: { state: 'read', claims: [], prs: [] }, p: { state: 'read', items: [] }, project: studio({ waits: { state: 'read', items: [], more: 0 }, release: { state: 'none', main: MAIN, production: null, ahead: null } }),
    w: { items: [{ kind: 'session', title: '🏠 [studio] Remote Control is waiting on you', why: 'Ship the anvils?', read: 'claude --resume acme-3', plate: 'studio', ref: 'acme-3' }], why: 'from acme-mac' }, since: ago(HOUR) });
  assert.deepEqual(undated.lines, [{ at: new Date(NOW).toISOString(), plate: 'studio', kind: 'waiting', actor: 'studio', text: '🏠 [studio] Remote Control is waiting on you (since unknown): Ship the anvils?',
    ref: 'claude --resume acme-3', source: 'waiting', phase: null, pr: null, timeUnknown: true }], 'kept inside even a narrowed window');
  assert.deepEqual([undated.hereNow, undated.hereIdle, undated.plates[0].count], [[], null, 1], 'a waiting session is a line, not an agent holding work');
  assert.doesNotMatch(channelText(undated), /none in the window/);
  assert.match(channelSection(undated), /<span class="p-badge">waiting<\/span> 🏠 \[studio\] Remote Control is waiting on you \(since unknown\)/);
  // A plate that could not be read, a source no reader returned, a practice that is off: each says so.
  const none = channelFor([channelInputOf({ id: 'anvils', name: 'Acme Anvils', repo: 'acme/anvils', state: 'unavailable', gaps: [{ source: 'project', reason: 'The App cannot read acme/anvils.' }] })], { now: NOW, waiting: null });
  assert.deepEqual(none.lines.map(l => l.text), ['sessions waiting on you unread', 'Acme Anvils was not read: The App cannot read acme/anvils.']);
  assert.deepEqual(none.plates, [{ projectId: 'anvils', name: 'Acme Anvils', state: 'not read', count: 1 }]);
  const missing = channelFor([channelInputOf(studio({ waits: { state: 'off', reason: 'The delivery practice is off on this plate.' }, release: undefined }))], { now: NOW, waiting: { items: [] } });
  assert.deepEqual(missing.lines.filter(l => l.kind === 'gap').map(l => l.text), ['claims unread: not read', 'deploys unread: the deploy records were not read', 'open pull requests unread: not read', 'pushes and CI are not read here: The delivery practice is off on this plate.']);
  // No remote is no claim, not an unread one.
  assert.ok(!model({ c: { state: 'none', why: 'no git remote here' } }).lines.some(l => l.source === 'claims'));
  // A waits read that is 'read' overall but lost a source (no Checks permission) names it; the unknown item gives no line.
  const partial = model({ project: studio({ waits: { state: 'read', more: 0, items: [{ branch: 'codex/phase-2-bellows', phase: 2, state: 'unknown', since: null, next: 'read checks' }],
    coverage: { checks: { state: 'unavailable', why: 'the App cannot read check runs: Checks read needed' }, prs: { state: 'read', why: null } },
    gaps: { count: 2, items: [{ kind: 'source', source: 'checks', why: 'checks not read: the App cannot read check runs: Checks read needed', branch: 'codex/phase-2-bellows' }, { kind: 'partial', source: 'activity', why: 'one page of repository activity' }] } } }) });
  assert.deepEqual(partial.lines.filter(l => l.source === 'waits').map(l => [l.kind, l.text]), [
    ['gap', 'activity partly read: one page of repository activity'],
    ['gap', 'checks unread: the App cannot read check runs: Checks read needed'],
  ]);
  // Every waits gap is named, whatever its kind: a branch head ahead of this clock leaves the item unknown, with a skew gap, under coverage that says read.
  const skew = model({ project: studio({ waits: { state: 'read', more: 0, coverage: { branches: { state: 'read', why: null } },
    items: [{ branch: 'claude/phase-1-anvils', phase: 1, state: 'unknown', since: null, next: 'read claude/phase-1-anvils\'s head commit: headAt is 12 min after now: clock skew' }],
    gaps: { count: 1, items: [{ kind: 'skew', source: 'branches', why: 'headAt is 12 min after now: clock skew', branch: 'claude/phase-1-anvils' }] } } }) });
  assert.deepEqual(skew.lines.filter(l => l.source === 'waits').map(l => [l.kind, l.text]), [['gap', 'branches ahead of this clock on claude/phase-1-anvils: headAt is 12 min after now: clock skew']], 'the gap names it once; the item is not named again');
  // An item the channel cannot say as a line, with no gap of its own, is named by itself: unknown, or a state this module does not know.
  const odd = model({ project: studio({ waits: { state: 'read', more: 0, items: [
    { branch: 'claude/mystery', phase: null, state: 'unknown', since: null, next: 'read the observations of claude/mystery again before acting' },
    { branch: 'claude/novel', phase: null, state: 'teleporting', since: ago(MIN), next: 'nothing known' },
    { branch: 'claude/timeless', phase: null, state: 'integration', since: null, next: 'run plates integrate' },
  ] } }) });
  assert.deepEqual(odd.lines.filter(l => l.source === 'waits').map(l => l.text), [
    'claude/mystery is unknown: read the observations of claude/mystery again before acting',
    'claude/novel is teleporting: nothing known',
    'claude/timeless is integration with no readable time: run plates integrate',
  ]);
  // A bounded read says what it left out.
  assert.ok(model({ project: studio({ waits: { ...studio().waits, more: 2 } }) }).lines.some(l => l.kind === 'gap' && l.text === '2 more changes in flight not listed: the read keeps the newest'));
});

test('here now is the agents holding work', () => {
  const m = model();
  // Most recent activity first: phase 2's CI line (30m) before phase 1's push (50m).
  assert.deepEqual(m.hereNow.map(h => [h.actor, h.title, h.provider, h.via, h.last?.kind, h.last?.age, h.unread, h.caughtUp]), [
    ['studio#2', 'Acme bellows', 'acme-codex', '#21', 'ci', '30m', 3, false],
    ['studio#1', 'Acme anvils', 'claude', 'claim', 'pushed', '50m', 2, false],
  ]);
  assert.equal(m.hereIdle, null);
  assert.equal(m.hereNow[1].words, 'Acme anvils · claude · last line 50m ago · 2 unread');
  // Unread counts lines in the last 24 hours (no read position is kept yet): an agent whose lines are older is Caught up.
  const old = model({ c: claims({ claims: [{ phase: 3, provider: 'codex', machine: null, at: ago(3 * DAY) }], prs: [] }), p: prs({ items: [] }), project: studio({ waits: { state: 'read', items: [], more: 0 } }) });
  assert.deepEqual(old.hereNow.map(h => [h.actor, h.unread, h.caughtUp, h.words]), [['studio#3', 0, true, 'Acme crates · codex · last line 3d ago · Caught up']]);
  // With no line in the window, its claim's age; ordered by that claim against the others' lines.
  const quietClaim = model({ c: claims({ claims: [...claims().claims, { phase: 3, provider: 'codex', at: ago(40 * MIN) }] }) });
  assert.deepEqual(quietClaim.hereNow.map(h => h.actor), ['studio#2', 'studio#3', 'studio#1']);
  assert.equal(quietClaim.hereNow[1].words, 'Acme crates · codex · last line 40m ago · 1 unread', 'its own joined line is its last line');
  assert.equal(old.readFrom, ago(DAY));
  // An active change's line is its last push (the branch head), not when its work began: a claim ten days old pushed ten minutes ago is here, not idle.
  const pushed = model({ c: claims({ claims: [{ phase: 3, provider: 'codex', at: ago(10 * DAY) }], prs: [] }), p: prs({ items: [] }),
    project: studio({ waits: { state: 'read', more: 0, items: [{ branch: 'codex/phase-3-crates', phase: 3, state: 'active', since: ago(10 * DAY), headAt: ago(10 * MIN), next: 'keep going' }] } }) });
  assert.deepEqual(pushed.lines.filter(l => l.kind === 'pushed').map(l => [l.at, l.text]), [[ago(10 * MIN), 'pushed codex/phase-3-crates']]);
  assert.deepEqual([pushed.hereNow.map(h => [h.actor, h.last.age, h.unread]), pushed.hereIdle], [[['studio#3', '10m', 1]], null]);
  // A branch sent back is dated honestly: its last push at the head's time, and the failure or the return at its own.
  const sentBack = model({ c: claims({ claims: [{ phase: 3, provider: 'codex', at: ago(20 * DAY) }], prs: [] }), p: prs({ items: [] }),
    project: studio({ waits: { state: 'read', more: 0, items: [
      { branch: 'codex/phase-3-crates', phase: 3, state: 'branch', since: ago(HOUR), headAt: ago(15 * DAY), next: 'fix test on codex/phase-3-crates (PR #31)' },
      { branch: 'claude/tidy', phase: null, state: 'branch', since: ago(2 * HOUR), headAt: ago(3 * DAY), next: 'sent back by plates integrate (conflicts with main): fix it on claude/tidy, then plates ready again' },
      { branch: 'claude/quiet', phase: null, state: 'branch', since: ago(5 * HOUR), next: 'no push for 5 h: plates ready claude/quiet if it is done' },
    ] } }) });
  assert.deepEqual(sentBack.lines.filter(l => l.source === 'waits').map(l => [l.at, l.kind, l.text]), [
    [ago(3 * DAY), 'pushed', 'last pushed claude/tidy'],
    [ago(5 * HOUR), 'pushed', 'last pushed claude/quiet'],
    [ago(2 * HOUR), 'pr', 'claude/tidy was sent back by plates integrate (conflicts with main): fix it on claude/tidy, then plates ready again'],
    [ago(HOUR), 'ci', 'checks failed on codex/phase-3-crates: fix test on codex/phase-3-crates (PR #31)'],
  ], 'a push fifteen days ago is not shown as an hour ago (and falls outside the window)');
  assert.deepEqual(sentBack.hereNow.map(h => [h.actor, h.last.kind, h.last.age]), [['studio#3', 'ci', '1h']], 'activity follows the same lines');
  // PR #3 naming no phase and phase 3 are two identities: the PR's lines never count as the phase's in Here now.
  const clash = model({ c: claims({ claims: [{ phase: 3, provider: 'codex', at: ago(3 * DAY) }], prs: [] }), project: studio({ waits: { state: 'read', items: [], more: 0 } }),
    p: prs({ items: [{ number: 3, title: 'Acme renovate bump', url: 'https://github.com/acme/studio/pull/3', createdAt: ago(10 * MIN), isDraft: false, author: 'renovate' }] }) });
  assert.deepEqual(clash.lines.filter(l => l.kind !== 'waiting' && l.kind !== 'deploy').map(l => [l.actor, l.phase, l.pr, l.kind]), [['studio#3', 3, null, 'joined'], ['studio!3', null, 3, 'pr']]);
  assert.deepEqual(clash.hereNow.map(h => [h.actor, h.last.kind, h.last.age, h.unread, h.caughtUp]), [['studio#3', 'joined', '3d', 0, true]]);
  // Holders with no activity past the window still hold the work: one trailing row, oldest first named, never drowning the active ones.
  const stale = model({ c: claims({ claims: [...claims().claims, { phase: 3, provider: 'codex', at: ago(10 * DAY) }, { phase: 4, provider: 'codex', at: ago(12 * DAY) }] }) });
  assert.deepEqual(stale.hereNow.map(h => h.actor), ['studio#2', 'studio#1']);
  assert.deepEqual(stale.hereIdle, { count: 2, oldest: ago(12 * DAY), actors: ['studio#3', 'studio#4'], words: '2 idle claims, oldest 12d' });
  assert.match(channelText(stale), /^ {2}2 idle claims, oldest 12d: studio#3, studio#4$/m);
  assert.match(channelView({ workspace: { name: 'Acme' }, csrf: '' }, stale), /<details data-here-idle><summary>2 idle claims, oldest 12d<\/summary><ul class="source-list"><li>studio#3<\/li><li>studio#4<\/li><\/ul><\/details>/);
  // --since narrows the feed shown, never Here now: the same sources with and without a narrow window give the same agents, activity, unread and idle fold.
  const sources = { c: claims({ claims: [...claims().claims, { phase: 3, provider: 'codex', at: ago(10 * DAY) }, { phase: 4, provider: 'codex', at: ago(12 * DAY) }] }),
    project: studio({ waits: { state: 'read', more: 0, items: [...studio().waits.items, { branch: 'codex/phase-3-crates', phase: 3, state: 'active', since: ago(10 * DAY), headAt: ago(HOUR), next: 'keep going' }] } }) };
  const whole = model(sources), narrow = model({ ...sources, since: ago(30 * MIN) });
  assert.ok(narrow.lines.length < whole.lines.length, 'the narrow window shows fewer lines');
  assert.deepEqual([narrow.hereNow, narrow.hereIdle], [whole.hereNow, whole.hereIdle]);
  assert.deepEqual(whole.hereNow.map(h => [h.actor, h.last.age, h.unread]), [['studio#2', '30m', 3], ['studio#1', '50m', 2], ['studio#3', '1h', 1]]);
  assert.deepEqual(whole.hereIdle.actors, ['studio#4']);
  // Nobody holds work, and the claims could not be read: neither is shown as an agent.
  assert.deepEqual(model({ c: { state: 'read', claims: [], prs: [] } }).hereNow, []);
  assert.deepEqual(model({ c: { state: 'unavailable', why: 'x' } }).hereNow, []);
  assert.match(channelText(m), /^Here now \(2\)\n {2}studio#2 {2}Acme bellows · acme-codex · last line 30m ago · 3 unread\n {2}studio#1 {2}Acme anvils · claude · last line 50m ago · 2 unread$/m);
});

test('routine lines fold and the window holds', () => {
  const claim = (phase, minutes) => ({ phase, provider: 'claude', machine: null, at: ago(minutes * MIN) });
  const base = { p: prs({ items: [] }), project: studio({ waits: { state: 'read', items: [], more: 0 }, release: { state: 'none', main: MAIN, production: null, ahead: null } }), w: { items: [] } };
  // Five claims within ten minutes on one plate: one line. Three: routine, but no burst.
  const burst = model({ ...base, c: claims({ claims: [claim(1, 60), claim(2, 58), claim(3, 56), claim(4, 54), claim(5, 52)], prs: [] }) });
  assert.deepEqual(burst.lines.map(l => [l.kind, l.actor, l.text, l.folded]), [['joined', 'studio', '5 agents rotated: studio#1, studio#2, studio#3, studio#4, studio#5', 5]]);
  assert.equal(burst.lines[0].at, ago(52 * MIN), 'the folded line is the run\'s last');
  assert.equal(burst.hereNow.length, 5, 'folding a line never hides an agent');
  assert.ok(burst.hereNow.every(h => h.last?.kind === 'joined' && h.unread === 1 && !h.caughtUp), 'Here now reads each agent\'s own lines, unfolded');
  const three = model({ ...base, c: claims({ claims: [claim(1, 60), claim(2, 58), claim(3, 56)], prs: [] }) });
  assert.equal(three.lines.length, FOLD.more, 'three in ten minutes stay three lines');
  const spread = model({ ...base, c: claims({ claims: [claim(1, 60), claim(2, 55), claim(3, 49), claim(4, 40)], prs: [] }) });
  assert.equal(spread.lines.length, 4, 'four spread past ten minutes do not fold');
  // A burst on another plate, or other kinds between, do not join the run.
  const lines = [0, 1, 2, 3].map(i => ({ at: ago((60 - i) * MIN), plate: i % 2 ? 'anvils' : 'studio', kind: 'joined', actor: `x#${i}`, text: `t${i}`, ref: null, source: 'claims' }));
  assert.equal(foldRoutine(lines).length, 4);
  // The window: seven days by default; --since narrows it, never widens it; a gap is never windowed out.
  const window = model({ ...base, c: claims({ claims: [claim(1, (WINDOW_DAYS + 1) * 24 * 60), claim(2, 3 * 24 * 60), claim(3, 60)], prs: [] }), p: { state: 'unavailable', why: 'x' } });
  assert.equal(window.window.from, ago(WINDOW_DAYS * DAY));
  assert.deepEqual(window.lines.map(l => l.actor), ['studio#2', 'studio#3', 'studio'], 'a line older than the window is gone; the gap stays');
  const since = model({ ...base, c: claims({ claims: [claim(2, 3 * 24 * 60), claim(3, 60)], prs: [] }), since: ago(DAY) });
  assert.deepEqual([since.window.from, since.lines.map(l => l.actor)], [ago(DAY), ['studio#3']]);
  const wider = model({ ...base, c: claims({ claims: [claim(1, (WINDOW_DAYS + 1) * 24 * 60)], prs: [] }), since: ago(30 * DAY) });
  assert.deepEqual([wider.window.from, wider.lines], [ago(WINDOW_DAYS * DAY), []], '--since past the window stops at the window');
});

// ---- one channel, two forms -------------------------------------------------
// The same sources, twice: a git checkout whose origin holds a claim and a deploy record, with a fake gh listing the open PRs
// (`plates channel --json`), and the web's fake App answering the same claims, PRs and deploy record (/channel's read).
const bin = fileURLToPath(new URL('../bin/plates.mjs', import.meta.url));
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Acme', GIT_AUTHOR_EMAIL: 'acme@example.com',
  GIT_COMMITTER_NAME: 'Acme', GIT_COMMITTER_EMAIL: 'acme@example.com', GIT_AUTHOR_DATE: '2026-10-20T12:00:00Z', GIT_COMMITTER_DATE: '2026-10-20T12:00:00Z' };
const rate = { cost: 1, remaining: 4000, resetAt: new Date(Date.now() + 3600_000).toISOString() };
const noReviews = { open: { pageInfo: { hasNextPage: false }, nodes: [] }, merged: { pageInfo: { hasNextPage: false }, nodes: [] } };

async function bothForms() {
  const h = projectHarness(), real = Date.now(), at = ms => new Date(Math.floor((real - ms) / 1000) * 1000).toISOString();
  h.source.files['.plates/plates.json'] = JSON.stringify({ name: 'Acme Studio', repo: 'acme/studio', tagline: 'Publish useful things.', practice: '0.8.32', stack: ['node'], phases: { shape: 'files' } });
  const dir = await mkdtemp(join(tmpdir(), 'plates-channel-')), root = join(dir, 'studio'), remote = join(dir, 'remote.git');
  for (const [path, content] of Object.entries(h.source.files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); }
  const git = (args, env = gitEnv) => execFileSync('git', ['-C', root, ...args], { env, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']); git(['add', '-A']); git(['commit', '-q', '-m', 'Improve the Acme experience']);
  h.source.revision = git(['rev-parse', 'HEAD']);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { env: gitEnv });
  git(['remote', 'add', 'origin', remote]); git(['push', '-q', 'origin', 'main']);
  // Claude claims phase 1 two hours ago.
  const claimedAt = at(2 * 3600_000), message = claimMessage({ phase: 1, provider: 'claude', machine: 'acme-mac', at: claimedAt, token: 'acme-token' });
  const claimSha = git(['commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', message], { ...gitEnv, GIT_COMMITTER_DATE: claimedAt, GIT_AUTHOR_DATE: claimedAt });
  git(['push', '-q', 'origin', `${claimSha}:refs/heads/claims/phase-1`]);
  const claimRefs = [{ name: 'phase-1', target: { oid: claimSha, message, committedDate: claimedAt } }];
  // Production began serving main an hour ago.
  const main = h.source.revision, deploys = `${JSON.stringify({ schema: 1, project: 'studio', commit: main, action: 'deploy', at: at(3600_000), ok: true, rolledBack: false, failed: null,
    checks: [], deployment: { id: 'dpl_acme1', url: 'https://acme.example' }, serving: { id: 'dpl_acme1', url: 'https://acme.example', commit: main } })}\n`;
  await writeFile(join(dir, 'deploys.jsonl'), deploys);
  const blob = git(['hash-object', '-w', join(dir, 'deploys.jsonl')]);
  const tree = execFileSync('git', ['-C', root, 'mktree'], { input: `100644 blob ${blob}\tdeploys.jsonl\n`, env: gitEnv, encoding: 'utf8' }).trim();
  git(['push', '-q', 'origin', `${git(['commit-tree', tree, '-m', 'deploy'])}:refs/heads/plates-verify`]);
  // Two open PRs: codex's on phase 2 (unclaimed), and a bump naming no phase.
  const PRS = [
    { number: 21, title: 'Acme bellows', url: 'https://github.com/acme/studio/pull/21', createdAt: at(90 * 60_000), isDraft: false, reviewDecision: null, autoMergeRequest: null, author: { login: 'acme-codex' }, headRefName: 'codex/phase-2-bellows', state: 'OPEN' },
    { number: 22, title: 'Acme bump', url: 'https://github.com/acme/studio/pull/22', createdAt: at(70 * 60_000), isDraft: true, reviewDecision: null, autoMergeRequest: null, author: { login: 'renovate' }, headRefName: 'renovate/bump', state: 'OPEN' },
  ];
  const answer = data => Response.json({ data: { rateLimit: rate, ...data } }, { headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } });
  const fetcher = async (url, options) => {
    if (new URL(url).pathname !== '/graphql') return h.fetcher(url, options);
    const { query, variables } = JSON.parse(options.body);
    const blobs = [...query.matchAll(/(\w+): object\(oid: "([0-9a-f]{40})"\)/g)];
    if (blobs.length) {
      const byOid = new Map(Object.values(h.source.files).map(text => [createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex'), text]));
      return answer({ repository: Object.fromEntries(blobs.map(([, alias, oid]) => { const text = byOid.get(oid); return [alias, text === undefined ? null : { oid, byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text }]; })) });
    }
    if (query.includes('object(expression:')) return answer({ repository: Object.fromEntries(Object.entries(variables).filter(([k]) => /^e\d+$/.test(k)).map(([k, e]) => [`d${k.slice(1)}`, e === 'plates-verify:deploys.jsonl' ? { isBinary: false, isTruncated: false, text: deploys } : null])) });
    if (query.includes('PlatesPending')) return answer({ repository: { pullRequests: { totalCount: PRS.length, nodes: PRS } } });
    if (query.includes('PlatesClaims')) return answer({ repository: { refs: { totalCount: claimRefs.length, nodes: claimRefs }, pullRequests: { totalCount: PRS.length, nodes: PRS } } });
    return answer(query.includes('PlatesReviewWindow') ? { repository: noReviews } : {});
  };
  const gh = join(dir, 'gh');
  await writeFile(gh, `#!${process.execPath}
const argv = process.argv.slice(2), q = (argv.find(a => a.startsWith('query=')) ?? '').slice(6);
if (argv[0] === 'api' && argv[1] === 'user') console.log('acme-owner');
else if (argv[0] === 'api' && argv[1] === 'graphql' && q.includes('PlatesReviewWindow')) console.log(JSON.stringify({ data: { rateLimit: ${JSON.stringify(rate)}, repository: ${JSON.stringify(noReviews)} } }));
else if (argv[0] === 'api' && argv[1] === 'graphql') console.log(JSON.stringify({ data: { rateLimit: ${JSON.stringify(rate)} } }));
else if (argv[0] === 'pr' && argv[1] === 'list') console.log(${JSON.stringify(JSON.stringify(PRS))});
else { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
`);
  await chmod(gh, 0o755);
  const { createHomeReader } = await import('../lib/web/home.mjs');
  const access = { ...h.access, login: 'acme-owner', pullRequestsRead: true, checksRead: false };
  const readWeb = createHomeReader(h.config, { fetcher, now: () => Date.now() });
  const cli = args => runNode(process.execPath, [bin, 'channel', ...args], { cwd: root, timeout: 120_000, env: { ...gitEnv, PLATES_GH: gh, PLATES_CACHE: join(dir, 'cache'), PLATES_STATE: join(dir, 'state'), XDG_STATE_HOME: join(dir, 'state') } });
  return { access, cli, web: async options => (await readWeb(access, 'fake-user-access-token-for-tests', { channel: true, ...options })), done: () => rm(dir, { recursive: true, force: true }) };
}

// What a reader adds about its own read, not the sources: when it read (and so the window's start and each gap's time and each age).
const readless = m => ({ ...m, generatedAt: null, window: { ...m.window, from: null }, readFrom: null,
  lines: m.lines.filter(l => l.source !== 'waiting').map(l => (l.kind === 'gap' ? { ...l, at: null } : l)),
  hereNow: m.hereNow.map(({ words, last, sinceAge, ...h }) => ({ ...h, last: last && { ...last, age: null } })), hereIdle: m.hereIdle && { ...m.hereIdle, words: null } });

test('the CLI and the web show one channel', async () => {
  const s = await bothForms();
  try {
    const run = s.cli(['--json']);
    assert.equal(run.status, 0, run.stderr);
    const cli = JSON.parse(run.stdout), web = (await s.web()).channel;
    // The fixture exercises claims, PRs and deploys, so equality is not two empty readers agreeing.
    assert.deepEqual(cli.lines.map(l => [l.kind, l.actor]), [['joined', 'studio#1'], ['joined', 'studio#2'], ['pr', 'studio#2'], ['pr', 'studio!22'], ['deploy', 'studio'], ['gap', 'studio']]);
    assert.equal(cli.lines.at(-1).text, 'pushes and CI are not read here: The delivery practice is off on this plate: ready and integrate, the tested ref and deploy records are its, so its waits are not read.');
    assert.deepEqual(readless(web), readless(cli), 'the same lines and the same Here now in both forms');
    assert.deepEqual(cli.hereNow.map(h => [h.actor, h.title, h.provider, h.unread]), [['studio#2', 'Acme phase 2', 'acme-codex', 2], ['studio#1', 'Acme phase 1', 'claude', 1]]);
    // Sessions waiting on you are each form's own source, as on Home: this machine's scan (none here) and the devices' pushes (none yet, a gap).
    assert.deepEqual(cli.lines.filter(l => l.source === 'waiting'), []);
    assert.deepEqual(web.lines.filter(l => l.source === 'waiting').map(l => [l.kind, l.plate, l.text]), [['gap', null, 'sessions waiting on you unread: no device has sent waiting sessions yet (plates sessions push)']]);
    // The page, the plate's section and the terminal each say every line and every Here now row.
    const page = channelView(s.access, web), section = channelSection(web), text = s.cli([]).stdout;
    const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    for (const l of web.lines) {
      for (const html of [page, section]) assert.ok(html.includes(`<time datetime="${l.at}">${lineTime(l.at)}</time> <strong>${esc(l.actor ?? 'all plates')}</strong> <span class="p-badge">${l.kind}</span> ${esc(l.text)}`), l.text);
    }
    // Gap lines are dated when read, and the two CLI runs can straddle a minute: match those without their time.
    const rows = text.split('\n');
    for (const l of cli.lines) {
      const tail = `  ${l.actor ?? 'all plates'}  ${l.kind}  ${l.text}`;
      assert.ok(l.kind === 'gap' || l.timeUnknown ? rows.some(r => r.endsWith(tail)) : rows.includes(`  ${lineTime(l.at)}${tail}`), l.text);
    }
    for (const h of web.hereNow) assert.ok(page.includes(`<strong>${h.actor}</strong> ${esc(h.words)}`) && section.includes(`<strong>${h.actor}</strong> ${esc(h.words)}`), h.actor);
    for (const h of cli.hereNow) assert.ok(text.split('\n').includes(`  ${h.actor}  ${h.words}`), h.actor);
    assert.match(page, /<a class="plate-chip p-card" href="\/channel" aria-current="page"><strong>All<\/strong><span>7 lines<\/span><\/a>/);
    assert.match(page, /data-channel-plate="studio" href="\/projects\/studio#channel"><strong>Acme Studio<\/strong><span>6 lines<\/span>/);
    // The plate's page carries its Channel section, from the same read; every page's footer links the channel.
    const plate = await s.web({ projectId: 'studio', backlog: true });
    const { renderHomeSnapshot } = await import('../lib/web/views.mjs');
    assert.match(renderHomeSnapshot(plate, { projectId: 'studio' }), /<section class="home-section" id="channel" aria-labelledby="channel-title" data-channel><div class="section-heading"><h2 id="channel-title">Channel<\/h2>/);
    assert.match(page, /<footer class="plates-footer" data-page-footer>[^]*<a href="\/channel">Channel<\/a>/);
    assert.doesNotMatch(/<main[^]*<\/main>/.exec(page)[0] + section, /<form|<input|<textarea|method=/i, 'read only: nothing to post');
    // One plate, by name; a plate that is not here is refused.
    const one = s.cli(['studio', '--json', '--since', '30m']);
    assert.equal(one.status, 0, one.stderr);
    assert.deepEqual(JSON.parse(one.stdout).lines.map(l => l.kind), ['gap'], '--since narrows the window');
    assert.equal(s.cli(['anvils', '--json']).status, 2);
    assert.equal(s.cli(['--since', 'yesterday-ish']).status, 2);
  } finally { await s.done(); }
});

// The page renders from Home's cache; while a plate is loading or stale, the backlog pages' client reads /api/channel and renders it again.
test('the channel page reads again while a plate is loading or stale', async () => {
  const loading = channelFor([channelInputOf({ id: 'studio', name: 'Acme Studio', repo: 'acme/studio', state: 'loading', gaps: [] })], { now: NOW, waiting: { items: [] } });
  const stale = channelFor([channelInputOf(studio({ state: 'stale' }), { claims: claims(), prs: prs() })], { now: NOW, waiting: waiting() });
  const read = model();
  assert.deepEqual([loading.plates[0].state, stale.plates[0].state, read.plates[0].state], ['loading', 'stale', 'read']);
  const html = channelView({ workspace: { name: 'Acme' }, csrf: '' }, loading);
  assert.match(html, /data-backlog-root data-view="channel" data-loading="true"/);
  assert.match(html, /<script type="module" src="\/assets\/backlog-client\.mjs"><\/script>/);
  assert.match(channelView({ workspace: { name: 'Acme' }, csrf: '' }, read), /data-loading="false"/);
  const list = { innerHTML: 'cold' }, status = { textContent: '' }, timers = [];
  const root = { dataset: { loading: 'true', view: 'channel' }, querySelector: q => (q === '[data-backlog-list]' ? list : null) };
  const document = { querySelector: q => ({ '[data-backlog-root]': root, '[data-backlog-status]': status })[q] ?? null };
  const window = { setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {} };
  const answers = [stale, read], asked = [];
  const fetch = async url => { asked.push(url); return { status: 200, json: async () => answers.shift() }; };
  const client = startBacklogClient({ document, window, fetch, renderBacklog: () => '', renderSidebar: () => '', renderChannel });
  await timers.shift()();
  assert.match(list.innerHTML, /Acme Studio<\/strong><span>9 lines · stale<\/span>/);
  await timers.shift()();
  assert.deepEqual([asked, root.dataset.loading, status.textContent, timers.length], [['/api/channel', '/api/channel'], 'false', 'Every plate is read.', 0]);
  assert.equal(list.innerHTML, renderChannel(read));
  await client.done;
});
