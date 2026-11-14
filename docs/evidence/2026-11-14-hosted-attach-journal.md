---
attempt: {"accepted":false,"verified":false,"rework":2,"lessonStatus":{"status":"known","lesson":"Plates lesson 29: reaching the end of a run does not establish success"}}
---

# Phase 181: durable attach publication stages

Date: 2026-11-14. Base: `5e16d19174e2680dcb8661f1ba276e36078349a4`
plus working tree. Existing phase claim was revalidated as this conductor's in
this checkout. Fresh decision context is not-configured, not accepted coverage.

## Intended increment

Extend the existing decision operation journal with three fixed effect fences:
scoped credential mint, commit object publication and create-only ref publication.
One operation retains its immutable encrypted intent, original preview/scope,
project reservation and separately retained encrypted stage observations.
A successful begin acknowledgment grants its effect once; readback and ambiguous
acknowledgments grant nothing. Generic decision transitions cannot bypass attach
stages. Original legacy callers and their forwarding RPC remain supported.

This is source-only dormant machinery. The migration is registered in the existing
owner-attended activation plan but has not been applied. No route, provider call,
credential, permission, database or budget changed. Source installation is not
hosted activation. The provider adapter still needs a durable hook between mint
and commit; a request-local credential cannot be recovered after process loss.

## Proof required

Run the affected operation-store, migration compatibility, activation-plan and
hosted-proof tests through the required focused preflight, then typecheck. The
serialized integrator runs the final `npm run check` once. SQL proof runs on local
PGlite; replaying a two-connection race serially does not establish real hosted
lock behavior. Keep the original failure and any correction evidence below.

## Review direction

Early conductor review required stage observations to survive later stages, rather
than replacing the last encrypted observation. Preserve bounded per-stage evidence
inside the same row. This neither creates a second evidence store nor treats a
commit object as an accepted task result.

## Recovery and remaining acceptance

Keep hosted attach disabled until the controller, explicit journal acknowledgments,
history projection and authorized provider/database checks are connected. Never
remint after an uncertain mint or republish an original commit/ref after a lost
reply. Inspect the original identity and retain blocked/uncertain status. Do not
downgrade staged journal semantics while unresolved operations exist. Actual
agent execution, reconnect, bounded provider-start recovery and the owner's
exact-version acceptance walk remain outstanding.

## First conductor preflight (2026-11-14)

The combined preflight exited 1: 214 passed and two reported failures (one
activation-plan subtest and its parent suite). The new plan entry did not use
the required explicit phrase naming the applied file and SHA-256. Corrected
the plan entry and regenerated its guide; no SQL or adapter behavior changed.
Typecheck exited 0. Six isolated mutation controls each failed at assertions or
the strict response boundary; driver exited 0. The builder's initial mutation
harness had rejected that strict-response failure classification; the corrected
harness retained it without changing implementation bytes.

## Corrected source proof (2026-11-14)

Conductor command `npm run check:focused -- tests/web-attach-operation-store.test.mjs tests/web-migrations.test.mjs tests/web-hosted-proofs.test.mjs tests/web-activation-plan.test.mjs tests/web-operations.test.mjs tests/web-run-receipts.test.mjs tests/web-walk-operations.test.mjs` exited 0: 216 passed, zero failed, including required conventions and generated record checks. `npm run typecheck` exited 0.

The conductor ran six isolated mutations covering stage CAS, appended history,
retained-report replacement, generic bypass, read grants and decoder grants; each
was detected and the driver exited 0. The separate SQL proof builder's focused
proof tests passed 32 checks, including 15 wrong-fact controls; those tests are
also included in the conductor preflight. Independent review of the core found
no actionable issues; the core builder independently inspected the proof.

No hosted database was contacted. The proof's two-tab race was replayed serially
on PGlite and remains unverified on the hosted database. Migration application,
controller wiring, provider enforcement and owner acceptance remain outstanding.

## Integrated result (2026-11-14)

Source `c0991ea3ef2321cf01474655f8def1840cb4c05d` landed on main at
`0b50be36396ef0cdbd1d27130fec93a6f8ef1e4a`. One serialized `npm run check`
exited 0: 4,725 passed, 12 skipped, zero failed; installed checks: 45 passed,
zero failed. Integration record `9ae86d2aa94715b99e95ad3de9df4a92e164cd2e`
on `plates-integrations`. Migration 020 remains unapplied and hosted attach
remains disabled.

GitHub CI for the merged source completed successfully: [run 43647852460](https://github.com/dalmaer/plates/actions/runs/43647852460). This does not apply the hosted migration.
