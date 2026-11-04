// The integration baseline (plates phase 158, increment 3): scripts/integration-baseline.mjs's
// pure baseline() over synthetic Acme activity, runs, PRs and deploy records, on a fixed clock.
// No network: collect() (the gh reads) is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseline, intervals, concurrency, readEscapes, weekly } from '../scripts/integration-baseline.mjs';

const NOW = Date.parse('2026-11-04T18:00:00Z');
const at = m => new Date(NOW - m * 60_000).toISOString();
const sha = c => c.repeat(40);
const act = (ref, type, minutes, after = sha('0'), before = sha('0')) => ({ ref: `refs/heads/${ref}`, activity_type: type, timestamp: at(minutes), after, before });
const run = (id, minutes, ran, conclusion, head = sha('a')) => ({ id, head_sha: head, status: 'completed', conclusion, created_at: at(minutes), run_started_at: at(minutes), updated_at: at(minutes - ran) });

/** Two increments of phase 7 through ready and integrate; green and a deploy after the second; one red period on main. */
function raw(over = {}) {
  return {
    repo: 'acme/anvils', tested: 'green',
    activity: [
      act('main', 'branch_creation', 600, sha('1')),
      act('claims/phase-7', 'branch_creation', 300),
      act('claude/phase-7', 'branch_creation', 200, sha('b')),
      act('ready/claude/phase-7', 'branch_creation', 199, sha('c')),
      act('claims/integrate', 'branch_creation', 195), act('claims/integrate', 'branch_deletion', 185),
      act('main', 'push', 186, sha('d')),
      act('ready/claude/phase-7', 'branch_deletion', 185, sha('0'), sha('c')),
      act('claude/phase-7', 'push', 100, sha('e')),
      act('ready/claude/phase-7', 'branch_creation', 100, sha('f')),
      act('ready/claude/phase-7', 'force_push', 90, sha('f')), // marked again: the wait restarts
      act('claims/integrate', 'branch_creation', 80), act('claims/integrate', 'branch_deletion', 60),
      act('main', 'push', 61, sha('9')),
      act('ready/claude/phase-7', 'branch_deletion', 60, sha('0'), sha('f')),
      act('green', 'push', 40, sha('9')),
      act('ready/work/gone', 'branch_creation', 50), act('ready/work/gone', 'branch_deletion', 20), // deleted by hand, nothing landed
    ],
    mainRuns: [run(1, 186, 10, 'failure', sha('d')), run(2, 150, 10, 'failure', sha('d')), run(3, 61, 20, 'success', sha('9')), run(4, 30, 5, 'cancelled', sha('9'))],
    prRuns: [run(10, 300, 6, 'success'), run(11, 250, 4, 'failure')],
    pulls: [{ head: { ref: 'claude/phase-7' }, created_at: at(400), merged_at: at(340) }, { head: { ref: 'plates-night/2026-11-04' }, created_at: at(100), merged_at: at(99) },
      { head: { ref: 'codex/x' }, created_at: at(90), merged_at: null }],
    deploys: [{ at: at(35), commit: sha('9'), action: 'deploy', ok: false, rolledBack: true }, { at: at(15), commit: sha('9'), action: 'deploy', ok: true, rolledBack: false }],
    escapes: [{ phase: 7, date: '2026-11-04', text: 'a' }, { phase: 7, date: '2026-09-01', text: 'b' }],
    snapshot: null, gaps: [], ...over,
  };
}

test('integration is the last ready mark to the push that landed it; a ready ref deleted without a landing is unpaired, not 0', () => {
  const b = baseline(raw(), { now: NOW });
  assert.equal(b.waits.integration.n, 2);
  assert.equal(b.waits.integration.unpaired, 1, 'ready/work/gone');
  assert.deepEqual([b.waits.integration.medianMs, b.waits.integration.maxMs], [(13 + 29) / 2 * 60_000, 29 * 60_000], 'second increment from its re-mark at 90, not its first mark at 100');
  assert.equal(b.waits.lock.n, 2);
  assert.equal(b.waits.lock.maxMs, 20 * 60_000);
  assert.deepEqual(b.integrator, { lockRuns: 2, landingPushes: 2, changesLanded: 2, readyRepushes: 1, runsWithoutLanding: 0 });
});

