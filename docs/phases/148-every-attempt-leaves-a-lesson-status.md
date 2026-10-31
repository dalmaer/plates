---
status: partial
since: 2026-10-31
goal: G9
spec: 2
depends: [142]
note: "Session-trial attempts carry a lesson status and health measures failures that taught nothing; robot, conductor, climb and cross-review need an end-of-attempt record first."
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
- [ ] Robot and conductor attempts carry a lesson status in an end-of-attempt record, checked the same way: `tests/lesson-status.test.mjs: "robot and conductor attempts say what they taught"`.

## Real surfaces

- fleet over time: the measure across a month of attempts.

## Proof

Automated: `node --test tests/lesson-status.test.mjs`; `npm run check`.
By hand: the conductor reads a month of the measure in health.

## Deliberately open

- **What counts as an attempt** across the different records; settled by
  listing the records first.

## Next action

Give the robot and the conductor an end-of-attempt record (the robot's run
receipt, the conductor's evidence front matter) that carries the status.
