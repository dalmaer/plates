# Evidence: phase 134 — private agent quality observations

- Date: 2026-10-30
- Phase: [134](../phases/134-agent-quality-is-measured-by-stage-and-project.md)
- Revision: 9596eba797103096bb9591eaafef287f9c727eaa plus the phase working tree.
- Claim: local metadata collection and conservative project/stage reports work;
  this is not measured agent superiority, installation or live provider telemetry.

## Automated checks

- `node --import ./tests/helpers/hermetic.mjs --test tests/agent-quality-records.test.mjs`
  — exit 0, 12 tests. Private storage, exact previews, immutable failures/order,
  original uncertain receipts, constrained terminal refinement, retention,
  idempotency and frozen harness joins including byte preservation.
- `node --import ./tests/helpers/hermetic.mjs --test tests/agent-quality-report.test.mjs`
  — exit 0, 24 tests. Missing outcomes and planned slots, failure costs, human
  adjudication, repeated findings, project/workflow cohorts, fixed-mix coverage,
  maturity and version changes.
- `node --import ./tests/helpers/hermetic.mjs --test tests/agent-quality.test.mjs`
  — exit 0, six tests. Real CLI, bounded baseline, stable PR identities, explicit
  collection, read-only weekly preview and disabled replay.
- `node --import ./tests/helpers/hermetic.mjs --test tests/guides.test.mjs tests/web-operation-coverage.test.mjs`
  — exit 0, 20 tests after adding the new command's guide expectation and reviewed
  CLI-only capability forms/parser closure. No hosted execution is claimed.
- Initial combined focused preflight: 197 passing, four failures and one existing conditional skip in the guide
  mutation expectation and stale reviewed parser hashes. These were repaired;
  this failed run remains part of the record, not erased by later success.
- The ordinary npm cache was not writable in one builder run; its package test
  passed using an isolated writable npm cache. The user cache was not changed.
- Source runtime: Node v24.22.1. The sandbox loopback probe was unavailable;
  the permitted host validation environment passed the same capability probe.
- Final focused preflight (211 passed, zero failed, one existing Docker-conditional skip): `npm run check:focused -- tests/agent-quality-records.test.mjs tests/agent-quality-report.test.mjs tests/agent-quality.test.mjs tests/evaluation-records.test.mjs tests/evaluation-comparison.test.mjs`.
- Integrated checkpoint: `npm run check` and `npm run typecheck`; results belong
  in the phase commit body. The gate covers the integrated source, conventions,
  roadmap, rendered practice and inbox. The existing Docker-conditional integration skip remains explicit; no assertion omission was introduced.

The initial full-gate process produced a partial log and disappeared without a
terminal verdict; no pass or exit code is attributed to it. A subsequent confirmed
no-start denominator correction requires a fresh full gate on the repaired tree.

## Real local baseline

Read minimal metadata for ten recent PR candidates from each of two existing
authorized fleet projects. No titles, bodies, source files or transcripts were
collected. The dated baseline records source revisions, input hashes, open/closed/
merged counts and explicit gaps. It contains 20 candidates, zero verified task
mappings, zero assigned episodes and zero comparable agent observations.
Sixteen candidates are merged and four open; neither status establishes acceptance.

Initialized private external state with the existing workspace command. Previewed
the exact bundle, collected it with the returned digest and inspected 20 retained
events/20 candidates across two projects. Repeating the approved input returned
the original receipt with zero additions and 20 duplicates. Expired events were
zero and raw-transcript collection was false. The first report has no winner,
all stage outcomes unknown and no configured fixed reference mix. Private raw
observations and reports remain outside Git; development smoke-test receipts are
retained separately and excluded from the operating collection.

Reproduce with `plates retro quality baseline`, `collect`, `inspect` and `report`
using explicit permitted repository, manifest, state and input paths from the
[guide](../guide/agent-quality.md). The real inputs are private and are not test
fixtures. `replay-plan` reports disabled dispatch, no reserved budget and unknown
currency ceilings; no model execution was attempted.

## Independent review

A separate reviewer inspected the records, ledger, reports, CLI and capability
boundary. Corrections retained unknown-outcome denominators, froze attempt
ordering, grouped workflows by preassignment identity rather than reached
stages, normalized project identities and deduplicated findings on the actual
reviewed patch. Focused negative controls prove each repair. Final review found
no remaining actionable findings. This was a local review, not a different
provider's measured performance or a hosted review receipt.

## Gaps and decision

Keep the phase partial. Local source implementation and a real minimal baseline
are distinct from publication, merge, installation and subsequent weekly runs.
Existing weekly routine configuration, exact-head CI and review are separately
reported at handoff. No new scheduler is introduced. The routine must preserve
private reports and cannot publish them through unrelated destinations.

Task/PR reconciliation, human calibration and real stage observations are still
needed before useful comparative conclusions. The collector accepts attributed
declarations and verifies immutable joins; it does not authenticate provider
telemetry or independently verify the contents behind evidence hashes. Recall
needs an independently audited defect universe. Paid replay needs a reviewed
live adapter, explicit budget and prespecified thresholds. No paid run, routing
change, credential grant, merge, release or deployment occurred in this phase.
