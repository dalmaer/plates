---
status: planned
since: 2026-11-02
goal: G6
spec: 2
depends: [158, 83, 111]
note: "Planned from the philosophy; implementation and operational proof are not claimed."
evidence: []
---

# Current candidates land through a bounded integration lane

## Done when

Ready increments reach the existing integration lane within a measured service budget or receive a durable blocked reason and next action, and only a validated current combined candidate can land.

## Scope

Extend the existing integrator and PR validation path. The current workflow
checks the PR head SHA; combined-tree validation already exists in the integrator.
Close the gap across both paths, preserve configured checks and existing review
requirements, and give ready work bounded service. Reuse validation-efficiency
phases 110–115; do not claim complete attestations or reuse they have not proved.
Non-goals: replace the integrator, weaken gates, enable auto-merge, change branch
protection or install delivery across the fleet.

Read [the Plates philosophy](../philosophy.md); preserve existing phase ownership
and evidence. Dependencies name prerequisites, not automatic acceptance of their
outstanding real-surface walks.

## Integration increments

1. First safe merge: candidate/base/tree identity and queue-bound contracts with
   tests for current behavior; no gate or publication policy change.
2. Add visible bounded admission/drain behavior to the existing lane. Retain lock
   ownership, failed interactions and recoverable receipts after interruption.
3. Validate the exact current-base merge candidate on the PR path as well as the
   integrator path; bind evidence to required check/tool/config inputs. Changed
   base/head invalidates stale proof. Roll back code/config compatibly if needed;
   never undo published effects by pretending a failed run did not happen.

## Acceptance

- [ ] Ready increments reach the existing integration lane within a measured service budget or receive a durable blocked reason and next action, and only a validated current combined candidate can land. Check: `npm run check:focused -- tests/integrate.test.mjs tests/workflows.test.mjs` with candidate and queue cases.
- [ ] Moving main, changed heads/configuration, stale proof and two changes that pass alone but fail together cannot publish an unchecked combination Check: `npm run check` with adversarial candidate/invalidation cases.
- [ ] Queue saturation, lock contention, interruption and uncertain push outcomes retain ownership and recover the original operation without starvation or blind retry Check: `npm run check` with bounded-time synthetic contention cases.
- [ ] PR and integrator paths retain required reviews, typecheck/full-gate policy and narrowly scoped validated reuse; no existing required coverage is lost Check: `npm run check` and `npm run typecheck` plus workflow diff inspection.
- [ ] The existing phase 83 two-session walk has retained evidence for the new lane, including a rejected interaction and recovery Check: ⚑ by hand: owner-authorized two-session integration rehearsal on a disposable repository.

## Your part

### Integration rehearsal

- **Ask:** Run the two-session rehearsal on the specified disposable repository.
- **Why:** It tests contention, base movement and recovery without risking production.
- **Look at:** The candidate design and exact rehearsal commands in this phase.
- **Choices:** Proceed within the prepared scope | Defer
- **Keeps it open:** Defer
- **Takes:** Determined by the prepared exercise or observation plan.
- **Then:** Proceed: run the named exercise or record the reviewed result. Defer: keep the walk open.
- **Ready when:** The design, local proof, target and required authority are ready.

## Proof

Name exact failure-injection cases before coding. Run
`npm run check:focused -- tests/integrate.test.mjs tests/workflows.test.mjs`,
`npm run check` and `npm run typecheck`. Rehearse two sessions, a base move and an
interruption on an approved disposable remote. Remote writes/resources and any
CI spend need their existing authority; do not run this walk merely to complete
the plan. Link evidence into phase 83 only for claims actually demonstrated.

## Real surfaces

- workflow shell: exercise the candidate workflow in the authorized rehearsal.
- GitHub API: read back exact candidate/landed revisions and original operation receipts after contention and interruption.

## Deliberately open

Phase 158's baseline selects maximum batch wait, service time and escalation
owner before implementation. Required-check identity and safe PR event/ref handling
need an explicit design, including untrusted fork input and base movement. No
branch-protection change is implied. Exact-head reuse remains phase 114's work.

## Next action

Use the baseline to specify queue bounds and current-candidate evidence for both PR and integrator paths before editing the workflow.
