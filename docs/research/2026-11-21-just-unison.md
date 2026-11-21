# Just Unison: plans with proof, without plates — 2026-11-21

A design note, not a phase. It sketches where plates could end up if Unison
(digitalex/unison, MIT, self-hostable) becomes the one tool a project is run from.
Phases 200–203 are the first steps on the way. Everything past them is a proposal
until it is filed as phases here, or specced in Unison.

## The goal

Run a project entirely from Unison, with no plates install, no plates site and no
`plates` command. Keep what made plates worth having: work described as outcomes,
each outcome proven before it counts as done, and the person asked only for what
only a person can do.

Most Unison users will never want any of this, so it has to be:

- **off by default**, so a plain workspace stays a plain backlog and chat;
- **one switch to turn on**, with no files to write and no CLI to learn;
- **usable per item**: a big piece of work can be planned while small items stay plain.

## What we keep, and what we drop

Plates grew a lot of machinery. Most of it was there to make up for not having a
shared workspace, or to measure plates itself. Only a few ideas carry the value:

| Keep: the ideas | Drop: the machinery |
| --- | --- |
| **An outcome, not a task.** Each planned piece says what will be true when it's done ("Done when"). | Spec versions, the roadmap renderer, the phase-file parser's many checks |
| **Every check is named.** Each acceptance line says what proves it: a test, or a link someone vouches for. | Impact reconciliation, decision records, trajectory sections |
| **Proof before done.** A planned item can't close until each check points at its proof. | Evidence files written by hand |
| **Ask the person only what only a person can do.** Decisions and setup steps go to them as cards with choices. Trying the work by hand is an invitation, never a gate (see "Try it"). | Plates' own Home, backlog, chat, Recurring and agents pages |
| **Order respects dependencies.** A planned item waits for the items it needs. | Claim branches, attach receipts, the integration lock |
| **"Not read" is never "nothing".** A source that can't be read is reported, never shown as empty. | Night-shift climbs, budgets, health metrics, "does plates help" |
| **Small, safe steps.** A plan can split into parts that each land on their own. | Fleet-wide managed files and lesson catalogues (see "Across projects") |

## The model: three additions to a Unison item

With the mode on, any backlog item *can* be a planned item. A planned item is an
ordinary item with three optional parts:

1. **Done when:** one paragraph saying what will be true.
2. **Checks:** a short list. Each check is a sentence, plus what proves it:
   - `test: <file> › <test name>`, proven by a CI run on the merged commit;
   - `link: <url>`, a manual proof (a dashboard, a release, a recording) that someone vouches for.

   There is no walk check. Trying the work by hand is optional: see "Try it" below.
3. **Needs** (optional): the items it waits on. It stays in its place in the Backlog,
   dimmed, until they are done.

Goals become a label, if anyone wants them. Increments become child items, or
simply more planned items with Needs.

**Where the plan lives.** By default, in Unison. The item *is* the plan, edited
like any other item, with its history in Unison's activity log. That is the main
simplification: no phase files, no PRs just to plan, no parser.

The trade-off is real. Plates kept the contract in git because git is reviewable,
diffable, works offline and outlives any tool. The answer here is to keep the
**proof** in git and GitHub, where it already lives, and let the **plan** live in
Unison:

- Proof is a merged PR, a CI run on its merge commit, and the named tests that ran
  in it. All of that stays in GitHub whatever happens to Unison.
- A project that wants its plan in git too (plates itself, for one) can turn on
  **export**. Unison then writes each planned item to `docs/plans/<n>-<slug>.md` by PR
  when it is accepted and when it changes. Export is optional, one way, and never needed.

## The flow

1. **You add an item**, in plain words: "Add dark mode to the site".
2. **You press Plan this** on it, or leave it plain. Small things never need a plan.
3. **An agent plans it.** Whichever agent picks up the plan request follows the
   mode's instructions, which Unison serves in its agent guide when the mode is on.
   It proposes:
   - the Done when;
   - checks, each with its kind of proof;
   - and, for big items, a split into two or three planned items with Needs.
4. **You accept from "For you".** A card shows the proposed plan with the choices
   Accept, Change it and Split differently. To change it, you reply in the thread.
5. **Agents build it**, in Backlog order, once each item's Needs are done. They claim
   the item, link PRs to it, and post progress and questions in its thread.
6. **Proof attaches itself where it can.**
   - When a linked PR merges and CI passes, each `test:` check whose test ran and
     passed in that run is ticked, with a link to the run.
