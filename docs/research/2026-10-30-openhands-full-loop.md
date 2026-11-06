# OpenHands: native local lifecycle and the next real-repository trial

Date: 2026-10-30. Branch: `codex/openhands-evaluation`. Common baseline: `037e13b4f78c061405cef899b528badb536584ad`. This extends the [contract evaluation](2026-10-30-openhands-experiment.md) and [qualified follow-up](2026-10-30-openhands-followup.md).

The local loop now executes the real pinned OpenHands SDK Agent/Conversation, a deterministic replacement for `LLM.completion`, and one custom bounded file tool. Six native worker processes produce actual JSON files and evaluate actual predicates. A separate coordinator process is killed with SIGKILL after its successful outcome is committed and before lesson capture. The restarted coordinator captures that same outcome without launching another worker. A real Plates proposal is accepted into a synthetic Plates home, the exact reviewed lesson is applied in a second project, a counterexample exposes excessive sharing scope, and withdrawal plus policy rollback restores a passing result.

This is a working lifecycle demonstration, **not a model-backed coding evaluation**. Worker strategy, recovery choice and reviewer decisions are scripted. The measured difference proves the scripted policy changes the fixture result, not that an intelligent agent learned. Specifically, the coordinator retrieves the exact reviewed lesson JSON and selects its strategy for the bounded tool; the scripted LLM does not reason about that lesson. Authentication, account capacity and approvals are synthetic. No provider credentials, paid calls, external agents, GitHub/chat writes, deployment or live project changes were used.

## Replay and inspect

After installing the isolated dependencies described below:

```sh
node experiments/openhands/full-loop.mjs \
  --output /tmp/acme-openhands-new-run \
  --python /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/openhands-sdk-env/bin/python \
  --sdk /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/upstream-sdk
```

The output directory must not exist; replay never resets an existing run. The command finishes with no owned background process or listening service. Each run retains `state.sqlite`, `trace.json`, `index.html`, coordinator logs, individual inputs/outputs, SDK conversation persistence, exact worker receipts and logs, and a synthetic `home/docs/lessons.md` and proposal inbox. The HTML is a self-contained read-only trace with filtering; opening/filtering it cannot dispatch work.

Final native evidence lives at `/Users/dionalmaer/Documents/Codex/2026-10-30/task-4/openhands-full-loop-final`. A portable [saved viewer](openhands-full-loop/index.html), [trace](openhands-full-loop/trace.json), and [validation record](openhands-full-loop/validation.json) accompany this report. Full native receipts remain in that task-local run directory; the saved trace retains relevant native events without copying upstream system-prompt text.

Browser security policy rejected the attempted `file://` preview. No alternate browser surface or protocol workaround was attempted; therefore **no screenshot or visual browser verification is claimed**. HTML escaping/filter tests pass. The denied action was opening the local trace in the in-app browser; outcome: denied, not uncertain. A supported preview route needs separate resolution before screenshot capture.

For default repository regression tests, `--fixture-worker` explicitly substitutes a small Node worker double. Its output is marked `fixture-only`; it does not establish native SDK behavior.

## Observed sequence

| Step | Evidence and result |
| --- | --- |
| Human request and selection | Alice requests `acme-one`; Bob requests `acme-two`. Trusted coordinator policy selects one bounded SDK worker and each owner's original synthetic account. Duplicate request IDs return the original operation. |
| Conversation and risk | Accepted human text and the coordinator request are written to the native SDK as user messages, bound by `messagesSha256`. A separate coordinator inbox is durable. Conflicting other-user text asking to switch payer/approve all actions is retained as a conflict and never forwarded. |
| First project failure | Raw formatting fails the whitespace predicate. Failure is actual file content, not an asserted fake success. One recovery is allowed. |
| Bounded recovery | The fixed recovery policy selects normalization. The native worker passes; both original and recovery receipts remain linked to the same PR and account. |
| Real crash | Parent receives an IPC checkpoint only after SQLite FULL/WAL commits `finished` plus `learning:pending`; parent kills that coordinator PID with SIGKILL and observes the exit signal. |
| Restart | New coordinator reads the original operation, repeats the run request through the durable effect contract, and verifies no new worker launch or effect key. Pending capture becomes `captured`; the exact operation ID survives. |
| Project learning | Evidence identifies failed/successful operation IDs and receipt hashes. `lib/learn.mjs` formats/proposes a real local lesson in a synthetic Plates home. It has no issue number or external inbox, so no `gh` call occurs. |
| Reviewed promotion | Alice lacks review authority. An altered lesson digest and altered proposal bytes are denied. Bob's synthetic authenticated reviewer session accepts the exact proposal and lesson revision; real `learn.decide` appends one numbered catalogue row. |
| Second project control/application | Same input: raw control fails, exact promoted lesson digest/revision selects normalization and passes. Difference: 0/1 to 1/1 predicates. |
| Harm and withdrawal | A verbatim-whitespace acceptance contract is a counterexample: normalization fails. Bob withdraws eligibility from project two, retaining project one. The historical catalogue row remains as provenance. |
| Rollback | Project two retrieves no withdrawn lesson; restoring raw policy passes the same verbatim counterexample. This is a policy/output rollback, not a Git revert. |
| Final state | Six distinct worker launches/effects; all terminated; one captured lesson; five explicit `no-useful-lesson` outcomes; zero pending captures. Usage covers two project-one attempts and four project-two attempts, including failures and review/rollback. |

