# Evidence: phase 144 — a project's risk level is enforced by the tools

Conductor's checks, 2026-10-31, worktree on `claude/phase-144`. No ruleset was
applied and no GitHub write was made.

## Automated (2026-10-31)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/autonomy-hosts.test.mjs tests/doctor.test.mjs tests/web-operation-coverage.test.mjs tests/surface-budget.test.mjs` | pass | exit 0, 54 of 54 | Each level renders Claude, Codex and ruleset controls (Low never grants push or merge); drift is reported by doctor; the reviewed parser hash for `lib/doctor.mjs` and the surface budget hold. |
| The same with workflow drift detection in `hostDrift` disabled (then restored) | drift test fails | "drift from the level is reported" failed; 1 pass, 1 fail | A workflow that allows more than its level can't go unreported without a test failing. |
| Builder's wider run (doctor, autonomy, contracts, guide, loop, lessons, improve, workflows) | pass | 233 of 233; focused check 151 of 151 | Plates itself stays clean under its own doctor. |
| `npm run check` through `plates integrate` | pass | in the integrate log | The full gate. |

## Decisions

- Headless hosts have nobody to ask, so Low renders read-only; a Low project
  whose workflows let agents edit is reported.
- No level renders a ruleset bypass for a bot; High with merge to main relies
  on required checks rather than a per-merge approval.
- The plates robot's agent-git rule counts as contained only while Claude's
  sandbox allows no domains; adding one reopens the finding (tested).
- Rulesets are read only under doctor's existing `--github` flag; more than 30
  rulesets aren't paginated.

## Not yet walked

- ⚑ Apply the Medium ruleset preview to one fleet project and see a robot push
  refused, after the owner's yes.

Supports **partial** (walk owed).
