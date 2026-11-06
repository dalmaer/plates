---
status: partial
owes: walk
since: 2026-11-06
goal: G7
spec: 2
depends: [178, 174]
note: "Built: /review/yours runs the Yours lane with a peek, an honest running total, Not now with a reason (already sealed in SQL017, no migration) and 'All caught up' only after a complete read. Owes the owner's walk."
evidence: ["evidence/2026-11-06-lane-session.md"]
---

# My lane is a session I can finish

## Done when

Starting from Yours opens the review session with a peek at the next card, "N left · ~M min", Not now with a reason, and "All caught up" at the end. See [the backlog spec](../specs/web-backlog.md).

## Scope

- Extend `lib/web/review-client.mjs` and `review-views.mjs`; existing answer keys and Undo unchanged.
- Not now gains an optional reason: kept in the local store and inside SQL017's sealed record (no new migration), bounded length.
- Out of scope: new answer kinds.

## Integration increments

1. The reason field in both stores, optional, unused by views.
2. The peek, running total and end state in the session.

## Acceptance

- [x] The running total uses Takes and `DEFAULT_MINUTES`, and says "at least" when one is unknown: `tests/web-review.test.mjs: "session time is honest"`
- [x] A Not now reason survives reload in both stores: `tests/not-now.test.mjs: "a reason is kept"`
- [x] The session ends in "All caught up" only when the lane is read completely: `tests/web-review.test.mjs: "caught up needs complete coverage"`
- [ ] ⚑ by hand: the owner.

## Your part

- **Ask:** Clear five items from your lane in one sitting.
- **Why:** It settles whether the session makes your turn faster.
- **Look at:** The "N left · ~M min" line when you start.
- **Choices:** Faster than before | About the same | Slower (say where)
- **Takes:** About 15 minutes.
- **Then:** Faster: built. Otherwise the session changes here.
- **Ready when:** phase 178 is deployed.

## Real surfaces

- adopted project: the hosted workspace on the owner's phone runs the session end to end.
- owner's machine: a Not now reason is read back from the hosted store.

## Proof

Automated: `node --test tests/web-review.test.mjs tests/not-now.test.mjs`; `npm run check`.
By hand: the owner's session.
⚑ None: the reason already lives in SQL017's sealed record.

## Deliberately open

Whether quick items (2 minutes or less) lead by default. The owner's walk settles it.

## Next action

Deploy, then the owner's walk: clear five items from Yours in one sitting (Your part).

## Trajectory
- **2026-11-06** The Not now reason already lived in the sealed SQL017 record (since phase 173), so no migration 019; a plain column would have put the owner's words in clear text.
