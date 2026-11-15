---
status: partial
since: 2026-11-14
goal: G7
spec: 2
depends: [178]
note: "The attach contract and the CLI session route are built: plates home --attach previews, claims create-only, journals and hands over the /spin brief. Hosted read-only preview is implemented; internal identity-bound claim transport is implemented. A dormant scoped publisher, three-stage journal and acknowledged internal flow are implemented; authenticated exact preview preparation and read-only original receipt inspection are implemented; hosted apply/dispatch, migration/provider proof, tonight and robot remain."
evidence: ["evidence/2026-11-06-attach.md", "evidence/2026-11-14-hosted-attach-preview.md", "evidence/2026-11-14-hosted-claim-transport.md", "evidence/2026-11-14-hosted-claim-commit.md", "evidence/2026-11-14-hosted-attach-journal.md", "evidence/2026-11-14-hosted-attach-flow.md", "evidence/2026-11-14-hosted-attach-auth.md"]
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
2. Attach `session` from the CLI, then the web. Start with a read-only exact preview; keep apply unavailable until the existing write gate, durable claim and operation recovery are connected.
3. Attach `tonight`.
4. Attach `robot` through `plates issue new --agent`.

## Acceptance

- [x] Of two attaches to one phase, one claim wins and the other shows the holder and dispatches nothing: `tests/backlog-attach.test.mjs: "a lost race never dispatches"`
- [x] An uncertain dispatch is recovered from its journal, never repeated: `tests/backlog-attach.test.mjs: "dispatch recovers, never repeats"`
- [x] Without a policy only `session` is offered: `tests/backlog-attach.test.mjs: "absent policy is session only"`
- [x] Presence says claimed unless an execution source says running: `tests/work-items.test.mjs: "a claim is not a running agent"`
- [x] Hosted session preview binds the current source and refuses incomplete ownership coverage without claiming or dispatching: `tests/web-attach-preview.test.mjs`. Source verification only; the hosted owner walk remains outstanding.
- [x] Dormant hosted ref transport preserves immutable repository identity, exact commit bytes and uncertain write recovery under bounded deadlines: `tests/web-attach-github.test.mjs`. Commit publication and hosted activation remain unavailable.
- [x] Dormant commit publisher freezes the intent, verifies parent and scoped-child metadata, publishes once and retains uncertain stage outcomes: `tests/web-attach-commit.test.mjs`. Synthetic proof only; provider enforcement and durable activation remain unverified.
- [x] The existing operation journal fences mint, commit and ref stages once, preserves encrypted intent/observations and legacy callers, and refuses duplicate grants: `tests/web-attach-operation-store.test.mjs` and migration 020 SQL proof. Local PGlite only; hosted application and concurrency remain unverified.
- [x] Dormant internal flow requires acknowledged journal grants before provider effects, recovers original observations without redispatch, and distinguishes prewrite refusal from postwrite uncertainty: `tests/web-attach-operations.test.mjs` plus migration 021 proof. Local synthetic provider evidence only; hosted authorization and activation remain unavailable.
- [x] Authenticated preparation persists the exact private preview with current source and access checks; original receipt inspection survives preview expiry without granting recovery or execution: `tests/web-attach-controller.test.mjs`. HTTP/PGlite source proof only; hosted owner proof remains.
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

Automated: `node --test tests/backlog-attach.test.mjs tests/work-items.test.mjs tests/web-attach-preview.test.mjs tests/web-attach-github.test.mjs tests/web-attach-commit.test.mjs tests/web-attach-operation-store.test.mjs tests/web-attach-operations.test.mjs tests/web-attach-controller.test.mjs tests/web-hosted-proofs.test.mjs`; `npm run check`.
By hand: the owner's attach and the night that follows.
⚑ Tonight spends from the existing night allowance; robot only within `robot.budgetMinutes`. No new spend.

## Deliberately open

- **`tonight` needs a night pass that builds a phase.** No night pass builds from a plan item today (`validatePlan` wants a measured number and refuses lane `night`). Choices: a triage-only item; the robot route queued for tonight (increment 4); or a new night pass running `/spin <n>`, which is new spend and the owner's call. Until settled, `tonight` is refused as not built.

Whether High autonomy may attach without a confirm on listed routes. Settled after a week of Medium.

## Next action

Verify authenticated preview preparation and original receipt inspection on the hosted deployment. Then connect the acknowledged internal flow to exact reviewed apply under current authorization and original-operation recovery/history. Keep migrations 020 and 021 unapplied until the owner-attended proof; do not activate the route from local evidence alone. Preserve fresh source, claim and PR coverage checks; never resume a write merely because its ref is missing. Prove reconnect and no duplicate effects. Keep actual execution unavailable until its bounded provider-start recovery and required activation are verified. Robot and the owner's decision on `tonight` remain separate.

## Trajectory
- **2026-11-06** The attach contract and the CLI session route landed. `tonight` is blocked: no night pass builds a phase from a plan item. Web Start stays off and names the CLI command.
- **2026-11-14** — The owner (dalmaer) released the stale claim claims/phase-181 (claude on Dions-MacBook-Pro-M3, no push for 8 days) from plates home: Owner requested this session take over on 2026-11-14; prior branch is merged, visible Plates desktop sessions are idle, and Rex Claude pane is a shell. Preserve prior evidence and transfer only phase 181 implementation; no new permissions or spend.

- **2026-11-14** — Hosted attach starts with a read-only exact preview, reusing the CLI contract and bounded project reads. Review showed that claim branches alone cannot establish availability without PR coverage. Apply and real execution remain separate work, not implied by a brief.

- **2026-11-14** — Name-addressed commit publication cannot be protected by before/after identity checks alone. The internal ref transport uses immutable repository nodes; commit publication stays unavailable pending a separately verified identity-bound mechanism. Independent deadlines also bound non-cooperative fetch and body cleanup.

- **2026-11-14** — Installation permission metadata is not child-token scope. The dormant commit publisher validates them separately and conservatively refuses uncertain listing or expiry evidence. Real provider enforcement remains a required authorized check before activation.

- **2026-11-14** — The existing journal had one exclusive dispatch transition; encrypted metadata alone could not fence separate effects. Migration 020 adds three fixed stage transitions in the same row, retaining each observation and existing project reservation. Source proof is distinct from hosted application.

- **2026-11-14** — Pre-write foreign ownership can settle only while its journal stage proves no ref write began. The decline and begin compete in the existing row; post-write foreign ownership remains uncertain. Reconnect observes original effects and never regrants them.

- **2026-11-14** — Preparation establishes its scoped recovery identity before the store write. Receipt inspection remains authorized independently of preview expiry and write enablement; it never turns an old journal observation into current ownership or running-agent evidence.
