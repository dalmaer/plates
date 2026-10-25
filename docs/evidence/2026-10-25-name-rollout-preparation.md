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
