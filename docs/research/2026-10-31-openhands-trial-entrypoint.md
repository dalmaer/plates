# OpenHands bounded native trial entrypoint — 2026-10-31

The three local prerequisites from the previous report are implemented: a general native SDK runner, exact-action approval plus durable Plates operation/effect/outcome linkage, and fixed contained checks on captured code. No real account or model was used. API dispatch stops at explicit account/model/spend authorization and verified broker configuration. A Codex subscription does not authorize API spend or supply credentials to this path.

## Implemented launch boundary

`trial-controller.mjs` owns the existing experimental `Evaluation` SQLite journal, which uses the production funding validator. It records one original operation/conversation and a launch intent before dispatch; it never reruns an existing launch. The actual native SDK conversation uses that exact reserved conversation ID. Controller source and runtime executable digests are frozen in the private identity record. A private state directory and exclusive `.plates-openhands-owner` marker prevent two trials from claiming the same workspace. The model's file capability cannot read or overwrite the marker. Python's venv symlink is retained for execution, but its resolved executable must be a regular file outside worker/private roots.

`sdk-trial.py` runs the pinned OpenHands SDK 1.59.0 Agent/Conversation with only the registered file capability, no default tools, ACP, shell, plugins, MCP, condenser or fallback. Every read/list/write pauses under native `AlwaysConfirm`, then requests approval for the exact operation, tool-call identity and canonical action digest. The controller's `approve` command requires the local owner's terminal; an explicit fixture-only approval path exists solely in scripted mode. This is a local single-owner identity boundary, not multi-user OAuth or Discord authentication. Quoted text and model-supplied fields cannot supply authority.

Provider intents are durably reserved before dispatch. Both worker and controller enforce request/input/output/time bounds; the controller's hard process deadline covers blocked RPC and human approval waits. Native API input counts include messages and tool schemas and fail closed if unavailable. They remain estimates; the broker must enforce hard billing/input limits. Missing/invalid output usage stops before returning tool actions. Usage remains null when unknown. The OpenAI-compatible chat client disables retries, redirects and proxy inheritance; a once-per-intent transport guard prevents SDK retry paths from dispatching again. Any uncertain response stops the original attempt, without refund or fallback. Credentials stay only in the approved dispatch closure/client, outside conversation persistence and tool environments.

File effects run inside the existing default-deny macOS child sandbox. The controller journals intent, exact approval, child identity, confirmed exit, result and policy digest. A controller crash cannot cause `run` to dispatch that operation again. `recover` requires observed absence of the original coordinator, SDK worker and any recorded in-flight tool. Missing launch PIDs or ambiguous observations remain unknown. Confirmed recovery fences execution and creates a pending learning outcome without pretending uncertain provider/effect delivery succeeded.

## Captured scoring and fixed checks

After confirmed worker exit/fencing and no dispatching file action, `score` captures production files, immutable helpers and the explicitly named independent regression through a read-only sandbox. It writes only to a new child of the private trial root. The operation links worker launch, production digest, regression digest, scorer result and snapshot location.

`check` accepts only that controller-owned private snapshot, invokes the fixed check runner and compares source/regression digests. Candidate code is never imported into the trusted controller. The child snapshot is read-only, with a separate fresh scratch directory for synthetic fixtures. The child cannot fork, invoke shell/npm, use network or read private controller files. Its deadline is 60 seconds; output is bounded and scratch is removed after confirmed closure.

Supported checks are `tests/web-operations.test.mjs` for Task A and `tests/web-migration.test.mjs` for Task B, optionally plus one explicitly named added `tests/NAME.test.mjs`. The trusted baseline versions of existing tests/helpers are retained. The independent test must be captured from the worker, not copied through an unsandboxed worker-root read. The standalone check API assumes an already-private captured snapshot; the integrated command enforces that precondition.

