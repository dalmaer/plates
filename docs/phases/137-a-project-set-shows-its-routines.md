---
status: built
since: 2026-11-21
goal: G8
spec: 2
depends: [93, 102]
note: "Registry and read-only Routines/Activity selection implemented; source-bound continuations refuse scope changes. Home lens, deployment and real desktop/mobile verification remain outstanding; no executor or transport is enabled; the walk was removed (phase 204)."
evidence: ["evidence/2026-11-05-project-set-contract.md", "evidence/2026-11-14-project-set-history.md"]
---

# A project set shows its routines and what actually ran

## Done when

An authorized owner can inspect existing routines and observations through a project-set lens without adding access, executors or pooled funding authority.

## Scope

The optional configuration registry is bounded and pinned to existing project repository IDs. Shared pure readers intersect it with the authenticated project list; a missing or revoked set fails closed. The default unfiltered history remains unchanged. Routines and Activity consume the registry through bounded existing readers; Home integration remains outstanding. No hosted migration is required from [draft PR324](https://github.com/dalmaer/plates/pull/324).

## Acceptance

- [x] Registry bounds, exact fields, known members, duplicates, names and repository pins are validated; selection grants no project access: `tests/web-project-set-contract.test.mjs`.
- [x] Optional configuration readback retains the registry without mutable aliases; absence keeps the current behavior: the same focused test and `tests/web-config.test.mjs`.
- [x] Routines/Activity selection and source-bound pagination use the contract: `tests/web-project-sets.test.mjs`.

## Real surfaces

none

## Proof

`node --test tests/web-project-set-contract.test.mjs tests/web-config.test.mjs`; required integration checks and independent review before merge. Pure synthetic fixtures; no hosted migration, transport enrollment or provider call.

## Deliberately open

Observation enrollment, hosted storage and personal funding remain separate increments with their own review and owner permissions. A set is a grouping, never an access or quota grant.

## Next action

Add the remaining read-only Home lens against current main, then verify desktop/mobile source comparison under separately authorized enrollment. Keep the original broader source preserved in PR324; do not enable its transport or executor.

## Trajectory

- **2026-11-14** — Split history selection from Home and transport so an independently testable read-only increment can land without borrowing the active delegation/runtime phases or treating source tests as hosted execution. See the dated evidence.
