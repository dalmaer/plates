---
status: planned
since: 2026-10-30
goal: G9
spec: 2
depends: [142, 145]
note: "One transport-neutral chat seam, Discord first (the owner has it working); designed in the stopped executor trials, never connected there."
evidence: []
---

# Agents and the owner talk in one chat the owner can see

## Done when

Plates agents post to, and take requests from, one private chat the owner
already uses (Discord first), through one transport-neutral envelope:
the owner can ask a project's agent for status, ask it something, or stop
it; agents hand work to each other there instead of the owner copying
between chats; and nothing posted in chat can trigger an effect beyond what
the project's autonomy level and door classes allow.

## Scope

- The envelope designed during the stopped trials: string IDs, identity
  from the authenticated origin and never from message text, bot messages
  never trigger work, reconnect replays observations and never effects,
  and an outbox with `pending → claimed → delivered | uncertain | refused`.
- Discord transport: a labelled Plates bot in a private channel per topic,
  slash commands (`/plates ask`, `/plates status`, `/plates stop`), the
  outbound gateway, no message-content intent.
- Long-lived conversations that turn into work become an issue in the
  project's repo, linked from chat.
- Not in scope: a second transport, public channels, agents acting on
  free-text messages.

## Acceptance

- [ ] A message whose text claims to be the owner, or a message from a bot, triggers nothing; only the authenticated owner's slash command does: `tests/chat-seam.test.mjs: "identity comes from the origin, never the text"`.
- [ ] A reconnect replays observations and never repeats an effect; an uncertain post stays uncertain: `tests/chat-seam.test.mjs: "reconnect never repeats an effect"`.
- [ ] A `/plates stop` from the owner stops a running fixture agent, and a request beyond the project's level is refused in chat with the reason: `tests/chat-seam.test.mjs: "chat cannot exceed the level"`.
- [ ] In the owner's server, `/plates status` for one project answers, and an agent's hand-off to another agent appears in the channel: ⚑ by hand: the owner.

## Your part

- **Ask:** Say which Discord server and channels Plates' bot may join, and approve adding its token as a secret.
- **Why:** It ends copying messages between agent chats, in a place you can watch and step into.
- **Look at:** the Discord setup you already tested.
- **Choices:** Use my tested server | Make a new private server | Not yet
- **Keeps it open:** Not yet
- **Takes:** 10 minutes.
- **Then:** The conductor connects the bot to one project's channel and runs the walk.
- **Ready when:** the three chat-seam tests pass.

## Real surfaces

- owner's machine: the bot answering in the owner's private Discord server.

## Proof

Automated: `node --test tests/chat-seam.test.mjs`; `npm run check`.
By hand: the owner's status request and a visible agent hand-off.
⚑ A bot token is a secret and the bot posts as Plates in the owner's
server.

## Deliberately open

- **Where the private desk repo fits.** Conversations about one repo stay in
  that repo's issues; the chat is for live talk and hand-offs. Whether the
  desk issues move to chat or stay is settled after the walk.

## Next action

Read the owner's working Discord test and the trials' chat-seam design, then
write the envelope and its three tests against a fake transport.
