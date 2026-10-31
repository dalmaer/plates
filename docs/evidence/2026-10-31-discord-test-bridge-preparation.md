# Evidence: shared Discord test bridge preparation

- Date: 2026-10-31
- Phase: isolated shared experiment, not acceptance of consolidation phases 137–141
- Revision: base `037e13b4f78c061405cef899b528badb536584ad` plus working tree on `codex/discord-test-bridge`
- Claim: a single synthetic conversation bridge is prepared for the specifically selected #test channel, with credential provisioning and live validation still pending.

## Automated checks

Observed on Node `v24.22.1`, npm `11.19.1`, arm64 macOS, Swift `6.4.2`:

- `node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/discord-bridge.test.mjs`: exit 0, 18 passed, no failures/skips. The ledger reported no flaky or slower tests. Independent reviewer repeated this command successfully.
- `node experiments/discord-bridge/demo.mjs --json`: exit 0; four coordinator/agent replies across Gas City/OpenHands namespaces; lost delivery response retained after reopen; zero external, model or backend calls.
- `npm run check:focused -- tests/discord-bridge.test.mjs`: exit 0 with ephemeral loopback access; 132 tests passed, plus roadmap/render/inbox/whitespace guards. Sandbox-only invocation first refused the required loopback preflight (`EPERM`), before running its test stages; no assertions were skipped.
- `npm run typecheck`: exit 0. This is the repository's selected production JSDoc scope, not a claim that this experiment is statically typed.
- `swiftc experiments/discord-bridge/keychain.swift -o <task-root>/keychain-helper-check -module-cache-path <task-root>/swift-module-cache`: compiled successfully after correcting an unavailable zeroing symbol. Existing macOS file-Keychain API deprecation warnings remain documented. No Keychain store/read was performed.
- `<task-root>/keychain-helper-check describe`: exit 0, prints only fixed store metadata. `env -u PLATES_DISCORD_SECRET_APPROVED <task-root>/keychain-helper-check read`: exit 1 with the approval-required message before Keychain access.
- `zsh -n experiments/discord-bridge/provision.command`: exit 0; script was not executed.
- `npm audit --omit=dev --json` in the sidecar: exit 0, zero known advisories for the pinned dependency tree at this observation. This is not a guarantee against undisclosed defects.
- `git diff --check`: exit 0.

The final integrated checkpoint is `npm run check` (complete tests plus roadmap,
render and inbox guards). It runs after this record is written; its result belongs
in the commit/handoff rather than an invented result here. No public push is part
of this preparation.

## Independent review

A separate read-only reviewer inspected authorization, protocol, credential and
durability behavior. Three findings were corrected: the guild member route now
uses the verified bot ID; command readback canonicalizes owned fields rather than
depending on JSON key order; GET rate limits use bounded backoff. Negative tests
cover each correction. Re-review found all three resolved and no additional
blocking confidentiality issue. The reviewer made no backend edits, Discord calls
or Keychain reads.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read backend client/coordinator seams | Keep backend experiments independent | Gas City `1f9b083d` and OpenHands `cfee23ac` read; existing dirty work preserved | Compatibility design only; no connected backend execution |
| Inspect destination constants and send gate | Only application `1565878548068311060`, guild `1565876613382410342`, channel `1565878881473265775` | Exact strings and fixed outbound channel enforced | Source/offline evidence; not live Discord identity proof |
| Build native helper, exercise metadata/refusal | No token needed for preparation | Successful build and guard refusal | Compile/refusal proof; not Keychain usability |
| Provision token and validate Discord | Owner approves exact secret mechanism first | Not run | Explicit pending boundary |

## Gaps and decision

Prepared locally, not activated or lived-in. The owner must approve the exact
login-Keychain mechanism and manually enter the existing bot token, plus supply
their numeric Discord user ID for the local human mapping. The bot installation
report does not establish identity or effective channel permissions. After scoped
approval/provisioning, validate those facts, create the three guild commands,
deliver one labeled test message and observe a human slash-command reply in #test.

The [runbook](../../experiments/discord-bridge/README.md) names the exact store,
paths, minimum owner action, runtime command, uncertainty handling and read-only
backend seam observations. The bridge remains synthetic-only; no executable backend
adapter, model spend, public listener, routine, webhook, production deployment or
permission widening was introduced. No phase acceptance/status was changed.