test('to-ready is a floor; the first increment is also measured from its claim', () => {
  const b = baseline(raw(), { now: NOW });
  assert.equal(b.waits['to-ready'].floor, true);
  assert.equal(b.waits['to-ready'].n, 2);
  assert.equal(b.waits['time-to-main'].maxMs, 39 * 60_000, 'branch push at 100 → landing at 61');
  assert.equal(b.waits['claim-to-ready'].n, 1);
  assert.equal(b.waits['claim-to-ready'].medianMs, 101 * 60_000);
  assert.equal(b.waits['claim-to-main'].medianMs, 114 * 60_000);
});

test('change failure: one red period however many runs failed in it, recovery to the next green run, cancelled runs excluded', () => {
  const b = baseline(raw(), { now: NOW });
  assert.equal(b.failure.main.failedRuns, 2);
  assert.equal(b.failure.main.completedRuns, 3, 'the cancelled run is not in the denominator');
  assert.equal(b.failure.main.redPeriods, 1);
  assert.equal(b.failure.recovery.medianMs, (176 - 41) * 60_000, 'first failure completed at 176 → green at 41');
  assert.equal(b.waits['main-ci'].cancelled, 1);
  assert.ok(b.gaps.some(g => g.measure === 'main-queue'), 'runner queue time is a named gap');
});

test('tested lag, deploy wait and deploy failure come from the same pushes and records', () => {
  const b = baseline(raw(), { now: NOW });
  assert.equal(b.waits.tested.medianMs, 21 * 60_000, 'main pushed 9 at 61, green at 40');
  assert.equal(b.waits.deploy.n, 2);
  assert.equal(b.failure.deploys.failed, 1);
  assert.equal(b.failure.deploys.rolledBack, 1);
  assert.equal(b.failure.deploys.recovery.medianMs, 20 * 60_000);
  const unread = baseline(raw({ deploys: null }), { now: NOW });
  assert.equal(unread.waits.deploy, null);
  assert.ok(unread.gaps.some(g => g.measure === 'deploy'), 'unread deploy records are a gap, not zero deploys');
});

test('review by kind of branch, PR CI, escapes and work in progress keep their denominators', () => {
  const b = baseline(raw(), { now: NOW });
  assert.equal(b.waits.review.agent.medianMs, 60 * 60_000);
  assert.equal(b.waits.review.night.n, 1);
  assert.equal(b.waits.review.closedUnmerged, 1);
  assert.equal(b.waits['pr-ci'].n, 2);
  assert.equal(b.waits['pr-ci'].failed, 1);
  assert.deepEqual([b.failure.escapes.inWindow, b.failure.escapes.total], [1, 2], 'an escape before the activity window is counted in all, not in the window');
  assert.equal(b.wip.ready.peak, 1);
  assert.equal(b.wip.claims.peak, 1);
  assert.equal(b.wip.openClaims, 1);
});

test('no activity read: no window, and nothing is measured as zero', () => {
  const b = baseline(raw({ activity: [], gaps: [{ measure: 'activity', why: 'HTTP 403' }] }), { now: NOW });
  assert.equal(b.window.from, null);
  assert.equal(b.waits.integration.n, 0);
  assert.equal(b.waits.integration.medianMs, null);
  assert.equal(b.wip, null);
  assert.ok(b.gaps.some(g => g.measure === 'activity'));
});

test('the helpers: intervals, concurrency and weeks', () => {
  const { closed, open } = intervals([act('claims/phase-1', 'branch_creation', 30), act('claims/phase-2', 'branch_creation', 20), act('claims/phase-1', 'branch_deletion', 10)], 'claims/phase-');
  assert.equal(closed.length, 1); assert.equal(open.length, 1);
  assert.deepEqual(concurrency([...closed, ...open], NOW - 40 * 60_000, NOW), { peak: 2, mean: 1 });
  assert.deepEqual(weekly([{ at: Date.parse('2026-11-04T00:00:00Z'), ms: 5 }, { at: Date.parse('2026-11-02T00:00:00Z'), ms: 7 }, { at: Date.parse('2026-10-30T00:00:00Z'), ms: 1 }]),
    [{ week: '2026-10-26', n: 1, medianMs: 1 }, { week: '2026-11-02', n: 2, medianMs: 6 }]);
});

test('escapes are read from Trajectory lines that start "Escape:"', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acme-phases-'));
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '7-acme.md'), '## Trajectory\n\n- **2026-11-03** — Escape: the Acme anvil fell.\n- **2026-11-03** — A fix, not an escape.\n');
    await writeFile(join(dir, 'README.md'), '- **2026-11-03** — Escape: not a phase.\n');
    assert.deepEqual(await readEscapes(dir), [{ phase: 7, date: '2026-11-03', text: 'the Acme anvil fell.' }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
