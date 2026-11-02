# Local Discord pilot host

Status, 2 November 2026: the first explicitly approved live attempt accepted the owner's
prompt, then failed during Codex setup before a provider session was recorded.
It produced no bot replies or handoffs and shut down with no remaining containers
or writer locks. The attempt reserved $0.25; that is not observed billing. Its
one-run state and approved configurations remain preserved and must not be reused.
An offline reproduction identified and fixed a missing Codex home directory.
The approved replacement run connected successfully but received no admitted
trigger before its deadline. It requested no inference. Its worker terminated,
but cleanup retained a safety lease; the supported recovery flow has now archived
that exact lease and lock with absence proofs. Run-3 expired during readiness.
Run-4 admitted the owner trigger and bound a real Codex session, but its first
turn timed out with no reply; cancellation and independent cleanup were confirmed.
Actual provider usage remains unknown. All four runs remain consumed. Another
live attempt needs renewed approval. The unchanged proposed allowance is $0.75 combined
across three turns, not a provider billing cap. Repository templates remain disabled with
`apiFundingApproved: false`. See the [conversation pilot](discord-pilot.md).

## M3 capability observations

Read-only checks found Docker Desktop at `/Applications/Docker.app`, Docker CLI
28.1.1 at `/usr/local/bin/docker`, arm64, macOS 27.0.1 and Node 24.22.1. Codex and
Claude CLI executables are on PATH, but their personal sessions/auth are not used.
The initial socket check was inconclusive. On 2 November, a reviewed read-only
Docker probe verified Docker Desktop 4.41.2, Engine 28.1.1, Linux arm64 through
`/Users/dionalmaer/.docker/run/docker.sock`. It used an empty dedicated Docker
configuration and did not read personal registry credentials. `sysctl -n hw.memsize` returned
`Operation not permitted`, so memory capacity is unverified. No retry/escalation
was needed for implementation. No M1 connection or inspection occurred.

The source defaults reserve at most two workers, each limited to one CPU, 1 GiB
memory, no swap beyond that limit, and 128 processes. These are proposed limits,
not a measured capacity recommendation. The running Codex worker occupies one
slot; Claude uses the other during a query. Concurrent extra work is refused at
capacity. Begin with one task thread. Keep images, state and SDK on internal
storage; defer image builds/installs until the backup-sensitive work is finished.

### Current bounded acceptance proposal, 2 November 2026

The local `../runtime-setup/deployment.pending.json` now records the verified
signed-in Discord owner ID, the installed bot IDs and the existing `#test` parent.
Both provider account scopes are labeled `user-reported:Plates Discord`, following
the user's confirmation. This is an operator-supplied binding label, not a verified
provider project/workspace ID or a request header that changes where a key bills.
Do not inspect key contents or rename/recreate credentials to obtain IDs.

The owner-created public thread is verified and bound. The consumed attempts are
recorded in `../runtime-setup/run-outcome.json` and `run2-outcome.json`; the second
has a separate recovery receipt. The retained disabled run-2 drafts are not a new
authorization or reusable trial. Review a fresh configuration and obtain renewed
approval before another resource setup or credential loading.
The Discord adapter checks its parent, public-thread type and creator's owner ID
from authenticated channel metadata before admitting or sending thread messages.
Do not flip activation flags as part of preparation. Both pending configurations
are disabled and the funding flag is false.

The proposed run uses at most three admitted turns, two peer handoffs, 45 seconds
per turn and 180 seconds from Discord connection, with shutdown after 10 idle
seconds following task activity. It accepts only the owner, at most 800 characters
per human message and at most 600 characters of model reply text (provenance and
the explicit peer mention are added separately). The total admission reservations
are 48,000 tokens and $0.75, split into 16,000 tokens/$0.25 per turn. Actual usage is
checked after generation; an overrun prevents more work and publication. At the
selected conservative $10/million-token estimate, 48,000 observed tokens would be
$0.48, but neither the reservation nor this estimate is a provider bill guarantee.

