---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---
# Evidence: phase 158 — Integration delays and work in progress are visible

- Date: 2026-11-04
- Phase: 158, increment 1
- Revision: 682df448 on origin/main cff35f78, and this record
- Claim being checked: a read-only measurement contract (docs/specs/integration-delays.md) and a pure reader (lib/integration-delays.mjs) that turn observations into active, branch, review, CI, integration and deploy states with age and a next action, and keep missing, skewed, unreadable, conflicting and incomplete observations as gaps, never zero.

## Automated checks

- `node --import ./tests/helpers/hermetic.mjs --test tests/integration-delays.test.mjs`: exit 0, 23 pass (conductor).
- Conductor read lib/integration-delays.mjs for side effects: no fetch, spawn, exec or file write; the tests check same input gives same output and the input is untouched.
- Builder: `npm run check:focused -- tests/integration-delays.test.mjs tests/integrate.test.mjs tests/work-items.test.mjs`, exit 0, 179 pass.
- The whole gate, `npm run check`, runs through `plates integrate` after this file is written.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read-only probe of dalmaer/plates (builder, gh GETs) | the contract's sources exist | ready/<branch> refs are deleted on landing, so their time survives only in `GET /repos/{o}/{r}/activity`; ready-to-landed for phase 166 was about 10–12 min; an integrate merge's committer date ran about 10 min before its push to main; main CI about 17 min; green 3 commits behind main | the contract fits real data; not the dated baseline (increment 3) |

## Gaps and decision

- Partial: increment 1 of 3. Nothing is surfaced to the owner yet (increment 2), and no dated baseline exists (increment 3).
- The advisory targets (24 h branch and review, 1 h CI, integration, deploy and the lock) are guesses until the baseline.
