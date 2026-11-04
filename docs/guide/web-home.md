# Use the private Home board

Home brings the current project plan into the signed-in workspace. It leads with
decisions needing a person, walks ready for verification, recent source changes,
and a summary of every authorized project. Open a project to use the same view
through that project’s lens. Search and the attention filter narrow cards;
coverage warnings remain visible even when nothing matches.

This is a read-only view. “Inspect source” opens the exact GitHub revision behind
an item. A phase marked built is a source claim, not proof that this deployment
or a person’s acceptance has been verified. Decision submission, guided walk
observations, screenshot galleries, routine execution and fleet updates arrive
in their own phases. No model call is needed to rank Home.

## Configure Home

Complete the [authentication service setup](web-auth-service.md), then apply its
numbered database migrations in order, including
[002-home-cache.sql](../../lib/web/migrations/002-home-cache.sql) and
[003-home-retry.sql](../../lib/web/migrations/003-home-retry.sql).
Use the same approved private database and server-only secret bindings. Home
needs no additional GitHub permission beyond the selected-repository Metadata
and Contents reads. With Pull requests read on the installation, **Reviews
waiting on you** lists each plate's pull requests at their review-round limit
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
the four as `home`, and `/api/home` carries the same `home`; the hosted page
keeps its current sections until it renders the four, and until it stores
your visits it uses the last seven days.

What only one form can read is a row in both (on the web under **Read elsewhere**), with
the reason and the command that reads it, and never missing from one. Local
work (chats, worktrees and sessions on your machine) is read by
`plates loose-ends` and shown in `plates home` (its rows under
`--project <id>`, its items waiting on you in Needs you); Home shows it as unavailable,
"on your machine". Lessons waiting live in the private `plates-inbox`, which
the App cannot read yet, so both forms name `plates learn`. The fleet's CI,
stale claims, production verify, the robot, decision checks, feedback and
earlier health proposals are read in the terminal and named on the web.

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
   filter without hiding coverage warnings.
5. Refresh while a detail is open. Verify new data queues, and applying it retains
   the corresponding detail and usable focus without a surprise scroll jump.
6. Repeat at a 360px viewport: no horizontal page overflow; controls and warnings
   remain usable. Use keyboard navigation and check reduced-motion behavior.
7. Retain serving/source revisions, observed timings and screenshots outside the
   public application repository. An emulated viewport is not a physical-device
   test. Record any unwalked condition as a gap.
