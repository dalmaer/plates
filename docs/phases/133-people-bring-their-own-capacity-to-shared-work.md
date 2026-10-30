---
status: designed
since: 2026-10-30
goal: G8
spec: 2
depends: [132, 103, 106]
note: "Person, plate and set ownership/visibility and funding contracts specified. Current owner-scoped web policy is not yet a multi-contributor personal-account model."
evidence: []
---

# People bring their own capacity to shared work

## Done when

Two people can collaborate on one plate using separately authorized personal or organizational accounts, see permitted shared work and lessons, and understand which account funds each run without pooling, double-counting or exposing private allowances across project sets.

## Scope

Implement P1 in the [consolidation contract](../specs/switchboard-consolidation.md):
explicit person/plate/set/account ownership, current read/write/execute/share
permissions, funding identity, shared reservation keys and lesson visibility,
plus U1 historical-usage attribution and S1 evidence-based agent recommendations.
Extend existing Connections, capacity/model policy, Learning and authorization;
do not add a second capacity dashboard or credential vault. This is a product
schema and permission-model extension, not an implication of existing owner IDs.

Sets aggregate authorized plates. A plate can appear in multiple sets; neither
membership nor set-level coordination grants provider entitlement. Personal
preferences may order authorized choices but cannot widen plate/workspace policy.
A shared organizational pool requires verified provider scope and explicit admin
allocation; otherwise it remains unsupported. Planned implementation does not
change live grants or make existing private lessons shared.

Historical consumption is durable task/PR lifecycle accounting in the existing
agent-quality ledger, including unsuccessful attempts. Personal capacity is fresh
provider allowance used to help the current user choose an agent. Token totals
cannot stand in for remaining subscription quota. The initial recommendation
explains role-specific quality, latency/cost and uncertainty; it never dispatches,
changes funding identity or grants paid execution.

## Acceptance

- [ ] Two contributors to one PR retain all lifecycle stages, retries and failed/abandoned attempts under stable episode/attempt/commit/PR identities; metric visibility respects each account's private scope: branch-qualified `AQ:tests/agent-quality-records.test.mjs`, `AQ:tests/agent-quality-lifecycle.test.mjs` and `AQ:tests/agent-quality-report.test.mjs`, extended by U1 after integration.
- [ ] Cross-PR work, parent/child totals, cumulative snapshots, imported receipts and reused evidence cannot double-count usage; unknown input/output/cache semantics and missing telemetry prevent a complete total: branch-qualified `AQ:tests/agent-quality-report.test.mjs` extended by U1 after integration.
- [ ] Usage measurements distinguish observed charge from dated estimates and retain provider-specific input/output/cache semantics, immutable original receipts and model/version identity: branch-qualified `AQ:tests/agent-quality-records.test.mjs` extended by U1 after integration.
- [ ] Personal agent recommendations explain authorized choices, task-role strengths, relevant quality evidence, latency/cost and fresh allowance/reset windows; sparse quality or stale quota stays uncertain and choosing never executes or switches payer: `npm run check:focused -- tests/routine-recommendations.test.mjs tests/web-capacity.test.mjs tests/web-model-selection.test.mjs` (first file planned).

- [ ] Person-owned account metadata/secrets/preferences, plate work/policy/history, set membership/aggregation and provider pools have distinct versioned identities and access rules: `npm run check:focused -- tests/routine-ownership.test.mjs tests/web-auth.test.mjs` (first file planned).
- [ ] Two Acme contributors on one plate see allowed shared work while private account details, quotas, task text and lessons remain isolated; losing project/account access prevents new execution: `npm run check:focused -- tests/routine-ownership.test.mjs tests/web-connections.test.mjs` (first file planned).
- [ ] One contributor using the same account through two sets observes one pool/window and one reservation; concurrent demands cannot spend the same allowance twice or sum unrelated percentages/units: `npm run check:focused -- tests/routine-ownership.test.mjs tests/web-capacity.test.mjs tests/web-model-selection.test.mjs` (first file planned).
- [ ] A run pins initiator, funding principal, verified account/pool, connection generation and policy digest; exhaustion/stale quota produces an explained wait and cannot silently use another person's account: `npm run check:focused -- tests/routine-ownership.test.mjs tests/web-model-selection.test.mjs` (first file planned).
- [ ] Verified organizational plans share only their real provider pool under explicit allocation; unknown org identity, cross-instance coordination and unsupported subscription enforcement remain unavailable: `npm run check:focused -- tests/routine-ownership.test.mjs tests/web-capacity.test.mjs` (first file planned).
- [ ] Personal-to-plate or set-shared lesson promotion is an exact reviewed copy with source provenance, destination audience and redaction; personal defaults and revocation do not leak original content: `npm run check:focused -- tests/routine-ownership.test.mjs tests/web-learning.test.mjs` (first file planned).
- [ ] Existing owner-scoped receipts, Connections, Learning and return routes retain their current restrictions until an explicit schema migration and per-record sharing decision: `npm run check:focused -- tests/routine-ownership.test.mjs tests/web-operation-coverage.test.mjs` (first file planned).
- [ ] Existing and new contract tests pass without assuming live multi-user or provider activation: `npm run check` and `npm run typecheck` on the integrated candidate.
- [ ] Two separately authorized test identities exercise the shared plate and private account views, with no model spend required for the visibility walkthrough: ⚑ by hand: owner and conductor, after exact test-identity/scope approval.