7. **The agent writes a "Try it"** when its PR is ready (see below). Nothing waits on it.
8. **The item closes** when every check has *verified* proof: a test seen passing in
   the proof report, or a link a person accepted. Agent-vouched links stay on the item
   as evidence but never close it. Closing with any check unverified needs a person's
   explicit "close without proof", and the item shows it.

**Proof is bound to what it proved.** Each proof records the version of the Done when
and of its check that were current when it was attached. Editing either one marks
that proof stale. The check needs fresh proof, such as a run after the change, before the
item can close.

## Try it: walks become optional

In plates, a walk ("try this on your phone and tell me") was an acceptance box, and the
phase wasn't built until a person had done it. That made people the bottleneck, and the
walks piled up as chores. Here, trying the work by hand is something you choose to do:

- **The agent writes it.** When an agent's PR is ready for review (or merged), it adds
  a short **Try it** to the PR and to the item's thread:
  - what changed, in one line;
  - where to try it: a preview URL, the deployed site, or a build to install;
  - three to five steps;
  - what you should see, and what would mean it's broken.
- **It's an invitation.** It shows on the item and as a light, dismissable entry in
  "For you", grouped so a busy day doesn't turn into a list of chores. It never blocks
  the item from closing, and it expires quietly when the next change to the same area
  lands.
- **You tap one of three answers:** Works, Something's off, or Skip.
  - **Works** is recorded on the item as a human try, alongside its proof.
  - **Something's off** opens a follow-up item, linked to the PR, with your note. The
    original item stays closed if its checks passed; the follow-up carries the fix.
  - **Skip**, or doing nothing, is fine.
- **The agent tries it first, where it can.** Before writing a Try it, the agent runs
  the steps itself where it has the means: a browser against the preview URL, a
  simulator, a screenshot or a short recording. It attaches what it saw. A person's try
  is then a second look, not the only look.

What this gives up: a person's check is no longer guaranteed before work counts as done.
What replaces it is named tests in CI, the agent's own try with screenshots, and a
person's optional try. A project that really needs a human gate for some work, such as
a payment flow or an App Store build, can add a `link:` check whose proof is a person's
recorded Works. That is opt-in per check, not the default.

## How proof gets checked without plates

Two small pieces do the work plates' tooling did.

1. **A proof report from CI.** The mode offers a one-line CI step to add to the repo
   (a GitHub Action from the template). It publishes each test that ran and passed,
   as its repository-relative file path plus its test name, in the check run's output.
   Unison reads the run for a merged PR's commit and ticks a `test:` check only when
   both the file and the name match. Without the step, an agent can link a run as
   evidence. The check then shows as vouched for, not verified, and it can't close the
   item on its own.
2. **Unison's own rules.**
   - An item can't close with unverified or stale checks unless a person says so.
   - Agents can't answer decisions, or record a Works on a Try it.
   - Decisions, setup steps and Try it invitations live in a section only people can act on.

That is deliberately less than plates enforced:
- no red-without-fix proof (`plates prove`);
- no review gate of plates' own;
- no impact checks on records.

Branch protection and the repo's own CI cover gating. The bet is that named checks,
plus proof attached automatically, give most of the value at a small fraction of the
cost.

## Optional and simple

| Workspace | What it sees |
| --- | --- |
| Mode off (the default) | Nothing new. Backlog, chat, Recurring, as today. |
| Mode on | A "Plan this" action on items; Done when, Checks and Needs on planned items; a "For you" section; the "close only with proof" rule; optionally, the CI proof step. |

"Plan this" is per item, so a workspace with the mode on still has plain items. The
mode adds no new concepts to items nobody plans.

## What Unison would need

In rough order of value:

1. **Sections**, with an audience (people-only sections) and whether agents may
   claim from them. "For you" is one such section.
2. **Choices and answers on items**, with an `item.answered` event.
3. **Planned-item fields:** Done when, Checks (each with a proof kind and a proof
   link), and Needs. They show as real fields, and the "close only with proof" rule
   applies to them.
4. **A plan request.** "Plan this" posts the request; an agent's proposal arrives as
   a For you card with Accept, Change it and Split differently; accepting writes the fields, or
   creates the split items.
5. **Reading CI runs.** For a merged PR's commit, read its check runs and the proof
   report, then tick matching `test:` checks. Unison already reads open PRs and their
   merge state for its reviews page.
6. **Claims with a claim number**, so an agent whose lease lapsed can't land over the
   next holder.
7. **A workspace integration token and change events** (`activity --after`, or
   outbound webhooks), for anything outside Unison that still listens: Rex, export.

Templates, a Home view across workspaces, and export to git are later and optional.

## Across projects

Plates managed files and lessons across many projects. The light version:

