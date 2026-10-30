# OpenHands local containment and captured-code scoring — 2026-10-30

This implements the next safe part of the real Plates trial while model/account/budget decisions remain pending. It does not fix either target defect, launch a credentialed agent, install ACP adapters, weaken OS protections, create grants, or configure Discord. The earlier denied file preview was not retried.

## Concrete boundary implemented

The implementation uses macOS 27.0.1's built-in `/usr/bin/sandbox-exec` to apply a **default-deny child policy**. The initial nested call under the tool sandbox returned `sandbox_apply: Operation not permitted` (exit 71). Tool-approved execution outside that enclosing sandbox successfully applies the stricter child sandbox as the same user. No sudo, system setting, persistent entitlement, security exception or account grant was used. A minimal startup probe initially exited 134 until the installed dyld bootstrap contract was included; the policy then ran Node correctly.

[containment.mjs](../../experiments/openhands/containment.mjs) grants only the exact Node executable, required system runtime reads, exact generic runner, and selected workspace. It admits no network, process fork, arbitrary executable, Mach service lookup or signal to another process. Environment is reconstructed without personal auth/config variables; inherited descriptors are only stdio pipes. Native addons are disabled. A parent-owned wall deadline kills the process group and waits for its actual exit. Output limits precede line parsing.

Two filesystem modes exist:

- File worker: read its selected workspace and write inside it, with explicit kernel write denial for `.git` and `tests/helpers`. The generic runner lives outside the writable root. A bounded file capability further restricts writes to `lib/**` and top-level `tests/*.test.mjs`, rejects hidden/helper/harness paths and model-supplied authority fields, and requires the previous SHA-256 (or null for creation). Each read/write is at most 256 KiB. Existing tests may be overwritten only with their current digest; this is not new-tests-only permission.
- Capture/evaluation subject: workspace read-only; no filesystem write permission. Private evaluator/controller files, sibling worktrees and live fixture state are outside the read grant. Public original-baseline repository tests/fixtures remain readable in the subject snapshot; they are not represented as hidden.

The host supplies the root and serializes file-tool calls. Digest preconditions prevent ordinary serialized stale edits; they are not distributed CAS. Writes are bounded and verified but not atomic; interruption can leave an uncertain partial edit, which must be reconciled through the existing durable effect journal before another action. These policies are time/output bounded, **not hard memory or CPU quotas**. The native SDK orchestrator and model provider are not launched by this file worker; only its declared file-effect capability is isolated here.

## Scorer architecture

The historical v1 evaluator imports candidate modules into its own process. Its exact bytes are retained as historical evidence and the independent scorer’s case reference. The final shared v3 evaluator separates candidate execution from private assertions and is now the authoritative cross-backend scorer. Its entire frozen handoff was verified and replayed on all three pristine OpenHands arms.

[contained-score.mjs](../../experiments/openhands/contained-score.mjs) separates those roles:

1. A read-only sandboxed capture process reads candidate `lib` and fixture-helper bytes without executing them. It rejects aliases/special files/hardlinks, opens with no-follow/nonblocking flags, confirms the opened descriptor, bounds reads to 4 MiB plus one detection byte, and rejects changed size/mtime/ctime during capture. Its total/file-count/output bounds are enforced. A path swap cannot amplify the unsandboxed parent's file access because the parent never opens candidate-controlled file contents.
2. The parent decodes bounded relative-path records into a new private snapshot. All other runtime dependencies come from a fresh archive of the trusted baseline. Captured helpers must equal the baseline helper tree exactly, before any candidate import.
3. A separate read-only sandbox imports the captured candidate HTTP service. It receives a synthetic HTTP request and config through stdio, and can ask the parent only for mock fetch responses. It sees no private scenario table or expected verdict.
4. The parent owns the original-baseline fixture services, synthetic authenticated session, durable store, simulated provider writes, injected membership/project-access loss, expected receipt and all assertions. Candidate HTTP responses remain untrusted subject behavior. Candidate “score/pass” frames are rejected. Duplicate fetch IDs, premature results with outstanding fetches, malformed messages and excessive output fail closed.
5. After each subject exits, the parent compares actual response/status and fixture effects, then hashes the read-only captured production bytes again. The report binds controller/shared-evaluator/archive/runtime/policy hashes and records each child exit.

