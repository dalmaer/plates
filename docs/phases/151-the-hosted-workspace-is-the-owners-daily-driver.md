---
status: partial
owes: walk
since: 2026-10-31
goal: G7
spec: 2
depends: [101, 107]
note: "Plan and hosted proof SQL for 006–015 written and checked. Session 2026-10-31: production moved to an owner domain after a 9-day origin outage; database resumed; steps 1–4 proven (Node 24.22.2 and sign-in; first encrypted backup read back; migration 004 with its proof and race; Contents write approved). Next: step 5, the decision-writes gate."
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

- **Ask:** Set aside one session to switch on the web workspace with the conductor, signing in to Vercel, Supabase and GitHub when asked.
- **Why:** Almost everything is built; it only needs switching on before you can drive Plates from the browser and your phone.
- **Look at:** the activation plan the conductor writes first.
- **Choices:** Book the session | Not yet
- **Keeps it open:** Not yet
- **Takes:** About 1–2 hours for the session; then a week of normal use.
- **Then:** Book the session: the conductor runs the plan with you; from then on you work from the web and settle the G7 walks there.
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

- **Backup destination** (phase 94) is still the owner's decision; activation
  of anything that stores private data waits for it or records the risk.

## Next action

Step 5: the owner walks one decision preview with writes off, then the
conductor sets decisionWrites and redeploys. Separately, remove the runtime
exception branch through review; the owner installs the nightly backup
schedule.
