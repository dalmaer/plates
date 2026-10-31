---
status: planned
since: 2026-10-31
goal: G7
spec: 2
depends: [97, 151]
note: "Owner, deciding the 25 October health proposal in the hosted workspace: the question was hard to understand, shown as raw markdown, and already out of date; current reports were too large to open."
evidence: []
---

# Decisions read as plain English

## Done when

A health proposal the owner opens, in the workspace or the report, says in
plain words what is wrong, what is being decided, what Accept and Decline
each change (and what doing nothing does), whether it is still true today,
and what Plates recommends, without the reader knowing Plates' vocabulary;
and every current health report is small enough for the workspace to open.

## Scope

- The night health report's `## Proposal` keeps its first line (the
  measure, its state and the existing text) so every current reader and the
  decision writer still parse it, and adds a short plain block under it:
  what is wrong in one sentence without measure ids or raw errors, what is
  being decided, what each answer does as the code really does it, and a
  recommendation with its reason. Older reports without the block stay
  valid.
- The workspace decision page leads with that plain block (or, for an older
  report, one derived the same way), renders the proposal's markdown safely
  instead of showing it raw, and says when the newest report shows the
  measure back within its bound: "This fixed itself on <date>", with Decline
  recommended.
- The report stays small: the reconciliation observations that made reports
  grow from about 52 KB (16 October) to about 267 KB (30 October) are bounded
  in the report, with the full set kept where its readers still find it.
- A source file over the workspace's per-file limit is reported as too large
  to open, not as an unavailable connection.
- Not in scope: deploying the workspace. The hosted build moves forward in
  phase 151's activation session, with the owner.

## Acceptance

- [ ] A proposal reads as plain English: no measure id, raw command or error text in its plain block; it names what Accept, Decline and doing nothing each do, and recommends one with a reason; a report without the block still parses and can still be decided: `tests/plain-decisions.test.mjs: "a proposal says what is being decided"`.
- [ ] A proposal whose measure is back within its bound in a newer report says so and recommends Decline; one still outside does not: `tests/plain-decisions.test.mjs: "a proposal that fixed itself says so"`.
- [ ] The workspace decision page shows the plain block first and renders the proposal's markdown with no raw `**` or backticks and no unescaped HTML: `tests/plain-decisions.test.mjs: "the decision page leads with the plain question"`.
- [ ] A health report built from a fleet's worth of reconciliation observations stays under 128 KiB, and its readers (the canvas snapshot, the decision reader) still find the full set: `tests/plain-decisions.test.mjs: "a health report stays small enough to open"`.
- [ ] A source file over the workspace's per-file limit is answered as too large, naming the limit, not as a connection failure: `tests/plain-decisions.test.mjs: "a file too large to open says so"`.
- [ ] The owner opens a current proposal in the hosted workspace and can say what is being decided without help: ⚑ by hand: the owner, after the hosted build moves forward (phase 151).

## Your part

- **Ask:** Open the newest health proposal in the workspace and say whether you can tell, without help, what you are being asked to decide.
- **Why:** It settles whether decisions are clear enough to make from your phone.
- **Look at:** The decision page for the newest health report.
- **Choices:** Clear enough | Still confusing
- **Takes:** About 5 minutes.
- **Then:** Clear enough closes the phase; still confusing records what confused you and the wording is reworked.
- **Ready when:** the hosted workspace runs a build that includes this phase.

## Real surfaces

- adopted project: the owner opens a current Plates health proposal in the hosted workspace after the next activation deploy.

## Proof

Automated: `node --import ./tests/helpers/hermetic.mjs --test tests/plain-decisions.test.mjs`, each case also broken on purpose (mutation) to see it fail; the full gate through `plates integrate`.
By hand: the owner's walk above.

## Deliberately open

The plain sentence is generated from the measure's own description and state,
not written by a model; a measure with a vague description gives a vague
sentence. Settled by the owner's walk: confusing measures get their
descriptions rewritten.

## Next action

Build the plain block and the bounded report in the night practice, and the
page in the workspace, from this contract.
