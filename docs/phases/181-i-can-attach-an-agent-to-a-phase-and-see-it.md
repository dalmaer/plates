---
status: partial
since: 2026-11-06
goal: G7
spec: 2
depends: [178]
note: "The attach contract and the CLI session route are built: plates home --attach previews, claims create-only, journals and hands over the /spin brief. Web attach, tonight and robot remain."
evidence: ["evidence/2026-11-06-attach.md"]
---

# I can attach an agent to a phase, and see it working

## Done when

Attach on an agent-ready phase previews, claims and starts the `session` or `tonight` route with a receipt; the card shows the agent's presence from its sources; a lost claim race says who won and dispatches nothing. See [the backlog spec](../specs/web-backlog.md).

## Scope

- The attach contract: preview with digest → create-only claim and read-back → journal → dispatch → receipt; release.
- Routes `session` (claim, then the `/spin <n>` brief for the owner to open) and `tonight` (an item in tonight's plan).
- The `agents` policy in `.plates/plates.json`; absent means session only. Autonomy levels govern confirmation.
- Presence: claimed, active (last push), running (only from an execution source), ready/integrating/blocked, stale.
- CLI `plates home --attach <key> --route <r> [--provider <p>] [--yes]` (the verb budget is full).
- Later increment: `robot`, with the rubric generated from the phase, only where `robot.on`.

## Integration increments

1. Presence in the read model, read-only.
2. Attach `session` from the CLI, then the web, behind the existing write gate.
3. Attach `tonight`.
4. Attach `robot` through `plates issue new --agent`.

## Acceptance

- [x] Of two attaches to one phase, one claim wins and the other shows the holder and dispatches nothing: `tests/backlog-attach.test.mjs: "a lost race never dispatches"`
- [x] An uncertain dispatch is recovered from its journal, never repeated: `tests/backlog-attach.test.mjs: "dispatch recovers, never repeats"`
- [x] Without a policy only `session` is offered: `tests/backlog-attach.test.mjs: "absent policy is session only"`
- [x] Presence says claimed unless an execution source says running: `tests/work-items.test.mjs: "a claim is not a running agent"`
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

- **`tonight` needs a night pass that builds a phase.** No night pass builds from a plan item today (`validatePlan` wants a measured number and refuses lane `night`). Choices: a triage-only item; the robot route queued for tonight (increment 4); or a new night pass running `/spin <n>`, which is new spend and the owner's call. Until settled, `tonight` is refused as not built.

Whether High autonomy may attach without a confirm on listed routes. Settled after a week of Medium.

## Next action

Increment 4: the robot route with a generated rubric (rubric keeps owner blockers), gated by `robot.on`. Then hosted attach (App Contents write on refs, a durable hosted journal) and the owner's decision on `tonight`.

## Trajectory
- **2026-11-06** The attach contract and the CLI session route landed. `tonight` is blocked: no night pass builds a phase from a plan item. Web Start stays off and names the CLI command.
