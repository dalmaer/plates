---
status: built
since: 2026-10-24
goal: G3
spec: 2
depends: [120]
review: wait
note: "Source verification, immutable inbox records and plan bindings merged; real lesson benefit remains unverified."
evidence: ["evidence/2026-10-24-evaluated-lessons.md"]
---

# Bind selected review lessons to hypotheses and evaluation plans

## Done when

Selected real findings form deduplicated, scoped hypotheses with append-only transitions and comparison references in the existing learn records.

## Scope

Implement the corresponding slice of [review-learning-evaluation](../specs/review-learning-evaluation.md).
The [record implementation contract](../specs/evaluated-learning-records.md)
settles this slice. Phase 120 is implemented in its dependent PR. Phase 119’s
former review-limit hold was resolved by PR #249 merging on 27 October 2026.
Land this record work after the corpus integration, with fresh checks and review.
Reuse the existing experiment, learn, execution and evidence mechanisms. Do not
introduce a second scheduler, evidence authority or automatic production default.

## Acceptance

- [x] Transitions preserve rationale, provenance and legacy projections; missing evidence and legacy acceptance bypass refuse: `tests/evaluated-lessons.test.mjs`.
- [x] CLI JSON/help, compatibility, bounds and failure paths are covered: `npm run check:focused -- tests/evaluated-lessons.test.mjs`.
- [x] Integrated gates and selected contracts pass: `npm run check`; `npm run typecheck`.

## Real surfaces

- owner's machine: use a fresh private external workspace and synthetic Acme fixture; retain exact invocation and receipt identities before claiming built.

## Proof

Implemented focused proof:
`npm run check:focused -- tests/evaluated-lessons.test.mjs`. The conductor runs
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

Bind one real proposed improvement to the supported measured comparison.
Real lesson benefit still requires that separately approved comparison.

## Trajectory

- **2026-10-24** — Source inspection found that current-head review filtering would exclude the original historical finding, legacy serialization discards unknown sections, and configuration records have no patch field. Verify historical membership separately, guard tagged rewrites, and derive material-overlay patches from actual retained bytes. Preserve older proposal versions and refuse unsupported promotion transitions.

- **2026-11-01** — Fresh GitHub facts resolve the old phase 119 merge hold:
  PR #249 merged at `d4fd36d82b68321b7c5ae9fd7939fe6482a76a64` on 27 October.
  Integrate the existing corpus and record PRs in dependency order without
  treating offline records as measured lesson improvement.
