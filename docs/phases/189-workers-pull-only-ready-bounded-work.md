---
status: planned
since: 2026-11-13
goal: G6
spec: 2
depends: [188]
note: "Toyota-inspired flow improvement; no operational speedup or rollout is claimed."
evidence: []
---

# Workers pull only ready bounded work

## Done when

The existing conductor admits ready increments against observed downstream capacity without starting blocked work or starving independent work.

## Scope

- Extend claim/conductor admission before a builder starts, not a parallel scheduler. Phase 159 continues to own integration-lane admission/drain, current-candidate correctness and publication recovery; this phase consumes its observed capacity and blocked reasons.
- Define a ready handoff: outcome, accepted decision digest, input revision, owned paths, proof, budget, stop condition and next owner.
- Use baseline-derived advisory limits first; enforce only after comparing lead time, rework and starvation. Keep discovery separate from delivery and permit deliberate buffers.

Read [the flow improvement design](../specs/delivery-flow.md) and the
[philosophy](../philosophy.md). Preserve existing checks and approval boundaries.

## Integration increments

1. First safe merge: additive read-only contracts and deterministic tests; no changed scheduling, permissions or publication behavior.
2. Wire the smallest proved increment into the existing surface, retaining compatibility and original records.
3. Capture a bounded authorized pilot before enabling any new default. Roll back presentation/code independently of records; never erase real effects.

## Acceptance

- [ ] Synthetic blocked-dependency, stale-input, saturated-review and independent-work cases yield a concrete next action. Check: `npm run check:focused -- tests/integrate.test.mjs tests/work-items.test.mjs` with the named added cases.
- [ ] Observed service demand selects limits and fairness policy; no arbitrary global agent cap or zero-inventory target. Check: `npm run roadmap:check` plus conductor review of phase 188 observations and the selected pilot bound.
- [ ] Exact-current-candidate and uncertain-push acceptance remain in phase 159, with no duplicate authority or bypass. Check: `npm run roadmap:check` plus phase 159 acceptance review.

## Proof

Run `npm run roadmap:check`, `npm run check` and `npm run typecheck`.
Before implementing a behavioral increment, name its exact fixture/test command
and failure-injection cases here. Planned focused proof:
`npm run check:focused -- tests/integrate.test.mjs tests/work-items.test.mjs`.
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
