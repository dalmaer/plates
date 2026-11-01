# Phase 119: live runtime components, before orchestration

1 November 2026. Source baseline `b71b5779`, working tree. This extends the
versioned records with exact per-case environment mappings, preserves sealed
legacy screening projections, and adds a bounded provider transport, isolated
artifact bridge and currency reservations within the existing experiment writer.
No live CLI operation is activated. Phase 119 remains partial.

## Observed proof

- Exact per-case resolver mutation (returning the first environment for all cases)
  failed the second-case assertion. Original command and output:
  `/tmp/phase119-mapping-proof-commands.txt` and
  `/tmp/phase119-mapping-counterfactual.log`.
- Provider tests cover model/tier identity, bounded partial dispatch and synthetic
  credential reflection. Eight tests passed; controls removing identity/reflection
  checks failed. `/tmp/phase119-evaluation-provider-tests.log` and
  `/tmp/phase119-provider-negative-manifest.json` retain commands and outcomes.
- Spend tests cover concurrent reservations, unknown holds, overflow, breaches
  and original-operation recovery. Nested spend transactions refuse rather than
  deadlock; top-level calls queue. A null-currency plan is not configured only
  when spend storage is verified absent. Logs:
  `/tmp/phase119-spend-test-01.log`,
  `/tmp/phase119-spend-nested-writer-01.log`,
  `/tmp/phase119-spend-null-currency-01.log`.
- Real local Docker bridge proof passed one test using existing image
  `sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a`,
  linux/arm64, Node 24.22.1. Command: set
  `PLATES_EVALUATION_LIVE_DOCKER=1`, `PLATES_EVALUATION_LIVE_IMAGE` to that digest,
  `PLATES_EVALUATION_LIVE_PLATFORM=linux/arm64`, then run
  `node --import ./tests/helpers/hermetic.mjs --test --test-name-pattern='opt-in real live builder' tests/evaluation-live-builder.test.mjs`.
  `/tmp/phase119-real-live-builder.log`. The callback was synthetic; no model
  request or paid evaluation occurred.

## Original failures retained

Early concurrent edits invalidated controller source bindings. One interrupted
preflight also recorded a pending-promise package cancellation; its cause remains
unproven. A stable combined run subsequently passed 224 tests but failed three
source-coverage guards because the conductor refreshed package.json with a raw
hash instead of its required semantic hash. Restoring that semantic binding made
all 13 affected guard tests pass. Logs: `/tmp/phase119-stable-focused.log` and
`/tmp/phase119-source-pins-corrected.log`. The first final focused invocation was
refused before tests because sandbox loopback binding returned EPERM; host
execution uses `/tmp/phase119-final-focused-host.log`.

## Integrated checkpoint and remaining work

Required commands on the final tree: `npm run check` and `npm run typecheck`.
Focused proof is not the integrated gate. The delivery commit records results.

Public orchestration, exact transfer/quote approval, installed-CLI recovery and
real paired screening remain unimplemented or unverified. No paid provider call,
credential access, production default change or automatic lesson promotion was
made. Real pricing, account scope and owner-approved ceilings remain activation
inputs. Historical fixtures establish machinery, never agent improvement.

## Independent component review

The stable focused checkpoint passed 228 tests (five opt-in skips); typecheck
passed. The subsequent full gate was intentionally stopped (exit 143) after
independent review identified two defects: overflowing observed charges could
be lost before breach recording, and empty stream chunks could starve the timer.
The partial log `/tmp/phase119-components-full-check.log` is not a gate pass.

Provider stream controls now reject empty chunks and cap chunk count independently
of byte count. Ten focused tests passed; both finite-stream regressions failed
without the fix. Logs: `/tmp/phase119-provider-stream-focused.log` and
`/tmp/phase119-provider-stream-red.log`. Observed spend overflow is retained as
exact decimal micro-USD with a null numeric projection, original hold and closed
admission; its focused and negative-control proof must precede delivery.

Spend overflow proof passed 19 focused tests. All three new regressions failed
against the pre-fix module on arithmetic overflow, covering a single category,
category sums and aggregate totals. Logs:
`/tmp/phase119-spend-overflow-fixed-01.log` and
`/tmp/phase119-spend-overflow-counterfactual-01.log`.

## First hosted CI and deterministic deadline proof — 1 November 2026

PR309 head `aad311491975b7a901df1d9de1646f7bf9c46a9b` passed the local full
gate (4,068 tests, 12 opt-in skips, all ten timing checks) and received a Claude
review with no findings. That review covered library changes closely but not
tests or documentation; it does not establish those omitted checks.
[Hosted CI](https://github.com/dalmaer/plates/actions/runs/41355709542)
failed the live deadline test with zero callbacks instead of one. Its original
log is retained at `/tmp/phase119-pr309-ci-failed.log` (SHA-256
`18f3903583cc5422a176daebccd5cae668e504de43ba4ddc92b7f2277292c1e1`).

A controlled 1,700ms setup delay reproduced the exact failure: the old 1,500ms
absolute deadline expired during setup, before readiness. Production behavior
was correct; the test assumed a setup speed. The revised fixture uses its normal
setup allowance and advances its clock only after observed readiness. It invokes
the actual registered timeout callback for nonresolving generation, and separately
returns late output before that timer fires to test the post-await guard.

The focused file passed five tests with one opt-in Docker skip; the delayed-setup
control also passed. Disabling timeout rejection failed with unsettled await;
removing the post-await guard failed with `late callback dispatched the bridge`.
These independent controls prove both protections without relying on runner speed.
Commands and unchanged-production hashes: `/tmp/phase119-live-deadline-proof.md`.
No production code, source pin, provider request or paid trial changed. The original
failed CI remains part of the record; the next exact-head gate must pass before merge.
