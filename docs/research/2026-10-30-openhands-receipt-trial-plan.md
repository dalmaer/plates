# OpenHands shared receipt trial plan — 2026-10-30

> Implementation update: see [the completed local entrypoint and exact launch contract](2026-10-31-openhands-trial-entrypoint.md). Its 240-second API ceiling supersedes this plan’s earlier proposed twenty-minute arm. No API spend is authorized.

The parent selected the same real Plates tasks and evaluator as Gas City. Preparation is complete; no model has run and no target fix was supplied. Both backends start at consolidation `037e13b4f78c061405cef899b528badb536584ad`. The earlier RRULE candidate remains an alternative, with its script and original manifest preserved.

## Selected work

Task A asks the agent to reproduce and close disclosure of a private project-operation receipt when workspace membership is lost during its read. It covers API and HTML, preserves authorized recovery of the original operation, and forbids repeated source writes. Existing affected tests: `tests/web-operations.test.mjs`.

Task B, withheld from Task A, asks the agent to close the analogous private lesson-copy receipt disclosure when source-project access is lost during a read while workspace membership remains. It covers API and HTML, preserves original-operation recovery and forbids another copy or source write on GET. Existing affected tests: `tests/web-migration.test.mjs`.

The exact worker text and helper policy come from the final shared [v3 specification](openhands-containment/shared-selected-spec.json). All 59 existing helper modules remain byte-identical to the baseline; no helper additions, removals or aliases are allowed. The agent may change production code for the requested defect and add independent regression tests. This plan, the combined specification, evaluator and Task B material stay outside Task A's allowed filesystem view.

## Execution sequence, pending authorization

1. Reconcile project ownership and accepted decisions, retain their source digests, and freeze the selected backend, exact model, account owner, permitted authentication path and invocation/usage budget. Use the qualified native SDK/file-tool path described in the [containment report](2026-10-30-openhands-containment.md); finish its three finite launch integration steps before model dispatch.
2. Launch the actual pinned OpenHands backend for Task A in the clean primary worktree with its exact public prompt. The agent authors the change and regression. Preserve its original operation, output, changed files and actual usage. Do not replace an uncertain launch with an untracked second invocation.
3. Require the agent's regression to fail on the frozen baseline and pass with its patch. Run the affected checks, independent review and the repository's applicable final gates. Evaluate the patch through `contained-score.mjs`; do not import candidate code into the controller or use the baseline-only preparation probe for patched acceptance.
4. Capture the worker's actual lesson candidate and evidence. Independently review its exact content, scope and digest. Record captured-pending, reviewed, rejected or no-useful-lesson honestly; do not invent a lesson to complete the experiment.
5. If the approved budget includes the held-out comparison, run Task B control and treatment on separate original-baseline worktrees. Use identical Task B prompt, model, runtime limits and evaluator; supply only the exact reviewed lesson to treatment. Transfer no Task A patch. Record whether the lesson was actually retrieved.
6. Review and score both Task B results under the same rules. Report failures, disclosures, write counts, changed paths, retries/interventions, elapsed time and measured token/cost data; retain unknown usage as unknown. An unhelpful lesson is a valid outcome. This small pair does not establish general learning effectiveness.

Account access, model use, paid requests, delegated agents and external side effects remain unapproved. No new login, credential copying, provider fallback, GitHub write, publication, deployment, routines or global configuration change is part of preparation. A wall-clock bound is not a hard currency cap. The parent must specify exactly which calls are authorized before launch.

## Prepared state and evidence

`../openhands-real-trial-prepared` contains three clean original-baseline worktrees: `primary`, `followup-control`, and `followup-lesson`. Its selected-task manifest and requests were updated without editing those trees. `history-rrule/` preserves the previous manifest and three request files. [prepare-rrule-trial.mjs](../../experiments/openhands/prepare-rrule-trial.mjs) preserves the earlier script.

