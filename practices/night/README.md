# night

**The failure it prevents.** A nightly that fails onto a page nobody opens
(plates lesson 3), and its opposite: a nightly pull request the owner merges
every day and nobody acts on (plates, 21 Nov 2026: 37 nights of health pages,
merged unread). A gate that passed while running nothing (lessons 14 and 38).
A flaky test hidden by a rerun until it is a real failure nobody can find.

**The rule.** The night speaks up only when something is wrong (phase 207),
and three things are: CI on main is red, a test is flaky, or the gate ran no
tests. Then its workflow fails, naming each cause, and GitHub emails the
owner: a guard fires into a room someone is in. Otherwise it is green and
quiet. It writes nothing: no branch, no pull request, no inbox proposal, no
plan. Every other measure, and the health page, is written on demand by
`plates improve` (`node scripts/plates/improve.mjs --report` in a project).

A project's night runs from its own repo: everything it runs is a managed
file of this practice; it never fetches plates (design §6, "Projects run on
their own"). It needs only the job's GitHub token, which reads. Configured
Vercel production collection optionally uses `VERCEL_API_TOKEN`, mapped to
`VERCEL_TOKEN` only in the collection step; off and other-provider projects
need no Vercel secret. The gate and the morning receive no provider
credential. `plates-night.yml` runs every night at 07:23 UTC (and by hand):

1. The project's install (`setup`, else `npm ci`), then read-only production
   observation, kept as the `plates-production-<attempt>` artifact for the
   morning's brief. A collection gap is said in its step, never red.
2. The test ledger's history is gathered: CI's `plates-test-runs` artifacts
   (`scripts/plates/test-history.mjs`, bounded and identity-verified).
3. The three questions (`node scripts/plates/night-verdict.mjs ask`), each
   one of improve's own measures, run alone:
   - **CI on main is red**: `ci_red_streak` counts a failed run among the
     gate workflow's newest verdicts on main, or the `gate` measure fails on
     main's tree (CI's result for the exact clean commit, reused within 24
     hours, else the local check);
   - **a test is flaky**: `flaky_tests`, a test that both passed and failed on
     one clean tree, in the newest window of the ledger's recorded runs;
   - **the gate ran no tests**: the `gate` measure passed having run none.
   The gate runs first, so its own run is in the history flaky reads.
4. The ledger is kept for tomorrow night as the `plates-test-runs` artifact
   (never committed).
5. The verdict, the last step (`night-verdict.mjs verdict`): each cause that
   holds is one `::error::` line and one line in the run's summary, and the
   run fails (exit 1). With none, one summary line, and green. A measure that
   cannot answer (n/a: too few recorded runs, no gh; or broken) is said in the
   summary, a broken one with a `::warning::`, and is never red: only the
   three causes are.