These native test results are ordinary quality evidence, not an adversarial-proof oracle. The separate frozen v3 shared evaluator remains the comparison authority. Arbitrary commands, subprocess-dependent tests, `npm run check` and typecheck are not admitted inside the worker. Applicable full repository validation remains an independent reviewer/integrator gate, not a tool the model can customize.

## Replays and observed evidence

Use new output directories. Native sandbox launches require the same approved execution boundary recorded in the previous containment report; there is no unsandboxed fallback.

```sh
node experiments/openhands/offline-trial-demo.mjs \
  /absolute/new/offline-trial \
  /absolute/openhands-sdk-env/bin/python /absolute/upstream-sdk

node experiments/openhands/offline-crash-proof.mjs \
  /absolute/new/crash-proof \
  /absolute/openhands-sdk-env/bin/python /absolute/upstream-sdk

PLATES_OPENHANDS_TRIAL=1 \
PLATES_OPENHANDS_PYTHON=/absolute/openhands-sdk-env/bin/python \
PLATES_OPENHANDS_SDK=/absolute/upstream-sdk \
node --import ./tests/helpers/hermetic.mjs --test tests/openhands-trial.test.mjs
```

The integrated demonstration uses a fresh real Plates baseline. Scripted SDK responses read package metadata and add a clearly labeled harness probe; they do not fix or seed a real defect. The native conversation, approvals, two file actions, outcome, capture, checks and explicit no-useful-lesson status are linked. Fixed checks pass 20/20; unchanged Task A acceptance remains 4/6, as expected. The separate fixed check proof passes A19/19 and B15/15; its tiny synthetic regression fails before and passes after its fixture change.

The ordinary coordinator crash proof kills only its owned coordinator after one completed write, while the second action waits for approval. Recovery confirms process absence, preserves the one completed effect, refuses duplicate launch and records pending then no-useful-lesson learning status. No second action executes.

Four native controller regression tests cover successful linkage/no duplicate workspace or launch, request exhaustion, uncertain provider delivery, and pending exact approvals. Separate native worker fixtures cover input/output caps, request caps, uncertain delivery and refused approval. All are offline. A further HTTPX MockTransport fixture exercises the actual SDK/LiteLLM/OpenAI client with native token estimates, output cap, no redirects/proxy inheritance and exact approval/tool flow. Two mocked successful requests complete; a mocked 503 makes exactly one request then stops. An outer audit hook denies every socket. Raw API-mode frames in that proof count mocked requests, not real provider calls or charges.

## Minimal live configuration and exact stopped command

The approved configuration needs:

1. A new disposable canonical worker root, private controller root, pinned SDK path and existing isolated Python environment; exact frozen task prompt and optional regression filename.
2. Explicit local OS owner → Plates actor/project mapping; one named funding account and exact `openai/MODEL` identifier; one HTTPS OpenAI-compatible chat endpoint. Other provider protocols and subscription login reuse are unsupported by this narrow entrypoint.
3. A dedicated environment variable named `PLATES_TRIAL_*` containing the approved API/broker key, supplied only after authorization. No key belongs in JSON, Git, logs, prompts or conversation state. No existing personal credentials are inspected or exported.
4. A current production-shaped funding envelope `{binding, context, capacity}`, matching actor, account, model, project and connection. API mode never manufactures it. A `fundingProof` contains an Ed25519 public key and signature over canonical JSON of `{funding, account, model, project, brokerEnforcement}`. The public key must be independently verified and pinned as the approved broker's key; a signature checked against an arbitrary key in the same JSON proves only consistency. This is this experiment's provisioning contract, not a claim that an existing OpenHands/provider broker already implements it.
5. `brokerEnforcement.reference` and positive `currencyCap`, with actual account/scope/billing enforcement independently verified. These signed metadata fields do not prove that a live broker enforces a cap. Configure per-request input/output ceilings and total request ceiling at that broker too.
6. Explicit `maxRequests` (1–60), `maxInputTokens` (1,024–128,000), `maxOutputTokens` (1–8,192), `requestTimeoutSeconds` (1–120) and `maxSeconds`. API runs are capped at **240 seconds** to fit the production funding validator's five-minute evidence horizon. Fresh admission must leave enough time; stale funding stops execution. The earlier proposed twenty-minute arm is superseded. Renewal is not silently fabricated.