The captured production scope is `lib`. Other production edits are not applied or qualified by this scorer. Independent tests and full repository gates still require review and applicable isolated execution. The score qualifies **captured bytes**, not a live mutable branch or accepted PR. A future agent supervisor must bind worker termination/fencing and the final captured digest to the durable operation before project acceptance. Safe baseline scoring does not claim that future supervision has happened.

## Shared tasks and observed parity

Baseline: `037e13b4f78c061405cef899b528badb536584ad`.
Historical v1 case-reference SHA-256: `723feab106853c71b2016f65904ec9f7880379ddde4804ec4c1dfb0400037548`.
Historical v1 spec SHA-256: `0b7610603f865b91b59f680b485aea544e154a4571e15dd7044cd3c7753d531c`.

| Case | Baseline result through contained scorer |
| --- | --- |
| A authorized API/HTML and repeated reads | 200, original receipt; no additional fixture writes |
| A membership removed before read | 404, denied; no receipt |
| A membership removed during read | 200, receipt disclosed: both cases fail |
| B authorized API/HTML and repeated reads | 200, original receipt; no additional fixture writes |
| B project access removed before read | 401, denied; no receipt; membership retained |
| B project access removed during read | 200, receipt disclosed: both cases fail; membership retained |
| B unknown-operation HTML after mid-read access loss | 200 fallback: fails; should not swallow denial |

The independent contained scorer and the final shared v3 scorer reproduce the same baseline verdicts: **A 4/6, B 4/7**, acceptance exit 1 for each. All fixture setup writes remain 1 before and after receipt reads. Separate session-revocation cases are not in the shared evaluator. No defect was seeded and no source fix supplied.

Replay (new output directory required):

```sh
node experiments/openhands/contained-score.mjs \
  /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/openhands-real-trial-prepared/primary \
  task-a /tmp/acme-contained-score-new

```

Inside the Codex tool sandbox, these commands need the approved child-sandbox launch boundary described above; they must not silently fall back to unsandboxed execution. Other operating systems are rejected/unqualified. `sandbox-exec` and its system profile are private/version-specific interfaces; rerun native qualification after OS/Node changes.

## Negative tests and review

Four native tests currently pass: disabled model/ACP launch; worker/evaluator OS boundaries; hostile subject protocol/resource behavior; and the bounded file tool. Synthetic probes verify denied evaluator/sibling reads and writes, symlink and hardlink escapes, Git/helper edits, signal-other-process checks, socket bind/connect and subprocess creation. The allowed local edit is a positive control. The read-only subject cannot overwrite it. Forged scores and a 9 MiB unterminated output stream are rejected specifically before timeout; a separate infinite process is killed by its deadline and confirmed exited. Independent review also tested the Data-volume alias of a synthetic private file: denied.

Review closed the original unsandboxed capture race, unbounded readline buffering, weak negative-test assertions, and capture read-growth issue. A repository convention check initially rejected subprocess probe text embedded in the root test; the probe was moved into its explicit fixture and the focused gate passed. Failed import-closure and Buffer-serialization prototype runs remain under task-local `openhands-contained-task-a*`; their infrastructure failures are not passes. Final reports are `openhands-contained-task-a-release/score.json` and `openhands-contained-task-b-release/score.json`, with compact evidence alongside this document. No model/paid/provider call occurred.

## Viable backend path and actual remaining boundaries

The viable path for a concrete trial is the pinned **native OpenHands SDK Agent with only registered bounded file/scoring tools**. The trusted orchestrator should obtain an explicitly authorized provider response and hand tool effects to this capability boundary; model text must never set the workspace, actor/account, approval, command or evaluator. The file capability host is a small JSON bridge, not another scheduler. Existing Plates admission/effect/outcome/learning records retain authority and lineage.

ACP launch remains disabled. The pinned bridge's automatic permission approval and Codex `agent-full-access` / Claude `bypassPermissions` defaults are not admitted by this harness. Existing CLI login reuse is therefore not offered as a ready bounded option. No personal auth files were inspected.

An OpenAI-compatible authorized broker/account or an explicitly authorized Anthropic/provider account supported by the native SDK can supply the eventual model. Exact model/account ownership, allowed credential mechanism and total budget are still unspecified. SDK post-step cost checks are not a hard spend cap; use a provider/broker-enforced ceiling or explicitly authorized request/token bounds. No paid API fallback is permitted. Parent must select the concrete provider/model/account and cap before a meaningful approval question can name them.

