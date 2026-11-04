---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---
# Evidence: phase 166 — Home says what needs you, what happened and what is next

- Date: 2026-11-04
- Phase: 166, increments 1 and 2
- Revision: 114ea38c on origin/main e3dc75b4, and this record
- Claim being checked: one four-section model (Needs you, Since you last looked, What should happen next?, Your plates) in lib/work-items.mjs; `plates home --json` and `/api/home` carry the same sections, items and counts; Needs you holds only the owner's turn, ranked fix, decide, try; the hosted page's HTML is unchanged in this increment.

## Automated checks

- `node --test --test-name-pattern="the four home sections are one model|needs you holds only the owner's turn" tests/home-isomorphism.test.mjs tests/work-items.test.mjs`: exit 0, 2 pass (conductor).
- `node --test tests/web-design.test.mjs tests/web-home.test.mjs`: exit 0, 24 pass (conductor): the hosted page's markup golden is unchanged.
- Builder: `npm run check:focused` over 9 test files, exit 0, 194 pass; 24 further home and work-items test files, 403 pass.
- The whole gate, `npm run check`, runs through `plates integrate` after this file is written.

## Increment 2 (b558bd66, dd041f75)

- `node --test tests/web-home.test.mjs tests/home-isomorphism.test.mjs tests/web-design.test.mjs`: exit 0, 32 pass (conductor). "the page shows the four sections in order with the model's items and counts" checks headings, verbs, counts and that the Start panel counts what Needs you counts; the markup golden was regenerated on purpose (home and project pages only).
- Builder: all `tests/web-*.test.mjs`, 811 pass, exit 0; `npm run check:focused` over 9 files, 196 pass.
- Sent back once: the rendered page said "6 to answer" above "Needs you · 7", because a failed night has no answers. Both renderers now count what Needs you counts ("7 need you · about 27 min").

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node bin/plates.mjs home --json` on the owner's real fleet, scratch state dir (builder) | four sections, read-only | exit 0 in 65 s: Needs you 35 (18 decide, 17 try, 0 fix), marked known; Since 27 lines across 7 plates (fixed 7 days); Next 1 queued agent issue, tonight's plan empty; Your plates 11 (7 with items, 3 all clear, 1 not read), 3 source problems in one line | the model reads the real fleet; not the owner's judgment of clarity |
| Rendered the hosted home from a synthetic Acme fleet at 375 px (conductor, browser pane) | the four sections in order, no horizontal scroll, source problems under Your plates | as expected after the count fix | layout and order; not the owner's judgment |
| The owner opens home on the phone | clear what to do next | Not run (after deploy) | the ⚑ box |

## Gaps and decision

- Partial: increments 1 and 2 of 4. The ask box and the stored visit are increments 3 and 4.
- Since does not yet read merges, releases or installed fleet updates; its footer says so.
- The web cannot read tonight's plan branch or agent issues (the App has no Issues permission); both are named there with a reason and a command.
