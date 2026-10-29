---
status: built
since: 2026-10-27
goal: G0
spec: 2
depends: [71]
review: wait
note: "Owner asked on 2026-10-27: at the round limit, judge the rounds; progress gets one more set, repetition stops."
evidence: ["evidence/2026-10-27-review-round-extension.md"]
---

# A review that makes progress gets one more set of rounds; one that repeats stops

## Done when

At its round limit (`"review": {"rounds": N}`, 3 unset), `plates review` and the board judge the first N rounds from the read they already make. A review whose rounds made progress gets its limit extended once, to 2N. A review that repeats stops at N and says why. There is never a second extension.

## Scope

Phase 71 stops every review at N rounds. That stops a loop that keeps patching the instance (lesson 59: #216 went 20 rounds), but it also stops a review that keeps finding new, smaller things. The owner asked for a judgement in place of a flat count.

The judgement is deterministic and reads only what the review read already has: each counted finding's round, file, line and P0-P3 severity (`roundFindings`). The rounds repeat (`judgeRounds`) when, within the first N:

- a later round's finding returns to an earlier one, in the same file within `REVIEW_NEAR` (20) lines, meaning the fix drew the next finding;
- one file draws a finding in every round; or
- they did not converge: the last round has as many findings as the first, and none less severe.

Anything else is progress. Rounds after the first N never change the verdict, so every read gives the same answer. No model is asked, and no GitHub call is added. The thread fragments add `originalLine`, so a finding keeps its line after a later push outdates it.

Not in scope:

- The merge rule. Security, overwrite and approval-skip findings are still fixed first at any round.
- `--gate`, which is unchanged.
- Posting the verdict on the PR. It is printed by the read and shown on the board.

## Acceptance

- [x] Progress extends the limit once, to twice N; under the limit nothing is judged; rounds past N never change the verdict: `tests/review-rounds.test.mjs: "judgeRounds: rounds on new ground that converge extend the limit once, to twice it"`
- [x] Each of the three repeating signals stops it, and one line past `REVIEW_NEAR` is new ground: `tests/review-rounds.test.mjs: "judgeRounds: a finding that returns to an earlier one, a file in every round, or no convergence each stop it"`
- [x] Findings carry their round, file, original line and severity; the author's own notes are not findings: `tests/review-rounds.test.mjs: "roundFindings: each counted finding with its round, file, the line it was made on and its severity"`
- [x] `plates review` goes on past 3 after progress and exits 3 at 6, and a repeating review exits 3 at 3 naming each reason: `tests/review-rounds.test.mjs: "plates review: a review that made progress goes on past 3 and stops at 6; one that repeats stops at 3, saying why"`
- [x] The board lists a PR at its limit as "stopped: repeating" or "extended: progress" with the limit that applies, and a PR under its extended limit is nobody's item: `tests/board.test.mjs: "a PR past its review-round limit is the owner's item, with the round count and its open findings; under the limit it stays broken"`

## Real surfaces

- GitHub API: the review read, judged on real PRs on 2026-10-27. dalmaer/plates#216 (counts 2, 2, 2) is "repeating: no convergence". dalmaer/plates#249 is "repeating": its round-2 finding is 3 lines from round 1's, in the validation that round 1's fix added.

## Proof

Automated: `node --test tests/review-rounds.test.mjs tests/board.test.mjs` proves the verdicts, the extension, the cap and the board titles, against a stub gh. `npm run check` runs the full gate.

By hand: no walk is needed. Each verdict is printed with its reasons, so the owner can overrule it by merging, splitting or closing as before.

## Deliberately open

`REVIEW_NEAR` (20 lines) is a proxy for "the fix drew this finding". It reads the line each finding was made on, not the fix commit's diff. Two unrelated findings 20 lines apart in one file read as repeating, and a fix-of-fix more than 20 lines from its finding reads as new ground. The judgement errs toward stopping, which is the phase-71 behaviour. Reading the fix diff would settle it, at one more API call per round.

## Next action

Land the PR, then watch the board's first extended review.
