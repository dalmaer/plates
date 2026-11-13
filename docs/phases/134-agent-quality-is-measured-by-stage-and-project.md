---
status: partial
since: 2026-10-30
goal: G5
spec: 2
depends: [117]
review: wait
note: "Passive foundation retained in PR #323 and refreshed against current main; merge and current-candidate integration remain pending. Local execution, human calibration, installation and scheduling remain separate."
evidence: ["evidence/2026-10-30-agent-quality.md", "evidence/2026-11-12-agent-quality-refresh.md"]
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
- [ ] Repository focused conventions and integrated checks pass on the completed lifecycle integration: `npm run check`; `npm run typecheck`.
- [x] A real metadata baseline documents sources and gaps: `node bin/plates.mjs retro quality baseline --json`.
- [ ] Local execution activation remains deferred; retained prototype and private review adapter fixtures preserve real stage boundaries and exact checkpoint identities, including failures and explicit unknown provenance: `node --test tests/agent-quality-execution.test.mjs`.
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

Complete PR #323 current-head CI and required review before merging the passive
increment. Historical full-gate evidence does not validate the refreshed candidate.
Then walk explicit lifecycle and privately bound review observations with human
adjudication. Resolve an adopted execution boundary separately before exposing
any command runner. Installation and a local weekly schedule need their own scope;
the existing Loop routine remains unchanged.

## 2 November 2026 integration boundary

Retain the original phase evidence as historical validation of its source. The
current increment preserves main's live writer, FIFO, recovery and corpus code;
only the shared scope/frozen-reader exports and `.quality` sibling are added to
its evaluation ledger. The CLI rejects `retro quality run`, and conduct guidance
only asks for actual observations. Phase acceptance remains partial. Optional
usage-record normalization from the later consolidation branch is deferred to
that compatible extension, with one quality ledger and no competing copy.

## 12 November 2026 refresh

PR #323 retains the passive increment on main `eb6e9859`, including Node 26,
provider fallback and the inert project-set registry. Derived roadmap and surface
records are regenerated; parser bindings retain main entries and update only
changed sources. Ordinary review reads load the observer only with an explicit
private binding, and review gates never capture observations. The strict
128-file names-observation limit and actual-load tracing are unchanged.

The existing phase claim remains on its original Codex owner's ref; this
owner-authorized PR handoff does not delete or manufacture a local claim token.
Keep the phase partial: merge, installation, enabled capture, human adjudication
and real weekly/7-day/30-day observations are separate facts.