Claude receives a separate 2,048-output-token ceiling through its supported CLI
environment, plus the SDK budget option. Codex receives a 600-character JSON
output schema; this implementation has no verified Codex provider output-token
ceiling. Runtime/system context, hidden generation and cancellation latency can
exceed estimates. Credential-free Codex initialization passed after the home
directory fix. Funded model access, generation, output schema behavior and peer
handoffs remain unverified after the two consumed attempts. No fallback model or
authentication route is selected automatically on failure.

`trial.mjs` supervises completion, idle time, wall deadline, owner stop, scope
violation and errors. Shutdown stops ingress, cancels queued/active work, and
asks the host to confirm container termination. Failed confirmation remains
uncertain and retains host leases. The service exposes completion to the CLI;
there is no autostart. A durable one-run marker is claimed before secret loading
or runtime authentication and refuses reuse of that state directory even after a
startup failure. Repeating a test requires an operator-reviewed new run, not an
automatic restart or deleting the marker.

Approval must cover two named persistent Docker volumes, one dedicated bridge
network, the private local state directory, use of the four already stored
credentials, provider traffic and up to three actual Discord thread messages.
Runtime volumes retain provider session state and potentially Codex API auth;
coordinator state retains message text, IDs and receipts. Containers stop at the
end; volumes/state remain for review. Internet egress is general bridge egress,
not a provider-only firewall. Model shell/web/MCP/action tools are disabled and
workers have no host repository, home or socket mounts. Do not characterize
general outbound networking as domain-restricted isolation.

Suggested human prompt inside the selected thread, after startup approval:
`@Dion (Codex) Give one short test greeting, ask Dion (CC) to reply and hand back
to you, then give one short closing greeting. No tools or actions.`
The owner can stop before or during work with
`@Dion (Codex) @Dion (CC) stop`. Use actual Discord mentions. History permission
is not needed for these new ordinary thread messages: the bridge does not read
message history or use Discord reply references. The full prompt belongs inside
the thread. Ctrl-C/SIGTERM is the local operator fallback.

## What the host implements

### Installed M3 preparation, 2 November 2026

The isolated setup directory next to this checkout, `../runtime-setup`, contains
the exact dependency lock, image IDs, `pins.json`, the original small image build context,
and `image-isolation-evidence.json`. The installed pins are Codex CLI 0.166.0,
Claude Code 2.1.316 and Claude Agent SDK 0.3.316. Both images use the official
Node 24.22.1 arm64 base digest
`sha256:932a44adcdb8f5dfbf00f00eb38da8d22b450b2ad258b6d1b2319beca823bfbd`.
The SDK was installed separately with scripts and optional dependencies omitted;
the runtime host will explicitly supply the containerized Claude executable.

`python3 -B ../runtime-setup/probe-workers.py` passed against both installed images.
It inspected actual container settings, then ran only the worker's version and
boundary probe, with `--network none`, ephemeral tmpfs home directories, no host
mounts, no credentials and no provider sessions. Both probe containers stopped
and were removed with identity checks. This verifies image isolation; it does
not verify the persistent-volume host launcher, SDK wire compatibility, provider
authentication, live no-tool behavior, session resume or Discord delivery.
No dedicated runtime network or persistent worker volumes were created, and the
deployment and host activation templates remain disabled.

The user-run `../enter-provider-key.py` helper reuses the reviewed private-file
entry functions from `../enter-discord-token.py`. It accepts only `openai` or
`anthropic`, hides input, refuses overwrites and wrong-provider key prefixes,
creates mode 0600 files in the existing mode 0700 secret directory, and makes no
network request. `--check` checks metadata only. After the user's entries on
2 November, both provider files passed nonempty/ownership/0600 checks in the
owned 0700 directory. The approved first attempt subsequently loaded the four
stored credentials through the resolver. Its Codex initialization failed before
the login step; Claude generation never started. Offline diagnosis did not read
credentials or touch the first attempt's runtime volumes.
Do not open Terminal through another route around its computer-control denial;
the user must run this helper manually when back at M3. No key belongs in chat.

