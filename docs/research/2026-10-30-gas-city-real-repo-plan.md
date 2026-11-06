# Gas City real Plates trial preparation — 2026-10-30

The next trial is prepared locally, but **no real agent or model has run**.
The synthetic complete-loop result is in [the preceding report](2026-10-30-gas-city-full-loop.md).
It must not be presented as an agent improving actual Plates code.

## Candidate and frozen comparison

A local probe reproduced a real private-receipt authorization race on consolidation
`037e13b4f78c061405cef899b528badb536584ad`: removing workspace membership during a
project-operation storage read still returns HTTP 200 with its committed receipt.
The same removal before the request correctly refuses with 404. Existing affected
tests pass. Production `lib/web/operations.mjs` and `lib/web/server.mjs` and six
related source/test/helper files were byte-compared with that baseline; no fix was
implemented. This is a local fixture reproduction, not a verified live incident.

Proposed Task A asks an agent to reproduce and close this buffered-disclosure
window in API and HTML receipt recovery, retain permitted original-operation
recovery, avoid additional writes, and prove its regression fails on the baseline.
A related, independently reproduced source-project revocation race is held out
as Task B. Its prompt and evaluator stay outside Task A's context. The parent
must reconcile this pair with OpenHands before launching either backend.

Private evaluator preparation lives under
`/Users/dionalmaer/Documents/Codex/2026-10-30/task-3`:

- `real-loop-task-candidate.md` and `real-loop-task-candidate-manifest.json`:
  exact source paths, controls, reproduction outputs and eight baseline hashes.
- `real-task-a-public.md`: worker-facing first task.
- `real-task-b-sealed.md`: held-out prompt and evaluator-only criteria.
- `recovery-read-probe.mjs/.jsonl` and
  `migration-recovery-read-probe.mjs/.jsonl`: actual baseline observations.
- `real-trial-launch-spec.json`: final candidate prompts, evaluator hash, immutable
  helper policy, baseline and existing affected tests;
  explicitly `selection: pending-parent-reconciliation`, `modelExecution: not-authorized`.

Only a reviewed lesson transfers from A to B. Both B arms start from the same
original baseline, without Task A's patch. Otherwise a broad shared-route fix
could pre-fix the held-out task and invalidate the learning comparison. Merely
placing held-out files outside worker trees does not enforce read isolation;
future agent filesystem/network controls must keep evaluator inputs out of scope.

## Replayable non-model preparation

[prepare-real-trial.mjs](../../experiments/gas-city/prepare-real-trial.mjs) creates
an independent local object store and three detached disposable worktrees, all
at the frozen baseline: A, B control and B treatment. It removes the copied
origin remote, rejects destinations inside the source checkout (including a
symlink ancestor), forbids reusing an existing output directory, checks all arms
before and after baseline tests, and refuses an object alternates dependency.
It contains **no agent invocation** and cannot grant itself model authorization.
The final launch specification adds the frozen helper-integrity policy after
worktree preparation; the original preparation specification is retained. No
worker has consumed either prompt version. Parent selection is still pending.

```sh
node experiments/gas-city/prepare-real-trial.mjs \
  /Users/dionalmaer/code/plates \
  /Users/dionalmaer/Documents/Codex/2026-10-30/task-3/real-trial-launch-spec.json \
  /Users/dionalmaer/Documents/Codex/2026-10-30/task-3/gas-city-real-trial-replay
```

Use a new output directory. The first preparation was retained with its review
findings: shared object dependence and no post-test cleanliness check. The final
preparation root is `task-3/gas-city-real-trial-preparation-2`; its receipt records
actual frozen heads and baseline test exits. No primary checkout, running harness,
user worktree or agent-quality branch was altered. These new worktrees contain
only the old consolidation baseline, not the experimental harness or evaluator.

The final preparation passed existing baseline suites: Task A 19/19 and Task B
15/15. The separately frozen evaluator correctly fails acceptance: A 4/6 (two
late-revocation failures), B 4/7 (three failures including HTML fallback). It
checks all 59 baseline helper modules before any candidate import and refuses
changed/added/removed/aliased helpers with exit 2; a tampered-preload negative
control confirmed that refusal. Evaluator hash:
`723feab106853c71b2016f65904ec9f7880379ddde4804ec4c1dfb0400037548`.
See [the preparation evidence](2026-10-30-gas-city-real-repo-evidence.json) and
private `task-3/real-trial-evaluator-manifest.json`. Existing green tests are
controls, not a claim the reproduced defects pass acceptance.

