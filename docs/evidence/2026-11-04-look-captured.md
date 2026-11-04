---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---
# Evidence: phase 172 — The look is captured for review

- Date: 2026-11-04
- Phase: 172
- Revision: bbd71059 on origin/main 1dda19ef, and this record
- Claim being checked: `npm run look` captures every page type of the markup golden, from its Acme fixtures, in light and dark at phone and laptop widths, into a temporary folder outside the repo, with no pixel comparison.

## Automated checks

- `node --test tests/web-design.test.mjs`: exit 0, 14 pass (conductor), including "captures cover every page type": the script's plan equals every golden page × light/dark × 390/1280, file names are unique, and a missing browser exits 2 having captured nothing. No browser starts in the test.
- The golden and the capture share one page list (tests/helpers/web-design-pages.mjs), so a new page type cannot be missed by one and not the other.
- package.json's digest in lib/web/capability-source-data.mjs changed with the new script entry; conductor read the diff (one sha).
- The whole gate, `npm run check`, runs through `plates integrate` after this file is written.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `npm run look` on the owner's Mac (builder) | 28 images in a temp folder | exit 0 in about 45 s: 28 PNGs (7 page types × 2 themes × 2 widths) in a folder under $TMPDIR | the script runs for real |
| Opened decision-dark-phone.png (conductor) | the decision page, dark, phone width, whole page | as expected, fully themed, footer and Sign out showing | the capture is faithful for one page |
| The owner reviews one design change from its captures | Useful or Not worth it | Not run | the ⚑ box |

## Gaps and decision

- Partial, owes the owner's review of one design change from its captures.
- The recovery and offline pages are not in the golden, so not captured.
- Found beside the phase: in a fresh browser the Changes page's "Since last visit" filter defaults to today, so it shows "No additions match this date range" and hides older changes; likely the same for a first real visit.