For the later live proposal, official public model documentation lists
`gpt-6.1-sol` and `claude-sonnet-5-5`, each at standard short-context rates of
$2 per million input tokens and $10 per million output tokens. Cache, service-tier
and long-context prices differ. Account-specific access is still unverified;
public model listing is not entitlement. Sources checked 2 November 2026:
[OpenAI model and pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).

### Launcher contract

`docker-host.mjs` receives explicit configuration; construction imports no SDK and
runs nothing. After reviewed deployment/module/configuration digests are supplied,
inspection checks the selected Docker client/server, arm64 image IDs, image
labels/version/user/environment, separate local volumes, and dedicated network.
It refuses volume driver options/bind mounts, used volumes, stale host leases,
nonempty Docker CLI configuration and an unpinned SDK module. Docker gets a clean
HOME/config directory and an explicit Unix socket, never the personal context or
registry login configuration.

Each launch uses `--pull never`, a fixed image ID, non-root uid 1000, read-only
image root, all capabilities dropped, no new privileges, resource limits, no
published ports, no Docker log storage and only its own named state volume.
There are no host repository/home/socket/SSH mounts. The launcher inspects the
actual created container before sending the worker setup frame. The fixed worker
entrypoint checks its real CLI version, empty workspace, absent local instruction
configuration and read-only image root before starting the agent binary.
[Docker run controls](https://docs.docker.com/reference/cli/docker/container/run/).

The frame travels over private stdin. Anthropic's API key goes only into its
worker process environment, never Docker argv or container configuration. Codex
auth uses `account/login/start` over initialized private app-server pipes; its
own API auth may persist in its private volume. Discord tokens never enter either
worker. Raw worker stderr is discarded, and public errors contain fixed codes.
The coordinator and Docker administrator remain trusted components.

Claude's SDK is loaded from an explicitly pinned external installation. Its
supported `spawnClaudeCodeProcess` hook launches the CLI inside the container;
the SDK's suggested host executable is not executed. Persistent state volumes and
stored provider IDs preserve real sessions across process lifetimes.
[Claude custom spawning](https://code.claude.com/docs/en/agent-sdk/typescript).

The dedicated Docker bridge allows runtime internet egress. It is **not a
provider-domain firewall**. This tradeoff appears explicitly as
`approval.egress: "runtime-internet"`. Shell, browsing, MCP and action tools stay
disabled in the runtime adapters; Codex's command-network permission is separate
from model HTTP traffic. A stronger egress proxy/firewall would be a new host
policy, not something this launcher claims to provide.

Before `docker run`, an owner-only durable lease records the exact container name,
deployment, runtime and configuration digest. Shutdown checks the corresponding
Docker object's labels, terminates the remote container and verifies that it is
stopped/absent. Killing the local attach process alone is not success. An unknown
creation or termination outcome retains its lease and host lock. A later start
refuses until an operator reconciles it; no automatic stale-lock deletion,
replacement worker or uncertain task replay occurs.

### Recover a stopped host without resetting its trial

`recover-host.mjs` first checks explicit coordinator-exit evidence, bound manifest
and host digests, private regular lease files, the consumed trial and the absence
of a bridge writer. New host locks also record a coordinator PID, which must no
longer exist. Legacy locks require operator evidence from the completed launcher;
do not infer coordinator exit merely from missing containers.

Preview and apply perform successful Docker absence queries for the deployment,
exact names, lease labels and worker volumes, plus an empty-network check. A
daemon failure is not absence. Apply requires the exact preview digest, rechecks
everything, and archives original metadata under `stateDirectory/recovery/` with
a durable receipt. It does not delete runtime volumes, read auth, kill containers,
reset the trial, reconnect Discord or authorize another start. Changed records or
an interrupted archive stay blocked for manual inspection.

```sh
node scripts/discord-pilot/recover-host.mjs plan /absolute/host.json /absolute/deployment.json exec:SESSION_ID:exit:EXIT_CODE
node scripts/discord-pilot/recover-host.mjs apply /absolute/host.json /absolute/deployment.json exec:SESSION_ID:exit:EXIT_CODE REVIEWED_PLAN_DIGEST
```

Cleanup now waits for Docker command stdout to close. If auto-removal happens
between list and inspect, it confirms absence with a fresh successful query.
Still-listed containers, failed queries and mismatched identities remain uncertain.
Fixed cleanup-stage codes are retained in the lease without raw Docker errors.

### Bounded readiness handshake

On 2 November 2026 the owner approved one replacement attempt with up to five
minutes of Discord-only readiness and three minutes of execution after the owner
trigger. The optional `trial.waitMs` setting is bounded to 300,000 ms; old manifests
retain their original timing. The owner must explicitly mention a bot with
`start <prompt>` in the bound thread. Stop retains priority in either phase.

Only Discord credentials are loaded while waiting. After authenticated scope and
owner validation and admission, the supervisor starts its execution deadline
exactly once, before lazy worker/provider initialization. Turn timeout includes
initialization. Aborted initialization cannot dispatch a late model turn. A used
run is still claimed before Discord connects, so an idle timeout cannot silently
restart or replay a prompt. No readiness acknowledgment is posted to Discord.

The waiting timeout disconnects without inference. The execution deadline is
180,000 ms, including worker setup; subsequent messages cannot extend it. Existing
limits stay three turns, two handoffs, 45 seconds per turn, $0.75 admission allowance
and 48,000 admission tokens. Those allowances are not provider billing guarantees.
Total possible ready/execution time is eight minutes, followed by cleanup.
No autostart or broader access is enabled; each consumed attempt needs fresh
approval. Run-3 readiness was verified at 14:57:26 UTC, with a 15:02:26 UTC idle
deadline. It expired without an admitted trigger and exited cleanly; independent
checks found no containers or locks. No provider inference was requested.
See [trial evidence](../evidence/2026-11-02-discord-trial.md) for the terminal result.

## Safe planning now

These commands only read non-secret JSON and print missing choices/digests:

```sh
node scripts/discord-pilot/validate.mjs dry-run scripts/discord-pilot/deployment.example.json --json
node scripts/discord-pilot/host-plan.mjs scripts/discord-pilot/host.example.json scripts/discord-pilot/deployment.example.json --json
```

Add `--probe` to `host-plan.mjs` to preview credential-free container verification
separately from funded live readiness.

The bundled `configured-host.mjs` exports the actual host factory. `start` requires
the exact module digest plus `--host-config` and its separate approved digest.
Changing a secret handle, image, socket, funding choice or resource allowance
changes the host configuration digest. Review imported source/dependencies too;
the entrypoint module hash alone is not a signature over an entire installation.

## Setup after approval

1. Approve API billing, the current bounded test allowance above, runtime
   internet egress and local Docker/SDK provisioning. Select pinned models,
   provider account scopes and conservative current token price estimates. Confirm
   the final bridge `totalMicros` matches the reviewed allowance across both bots. The sample
   deployment's other numbers remain synthetic; do not treat them as approved prices.
2. Make owner-only private state and secret directories outside Git/sync folders.
   Fill the deployment with verified guild, `#test`, bot, owner and allowed-user
   IDs. Give each runtime a canonical cwd ending in `/runtimes/RUNTIME/workspace`
   under the selected state path; it is an empty path inside the container, not
   a mounted host repository. Resolve the actual Docker Desktop Unix socket after
   starting Desktop with approval; do not guess a socket from the observations above.
3. Select exact Codex/Claude Code versions and an arm64 Node 24 base image pinned
   by digest. Build from a tiny context containing only `Dockerfile.worker` and
   `worker.mjs` and `runtime-home.mjs`, **never the whole checkout**. Install the exact Claude Agent SDK
   into a dedicated external directory. No package is added to Plates dependencies.
4. Create two local named volumes and one dedicated bridge network, labeled with
   `plates.discord.deployment=DEPLOYMENT_DIGEST`. Also label each volume with
   `plates.discord.runtime=codex` or `claude`. Fill the host configuration with
   image IDs, volume/network names, socket/client version, SDK module/package paths,
   SDK version and module SHA-256. Set its funding approval and matching deployment
   digest only after approval. Its `maxAdmissionMicros` is an admission bound.
5. Run the credential-free container probe below. Then create/install the two
   Discord bots with the [minimum channel permissions](discord-pilot.md#discord-installation-and-secure-configuration-after-approval),
   and enter four explicit credentials privately. Finally approve one foreground
   live acceptance run. There is no launch agent, background service or auto-start.

Example image build template, **not executed**:

```sh
PILOT_BUILD_CONTEXT=$(mktemp -d /tmp/ajaxian-worker.XXXXXX)
cp scripts/discord-pilot/Dockerfile.worker "$PILOT_BUILD_CONTEXT/Dockerfile"
cp scripts/discord-pilot/worker.mjs "$PILOT_BUILD_CONTEXT/worker.mjs"
cp scripts/discord-pilot/runtime-home.mjs "$PILOT_BUILD_CONTEXT/runtime-home.mjs"
docker --host "unix://$PILOT_DOCKER_SOCKET" build --platform linux/arm64 --build-arg NODE_IMAGE="$PILOT_NODE_IMAGE_DIGEST" --build-arg RUNTIME=codex --build-arg AGENT_VERSION="$PILOT_CODEX_VERSION" -t ajaxian-pilot-codex:local "$PILOT_BUILD_CONTEXT"
docker --host "unix://$PILOT_DOCKER_SOCKET" build --platform linux/arm64 --build-arg NODE_IMAGE="$PILOT_NODE_IMAGE_DIGEST" --build-arg RUNTIME=claude --build-arg AGENT_VERSION="$PILOT_CLAUDE_VERSION" -t ajaxian-pilot-claude:local "$PILOT_BUILD_CONTEXT"
```

After the final deployment digest is reviewed, the corresponding provisioning
commands are (also **not executed**):

```sh
docker --host "unix://$PILOT_DOCKER_SOCKET" volume create --label "plates.discord.deployment=$PILOT_DEPLOYMENT_DIGEST" --label plates.discord.runtime=codex ajaxian-pilot-codex-state
docker --host "unix://$PILOT_DOCKER_SOCKET" volume create --label "plates.discord.deployment=$PILOT_DEPLOYMENT_DIGEST" --label plates.discord.runtime=claude ajaxian-pilot-claude-state
docker --host "unix://$PILOT_DOCKER_SOCKET" network create --driver bridge --label "plates.discord.deployment=$PILOT_DEPLOYMENT_DIGEST" ajaxian-pilot-network
npm install --prefix "$PILOT_SDK_DIRECTORY" --save-exact "@anthropic-ai/claude-agent-sdk@$PILOT_SDK_VERSION"
```

Use the reviewed image IDs from `docker image inspect --format '{{.Id}}' TAG` in
host JSON, not mutable tags. Empty volumes normally inherit the image directory's
ownership on first mount; the probe requires `/home/agent` to belong to uid 1000.
Fix a provisioning mismatch explicitly rather than running the model as root.
The pinned images above were built and their credential-free boundaries checked.
The SDK/CLI live protocol and persistent host lifecycle have not been integration
tested. Do not loosen sandbox settings if a selected image is incompatible.

## Explicit credential handles

The included resolver supports only the following private files, selected by the
host template. It has no environment fallback and does not inspect a keychain,
existing CLI login, shell profile or personal credential directory.

| Handle | File under `secretDirectory` | Consumer |
| --- | --- | --- |
| `secret:ajaxian.discord.codex.bot-token` | `discord-codex` | Discord coordinator |
| `secret:ajaxian.discord.claude.bot-token` | `discord-claude` | Discord coordinator |
| `secret:ajaxian.openai.api-key` | `openai-api` | Codex only |
| `secret:ajaxian.anthropic.api-key` | `anthropic-api` | Claude only |

These files are plaintext protected by local ownership/permissions, not an
encrypted vault. Use a dedicated directory mode 0700 and files mode 0600. The
resolver requires canonical paths, matching ownership, regular files, one hard
link and bounded values; it rejects symlinks, broad permissions and unknown
handles. A future vault resolver must retain this explicit mapping and approval
boundary. No key belongs in JSON, Git, a shell command argument or this conversation.

After approval, this local hidden-prompt example writes the four mapped files
without echoing keys or overwriting existing files. Run it in a private terminal;
enter the path of the reviewed host JSON when prompted:

```sh
python3 -c '
import getpass, json, os, pathlib, re, sys
if not sys.stdin.isatty(): raise SystemExit("Interactive terminal required")
cfg = json.loads(pathlib.Path(input("Reviewed host JSON path: ")).read_text())
root = pathlib.Path(cfg["secretDirectory"])
if not root.is_absolute() or root.resolve() != root: raise SystemExit("Canonical absolute directory required")
root.mkdir(mode=0o700, parents=True, exist_ok=True)
s = root.stat()
if s.st_uid != os.getuid() or s.st_mode & 0o077: raise SystemExit("Private owned directory required")
for handle, filename in cfg["secrets"].items():
    if not re.fullmatch(r"[a-z][a-z0-9_.-]{2,79}", filename): raise SystemExit("Invalid mapping")
    value = getpass.getpass(handle + ": ")
    if not value or len(value) > 4096 or any(c.isspace() for c in value): raise SystemExit("Invalid value")
    fd = os.open(root / filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output: output.write(value)
'
```

If interrupted, already-created files remain; inspect filenames/permissions, not
their contents. Do not copy credentials into chat to troubleshoot them.

## Verify isolation, then separately test live behavior

`verify-host.mjs` is **effectful**: it launches and terminates two probe containers.
It requires complete approved container configuration and `--yes`, but never calls the secret
resolver, sends a prompt, creates a provider session or connects to Discord. It can
run with `apiFundingApproved: false`; probe-only admission cannot resolve secrets
or launch an agent session, and the normal live start remains blocked:

```sh
node scripts/discord-pilot/verify-host.mjs /absolute/private/host.json /absolute/private/deployment.json HOST_CONFIG_DIGEST --yes --json
```

It checks actual Docker isolation settings, real CLI versions, empty workspaces
and read-only image roots. It is not a universal no-tools certificate. Source and
mock checks verify Codex shell/search/apps/plugins/MCP policy and Claude's empty
tool configuration; a real funded acceptance run still needs to verify runtime
compatibility, Claude's empty init tool inventory, unexpected-tool rejection,
session resume, cancellation and bounded handoff behavior. The worker probe does
not test Codex's nested OS sandbox implementation or provider authentication.

For the separately approved live run, use the existing start command with three
digests: deployment JSON, reviewed host module, and host configuration. Test one
human-created `#test` thread, Codex-to-Claude exchange, the approved two-handoff bound and human
stop. SIGINT/SIGTERM coordinates shutdown; verify leases were released. Unknown
termination keeps the service closed and needs manual inspection of the recorded
container IDs/labels. Never remove locks simply to get another start to pass.

## Later migration to M1

Both Macs are expected to use arm64 workers; M1 capabilities still need inspection.
Stop M3 and confirm remote workers ended before moving anything. Securely transfer
the exact pinned images, both runtime state volumes and bridge state together;
these volumes may contain dedicated provider auth and transcripts. Re-enter the
four credentials on M1 rather than copying personal login state. Keep the same
deployment/model/session bindings and in-container paths; review a new host config
digest for M1's socket, SDK paths and resource limits. Never run two coordinators
against the same state or replay interrupted tasks after migration. No migration,
archive creation or external-disk IO has been attempted here.
