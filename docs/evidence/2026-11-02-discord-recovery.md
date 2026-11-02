# Discord run-2 cleanup reconciliation

## Observed on 2 November 2026

Run-2 ended at its original deadline with no admitted task, model turn, handoff or
bot reply. The coordinator exited with code 1 after reporting uncertain cleanup.
Independent Docker metadata showed no deployment containers. Retained Docker
events show `kill`, `die` and `destroy` for the same worker at 11:28:42 UTC.
No inference was requested and no admission budget was reserved.

The implementation had two reproducible cleanup gaps: collecting subprocess
stdout on `exit` could truncate output, and Docker auto-removal between list and
inspect stranded a lease even though a fresh list would establish absence. Both
new regression tests failed before the fixes and passed afterward. The original
run did not retain a stage-specific error, so the exact failing query cannot be
established retrospectively; the lifecycle evidence is consistent with the
auto-removal race. Do not present this as an observed original stack trace.

The collector now waits for `close`. A failed inspect triggers one fresh list;
only a successful empty result confirms absence. Failed queries, still-listed
containers, unknown creation and mismatched labels remain fail-closed. Uncertain
cleanup writes fixed phase/code fields into the lease, not raw error bodies.

## Supported recovery performed

The new recovery command validated the original run-2 host/deployment digests,
the observed `exec:38272:exit:1` coordinator exit, private file ownership/modes,
exact lease identity and consumed trial. It checked for containers by deployment,
name, lease label and volume, and checked the dedicated network was empty.

The reviewed plan digest was
`664fe1c5f0ce0dabb6c4c0f8a129ed90f45166458e8591b2ec9712b2b08afc90`.
Apply repeated absence checks and archived the exact lease and `writer.lock`
under the run-2 state's `recovery/PLAN_DIGEST/` directory. Original bytes and
fingerprints are retained with `receipt.json`; the trial file was unchanged.
No lock was blindly deleted, no credentials were read and no containers started.
The original `run2-outcome.json` is preserved as the historical terminal result;
the recovery receipt records the later reconciliation.

Mocked recovery tests cover successful archival, missing exit evidence, a live
coordinator/bridge writer, remaining containers, occupied network, daemon errors,
changed plan bytes, mismatched identity, symlinks and failure after archival.
The latter retains `recovery.lock` and an intent receipt rather than reporting
success. A further negative control reproduced metadata changing during Docker
queries; recovery now compares the post-query snapshot against the approved
fingerprints before creating its guard or archive. The before-fix failure is
retained in `/tmp/ajaxian-recovery-race-before-fix.log`.
Full integrated/typecheck gates remain unrun; no publication occurred.

Verification on 2 November 2026: the following command passed all 197 focused and
convention tests, plus roadmap, render, inbox and whitespace stages. The runner
needed reviewed loopback-bind access; its first sandboxed preflight exited before
tests with `EPERM`. All pilot transport/provider operations used mocks.

```sh
npm run check:focused -- tests/discord-recovery.test.mjs tests/discord-host.test.mjs tests/discord-initialization.test.mjs tests/discord-adapters.test.mjs tests/discord-pilot.test.mjs tests/discord-trial.test.mjs
```

Output is retained in `/tmp/ajaxian-recovery-final-check.log`. Roadmap emitted
existing advisory notes, not failures. The cleanup before-fix failures remain in
`/tmp/ajaxian-cleanup-before-fix.log`. The recovery result summary and archival
byte verification are in `../runtime-setup/run2-recovery-result.json`.

The readiness-handshake proposal is documented in the host guide only. No live
time limit or activation configuration was changed, and no third test was run.