- **The mode's instructions live in Unison**, in its agent guide. They change in one
  place for every workspace, so there's nothing to roll out.
- **The CI proof step** is one versioned Action. Projects pin a version, and
  Renovate or Dependabot updates it like any other Action.
- **Lessons** become changes to those instructions, proposed as Ideas in any
  workspace and accepted once.
- **A Home view across workspaces** (a Unison feature) replaces plates' fleet view.

We would lose plates' fleet health metrics and its cross-project measurement. That's
acceptable.

## Getting there from plates

1. **Unison drives (plates work, under way).** Phases sync to items (200), one claim
   (201), questions and answers in Unison (202), and plates' own surfaces retired (203).
2. **Planned items in Unison (Unison work).** Sections, choices, planned-item fields,
   the close rule, Plan this.
3. **Proof from CI.** The proof-report Action and Unison reading it.
4. **Move the plates fleet over.** Each project's phases become planned items: the
   sync already links them. Plates itself keeps export on, so its plan stays in git.
5. **Retire plates.** Its CLI, site and managed practices go away. What remains is
   the proof Action and, for projects that want it, export.

Steps 2 and 3 are where the real design work is. Steps 1 and 4 are plumbing plates
already has.

## Migrating a project, then turning plates off

The step-by-step order, with what to ask Unison for and what plates does in between, is [docs/research/2026-11-21-plates-to-unison-runbook.md](2026-11-21-plates-to-unison-runbook.md). What Unison builds is [docs/research/2026-11-21-unison-spec-for-plans-with-proof.md](2026-11-21-unison-spec-for-plans-with-proof.md).

Each project moves in four stages. Plates stays installed until the last one, so every
stage before it can be undone.

**Stage 0: connected (done 2026-11-21 for the whole fleet).** Each project has a
workspace found by its GitHub repo, its open phases are items, and the mapping is in
`.plates/plates.json` (phase 200).

**Stage 1: drive from Unison, with plates underneath.** You add, order and discuss work in
Unison. Plates keeps the phase files, runs the checks and the night shift, and deploys.
It needs:
- phase changes reaching Unison on their own (phase 200, step 3);
- one claim (201);
- questions and answers in Unison (202);
- walks becoming optional Try its (204).

**Stage 2: the plan moves into Unison.** This needs Unison's planned items.
1. A one-time **import** (phase 205) writes each open phase into its item's fields:
   - Done when goes to Done when;
   - each acceptance box becomes a check (a named test is `test:`, anything else `link:`);
   - `depends:` becomes Needs.
2. The phase files are then **frozen** as history, each saying where its plan now lives.
   Projects that want the plan in git keep Unison's export instead.
3. New work starts with "Plan this".

**Stage 3: proof moves to CI.**
1. The repo gains the proof-report Action.
2. One item is proven end to end: a PR merges, its `test:` check ticks itself, and the
   item closes.
3. Evidence files stay as history.

**Stage 4: turn plates off.**
1. **`plates eject`** (phase 206) makes every file plates manages the project's own. Plates
   already supports this per file through `.plates/plates.json` `"ejected"`. Eject removes
   each file's plates markers and removes `.plates/`.
2. For each plates job, eject either keeps it as a plain workflow the project owns (the CI
   gate, cross-review, deploy) or drops it (night-shift climbs, lessons, health). Any
   night-shift job worth keeping becomes a Unison Recurring item.
3. The project leaves plates's fleet. Its workspace and history stay.

**Before turning plates off, check that:**
- every open phase is a planned item with checks;
- the proof Action has ticked at least one check;
- claims happen in Unison;
- no workflow calls a plates script;
- Recurring holds the jobs kept.

**Across the fleet:**
1. One small project goes first: study, rehearsed in
   docs/research/2026-11-21-migration-rehearsal.md.
2. The rest follow in batches. Projects with their own phase layouts (local variants, the
   projects shape) go the same way, since sync already reads them.
3. plates itself goes last, keeping export on so its plan stays in git.

## Open questions

- **Is the plan in Unison enough of a record?** Unison keeps edit history in its
  activity log, but it isn't git. Export is the escape hatch; whether it should be
  on by default is open.
- **How strict should "close only with proof" be?** A person can always close
  without proof, and the item says so. Is that the right default, or should only the
  workspace owner be able to?
- **Who plans?** Any agent following the instructions, or one named planner per
  workspace? Any agent is simpler; a named planner is more consistent.
- **How much of `plates prove`'s rigor to keep?** Plates had a check fail without a
  fix and pass with it. Nothing here does. Whether the loss shows up is worth
  watching once projects run this way.
