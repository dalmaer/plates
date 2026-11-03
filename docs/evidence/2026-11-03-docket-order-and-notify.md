# Evidence: phase 175 — the docket puts what blocks agents first, and a notification opens it

- Date: 2026-11-03
- Phase: 175, The docket puts what blocks agents first, and a notification opens it
- Revision: branch claude/phase-175 on origin/main, and this record
- Claim being checked: the docket is ordered blockers → quick decisions → walks in one model for both forms; every item has an estimate and the Start panel totals them; a quick-ones session; each item says what its answer sets moving; a push "N new for you" opens /review at most once a day and never in quiet hours.

## Automated checks

- `node --test tests/work-items.test.mjs tests/web-review.test.mjs tests/push.test.mjs` — exit 0, 19 pass, 0 fail (conductor).
- Named tests: "the docket starts with what blocks agents" (a PR at its round limit blocks, one in round 1 of 3 is a decision); "every item says how long it takes"; "a quick session holds only quick items" (view, route, client and `plates home --review --quick`); "new docket items notify once and open the session" (PGlite SQL015 and SQL017, a decrypting fake push service, quiet hours, the worker opening /review).
- The notification counts only plates read successfully; a failed refresh or an unreadable plate keeps the baseline, so its recovery does not notify (tests in push.test.mjs). Nothing is sent until `quietHours` is configured.
- Builder's focused runs after the fixes: 232/232, exit 0. The whole gate, `npm run check`, runs through `plates integrate` after this file is written.

## How it was built: a paired trial

Two builders built this phase from the same brief in separate checkouts. Builder B's brief added ponytail's "smallest complete change" and "never cut" rules (github.com/DietrichGebert/ponytail at 96608e0), with plates's override that records and proof are part of the change.

| | A (plain brief) | B (ponytail appendix) |
| --- | --- | --- |
| Product code | +291 / −46 | +179 / −52 |
| Tests | +320 / −15 | +305 / −25 |
| Builder tokens | 333k | 286k |
| Wall time | 55 min | 39 min |

A blind reviewer, given the two diffs as X and Y, judged A slightly better. B defaulted quiet hours to UTC (a 02:00 local push for the owner), added the Start line to the web only, merged two plates' moves into one, and could never notify while any manifest plate was unreadable. A had two bugs: every review was grouped as blocking, and a failed plate lowered the notification baseline. Both were fixed before landing (f136bb86, ff97a1c3). One trial; not enough to adopt or reject the appendix.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Owner sets `quietHours` in PLATES_WEB_CONFIG, deploys, and gets "N new for you" on the phone | one push, opens /review | Not run | The ⚑ walk |

## Gaps and decision

- Partial, owes the owner's walk; needs `quietHours {timeZone, from, to}` in PLATES_WEB_CONFIG.
- Phase 152's per-item pushes do not follow quiet hours, and can arrive in the same read as the docket push.
- "Sets moving" fills only where the model knows a dependent phase or a freed claim; a walk on an owes-walk phase frees nothing.
