# Agent quality observations

Phase 134 implements local lifecycle capture, adjudication and reporting for the owner-approved
Agent Quality Evaluation Plan, Library `libfile_2dc7772d11a0819188b918dd19269058`,
version 0 (30 October 2026). The existing schema-2 harness comparison remains
the authority for frozen experiments, slots, attempts and original-operation
recovery. The observation pipeline never dispatches a benchmark model, accepts
a phase or changes agent routing. Its opt-in ordinary command adapter runs only
the exact locally reviewed command; capturing work does not authorize new spending.

## Unit and provenance

An episode is one stated outcome, starting snapshot and acceptance contract,
including all attempts until its stop condition. Commits and PRs are candidates
for reconciliation, not independent tasks. Keep many-to-many task/PR mappings.
Unrecorded abandoned work remains a coverage gap. Never infer an agent from a
commit author, branch prefix or writing style.

A prospective passport precedes assignment: project, family, specialty,
difficulty vector, risk, base commit and acceptance/context hashes. Difficulty
dimensions are ambiguity, domain novelty, coupling, environment setup and
verification burden, each 0–2. Label them without looking at the outcome.
Retrospective labels can describe historical work but cannot establish matched
comparability. Final code size, elapsed time and attempt count are outcomes,
never difficulty proxies.

Keep plan, initial patch, review and revised patch checkpoints. Reviews bind to
the patch actually reviewed, and revisions bind to their prior checkpoint.
Exact model, harness, context and settings identify cohorts; missing identity
is unknown. A content digest provides integrity and a reference, not proof of
provider authenticity or correctness. Human/model attribution is a declaration;
model-only judgments cannot establish product acceptance.

## Rubric version 1

Score each stage independently, using evidence references. Record disagreement
as additional adjudication; never overwrite the original judgment. Start with
two human evaluators on ten episodes, then audit a selected sample. This human
calibration has not happened merely because a report renders successfully.

| Stage | Evidence to evaluate |
| --- | --- |
| Planning | Acceptance coverage, feasible scope, useful uncertainty and verification design; unnecessary questions and speculative scope count against the plan. |
| Coding | Initial acceptance defects, maintenance burden and appropriate specialty checks; frontend requires interaction/visual evidence, backend requires contract and data-integrity evidence. |
| Review | Distinct consequential findings, misses established by independent audit, false alarms, harmful remedies and optional work incorrectly presented as blocking. |
| Iteration | Consequential defects resolved, regressions introduced, repeated mistakes, human rescue and verified completion. |

Quality anchors are 0 unsafe/incomplete, 1 materially deficient, 2 mostly
adequate, 3 meets the contract with strong supporting evidence. Keep the
underlying findings and acceptance beside each score. A test count, comment
count, merge or model statement of completion is not acceptance evidence.

Proportionality uses separate 0–3 anchors: 0 ignores a necessary control or
credible serious risk; 1 substantial unsupported complexity or unresolved
material needs; 2 adequate with limited avoidable complexity; 3 simplest
adequate design with justified safeguards and deferred unsupported scope.
Its evidence names the requirement/threat, likelihood or exposure, impact,
simpler alternative, maintenance cost and test burden. Security boundaries,
authorization, privacy, data loss and irreversible actions remain requirements
even when rare. Rejecting harmful review advice can be the correct outcome.

## Reports and follow-up

Show project, specialty, family, difficulty, risk and configuration cohorts;
retain assigned failures, timeouts, blocked, skipped, denied, unknown and
aborted attempts. Separate workload-weighted summaries from a prespecified
fixed reference mix. Missing strata do not have zero effect and their weights
are never redistributed. Show independent tasks, attempts, coverage and
unresolved uncertainty. Observational associations do not establish causality.

Total cost includes unsuccessful attempts and every stage. Missing charge,
token price or human time stays null. Label estimates and known subtotals;
never compute a complete cost per success from incomplete costs. Follow up
at 7 and 30 days after meaningful use, with exposure and observation evidence.
Not used, immature, unobserved and observed without regression are different
states.

Weekly local reports retain dated observations and compare explicit prior
reports. Critical confirmed regressions merit immediate human investigation;
ordinary drift is a watch signal until effect thresholds and repeated-check
controls are approved. No universal score or automatic route is produced.

## Privacy, retention and operation

Use the existing initialized private workspace and shared session ledger lock.
Store bounded structured facts and evidence hashes/pointers, never raw
transcripts or arbitrary application content. Source IDs support idempotent
ingestion; revisions preserve original attempts and judgments. Exact preview
digests authorize collection. Retention limits bound storage and exclude expired
observations; deletion remains an audited manual operation, not silent cleanup.
Read or write failure is a gap or refusal, never an empty successful sample.

Weekly preview/application ingests selected local observations and retains the
resulting private report through the existing ledger. It does not schedule itself
or change an existing routine. Any separate local-only schedule awaits approval.
This local setup does not create hosted UI, new persistent access grants,
authenticated provider telemetry or public sharing.

## Replay remains disabled

The proposal names Claude → Codex → Claude and the reverse, identical frozen
snapshots/budgets and balanced AB/BA order. A focused 2×2 reviewer crossover
uses identical initial patches, a fixed reviser and equal-budget self-revision
control. The existing offline executor remains offline. Actual replay waits
for a separately reviewed live adapter, exact configurations, a total currency
ceiling and task caps, human adjudicators, a frozen reference mix and prespecified
worthwhile-effect/non-inferiority thresholds. Pilot sample sizes are operating
proposals, not statistical guarantees. Sparse evidence remains unknown or
exploratory; no supported routing recommendation is implied.
