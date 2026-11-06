# OpenHands experiment: complete follow-up report

2026-10-30. Branch `codex/openhands-evaluation`; baseline
`037e13b4f78c061405cef899b528badb536584ad`. Initial experiment commit:
`d279d1ee4d650c428b04d19f343f905030eb4366`.

## Outcome

A real REST client and durable, synthetic Plates adapter are implemented against
pinned OpenHands contracts. The branch remains an isolated experiment, not a
production integration or adoption decision. Its 22 adapter scenarios pass.
Independent review closed without remaining findings in that bounded scope.

The initial full gate's SQLite failure was diagnosed and repaired in **test code
only**. Production SQLite reader, total deadline, native query and cleanup logic
are byte-identical to the baseline. The repaired full gate passed (3,921 passed, zero failures, four opt-in skips); the original failure remains in the
[validation record](2026-10-30-openhands-validation.json).

A new native component trial executes the unchanged upstream lease module with
real filesystem locks and `filelock==3.20.3`. Seven behavior checks pass, including
one observation of unsafe-for-Plates recovery semantics: corrupt native lease
state resets generation. This is additional native evidence, not a full server
integration result. No model calls, provider credentials, external agent/chat/PR
communication, live project changes, scheduling, publication or deployment occurred.

## Exact diagnosis and repair

The original test combined generated-column rejection and query cancellation. It
created a million-row table, started a real 100 ms total timeout, then required the
parent to observe `query-started` before that timeout. Startup and IPC delivery
have no such guarantee. A missing callback proves the parent did not observe it;
it does not prove SQLite never entered the query in the child.

The failed integrated run had 3,923 tests: 3,918 passed, one failed, four skipped.
Host one-minute load was sampled at 271.05. An isolated diagnostic passed. These
facts support contention as a trigger, but do not identify a particular other
suite or prove the exact OS scheduling interleaving. The test's timing assumption
is invalid regardless of which process caused the load.

The replacement splits the assertions:

1. The real production worker rejects generated columns before query execution.
2. A test worker runs deliberately nonterminating **native SQLite** work. A
   SQLite scalar function emits readiness from inside that query. Only test
   `setTimeout` is mocked; advancing 99 then 1 ms exercises the unchanged 100 ms
   parent deadline. The test requires actual `SIGKILL`, a private copy still
   present at child closure, and removal only after collection returns.
3. A separate real-timer test suppresses the child's initial IPC request. The
   same production 100 ms deadline must kill the pre-query child and clean up
   after closure. No wall-clock completion threshold is asserted.

A test-only spawn observer records actual close signal and snapshot lifecycle;
it restores Node builtin ESM bindings and kills any remaining test child at
teardown. An independent 5 s real-time backstop prevents the deliberately infinite
fixture from becoming an orphan. Successful tests require that backstop to remain
unused. No production timeout is increased, restarted after readiness, or disabled.

Independent review identified and corrected the first fixture's premature ready
notification; the final notification occurs inside the executing SQLite query.
The reviewer independently ran all four SQLite-focused tests successfully.

## Negative control

A separate temporary copy removed only production `child.kill('SIGKILL')`.
The revised native-query test failed after 5.017 s with:

```text
AssertionError: the production deadline must kill, not the test backstop
true !== false
```

The backstop then terminated the test worker. This demonstrates that returning a
`read_timeout` error without actually killing native work cannot pass the test.
The unchanged production branch passed the same four SQLite checks. Two earlier
negative-copy setup attempts lacked imported repository files and failed during
module loading; those are setup errors, not mutation evidence. Only the completed
kill-removal run is counted.

## Common acceptance mapping

Status applies to the complete requested behavior. **Partial** means an identified
portion passed locally while the live integration or missing product path remains
unqualified. A fixture pass is not a native server pass.

| Common scenario | Status | Verified portion | Remaining gap |
| --- | --- | --- | --- |
| Lost launch acknowledgment and coordinator restart | Partial | Real local HTTP socket drop; durable intent; close/reopen retains original UUID/payer; one create request | Full Agent Server/OS-kill recovery and reconciliation unknown |
| Worker death and stale callbacks | Partial | Fixture holds lane; native lease takeover fences stale writes; known-dead PID takeover exercised | Runtime/process-tree death, external effects and launch-fence attestor unknown |
| Duplicate issue/chat inputs | Partial | Durable input/message dedupe and changed-input refusal | Real webhook signatures, issue identity and chat delivery integration missing |
| Direct worker/coordinator messages and human conflicts | Partial | User-role worker messages, ordered revisions, explicit conflict and coordinator inbox | One execution turn; no conversational meta-agent or live group chat |
| Capacity expiry/revocation; no payer switching | Partial | Existing funding validator; original payer; pinned capacity window and expiry; revocation refusal | Backend-resolved profile/model/credential binding and real capacity source missing |
| One account across two project sets | Partial | Shared reservation window across synthetic projects; view overlap does not multiply usage | Live provider quota and enrolled account/project-set wiring missing |
| Completion-to-learning crash; pending/captured/no-useful-lesson | Partial | Durable pending outcome across reopen; explicit idempotent lesson decision | Real completion/event ingestion, abrupt-process recovery and governed export missing |
| Scoped promotion and rollback | Partial | Unreviewed proposal excluded; reviewer and revision required; eligibility withdrawal | Production lesson-store integration, canary application and effectiveness measurement missing |
| UI/chat reconnect without replay | Partial | Read projection and original receipts; uncertain outbound message is not resent | Real authenticated web route, durable upstream event cursor and reliable uncertain-message reconciliation missing |
| Malicious content cannot forge authority | Partial | Text cannot set system role, run flag, actor or policy; forged token rejected | Adversarial model/tool/plugin/sandbox enforcement not tested |
| Whole-PR usage across retries/reviews/failures | Partial | Synthetic attempt receipts retained and deduped; missing totals stay unknown | Actual provider request/cache/cost coverage and existing quality-ledger export missing |
| Pending stop versus confirmed termination | Partial | Interrupt remains pending until matching trusted exit plus launch-fence evidence | Real termination/fencing attestor and complete runtime teardown unknown |

