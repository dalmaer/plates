---
status: planned
since: 2026-11-02
goal: G7
spec: 2
depends: [151]
note: "Owner, 2026-11-02: plates and Ledger 'should feel like they are in the same family'. Ledger's materials (glass surfaces, background wash, radius, motion, theme toggle) with plates's own colour: blue and white, cobalt on porcelain. Owner approved reusing Ledger's token values and a blocking theme script."
evidence: []
---

# Plates has one design layer

## Done when

The hosted workspace's colours, radii, spacing, shadows, type and motion come from one design layer, and every page's stylesheet is built from it once. Nothing looks different yet.

## Scope

- **One module, CSS only.** `lib/web/design.mjs` exports `tokens` and `components`. Browser views never import it. `/assets/plates.css` becomes tokens, then components, then shell, with each piece included once. Today the navigation styles ship twice, and the journal styles ship in two sheets.
- **Tokens.**
  - Colour: paper, ink, muted, line and line-strong, surface, surface-raised, surface-solid, field, action, accent, ring, danger and ok. Each has a light and a dark value.
  - Radius `--r-sm`, `--r`, `--r-lg` and `--r-pill`; shadow `--shadow-xs` and `--shadow-glass`; space `--s-1` to `--s-8` on a 4px step; a type scale; and the motion easing and durations.
  - The old six names (`--ink`, `--muted`, `--line`, `--paper`, `--green` and `--card`) stay as aliases, so this phase changes no page.
- **Components:** `.p-card`, `.p-panel`, `.p-button` (with quiet, ghost and danger), `.p-field` (input, select and textarea at 44px, 16px text under 700px), `.p-badge`, `.p-table` and `.p-dialog`. They are defined here and adopted from phase 168 on.
- **The contrast test is replaced.** `tests/web-home.test.mjs` parses exactly two hex `:root` blocks. A new check reads the tokens, converts oklch, and tests text against each surface composited over the strongest wash stop, in both themes. Text must reach 4.5:1, and field borders and the focus ring 3:1.
- The CSP stays unchanged: everything comes from `'self'`, with no inline styles and no web fonts.

## Acceptance

- [ ] Every selector appears once in `/assets/plates.css`: `tests/web-design.test.mjs: "the shell stylesheet includes each layer once"`
- [ ] Text, field borders and the ring meet contrast over every surface in both themes: `tests/web-design.test.mjs: "tokens meet contrast over the wash in both themes"`
- [ ] Pages render byte-identical HTML before and after: `tests/web-design.test.mjs: "the design layer changes no page markup"`

## Real surfaces

none

## Proof

Automated: `node --test tests/web-design.test.mjs tests/web-home.test.mjs tests/web-assets.test.mjs`; `npm run check`.

## Deliberately open

- **Exact token values.** Ledger's surface, radius, blur and motion values are reused. Plates's own blue and white palette is settled here by the contrast test, then judged by the owner in phase 168.

## Next action

Build it: add `lib/web/design.mjs` and the new contrast test.
