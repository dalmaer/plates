---
status: planned
since: 2026-11-03
goal: G7
spec: 2
depends: [174]
note: "Merging is the owner's step on fleet repos. Today it means copying a gh command into a terminal; the review session should offer it as one card."
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

- [ ] Only PRs with passing checks and answered reviews appear, and a draft or a PR with unanswered findings does not: `tests/work-items.test.mjs: "only a ready pull request reaches the docket"`
- [ ] A merge is refused when the head moved after the card was shown: `tests/web-review.test.mjs: "a merge is refused when the head moved"`
- [ ] Without the permission, Merge is shown unavailable with the reason in both forms: `tests/home-isomorphism.test.mjs: "merge says why it is unavailable"`
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

After phase 174: ready PRs on the card, read-only (increment 1).
