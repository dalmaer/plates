---
status: designed
since: 2026-10-30
goal: G8
spec: 2
depends: [138]
note: "Plates-native policy and dormant reversible import specified; no credentials, active definitions, cursors or effects transferred."
evidence: []
---

# A routine has one explicit Plates policy

## Done when

An owner can review a routine's purpose, scope, trigger, placement, allowed effects and bounds as one Plates policy and import selected legacy history into dormant private state with an exact, recoverable receipt.

## Scope

Complete T1's authored-definition/policy contract and T4 in the
[consolidation specification](../specs/switchboard-consolidation.md). Design policy
around Plates' workspace, project authorization, Connections and operation
contracts. A legacy routine.json is an input to transform and review, not a
permanent schema or a permission grant. Personal routines need explicit actor
scope; project routines retain repository policy. Keep task text private.

Preview an explicit source snapshot, map identities and declared needs, show
unsupported fields and missing connections, then copy approved data into dormant
state. Preserve old bytes and pending work. Definition/state import is distinct
from execution activation and never implies approval for held effects.

## Acceptance

- [ ] Definitions validate scope, task references, trigger semantics, placement, permissions, budget and overlap under a versioned Plates schema; ambiguous legacy fields refuse: `npm run check:focused -- tests/routine-model.test.mjs` (planned file).
- [ ] A source-bound preview maps every selected config/history/cursor/held item to its intended owner and destination, excludes credentials/caches, and identifies unsupported or missing data: `npm run check:focused -- tests/routine-import.test.mjs` (planned file).
- [ ] Repeated approved digest recovers the same import; changed source/destination, torn logs, duplicate legacy identity, symlink/traversal and wrong ownership refuse without altering original data: `npm run check:focused -- tests/routine-import.test.mjs` (planned file).
- [ ] Imported entries remain dormant and completed effects cannot replay; held effects require fresh exact review under current policy: `npm run check:focused -- tests/routine-import.test.mjs` (planned file).
- [ ] A synthetic export/import/rollback fixture preserves every original receipt and flags uncertain reverse mapping: `npm run check:focused -- tests/routine-import.test.mjs` (planned file).
- [ ] The owner reviews one real policy/import preview and, if proceeding, approves its exact private snapshot and destination with no execution: ⚑ by hand: owner and conductor.

## Your part

- **Ask:** Review one routine's proposed policy and exact dormant import.
- **Why:** Source declarations cannot silently become Plates permission or ownership.
- **Look at:** The private import preview, unresolved mappings and rollback receipt.
- **Choices:** Import this snapshot | Revise the mapping
- **Keeps it open:** Revise the mapping
- **Takes:** About 10 minutes.
- **Then:** Import this snapshot: copy only the reviewed snapshot and verify dormant state. Revise the mapping: preserve all current state and prepare a new preview.
- **Ready when:** Import tests pass and a consistent selected snapshot with no secrets is available.

## Real surfaces

- published package: synthetic Acme import and exact-digest recovery through installed CLI.
- owner's machine: approved private snapshot/readback and dormant-state inspection, with the incumbent restored to its observed state if paused for snapshotting.

## Proof

Run `npm run check:focused -- tests/routine-model.test.mjs tests/routine-import.test.mjs`
after those planned files are implemented, then `npm run check` and
`npm run typecheck` on the integrated candidate. Documentation validation is
specified in phase 137. A live import needs exact snapshot/destination review;
any required writer pause/drain is separately shown before the action.

## Deliberately open

- Live source consistency is not established by copying while JSONL is appended.
  T4 proves a snapshot boundary or requests a narrowly scoped pause/drain before
  commit; until then the preview is provisional.
- Existing connection references may not cover legacy needs. Import marks them
  unavailable and dormant; credential transfer or new grants are separate work.
- Legacy records without stable run IDs need source-offset/hash attribution;
  ambiguous joins stay quarantined. T4 settles translation with collision fixtures.

## Next action

After phases 137–138's identity and funding contracts, implement authored-policy and importer fixtures for dormant Acme routines, including pending effects and changed-source refusal.

- **2026-10-30** — Reallocated this unpublished consolidation draft from 134 to 139 after inspecting agent-quality at `9f8c17ad`; existing agent-quality phases are unchanged.