`mode` must be `api`; `script` and `scriptedApprovals` are forbidden. Unknown configuration fields are rejected. `funding` must be genuine authorized broker evidence, not a copy of the offline synthetic fixture. `fundingProof` does not create an external grant. The real broker, signer identity, account/key relationship, exact model compatibility and billing cap remain unverified configuration prerequisites. No live endpoint has been contacted.

After the user approves the **named account, exact model, endpoint, data scope and limits**, the finite commands are:

```sh
# Validate and reserve fresh local state. No model request occurs here.
node experiments/openhands/trial-controller.mjs init \
  /absolute/new/private-control /absolute/approved-trial-config.json

# Local owner terminal: use the exact configSHA256 returned by init.
node experiments/openhands/trial-controller.mjs authorize-model \
  /absolute/new/private-control EXACT_CONFIG_SHA256

# Only after explicit API/spend approval and approved key provisioning:
node experiments/openhands/trial-controller.mjs run /absolute/new/private-control

# A second local owner terminal reviews each pending action and its full bytes:
node experiments/openhands/trial-controller.mjs status /absolute/new/private-control
node experiments/openhands/trial-controller.mjs approve \
  /absolute/new/private-control EXACT_PENDING_ACTION_KEY

# After confirmed termination; new private child outputs only:
node experiments/openhands/trial-controller.mjs score \
  /absolute/new/private-control /absolute/new/private-control/captured
node experiments/openhands/trial-controller.mjs check \
  /absolute/new/private-control /absolute/new/private-control/checks
```

For interruption, use `status` then `recover`; never rerun the original launch. Task B control/treatment each require a fresh original baseline and separate admitted operation. Transfer only the reviewed exact lesson, not Task A's patch. Existing production propose/decide and reviewed eligibility contracts remain the learning seam demonstrated in the earlier full loop.

## Validation-supervisor reconciliation and limits

Supported `validation-budget status` and `plan` were run. They retain lease `d1bfd29e-d920-4063-b9e4-ddae837a6d56`, with capacity used 1/1 and no busy coordination lock. The library exposes settlement only for externally controlled container leases; it exposes no recovery/settlement operation for this stranded foreground lease. The original repository gate has a completed exit-0 receipt, but its outer supervisor has no terminal receipt. Recorded wrapper PID 41883 and child/group 41890 were previously observed absent. That does not synthesize the missing supervisor settlement. The state was not edited or deleted, and no replacement state directory was used to evade capacity.

Consequently, the new code has native/focused/type/syntax evidence but no new full-gate receipt. The old full gate is not represented as validation of these new files. This is an explicit remaining validation bookkeeping boundary, not a request to weaken a safety deadline. Review closed child cleanup ownership, exclusive workspace ownership, Python executable placement, regression capture linkage, exact funding config binding, missing output usage and credential persistence issues. The denied separate adversarial batch and denied file preview remain unexecuted/unretried.

All current local demonstrations use scripted responses or in-process mock HTTP. They establish execution contracts, not real model patch quality, learning effectiveness, provider authentication or spending permission.


[Compact validation and source digests](openhands-trial/validation.json), [integrated receipt](openhands-trial/integrated-demo.json), [crash receipt](openhands-trial/coordinator-crash.json), and [fixed-check evidence](openhands-trial/fixed-checks.json) retain the observations. The new controller, SDK runner and fixed check pair add 623 lines of experimental glue, plus fixtures and modifications to existing capture/containment. SDK upgrades, OS policy changes and real broker provisioning require renewed qualification. No production scheduler or second learning store was added.
