---
status: planned
since: 2026-11-05
goal: G7
spec: 2
depends: [181]
note: "Specified in docs/specs/web-backlog.md. Runs only on the owner's machine; off unless the plate lists local-host."
evidence: []
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

- [ ] The brief carries Done when, Acceptance and current decisions, byte-identical to its preview: `tests/backlog-attach.test.mjs: "local host brief matches its preview"`
- [ ] Without `local-host` in the policy the route is not offered: `tests/backlog-attach.test.mjs: "local host needs the policy"`
- [ ] A host that reports no state shows claimed and active only, never running: `tests/backlog-attach.test.mjs: "a silent host is never running"`
- [ ] ⚑ by hand: the owner attaches a local agent host to one phase, and it lands through `plates ready` and `plates integrate`.

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

Write the host contract as a fixture command and compare the brief it receives byte for byte with its preview.
