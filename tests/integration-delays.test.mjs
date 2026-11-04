// Where each change waits (plates phase 158, increment 1): the pure reader in
// lib/integration-delays.mjs, on synthetic Acme observations and a fixed clock.
// No git, no gh, no network. The contract is docs/specs/integration-delays.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { delays, DelaysError, TARGETS, WAITS, SOURCES } from '../lib/integration-delays.mjs';

const NOW = Date.parse('2026-11-04T18:30:00Z');
const at = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();
const H = 60;
const read = Object.fromEntries(SOURCES.map(s => [s, { state: 'read' }]));
const obs = (work, extra = {}) => ({ schema: 1, source: { repository: 'acme/anvils', revision: 'a'.repeat(40), readAt: at(0) },
  sources: { ...read, ...(extra.sources ?? {}) }, lock: null, tested: { ref: 'green', behindBy: 0 }, work, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'sources')) });
/** A branch nobody has marked ready, with no PR and nothing on main. */
const branch = (over = {}) => ({ branch: 'claude/phase-7', phase: 7, builder: 'claude', claim: { at: at(40), provider: 'claude', machine: 'acme-1' },
  firstCommitAt: at(35), headAt: at(10), ready: null, pr: null, landed: null, ...over });
const one = (w, extra) => delays(obs([w], extra), { now: NOW }).items[0];
const wait = (item, name) => item.waits.find(w => w.wait === name);
const passed = (minutesAgo, ran = 20) => [{ name: 'check', startedAt: at(minutesAgo + ran), completedAt: at(minutesAgo), conclusion: 'success' }];

test('fresh: a branch pushed to recently is active, aged from its claim', () => {
  const i = one(branch());
  assert.equal(i.state, 'active');
  assert.equal(i.since, at(40));
  assert.equal(i.ageMs, 40 * 60_000);
  assert.equal(i.stale, false);
  assert.match(i.next, /plates ready/);
  assert.deepEqual(i.gaps, []);
  assert.equal(wait(i, 'to-ready').open, true);
  assert.equal(wait(i, 'to-ready').ms, 40 * 60_000);
});

test('a branch with no push for three hours waits on its builder', () => {
  const i = one(branch({ headAt: at(3 * H), claim: { at: at(4 * H), provider: 'claude' }, firstCommitAt: at(4 * H) }));
  assert.equal(i.state, 'branch');
  assert.equal(i.since, at(3 * H));
  assert.equal(i.stale, false);
  assert.match(i.next, /no push for 3 h: plates ready claude\/phase-7/);
});

test('stale: a branch older than a working day says split, refresh onto main, or replan', () => {
  const i = one(branch({ claim: { at: at(30 * H), provider: 'claude' }, firstCommitAt: at(29 * H), headAt: at(20) }));
  assert.equal(i.state, 'active');
  assert.equal(i.stale, true);
  assert.equal(i.branchAgeMs, 30 * H * 60_000);
  assert.match(i.next, /past same-day integration: split it, refresh it onto main, or replan it/);
});

test('a ready change with the lock free says run plates integrate', () => {
  const i = one(branch({ ready: { at: at(15), status: 'ready' } }));
  assert.equal(i.state, 'integration');
  assert.equal(i.since, at(15));
  assert.equal(i.stale, false);
  assert.match(i.next, /^run plates integrate/);
  assert.equal(wait(i, 'to-ready').ms, 25 * 60_000);
  assert.equal(wait(i, 'integration').open, true);
});

