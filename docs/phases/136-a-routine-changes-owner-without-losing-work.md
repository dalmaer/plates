---
status: designed
since: 2026-10-30
goal: G8
spec: 2
depends: [135]
note: "Per-routine comparison, reversible single-writer cutover and explicit retirement specified; no incumbent disabled and no Switchboard state deleted."
evidence: []
---

# A routine changes owner without losing or repeating work

## Done when

An owner can move a selected routine from its incumbent executor to Plates after complete outcome/effect parity, retain recoverable original history, and reverse the transition without replaying work delivered after the snapshot.

## Scope

T8 and the [rollout/rollback contract](../specs/switchboard-consolidation.md#rollout-and-rollback).
This is the final ownership outcome, not a rename of Switchboard's adoption phase.
A coherent Plates migration retires redundant application/runtime paths only when
they are no longer needed, preserving user data and real ongoing work throughout.

Thin legacy import/command aliases protect real callers where observed; they are
not a reason to keep old concepts or a second runtime. Inventory actual callers,
choose a compatibility window and keep original records readable. “Project set”
is UI language; broad fleet identifier migration remains separate.

## Acceptance

- [ ] Comparison distinguishes required files, notification-only outcomes, held versus delivered effects and incomplete/missing evidence; zero events does not pass parity: `npm run check:focused -- tests/routine-adoption.test.mjs` (planned file).
- [ ] Cutover/drain/delta import assigns one writer generation and blocks unresolved attempts; rollback transfers reconciled post-snapshot history before restoring the old writer: `npm run check:focused -- tests/routine-adoption.test.mjs` (planned file).
- [ ] Observed legacy callers have a tested compatibility path, documented exit/JSON/marker behavior and a retirement window; no alias creates another scheduler or executor: `npm run check:focused -- tests/routine-adoption.test.mjs tests/routine-views.test.mjs` (planned files).
- [ ] Packed-package and final integrated checks pass on the selected candidate: `npm run check` and `npm run typecheck`.
- [ ] One selected routine has complete dated comparison, held-effect shadow evidence, single-writer cutover, actual effect readback and rollback rehearsal: ⚑ by hand: owner and conductor.
- [ ] The owner approves each incumbent retirement from its exact report; unsupported/missing capabilities and remaining routines stay explicit, and Switchboard decommission/deletion remains a separate decision: ⚑ by hand: owner.

## Your part

### Verify the trial and recovery

- **Ask:** Review the selected routine's observed comparison and rollback rehearsal.
- **Why:** Complete actual coverage must support ownership transfer.
- **Look at:** The comparison window, effect readback and recovery evidence.
- **Choices:** Evidence is complete | Keep observing
- **Keeps it open:** Keep observing
- **Takes:** About 10 minutes.
- **Then:** Evidence is complete: prepare the exact retirement decision. Keep observing: preserve the current executor and close the identified gaps.
- **Ready when:** Implementation checks pass and the agreed observation window contains meaningful work and complete receipts.

### Decide the incumbent retirement

- **Ask:** Decide whether Plates should become the selected routine's only executor after reviewing parity and recovery evidence.
- **Why:** Retiring active work is separate from building or importing it.
- **Look at:** The exact routine comparison, outstanding operations and rollback report.
- **Choices:** Cut over this routine | Keep observing
- **Keeps it open:** Keep observing
- **Takes:** About 10 minutes after the agreed observation window.
- **Then:** Cut over this routine: perform the reviewed single-writer transition and verify it. Keep observing: leave the current executor in place and record the next window.
- **Ready when:** Required implementation checks pass, comparison coverage is complete and no operation or effect has unresolved delivery.

## Real surfaces

- published package: Acme legacy/new CLI compatibility and rollback fixture through the installed package.
- owner's machine: approved selected executor/listener transition and independent outcome/effect readback.
- fleet over time: selected project-set routines observed for their agreed windows, with explicit gaps and per-routine owner retirement.

## Proof

Run `npm run check:focused -- tests/routine-adoption.test.mjs tests/routine-views.test.mjs`
after these planned files exist, then `npm run check` and `npm run typecheck`.
Record each live cutover's original and destination revision, definition digest,
writer generation, source coverage, active-operation reconciliation, effect
readback, approval and rollback result. A merge, successful process or import
receipt cannot check the real-use boxes.

## Deliberately open

- Health-reports already has a 2026-10-30 through 2026-11-06 source trial. Preserve
  its start, held effects and pending owner decision; do not create a third writer
  or treat notification parity as filed-report parity. Actual coverage is unverified
  here; the owner decides only after the trial's evidence is complete.
- Select first Plates cutover and later adoption order from actual read-side
  inventory. Observation windows must include meaningful work; infrequent/no-event
  routines cannot be accepted merely because a week elapsed.
- Reverse translation after new effects may be incomplete. If T8 cannot establish
  a safe legacy checkpoint, both executors remain paused for owner resolution;
  restoring an old snapshot blindly is forbidden.
- Source archive/deletion and removal of compatibility aliases need separate
  explicit decisions after usage/retention review. This phase never deletes data.

## Next action

After phase 135, build the synthetic comparison and rollback harness, then prepare a read-only candidate selection report without changing the existing health-reports trial.
