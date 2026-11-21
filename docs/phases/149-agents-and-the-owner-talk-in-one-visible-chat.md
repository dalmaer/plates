---
status: built
since: 2026-11-21
goal: G9
spec: 2
depends: [142, 145]
note: "lib/chat holds the envelope, outbox, seam and Discord payload mapping, proven on a fake transport; the bot in the owner's server is the walk; the walk was removed (phase 204)."
evidence: ["evidence/2026-10-31-chat-seam.md"]
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

- [x] A message whose text claims to be the owner, or a message from a bot, triggers nothing; only the authenticated owner's slash command does: `tests/chat-seam.test.mjs: "identity comes from the origin, never the text"`.
- [x] A reconnect replays observations and never repeats an effect; an uncertain post stays uncertain: `tests/chat-seam.test.mjs: "reconnect never repeats an effect"`.
- [x] A `/plates stop` from the owner stops a running fixture agent, and a request beyond the project's level is refused in chat with the reason: `tests/chat-seam.test.mjs: "chat cannot exceed the level"`.

## Your part

- **Ask:** Say which Discord server and channels Plates' bot may join, and approve adding its token as a secret.
- **Why:** It ends copying messages between agent chats, in a place you can watch and step into.
- **Look at:** the Discord setup you already tested.
- **Choices:** Use my tested server | Make a new private server | Not yet
- **Keeps it open:** Not yet
- **Takes:** 10 minutes.
- **Then:** The conductor connects the bot to one project's channel and runs the walk.
- **Ready when:** phase 194's owner checkpoints (its increment 3) are built, and the owner wants its optional Discord mirror.

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

Nothing here until phase 194's increment 3 is built: the channel on the Plates
site is where agents and the owner talk. Then, only if the owner wants the
optional mirror (194's increment 4), the owner names the server and adds the
bot token, and the conductor writes the outbound gateway and walks it.

## Trajectory

- **2026-11-15** The owner chose the Plates site, not Discord, as where agents and the owner talk: phase 194 builds a per-project channel there and reuses this envelope; Discord becomes 194's optional one-way mirror for lines that need the owner.
