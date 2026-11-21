---
status: planned
since: 2026-11-20
goal: G9
spec: 2
depends: [200, 201]
note: "Filed: an agent's ask is a Unison action on its phase's item; the owner's reply reaches the agent through unison wait; Home lists the asks and links to their threads."
evidence: []
---

# Agents and I talk in Unison

## Done when

For a plate with a Unison workspace, an agent that needs the owner (`plates ask`, or a walk in a
phase's Your part) raises it as a Unison action message on the phase's item; the owner's reply in
that thread reaches the agent through `unison wait` without plates typing into a pane; and Home
lists each open ask with a link to its thread and whether it was answered.

## Scope

- **Asks.** `plates ask` posts `unison chat send --item <id> --action` as the worker's participant,
  @mentioning the owner, and keeps working. A phase's ⚑ walk becomes the same kind of action.
- **Answers.** The reply in the thread is the answer; the agent reads it with `unison wait`. This
  is the delivery phase 199's increments 2 and 3 named, for plates with a workspace.
- **Home.** "Waiting on you" lists open asks with their item and a link to the thread, beside the
  Rex panes of phase 199 (which Unison cannot see). Answered asks leave the list.

Out of scope: plates without a workspace, which keep Home's waiting list and Rex panes only.

## Integration increments

1. **`plates ask` posts an action**, with a stub `unison`. Proof: tests/unison-ask.test.mjs.
2. **Home lists asks** in both forms with links to their threads.
3. **Walks are actions** for the owner.

## Acceptance

- [ ] `plates ask` posts one action on the phase's item mentioning the owner, and a Unison that cannot be written is said, never dropped: `tests/unison-ask.test.mjs: "an ask is an action on its item"`.
- [ ] Home lists open asks in both forms with their thread links, and an answered ask leaves the list: `tests/unison-ask.test.mjs: "Home lists open asks and links to them"`.
- [ ] ⚑ by hand: owner. An agent's ask shows on Unison and on Home; replying in Unison unblocks the agent.

## Your part

- **Ask:** When an agent asks you something, reply to it in Unison and check the agent carries on.
- **Why:** It proves an answer reaches the agent through Unison without anyone typing into its tab.
- **Look at:** Your action list in Unison.
- **Choices:** It carried on | It did not
- **Takes:** About 5 minutes.
- **Then:** It carried on: the phase is built. It did not: the conductor reads the agent's log.
- **Ready when:** increment 2 is merged, deployed and installed.

## Real surfaces

- Owner's machine: a real agent's `plates ask` appears in the real workspace and its `unison wait` returns the owner's reply.

## Proof

Automated: `npm run check:focused -- tests/unison-ask.test.mjs`, then `npm run check`.
By hand: the owner's walk above.

## Deliberately open

- How an answer is tied to its ask when the thread holds several replies: the first reply by the
  owner counts until Unison offers a reference on messages.

## Next action

Increment 1: `plates ask` posts an action.
