---
status: built
since: 2026-10-31
goal: G9
spec: 2
depends: [39, 144]
note: "lib/doors.mjs classes 21 operation types; Merge danger names the class and levels gate by door, irreversible always waiting for the owner."
evidence: ["evidence/2026-10-31-door-classes.md"]
---

# Every change Plates proposes says whether it can be undone

## Done when

Every operation Plates proposes or performs carries a door class,
`reversible`, `windowed` (undoable for a stated time) or `irreversible`; the
"Merge danger" line on Plates' PRs is derived from it; and an autonomy level
can require the owner's approval by class (for example, High may merge
reversible changes but never irreversible ones).

## Scope

- The three classes and their meaning in the practice, matching the
  approval tiers already used by the owner's personal-data system, so one
  word means the same in both.
- A class on each operation type Plates knows (merge, deploy, promote,
  publish, delete, secret change, fleet update, schedule change), with
  `promote --back` and revert making some windowed.
- Phase 39's Merge danger reads the class instead of free text.
- Autonomy levels (phase 144) gain a rule per class.
- Not in scope: classifying arbitrary shell commands inside agent sessions
  (the hosts' sandboxes do that).

## Acceptance

- [x] Every operation type has exactly one class, and an unclassified type fails the gate: `tests/door-class.test.mjs: "every operation has a door"`.
- [x] The Merge danger line is derived from the class and names it: `tests/door-class.test.mjs: "merge danger says the door"`.
- [x] A level that forbids irreversible operations refuses one and says why: `tests/door-class.test.mjs: "an irreversible door waits for the owner"`.

## Real surfaces

none

## Proof

Automated: `node --test tests/door-class.test.mjs`; `npm run check`.

## Deliberately open

- **Windows.** How long "windowed" lasts per operation (a revert is
  forever, a deploy rollback is minutes) is set per type and recorded.

## Next action

None; built. The robot and shipped scripts read the classes once they can
import them (a later phase).
