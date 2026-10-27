# Evidence: 132 — explicit project risk tolerance

- Date: 2026-10-27.
- Phase: 132.
- Revision: validated integration `663de66692ff0b67f624972681ef80455491446a`, then merge of published `900b488342a3c7b6ba928456001462c1d8899f79` and the Low/Medium/High working-tree extension.
- Claim: the project preference is selectable, scoped and visible; it does not grant host permission.

## Automated checks

On the level extension, `npm run check:focused -- tests/autonomy.test.mjs tests/web-autonomy.test.mjs tests/web-projects.test.mjs tests/gate-diagnostics.test.mjs tests/web-night-retry.test.mjs tests/decision-context.test.mjs` exited 0: 217 tests passed, zero failed, followed by roadmap/render/inbox/whitespace checks. `npm run typecheck` exited 0. The capability audit passed with 169 reviewed sources, 49 entries and 23 installed entrypoints.

The preceding integrated head `663de666` passed `npm run check`: 3,732 tests passed, zero failed, four opt-in real-Docker trials skipped, plus the roadmap/render/inbox guards. That is historical evidence, not a full-gate claim for the later level extension. The final candidate still requires its own `npm run check` before publication; local heavy validation is coordinated with the Ledger publication task. Record the final exact head and result in commit/PR validation evidence.

Independent review found and resolved malformed optional redaction settings losing a gate outcome. `plates prove tests/gate-diagnostics.test.mjs --name 'malformed redaction config' --fix practices/night/files/scripts/plates/test-ledger.mjs --fix scripts/plates/test-ledger.mjs --base 021cc845 --trailer` returned VERIFIED. Historical retry fixture repair also returned VERIFIED; production authority pins remain unchanged and current ledger repinning is explicitly refused.

## Observed selection and interface

The owner explicitly requested High for Plates. The repository was verified as `dalmaer/plates`, default branch `main`. Read-only GitHub branch/rules inspection observed main at `900b488342a3c7b6ba928456001462c1d8899f79`, protection disabled and no effective rules returned on this date. These observations are not reusable permission evidence for a future action; protections and rules must be checked again.

The actual selection used `node bin/plates.mjs autonomy --level high --push-prefix codex/ --push-prefix claude/ --push-prefix work/ --merge main --json`, followed by the same arguments and the returned `--yes --digest`. Readback confirmed `.plates/autonomy.json` contains only the Plates repository binding, legacy-compatible delivery mode, no exact push branches, those three namespaces, and exact merge base main. Policy digest: `ef9af11932b6ce11ba3cb73f0120900660daf3e8d2f63b07c608bac37af0dead`. Effective authority remains `requires-current-context`.

An approved localhost browser preview with synthetic Acme source records visibly showed High, the six action scopes, Low/Medium/High definitions, expandable CLI examples and unavailable host controls. It establishes appearance of the implemented renderer, not live hosted rollout or authenticated owner provenance.

## Gaps and decision

Built describes the bounded CLI, brief and source-view setting, not publication,
host approval control, provider enforcement or lived-in benefit. Required final
candidate validation and remote/installed readback precede publication completion.
No global policy, credentials, security settings, budgets, unrelated managed
projects or assistant rules were changed by selection. No reusable timing claim
is supported: retained busy observations are not comparable performance evidence.
At the initial risk-setting checkpoint, phases 119–121 remained designed and were untouched by this work.


## Reversible delivery clarification

The owner clarified High on 2026-10-27: shipping a reversible change with verification and rollback is preferable to trying to eliminate every possible regression. The guide and agent topic now define the required known-good revision, actual effect boundaries, available restoration procedure, health signals, stop criteria and explicit non-blocking uncertainty. No policy schema, host configuration or required check changed.

On clean publication code head `3f60c7736257bdcab5a731ebae7cb20beccb149f`, the required local `npm run check` exited 0: 3,728 passed, zero failed, four opt-in real-Docker trials skipped; roadmap/render/inbox guards passed. Typecheck and the 229-test focused/convention preflight passed. This later documentation increment receives scoped review and documentation checks; final exact-head hosted CI remains required before merge. Earlier results are not relabelled as proof of edited bytes.

