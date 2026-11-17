---
status: partial
since: 2026-11-16
goal: G7
spec: 1
depends: [192]
note: "Shared observation, priority and payoff decision layer built; automatic producer export and live adoption remain."
evidence: []
---

# One framework for findings and payoff

## Done when

Untangle, review, audits and measurements feed one evidence-preserving findings
contract, use one priority scorer and payoff-aware decision flow, and reuse
existing execution and verification instead of adding runners or schedules.

## Scope

Observe → decide → act → verify. Lenses stay distinct; identity, priority,
explicit duplicate links and local decisions are shared. A decision asks whether
benefit pays for cost and added complexity. Unknown payoff can lead to a bounded
experiment instead of preventing exploration. See [guide](../guide/findings.md).

## Acceptance

- [x] Audit and PR findings retain source-qualified identity and evidence; generic observations support untangle and measurement evidence: `tests/findings.test.mjs`.
- [x] Priority leaves missing factors unknown and preserves audit leverage: `tests/findings.test.mjs`.
- [x] Payoff and bounded exploration are explicit without granting execution authority: `tests/findings.test.mjs`.
- [x] Preview does not write; explicit decisions are private and idempotent; stale and conflicting choices remain visible, and exploration can conclude explicitly: `tests/findings-service.test.mjs`.
- [ ] Native untangle and deterministic measurement producers export this contract automatically.
- [ ] A real project uses the shared decision path and verifies a kept change's payoff.

## Deliberately open

No new scheduler, automatic model spend, issue creation or PR closure. Source
runners retain authority. Decision conflicts remain explicit; timestamp-based conflict
resolution and shared cross-worktree decisions wait for demonstrated need.

## Proof

Focused tests: `tests/findings.test.mjs`, `tests/findings-service.test.mjs`,
`tests/audit.test.mjs`, and the CLI registry/guide checks. No live adoption claim.

## Next action

Try one real finding through explore, keep and verification; use the result to
choose which existing producer needs native export first.
