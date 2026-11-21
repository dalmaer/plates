# Phase contract

Adapted from ritmo's, which adapted ledger's, which adapted isocan's. Each
numbered file owns its status; [`../ROADMAP.md`](../ROADMAP.md) is generated
from these files and [`../goals.json`](../goals.json), and CI fails when it
is stale.

## Integration increments

A phase owns an outcome, not a long-lived branch. Before building, record the
first independently safe merge, its compatibility constraints, proof and recovery.
Land checked increments throughout the phase; do not wait for full feature
exposure. Keep remaining acceptance unchecked and name the next increment.
Merged, deployed/installed, enabled and verified are separate observations, not
new phase statuses. Consult the project philosophy named by its working guide.

## Status vocabulary

| Status | Claim |
| --- | --- |
| planned | Outcome and proof plan exist; design or implementation is still open. |
| designed | The slice and its contracts are specified well enough to build. |
| partial | Some of it exists; the note names the gap. |
| built | Every acceptance box is checked but a walk to try (`⚑ try:`, below), with an evidence file; real use is not yet claimed. |
| lived-in | Repeated real use supports the outcome. The evidence says what made you sure. (When the project opts in: `"phases": {"livedIn": true}` in `.plates/plates.json`.) |
| superseded | Retired or replaced; the note says why and points at the replacement. |

A status can move backward when evidence says so; update `since` and say why.

Lived-in is a project's choice, off by default. Off, the roadmap's headline
and goal lines count built only and nothing asks for lived-in; a phase that
says `lived-in` stays valid and done. On (`"phases": {"livedIn": true}`),
they count lived-in too.

## Metadata

One flat `key: value` per line between `---` delimiters — deliberately not
general YAML. Strings bare or JSON-quoted; lists are JSON arrays.

```yaml
---
status: planned
since: 2026-10-02
goal: G1
spec: 2
depends: [0]
note: "One line: why it stands where it does."
evidence: []
issue: 3
---
```

Optional: `review: wait` (the only value; absent is the default) for a
phase you are nervous about. It lands through a PR instead of a push to
`main`, and merges when `plates review <repo>#<n> --gate` exits 0: every review
comment answered, and each reviewer named in `.plates/plates.json` `"review"` has
reviewed the head commit. The phase's issue labelled `keel:wait-for-review`
does the same. Without it nothing waits: review comments are still validated
and answered, but never block a merge.

