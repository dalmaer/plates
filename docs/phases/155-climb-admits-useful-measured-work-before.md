---
status: partial
since: 2026-11-01
goal: G4
spec: 2
depends: [35, 43]
note: "The five failed scheduled climbs (1–5 Nov) were one cause: the agent ran, then the night was blocked on Bash permission denials. The brief now says a denial blocks the night. Waits on the next scheduled run."
evidence: ["evidence/2026-11-01-climb-useful-work.md", "evidence/2026-11-06-climb-denials.md"]
---

# Climb admits useful measured work before spending its night

## Done when

A timed climb refuses an infeasible measurement after its first probe, retains the reason without starting a model, and admits a focused comparison under the existing budget while preserving full validation.

## Scope

Extend the existing climb measurement, night record, workflow and reporting. The October 31 run spent 3,230 seconds on five baseline samples; its 45-minute agent allocation could not fit the default twelve comparison executions at the observed pace. The provider's retained result reports four turns in 9.109 seconds, not 54 minutes of agent work. Its exact reason for stopping is unavailable.

Use measured wall duration for feasibility, including benchmarks whose output is a non-time metric. Keep the selected plan allowance authoritative. Retain a blocked reason and next action; do not present no trials as tested no improvement. A focused measurement command is separate from the unchanged full gate, test-preservation and paired-comparison requirements.

## Acceptance

- [x] A slow first probe prevents the remaining baseline runs and model invocation, preserving an actionable receipt: `tests/climb-admission.test.mjs`.
- [x] A feasible probe completes normal sampling; benchmark values are not treated as elapsed time; smaller planned allowances are respected: `tests/climb-admission.test.mjs`.
- [x] Workflow and brief preserve the configured authority and distinguish baseline, agent and total duration: `tests/workflows.test.mjs`.
- [x] The source uses a bounded focused test measurement while its full validation remains unchanged; evidence names scope and limitations: `node --import ./tests/helpers/hermetic.mjs --test tests/improve.test.mjs` and `tests/climb-guard.test.mjs`.

- [ ] Observe a real scheduled run after reviewed installation with `gh run view <run-id> --repo dalmaer/plates --log`: inspect admission, baseline/agent duration, measured attempts and any candidate; retain blocked evidence if no candidate can be evaluated.

## Proof

Run `npm run check:focused -- tests/climb-admission.test.mjs tests/climb-execution.test.mjs tests/climb-execution-regression.test.mjs tests/workflows.test.mjs`, then `npm run check` and `npm run typecheck` on the integrated candidate. Demonstrate a regression test fails without the admission fix. No paid trial is required for local implementation proof.

## Real surfaces

- workflow shell: run 41192473018 is historical failure evidence; a future scheduled run is separate operational proof. Local synthetic tests do not establish a useful production optimization.

## Deliberately open

The provider's final explanation was not retained in the downloaded artifacts. Do not attribute its short session to a particular cause. Timing estimates are conservative admission evidence, not a guarantee of future duration or correctness. Live scheduled success and owner usefulness remain separately observable.

## Next action

Observe the next scheduled climb (10:17 UTC) for 0 permission denials, a green "Did the agent run?" and a compared attempt in `tried`. If denials persist, bring the owner a reviewed classifier or allowlist change.

## Trajectory

- **2026-11-01** — The long night was baseline work, not prolonged agent execution. Budget admission now uses independent wall duration; review added durable pending receipts and unconditional finalization so interrupted probes remain visible. Local proof passes; scheduled usefulness remains open.
- **2026-11-06** Moved out of the owner's lane: observing a climb run is agent work. Every scheduled climb failed 1–5 November.
- **2026-11-06** All five failed nights (1–5 Nov) were one cause: admitted work, the agent ran, then the night was blocked on 5–10 Bash permission denials. The brief never said a denial is fatal; now it names the denied shapes. Allowlist and gate unchanged.