test('behind a live lock a ready change waits; a lock held past its target is the owner\'s to delete, never taken', () => {
  const live = delays(obs([branch({ ready: { at: at(15), status: 'ready' } })], { lock: { at: at(10), provider: 'codex', machine: 'acme-2' } }), { now: NOW });
  assert.match(live.items[0].next, /^wait: codex on acme-2 holds claims\/integrate/);
  const old = delays(obs([branch({ ready: { at: at(2 * H), status: 'ready' } })], { lock: { at: at(90), provider: 'codex', machine: 'acme-2' } }), { now: NOW });
  assert.equal(old.items[0].stale, true);
  assert.match(old.items[0].next, /held by codex on acme-2 for 1.5 h: if that run died, the lock is the owner's to delete .* never take a live one/);
});

test('a change sent back by plates integrate is its branch\'s again, with the reason', () => {
  const i = one(branch({ ready: { at: at(50), status: 'blocked', blocked: 'fails on its own' } }));
  assert.equal(i.state, 'branch');
  assert.match(i.next, /sent back by plates integrate \(fails on its own\): fix it on claude\/phase-7, then plates ready again/);
  assert.equal(wait(i, 'integration'), undefined, 'a sent-back change is not waiting on integration');
});

test('an open PR: pending checks are CI, failed checks are the branch\'s, passed checks wait on review', () => {
  const pr = { number: 12, state: 'open', draft: false, createdAt: at(60) };
  const pending = one(branch({ pr, checks: [{ name: 'check', startedAt: at(8), completedAt: null, conclusion: null }] }));
  assert.equal(pending.state, 'ci');
  assert.equal(pending.since, at(8));
  assert.match(pending.next, /wait for PR #12's checks/);
  const failed = one(branch({ pr, checks: [{ name: 'check', startedAt: at(30), completedAt: at(5), conclusion: 'failure' }] }));
  assert.equal(failed.state, 'branch');
  assert.match(failed.next, /fix check on claude\/phase-7 \(PR #12\)/);
  const review = one(branch({ pr, checks: passed(30) }));
  assert.equal(review.state, 'review');
  assert.equal(review.since, at(60));
  assert.equal(wait(review, 'pr-ci').ms, 20 * 60_000);
  const draft = one(branch({ pr: { ...pr, draft: true }, checks: null }));
  assert.equal(draft.state, 'active', 'a draft PR is work in progress, not a review wait');
});

test('landed: main\'s checks running are CI; a red main says restore it first', () => {
  const landed = { at: at(12), sha: 'b'.repeat(40) };
  const running = one(branch({ landed, ready: undefined, mainChecks: [{ name: 'check', startedAt: at(12), completedAt: null, conclusion: null }], deployed: null }));
  assert.equal(running.state, 'ci');
  assert.equal(running.since, at(12));
  assert.match(running.next, /wait for main's checks on bbbbbbb/);
  const red = one(branch({ landed, ready: undefined, mainChecks: [{ name: 'check', startedAt: at(12), completedAt: at(2), conclusion: 'failure' }], deployed: null }));
  assert.equal(red.state, 'ci');
  assert.match(red.next, /main is red at bbbbbbb \(check\): restore it with a verified small fix or a compatible revert/);
});

test('landed and checked: deploy waits until a deploy record names it; with no deploy target it is done', () => {
  const w = branch({ landed: { at: at(60), sha: 'c'.repeat(40) }, ready: undefined, mainChecks: passed(40), deployed: null });
  const waiting = one(w);
  assert.equal(waiting.state, 'deploy');
  assert.equal(waiting.since, at(40));
  assert.equal(waiting.stale, false);
  assert.match(waiting.next, /passed main's checks and is not deployed/);
  assert.equal(wait(waiting, 'main-ci').ms, 20 * 60_000);
  assert.equal(wait(waiting, 'deploy').open, true);
  const deployed = one({ ...w, deployed: { at: at(30), ok: true } });
  assert.equal(deployed.state, 'done');
  assert.equal(wait(deployed, 'deploy').ms, 10 * 60_000);
  const none = one(w, { sources: { deploys: { state: 'not-configured' } } });
  assert.equal(none.state, 'done');
  assert.equal(wait(none, 'deploy'), undefined);
});

test('incomplete history: a landed change\'s deleted ready ref leaves to-ready and integration unknown, never 0', () => {
  const i = one(branch({ landed: { at: at(20), sha: 'c'.repeat(40) }, ready: null, mainChecks: passed(10, 10), deployed: { at: at(5), ok: true } }));
  assert.equal(i.state, 'done');
  for (const name of ['to-ready', 'integration']) {
    assert.equal(wait(i, name).ms, null, name);
    assert.match(wait(i, name).unknown, /deleted when its change lands/);
  }
  assert.ok(i.gaps.some(g => g.kind === 'history' && g.source === 'ready'));
  assert.equal(wait(i, 'time-to-main').ms, 20 * 60_000, 'claim to landing is still measured');
  assert.equal(wait(i, 'deploy').ms, 5 * 60_000);
});

test('a landed change\'s ready time recovered from repository activity measures integration', () => {
  const i = one(branch({ ready: { at: at(30), status: 'landed' }, landed: { at: at(20), sha: 'c'.repeat(40) }, mainChecks: passed(5, 15), deployed: null }));
  assert.equal(i.state, 'deploy');
  assert.equal(wait(i, 'integration').ms, 10 * 60_000);
  assert.equal(wait(i, 'to-ready').ms, 10 * 60_000);
  assert.ok(!i.gaps.some(g => g.kind === 'conflict'));
});

test('unknown: a source that was not read is unknown, never zero or free', () => {
  const noPrs = one(branch(), { sources: { prs: { state: 'unavailable', why: 'gh pr list failed' } } });
  assert.equal(noPrs.state, 'unknown');
  assert.equal(noPrs.ageMs, null);
  assert.equal(noPrs.stale, null);
  assert.match(noPrs.next, /read the open PRs for claude\/phase-7: prs not read: gh pr list failed/);
  const noReady = one(branch(), { sources: { ready: undefined } });
  assert.equal(noReady.state, 'unknown');
  assert.match(noReady.next, /ready\/claude\/phase-7/);
  assert.equal(wait(noReady, 'to-ready').ms, null);
  const noMain = one(branch(), { sources: { main: { state: 'unavailable', why: 'fetch failed' } } });
  assert.equal(noMain.state, 'unknown');
  assert.equal(wait(noMain, 'time-to-main').ms, null);
});

test('unknown: a missing or unparseable timestamp is a named gap with no age', () => {
  const missing = one(branch({ headAt: undefined }));
  assert.equal(missing.state, 'unknown');
  assert.ok(missing.gaps.some(g => g.kind === 'missing' && g.field === 'headAt'));
  const bad = one(branch({ ready: { at: 'yesterday-ish', status: 'ready' } }));
  assert.equal(bad.state, 'unknown');
  assert.equal(bad.ageMs, null);
  assert.ok(bad.gaps.some(g => g.kind === 'unreadable' && g.field === 'ready.at'));
});

test('unknown: an unreadable claim leaves work start, branch age and time-to-main unknown', () => {
  const i = one(branch({ claim: { unreadable: 'the claim commit has no At: line' } }));
  assert.equal(i.state, 'active', 'the head commit still says it is being worked on');
  assert.equal(i.since, null);
  assert.equal(i.ageMs, null);
  assert.equal(i.branchAgeMs, null);
  assert.equal(i.stale, null, 'not stale and not fresh: unknown');
  assert.equal(wait(i, 'to-ready').ms, null);
  assert.equal(wait(i, 'time-to-main').ms, null);
  assert.ok(i.gaps.some(g => g.kind === 'unreadable' && g.source === 'claims'));
});

test('unknown: a timestamp past now by more than the skew allowance is clock skew', () => {
  const i = one(branch({ ready: { at: new Date(NOW + 30 * 60_000).toISOString(), status: 'ready' } }));
  assert.equal(i.state, 'unknown');
  assert.ok(i.gaps.some(g => g.kind === 'skew' && /30 min after now/.test(g.why)));
  const within = one(branch({ headAt: new Date(NOW + 60_000).toISOString() }));
  assert.equal(within.state, 'active', 'a minute ahead is within the allowance');
});

test('conflicting: an end before its start is a conflict, not a negative wait', () => {
  const i = one(branch({ landed: { at: at(90), sha: 'd'.repeat(40) }, claim: { at: at(40), provider: 'claude' }, ready: undefined, mainChecks: passed(70), deployed: null }));
  const t = wait(i, 'time-to-main');
  assert.equal(t.ms, null);
  assert.match(t.unknown, /ends .* before it starts/);
  assert.ok(i.gaps.some(g => g.kind === 'conflict' && g.field === 'time-to-main'));
});

test('conflicting: two disagreeing observations of one branch, or ready and landed at once, are unknown', () => {
  const r = delays(obs([branch(), branch({ headAt: at(200) })]), { now: NOW });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].state, 'unknown');
  assert.match(r.items[0].next, /disagree/);
  const both = one(branch({ ready: { at: at(20), status: 'ready' }, landed: { at: at(5), sha: 'e'.repeat(40) }, mainChecks: null, deployed: null }));
  assert.equal(both.state, 'unknown');
  assert.ok(both.gaps.some(g => g.kind === 'conflict' && g.field === 'ready'));
  const same = delays(obs([branch(), branch()]), { now: NOW });
  assert.equal(same.items[0].state, 'active', 'the same observation twice is not a conflict');
});

test('a partial source does not turn absence into "has not happened"', () => {
  const i = one(branch(), { sources: { prs: { state: 'partial', why: '200 or more open PRs' } } });
  assert.equal(i.state, 'unknown');
  assert.ok(i.gaps.some(g => g.kind === 'partial' && g.source === 'prs'));
});

test('work in progress: one builder with two open increments is over; an unnamed builder is a gap, not a pass', () => {
  const r = delays(obs([branch(), branch({ branch: 'claude/phase-8', phase: 8 }), branch({ branch: 'codex/phase-9', builder: 'codex', claim: null }),
    branch({ branch: 'work/x', builder: undefined, claim: null })]), { now: NOW });
  const by = Object.fromEntries(r.wip.map(w => [w.builder, w]));
  assert.equal(by.claude.open, 2);
  assert.equal(by.claude.over, true);
  assert.match(by.claude.next, /finish review and integration of ready work before opening more/);
  assert.equal(by.codex.over, false);
  assert.equal(by.null.over, null);
  assert.deepEqual(by.null.branches, ['work/x']);
});

test('the tested ref: current is a measured 0, behind is aged from the oldest untested landing, unread is unknown', () => {
  assert.deepEqual(delays(obs([]), { now: NOW }).tested, { state: 'current', ref: 'green', behindBy: 0, lagMs: 0, since: null });
  const behind = delays(obs([], { tested: { ref: 'green', behindBy: 3, oldestUntestedAt: at(25) } }), { now: NOW }).tested;
  assert.equal(behind.state, 'behind');
  assert.equal(behind.lagMs, 25 * 60_000);
  const noTime = delays(obs([], { tested: { ref: 'green', behindBy: 3 } }), { now: NOW }).tested;
  assert.equal(noTime.lagMs, null);
  const unread = delays(obs([], { sources: { tested: { state: 'unavailable', why: 'compare failed' } } }), { now: NOW });
  assert.equal(unread.tested.state, 'unknown');
  assert.equal(unread.tested.lagMs, null);
  assert.ok(unread.gaps.some(g => g.source === 'tested'));
});

test('the summary\'s denominator is the measured waits; open and unknown are counted apart', () => {
  const r = delays(obs([
    branch({ branch: 'a', ready: { at: at(20), status: 'ready' } }),
    branch({ branch: 'b', ready: { at: at(30), status: 'ready' }, claim: { at: at(50), provider: 'claude' }, firstCommitAt: at(45) }),
    branch({ branch: 'c', claim: { unreadable: 'no At' } }),
    branch({ branch: 'd' }),
  ]), { now: NOW });
  assert.deepEqual(r.summary['to-ready'], { measured: 2, open: 1, unknown: 1, medianMs: 20 * 60_000 });
  assert.deepEqual(Object.keys(r.summary), WAITS.map(w => w.wait));
  assert.equal(r.counts.integration, 2);
});

test('the reader is pure and keeps its provenance: same input, same output, input untouched', () => {
  const input = obs([branch()]);
  const before = JSON.stringify(input);
  const a = delays(input, { now: NOW }), b = delays(input, { now: NOW });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(a.source, { repository: 'acme/anvils', revision: 'a'.repeat(40), readAt: at(0) });
  assert.equal(a.now, new Date(NOW).toISOString());
  assert.equal(a.coverage.prs.state, 'read');
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'JSON all the way down');
});

test('input that is not an observation set throws; targets override the advisory thresholds', () => {
  assert.throws(() => delays(null, { now: NOW }), DelaysError);
  assert.throws(() => delays({ schema: 2 }, { now: NOW }), DelaysError);
  assert.throws(() => delays(obs([])), DelaysError, 'the clock is the caller\'s');
  const strict = delays(obs([branch()]), { now: NOW, targets: { branch: 30 * 60_000 } });
  assert.equal(strict.items[0].stale, true);
  assert.equal(strict.targets.integration, TARGETS.integration);
  const noWork = delays({ schema: 1 }, { now: NOW });
  assert.ok(noWork.gaps.some(g => g.field === 'work'));
  assert.ok(noWork.gaps.some(g => g.field === 'source.readAt'));
  assert.equal(noWork.coverage.claims.state, 'unavailable');
});
