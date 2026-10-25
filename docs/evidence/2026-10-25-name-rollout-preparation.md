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
