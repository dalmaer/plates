# Evidence: phase 171, one rule per control

- Date: 2026-11-02
- Phase: 171
- Revision: the commit titled "phase 171: One rule per control", on base `54d67ac0` (working tree)
- Claim checked: inputs, selects, textareas and buttons take their look only from `lib/web/design.mjs`, and the served CSS shrinks.

## Automated checks

- `plates prove` with `--fix` covering the fourteen changed `lib/web` files and `--base origin/main`. Both printed VERIFIED, red without the fix and green with it:
  - "controls are styled once"
  - "the design layer does not grow the stylesheets"
- The builder's extra test, "phone toolbars fit their controls", fails at the base and passes now.
- The builder ran `node --test tests/web-*.test.mjs`: exit 0, 792 pass. `npm run check:focused -- tests/web-*.test.mjs`: exit 0.
- The markup golden is byte-identical.
- The full gate, `npm run check`, runs once through `plates integrate`.

| Measure | Before (origin/main) | After |
| --- | --- | --- |
| Served CSS bytes (all `defaultSources()` sheets) | 81,780 | 79,063 |
| Rules restating a control's look outside design.mjs | 45, across 12 sheets and layers | 0 |

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Conductor: Home at 390px, light (builder's headless capture) | "Show: Everything" in full, the toolbar fitting the screen | As expected; the owner's clipped select is fixed | The rendering on one engine |
| Builder: home, run, fleet, walk, decision, connection, change and recovery, at 390 and 1280px, light and dark | No horizontal scroll, no broken control | None; the fleet comparison rows read cleanly at 390px | Same |

## Gaps and decision

There is no real surface; the phase is built. These are visible on purpose:
- fields are 16px everywhere;
- checkboxes are 20px;
- buttons are 44px tall, down from 46.

Open beside the phase, and not a regression: on the fleet page's "Start with a canary" panel, the label, the select and the button touch with no gap.
