---
status: partial
owes: walk
waits: owner
since: 2026-10-30
goal: G5
spec: 2
depends: [117]
review: wait
note: "Local hooks, adjudication and weekly collection are complete and validated; the build and validation steps below are satisfied. Draft publication and separate local-only scheduling await approval; broader installation and human calibration remain."
evidence: ["evidence/2026-10-30-agent-quality.md"]
---

# Agent quality is measured by stage and project

## Done when

Private task observations produce reproducible stage and project scorecards, retain failures and unknowns, and support weekly passive reports without model spend or automatic routing.

## Scope

Implement the [agent quality contract](../specs/agent-quality.md), derived from the approved Agent Quality Evaluation Plan (Library libfile_2dc7772d11a0819188b918dd19269058 version 0), through the existing schema-2 evaluation workspace and weekly reporting seam. Separate observed associations from paired experiments. Reuse frozen slot identity and ledger safeguards; no new scheduler, inference adapter or credential grant.

## Acceptance

- [x] Bounded metadata ingestion is private, idempotent, source-bound and rejects invalid joins: `tests/agent-quality-records.test.mjs`.
- [x] Stage, project, fixed-mix and workload views retain failures, sparse strata, unknown charges and immature follow-up: `tests/agent-quality-report.test.mjs`.
- [x] CLI baseline, collection and weekly report integration preserve existing evaluations and require no model run: `tests/agent-quality.test.mjs`.
- [x] Repository focused conventions and integrated checks pass on the completed lifecycle integration: `npm run check`; `npm run typecheck`.
- [x] A real metadata baseline documents sources and gaps: `node bin/plates.mjs retro quality baseline --json`.
- [x] Local execution and review adapters preserve real stage boundaries and exact checkpoint identities, including failures and explicit unknown provenance: `node --test tests/agent-quality-execution.test.mjs`.
- [x] Pending annotations and adjudication keep human judgments separate from model declarations and never backdate difficulty: `node --test tests/agent-quality-lifecycle.test.mjs tests/agent-quality-report.test.mjs`.
- [x] Weekly exact-approved collection ingests local observations and retains an immutable private report without scheduling or model spend: `node --test tests/agent-quality.test.mjs`.
- [ ] ⚑ by hand: reviewed code is merged and installed, existing reporting observes real episodes, and human adjudication is reconciled before comparative recommendations.

## Real surfaces

- owner's machine: retain the real read-only retrospective baseline and private collection/report receipts.
- fleet over time: verify a subsequent weekly report and 7/30-day maturity before claiming continuous quality measurement.

## Proof

`npm run check:focused -- tests/agent-quality-records.test.mjs tests/agent-quality-lifecycle.test.mjs tests/agent-quality-report.test.mjs tests/agent-quality.test.mjs tests/agent-quality-execution.test.mjs tests/review.test.mjs`

`npm run check`

`npm run typecheck`

`node bin/plates.mjs retro quality baseline --json`

## Deliberately open

Paid paired/crossover replay remains disabled pending an explicit currency budget. Historical metadata cannot recover unrecorded plans, patch checkpoints, exact models, acceptance or human effort. No causal ranking from observational history. Human evaluator assignment, reference mix and worthwhile effect thresholds remain explicit inputs; absent evidence yields unknown. Merge, installation and ongoing observation are separate from local implementation.

## Next action

Complete local lifecycle adapters, adjudication and collecting weekly reports; verify an ordinary task capture and independent review before the integrated gate. Draft publication and a separate local-only weekly schedule await owner approval; the existing Loop routine stays unchanged.
