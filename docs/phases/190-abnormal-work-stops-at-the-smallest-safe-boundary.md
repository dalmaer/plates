---
status: planned
since: 2026-11-13
goal: G6
spec: 2
depends: [188]
note: "Toyota-inspired flow improvement; no operational speedup or rollout is claimed."
evidence: []
---

# Abnormal work stops at the smallest safe boundary

## Done when

An abnormal integration or verification result pauses its dependent work with an owner and recovery proof while unrelated authorized work continues.

## Scope

- Extend existing verification, integration receipts and decision records with scoped stop reasons; reuse phase 159 for interrupted publication.
- Specify triggers for failed evidence, stale revisions, unclear authorization and uncertain external outcomes; avoid treating ordinary experiment rejection as an incident.
- Resume only after observing the original operation and checking current inputs; retain history rather than clearing uncertain intent.

Read [the flow improvement design](../specs/delivery-flow.md) and the
[philosophy](../philosophy.md). Preserve existing checks and approval boundaries.

## Integration increments

1. First safe merge: additive read-only contracts and deterministic tests; no changed scheduling, permissions or publication behavior.
2. Wire the smallest proved increment into the existing surface, retaining compatibility and original records.
3. Capture a bounded authorized pilot before enabling any new default. Roll back presentation/code independently of records; never erase real effects.

## Acceptance

- [ ] Failure-injection projects existing receipt outputs for stale proof, failed interaction, uncertain push and permission refusal into scoped stops without blind retry. Phase 159 owns dispatch/recovery correctness; this phase owns stop visibility and independent-work continuation. Check: `npm run check:focused -- tests/integrate.test.mjs tests/integrate-records.test.mjs` with the named added cases.
- [ ] Each stop records affected scope, source revision, owner, next safe action and evidence needed to resume. Check: `npm run check:focused -- tests/integrate-records.test.mjs` with scoped-stop cases.
- [ ] Independent work continues; repeated failures escalate once to the appropriate owner without alert storms. Check: `npm run check:focused -- tests/integrate.test.mjs` with independent-lane and escalation cases.

## Proof

Run `npm run roadmap:check`, `npm run check` and `npm run typecheck`.
Before implementing a behavioral increment, name its exact fixture/test command
and failure-injection cases here. Planned focused proof:
`npm run check:focused -- tests/integrate.test.mjs tests/integrate-records.test.mjs`.
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
