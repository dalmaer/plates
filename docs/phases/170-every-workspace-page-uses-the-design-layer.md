---
status: built
since: 2026-11-02
goal: G7
spec: 2
depends: [169]
note: "Built: every per-page sheet is layout only on tokens, the journal cards match Home, and the recovery page stands alone on inlined tokens."
evidence: ["evidence/2026-11-02-pages-design-layer.md"]
---

# Every workspace page uses the design layer

## Done when

Run, daily, fleet, job, change, connection, model, walk, decision, night and recovery pages draw their colours, radii and controls from the design layer. Their own stylesheets keep only layout.

## Scope

- The order is run, daily, fleet, job, change and connection first, then model, walk, decision, night and recovery.
- Recovery keeps working when the design layer fails to load. It is the page shown when the app is broken, so it gets the tokens inlined into `/assets/recovery.css` at build time instead of depending on `plates.css`.
- The fleet digest email is out of scope. It already follows Ledger's style, and its contrast test stays as it is.

## Acceptance

- [x] No per-page stylesheet sets a colour, background or radius literal: `tests/web-design.test.mjs: "page stylesheets hold layout only"`
- [x] The recovery page renders with its own sheet when `plates.css` is missing: `tests/web-design.test.mjs: "recovery stands alone"`

## Real surfaces

none

## Proof

Automated: `node --test tests/web-design.test.mjs tests/web-*.test.mjs`; `npm run check`.

## Deliberately open

*Nothing yet.*

## Next action

None.

## Trajectory

- **2026-11-02** — The journal dialog needed a scrim token. `--scrim` was added with a stand-off pair: a solid dialog stands 3:1 off the scrimmed page, by its fill in light and by its edge in dark. Evidence: tests/web-design.test.mjs.
- **2026-11-02** — Small chip radii grew from 6–8px to the 10px `--r-sm`, a visible but intended change. No new radius tokens.
