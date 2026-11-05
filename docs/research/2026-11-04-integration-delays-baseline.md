# Integration delays on plates: a baseline

Dated 2026-11-04. Read at 19:48:10 UTC against `dalmaer/plates` main
`1dda19ef318db25e7fb6382c8990778c0c2b7c6c`. This is phase 158, increment 3
([contract](../specs/integration-delays.md)).

The read was read-only: `gh` GETs and local file reads, with no mutation and no
spend. It covers this repository only.

The window runs from 2026-10-03T03:03:08Z to 2026-11-04T19:48:10Z. It begins
at the repository's first activity event, the creation of `main`.

The retained output is
[2026-11-04-integration-delays-baseline.json](2026-11-04-integration-delays-baseline.json).
It holds every number below, each measure's start and end events and
denominator, and the run IDs of each red period.

## Commands

```bash
node scripts/integration-baseline.mjs --repo dalmaer/plates --json   # exit 0
# in the owner's checkout (its local test ledger), at 15228c46:
node bin/plates.mjs time --json                                       # exit 0
```

The script reads these paths. Each is listed under `sources` in the JSON.

- `repos/dalmaer/plates/activity?per_page=100`, every page: 1,885 events
  (565 branch creations, 342 deletions, 632 pushes, 155 force pushes, 191 PR
  merges).
- `actions/workflows/373645386/runs`: the gate, `check.yml`, on pushes to
  main and on `pull_request`.
- `actions/workflows/406575919/runs`: `plates-publish`.
- `pulls?state=closed`.
- `contents/deploys.jsonl?ref=plates-verify`.
- `docs/phases/*.md`: Trajectory lines that start "Escape:".
- The current snapshot from `lib/integration-observations.mjs`
  `readObservations`, the same bounded reads `plates home` makes.

`baseline()` is pure and is tested in `tests/integration-baseline.test.mjs`.
Re-running the script later gives a later window. To check a number, use the
retained JSON, not a re-run.

## Waits, read 2026-11-04

All times are minutes. The first five columns are over the whole window;
"7 days" is Oct 28–Nov 4. *n* counts measured intervals only. Intervals that
are open or could not be paired are counted separately and are never 0.

| Wait (start → end) | n | median | p90 | max | 7 days: n · median · p90 |
| --- | --- | --- | --- | --- | --- |
| Integration (last ready mark → the push to main that landed it) | 82 | 8.4 | 16.5 | 44.1 | 59 · 9.2 · 20.3 |
| Integrate lock held (`claims/integrate` created → deleted) | 110 | 7.6 | 12.0 | 43.7 | 78 · 7.8 · 12.1 |
| Main CI (gate run created on a push to main → completed) | 396 | 3.1 | 10.2 | 18.6 | 53 · 13.1 · 17.0 |
| Tested lag (push to main → `green` pushed to that commit) | 9 | 16.4 | 18.5 | 19.0 | 9 · 16.4 · 18.5 |
| Deploy (`green` pushed → its deploy record) | 5 | 3.1 | 4.0 | 4.5 | all 5 on Nov 4 |
| PR CI (gate on `pull_request`, created → completed) | 456 | 5.5 | 16.6 | 6,988.6 | 82 · 15.5 · 17.7 |
| Claim → first ready mark (first increment of a claimed phase) | 42 | 24.1 | 46.2 | 10,321.8 | — |
| Claim → first landing | 42 | 41.3 | 91.7 | 10,331.9 | — |
| Push → ready mark (a floor, see below) | 82 | 0.0 | 0.5 | 42.3 | — |
| Push → landed (time to main, a floor) | 82 | 11.3 | 49.9 | 71.9 | — |

**Review** is PR created → merged. It is not time waiting on a reviewer:
review events were not read.

| Kind of PR | n | median | p90 | max |
| --- | --- | --- | --- | --- |
| Agent branches (`claude/`, `codex/`) | 126 | 32.7 | 623.4 | 15,193.1 |
| Night (`plates-night/`) | 20 | 27.7 | 1,246.2 | 1,264.5 |
| Renovate | 11 | 322.3 | 14,138.0 | 14,146.2 |
| Other | 35 | 0.2 | 1,259.0 | 1,449.7 |

Seven PRs were closed without merging.

**By week**, the median in minutes, with *n* in brackets:

| Week of | Main CI | PR CI | Integration | Lock held |
| --- | --- | --- | --- | --- |
| Sep 28 | 0.9 (62) | 0.1 (2) | — | — |
| Oct 5 | 2.3 (169) | 3.2 (148) | — | — |
| Oct 12 | 5.4 (44) | 5.2 (89) | — | — |
| Oct 19 | 7.0 (54) | 7.4 (104) | 6.6 (23) | 6.5 (32) |
| Oct 26 | 9.5 (37) | 9.0 (53) | 5.4 (27) | 5.1 (32) |
| Nov 2 | 15.2 (30) | 15.9 (60) | 10.0 (32) | 9.5 (46) |

The integration and lock columns start the week of Oct 19, when ready and
integrate came in (phase 83, Oct 17).

**The integrator.**

- 110 lock runs.
- 74 pushes to main that landed 82 changes.
- 36 runs (33%) landed nothing.
- Ready refs were pushed again 73 times. That is a re-mark or a sent-back
  rewrite; activity does not say which.

## Work in progress, read 2026-11-04

- **Ready marks:** at most 6 waited at once. The time-weighted mean is 0.03,
  so the queue is almost always empty.
- **Phase claims:** at most 15 were held at once, with a time-weighted mean of
  2.97. Ten are held now.
- **Now:** 8 changes are in flight: 5 branches, 1 review, 1 CI and 1 deploy.
  `green` is 4 commits behind main.
