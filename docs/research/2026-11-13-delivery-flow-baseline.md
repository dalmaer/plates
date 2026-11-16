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

## Refresh, 2026-11-16

Read-only, at main `a92f0458ab1c1bdf69c6be2f5042c45a698afd2d` after this week's speed work (#455, #457–#463,
#471). Same sources and readers as above. This refresh does not establish a speedup.

**Integration records.** `plates-integrations` was at `785f9953bbb6201db19a31858c245aca29d314eb` on 2026-11-16.
32 valid records, 0 skipped, from 2026-11-05T01:24:48.095Z to 2026-11-15T06:42:41.267Z. That is 9 records more
than on 13 November, all from 14–15 November. Outcomes: 19 landed, 3 partial, 3 nothing-ready, 6 blocked,
1 refused, 0 error. Through the summary added here:

| Window (2026-11-16 read) | Runs | Run p50 / p90 (ms) | Full gates | Gate p50 / p90 (ms) |
|---|---:|---:|---:|---:|
| 5–7 Nov (the 13 November sample) | 23 | 454552 / 938075 | 24 | 462641 / 607574 |
| 14–15 Nov (new) | 9 | 480633 / 1154255 | 10 | 471922 / 607713 |
| All | 32 | 469719 / 1003045 | 34 | 468271 / 607713 |

No record-check samples, so those figures are null, not zero. No unavailable, not-run or unknown-mode gates.
**Coverage limit:** the newest record (15 November 06:42Z) predates every speed change named above. The
integration records therefore say nothing yet about their effect. The 9-run window is too small to call a
change either way.

**Main CI, check job.** `gh run list --workflow check.yml --branch main --limit 60` on 2026-11-16 returned
34 successful, 21 cancelled and 5 failed runs. For the 22 newest successful runs (2026-11-15T20:01Z to
2026-11-16T20:20Z), `gh run view --json jobs` gave each check job's own start and finish. That is a better
measure than the 13 November created-to-updated proxy, and it separates runner queue time. The GitHub API
rate limit stopped the read at 22 runs; the 12 older ones were not read.

| Window | Runs | Check job p50 / p90 (s) | Queue p50 / max (s) |
|---|---:|---:|---:|
| Before `a05ae583` (#449, test speed) | 14 | 862 / 1058 | 3 / 32 |
| From `a05ae583` on | 8 | 845 / 1029 | 4 / 34 |

The check job's median moved by 17 s, within the spread of a single window (689–1063 s). This shows no
CI speedup, and runner queue time is not a constraint. The speed work mostly targeted the hosted web
service, `plates home`, the night and local test files. CI's check job measures none of the first three,
so no change there was expected. On a 14-core Mac, `npm test` measured 354 s on 2026-11-16, against
about 14 minutes for the CI check job on its runner.

**Not measured, still unknown (not zero):**
- review wait, human minutes, active coding time and compute cost;
- the hosted service in production (the web speedups were measured in-process, in the PRs that made them);
- any integration run after 15 November.

The next step is unchanged: join recent main changes to their integration, PR and check paths, measure
review wait, then pick one constraint.
