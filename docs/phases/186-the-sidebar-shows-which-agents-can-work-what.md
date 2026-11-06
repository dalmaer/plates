---
status: planned
since: 2026-11-05
goal: G7
spec: 2
depends: [178]
note: "Specified in docs/specs/web-backlog.md. Read-only; Pending review uses the GitHub App, no personal token."
evidence: []
---

# The sidebar shows which agents can work, what each is on, and what waits for review

## Done when

The sidebar's Agents lists each provider in `agents` and each route in `backlog`, with the item it holds now (from claims and presence) or idle, and off routes greyed with their reason. Pending review lists the fleet's open PRs that are not set to auto-merge. `plates home --agents --json` prints the same. See [the backlog spec](../specs/web-backlog.md).

## Scope

- `agentsOf(config, claims, presence)`: pure; an agent's line is the item it holds ("working on plates #273") and its presence word.
- Pending review reads `autoMergeRequest` on open PRs with the installation token the hosted workspace already holds. No personal access token. A plate the App cannot read shows "not read".
- Out of scope: starting or stopping an agent (181), and any write.

## Integration increments

1. `agentsOf` and the pending-review reader, with tests, unused by any view. Safe to merge.
2. `plates home --agents` and the sidebar's Agents and Pending review. Read-only; recovery is removing the entries.

## Acceptance

- [ ] An agent holding a claim shows that item; one without shows idle: `tests/backlog-agents.test.mjs: "an agent shows what it holds"`
- [ ] A PR set to auto-merge is not pending review: `tests/backlog-agents.test.mjs: "auto-merge is not waiting on you"`
- [ ] The CLI and the web show the same agents and pending reviews: `tests/home-isomorphism.test.mjs: "agents match in both forms"`
- [ ] ⚑ by hand: the owner, in the sidebar.

## Your part

- **Ask:** Open the sidebar and say whether Agents and Pending review match what you know is running and waiting.
- **Why:** It settles whether claims and presence are enough to say what an agent is doing.
- **Look at:** The Agents entries and the first Pending review row.
- **Choices:** Matches | Something missing (say what) | Something wrong (say what)
- **Takes:** About 3 minutes.
- **Then:** Matches: built. Otherwise the presence sources change here.
- **Ready when:** the sidebar's Agents is deployed.

## Real surfaces

- adopted project: the hosted workspace (Vercel, GitHub App, read-only) lists the fleet's agents and pending reviews.

## Proof

Automated: `node --test tests/backlog-agents.test.mjs tests/home-isomorphism.test.mjs`; `npm run check`.
By hand: the owner's look above.
⚑ None: no resource, spend or new login.

## Deliberately open

- An agent with no claim may still be working (a session that never claimed). It shows idle; presence only knows what is recorded.

## Next action

Write `agentsOf`'s first test from today's `plates next --json` claims and `.plates/plates.json` `agents`.
