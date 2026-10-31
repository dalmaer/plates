---
status: built
since: 2026-10-31
goal: G9
spec: 2
depends: [142]
note: "Session trials, the robot (its state marker) and the conductor (evidence front matter) carry a lesson status; health counts failures that taught nothing. Climb and cross-review attempts are not covered yet."
evidence: ["evidence/2026-10-31-lesson-status.md"]
---

# Every agent attempt says whether it taught something

## Done when

Each attempt Plates records (robot, conductor phase, climb, cross-review,
executor bake-off) ends with a lesson status, `captured` (a lesson or
proposal it links), `known` (an existing lesson applied, named), or `none`,
and the health page measures how often failures end `none`.

## Scope

- A lesson status field on Plates' existing attempt records and evidence,
  written by the agent at the end of the attempt and checked by the gate
  for failed or reworked attempts.
- A health measure: share of failed or reworked attempts with status
  `none` per week, with bounds, and the proposal it makes when out of
  bounds.
- Not in scope: automatic lesson writing (lessons stay a person's
  decision, phase G3).

## Acceptance

- [x] A failed attempt without a lesson status fails the gate; `captured` without a link fails too: `tests/lesson-status.test.mjs: "a failed attempt says what it taught"`.
- [x] The health measure counts statuses by week and flags a week where most failures taught nothing: `tests/lesson-status.test.mjs: "health measures capture"`.
- [x] Robot and conductor attempts carry a lesson status in an end-of-attempt record, checked the same way: `tests/lesson-status.test.mjs: "robot and conductor attempts say what they taught"`.

## Real surfaces

- fleet over time: the measure across a month of attempts.

## Proof

Automated: `node --test tests/lesson-status.test.mjs`; `npm run check`.
By hand: the conductor reads a month of the measure in health.

## Deliberately open

Only the session-trial writer refuses a failed attempt without a status. Robot and conductor records are checked when read: a missing or malformed status is a health finding (`failures_untaught`), not a gate failure, because the robot cannot refuse to post its own failure and `checkLessonStatuses` is not part of `npm run check`. Records from before 2026-10-31 that do not say how their attempt ended are `unknown`, never counted as failed. Climb and cross-review attempts have no end-of-attempt record yet. Reading robot states costs up to ten GitHub reads per night on a project with the robot on; past 1,000 comments in four weeks the robot is reported as a gap, not undercounted.

- **What counts as an attempt** across the different records; settled by
  listing the records first.

## Next action

Give climb and cross-review attempts the same end-of-attempt record when
they next change; decide whether `checkLessonStatuses` joins `npm run check`.
