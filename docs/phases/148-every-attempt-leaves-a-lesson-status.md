---
status: planned
since: 2026-10-30
goal: G9
spec: 2
depends: [142]
note: "Close the learning loop: each agent attempt records whether it taught something, so capture is measured."
evidence: []
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

- [ ] A failed attempt without a lesson status fails the gate; `captured` without a link fails too: `tests/lesson-status.test.mjs: "a failed attempt says what it taught"`.
- [ ] The health measure counts statuses by week and flags a week where most failures taught nothing: `tests/lesson-status.test.mjs: "health measures capture"`.

## Real surfaces

- fleet over time: the measure across a month of attempts.

## Proof

Automated: `node --test tests/lesson-status.test.mjs`; `npm run check`.
By hand: the conductor reads a month of the measure in health.

## Deliberately open

- **What counts as an attempt** across the different records; settled by
  listing the records first.

## Next action

List the attempt records Plates keeps and where each ends.
