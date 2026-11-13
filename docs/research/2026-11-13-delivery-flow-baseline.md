# Delivery flow refresh, 13 November 2026

Read-only observation on Plates at main `f4c58ea4d26cc63257584f42e09f0e88ad22beaa`.
This does not establish a speedup or justify an admission limit.

## Retained integration evidence

`gh api repos/dalmaer/plates/git/ref/heads/plates-integrations` returned
`a7c3bb2fbf721d83e1cc003b0ca8826d8de2c4a9`.
Read `integrations.jsonl` with
`gh api 'repos/dalmaer/plates/contents/integrations.jsonl?ref=plates-integrations'`;
decode the content and pass it to the existing `integrationRuns` and
`integrationSummary` readers. No raw session or machine identifiers are copied here.

23 valid records, 0 skipped malformed lines, covering 2026-11-05T01:24:48.095Z
through 2026-11-07T15:05:42.278Z. Outcomes: 12 landed, 3 partial, 3 nothing-ready,
4 blocked, 1 refused, 0 error. The historical no-reason gap is no longer a missing
feature: outcomes and blocking reasons are recorded. The branch is bounded to
500 records; these observations do not establish coverage of all integrations.

**Important coverage limit:** the latest retained integration record predates
recent main changes by nearly six days. Do not infer that no work happened, that
integration was broken, or that this older sample describes today's bottleneck.
PR merges and other paths need separate attribution.

## Current main CI sample (2026-11-13)

`gh run list --branch main --limit 30 --json databaseId,workflowName,createdAt,updatedAt,status,conclusion`
read on 2026-11-13. Four completed successful `check` runs appeared in this bounded
mixed-workflow result, plus three cancelled checks. Successful run IDs and
created-to-updated durations:

- 43340084516: 994 seconds (2026-11-13T00:49:12Z to 01:05:46Z).
- 43321462090: 733 seconds (2026-11-12T22:36:29Z to 22:48:42Z).
- 43314266971: 745 seconds (2026-11-12T21:50:59Z to 22:03:24Z).
- 43309543423: 779 seconds (2026-11-12T21:22:00Z to 21:34:59Z).

Nearest-rank p50: 745 seconds; p90: 994 seconds. These are API timestamp elapsed
proxies, not isolated runner or test execution time. Small sample, selected by
latest 30 mixed workflow records; cancelled runs are not successful latency
samples or failures. This is neither an unbiased full-history estimate nor an
end-to-end delivery measure.

## First experiment, not yet an optimization

Instrument the existing integration summary with mode-separated latency and
explicit coverage. Hypothesis: operators can identify stale/missing observations
and distinguish full gates from record-only checks before prescribing queue limits.
Fixture acceptance verifies correctness, not an operational improvement.

Next: join recent main changes to their actual integration/PR/check paths, measure
review wait and runner wait, then select one constraint. Do not enforce WIP or
queue limits from this sample. Compare matched windows and workload; retain
rework, escaped defects, compute cost and human attention as countermetrics.
Human minutes, compute cost, active coding, review wait and runner queue time are
currently unavailable in this observation. Unknown is not zero. No recurring
capture, enforcement, deployment or fleet rollout was enabled.

## Instrument readback (2026-11-13)

Re-read the same content at the pinned integration branch commit above and passed
it through the new summary. 23 observed run durations, none missing: nearest-rank
p50 454552 ms, p90 938075 ms. 24 full-gate samples, none missing: p50 462641 ms,
p90 607574 ms. No record-check samples: totals and percentiles are null, not zero.
No unavailable gate lists, not-run gates or unknown modes in this retained sample.
This verifies the instrument against actual stored records, not current operating
coverage; the stale-window caveat above still applies.
