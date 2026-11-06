---
status: partial
since: 2026-10-16
goal: G6
spec: 2
depends: [33, 15]
note: "Partial 2026-11-06: the night, the loop and pre-push reuse CI's exact result (its plates-test-runs records) and docs-only commits skip; the judges' base gates deliberately run their own, like for like with the candidate. The owner's week of CI minutes remains."
evidence: ["evidence/2026-10-16-gate-reuse.md"]
issue: 162
---

# One gate result per commit, shared by every pass

## Done when

Each commit's gate runs once in CI and its result and test-ledger runs are kept; every plates pass (night, loop, climb, tend, robot judges) and the pre-push hook reuse an exact, clean result for the commit they would test and run the gate only when there is none; and a change that touches only documentation skips the suite.

## Scope

The design is [Delivery: a change reaches production once, checked](../research/2026-10-16-delivery.md), items 7 and 9 of "What is common".

- **Keep the result**: the gate workflow (plates's `check.yml`, or the project's `gateWorkflow`) uploads `plates-test-runs` from `.plates/test-runs` on every run, and plates's adoption proposes the step where a project keeps its own CI (ledger's missing upload is the case).
- **Reuse it**: one function, used by the night's `improve.mjs` (which already does), the loop's gate step, climb and tend and robot judges where they test the commit CI tested, and an optional pre-push helper: an exact, clean, completed, successful result for the commit within 24 hours is the gate; anything else runs it.
- **Doc-only skip**: a `delivery.docsOnly` path list (ledger's `ci-scope.mjs` generalised); a commit touching only those paths records "skipped: docs only" instead of running the suite.
- **Never weaker**: a reused result must be for the same command (`check`), the same tree, and a run that tested something (the ledger's "no test ran" rule).

## Acceptance

- [x] The gate workflow uploads `plates-test-runs` on success and failure, and adoption proposes it for a project's own CI. `tests/workflows.test.mjs`, `tests/adopt.test.mjs`
- [x] Every pass that runs the gate reuses an exact, clean, successful result for its commit and runs the gate only without one, saying which, except the judges' base gates (climb's guard and the robot's judge), which run their own beside the candidate's. `tests/gate-reuse.test.mjs`
- [x] A result for another command, another tree, or a run with no tests is never reused. `tests/gate-reuse.test.mjs`
- [x] A doc-only commit records a skip, and a commit touching anything else runs the suite. `tests/gate-reuse.test.mjs`
- [ ] ⚑ by hand: the owner reads one week of plates's CI minutes before and after on the night's health page.

## Your part

- **Ask:** Plates's CI used fewer minutes the week after one test result per commit was shared than the week before (the two numbers are on this card). Is that saving worth keeping?
- **Why:** It is the measure this phase was built to move; the conductor reads both weeks from the health page and states them here, so you only judge the difference.
- **Choices:** Worth it | Not enough to matter
- **Recommend:** Worth it
- **Takes:** 1 minute.
- **Then:** Worth it: the phase is built. Not enough to matter: the conductor finds which passes still run the full gate and proposes a fix.
- **Ready when:** a week has passed since this shipped and the conductor has posted both weeks' CI minutes.

## Real surfaces

- Workflow shell: CI's upload and every plates pass's reuse.
- Adopted project: ledger's CI proposal.

## Proof

Automated: `node --import ./tests/helpers/hermetic.mjs --test tests/gate-reuse.test.mjs tests/workflows.test.mjs tests/adopt.test.mjs`; `npm run check`.
By hand: the owner's week.

## Deliberately open

- **24 hours** was settled as the default window. Phase 89 (2026-10-17) adds
  an explicit `ci.gateReuse: "until-change"` opt-in; all source and test evidence
  checks still apply.
- **Known limit**: a pass that tests a different tree than CI (climb's candidate branch) still runs its own gate; reuse is only for the exact commit.
- **Settled 2026-10-16 (the build):** the evidence of a reusable result is the run's `plates-test-runs` records (a gate record for the commit and tree, clean, the same command's hash, exit 0, and a test run under it that ran a test and failed none), never a job's name: a name cannot say which command ran on which tree. Only a success is reused; a red CI result runs the gate again. Reuse still needs an explicit `ci.gateWorkflow`.
- **Settled 2026-10-16:** docs-only is decided against the newest first-parent ancestor (at most 20 back) with a result of reuse grade at any age, and only for a clean commit; CI's own step (`gate.mjs --ci`) never reuses, it only skips or runs.
- **Settled 2026-11-06: the judges' base gates run their own.** climb's guard
  (`climb.mjs guard`) and the robot's judge run the base's gate to compare its test ledger with the candidate's: a test the base ran that
  the candidate did not is refused. That comparison is only as strong as the
  two runs are alike. CI's run is not: its gate step holds `GH_TOKEN` and every
  `GITHUB_*` variable, the robot's judge strips them, climb's judge step has
  no `GH_TOKEN`, and the judge's base runs in a worktree beside the checkout
  after the project's own setup. A test CI skipped that the judge would run is
  one the candidate could then drop unseen, which breaks "never weaker"; a
  test CI ran that the judge skips refuses every honest candidate. A carry-in
  can be made tamper-proof (a separate job with `actions: read` verifies CI's
  records with `ciResult` before the agent job's output is read, pins their
  digest in its job outputs, and the guard reads them before any of the
  agent's code runs), but it adds a token-bearing job to two judge workflows
  and changes two reviewed scripts to save one gate run per night or robot
  PR, and it would still compare unlike runs. Revisit only if CI's gate and
  the judge's are made to run in the same environment. (Tend's guard runs no
  base gate: it tests tend's own commits, another tree, as the known limit says.)

## Next action

A week after this ships, the conductor reads plates's CI minutes for the week before and after from the health page and posts both; then the owner's question opens.

## Trajectory

- **2026-11-06** — Decided the judges' base gates: they keep running their own. The carry-in could be made safe, but CI's gate runs in another environment (tokens, `GITHUB_*`, checkout layout), so reusing it would weaken the guard's base-versus-candidate test comparison. Box 2 now names that exception; the night, loop and pre-push reuse as before.
