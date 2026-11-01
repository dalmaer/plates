# Phase 155: a climb must be able to measure useful work

## Historical diagnosis

Read [run 41192473018](https://github.com/dalmaer/plates/actions/runs/41192473018)
with `gh run view --json headSha,jobs,url`, `gh run view --log` and
`gh run download`, without dispatch or retry. Source:
`bd02e47546b2c75dfca7717e5d40bcf3a4d32e53`.

- Baseline: 2026-10-31 10:22:25–11:16:15 UTC, 3,230 seconds, five `npm test`
  samples. Median 645,508.9 ms; spread 14,253.2 ms.
- Provider result: four turns, 9,109 ms, zero permission denials. The action
  wall receipt is 24 seconds including setup; these clocks are not equivalent.
- Night receipt: `tried: []`, no kept change, no PR, total through judge about
  3,274 seconds. The 54-minute headline described elapsed night time.
- Default comparison: two rounds × three samples × two sides = twelve
  executions. At the observed median this estimates 129.1 minutes, excluding
  editing and guard; the picked agent allowance was 45 minutes.
- The full provider explanation is not retained in the downloaded artifacts.
  The budget mismatch is verified; why the agent personally stopped is unknown.

## Repair

The existing baseline probes once, estimates paired comparison wall cost and
reserves half the picked allowance for editing/full validation. It checks again
as samples arrive. Infeasible, failed and unknown observations retain blocked
admission evidence, no model is launched, and the existing plan/morning path
carries the reason and next action. Perf output units never become wall time.
The workflow bounds the baseline step by the selected allowance; local shell
termination does not establish descendant cleanup and the receipt says so.
This admission policy is a heuristic, not a completion guarantee.

The brief separates pre-agent baseline time from agent time. No candidate remains
distinct from measured no improvement; a stopped probe is not a failed optimization.
No budget, permission, model routing or acceptance threshold is increased.

Plates now measures `tests/improve.test.mjs` with the existing hermetic preload
and test-ledger reporter. That file had the largest summed test duration in one
retained full-suite ledger, which is not its standalone elapsed time. Local
isolated command `node --import ./tests/helpers/hermetic.mjs --test tests/improve.test.mjs`
passed 18/18 in 74.665 seconds. Different host/load: not a CI speedup claim.
The full base and candidate gates and dropped-test checks remain unchanged.

## Proof

Source base: `4f50993795c8a09ff9f16dd40736a438e2aa8f05`; Node v24.22.1.
The validation planner with canonical `/private/tmp/plates-climb-useful` root
reported ready and required broad validation. An initial `/tmp` alias was refused
as noncanonical; no execution permission or validation was inferred from it.

`node bin/plates.mjs prove tests/climb-admission.test.mjs --name 'slow first probe'
--fix practices/climb/files/scripts/plates/climb.mjs scripts/plates/climb.mjs
--base 4f50993795c8a09ff9f16dd40736a438e2aa8f05 --trailer --json`:
VERIFIED, red without the fix and green with it. Without admission, the real
fixture command ran five times instead of one. This uses separate scratch
copies; no mutation was made to the developer checkout.

`node --test --import ./tests/helpers/hermetic.mjs tests/fleet.test.mjs`:
27/27 passed. The fresh expanded read returned ten projects; see
[operating visibility](../research/2026-11-01-operating-visibility.md).

Integrated validation outcomes are recorded below. No live paid climb, workflow dispatch, hosted activation or consumer
installation is claimed by this repair.

## Limits and follow-through

Observe the next scheduled run after reviewed installation: admission, actual
baseline/agent durations, measured attempts and any candidate PR. A locally proven
repair does not prove a useful optimization or owner acceptance. The operating
audit leaves real hosted walks and provider activation open rather than claiming
that local code is already serving production.

## Preflight corrections

The first integrated focused preflight found five failures: three capability
source fingerprints needed review after the changed scripts; phase 155 used an
unsupported real-surface label; and the workflow's negative-control mutation
removed the newly added baseline timeout instead of the agent timeout. Corrected
the records and scoped the mutation to the agent step; the guard was not weakened.
The capability audit now binds the three reviewed changed source modules. Its
13 tests passed. The focused timeout/admission negative controls passed 3/3.

The admission tests also passed 9 plain and 9 injected-stall runs, seed
1921950559, with no discrepancy. The file is included in this project's existing
stalls list. These results do not erase the initial preflight failures.

Independent review then found that an outer Actions timeout could precede the
measurement process's terminal write. The repair now writes initial pending
receipts before measurement, leaves cleanup headroom inside the step deadline,
and always finalizes admission from bounded, source/run-attempt-bound retained
records. Partial stdout is not completion evidence. An interrupted baseline is
blocked with unknown measurements; prior-night success cannot be reused.
The interruption/handoff negative controls passed 6/6 in the focused review run.
The second preflight preserved one failing sibling timeout mutation in tend;
that shared test helper was corrected for the actual provider step identities.

The first full gate completed with 3,909 passing, four failing and five skipped
of 3,918 tests. The four failures were obsolete workflow-contract expectations:
the provider selection condition, two Brief fixtures lacking admission input,
and the off/no-secret test expecting the old judge condition. Test fixtures now
supply the real prerequisite; assertions require both a picked job and verified
execution. Agent policy, off/no-secret and publication guards were preserved.
Targeted sibling tests passed 4/4; the off test passed plainly and under injected
stalls. The failed full gate remains retained, not relabeled as passing. Its
hygiene block reported no flaky or slower tests.

## Final local checkpoint

On 2026-11-01, `npm run check` completed with exit 0 on the working tree
committed as `d6a135b2`: 3,913 passed, five skipped, zero failed (3,918 total).
The outer ledger receipt records status 0 and 358,915 ms. Injected-stall checks
passed, seed 1686212897; hygiene reported no flaky or slower tests. Roadmap,
render (100 targets) and inbox guards passed. `npm run typecheck` exited 0.
The preceding failed gate remains historical evidence.

This follow-up changes source records only and uses `plates-source-records-v1`
against `d6a135b2`; it does not claim another full gate or live scheduled proof.
