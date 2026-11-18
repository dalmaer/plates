---
attempt: {"accepted":true,"verified":true,"rework":1,"lessonStatus":{"status":"known","lesson":"Plates lessons 17, 26 and 29: preserve source coverage and verify the actual outcome"}}
---

# Evidence: phase 196 — the project backlog (increment 2)

- Date: 2026-11-17
- Phase: 196
- Revision: base `d6fe077c46cb26b61f8aef04896a70ff4bd11522`, working tree for `web: show project backlog and assignment previews`.
- Claim: the project page and CLI share one ordered backlog, four actionable states, rendered item details, the existing decision cards and inline Assign previews. Matching main and production draw no release row. This is an increment, not acceptance of the whole phase.

Built by a builder subagent, resumed after a server interruption with its edits retained, and reviewed by the conductor. The phase claim was revalidated in the original checkout before each handoff; no parallel writers or duplicate attachment were started. Decision context was `not-configured`, digest `7c9959f511b549b548b09385842b625dd39ebd987e5c0c4355fe601394d3008d`, not verified architecture coverage.

## First safe merge and recovery

Changes are limited to the project projection and its quota advice, Home readers/renderers/assets, source capability fingerprints, focused tests and explanatory records. Existing attach, decision and promote writers remain authoritative. No new write route, storage, migration, remote quota transport or provider execution is enabled. The existing legacy views remain in source for compatibility.

Known deployed base: `3d805c7f9b5c3b9847ec43778c144494487a48dd` (the prior phase record attributes its deployment; this run did not re-prove that deployment). Revert this increment to restore the prior project presentation. Watch item ordering, source-gap visibility, decision answers, Assign preview/copy and Home refresh. Advice neither reserves capacity nor authorizes execution.

## Automated checks

The builder used `node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout` with these file sets:

- `tests/web-simple-project.test.mjs tests/home-isomorphism.test.mjs tests/web-simple-home.test.mjs tests/web-home.test.mjs tests/web-plate-workspace.test.mjs`: exit 0, 64 tests.
- `tests/web-backlog.test.mjs tests/web-home-performance.test.mjs tests/home-performance.test.mjs tests/web-home-loading.test.mjs`: exit 0, 25 tests.
- `tests/web-simple-project.test.mjs tests/web-design.test.mjs tests/work-items.test.mjs`: exit 0, 46 tests.
- After conductor preflight corrections, `tests/web-operation-coverage.test.mjs tests/web-activation-plan.test.mjs tests/web-design.test.mjs`: exit 0, 43 tests.
- Those reporter runs reported no flaky or slower tests. Earlier failures were retained: obsolete presentation/key assertions, a release fixture missing required timestamps, the stylesheet budget, reviewed source fingerprints and the phase-194 owing-list expectation. The phase-194 change came from the pre-existing owner commit, not a newly accepted walk.
- The conductor's first `npm run check:focused` with the twelve affected Home/project test files: exit 1, 273/278 passed. Failures were the two source fingerprints and the phase-194 expectation (including dependent/suite failures); they were corrected before another checkpoint. The stock focused runner does not attach the ledger reporter, so that run establishes no hygiene history.
- A second conductor preflight after adding the phase record: exit 1, 270/278 passed. All behavioral files passed; the record newly identified hosted gaps, and the activation-plan guard correctly required a phase-196 step. Added the explicit owner-walk step and updated its expected inventory. The subsequent isolated run exposed the stale generated guide (8/10 passed including the parent-suite failure); `PLATES_WRITE_ACTIVATION_GUIDE=1` with the ledger-enabled runner on `tests/web-activation-plan.test.mjs` regenerated it, exit 0. No hosted action was executed.
- Final conductor preflight: `npm run check:focused -- tests/web-activation-plan.test.mjs tests/web-simple-project.test.mjs tests/web-design.test.mjs`, exit 0. Mandatory helper, documentation, CLI, adoption, skill and capability conventions passed, followed by roadmap, render, inbox and whitespace guards. Earlier broader runs independently passed all twelve affected behavioral files; only the described source-record corrections changed afterward.
- `plates doctor --json`: exit 1, no lint findings. It reports pre-existing managed drift in the cross-review workflow and audit helper; neither path changed in this increment. No blanket clean-doctor claim is made.
- The mandatory combined-tree gate is `npm run check`, run by `plates integrate`; it covers the full suite, installed tests, roadmap, render and inbox. `npm run typecheck` is required through `plates ready` before publication. Neither command's future result is claimed here.

## Observed surfaces

