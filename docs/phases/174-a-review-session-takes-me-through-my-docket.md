---
status: planned
since: 2026-11-03
goal: G7
spec: 2
depends: [173]
note: "Owner, 2026-11-03: 'launch into a review session that feels like launching a ledger study session. I get full screen review items where I act on them… big buttons at the bottom… let me go through each item on the docket. The job is for me to jump in and keep plates spinning!!'"
evidence: []
---

# A review session takes me through my docket, one item at a time

## Done when

From Home, one tap starts a full-screen session that shows each item waiting on the owner as one card, answered with big buttons at the bottom, and ends on a summary of what was settled and what it set moving. `plates home --review` walks the same items, in the same order, in a terminal.

## Scope

- **Start.** Home's top shows one panel, "N for you · about M min", with **Start review**. It replaces the toolbar as the first thing on a phone. With nothing waiting it says so plainly and shows no button.
- **The card**, full screen, phone first:
  - a progress bar and "3 of 7", and a close control that ends the session (what was answered stays answered);
  - chips: the plate, the kind, the time it takes;
  - **the ask**, large; **why**, in one or two lines; **look at**, one tap to the evidence, PR or page (a new tab, so the session keeps its place); **if you do nothing**;
  - item text is rendered with `lib/web/markdown.mjs` (inline markdown, escaped).
- **The bottom bar**, in the thumb zone, at least 44px high: the item's answers from phase 173 as big buttons, the recommended one filled; then **Add why** (a one-line field, required where the answer needs it) and **Not now**.
- **Sending.** An answer is held for about 5 seconds with **Undo**, then written through its writer, while the next card is already showing. A failed write comes back as a card at the end of the session with the reason, never lost.
- **The end.** What was settled, each with its link (commit, issue or branch), what was put off, and what it set moving: phases that can now start, claims freed, agent issues filed.
- **Desktop keys:** 1–4 choose an answer, W adds a why, N is Not now, ← goes back one card, Esc ends.
- **The terminal:** `plates home --review` shows one card at a time with numbered answers, and the same sending and summary (no Undo window: it asks before each write).
- Out of scope: ordering and estimates beyond the model's order (phase 175), notifications (175), merges (176).

## Integration increments

1. The session view behind a URL (`/review`), reading `/api/home`, with answers wired, but no Start panel yet. Safe: nothing links to it.
2. The Start panel on Home.
3. `plates home --review`.

## Acceptance

- [ ] The session shows every item in "Needs you", one per card, in the model's order, and the CLI session shows the same items in the same order: `tests/home-isomorphism.test.mjs: "a review session walks one docket in both forms"`
- [ ] An answer is written after the Undo window, Undo inside it writes nothing, and a failed write returns as a card at the end with its reason: `tests/web-review.test.mjs: "an answer is sent after its undo window, and a failure comes back"`
- [ ] An answer that needs a why cannot be sent without one: `tests/web-review.test.mjs: "an answer that needs a why waits for it"`
- [ ] At 390px the answers sit in the bottom bar, every control is at least 44px high, and nothing overflows: `tests/web-responsive.test.mjs: "the review card fits a phone"`
- [ ] The end screen lists each write with its link, and what it set moving: `tests/web-review.test.mjs: "the session ends on what it settled"`
- [ ] ⚑ by hand: the owner runs a real session on the phone.

## Your part

- **Ask:** On your phone, open plates, tap Start review, and go through the items waiting on you.
- **Why:** Only you can say whether this is how you want to keep plates moving.
- **Look at:** The first card: is it clear what is being asked, and can you answer it without leaving?
- **Choices:** This is it | Close, but (say what) | Not the right shape
- **Takes:** About 15 minutes.
- **Then:** This is it: built. Close, but: the named thing is fixed here. Not the right shape: the design changes before more is built.
- **Ready when:** phase 173 is built and this phase is deployed.

## Real surfaces

- owner's machine: the deployed workspace on the owner's phone, and `plates home --review` in a terminal.

## Proof

Automated: `node --test tests/web-review.test.mjs tests/home-isomorphism.test.mjs tests/web-responsive.test.mjs`; `npm run check`.
By hand: the owner's session on the phone. "Not the right shape" changes the design.

## Deliberately open

- **Swipe gestures.** Buttons first. Swiping (for Not now) is added only if the owner asks after the walk.
- **The Undo window's length.** 5 seconds is proposed; the walk settles it.

## Next action

After phase 173: build increment 1, the session view at `/review`.
