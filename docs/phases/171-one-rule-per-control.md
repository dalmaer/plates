---
status: planned
since: 2026-11-02
goal: G7
spec: 2
depends: [170]
note: "Owner, 2026-11-02: plates and Ledger 'should feel like they are in the same family'. Ledger's materials (glass surfaces, background wash, radius, motion, theme toggle) with plates's own colour: blue and white, cobalt on porcelain. Owner approved reusing Ledger's token values and a blocking theme script."
evidence: []
---

# One rule per control

## Done when

Inputs, selects, textareas and buttons are styled in exactly one place. Before this phase, 27 select rules sit in 9 modules, 40 input and textarea rules in 10, and 34 button rules in 12.

## Scope

- The per-view control rules are deleted in favour of `.p-field` and `.p-button`, keeping only real layout differences such as width.
- The interim select chevron rule (commit 34dde7a8) folds into `.p-field`.
- The CSS bytes before and after are recorded in the evidence.

## Acceptance

- [ ] Outside `lib/web/design.mjs`, no stylesheet styles a bare `input`, `select`, `textarea` or `button`: `tests/web-design.test.mjs: "controls are styled once"`
- [ ] The total CSS shrinks, with both numbers in the evidence: `tests/web-design.test.mjs: "the design layer does not grow the stylesheets"`

## Real surfaces

none

## Proof

Automated: `node --test tests/web-design.test.mjs`; `npm run check`.

## Deliberately open

*Nothing yet.*

## Next action

Build it after phase 170.
