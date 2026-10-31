# Evidence: phase 145 — every change Plates proposes says whether it can be undone

Conductor's checks, 2026-10-31, worktree on `claude/phase-145` (cut from phase 144).

## Automated (2026-10-31)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/door-class.test.mjs tests/pr-body.test.mjs tests/update.test.mjs tests/surface-budget.test.mjs tests/web-operation-coverage.test.mjs` | pass | exit 0, 49 of 49 | Every CLI verb and managed-workflow command maps to operation types with one door each; Merge danger names the class; irreversible doors wait for the owner; reviewed hashes and the surface budget hold. |
| The same with High allowed irreversible doors in `LEVEL_DOORS` (then restored) | the owner test fails | "an irreversible door waits for the owner" failed; 2 pass, 1 fail | No level can let an agent pass a one-way door without a test failing. |
| Builder's wider run (workflows, tend, climb, autonomy-hosts and 14 more files) | pass | 124 of 124 and 391 of 391; render and typecheck pass | The PR-body and update changes break nothing nearby. |
| `npm run check` through `plates integrate` | pass | in the integrate log | The full gate. |

## Decisions

- 21 operation types. Windowed: deploy, `promote --back`, schedule change and
  ruleset change, each with a stated window. Irreversible: merge, publish,
  delete, secret change, force push, comment and issue creation (the
  notification has gone), and a fleet update whose migration rewrote a
  project's own files ("migration"); a plain re-render is a reversible
  "fleet update".
- Levels: Low none, Medium reversible, High reversible and windowed; the
  level's scope from phase 144 also applies, so deploy stays refused.
- Not wired yet: the robot and shipped practice scripts can't import `lib/`;
  shell callers of `pr-body` still pass the older `door`, mapped to a class.

Supports **built**.
