# Integration delays: the measurement contract

Dated 2026-11-04. Phase 158, increment 1: a read-only contract and a pure
reader, `lib/integration-delays.mjs` (`delays(observations, { now })`), tested
on synthetic Acme observations with a fixed clock
(`tests/integration-delays.test.mjs`). Nothing reads a source yet, and no
existing output changes. Increment 2 adds an opt-in read and puts the result
in the home model, the one that both `plates home` and the hosted home read.
Increment 3 records a dated baseline before anyone proposes a queue budget.

The reader answers one question for each change: is it being worked on, or
is it waiting? If it is waiting, it names what the change waits on (its branch,
review, CI, integration or deploy), since when, and what to do next. It
never deletes, releases, retries, integrates or takes a lock. A timestamp is
a proxy for an event. It cannot prove active coding time.

## The timestamp sources

| Source | Where it is | Event and its time | What makes it unknown |
| --- | --- | --- | --- |
| `claims` | `claims/phase-<n>` (lib/claim.mjs) | claimed: the claim commit's `At:` (equal to its committer date) | no claim ref read; a message with no readable `At:` (unreadable claim) |
| `branches` | the work branch | first commit (oldest commit not on main) and head commit: committer dates | not fetched; a rebase rewrites both, so they are a lower bound on work, not proof of it |
| `ready` | `ready/<branch>` (lib/integrate.mjs) | marked ready: `At:`; `Status: blocked` with `Blocked:` when sent back (the original `At:` is kept) | **deleted when the change lands**: after landing, the ref no longer says when the change was ready |
| `lock` | `claims/integrate` | lock taken: `At:`; released: the ref is deleted | not read |
| activity | `GET /repos/{o}/{r}/activity` | each ref's creation, push and deletion with a server `timestamp`, including refs since deleted | paged and retention-bounded: a window it did not reach is partial, not empty |
| `prs` | `gh pr list` / `GET /pulls` | `createdAt`, `draft`, reviews' `submitted_at`, `mergedAt`/`closedAt` | `gh` failed, or the limit was reached (partial) |
| `checks` | `GET /commits/{sha}/check-runs` | each run's `started_at`, `completed_at`, `conclusion` | not read; a completed run with no conclusion |
| `main` | the default branch, plus activity for main | landed: when main was **pushed** to include the change | not fetched |
| `tested` | delivery's `tested` ref, default `green` | `compare/<tested>...<main>`: `ahead_by`, and the landing time of the oldest untested commit | not configured; compare failed |
| `deploys` | `deploys.jsonl` on the verify branch (phase 177) | deployed: the record's `at`, `commit`, `ok` | not configured; unreadable line |

`plates integrate` keeps no record of its own beyond its exit and stdout. Its
history is the activity on `ready/<branch>`, `claims/integrate` and main.

An integrate merge commit's committer date is the time the merge was made,
before the gate ran. It is not the landing time: on 2026-11-04 `cff35f7` was
committed at 18:13:08Z and pushed to main at 18:23:21Z. Measure landing from
the push to main, the activity `push` on `refs/heads/main`. For a merged PR
whose push activity is out of reach, `mergedAt` stands in.

## The waits

The table lists each wait's start event, its end event and its denominator.
A wait is **measured** when both events are known and the end is not before
the start. It is **open** when its start is known and its end has not
happened yet; its age then counts up to `now`. Otherwise it is **unknown**.
For every wait, the denominator is the measured waits only. Open and unknown
waits are counted separately and are never averaged in as zero.

| Wait | Start | End | Unknown when |
| --- | --- | --- | --- |
| `to-ready` | work started: the earlier of claim and first commit | marked ready | either start candidate unknown; landed with the ready ref gone (history) |
| `pr-ci` | first PR head check started | last PR head check completed | checks unread or incomplete |
| `review` | PR ready for review (`readyAt`, else `createdAt` when not a draft) | PR merged or closed | PRs unread or partial |
| `integration` | marked ready (`ready`, or `landed` when the ready time is recovered from activity) | landed on main | the ready ref is gone and activity did not recover its creation |
| `main-ci` | landed on main | main's checks for the landing commit completed | checks unread |
| `deploy` | main's checks passed | a deploy record that passed and names it | deploys unread |
| `time-to-main` | work started | landed on main | either end unknown |

