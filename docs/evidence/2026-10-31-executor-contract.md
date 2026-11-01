# Evidence: phase 146 — what the executor trials learned stays in Plates

Conductor's checks, 2026-10-31, worktree on `claude/phase-146` from main
ccc1789a. Real surfaces: none. Sources harvested, read-only, from the stopped
unpublished branches `codex/openhands-evaluation` and `codex/gas-city-evaluation`.

## Automated (2026-10-31)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/executor-contract.test.mjs tests/surface-budget.test.mjs` | pass | exit 0, 6 of 6 | The three named tests and the surface budget hold; no verb or flag added. |
| The same after making the auto-approval check always pass (then restored) | the policy test fails | "an executor that cannot be held to policy is refused" failed; 2 pass, 1 fail | A qualification check that stops refusing is caught. |
| Builder's mutants: uncertain retried, typed refusal ignored, artifact hash unchecked, helper bytes unchecked, fence unchecked | each fails a test | each failed the expected test; a sixth (ignoring a leaked preview id) scores identically on the recorded data and is not caught | The journal and frozen-evaluator tests guard what they claim, with one named blind spot. |
| `grep` of the new files and fixtures for local paths and personal identifiers | none | none | The public repo receives no private data from the trials. |
| `npm run check` on the committed tree, through `plates integrate` | pass | in the integrate log | The full gate. |

## What changed from the phase's words

- "The frozen evaluator scores the held-out task pair on the unfixed baseline
  as the trials recorded" is met on the recorded data: the spec and prompts
  hash to the handoff pins, the helper manifest digest is rebuilt from the 59
  helper hashes, and scoring the recorded observations gives A 4/6 and B 4/7
  (twice) with every case's checks matching the trials. Running the evaluator
  live is not possible here: baseline `037e13b4` exists only on the
  unpublished branches, the evaluator imports that commit's `lib/web`, and it
  needs macOS `sandbox-exec`.
- Left out, each needing the unpublished consolidation branch or a host this
  repo does not have: funding and payer binding, actor authentication, SQLite
  storage (the journal is an atomically replaced JSON file with an exclusive
  lock), promotion into the learning records (phase 148), the workspace file
  capability, and the v3 evaluator's bytes (their pins are checked; a host
  supplies the bytes).
- The sandbox profile denies process fork (the Gas City profile allowed it);
  the trials' fork-path and timeout-descendant coverage stays unverified and
  says so in the module header.

Supports **built**.
