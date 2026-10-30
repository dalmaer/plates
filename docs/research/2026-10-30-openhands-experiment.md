# OpenHands isolated adapter experiment

Date: 2026-10-30. Branch: `codex/openhands-evaluation`. Baseline:
`037e13b4f78c061405cef899b528badb536584ad` (verified consolidation code `b48b3a6d`).

This is an executable local experiment, not an adoption, deployed integration,
continuous agent service, or proof that OpenHands has passed Plates' acceptance
criteria. No provider/model calls, personal credentials, upstream installation,
GitHub writes, chat sends, routines, deployment or Switchboard cutover occurred.

## Reproduce

From this branch on Node >=24.22.1:

```sh
node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/openhands-evaluation.test.mjs
npm run check:focused -- tests/openhands-evaluation.test.mjs
npm run check
npm run typecheck
```

Tests create temporary SQLite stores and HTTP fixtures bound to `127.0.0.1`, then
close and delete them. They use Acme Alice/Bob, two personal accounts and two
projects, with overlapping project-set views. They never read real credentials. Coordinator restart is simulated by closing
and reopening the SQLite-backed adapter; this is not an OS/process-kill or
power-loss durability test. Lost acknowledgment uses an actual dropped local
HTTP socket after the fixture records the request.
The standard repository hermetic loader isolates Git configuration.

For the optional source probe, clone the official repositories into separate
scratch directories and check out the exact commits below. This reads source,
checks its hashes and runs only the named dependency-free component/function:

```sh
python3 experiments/openhands/probe-upstream.py /absolute/sdk-checkout /absolute/automation-checkout
```

The probe needs only Python's standard library. It does not install or import
the SDK package or start a server. The synthetic HTTP test is separately runnable
without upstream checkout/network. Do not interpret it as an OpenAPI validation
or as a successful Agent Server launch.

## Pinned upstream contracts and dependency cost

[Machine-readable pin and 17 source hashes](../../experiments/openhands/upstream-lock.json).

