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

## Approved provisioning and first live preflight — 2026-10-31

The owner subsequently approved storage/use of the existing token in the named
login Keychain item. A visible local Terminal collected one hidden token entry,
with the owner-supplied public Discord ID prefilled. Metadata-only lookup confirmed
the item exists; config inspection confirmed exactly that one human and the fixed
application/guild/channel. No token was read into assistant output, arguments, logs
or a plaintext file. The token-only prompt refinement is commit `9271f169`.

The full preparation gate completed at `3713b9d9`: exit 0, 3,915 passed, zero failed,
four existing opt-in Docker tests skipped, all nine pinned stall checks passed,
and roadmap/render/inbox checks passed. The ledger reported no flaky or slower test.

After provisioning, the approved runtime captured its Keychain item through the
private pipe and made read-only Discord preflight requests. Application/bot
`1565878548068311060`, guild `1565876613382410342`, and text channel #test
`1565878881473265775` matched. Effective permissions were `2248473465835073`,
not the required `3072`; missing required bits were `0`, extra bits were
`2248473465832001`. Additional capabilities include invitations, attachments,
mentions, history, threads, voice/media, guild expressions and events.

Startup refused with `exact_view_send_permissions_required`, before command
registration, Gateway connection or any message POST. The durable registration
map and outbox were empty and the runtime lock was released. No permissions were
changed. The first generic diagnostic was narrowed to fixed safe error codes and
then numeric permission metadata; those read-only checks did not retry any write.
The focused bridge suite passed all 18 tests after adding a negative test for the
numeric mismatch metadata. The exact-permission policy remains unchanged.

Remaining live boundary: resolve the permission mismatch through a reviewed scoped
decision; do not alter @everyone or add bot privileges implicitly. Then register
the three guild commands, deliver the original single synthetic test intent, and
observe the owner's slash-command reply path. No live reply-path success is claimed.

## Permission semantics correction and scoped proposal — 2026-10-31

The earlier whole-bitfield equality was incorrect for a text-channel policy.
Discord's permission computation retains guild and voice/stage flags; only flags
marked T in its official table apply to text-channel overwrites. The gate now
requires exactly View/Send within that explicit mask, preserves outside-text
observations, and rejects owner/administrator, other server administration grants
and unknown flags before channel overwrites can hide them. Interaction admission
uses the same classifier. This corrects the code rather than asking the owner to
change unrelated guild permissions.

A fresh read-only inspection showed: the bot/app name is `Plates Test`; its managed
role `1565878752557138014` has exactly `3072`; @everyone has `2248473465835073`;
#test is a type-0 text channel with no permission overwrites. Thus all extras are
inherited from @everyone, not requested by the bot role. Do not edit @everyone.
The current text extras are `1760285904322625`; the other retained bits total
`488187561509376` and include voice/stage, own nickname/expression and historical
Clyde permissions. The narrow bit-47 `legacyClyde` exception is supported by
[Discord.Net's flag definition](https://docs.discordnet.dev/api/Discord.ChannelPermission.html)
and [DisCatSharp's deprecation annotation](https://docs.dcs.aitsys.dev/api/DisCatSharp/DisCatSharp.Enums.Permissions).
Interpreting that exact observed bit as historical residue is an inference from
those SDK-maintainer sources; arbitrary unknown bits remain refused.

An offline calculation against that snapshot proves the minimal new member
overwrite `{type:1,id:"1565878548068311060",allow:"0",deny:"1760285904322625"}`
would retain View/Send, deny the sixteen current extra text capabilities, and pass
the corrected text policy. No allow/grant is needed. The resulting raw value
would remain `488187561512448`, with text value `3072`; expecting the whole raw
value to become `3072` would still be wrong. This is a proposal, not applied state.
Re-read the current permissions before applying, preserving any later changes.

The owner approved narrowing only this bot in #test. The available Chrome Discord
session presents `dion_45652 — Please log in again`; no native Discord app session
is available. The #test tab was left at sign-in for the owner. No user token was
read, no bot elevation was requested, and no Discord permission change was made.
After owner sign-in, use #test → Edit Channel → Permissions → add the specific
`Plates Test` member, disable only the approved extra text permissions, preserve
other members/roles and verify the resulting scoped permissions. The bot must
not receive Manage Roles/Channels or Administrator to edit itself. See
[Discord's channel UI guide](https://support.discord.com/hc/en-us/articles/206029707-Setting-Up-Permissions-FAQ)
and [overwrite API requirements](https://docs.discord.com/developers/resources/channel#edit-channel-permissions).

Verification: 22 focused bridge tests passed, including every extra text bit,
missing View/Send, guild authority concealed by channel denies, known non-text
flags, narrow legacy residue and future unknown flags. Independent semantics
review cleared the design and the guild-before-overwrite checks. `plates prove`
against `d0ebcadb` reproduced the real interaction rejection with the prior core
and verified the corrected behavior; its exact trailer is retained in the commit.