| Check | Observed | Boundary |
| --- | --- | --- |
| `node bin/plates.mjs home --project plates --json` on the owner's machine | Exit 0; 51 actionable items. Current quota recommended Codex with 51% of its weekly allowance remaining. Partial source coverage remained explicit. | Real CLI source read; not a hosted quota read or an assignment. |
| `npm run look -- --json` | Exit 0; 52 Acme fixture captures. Conductor inspected project light/laptop and dark/phone: decision cards, four states and visible Assign rows, with no redundant release row. | Real browser rendering of synthetic data, not the owner walk. A button-padding specificity correction followed inspection. A project-only rerun of the same capture pipeline produced four images, and conductor inspection confirmed the corrected padding; its process exited 1 during temporary Chrome-profile cleanup (`ENOTEMPTY`), so it is not recorded as a successful capture command. The original 52-image command succeeded. |
| Reader isomorphism test | Both readers load the same Acme source files and quota observation; item state, outcome, next action, commands and recommendation match. | Does not make unavailable hosted quota available. |
| Hosted site and owner decision/deploy/assign walk | Not run. | No deployment, hosted activation or owner acceptance claimed. |

## Gaps and decision

- Acceptance 3 and shared-model acceptance have automated proof. The quota ranking is implemented and tested, with a real CLI observation, but its acceptance remains open for hosted snapshot delivery (phase 192 increment 4).
- Hosted Assign remains the existing preview-command fallback until phase 181 activates apply. Unread assignments, missing agents or disabled routes retain an explanation and no executable preview.
- Waiting work is preserved behind its prerequisite or collapsed source details; it is not called Ready or Needs you merely to fit the four-state view.
- Chat presentation, global empty-section/copy cleanup and navigation removal are later increments. The phase remains partial.
- The next owner step is the five-minute project-page walk after an approved deployment: read an item, open Assign, inspect the existing command preview, answer a decision where available, and say whether the view is simpler. Do not mark the complete site assignment flow accepted while hosted apply is unavailable.

## Landing observation, 2026-11-17

The implementation commit is `505653f5a3cfbfa15b1c1de33c57c7ac96dea889`. `plates ready --check "npm run typecheck" --json` exited 0 with typecheck status 0. `plates integrate --json` exited 0, ran `npm run check` once on the combined candidate and pushed `ff82b6f71b94d449a8077287479a9b6c8b9e3264` to main. Its durable integration record is `25b7fb9d052f6b365c9cea5d02a55916d8dfdb53` on `plates-integrations`.

The local gate reported 5,164 source tests: 5,152 passed, 12 skipped, zero failed; the installed-package suite passed all 45 tests. Roadmap, render and inbox checks passed. The ledger reported no flaky or slower test, while omitting the busy runs from timing comparisons; this is not quiet-host performance evidence. Existing blocked ready branches were reported unchanged and were not integrated with this increment.

The existing owner grant (`delivery.grant.agentPromote: true`, since 2026-11-04) authorizes guarded promotion to the configured Plates target. The earlier deployment-approval wording does not require a new grant for that same operation and destination. Hosted quota delivery, hosted attachment and owner acceptance remain separate.

CI run [44197236832](https://github.com/dalmaer/plates/actions/runs/44197236832) passed on the exact main revision; source results were 5,148 passed, 16 skipped, zero failed, and installed results were 23 passed, 10 skipped. This is separate remote evidence from the local full gate. Typecheck run [44197236852](https://github.com/dalmaer/plates/actions/runs/44197236852) passed. Publisher run [44199578172](https://github.com/dalmaer/plates/actions/runs/44199578172) advanced the tested ref to that revision.

The exact-commit promotion preview exited 3 as expected: tested ref and passing gate were verified, no migration files were added, and the serving prior revision was retained as the rollback target. No deployment result is inferred from that preview.

## Deployment observation, 2026-11-17

`plates promote ff82b6f71b94d449a8077287479a9b6c8b9e3264 --yes --json` exited 0 under the existing owner grant. Production at [Plates](https://plates.dionisaledge.com) reports exactly that revision. All three configured smoke paths matched their expected 401 status; no error was logged during the 120-second watch beginning at 23:29:16.025 UTC, across 12 reads. No rollback was needed. The durable deployment record is `2bb1b64819f843aecebd19b6f284922763d0d9eb` on `plates-verify`.

This supersedes the earlier not-run deployment observation without changing the historical checks. The authenticated project-page experience and decision/Assign interaction still need the owner's five-minute walk. The owner was asked to open an item and Assign, try a decision where available, and choose simpler or adjust first. That feedback is pending; the later channel and navigation increments wait on it. Hosted quota and attachment activation remain unavailable, and the phase stays partial.

The retrospective reviewed navigation, automatable checks, missing standards, guide health, tool economy, no-op instructions and information gaps. No new rule or lesson was applied. Private run logs and handoff records remain outside the checkout.