The actual pinned SDK ToolExecutor is now wired to this host: `sdk-contained-demo.py` observed native AlwaysConfirm waiting with no file or host call, followed by one fixture-approved contained effect and SDK completion. Its two completions and 240 tokens are explicitly scripted; provider calls are zero. This proves the local effect seam, not authenticated human approval or model quality. The Python audit hook is a demo guard, not an OS sandbox for the trusted SDK controller. Local integration still must bind the original worker/fencing receipt to the captured artifact and execute the real agent-authored regression plus independent repository checks. Model funding and real identity require user authorization; more local synthetic harness work does not. Discord server/token/posting authority remains separately pending, and no second bridge was built.


## Final shared handoff and finite feasibility decision

The authoritative handoff SHA-256 is `a7535adfd023ec5992a30523c3a56fcdcd8dd7729d3abb9dceedf5e0bc450af8`; evaluator v3 is `f1d9281846f47e42eb6bb5f7e7528d7e2d027ad80ab6ad4666f57b56d9305004`; selected spec is `b93816edfc823e3ada462c68c6f99da2c65d5f00a25eb0ff92abfa5d912b6f4f`. All nine handoff artifact hashes and both exact prompts were verified. [Preparation receipt](openhands-containment/frozen-v3-preparation.json) binds three independently checked, clean baseline worktrees and reports. Their v3 runs exited 1 because the unfixed defects fail acceptance, with no infrastructure error, unchanged candidate sources, 59 verified helpers and confirmed absent process groups. The old receipt-v1 preparation manifest and RRULE manifest remain separate history.

**Decision: feasible for a restricted native-SDK API trial; not ready to launch a paid/account-backed trial.** The proven capability is bounded file read/list/write plus trusted-parent scoring, with no arbitrary shell, ACP, plugins or MCP. The native SDK supports explicitly configured provider APIs through its LLM contract. No approved account/model transport is configured or tested. Existing Codex/Claude subscription sessions cannot currently be offered through this restricted OpenHands path; ACP's permissive defaults remain disabled. We will not start another security framework to make that path work.

Three finite integration steps remain after selecting the provider configuration: (1) configure only that LLM and explicit input/output/request/time limits in a native SDK trial entrypoint, with no retry after uncertain provider delivery and no fallback; (2) connect exact-action human approvals and the existing Plates durable operation/outcome/capture records to the general file-tool registration, fencing the sole writer before snapshot/scoring; (3) permit only fixed trusted validation commands on captured candidate code under an admitted contained runner, retaining fail-before/pass-after regression evidence and independent review. The single fixed demo does not claim those general trial steps are complete. A provider/broker ceiling is needed for a hard currency cap; local token/request bounds alone are not a billing guarantee.

The separate Gas City sub-agent's automated cyber filter denied an additional adversarial fork/path batch. We did not execute, repeat or transfer that batch, and no additional user approval would override that filter. Earlier OpenHands native negative tests and independent review probes predated that notice. They are bounded evidence, not coverage of the denied batch; new fork/path and timeout-cleanup coverage requested there remains unverified. The file-preview denial also remains respected.

## Final-code validation and remaining bookkeeping uncertainty

The integrated gate logged 3,931 tests: **3,927 pass, zero fail, four skip**, followed by successful roadmap/render/inbox checks. The repository's own [gate receipt](openhands-containment/repository-gate-receipt.json) confirms status 0, signal null, completed true, 260,778 ms. The enclosing validation supervisor did not write its terminal receipt; its recorded wrapper PID 41883 and child/group 41890 were checked absent. Lease `d1bfd29e-d920-4063-b9e4-ddae837a6d56` remains recorded running in task-local `validation-host/state.json`. Cause is unknown; the lease was not deleted and the supervisor status is not invented. No retry-until-green was used. Gate evidence predates the final bridge Unicode fix and documentation/provenance additions; those receive focused validation separately.

Independent scorer/containment review closed four material issues. The SDK demo author's follow-up review identified UTF-8 chunk corruption in the generic host: bounded Buffer accumulation now decodes complete messages once, with byte-counted stderr too. The fixed demo was independently read by the integrating agent; author self-review is not labeled independent review. Initial SDK null-field validation failure is retained and occurred before any effect. The native Action serializer omits null arguments, so the fixed create-only action uses a default-null field and still passes explicit null to the exact-action host check.

## Common acceptance coverage

