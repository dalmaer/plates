---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---
# Evidence: phase 158 — Integration delays and work in progress are visible

- Date: 2026-11-04
- Phase: 158, increments 1 to 3
- Revision: 682df448 on origin/main cff35f78, and this record
- Claim being checked: a read-only measurement contract (docs/specs/integration-delays.md) and a pure reader (lib/integration-delays.mjs) that turn observations into active, branch, review, CI, integration and deploy states with age and a next action, and keep missing, skewed, unreadable, conflicting and incomplete observations as gaps, never zero.

## Automated checks

- `node --import ./tests/helpers/hermetic.mjs --test tests/integration-delays.test.mjs`: exit 0, 23 pass (conductor).
- Conductor read lib/integration-delays.mjs for side effects: no fetch, spawn, exec or file write; the tests check same input gives same output and the input is untouched.
- Builder: `npm run check:focused -- tests/integration-delays.test.mjs tests/integrate.test.mjs tests/work-items.test.mjs`, exit 0, 179 pass.
- The whole gate, `npm run check`, runs through `plates integrate` after this file is written.

## Increment 2 (07256c3e, 387039d0)

- `node --test tests/integration-observations.test.mjs tests/home-isomorphism.test.mjs`: exit 0, 19 pass (conductor), including "the CLI and the web show the same changes in flight" through real readers (a fake gh for the CLI, a fake App for the web) over one fixture.
- Sent back once: the hosted client treated every 403 as a rate limit and paused all of a user's source reads, so an App permission missing for the new reads would have degraded the whole hosted home. Now a waits read's permission 403 is a named gap ("the App cannot read repository activity: Contents read needed") and a rate-limit 403 still saves quota. `plates prove tests/integration-observations.test.mjs --fix lib/web/projects.mjs`: VERIFIED (red without the fix, green with it).
- Builder: `npm run check:focused` over 8 files, exit 0, 219 pass; `npm run typecheck` exit 0.

## Increment 3 (4fad118d)

- `node --test tests/integration-baseline.test.mjs`: exit 0, 8 pass (conductor).
- The baseline, docs/research/2026-11-04-integration-delays-baseline.md with its JSON, read only from dalmaer/plates (gh GETs, git reads) by `node scripts/integration-baseline.mjs --repo dalmaer/plates --json` (builder, exit 0, about 53 s), window 2026-10-03 to 2026-11-04 at main 1dda19ef. Conductor checked it names no other repository.
- `node bin/plates.mjs time --json` (builder, owner's checkout, read-only): exit 0; it adds the local gate's duration, and has no observation after 2026-10-17.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read-only probe of dalmaer/plates (builder, gh GETs) | the contract's sources exist | ready/<branch> refs are deleted on landing, so their time survives only in `GET /repos/{o}/{r}/activity`; ready-to-landed for phase 166 was about 10–12 min; an integrate merge's committer date ran about 10 min before its push to main; main CI about 17 min; green 3 commits behind main | the contract fits real data; not the dated baseline (increment 3) |

| `node bin/plates.mjs home --project plates --json`, read-only, scratch state (builder) | waits per change, with gaps | exit 0 in 27 s (waits about 8 s): 8 in flight (5 branch, all stale; 2 deploy; 1 review), none unknown; every source read; 9 gaps (one page of activity back to 06:31Z; 26 changes off main, 12 read); green current; no lock held; codex has 5 open increments (over) | the owner can tell the waits apart on real data; the hosted App's permissions for activity and check runs are not yet confirmed |

## Gaps and decision

- Built. Integration's median is 8.4 min (p90 16.5); main CI's weekly median grew from 0.9 to 15.2 min, and integration, the lock and the tested lag follow it; 33% of integrator runs landed nothing; change failure 9.3% with median recovery 25.6 min; 21 escapes.
- Proposed targets (advisory, not applied): CI and integration 30 min; lock, deploy 1 h; review and branch 24 h; no ready-queue limit, since the queue is nearly always empty and the wait is gate time.
- Unconfirmed: the hosted App's Contents and Checks read for the waits; a missing one shows as a named gap. Main queue time and reviewer time are not read.
- The advisory targets (24 h branch and review, 1 h CI, integration, deploy and the lock) are guesses until the baseline.
