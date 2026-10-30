# Gas City experimental adapter — 2026-10-30

Gas City supplies useful session and conversation seams, but this experiment
**does not qualify it for adoption or unattended care**. A restart can erase
session-create response deduplication; an inbound retry can notify an agent twice.
Plates can conservatively retain uncertain intent, but complete automatic
reconciliation is still missing. The initial checkpoint ran no live Gas City
city, provider or model. The follow-up below exercises the real subprocess
provider; no city supervisor or model ran.

## Scope and pinned evidence

- Plates baseline: `037e13b4f78c061405cef899b528badb536584ad`, consolidation checkpoint.
- Branch: `codex/gas-city-evaluation`; isolated task worktree `plates-gas-city`.
- [Official Gas City source](https://github.com/gastownhall/gascity/tree/3f3224faaeff2da774417293e4a847aa421365a5):
  `3f3224faaeff2da774417293e4a847aa421365a5`.
- [Pin manifest](../../experiments/gas-city/upstream.json): SHA-256 of 18 inspected
  source/document/dependency/license files. The checker refuses changed bytes.
- MIT license, copyright 2026 Gas City Contributors. No upstream runtime code
  is vendored; the checker copies exact local source files into a temporary
  directory solely to execute them. The upstream license remains in its checkout.
- `go.mod` requires Go 1.27.3. Direct dependencies include beads 1.3.2, gascity-packs
  `v0.3.1-0.20261029224322-cb6a612882b8`, Huma 2.37.3, SQLite 1.50.1,
  Kubernetes 0.35.2, and OpenTelemetry 1.45.0. `go.mod` and `go.sum` are hashed;
  their complete transitive licenses/deployment obligations were not audited.
- Existing Node 24.22.1 and Go 1.27.3 used. Plates development dependencies reused
  through a temporary worktree-local symlink to the consolidation checkout's
  existing `node_modules`, removed after initial validation. The follow-up
  downloaded only the official Go module detailed below; no global configuration edit.

Official contracts inspected at the pin:
[connected clients](https://github.com/gastownhall/gascity/blob/3f3224faaeff2da774417293e4a847aa421365a5/docs/guides/connected-clients.md),
[API](https://github.com/gastownhall/gascity/blob/3f3224faaeff2da774417293e4a847aa421365a5/docs/reference/api.md),
[session types](https://github.com/gastownhall/gascity/blob/3f3224faaeff2da774417293e4a847aa421365a5/internal/api/huma_types_sessions.go),
[external messaging handler](https://github.com/gastownhall/gascity/blob/3f3224faaeff2da774417293e4a847aa421365a5/internal/api/huma_handlers_extmsg.go),
[trust boundaries](https://github.com/gastownhall/gascity/blob/3f3224faaeff2da774417293e4a847aa421365a5/docs/reference/trust-boundaries.md).

## Built seam

[Client](../../experiments/gas-city/client.mjs) sends official city-scoped HTTP
requests with `X-GC-Request` and create `Idempotency-Key`. It accepts only literal
HTTP `127.0.0.1` origins and refuses redirects. The test exercises actual HTTP
serialization against an ephemeral local fixture. GET events is a snapshot;
`after_seq` belongs to the SSE endpoint and is deliberately not sent there.

[Bridge](../../experiments/gas-city/bridge.mjs) persists intent before a POST in
a private [SQLite journal](../../experiments/gas-city/store.mjs). Two instances
serialize reservation through SQLite. It reuses Plates' real funding binding
validation, preserves the original payer, tracks one execution lane per project,
and keeps capacity reservations separate from that lane. There is no second
scheduler: all actions are explicit method calls. Gas City retains its own session
controller. A future implementation must restrict its autonomous scale/restart
behavior to the exact Plates delegation; this experiment has not configured or
proved that boundary.

The Mission Control deliverable is a read-only view model for the existing UI,
not a new web UI or route. It exposes uncertain/stop/learning states, conflicts,
and incomplete usage; it does not expose account identifiers or credentials.
Authentication, runtime attestation and current capacity are injected trusted
fixture boundaries. This must remain outside production imports until those
boundaries are wired to the existing production stores and reviewed HTTP routes.

## Initial acceptance observations — 2026-10-30

The named cases are in [the executable test](../../tests/gas-city-evaluation.test.mjs).
All observations below distinguish local adapter behavior from live integration.

| Case | Observed local behavior | Remaining qualification |
| --- | --- | --- |
| Lost launch acknowledgment; coordinator restart | Original intent/fence/hold persists; repeated call sends no second POST | Original native request identity is unknown; cannot automatically recover the run. **Full case unmet.** |
| Worker death/stale callbacks | Stale fence rejected; inactive read never frees lane; null session cannot attest exit | Real process/provider attestor absent; no worker was killed |
| Duplicate issue/chat inputs | Persisted scoped IDs suppress duplicate POST after reopen; changed body conflicts | Provider authentication/webhooks are fixtures, not live ingress |
| Human addresses worker/coordinator | Both routes use bound session identity; stale human revision is visible and withheld | Test uses separate projects; same-project coordinator plus worker lifecycle and conflict resolution remain open |
| Capacity expiry/revocation; no payer switch | Real binding checks plus synthetic fresh capacity reject dispatch; messages recheck original payer | No provider quota receipt or production reservation RPC integration; local units only |
| One account in two project sets | Same canonical account pool contends across two projects; account B remains distinct | Sets add no authority; actual set UI not exercised |
| Completion-to-learning crash | Completion and pending status survive reopen; explicit captured/no-useful-lesson decisions | No real worker completion integration or capture service outbox |
| Lesson promotion/rollback | Reviewer checks source/target scope, immutable version/evidence; rollback retains provenance | Local records only; not production lesson retrieval, quality measurement or automatic effectiveness rollback |
| UI/chat reconnect | View calls replay no effects; access revocation denies reads; uncertain inbound is retained | No browser/SSE journey; automatic message reconciliation/outbound retry absent |
| Malicious content | Quoted approval stays text; forged caller denied; reader cannot attach session identity | Real identity provider, sandbox/tool policy and hostile live agent not exercised |
| Whole-PR usage | Planning/coding/review/retry/failure receipts dedupe; known subtotal retained; totals remain null | No native usage completeness, cross-run production ledger importer or measured provider cost |
| Pending stop vs confirmed exit | Stop persists through create race; later stop dispatches once using transaction-claimed session; unknown usage keeps funding hold | Trusted exit proof is mocked; no automatic retry of uncertain stop |

## Native capability versus custom work

| Area | Classification | Evidence and consequence |
| --- | --- | --- |
| Composable runtime providers, city/rig sessions | Native | Contracts inspected; real subprocess provider exercised in follow-up; full city/rig runtime not executed |
| Async creation correlation | Native + adapter | Request ID/event cursor supplied on acknowledgment; Plates journal survives its own restart |
| Durable create retry after city/server restart | Conflicting with blind retry | `idempotency.go` stores responses in a map; actual upstream code negative control proves a new cache forgets prior request |
| Webhook duplicate suppression | Limited native | `webhook_dedup.go` TTL map and server-lifetime field; no cross-restart guarantee established |
| Conversation binding/transcript | Native | Stable conversation reference, actor and provider-message ID; binding endpoint inspected |
| Exactly-once inbound notification | Adapter work / unresolved uncertainty | Transcript dedupe does not suppress every background notification; adapter refuses blind resend |
| Restart registration | Adapter work | Adapter registry is process memory; register before each distinct turn; restart recovery not inferred from success |
| Failed outbound delivery | Adapter work / not implemented | Official guide states no automatic retry and failed publish not recorded in transcript; no outbound receiver in this experiment |
| Personal authority, risk, funding | Plates retained / incomplete seam | Existing funding validator used; server-injected authorization only; no new authority inferred from text |
| Learning and whole-PR usage | Plates retained / adapter work | Local outcome/usage/lesson prototypes; existing production ledgers remain authoritative and unmodified |
| Mission Control | Adapter work | Read-only projection, no second broad dashboard; authenticated HTTP/UI wiring remains open |

Herdr remains excluded. The pinned
[Herdr provider note](https://github.com/gastownhall/gascity/blob/3f3224faaeff2da774417293e4a847aa421365a5/docs/reference/herdr-provider.md)
records 0.7.1 live validation, CLI changes in 0.7.4/0.7.5 and 0.8.0, and a
session-event journey waived for 0.8+. Backend selection is city-wide; per-agent
`session` selects transport rather than Herdr backend. No new `herdr-core` was
substituted and no Herdr installation was attempted.

## Initial commands and verification record — 2026-10-30

From this experiment worktree unless another root is named:

```sh
node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/gas-city-evaluation.test.mjs
node experiments/gas-city/check-upstream.mjs /absolute/path/to/gascity --json
npm run check:focused -- tests/gas-city-evaluation.test.mjs
npm run typecheck
npm run check
```

The first run observed 10 passes and a loopback `EPERM` refusal. A permitted
local-server run then observed 11/11 passes. Later review added regression cases;
final-code results are recorded below and in the local commit message.
The required focused preflight completed once on the intermediate 15-case tree,
including conventions, roadmap, render, inbox and whitespace. Final-code checks after the remaining fixes are recorded below; intermediate
success alone was not used as final-tree proof.

The upstream checker verified 18 hashes and passed 13 Go tests: 12 unchanged
upstream tests plus `TestPlatesRestartLosesCreateDedup`. This exercises actual
upstream cache implementation, **not** a mocked reimplementation or full city.
An initial direct-file invocation omitted the upstream helper files and failed to
compile; the checked-in runner includes them and the subsequent run passed.

Attempted offline full-component tests from the upstream root:

```sh
GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOCACHE=/tmp/plates-gascity-go-cache go test ./internal/extmsg ./internal/runtime/subprocess -run 'Test(HandleInboundNormalized|HandleOutbound|SeamsLifecycle|SeamsInterrupt)' -count=1
```

They could not resolve missing cached modules and attempted lock/cache writes
outside the writable task roots; no component tests executed. At that checkpoint no dependencies
were downloaded to overcome this. The narrower checker used an isolated cache
and standard-library-only source files. The follow-up below resolves the missing
subprocess dependency and exercises that component; extmsg and the full city
supervisor remain **not run**.

Independent review reproduced and drove corrections for stop/create races,
message funding bypass, termination incorrectly releasing financial reservations,
unsupported event pagination, routing mislabeled delivery, read-only session
attestation, transaction-stale stop identity, null-session attestation and
caller-selected shared callback URLs. Regression tests cover the behavioral corrections; the new `observeCreate`
attestation gate was independently source-reviewed, without a dedicated
unauthorized-reader assertion.
The reviewer also identified same-project coordinator lifecycle and trusted
attestation as qualification gaps. This was an isolated experiment, not `/spin`;
no phase status, production acceptance, main branch or existing worktree changed.

## Maintenance cost and next decision

This small prototype already needs durable local intents, uncertainty states,
funding checks, session/fence mapping, scoped message receipts/conflicts, registry
refresh, usage/outcome capture and read projections. Production adoption adds
at least durable original-request lookup after a lost acknowledgment, authenticated
callback/ingress and retry outbox, actor/payer delegations, authoritative runtime
termination, usage imports, reviewed learning integration, SSE reconciliation,
restore epochs and controller scheduling fences. Those are substantial retained
Plates responsibilities, not Gas City configuration alone.

No model cost was incurred; local processing and imported source are not a live
usage benchmark. No numeric maintenance-hours estimate is supported by this trial.
The next meaningful test is a separately scoped, dependency-reviewed local city
with fake executable workers, then durable create lookup and outbound delivery
reconciliation. It needs no personal credentials if kept synthetic. Additional dependencies need inspection and isolated setup; ordinary reputable
local test dependencies fit the existing authorization. Herdr needs a separate
version-compatible plan and is outside this trial. Any paid provider trial, credentials/delegations, public
issue/PR/chat write, deployment, routine enablement or Switchboard cutover needs
separate authorization. None was attempted here.

## Initial final-code checkpoint — 2026-10-30

All implementation/test files were unchanged during the final full gate.
This final results paragraph and evidence clarifications were added afterward;
documentation conventions and whitespace were checked again before committing.

| Command | Result |
| --- | --- |
| Final `npm run check:focused -- tests/gas-city-evaluation.test.mjs` | Exit 0; 131 passed, 0 failed; includes all 17 Gas City cases and mandatory conventions, then roadmap/render/inbox/whitespace |
| `npm run typecheck` | Exit 0; existing selected production JSDoc scope, not a claim that experimental files are typed |
| Final `npm run check` | Exit 0; 3,918 tests, 3,914 passed, 4 skipped, 0 failed; roadmap/render/inbox passed |
| Pinned upstream checker | Exit 0; 18 hashes verified; 13 actual Go cache tests passed |
| Independent final review | Prior concrete findings resolved; no new blocker for the isolated prototype; live qualification gaps retained |

The full gate's hygiene block reported no flaky/slower test, with one busy run
omitted from comparison; this is not a performance benchmark. Existing dated-number
advice in older research files was non-failing. The gate's four skips are retained
as skips, never counted as verified behavior. Test and upstream raw logs were
retained locally at `/tmp/plates-gascity-full-check.log`,
`/tmp/plates-gascity-preflight-final.log`, `/tmp/plates-gascity-typecheck.log`,
and `/tmp/plates-gascity-contract.json`.

Funding remains an experiment boundary: scalar fixture units and a held reservation
do not prove per-turn native model cost enforcement. Likewise, the Go restart
negative control constructs a fresh cache, exercising the actual implementation;
it does not kill/restart a full supervisor process. No real PR/chat provider or
model endpoint was contacted by the qualification tests.

## Actual subprocess-runtime follow-up — 2026-10-30

The earlier missing dependency was recoverable local setup, not a requirement for
another user decision. Under the existing authorization, the ordinary sandbox
review permitted the exact public module download and local process/socket tests.
No permission denial remains. No global installation or settings changed.

Only `golang.org/x/sys v0.49.0` was downloaded into the task-local module cache.
The official Go proxy/checksum receipt matched both hashes already in the pinned
`go.sum`; its origin is `https://go.googlesource.com/sys`, commit
`b6b8557e8e2974925aec7a136ba0e323eedc5f43`. The module is BSD-licensed and has no
module dependencies in its inspected manifest. Existing Go 1.27.3 compiled the
trial with `CGO_ENABLED=0`. Offline compilation succeeded without another module.
[Runtime evidence](2026-10-30-gas-city-runtime-evidence.json) retains the receipt,
source-manifest digest, named test outcomes and actual process proof.

A local archive of the same Gas City revision was used. Every Go source file in
the ten inspected packages was byte-compared with the pinned checkout; the
[manifest](../../experiments/gas-city/runtime-sources.json) retains individual
hashes. No upstream production source was edited. A task-owned driver was added
only to the archived trial tree for compilation. Module/cache/binary/log storage
is under `task-3/gas-city-runtime-trial`; temporary roots are owned short paths.

Executed from the archived upstream source with sanitized `env -i`, explicit
`GOENV=off`, `GOWORK=off`, `GOTOOLCHAIN=local`, task-local `GOPATH`, `GOMODCACHE`,
`GOCACHE`, `TMPDIR` and `TEST_TMPDIR`:

```sh
go mod download -json golang.org/x/sys@v0.49.0
go test -mod=readonly -p=1 -parallel=1 -count=1 -v -timeout=60s ./internal/runtime/subprocess -run '^(TestSeamsLifecycle|TestSeamsInterrupt|TestSeamsStage|TestSeamsMetaStore|TestSeamsTransportShape|TestTerminateRuntimeBindsKillToScannedIdentity|TestSubprocessFencedInputChecksTheLiveProcess|TestSubprocessRespawnBetweenCheckAndSendIsRefused|TestSubprocessFencedInputToAnExitedChildIsADeadMiss)$'
go build -mod=readonly -o ../bin/plates-subprocess-driver ./cmd/plates-subprocess-driver
```

Download used only `GOPROXY=https://proxy.golang.org`, `GOSUMDB=sum.golang.org`;
compilation and tests used `GOPROXY=off`, `GOSUMDB=off`. All three commands exited
0. The nine named upstream tests actually ran and passed: lifecycle includes
launch, duplicate rejection, re-resolution, liveness and teardown; interruption
kills a real child; fencing refuses stale incarnations and a check/send respawn;
process-identity fencing rejects an incorrect identity before signaling. This is
scoped macOS component evidence, not the upstream Bazel gate.

The [driver](../../experiments/gas-city/runtime-driver/main.go) links the unchanged
subprocess provider and accepts only a fixed finite `exec /bin/sleep 60` worker.
Its local component protocol is explicitly **not** the supervisor API. A
[coordinator child](../../experiments/gas-city/runtime-coordinator.mjs) uses the
existing Plates experimental bridge/journal. The
[trial runner](../../experiments/gas-city/runtime-trial.mjs) SIGKILLs that actual
Node coordinator and starts new OS processes against the same journal while the
provider driver stays alive. Real process identity is read from the provider's
own control socket and the Darwin kernel. No global process scan or arbitrary
PID/command endpoint is exposed.

The first harness run failed because it used the old session-name socket path;
the pinned runtime hashes the name. Plates retained `launch-uncertain` and its
hold. Provider teardown ran, but that attempt never captured independent PID
proof and is not a pass. Its original stderr and journal remain retained. After
correcting the pinned socket mapping, a run passed. Review then found an
independent failure-cleanup ordering issue, which was fixed and regression-tested
before the final run; no failed attempt was erased or retried unchanged.

Final command from the Plates experiment worktree:

```sh
node experiments/gas-city/runtime-trial.mjs /absolute/task-3/gas-city-runtime-trial/bin/plates-subprocess-driver
```

Exit 0. The final run retained PID `16161` and kernel start identity
`1793397704501209000` across a confirmed coordinator `SIGKILL` and restart; the
actual provider create count remained one. While the worker lived, termination
confirmation was refused. A typed native `FenceMismatchError` carried the
expected incumbent digest and left the worker alive. After real provider Stop,
the bridge still showed `stop-pending` with the lane held. A stale callback was
rejected. Only matching session/fence/PID/start-identity evidence with kernel
absence released the lane; the capacity reservation stayed held. Cleanup joined
owned coordinators and the driver, recorded `running:false`, `exitConfirmed:true`,
no stop/observation error, and removed that successful run's temporary root.

The driver has a 90-second lifetime ceiling and the worker a 60-second ceiling.
All harness waits are bounded. Cleanup signals every owned process before waiting
for any one; driver shutdown cannot be skipped by a failed coordinator exit.
Unknown cleanup or any failed trial retains its directory. Three focused tests
exercise rejected/timed-out child cleanup, signaling errors, unavailable exit
proof and successful joined cleanup. Independent final review found no remaining
blocker for the bounded component trial.

### Current scenario classification

`Pass (component)` means the named real-runtime boundary was exercised; it does
not qualify the full supervisor/product. All untouched original fixture evidence
remains at the prior scope, not promoted by the runtime pass.

| Common scenario | Current status | Exact evidence / remaining gap |
| --- | --- | --- |
| Lost acknowledgment and coordinator restart | Partial | Real coordinator SIGKILL/restart recovered the same PID and one creation; original lost-HTTP-ack test still mocked; supervisor request lookup remains unresolved |
| Worker death/stale callbacks | Pass (component); full-engine unknown | Nine upstream lifecycle/fence tests plus final harness typed stale interrupt and stale termination rejection; no supervisor crash/reconciliation or live agent |
| Duplicate issue/chat inputs | Partial | Original test lines 41 and 49 persist dedupe/uncertainty against a fixture; actual extmsg not run |
| Worker/coordinator conversation and human conflicts | Partial | Original line 54 tests separate projects and withheld revision conflict; subprocess input is a no-op, not a conversational transport |
| Capacity expiry/revocation/no payer switch | Partial | Original lines 17, 26 and 108; real worker exit additionally retained capacity hold; no native model-cost enforcement |
| One account across project sets | Partial | Original line 17 shares canonical pool across two projects; no actual set objects/UI exercised |
| Completion-to-learning crash | Partial | Original line 64 reopens durable pending/captured/no-useful-lesson records; native worker outcome-to-learning integration absent |
| Scoped learning promotion/rollback | Partial | Original line 64 validates reviewer/destination/version and rollback; production retrieval/effectiveness untested |
| UI/chat reconnect without replay | Partial | Original line 82 read model and revocation checks; actual coordinator journal recovery now demonstrated; browser/SSE/outbound delivery absent |
| Malicious content cannot forge authority | Partial | Original lines 54 and 135; typed native fence rejection now proven; real authentication/tool permission enforcement absent |
| Whole-PR usage | Partial | Original line 74 inserts five stage-labeled receipts on one run; no actual PR/retry/review/model usage collected |
| Pending stop versus confirmed termination | Pass (component); full-engine unknown | Actual provider Stop acknowledgment retained lane; stale callback refused; kernel/PID/start-identity plus matching fence released lane; funding hold retained |

### Follow-up validation scope

`npm run check:focused -- tests/gas-city-evaluation.test.mjs
tests/gas-city-runtime-trial.test.mjs` exited 0: 134 passed, zero failed or skipped,
including 17 existing adapter tests, three new cleanup regression tests and
required conventions; roadmap/render/inbox/whitespace passed. The isolated
three-test cleanup run used the repository ledger reporter: no flaky or slower
test was reported (three busy runs excluded from comparison). Raw follow-up logs
are retained in `task-3/gas-city-runtime-trial/logs`; evidence JSON records their
hashes. Documentation results were updated afterward and whitespace rechecked.
The unchanged full suite from
`0c584d7f` is historical evidence (3,914 pass, four opt-in Docker skips), not a
new full-suite claim for these additions. It was not rerun, as requested. No
production source/route, existing experiment behavior, upstream source, model
credential or routine was changed. Remaining work includes full-city request
reconciliation, authenticated conversations, native usage enforcement and
production learning integration; these remain engineering work, not simply
missing credentials.
