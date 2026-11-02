# Evidence: phase 168, the shell wears blue and white glass

- Date: 2026-11-02
- Phase: 168
- Revision: the commit titled "phase 168: The shell wears blue and white glass", on base `f76935ae` (working tree)
- Claim checked: the workspace draws a porcelain-and-cobalt wash under glass surfaces with solid fallbacks. Every text pair meets contrast over the drawn wash. A system, light or dark choice applies before paint without inline code.

## Automated checks

- `plates prove` with `--fix` covering the eight changed `lib/web` files and `--base origin/main`. Each printed VERIFIED, red without the fix and green with it:
  - "tokens meet contrast over the wash in both themes". Phase 167's known pair is gone; the failures must be `[]`.
  - "the theme applies before paint without inline code".
  - "glass falls back to solid surfaces".
- The builder ran `node --test tests/web-*.test.mjs` plus the pin and capability tests: exit 0, 799 pass.
- `npm run check:focused -- tests/web-design.test.mjs tests/web-pwa.test.mjs tests/web-home.test.mjs tests/web-assets.test.mjs tests/web-server.test.mjs tests/web-responsive.test.mjs tests/web-activation-plan.test.mjs`: exit 0. The conductor reran it after adding the activation step.
- The full gate, `npm run check`, runs once through `plates integrate`.

Key contrast pairs: the minimum over paper and all three wash stops.

| Pair | Light | Dark |
| --- | --- | --- |
| ink on paper | 10.5 | 11.1 |
| muted on paper | 4.73 | 6.67 |
| action on paper | 6.04 | 6.89 |
| on-action on action | 8.35 | 9.51 |
| line-strong on field | 4.18 | 3.67 |
| ring (amber) on surface | 3.85 | 6.52 |

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Conductor: served the fixture preview over local http in the built-in browser, Home at desktop width | Cobalt pills, porcelain wash, glass header | As expected | The rendering on one engine; not the owner's judgement |
| Conductor: toggled System, then Light, then Dark | The theme switches, and the label names the state | Switched; the label read "Theme: System. Switch to Light" before the first press | The toggle wiring |
| Conductor: decision page at 375px, dark | A pill strip, no sideways page scroll, dark kept across pages | `scrollWidth <= innerWidth` was true; dark carried over from Home | Phone layout and remembered choice |
| Owner: phone and laptop, light and dark, beside Ledger | One family, with plates still its own | Not run: needs the deploy | The family resemblance |

## Gaps and decision

The owner's look is not walked yet. That waits on the deploy, so the phase is partial and owes a walk. Other gaps:
- Home's own hex colours (the coverage box, capture placeholders) remain for phase 169. In dark mode the coverage box is olive.
- Per-page sheets keep their literals until phase 170.
- The recovery page links no `plates.css` and so gets no theme script. That is by design: it must work when the shell fails.