## Actual backend launch plan, pending approval

Official source remains pinned to Gas City
`3f3224faaeff2da774417293e4a847aa421365a5`. The complete static inventory and source
links are retained in `task-3/gas-city-real-provider-plan.md`. `command -v` found
Codex, Claude, OpenCode and tmux. No CLI was invoked for auth, version or model
execution; availability proves neither login nor account entitlement.

The first proposed real execution is one reviewed fixed Codex launcher owned by
Gas City's actual subprocess provider, in Task A's isolated worktree. The agent
must author the patch; the controller supplies the frozen prompt, preserves the
original operation/PID/fence, captures output and verifies results. The controller
must not manually implement the target and attribute it to the backend.

The pinned Codex preset declares `exec` and an `auto-edit` mode mapping to
`--sandbox workspace-write --ask-for-approval never`; its default is unrestricted.
Those defaults must be overridden, and installed CLI compatibility must be
verified before launch. Runtime subprocess mode inherits environment, discards
output and does not enforce its Start context as a lifetime deadline. A reviewed
wrapper therefore needs a fixed argv/task file, explicit output capture,
allowlisted environment, a wall-clock watchdog and confirmed teardown. It is not
an OS sandbox, and Nudge/SendKeys provide no interactive chat.

An existing CLI session may be usable in place, without extracting/exporting its
credentials. Its account, billing mode, entitlement, hooks/MCP/plugins and enforced
sandbox/network settings are unknown. No secret values or session files were
read. Future use must be explicitly authorized for the named payer and endpoint;
there must be no ambient fallback account or background/delegated model calls.

A proposed first bound is one Task A invocation, ten minutes, no retries or resume,
no model reviewer. Local independent evaluation follows. Task B control/treatment,
a model reviewer, review-driven repair, or resuming an interrupted model turn need
separately enumerated calls in the approved budget. Interruption must recover the
original durable operation and existing patch; it never licenses a second blind
launch. The full supervisor remains uninstalled; several documented prerequisites
are absent. `gc init` can install a launchd service and remains excluded.

Exact approval question once parent selects the task and the owner supplies values:

> Authorize one Gas City-owned Codex invocation for the frozen Task A and prompt
> digest in its isolated worktree, using **which existing account and exact model**,
> with workspace-write permissions, the reviewed tool/network boundary, a
> ten-minute timeout and no retries, resumption or delegation? Choose either a
> specific currency cap with a verified enforcement mechanism, or explicitly
> authorize that one bounded invocation to consume the named subscription's
> allowance without a verified hard currency cap. No external writes or services.

This is a pending authorization template, not an approval already received.
A timer is not a cost cap; stopping the process may not cancel a billable request
already accepted. Token/cost receipts remain unknown when unavailable. Model
execution stays blocked if a required hard cap cannot be verified.

## Evaluation protocol

Freeze candidate prompts, baseline, independently executable evaluator and
allowed edit/test scope before either backend sees Task A. Record actual agent
patch and changed paths, permitted/denied receipt behavior, unchanged provider
write counts, affected tests, independent review and negative control results.
Quality success requires the observed behavior, not exit code zero alone.

Capture outcome and an evidence-backed project lesson only after the run; review
its exact content before transfer. Run B without and with that lesson on separate
clean baselines under the same model, limits, evaluator and prompt when approved
budget allows. Record retrieved lesson digest, interventions, retries, wall time,
provider token/cache/cost receipts and unavailable totals. No improvement is
predetermined; a neutral or harmful lesson remains a valid measured outcome.

## Preparation validation — 2026-10-30

The final focused preflight passed 117 tests with zero failures/skips, then
roadmap/render/inbox/whitespace. The three direct preparation tests also passed
with the repository ledger reporter. An initial assertion compared `/var` with
canonical `/private/var`; its failing log was retained, the invalid concurrent
preflight was stopped, and the expectation was corrected before final checks.
Independent review found the original isolation/integrity findings resolved.
Only documentation results were added afterward; whitespace was rechecked.
The unchanged full suite was not rerun. No production source or model invocation
was part of this preparation checkpoint.
