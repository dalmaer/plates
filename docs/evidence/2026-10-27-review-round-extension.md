# Review round extension: judged on real PRs (2026-10-27)

Phase 133's `judgeRounds` was run on open and recent dalmaer/plates PRs, through
`plates review <pr> --json` from the phase branch. The read is the one plates
review already makes; nothing was posted.

| PR | Rounds | Findings in rounds 1-3 | Verdict | Reason |
| --- | --- | --- | --- | --- |
| #216 (Keel → Plates rename) | 20 | 2, 2, 2 | repeating | no convergence: round 3 had 2 findings to round 1's 2, top severity P2 to P2 |
| #249 (phase 119) | 3 | 2, 2, 1 | repeating | round 2 returns to lib/session-ledger-io.mjs:104, 3 lines from a round 1 finding |
| #254 (phase 123) | 2 | — | not judged | under the limit |
| #229 (phase 114) | 1 | — | not judged | under the limit |

#216 is the loop lesson 59 names. Under phase 71 it should have stopped at
round 3, but it went on to round 20.

#249's round-1 finding was that `inspectHarnessLock` crashed on lock bytes
that parse to `null`. Round 1's fix added owner validation at lines 102-104.
Round 2 found that this validation coerces a non-string `owner.id`. The
round-2 finding is in round 1's fix, which is the fix-of-fix shape the
`REVIEW_NEAR` check is meant to catch. Before this was measured, the round-3
finding (cancel atomicity, new ground) made #249 look like progress. The
measurement corrected that.

Automated proof: `node --test tests/review-rounds.test.mjs tests/board.test.mjs`.
