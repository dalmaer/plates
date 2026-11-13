# Delivery flow: Toyota principles applied to Plates

Dated 2026-11-13. This is a plan, not proof that the factory metaphor transfers
unchanged. Optimize useful verified outcomes and human attention, not agent
utilization, token throughput or number of branches.

## Sequence and ownership

1. **188: see the work.** Refresh baseline and expose timing/coverage. Main already
   retains integration outcomes in `plates-integrations`; do not rebuild the old
   November 4 missing-reasons gap. Start with a read-only summary improvement.
2. **189: pull ready work.** Define standard handoffs and downstream-aware admission
   before builder dispatch using the existing conductor/claims. Phase 159 owns
   integration admission/drain; this phase consumes that lane, not a second queue.
   Small buffers are allowed; no arbitrary
   cap and no second orchestrator. Phase 159 owns exact combined-candidate proof.
3. **190: stop defects locally.** Scope abnormality, owner, original receipt and
   recovery condition. Continue independent work. Never retry an uncertain write.
4. **191: learn from one experiment.** Compare results and countermetrics, retain
   the human decision and remove rules that fail to help. Reuse phase 134 evidence,
   phase 162 morning decisions and the lessons catalogue.

188 supplies evidence to the remaining phases; 189 and 190 need not block one
another. 191 can record a measurement-only pilot before either enforcement ships.
Existing incomplete phases remain incomplete; dependencies do not accept their walks.

## Why these principles

Toyota's just-in-time means producing what downstream needs when needed, not
zero inventory. Jidoka makes abnormal work visible and stops propagation, not
the whole organization. Standard work makes input, output and handoff checkable;
it should not standardize every reasoning step. Kaizen needs observation and
comparison rather than ritual. Respect for people means surfacing consequential
choices, not flooding the owner with every agent uncertainty.

Primary background: [Toyota Production System](https://global.toyota/en/company/vision-and-philosophy/production-system/).
The analogy is limited: exploratory software has uncertain outcomes and variable
work content. Discovery may finish by disproving an idea. Parallelism is useful
when downstream proof and review capacity can absorb it.

## First slice and measurement contract

Extend `integrationSummary` additively. Retain legacy output and raw records.
Report sample counts and missing coverage beside run and executed-gate durations;
unknown, invalid or absent durations are not zero. Exclude not-run gates from
executed-gate latency. Percentiles describe retained samples only, not all history;
the 500-record retention bound and skipped malformed lines must remain visible.
Gate elapsed sums are not end-to-end latency or CPU time. Do not set admission
budgets from this instrument alone: refresh queue/CI and human bottleneck evidence.

Recovery is reverting the read-only projection; no runtime state migration,
activation, credentials, external write or publication-policy change is involved.
