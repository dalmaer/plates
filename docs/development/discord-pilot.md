# Discord conversation pilot

Status, 2 November 2026: **repository templates are disabled; a successful live
conversation remains unverified.** Ajaxian has two real Discord bot users,
**Dion (Codex)** and **Dion (CC)** (Claude Code). The core, Discord REST/Gateway adapter,
Codex app-server adapter and Claude Agent SDK adapter are implemented and tested
with mocked connections. A disabled Docker host launcher and explicit private-file
secret resolver are also implemented; see the [host setup guide](discord-host.md).
Four separately approved local attempts are consumed and stopped. The latest
bound a real Codex session but timed out before producing a reply; no handoff
completed. Credentials, approved run configurations and runtime state stay outside
Git. The [host guide](discord-host.md) records current limitations and the
[trial evidence](../evidence/2026-11-02-discord-trial.md) records observed outcomes.

The offline demo retains synthetic histories. Only a real runtime's returned
thread/session ID can establish a provider session; mocked tests do not establish
one. Neither runtime resumes this desktop conversation or another personal session.

## Try the safe local entrypoints

From the source checkout, using Node >=24.22.1:

```sh
node scripts/discord-pilot/demo.mjs --json
node scripts/discord-pilot/validate.mjs dry-run scripts/discord-pilot/deployment.example.json --json
node scripts/discord-pilot/host-plan.mjs scripts/discord-pilot/host.example.json scripts/discord-pilot/deployment.example.json --json
```

The demo uses Acme fixtures, prints five replies/four handoffs and removes its own
temporary state. `dry-run` validates only the supplied JSON and reports its digest,
missing choices, `liveStarted: false` and `credentialReads: 0`. The example is
explicitly disabled, uses synthetic IDs and has no selected provider/auth route.
`dry-run` never imports a host, even if a host argument is supplied. `start` is a
real entrypoint but requires an enabled, complete manifest, its exact digest, an
explicit absolute host-module path and that module's SHA-256. The supplied example
cannot start. The included host and resolver stay disabled; no worker image is selected
by default. Changing `enabled` alone cannot activate the service.

Focused verification:

```sh
node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/discord-pilot.test.mjs tests/discord-adapters.test.mjs tests/discord-host.test.mjs
npm run check:focused -- tests/discord-pilot.test.mjs tests/discord-adapters.test.mjs tests/discord-host.test.mjs
```

These are source-only entrypoints, not additional public Plates CLI verbs. No SDK
or Discord package was added to Plates's zero-dependency runtime.

## Architecture and guarantees

```text
Two authenticated Discord Gateway connections
  -> verified bot identity + public-thread metadata + guild/channel/user IDs
  -> core: mentions, dedup, provenance, one active turn per task, bounds
  -> one Discord thread -> independent Codex and Claude session mappings
  -> guarded runtime adapter -> structured text + optional peer handoff
  -> Discord REST under the replying bot's own identity
  -> durable send receipt -> allowlisted peer Gateway echo
```

Plates had no Discord transport. Its existing `lib/web/model-provider.mjs` is a
hosted project-planning adapter with different policy/receipts. The pilot remains
in `lib/discord-pilot/`; it does not change tasks, jobs, repository execution,
cloud routes or deployment. `service.mjs` composes the new adapters and existing
core only after startup validation. There is no background auto-start installation.

A human creates a public task thread under an allowed parent channel. Allowed
humans can mention one or both bots. One coordinator owns both identities and
serializes turns across the whole task. Duplicate deliveries from both clients
process each target once. Self messages, DMs, webhooks, unknown peers and other
scopes are ignored. A peer message must match a retained outbound ID, author,
thread, text digest and intended peer. Ben's bot is not included.

The model returns a small JSON object with `text` and `handoff`. It cannot select
arbitrary recipients or actions. The core neutralizes model-authored mentions,
adds only the approved peer mention, and sends explicit `allowed_mentions` with
empty `parse`/roles, no reply ping and at most the other bot's ID. Provenance travels
with each input. Messages are discussion data, never new permissions or acceptance.

