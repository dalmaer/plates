# OpenHands: prepared real Plates trial, no model launch

> Historical RRULE alternative. The parent selected the [shared receipt-race plan](2026-10-30-openhands-receipt-trial-plan.md) for the actual comparison.

Date: 2026-10-30. This is preparation authorized by “play with the plates repo … REAL testing.” Parent will reconcile the task with Gas City before either backend starts. No target fix has been written by this coding session, no model/credentialed agent has been invoked, and no existing CLI credential file was read.

## Genuine candidate and frozen checks

The [primary task](../../experiments/openhands/real-trial-candidate.md) is an existing routine metadata validation defect: `COUNT` and `UNTIL` are incorrectly accepted together in an RRULE. [RFC 5545 §3.3.10](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10) forbids that combination. Both bare and `RRULE:` forms, in either order, fail the frozen oracle today, while four valid single-field controls pass. No defect was seeded.

Baseline: `037e13b4f78c061405cef899b528badb536584ad`; model blob `831fff6973aaf1001725407fde341f964c90e1c4`. The candidate file is unchanged from that baseline. The related [evaluator-only follow-up](../../experiments/openhands/real-trial-heldout.md) tests the same validation area on a different semantic constraint. Its two invalid cases currently fail; two valid controls pass. **Do not give that document, the combined oracle, this plan, manifests, sibling worktrees or evaluation harness source to the primary agent.** Prompt omission is not isolation.

Allowed candidate edits: `lib/routines/model.mjs`, `tests/routine-model.test.mjs`, and optionally `tests/routine-sources.test.mjs`. Required repository checks:

```sh
node --import ./tests/helpers/hermetic.mjs --test tests/routine-model.test.mjs tests/routine-sources.test.mjs
```

Preparation separately runs the frozen [baseline oracle](../../experiments/openhands/real-trial-check.mjs) from outside the agent workspace; its hash is recorded in the manifest. The executable refuses any target module whose Git blob differs from the trusted baseline before importing it. It MUST NOT evaluate an agent patch in the host process: candidate code could otherwise read or rewrite the oracle, manifests and sibling runs. A future scorer must execute candidate code in a separately contained worker through a narrow data interface, keeping oracle logic/data outside it. That scorer is not implemented here. After the agent patch and independent review, run the applicable focused gate, full `npm run check`, and typecheck. No “pass” may be inferred from a zero-test subprocess or a changed oracle. The integration suite remains relevant but is not itself the held-out measurement.

## Reproduce preparation

```sh
node experiments/openhands/prepare-real-trial.mjs \
  --output /tmp/acme-openhands-real-trial-new
```

This creates three detached local Git worktrees at the same baseline: primary learning task, follow-up without lesson, follow-up with exact reviewed lesson. It rejects existing destinations and requires the frozen target blob. It runs the pre-fix oracle and refuses an already-fixed candidate. It neither invokes an agent nor configures model access. Git's worktree registry may require sandbox approval; no branch switch, primary edit, remote fetch or publication occurs.

Prepared here: `/Users/dionalmaer/Documents/Codex/2026-10-30/task-4/openhands-real-trial-prepared/manifest.json`. Its three worktrees are `primary`, `followup-control`, and `followup-lesson` under that directory. Each remains at the frozen baseline with no target edits. The manifest records baseline observations, oracle hash, permitted files and checks. The initial manifest is preserved as `manifest-before-oracle-review.json`; review expanded prefix controls and identified the direct model test file. This preparation is reproducible; it is **not yet a launchable contained model runner**.

## Exact staged execution plan

1. Parent selects the same primary and held-out tasks, baseline and oracle for both backends. Freeze prompts, revisions, allowed files and budgets before any model sees the task. Keep backend harness code outside all writable task worktrees.
2. Establish separate agent and evaluation container/OS boundaries that expose only one task worktree and permitted runtime tools. Do not expose sibling runs, held-out oracle, user home, harness source, credential files or Docker socket. Pinned OpenHands LocalWorkspace by itself is not this boundary. Verify denied filesystem/network probes locally before model launch.
3. Bind one explicitly authorized owner/account/model to the operation. Preserve account on retries; no paid API fallback or silent payer change. Require an enforceable provider/broker limit; SDK per-run cost is checked after a step and can overshoot, so it cannot be advertised as a hard prepaid cap.
4. Launch through the actual backend, with the task prompt and unprivileged human messages. Record native conversation ID, job ID, process/container ID, action/effect IDs, approval identities, file/tool receipts, actual provider usage and missing-usage flags. The agent must make the patch; this coding session must not supply it.
5. Interrupt at one predetermined durable checkpoint. Fence the original worker, establish process state, then resume/reconcile that operation. Never relaunch ambiguous work or report stop acknowledgement as termination. Hash before/after trees and check no repeated changes/effects. Bound retries and elapsed time; retain failing attempts.
6. Evaluate unchanged oracle and real repo tests; obtain independent review. Capture the actual outcome and an evidence-backed lesson or explicit no-useful-lesson status. Reviewer approves exact content, evidence and scope, not a prewritten “successful lesson.”
7. Only then run the separate follow-up/control arms from the same frozen baseline with fresh conversations, same model/settings/budgets and no primary patch transfer. The treatment differs only by the exact reviewed lesson. Record order/model seed when supported; do not claim statistical learning effectiveness from one pair. If budget does not allow a control, mark that limitation.
8. Measure acceptance, regressions, review findings, changed lines, retries, latency, actual tokens/cost/unknown coverage, and human interventions. If lesson use harms the result, withdraw scope and rerun only when budget permits. Preserve lineage and historical decisions. Nothing is merged, published or deployed.