Every native execution observes `AlwaysConfirm` waiting while the output file is absent. Only a separate host fixture approval allows the pending bounded action. The worker exposes no model-supplied path, shell, account or strategy arguments. The SDK's second `run()` confirms its pending action; it does not interpret a user's freeform “yes” as authorization in this harness. Actual production approval must bind authenticated person, action identity, content, scope and revision. The static fixture token is not such a production credential.

Worker receipts report 2 scripted completion calls, 200 synthetic input tokens and 40 synthetic output tokens each: 1,440 synthetic tokens over six operations, **not tokenizer measurements or bills**. Provider calls are zero; billing verification remains false. Every native import records one rejected `socket.bind` attempt. Python audit hooks deny connects, binds, DNS and subprocesses before SDK import. This is an observed application-level guard for this pinned bounded worker, not a general OS sandbox or protection against arbitrary malicious native code.

## What owns the loop

OpenHands natively owns Agent/Conversation execution, event production, persisted conversation state, tool dispatch and the confirmation pause. Plates owns admission, human authority, account binding, bounded recovery decisions, effect deduplication, outcome/capture linkage, lesson review and scope, and the usage roll-up. There is exactly one coordinator; no Automation scheduler or background routine is enabled.

`full-loop.mjs` reuses the existing experimental `Evaluation` journal, which itself calls production `checkFundingBinding`. It does not create a second scheduling database. Real `lib/learn.mjs` proposal/acceptance is used in a synthetic repository to avoid modifying the production lesson catalogue. Worker receipt files are evidence, not a competing scheduler.

The exact production seam remains: production job/operation IDs and authenticated actor/provider bindings enter admission; broker-approved tool actions enter dispatch; trusted process receipts close effects; durable outcome/capture records drive lesson proposals; reviewed eligibility supplies `lessonContext`; production usage/effect ledgers supply cost and completion. The prototype's single JSON SQLite row, synthetic sessions and receipt counters are not drop-in production implementations.

Withdrawal is enforced by `Evaluation.lessonContext` eligibility/revision, **not by deleting or changing the historical Plates catalogue row**. The generated catalogue explicitly warns that an accepted row is not retrieval authority. Distributed catalogue consumers would need an equivalent scoped eligibility/withdrawal contract before integration. A crash between `learn.decide` filesystem writes and journal approval bookkeeping fails closed; automatic reconciliation of that separate boundary is not demonstrated.

## Common acceptance coverage after this loop

| Scenario | Status and limits |
| --- | --- |
| Lost launch acknowledgment/coordinator restart | Partial overall; prior mock lost-ack test plus native named outcome-before-capture SIGKILL passes. No launch-ack process crash proved here. |
| Worker death/stale callbacks | Partial; previous adapter and real lease probes pass. This loop injects an acceptance failure, not worker SIGKILL. |
| Duplicate issue/chat inputs | Local pass: original request returns same operation; six unique launches. External delivery/ack semantics remain untested. |
| Direct worker/coordinator messages/human conflict | Native user-message delivery plus durable separate coordinator inbox and conflict denial pass. Multiuser network authentication is synthetic. |
| Capacity expiry/revocation/no payer switching | Earlier deterministic adapter tests pass; this native loop proves original account continuity only, with a fixed synthetic clock/window. |
| One account across two project sets | Earlier adapter test passes; native loop uses two owners/accounts. Production account identity attestation remains unknown. |
| Completion-to-learning crash/status | Named real process crash passes; same outcome captures once, explicit pending/captured/no-useful-lesson, no duplicate execution. Other crash points remain unknown. |
| Scoped promotion/rollback | Exact lesson/proposal/revision review, application, counterexample, scoped withdrawal and restored-policy predicate pass. Distributed production withdrawal remains incomplete. |
| UI/chat reconnect | Read-only projection cursor replay has no events/effects; static HTML has no action endpoints. No live websocket or Discord reconnect tested. |
| Malicious content cannot forge authority | Conflicting human text and tampered proposal/digest denied; fixed tool has no authority arguments. This is not a general prompt-injection proof. |
| Whole-PR usage | All six attempts/reviews/failures covered by synthetic receipts. Real token/cost/billing reconciliation untested. |
| Pending stop/confirmed termination | Existing adapter tests pass. Native workers have observed exit receipts and launch fencing; this loop does not stop an active long-running worker. |