If any start candidate is unknown, work start is unknown. The reader does not
take the earliest of the candidates it can read, because the one it cannot
read may be earlier. A change that was sent back is not waiting on
integration; its branch owns it again.

## States and next actions

The reader checks each change in this order, and the first rule that holds
gives the state:

1. Its observations disagree: two different readings of one branch, or a
   change both marked ready and on main. The state is **unknown**, and the
   next action is to read them again.
2. It is on main:
   - main's checks are running or missing: **ci**;
   - main's checks failed: **ci**, and main is red, so restore it with a
     verified small fix or a compatible revert;
   - main's checks passed and no deploy record names the change: **deploy**
     (the tested ref and `plates promote` remain the owner's or the owner's grant);
   - deployed, or no deploy target is configured: **done**.
3. Marked ready: **integration**. The next action is `plates integrate`
   when no integrator holds the lock, and a wait when a live one holds it.
   A lock held past its target is the owner's to delete; the reader never
   takes or deletes a lock.
4. Marked blocked: **branch**, with the integrator's reason.
5. Open non-draft PR: running checks are **ci**, failed checks are
   **branch**, otherwise **review**.
6. A head commit within `ACTIVE_MS` (2 h) of now is **active**. An older
   one is **branch**, waiting on its builder.

If the state depends on an unknown, the state is **unknown**, and the next
action names the read that would settle it.

## Gaps

Each gap is `{ kind, field, source, why }`, and the wait it affects has
`ms: null`.

- `source`: the source was not read.
- `partial`: incomplete coverage, so a missing value is not counted as absent.
- `missing`: the field was not observed.
- `unreadable`: not a timestamp, a claim with no readable `At:`, or a check
  with no conclusion.
- `skew`: the time is more than `SKEW_MS` (5 min) after `now`.
- `conflict`: an end before its start, or observations that disagree.
- `history`: a ready ref deleted on landing.

In an observation, `null` means the source was read and the event has not
happened. A missing value means the event was not observed. A source with no
coverage entry counts as unavailable. Coverage values are `read`, `partial`,
`not-configured` and `unavailable`.

## Advisory targets

The thresholds are `TARGETS`; a caller may override them. Past its
threshold, an item is marked `stale`. Nothing enforces a threshold.

- Branches, active or idle, are aged from work start. Past 24 h they are
  past same-day integration, and the next action is to split, refresh onto
  main, or replan.
- Review: 24 h.
- CI, integration, deploy and the integrate lock: 1 h each.

These numbers are guesses until increment 3's baseline.

Work in progress is one active increment per builder: a builder with more
than one `active` or `branch` change is `over`. A change with no named builder
is a gap (`over: null`), not a pass.

## Contract check against plates (read-only, 2026-11-04)

This was read once with `gh` GETs against dalmaer/plates, to check that the
real data fits the contract. It is not the baseline and not evidence of
waits.

The reads were:

- `gh api repos/dalmaer/plates/activity?ref=refs/heads/ready/claude/phase-166`
- the same read for `refs/heads/claims/integrate` and `refs/heads/green`
- `gh api repos/dalmaer/plates/compare/green...main`
- `gh api repos/dalmaer/plates/actions/runs?branch=main`
- `gh api repos/dalmaer/plates/commits/<sha>/check-runs`
- `gh pr list -R dalmaer/plates`
- `deploys.jsonl` on `plates-verify`

What they showed:

- The activity API recovers the history that the ref deletions remove. On
  phase 166 it gave three ready-to-landed pairs, ready-ref creation to
  deletion: 17:24:31 to 17:34:23, 17:50:30 to 18:02:28 and 18:13:03 to
  18:23:23.
- It gave matching `claims/integrate` windows of 10 to 12 minutes.
- Main CI on `1f466d4` ran from 18:02:32 to 18:19:29, about 17 minutes.
- Green moved to `1f466d4` at 18:19:59, and the deploy record is dated
  18:23:05.
- `green` was 3 behind main.
- The verify branch held `deploys.jsonl` and no `verify.json`.
- Activity paging and retention bound how far back this reaches: that is a
  coverage gap, to be stated with the window in increment 3.
