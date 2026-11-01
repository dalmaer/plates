---
status: built
since: 2026-10-24
goal: G5
spec: 2
depends: [119]
review: wait
note: "Six historical development cases merged with offline proof; held-out coverage and measured agent benefit remain unverified."
evidence: ["evidence/2026-10-23-evaluation-corpus.md"]
---

# Freeze six historically grounded development cases

## Done when

All six historical case definitions retain source provenance, independent acceptance and explicit development versus held-out exposure.

## Scope

Implement the corresponding slice of [harness-regression-evaluation](../specs/harness-regression-evaluation.md), including its dated Phase 120 corpus contract.
Independent corpus preparation uses phase 119’s offline interfaces without its
missing live-provider activation. PR #249 merged on 27 October 2026; its former dependency merge hold is resolved.
The current integration still requires fresh checks and review.
Reuse the existing experiment, learn, execution and evidence mechanisms. Do not
introduce a second scheduler, evidence authority or automatic production default.

## Acceptance

- [x] Case fixtures prove compatibility, recovery, initialization, scoped repair, integration and ordinary control contracts without exposing fixes to builders: `tests/evaluation-corpus.test.mjs`.
- [x] CLI JSON/help, compatibility, bounds and failure paths are covered: `npm run check:focused -- tests/evaluation-corpus.test.mjs`.
- [x] Integrated gates and selected contracts pass: `npm run check`; `npm run typecheck`.

## Real surfaces

- owner's machine: use a fresh private external workspace and synthetic Acme fixture; retain exact invocation and receipt identities before claiming built.

## Proof

Implemented focused proof:
`npm run check:focused -- tests/evaluation-corpus.test.mjs`. The conductor runs
`npm run check` and `npm run typecheck` on the integrated implementation.
Record negative controls and original failures in an evidence file. Live model
work requires the exact approved comparison preview and retained provider receipts;
offline fixtures establish machinery only.

## Deliberately open

Provider activation, actual minute/currency allowance and practical cost tolerances
remain owner decisions before live work. Held-out cases are not yet authored;
public historical cases establish development coverage only. Existing handoff
experiments, hosted activation and fleet schedules are not changed by this phase.

## Next action

Use the frozen development cases in phase119’s real comparison once its live
path and exact allowance are ready. Keep held-out coverage zero; offline fixture
outcomes do not establish measured agent benefit.

## Trajectory

- **2026-10-23** — The broad canvas snapshot dependency chain exceeds delivery bounds. Scope the recovery case to the actual caller-supplied-card APIs used by its original regression; preserve crash/retry and human-edit assertions, disclose excluded snapshot/export coverage, and prove the exercised closure before calling it runnable.

- **2026-11-01** — Fresh GitHub facts confirm PR #249 merged at
  `d4fd36d82b68321b7c5ae9fd7939fe6482a76a64` on 27 October. Its old review-limit
  hold no longer blocks this corpus PR. Preserve original observations and
  refresh integration checks/review against current main before landing.
