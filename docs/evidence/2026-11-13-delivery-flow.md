# Delivery flow first increment, 2026-11-13

Base: `f4c58ea4d26cc63257584f42e09f0e88ad22beaa`.

- Added integration summary measurements for run, full-gate and record-check elapsed durations, with sample/missing counts and nearest-rank percentiles.
- Not-run gates are not zero-duration executed gates. Missing arrays and unknown modes retain explicit coverage gaps. Original records and legacy fields remain unchanged.
- Four synthetic tests exercise empty versus zero, invalid data, mode separation, percentiles, immutability and skipped-line coverage.
- `node --import ./tests/helpers/hermetic.mjs --test tests/integration-records.test.mjs tests/integrate-records.test.mjs`: 7 passed, 0 failed/skipped.
- Current read-only observations and limitations: [dated baseline](../research/2026-11-13-delivery-flow-baseline.md).

Phase 188 remains partial: a refreshed observation is not complete coverage or a proven bottleneck. No enforcement, scheduler, credentials, deployment, recurring work or fleet activation changed. Reverting the additive projection restores the old presentation without removing recorded effects.

Integrated gate results are recorded below after completion; targeted fixtures do not establish operational improvement.

- `npm run check:focused -- tests/integration-records.test.mjs tests/integrate-records.test.mjs`: passed, including repository preflight conventions.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- Initial focused/full attempts were interrupted by registry network policy; retained as interrupted, not passes. Verification restarted with permitted registry access.
- `npm run check`: passed (unit suite: 4673 passed, 12 skipped, 0 failed; installed checks and roadmap/render/inbox checks also passed).

## 2026-11-16 refresh

Rebased onto main `a92f0458`. The baseline note's [2026-11-16 refresh](../research/2026-11-13-delivery-flow-baseline.md#refresh-2026-11-16)
re-reads both sources through the same readers. It covers 32 integration records (the newest from
15 November, before this week's speed work) and 22 main CI check jobs timed from their own start and finish.
It shows no measured speedup in either source, and says why: the records predate the changes, and the CI check
job does not exercise the paths those changes sped up. Phase 188 stays partial.
