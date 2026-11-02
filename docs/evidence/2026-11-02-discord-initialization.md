# Discord worker initialization repair

## Failure and offline reproduction, 2 November 2026

The first approved live run admitted one owner prompt at 05:14:19 UTC, within its
deadline. No provider session was recorded, no bot reply was sent and no handoff
occurred. Shutdown returned `cleanup: confirmed`; an independent Docker metadata
check found no matching containers. Writer locks were absent. The retained
$0.25/16,000-token reservation is not measured usage; no usage was returned.

The old worker set `CODEX_HOME=/home/agent/.codex`, but a fresh image/volume only
contained `/home/agent`. The real pinned Codex 0.166.0 binary exited before answering
`initialize`, explicitly reporting that CODEX_HOME did not exist. The earlier
credential-free version probe had passed because `--version` does not require that
directory. The live error boundary discarded detail, so the precise original
stderr is unavailable; the equivalent fresh-home failure was reproduced offline.

The diagnostic containers used `--network none`, private tmpfs homes, no credentials
and no persistent mounts. They sent only `initialize`, `initialized` and
`thread/start`; no login or `turn/start` request was sent. Creating the missing
directory allowed initialization and local thread creation with the intended
`discord-conversation` permission profile and empty instruction sources.
This proves local startup compatibility, not provider entitlement or inference.

Pinned 0.166.0 schemas were generated from the installed image with
`codex app-server generate-json-schema --experimental --out /tmp/schema` inside
the same network-disabled boundary. They allow `instructionSources` to be omitted
with an empty default. The adapter now accepts omission but still rejects explicit
null, malformed values and nonempty instruction sources. This was a separate
compatibility issue, not the reproduced startup cause.

## Repair and verification

The worker now creates its runtime-specific private directory before invoking the
CLI and checks ownership, mode, canonical path and directory type. Existing session
files are preserved; links, files and permissive directories are refused.

Runtime diagnostics preserve only allowlisted error codes, fixed phase/method names
and numeric RPC codes. Bridge receipts retain these details while keeping uncertain
reservations. Provider messages, request parameters, credentials and stack traces
are not copied into state. Codex failures distinguish initialization, session
start/resume, session validation and generation. Claude failures distinguish
initialization from generation. RPC invalid-parameter and missing-method errors
remain actionable without retaining remote error text.

Candidate images were built offline as a small code-only layer over the original
pinned images, with no package install or download:

- Codex: `sha256:bf93cad4bde7f40a6d3f1b99dff91e772c3b476d8c803864a79e1beb647736ef`
- Claude: `sha256:50c5dc3184d76dda6a42700ac11809c68f467f40c58def16c91747d1ad918e72`

Both corrected worker entrypoints passed credential-free image-boundary probes.
The corrected Codex worker also passed actual local initialization and thread
creation through the worker setup frame. Every diagnostic container was removed
with identity-checked cleanup. Reproduction scripts and results are in the local
`../runtime-setup` directory: `inspect-codex-offline.py`,
`probe-codex-session-offline.py`, `codex-offline-session-before-home-fix.json`,
`codex-offline-homefix-worker-result.json` and `homefix-probe/image-isolation-evidence.json`.

Focused mocked unit/contract tests cover fresh-home creation, preservation,
permission/link refusal, omitted instruction sources, phase-specific errors,
RPC classification, persisted failures and secret-bearing error redaction.
The first run exposed two test-cleanup ordering errors (temporary directories were
removed before writer locks closed); those hooks were fixed before rerunning.
The final focused unit run passed all 74 tests. No live retry occurred.

The required `npm run check:focused -- tests/discord-initialization.test.mjs
tests/discord-adapters.test.mjs tests/discord-host.test.mjs
tests/discord-pilot.test.mjs tests/discord-trial.test.mjs` passed all 187 combined
pilot/convention tests and the roadmap, render, inbox and whitespace checks.
Only the localhost capability probe required reviewed sandbox escalation; provider
and Discord behavior remained mocked. The output is retained locally as
`/tmp/ajaxian-homefix-focused.log`.

Provider login, model access, real generation, Claude SDK wire behavior, real
session resume and paid billing remain unverified. The first run's state, volumes
and approval files are unchanged. Disabled next-run configuration proposes fresh
run-2 resources and the same thread/owner/bounds; provisioning, credential use and
another live test require renewed approval. Full integrated/typecheck gates and
publication remain outside this local repair.
