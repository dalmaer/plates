# Shared Discord test bridge

An isolated, foreground-only experiment on branch `codex/discord-test-bridge`,
based on `037e13b4f78c061405cef899b528badb536584ad`. It is not imported by the
Plates CLI, routines or either backend. The root package keeps zero runtime
dependencies. This optional sidecar pins `discord.js` 14.28.0 and every transitive
package in its own lockfile; install with `npm ci --ignore-scripts` in this folder.
Node 24.22.1 or newer and macOS Swift/Security.framework are required.

## Fixed destination and behavior

| Item | Exact ID / behavior |
| --- | --- |
| Existing application/bot | `1565878548068311060` |
| Ajaxian guild | `1565876613382410342` |
| #test channel | `1565878881473265775` |
| Bot effective channel permissions | Exactly `3072`: View Channel + Send Messages |
| Gateway intents | `Guilds` only; no message-content, member or presence intent |
| Transport | Outbound TLS Gateway and Discord HTTPS API v10; no listener/tunnel |
| Mode | Synthetic only; no models, coding, backend invocation or approval parser |

All public replies and the bot's activity identify **Plates TEST · SYNTHETIC**.
There is one installed bot, with logical coordinator/agent labels in each reply.
The bridge does not rename the application or request additional permissions.

Use `/ask backend:gas-city target:coordinator text:hello`,
`/ask backend:openhands target:agent:acme-worker text:hello`,
`/status backend:gas-city target:coordinator`, and
`/stop backend:gas-city target:coordinator`. Both namespaces support both targets.
Stop records the authenticated human's synthetic stop request; it does not claim
that a real process stopped. Ask remains conversational after a stop request.
Free-form channel messages, bot/webhook messages, DMs, other channels and unknown
humans are ignored. The same slash commands may be visible elsewhere in the guild,
but the runtime responds only in this exact channel. Application-command channel
visibility configuration would be a separate administrator action.

Discord's Gateway interaction supplies the human's numeric ID and current member
permissions. A private local config maps that ID to one actor and exact routes;
display names, text, mentions and supplied actor IDs cannot grant authority.
The provisioning prompt asks for the owner's copied Discord user ID. Only that ID
is initially mapped. Multiple users require a separate reviewed mapping and state
migration; replacing config on an existing journal fails closed.

## Offline proof

From the repository root:

```sh
node experiments/discord-bridge/demo.mjs --json
npm run check:focused -- tests/discord-bridge.test.mjs
```

The demo performs four synthetic human-to-coordinator/agent turns, loses a delivery
response, reopens SQLite, and checks that uncertainty survives without redispatch.
No network or credentials are used. Tests inject HTTP responses and use Acme
identities. An offline pass does not verify the installed bot or live reply path.

## Secret provisioning — pending owner approval

Exact proposed store: one **generic password in the macOS local login Keychain**,
at `~/Library/Keychains/login.keychain-db`, service
`org.plates.discord-test-bridge`, account `bot-1565878548068311060`.
Security.framework provides encryption and Keychain access control. The compiled
helper is the trusted application. There is no plaintext token file, environment
token, shell-history token, command-line token, custom encryption, cloud sync setup
or new credential creation. Existing items are never overwritten. The helper uses
the macOS file-based Keychain APIs, which Apple marks deprecated but still supplies
for local command-line applications; it does not claim Data Protection Keychain
entitlements or hardware-backed storage. Compilation and refusal paths can be
checked offline; actual store/read usability remains unverified until approval.

The external private directory is
`~/Library/Application Support/Plates Discord Test Bridge` (mode `0700`). It holds
the compiled helper (`0700`), an ID/routing config (`0600`), SQLite receipts and a
single-process lock, never the bot token. The helper accepts the token twice using
`getpass` with echo disabled. The runtime captures its `read` output through an
anonymous OS pipe into process memory, then uses it for Discord authentication.
Neither helper output nor SDK errors are forwarded to logs. The OS may display
a Keychain authorization prompt; do not broadly allow all applications. The bridge
does not read the clipboard or clear the user's clipboard. Swift and JavaScript
strings cannot promise complete in-memory erasure; the token remains in the live
SDK/HTTP process until exit. Other code running as the same macOS user is outside
this boundary, as are memory inspection and compromise of that account.

Suggested approval wording:

> May I prepare the private local bridge directory and let you enter the existing
> Discord bot token in a hidden Terminal prompt, storing it only in your Mac's
> login Keychain under the service/account above? The bridge would read that item
> through a private process pipe for the already-authorized #test validation.
> No token goes in chat. Once provisioned, that validation verifies the existing
> application and exact View/Send permissions, creates the three guild commands,
> posts one labeled test message in #test and handles synthetic replies there.

After that approval, the owner's minimum provisioning action is one local command
from this directory, followed by their numeric user ID and two hidden token entries:

```sh
zsh provision.command --approved
```

