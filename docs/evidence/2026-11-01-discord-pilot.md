# Discord conversation pilot — local evidence

Measured 1 November 2026 on Node v24.22.1, based on Plates `0165c290` in the
isolated `codex/discord-conversation-pilot` worktree. Scope is an offline prototype,
not deployed integration, provider session creation, authentication or live spend.
The [operator guide](../development/discord-pilot.md) describes the boundary.

The first checkpoint below is retained as historical evidence. The adapter
continuation at the end supersedes its statement that live adapters were absent.

## Observed — initial offline checkpoint

- `node scripts/discord-pilot/demo.mjs --json`: five synthetic replies, exactly four
  peer handoffs, separate Codex/Claude mock session IDs with three/two history
  entries, zero network or paid inference calls. Demo state is temporary.
- `node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/discord-pilot.test.mjs`:
  **23 tests passed, zero failed**, approximately 1.5 seconds. Covers ID/mention
  admission, peer provenance, persistent dedup and independent histories, serialized
  turns, stop before dispatch/during provider/during send, late results, queue caps,
  timeouts, cumulative token/spend gates, invalid usage, mention/output bounds,
  uncertain delivery/restart, policy binding, writer exclusion and failed persistence.
  The ledger reported no flaky or slower test.
- `node --check` on `lib/discord-pilot/{bridge,store,mock}.mjs` and
  `scripts/discord-pilot/demo.mjs`: passed (individual paths, no literal brace command).
- Existing selected type contracts passed using the already-installed tooling,
  without dependency installation:
  `node /Users/dionalmaer/code/plates/node_modules/typescript/bin/tsc --project tsconfig.json --typeRoots /Users/dionalmaer/code/plates/node_modules/@types`.
  The repository's explicit tsconfig scope does not include the new pilot modules;
  their validation is runtime tests and syntax checks, not a full static type claim.
- `git diff --check`: passed.

## Focused repository preflight

`npm run check:focused -- tests/discord-pilot.test.mjs` includes the repository's
mandatory helper, README, guide, CLI, adoption, managed-skill and capability
conventions, plus roadmap/render/inbox/whitespace checks. The initial run was
blocked before tests by sandbox `EPERM` on its ephemeral loopback probe; the
approved local execution passed 132 tests and all following guards. That version
had 19 pilot tests. Four final boundary tests and the corresponding stop/output
fixes were added after review. The final preflight passed **136 tests, zero
failed**, in approximately 38.6 seconds, then passed roadmap, render (97 targets),
inbox and whitespace checks. Existing undated-measurement advisories in historical
research documents remained advisory; they were not changed by this work.

Initial failures were retained, not retried blindly: an invocation used the wrong
working directory before files were placed in the isolated checkout; the first
actual pilot test run then exposed noncanonical macOS temporary paths. Fixtures
now pass canonical private directories as the store requires. A later run passed
all 19 tests; the final safety review expanded this to 23.

## Not established

No full `npm run check` or production/integration suite was run, per the explicit
backup-related IO constraint. Full integration and required delivery checks still
precede publication. No Discord client connected; no bots, tokens or installs
were created. There are no live runtime adapters or provider-side cap tests.
Mock histories do not establish a real Codex/Claude session or compatibility with
personal subscription credentials. Provider authentication, no-tool isolation,
Gateway reconnect/rate limits, live cancellation and ambiguous-send recovery are
remaining activation work, not passing evidence.

All work stayed on internal storage. The original checkout's unrelated untracked
files, external disks, backup processes and settings were left untouched. Nothing
was committed, pushed, published, merged or deployed.


## Adapter continuation — 1 November 2026

Implemented disabled Discord REST/Gateway, Codex app-server JSONL and Claude Agent
SDK adapters. The core now persists returned provider IDs, runtime/account/model
bindings and cancellation observations separately from mock history. Pure deployment
validation and the programmatic service composition require explicit activation and
a verified isolated host before credential loading. This is implemented source,
not a claim that a live provider session or deployed service was created.

- `codex --version`: `codex-cli 0.164.0`.
- `codex app-server generate-json-schema --experimental --out /tmp/plates-discord-codex-schema`:
  generated local protocol schemas. Checked thread/start, thread/resume, turn/start,
  sandbox enums and token usage fields. No app-server was started; schema generation
  is not a live compatibility test. The CLI reported a sandbox PATH-alias warning;
  schema generation itself exited successfully.
