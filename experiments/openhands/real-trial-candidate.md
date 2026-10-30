# Real Plates trial candidate: conflicting recurrence limits

Prepared 2026-10-30. This is a real defect found in the unchanged Plates baseline, not a seeded exercise. Preparation does not authorize model access or launch.

## Frozen input and provenance

Use baseline `037e13b4f78c061405cef899b528badb536584ad` in a new isolated worktree. The observed experiment HEAD was `060fe4165c75dcdbc99f39c34c76ee9a6fa1fe82`; these three files had no diff from the baseline:

| File | Baseline Git blob |
| --- | --- |
| `lib/routines/model.mjs` | `831fff6973aaf1001725407fde341f964c90e1c4` |
| `tests/routine-model.test.mjs` | `ef03be7148aaa32668eeb31d972c630f9638fd9b` |
| `lib/routines/sources/codex.mjs` | `082b28824632abd79c5b6f77ff933297139b4fa2` |

Inspection found `schedule('rrule', ...)` recognizes a rule containing both COUNT and UNTIL. The Codex observation reader emits its existing `unsupported_schedule` gap only for an unknown schedule, so this malformed input is currently presented as recognized syntax. This is metadata validation; no recurrence has been executed.

[RFC 5545 §3.3.10](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10), checked at the official RFC Editor on 2026-10-30, prohibits COUNT and UNTIL occurring together. Rule-part order does not change this constraint. Existing direct schedule tests cover unknown fields, duplicate FREQ and an out-of-range hour, but miss this case.

## Primary agent task

Correct the routine metadata validator so an RRULE containing both COUNT and UNTIL is unknown. Preserve valid COUNT-only and UNTIL-only rules, both field orders, and the existing optional `RRULE:` prefix. Add focused regression tests and report validation evidence. Do not implement recurrence expansion or change schedulers.

Allow changes to `lib/routines/model.mjs` and `tests/routine-model.test.mjs`. A source-reader regression in `tests/routine-sources.test.mjs` is optional if the parent includes it in the reconciled scope. No solution patch has been supplied or applied.

## Frozen acceptance

For both the bare form and the same string prefixed with `RRULE:`, require:

| Input | Expected kind |
| --- | --- |
| `FREQ=DAILY;COUNT=2;UNTIL=20261101T090000Z` | `unknown` |
| `FREQ=DAILY;UNTIL=20261101T090000Z;COUNT=2` | `unknown` |
| `FREQ=DAILY;COUNT=2` | `rrule` |
| `FREQ=DAILY;UNTIL=20261101T090000Z` | `rrule` |

The evaluator-owned oracle stays outside the agent worktree. From the experiment checkout:

This command is a **baseline-only probe**. It refuses changed candidate bytes before import. A post-patch scorer must run candidate code in a separately contained evaluator worker; do not import agent code into the host evaluator.

```sh
node experiments/openhands/real-trial-check.mjs /absolute/path/to/trial-worktree primary
```

On 2026-10-30 the initial four bare cases returned exit 1 / `pass: false`: both invalid cases were `rrule`; both valid controls passed. A separate direct eight-case probe also failed all four invalid bare/prefixed cases and passed all four controls. Target files remain unchanged. The preparation harness must reject an already-green candidate rather than introduce a defect.

Builder validation:

```sh
node --import ./tests/helpers/hermetic.mjs --test tests/routine-model.test.mjs
```

The conductor still owns the repository's required focused preflight, independent review and final integrated checks. A future fix needs the new regression failing on the frozen baseline and passing with the patch. Parent reconciliation must resolve task ownership and accepted decisions before dispatch. No model task, provider call, credential read, login, adapter installation, commit, push or remote mutation was performed for this preparation.
