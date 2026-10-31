---
status: planned
since: 2026-10-30
goal: G9
spec: 2
depends: [142, 117]
note: "The OpenHands and Gas City trials are stopped (owner, 2026-10-30). Their executor-agnostic pieces become one adapter contract in Plates; no executor is adopted and no paid trial runs."
evidence: []
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

- [ ] An executor fixture that auto-approves permissions, loses dedupe on restart, or checks budget only after a step is refused with each reason named: `tests/executor-contract.test.mjs: "an executor that cannot be held to policy is refused"`.
- [ ] The frozen evaluator scores the held-out task pair on the unfixed baseline as the trials recorded, and a changed evaluator or helper hash is refused: `tests/executor-contract.test.mjs: "the frozen evaluator is the one the trials used"`.
- [ ] An uncertain attempt stays uncertain across a restart and is never retried blindly: `tests/executor-contract.test.mjs: "uncertain stays uncertain"`.
- [ ] `npm run check` passes.

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

List each harvested file on the two branches against the contract above and
port the executor-free ones with their tests.