- `node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/discord-pilot.test.mjs tests/discord-adapters.test.mjs`:
  **44 tests passed, zero failed**, approximately 1.5 seconds. All external IO was
  mocked. Added checks cover JSONL correlation/Unicode, provider session binding and
  resume, streamed interruption/uncertain cancellation, tool-policy quarantine,
  unknown usage, isolated environments, authenticated Discord identity/READY,
  mention payloads, early peer echo commit ordering, rate limits without resend,
  Gateway resume sequence, activation refusal before secret reads, credential
  separation and composed service shutdown. Test-ledger hygiene reported no flaky
  or slower test.
- Example deployment dry-run reports live disabled and unselected auth/runtime
  fields, with zero credential reads and no live start. The CLI `start` action
  intentionally exits 3; it is a validation refusal, not a service launcher.

The remaining live blocker is concrete: a verified isolated host must implement
startup inspection and per-turn admission, including no-tool execution and actual
provider-side token/spend enforcement. There is no default host that fabricates
those guarantees. Codex configuration switches and Claude's soft budget estimate
are not treated as sufficient proof. Authentication, billing, app installation,
secret provisioning, live inference and persistent operation are unapproved and
unattempted. A shared-service authentication route was not assumed from existing
personal subscriptions. Full repository and live-provider integration suites remain
unrun under the task's focused-validation scope.

Final adapter checkpoint: `npm run check:focused -- tests/discord-pilot.test.mjs tests/discord-adapters.test.mjs`
passed **157 tests, zero failed** (approximately 24.7 seconds), followed by roadmap,
render (97 targets), inbox and whitespace checks. All pilot `.mjs` syntax checks
passed. Existing selected type contracts passed with the previously recorded
installed TypeScript command; new pilot modules remain runtime-tested rather than
included in that limited tsconfig. The example `start` refusal was asserted to
exit exactly 3. No full suite or live acceptance test was run.


## Host-boundary correction — 1 November 2026

This checkpoint supersedes the previous continuation's claim that activation
requires provable universal tool removal and hard provider token/dollar caps.
Those requirements exceeded the supported interfaces. It also replaces the CLI's
unconditional start refusal with a real, explicitly approved host entrypoint.

Recommended mode A preserves real Codex app-server and Claude Code session IDs in
two separate isolated workers. Mode B (direct no-tool model APIs) is documented as
a different product/runtime choice and is not substituted. The source guide links
the current official configuration, permissions, hosting, authentication and cost
references. The locally generated Codex 0.164.0 schema supports named permissions
on thread/start, thread/resume and turn/start; it does not expose a per-turn output
token ceiling. Codex now requests the named deny-by-default filesystem profile,
command networking off, shell tools off and no login shell. Claude now uses strict
MCP configuration, auto memory off, bounded structured-output attempts and its
supported output-token setting. Its isolated spawn hook is required by service
composition, so the host cannot accidentally fall back to a local Claude process.

Implemented concrete admission-estimate policy instead of fictional hard billing
attestations. Reported usage overruns retain their observations and stop new tasks
across restarts. Output-token settings, local cancellation and soft SDK budget
estimates are documented separately from provider billing. Cumulative Claude
session estimates are deliberately conservative and may stop resumed work early.
The dry-run report explicitly says `providerBillHardCap: false`.

`entrypoint.mjs` implements dry-run without host imports and start with exact
manifest and reviewed host-module digests. Disabled/incomplete/stale manifests and
changed host code refuse before imports or secret reads. Successful start is
covered only with injected host/provider/Discord IO. The final host module still
needs a selected container launcher, actual mount/config/version inspection,
secure secret resolution and confirmed worker teardown. No module fabricates
those deployment facts. No production image or dependency was installed.

Verification at this checkpoint:

- Pilot unit/adapter run: **47 tests passed, zero failed** (about 1.8 seconds),
  using the previously recorded hermetic node:test and test-ledger command.
  Added tests cover stale host/module digests, dry-run import isolation, successful
  mock start, rejection of silent API substitution, admission limits and persisted
  overrun stops. Test-ledger hygiene reported no flaky or slower test.
- Focused repository checkpoint: **160 tests passed, zero failed**, plus roadmap,
  97 render targets, inbox and whitespace checks, with the previously recorded
  `npm run check:focused` command. No full suite or live integration gate was run.
- `node --check` passed for every pilot module and script. Typecheck's existing
  selected scope was already green; these pilot files remain outside that scope.
- Disabled example dry-run: no credential reads, no live start, no selected auth.
- Read-only `command -v docker podman colima container` found
  `/usr/local/bin/docker`; it returned 1 because other queried commands were absent.
  This establishes CLI presence only. The daemon was not contacted or started,
  and no container, image, network or volume was created.

