# Use the private Home board

Home shows a chip per project and decisions you can answer on their cards.
Open a project for its decisions and one ordered **Backlog**, with **Ready**,
**Agent working**, **Needs you** and **Done** items. Open an item for its
rendered outcome, next action and source details. Work waiting on a dependency
stays behind that item; other waiting work is folded into source details.
A project whose production matches main has no release row. When production
is behind, its decision card supplies the checked `plates promote` command.

**Assign** stays on a Ready item's row. It shows a preview command for each
configured agent and enabled session or local-host route; preview first and
approve through the existing attach command. Hosted dispatch is not activated.
The recommendation uses the existing quota room policy, then chooses the
eligible agent with the most remaining capacity in its tightest window.
Stale, missing or unknown readings recommend nobody. The quota service is
currently local: a hosted instance without it says unavailable; hosted quota
delivery remains phase 192 work. Unread agent assignments also disable previews
and keep their source gap visible.

“Inspect source” opens the exact GitHub revision behind an item. Home answers
preview and apply not-now, walk decisions/completion, loose-end marks and PR
merges through their respective write gates. A phase marked built is a source
claim, not proof that this deployment or a person’s acceptance has been verified.
Guided walks, private media, routines and fleet updates have separate activation
and evidence requirements. No model call is needed to rank Home.

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

`plates home` starts with Projects and Needs you, the same chips and cards as
Home, then recent activity and queued work. `plates home --project <id>`
prints the project's decision cards and ordered backlog, including the same
Assign preview commands and quota explanation. `--json` includes
`projectWorkspace` for that selected project. The underlying `home` sections
remain in JSON for source inspection; they are not separate project panels.
The last-looked time is kept in the plates state directory
(`$XDG_STATE_HOME/plates/last-looked.json`, default `~/.local/state/plates/`),
never in project content. Unread sources remain explicit gaps.

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
`claims/phase-*` branches and open PRs, read through the GitHub App. An
agent-ready phase row links to a read-only **Preview attach** page (phase 181).
It reads the current source, claims and PRs again, shows the provider, session
brief and source-bound digest, and refuses work that is no longer agent-ready
or whose ownership coverage is incomplete. Opening or refreshing it creates no
claim and starts no agent; hosted apply and dispatch remain unavailable.

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
only through this CLI path. The web offers a read-only preview at
`/projects/<id>/attach?key=<id>:phase:<n>&route=session`; adding `provider` selects
a configured provider. The matching `/api/projects/<id>/attach` route returns
JSON. The page is not an approval or dispatch receipt.

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

