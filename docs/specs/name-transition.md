# Name transition: plates stops writing keel's names

Specified 2026-10-23. Phases 124–130.

## Why this exists

The rename to Plates (phase 109, #216) moved the product, the CLI, the config
and every managed file. It deliberately did **not** move the names that already
lived somewhere else: on GitHub, in a database, in a browser or on the owner's
machine. `lib/rename.mjs`'s `DURABLE` list holds them, so a project that
migrated kept its open night PRs, tonight's plan and its verify history.

That was right for the migration. It is wrong as a resting state, because the
shipped templates write those names too. A project adopted after the rename,
such as dtv on 0.8.33, has no keel history but still opens `keel-night/<date>`
branches. What a person sees is a product called plates writing keel's name
into their repository every night.

The owner's decision (2026-10-23) is that nothing else moves until the whole
fleet has made this transition, **plates first**, and that the whole rollout
happens in one evening.

## The rule

Every name moves the same way, in three steps, each a release:

1. **Write new, read both.** Plates writes only the plates name. Every reader
   accepts the plates name first and the keel name second. Where both exist for
   the same thing, the plates one wins, and the reader says so.
2. **Prove it on plates, then on each project, in one evening.** Plates moves
   first and passes a checklist on a night run dispatched by hand
   (`workflow_dispatch`). Then each fleet project moves in turn, the same
   evening, each checked the same way. A project that fails stops the
   rollout. (The owner's call, 2026-10-23: no waiting a week.)
3. **Retire.** Once no active fleet dependency uses a keel name, the
   live-state fallback reads go, in one release. Historical metadata readers
   remain permanently: unchanged old decisions, proofs and reconciliation records
   must still resolve. Retained aliases with verified replacements are shown
   separately from active dependencies and unknown coverage; they may enter the
   exact owner-approved removal operation, followed by an empty-inventory check.
   This avoids requiring old variables to be gone before the step that deletes
   them. Unverified replacements block, and secret values are never inspected.
   Retirement requires the owner to say retire.

A name that cannot be read both ways, such as a database function a deployed
build calls, gets a forwarding alias for the old name. It is not a hard switch.

Nothing historical is rewritten. Records keep the name in use when they were
written: evidence, health pages, night records, merged PR bodies, commit
messages and trailers, git history. This is lesson 58's rule. The transition
touches only the names in the table below, an allowlist, and never anything by
pattern.

## What still says keel

From origin/main at `216c8af`, in lib, practices, bin, scripts, .github and web:

| Surface | Names | Refs | Who can change it |
| --- | --- | --- | --- |
| Git branches | `keel-night/<date>`, `keel-night/<date>-final`, `keel-night-plan` (blob `.keel/night/plan.json`), `keel-climb/`, `keel-tend/`, `keel-loop/`, `keel/robot-*`, `keel/update-*`, `keel-verify` | ~290 | plates (new writes); open PRs keep their head branch |
| Concurrency groups | `group: keel-…` in 17 workflows | 17 | plates |
| CI artifacts | `keel-test-runs`, `keel-production-<n>`, `keel-canvas-night`, `keel-canvas-card`, `keel-tend-page`, `keel-time-proposal(s)` | ~50 | plates; old artifacts expire on their own retention |
| Comment markers | `<!-- keel:… -->` (health-report, morning, robot-state, cross-review, …) | 131 | plates (new writes); old ones stay in old bodies |
| Labels | `keel:agent`, `keel:review-after`, `keel:morning`, `keel:robot-*`, `keel:wait-for-review`, `keel:owner`, … | 240 | GitHub: a label rename is a remote change, ⚑ |
| PR-body fences | `keel-impact`, `keel-decision`, `keel-reconciliation`, `keel-proof`, `keel-measurements` | 80 | plates (new writes); merged bodies keep theirs |
| Repository variables | `vars.KEEL_*` | 5 | the owner, in GitHub settings, ⚑ |
| Web home | cookies `__Host-keel-session/login/oauth`, env `KEEL_WEB_ORIGIN/OPERATION`, headers `Keel-Operation`, `Keel-Update-Operation`, `trusted-keel` | ~40 | plates; Vercel env is the owner's, ⚑ |
| Database | schema `keel_private` (261 refs, mostly migrations), `keel_*_rpc` functions (70), `keel_run_history`, `keel-job-migrations` | ~340 | plates, by migration; the hosted database is the owner's, ⚑ |
| Owner's machine | `~/.keel/night-card/run.sh`, `~/Library/LaunchAgents/com.keel.night-card.plist`, `~/.keel/tools/`, git worktrees named `keel` | — | the owner, ⚑ |

Counts are `git grep -c` and include tests' and practices' rendered copies; the
phase 124 inventory replaces them with exact rows.

## Hazards, each settled by a phase

- **An open PR's head branch cannot be renamed.** A night that started under
  `keel-night/<date>` finishes there: its `-final` follows the night's own
  branch, not the current default. Drain, morning, the board, loose-ends and
  the web run views match both prefixes, as one queue. (125)
- **Two plans for one night.** While both plan branches exist, `goodnight` writes
  only `plates-night-plan`. The night reads it first, and reads
  `keel-night-plan` only when the plates branch holds no plan dated tonight.
  When both hold one, the plates plan wins and the night says so. (125)
- **A concurrency group change lets two runs overlap once.** A run still queued
  under `keel-night` does not wait for one under `plates-night`. Every night
  push may target a different ref, so a branch lease cannot serialize the two
  names. Before installing changed workflow groups in a repository, the owner
  disables the affected workflows with separate approval, then drains old runs
  or confirms cancellation is complete. Keep that dispatch/schedule barrier
  until the changed workflows are installed; a one-time empty listing alone
  cannot exclude a new cron run. The rollout preflight
  must prove no queued, waiting, pending or running old-group run remains;
  incomplete API coverage refuses the switch. No new dispatch until this
  barrier passes. A regression exercises both prefixes and proves that a live
  old run blocks the switch, including morning/finalization. (125, 128, 129)
- **An artifact reader finds nothing on the first night.** Readers accept both
  names for as long as the artifact's own retention (30–90 days). (126)
- **A label rename is a remote change, and filters and saved searches use the
  name.** GitHub keeps a renamed label on its issues, so it is renamed, not
  recreated. That happens only with the owner's yes, per repository. (128)
- **A cookie rename can break upgrade and rollback.** Deploy an owner-approved
  compatibility-reader release for session, login and OAuth cookies before
  switching writers or clearing legacy cookies. Pin it as the verified rollback
  target. Only then may the new build issue plates cookies and retire each old
  alias on response, preserving expiry. Rollback must consume the new cookies
  and finish in-flight login/OAuth flows; logout clears both aliases. A legacy-only
  rollback target blocks activation. This deployment is an explicit owner step,
  not implied by merging source. (127)
- **A database rename breaks the build that is still deployed.** New
  `plates_*` functions arrive by migration, and the old `keel_*` names stay as
  thin forwarders until retirement. The schema itself is moved with
  `alter schema … rename` only at retirement, behind a forwarding view, or not
  at all; 127 decides which. (127)
- **Variables and secrets cannot be read back.** Workflows read
  `vars.PLATES_X || vars.KEEL_X`. Plates can copy a repository variable through
  the API, but never a secret. Secrets are listed for the owner, with the exact
  `gh secret set` command and no value. (128)
- **The finalize rewrite already drops what it did not write (#218).** The
  branch work in 125 edits the same morning and finalize code, so #218 is fixed
  first, with its own regression test, or the new prefix ships the old bug.

## The phases

| Phase | Outcome | Depends |
| --- | --- | --- |
| [124](../phases/124-every-keel-name-plates-still-writes-is-listed.md) | One table lists every keel name plates still writes, and a new one cannot slip in | 109 |
| [125](../phases/125-plates-s-own-branches-are-written-as-plates-and.md) | Night, climb, tend, loop, robot, update and verify branches and concurrency groups are written as plates and read under both | 124 |
| [126](../phases/126-markers-fences-labels-and-artifacts-are-written.md) | Markers, fences, label names and artifacts are written as plates and parsed under both | 124 |
| [127](../phases/127-the-web-home-and-its-database-move-to-plates.md) | The web home and its database move to plates names without logging anyone out or losing a row | 124 |
| [128](../phases/128-what-the-owner-holds-moves-with-the-owner-s-yes.md) | Labels, repository variables, secrets, Vercel env and the owner's machine move with the owner's yes | 125, 126, 127 |
| [129](../phases/129-plates-then-the-fleet-move-tonight.md) | Plates, then the fleet, move in one evening, each proven by a night run dispatched by hand | 128 |
| [130](../phases/130-plates-stops-reading-keel-s-names.md) | Plates stops reading keel's names | 129 |

The fleet order in 129 is plates, ledger, duo, cajones, isocan, then dtv. isocan
is Dimitri's: its move is proposed as a PR, never merged by plates. dtv is
adopted but not in `plates.json`, and 129 settles that.

## What is not moving

- The `keel` command and `bin/keel.mjs`, the `/conduct` skill alias, and
  `.keel/` reading in `migrate` stay. They are compatibility entry points for
  people and machines, not names plates writes. 130 records whether they stay
  for good.
- Historical records (see "The rule").
- `claims/`, `ready/` and `green`, which never carried a product name.

## Open

- Whether `keel_private` is renamed at all, or kept as an internal name nobody
  sees. 127 measures what a rename costs on the hosted database.
- A dispatched night is not a scheduled one. The first scheduled night after
  the rollout is the last check, and its morning brief reopens 129 if any
  project still writes a keel name.

## 2026-10-24: standalone runtime packaging

Phase 126 centralizes fence aliases in the phase-124 name table. Reconciliation
therefore ships its canonical `names.mjs` sibling as part of the installed runtime.
This explicitly supersedes the prior single-file-copy promise in the decision
context guide; it does not add a third-party dependency, require the Plates CLI,
or activate the night practice. Adoption preserves the library's source ownership
and project-owned local runtime overrides. The standalone proof copies the installed
runtime pair to a clean directory and executes it there, with the same reconciliation
assertions. A second embedded alias table would undermine the transition guard, so
it is not used to retain the former packaging. Historical evidence remains unchanged.

## 2026-10-24: fence ambiguity belongs to a declaration

Phase 126 review reproduced valid historical and current records rejected merely
because their fence spellings differed within one document. Alias normalization
therefore operates per record. Existing declaration authority remains unchanged:
a singleton impact declaration cannot appear twice under different names, and
duplicate record identities or ambiguous anchors remain errors. Independent
decision, proof and measurement records may use either spelling in one file.
Historical bytes are not rewritten. Parser errors retain their source path.
This narrows the phase's former whole-body refusal; it does not weaken acceptance
or make one declaration override another.

## 2026-10-24: migration command and activation boundaries

Phase 128 implements `plates names`, its exact single-project approval/apply and
read-only recovery, `--machine`, and `--verify <repo>`. The verifier is source
work in 128 so the release contains it before phase 129's real rollout. Preview
writes nothing; `--yes --digest <preview-digest>` binds one exact repository or
machine plan. No fleet-wide apply, implicit workflow dispatch, commit, PR, rebase,
secret retrieval, cancellation or retirement is included. Unknown provider pages,
missing evidence and held activations remain explicit, never an empty inventory.

Only exact table rows qualify. Ordinary process environment aliases select the
current variable when present, validate it, and fall back only when absent; an
invalid current value does not select a valid legacy one. Values are not reported.
Existing hosted identity/conflict rules remain unchanged. Process overrides are
not assumed to be GitHub repository variables. Secret inventory reads names only
and prints exact owner commands, never values. Variable copies retain the old
name and keep values in memory only; changed source/destination invalidates approval.

Label rename receipts remain repository- and label-ID-bound and must be committed
at the workflow revision before activation. Version-one rename evidence remains
readable. Version-two evidence may additionally describe an explicitly approved
initial current-name creation, with its returned ID and verified readback; it
must not invent an old label or a rename. Preview enumerates latent labels needed
by enabled writers. Current-only labels without provenance remain unresolved.
Private attempted-write journals and public receipt bytes are separate. An
uncertain creation without a returned ID is not proven by finding its name;
recover the original operation, never issue a replacement POST. Publication of
the reviewed receipt is a separate rollout step, not an implicit apply side effect.

The 18 original phase-128 rows and the exact finite-environment additions below
appear with their actual consumer and activation state.
The four canvas properties are remote metadata, while `keel.project` also has
a distinct internal-symbol use. Dual readers preserve original pending operations,
metadata bases and historical receipts; existing cards stay on their recorded
key family until an explicitly approved conditional migration is supported. No
automatic rebase or replacement card. The goodnight seed preserves existing
subject reservations, intents and original issue identities, including uncertain
or closed originals, before selecting a current seed for genuinely new work.
Local claim readers preserve token/provider/session ownership and original
removal locations; remote claim refs do not change.

The shared proposal lock remains held while legacy participants may run. A
legacy-first dual-lock bridge would be a retained-compatibility exception to
write-new, requiring an explicit owner choice; neither alternate-file discovery
nor a new lock alone establishes exclusion. Temporary index/directory producers
may use current names for new objects while cleaning up only their exact owned
paths. The inventory-only canvas-card machine row remains held with its missing
consumer disclosed rather than inventing a filesystem migration.

Machine apply is separate, exact and recoverable: inspect source/destination,
refuse collisions/unsafe links, stop and confirm the old launchd job before
starting the new one, retain original intent and modes/content except approved
path/label edits. Worktrees are listed only. Tests use scratch homes and an
injected launchctl adapter; no real machine approval follows from those tests.

Verification reports pass/fail/unknown per phase-129 checklist item, linked to
run/attempt/source revision and retained records. A green run alone cannot prove
all names migrated. Required legacy-night continuation is valid and is distinct
from a fresh legacy write. Missing artifact, queue or board/history provenance
blocks a complete verdict without fabricating evidence. Source support, remote
activation, dispatched verification and owner acceptance remain distinct.

### Supported machine job shape (2026-10-24)

The initial machine adapter supports only the current user's `gui/<uid>` domain
and a bounded XML plist with the exact old Label and ProgramArguments naming
the table's night-card script, either directly or through `/bin/sh`, `/bin/bash`
or `/bin/zsh` without `-c`. Refuse unsupported/ambiguous launch shapes. Change
only the structured Label and exact script-path argument; preserve unrelated
plist fields. The script is moved byte-for-byte: portable scripts continue from
the new location. A script requiring embedded legacy-path edits is a manual
preview blocker, not permission for shell-text replacement. No script is run
during preview; scratch tests may execute their own synthetic portable script.
This settles an absent installer contract without inventing the owner's job.

### 2026-10-24: observable rollout verification (settled before producer work)

The initial phase-128 verifier could never return verified: existing health,
canvas and final-plan records do not associate the morning with an exact Actions
night attempt or establish actual body writes and reader consumption. A green
night and negative-only verifier tests cannot satisfy phase 129. This is source
work in phase 128, not an owner walk deferred to phase 129.

Extend the existing producers' JSON results and retain one immutable observation
artifact **per run attempt**, with a morning artifact referencing its originating
night artifact by provider ID and digest. Use the new current-only artifact family
`plates-names-observation-<runId>-<attempt>`. It carries evidence, never task status,
acceptance, permission, or mutation recovery authority. Existing phase, health,
plan, verification and operation records remain authoritative in their scopes.

Observation is opt-in through `workflow_dispatch` input `names_evidence` (default
false). An evidence-enabled morning also takes the exact originating night run ID
and attempt. A final collection job waits for both finalization and sending; it
must preserve failed, skipped, unfinished and missing producer coverage. Ordinary
schedules and write permissions do not change. Enabling observation grants no
agent budget, dispatch, merge, label, secret, deployment or machine permission.
Phase 129's exact dispatch preview will name these inputs.

The source contract is:

- Bind the repository ID/name, workflow path, run ID/attempt/event/head SHA and
  actual executed code identity separately from a later pushed data commit. Pin
  configuration and expected applicable producers at that source. An installed
  CLI needs its own verified code identity; a version string alone is insufficient.
- Capture the night writer's original resolved branch/lease, actual PR object and
  head, plan and changed health blobs. A manual Actions run's `pull_requests`
  array is not the association with the PR that run later creates.
- Extend existing morning final/brief/send results with their actual final PR,
  sent issue/label identities, original night association and confirmed/no-change/
  uncertain outcomes. A no-change final must identify and verify the existing
  same-night result. Already-sent is retained history, not a new delivery.
- Pin the commits/blobs actually read by morning's plan/verify readers. Preserve
  selected and contributing inputs, both alias reads, complete known absence,
  skipped and unavailable states, and a digest of the resulting projection.
  Board currently consumes verify history but not the night plan: add a small
  real plan source projection to its existing JSON result, with the same source
  trace. A diagnostic read unrelated to the board output is not consumption.
- Retain actual generated managed fragments/name tokens and before/intended/after
  digests for applicable PR/issue/comment and Git writers, tied to exact object
  IDs and original operation IDs where they already exist. Read back results;
  uncertain writes stay uncertain and are never retried by the observer. Old
  historical regions retained unchanged are distinct from freshly generated
  legacy text. Preserve required original-prefix night continuations.
- Retain drain's actual actions and complete current queue observation, and
  provider-backed artifact identities. A rerun cannot attribute an earlier
  attempt's artifact to itself. The observation artifact's own final digest is
  verified from provider metadata after upload, not self-certified inside it.

This boundary covers this invocation's managed writers and readers, not unrelated
actors' concurrent activity. Derive expected producers from the pinned workflow
and configuration: unsupported enabled write paths, missing producers or unstable
readback block complete coverage. Before/after snapshots do not establish that
an unrelated actor never wrote and reverted between reads; never claim that.
A generated-payload/readback mismatch is unknown, not permission to overwrite.
Disabled optional writers need source/step evidence, not an authored `passed` flag.

The verifier recomputes checks from these observations and cross-checks fresh
provider run/attempt/jobs, artifacts, exact objects and immutable Git blobs. It
must have a positive end-to-end synthetic test with an empty manual-run PR array,
plus independently failing cases for each required check. Missing, expired,
tampered, cross-repository, cross-attempt or incomplete evidence is unknown or
failed, never successful. Named manual labels are classified from actual source
use; unclassified writers cannot be waved through to make success reachable.

Use a bounded data-only observation helper and the existing transport conventions;
no global interceptor, extra scheduler, audit database or second status engine.
Limits: JSON 1 MiB; 512 writes; 64 reads; 128 allowlisted generated-fragment members;
256 KiB per member; 8 MiB compressed and expanded archive; 20 pages of 100 provider
objects per listing. Reject path traversal, links, duplicate archive names and
unsupported compression before extraction/inflation. Limit exhaustion is a gap.
Artifacts retain for 14 days under existing repository access policy; expiry is
unknown coverage. Upload exact allowlisted files only, never a whole temp/state
directory. Exclude environment/secret values, raw command logs, private feedback,
unrelated board entries and full private issue bodies. Git bytes are retrieved by
immutable blob ID; non-Git evidence uses only the generated managed fragments and
bounded observations. If safe evidence is insufficient, retain the gap.

Source implementation remains separate from activating evidence runs or changing
fleet state. The real owner-approved run/attempt walkthrough remains phase 129.

### 2026-10-24: finite environment compatibility inventory (settled before expansion)

Removing phase 109's broad environment copier exposed a census gap: current
literal-source scanning alone does not enumerate the historical bindings that
copier still supports. Historical source is
47f3043948260d764b83bc5ff83d8bef6f5e308f, immediately before rename commit
a9e6600bb222040ac71f55c4873f8de9e3e3d7d3. Preserve phase 124's original
139-row observation; it is not evidence that every computed alias was covered.

Add exact phase-128 rows for these proven historical environment bindings.
Each row records its environment policy and scope in the existing canonical
table; do not create a second alias registry or restore arbitrary prefix copying.

- Ordinary: KEEL_MILESTONES_OFFLINE, KEEL_CANVAS_PERSISTENCE,
  KEEL_CANVAS_RECOVERY, KEEL_CANVAS_OUTPUT, KEEL_ISOCAN, KEEL_CI_OFFLINE,
  KEEL_FLEET_PRACTICE, KEEL_NPM, KEEL_GIT, KEEL_CLAUDE_DIR,
  KEEL_PROVE_MUTANT_MS, KEEL_PROVE_IGNORED_BYTES, KEEL_REVIEW_POLL_MS,
  KEEL_CACHE, KEEL_PREVIOUS_PRACTICES, KEEL_SELF_UPDATED, KEEL_CLIMB_CLOCK,
  KEEL_CLI, KEEL_NOW, KEEL_STITCH, KEEL_DRAIN_WAIT_MS, KEEL_QUOTA_FLOOR,
  KEEL_STALLS_SHAPE.
- Claim identity: KEEL_PROVIDER, KEEL_SESSION, KEEL_MACHINE.
- Gate/ledger invocation identity: KEEL_RUN_START, KEEL_GATE_INVOCATION,
  KEEL_USUAL, KEEL_GATE_ACTIVE, KEEL_SUITE_PLAN.
- Publisher source identity: KEEL_PUBLISHER.

Their current names are the individually enumerated PLATES counterparts; the
runtime resolves exact table rows, never constructs an alias by string pattern.
Ordinary selectors use current presence and preserve existing consumer validation.
An invalid current value never falls through to legacy. Identity selectors refuse
conflicting simultaneously supplied values before claiming ownership, attributing
a run or trusting a source. Equal values still undergo the existing validation.
Nested gate/ledger forwarding scrubs both exact families where it previously
scrubbed one; preserve an original invocation rather than inventing another.
Publisher identity retains its existing source-digest check.

The five already mapped ordinary bindings and phase 127's hosted config/auth
readers keep their own contracts. Internal ROBOT_FETCH_AUTH transport headers
are generated and consumed within their existing boundary, not a new external
configuration alias. Heredoc delimiters and constants are not environment
bindings. New post-rename controls, including observation controls, receive no
invented historical aliases. The table addition does not relocate cache contents,
rewrite recovery intents or change the owner's machine.

Runtime alias support and provider configuration are separate scopes. Adding a
process-binding row does not automatically enable GitHub variable copies or
secret-setting suggestions. Provider actions need their separately identified
configuration scope and exact observed resource/source facts in the approved
preview; unavailable provider applicability remains explicit. Never expose or
persist environment values as inventory evidence.

Prove each new fallback in both directions through its real consumer, including
current-invalid/legacy-present and identity-conflict cases. Unknown aliases must
remain inert. Retain failed experiments and old proofs; refresh changed-reader
proofs at final source. The finite source/history inventory is an explicit
compatibility correction, not a blanket claim about arbitrary dynamic inputs.


### Manual observation runtime provisioning (settled 2026-10-24)

Adopted night/morning workflows execute managed project scripts; they do not
promise an installed Plates CLI. An npm Git installation without its Git source
identity is not evidence of a pinned runtime. The manual evidence path therefore
takes `names_source_sha`, an exact lowercase 40-character source revision reviewed
in the phase-129 dispatch preview. It is required only with `names_evidence: true`;
normal dispatches and schedules retain their existing behavior and budgets.

For that explicit path, use the existing checkout action with the repository fixed
to `dalmaer/plates`, the exact validated SHA, depth one, persisted credentials off,
and submodules/LFS off. Existing access only: unavailable source access is a
refusal, never a new grant, secret, or fallback to latest. Checkout into an exact
fresh staging path under the workspace, then move it to an exact fresh runner-temp
runtime path before project setup, measurement or gate execution. Refuse collisions
and verify real Git top-level and HEAD. Do not install packages, run lifecycle
scripts or build this checkout. It must not pollute the project's status/staging.

Run observers and the real board command from this source; project-managed
producers continue from the project's checkout. Record and verify both actual
loaded source closures separately. The input SHA is an approved locator, not a
self-certifying verdict. Missing manifests, modified code, unavailable immutable
provider bytes and incomplete imports remain gaps. Morning receives the exact
`night_run_id` and `night_run_attempt` and must use the same observer repository
and revision as that night's artifact. A newly provisioned observer does not
upgrade old project producers or establish their compatibility.

The observation checklist covers the enumerated source-owned managed writers and
readers. Project-owned setup/gate commands are pinned context outside this
instrumentation boundary, disclosed in the result; their presence alone does not
prove failure of the managed-name checks. Their arbitrary shell, lifecycle or
network effects are **not** certified legacy-free. Changed managed bytes after
setup, unsupported enabled managed writers, absent required outcomes, uncertain
writes and incomplete provider coverage still block verification. The separate
unmanaged-file inventory and approved project PRs remain required; passing the
managed checklist does not replace them or establish full-fleet acceptance.

This settles the runner prerequisite identified by the actual managed workflows,
not a new rollout approval. Phase 129 previews the observer source SHA, installed
managed-source revision, exact dispatch inputs, access limitations and observation
scope before the owner authorizes each project's run. Tests cover a real adopted
configuration, exact source/attempt mismatch refusals, collision refusal and no
behavior/permission/budget change when evidence is off.

### 2026-10-24: producer targets and generated-region verification (review correction)

Supplemental review of phase 128 demonstrated that digest-consistent observations
could hide a generated name, substitute another producer's target, or treat a
skipped history read as consumption. This settles the evidence boundary before
extending the existing producers; it grants no rollout or remote authority.

Each write carries a closed output-role discriminator. The verifier independently
binds that role to its producer, pinned configuration, original date/branch and
actual provider object or immutable Git output. A caller-supplied producer ID,
fragment, token list, arbitrary byte range or generic target cannot establish
coverage. Duplicate/conflicting outcomes refuse verification. Missing role data
in older observations remains unknown; historical observations are not rewritten.

| Producer / role | Required target and evidence |
| --- | --- |
| Improve / health-report | Pinned configuration's health directory and date page, at the associated night branch/head; independently checked health-report region and fresh proposal regions. |
| Improve / bounds | Exact `.plates/bounds.json` at that night head; full generated JSON. |
| Improve / night-record | Exact `docs/night/<date>.json` at that head when the actual pinned producer creates a plan. |
| Improve / working-plan | Exact local `.plates/night/plan.json`, paired by complete byte digest with the published night record. It cannot substitute for the published record; no provider read is invented for an ignored local file. |
| Improve / time-remeasurement | A date page within the pinned health directory, with a bounded source-defined time-proposal region and immutable before/after bytes. It cannot satisfy health-report or bounds coverage. |
| Plan publication | An exact table-owned plan ref/path, pinned commit/blob and matching original night date. A continuation retains its original alias. |
| Finalization / night-record | Exact `docs/night/<date>.json` at the associated final branch/head. |
| Finalization / health-plan-section | Optional pinned health-directory date page at the same head; reconstruct only Tonight's plan using the existing plan generator and immutable preimage. |
| Night PR / final PR | Exact associated repository, PR ID/number/head. Check the complete fresh generated body; retained no-change requires identical before/after body digest and object identity. |
| Brief issue | Exact associated issue ID/number and complete fresh generated body. |
| Closure comment | Exact comment and parent issue identities, with the source-defined supersession text pointing to the associated brief. Comments cannot substitute for brief-issue coverage. |

Required roles come from the pinned producer path and applicable configuration,
not an observation's assertion of applicability. An unavailable role cannot
satisfy required coverage. Required history aliases need a pinned successful
read or independently confirmed absence; skipped/unavailable rows remain unknown.

Use existing snapshot commit/blob/hash fields for immutable preimages. Capture
the actual preimage before mutation and match its bytes to a retrievable commit;
execution source SHA is not automatically publication or preimage SHA. An
intermediate uncommitted preimage that cannot be independently recovered is a
named gap. No fabricated HEAD attribution or extra raw-body artifact is allowed.

For partial health edits, only source-defined, structurally identified retained
verification/proposal regions whose bytes match the verified preimage count as
history. Extract names independently from the remaining actual generated region,
including its wrappers. Do not waive arbitrary unchanged substrings or trust a
fragment's omitted tokens. Reconstruct the final health-plan section with the
existing generator against that preimage. Ambiguous structure or reconstruction
remains unknown. Identical retained-region bytes cannot prove whether code
regenerated identical text: the claim is observed output/change consistency
under the pinned producer contract, not invisible generation causality. Offered
content discarded before publication and unrelated actors' activity are outside
that provider-visible claim.

Keep existing privacy and archive bounds. Duplicate decoded JSON member names,
including escaped and nested aliases inside projection text, refuse transfer
before any output export. No environment value, raw private body or arbitrary
producer text becomes permitted by adding an output role. Extend only the
existing producer/helper/verifier contract and its real positive/negative tests;
no new scheduler, evidence store, permissions or workflow activation is needed.
