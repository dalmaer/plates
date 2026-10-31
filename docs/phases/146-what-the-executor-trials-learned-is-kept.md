---
status: built
since: 2026-10-31
goal: G9
spec: 2
depends: [142, 117]
note: "lib/executor holds the qualification contract (12 named refusals), the uncertain-state journal, the hash-bound frozen evaluator and the sandbox profile; no executor adopted."
evidence: ["evidence/2026-10-31-executor-contract.md"]
---

# What the executor trials learned stays in Plates, whoever runs sessions later

## Done when

The executor-agnostic pieces built during the OpenHands and Gas City trials
are in Plates on main as one adapter contract with its tests, the two trial
branches are recorded as stopped with what they found, and any future
executor is qualified against that contract before it runs a real task.

## Scope

- Harvest from `codex/openhands-evaluation` and `codex/gas-city-evaluation`
  (unpublished, both stopped clean at an owner decision):
  - the frozen task handoff and evaluator, hash-bound, with the real
    held-out task pair;
  - the default-deny child sandbox policy and the contained
    capture-then-score flow;
  - the durable intent journal with uncertain states, fences, and separate
    lane and capacity holds;
  - the outcome → captured / no-useful-lesson → reviewed-promotion flow
    through the existing learning records (feeds phase 148);
  - the qualification checks an executor must pass: honours the autonomy
    level and door classes, never auto-approves permissions, deduplicates
    across restarts, posts idempotently, reports usage, enforces a budget
    before a step rather than after, and stops on a deadline.
- Each piece lands with its tests, executor-free (fixtures only).
- Not in scope: an OpenHands or Gas City dependency, a paid or
  account-backed trial, an executor choice.

## Acceptance

- [x] An executor fixture that auto-approves permissions, loses dedupe on restart, or checks budget only after a step is refused with each reason named: `tests/executor-contract.test.mjs: "an executor that cannot be held to policy is refused"`.
- [x] The frozen evaluator scores the held-out task pair's recorded observations as the trials did (A 4/6, B 4/7; live scoring needs the unpublished baseline and sandbox-exec, see evidence), and a changed evaluator or helper hash is refused: `tests/executor-contract.test.mjs: "the frozen evaluator is the one the trials used"`.
- [x] An uncertain attempt stays uncertain across a restart and is never retried blindly: `tests/executor-contract.test.mjs: "uncertain stays uncertain"`.
- [x] `npm run check` passes.

## Real surfaces

none

## Proof

Automated: `node --test tests/executor-contract.test.mjs`; `npm run check`.

## Deliberately open

- **Which executor, if any.** Settled by a later phase once one passes the
  contract's qualification on fixtures; until then the Plates robot runs
  sessions. Trial findings, 2026-10-30: OpenHands' ACP path auto-approves
  permissions and defaults to full access, its budget check runs after a
  step, and posts have no idempotency key; Gas City keeps create and webhook
  dedupe in memory (lost on restart), its subprocess runtime inherits the
  environment with no deadline, and its Codex preset bypasses approvals and
  the sandbox. Neither branch made a real model call.
- **Unverified coverage.** Both trials' adversarial fork-path and
  timeout-descendant tests never ran; the harvested sandbox carries that gap
  until its own test covers it.

## Next action

None; built. An adapter for a real executor is a later phase that must pass
`qualify()` first.
