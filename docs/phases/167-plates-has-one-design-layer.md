---
status: built
since: 2026-11-02
goal: G7
spec: 2
depends: [151]
note: "Built: one CSS-only design layer feeds plates.css once (tokens, components, shell); markup and computed styles unchanged; contrast proven over every surface, with muted over the light wash held for phase 168."
evidence: ["evidence/2026-11-02-one-design-layer.md"]
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

- [x] Every selector appears once in `/assets/plates.css`: `tests/web-design.test.mjs: "the shell stylesheet includes each layer once"`
- [x] Text, field borders and the ring meet contrast over every surface in both themes; the only pair short over the wash, which no page draws yet, is named and held for phase 168: `tests/web-design.test.mjs: "tokens meet contrast over the wash in both themes"`
- [x] Pages render byte-identical HTML before and after: `tests/web-design.test.mjs: "the design layer changes no page markup"`

## Real surfaces

none

## Proof

Automated: `node --test tests/web-design.test.mjs tests/web-home.test.mjs tests/web-assets.test.mjs`; `npm run check`.

## Deliberately open

- **Settled 2026-11-02 (build): today's muted over the wash.** Today's `--muted` (#52655e) reads 4.23:1 and 4.39:1 over the light wash stops, short of 4.5:1. Changing it here would be visible, and no page draws the wash until phase 168. So the test names exactly this pair as known, and phase 168, which draws the wash, must clear it.
- **Exact token values.** Ledger's surface, radius, blur and motion values are reused. Plates's own blue and white palette is settled here by the contrast test, then judged by the owner in phase 168.

## Next action

None.

## Trajectory

- **2026-11-02** — Today's muted grey falls short of 4.5:1 over Ledger's light wash (4.23 and 4.39). The wash is not drawn until 168, so 167 names the pair as known and 168 must clear it. Evidence: tests/web-design.test.mjs KNOWN_UNTIL_168.
- **2026-11-02** — Journal styles now ship only in plates.css, because Home renders journal cards with it alone. change.css is a stub that phase 171 can drop. Evidence: computed-style parity across 42 page, theme and width combinations.
