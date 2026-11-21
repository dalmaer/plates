---
status: planned
since: 2026-11-21
goal: G9
spec: 2
depends: [200]
note: "Filed: a one-time import writes each open phase into its Unison item's planned fields, by box class, and freezes the phase file; waits on Unison's planned items."
evidence: []
---

# A project's open phases move into Unison as planned items

## Done when

`plates unison import` on a connected project writes each open phase into its Unison
item's planned-item fields: the Done when, one check per acceptance box (by class), and
Needs from `depends:`. It then marks each phase file frozen, saying where its plan now
lives. An item that would be left with no check is flagged rather than created bare. The
import changes nothing until its plan has been shown and confirmed, and running it twice
changes nothing.

## Scope

Stage 2 of the migration (docs/research/2026-11-21-just-unison.md, "Migrating a project";
rehearsed on study in docs/research/2026-11-21-migration-rehearsal.md).

- **Box classes.** A named test (`tests/<file>: "<name>"`) becomes `test: <file> › <name>`.
  A decision, approval or setup step (phase 204's classes) becomes an owner-answered
  check: a For you card once Unison has sections, until then a `link:` check proven by the
  owner's recorded answer. A walk becomes the item's Try it, not a check. A checked box
  carries its proof (the evidence path or the answer) as the check's proof.
- **No bare items.** A phase whose only boxes were walks is flagged in the plan as
  needing a check; the import leaves it unimported until one is added.
- **Freezing.** Each imported phase file gains front matter `plan: unison` and a line under
  its title naming the item URL. The roadmap check accepts a frozen phase and never asks
  more of it. Files are never deleted.
- **Optional export.** A project with export on keeps writing the plan back to git, and
  Unison drives the export (plates itself keeps this).

Out of scope: Unison's planned-item fields, Plan this and proof from CI, which are Unison
work. Eject is phase 206.

## Integration increments

1. **The plan, read-only.** `plates unison import --dry-run` prints, per open phase, the
   fields and checks it would write, and flags phases with no check left. Proof:
   tests/unison-import.test.mjs against a stub `unison`. Recovery: revert.
2. **The import.** It writes the fields once Unison has planned items, freezes the files,
   and is idempotent.

## Acceptance

- [ ] Each acceptance box maps by class, a walk becomes the Try it, and a phase with no check left is flagged and not imported: `tests/unison-import.test.mjs: "boxes map by class and no item is left without a check"`.
- [ ] An imported phase is frozen, passes the roadmap check, and a second import changes nothing: `tests/unison-import.test.mjs: "an imported phase is frozen and a second import changes nothing"`.

## Real surfaces

- Owner's machine: `plates unison import --dry-run` on study prints its three open phases' fields, and flags its phase 3.

## Proof

Automated: `npm run check:focused -- tests/unison-import.test.mjs`, then `npm run check`.
By hand: none.

## Deliberately open

- How decisions and approvals look in Unison before sections exist. A `link:` check proven
  by a recorded answer is the stand-in. Settled when Unison ships sections.

## Next action

Increment 1 once phase 204 lands: the read-only plan, rehearsed on study.
