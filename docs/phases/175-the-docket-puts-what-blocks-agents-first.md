---
status: planned
since: 2026-11-03
goal: G7
spec: 2
depends: [174, 152]
note: "Owner, 2026-11-03: 'The job is for me to jump in and keep plates spinning.' The session should start with what agents are waiting on, say how long it takes, and be one tap away from a notification."
evidence: []
---

# The docket puts what blocks agents first, and a notification opens it

## Done when

The docket is ordered by what the owner's answer sets moving, each item says about how long it takes, the session can be cut short ("the quick ones"), and a push notification about new items opens straight into the session.

## Scope

- **Order**, in the model (`lib/work-items.mjs`), the same in both forms:
  1. items an agent or the night is blocked on: stale claims, ⚑ approvals, PRs at their round limit;
  2. quick decisions (health proposals, walks with choices that take a minute or less);
  3. walks that need a device or real time.
  Within each group, the oldest first.
- **How long:** each item carries an estimate, from its "Your part" **Takes** line where it has one, else a default per kind. The Start panel totals them.
- **Shorter sessions:** Start review offers "Everything" and "Quick ones (≤ 2 min each)".
- **What it sets moving:** each item names what its answer unblocks (a phase that can start, a claim freed, a night lane). The card shows it, and the end screen totals it.
- **Notification:** when new items reach "Needs you", phase 152's push says "N new for you" and opens `/review`. At most one a day, never in quiet hours.
- Out of scope: merges (phase 176).

## Integration increments

1. Order and estimates in the model; both forms follow.
2. "What it sets moving" per item, and the end-screen total.
3. The quick-ones session.
4. The notification, behind phase 152's existing subscription.

## Acceptance

- [ ] Items an agent is blocked on come first, then quick decisions, then walks, the same in both forms: `tests/work-items.test.mjs: "the docket starts with what blocks agents"`
- [ ] Every item has an estimate, and the Start panel's total is their sum: `tests/work-items.test.mjs: "every item says how long it takes"`
- [ ] The quick-ones session holds only items of 2 minutes or less: `tests/web-review.test.mjs: "a quick session holds only quick items"`
- [ ] A notification for new items is sent at most once a day, never in quiet hours, and opens `/review`: `tests/push.test.mjs: "new docket items notify once and open the session"`
- [ ] ⚑ by hand: the owner gets the notification on the phone and lands in the session.

## Your part

- **Ask:** When the "new for you" notification arrives on your phone, tap it and do the quick ones.
- **Why:** This settles whether a nudge gets you in and out fast enough to keep the agents moving.
- **Look at:** The first card after tapping the notification.
- **Choices:** Fast enough | Too many nudges | Too slow to get in
- **Takes:** About 5 minutes.
- **Then:** Fast enough: built. Either other choice changes the rule here.
- **Ready when:** phase 174 is built and push notifications (phase 152) work on the owner's phone.

## Real surfaces

- owner's machine: the notification on the owner's phone, opening the deployed workspace.

## Proof

Automated: `node --test tests/work-items.test.mjs tests/web-review.test.mjs tests/push.test.mjs`; `npm run check`.
By hand: the owner's notification walk.

## Deliberately open

- **The per-kind default estimates.** Settled from the Takes lines the fleet already has.

## Next action

After phase 174: order and estimates in the model, increment 1.
