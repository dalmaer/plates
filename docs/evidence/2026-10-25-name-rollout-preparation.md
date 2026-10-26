# Name rollout preparation — 2026-10-25

Source: dalmaer/plates at 419756f50f19e5a803dc9ea6d30c24e030c55591, merging PR264 reviewed head 42216ce83e7fd571dc0a9b098ef05bdd49368c84. Phase 128 claim released; phase 129 claimed before release preparation. Primary checkout and fleet installations remain unchanged.

## Source verification

`PATH=/opt/homebrew/bin:$PATH TZ=UTC npm run check` on the final phase 128 tree exited 0:3,463 tests,3,459 passed,four skipped,zero failed,488.065 seconds. Nine seeded stall checks passed (seed 1207027761); roadmap/render/inbox passed; `npm run typecheck` exited 0. Ledger hygiene reported no flaky/slower test over 23 observations, five busy omitted. CI [40167503771](https://github.com/dalmaer/plates/actions/runs/40167503771) passed in 9m14s; typecheck/impact passed. Exact-head Claude review [5641789803](https://github.com/dalmaer/plates/pull/264#pullrequestreview-5641789803) disclosed partial coverage and one P3 describing deliberately unresolved lost-create-ID behavior. Answered through `plates review --close --not-valid`, citing the approved contract and regression. Supplemental verifier re-review was unavailable because of a cybersecurity filter, not counted as passing coverage.

## Release guard

`node bin/plates.mjs release 0.8.34 --notes /tmp/plates-name-transition-release-notes.md --json` exited 1 before writes. Of 22 practice commits since v0.8.33, 20 pass the review guard. Two failures belong to [PR 220](https://github.com/dalmaer/plates/pull/220): 44dacb4 had a Codex review; final head 04dca79 merged then-main and resolved generated-record conflicts without an exact-head review. Its final CI passed. The supported owner exception remains unapproved. No tag or release commit was created.

## Candidate fleet rehearsal

`node bin/plates.mjs fleet update --rehearse --json` from 419756f, next candidate 0.8.34, exited 1 after 639.379 seconds. This runs temporary clones only; no push, project PR, workflow dispatch, live update or acceptance.

| Project | Candidate check | Baseline | Observation |
| --- | --- | --- | --- |
| dalmaer/duo | npm run check: passed | Not separately required | Candidate gate passed |
| dalmaer/cajones | npm run check:all: passed | Not separately required | Candidate gate passed |
| dalmaer/ledger | npm run check:all: exit 1 | Same check on unchanged main: exit 0 | ENOTEMPTY removing temporary pg-git-Sm82Nw; release blocked; causality/flake unproven |
| dglazkov/isocan | Test/typecheck/Loop chain: exit 1 | Same chain: exit 1 | Talk token test cleanup reads root.unmount on undefined; passing coverage absent |

Plates itself is excluded from the consumer rehearsal. Dtv remains outside the managed inventory pending the owner's scope decision. No failed candidate was blindly retried. Existing collector retains only output tails, not complete project failure logs; do not infer the first failure from Isocan's cleanup tail. Private JSON/stdout/stderr are retained under `.plates/name-transition/release-0.8.34-rehearsal-20261025/`.

## Real preview and inventory

`node bin/plates.mjs names --repo dalmaer/plates --json` at 419756f exited 1, read-only. It names three label actions but refuses because managed workflows use `secrets[steps.config.outputs.setup_token]`, classified as unsupported dynamic provider scope. No secret values were read, and no action was applied. This is source work before rollout, not permission to suppress the gap or broaden dynamic expression support.

The refreshed pinned-main inventory lists 742 unmanaged/mixed matching files: Plates 608, Ledger 42, Duo 24, Cajones 23, canonical dglazkov/isocan 45, Dtv 0. Coverage excludes 121 binary files, 30 sensitive paths before content reads, and two submodules. Previous snapshots remain intact. Full filenames/lines/lock ownership are in `.plates/name-transition/plates-pre-rollout-inventory-release-20261025T061041Z.{md,json}`. Matches are not replacement authority; historical records and compatibility stay preserved.


## Finite provider-scope correction — 2026-10-25

The candidate classifier recognizes only five exact shipped workflow renderings
with same-revision validated configuration. Classification provenance binds the
workflow, complete configuration bytes, trusted template and implementation into
the approval digest. Arbitrary or edited workflows remain unknown. No new table
rows, variable actions or secret-value reads are introduced.

The conductor independently ran `node --import ./tests/helpers/hermetic.mjs
--test tests/names-provider-scope.test.mjs tests/names-cli.test.mjs` with
`PLATES_GH=/usr/bin/false`: 64 tests passed, exit 0. Actual `plates prove` against
`7e6979b7` returned VERIFIED for the canonical-night regression. Six literal
mutations covering workflow equality, config validation, exact path, config
provenance and each mapped name spelling passed baseline and failed assertions
under mutation. The conductor checked their source/test/hook and twelve paired
log/trace identities. Existing failure observations are preserved.

`node bin/plates.mjs names --repo dalmaer/plates --json` with the candidate
against remote revision `419756f` exited 3 (approval preview), with no provider
scope problems. All five workflows classified as no configured setup secret.
The plan proposes renaming the existing agent and morning labels and creating
the review-after label. This was read-only: no action applied, no owner approval
inferred, and no claim of released installation. Vercel and owner-machine coverage
remain unobserved. The preview must be refreshed after source/release changes.

Proof packet and both real previews are retained under
`.plates/name-transition/phase129-provider-scope-20261025/`. Integrated full gate,
exact-head review and CI remain required before this correction merges.

## Merge and rollout resumption — 2026-10-25

[PR 265](https://github.com/dalmaer/plates/pull/265) merged as
`3cf6f378c9d2cf1c4f8e3f489c7f639716ef5248`. Exact reviewed head `a64847ae`
passed the local full gate (3,500 tests: 3,496 pass, four skipped), typecheck,
and [CI](https://github.com/dalmaer/plates/actions/runs/40169929841). Claude
reported no findings; the explicit reviewer gate passed. This settles the earlier
managed setup-token source blocker, not remote activation.

The owner approved and then requested merging [Ledger PR 169](https://github.com/dalmaer/ledger/pull/169).
It merged as `459c96cc092736403211ea9cb504ed478d96fd05`: two test-only fixture
ownership files, full `npm run check:all` on Node 24.22.1 and
[GitHub checks](https://github.com/dalmaer/ledger/actions/runs/40180985978) passed.
Claude reviewed exact `218293e9` with no findings. Local data/performance checks
used an empty synthetic ledger; no live-data or representative performance claim.
Actual `plates prove` was INCONCLUSIVE because the test itself is the fix; its
with-fix run passed. The separate original cleanup-order assertion failure remains
retained. The original rehearsal ENOTEMPTY cause remains unproven.

At Plates main `27ad3828`, the release review audit still reports 20/22 scoped
commits passing; both failures are the historical PR 220 final-head review gap.
The requested exception remains an owner decision. No release tag exists yet.
DTV's current adoption config identifies `dalmaer/dtv`, practice 0.8.33 and
`npm run check`; it is included in the managed inventory for the owner-requested
final rollout position. No new schedule or agent allowance is enabled.

The read-only Plates names preview at `27ad3828` proposes two label renames
(agent and morning) and creation of review-after, with no secret commands or
provider-scope problems. Nothing applied. One active-run page was empty but is
not complete barrier proof. Machine preview refused `unsupported_mode`; metadata
inspection found home mode 0750, `~/.keel` already a symlink to `.plates`, current
night-card plist present and old plist absent. Preserve that alias: this is not
permission to rewrite modes or move through the symlink, nor complete launchd
verification. Private observations are retained under
`.plates/name-transition/resume-20261025/`.

## Fresh rehearsal and unmanaged-file reconciliation — 2026-10-25

`node bin/plates.mjs fleet update --rehearse --json` from `27ad3828`
completed in 508,037 ms, exit 0 under the collector's existing policy. Ledger,
Duo and Cajones passed their configured gates with candidate 0.8.34. Isocan
was classified `main-red`: candidate and unchanged main both exited 1, with
retained tails showing `root.unmount` on an undefined root in
`packages/modules/talk/test/token.test.ts`. The tail does not establish the
first failure or its cause. The aggregate exit is not a passing Isocan gate.
DTV was added after this rehearsal's inventory was captured and is not covered.
No PR, installation or workflow dispatch was produced by rehearsal. Earlier
failed observations remain intact; Ledger's later pass does not prove causality.

Fresh pinned project-owned review at Ledger `459c96cc`, Duo `d0db01f4`,
Cajones `c6a40bf4`, canonical Isocan `8ccde941` and DTV `26a6106f` found no
executable project-owned rename required in the inspected coverage. Ledger
already uploads `plates-test-runs`, reads both artifact spellings and has 14
CI-alert watcher names resolving to actual workflow display names. The earlier
phase examples are superseded by these facts, not blindly replaced in code.
Optional Ledger description/comment and Isocan operator-guide patches remain
unapplied, pending separate approval. Other three patches are empty. Historical
records, compatibility assertions and project-specific artifact suffixes stay
unchanged. Sensitive paths, binaries, oversized files and untraversed links or
submodules remain coverage gaps.

The frozen private packet retains exact revisions, name-table provenance, file
hashes, matching locations and dry-run results. Conductor verification:
`python3 /tmp/plates129-unmanaged-proposals/check-proposals.py`; patch review
and applicability checks do not establish project gates or live activation.
Rehearsal and packet are retained in `.plates/name-transition/resume-20261025/`.
The final integrated tree requires `npm run check` and `npm run typecheck`
before publication; their outcomes belong to the resulting commit/CI record.

## Targeted rehearsal follow-through — 2026-10-25

Using the existing exported `fleet`, `updatePlan` and `rehearseOne` interfaces
from source `06d23af8`, the conductor selected one observed project at a time;
no substitute update implementation or runtime source edit was introduced.
DTV's configured `npm run check` passed with candidate 0.8.34 in 48,842 ms,
exit 0. Its observed pending migration was `0004-test-ledger`. This supplies
the missing DTV coverage from the earlier four-project batch.

A bounded synthetic Vitest/jsdom probe ran once per runtime: Node 26.12.1
failed because `localStorage.clear` was unavailable; Node 24.22.1 passed.
It accessed no storage entries and used isolated home/cache/config with no
project setup hooks. This reproduced a runtime compatibility difference, not
the original suite's first error. Isocan's `.nvmrc` pins Node 24.22.1.

The subsequent disposable Isocan rehearsal under that pinned runtime passed
its complete configured command, `npm test && npm run typecheck && node --test
tests/loop.test.mjs`, with candidate 0.8.34 in 297,161 ms, exit 0. This was a
changed-environment diagnostic, not an unchanged retry until green. The previous
baseline/candidate failures remain retained; neither their missing first errors
nor all possible environment differences were reconstructed, so sole causality
is not claimed. Use the pinned Node runtime for the release's own rehearsal.

All five consumer projects now have passing candidate rehearsal observations.
This proves neither release installation nor the real dispatched night/morning
walk. The PR 220 release-review exception remains an explicit owner decision.
Commands, JSON outcomes, full synthetic probe logs and runtime paths are retained
in `.plates/name-transition/resume-20261025/`; the prior observations are not
rewritten. This section supersedes the earlier current-coverage gaps, while
preserving what those earlier invocations actually observed.

## Final record gate limitation — 2026-10-25

The first record commit `06d23af8` passed local check/typecheck and exact-head
Claude review, and its CI passed. The later reconciliation above changes the
recorded current coverage. Its local `npm run check` exited 1: 3,496 functional
tests passed, four skipped, but the pinned phase-63 timing check injected zero
pauses with seed 374407218, including the runner's one bounded fallback. This
is missing timing evidence, not a passing final gate. Typecheck exited 0.

One focused diagnostic replay of that exact seed passed ten plain and ten
stalled tests with six pauses. A read-only observer logged/rethrew signal
errors; only final SIGCONT/ESRCH after process exits appeared in this replay.
The original run did not retain signal errors, so its cause remains unknown.
No full-gate retry, unpinning, sleeps, assertion weakening or suppression was
used to turn that failed receipt green. The new issue's exact body and full
logs/receipts are retained privately; automatic approval review rejected its
publication because the owner's earlier hygiene approval covered a different
failure. No new issue was created. The latest record correction remains local
until this gate is resolved; its predecessor's green CI is not current proof.


## 2026-10-25: owner decisions reconciled before resuming

The owner explicitly approved filing the timing-harness issue, the documented
historical PR 220 release exception, and both prepared Ledger/Isocan documentation
PRs after managed updates. [Issue 268](https://github.com/dalmaer/plates/issues/268)
now retains the timing failure. Earlier approval-pending statements above describe
the observation at that time, not current blockers. Isocan merge remains the
owner’s or Dimitri’s. The exception does not waive the full gate or rehearsal.

The next integrated check runs under Node 24.22.1, the runtime that passed the
Isocan rehearsal, rather than the prior Node 26 host environment. This is an
explicit environment change, not a claim that a subsequent pass explains the
original missing signal injection. The original failed receipt remains intact.
Command: `PATH=<Node 24.22.1 bin>:$PATH npm run check`; typecheck runs on the same
final tree. Results belong in the commit and retained logs after completion.

At each merge, release and project-rollout boundary, refresh GitHub facts and
reconcile current phase status, next action, approvals and evidence before moving
on. Existing `plates doctor --github --json` provides remote-reference checks;
manual comparison still owns approval and acceptance facts that tool cannot infer.
No merge is promoted to acceptance or production verification automatically.


## 2026-10-25: pinned-runtime gate and reconciliation observation

The integrated Node 24.22.1 gate exited 1: 3,500 tests, 3,495 passed, one failed,
four skipped. The killed-wrapper test in `tests/validation-budget.test.mjs`
expected `capacity_busy` but observed `coordination_busy_inspect_do_not_steal`.
The running lease can be published before its mutation releases coordination;
observing the lease alone does not establish the intended post-mutation crash
point. A focused test-handshake repair is being verified separately; no production
lock weakening or permissive replacement assertion is proposed.

All nine pinned stall files injected pauses and passed on this run, including
phase 63. That does not establish the cause of the earlier zero-pause result.
Typecheck passed. Logs are retained in the private `node24-final-gate` directory
under the existing phase-129 recovery packet.

Fresh `doctor --github --json` returned incomplete coverage because unqualified
“Ledger cleanup PR 169” was interpreted as `dalmaer/plates#169`, which is absent.
The current phase now names `dalmaer/ledger#169` explicitly. It also uses the
existing structured reconciliation contract for its PR links and next acceptance
obligation. Historical prose remains preserved. No acceptance box was checked.


## 2026-10-25: separate crash-test repair prepared

[PR 269](https://github.com/dalmaer/plates/pull/269), head `fea4dc1f`, changes only
`tests/validation-budget.test.mjs`. Both signal tests wait for a matching running
lease and released coordination guard. The regression retains the guarded state
until the handshake refuses it, then removes the guard and verifies completion.
Removing the actual guard wait makes the regression fail. Production code and
original capacity assertions are unchanged.

The conductor independently ran the file: 30 tests passed. The isolated repair’s
full gate passed 3,501 tests (3,497 passed, four skipped), all nine seeded stall
checks, roadmap/render/inbox guards; typecheck passed on Node 24.22.1. The standard
prove command is INCONCLUSIVE because the test file is itself the fix; the literal
mutation is separate evidence, not relabeled as its verdict. Review and merge were
still pending at this observation; the rollout record’s integrated gate is separate.


## 2026-10-25: hygiene repair merged

PR 269 merged as `56bc8b54841849fe5e357e49ba07811755f597db` at
14:24:46 UTC after exact-head Claude review 5643626760 found no issues and
GitHub check 40201337524 passed. The integrated rollout-record tree also passed
its full local gate (3,497 passed, four skipped), typecheck and fresh remote
reconciliation (zero findings, zero unknown observations). Updating this current
next action after the merge requires the final gate again before the next push;
prior checks and failed observations remain separately retained. No release or
live rollout is implied by these source checks.

## Superseding rollout observation — 2026-10-25

Release v0.8.34 was published: tag target `94ae6ac1e033083ef21e78270e1864703f359429`, with the identical tree on main `9942b9ffbe046eba584da9c93731230e613110d8`. The owner approved publication while holding Isocan. The final release rehearsal passed Duo, Cajones, Ledger and DTV; Isocan candidate and unchanged main both failed its watchdog cleanup assertion. Earlier passing observations remain historical, not a clearance of this failure.

Under the owner's request to update every project and clean up Keel names, `plates names --repo dalmaer/plates --yes --digest 59bcd34be8e61cd74d3f0a6ecea171968dc2665d8621fcce0fcb04b423bfba35 --json` renamed the existing agent and morning labels and created plates:review-after. All three IDs were read back. The exact public receipt is `.plates/name-transition/label-renames.json`; no variable or secret was changed. Receipt publication and source-bound night/morning verification are separate from these confirmed provider writes.

Current upstream Isocan `8305668ded7b09157b1646021209c5ed16a518a2` passed [four CI shards and typecheck](https://github.com/dglazkov/isocan/actions/runs/40222150595). The unchanged watchdog test passed once under Node 24.22.1 with normal process inspection (`node --test --test-name-pattern='TERM-resistant group descendants' scripts/install-watchdog.test.mjs`, one pass). This diagnostic neither establishes the original cause nor verifies the updated candidate. Its full fresh rehearsal is still pending. Upstream separately disabled unauthenticated production collection; that is not proof of production health.

The fleet inventory still reports legacy open PRs in Duo, Cajones, Ledger and Isocan and unclassified provider bindings on the installed consumer workflows. Branch existence alone does not authorize deletion or establish active use. No dispatched rollout acceptance is checked here.

### Fresh candidate and branch cleanup

The single fresh Isocan rehearsal of released practice 0.8.34 returned `status: passed` for `npm test && npm run typecheck && node --test tests/loop.test.mjs`. The canonical default ref was observed at `8305668ded7b09157b1646021209c5ed16a518a2` both before and after; the collector does not retain the clone SHA, so this is bracketed source observation rather than a pinned-clone receipt. No repeated-until-green loop was used. The earlier failing release rehearsal remains retained; a passing candidate is not installed or accepted rollout evidence.

Fourteen exact legacy branches were deleted after fresh ancestry, open-PR and active-run checks, using per-repository atomic pushes with expected-SHA leases and confirming absence afterward: three old update branches each in Duo, Cajones and Isocan, and five merged update/adoption/tend branches in Ledger. Their commits remain reachable on main. Open legacy night PRs and durable state refs were retained. The private operation receipt retains every deleted ref/SHA and readback; no historical record was rewritten.


## 2026-10-25: all-project preparation and actual CI access gap

[PR 270](https://github.com/dalmaer/plates/pull/270) merged the reviewed label receipt at `303789903e56e64c5789bcc563980feba7496f49`. Its local full gate and typecheck passed; exact-head Claude review found no findings. The subsequent [main run 40241468815](https://github.com/dalmaer/plates/actions/runs/40241468815) passed its configured gate, then failed GitHub reconciliation with HTTP 404 for private Ledger PRs 130 and 169. Local reconciliation had zero findings/unknown; remote reconciliation had zero contradictions and two unavailable observations. Owner CLI independently read both PRs as merged. This is a credential coverage gap, not a test failure or permission to delete references.

The owner provisioned `PLATES_RECONCILE_TOKEN`; only the secret name was read back. Its requested scope is the selected Plates and Ledger repositories, Pull requests read-only plus automatic metadata. Safe credential wiring remains unimplemented at this observation: CI's checkout is modified by its gate, and night's shared environment reaches configured commands. A synthetic four-check diagnostic confirms those boundaries; it is not a completed fix or live credential validation.

Native isolated updates opened [Ledger 170](https://github.com/dalmaer/ledger/pull/170), [Duo 132](https://github.com/dalmaer/duo/pull/132), [Cajones 101](https://github.com/dalmaer/cajones/pull/101), [Isocan 526](https://github.com/dglazkov/isocan/pull/526) and [DTV 8](https://github.com/dalmaer/dtv/pull/8). Each native configured gate passed. Ledger's build had committed a project-owned Next.js tsconfig side effect; a follow-up restored its exact default-branch bytes after `npm run check:all` passed on the scoped candidate. All five local test-ledger observations reported no flaky/slower tests. The final Ledger revision's CI remains a separate check. Duo, Cajones, Isocan and DTV CI passed at their prepared revisions; read-only patch review found no actionable findings in the three inspected Duo/Cajones/Isocan diffs.

Fresh local discovery also found Papa Tapes on 0.8.32. It is now registered in the managed inventory, after the original rollout order. Its supported migration required explicit project-owned G2 wording and reporter-path edits, preserving historical evidence and media. [Papa Tapes PR 2](https://github.com/dalmaer/papa-tapes/pull/2) at `deaf9c62634902e6641c5fc851bb97b56c8bc275` passed `npm run check` (53 Node tests, 160 Python tests, content/roadmap/design/site checks), with no flaky/slower Node tests, and GitHub CI. Managed hashes match the released renderer. No consumer update is installed or accepted by these observations.

The owner approved pause/drain/install/restore barriers for 17 exact original-fleet workflows, then the two additional Papa Tapes workflows, after Plates verification and each project's checks/review. No barrier has executed. Isocan merge remains with the owner or Dimitri; there are no cancellations or extra model allowances.

Cleanup is confirmed for 231 exact obsolete remote refs across seven canonical repositories: 14 ancestry-safe merged refs, 174 archived historical refs, 16 archived superseded refs and 27 archived Papa Tapes refs. Historical branches not reachable on main have private self-contained bundles, independently restored and checked, with original commit/tree/blob identities preserved. Deletions used exact SHA leases and absence readback. Two merged, unused local Keel branches were also deleted. Twenty current-day/durable legacy refs remain protected. Canonical local remote-tracking refs were pruned without altering working files. The primary Plates checkout merged current main while preserving three unpublished local commits on a backup branch; dirty local Isocan work and other sessions' worktrees were not overwritten.

The private receipts and archive manifests live under `.plates/name-transition/resume-20261025/`; they are not public exports. Local machine migration still refuses the existing home-directory mode; hosted activation remains unverified. These gaps and the required real night/morning walkthrough prevent calling phase 129 complete or retiring still-needed readers.


### Observer identity for the access correction

The accepted manual-observation design requires an exact reviewed source SHA, not an npm version as proof of source identity. The access correction changes Plates' generated night workflow and runtime source, so its verification must use that exact reviewed source after merge. Consumers prepared on released 0.8.34 retain the 0.8.34 observer and verifier; each night/morning pair uses one identical pin. The correction's source is not relabeled as a published release, and it does not silently upgrade consumer producers. Phase 129's wording now matches the existing spec's source-identity contract. No live dispatch or result is asserted here.


### Implemented isolated reconciliation boundary

The new optional `reconciliation.githubAccess` path confines the fixed `PLATES_RECONCILE_TOKEN` to a clean default-branch producer job and its fixed GitHub GET-pull adapter. The configured exact repository allowlist controls use; project setup, gates and agents receive no dedicated credential. CI keeps PR/local checks on the ordinary repository token. Night consumes the existing engine's immutable result through the existing Actions artifact service, validating repository, source/runtime hashes, run/attempt, artifact identity/digest and complete config/record inventory. Missing or changed evidence stays unknown; cancellation does not start the dependent night. Unconfigured consumers retain their existing workflow behavior.

The conductor independently ran `node --import ./tests/helpers/hermetic.mjs --test tests/reconciliation-actions.test.mjs` under Node 24.22.1: 30 tests passed, zero failed/skipped. `npm run typecheck` exited 0. The builder's focused/convention preflight passed 192 tests plus render, inbox, roadmap and whitespace checks. Five isolated mutations each failed the intended assertions: identity, source binding, digest, credential routing and error sanitization. These are synthetic source proofs, not a successful live credential read or rollout. Generic sanitized API errors remain unknown; richer HTTP categories are deferred. The final integrated full gate, review and actual Actions proof are separate outstanding checks at this observation.


### First integrated access-correction gate

The first integrated `npm run check` returned status 1 (durable test-ledger observation `2026-10-25T23-33-48-283Z-36283-21d090f7-a7f0-4239-947b-1192e124d67d.json`): 3,532 tests, 3,522 passed, six failed and four skipped. Nine seeded stall checks passed; the hygiene summary reported no classified flaky/slower tests. Five failures exposed workflow/template parity, portable-template wording and hosted retry source-closure assumptions after opt-in shaping. The sixth was fixture cleanup `ENOTEMPTY` at `origin.git/info` in the fleet setup test; its cause is not established by this observation. The original failed log is retained privately as `/tmp/plates129-reconcile-full-gate.log`. This result is not overwritten by subsequent checks.


### Fixture cleanup correction

The fleet fixture used a separate one-shot cleanup helper and missed the ENOTEMPTY-only bounded cleanup policy already established in PR #263. Fleet now reuses that helper while preserving canonical paths. The targeted original setup test and a cleanup integration regression passed (two tests); three existing helper policy tests passed. A disposable before-fix copy failed the new regression with ENOTEMPTY. This proves the cleanup handling, not the identity or timing of the original late writer. Its failed gate and residual fixture remain preserved. No production retry policy or timeout was changed.


### Configured-workflow regression corrections

The workflow fixtures now exercise configured and unconfigured renders while retaining exact installed-source parity and real shell assertions. Template wording remains portable. Hosted retry keeps its existing reviewed 0.8.34 closure: two changed historical files are retained with release provenance, all 32 original hashes are checked, and repinning the new secret-dependent workflow/runtime is explicitly refused. This does not grant hosted retry access to the new credential. Eleven targeted regression checks and 138 convention/hosted-retry checks passed, with roadmap, render, inbox and whitespace checks. A temporary fixture ReferenceError discovered by focused testing was corrected before this validation; its failed preflight log is preserved. The next integrated gate covers these corrections together with the test-only fleet cleanup reuse.


### Hosted gate failure retained

PR #271 at `f4a3a7273505a07eb7c8ff694a46c7cd3ff862b5` received a Claude cross-review with no findings (review 5646025569), and impact/typecheck passed. CI run 40246609739 failed only `four 109-phase projects converge under the shared 200-request bound`; all nine stall checks passed. Its failed log is retained privately as `/tmp/plates129-pr271-ci-failed.log`. No unchanged rerun was requested.

A diagnostic reproduced this assertion when the test's synthetic minute advances crossed UTC midnight: reclassifying a previously complete project used 114 requests, leaving 86 for the next project and no progress for the rest. Quota remained available and no abort was observed. A noon-start diagnostic advanced completion 1→2→3→4 with the same request and timeout bounds. This establishes a test-clock defect but does not conclusively attribute the original CI failure, which omitted clock/gap diagnostics. The repair pins the request-budget scenario's date; the separate midnight-reclassification behavior remains tested.


The test-only repair covers both same-day cache reuse and request-budget convergence, retaining the separate explicit midnight behavior. A near-midnight seeded before-fix copy failed both same-day assertions; the repaired scenarios passed, and the entire seeded file passed 17 tests. The focused/convention check passed 127 tests plus roadmap, render, inbox and whitespace guards. No production timeout, request ceiling, runtime code or acceptance threshold changed. The parent gate and exact-head re-review remain separate checks.


### Partial-rerun reconciliation recovery

Claude review 5646129221 on `0b771733` identified that GitHub's failed-jobs-only rerun can carry a successful producer's earlier outputs into the current night attempt. The prior current-attempt-only binding correctly refused that evidence but made this recovery unavailable. The correction explicitly carries the producing attempt, validates both attempts through exact-attempt GitHub reads, binds the restored wrapper to the consumer, and retains producer/consumer identities and original observation time in the result. Same run/repository/source/workflow, artifact ID/digests, inventory and freshness remain mandatory; future, foreign, stale and altered evidence is refused. No credential reaches the night job.

The real-ZIP regression failed against the previous restore helper and passed with the correction. Thirty-one focused tests and 193 focused/convention checks passed, with roadmap/render/inbox/whitespace guards. The actual GitHub attempt API was read to confirm its identity fields. This synthetic recovery proof does not claim a live partial rerun or token read. Commit `0b771733` subsequently passed hosted CI; the new correction still requires its own gate and exact-head review.
