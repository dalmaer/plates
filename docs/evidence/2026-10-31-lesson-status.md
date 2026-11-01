# Evidence: phase 148 — every agent attempt says whether it taught something

Conductor's checks, 2026-10-31, worktree on `claude/phase-148`.

## Automated (2026-10-31)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/lesson-status.test.mjs tests/session-trials.test.mjs tests/surface-budget.test.mjs` | pass | exit 0, 36 of 36 | Both named tests hold; session trials still pass with the new rule; no verb added. |
| The same with the writer's attempt check in `lib/session-trials.mjs` disabled (then restored) | the first test fails | "a failed attempt says what it taught" failed; 1 pass, 1 fail | A failed attempt without a status can't be written without a test failing. |
| Builder's run of every test reading a changed file | pass | exit 0, 1,171 tests, 1,166 pass, 5 skipped | The measure and renders break nothing nearby. |
| `npm run render:check` | 0 | 0 | The managed `improve.mjs` matches its practice source. |
| `npm run check` through `plates integrate` | pass | in the integrate log | The full gate. |

## What is and is not covered

- Session-trial `finish` records carry `lessonStatus`; a new failed or
  reworked finish without one is refused before anything is written, from
  2026-10-30 on, so older ledgers replay unchanged.
- The health measure `failures_untaught` (bound 50%) reads the worst ISO week
  of the last four, plates-side only.
- **Not covered yet:** robot (PR comments only), conductor (evidence prose),
  climb (one night's `night.json`), cross-review (PR comments) and the sealed
  evaluation records (a field would need a migration). They have no record
  the agent writes at the end of an attempt, so they can't carry a status
  until one exists. Plates has no session-trial records today, so the measure
  reads n/a.

Supports **partial**.

## Robot and conductor records (2026-10-31, later)

| Did | Expected | Observed |
| --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/lesson-status.test.mjs` | 3 pass | 3 of 3 (conductor run) |
| Builder mutations: the robot state's `lessonStatus` dropped; the attempt check replaced with null | the box's test fails | each failed |
| Conductor mutation: evidence-file attempts ignored | the box's test fails | failed 1 of 3, restored clean |
| Builder: typecheck, render check, and about 960 tests across robot, climb, improve, practices, update and night files | pass | exit 0 |

The robot's state marker carries `verified`, `rework` and the `lessonStatus`
from the agent's final `Lesson status:` line (JSON-escaped so it cannot close
the marker); an evidence file may open with `attempt: {...}` front matter.
Both are read by `lib/lesson-status.mjs` and counted by `failures_untaught`.
