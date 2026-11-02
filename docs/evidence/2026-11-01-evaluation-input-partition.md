# Evaluation input partition — 1 November 2026

Phase 119 remains partial. This local component prepares an explicit public view
and independently reconstructs evaluator inputs. It grants no provider transfer,
spend, execution, acceptance or durable-freeze authority.

## Existing component installation

[PR309](https://github.com/dalmaer/plates/pull/309) merged as
`bccb347257613069bb2d531078f972ed814ed699` on 1 November 2026. Its reviewed head
was `a3d05fb74550c40b4f9e674098695f8c900726a6`; hosted
[check 41363019114](https://github.com/dalmaer/plates/actions/runs/41363019114)
passed. The local gate passed 4,079 tests with 12 skips and ten timing-stall
checks, plus typecheck. Claude's final review covered library changes, not tests,
docs or phase records, and executed no code. Merge establishes installation,
not a real model comparison or agent efficacy.

## Partition checks

The initial two-file focused command passed 35 tests:
`node --import ./tests/helpers/hermetic.mjs --test tests/evaluation-input-partition.test.mjs tests/evaluation-corpus.test.mjs`
with repository spec/test-ledger reporters. No flaky or slower test was reported.
Original fixture failures remain in `/tmp/phase119-input-partition-focused-01.log`;
a shared mutable fixture and oversized synthetic catalog were corrected without
weakening production guards. The final focused log is
`/tmp/phase119-input-partition-focused-04.log`.

Four isolated causal controls failed their intended assertions: exposing private
files, removing case binding, merging duplicate paths before validation, and
omitting private dependencies during reconstruction. Exact commands and outcomes:
`/tmp/phase119-input-partition-handoff.md` and
`/tmp/phase119-input-partition-controls-results-02.json`.

The builder's preflight initially lacked loopback permission; its escalated run
then reported the expected stale source pins. The parent refreshed the reviewed
source inventory; focused preflight passed at
`/tmp/phase119-partition-parent-focused.log`. These checks precede the independently
identified read-boundary correction and are not its proof.

## Independent review and limits

API review corrected shared-case dependency resolution, currency-only case
normalization, and the wrapper/bundle schema distinction before implementation.
Code review then identified Git access before binding checks and missing aggregate
read bounds. The contract now requires validation before Git and one ten-second
deadline. It also makes clear that self-consistent plan values do not establish
retained freeze provenance: executing callers must use the existing ledger reader.
The correction passed 17 partition tests and 25 corpus/helper tests with clean
ledger hygiene. Causal controls prove pre-Git validation and a shared decreasing
timeout, rather than eventual rejection or independent per-call timeouts.
Commands and original outcomes: `/tmp/phase119-input-partition-review-handoff.md`.
The fresh integrated checkpoint remains pending in this record.

No paid requests, credentials, production activation or held-out efficacy evidence
were used. Public historical cases remain development cases. The live
preview/count/quote/run/reconcile orchestration is still outstanding.
