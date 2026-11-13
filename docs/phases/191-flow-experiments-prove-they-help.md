---
status: planned
since: 2026-11-13
goal: G5
spec: 2
depends: [188]
note: "Toyota-inspired flow improvement; no operational speedup or rollout is claimed."
evidence: []
---

# Flow experiments prove they help

## Done when

A completed delivery experiment compares its measured outcome and costs against a current baseline and records keep, adjust or remove with provenance.

## Scope

- Reuse phase 134 quality evidence, existing lessons, and phase 162 decision review; do not create a second telemetry or approval store.
- Compare verified lead time, rework/escapes, compute cost and human minutes with coverage and sample-size caveats.
- Promote a narrowly scoped practice only after one Plates pilot; a disproven discovery experiment is a useful result, not failed delivery.

Read [the flow improvement design](../specs/delivery-flow.md) and the
[philosophy](../philosophy.md). Preserve existing checks and approval boundaries.

## Integration increments

1. First safe merge: additive read-only contracts and deterministic tests; no changed scheduling, permissions or publication behavior.
2. Wire the smallest proved increment into the existing surface, retaining compatibility and original records.
3. Capture a bounded authorized pilot before enabling any new default. Roll back presentation/code independently of records; never erase real effects.

## Acceptance

- [ ] An experiment links baseline, intervention, actual exposure, comparison window and outcome rather than inferring success from merges. Check: `npm run check:focused -- tests/agent-quality-report.test.mjs` with experiment provenance cases.
- [ ] Synthetic missing-cost, unknown-human-time and changed-workload cases cannot produce a confident improvement claim. Check: `npm run check:focused -- tests/agent-quality-report.test.mjs` with the named missing-data cases.
- [ ] A dated pilot decision records keep/adjust/remove, countermetrics, uncertainty and the smallest next experiment. Check: ⚑ by hand: owner reviews the dated experiment decision.

## Your part

- **Ask:** Review the measured experiment and choose keep, adjust or remove.
- **Why:** Fixture tests cannot decide whether the change actually helped your work.
- **Look at:** The dated pilot comparison, including missing coverage and costs.
- **Choices:** Keep | Adjust | Remove | Defer
- **Keeps it open:** Defer
- **Ready when:** The bounded pilot has source-backed before/after evidence.

## Proof

Run `npm run roadmap:check`, `npm run check` and `npm run typecheck`.
Before implementing a behavioral increment, name its exact fixture/test command
and failure-injection cases here. Planned focused proof:
`npm run check:focused -- tests/agent-quality-report.test.mjs`.
The added cases named in Acceptance are implementation targets, not existing proof.
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

Use phase 188 evidence to choose the first behavioral slice and specify its exact proof before implementation.
