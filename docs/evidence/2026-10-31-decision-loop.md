# Evidence: phase 150 — every decision says what evidence it used, and comes back to be checked

Conductor's checks, 2026-10-31, worktree on `claude/phase-150`.

## Automated (2026-10-31)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/decision-loop.test.mjs tests/surface-budget.test.mjs tests/web-operation-coverage.test.mjs` | pass | exit 0, 19 of 19 | The three named tests, the surface budget and the reviewed parser hashes hold. |
| The same with the `observedIn` rule in `lib/decision-loop.mjs` disabled (then restored) | the outcome test fails | "an outcome needs evidence" failed; 2 pass, 1 fail | An outcome without cited evidence can't be recorded without a test failing. |
| Builder's run of 52 test files reading changed files | pass | 1,115 of 1,115 | Board, improve, selftest and night suites still pass. |
| `npm run render:check` | 0 | 0 | The managed `improve.mjs` matches its practice source. |
| `npm run check` through `plates integrate` | pass | in the integrate log | The full gate. |

## What is and is not covered

- Decision fences carry `evidence`, `expects`, `checkBy`, `door` and an
  `outcome` inline; health proposals and inbox lessons carry them in a
  `plates-check` fence in their section. Walk choices, settled Deliberately
  open items and private-inbox lessons are prose and listed as "no check".
- Due checks appear on the board (kind `check`, waits owner) with the
  evidence files and phase changes dated after the decision.
- Health: `decisions_checked_late` (worst month of three, 7-day grace, bound
  50%), with held/adjust/reverse counts in its detail.
- **Not covered yet:** the morning brief has no structured hook, so due checks
  show on the board only. An outcome is recorded by editing the record (no new
  verb); the gate reading Plates' own records enforces the rule.

Supports **partial**.

## The morning brief raises due checks (2026-10-31, later)

| Did | Expected | Observed |
| --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/decision-loop.test.mjs` | 4 pass | 4 of 4 |
| Builder mutations: the check lines removed from "Your next"; `plates morning` not passing checks | each fails | each failed |
| Conductor mutations: the brief admits broken records; the brief admits other owner items | each fails | neither failed at first; the conductor added a mixed-items check, and each then failed |
| Builder: typecheck, web pins, night release bytes, surface budget, and about 925 tests in related files | pass | exit 0 |

"Due" comes from the board's own `decisionItems`, so the board and the brief
cannot disagree. With nothing due, the brief is byte-identical to one
rendered without checks.