The initiating human or configured owner can send `@either-bot stop`. Admission
handles stop without waiting for a turn, clears queued followups, aborts the active
request and suppresses late output. An unmentioned stop is not a control command.
A task closes permanently on stop, uncertainty or exhausted limits; there is no
chat command that increases budgets or resets authority.

State uses one writer lock, canonical private directory 0700 and atomic/fsynced
0600 JSON. It contains private histories, provider mappings, receipts and dedup.
Provider IDs are bound before continuing generation, scoped to runtime, account,
model, version and deployment digest; they cannot silently change or be shared
between tasks. Clean restart retains completed dedup and mappings. Interrupted
queues/turns become `uncertain_restart`; they are not replayed. Uncertain delivery
is never resent or refunded. Unknown spend is never zero. Storage failure disables
admission. Never delete state/locks to bypass an uncertain operation.

Turn/task/global reservations precede dispatch, and the task lifetime and four-hop
ceiling survive new human messages. Fixture budgets are synthetic, not approved
prices. Live adapters retain conservative usage estimates using the configured
upper micro-USD/token rate, covering the model's most expensive token class;
Claude's reported estimate cannot reduce that bound. Estimates are not invoices.
These are **admission allowances, not hard provider billing caps**. The core
reserves the whole allowance before dispatch and never refunds uncertain work.
Reported overrun evidence is retained and latches a global stop across restarts;
no automatic budget reset is provided. A request already in flight can still incur
charges, including after a timeout/interrupt. State belongs on internal storage
outside Git/sync roots.

| Control | What it enforces |
| --- | --- |
| Core token/dollar reservations | Finite admitted turns within per-task/global allowances; no promise about actual billed tokens/dollars |
| Four handoffs, task lifetime, timeout | Bounded local dispatch; timeout requests cancellation, not retroactive billing cancellation |
| Claude `maxTurns: 1`, `maxBudgetUsd` | One agentic turn and client-estimate stopping, which may overshoot; budget resets per query |
| Claude output-token environment setting | Maximum output tokens for most requests; model/runtime behavior still applies, not an input-plus-output or session dollar cap |
| Codex app-server | No per-turn output-token ceiling in the inspected schema; usage checks and interruption are observed controls |
| Direct model APIs (alternative B) | Explicit output-token ceilings per request; input tokens, pricing and in-flight charges still require accounting |

