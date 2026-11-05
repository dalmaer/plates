---
status: planned
since: 2026-11-05
goal: G7
spec: 2
depends: [178]
note: "Specified in docs/specs/web-backlog.md. Routes session and tonight first; robot as a later increment gated by robot.on."
evidence: []
---

# I can attach an agent to a phase, and see it working

## Done when

Attach on an agent-ready phase previews, claims and starts the `session` or `tonight` route with a receipt; the card shows the agent's presence from its sources; a lost claim race says who won and dispatches nothing. See [the backlog spec](../specs/web-backlog.md).

## Scope

- The attach contract: preview with digest → create-only claim and read-back → journal → dispatch → receipt; release.
- Routes `session` (claim, then the `/spin <n>` brief for the owner to open) and `tonight` (an item in tonight's plan).
- The `agents` policy in `.plates/plates.json`; absent means session only. Autonomy levels govern confirmation.
- Presence: claimed, active (last push), running (only from an execution source), ready/integrating/blocked, stale.
- CLI `backlog attach <key> --route <r> [--provider <p>] [--yes]` (or the flag form the budget allows).
- Later increment: `robot`, with the rubric generated from the phase, only where `robot.on`.

## Integration increments

1. Presence in the read model, read-only.
2. Attach `session` from the CLI, then the web, behind the existing write gate.
3. Attach `tonight`.
4. Attach `robot` through `plates issue new --agent`.

## Acceptance

- [ ] Of two attaches to one phase, one claim wins and the other shows the holder and dispatches nothing: `tests/backlog-attach.test.mjs: "a lost race never dispatches"`
- [ ] An uncertain dispatch is recovered from its journal, never repeated: `tests/backlog-attach.test.mjs: "dispatch recovers, never repeats"`
- [ ] Without a policy only `session` is offered: `tests/backlog-attach.test.mjs: "absent policy is session only"`
- [ ] Presence says claimed unless an execution source says running: `tests/work-items.test.mjs: "a claim is not a running agent"`
- [ ] A generated robot rubric carries the phase's unresolved ⚑ as owner blockers: `tests/backlog-attach.test.mjs: "rubric keeps owner blockers"`
- [ ] ⚑ by hand: the owner.

## Your part

- **Ask:** From your phone, attach an agent to one phase that is ready, then watch its card move.
- **Why:** It settles whether you trust starting agent work from the backlog.
- **Look at:** The preview before you confirm: which phase, which agent, what it costs.
- **Choices:** It moved and I trusted it | It moved but was unclear (say what) | Didn't trust it
- **Takes:** About 10 minutes, plus the agent's time.
- **Then:** Trusted: built. Otherwise the preview or presence changes here.
- **Ready when:** phase 178 is deployed and decision writes are enabled.

## Real surfaces

- GitHub API: a real claim on a fleet repo through the GitHub App, its ref read back.
- workflow shell: one real night builds the attached phase, with its journal and PR.

## Proof

Automated: `node --test tests/backlog-attach.test.mjs tests/work-items.test.mjs`; `npm run check`.
By hand: the owner's attach and the night that follows.
⚑ Tonight spends from the existing night allowance; robot only within `robot.budgetMinutes`. No new spend.

## Deliberately open

Whether High autonomy may attach without a confirm on listed routes. Settled after a week of Medium.

## Next action

Add presence to the read model from `next.claimed[].holder` and claim-branch pushes.
