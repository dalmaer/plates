# Selected real Plates trial: receipt authorization

Prepared 2026-10-30. Parent selected the same task pair as Gas City. This replaces the RRULE comparison candidate; its earlier evidence remains in `rrule-alternative-candidate.md` and `rrule-alternative-heldout.md`. No target fix or model execution has occurred.

## Frozen shared input

Use consolidation `037e13b4f78c061405cef899b528badb536584ad`. `real-receipt-spec.json` is a byte-identical copy of task-3's `real-trial-launch-spec.json`, including both exact prompts, test scope and frozen-helper policy. Its SHA-256 is `0b7610603f865b91b59f680b485aea544e154a4571e15dd7044cd3c7753d531c`. The source specification still says pending reconciliation/not authorized; parent selection does not authorize execution.

`real-task-a-public.md` is the exact primary prompt, SHA-256 `86c73d43adbbe1ea7b7beea42750e6ac1aae210138e5d66608b3214ae4a24866`. Only this prompt enters the first worker context. Keep this evaluator note, the combined spec, evaluator and held-out artifacts inaccessible to that worker.

Task A: a private project operation receipt remains visible after workspace membership is removed while its read is in flight. Reproduce and close the API and HTML disclosure, preserve permitted recovery of the original operation, and avoid redispatching source writes. The existing affected suite is `tests/web-operations.test.mjs`. Production changes and independent tests for this defect are allowed; every existing `tests/helpers/**/*.mjs` byte is immutable and no helper files may be added. The brief supplies the symptom, not a patch.

## Local reproduction

The frozen evaluator is copied without modification from task-3 into `real-receipt-evaluator.mjs`, SHA-256 `723feab106853c71b2016f65904ec9f7880379ddde4804ec4c1dfb0400037548`. It imports actual Plates routes and services with synthetic auth, storage and provider fixtures, checking all 59 helper modules against the baseline before importing candidate modules. This integrity check is not an operating-system sandbox.

The OpenHands primary worktree `../openhands-real-trial-prepared/primary` was clean at the exact baseline before and after evaluation. `real-receipt-baseline-primary.json` records acceptance exit 1: 4/6 cases pass; mid-read revocation discloses the committed receipt for API and HTML. Authorized and pre-read-denied controls pass. No GET produced additional fixture source writes. The baseline manifest retains artifact hashes and all three arms' clean-tree checks.

```sh
node experiments/openhands/real-receipt-evaluator.mjs /absolute/path/to/primary task-a
```

This command is appropriate only for an independently verified untouched baseline or inside the parent's evaluator containment. Never import an agent-edited candidate into a privileged controller. Target code was not edited or manually fixed. The existing suite and repository gates remain required for a future agent patch; baseline oracle failure is evidence of the starting defect, not completed acceptance.

## Evaluator protocol and containment handoff

Launch a dedicated child process with argv `<trusted-evaluator-file> <absolute-worktree> <task-a|task-b>`. There is no stdin protocol. It emits one JSON report to stdout; stderr may contain runtime diagnostics. Acceptance exits 0 for all cases passing, 1 for failed cases, and 2 for fixture-integrity/deadline failure; unexpected process failures are infrastructure failures. `--observe-baseline` returns exit 0 with `acceptancePassed:false`, so it must never be used for acceptance.

The evaluator reads its own file to report its digest; piping its unmodified bytes through stdin is unsupported. It invokes `/usr/bin/git` for read-only baseline/helper/HEAD/status facts and dynamically imports candidate code. Run with no credentials, no external network, a bounded private temporary directory and a watchdog. The parent owns enforced worker/evaluator filesystem and process containment. Only the evaluator profile may read evaluator/held-out artifacts. Worker sibling-tree access must be denied, not merely omitted from prompts.

Controller parsing should require the expected schema, kind, task, baseline, evaluator hash, integrity result and case results, and require consistency with exit status. Extra/malformed stdout must not be accepted. These checks do not make hostile candidate code trustworthy: imported code runs in the evaluator process and can affect globals or output. Independent review and causal regression proof remain necessary; containment limits effects, not the semantic trustworthiness of arbitrary code.

## Evidence provenance and pending execution

Read-only source evidence: task-3 `real-loop-task-candidate.md`, `real-trial-evaluator-manifest.json`, `real-trial-launch-spec.json`, and the other branch's `docs/research/2026-10-30-gas-city-real-repo-plan.md`. No other branch was edited. Each case builds separate in-memory fixtures; no real database, credentials, provider requests or target edits were used. The evaluator's fetch override is a fixture guard, not a claim of OS network isolation.

Parent owns updating the shared preparation harness and launch manifest. No model, account, budget, live authentication or provider call has been authorized by these artifacts. The previous RRULE preparation manifest remains historical evidence until a new selected-task manifest is produced; it must not be mistaken for this launch specification.