Do not run this in an assistant-controlled terminal with token capture. Run it in
the owner's Terminal. It refuses an existing state directory to preserve partial
setup/receipts; inspect a partial setup before resuming. It never starts Discord.
Do not rebuild or replace a provisioned helper without reviewing its Keychain ACL.

## Approved live validation (not yet performed)

After provisioning, using the existing scoped live-validation authorization, from the repository root:

```sh
node experiments/discord-bridge/live.mjs \
  --root "$HOME/Library/Application Support/Plates Discord Test Bridge" \
  --secret-approved --validate-approved --json
```

The flags record the operator's action, not independent proof of consent. Never
use them without the owner's scoped approval. Startup first checks private owned
paths, config and lock; reads only the named Keychain item; verifies bot/application
identity, guild, text channel name/ID and exact effective permissions; then creates
missing `/ask`, `/status`, `/stop` guild commands. It leaves unrelated commands
alone and refuses conflicting existing definitions. It never registers global
commands, grants permissions, installs another bot or creates a webhook. Excess
inherited permissions cause a refusal; any Discord permission change belongs to
the owner and needs its own approval.

After Gateway readiness, a durable `validation-v1` outbox item posts one labeled
test message. The owner then issues `/ask` and `/status` in #test. Verify the
ephemeral receipt, the matching public synthetic reply and a delivered message ID
in stdout. This is the reply-path walk; merely seeing `ready:true` is insufficient.
Use Ctrl-C to disconnect. No launch agent, background service or routine is created.

## Delivery and recovery

SQLite WAL with `synchronous=FULL` atomically records each normalized interaction,
its input digest, conversation state and outbound reply. Interaction continuation
tokens and raw Gateway events are never persisted. The inbox stores submitted chat
text locally; it is untrusted conversation data. Public replies contain only a
character count, trusted actor/route label and receipt ID. Mentions are disabled.
The per-human admission limit is five commands per ten seconds; total inbox capacity
is 10,000 entries. Full storage requires operator review, not automatic deletion.

An atomic claim marks an outbound message **uncertain before POST**. A verified
Discord response records its message ID; explicit 429 responses return the same
item to pending with `retry_after`. Global/rate-bucket response headers defer calls;
GETs use bounded backoff. Timeouts, 5xx, malformed successes and process death keep
the original uncertain row and never resend it. Stable nonces provide an additional
short-lived Discord deduplication layer, not durable exactly-once proof. Ambiguous
command creation likewise requires readback of the original named command. A
confirmed rejection is retained and not retried. Ephemeral acknowledgements are
best effort within Discord's three-second window; their failure does not roll back
the durable inbox or cause a second public reply.

A runtime lock prevents two live clients against the same state. A crash retains
the lock. Before removing that lock, independently verify its recorded process is
absent and no instance owns the directory. Preserve the database. Never delete or
restore the journal to replay a test: old snapshots can lose delivery evidence.
For an uncertain message, inspect #test manually and correlate the receipt/nonce;
this version intentionally provides no resend or automatic resolution command.
Read Message History is not granted, so the bridge does not fetch channel history
to reconcile ambiguity. Any future reconciliation writer needs a reviewed design.

## Backend seam inspection (read-only)

Inspected Gas City checkout `task-3/plates-gas-city`, HEAD `1f9b083d`, particularly
`experiments/gas-city/{client,bridge,loop-coordinator}.mjs`. Its message path checks
current funding and binds an extmsg conversation to a running target session;
`stop` and `terminated` are separate. Inspected OpenHands checkout
`task-4/plates-openhands`, HEAD `cfee23ac`, particularly
`experiments/openhands/{client,evaluation,trial-controller}.mjs` (with existing
uncommitted worker changes preserved). Its messages use `run:false`, execution is
separate, and interrupt is not termination evidence. Neither checkout was edited.

The shared normalized envelope is `{id,userId,actorId,command,backend,target,text}`;
coordinator and `agent:ID` are distinct targets in a backend namespace. A future
adapter must preserve the authenticated identity, existing project/funding policy,
original request ID, revision, bounded execution approvals and termination evidence.
Routing a chat message to those live interfaces is deliberately unimplemented.
The current synthetic exchange does not claim a real backend learning/coding loop.

## Sources

Checked 2026-10-31: [Discord Gateway](https://docs.discord.com/developers/events/gateway),
[interactions](https://docs.discord.com/developers/interactions/receiving-and-responding),
[commands](https://docs.discord.com/developers/interactions/application-commands),
[permissions](https://docs.discord.com/developers/topics/permissions),
[rate limits](https://docs.discord.com/developers/topics/rate-limits),
[guild member endpoint](https://docs.discord.com/developers/resources/guild#get-guild-member),
[discord.js](https://discord.js.org/docs/packages/discord.js/main), and
[Apple Keychain Services](https://developer.apple.com/documentation/security/keychain-services).
