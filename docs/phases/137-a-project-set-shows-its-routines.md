---
status: partial
since: 2026-11-05
goal: G8
depends: [93, 102]
note: "First increment: optional project-set registry and authorization intersection only. Home/history selection, observation transport and hosted features remain in draft PR324; no interface or executor is enabled by this contract."
evidence: ["evidence/2026-11-05-project-set-contract.md"]
---

# A project set shows its routines and what actually ran

## Done when

An authorized owner can inspect existing routines and observations through a project-set lens without adding access, executors or pooled funding authority.

## First safe increment

The optional configuration registry is bounded and pinned to existing project repository IDs. Shared pure readers intersect it with the authenticated project list; a missing or revoked set fails closed. The default configuration and current UI/routes remain unchanged. This increment adds the contract so later Home/history integration can use it without the hosted migrations in [draft PR324](https://github.com/dalmaer/plates/pull/324).

## Acceptance

- [x] Registry bounds, exact fields, known members, duplicates, names and repository pins are validated; selection grants no project access: `tests/web-project-set-contract.test.mjs`.
- [x] Optional configuration readback retains the registry without mutable aliases; absence keeps the current behavior: the same focused test and `tests/web-config.test.mjs`.
- [ ] Home/history filters, source-bound pagination and responsive navigation use the contract.
- [ ] Real desktop/mobile source comparison and any separately authorized observation transport are verified.

## Proof

`node --test tests/web-project-set-contract.test.mjs tests/web-config.test.mjs`; required integration checks and independent review before merge. Pure synthetic fixtures; no hosted migration, transport enrollment or provider call.

## Deliberately open

Observation enrollment, hosted storage and personal funding remain separate increments with their own review and owner permissions. A set is a grouping, never an access or quota grant.

## Next action

Integrate the read-only Home/history lens from PR324 against current main, retaining current navigation and source identity contracts. Keep the original broader source preserved in that draft.
