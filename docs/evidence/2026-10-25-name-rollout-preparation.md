# Name rollout preparation — 2026-10-25

Source: dalmaer/plates419756f50f19e5a803dc9ea6d30c24e030c55591, merging PR264 reviewed head42216ce83e7fd571dc0a9b098ef05bdd49368c84. Phase128 claim released; phase129 claimed before release preparation. Primary checkout and fleet installations remain unchanged.

## Source verification

`PATH=/opt/homebrew/bin:$PATH TZ=UTC npm run check` on the final phase128 tree exited0:3463tests,3459passed,4skipped,0failed,488.065seconds. Nine seeded stall checks passed(seed1207027761); roadmap/render/inbox passed; `npm run typecheck` exited0. Ledger hygiene reported no flaky/slower test over23observations,5busy omitted. CI [40167503771](https://github.com/dalmaer/plates/actions/runs/40167503771) passed9m14s; typecheck/impact passed. Exact-head Claude review [5641789803](https://github.com/dalmaer/plates/pull/264#pullrequestreview-5641789803) disclosed partial coverage and oneP3 describing deliberately unresolved lost-create-ID behavior. Answered through `plates review --close --not-valid`, citing the approved contract and regression. Supplemental verifier re-review was unavailable because of a cybersecurity filter, not counted as passing coverage.

## Release guard

`node bin/plates.mjs release 0.8.34 --notes /tmp/plates-name-transition-release-notes.md --json` exited1 before writes. Of22 practice commits sincev0.8.33,20 pass the review guard. Two failures belong to [PR220](https://github.com/dalmaer/plates/pull/220):44dacb4 had a Codex review; final head04dca79 merged then-main and resolved generated-record conflicts without an exact-head review. Its final CI passed. The supported owner exception remains unapproved. No tag or release commit was created.

## Candidate fleet rehearsal

`node bin/plates.mjs fleet update --rehearse --json` from419756f, next candidate0.8.34, exited1 after639.379seconds. This runs temporary clones only; no push, project PR, workflow dispatch, live update or acceptance.

| Project | Candidate check | Baseline | Observation |
| --- | --- | --- | --- |
| dalmaer/duo | npm run check:passed | Not separately required | Candidate gate passed |
| dalmaer/cajones | npm run check:all:passed | Not separately required | Candidate gate passed |
| dalmaer/ledger | npm run check:all:exit1 | Same check on unchanged main:exit0 | ENOTEMPTY removing temporary pg-git-Sm82Nw; release blocked; causality/flake unproven |
| dglazkov/isocan | Test/typecheck/Loop chain:exit1 | Same chain:exit1 | Talk token test cleanup reads root.unmount on undefined; passing coverage absent |

Plates itself is excluded from the consumer rehearsal. Dtv remains outside the managed inventory pending the owner's scope decision. No failed candidate was blindly retried. Existing collector retains only output tails, not complete project failure logs; do not infer the first failure from Isocan's cleanup tail. Private JSON/stdout/stderr are retained under `.plates/name-transition/release-0.8.34-rehearsal-20261025/`.

## Real preview and inventory

`node bin/plates.mjs names --repo dalmaer/plates --json` at419756f exited1, read-only. It names three label actions but refuses because managed workflows use `secrets[steps.config.outputs.setup_token]`, classified as unsupported dynamic provider scope. No secret values were read, and no action was applied. This is source work before rollout, not permission to suppress the gap or broaden dynamic expression support.

The refreshed pinned-main inventory lists742unmanaged/mixed matching files:Plates608,Ledger42,Duo24,Cajones23,canonical dglazkov/isocan45,Dtv0. Coverage excludes121binary files,30sensitive paths before content reads, and2submodules. Previous snapshots remain intact. Full filenames/lines/lock ownership are in `.plates/name-transition/plates-pre-rollout-inventory-release-20261025T061041Z.{md,json}`. Matches are not replacement authority; historical records and compatibility stay preserved.
