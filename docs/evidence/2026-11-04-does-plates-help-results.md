---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---
# Evidence: phase 13 — Plates can show it makes projects better, or find out that it does not

- Date: 2026-11-04
- Phase: 13
- Revision: e7a8ea54 on 1786f4ef, and this record
- Claim being checked: a dated results page computes the six pre-registered measures as written, marks every substitution and every measure it could not compute, and says plainly what it found, null or negative included.

## Automated checks

- `node --test tests/does-plates-help.test.mjs`: exit 0, 10 pass (conductor).
- `node scripts/research/does-plates-help.mjs --fleet <scratch>/fleet13 --json`: exit 0 (conductor, re-run against the builder's cached reads and full clones). Measures 1, 2, 3, 4 and 6 matched the builder's run exactly. Measure 5 moved by one session (80 → 81 committed phases, 5081 → 5086 builder minutes), because it reads live transcripts and this session's own builder had finished in between. The page carries the builder's run.
- The whole gate, `npm run check`, runs through `plates integrate` after this file is written.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read the page's opening paragraph | the finding in plain words, null or negative as plainly as positive | it opens "the data does not show that plates made the fleet better", names the broken control, the evidence share that did not rise and the conduct-cost miss | the second acceptance box |
| Searched the page for quoted text from fleet repos | counts, dates and medians only | no commit message, lesson, phase title or file content from ledger or isocan | the privacy rule in the brief |
| Checked the pre-registration page | unedited | not in the diff | the comparison was fixed before looking |

## Gaps and decision

- Built. The page is the outcome; its control is broken (isocan was adopted on 2026-10-05), and the page says so rather than claiming an effect.
- Golden tasks with and without skills were not run: they spend tokens and the owner has not said yes. Deliberately open stays.
- Measure 5 reads this machine's transcripts, so it drifts as sessions are added; the others reproduce from the cached reads.
- Found beside the phase: `plates improve --transcripts <dir> --json` hung for over 10 minutes and was killed; not investigated.