**Trying the work by hand is an invitation, never a gate.** A walk is
trying the work and seeing it (signing in and seeing today's cards, an update
seen landing on a phone). Walks are optional: new phases write none in
Acceptance. Instead each PR an agent opens for a phase carries a `## Try it`
section: what changed (one line), where to try it (a preview URL, the
deployed site, or a build), three to five steps, and what working and broken
look like; the agent tries the steps itself first where it can, and says what
it saw. A missing Try it is a note, never a refusal. A phase that does list a
walk writes it `⚑ try: <who>: <what they try and see>`: an open one never
holds the phase back from built, and Home lists it as an optional Try it
(Works, Something's off, Skip), never as work waiting on the owner.

The check never guesses from prose: a `⚑ by hand: <who>` box may be a
decision, an approval or a setup step, so it must be checked before built,
as before. Only `⚑ try:` marks a walk.

A ⚑ step that needs money, a cloud resource, a login or a named person's
decision is not a walk: it is an ask on the Proof's ⚑ line, with a Your part
when the owner must answer it, and it waits for the owner as before.

Older records may still carry `owes: walk` (the only value) on a **partial**
phase whose building is done and whose rest is a walk: the check reads it, and
nothing suggests it any more. Its dependents' `depends:` are satisfied,
`npm run next` skips it, the roadmap shows it as *partial, walk owed*, and the
night's `phases_stuck` does not count it. The check refuses `owes:` on any
other status, and refuses `owes: walk` while an unchecked Acceptance box is
still buildable. A box is a walk when it is `⚑ by hand: …` or its check is a
command that runs on a real surface (`` `gh …` ``), and it cites no
`tests/` path; any other unchecked box counts as buildable. Beside it,
`waits: owner | time | external` says whose walk it is (absent is `owner`).
Moving such a phase to `built` is all it needs now.

Optional: `after: YYYY-MM-DD`, the first day the phase is buildable.
`npm run next` skips it before that day (a dependent waits with it). The
generated roadmap never reads the clock: it names the phase *on or after* its
date, whatever the day, so a day passing never makes it stale.

`evidence` paths are relative to `docs/` (`evidence/2026-10-02-x.md`); built
and lived-in need at least one. A phase with every Acceptance box checked
and evidence named can't stay planned, designed or partial: the check fails
until its status moves. The filename number is the phase id; never renumber.

## Sections

Required, in any order: **Done when** (one sentence someone else could check),
**Scope**, **Acceptance** (checkboxes), **Proof** (exact commands, and what a
person must do), **Deliberately open** (decisions postponed on purpose — settle
them in place, dated; and each known limitation that could make the phase's
output wrong, a suggestion, a count or a verdict, with its effect and when it
is settled, never only in the design's prose), **Next action** (one concrete step; `npm run next`
prints it; once the phase is built, `None.`, or what lived-in needs when
the project counts lived-in).

With `spec: 2`, also **Real surfaces** (below).

Optional: **Trajectory**, after Next action — written by the conductor, only
for what changed the course: `- **YYYY-MM-DD** — Claim. Evidence.` A phase
that went as planned says so in one line. Work done is not trajectory; git holds it.
A defect found after a phase was built is an escape: record it in that
phase's Trajectory as `- **YYYY-MM-DD** — Escape: What escaped. Where it was
found.` The night counts these lines (`escapes`), with `fix:` commits and
lessons of the project's own; an Escape line naming another phase counts
against that one.

Optional: **Your part**, after Acceptance, for a phase whose owner must
decide something or do a ⚑ step (never for trying the work by hand: that is
each PR's Try it). It says what the owner is asked in plain words, for
someone who has not read the phase (no "lever", "walk" or bare phase numbers):

```
## Your part

- **Ask:** <one sentence: what the owner does>
- **Why:** <one sentence: what it settles or unblocks>
- **Look at:** <one line; may link [text](url)>
- **Choices:** <Choice A> | <Choice B> | …
- **Recommend:** <Choice A>   (optional: an exact Choices label)
- **Keeps it open:** <Choice B>   (optional: choices that leave the walk open)
- **Takes:** <about how long, e.g. 5 minutes>
- **Then:** <what happens after, per choice where they differ: "Choice A: …. Choice B: …">
- **Ready:** yes
```

`**Ready when:** <what must happen first>` in place of `**Ready:** yes`
means the owner cannot act yet: `plates home` lists it as waiting, with that
reason, never as the owner's. A Markdown table of the data may follow the
bullets. Two or more walk boxes: one `### ` sub-heading per box, in the
boxes' order. A choice records the decision (`plates walk done <n> --choice
"<choice>"`); Then says what happens next.

A multi-choice answer checks acceptance only when its exact Choices label has a
Then clause `Choice A: the phase is built.` (or `Choice A: built.`). Each clause
must contain only that declaration; conditional or other prose records an answer
and leaves the walk open. Multiple choices may declare completion. With no
completion declaration, a single-choice walk retains the legacy completion
behavior. Observation-only walks without Choices still work; a note alone cannot
complete a multi-choice walk. **Keeps it open** always leaves acceptance unchecked.
`Retire it`, or a choice whose Then clause is `the phase is superseded.` or
`the phase is retired.` (also `superseded.` or `retired.`), records retirement as
`status: superseded`, never built, and leaves acceptance unchecked. The choice's
Then remains the next action for any follow-up. Completing a walk marks the phase
built only when no other acceptance boxes remain open.
`--check` notes, never refuses, a phase with an open walk and no Your part,
and a Your part with no Ask, no Choices or no Ready. For every spec version,
it refuses a supplied **Recommend:** that is not an exact member of **Choices**.
Omitting Recommend is allowed; superseded phases are exempt from these checks.

Use [the template](../templates/phase.md). After editing: `npm run roadmap`,
then `{{check}}`.

## A spec says how it will be proven

`npm run roadmap` lists a phase as soon as it parses; `--check` (CI) also
reads it as a spec:

- **Template text fails, at any status** but superseded: a line of the
  template's placeholder text left in any section, or its title. The check
  and the template share one list (`PLACEHOLDERS` in `scripts/roadmap.mjs`).
  An empty Done when, Acceptance or Proof fails too.
- **`spec: 2`** (the template writes it, so `plates phase new` does) holds a
  phase to two more rules:
  - Each Acceptance box names its check: a cited test,
    `tests/<file>: "<test name>"`; a command in backticks (a program and its
    arguments, like `` `npm run check` ``); `⚑ by hand: <who>` for a step only
    a person can do (a decision, an approval, a setup step); or `⚑ try:
    <who>: …` for a walk (above).
  - A **Real surfaces** section lists where the change runs for real, one
    `- <surface>: <its proof>` line each, from a closed list: published
    package, workflow shell, adopted project, owner's machine, GitHub API,
    fleet over time. A surface with no proof after the colon fails, and so
    does a word off the list. A change that runs nowhere new (a doc, a
    test) says the single line `none`.
- A phase without `spec` is held to neither rule. When it is built and a
  box names no check, `plates doctor` notes it (`acceptance-unchecked`,
  information); bring it up to date when it is next edited, never by
  rewriting a built phase for the lint.

A built phase's cited tests and evidence paths are watched by the night
(`proofs_hold`): one that disappears is *proof lost*, for a person to
re-point or to step the phase back.
