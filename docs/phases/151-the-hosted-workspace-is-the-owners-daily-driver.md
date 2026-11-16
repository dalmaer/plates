---
status: partial
owes: walk
since: 2026-10-31
goal: G7
spec: 2
depends: [101, 107]
note: "Plan and hosted proof SQL for 006–015 written and checked. Session 2026-10-31: production moved to an owner domain after a 9-day origin outage; database resumed; steps 1–5 proven (Node 24.22.2 and sign-in; first encrypted backup; migration 004 with proof and race; Contents write; decision writes on). 2026-11-16: repair 023 applied with its proof; a read-only check found 005–013 and 022 already installed but unrecorded. Next: inspect 005–013 and 022 against their proofs instead of applying them, with the owner."
evidence: ["evidence/2026-10-31-web-activation-plan.md"]
---

# The owner drives Plates from the hosted web workspace every day

## Done when

The features G7 has built and proven locally (decisions, guided walks,
recent changes, daily and learning, routines and history, durable workers,
fleet updates and lessons, mobile and desktop coverage) are switched on in
the owner's private hosted instance, each with its hosted proof, and the
owner has used the workspace instead of the terminal for a week of real
Plates work: deciding, walking, reading what changed and what ran.

## Scope

- One activation plan, in order, listing each G7 phase's remaining hosted
  step (migration, environment value, GitHub App permission, worker or
  schedule) with its rollback, read from phases 94–108's "Next action" and
  "Your part".
- Apply it in one owner-attended session: the owner signs in where a login
  is needed; the conductor runs each step, records its hosted proof, and
  stops at the first failure with its rollback.
- After activation, the owner's walks for 97–102, 104, 105, 107 and 108 are
  done from the workspace itself, on desktop and phone, and recorded with
  `plates walk done`.
- G9's owner-facing pieces appear here as they land: decisions due for a
  check (150), approvals by door class (145), the project's risk level (144).
- Not in scope: a native app (phase 152), new features beyond what G7 and G9
  already specify.

## Acceptance

- [x] The activation plan lists every remaining hosted step with its rollback, and a step whose prerequisite phase is not built is refused: `tests/web-activation-plan.test.mjs: "the activation plan is complete and ordered"`.
- [ ] Every activated feature has a hosted proof recorded (request, response status, the migration's applied version), and none relies on local proof alone: ⚑ by hand: the conductor, with the owner signed in.
- [ ] A week of real use from the workspace, and the walks it settles recorded from it: ⚑ by hand: the owner.

## Your part

- **Ask:** Inspect the installed private drafts store (migration 005) and run its hosted proof? I check it in your signed-in Supabase tab while you watch.
- **Why:** The 2026-11-16 inventory found 005–013 and 022 installed but unrecorded; their applied file identities and hosted proofs still need checking, starting with private drafts.
- **Look at:** The inventory and private-drafts proof in the [activation guide](../guide/web-activation.md).
- **Choices:** Go | Not this week
- **Recommend:** Go
- **Keeps it open:** Not this week
- **Takes:** About 15 minutes, with Supabase open in Chrome.
- **Then:** Go: the conductor inspects 005, runs its proof, records the result, and asks about the next step the same way. Not this week: it waits.
- **Ready:** yes

## Real surfaces

- owner's machine: the hosted private workspace in a desktop browser and on the owner's phone.
- GitHub API: decisions and walks from the workspace changing the reviewed source.

## Proof

Automated: `node --test tests/web-activation-plan.test.mjs`; `npm run check`.
By hand: the activation session's hosted proofs; a week of use.
⚑ Migrations change the hosted database; the hosted runtime exception of
2026-10-22 must be re-checked (Node 24.22.1 or later) before activation.

## Deliberately open

- **Backup operation** (phase 94): the destination and first encrypted read-back
  were recorded on 2026-10-31. The nightly schedule and second decryption-key copy
  remain the owner's actions; inspect backup freshness before new migrations.

## Next action

Inspect installed 005–013 and 022 against their applied file identities and
hosted proofs with the owner, starting with 005's draft revision race; do not
reapply them. The 2026-11-16 inventory and repair 023 proof are recorded in the
[activation guide](../guide/web-activation.md). Continue its remaining gates and
owner walks only after those checks. The owner installs the nightly backup
schedule and stores the second decryption-key copy.

## Trajectory
- **2026-11-06** "Book a session" became one step at a time: each activation step is its own short question.
