# Gas City shared chat seam preparation — 2026-10-30

No Discord bot, token, grant, connection or message was created. Server/channel
selection and standing posting permission remain unanswered. The parent owns one
shared transport decision; this branch adds no competing Discord bridge.

The full-loop demo already retains local human/coordinator/worker turns with
stable run/message IDs in its journal and per-worker mailbox. Turns are scripted
fixtures; sender roles are not a production chat login. The worker consumes the
mailbox and returns a reply linked to its original message. This proves local
flow/trace plumbing only. The current subprocess provider's Nudge/SendKeys are
no-ops, so it cannot be called a live conversational transport.

The agreed future local web-chat and Discord adapters should emit the same
transport-independent envelope, for example:

```json
{
  "schema": 1,
  "provider": "discord",
  "accountId": "exact-bot-account-id-as-string",
  "scopeId": "exact-guild-id-as-string",
  "conversationId": "exact-channel-or-thread-id-as-string",
  "messageId": "exact-interaction-id-as-string",
  "projectId": "acme-canvas",
  "target": {"kind": "worker", "id": "bound-session-id"},
  "origin": {"kind": "human", "providerUserId": "exact-id-as-string"},
  "text": "Please explain your current result."
}
```

All platform IDs remain strings. The trusted ingress resolves origin to current
Plates actor/project access; message text, display names, bot labels and quoted
approval never supply authority. A coordinator target is distinct from a worker
session. Agent output has trusted runtime provenance and never becomes a human
command. Bot-authored messages do not trigger another run.

For a future private test channel, the parent research recommends one labeled
Plates bot and slash-command-first `/plates ask target:coordinator|agent-id`,
`status`, and `stop`. An outbound Gateway avoids a public tunnel; the initial
command flow does not need message-content intent. This remains a plan, not an
installed or connected configuration.

At the pinned Gas City extmsg seam, map provider/account/scope/conversation into
its `ConversationRef`, authenticated sender into `Actor`, and exact platform event
ID into `provider_message_id`. Persist the scoped ingress ID before dispatch;
changed content for the same identity conflicts. Keep the original route and
receipt through reconnect. Adapter registration/binding is required after native
restart; successful registration is not durable conversation delivery evidence.
The existing experimental client/bridge already exercises this wire shape with
local fixtures, and retains inbound uncertainty rather than blindly notifying
twice. Full extmsg/server execution remains untested.

The parent-selected shared implementation still needs a durable outbox:
`pending -> claimed -> delivered | uncertain | refused`, exact destination/body
approval, original operation reconciliation after ambiguous response, and explicit
platform receipt linkage. Do not retry an uncertain outbound POST automatically;
Gas City's documented failed publish has no automatic retry. Bot read/status and
UI reconnection must inspect receipts without replaying actions. Stop requested
must stay distinct from authoritative worker termination. Until implemented and
verified, the demo's recorded worker replies are local trace output, not confirmed
Discord deliveries.

This is a precise adapter handoff and local-flow evidence, not authorization to
provision credentials, broaden grants, read a server or post messages. The next
step waits for the parent's shared transport choice and the owner's exact
server/channel and posting policy.
