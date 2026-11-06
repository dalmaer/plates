---
status: partial
owes: walk
since: 2026-11-03
goal: G7
spec: 2
depends: [174]
note: "Built and proven by test: a ready PR (the merge rule passes, checks green, not a draft) is one card in the docket; plates home --answer <pr> merge merges it with gh at the card's head, and the web merge is a digest-bound, journaled preview/apply through the App that refuses a moved head. The App's Pull requests write grant and the owner's merge remain."
evidence: []
---

# A pull request that is ready can be merged from the docket

## Done when

A PR whose checks are green and whose reviews are answered appears in the docket as one card, and **Merge** merges it through the GitHub App, with the same rule the merge follows today. `plates home --answer <pr> merge` does the same from a terminal.

## Scope

- **Which PRs:** open PRs on authorized plates whose required checks pass, whose review findings are all answered (`plates review`), and which are not drafts. A PR at its review-round limit stays the owner's choice, as now.
- **The card:** title, the plate, what it changes in one line, checks, the review verdict, and a link to the diff.
- **Answers:** Merge / Request changes (with a why, posted as a review comment) / Not now.
- **The write:** a merge through the App installation, with the repo's own merge method, refused when the head moved since the card was shown (the head SHA is part of the answer).
- ⚑ **The App needs "Pull requests: Read and write"** on the plates installation, which is the owner's change in GitHub. No cost.
- Out of scope: auto-merge, and merging anything not on an authorized plate.

## Integration increments

1. Ready PRs in the model and on the card, read-only, with Merge shown as unavailable and the reason until the permission is granted.
2. ⚑ The owner grants the permission.
3. Merge and Request changes wired, with the head-moved refusal.

## Acceptance

- [x] Only PRs with passing checks and answered reviews appear, and a draft or a PR with unanswered findings does not: `tests/work-items.test.mjs: "only a ready pull request reaches the docket"`
- [x] A merge is refused when the head moved after the card was shown: `tests/web-review.test.mjs: "a merge is refused when the head moved"`
- [x] Without the permission, Merge is shown unavailable with the reason in both forms: `tests/home-isomorphism.test.mjs: "merge says why it is unavailable"`
- [ ] ⚑ by hand: the owner merges one real PR from the session.

## Your part

- **Ask:** In a review session, merge one pull request that is ready, from its card.
- **Why:** This settles whether merging from the docket is safe and quick enough to replace copying commands.
- **Look at:** The PR card: is what you are merging clear before you tap?
- **Choices:** Merged, clear | Merged, but unclear (say what) | Didn't trust it
- **Takes:** About 2 minutes.
- **Then:** Merged, clear: built. Otherwise the card changes here.
- **Ready when:** the App has "Pull requests: Read and write" on the plates installation.

## Real surfaces

- GitHub API: a real merge through the App installation on a fleet repo.

## Proof

Automated: `node --test tests/work-items.test.mjs tests/web-review.test.mjs tests/home-isomorphism.test.mjs`; `npm run check`.
By hand: the owner's merge.
⚑ The App permission change, made by the owner in GitHub. No cost.

## Deliberately open

- **Request changes as a review or a comment.** Proposed: a review comment, so it counts in `plates review`.

## Next action

Owner: grant the Plates GitHub App "Pull requests: Read and write" (and Checks read) on the plates installation (activation step github-app-pull-requests-write), then merge one ready PR from a review session.

## Trajectory

- **2026-11-06** — Increments 1 and 3 built together, gated: the merge rule moved into the night practice (mergeRule), so plates review --gate, plates release and the docket apply one rule. A review item (findings unanswered) no longer lists Merge. The web merge needs decisionWrites and the App's Pull requests and Contents write, and says which is missing. Request changes posts from the terminal only; the hosted workspace lists it unavailable. With several merge methods allowed, squash is chosen, then merge, then rebase, and the preview names it. Evidence: lib/pr-ready.mjs, lib/web/pr-merges.mjs.
