# Use the private Home board

Home brings the current project plan into the signed-in workspace, in four
sections (phase 166): **Needs you**, one ranked list where each row has one
verb (Fix, then Decide, then Try it, oldest first) and names its answers, with
Answer opening the review session; **Since you last looked**, what happened, by
plate; **What should happen next?**, the ask box and what is queued, with each
source the hosted home cannot read yet as one quiet line naming its command; and **Your
plates**, one status each, with source problems in one line beneath. The
caveats are one footer line. Open a plate for the same sections through its
lens, plus what waits on time or agents. Search and the Fix / Decide / Try it
filter narrow Needs you; source problems stay listed under Your plates.

This is a read-only view. “Inspect source” opens the exact GitHub revision behind
an item. A phase marked built is a source claim, not proof that this deployment
or a person’s acceptance has been verified. Decision submission, guided walk
observations, screenshot galleries, routine execution and fleet updates arrive
in their own phases. No model call is needed to rank Home.

## Ask for something

In **What should happen next?**, pick a plate, write the ask (one line, up to
200 characters) and choose where it goes:

- **Tonight's plan** (the default) adds one triage item in lane `night`, the
  item `plates goodnight add --title "<ask>" --kind triage` adds. Preview shows
  the exact plan file, its branch and digest; nothing is published until you
  tick approval and press Publish, which goes through the night-plan
  publication's own apply (it refuses a preview whose source changed, and a
  public repository needs its digest acknowledged). Publishing needs the
  workspace's night-plan writes enabled and Contents write; without them the
  preview gives the command instead.
- **An agent issue now** has no hosted writer (the App has no Issues write).
  The preview gives `plates issue new --agent --title "<ask>" --rubric
  <rubric.md>` with your ask filled in, to run in the plate's checkout, where
  it previews and needs `--yes`.

`plates home` lists the same two destinations as their commands.

## Configure Home

