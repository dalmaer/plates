---
attempt: {"accepted":false,"verified":false,"rework":1,"lessonStatus":{"status":"known","lesson":59}}
---

# Phase 162: assess one-way and two-way effects

## Scope and source

2026-11-18, base `9a987b1e5b57267e3de5a497bc1b271b02eb7f3c`, isolated
`codex/phase-162-door-policy` candidate. Extends phase 162's existing decision
and recovery concepts; no runtime hook, permission store or scheduler. The owner
asked for consequence-based one-way/two-way door policy after discussing AGY
approval friction. Source decision context was `not-configured`, not verified
architecture coverage.

## Implemented increment

`assessDoor` evaluates all declared effects and recovery evidence, with explicit
unknowns. The source-only `scripts/assess-door.mjs` reads JSON and prints a decision
card or JSON. One-way effects retain existing exact authorization review rather
than manufacturing a repeated approval. Known refusals stay blocked; uncertain
execution points to the original receipt. No result authorizes execution.

The builder implemented the module, script and synthetic tests; the conductor
reviewed the boundary and requested missing-identity, existing-authorization and
sanitized-error cases before the integrated checkpoint. No new lesson is claimed.

## Observed checks

- Builder: ten focused tests passed, zero failures; no flaky/slow hygiene note.
- Conductor: the synthetic unpublished-label sample printed `two-way` and
  `continue-within-existing-authority`, together with `authorizesExecution: false`
  and declared-not-verified attribution. No tool or permission change followed.
- Conductor preflight: 167 tests passed, zero failures; render, roadmap, inbox and whitespace stages passed (exit 0). Typecheck passed (exit 0).
- Required preflight command: `npm run check:focused -- tests/night-door-policy.test.mjs tests/night-decisions.test.mjs`.
- Integrated checkpoint: `npm run check` through the existing integration lane,
  with `npm run typecheck`. The integration receipt/commit owns those results;
  this evidence does not claim they passed before running.

## Remaining acceptance

No AGY hook installed, no cached approval persisted, no real decision authorized,
no live model evaluation, and no claim of fewer interruptions. Hook ordering,
version compatibility, actual permission-event capture and trusted effect/authority
resolution remain unverified. The source assessor accepts explicit descriptions;
it cannot independently discover all effects of arbitrary shell code. Never wire
its recommendation directly to auto-approval. Phase 162 remains partial; optional
question routing, morning delivery and the real night/correction walk remain open.
