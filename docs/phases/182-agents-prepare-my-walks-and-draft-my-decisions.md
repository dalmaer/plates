---
status: partial
since: 2026-11-06
goal: G7
spec: 2
depends: [181, 98, 97]
note: "Decision drafts are built for the CLI: an agent records a recommendation with evidence, withdrawn when the phase file moves; nothing answers. Still to build: walk-prep, shape, and a store the web can read drafts from."
evidence: ["evidence/2026-11-06-decision-drafts.md"]
---

# Agents prepare my walks and draft my decisions

## Done when

Walk prep leaves a checked environment, the tested revision and screenshots on a walk's card before the owner opens it; a decision draft adds an attributed, evidence-linked recommendation; neither records an answer. See [the backlog spec](../specs/web-backlog.md).

## Scope

- Assists `walk-prep`, `decision-draft` and `shape`, through the attach contract and existing digest-bound paths (walk drafts, decision previews, shaping drafts).
- A recommendation is withdrawn when its source revision moves.
- Screenshots use the existing private capture storage and receipts.

## Integration increments

1. `decision-draft`, local only.
2. `shape` through the shaping practice.
3. `walk-prep`, once private capture storage is active.

## Acceptance

- [x] An assist never writes an answer, acceptance or lived-in: `tests/backlog-assist.test.mjs: "assists never decide"`
- [x] A recommendation links its evidence and is withdrawn when its source revision moves: `tests/backlog-assist.test.mjs: "a stale recommendation is withdrawn"`
- [ ] A walk prep's revision must equal the tested revision, or it says so: `tests/backlog-assist.test.mjs: "prep names the revision it checked"`
- [ ] ⚑ by hand: the owner.

## Your part

- **Ask:** Do three walks an agent prepared.
- **Why:** It settles whether preparation saves your time or adds noise.
- **Look at:** What the agent already checked, at the top of each walk.
- **Choices:** Prep saved time | No difference | Prep was wrong (say how)
- **Takes:** About 20 minutes.
- **Then:** Saved time: built. Otherwise prep changes here.
- **Ready when:** phase 181 is built and private capture storage is active.

## Real surfaces

- adopted project: three real walks on fleet plates, prepared by an attached agent.
- owner's machine: one walk-prep screenshot written to private capture storage and read back.

## Proof

Automated: `node --test tests/backlog-assist.test.mjs`; `npm run check`.
By hand: the owner's three walks.
⚑ Private capture storage activation is the owner's separate approval (see web-changes). Agent time spends from the route's existing allowance.

## Deliberately open

Walk prep may capture private screen content. It stays behind the private capture storage and its receipts until the owner approves activation.

## Next action

Define the "tested revision" walk-prep checks against (from evidence or `plates ready` records), then build walk-prep; then a hosted drafts store so the web shows agent recommendations.

## Trajectory
- **2026-11-06** Decision drafts are local-only: no digest-bound path holds an agent's recommendation, so drafts live under `.git/plates-assist` and the hosted backlog needs its own store. Walk-prep waits on a defined tested revision.