## Provider and existing-session findings

The pinned SDK supports native LLM providers plus ACP agents. These are different execution paths:

- Native `Agent` uses SDK LLM configuration. The completed local demonstration replaces only completion and never contacts a provider. A model-backed native Agent needs explicitly authorized provider access. The SDK's own OpenAI subscription store is not automatic reuse of a Codex CLI login; credential export/materialization code was inspected but not exercised.
- Codex ACP supports its advertised `chat-gpt` authentication method using the existing Codex auth location. This starts a new agent session; it does not attach an existing chat. Claude ACP preserves CLI configuration locations by default, potentially reusing an existing login. Actual login validity, account ownership and funding have not been checked.
- Installed Codex/Claude executable paths were observed without running them. ACP executables were absent from PATH. Upstream defaults use `@zed-industries/codex-acp@2.2.2` and `@zed-industries/claude-agent-acp@0.63.0`; first launch can download them. These adapters have not been installed or launched here.
- **Permission conflict:** `_ACPClient.request_permission` automatically approves requests, and defaults are Codex `agent-full-access` / Claude `bypassPermissions`. The real native `AlwaysConfirm` evidence does not transfer to ACP. See pinned [ACP bridge](https://github.com/OpenHands/software-agent-sdk/blob/c048a1eb82353b0586f3ce600708394a68ebb246/openhands-sdk/openhands/sdk/agent/acp_agent.py) and [provider defaults](https://github.com/OpenHands/software-agent-sdk/blob/c048a1eb82353b0586f3ce600708394a68ebb246/openhands-sdk/openhands/sdk/settings/acp_providers.py). Do not run this default path as a bounded authorized trial. Containment and explicit permission enforcement must be established first; user enthusiasm is not permission to silently grant full access.

No credential bytes, tokens, account grants or personal provider state were inspected. Reading source/executable locations does not establish that a session is authorized for this evaluation. Shared-key Automation single-admin identity and Cloud/Enterprise assurances remain outside this local evidence.

After parent task selection and a reviewed containment/permission manifest, the concrete approval question should name the selected path. For example, **only if Codex ACP is the chosen and repaired path**:

> Do you authorize installing the pinned Codex ACP adapter and running these three isolated Plates sessions using your existing Codex subscription, with model [exact model], account [verified owner], at most 10 minutes per session and 30 minutes total, with no paid API fallback, new login, credential copying, publication or remote writes? The reviewed manifest names the worktrees, allowed files and enforced permissions; only provider authentication/model traffic may leave the worker.

For a paid native provider, replace subscription/time wording with the named broker/account/model, per-arm token/request limits and user-chosen total spend ceiling, and verify an enforceable cap before launch. Time limits alone do not cap monetary spend. No account/model/budget has yet been selected, so this question is prepared **for the parent to resolve**, not a claim that authorization exists.

Remaining model-launch blockers are pending, not denied: equivalent task selection, verified account/model funding, agent and evaluator containment, a contained post-patch scorer, ACP permission correction if that path is chosen, and a concrete budget approval. No paid or credentialed operation was attempted.

## Shared Discord / local chat seam

No Discord bot, token, grant, server connection or message has been created. Parent is coordinating one shared bridge: a labeled Plates bot, dedicated private channel, slash-command-first `/plates ask target:coordinator|agent-id`, `status`, and `stop`; outbound Gateway, no message-content intent initially. Server/channel and automatic posting authority remain pending. There is no verified native OpenHands Discord integration.

Both local web chat and that future bridge should carry the same durable envelope: transport; exact guild/channel/thread/message/interaction IDs as strings; stable Plates conversation/operation ID; authenticated human mapping or server-attested agent origin; explicit worker/coordinator target; event ID; revision; untrusted body. Bot events do not trigger new work. Quoted text/role labels cannot supply identity, funding, approval or control authority. Keep durable inbox/outbox receipt IDs and uncertain send status; reconnect replays observations, not effects.

The local demonstration already uses stable conversation UUIDs, deduplicated input event IDs, durable coordinator/worker messages, authenticated synthetic actor IDs and conflict states. Native assistant events carry worker process provenance in receipts. It has no Discord transport implementation. The prior REST adapter's worker seam is `POST /api/conversations/{conversation_id}/events`; upstream has no message idempotency key, so ambiguous sends must be reconciled, never blindly retried. Confirmation is a separate exact-action/human decision, never freeform chat “yes.” A future shared bridge must use Plates identity and effect contracts; it must not create a second coordinator or scheduler.