A host may also name a `harness` (phase 193): the agent command itself,
`"harness": ["/abs/path/agent", "arg", ...]`, validated like `start` (an argv
array of at most 16 entries whose first is an absolute path), run with the
checkout as its working directory, and optionally `"prompt": "stdin"` or
`"prompt": "arg"`, how it takes the brief. `stdin` is for a headless agent
(`claude -p`, `codex exec`): the brief is its standard input. `arg` is for an
interactive one (the `claude` and `codex` terminal apps): it keeps the tab's
terminal as its input, so you can type to it, and the brief is its startup
prompt, its last argument. Without `prompt`, a harness named `claude` or `codex`
is `arg` unless its arguments make it headless (as above); any other harness is
`stdin`. A host may have
`start`/`state`, a `harness`, or both. When Rex answers on this machine (a `rex`
executable on the host environment's PATH, and `rex ls --json` answering JSON
within 5 s), `plates home --attach --route local-host` and `plates audit run`
run the harness in Rex instead of the start command: in the session labelled
`<plate>-<provider>` (the plate's `name`, lowercased, each run of other
characters one hyphen, then the provider key, e.g. `acme-anvils-claude`), reused
when one has exactly that label and created otherwise, Plates opens one new
tab per run, keep-open and unfocused, labelled `phase-<n>` or `audit-<lens>`.
The tab runs `lib/rex-run.mjs`, which reads the brief from a mode-600 file under
plates's state directory (`$XDG_STATE_HOME/plates/rex-briefs`, else
`~/.local/state/plates/rex-briefs`) and starts the harness with only the basic
environment. With `stdin` it deletes the file and pipes the brief in. With `arg`
the brief stays in its private file whatever its size, the startup prompt is one
short line naming that file (a brief holds decision context, and any process's
arguments are visible to `ps`), and the runner removes the file when the agent
exits or the tab is closed. The brief is never in any argv, the environment or the tab's output,
and the tab shows the agent working, so you can watch it and step in. An agent
that asks before working in a folder (Claude Code's trust check) asks in the
tab first; the brief follows your answer. The receipt is `rex:<session id>/<block id>`, and the
card's presence comes from Rex (`rex wait`): a running tab is `running`; an exit
is `finished` only when it is 0 and, for an audit, its findings file exists;
anything else, or a tab Rex no longer knows, is `failed`. Plates reads `rex ls`
and calls only `rex new`, `rex run` and `rex wait`: it never types into,
closes, relabels or kills a tab or session, and never touches a session other
than the exactly-labelled one, or a tab other than the one it opened. The one
exception is your cancel, below, which closes only the tab that attach opened.
Without Rex, or without a harness, the host runs exactly as above; a host with
only a harness and no Rex is refused, saying why. Remove `harness` to go back.
Rex reports terminal sessions and presence; plates does not own it.

To cancel a phase's attach, run `plates home --cancel <plate>:phase:<n>` in the
plate's checkout: a preview (exit 3) of what will be stopped. With
`--why "<line>" --yes`, Plates first records the cancel in the attach journal,
create-only, so the first cancel is the only one. Then it stops what the receipt
names, unless that has already ended: the Rex tab it opened (`rex block close`),
or a host session through the host's optional `"stop": ["/abs/path/host", "stop"]`
command (`stop... <session id>`). It also removes the run's private brief file,
which an attach names by its digest. If Rex or the host does not answer, the
cancel is kept and the next attach or cancel finishes it, including after plates,
the session or Rex restarts. A cancelled phase is never dispatched, recovered or resumed again, even when its
brief changes later (a new attach digest). A cancel recorded before the run starts, even while the attach is
still taking its claim, leaves it unstarted: the two race one create-only decision. A dispatch that finishes
after the cancel stops what it just started. Cancelling twice gives the same record. The claim is kept: release it
with `plates phase claim <n> --release`. A local host's brief ends by telling a
restarted agent to run `plates home --cancel <key> --check` first. That check is
read only and exits 1 when the phase is cancelled, and the agent then stops.

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
skipped and the server notes it once. The hosted `/backlog/history` (beside List
and By goal; `/backlog/history/YYYY-MM-DD` for a date, else the last 28 days)
shows the same readout and card history, computed by the same function
(`lib/web/backlog-history.mjs`) over the hosted events; before 019 it says once
that events are not stored yet, and shows no counts.

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

`plates channel [<project>]` (phase 194) is each plate's channel, read only:
newest last, who claimed which phase (joined), the pull requests opened, the
changes in flight (pushed, CI, waiting to deploy), production's deploys and
the sessions waiting on you, each line with its plate, its actor
(`<plate>#<phase>`, else `<plate>!<PR>` for a PR naming no phase) and a link. **Here now** lists the
agents holding work (live claims, and PRs naming an unclaimed phase) with
their last line's age and the lines from the last 24 hours, or Caught up; no
read position is kept yet. A source that could not be read is a gap line
naming it, never a quiet channel. The feed covers seven days (`--since`
narrows it), and more than three joined/left lines on a plate within ten
minutes fold into one. The hosted `/channel` (the footer's Channel link)
renders the same model: All, a chip per plate with its line count, Here now
and the lines; each plate's page carries its own Channel section.

Agents post their own lines with `plates say "<text>"` (phase 194, increment
2): one line of at most 280 characters for the checkout's plate, sent with the
Mac's device key (the one `plates sessions push` uses) to the workspace
`PLATES_SITE` names, tagged with the session, the provider and the phase the
checkout claims. The workspace seals it (migration 024 keeps ciphertext,
digests and times only), takes one line per session per minute, keeps lines
14 days and at most 500 per plate. Each shows as a `say` line on the plate's
channel (`<plate>#<phase>`, else `<plate>@<session>`) and counts in Here now.
A line is an observation; it triggers nothing. Until migration 024 is applied
each plate's channel says agents' lines could not be read. `plates channel`
reads them from the workspace with the same key when `PLATES_SITE` is set,
else it says why not.

The owner addresses agents from `/channel` (phase 194, increment 3): a form,
signed in, with the same origin and CSRF checks as Home's answers, posts one
line to one plate. The workspace seals it with the owner's mark under the
owner's own digest, never a device key (migration 025; until it is applied the
form says the channel cannot take your lines yet). A line that names `@2`,
`@<plate>#2` or `@<session>` is a `checkpoint` (a bare `@<session>` only when
the id ends in a letter or digit, a trailing `.` or `:` being punctuation, so
`@worker- hold` names nobody; `@{worker-}` names any session id exactly): that
session reads it once with
`plates channel inbox`, and both forms show it answered once that session or
phase next says something. An agent's line naming another agent is a `say`
line and reaches no inbox; a device-key post shaped like the owner's line is
refused by name.

Plates posts its own steps for an attach or a Rex run to the same channel, as
`progress` lines from the provider `plates`: the phase was dispatched (to which
Rex tab and session, or which local host, or handed over as a `/spin` brief),
recovered, or cancelled. They go through the same route, device key and limits
as `plates say`, one session per step and attach, so one step never waits on
another's minute. Posting is best effort: with no `PLATES_SITE`, no device key
or no answer, the attach or cancel still stands and its result carries a
`progressNote` saying why the line was not posted. `plates channel` and
`/channel` show the same lines, each attributed to the device that posted it
("plates on Acme Mac: ..."): they say what plates on that machine did, not the
owner's word. A device key may post only these three steps: the workspace refuses,
by name, any other line from a device with the provider plates, so preview,
correction, finished and accepted can never come from a device. An
agent's `plates say` cannot use the provider `plates`, and no line triggers
anything. Preview ready, correction requested and accepted may come only from
the owner's signed-in site session; increment 3 lets the owner post lines there,
but does not post those steps yet.

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


## Keep an exact attach preview

From an agent-ready phase in the backlog, open Attach and choose a provider.
Reading the preview starts nothing. **Prepare private preview** retains that exact
source and brief for review; it does not claim the phase or run an agent.
The saved page shows its source revision, expiry and the original receipt link.

If saving loses its response, revisit the original preview link instead of
submitting another request. A saved preview may expire or become stale as the
project changes. It is a record of what you reviewed, not continuing permission
to start work. Inspecting an original receipt remains separate from preview
expiry: the receipt shows the journal's observed stage and never labels a claim
as a running agent.

This source increment still leaves Apply and Dispatch unavailable. A real
hosted run requires the registered worker's own verified activation and runtime
allowance; see [the worker guide](web-workers.md). Saved preview and receipt
inspection do not grant those permissions or accept a project outcome.
