# Evidence: phase 151 — the activation plan for the hosted workspace

Conductor's checks, 2026-10-31, worktree on `claude/phase-151`. Nothing
contacted Vercel, Supabase or GitHub.

## Automated (2026-10-31)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/web-activation-plan.test.mjs tests/surface-budget.test.mjs` | pass | exit 0, 12 of 12 | The 36-step plan in `docs/specs/web-activation-plan.json` covers every G7 phase with a hosted gap, orders prerequisites and migrations, gives every step a rollback and a proof, and starts with the Node 24.22.1 runtime re-check; eight in-memory drifts are each refused. |
| A stale `docs/guide/web-activation.md` (builder) | the test fails | failed | The owner's page can't drift from the plan. |
| `grep` of the plan and guide for hosted URLs, app ids and personal identifiers | none | none | The public repo holds no private instance details. |
| `npm run check` through `plates integrate` | pass | in the integrate log | The full gate. |

## Findings for the session

- Hosted proof SQL exists only for migrations 001–005; proofs for 006–014
  are written from the local PGlite proofs before the session.
- Every migration waits for the backup decision (phase 94), step 2.
- Migration 014 belongs to phase 127 (G2); it is the plan's last step so the
  migrations folder is fully accounted for.

## Not yet walked

- ⚑ The owner-attended activation session and a week of use.

Supports **partial** (walk owed).
