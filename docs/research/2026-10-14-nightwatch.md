# Nightwatch: a night with a plan you can shape

The owner, 2026-10-14: merge isocan's `/goodnight` with keel's night, so that
there is "a default nightly plan via nightly", but "if you /goodnight you can
ask for, and be prompted for, items that you wish to focus on over night".
Their example: a performance persona checks that interactions stay under
100 ms and bundles under a size; Loop sends insights that are triaged, and the
important or easy ones are built; the plan lives on the keel dashboard and the
isocan canvas and is ticked off through the night; and in the morning an email
links to that canvas.

This note says what each side has today, what to take from each, and the five
phases that build it.

## What exists

**Keel's night** (phases 10, 11, 35–38, 54, 57), read at `8f46dce`:

- `keel-night.yml` (07:23 UTC) measures about 40 numbers against bounds that
  only tighten, writes a dated health page, opens one data-only PR and drains
  the queue. It proposes **one** change and never makes it. It spends no model
  tokens.
- Climb (`keel-climb.yml`, 10:17 UTC) and tend (Mondays) are the passes that
  build: an agent in a read-only job, a judge that runs the gate and the guard,
  a publisher that opens one PR a person merges. `climb.mjs pick` chooses the
  job from the worst measure, Loop's untriaged findings or a rotation. Nothing
  can tell it what to do tonight.
- The robot works `keel:agent` issues with a rubric, oldest first, inside a
  weekly allowance. An accepted time or hygiene proposal becomes such an issue.
- Loop (`keel-loop.yml`) files Stitch insights in `docs/loop/`; an agent may
  propose a rank; only a person decides. **Nothing builds an accepted finding.**
- The board shows whose turn it is; the canvas projects the measurements, and
  since phase 50's live cards a named card can be updated in place.
- **Missing:** a plan for the night, any way to steer it, personas, one
  account of what the whole night did, and a morning message.

**isocan** has no "nightwatch" by that name. It has two night things:

- **The night watch**, a product feature (`docs/projects/proactive-agent`,
  phases 1–6 closed 14 October). `/goodnight` opens a conversation with the
  canvas's lead agent:
  1. The agent says what was settled today, what was left open, and two or
     three things it could try.
  2. The person adds, drops or rewords.
  3. "That's the plan" writes a note with **Tonight I will** (ticked lines, each
     with a budget), **Will not touch**, and **Ready by**. At most five
     promises. Anything settled today is never touched.
  4. Leaving is only ever the explicit command; nothing is offered on a closed
     tab.
  5. Through the night each promise is filled or fails with a reason.
  6. In the morning, a review shows the brief, then the proposals (sure, hunch,
     failed), then what was left alone.
- **Personas** (`.agents/personas/<name>.md`): a lens, a goal and a memory.
  Each goal is a number, a bound, the command that measures it and a baseline;
  for example, performance holds the entry chunk under 747,000 bytes and a
  frame's added main-thread time under 2 ms. `persona-run.mjs` measures and
  writes `docs/reviews/<date>-<persona>.md`. It changes nothing. A missed goal
  is a finding, and a finding unanswered for three days fails a test.
- The repo's own night shift rule, which keel already holds: an overnight
  change is an improvement only if it **names, before the work starts, a number
  already being measured**, and moves it the right way without moving another
  the wrong way.

Neither side sends email. GitHub's own mail on a red workflow is the only mail.

## What to take from each

From isocan: the conversation and its rules (explicit leaving, at most five
promises, a "Will not touch" list, settled-today is off limits, nothing promised
when nothing can do it), the morning order (brief, sure, hunch, failed, left
alone), and the persona file.

From keel: everything that makes a night safe. Measure first; a bot never
writes to `main`; one PR per queue; the judge runs the gate; a person merges;
budgets are the owner's; projects run on their own, so whatever runs at night
ships into the project as managed files.

## The design

**One plan per night.** `.keel/night/plan.json` (schema 1), on a branch the
night reads, `keel-night-plan`. Each item:

```json
{
  "id": "perf-bundle",
  "title": "Entry chunk back under 747 kB",
  "kind": "measure | build | triage | review",
  "source": "default | owner | persona:performance | loop:<slug> | health:<measure> | robot:#<issue>",
  "number": { "measure": "bundle_bytes", "bound": 747000, "better": "lower" },
  "lane": "climb:<job> | robot:#<issue> | loop | persona:<name> | night",
  "budget": { "minutes": 30 },
  "status": "planned | running | done | failed | skipped | left-alone",
  "result": { "note": "...", "link": "..." }
}
```

The plan also carries `willNotTouch` (paths or ids), `readyBy`, `settledToday`,
`leftOpen` and who shaped it (`default` or the owner).

