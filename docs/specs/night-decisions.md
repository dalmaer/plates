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

## Door assessment before approval (phase 162, 2026-11-18)

The question is **what changes, who can observe it, and can we restore the prior
state within the existing authority and budget?** A familiar command or a history
of yeses is not the answer. `lib/night-door-policy.mjs` is a pure advisory boundary;
it performs no tools, grants, settings changes or journal writes.

- **Two-way:** every effect is understood and bounded, with a reliable recovery
  path, retained prior state, and affordable recovery. An unpublished tracked edit
  may qualify; an untracked overwrite without a preserved preimage does not.
- **One-way:** at least one effect cannot actually be undone. Examples include
  sending a message, exposing private data, consuming money, and destroying data
  without recovery. A compensating action is not erasure of the original effect.
- **Unknown:** the effect inventory, recovery evidence or limits are incomplete.
  “Probably safe,” a model's confidence and a Git revert command do not fill gaps.

Classify the whole operation, not its first benign step. A local edit followed by
publication has an external effect. A test script can invoke network operations;
its name alone cannot establish a two-way door. Treat changing script bytes,
symlink targets, executable identity and destinations as changed inputs.

Reversibility and authority are separate axes. A two-way door outside scope still
parks. A one-way door may proceed through existing exact authorization, but this
assessment never supplies that authorization. Preserve explicit denials, protected
paths, budgets, required hooks and original receipts. Inspect uncertain execution
before any new attempt, even if the intended action was reversible.

A decision-ready card should contain: intended effect; door and reasons; scope;
existing authority reference or missing decision; recovery steps, evidence and cost;
original operation receipt; next action. Display unknowns. Do not make a generic
“continue” button stand for approval of a new destination or changed bytes.

### AGY integration boundary (not enabled)

Use the supported PreToolUse contract only after version-specific tests establish
hook ordering and explicit deny/ask precedence. Preserve SidePulse and other hooks.
An observation handler must not accidentally force every action to ask. AGY's
`auto_approve` is distinct from `allow`; no hook output is emitted by this module.
Reference: [AGY hooks](https://antigravity.google/docs/hooks), inspected 2026-11-18.

Before enabling, test the actual adapter in observation mode, including compounded
shell operations, changed scripts, missing workspaces, stale evidence, denial,
hook failure and uncertain dispatch. Do not infer a human grant from PostToolUse
success or a terminal's permission-wait signal. Hook events describe observations;
only an authenticated explicit owner decision can establish a reusable grant.

If approval reuse is added, reference existing scoped authority and receipts;
never create a second authority store. Bind reuse to operation/effects, project,
paths, destination, policy version, relevant bytes and expiry. Broadening any of
these requires reevaluation. Keep private sanitized observation records outside
Git; do not store credentials, raw prompts or raw tool arguments. No global skip
flag, permission expansion or paid evaluation is part of this increment.

### Examples for the operator

| Intended action | Door | What changes the answer |
| --- | --- | --- |
| Edit an unpublished tracked source file | Two-way candidate | Exact preimage retained, no unrelated edits overwritten, bounded restore cost |
| Run a known isolated test | Two-way candidate | Its scripts and subprocesses have no unbounded external effects; cleanup and cost are bounded |
| Upload a private file | One-way | Deleting the upload cannot prove nobody read or copied it |
| Send an email or make a paid request | One-way | A follow-up or refund is compensation, not reversal |
| Apply a database migration | Unknown until assessed | Actual data transformation, backup/restore proof and downstream compatibility determine recovery |
| Retry after a lost dispatch response | Inspect original receipt | Door classification cannot establish whether the first attempt already ran |
| Toggle a feature flag | Depends on effects | Turning it off does not undo messages, charges or data changes produced while it was on |

A two-way door still needs a bounded blast radius. Restoration that takes hours,
requires someone else's cooperation, or loses intervening work is not a cheap
local undo. Report those limits rather than rewarding confident wording.

### Run a local assessment

From a source checkout, run `node scripts/assess-door.mjs /absolute/path/input.json --json`.
Omit `--json` for the decision card. The file is read only; keep real operation
inputs in private state outside Git. No result is persisted automatically.

Input fields are `intent`, `effectsComplete`, `effects`, `context`, `operation`,
and `asOf`. Each effect names its kind, description, affected relative paths,
bounds and recovery. Recovery uses the envelope's `door`, `knownGood`, `steps`,
`preconditions`, `limits`, `expires`, with explicit evidence references, reliability,
satisfied preconditions and bounded cost. Missing facts or `{ "unknown": "why" }`
remain unknown. `asOf` is explicit; the expiry day is conservatively expired.

The context describes authority, scope, budget and hooks separately. Even a
`trust: "verified"` input is only a caller's declaration to this pure tool: the
output always says `authorizesExecution: false` and `declared-not-verified`.
Adapters must resolve real authority from existing trusted controls, not accept
model-authored context fields as proof. See `tests/night-door-policy.test.mjs` for
complete synthetic inputs and negative cases. Extra keys, including invented
approval fields, are refused instead of silently ignored.
