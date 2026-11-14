---
attempt: {"accepted":false,"verified":false,"rework":2,"lessonStatus":{"status":"known","lesson":"Plates lesson 44: bound the stuck attempt itself"}}
---

# Phase 181: hosted attach preview increment

Date: 2026-11-14. Base: `6d2869a5bf10b3c2b966834c76784bbd07070478`
plus working tree. The owner explicitly requested this session take over the
existing phase. Its prior branch was merged; both visible Plates desktop
sessions were idle and the Rex Claude pane was a shell. The supported stale
claim release recorded that request, then a fresh Codex claim was read back.
No old process was killed or resumed and no other phase claim changed.

## Boundary and proof

The first safe increment is an authorized, source-bound read-only preview of
the existing session attach contract. It creates no claim or operation, starts
no child, reserves no allowance and dispatches no workflow. A brief is not a
running agent. Hosted apply stays unavailable until durable claim/write/recovery
is connected and proven through the existing machinery.

Required integration command: `npm run check` through the serialized integrator;
`npm run typecheck` checks its existing explicit scope. Focused test and review
results are recorded below when observed, not inferred from implementation.

## Remaining acceptance

No deployment, permission expansion, hosted claim write, real execution,
provider-start recovery, reconnect walk, exact-version correction cycle, owner
acceptance or paid paired trial is proven by this increment. The phase remains
partial. The existing worker, executor, receipt/history and feedback contracts
remain the implementation path; no second scheduler, store or runtime is added.

Recovery is reverting this source increment to the base above; it makes no
outward effects to undo. Source tests are not hosted activation evidence.

## Review and preflight observations (2026-11-14)

Independent review found incomplete PR visibility could look like available work,
and source reads did not inherit the request cancellation signal. Both findings
were sent back to the builder together, including the sibling claim-list coverage
boundary. These are source-review findings, not production incidents.

The initial conductor preflight named a nonexistent navigation test and exited 2
before running tests. The corrected command,
`npm run check:focused -- tests/web-attach-preview.test.mjs tests/web-backlog.test.mjs tests/backlog-attach.test.mjs tests/work-items.test.mjs`,
exited 0 with 171 tests passing and the required conventions/record guards passing
before review corrections. `npm run typecheck` exited 0 on that candidate. These
results do not cover later corrections; final verification is recorded separately.

A conductor review of the stricter shared reader found that the same branch
prefix also contains the existing `claims/integrate` lock. Treating that known
non-phase lock as malformed ownership would hide available phase work. The
builder was asked to retain its separate semantics, with controls for both an
available phase and a held phase alongside that lock.

## Final source verification (2026-11-14)

- `npm run check:focused -- tests/web-attach-preview.test.mjs tests/web-backlog.test.mjs tests/web-agents.test.mjs tests/web-projects.test.mjs tests/web-design.test.mjs tests/backlog-attach.test.mjs tests/work-items.test.mjs`: exit 0, 212 tests passed, required convention and generated-record guards passed. This ran before the final integration-lock correction.
- After that correction, `node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/web-attach-preview.test.mjs tests/web-backlog.test.mjs tests/web-agents.test.mjs tests/web-projects.test.mjs`: exit 0, 44 passed, zero failed; no flaky or slower test reported.
- `npm run typecheck`: exit 0 after the final source correction.
- Builder negative controls failed before their fixes: unknown/malformed claim coverage was accepted; the integration lock refused an available phase (`503 !== 200`). The original failures remain observations rather than being erased by passing reruns.

The real route handlers are tested with synthetic Acme GitHub/auth/store
boundaries. Tests check source revision changes, current authorization, incomplete
claim/PR reads, request cancellation, unsupported writes, and the absence of
claim/journal/dispatch calls. They do not establish deployed or lived-in behavior.

Independent final source review closed both findings and found no further blocking
issue after the integration-lock correction. The reviewer inspected the negative
controls; the conductor independently ran the final 44-test proof above.

## Integrated result (2026-11-14)

The source increment `adf03308c02d5768ce6407c75f09d881f9c78bcd` landed on
main as `c8b8be49ca457182752bd88b04379503fb6852db`. One serialized
`npm run check` completed with exit 0: 4,689 passed, 12 skipped, zero failed;
the installed-package suite passed all 45 tests. The durable integration record
is commit `0be3fae7721c18cc8bf4e50d3eb3f8abbc9ee24b` on `plates-integrations`.
[GitHub check](https://github.com/dalmaer/plates/actions/runs/43637971261)
completed successfully on that exact main commit. Deployment and owner acceptance
were not observed.
