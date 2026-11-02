# The Plates philosophy

**Keep projects moving, and learn whether the movement helped.** Plates is the
source of shared working practices, the CLI that carries them to projects, and
the place their lessons come home. Each project is a plate. The workspace gives
the owner a clear view of those plates and the decisions that need them.

This is the canonical statement of direction and working principles. Read it
before planning or changing Plates. [Design](design.md) explains the mechanisms
and their history; [phase records](phases/README.md) own implementation status;
[task guides](../README.md#guides) describe available commands. A principle here
is a commitment to work toward, not evidence that a capability is installed.

## Shared practice, local ownership

Practices prevent named failure shapes. They are versioned, reviewed and tried
on Plates before being offered to other projects. Managed files, managed blocks
and project-owned seeded files have different update rules: preserve that
boundary and never overwrite a project's work to make it conform.

Goals describe useful outcomes. Phases make those outcomes checkable. Evidence
records what happened, including failed attempts and unavailable sources; status
lives in the record it describes, and roadmaps and dashboards are projections.
A merge does not accept a phase, and a passing fixture does not establish real use.

Lessons flow home with their provenance, are decided by a person, and return as
improved practice. Keep private incidents private; publish only the reviewed
reusable shape. Prefer a small rule that prevents a demonstrated failure to a
large process that asks everyone to remember more.

## Bounded autonomy and a small core

Agents should complete authorized, reversible work without repeated handoffs for
routine decisions. Preserve the owner's intent, constraints, original approvals,
budgets and operation receipts across sessions. Changes in scope, destination,
effects or risk require the corresponding authority; enthusiasm is not authority.
Unknown outcomes are inspected before retrying. Stop at real permission boundaries.

Plates owns judgment about practice, evidence, lessons and project health. Adopt
mature tools for execution, telemetry and host controls where they fit, behind
explicit contracts. Keep the runtime small and the source installable. Nightly
care does bounded useful work and reports what needs attention; it does not invent
new budgets or treat silence as health. The private web workspace and CLI are
ways to operate the same source-backed system, not competing sources of truth.

## Overnight autonomy leaves a reviewable morning

Overnight mode changes when ordinary choices are discussed, not what an agent is
allowed to do. Work inside the existing Night Watch plan: its goal, measured
outcome, budget, `willNotTouch`, settled decisions, build limit and `readyBy`.
Deterministic measurement remains separate from explicitly opted-in builder lanes.
Use the existing merge, review and publication rules; a night plan grants none.

For an ordinary ambiguity, prefer the smallest reversible choice within granted
scope, record the assumption, validate it and keep moving. If a choice needs
permission, would cross a boundary, or lacks a safe recovery path, park that choice
and its dependent actions with a precise reason. Continue independent authorized
work. A missing reply is not consent; do not disable approval/tool hooks, synthesize
an answer, expand a budget or turn an optional-question fallback into a policy bypass.

Keep a decision journal linked to the existing plan item and decision records.
Each consequential choice names the alternatives, selected option and rationale,
evidence and confidence/uncertainty, expected consequences, measured consequences
(or not yet measured), affected commit/flag/configuration, validation and actual
effects, and a feasible undo/compensation path or its limits. Evaluate interacting
choices together: individually reasonable rules can combine to make a feature
unusable or leave most runs idle. A prediction is not a measurement.

The morning separates issue-linked completed work from **calls worth revisiting**.
Distinguish chosen-but-not-executed, blocked, completed, failed and uncertain actions;
a blocked decision must never appear as a successful action. Rank consequential
choices by impact, uncertainty and cost of reversal rather than chronology. Offer
keep/adjust/revert follow-up with the exact source, observed consequences and next
safe increment. Recheck current state and existing authority before acting on a
correction; a morning preference cannot retroactively authorize last night's work.
Feed the observed result back into the original decision and next plan without
rewriting history or silently turning one choice into a permanent default.

This extends [Nightwatch's design](research/2026-10-14-nightwatch.md), plan/morning
phases 73–78 and the decision loop in phase 150. The structured journal, routing
and ranked review are [planned in phase 162](phases/162-overnight-decisions-remain-bounded-and-reviewable.md),
not a claim that the current night already implements them.

## Integrate immediately; expose deliberately

Main is the shared integration point and must remain releasable. Land the smallest
independently safe increment as soon as its required checks and reviews pass.
A phase is the outcome and proof contract; an increment is the unit of integration.
Do not hold completed work on a branch until the whole phase or rollout is done.

Before building, name the **first safe merge**: its useful contract, changed paths,
compatibility constraints, proof, recovery and what remains unavailable. A common
sequence is compatible scaffold/contracts, dormant implementation, internal
exposure, broader rollout and cleanup. Each step must stand on main by itself.
A documentation change can be one increment; avoid artificial slicing that leaves
main broken or makes a reviewer reconstruct safety across unmerged branches.

Use short branches based on current main. Target hours and same-day integration;
a branch surviving into the next working day prompts splitting, refreshing or
explicit replanning. This is an operating target, not permission to skip proof.
Keep one active build increment per builder. Finish review and integration of
ready work before opening more work; use isolated checkouts and explicit ownership
for concurrent builders. Phase claims retain ownership until completion or an
explicit handoff; landing the first increment does not release the whole phase.

Record partial progress and the next increment in the phase, with evidence for
what actually landed. Check only acceptance proven so far. A deployment or an
observation window can remain outstanding while subsequent compatible work lands.
Existing phase status vocabulary remains unchanged.

## Fast feedback, authoritative integration

Run focused behavior and repository convention checks early. Run the required
integrated gate against the exact combined candidate on current main before it
lands. Parallel changes passing alone do not prove their combination. Bind proof
to the base, candidate, tree, checks and relevant tooling/configuration; if those
inputs change, invalidate affected proof. Use existing validated reuse policies
only within their stated scope. Fast does not mean a weaker gate.

Use one integration lane and reuse its evidence rather than having every agent
repeat the expensive path. Batches should drain ready work, not wait indefinitely
for more work. Give queue admission and service a visible time budget, owner,
blocked reason and next action. Escalate an exceeded budget or stale lock; never
steal a live claim or bypass validation. Runtime enforcement of these bounds is
planned below, not claimed by this policy.

A broken main takes priority over unrelated integration. Restore it with a
verified small fix or an authorized, compatible revert; preserve the original
failure. Repeating a flaky check until green hides the problem. Resume normal
integration when the required health signals hold.

## Four facts, each with its own evidence

| Fact | What establishes it |
| --- | --- |
| Merged | The exact change is on the intended default branch, with its integration evidence. |
| Deployed or installed | The target actually serves or runs the identified artifact/version; an invocation succeeding is insufficient. |
| Enabled | The intended cohort receives the behavior under a recorded configuration and existing permissions. |
| Verified | Named checks and meaningful use support the outcome for that version, cohort and observation window. |

These are observations, not new phase statuses. Record them separately. A merged
feature may be disabled; a deployed artifact may fail verification; an installed
CLI may still owe operational observation. Promote only tested artifacts through
the project's supported delivery mechanism. Serial publication and recovery must
preserve exact source identity and never let an older deployment overwrite a newer
one accidentally.

## Flags control exposure, not correctness or permission

A temporary flag needs an owner, safe default, scope and stable cohort key,
telemetry, a tested kill switch, and a removal condition with a review date.
Specify behavior for missing or invalid configuration, stale clients and in-flight
work. Test both enabled and disabled paths and supported transitions.

Disabled code must still preserve startup, dependency loading, schema and API
contracts, resource use and existing behavior. A flag cannot hide a broken import
or destructive migration. Evolve contracts compatibly: add schema/fields first,
support old and new readers/writers during the transition, backfill with observable
bounds, switch use, and remove old paths only after compatibility evidence permits
it. Record where rollback becomes impossible and the forward recovery plan.

A flag never grants permissions, expands a budget or transfers an approval. For
agent work, pin cohort/configuration to the plate or job at a documented boundary
so retries and resumes cannot silently switch behavior. Shadow execution must not
mutate external state: use read-only evaluation, replay or isolated synthetic
outputs. Do not send real messages, spend money or write data merely to compare
implementations.

The kill switch stops new work at the documented boundary; define how in-flight
jobs drain or stop and how original receipts are recovered. It cannot unsend a
message, refund a charge, restore deleted data or reverse a migration. Effects
need idempotency, reconciliation and a separately authorized compensation or
forward repair where applicable. Keep receipt inspection available when execution
is disabled.

## Ramp on evidence, then remove the temporary machinery

Start with one internal/test plate, then representative opted-in plates, then
wider cohorts. Select a reversible, observable behavior for the first pilot.
Define the denominator, minimum meaningful operations, observation duration,
comparison baseline, success/stop thresholds and recovery owner before exposure.
Stable assignment keeps the comparison interpretable. Percentages and elapsed
time alone are weak evidence in a small set of plates; zero observed errors with no
traffic is not success. Missing telemetry holds the ramp.

Track user outcome, failures, latency, cost and effect correctness as appropriate.
A regression stops expansion and invokes the documented safe recovery within
existing authority. Retain each cohort/version/configuration and original
operation identity. After sufficient evidence, expand deliberately; after stable
full exposure and compatible version retirement, remove the flag and obsolete
paths in another checked increment. Long-lived permission controls are not
mistaken for temporary release flags.

## Measure speed and stability together

Measure time from the first change to integration, branch age, active work,
review wait, queue wait and CI duration. Pair them with deployment/installation
frequency, change failure rate, recovery time, escaped defects and useful outcomes.
Distinguish active work from waiting, source integration from exposure, and
measured cost from estimates. Report coverage gaps instead of zeroes. Use dated
baselines and distributions to find bottlenecks; do not reward commit counts or
speed at the expense of safety. Retire process that costs more than it helps.

## Current footing and the path forward

Repository inspection on **2026-11-02**, based on main `63a48c7d`, found:

- [Ready/integrate](../lib/integrate.mjs) already collects fast-checked changes,
  serializes integration, tests combined trees and isolates failing interactions.
  [Phase 83](phases/83-agent-sessions-hand-a-change-off-as-ready-and.md) still
  owes its real two-session walk. Extend it rather than build another integrator.
- [PR CI](../.github/workflows/check.yml) explicitly checks the PR head SHA.
  That evidence alone does not establish the current-base combined candidate.
  The future candidate-validation work must cover both PR and integrator paths.
- [Delivery](guide/delivery.md) already supports a tested ref, serial publication,
  serving-version verification and guarded promotion/rollback. Existing phases
  80–82 own those mechanisms and their outstanding walks. Plates' own
  [.plates/plates.json](../.plates/plates.json) does not adopt `delivery`, has no
  delivery block, and declares production disabled/not applicable. That is a
  configuration observation, not proof that the hosted web service does not exist.
- CLI/practice delivery means a reviewed release, installed source/managed bytes
  and compatible consumer updates. Hosted web delivery means an actual serving
  revision, runtime configuration, database compatibility and operating checks.
  Inspect both paths before choosing the pilot; do not apply an HTTP rollout
  recipe blindly to CLI installations or infer live web health from source tests.
- [Validation efficiency](specs/validation-efficiency.md), production evidence,
  scoped autonomy and hosted operation of the set of plates already have owners in the roadmap.
  Preserve their contracts and unfinished proof; no new phase silently accepts them.

The implementation sequence is intentionally incremental:

1. [157: make the philosophy working context](phases/157-philosophy-guides-small-safe-increments.md).
2. [158: expose integration delays and work in progress](phases/158-integration-delays-are-visible.md).
3. [159: bound integration and validate the current candidate](phases/159-current-candidates-land-through-a-bounded-lane.md).
4. [160: prove one real progressive rollout](phases/160-one-real-rollout-proves-exposure-and-recovery.md).
5. [161: generalize only what the pilot proves](phases/161-proven-rollout-practice-reaches-the-set-of-plates.md).

A parallel extension, [162: bounded overnight decisions](phases/162-overnight-decisions-remain-bounded-and-reviewable.md),
builds on the context increment and existing night/decision machinery.

These phases extend existing goals G0, G5, G6, G2 and G4. They do not authorize
runtime changes, publication, deployment, spending or installation across the set of plates merely
by appearing in the plan. This policy changes how authorized work is divided;
it does not enlarge the authority to perform it.