- **One builder is over one open increment:** codex has 5 drafts since
  Nov 2, the first 12 of 26 changes read. These are the same
  `readObservations` reads as `plates home`.

## Failure, recovery and escapes, read 2026-11-04

**Main.**

- 37 of 396 completed gate runs failed (9.3%), 3 of 53 in the last 7 days.
  All 37 concluded `failure`. The 75 cancelled runs are superseded runs and
  are excluded.
- That makes 16 red periods.
- Recovery, from a failed run's completion to the next green run's
  completion: median 25.6, p90 209.7, max 3,008.5. The max is Oct 23 22:43
  to Oct 26, run 40034624162 to run 40250719559.
- No red period is open.

**Deploys.**

- 5 records, all on Nov 4.
- 2 failed, and 1 of those rolled back. The rollback did not fail.
- Both failures are phase 177's walk, per its Trajectory:
  - 06:29, `bb01577`: Vercel refused the deploy, and production did not
    move. This is the refused `--meta` key.
  - 07:09, `80d8920`: the deliberate smoke failure (`GET /` expected 418,
    got 401), rolled back.
- Recovery to the next passing deploy (07:12, `80d8920`): 43.3 and 3.1
  minutes, median 23.2. A 40% failure rate over a first day of deliberate
  deploys is not a rate.

**Escapes.**

- 21 Trajectory lines start "Escape:", all inside the window.
- The most are in phase 35 (3), then phases 26, 64 and 177 (2 each).
- An escape is dated by its line. It is not tied to the change that let the
  defect through, so there is no escaped-defect rate per change.

## What `plates time --json` adds, read 2026-11-04

`plates time --json` reads the local test ledger. It has no GitHub
observations.

- **What it adds:** the root gate's local duration on the owner's machine:
  - week of Oct 5: median 3.0 min, 36 runs that passed and 8 that did not;
  - week of Oct 12: median 3.4 min, 6 passed and 3 did not.
- **Coverage gap:** 129 runs, 110 of them omitted as busy. The oldest is
  2026-10-10. The weeks of Oct 19, Oct 26 and Nov 2 have no observations.
- **The likely cause of the gap (an inference, not verified):** since
  ready and integrate, the full gate mostly runs in `plates integrate`'s
  temporary worktree, and that run is not the root-project gate the ledger
  attributes.
- **No load-stall evidence:** it does not hold this week's load-stall reruns
  (tests taking 150–250 s while another `npm ci` ran). Those show here only as
  lock holds up to 43.7 min and 36 runs that landed nothing.

## Gaps (unknown, never 0), read 2026-11-04

- **Activity retention.** This read reaches the repository's creation. GitHub
  documents no retention guarantee for this endpoint, and none was checked, so
  a later read may start later. The window is stated on every number.
- **Work before the first push.** `plates ready` pushes the branch as it marks
  it, so "push → ready" and "push → landed" are floors. The first increment is
  measured from its claim instead.
- **Claims with no ready-and-integrate landing:** 48 claims are unpaired.
  They are phases before Oct 17, phases landed through PRs, and work that never
  landed.
- **Runner queue time:** a run's `run_started_at` equals its `created_at` on
  the first attempt. Runner queue time needs the jobs API, which was not read.
- **Integrate's own outcomes:** `plates integrate` keeps no record. Why 36
  runs landed nothing (sent back, a lost race, a failing gate or a stall) is
  not recorded anywhere this read reaches.
- **Review time:** review events were not read. PR created → merged includes
  the author's own waiting.
- **Small samples:** deploys n = 5 (all Nov 4) and tested lag n = 9 (the
  publisher began the week of Nov 2).
- **Escape attribution:** see Escapes above.
- **Snapshot bound:** 26 changes are not on main; the snapshot read the first
  12.

## Proposed targets (advisory; nothing is changed), read 2026-11-04

The current advisory `TARGETS` are:

- branch and review: 24 h;
- CI, integration, deploy and the lock: 1 h.

Proposed:

| Target | Now | Proposed | Why |
| --- | --- | --- | --- |
| CI (PR and main) | 1 h | **30 min** | The last 7 days' p90 is 17.0 (main) and 17.7 (PR), with a main max of 18.6. At 30 min, a stuck or doubled run is flagged in about one gate time; at 1 h, a red period can be two gate times old before it is marked. |
| Integration | 1 h | **30 min** | The last 7 days' p90 is 20.3 and the max 44.1. 30 min is about 1.5× the p90, so only the stall shape is marked. |
| Integrate lock | 1 h | **1 h (keep)** | Holds reach 43.7 legitimately under load, and `MAX_ROUNDS` = 3 gates. Calling a live lock stale would invite deleting it. |
| Deploy | 1 h | **1 h (keep)** | n = 5. The tested lag (16 min) and deploy (3 min) fit well inside, and there is too little evidence to tighten it. |
| Review | 24 h | **24 h (keep)** | The agent median is 33 min and the p90 10.4 h. 24 h marks only the long tail (renovate, abandoned drafts). |
| Branch (same day) | 24 h | **24 h (keep)** | From the philosophy. Claim → first landing has median 41 min and p90 92 min; the stale branches are the 5 idle codex drafts. |
| Ready queue | none | **none** | The time-weighted mean waiting is 0.03, with a peak of 6. The wait is gate time, not queueing, so a queue limit would buy nothing now. |

The service budget to watch is the gate itself. The main CI weekly median grew
0.9 → 2.3 → 5.4 → 7.0 → 9.5 → 15.2 min, and integration, the lock and the
tested lag all follow it. The lever is the gate's duration (phases 56 and
110–111), not admission. The integrator's 33% of runs that landed nothing are
the next thing to make visible: `plates integrate` should record each run's
outcome.