An initial test failed because its expected Claude environment had not yet been
updated for the newly enforced auto-memory setting; the assertion was corrected
to check the complete new allowlist and output bound. The failure was not a flake.
Final focused evidence is `/tmp/plates-discord-host-focused.log`; pilot output is
`/tmp/plates-discord-host-unit.log`. All work stayed on internal storage without
changing external disks or backup work. Auth/billing choice, host provisioning,
Discord app installation, secure credential entry and one bounded live acceptance
run remain pending user approval/setup; none was attempted or denied.


## Local host launcher completion — 1 November 2026

This checkpoint supersedes the previous checkpoint's remaining local host-code
work. Implemented `docker-host.mjs`, pure host planning/configuration validation,
an explicit private-file secret resolver, the fixed worker entrypoint, Dockerfile
and disabled configuration templates, and an independently approved credential-free
container probe. The foreground start path now binds deployment, host-module and
host-configuration digests. Neither template enables production start. Proposed
API funding and the combined $5 admission allowance remain unapproved.

The host checks pinned image IDs and SDK version/hash, local labeled volumes,
dedicated network, actual container settings, empty workspace and real runtime
version before agent startup. Workers receive no host home/repository mounts or
Discord tokens. Anthropic auth travels in private stdin; Codex API auth travels in
private initialized RPC. No provider key is placed in Docker argv/configuration.
The resolver reads only four explicitly mapped owner-only regular files, never
personal credential stores. Docker has a dedicated empty CLI configuration and
an explicitly selected socket. Runtime internet egress is documented honestly;
there is no provider-domain firewall in this implementation.

Persistent worker leases survive uncertain creation/termination. Remote container
identity is checked before termination; a killed local attach process is not
proof of a stopped worker. The separate probe cannot resolve credentials or start
agent sessions even when API funding remains false. It checks real versions and
the container filesystem boundary only; no universal tool-removal claim is made.

Observed host facts, all read-only:

- `/usr/local/bin/docker --version`: Docker 28.1.1, build 4eba377. `readlink` points
  into `/Applications/Docker.app`, whose application directory exists.
- `uname -m`: arm64; `sw_vers -productVersion`: 27.0.1; `node -v`: v24.22.1.
- `command -v` found local Codex/Claude executables. No auth/config files were read.
- Socket metadata checks for `/Users/dionalmaer/.docker/run/docker.sock` and
  `/var/run/docker.sock` were unavailable. No daemon connection/start was attempted.
- `sysctl -n hw.memsize` was denied with `Operation not permitted` by the selected
  environment. It was not retried or escalated; capacity remains unknown. This did
  not block independent source/mock work. No automatic approval-review rejection
  occurred and no live action has an uncertain outcome.

Verification:

- Hermetic pilot/adapter/host unit run: **57 passed, zero failed**, approximately
  1.9 seconds. Command: `node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/discord-pilot.test.mjs tests/discord-adapters.test.mjs tests/discord-host.test.mjs`.
  Ledger hygiene reported no flaky or slower test. All host process/provider IO
  used mocks; private-file tests used synthetic Acme values.
- `npm run check:focused -- tests/discord-pilot.test.mjs tests/discord-adapters.test.mjs tests/discord-host.test.mjs`:
  **170 passed, zero failed**, approximately 21.8 seconds, then roadmap, 97 render
  targets, inbox and whitespace checks passed. Initial focused execution found a
  helper-convention false positive on a mock named `spawn`; renaming the injected
  factory to `spawnWorker` made its mocked role explicit. The retained initial
  failure is `/tmp/plates-discord-launcher-focused-first.log`; this was not a flake.
- Every pilot module/script passed `node --check`; `git diff --check` passed.
  Full suites and live SDK/Docker/provider integration remain unrun. The existing
  tsconfig does not include these modules; no new static type coverage is claimed.
- Final logs: `/tmp/plates-discord-launcher-unit.log` and
  `/tmp/plates-discord-launcher-focused.log`. Safe host planning reports disabled
  configuration, zero credential reads and zero process starts.

No Docker daemon/container/network/volume operation, image build/pull, SDK install,
auth grant, real credential read, token creation, Discord installation/message or
paid inference occurred. No external storage, backup process or settings changed.
Nothing was committed, pushed, published or deployed. Remaining steps are approval,
provisioning from the templates, the actual no-credential isolation probe, secure
credential entry and one bounded live acceptance run. M1 migration is documented
but neither contacted nor attempted. See the [host guide](../development/discord-host.md).
