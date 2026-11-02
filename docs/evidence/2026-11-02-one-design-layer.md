# Evidence: phase 167, plates has one design layer

- Date: 2026-11-02
- Phase: 167
- Revision: the commit titled "phase 167: Plates has one design layer", on base `fc72aedc` (working tree)
- Claim checked: one CSS-only design layer feeds `/assets/plates.css` once, in order. The tokens meet contrast over their surfaces. No page's markup or computed style changes.

## Automated checks

- `node --test tests/web-design.test.mjs`: exit 0, 4 pass.
- `plates prove`, with `--fix lib/web/design.mjs lib/web/assets.mjs lib/web/views.mjs --base origin/main`:
  - "the shell stylesheet includes each layer once": VERIFIED. At the base it fails on the navigation selectors that shipped twice.
  - "tokens meet contrast over the wash in both themes": VERIFIED. At the base it fails because the wash tokens are not defined.
- "the design layer changes no page markup" is a no-regression guard, so the base cannot be red. The golden markup (`tests/fixtures/web-design/markup.json`) was rendered from `fc72aedc`'s views in its own commit, before the change. The conductor confirmed the guard catches a change: adding one class name to the attention card made the test fail (1 fail), and restoring it made it pass.
- `npm run check:focused -- tests/web-design.test.mjs tests/web-home.test.mjs tests/web-assets.test.mjs tests/web-pwa.test.mjs tests/web-server.test.mjs tests/web-change-ui.test.mjs tests/web-decision-ui.test.mjs tests/web-responsive.test.mjs tests/web-auth.test.mjs`: exit 0.
- The builder ran `node --test` on every `tests/web-*.test.mjs` plus the rename and capability tests: exit 0, 901 pass.
- Computed-style parity, from the builder's own harness, not part of the suite:
  - Headless Chrome loaded the old and new CSS and compared every computed property, including `::before`, `::after` and `::backdrop`.
  - It covered 7 pages, in light and dark, at 1280, 650 and 375px: 42 combinations.
  - Only custom properties differ. A deliberate mutation was caught.
- The full gate, `npm run check`, runs once on this tree through `plates integrate`. Its result goes in the commit history.

## By hand

None. This phase has no visible change and no real surface.

## Gaps and decision

Today's `--muted` (#52655e) reads 4.23:1 and 4.39:1 over Ledger's light wash stops. No page draws the wash yet, so the test names exactly that pair as known, and phase 168 must clear it (its first acceptance box). The button text colours (white on action, and the dark-theme button text) are not tokens yet, so the contrast test does not cover them. Phase 168 should tokenise them.
