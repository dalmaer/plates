---
attempt: {"accepted":false,"verified":false,"rework":1,"lessonStatus":{"status":"known","lesson":"Plates lesson 29: reaching the end of a run does not establish success"}}
---

# Phase 181: internal acknowledged claim flow

Date: 2026-11-14. Base: `0b50be36396ef0cdbd1d27130fec93a6f8ef1e4a`
plus working tree. The conductor revalidated its existing phase claim and refreshed
decision context (not-configured; no accepted decision coverage inferred).

## Implemented source increment

Compose the existing preview/operation identity, scoped publisher, ref transport
and staged journal. Require an exact durable acknowledgment immediately before
each provider effect, within the enclosing deadline. A missing, duplicate, late
or ambiguous acknowledgment stops the flow. Recovery reads original commit/ref
identity and records evidence without invoking a begin grant or publisher.

A fixed terminal not-claimed outcome represents a proven foreign holder before
any ref write. Its CAS competes with ref-begin and retains prior mint/commit
observations. A foreign holder observed after a possibly sent write remains
uncertain; an inspection's no-mutation property says nothing about prior writes.
Migration 021 extends the same journal and leaves historical 020 unchanged.

The internal flow is not an authorization interface. Hosted routes remain
unwired; current access, exact reviewed preview and write activation must be
verified by the future controller. Successful claim/brief availability is never
reported as running, dispatched or accepted. No new task store, runtime, scheduler,
permission or budget is introduced.

## Review direction

Conductor review required rejecting an alleged foreign winner equal to the
original commit before journal mutation, not only in response decoding. The
negative case must retain its original stage and project reservation. Blocked
and uncertain results need fixed reason/recovery-action codes, never raw provider
messages or an implied retry grant.

## Review and proof

Independent core review closed the prewrite-validation finding; independent
review of the SQL proof found no actionable gap within its stated scope. The
store rejects its own commit as an alleged foreign winner before mutation; the
test proves the original stage and reservation remain unchanged. Event-driven
cancellation tests release a real successful journal acknowledgment after abort
and assert no subsequent provider effect. A separate bounded deadline test
stalls the first journal request rather than racing setup against a short timer.

Builder focused verification: 47 tests passed, then the strengthened seven-test
flow fixture passed; exit 0 and no hygiene findings. The conductor independently
ran six isolated negative controls (exit 0): each mutant failed its intended
assertion with exit 1. They cover mint/ref acknowledgments, post-write foreign
ownership, same-commit decline before mutation, ambiguous database acknowledgment,
and false running attribution. They do not establish provider scope enforcement
or test-timing robustness. Initial mutation-driver setup failures are retained
separately from product evidence.

Conductor typecheck: `npm run typecheck`, exit 0. The first focused preflight
exited 2 before tests because sandboxed localhost binding returned EPERM;
its log is retained. The host-capable focused run exited 0: 245 passed, zero failed or skipped. It includes all affected tests,
legacy operations/receipts, migration/activation checks and mandatory conventions.
Use actual local PGlite transitions with synthetic GitHub responses; this is
source proof, not real-provider or hosted concurrency evidence.

The required integrated checkpoint is the serialized `plates integrate` run of
`npm run check`, including installed-package tests and generated guards. Its
actual result is retained by the integrator and recorded after the commit; no
pre-commit full-gate result is claimed here.

## Activation and recovery boundary

No live database, token mint, claim, provider start, new paid evaluation or route
activation occurred. Migrations 020 and 021 await the existing owner-attended
activation process and hosted concurrency proof. Scope enforcement requires its
separately authorized controlled provider check. Exact preview persistence,
authenticated routing/history, actual execution and the owner walk remain work.
Preserve original operations and inspect uncertain effects; never downgrade the
journal or recreate an operation to get around a blocked outcome.
