---
status: built
since: 2026-11-02
goal: G7
spec: 2
depends: [170]
note: "Built: controls are styled once in the design layer (45 duplicated rules to 0), served CSS 81,780 to 79,063 bytes, and the phone toolbar select and fleet header fixed."
evidence: ["evidence/2026-11-02-one-rule-per-control.md"]
---

# One rule per control

## Done when

Inputs, selects, textareas and buttons are styled in exactly one place. Before this phase, 27 select rules sit in 9 modules, 40 input and textarea rules in 10, and 34 button rules in 12.

## Scope

- The per-view control rules are deleted in favour of `.p-field` and `.p-button`, keeping only real layout differences such as width.
- The interim select chevron rule (commit 34dde7a8) folds into `.p-field`.
- The CSS bytes before and after are recorded in the evidence.

## Acceptance

- [x] Outside `lib/web/design.mjs`, no stylesheet styles a bare `input`, `select`, `textarea` or `button`: `tests/web-design.test.mjs: "controls are styled once"`
- [x] The total CSS shrinks, with both numbers in the evidence: `tests/web-design.test.mjs: "the design layer does not grow the stylesheets"`

## Real surfaces

none

## Proof

Automated: `node --test tests/web-design.test.mjs`; `npm run check`.

## Deliberately open

*Nothing yet.*

## Next action

None.

## Trajectory

- **2026-11-02** — The base control rules sit inside `:where()`, so their specificity is zero and every page's placement rules win without restating the look. Evidence: tests/web-design.test.mjs "controls are styled once".
- **2026-11-02** — The owner's clipped "Show" select on a phone, and the fleet comparison header running together, were fixed here. The fleet canary row spacing is open. Evidence: docs/evidence/2026-11-02-one-rule-per-control.md.