The historical v1 [receipt preparation script](../../experiments/openhands/prepare-real-trial.mjs) pins its original specification/evaluator hashes and refuses changed or extra baseline files before its direct baseline probe. It checks all arms before and after evaluation. This historical script can create baseline inputs or migrate the earlier RRULE preparation; it does not adopt final v3 qualification. The current prepared-root manifest is v3, with the earlier v1 manifest preserved as `history-receipt-v1-manifest.json`. Use the frozen shared launcher below for comparison qualification. Its worktrees share a Git object store; that is not worker read isolation or a malicious-code sandbox.

```sh
# Historical v1 baseline preparation only; this cannot start a model.
node experiments/openhands/prepare-real-trial.mjs --output /absolute/new/trial-root

# Already performed once to migrate the existing untouched RRULE preparation.
node experiments/openhands/prepare-real-trial.mjs \
  --output ../openhands-real-trial-prepared --reuse-existing

# Candidate acceptance must use the contained scorer, after its report is verified.
node experiments/openhands/contained-score.mjs CANDIDATE task-a NEW_OUTPUT
```

The frozen evaluator has 13 distinct cases: 6 for A and 7 for B. Baseline A passes 4/6; each B arm passes 4/7. All three acceptance probes exit 1, all 59 helper-integrity checks pass, and GETs add no fixture writes. The three arms exercise 20 case executions, with Task B intentionally repeated. [Evidence manifest](../../experiments/openhands/real-receipt-baseline-manifest.json) retains the original reproduction reports and hashes; the prepared-root manifest retains the migration's fresh probe reports. Existing green tests do not make these failed acceptance cases pass.

Final shared handoff SHA-256: `a7535adfd023ec5992a30523c3a56fcdcd8dd7729d3abb9dceedf5e0bc450af8`.
Final evaluator v3 SHA-256: `f1d9281846f47e42eb6bb5f7e7528d7e2d027ad80ab6ad4666f57b56d9305004`.
Final specification SHA-256: `b93816edfc823e3ada462c68c6f99da2c65d5f00a25eb0ff92abfa5d912b6f4f`.
The exact evaluator covers membership/project-access loss and unknown-operation HTML fallback; separate session-revocation coverage is not present. Fixtures are synthetic; no live incident or provider integration is claimed.

The [containment report](2026-10-30-openhands-containment.md) records actual native proof, limitations and the finite launch prerequisites. The independent OpenHands scorer is additional evidence; the final v3 shared scorer is authoritative for the comparison. No running worker may exist during scoring: stop and confirm, snapshot, bind the digest, then evaluate. All evaluator/controller files and held-out material remain outside every worker read root.

Exact shared replay already performed for primary (substitute followup-control/task-b and followup-lesson/task-b for the other arms; each output path must be new):

```sh
node /Users/dionalmaer/Documents/Codex/2026-10-30/task-3/plates-gas-city/experiments/gas-city/run-frozen-evaluator.mjs \
  /Users/dionalmaer/Documents/Codex/2026-10-30/task-3/real-trial-frozen-handoff.json \
  a7535adfd023ec5992a30523c3a56fcdcd8dd7729d3abb9dceedf5e0bc450af8 \
  /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/openhands-real-trial-prepared/primary \
  task-a /absolute/new/task-a-report.json
```

Only the native SDK API route is proposed. ACP launch stays disabled, and existing Codex/Claude login reuse is not proven for this route. Before funding, the parent needs a selected API account owner, supported exact model, approved credential/broker mechanism and limit. A concrete authorization question, once those names are selected, is:

> May we use **[named account and owner]**, through **[existing approved API/broker mechanism]**, with **[exact model]**, for Task A and the two fresh Task B arms, sending only their authorized repository context? Proposed ceilings: 20 requests and 20 minutes per arm, at most 64,000 input and 4,000 output tokens per request, 60 requests total, and **[provider/broker-enforced total currency cap]**. No account/model fallback, automatic retry after uncertain delivery, external writes or deployment. Each edit requires an exact-action review; stop and report unknown usage rather than treat it as zero.

This is a proposed bound to enforce before launch, not a claim that the generic trial entrypoint or hard spend control already exists. If no API/broker account is available, the OpenHands real-model trial remains unavailable; do not export a subscription token or silently use ACP instead. Safe local code work does not itself require account permission. No model or account invocation has happened, and this document grants no launch authority.
