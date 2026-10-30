# Switchboard consolidation design review — 30 October 2026

This records specification review, not migration implementation or acceptance.
All five new phases remain `designed`, with unchecked feature acceptance and no
claim of live verification. The [contract](../specs/switchboard-consolidation.md)
and [phase 132](../phases/132-a-project-set-shows-its-routines.md) lead to phases
133–136. Goal G8 and the generated roadmap make the work discoverable.

## Inputs and isolation

- Plates base: `0165c2902784073ba89dd717256ad233faf4865f`.
- Switchboard inspected source: `a6651db5ff570eada8b04b2c4ffb993d8e67fbe9`.
- Worktree: `/Users/dionalmaer/Documents/Codex/2026-10-30/task-2/plates-consolidation`.
- Dedicated branch: `codex/switchboard-consolidation`.
- The original Plates checkout contained untracked user state and research;
  none was copied, staged, reset or edited. Switchboard remained unchanged.
- Separate `codex/agent-quality` remained at
  `9f8c17adb12e4291c4a9a4c11870c3755f3d762e`; `task/agent-quality` remained at the
  Plates base above. No branch was merged, pushed or published.

Inspected repository instructions, package contracts, phase/status records,
designs, relevant runtime modules and test declarations. The source inventory
accounts for all 33 Switchboard `src/` modules, its entrypoint/config/history,
consumer tooling and planned but unavailable capabilities. Source test references
identify behavior to preserve or deliberately redesign; those tests were not run
here and do not prove a Plates implementation.

The owner clarified that phases must be native to Plates, selected “set” /
“project set,” and requested the existing web experience plus person/plate/set
ownership and capacity semantics. The final design responds with five user
outcomes, a current-route/model audit, explicit reuse/redesign/drop rationale,
terminology task N1, ownership/funding task P1 and implementation tasks T1–T8.

## Review findings incorporated

- Existing Home, Routines/Activity, Daily, Learning, Connections, jobs, model
  policy and updates are the destination; no parallel dashboard is proposed.
- Current connection descriptors and owner checks do not establish personal
  account sharing for multiple contributors. The new phase specifies separate
  identity, funding grants, private details and minimal shared run summaries.
- Capacity normalization already distinguishes provider/account/pool/window and
  units; it is not an authenticated quota reporter. Same-account observations
  across sets must deduplicate, and unknown or conflicting entitlement stays
  unavailable. A set never pools contributors' personal allowance implicitly.
- Current web history has no local-machine bridge, current model planning is
  tool-free, and the worker registry is not an arbitrary routine executor.
- BenOS source uses activity-record catch-up, not the changes-log API described
  in older design prose. Remote MCP and action correlation require fresh proof.
- Listener cursor publication after dispatch and outbox archival after delivery
  need durable original-intent recovery. Import must preserve pending effects.
- Health-reports notification parity is weaker than required-file parity; its
  existing comparison window and owner decision remain intact.

## Validation actually run

On 30 October 2026, Node `v24.22.1`:

- `npm run roadmap`: generated 137 phases and 9 goals from source records.
- `npm run roadmap:check`: passed; existing repository advisory notes remain.
- `npm run render:check`: passed; 97 practice targets checked, no managed changes.
- `npm run inbox:check`: passed; inbox and patterns current.
- `git diff --check`: passed, including new documents marked intent-to-add.
- `npm run check:focused -- tests/roadmap.test.mjs`: passed 151 tests, zero
  failures/skips, including the repository's mandatory convention tests, followed
  by passing roadmap/render/inbox/whitespace stages. The original sandbox attempt
  stopped before tests because its localhost capability probe returned EPERM;
  the approved host execution passed. No test failure was retried until green.
- Relative document links/anchors and source-module coverage were checked with
  a local read-only Python inspection. All references resolved and no source
  module was omitted. Final document links were rechecked after this record.

The focused log is retained outside Git at
`/Users/dionalmaer/Documents/Codex/2026-10-30/task-2/consolidation-focused.log`.
No full suite or typecheck was run for this documentation-only task. New named
implementation test files are explicitly planned, not nonexistent proof claimed
as passing. This is not a full-gate pass or independent external review.

## Remaining work and approvals

No implementation is claimed. Begin the observation/identity contract and
synthetic fixtures on a separate implementation candidate, rechecking current
decision context and source revisions. Source development does not require live
activation. Later host enrollment, daemon installation, provider data transfer,
spend, permission changes, shared-audience expansion, cutover and retirement need
their concrete scoped review. No active routine, credential, permission, private
runtime state or existing health-reports trial was changed here.

## Usage and recommendation clarification — 30 October 2026

Read agent-quality branch `9f8c17ad` without changing it. U1 now extends its
existing episode/attempt ledger with full task/PR lifecycle usage, provider-specific
input/output/cache semantics, funding attribution, observed/estimated charges,
coverage and nonadditive multi-PR/parent-child mappings. S1 separately recommends
an authorized agent using fresh personal capacity and relevant quality/latency/cost
evidence; it never dispatches or infers subscription quota from historical tokens.

Review found phase-ID collisions: agent-quality's branch already has different
phases 132–134. Both branches remain intact; reconcile draft phase allocation and
references before integration/publication. Branch-qualified contract prerequisites
avoid pretending that consolidation phase 134 is the agent-quality phase.

For this documentation clarification, roadmap generation/check, managed render,
inbox and whitespace checks passed. New usage/recommendation tests are planned,
not executed. Earlier focused-check results above retain their original scope.
