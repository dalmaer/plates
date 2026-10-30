# Evaluator-only follow-up: recurrence scalar cardinality

Prepared 2026-10-30. Keep this file, the combined oracle and trial manifests outside the primary agent's accessible context. Do not give the primary agent this task, expected learning or a proposed solution. The baseline worktree does not contain these experiment files; filesystem access must enforce that separation before calling the case held out.

Use the same baseline `037e13b4f78c061405cef899b528badb536584ad` and model blob `831fff6973aaf1001725407fde341f964c90e1c4`, with separate untouched follow-up control and lesson worktrees. The follow-up is another existing defect; no code has been changed to create it.

Task: audit recurrence scalar multiplicity in the routine metadata validator. Reject invalid repeated scalar values while preserving legitimate list-valued BY fields. Add focused tests. Do not expand recurrences or change schedulers.

[RFC 5545 §3.3.10](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10), checked against the official RFC Editor on 2026-10-30, defines COUNT and INTERVAL as digit sequences, whereas BYHOUR and BYDAY have explicit list grammars. A comma-separated pair is invalid for either scalar, even when each number is individually within range.

Frozen cases:

| Input | Expected kind | Baseline kind |
| --- | --- | --- |
| `FREQ=DAILY;INTERVAL=1,2` | `unknown` | `rrule` |
| `FREQ=DAILY;COUNT=1,2` | `unknown` | `rrule` |
| `FREQ=DAILY;INTERVAL=2;COUNT=3` | `rrule` | `rrule` |
| `FREQ=DAILY;BYHOUR=1,2;BYDAY=MO,TU` | `rrule` | `rrule` |

Evaluator command, from the experiment checkout:

This command is a **baseline-only probe**. It refuses changed candidate bytes before import. A post-patch scorer must run candidate code in a separately contained evaluator worker; do not import agent code into the host evaluator.

```sh
node experiments/openhands/real-trial-check.mjs /absolute/path/to/followup-worktree followup
```

Observed 2026-10-30 on unchanged target files: exit 1, `pass: false`; both negative cases failed and both positive controls passed. Builder validation is `node --import ./tests/helpers/hermetic.mjs --test tests/routine-model.test.mjs` plus the conductor's required gates. Do not require an implementation shape.

After primary work, retain the actual worker's lesson candidate verbatim. An independent reviewer may approve its exact digest and scope, reject it, or record no useful lesson. Only an approved lesson enters the lesson arm. The control arm receives no lesson. Never manufacture a lesson to complete the loop. Record outcomes, review findings, time, calls and usage for both arms; this small paired trial can demonstrate a transfer mechanism, not establish causal efficacy. If the first patch already fixes the follow-up, retain that observation rather than seed a new defect. All execution remains pending parent reconciliation and explicit account/budget approval.
