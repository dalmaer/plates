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

## Final local checkpoint — 2026-10-30

Commit b5136adc660569bc7d93263502f24187a183912c contains the complete locally tested implementation.
The repaired full `npm run check` exited 0: 3,870 passed, zero failed and five
existing conditional skips. `npm run typecheck` exited 0. Final focused
conventions passed 211 tests with zero failures and one existing conditional
skip. The test ledger reported no flaky or slower test and excluded its one busy
run from performance inference. A real weekly preview over the same 20 private
PR candidates reported no material changes, zero model runs and preview-only
collection; it did not schedule or persist new observations.

## Lifecycle completion — 2026-10-30

The preceding checkpoint was the metadata foundation, not complete ongoing
capture. This continuation adds explicit lifecycle events, append-only task/PR
links, a POSIX ordinary-command observer, the existing PR review read hook,
optional Spin instrumentation, pending adjudication and collecting weekly
reports. Review capture binds both the mapped PR and actual content checkpoint.
Unknown model versions, usage, earlier work and human acceptance remain unknown.
No ambient GUI sessions or cloud harnesses are discovered; the adapter guide
names supported boundaries and explicit private bindings.

Local independent review found and verified repairs for original-report recovery,
source/report retention, exact review inputs and task joins, late terminal-result
reconciliation, retrospective assignment and costs, conflicting first-use dates,
and configuration summaries that previously fragmented by task context. The
final review returned no findings. This review is model advice, not independent
human product adjudication or measured cross-provider review efficacy.

The actual current task was enrolled retrospectively in the private operating
ledger. Its coding checkpoint and a real validation command were captured through
the supported path. That command ran all 76 quality tests: 76 passed, zero failed,
with 6,278 ms measured process duration. Exact model/build, charges, prior work
and product acceptance were not invented. Its original source checkpoint is
`7ef5ca02c07c03cb2c89a894702afe1adc80b5a12ac90978ac33ac9fcb9ef3e3`.

An actual weekly application ingested one new task/commit linkage observation,
retained a private report and recovered that original report on exact retry.
Report `61a8efe8348f74faf10c5b79a6aff62b2fe6c75754d195c0c7cce3c6c38b14fb`
contains 20 historical candidates, one assigned retrospective task, two captured
attempts and zero comparable episodes across two projects. Source capture issues
were empty. Independent human judgments and first-use/follow-up evidence remain
pending. No weekly schedule was installed.

The first integrated focused preflight passed 253 tests and failed one because
three new phase acceptance entries omitted their named proof commands. After
adding those references, a direct CLI check verified the repair but its package
test hit the existing unwritable default npm cache. No cache ownership was
changed. With the already-used isolated npm cache, the repaired required focused
preflight passed 254 tests with zero failures and all roadmap/render/inbox/
whitespace stages. `npm run typecheck` exited 0. The full gate follows on this
integrated tree; its terminal result will be recorded separately.

Publication and scheduling remain blocked separately from local completion.
Automatic approval review rejected the branch push as external publication not
explicitly authorized for that destination, and rejected the earlier routine
update because its existing prompt included an external publication destination.
Neither action executed or was retried. The parent is awaiting explicit approval
for a draft PR and a separate local-only weekly routine; the existing Loop routine
remains unchanged. There was no merge, deployment, new access grant or paid replay.

The first lifecycle full gate exited 1 with 3,902 passes, two failures and five
existing conditional skips. Both failures were shipped-template conventions in
the optional Spin instructions: a capitalized project name and a rule missing
its causal note. The template now describes the CLI generically and explains
that retrospective metadata cannot recover missing boundaries or review inputs.
Managed rendering and the required focused practice/convention preflight pass.
The failed run and the npm-cache refusal remain retained; neither is attributed
as successful validation or silently discarded.

## Final lifecycle checkpoint — 2026-10-30

Implementation commit `834841bf11336386eebcb16be57c7630c936fc1f` passed the full
repository gate: 3,904 tests passed, zero failed, five existing conditional skips,
with successful roadmap, 99-target render and inbox checks. Typecheck exited 0.
The focused integration preflight passed 254 tests; the corrected practice
preflight passed 138. The test ledger found no flaky or slower test; busy runs
were excluded from performance inference.

The final captured content tree is `2ef4e8a7c4bd6d6c21e638eefed190563779732f`:
the committed tree exactly matches the previously observed working snapshot.
Its quality checkpoint is
`07be3750cb144d4068c839932ed58e77219a101c233a774f60b01db56298419c`.
Retained failed preflights and the cache denial were imported as retrospective
verification observations with unknown times and unavailable artifact checkpoints,
rather than omitted or assigned invented measurements. The final artifact and
successful integrated gate were then recorded against the known content tree.

The latest private report is
`ae23a29be62a7d9b6e3677fdc3759c589880232d9d3cb9b8200a357e31d5f3ca`.
It retains 20 historical candidates and one retrospectively observed task across
two projects, with seven attempts: four completed, two failed and one denied.
Two attempts came through lifecycle/ordinary-command capture; the later five
are declared observations from this task's retained checks and final artifact.
There are still zero comparable episodes and no independent human acceptance.
Source gaps, provenance, earlier effort, costs and delayed outcomes remain visible.
No agent ranking, causal improvement, installed fleet-wide capture or active
weekly schedule is claimed. Publication and scheduling approvals remain pending.