- **A build item names its number first.** No `number`, no build: it becomes a
  triage or review item instead. This is isocan's rule and keel's already.
- **At most five build items**, counted with the robot's open PRs. The rest wait
  for the next night.
- **The default plan** is what keel would do anyway, written down before it
  runs: tonight's measures, the worst number's climb job, the robot's next
  admitted issue, Loop findings to triage, and each persona's missed goals. It
  is made by `keel night plan` and needs no person.

**`/goodnight` shapes it.** `keel goodnight` (and the conduct practice's
`/goodnight` skill, which runs it in conversation):

1. Shows what was settled today (merged PRs, phases moved, findings decided),
   what was left open (open PRs, unanswered reviews, the board's yours-column),
   and the default plan.
2. Offers two or three things it could try, from the personas' missed goals,
   accepted Loop findings and the health page.
3. The owner adds, drops, rewords, sets budgets, and names what not to touch.
4. `keel goodnight --yes` writes the plan and pushes it to `keel-night-plan`.
   That push is the summons. Without it, the night runs the default plan.

**Personas measure; they do not build.** `.agents/personas/<name>.md` in the
project, isocan's format: front matter with `goal:` entries (`name`, `at most` or
`at least`, `measured by:` a command printing one number, `baseline`). `keel
persona run` measures each goal, writes a review page, and a missed goal becomes
a candidate item for tomorrow's default plan. A persona's goals become bounds the
night measures, so the ratchet holds them.

**The night does what the plan names.** The night reads the plan, runs its
measures, then hands each build item to the pass that already builds safely:
a climb job by name (`climb.mjs pick --plan`), the robot by issue number, a Loop
finding as a robot issue once it is accepted and names a number. Each pass ticks
its item: `running`, then `done` with the PR link or `failed` with the reason.
Nothing new gets write access; the plan only chooses.

