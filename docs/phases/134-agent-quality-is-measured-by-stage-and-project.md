---
status: partial
owes: walk
waits: owner
since: 2026-10-30
goal: G5
spec: 2
depends: [117]
review: wait
note: "Private metadata pipeline and baseline passed full validation; merge, installation and human-adjudicated ongoing observations remain separate."
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
- [x] Repository focused conventions and integrated checks pass: `npm run check`; `npm run typecheck`.
- [x] A real metadata baseline documents sources and gaps: `node bin/plates.mjs retro quality baseline --json`.
- [ ] ⚑ by hand: reviewed code is merged and installed, existing reporting observes real episodes, and human adjudication is reconciled before comparative recommendations.

## Real surfaces

- owner's machine: retain the real read-only retrospective baseline and private collection/report receipts.
- fleet over time: verify a subsequent weekly report and 7/30-day maturity before claiming continuous quality measurement.

## Proof

`npm run check:focused -- tests/agent-quality-records.test.mjs tests/agent-quality-report.test.mjs tests/agent-quality.test.mjs`

`npm run check`

`npm run typecheck`

`node bin/plates.mjs retro quality baseline --json`

## Deliberately open

Paid paired/crossover replay remains disabled pending an explicit currency budget. Historical metadata cannot recover unrecorded plans, patch checkpoints, exact models, acceptance or human effort. No causal ranking from observational history. Human evaluator assignment, reference mix and worthwhile effect thresholds remain explicit inputs; absent evidence yields unknown. Merge, installation and ongoing observation are separate from local implementation.

## Next action

Finish integrated checks and draft publication; configure the existing weekly routine, then reconcile real task episodes and human adjudications before comparing agents.
