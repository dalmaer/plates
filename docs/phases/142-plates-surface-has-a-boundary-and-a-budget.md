---
status: built
since: 2026-10-31
goal: G9
spec: 2
depends: []
note: "The boundary is in design.md; .plates/surface.json holds 49 verbs and 185 flags, and the gate fails on surface added without it."
evidence: ["evidence/2026-10-31-surface-boundary-and-budget.md"]
---

# Plates says what it owns, and its surface stops growing by accident

## Done when

`docs/design.md` names what Plates owns, what it adopts and what it watches,
and the gate fails when a verb or flag is added without that boundary
saying the new surface belongs to Plates.

## Scope

- A section in `docs/design.md`, "Own, adopt, watch", from
  [the decision](../research/2026-10-30-own-judgment-rent-the-rest.md): each
  layer, who owns it, and the adapter or host control it goes through.
- A recorded budget of the CLI's surface (verbs and flags, counted from the
  verb registry in `lib/cli.mjs`), checked by a test. Adding a verb or flag
  fails the gate until the budget is raised in the same change, and raising
  it requires naming the verb under "Own" in the boundary.
- Removing surface lowers the budget; the test says so.
- Not in scope: removing existing verbs (a later simplification), plugins.

## Acceptance

- [x] The budget matches the registry today, and a registry with one more verb or flag fails with a message naming it and the boundary: `tests/surface-budget.test.mjs: "new surface needs the boundary"`.
- [x] Raising the budget without naming the verb under "Own" in `docs/design.md` fails: `tests/surface-budget.test.mjs: "the boundary owns every verb"`.
- [x] Surface removed without lowering the budget fails with the number to lower it to: `tests/surface-budget.test.mjs: "surface removed must lower the budget"`.
- [x] `npm run check` passes on the change.

## Real surfaces

none

## Proof

Automated: `node --test tests/surface-budget.test.mjs`; `npm run check`.

## Deliberately open

- **Counting flags.** Shared flags (`--json`, `--yes`) count once; settled
  by what the registry exposes.
- **Fleet projects.** The budget is Plates' own; whether projects get a
  surface budget is not decided.

## Next action

None; built. Simplification (removing verbs) is later work that lowers the
budget.