The morning (phase 77): `plates-morning.yml` runs when plates-night,
plates-climb or plates-robot finish (the last two only where the climb
practice installs them; without climb, plates-night alone), and daily at
17:07 UTC (just after the default `readyBy`). Since phase 207 the night makes
and records no plan; a plan is the owner's, on the plan branch
`plates-night-plan` (`plates goodnight`, or Home). `node scripts/plates/morning.mjs
decide` reads it, each item at its furthest tick; without one it says "no
plan for the night" and nothing more runs. Once every build item is terminal,
or the plan's `readyBy` (default 17:00 UTC) has passed, and no brief was sent,
`morning.mjs send` opens the issue "Good morning, <date>" assigned to
`.plates/plates.json` `morning.assignee` and labelled `keel:morning` (closing
the previous one; GitHub emails the assignee). Only the send job may write
issues; a failed send is red. The send job also has `actions: read` solely to
restore production observations from the newest night artifact; an always-run
verdict fails the job on missing or failed restoration. Without an assignee
nothing is sent (a notice). On every run, its card job (phase 78) republishes
the plan as the canvas's live card `night-plan` (`plates morning --card
--yes`) when the canvas is set for nightly publishing and lists `night-plan`
live, else a notice and nothing more. The morning opens no pull request: the
plan's final outcomes stay on the plan branch, where Home reads them.

`plates improve` and `plates drain` are modules of this practice, run from
plates. The night calls neither; the loop practice's queue still drains with
`drain.mjs`. What a project's copy of improve cannot read alone it calls
`plates-side only`, never a zero:
drift there is by `.plates/lock.json` (bytes plates did not write are `edited`;
`behind` needs plates's templates), lint is the rules its own files show
(`PROJECT_LINTS` in `scripts/plates/improve.mjs`: phase, goal-without-phase,
claude-md-pointer, second-copy, symlink-replaced, lessons-table-split,
health-config, health-ignored, platform-guard), and the inbox is plates's.
The measures below are improve's, on the health page it writes on demand;
where they say "the night", read "improve": the night itself runs only the
three above.

**Proof lost.** `proofs_hold` (bound 0, no ratchet) counts the built or
lived-in phases whose Acceptance cites a `tests/` path that no longer
exists, or a named test (`tests/<file>: "<name>"`) that did not pass in the
newest recorded run of that file (the test ledger, below), or whose
`evidence` names a file that is gone; the page names each phase and what is
lost. A cited test in no recorded run is said, not counted. The night never
steps a phase back or writes evidence; its proposal is to make the test
pass, re-point the reference, or step the phase back with a reason, which a
person does.

**Reviews unanswered** (phase 41). `reviews_unanswered` (bound 0, no
ratchet) counts the review comments on the project's open PRs, and on PRs
merged in the last 7 days, that nobody answered, once they are a day old: a
thread whose newest comment is its reviewer's (resolving it is not an
answer; a reviewer's follow-up reopens it), and a review's top-level body,
or a conversation comment from a reviewer named in `.plates/plates.json`
`"review"`, that no later comment from someone else quotes (`> `), links or
names by id (an unrelated comment is not an answer). It is the rule
`plates review <repo>#<n>` reads one PR by (the repo read page by page;
`lib.mjs` holds it). The detail names each PR, its count and its oldest
comment; `plates loose-ends` lists the same PRs with `plates review <repo>#<n>`.
n/a without `repo` or gh auth, and n/a when the read is incomplete (more
PRs than four pages, or a list longer than its page); a failed read is
`broken`; never a zero. Not a gate: nothing refuses a merge for it, and the drain
merges as before. The answer is the work: validate each comment against the
code, then reply fixed (the commit), tracked (the issue or version) or not
valid (why), with `plates review <repo>#<n> --close <id> …`.