Complete the [authentication service setup](web-auth-service.md), then apply its
numbered database migrations in order, including
[002-home-cache.sql](../../lib/web/migrations/002-home-cache.sql) and
[003-home-retry.sql](../../lib/web/migrations/003-home-retry.sql).
Use the same approved private database and server-only secret bindings. Home
needs no additional GitHub permission beyond the selected-repository Metadata
and Contents reads. With Pull requests read on the installation, Needs you
lists each plate's pull requests at their review-round limit
(with the verdict, "stopped: repeating" or "extended: progress", and the merge
rule's counts: fix first, track, unsorted) and those with findings left
unanswered; without it, the section is a gap that says so. Its caches are encrypted outside Git; quota counters and
refresh cursors use opaque keys. Public, anon and authenticated database roles
cannot call the private RPCs or read their tables.

Each protected request rechecks current membership and repository access before
reading cache data. Sign-out or denied access clears the private view. An
unavailable source keeps its previous observation and timestamp with a visible
warning; missing evidence is never counted as zero.

## The same Home in a terminal

Home and `plates home` are one read model with two renderers (phase 156).
`plates home` reads each plate from its checkout's default branch with the
hosted home's own reader and bounds, and reads reviews through `gh`; `plates
home --json` has `/api/home`'s shape, without the web's cache and allowance
fields. Use `--project <id>` for one plate's lens. For the same sources, both
show the same items, sections and counts.
`plates board` and its 127.0.0.1 page are retired: `plates board` prints
`plates home` and exits 2, so a script that called `plates board --json` moves
to `plates home --json`.

`plates home` shows home's four sections, in order (phase 166): **Needs you**,
one ranked list where each row has one verb (Fix, then Decide, then Try it,
oldest first); **Since you last looked**, what happened per plate since your
last `plates home` (the time of that run is kept in the plates state directory,
`$XDG_STATE_HOME/plates/last-looked.json`, else `~/.local/state/plates/`; no
project content); **What should happen next?**, what is already queued
(tonight's plan and open agent issues); and **Your plates**, one status each,
with source problems collapsed into one line. A count says "known" only when a
source could not be read, and the other caveats are one footer line. What waits
on time or on agents is under `plates home --project <id>`. `--json` carries
the four as `home`, and `/api/home` carries the same `home`, which the hosted
page renders.

`plates home --backlog` (phase 178) shows every plate's work in lanes, from the
same read: **In flight**, **Yours**, **Agent-ready**, **Waiting** and
**Recently done**, one line per item with the reasons it sits there (its
why-keys) and, on the right, a claim's days left or how long ago it was added.
Each plate's phases come from Home's own read of its default branch, and its
claims from its checkout's remote, as `plates next` reads them. A phase owing a walk is under Yours with the walk nested in
it; a free phase without `spec: 2` waits for shaping. `--lane <l>` keeps one
lane (`in-flight`, `yours`, `agent-ready`, `waiting` or `done`), `--project <id>`
one plate, and `--json` prints the model. A plate that could not be read says
"not read", never zero; so does one whose claims could not be read. The hosted
`/backlog` (linked from Home) shows the same items as a list beside a sidebar,
with `/api/backlog` carrying the same JSON; there the claims are the plate's
`claims/phase-*` branches and open PRs, read through the GitHub App. Start on an
agent-ready row is off until agents can be attached (phase 181).

Start at the top of the backlog's Yours lane (or "Your lane, in backlog order"
on Home) opens the review session at `/review/yours` over exactly that lane, in
its order (phase 180). Each card says how many are left and about how long
they take, from each item's Takes or its kind's usual minutes, and "at least"
when one is unknown. The next card's header shows below the current one. Not
now takes an optional one-line reason, kept with its date in the same sealed
record. The session ends in "All caught up" only when every plate and source
was read; otherwise it says the read was partial.

`plates home --backlog --by-goal` (phase 179) arranges the same backlog
under each plate's goals, in `docs/goals.json` order, then its items with no
goal: a header per goal with its lane counts, its first seven cards, and how
many more. Each phase or pull request is one card; its walk, ⚑ step, stale
claim and review findings nest under it. Items are deduplicated by plate,
phase and acceptance item, keeping every source link, and look-alike work in
two plates is never merged. A card sits in its most pressing member's lane,
Yours first. `--json` adds the groups. The hosted `/backlog/goals` shows the
same; List and By goal are links at the top of the backlog.

`plates home --recurring` (phase 185) lists, per plate, every routine it runs
(night, climb, tend, morning, robot, cross-review, publish, and any other
scheduled workflow): its schedule in this machine's time zone, its next run
(computed from the workflow's cron in UTC, never guessed), its last result
(the night record, else the latest workflow run through `gh`; "last run not
read" when that read is unavailable) and its budget with the key it comes
from. A routine switched off names the key that turns it off; a schedule in
`.plates/plates.json` that disagrees with its workflow's cron shows both. It
ends with each plate's links (repo, `canvas.home`, production site).
`--project <id>` keeps one plate and `--json` prints the model. The hosted
`/recurring` shows the same routines beside the backlog's sidebar, which also
carries Humans and Links; it reads the latest runs through the App's Actions
read, and starts, stops and reschedules nothing.

`plates home --attach <plate>:phase:<n> --route session [--provider <p>]`
(phase 181), run in that plate's checkout, attaches an agent to a phase that
is ready to build. Without `--yes` it previews the exact effect (the claim
ref, the agent, the route, the brief's size and digest, the budget charged)
and exits 3. With `--yes` it makes the same create-only claim as
`plates phase claim`, reads it back, journals the intent under the
checkout's git directory, then hands over the `/spin <n>` brief to open in
Claude Code or Codex; nothing is started. If another agent's claim won, it
says who holds it and does nothing else. A second `--yes` returns the
receipt; an attach interrupted after its intent was journaled is recovered,
never repeated. A plate offers the routes its `"backlog": { "routes": [...] }`
policy lists (only `session` with no policy). This build starts `session`
only. The backlog's Start button on an agent-ready row stays off on the web,
and its tooltip gives this command.

`plates home --assist <plate>:phase:<n> --recommend <choice> --why "<line>"
--evidence <link> [--evidence <link>...] [--provider <p>]` (phase 182), run in
that plate's checkout, keeps an agent's draft recommendation on the phase's
Your part. The choice must be one of its Choices; each evidence link is an
https link or a path committed in the repo. Without `--yes` it previews the
draft and its digest and exits 3. With `--yes` it journals the intent and keeps
the draft under the checkout's git directory, beside the attach journal, by
route `session`: the agent is your own session, and nothing is started or
claimed. It never records an answer, ticks a box, moves a status or adds
evidence. `plates home --backlog` shows it on the card as "Agent recommends: X,
because Y (evidence) · agent", next to any Recommend the phase file names. The
draft names the git blob of the phase file it read; once that file changes, the
draft is withdrawn and the backlog says so. A plate's `"backlog": { "assists":
[...] }` policy can turn it off (with no policy, `decision-draft` is offered).
Drafts are local to the checkout: the hosted backlog does not read them yet.

`plates home --attach <plate>:phase:<n> --route local-host --provider <p>`
(phase 183) hands the phase to a local agent host you run on your own
machine. The route is off unless the plate's `"backlog": { "routes": [...] }`
lists `local-host`. The host is configured privately, never in a repo, in
`$XDG_CONFIG_HOME/plates/local-hosts.json` (else
`~/.config/plates/local-hosts.json`), keyed by the provider name it claims
with, which must also be a key of the plate's `agents`:
`{ "hosts": { "<p>": { "start": ["/abs/path/host", ...], "state": ["/abs/path/host", "state"] } } }`.
The preview prints the brief whole: the phase's Done when, its Acceptance and
its current decisions (`plates decision context`). With `--yes` Plates claims
the phase, then runs `start... <checkout path>` once, in the checkout, with
those exact bytes on stdin. The host prints a session id on one line and exits
0. Both commands run as argv with no shell, bounded in time and output, and
with only PATH, HOME, user, shell, locale and temp in their environment: no
token Plates holds passes to them. A host is never run twice for one phase: a
second `--yes` returns the receipt, and a run whose answer was lost is
recorded as uncertain, not repeated. If the host has a `state` command, Plates
runs `state... <session id>` when it reads the backlog. An answer of
`starting`, `running`, `waiting`, `finished` or `failed` becomes the card's
presence, with the host and session as its source. A host with no state
command, or one that answers anything else, leaves the card at "claimed".

`plates home --backlog --since YYYY-MM-DD` (phase 184) reads back what
happened to each item since that date: the counts per action, each route's
attached phases and how many landed (are in Recently done), and the minutes of
the answers you gave each week ("at least" when one had no estimate). Each card
carries its `history` (how many events, the last one); events never reorder the
backlog. They are written where the actions already happen (attach, assist,
`plates phase claim --release`, and each answer and Not now from `plates home
--answer`) into the plate's `.plates/backlog-events/`, private like feedback's
store (0700/0600, git-ignored, refused when tracked), and they are **metadata
only**: the item's key, who, the action, route, lane, takes, an outcome code and
a receipt link; a Not now's reason is the code `stated` or `none`, never your
words. Writing one never fails the action it records. The hosted workspace
keeps a Not now answered on the web in SQL019; until 019 is applied events are
skipped and the server notes it once.

`plates home --agents` (phase 186) lists each provider in the plates'
`agents` maps with the item it holds now, from claims ("working on plates
#178", with its presence: claimed, or stale after seven days without a push),
or idle; each route an agent may join by (session, local agent host, tonight,
robot, worker), on for the plates whose `"backlog": { "routes": [...] }`
policy lists it (session only with no policy) or off with its reason
(`robot.on`, workers not yet activated, not in policy); and Pending review,
the fleet's open pull requests not set to auto-merge, oldest first, read
through `gh`. The hosted `/agents` shows the same, reading pull requests with
the App's Pull requests read (a plate without it says "not read"), and the
sidebar's Agents and Pending review carry their counts on every page.

On the web, **Since you last looked** starts at your previous visit. A visit is a
run of Home page loads less than thirty minutes apart, and "since" is the last
load of the visit before this one; a reload, the page's background refresh and
a plate's own page never move it. The workspace keeps, per owner, an opaque
digest and those two times only
([018-last-looked.sql](../../lib/web/migrations/018-last-looked.sql)); no project
content. On a first visit, or before 018 is applied, Home shows the last seven
days and its footer says visits are not stored yet.

What only one form can read is a row in both (on the web under **Read elsewhere**), with
the reason and the command that reads it, and never missing from one. Local
work (chats, worktrees and sessions on your machine) is read by
`plates loose-ends` and shown in `plates home` (its rows under
`--project <id>`, its items waiting on you in Needs you); Home shows it as unavailable,
"on your machine". Lessons waiting live in the private `plates-inbox`, which
the App cannot read yet, so both forms name `plates learn`. The fleet's CI,
stale claims, production verify, the robot, decision checks, feedback and
earlier health proposals are read in the terminal and named on the web.

## Changes in flight

On a plate with the delivery practice, its own page (`plates home --project
<id>`, and `/projects/<id>` on the web) lists its **changes in flight**
(phase 158). For each change it shows where it waits: active, its branch,
review, CI, integration or deploy. Each change also has an age and the next
action. Below the list, the page shows:

- how far the tested ref trails main;
- work in progress per builder;
- the gaps, and when, at which revision and over what activity window the
  waits were read.

Two waits past their advisory target are the owner's to fix, so they are
also **Fix** rows in Needs you:

- an integrate lock held too long, which is the owner's to delete and never
  taken;
- a red main.

Everything else waits on agents or on time, and stays on the plate's page.
Your plates counts it as "in flight".

Both forms run the same bounded GitHub GETs: `gh api` in the terminal, the
App on the web. GitHub's "Permissions required for GitHub Apps" (read
2026-11-04) gives each read's App permission:

- **Contents (read):** refs, commits, compares, the verify branch's tree and
  blobs, and repository activity (`GET /repos/{o}/{r}/activity`).
- **Checks (read):** check runs.
- **Pull requests (read):** open PRs.

A read the App is not permitted to make is a named gap, for example "the App
cannot read check runs: Checks read needed", never an empty list. GitHub
refuses such a read with a 403 that is not a rate limit: quota is left, there
is no Retry-After, and the message does not mention a rate limit. That 403
pauses nothing else. A 403 with no quota left, with Retry-After, or with a
rate-limit message still saves quota, and then the waits are not read. When waits cannot be read, Needs you's count says
"known". Plates without the delivery practice show no waits. The thresholds
are advisory, and nothing is deleted, released or integrated for you. See
[the measurement contract](../specs/integration-delays.md).

## Read freshness and coverage

The initial page uses bounded cache reads. A visible tab immediately requests
sources, then checks approximately once per minute. Hidden tabs pause and abort
pending reads. Source results are cached for ten minutes; explicit refresh
rechecks the serving revision, with a shared one-minute cooldown. A refresh lease
prevents competing instances from collecting the same project simultaneously.
GitHub requests have bounded time, size and request budgets. Large fleets advance
in a fair order across refreshes; one failed project does not own every attempt.

The first useful result fills an empty loading view. Later results appear behind
**Show changes**, keeping an open card stable until you choose to apply them.
Applying restores matching details, focus, filters and scroll position. A gap
in retained update history requests a new bounded snapshot rather than inventing
the missing changes. Refresh failure backs off and preserves the prior view.

Home reserves GitHub calls atomically and stops optional collection at a floor
of 1,000 remaining calls. Unknown quota allows only a bounded probe window;
unknown is not an unlimited allowance. Provider throttling pauses collection
across instances. These are GitHub API limits, not model quotas; model capacity
and routing remain separate planned work.

Local phase files reuse Plates’s board classification. Projects-shaped plans keep
their own parser and next-action rules. GitHub milestone plans remain explicitly
unavailable until an Issues read permission and adapter are approved; archived
local phases do not replace them. Live routine/check/review coverage, private
shared lessons and architecture decisions are also named as gaps where their
adapters have not shipped. A partial banner is expected when any of these
sources is unavailable, even when every local phase file was read successfully.

## Browser walkthrough

Run the focused tests named in [phase 96](../phases/96-home-explains-every-project.md)
first, then use the actual approved HTTPS instance:

1. Sign in and observe loading resolve into actual project source records.
2. Find the next human decision or ready walk. Expand its context with the
   keyboard and follow its revision-pinned source link. If none is ready, confirm
   the displayed reason rather than inventing an action.
3. Find an unavailable source and distinguish it from an empty successful read.
4. Open a project and verify the view contains only that project. Search and
   filter without hiding the source problems under Your plates.
5. Refresh while a detail is open. Verify new data queues, and applying it retains
   the corresponding detail and usable focus without a surprise scroll jump.
6. Repeat at a 360px viewport: no horizontal page overflow; controls and warnings
   remain usable. Use keyboard navigation and check reduced-motion behavior.
7. Retain serving/source revisions, observed timings and screenshots outside the
   public application repository. An emulated viewport is not a physical-device
   test. Record any unwalked condition as a gap.
