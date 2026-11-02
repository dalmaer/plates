---
status: planned
since: 2026-11-02
goal: G7
spec: 2
depends: [169]
note: "Owner, 2026-11-02: plates and Ledger 'should feel like they are in the same family'. Ledger's materials (glass surfaces, background wash, radius, motion, theme toggle) with plates's own colour: blue and white, cobalt on porcelain. Owner approved reusing Ledger's token values and a blocking theme script."
evidence: []
---

# Every workspace page uses the design layer

## Done when

Run, daily, fleet, job, change, connection, model, walk, decision, night and recovery pages draw their colours, radii and controls from the design layer. Their own stylesheets keep only layout.

## Scope

- The order is run, daily, fleet, job, change and connection first, then model, walk, decision, night and recovery.
- Recovery keeps working when the design layer fails to load. It is the page shown when the app is broken, so it gets the tokens inlined into `/assets/recovery.css` at build time instead of depending on `plates.css`.
- The fleet digest email is out of scope. It already follows Ledger's style, and its contrast test stays as it is.

## Acceptance

- [ ] No per-page stylesheet sets a colour, background or radius literal: `tests/web-design.test.mjs: "page stylesheets hold layout only"`
- [ ] The recovery page renders with its own sheet when `plates.css` is missing: `tests/web-design.test.mjs: "recovery stands alone"`

## Real surfaces

none

## Proof

Automated: `node --test tests/web-design.test.mjs tests/web-*.test.mjs`; `npm run check`.

## Deliberately open

*Nothing yet.*

## Next action

Build it after phase 169.
