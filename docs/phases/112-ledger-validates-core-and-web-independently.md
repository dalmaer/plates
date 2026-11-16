---
status: partial
since: 2026-11-16
goal: G2
spec: 2
depends: [110]
review: wait
note: "Ledger main 138ff987 passes the contract test, check:all, test:later and the hosted scope/test/later/web union; PR 162 was reviewed at its exact head. Waits on the owner's review of the evidence."
evidence: ["evidence/2026-10-23-consumer-validation-reconciliation.md", "evidence/2026-11-16-ledger-independent-validation-acceptance.md"]
---

# Ledger validates core and web independently

## Done when

Ledger core and web start independently after scope resolution with the existing stage coverage, clocks and failure propagation preserved.

## Scope

[Validation efficiency spec](../specs/validation-efficiency.md), phase 112.
Only source and existing manifest-managed consumers. No deployment or schedule.

## Acceptance

- [x] Focused negative controls prove the phase contract: `node --test cli/ci-workflows.test.ts` in Ledger.
- [x] Required consumer validation evidence is complete: `npm run check:all` plus separate `npm run test:later` in Ledger; the complete hosted `scope`/`test`/`later`/`web` union must also pass.
- [x] Exact-head review is recorded: `node bin/plates.mjs review dalmaer/ledger#<PR> --gate --json` plus inspection of pinned complete review inputs.
- [ ] ⚑ by hand: parent reviews evidence before broader rollout.

## Your part

- **Ask:** Review this stage’s evidence before changes are adopted more broadly.
- **Why:** Workflow and gate changes must preserve coverage and observed reliability.
- **Look at:** [The staged contract](../specs/validation-efficiency.md) and this phase’s evidence.
- **Choices:** Proceed with the next stage | Revise the stage
- **Takes:** About five minutes once review and checks finish.
- **Then:** A separate implementation PR advances the next stage; no production rollout is automatic.
- **Ready when:** Exact-head checks and normal review have completed.

## Real surfaces

- workflow shell: run the focused commands in Proof and inspect the required CI workflow at the exact reviewed head.

## Proof

`Run Ledger workflow contract tests and both unchanged required CI lanes on the reviewed candidate.`

When editing this source record, the source checkpoint remains `npm run check`; `npm run typecheck`. Those are not substitutes for the consumer’s commands above.
Run focused checks first; do not repeat full suites during builder iteration.

## Deliberately open

Observed speed savings remain unknown until matched trials. Later phases and
consumer adoption wait for the preceding review; no policy is weakened here.

## Next action

The owner reviews [the acceptance evidence](../evidence/2026-11-16-ledger-independent-validation-acceptance.md) and chooses: proceed with the next stage, or revise this one. No duplicate implementation PR: Ledger #162 is merged. Phase 114 must still supply complete producer/manifest/input evidence before any equivalence or reuse claim.

## Trajectory

- **2026-10-23** — PR [162](https://github.com/dalmaer/ledger/pull/162) merged to `ab69eccf029458dfee26c33822a085445705d629`; the published main [workflow](https://github.com/dalmaer/ledger/actions/runs/39892488810) succeeded. This reconciles observed implementation/merge facts, without inferring full phase acceptance, local/hosted equivalence or causal speed savings. [Evidence](../evidence/2026-10-23-consumer-validation-reconciliation.md).

- **2026-11-02** — Integration retains the historical collector profile and the 27 October coverage correction: normal-clock `check:all`, separate `test:later`, and the complete hosted job union. No historical run is promoted to current equivalence or reuse proof.

- **2026-11-16** — The acceptance proof ran on Ledger main `138ff987`, not on the 23 October merge. `check:all`'s perf and `ledge check` steps need the owner's real data, so they ran against a throwaway copy with autosync off; a fresh clone alone fails them. [Evidence](../evidence/2026-11-16-ledger-independent-validation-acceptance.md).
