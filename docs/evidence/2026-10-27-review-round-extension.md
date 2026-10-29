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


## Follow-up verification (2026-10-29)

Spin's managed template and rendered copy now describe the same base checkpoint,
one progress extension and repetition stop as the executable decision. The prose
contract fails against the original skill and passes against the correction.

The hosted protected review on `1fc928e4` completed successfully on Ubuntu 24.04
(run 40812388268), retaining the read-only sandbox, disabled sudo,
no-new-privileges and empty capability sets. The Ubuntu 26.04 attempts failed
before model execution (upstream openai/codex-action#188); no protection was
relaxed. Its finding exposed wrapped robot messages losing their severity.

The correction parses the validated inner message and normalizes only the
punctuation entities emitted by `robotText`. The regression covers both marker
namespaces, emitted plain/bracket/bold severity, malformed envelopes, inline
findings and nonleading severity text. Equal-count P1→P2→P3 findings extend;
flat P2 findings stop. `plates prove tests/review-rounds.test.mjs --name
'roundFindings: verified robot envelopes preserve emitted severity and distinguish
easing from repeating findings' --fix
practices/night/files/scripts/plates/lib.mjs scripts/plates/lib.mjs --base
1fc928e4 --trailer` reports VERIFIED: the test fails without the correction and
passes with it. This proves the regression, not general semantic loop detection.


The first full follow-up gate retained three operation-coverage failures because
the shared library's reviewed checksum still named the pre-fix bytes. Inspection
of the complete library diff found only severity extraction inside `roundFindings`;
CLI dispatch, argument grammar and hosted execution scope did not change. The
single checksum was refreshed after that audit. The original failures remain in
the validation record; no audit predicate or assertion was weakened.