Claude result totals can include the resumed session. This pilot conservatively
uses those totals as an upper bound and may stop early rather than undercount;
they are not presented as incremental billing. Reconcile against provider billing
before raising allowances. [Claude cost semantics](https://code.claude.com/docs/en/agent-sdk/cost-tracking)
and [budget option](https://code.claude.com/docs/en/agent-sdk/typescript).

## Implemented adapter contracts

**Discord (`discord.mjs`).** No effects until explicit `start`. Each token is
checked against `/users/@me`; both Gateway READY identities must match the policy.
GUILD and GUILD_MESSAGES intents, heartbeat/ACK, bounded in-process reconnect and
session/sequence resume are implemented. Channel metadata comes from REST and is
validated as a public thread under an allowed parent. Updates invalidate cache.
Normal unmentioned chat does not fetch channel metadata. REST bodies are bounded,
redirects refused, rate-limit waits respected conservatively and message POSTs
never retried. Stable nonce and `enforce_nonce` supplement core dedup. Early peer
echoes wait until the core commits the corresponding receipt. Fatal transport
failure closes sockets and stops tasks. Gateway session state is memory-only;
after a process restart, missed messages are not fetched or silently replayed.
Use a fresh explicit mention after restart. [Discord Gateway](https://docs.discord.com/developers/events/gateway)
and [message creation/allowed mentions](https://docs.discord.com/developers/resources/message).

**Codex (`rpc.mjs`, `codex.mjs`).** JSONL uses approved input/output pipes;
this module never launches a process or logs an auth payload. It initializes the
app-server, creates a fresh persistent thread or resumes only the stored ID,
starts a turn with structured output, handles streamed text/usage/terminal events,
and interrupts the exact turn on stop. A cancellation acknowledgement alone is
not terminal proof. Server requests are denied; unexpected tool activity or model
rerouting quarantines that adapter. Defence-in-depth settings disable shell,
apps/plugins, hooks, skills, memory, agents and search, with no runtime workspace
roots. The named `discord-conversation` permissions profile denies filesystem
access by default, allows minimal OS files and read-only workspace roots, and
disables command networking. `shell_tool: false` disables command execution;
`approvalPolicy: never` alone does not. These settings are backed by the isolated
worker boundary; they are not a universal claim that every built-in internal tool
has disappeared. Unexpected execution fails the turn. The empty workspace contains
no repository, home mounts or secrets for a model to read.
Protocol fields were inspected against the locally generated **Codex CLI 0.164.0**
schema, without starting a server. [App-server protocol](https://learn.chatgpt.com/docs/app-server)
and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

**Claude (`claude.mjs`).** The host supplies the official SDK `query` function and
an explicit environment. The adapter sends one streamed user input per query,
binds the init session ID, resumes only that ID, requests structured output and
checks final model/usage. `tools: []`, `disallowedTools: ["*"]`, no MCP/plugins,
strict MCP configuration, empty settings sources and a deny callback prohibit tools.
Auto memory is disabled explicitly. Output tokens are set to the turn allowance;
API retries are zero and structured-output attempts are limited to one. An unexpected tool
inventory/use quarantines the adapter. Stop invokes `interrupt`, reads its receipt
and drains terminal status; queued/unknown work does not count as confirmed
cancellation. An abort deadline handles unresponsive streams. No general “continue
latest” operation is used. The SDK is not installed or loaded by this checkout.
[SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript) and
[sessions](https://code.claude.com/docs/en/agent-sdk/sessions).

## Recommended host boundary: dedicated runtimes (mode A)

Choose **two isolated containers with persistent provider state and empty
workspaces**, one for each real agent runtime. The bridge runs outside those
workers, holds Discord credentials, authenticates messages and keeps the session
map. Each Discord task thread owns a fresh Codex thread and Claude Code session;
only those saved IDs are resumed. A persistent provider session need not keep a
process alive while idle. This is independent of Dion's existing desktop sessions.

| Choice | What the Discord identity actually runs | Tradeoff |
| --- | --- | --- |
| **A: dedicated agent runtimes (recommended)** | Codex app-server and Claude Agent SDK/Claude Code, with their own real session IDs and private state | Preserves the requested identity and session behavior; requires pinned isolated workers and approximate spend controls |
| B: no-tool model API workers | OpenAI Responses and Anthropic Messages, with bridge-managed conversation state | Simpler tool boundary and explicit output ceilings, but **not Codex or Claude Code sessions**; needs an explicit product/identity decision |

B is not implemented or silently substituted. If approved later, omit tools (and
set OpenAI tool choice to none), enforce input limits and provider output ceilings:
[Responses `max_output_tokens`](https://platform.openai.com/docs/api-reference/responses/create)
and [Messages `max_tokens`](https://platform.claude.com/docs/en/api/messages/create).
Neither ceiling is an exact dollar guarantee.

Mode A's first approved tool set is empty: no shell, repository, browsing, MCP,
plugins or action tools. Codex may still expose internal non-execution facilities;
we reject unexpected tool events and rely on filesystem/process isolation for the
host boundary. Read-only sandbox mode alone permits reads and commands. Supported
controls include `features.shell_tool = false`, a named filesystem permission
profile and disabled command networking. [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference),
[permissions profiles](https://learn.chatgpt.com/docs/permissions) and
[approval/sandbox behavior](https://learn.chatgpt.com/docs/agent-approvals-security).

The included Docker host implementation uses:

- Two pinned images, non-root processes, read-only image roots, empty workspaces,
  bounded CPU/memory/process counts and separate named volumes for runtime state.
  No host home/repository mounts, Docker socket, SSH agent, cloud credentials,
  desktop login state or cross-worker volumes. The workers receive only their own
  approved provider credential; Discord credentials stay in the coordinator.
- Codex app-server stdio pipes attached to the Codex container, with a clean
  `CODEX_HOME`; no exposed app-server listener or inherited MCP/configuration.
  Use the named permissions profile on start, resume and each turn. Verify sandbox
  operation in the chosen image without inference; never silently switch to
  `danger-full-access` when sandbox nesting fails.
- The official Claude SDK outside the worker, using its supported
  `spawnClaudeCodeProcess` hook to launch the pinned Claude Code binary inside the
  Claude container. Return that hook with `query` and the explicit environment.
  Forward stdin/stdout and termination signals; closing a local attach process
  alone is not proof that the remote process stopped. Use a private worker HOME
  and `CLAUDE_CONFIG_DIR`. [Custom spawning](https://code.claude.com/docs/en/agent-sdk/typescript)
  and [hosting/session persistence](https://code.claude.com/docs/en/agent-sdk/hosting).
- A dedicated Docker bridge with outbound internet for runtime API requests.
  This is **not** a provider-domain firewall; approval explicitly names
  `runtime-internet`. Codex's command-network policy is separate from runtime HTTP
  access. Apps/search/MCP are disabled independently. Stronger egress filtering
  can be added later as a distinct host policy.

There is no need to prove an impossible universal no-tools or exact-dollar
property. The local launcher, inspection, explicit file-handle resolver and remote
termination checks are now implemented. Images/SDK installs, container provisioning
and real runtime acceptance remain unperformed. The host inspects Docker image,
network, volume and actual container metadata rather than returning static claims.
A startup prelude checks the real CLI version, empty workspace and read-only image
root before the provider process starts. Mock tests do not establish that these
checks pass on M3. See [host setup and limitations](discord-host.md).

## Explicit activation path

`startPilot({ manifest, approvalDigest, host })` composes the live service.
`hostPolicy` explicitly selects A and admission estimates; other modes are refused.
Before secret reads, `host.inspect` must return the exact deployment digest,
`isolation: 'separate-containers'`, `hostAccess: 'none'`, `sharedCredentials: false`,
`toolPolicy: 'conversation'` and `auth: 'approved'`, based on its inspection.
The core supplies the per-turn admission guard; the host is **not** asked to claim
hard provider token or dollar enforcement.

The operator-selected module exports `createHost({config, configDigest})` with no
import/factory side effects. The included `configured-host.mjs` requires a complete
host configuration and its separate approval digest. Its methods are `inspect({manifest,bindings})`, `loadSecret(reference)`,
`codex({policy,auth})`, `claude({policy,auth})` and `close()`. The first returns the
inspection above; Codex returns JSONL RPC; Claude returns SDK `query`, environment
and `spawnClaudeCodeProcess`. `close` must confirm termination of owned workers.
The secret loader and SDK paths never come from Discord or manifest code paths.
Review the module's dependencies and pinned images as well as its own bytes.

After approval and host provisioning, the foreground start command is:

```sh
node scripts/discord-pilot/validate.mjs start /absolute/private/deployment.json --host /absolute/reviewed-host.mjs --approve MANIFEST_SHA256 --approve-host HOST_MODULE_SHA256 --host-config /absolute/private/host.json --approve-host-config HOST_CONFIG_DIGEST --json
```

The manifest digest comes from dry-run and host-config digest from `host-plan.mjs`;
use `shasum -a 256` on the reviewed module
for its digest. Any changed manifest/module requires reviewing its new bytes.
SIGINT/SIGTERM requests coordinated shutdown. The CLI has no default host,
implicit login, installation or auto-start. Mock tests exercise the actual start
path via injected IO; they do not certify a container or provider session.

## Discord installation and secure configuration, after approval

Create two applications/bot users in the [Developer Portal](https://discord.com/developers/applications),
with separate tokens and server nicknames Dion (Codex) and Dion (Claude). Install
using the `bot` OAuth scope into the verified Ajaxian guild. Start in `#test` only;
copy actual guild, parent-channel, bot-user and human-owner IDs into a private
copy of the example manifest. Replace every Acme fixture ID. Authority never comes
from a display name, role name, or presumed founder relationship.

For human-created public threads the minimum permissions are **View Channel**
(`1 << 10`) and **Send Messages in Threads** (`1 << 38`), mask `274877907968`.
This adapter's single-channel metadata lookup does not require history access.
If adding explicit historical-message retrieval later, add **Read Message History**
(`1 << 16`), total `274877973504`. No parent-channel Send Messages, Create/Manage
Threads, Administrator, Manage Roles/Webhooks or Mention Everyone permission is
needed. Verify effective channel overrides and inherited roles. The addressed bot
can see explicitly mentioned messages without privileged Message Content intent;
requests and stop must mention a bot. Intents are 513, with no member/presence
intent. [Permissions](https://docs.discord.com/developers/topics/permissions).

Enter secrets through **Keychain Access's secure password field** or the selected
deployment secret manager's protected value field, with these separate item names:

| Secret | Example reference in private manifest | Recipient |
| --- | --- | --- |
| Codex Discord bot token | `secret:ajaxian.discord.codex.bot-token` | Discord transport only |
| Claude Discord bot token | `secret:ajaxian.discord.claude.bot-token` | Discord transport only |
| OpenAI credential, if API-key auth is approved | `secret:ajaxian.openai.api-key` | Codex host only |
| Anthropic credential, if API-key auth is approved | `secret:ajaxian.anthropic.api-key` | Claude host only |

The `secret:` names are explicit handles mapped to individual private files by
`host.example.json`. No personal keychain, desktop login, environment credential or
other file is searched. Provision the four files through a hidden local terminal
prompt, in an owner-only directory outside Git, sync folders and bridge state.
The resolver requires owner-only regular files, rejects symlinks/hardlinks and
never logs values. See the [exact provisioning procedure](discord-host.md).

The non-secret deployment manifest pins `model`, `accountScope`, `authMode`,
`version`, dedicated worker `cwd` and approved upper price rate for each provider.
The adapters retain both auth seams; the included Docker host supports only
explicit API-key funding. Neither route is preapproved.
[Codex auth guidance](https://learn.chatgpt.com/docs/auth) and the app-server's
hosted-service restrictions must be checked against the chosen deployment.
[Claude SDK authentication guidance](https://code.claude.com/docs/en/agent-sdk/overview)
does not generally authorize third-party use of personal subscription login.
Use provider-approved billing credentials unless a different route is verified.

## Shortest remaining onboarding sequence

1. Approve mode A with two dedicated workers, provider-approved billing/auth,
   pinned models and small admission allowances, accepting that dollar estimates
   can overrun. API keys are the proposed route; no personal login reuse is assumed.
2. After approval, provision pinned images, the SDK, labeled volumes and a dedicated
   network using the [host guide](discord-host.md), on internal storage. Validate
   the worker boundary without credentials, then test session resume/cancellation
   in the separately approved live acceptance run.
3. Approve/create/install the two bots with `#test` overrides. Enter the four secrets
   (or explicitly approved alternatives) in the secure store and privately configure
   verified IDs. Do not include Ben's bot yet.
4. Review the exact dry-run digest, then separately approve one bounded live test
   through `startPilot` on that verified host. In a human-created thread, mention
   Codex, observe a Claude handoff and four-hop bound, then test human stop.
   Record live evidence before expanding to `#agents` or enabling auto-start.

No live activation, app install, credential provisioning, paid call, message,
push/PR/merge or deployment has occurred. Full repository integration gates remain
required before publication; only focused checks were requested during the backup.