Here “pass” means the named local executable contract passed. It never means live hosted OpenHands, a real provider, Discord, or multi-user production acceptance. “Partial” marks a narrower native demonstration plus adapter fixtures; the real external boundary remains unverified.

| Common scenario | Local status and evidence | Remaining gap |
| --- | --- | --- |
| Lost launch acknowledgement; coordinator restart | Pass in adapter fixture: durable original conversation/effect/payer, no second launch | Real Agent Server launch uncertainty |
| Worker death and stale callbacks | Pass in adapter fixture: lane retained, epoch/version fencing | Live process/server reconciliation |
| Duplicate issue/chat input | Pass in adapter fixture: durable dedupe and changed-payload conflict | External transport delivery semantics |
| Direct worker/coordinator messages; human conflict | Partial: fixture ordering/conflict checks; native SDK messages included in full loop | Authenticated multi-human transport |
| Capacity expiry/revocation; no payer switching | Pass using production funding validator with synthetic capacity | Live capacity evidence and enforcement |
| One account across two project sets | Pass in fixture: one shared reservation/usage identity | Real provider observations |
| Completion-to-learning crash | Partial: actual coordinator SIGKILL, durable pending/captured/no-useful status, same native worker receipt reused | Production outcome adapter activation |
| Scoped lesson promotion/rollback | Partial: production propose/decide in synthetic home; exact digest/reviewer/scope and retrieval withdrawal | Real reviewer identity and real-model usefulness |
| UI/chat reconnect without action replay | Pass in fixture: read projection and uncertain-send suppression | Discord/live web transport reconnect |
| Malicious content cannot forge authority | Pass in fixture: role/actor/policy/approval fields rejected; contained file capability ignores textual authority | General prompt influence is not eliminated |
| Whole-PR usage across retries/reviews/failures | Pass in fixture: linked attempts, unknowns retained and account dedupe | Measured provider charges/review calls |
| Pending stop versus confirmed termination | Pass in adapter fixture; local sandbox child exits observed | Remote worker/lease termination proof |
| Full two-project learning loop | Partial: native SDK scripted execution, crash/recovery, exact promoted lesson, control/treatment and withdrawal | Agent-authored patch and measured real-model benefit |
| Real Plates receipt-race baseline | Pass as reproduction: exact common v3 A4/6, B4/7, untouched baseline, all helper checks | No model fix or post-patch acceptance yet |

Native SDK capabilities used here are conversations/events, explicit tool registration, confirmation pause/resume and local persistence; native Automation lease behavior was separately exercised. Identity/authority, funding admission, dedupe/effect linkage, reliable capture/reviewed promotion, usage coverage and recovery decisions are Plates adapter work. Local shared-key Agent Server access is not a multi-user authority boundary. Memory hints are not governed lessons. ACP permissive defaults conflict with this trial's restricted tool boundary and stay disabled. Cloud/Enterprise scheduling, identity and recovery promises are unknown in this local evaluation.

Final follow-up checks: `npm run check:focused -- tests/openhands-containment.test.mjs tests/openhands-full-loop.test.mjs` exited 0 with native adversarial probes disabled; repository conventions and roadmap/render/inbox/whitespace guards passed. Its first attempt stopped at the tool sandbox's EPERM loopback preflight before tests; the approved local-loopback invocation completed. `npm run typecheck`, JavaScript syntax checks and Python compilation passed. After the Unicode fix, the same fixed SDK demo passed again, and a benign input fragmented inside a multibyte emoji preserved the exact file bytes. These are ordinary edit checks, not a rerun of the separate denied batch. [Final bridge receipts](openhands-containment/validation.json) bind current source hashes and all evidence.

Native SDK replay (new synthetic directory with only an empty `lib` directory, trusted absolute paths):

```sh
/path/to/openhands-sdk-env/bin/python experiments/openhands/sdk-contained-demo.py \
  --sdk /path/to/pinned/upstream-sdk \
  --workspace /absolute/new/synthetic-workspace \
  --node /absolute/path/to/node \
  --host /absolute/plates-openhands/experiments/openhands/file-capability-host.mjs
```

The workspace guard refuses existing repository content. This is intentionally a scripted one-edit demonstration, not the credentialed trial entrypoint. The earlier [full two-project loop](2026-10-30-openhands-full-loop.md) remains separately replayable and inspectable through its saved trace viewer; no screenshot was obtained because preview was denied.
