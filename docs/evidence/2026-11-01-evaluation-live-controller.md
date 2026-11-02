# One-slot live evaluation controller — 1 November 2026

Phase119 remains partial. This record distinguishes synthetic execution machinery
from real agent efficacy. No real provider request, real credential read, paid
trial or production activation occurred during the observations below.

Contract: [one-slot integration](../specs/harness-live-integration.md).
Base: 87c268c5823e2c3133ecfd727c8924262fc44383 plus working implementation.
The input partition subsequently merged in
[PR #310](https://github.com/dalmaer/plates/pull/310), at
621949e41e265fcbf51b8a6809a730c651ccb428; that merge does not accept phase119.

## Independently verified I/O boundary

The conductor ran:

```sh
node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/evaluation-provider.test.mjs tests/validation-request-budget.test.mjs tests/evaluation-credential-pipe.test.mjs
```

Exit0, 44 passed, no failed or skipped tests; no flaky/slower hygiene findings.
Log: `/tmp/phase119-parent-io-verification.log`. This is focused proof, not the
required integrated gate.

On Node24.22.1/macOS, an actual anonymous FIFO deliberately inherited at fd50
remained absent from ordinary Node and preparatory Git children. An explicit
forwarding control detected the original descriptor. Pending reads allowed timers
to run; EOF, cancellation, timeout, oversize and malformed envelopes closed the
owned descriptor. Regular files, sockets and stdio refused before ownership.
Linux and other platforms are explicitly unsupported by this credential channel.
No assertion is made about physical erasure of JavaScript strings.

Provider result timeout does not establish local transport closure. An opaque
operation-bound completion witness or internally observed original owner exit
controls host-capacity release. EPERM, live/reused PIDs and forged completion
objects cannot release capacity. Host release does not settle unknown money.

The builder's five isolated negative controls failed at their intended assertions:
premature completion, forged completion, EPERM-as-death, omitted pipe closure,
and permissive duplicate-key parsing. Exact commands, mutations, original failures
and stable file hashes are retained in `/tmp/phase119-live-io-proof.md` and
`/tmp/phase119-live-io-final-control-manifest.json`.

The initial provider run failed its existing chunk-reader cancellation assertion
(26 passed, one failed). Restoring EOF cancellation corrected the regression;
the new lifecycle witness additionally awaits cleanup. The first log remains
`/tmp/phase119-live-io-first.log`; its shell appended another command and returned
zero, so the failing Node report, not that shell status, owns the observation.

## Independently verified retained records

The conductor ran the same reporter command with
`tests/evaluation-live-records.test.mjs`: exit0, 17 passed, no failures/skips and
clean hygiene (`/tmp/phase119-parent-records-verification.log`). It covers strict
descriptors, original-ID recovery/accounting, local-only recovery, predecessor
links, immutable modes, elapsed deadlines, unavailable coverage, and actual versus
remaining storage accounting, including real spend initialization prefixes.

Seven isolated negative controls caught relaxed shapes, source bindings,
predecessors, modes, double-counted storage, reset elapsed time and incomplete
accounting. The builder's exact commands and original failures remain in
`/tmp/phase119-live-records-handoff.md` and
`/tmp/phase119-live-records-controls-results-02.json`. Their baseline contained
16 tests, before the final added prefix test; no later control run is implied.

## Shared absolute deadlines

The conductor ran the same reporter command with
`tests/evaluation-live-deadlines.test.mjs`: exit0, seven passed, no failures/skips,
clean hygiene (`/tmp/phase119-parent-deadline-verification.log`). Expired Docker
observations issue zero commands; the inspect/unpause/kill sequence shares its
remaining interval. External reserve, settlement and reconciliation forward the
same deadline through coordinator contention without changing omitted-deadline
offline behavior. Four isolated controls caught a reset Docker interval and each
missing coordinator deadline forwarding. Exact APIs and proof are retained in
`/tmp/phase119-live-deadline-api.md` and its linked control manifest. Docker here
was a synthetic executable; this is not a real container walk.

## Installed synthetic path

The conductor ran the same reporter command with
`tests/evaluation-live-cli.test.mjs tests/evaluation-live-records.test.mjs`:
exit0, 24 passed (six installed scenarios and 18 records tests), no failures/skips,
clean hygiene. Log: `/tmp/phase119-parent-installed-verification.log`.
The earlier 17-record test observation above preceded the added recovery guard.

The tests pack and install unchanged production modules into an external consumer,
with synthetic Acme catalog/classification/evaluator data authored before packing.
They use actual CLI preview/approval, frozen records, FIFO delivery, spend records,
partitioning and conversion. An isolated preload supplies synthetic provider fetch;
a fake Docker executable runs a fixed protected oracle. Correct output is accepted,
valid wrong output is rejected, and provider/builder inputs exclude private canaries.
Original-ID GET, no-ID generation, pending count, and already-closed count recovery
retain original identities, spend bytes and verdicts without duplicate effects.
This is installed machinery proof, not real-container isolation or model efficacy.

The first installed recovery run found three production mismatches in exact prior
settlement handling (`/tmp/phase119-live-installed-05.log`). The contract correction
in 8917cefd requires an already-released count settlement to match the retained
original count-local receipt exactly; it does not invent owner exit or settle money.
Generation recovery preserves original undispatched observations without adding
fields that would change their identity. Fixture failures and every earlier run
remain listed in `/tmp/phase119-live-installed-handoff.md`.

Two installed negative controls catch bypassed acceptance and private-input transfer;
two records controls catch the previous incompatible rule and missing original
completion provenance. Exact commands and results are retained in
`/tmp/phase119-live-installed-controls-results.json` and
`/tmp/phase119-live-records-correction-controls-results.json`.

## Provenance and integrated validation

The installed evaluation module/data inventory check passed alone with clean hygiene
(`/tmp/phase119-provenance-inventory-focused.log`). Controller identity now includes
live execution, provider/credential/packet boundaries and the curated evaluator data.
Early selected-contract typecheck exited0 (`/tmp/phase119-live-early-typecheck.log`).
These observations do not replace the final integrated checkpoint.

Required final commands: `npm run check:focused --` with the affected evaluation,
coordinator and capability tests; `npm run check`; `npm run typecheck`. Source pins,
conventions and final review must cover the complete integrated tree.

The first integrated `npm run check` exited1: 4,183 passed, seven failed and 12
skipped; all ten timing-stall checks passed. Four installed cases failed during
count with writer-closed/stuck errors under full concurrency; the fixture requested
a one-second provider timeout and its resulting four-second stage budget was too
short for that loaded path. Three surface-budget assertions caught the missing
`--credential-fd` declaration. Original log: `/tmp/phase119-live-full-check.log`.
Corrections and a fresh integrated checkpoint must precede publication; this
failed run is not replaced by earlier focused successes.

The fixture now authors a 20-second count timeout, reserving 23 seconds within
its unchanged two-minute case allowance. An isolated 5.5-second pause at the first
real immutable intent write proves the original four-second reservation fails
closed with zero calls, while the corrected reservation succeeds exactly once.
Production clocks, credential bounds and ten-second recovery are unchanged.
Seven installed tests passed after this concrete change; exact proof is retained
in `/tmp/phase119-live-installed-slack-handoff.md`. The surface declaration now
names the new flag and its boundary; its three tests pass in
`/tmp/phase119-surface-correction.log`. A corrected full checkpoint is still required.

The corrected integrated run also exited1: 4,190 passed, one failed and 12
skipped; all ten timing-stall checks passed. The remaining installed original-ID
GET case refused with `remaining reconcile schedule cannot fit` before its
expected recovery completed. Original log:
`/tmp/phase119-live-full-check-corrected.log`. The count/surface corrections held;
the fixed ten-second recovery path still needs a causal correction and fresh
integrated verification. Neither failure is erased by a later passing check.

The recovery correction removes redundant work rather than extending its clock.
Writer retention now uses the same fresh canonical inventory scan as full
inspection, without the extra spending replay and graph projection that capacity
accounting did not consume. Full authority checks remain unchanged. No snapshot
cache, deadline or test-runner change was introduced. Twenty-two record tests and
five writer tests passed; causal controls restore the duplicate read and remove
mode/mtime guards to demonstrate failures. Exact proof:
`/tmp/phase119-live-inventory-handoff.md` and
`/tmp/phase119-live-inventory-writer-handoff.md`. Loaded recovery success still
requires the next integrated checkpoint.

## Remaining real evaluation

V1 supplies reviewed configuration material as public file data, without explicit
harness instruction/skill routing. A real instruction-treatment comparison needs
a versioned guidance designation and delegation before claiming that treatment.
The real comparison also needs explicitly reviewed current-harness and candidate
context, a resolved model/runtime identity, attributable pricing for every paid
operation, and the owner's exact bounded comparison approval. Five pairs each of
target and control remain required. A single-generation experiment cannot by
itself establish improvement of the full multi-agent workflow. Live aggregate
resume and hosted activation remain unsupported.

Comparison `currencyUsd` currently remains unknown even when the spend ledger has
complete priced usage. Before real screening, a versioned read-only report
projection must expose that estimate and its provenance, count/generation/GET
coverage and unknown holds without treating it as an invoice or rewriting original
results. This is a reporting gap, not evidence of zero cost.

The third integrated run exited1: 4,195 passed, one failed and 12 skipped; all
ten timing-stall checks passed. The same original-ID GET refused with
`remaining reconcile schedule cannot fit`; its total scenario duration was
20.8 seconds versus 35.4 seconds previously, not a measurement of GET latency.
Log: `/tmp/phase119-live-full-check-inventory.log`. Reduced duplicate reads did
not establish reliable recovery under the parallel suite's load. The adopted
source validation contract now places the identical installed assertions in a
mandatory sequential stage with its own receipt plan. Production clocks and
acceptance remain unchanged; the new full gate still needs verification.

Current installed proof path is now
`tests/installed/evaluation-live-cli.test.mjs`; earlier paths above retain the
commands actually executed. The sequential-stage guard covers exact mandatory
wiring, a disjoint complete file-selection union, child failure propagation and
missing-file refusal. Causal controls remove the stage or swallow a child failure
and both fail. Separate literal receipt plans preserve the outer gate identity.
Proof: `/tmp/phase119-serial-stage-proof.md`.

The conductor ran the actual `npm run test:installed` stage once: seven passed,
zero failed/skipped, exit0; log `/tmp/phase119-serial-parent-installed.log`.
The updated source preflight passed all 118 checks and required conventions,
roadmap/render/inbox/whitespace guards, exit0; log
`/tmp/phase119-serial-preflight.log`. Selected typecheck exited0
(`/tmp/phase119-serial-typecheck.log`). These are distinct from the required
final configured gate, whose result belongs in the implementation commit.

The fourth integrated run exited1: 4,192 passed, one failed and 12 skipped;
all ten timing-stall checks passed. The later installed stage was not run because
the ordinary suite failed. The Docker deadline unit expected `inspect/unpause`
inside 400 ms but observed only `inspect`, a valid earlier deadline refusal.
Log: `/tmp/phase119-live-full-check-serial.log`. Its unit proof now needs a
controlled logical deadline at the exact boundary, while real-clock subprocess,
credential and coordinator checks join the existing mandatory sequential stage.
This addresses the shared scheduling assumption without relaxing production
clocks, replacing real installed proof, or accepting a failed stage.

The first four failed gates and their correction proofs are also retained as
read-only files under the canonical checkout's ignored
`.plates/test-runs/phase119-implementation-2026-11-01/`; the exact size/hash
manifest is `inventory-through-fourth-gate.json`. This preserves the original
logs beyond the temporary integration checkout without publishing fixture output.

The shared scheduling correction includes live transfer, request-budget,
credential-pipe and Docker/coordinator deadline tests in the existing explicit
sequential stage. Their real timeout/FD/process assertions remain. The precise
Docker step-boundary unit uses a controlled clock and signal to prove that the
next command never starts after expiry; removing both guards produces the
forbidden `kill` and final `inspect`. This is deadline-accounting proof, distinct
from the unchanged real-clock installed CLI walk. Handoffs:
`/tmp/phase119-deadline-shape-proof.md` and
`/tmp/phase119-installed-deadline-shape-handoff.md`. No old stall obligation or
production deadline changed.

The conductor verified the full five-file sequential stage: 44 passed, zero
failed/skipped, exit0 (`/tmp/phase119-shape-parent-installed.log`). Corrected
source preflight passed 118 tests plus conventions and roadmap/render/inbox/
whitespace guards, exit0 (`/tmp/phase119-shape-preflight.log`); typecheck exited0
(`/tmp/phase119-shape-typecheck.log`). The final configured gate remains separate.

The fifth gate exited1: 4,155 passed, one failed and 12 skipped; all ten stall
checks passed and the subsequent installed stage was not run. Existing shared
budget contention coverage read `state.json` while the active wrapper atomically
replaced it; the strict reader correctly refused the unlinked inode with
`unsafe_input_file`. The neighboring competing-writers test already avoids this
race by inspecting after wrapper settlement. Log:
`/tmp/phase119-live-full-check-shape.log`. Correct the sibling test's observation
boundary; never catch away the unsafe-read error or weaken the production reader.

The contention correction changes only test observations: actual denied admissions
prove active contention; settled records prove the resulting identity/history.
PID-sensitive sibling barriers acquire their own empty fixture coordinator guard
before reading and release it before yielding. The deliberate production unlink
proof is unchanged. Both restored active-read counterfactuals fail with
`unsafe_input_file`; exact proof is `/tmp/phase119-contention-handoff.md` and
`/tmp/phase119-contention-controls-results.json`. The conductor's focused preflight
passed all 148 tests plus required conventions/guards, exit0
(`/tmp/phase119-contention-preflight.log`). Selected production typecheck inputs
are unchanged from the successful `/tmp/phase119-shape-typecheck.log` run.

## PR 313 review: generation capacity refusal

The first review identified a real starvation path: capacity refusal after a
generation intent left the original slot uncertain and blocked other missing
work. The correction validates the original count, exact generation request,
sealed refusal and undispatched spend reservation before reporting a terminal
infrastructure outcome. Acceptance and currency remain unknown; the original
slot stays consumed and its reservation held. Contradictory recovery or dispatch
evidence stays blocked. No provider operation or budget release is added.

Focused builder evidence: 47 record/report tests and eight installed CLI tests
passed. The installed case uses actual synthetic coordinator contention and
checks no generation effects, replacement or refund, then previews another
missing slot. The conductor independently ran `plates prove` for
`bound generation refusal terminates`, reverting only the three production
files against `86574525`: VERIFIED, assertion failure without the correction
and success with it. Original JSON: `/tmp/phase119-generation-refusal-prove.json`.
Three additional negative controls cover baseline behavior, singular recovery
target binding and request identity. Evidence:
`/tmp/phase119-generation-refusal-handoff.md` and
`/tmp/phase119-generation-refusal-installed-proof.md`.

## Current recovery guidance

Current comparison reports now project per-operation identity, evidence, missing
prerequisites and a concrete inspection or preview action. They distinguish
consumed recovery, missing work, original-response GET, local-only recovery,
closed admission, terminal refusal and unavailable evidence. Every action remains
non-authorizing. No retained V1/V2 report or immutable receipt is rewritten.

Offline inspection retains validated control observations for reporting, with
malformed, foreign, unsafe and orphan records explicit as coverage gaps. Live
generation refusal guidance revalidates original provenance rather than trusting
a cached reason. Original operations and reserved money remain separate from
acceptance and any new action.

The integrated focused proof passed 118 tests with one opt-in Docker skip.
Disk-backed tests cover interrupted controls, closed admission, malformed and
unsafe directories, original GET/local-only evidence, and orphan operation
prefixes. Controlled mutations of recovery choice, consumed allowance and
refusal validation each fail their assertion. Commands and logs are retained in
`/tmp/phase119-recovery-actions-handoff.md` and
`/tmp/phase119-recovery-actions-merge-handoff.md`.

## Current guidance review corrections

Independent source review identified cancellation attribution and pre-provider
operation identity gaps. Reproduction narrowed the first claim: funded storage
already closes admission through the spend reader; the actual gaps were missing
cancellation evidence references and unknown closure without spend storage. The
initial incorrect fixture assumption and corrected failing baseline are retained.

Current live inspection now projects validated canonical cancellation coverage;
missing/foreign controls stay gaps. Generation-prefix guidance derives the same
original operation identity used by recovery, rather than the builder receipt ID.
A disk-backed descriptor test passes actual preparation without provider or
subprocess effects. The conductor's `plates prove` reports VERIFIED: baseline
assertions fail and corrected code passes. Focused proof passed 122 tests with one
opt-in Docker skip. Historical report projections remain unchanged. Exact logs
and controls: `/tmp/phase119-actions-review-fix-handoff.md`; causal proof JSON:
`/tmp/phase119-actions-review-fix-prove.json`.
