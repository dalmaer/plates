# Overnight decision envelope

Phase [162](../phases/162-overnight-decisions-remain-bounded-and-reviewable.md),
increments 1 (envelope) and 2 (journal). It implements the envelope from the
[Nightwatch design extension](../research/2026-10-14-nightwatch.md#extension-bounded-overnight-decisions-2026-11-02-designed-not-implemented).
Modules: `lib/night-decisions.mjs` (envelope) and `lib/night-journal.mjs` (journal). Tests: `tests/night-decisions.test.mjs`.

An envelope records one choice a night made, or parked. The module validates
and reads envelopes. It never runs, writes, routes or grants anything. The night
plan (schema 1, strict) is unchanged. It gains no field, and no plan field
becomes active because an envelope exists. Harness routing (3), the morning section (4) and feedback (5) come later.

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

## Journal

`appendEnvelope` adds one JSON line per revision,
`{ journal: 1, key, at, envelope }`, to `.plates/night/decisions/<night>.jsonl`.
That file sits beside the working plan, in the night's working directory, which
ignores itself and is never committed. The journal does not go to three other
places:

- **The plan branch.** `plates goodnight` force-pushes a one-file, parentless
  commit there, which would erase a journal kept beside the plan.
- **`docs/` decision records.** A model's choice never becomes a source decision.
- **A branch of a possibly public repository.** Raw journals stay in private
  runtime state.

An explicit absolute `dir` outside the checkout is accepted for an approved
private destination. Inside the checkout, only `.plates/night/` is accepted.
Symlinked directories or files are refused.

Every write is checked first. The envelope is validated against the night's
working plan, so it must bind to an existing item. It is checked against phase
150's current decision records (`collectDecisions`), and an unreadable record
blocks the write. It is also checked against the latest revision of the same
decision in the journal.

- **Keyed by the original operation.** The key is `operation:<id>`, or
  `decision:<id>` when nothing was dispatched. One operation belongs to one
  decision.
- **Idempotent.** An identical revision is a no-op, and the reader counts a
  repeated line as one fact.
- **Append-only.** Earlier lines stay. Receipts, effects, observations and
  attempts only grow. The choice, authority, recovery and decision state never
  change in place. A correction is a new decision (increment 5).
- **No redispatch.** A `running` or `uncertain` operation gets no new attempt
  and no new operation id. It resolves to `completed` or `failed` from its
  original receipt. A `failed` operation may be retried as exactly one new
  attempt of the same operation. A `completed` action is final.
- **Reading.** `readJournal` reports `absent`, `read` or `unreadable`. Each line
  is read through `readEnvelope`, so older shapes keep their unknowns. A torn or
  foreign line is a gap, and appending past a gap is refused.
- **Lock.** A held lock file is reported, never broken.
- **Resume.** `resumeStep` gives what a resume may do: `inspect` for an
  uncertain or running operation, `retry-allowed`, `start-allowed`, `done` or
  `parked`. It never runs anything.

Nothing pushes the journal, routes a question, or shows anything in the morning
yet. The private runtime destination for a hosted runner is selected before
routing is activated.
