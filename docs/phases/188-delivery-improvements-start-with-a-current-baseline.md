---
status: partial
since: 2026-11-13
goal: G5
spec: 2
depends: [158]
note: "Read-only timing/coverage instrument implemented; dated refresh exposes stale integrator coverage. Constraint selection and matched operational proof remain open."
evidence: ["evidence/2026-11-13-delivery-flow.md"]
---

# Delivery improvements start with a current baseline

## Done when

A dated Plates baseline identifies the measured delivery constraint and its missing coverage before any admission limit is changed.

## Scope

- Extend existing integration summaries with additive latency distributions and explicit missing coverage, retaining raw outcomes and original receipts.
- Refresh the historical November 4 baseline from authorized read-only sources; separate run wall time, executed-gate time, queue wait and human attention. Do not sum overlapping durations.
- Choose one improvement hypothesis from measured evidence, with a countermetric and a comparison window.

Read [the flow improvement design](../specs/delivery-flow.md) and the
[philosophy](../philosophy.md). Preserve existing checks and approval boundaries.

## Integration increments

1. First safe merge: additive read-only contracts and deterministic tests; no changed scheduling, permissions or publication behavior.
2. Wire the smallest proved increment into the existing surface, retaining compatibility and original records.
3. Capture a bounded authorized pilot before enabling any new default. Roll back presentation/code independently of records; never erase real effects.

## Acceptance

- [x] Synthetic empty, invalid-duration, not-run-gate and partial-record cases preserve unknowns rather than reporting zero. Check: `npm run check:focused -- tests/integration-records.test.mjs tests/integrate-records.test.mjs`.
- [x] A dated real baseline states source revision, window, sample counts, retention/skipped records, measurement definitions and unavailable sources. Check: `gh api repos/dalmaer/plates/git/ref/heads/plates-integrations` plus dated research evidence.
- [ ] The selected experiment names the constraint, expected improvement, noise/coverage limits and rollback signal. Check: `npm run roadmap:check` plus conductor review of the source-linked experiment record.

## Proof

Run `npm run roadmap:check`, `npm run check` and `npm run typecheck`.
Before implementing a behavioral increment, name its exact fixture/test command
and failure-injection cases here. Phase 188 starts with
`npm run check:focused -- tests/integration-records.test.mjs tests/integrate-records.test.mjs`.
Real observations are read-only; new spending, remote test resources, deployment
and policy changes require their existing authority.

## Real surfaces

- GitHub API: read the authorized Plates project's original integration/CI records and retain source coverage.
- adopted project: a bounded Plates pilot, not a claim of fleet installation or activation.

## Deliberately open

Quantitative thresholds and pilot duration wait for a current baseline. Historical
November 4 findings are hypotheses, not current bottleneck evidence. Missing human
attention or compute cost remains unavailable. Existing phase 159 owns candidate
correctness; phase 162 owns morning routing; phase 134 owns quality measurement.

## Next action

Join recent main changes to integration/PR/check paths, then choose a measured constraint and matched comparison window; do not set limits from stale records.