| Component | Exact source | Declared version | License |
| --- | --- | --- | --- |
| SDK / Agent Server | [c048a1eb82353b0586f3ce600708394a68ebb246](https://github.com/OpenHands/software-agent-sdk/tree/c048a1eb82353b0586f3ce600708394a68ebb246) | 1.59.0 | MIT |
| Automation | [c1ff860fddd65e1de7c664069bede97211d5712f](https://github.com/OpenHands/automation/tree/c1ff860fddd65e1de7c664069bede97211d5712f) | 1.26.1 | MIT |

These are source pins with declared package versions, not a claim that published
wheels are byte-identical. Both require Python >=3.12. The SDK includes Pydantic,
LiteLLM, FastMCP, httpx, ACP, Laminar, tree-sitter and other dependencies. Agent
Server adds FastAPI, SQLAlchemy, Docker, OpenAI, uvicorn and websockets. Automation
adds databases, cloud storage/SQL clients and Slack SDK. Both uv.lock hashes are
retained; a future installation must review the complete resolved dependency and
license inventory. Only the repositories' own MIT licenses were inspected here.
No copied upstream implementation is shipped in the branch: the Python probe
reads the user's explicitly supplied pinned checkout. The REST adapter is new
Plates code informed by the cited contracts.

Repository dev dependencies were copied from the existing consolidation
worktree's matching node_modules (TypeScript 7.0.2); no install scripts or global
configuration were run/changed. Typecheck covers the repository's selected type
contracts, not this experimental JavaScript API.

## What was built

- [REST client](../../experiments/openhands/client.mjs): explicit loopback URL and
  session key; bounded timeout; redirects refused; no retries. Uses caller UUID,
  trusted project workspace and profile, AlwaysConfirm, one iteration,
  `autotitle:false`, and a separate create/message/run sequence.
- [Evaluation harness](../../experiments/openhands/evaluation.mjs): durable SQLite
  intents, input dedupe, lane holds, original payer, shared-account reservation,
  current trusted auth/funding checks, conflict inbox, outcome/lesson state and
  restricted Mission Control projection. Existing Plates `checkFundingBinding`
  enforces identity, project/model policy, grant state and evidence freshness.
- [Executable scenarios](../../tests/openhands-evaluation.test.mjs) and
  [synthetic server](../../tests/fixtures/openhands/harness.mjs). The server is a
  contract fixture authored for this experiment, not OpenHands or an LLM.
- [Source probe](../../experiments/openhands/probe-upstream.py): checks pinned
  bytes, required workspace and message fields; executes the real SDK FIFO lock
  module directly; evaluates the exact local-user function AST with an inert
  return constructor. It demonstrates deterministic single-admin identity, not
  actual HTTP authentication or full server recovery.

Production jobs, the effect/usage ledgers, reviewed learning and funding remain
unchanged. Experimental rows preserve the identities an integration would have
to map into those existing stores. Only funding validation is reused directly;
SQLite intents, simple request-count reservations, lessons and token summaries
are test scaffolding, not replacements for the production ledgers. The current
usage seam is not wired to `appendUsageObservation` and cannot account for real
provider cache semantics, billing, child calls or allocation across PRs.

Mission Control is a read-only, sanitized projection method exercised by tests,
not a new web app or an installed route. It labels its state stale and reads the
original history after reconnect without replaying mutations. No second UI was
built. An existing authenticated web route remains future adapter work.

## Capability classification

| Category | Finding |
| --- | --- |
| Native, source-verified only | Caller conversation IDs, persistence/leases, event pages, interrupt, tools/profiles, database-backed Automation scheduling and memory context |
| Adapter work, synthetic tests | Person/project scope, durable external intents, original payer and reservation window, conflicting messages, pending learning, reviewed eligibility, stop confirmation and sanitized projection |
| Conflicting with the requested boundaries | Shared-key local identity cannot stand in for multiple people; a simultaneously active Automation scheduler would duplicate Plates ownership; agent memory cannot become policy automatically |
| Unknown / not qualified | Actual server crash and process teardown, profile/secret/model isolation, multi-turn coordination, authenticated GitHub/group chat, real usage and overspend, measured learning improvement and operational maintenance cost |

## Source findings that affect the integration

[Agent Canvas architecture](https://docs.openhands.dev/openhands/usage/agent-canvas/architecture)
separates browser, Agent Server execution, Automation scheduling and deployment
sandboxing. This experiment delegates only individual conversation execution;
Plates owns admission and the Automation server is not started. Running both
schedulers for the same tasks would conflict.

Pinned source links:

- [Conversation request](https://github.com/OpenHands/software-agent-sdk/blob/c048a1eb82353b0586f3ce600708394a68ebb246/openhands-sdk/openhands/sdk/conversation/request.py):
  workspace is required, conversation UUID is caller-selectable, profile is a
  resolvable agent source, confirmation defaults to NeverConfirm. Budget is
  checked after a step and can overshoot; the adapter's $0.01 setting is a
  secondary step limit, never an authorized spend ceiling.
- [Conversation service](https://github.com/OpenHands/software-agent-sdk/blob/c048a1eb82353b0586f3ce600708394a68ebb246/openhands-agent-server/openhands/agent_server/conversation_service.py):
  repeated create reuses an existing UUID and uses a lifecycle lock. A supplied
  initial message calls `run` regardless of its `run:false` flag. Creation here
  omits it. Stored records, runtime leases and restart recovery exist natively;
  their complete crash behavior has not been run here.
- [Event router](https://github.com/OpenHands/software-agent-sdk/blob/c048a1eb82353b0586f3ce600708394a68ebb246/openhands-agent-server/openhands/agent_server/event_router.py):
  message submission has no caller idempotency field; even a 429 can follow a
  saved message. The adapter retains an uncertain receipt rather than resending.
  Events support pagination; this prototype exposes individual pages but does
  not implement a durable upstream event-stream cursor.
- [Conversation router](https://github.com/OpenHands/software-agent-sdk/blob/c048a1eb82353b0586f3ce600708394a68ebb246/openhands-agent-server/openhands/agent_server/conversation_router.py):
  pause waits for the LLM call; interrupt cancels the in-flight request and
  pauses. Neither proves all child processes/external effects are terminated.
  Only independent, trusted process evidence plus a launch fence that prevents
  pending requests from executing later can release this experiment's lane.
- [Automation auth](https://github.com/OpenHands/automation/blob/c1ff860fddd65e1de7c664069bede97211d5712f/openhands/automation/auth.py):
  a local shared key maps to one deterministic administrator. Two synthetic
  people are separated by Plates' host boundary, not by native OSS local users.
- [Automation scheduler](https://github.com/OpenHands/automation/blob/c1ff860fddd65e1de7c664069bede97211d5712f/openhands/automation/scheduler.py):
  database-backed scheduling with atomic claims/row locks exists. End-to-end
  external-effect recovery is not established by reading it. It stays disabled.
- [Agent profile](https://github.com/OpenHands/software-agent-sdk/blob/c048a1eb82353b0586f3ce600708394a68ebb246/openhands-sdk/openhands/sdk/profiles/agent_profile.py):
  profiles resolve model, secrets, tools and MCP configuration. A profile UUID
  alone does not prove payer/model/sandbox identity. The adapter requires an
  injected trusted profile/workspace attestation, with no permissive default.
  The fixture attests only a fixed synthetic profile. No live attestor exists.
- [Confirmation policy](https://github.com/OpenHands/software-agent-sdk/blob/c048a1eb82353b0586f3ce600708394a68ebb246/openhands-sdk/openhands/sdk/security/confirmation_policy.py)
  and [agent execution](https://github.com/OpenHands/software-agent-sdk/blob/c048a1eb82353b0586f3ce600708394a68ebb246/openhands-sdk/openhands/sdk/agent/agent.py):
  AlwaysConfirm is defense in depth. It is not an OS/network sandbox, and does
  not mediate all initialization/hooks/profile setup or standalone think/finish
  actions. This prototype exposes no confirmation approval endpoint.

[Persistent memory documentation](https://docs.openhands.dev/sdk/guides/persistent-memory)
describes project/user memory; that is context, not reviewed Plates policy or
proof of safe promotion. Cloud/Enterprise team identity, budgets and managed
sandbox promises are not evidence for the local shared-key deployment and were
not exercised.

## Acceptance evidence and remaining gaps

| Case | Deterministic fixture result | Native / adapter / gap |
| --- | --- | --- |
| Lost launch acknowledgment + coordinator restart | One create POST; inspect original UUID, payer and intent | Native UUID contract + adapter durable intent; real server crash unknown |
| Worker disappears / stale callback | Lane stays held; callbacks cannot assert completion | Adapter safe refusal; native process death/recovery not exercised |
| Duplicate issue and chat input | Durable dedupe; differing content refuses | Adapter; no GitHub/chat webhook auth implemented |
| Direct worker/coordinator messages; human conflict | User-role messages, ordered revisions, explicit conflicts; coordinator inbox stays pending | Adapter partial; coordinator is not an agent and no meta-selection is built |
| Expired/revoked funding, exhausted account | No new effect and no payer substitution; stop remains available | Existing funding validation + synthetic capacity fixture |
| One account in two project sets | One reservation window across projects; views never allocate more | Adapter request-count scaffold, not real provider quota |
| Completion before learning capture | Pending survives reopen; captured/no-useful-lesson explicit | Adapter; real finish event ingestion remains unknown |
| Lesson promotion and rollback | Unreviewed proposal excluded; reviewer/exact revision; withdraw eligibility | Adapter scaffold; no learned-effectiveness/canary measurement or production lesson export |
| UI/chat reconnect | Read projection and inspect; never replay uncertain message | Adapter conservative recovery; uncertain messages can remain blocked forever |
| Malicious text claims authority | Cannot change role, run flag, identity or policy; forged token denied | Adapter only; no adversarial LLM/tool/sandbox trial |
| PR retries/reviews/failures usage | Each receipt retained/deduped; missing counts remain null | Adapter synthetic accounting; whole real PR billing not verified |
| Pending stop / confirmed termination | Interrupt stays pending until separate matching evidence | Adapter; termination attestor is synthetic, real teardown is a blocker |
| Multiple conversation turns | One durable run intent per operation | Partial: further messages are recorded with run:false; no new-turn execution yet |

Revocation blocks subsequent adapter effects and buffered disclosure. It does
not itself revoke credentials already held by a running backend, terminate its
tools, or provide unattended delegated authority. A supervising stop/revocation
path remains required before live continuous work.

Two deliberate incomplete cases: a lost outbound message acknowledgment is
visibly uncertain with no resend; a missing worker never triggers an automatic
replacement. These avoid duplicate effects but do not satisfy autonomous
self-healing. Native runtime recovery may help, but needs an actual isolated
server/process trial before deciding the integration is viable.

## Validation and review record

Initial unrestricted local source inspection succeeded. The first sandboxed test
attempt failed all 16 cases before assertions because `127.0.0.1` bind was denied
(`EPERM`). The same focused tests with approved loopback execution passed 16/16;
this is an environment change, not a flaky rerun. Additional scenarios were then
added for review corrections and shared capacity. Final results are recorded in
the validation appendix below. One intermediate focused run had a test-only
assertion error: after Bob reserved the same task, the fixture expected capacity
refusal but correctly received original-payer refusal. The scenario now checks
capacity after restart before creating Bob's independent task; no product rule
was weakened. The review also found and corrected capacity-window migration: an
old reservation now pins window identity and expiry, with a regression test.

Independent reviewer identified and the final code corrected: required workspace
missing from create; private funding metadata in shared observation/reconciliation
responses; repeated stop regression; unreviewed lessons labeled reviewed; buffered
mutation responses disclosing after access revocation; termination without a
launch fence permitting delayed requests to execute after lane release. Focused regressions cover
these. Review also identified the one-turn scope limit and profile/confirmation
boundaries; they remain explicit limitations above.

## Maintenance cost and next decision

Measured on 2026-10-30 with `wc -l experiments/openhands/*.mjs tests/fixtures/openhands/harness.mjs tests/openhands-evaluation.test.mjs`: 231 lines of client/state-machine code and 273 lines of fixture/scenarios, plus the separate 69-line Python probe and pin manifest. Line counts describe footprint, not a maintenance-time estimate.

This adds a REST client, a durable experiment state machine, local server fixture,
scenario tests, pin manifest and source probe. Changes to upstream request shape,
profile resolution, idempotency, events, status semantics and teardown all require
contract requalification. The single SQLite snapshot is intentionally small and
not production-scale; shared processes, encryption, retention and restore fences
need the existing Plates storage contracts.

Useful adoption target: OpenHands conversation/tool execution, possibly worktree
and sandbox lifecycle. Keep Plates identities, current authority, approved effects,
original payer, complete usage and reviewed lessons. The custom glue remains
substantial: profile/funding attestation, authenticated participant mapping, durable
turns and messaging, completion ingestion, safe process reconciliation, usage
normalization and real Mission Control HTTP wiring. No measured maintenance-hour
estimate or performance benefit is justified by this fixture.

Remaining authorization for a live trial: approve a specific isolated host/runtime
and pinned dependency installation, synthetic model provider or a named provider
account, an explicit spend ceiling and egress/tool policy, and cleanup/termination
verification. No credentials, grants, global configuration, publication or scheduler
activation are needed to run the included tests. This branch is local and unpushed.

Independent follow-up review closed with no remaining material findings within
the documented experiment boundary. It re-exercised privacy, proposal review,
termination fencing, revocation and changed capacity-window refusals against
temporary SQLite, and ran the 17-file source probe. This is separate from the
author-run test suite and is not a live integration review.

## Final validation appendix (2026-10-30)

- Focused source preflight: **136 passed, 0 failed**, including all **22 OpenHands
  scenarios**; roadmap/render/inbox/whitespace stages passed. Runtime 210.816 s
  under host contention. Exact command is in Reproduce above.
- Source probe: **17 pinned files verified**; required request fields and message
  idempotency shape checked; native FIFO component and extracted local-user
  function checks passed. Full Agent Server execution: **not performed**.
- `npm run typecheck`: passed with TypeScript 7.0.2. Both experimental JavaScript
  modules also passed `node --check`.
- `npm run check`: **failed**. **3,923 tests: 3,918 passed, 1 failed, 4 opt-in
  skips**, 404.361 s. All 22 OpenHands scenarios passed in this run. The unchanged
  `tests/routine-sources.test.mjs:196` asserted that the native SQLite query had
  started before its 100 ms deadline; `began` was false. The full command therefore
  did not reach its chained roadmap/render/inbox stages; those passed in focused
  preflight and were rerun explicitly on the final documentary tree, also passing. The test ledger retained this run as busy, not a clean passing gate.
- A separate diagnostic of that one unchanged test passed (1/1, 547.881 ms total).
  This does **not** replace or erase the failed integrated result. Command:

```sh
node --import ./tests/helpers/hermetic.mjs --test --test-name-pattern='SQLite refuses generated columns' --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/routine-sources.test.mjs
```

**Open validation issue OPH-HYGIENE-1:** `querySnapshot` in
`lib/routines/sources/files.mjs` starts its timeout before the child reports
`query-started`. Under contention, the existing test may exercise process startup
rather than native-query termination. One-minute host load was sampled at 271.05
during the integrated run. Startup contention is consistent with the observed
assertion and isolated diagnostic; it is not an established performance root
cause. The test, helper and routine reader have zero diff from the baseline.
Retain this failure and investigate a bounded startup handshake/test strategy
before claiming an integrated pass. No unrelated reader or test behavior was
changed on this experiment branch, and the full gate was not rerun until green.

[Validation summary and exact source hashes](2026-10-30-openhands-validation.json)
retain the result as failed. This branch is suitable for further local evaluation,
not integration approval. There are no outstanding permission blocks for the
completed local experiment. Real backend qualification needs the implementation
work and separate live-trial authorization described above.
