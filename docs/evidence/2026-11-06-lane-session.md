---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 180 — my lane is a session I can finish

- Date: 2026-11-06
- Phase: 180
- Revision: "a reason is kept, in both stores" (7aad9132), "/review/yours: the lane as a session" (945e40d9), and this record's commit
- Claim being checked: Start on Yours opens a session over exactly that lane, with a peek, an honest running total, Not now with a reason, and "All caught up" only after a complete read.

## Automated checks

- The builder ran `npm run check:focused` over web-review, not-now, web-events, web-backlog, web-design, web-operation-coverage, names-verify, surface-budget, web-activation-plan, guides, work-items and home-isomorphism: exit 0, 253 pass. `npm run render:check`: exit 0.
- Acceptance tests: tests/web-review.test.mjs "session time is honest" and "caught up needs complete coverage"; tests/not-now.test.mjs "a reason is kept", covering the CLI file and SQL017 on PGlite through the service's own sealing. The row holds no reason text in the clear.
- The conductor's review of the scope: no migration 019 is needed. Since phase 173 the Not now reason has lived inside the sealed `value` of `plates_home.not_now`. A plain column would have stored the owner's words in clear text.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Owner clears five items in one sitting | Faster than before | Not run: waits on the deploy | |

## Gaps and decision

Partial; owes the owner's walk. `estimateOf` no longer guesses 5 minutes for a kind with no default, so an unknown shows as "at least". The new sheet `/assets/review-session.css` has its own 450-byte cap.
