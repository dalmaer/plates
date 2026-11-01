---
status: partial
since: 2026-11-01
goal: G4
spec: 2
depends: [35, 43]
note: "A 54-minute baseline-only night exposed an infeasible comparison; repair admission and explain outcomes before another run."
evidence: ["evidence/2026-11-01-climb-useful-work.md"]
---

# Climb admits useful measured work before spending its night

## Done when

A timed climb refuses an infeasible measurement after its first probe, retains the reason without starting a model, and admits a focused comparison under the existing budget while preserving full validation.

## Scope

Extend the existing climb measurement, night record, workflow and reporting. The October 31 run spent 3,230 seconds on five baseline samples; its 45-minute agent allocation could not fit the default twelve comparison executions at the observed pace. The provider's retained result reports four turns in 9.109 seconds, not 54 minutes of agent work. Its exact reason for stopping is unavailable.

Use measured wall duration for feasibility, including benchmarks whose output is a non-time metric. Keep the selected plan allowance authoritative. Retain a blocked reason and next action; do not present no trials as tested no improvement. A focused measurement command is separate from the unchanged full gate, test-preservation and paired-comparison requirements.

## Acceptance

- [ ] A slow first probe prevents the remaining baseline runs and model invocation, preserving an actionable receipt: `tests/climb-admission.test.mjs`.
- [ ] A feasible probe completes normal sampling; benchmark values are not treated as elapsed time; smaller planned allowances are respected: `tests/climb-admission.test.mjs`.
- [ ] Workflow and brief preserve the configured authority and distinguish baseline, agent and total duration: `tests/workflows.test.mjs`.
- [ ] The source uses a bounded focused test measurement while its full validation remains unchanged; evidence names scope and limitations: `node --import ./tests/helpers/hermetic.mjs --test tests/improve.test.mjs` and `tests/climb-guard.test.mjs`.

## Proof

Run `npm run check:focused -- tests/climb-admission.test.mjs tests/climb-execution.test.mjs tests/climb-execution-regression.test.mjs tests/workflows.test.mjs`, then `npm run check` and `npm run typecheck` on the integrated candidate. Demonstrate a regression test fails without the admission fix. No paid trial is required for local implementation proof.

## Real surfaces

- workflow shell: run 41192473018 is historical failure evidence; a future scheduled run is separate operational proof. Local synthetic tests do not establish a useful production optimization.

## Deliberately open

The provider's final explanation was not retained in the downloaded artifacts. Do not attribute its short session to a particular cause. Timing estimates are conservative admission evidence, not a guarantee of future duration or correctness. Live scheduled success and owner usefulness remain separately observable.

## Next action

Implement admission and regression proof, then review the focused benchmark and existing operating views against real source evidence.