**The plan is a live card, and the morning sends a message.** With a canvas, the
plan is the live card `night-plan`, edited in place as items tick (phase 50's
conditional edit; a person's edit stops it, as always). When every build item is
done, failed or skipped (or at `readyBy`, marking the rest "not finished by"),
a `keel-morning` workflow runs `keel morning`, which writes the brief in isocan's order: what was done, sure; what was
tried, with its number; what failed and why; what was left alone. It links the
canvas, the health page and each PR. Delivery:

- **Default: a GitHub issue** "Good morning, <date>", assigned to the owner,
  one open at a time (the previous one closed). GitHub emails the assignee, so
  an email arrives with no new secret and no mail provider.
- **Optional**: a mail provider the owner configures with their own secret.

## What it never does

- Write to `main`, merge, approve, or touch a person's PR.
- Build an item that names no number, or touch anything in `willNotTouch`.
- Spend model tokens without the owner's budget: the night's own steps stay
  deterministic; building happens in climb and the robot, inside their budgets.
- Offer a plan on its own initiative. `/goodnight` is asked for; otherwise the
  default plan runs quietly and is still shown in the morning.

## The phases

| Phase | Title | Depends on |
| --- | --- | --- |
| 73 | A night has a plan, written before it runs and ticked as it goes | 10, 11 |
| 74 | `/goodnight`: the owner shapes tonight's plan | 73 |
| 75 | Personas measure a project against goals it sets itself | 11 |
| 76 | The night builds what the plan names, and only that | 73, 35, 54 |
| 77 | The plan lives on the canvas, and the morning sends a message | 73, 50 |

73 first: the plan file and the default plan are what every other phase reads
or writes. 74 and 75 can be built in parallel after it. 76 needs climb's and the
robot's passes; 77 needs the canvas's live cards.

## Open

- **Where the plan travels.** A branch (`keel-night-plan`) keeps the plan out of
  `main` and needs no dispatch input; a `workflow_dispatch` input would need the
  night to be started by hand. Settled by phase 73's build if the branch proves
  awkward.
- **Mail beyond GitHub.** The assigned issue gives an email today. A provider
  needs a secret the owner holds; phase 77 builds the adapter only if the owner
  asks for it.
- **Personas that spend tokens.** isocan's small tier calls a model under a
  declared budget. Keel's first personas only run commands; a model tier is a
  later decision, with a budget the owner sets.

## Extension: bounded overnight decisions (2026-11-02, designed, not implemented)

[Phase 162](../phases/162-overnight-decisions-remain-bounded-and-reviewable.md)
extends this design. The original plan, deterministic measurement, explicitly
opted-in builders, number-before-build rule, budgets, five-build ceiling,
`willNotTouch`, settled choices, `readyBy`, reviewed publication and human merge
boundaries remain. An overnight label changes interruption handling; it cannot
change permission or disable tool/approval hooks. This is a design contract, not
a new command or active runtime mode.

### One decision envelope, linked to existing authority and effects

Use a versioned envelope alongside the existing runner's original operation
receipt. The first increment defines and validates this contract without executing
anything. Do not add arbitrary fields to the strict schema-1 night plan or rewrite
existing decision records to look complete.

| Field group | Required content and meaning |
| --- | --- |
| Identity and context | Schema version 1; stable decision ID; night date; plan item ID; original operation/attempt IDs; source revision; existing policy/scope reference; dependency decision IDs. References explain authority; the record itself never grants it. |
| Choice | The question, alternatives considered, selected option or null if parked, rationale, evidence references, confidence label (`low`, `medium`, `high`, `unknown`) and named unknowns. Confidence is attributed judgment, not a calibrated probability. |
| Consequences | `expects` as a checkable claim; `checkBy`; expected interactions with other choices; observations containing evidence reference, version/flag, time window, meaningful-operation denominator and observed result. Label simulation, real observation and unavailable evidence distinctly; null is not zero. |
| Change and proof | Affected commits, flags/configuration and issue/PR references; exact validation and outcome; original effect receipt references. A decision and a successful side effect are different facts. |
| Recovery | Existing door class, recovery preconditions, known-good revision/configuration, undo or compensation steps, limits and any expiry/window. Irreversible effects cannot be described as reverted. |
| Decision state | `chosen`, `parked` or `revisited`; a parked choice names missing permission/evidence, affected dependents and next action. |
| Action state | `not-started`, `running`, `completed`, `failed` or `uncertain`, derived from the original operation receipts. Never infer completed from a chosen option or a process exit alone. |
| Follow-up | Original decision reference, requested keep/adjust/revert, current source identity, observed evidence and resulting correction/decision reference. Retain the earlier record. |

Raw journals belong to the existing configured private runtime state, outside Git
where required by that runner. Lack of an approved writable/private destination
blocks journal-dependent execution rather than spilling into a public checkout.
A sanitized, reviewed summary may reference an existing `docs/decisions/` record
and its `evidence`, `expects`, `checkBy`, `door` and outcome fields. Do not promote a
model's choice into an accepted source decision. Extend existing readers to consume
the journal; do not create another authority store. Exports and morning projections
retain existing destination/privacy gates and redact secrets, raw prompts and
private source text. An unreadable journal is missing coverage, never no decisions.

The plan's existing `result.note`/`result.link` may reference a safe summary. A
parked, unstarted item can be `left-alone` with its reason. An uncertain operation
remains unfinished with its original receipt; neither parking nor `readyBy` can
convert it to done. Preserve the existing schema until a separately validated
compatible extension is necessary.

### Optional questions and dependent work

The harness classifies a question before it tries a default. A routine preference
within the existing goal and budget, with a verified reversible path, may be
resolved and journaled. Required permission, an explicitly owner-reserved decision,
a denied tool call, protected/settled work, missing required evidence, or uncertain
recovery parks the choice and only its dependent work. Continue ready independent
items inside the same allowance. Unsupported harness routing also parks; it never
fabricates a user answer or bypasses a hook. Resume rechecks scope, source and
original receipts before another effect, and never redispatches an uncertain one.

### Morning review and correction

Keep issue-linked completed work in the existing outcomes section. Add **Calls
worth revisiting** with the choice, why, expected versus observed consequences,
confidence/gaps, affected source/flag, validation, reversibility and the next safe
correction. Show blocked and uncertain work as such, not as completed decisions.

Rank critical failed health/uncertain external effects first; then order remaining
choices by impact (high before low), expiring recovery window/irreversibility,
and uncertainty (unknown/low before high). Use stable decision ID to break ties,
not arrival time. Show the top five with the total and a link to the complete
permitted journal; critical gaps and blocked owner actions remain explicitly
visible. The report must include interactions: two individually sensible rules
can jointly eliminate useful work. Measure the joint behavior or label its
consequence unmeasured; do not turn a prediction into an observation.

Keep maps to phase 150's `held` outcome with observed evidence. Adjust produces a
new scoped increment linked to the original decision. Revert uses a verified
compatible recovery path after current source/authority checks; an irreversible
effect instead needs an explicit compensating/forward decision. The report itself
executes none of these. Record the eventual result through the existing decision
loop, and carry the correction into the next plan without silently making it a
permanent policy.

Phase 150 currently feeds due checks to CLI morning but not the consumer workflow
that cannot read central source records. Phase 162 must use the actual configured
runner/report path and prove that projection; it cannot claim a universal morning
integration from a local fixture. No new scheduler, transport or notification
permission is implied.
