# Evidence: phase 170, every workspace page uses the design layer

- Date: 2026-11-02
- Phase: 170
- Revision: the commit titled "phase 170: Every workspace page uses the design layer", on base `7ff3b22d` (working tree)
- Claim checked: every per-page stylesheet holds layout only, with colours, backgrounds, radii and shadows from tokens; the recovery page renders on its own sheet.

## Automated checks

- `plates prove` with `--fix` covering the twelve changed `lib/web` files and `--base origin/main`. Both printed VERIFIED, red without the fix and green with it:
  - "page stylesheets hold layout only"
  - "recovery stands alone"
- The builder ran `node --test tests/web-*.test.mjs`: exit 0, 789 pass. `node --test tests/web-design.test.mjs`: 10 pass.
- The markup golden is byte-identical: no markup changed.
- `npm run check:focused -- tests/web-design.test.mjs`: exit 0.
- The full gate, `npm run check`, runs once through `plates integrate`.

New token `--scrim`. A solid dialog stands at least 3:1 off the scrimmed page, by its fill in light (4.69:1) and by its `--line-strong` edge in dark (5.96:1).

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Conductor: decision page at 390px, dark (builder's headless capture) | Glazed blue, solid panels, a warning note on the token edge, no sideways scroll | As expected | The rendering on one engine |
| Builder: run, fleet, decision, walk, change and recovery, at 390 and 1280px, in light and dark | Nothing broken, no sideways scroll | None broken; the recovery backgrounds follow system light and dark | Same |

## Gaps and decision

There is no real surface; this phase is built. Left for phase 171:
- the duplicated control rules;
- the shell and navigation 8px radii;
- `.p-dialog::backdrop` still uses `rgb(0 0 0/.5)` instead of `--scrim`.

Found beside this phase and not caused by it: on a phone, the fleet "Project comparison" header row runs its labels together.