Local component status: adapter scenarios **pass (22)**; source pin/contract
probe **pass (17 files)**; native lease behavior checks **pass (7 observations)**.
No complete end-to-end common scenario is claimed as a live acceptance pass.

## Native capability, custom work, conflicts and unknowns

**Native:** caller-selected conversation identity, event APIs, persistence and
lease machinery, interrupt, profiles/tools, optional memory, and a separate
Automation scheduler. Lease mechanics now have narrow executable evidence; most
other contracts remain source-inspected.

**Custom adapter:** people/projects, durable effect identity, current authority,
original payer and shared reservation, conflict handling, outcome/learning state,
reviewed eligibility and sanitized projection. The experimental state machine is
not the production effect/usage/learning store; production integration remains work.

**Conflicting:** local shared-key authentication maps to one admin; native corrupt
lease recovery resets generation; a second scheduler would duplicate work ownership;
agent memory cannot be promoted automatically into approved policy. Profiles may
resolve saved credentials and MCP servers. Confirmation is not a sandbox, and the
native budget check can overshoot by a step.

**Unknown:** full server restart/kill behavior, ongoing conversation coordination,
real account/tool isolation, provider usage, safe process-tree termination, learning
improvement, deployment behavior and maintenance time. Source-reported Cloud or
Enterprise team/budget features do not establish local OSS behavior.

## Dependency setup and authority

The [exact local test plan](2026-10-30-openhands-local-test-plan.md) includes the
completed one-package component trial and a prepared no-cost server test.
Routine public, pinned dependency installation into a disposable virtualenv is
covered by this task. It is not blocked on a new user approval. The completed
trial installed only `filelock==3.20.3`, with its upstream-lock wheel hash,
wheel-only/no-dependencies/no-build installation and isolated cache.

New authority is needed for provider credentials/grants, spending, private remote
data or real-project access, external writes, deployment, routines/cutover, or
privileged/global host changes. A broader local mocked server test still requires
engineering preparation and dependency review; credentials alone would not finish
that integration. No such external authority was used or requested here.

## Maintenance and deliverables

The branch contains the REST client, durable experimental adapter, HTTP fixture,
22 scenarios, two upstream probes, exact source/dependency pins and research
records. The follow-up adds a test-only SQLite process observer and native-work
fixture. No production reader, scheduling default or existing workflow changes.

Maintenance work concentrates on profile/funding attestation, termination fencing,
durable multiple turns, event/message reconciliation, usage normalization, governed
learning export and authenticated Mission Control wiring. Native primitives reduce
some runtime work but do not remove these product boundaries. No measured cost or
throughput advantage, or maintenance-hour estimate, is claimed.

## Final validation (2026-10-30)

- Focused preflight: **158 passed, zero failed**, including 22 OpenHands cases and
  the routine-source suite; mandatory conventions and record guards passed.
- Independent reviewer: final four SQLite-focused cases passed; no remaining
  material findings. Production deadline unchanged.
- Native component: seven OpenHands lease behavior checks passed with real
  filelock; one is an explicitly recorded corrupt-state hazard observation.
- Full gate: **3,925 total; 3,921 passed, zero failed, four opt-in skips**. Test
  duration 218.652 s; full guarded command 267.148 s. Roadmap, render and inbox
  checks passed. Existing stall checks passed; test hygiene reported no flaky or
  slower test, with busy samples explicitly excluded from timing comparisons.
- `npm run typecheck`: passed. Local document references and whitespace checked.
- Cooperative admission receipt: `ec842ba5-91c2-468a-8f1a-eaf8473994ec`, child exit 0,
  lease released, no interruption or timeout. One-minute preflight load 3.469;
  three detected old test processes were stopped/sleeping for over two days and
  left untouched. The wrapper does not claim control over nonparticipating
  processes or a host-wide sandbox.

Executed full gate:

```sh
node scripts/validation-budget.mjs run --manifest /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/plates-openhands/plates.json --repo dalmaer/plates --root /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/plates-openhands --state-dir /Users/dionalmaer/Documents/Codex/2026-10-30/task-4/validation-host --capacity 1 --weight 1 --timeout-ms 900000 --foreground-contract --json -- npm run check
```

The [machine-readable evidence](2026-10-30-openhands-validation.json) preserves
both the original failed gate and this repaired passing gate, negative-control
log digest, native probe output and exact final code hashes. OPH-HYGIENE-1 is
resolved for this branch by the test-only repair, not by a bare passing retry.
The branch is local and unpushed. No remaining local approval or validation block.
Live integration still has the explicitly listed implementation/qualification gaps.