## Your part

- **Ask:** Review how a plate's collaborators can see work, use their accounts and share lessons.
- **Why:** Existing owner-only policy does not define this collaboration model.
- **Look at:** The scope/funding preview and the two-person visibility walkthrough.
- **Choices:** Use these boundaries | Revise the boundaries
- **Keeps it open:** Revise the boundaries
- **Takes:** About 10 minutes.
- **Then:** Use these boundaries: record the scoped activation decision separately from implementation. Revise the boundaries: retain existing access and update the model.
- **Ready when:** Synthetic multi-person and multi-set cases pass and the exact test identities and grants are available for review.

## Real surfaces

- owner's machine: synthetic local policy and pool-identity fixtures through the installed package.
- GitHub API: separately approved identities exercise current project membership; no new grants inferred from repository visibility.

## Proof

Run `npm run check:focused -- tests/routine-ownership.test.mjs tests/web-capacity.test.mjs tests/web-model-selection.test.mjs tests/web-connections.test.mjs tests/web-learning.test.mjs tests/web-auth.test.mjs`
after the planned ownership file exists. After branch integration, also run the
extended AQ records/lifecycle/report tests for U1 and
`npm run check:focused -- tests/routine-recommendations.test.mjs tests/web-capacity.test.mjs tests/web-model-selection.test.mjs` for S1. Run `npm run check` and
`npm run typecheck` on the integrated candidate. Retain two-person visibility
observations, account/pool alias decisions and conflict/revocation evidence.
No new provider connection, quota reset, login transfer or shared entitlement is
created as part of this design task.

## Deliberately open

- AQ's current resources expose aggregate tokens/cachedTokens, not the requested
  input/output/cache-write/read and funding breakdown. U1 extends that existing
  schema/ledger compatibly; historical detail cannot be reconstructed by guessing.
  Refer to AQ by pinned branch/path until the draft phase-ID collision is resolved.
- Quality calibration and task/model-cohort coverage remain incomplete. S1 can
  explain capabilities and capacity, but must withhold quality-superiority claims
  without relevant evidence. No paid benchmark or automatic routing is authorized.

- Current connection descriptors are workspace/project scoped and authorize all
  named projects; adding an owner field alone is insufficient. P1 must review
  transport/store/schema boundaries and default old descriptors to their existing
  restricted scope, never auto-convert them to a contributor's personal account.
- Provider account/pool identity may be unavailable from local subscription
  history. P1 refuses cross-account joins or eligible capacity until proven;
  labels or equal email strings cannot establish a shared pool.
- Independent Plates instances and outside apps can consume the same allowance.
  A local reservation is not a provider-wide lock. P1 must designate an authorized
  shared broker or leave cross-instance coordinated execution unsupported, with
  bounded policy and actual provider response recorded separately.
- Set-shared lesson audience must be explicit and versioned. Membership changes
  cannot silently widen a prior personal export; P1 requires reviewed recipient
  scope changes while preserving source provenance and historical receipts.

## Next action

After phase 132's observation identity contract, implement P1's two-person/one-plate and one-person/two-sets fixtures before extending connection policy, funding reservations or lesson sharing; then
implement U1/S1 against the reconciled agent-quality contracts, preserving the
usage-versus-current-capacity boundary.