## Dependencies, licensing, and isolation

Source: official [OpenHands software-agent-sdk](https://github.com/OpenHands/software-agent-sdk/tree/c048a1eb82353b0586f3ce600708394a68ebb246), commit `c048a1eb82353b0586f3ce600708394a68ebb246`, SDK 1.59.0, MIT. Existing [upstream lock](../../experiments/openhands/upstream-lock.json) retains SDK/Agent Server/Automation source hashes. The SDK source checkout was clean. The runtime uses Python 3.13.18 and only the SDK workspace source; no tools/browser/agent-server stack was installed.

The exact [requirements-sdk.txt](../../experiments/openhands/requirements-sdk.txt) was exported from the pinned upstream lock with:

```sh
uv --no-config --cache-dir TASK/uv-cache export --project TASK/upstream-sdk \
  --frozen --package openhands-sdk --no-dev --no-emit-workspace \
  --format requirements-txt --output-file TASK/sdk-requirements.txt
uv --no-config --cache-dir TASK/uv-cache venv --python /opt/homebrew/bin/python3.13 TASK/openhands-sdk-env
uv --no-config --cache-dir TASK/uv-cache pip sync --python TASK/openhands-sdk-env/bin/python \
  --require-hashes --only-binary :all: TASK/sdk-requirements.txt
```

`TASK` denotes this task directory; substitute its absolute path. 132 installed distributions on this machine are inventoried in [dependencies.json](openhands-full-loop/dependencies.json). Wheels only, exact hashes, no source builds or install scripts, task-local environment/cache, no global configuration changes. Before import, the worker clears environment variables and sets task-local OpenHands persistence; no user's credential/config home is copied. SDK source is imported directly after checking pinned revision and selected contract-file hashes.

SDK license is MIT; transitive metadata includes MIT, Apache, BSD, MPL and other licenses. `agent-client-protocol` and `caio` lack a metadata license field but their bundled license files identify Apache 2.0. `lmnr-claude-code-proxy` has no declared/bundled license in this installed wheel: unresolved packaging/license evidence, not a claim of redistribution clearance. Docutils carries mixed per-file notices. The inventory is not a complete redistribution/legal audit, and no dependency wheels are committed or published.

This routine reputable isolated dependency setup was covered by the test-branch request. Sandbox network permission was required for the wheel downloads and approved; no new model/account authority was requested or used.

## Review, failures and remaining work

The first fixture construction failed because funding timestamps omitted the strict millisecond ISO format; corrected before acceptance. Initial focused runner preflight failed on sandbox loopback EPERM, then ran with tool-approved loopback permission. First native coordinator run completed its worker but failed to validate the mismatched receipt schema; the durable effect remained uncertain and that failed run was retained, never retried as a fresh execution. The schema was aligned before the successful native-v2 replay. Worker development separately exposed and corrected SDK custom-tool factory/deserialization requirements; failed worker receipts remain in `/tmp/acme-sdk-worker-review`.

Independent review found and closed proposal-byte binding and message-delivery gaps. Review independently ran two regression tests and inspected all six native-v2 receipts, native messages and source/message hashes. The reviewer reported no remaining material findings within the bounded scope, with the named crash-point and catalogue-withdrawal limitations above. Final integrated `npm run check`: 3,927 tests, 3,923 passed, zero failed, four skipped; test duration 295.469 s, whole gate 344.506 s. Roadmap/render/inbox checks and typecheck passed. Hygiene reported no flaky or slower test (four busy runs omitted). Exact code hashes, command and released admission receipt `101ad66b-b865-4422-a0b9-b014758300e3` are in the validation record. Preparation review additionally identified unsafe host evaluation of a future agent patch; the baseline probe now rejects any changed target blob before import. Independent negative control confirmed rejection before a malicious marker could execute. A contained post-patch scorer remains a launch blocker.

Maintenance is already substantial: an adapter journal, local worker transport, SDK-specific custom tool/completion fixture, source pins, Python dependency lock, lesson approval bridge, trace renderer and process supervisor. It is useful experimental glue, not evidence that adopting OpenHands removes Plates orchestration/governance work. Real Agent Server deployment, provider/broker hard budgets, process isolation, distributed recovery, real-user identity and shared transport remain separate work.

The next stage is [real Plates trial preparation](2026-10-30-openhands-real-trial-plan.md): genuine existing defects, frozen worktrees/checks and no model launch until the parent selects an equivalent task and the user names account/model/budget authority.
