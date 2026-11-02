---
status: planned
since: 2026-11-02
goal: G6
spec: 2
depends: [159]
note: "Planned from the philosophy; implementation and operational proof are not claimed."
evidence: []
---

# One real rollout proves exposure and recovery

## Done when

One real component has separately evidenced merge, installation/deployment, enablement and verification facts, with a bounded ramp and demonstrated recovery.

## Scope

Pilot one small reversible behavior on one real deployable component. Inspect
Plates CLI/practice distribution and hosted web delivery separately; reconcile
Plates' missing delivery adoption and production-not-applicable declaration against
actual operating evidence. Reuse phases 80–82 (tested ref/promotion/verification),
88 (production errors), 104/108 (workers/fleet operations), 131 (installation) and
145 (door classification). Link their existing walks rather than duplicate or
silently complete them. Non-goals: a general flag platform, fleet-wide rollout,
unapproved live writes/spend, or forced HTTP production semantics for the CLI.

Read [the Plates philosophy](../philosophy.md); preserve existing phase ownership
and evidence. Dependencies name prerequisites, not automatic acceptance of their
outstanding real-surface walks.

## Integration increments

1. First safe merge: a component-specific delivery inventory and pilot contract,
   including authority, owner, baseline, cohort, compatibility and recovery.
2. Land additive contracts and dormant implementation with a safe default; prove
   both flag paths and startup/schema compatibility without activating production.
3. With the exact target/exposure authority, install/deploy the tested artifact and
   verify identity; enable an internal plate, then representative opted-in cohorts.
4. Demonstrate kill-switch/in-flight recovery, then ramp only on meaningful use.
   Remove the temporary flag and old compatible paths after the recorded condition.
   Each increment lands separately; an observation window does not hold a branch.

## Acceptance

- [ ] One real component has separately evidenced merge, installation/deployment, enablement and verification facts, with a bounded ramp and demonstrated recovery. Check: ⚑ by hand: owner-authorized pilot on the named real target with retained artifact/cohort/observation receipts.
- [ ] The delivery inventory identifies actual CLI install/release and hosted serving paths and proposes the smallest scoped config reconciliation without assuming existing activation Check: `git diff --check` plus read-only target/config inspection.
- [ ] Flag owner/default/scope/telemetry/kill switch/removal condition are explicit; disabled behavior preserves startup, schema, contracts and supported old/new versions Check: `npm run check` with pilot-specific enabled/disabled/compatibility tests.
- [ ] Plate/job assignment is stable through retries/resumes; shadow execution cannot mutate external state and enabling a flag cannot grant permission or budget Check: `npm run check` with denied-write, changed-config and retry negative cases.
- [ ] Rollout thresholds include meaningful-operation count, observation window, denominators and missing-telemetry stop rules; low traffic cannot count as success Check: `npm run check` with pilot-specific ramp-decision cases plus retained real observations.
- [ ] Kill-switch and in-flight recovery preserve original receipts; effects/migrations have a separate compatible compensation or forward repair plan Check: ⚑ by hand: scoped pilot disable/recovery exercise with read-back and documented effect boundaries.

## Your part

### Pilot exposure

- **Ask:** Approve or defer the exact pilot target and bounded initial exposure.
- **Why:** Real behavior and source identity must be observed before broader rollout.
- **Look at:** The delivery inventory, artifact, cohort and stop thresholds.
- **Choices:** Proceed within the prepared scope | Defer
- **Keeps it open:** Defer
- **Takes:** Determined by the prepared exercise or observation plan.
- **Then:** Proceed: run the named exercise or record the reviewed result. Defer: keep the walk open.
- **Ready when:** The pilot target, cost, local proof and recovery plan are concrete.

### Recovery exercise

- **Ask:** Run the specified pilot disable and in-flight recovery exercise.
- **Why:** A flag switch cannot undo external effects; recovery must be demonstrated.
- **Look at:** The original operation receipts and component-specific recovery steps.
- **Choices:** Proceed within the prepared scope | Defer
- **Keeps it open:** Defer
- **Takes:** Determined by the prepared exercise or observation plan.
- **Then:** Proceed: run the named exercise or record the reviewed result. Defer: keep the walk open.
- **Ready when:** The pilot is active under its approved scope and the exercise is prepared.

## Proof

At design time record the chosen component and exact test/check commands here;
run focused component tests, `npm run check` and `npm run typecheck` before live
exposure. Rehearse additive migration compatibility and rollback limits locally.
The real pilot requires existing deployment, cohort and effect authority; prepare
all independent work first. Retain serving/installed identity, flag snapshot,
meaningful operations, thresholds, health and original recovery receipts. A
synthetic success or deploy exit code cannot satisfy the real acceptance boxes.

## Real surfaces

- owner's machine: inspect and, only if selected/authorized, verify the pilot CLI installation by exact source/version.
- adopted project: observe the selected internal/test plate and representative opted-in use with retained version/cohort evidence.
- GitHub API: inspect the pilot's tested source and delivery records; correlate hosted serving identity if the hosted component is selected.

## Deliberately open

The pilot component, exact cohort, thresholds, observation window and any cost
are intentionally unchosen until the delivery inventory establishes a real safe
target. Choosing the target must narrow Real surfaces and Proof before building.
Web production may need scoped config activation; CLI compatibility may instead
need installed-version coverage. Neither is inferred from this plan. Existing
phase 80–82/88 operational gaps remain explicit until their own proof holds.

## Next action

Inspect actual CLI and hosted delivery evidence read-only, then specify one reversible pilot and its exact first safe merge.