**Escapes** (phase 34). `escapes` counts the defects found after a phase
was built, since the newest release tag (`v*`; with none, the first commit),
from what is already written: a commit whose subject starts `fix:` or
`fix(` (never "fix" mid-subject), a lessons row added since the tag whose
provenance italics name the project (its `repo` or `name`), and a
Trajectory entry added since the tag that begins `- **YYYY-MM-DD** —
Escape:` (the phases README's marker; no prose is read). A fix commit that
names a lesson counted there is that lesson's escape, counted once. Each is
attributed to the one phase its text names (`phase 33`, `phases/33-`; a
lesson by its shape and cost, not the guard; an Escape entry naming none
belongs to its own file's phase); none or several is counted unattributed,
never guessed. The bound is no rise release over release: the previous
release's own count, from git, which `--report` records in
`.plates/bounds.json` (no release before: recorded only). Its proposal names
the phase with the most escapes as the next hygiene target. Beside it, not
judged, the detail carries the ceremony of each phase built since the tag:
days from planned (`since` with `status: planned`) to the commit that set
`built`, and the phase file's words. A shallow clone, or no repository or
commits, is n/a, never zero.

**Every test run is remembered** (phase 33). `scripts/plates/test-ledger.mjs`
is a node test reporter, run beside the usual one:

    node --test --test-reporter=spec --test-reporter-destination=stdout \
      --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout …

It changes nothing about the run's output, and its exit code in one case:
**a run that executed no test fails**, "no tests ran" (plates's lessons 14
and 38: a gate that ran nothing passed). A test passed or failed counts; a
skipped one, a file with no test in it (node reports the file itself), and
a `describe()` with no test inside (a suite, not a test) do not. A project with no tests yet says so: `"tests": {"allowEmpty": true}`
in `.plates/plates.json`. It records each
top-level test (file, name, outcome, ms) with the commit, the tree, whether
the tree was dirty (git-ignored files and plates's machine directories,
`.plates/test-runs`, `.plates/climb` and `.plates/tend`, aside), the machine and
node, the run's config (a short hash of `NODE_OPTIONS`, its `--import` and
`--require` preloads, and each variable named in `"tests": {"configEnv":
[..]}`, recorded beside the hash: `NODE_OPTIONS` as written, and the
preloads; each `configEnv` variable only as its name, whether it was set,
and a short sha256 of its value, never the value, since runs are uploaded as
artifacts — so is a `NODE_OPTIONS` that carries a `token=`, `secret=`,
`key=` or `password=`),
the folder `node --test` ran in, whether it was narrowed (`--test-name-pattern` and the like), and in
Actions its workflow, in `.plates/test-runs/` at the repo's root (git's top
level, so a workspace's or app folder's own `node --test`, run from its
folder, lands in the same ledger; each lane, a suite's folder and config,
reserves its own newest 50 runs, or the window and ten more when that is
larger, so a busy lane never evicts a quiet one's baseline; 400 in all, or
lanes × (window + 10) when that is larger, prunes only what no lane reserves; the directory holds a
`.gitignore` of `*`, so no project's `.gitignore` changes), and ends the run
with a hygiene block: one line when clean, else each test that is

- **flaky** — passed and failed on one clean tree in one lane (its suite's
  folder and config; a fact, no threshold), or
- **slower** — above twice its median over its last 20 passing runs on the
  same machine class and lane, and more than 200 ms above it,

with its history in one line and the command to run it alone as it was
seen: that run's config variables (each set one as
`NAME="${NAME:?set NAME as it was in the run}"`, taken from your shell, so
the command runs as printed once you set it and stops saying so if you
haven't; never a value; each unset one, `NODE_OPTIONS` too, as `env -u NAME`)
and preloads, from its suite's folder
(printed elsewhere, it changes to that folder first: `cd "$(git rev-parse
--show-toplevel)"/'web' && …`). slow_tests is n/a until the newest run has a
window of earlier runs on its machine class in its own lane. `"tests":
{"window", "factor", "floorMs"}` in `.plates/plates.json` overrides 20, 2 and
200 (a window is at most 200) (and `allowEmpty`, above). The AGENTS block says what to do with one: **a hygiene note is work** —
fix it or file it, never rerun until green.

`plates init` wires the reporter into a node project's `npm test`; migration
0004 adds it to an adopted project's `scripts.test` when it is node's runner
(`node --test`, or `node --import … --test`) and leaves every other runner
alone; migration 0005 does
the same for each workspace's and app folder's own `scripts.test` (web/,
app/, client/, frontend/, and the root's workspaces). The ci practice's
`check.yml` keeps each run's `.plates/test-runs` as a `plates-test-runs`
artifact, red or green. The night reads the newest 30 of them on the default
branch (gh, read-only, by name) into `.plates/test-runs` before improve, its
gate run adds one more, and it keeps the result as its own artifact.
`flaky_tests` and `slow_tests` (bound 0, no ratchet) read that history; with
fewer runs than the window they are n/a, never zero. When every run read came
from a plates night, their detail says "nightly runs only: CI does not upload
plates-test-runs": a project whose CI is its own adds the upload step (migration
0005 prints it in the update PR; plates never edits a project's workflows).
`proofs_hold` reads a cited test's newest pass or fail: a skip, or a narrowed
run that left it out, says nothing about it.

**bun test and vitest** (phase 59). Both write JUnit XML, and the ledger
reads it as a command after the run:

    plates_status=0; rm -f .plates/test-runs/junit.xml; mkdir -p .plates/test-runs && \
      bun test --reporter=junit --reporter-outfile=.plates/test-runs/junit.xml || plates_status=$?; \
      node scripts/plates/test-ledger.mjs --junit .plates/test-runs/junit.xml --runner bun --status $plates_status

(vitest: `--reporter=default --reporter=junit --outputFile.junit=<file>`;
bun makes no directory, so its line makes it). `|| plates_status=$?` keeps the
runner's exit code where a shell runs under `set -e` (GitHub's `bash -e`),
so a red run still reaches the ledger; the old file is removed first, so a
run that writes none is "no tests ran". After a `cd`, the paths start from
the repo's root (`plates_root="$(git rev-parse --show-toplevel)"`). `plates adopt`
finds the runner in the gate, records `"tests": {"runner", "junit"}` and
proposes this line, only where the night practice is on (it installs the
ledger); it never rewrites the gate. The record is a node run's, plus
`runner` and a short hash of the file's path and bytes (`junit`). A report
last written before the run began (the `--start` sample, else the gate's own
start) is stale and is not counted; byte-identical reports of two runs are
two runs (plates#93).
Each top-level test is the file's own test, or one top-level describe with
every test in it, failed when one failed. The exit code is 1 when no tests
ran (no file, none in it, or stale; unless `allowEmpty`), else the runner's
own (`--status`: bun leaves a file that would not load out of its JUnit),
else 1 when a test failed. A file that is not JUnit is 1, never recorded.
A test and a describe of one name are two tests. A climb hygiene night
names a bun or vitest flake but does not climb it (prove-steady runs `node
--test` only). The runner is part of the config and the lane: a bun run is only ever
compared with bun runs, and its run-alone command is `bun test <file> -t
'^ ?<name>$'` for a test, or `'^ ?<name>( |$)'` for a describe (vitest:
`npx vitest run <file> -t …`). A `--runner` or `"tests".runner` that
contradicts the runner the file names is refused (exit 1, not recorded).

**A test judges the code, not the machine** (phase 55).
`scripts/plates/stalls.mjs` runs test files in a process group of their own
and pauses the whole group (SIGSTOP, then SIGCONT) for 50 to 500 ms at
moments from a seed: about once a second, never two seconds apart. Paused
time is not counted against the run's time limit. `plates test <file>
--stalls` runs a file that way and without, and names each test that passed
without and failed with: it judges the wall clock. The fix is the code's own
clock (`mock.timers`, a clock passed in), never a longer sleep. A file listed
in `.plates/plates.json` `"tests": {"stalls": [...]}` is pinned: when a whole
run reaches it, the ledger runs it again with stalls once its own run is
over (never two copies of one file at once; with a `--test-global-setup`,
after the whole suite and its teardown), from a fresh seed, and a
failure fails the run and prints `plates stalls: <file> failed with stalls
(…), seed N. Replay: plates test <file> --stalls --seed N`. An entry that pins
nothing (outside the repo, absolute, a file that is gone, or a folder) fails
the run, and so does a test that ran without stalls and never with them
too; the others still run. A run no stall landed in runs once more with its
first stall inside half that run's time; none again is inconclusive, and
fails: zero stalls judged nothing. A narrowed run never does. A passing test that said
`t.diagnostic('plates:inconclusive <what it measured>')` judges real time on
purpose and the machine kept it from judging: the ledger records it
`inconclusive`, neither pass nor fail, so it is never flaky, never slower,
and never a cited proof's pass. A failing test stays a failure.

**The build, timed** (phase 36). When `.plates/plates.json` names
`"climb": { "build": "<command>" }`, the night runs it once as `build_time`:
its wall time in ms, bound `"climb".buildBudgetMs` (no ratchet), else
recorded only (no bound, never outside, so the pages keep a trend). No
`build` is n/a; a failing build is broken, never a time. With the climb
practice on, the page also says when a climb job's last three
`plates-climb/<job>/` PRs were closed unmerged: that job proposes its own
retirement (gh's list of every state, read-only: a merged or open PR among
the newest three breaks the streak).

**The Tend line** (phase 38). With `"tend"` in `.plates/plates.json` (the climb
practice's weekly tend pass), the night reads the newest `plates-tend`
artifact on the default branch (gh, read-only, by name) into `.plates/tend`
before improve, and the page carries one line: `Tend: <date>: resolved N of
M, K proposed for the owner, PR #n; unresolved: <each finding> (tried: …)`.
A pass that did not finish says so; tend off, or never run, is no line.
Like the climb's line, it is not a measure: no bound, nothing to ratchet.

**Every PR plates opens can be judged in a minute** (phase 39).
`scripts/plates/pr-body.mjs` builds the body from structured input,
deterministically, in three sections in this order: **Summary**, a picture
(a file tree of the changed paths, or a table; never prose); **Evidence**,
the gate's line and rows of before and after ("Evidence: none recorded."
when there are none; the section is never dropped); **Merge danger**, a
two-way door (a revert restores everything) or a one-way door (something
leaves the repo), with the blast radius in Real surfaces terms (phase 32;
none is "this repo's … only"). Notes follow, and the plates-impact block
stays last. The night writes its input with `improve.mjs --pr-input` and
the commit's files: two-way, data files only. `plates update` and `plates
fleet update` use it too: the changed files, the gate and the practice
before → after, two-way when it only re-renders plates's files, one-way when
a migration rewrote the project's own files. Bad input (an unknown door
or surface, a summary that is not a picture) is exit 2.

Practice updates go out from plates: `plates fleet update` opens the
`plates/update-v<version>` PR in each project that is behind, with the owner's
own `gh` login. A person merges it. (`plates-update.yml`, which pulled plates
into each project weekly, was retired in 0.3.0 by migration 0002.)

Every workflow touches only its own branch prefix, never `main` and never a
person's PR; `tests/workflows.test.mjs` on plates holds the templates to that,
and to never naming plates's repo, a plates token, or a clone.
The night spends no model tokens: it measures, deterministically.

**Its config, read at run time** (so a change never needs a re-render), all
in `.plates/plates.json`: `setup`, the install command (default `npm ci` when
there is a lockfile); `env`, variables for every gate run; `setupToken`, a
repo secret's name passed as `GH_TOKEN` to the install step only, so setup
can clone a private repo the gate needs; `health`, above. Without `setupToken`,
Install receives no GitHub token. Consumer setup may need lifecycle scripts;
Plates itself sets `setup: "npm ci --ignore-scripts"` for its development tools.

The night's job has read-only permissions and checks out without persisted
credentials. API tokens are step-scoped; hosted project commands receive no
GitHub, Stitch or Vercel token through `gateEnv`. Nothing in it writes to the
repository.

**What it needs (⚑).** No secret, and no repository setting: it opens no pull
request.

**Selected files.** The complete installed file list and runtime imports live in
[practice.json](practice.json). The following is an overview.

`.github/workflows/plates-night.yml`, `scripts/plates/night-verdict.mjs`,
`scripts/plates/improve.mjs`, `scripts/plates/drain.mjs`, `scripts/plates/lib.mjs`,
`scripts/plates/test-ledger.mjs`, `scripts/plates/stalls.mjs`, `scripts/plates/pr-body.mjs` (managed), and the `night` block of the selected working guide (so it needs agents-md). They need the
phases practice's `scripts/roadmap.mjs` for the phase measures; with phases
off or local those measures are n/a.

**Lineage.** Plates phase 10. The rules are isocan's "The night shift's pull
requests" (the working guide; the drain after its grades and loop workflows, and
`scripts/changelog-drain.mjs`); the skip-with-a-notice from isocan's
`loop.yml`; porcelain over `git diff --quiet` from ledger's
`agent-audit.yml`.

**Ancestors (phase 16, 3 Oct 2026).** What plates decided for the projects this
practice came from, where each keeps a version of its own:

- **isocan**: *stays local*. Its `scripts/night.mjs` (a converge lane and a
  morning comment) is a different night from plates's measures; adopt keeps
  `night` local where a project has `scripts/night.*` or an `npm run night`.
  Its ideas already came home: conduct cost (`subagent-time.mjs`) and the
  ratchet (`ratchet.mjs`).
- **ledger**: *on*. Its agent workflows are its product's jobs, not a night
  shift over its practice.

## Optional project canvas projection

Since phase 207 the night writes no canvas: the only canvas writer is
plates-morning's card job, below. `plates canvas night --report <file> --json`
still projects an improve report by hand. Canvas publication is off unless
`.plates/plates.json` has both `canvas.enabled: true` and `canvas.cadence:
"nightly"`. A manual binding does not opt into scheduled publication.

This is an owner-provisioned integration, not a new installer or token scheme.
Before opting in, the existing project `setup` must make pinned `plates` and
`isocan` executables available on PATH. Provision
`PLATES_CANVAS_PLATES_VERSION` and `PLATES_CANVAS_ISOCAN_VERSION` with their exact
`--version` outputs, and `PLATES_CANVAS_ISOCAN_HOME` with the path of a dedicated,
already admitted isocan home. Setup can persist non-secret paths/version pins
through `GITHUB_ENV` and executable directories through `GITHUB_PATH`.
Authentication uses isocan's existing credential storage in that home and the
binding's approved writer identity. Do not put credentials in config, artifacts,
or the public workflow. No admission or identity command is run by this step.
The supported deployment and credential provisioning must be approved and
verified separately; this change does not establish that contract for Plates.

Missing tools, pin mismatches, missing home, expired authentication and failed
publication fail visibly. The workflow does not fetch or install either CLI,
import project scripts as a substitute for an installed CLI, or create a
replacement canvas. Existing `plates-night` concurrency serializes nights; sync
also owns a local writer lock and pending receipt recovery.

The card restores `recovery.json` from the latest **canvas-enabled attempt**
of this repository's default-branch `plates-night.yml` (whose nights wrote the
canvas until phase 207; a night attempt whose own job list shows no canvas step
is skipped) or `plates-morning.yml` (whose card job writes it), including failed attempts;
`scripts/plates/canvas-recovery.mjs` holds the rules for both. A plates-morning
attempt with no `plates-canvas-card-<attempt>` artifact never reached its card
job and is skipped; one still running makes the card wait a pass (exit 3)
and the night refuse, as for an unfinished night.
It reads the committed config at each candidate's source commit to establish
opt-in, rejects PR/fork/other-branch runs, and verifies repository, commit, run
ID and attempt against artifact provenance. Artifact names include the attempt:
`plates-canvas-night-<attempt>`. A missing, expired, oversized or ambiguous artifact
for the latest expected attempt is a manual-recovery failure, never permission
to fall back to an older journal. Reruns recover the immediately preceding
attempt. Discovery is bounded to the latest 100 workflow runs.

**Bootstrap:** before the first canvas-enabled CI night, owner-approved setup
must provision the original connection's `.plates/canvas/manifest.json` and any
history files it references. The committed binding alone is insufficient. No
night command reconnects or creates a replacement canvas. Existing local state
is never overwritten: a differing artifact journal requires manual resolution.
After bootstrap, artifact restore provides the state for fresh CI checkouts.

The recovery envelope matches project key, home, canvas, writer, audience,
space and privacy. Publication mode says how that destination is written, not
which one it is: an envelope saved as `immutable` or `live` still belongs after
the owner moves the binding. An unresolved live-pulse edit travels in `pending`
with its op id and exact bytes, so a fresh checkout retries the same act and
never a new one. The envelope contains only the validated sync
manifest, its hash-verified referenced history files, and bounded observation
history: the newest sample per UTC day for 90 days, at most 90 samples. Missing
intervals remain unknown. The complete sync journal and its referenced files
are preserved, including `pending`, `run`, groups, item identities and receipts;
no journal entries are silently pruned by the night wrapper. Exceeding the
64 MiB recovery-envelope limit fails visibly and needs reviewed retention.

`PLATES_CANVAS_OUTPUT` selects the local artifact directory (otherwise a fresh
temporary directory is used). In CI, `PLATES_CANVAS_PERSISTENCE=artifact-v1` enables
this contract and `PLATES_CANVAS_RECOVERY` names the verified downloaded envelope.
Snapshots, rendered views, receipts and recovery state use
`actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2` with 90-day retention. A normal failed sync exports
its pending journal in `finally`, so the next fresh checkout can reconcile it
without resending a creation. Abrupt process termination or upload failure can
leave no usable artifact; that case stops for manual recovery. The workflow
never substitutes older state.

Credentials, isocan homes, environment variables, locks, raw reports and
unreferenced cache files are excluded from recovery. Canvas state is never
committed. This artifact contract is implemented and exercised
with synthetic local runners; it has not been deployed or proven against live
GitHub/isocan credentials. Plates's own cadence remains manual until its owner
provisions and approves scheduled use.
