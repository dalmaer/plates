---
status: partial
owes: walk
since: 2026-11-06
goal: G7
spec: 2
depends: [181]
note: "Built: the local-host route runs the owner's privately configured command with the brief, once, and shows the state it reports. Owes the owner's walk with a real host."
evidence: ["evidence/2026-11-06-local-host.md"]
---

# A local agent host can take a phase

## Done when

The `local-host` route claims with the host's provider name and hands the spin brief and `decision context` to a local agent host the owner configured; the host's session state appears as presence when it reports one. See [the backlog spec](../specs/web-backlog.md).

## Scope

- An adapter behind the route interface, with a small documented host contract: Plates runs the configured command with the checkout path and the brief on stdin; the command prints a session id, and may answer a state query (`starting`, `running`, `waiting`, `finished`, `failed`).
- The host command lives in the owner's private local configuration, never in a committed file; off unless the plate's `backlog.routes` lists `local-host`.
- The owner's machine only; no credentials pass through Plates.
- Out of scope: hosted dispatch to a local host.

## Integration increments

1. Brief generation, previewed and unused.
2. The adapter running the configured host command.
3. Presence from the host's state query, when the host implements it.

## Acceptance

- [x] The brief carries Done when, Acceptance and current decisions, byte-identical to its preview: `tests/backlog-attach.test.mjs: "local host brief matches its preview"`
- [x] Without `local-host` in the policy the route is not offered: `tests/backlog-attach.test.mjs: "local host needs the policy"`
- [x] A host that reports no state shows claimed and active only, never running: `tests/backlog-attach.test.mjs: "a silent host is never running"`
- [ ] A local agent host attached to one phase builds it, and it lands through ready and integrate: ⚑ by hand: the owner.

## Your part

- **Ask:** Attach your own local agent host to one ready phase, and let it land through `plates ready` and `plates integrate`.
- **Why:** Only you have a host configured on your machine. It settles whether an agent host beyond Claude Code and Codex can work as a Plates agent.
- **Look at:** The brief in the preview: it is the exact bytes your host gets on stdin. Then the card's presence while it works.
- **Choices:** It landed | It started but stalled (say where) | It didn't start (say why)
- **Recommend:** It landed
- **Keeps it open:** It didn't start (say why)
- **Takes:** About 15 minutes to write `~/.config/plates/local-hosts.json` and attach, plus the agent's time.
- **Then:** It landed: built. Stalled or didn't start: the adapter or the host contract changes here.
- **Ready when:** the automated boxes are built, the plate's `backlog.routes` lists `local-host`, and `~/.config/plates/local-hosts.json` names your host under the provider it claims with.

## Real surfaces

- owner's machine: with a configured local agent host, one phase claimed, built and integrated.

## Proof

Automated: `node --test tests/backlog-attach.test.mjs`; `npm run check`.
By hand: the owner's local host run.
⚑ None from Plates; agent use is the owner's own.

## Deliberately open

Presence depends on what each host can report about its session. A host that reports nothing shows claimed and active only.

## Next action

The owner's walk: list `local-host` in `backlog.routes`, write `~/.config/plates/local-hosts.json`, and attach one phase (Your part).

## Trajectory
- **2026-11-06** The local-host route is built behind the attach contract: private config, a brief identical to its preview, never run twice, a scrubbed environment. A silent host stays "claimed".