For this authorized Plates publication, `900b488342a3c7b6ba928456001462c1d8899f79` is the inspected prior-main rollback candidate. Treat it as known-good only after its relevant check and health evidence is retained; merely naming that prior SHA is not a health claim. The source rollback procedure is a new bounded task branch, a reviewed revert through mandatory gates and normal merge, then source and setting readback. No force push, data migration or credential change is part of this change. Relevant signals are required CI, CLI inspection/startup output, selected repository/destinations/digest, and the Home panel's honest unavailable-host state. Live hosted appearance and actual reduction in approval prompts remain observation gaps, not passes. If these signals fail, stop further rollout; revert only within established authority, escalating unreliable recovery or new effects.


## Shared model guidance extension

The owner authorized implementation across the applicable model entry points on
2026-10-27. One versioned renderer now supplies role-specific Low/Medium/High
instructions, source and policy/context digests, and bounded recovery guidance.
Interactive context remains a working-tree declaration; scheduled briefs read
fixed paths from exact source commits. Robot resume uses the workflow revision,
not the resumed candidate. The automated sandbox protects the selection file.

Early independent review found two integration defects before publication: a
static renderer import enlarged cross-review's isolated execution/publisher
closure, and robot resume initially read candidate HEAD. The renderer is now
loaded only during cross-review briefing, and robot guidance binds GITHUB_SHA.
Review also corrected ambiguous working-tree provenance labels and missing-runtime
behavior for projects that own their runtime practice. Regression coverage exercises
actual workflow prompt files/outputs and robot
prepare/resume source selection. Initial local-server tests hit sandbox EPERM;
the normal approved loopback route is required for their synthetic Git server.
Initial test fixture dependency and CLI realpath issues were fixed, with original
outputs retained. Final focused/full check outcomes belong to the exact final
candidate validation report; preceding test counts are not proof of these bytes.

No live model was called, API credits spent, host permissions expanded or
publication gates removed. Model behavior and actual reduction in confirmations
remain unmeasured. Read-only GitHub inspection still found no PR and its
collaborator-permission endpoint returned 403 Resource not accessible by
integration. This does not establish the underlying cause of the earlier PR
creation denial or justify retrying it via another identity or channel.


The first full gate for `f726aee5` found a reproducible legacy-consumer rehearsal
failure and was stopped after preserving its output; it is not a passing gate.
Adding managed helpers to the formerly seeded-only base practice made a legacy
consumer without a lock appear edited. The shared runtime now belongs to the
existing night practice, with file-only imports for model consumers. Base-only
consumers and drift refusal remain unchanged. A separate negative control proves
that a failed advisory mention-context job does not suppress the original task
or forward partial guidance; cancellation, credentials and original event gates
remain binding. The final corrected head requires a fresh full gate.


Both follow-up regressions were proven red without their fix and green with it
using `plates prove --base f726aee5 --trailer`: the mention advisory-failure test
restores the workflow template; the legacy rehearsal test restores the complete
Base/Night ownership and consumer manifest set. A first partial ownership rollback
reported a duplicate-owner failure, so it was not used as proof of the original
drift bug; the complete rollback reproduced the actual update refusal. Eight
renderer, prompt-delivery, role, provenance and runtime-ownership tests pass.
Typecheck passes. The final full gate and independent complete-head review remain
separate requirements; none of these observations claim live model behavior.


The complete gate at `74c24dbed8a59a4152d0fb7ed7f9833cb0ef6510` finished with
3,738 passing tests, one failure and four optional skips. The release dry-run
requested v0.8.36 from this branch’s v0.8.35 package, but that release tag had
arrived concurrently. The original refusal is retained; no release gate, tag or
version was bypassed. Integrating current main
`d4fd36d82b68321b7c5ae9fd7939fe6482a76a64` brings its published v0.8.36 metadata
and independently merged phase-119 work. The unchanged release regression then
passes. This feature does not implement or claim acceptance of that separate
phase. Capability records retain both sets of CLI forms and reviewed sources;
the combined audit covers 173 sources, 49 commands and 24 installed entrypoints.
Final integrated validation and complete-head review remain required.
