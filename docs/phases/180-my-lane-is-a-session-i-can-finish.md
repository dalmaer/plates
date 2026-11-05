---
status: planned
since: 2026-11-05
goal: G7
spec: 2
depends: [178, 174]
note: "Specified in docs/specs/web-backlog.md. Extends the review session of phase 174."
evidence: []
---

# My lane is a session I can finish

## Done when

Starting from Yours opens the review session with a peek at the next card, "N left · ~M min", Not now with a reason, and "All caught up" at the end. See [the backlog spec](../specs/web-backlog.md).

## Scope

- Extend `lib/web/review-client.mjs` and `review-views.mjs`; existing answer keys and Undo unchanged.
- Not now gains an optional reason: a hosted migration for `plates_home.not_now`, the local store, bounded length, metadata only.
- Out of scope: new answer kinds.

## Integration increments

1. The reason field in both stores, optional, unused by views.
2. The peek, running total and end state in the session.

## Acceptance

- [ ] The running total uses Takes and `DEFAULT_MINUTES`, and says "at least" when one is unknown: `tests/web-review.test.mjs: "session time is honest"`
- [ ] A Not now reason survives reload in both stores: `tests/not-now.test.mjs: "a reason is kept"`
- [ ] The session ends in "All caught up" only when the lane is read completely: `tests/web-review.test.mjs: "caught up needs complete coverage"`
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
- owner's machine: a Not now reason is read back from the hosted store after the migration.

## Proof

Automated: `node --test tests/web-review.test.mjs tests/not-now.test.mjs`; `npm run check`.
By hand: the owner's session.
⚑ A hosted migration on the existing Supabase Free project. No cost.

## Deliberately open

Whether quick items (2 minutes or less) lead by default. The owner's walk settles it.

## Next action

Add the optional reason to the local Not now store with its test.
