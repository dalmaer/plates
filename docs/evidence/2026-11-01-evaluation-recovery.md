# Phase 119: admission recovery and visible uncertainty

1 November 2026. Source baseline: `70c3097b7e5e5249c747b9a881d0d3ddcab69c4f`.
This is offline controller and regression work, not measured agent efficacy.
Phase 119 remains partial: live provider execution, enforced currency allowance
and the owner-approved real paired comparison are still outstanding.

## Change and boundary

A controller could retain an intent, lose host capacity before reservation,
and leave an uncertain slot with no lease. Recovery skipped slots without leases
while resume refused uncertainty. The fix retains a proven pre-insertion refusal
as its own bound immutable receipt. It consumes the original planned slot under
the existing zero-replacement policy; it neither retries that slot nor frees
another operation's capacity. Unknown coordinator failures and missing or
contradictory receipts remain uncertain.

Comparison JSON and Markdown retain evidence gaps, original operation identities,
known cancellation/settlement state and an explicit recovery action. Diagnostics
never grant authority. Missing measurements remain unknown and a refused slot
cannot establish acceptance or improve a comparable cohort.

## Validation

- `node bin/plates.mjs prove tests/evaluation-comparison-report.test.mjs --fix lib/evaluation-comparison-report.mjs --base origin/main --trailer`
  verified the reporting regression: red without the change and green with it.
- The initial focused conventions run found the expected changed parser-source
  inventory hashes in execution, budget and report modules. Those source bindings
  must be refreshed on the reviewed final tree; the failure is retained rather
  than described as a clean initial run.
- Independent integrated focused run:
  `node --import ./tests/helpers/hermetic.mjs --test tests/evaluation-comparison.test.mjs tests/evaluation-comparison-report.test.mjs tests/evaluation-credentials.test.mjs`
  passed 77 tests, with one opt-in Docker test skipped. Synthetic credential
  canaries exercise the Docker client environment and builder arguments; this
  does not claim an actual container walk.
- Required integrated checkpoint: `npm run check` and `npm run typecheck`.
  Focused observations above are not a full-gate pass; the PR retains the
  final checkpoint and exact-head review before merge.

## Recovery and limitations

No provider call, paid trial, fleet dispatch or production activation was made.
The original experiment, claim and uncertain receipts remain authoritative.
Rollback is a reviewed revert to the baseline behavior; it cannot erase newly
retained refusal receipts. Older readers reject those unfamiliar receipts,
so retain the updated reader when inspecting experiments that contain them.
The existing provider/spend implementation gap is not an owner-approval-only
blocker and is not marked `owes: walk`.

## First integrated checkpoint retained

`npm run check` on the original worktree installation reported 3894 passed,
five failed and five skipped in 269418 ms. Three failures were test-module loads
for absent `@electric-sql/pglite`; `npm ci --ignore-scripts` restored the current
locked development dependencies. The other two failures were a synthetic Git
commit exit 128 in the climb guard and a Git timeout in selftest fixture setup.
They are tracked as [Plates #307](https://github.com/dalmaer/plates/issues/307).
One isolated diagnostic of each passed; that does not erase the original failure
or establish its cause. Logs: `/tmp/phase119-full-check.log`,
`/tmp/phase119-climb-diagnostic.log`, `/tmp/phase119-selftest-diagnostic.log`.

Admission proof command:
`node bin/plates.mjs prove tests/evaluation-comparison.test.mjs --name 'proven capacity refusal' --fix lib/evaluation-execution.mjs --base origin/main --trailer`
returned VERIFIED, failing without persistence of the refusal. An earlier proof
that also removed the new budget helper was inconclusive because import failed;
that result is not treated as behavioral proof.
