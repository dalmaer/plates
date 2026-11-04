# Overnight decision envelope

Phase [162](../phases/162-overnight-decisions-remain-bounded-and-reviewable.md),
increment 1. It implements the envelope from the
[Nightwatch design extension](../research/2026-10-14-nightwatch.md#extension-bounded-overnight-decisions-2026-11-02-designed-not-implemented).
Module: `lib/night-decisions.mjs`. Tests: `tests/night-decisions.test.mjs`.

An envelope records one choice a night made, or parked. The module validates
and reads envelopes. It never runs, writes, routes or grants anything. The night
plan (schema 1, strict) is unchanged. It gains no field, and no plan field
becomes active because an envelope exists. Journal writes (increment 2),
harness routing (3), the morning section (4) and feedback (5) come later.

## Shape (schema 1)

| Group | Fields | Meaning |
| --- | --- | --- |
| Identity | `schema`, `id`, `night`, `planItem`, `operation {id, attempts}`, `sourceRevision`, `authority [{kind, ref, digest?}]`, `dependsOn` | Binds the choice to an existing item in that night's plan and to existing authority, by reference only. |
| Choice | `question`, `alternatives`, `selected` (null when parked), `rationale`, `evidence`, `confidence` (`low`/`medium`/`high`/`unknown`), `unknowns`, `affects` (decision record refs) | Confidence is an attributed label, not a probability. |
| Consequences | `expects`, `checkBy`, `interactions [{with, expects}]`, `observations [{basis, evidence, version, window, denominator, result}]` | `basis` is `simulation`, `observation` or `unavailable`. Unavailable evidence has a null result. Null is not zero. |
| Change | `commits`, `flags`, `configuration`, `references`, `validation [{command, outcome}]`, `effects` | A decision and a successful side effect are separate facts. |
| Recovery | `door` (phase 150's `reversible`/`windowed`/`irreversible`), `preconditions`, `knownGood`, `steps`, `limits`, `expires` | An irreversible door is never reverted. |
| State | `decision` (`chosen`/`parked`/`revisited`), `parked {missing, dependents, next}`, `action` (`not-started`/`running`/`completed`/`failed`/`uncertain`), `receipts` | The action state comes from the original operation receipts. |
| Follow-up | `followUp: null \| {of, requested, source, observed, result}` | `keep`/`adjust`/`revert` map onto phase 150's `held`/`adjust`/`reverse`. |

**Unknowns are explicit.** A fact that is not known holds `{ "unknown": "<why>" }`.
`validateEnvelope` refuses an absent field, so a writer cannot drop a fact
silently. `schema`, `id`, `night`, `planItem`, the question, `selected`,
`confidence` and the state can never be unknown.

## Rules

- A parked choice selects nothing, names what is missing, its dependents and the
  next action, and its dependent action is `not-started`.
- A chosen option selects one of its alternatives. It needs known authority that
  includes `{kind: plan-item, ref: <planItem>}`. Without that authority it parks.
- A `completed`, `failed` or `uncertain` action names its original receipt. A
  `completed` action also names its effect receipt.
- An envelope cannot hold approval. A field resembling approval, consent,
  permission, override or a hook skip is rejected by name. `authority` kinds
  are only `plan-item`, `autonomy-policy` and `decision-record`.
- `contextProblems(envelope, { plan, decisions })` checks the envelope against
  its context. Its plan item must exist in the plan for that night, so an
  envelope cannot add work. A chosen option cannot affect an accepted decision
  record, and it cannot change a configuration path or flag listed in the plan's
  `willNotTouch`. That match is exact, or by prefix for a line ending in `/`.
  Free-text `willNotTouch` and `settledToday` lines are not machine-matched yet.

## Reading older shapes

`readEnvelope(value)` reads schema 1 and older shapes that have no `schema`
field. Each absent fact becomes `{ "unknown": "not recorded" }` and is listed in
`unknowns`. A missing `confidence` reads as `unknown`. A newer or foreign schema
returns a `gap`, never "no decision". The reader never mutates its input.
Phase 150's records, read by `collectDecisions`, are unchanged. An envelope only
references them through `affects`.
