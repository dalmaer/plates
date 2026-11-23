---
status: partial
since: 2026-11-21
goal: G4
spec: 2
depends: []
note: "Increments 2-4 built: the night opens no pull request or proposal and is red only on a red main, a flaky test, a gate with no tests, or a check it could not read; lessons only from real failures (#575); the Loop pull is weekly (#574). Waits on: three quiet nights on plates, then the fleet update PRs for the owner."
evidence: []
---

# The night only speaks up when something is wrong

## Done when

On plates, the night opens no pull request and files no proposal. Its workflow goes red,
which emails the owner, only when CI on main is red, a test is flaky, or the gate ran no
tests; otherwise it ends green and quiet. The climb and tend workflows do nothing on
plates, and phases 35, 36 and 47 are superseded with a dated note. Retros still run at the
end of a phase that changed more than docs, and a lesson is proposed only from a real
failure. The Loop practice pulls weekly. Once that has held on plates for a few nights,
fleet update pull requests carry the slimmer night and the weekly Loop pull to the other
projects, Ledger included, for the owner to review.

## Scope

What the night produced, as the owner read it on 2026-11-21:
- in 37 nights the climb kept 3 small changes, all in `tests/improve.test.mjs`, while
  about 113 commits went into the climb itself;
- tend fixed 1 of about 116 findings;
- the nightly health page is a pull request the owner merges every day, and nobody acts
  on it;
- Ledger's nightly Loop pull has brought nothing new since 2026-10-22.

So the night is cut back to what earns its keep:

- **Climb and tend off.** The `climb` and `tend` keys leave plates's `.plates/plates.json`,
  so both workflows end at their first step. Their code stays, but nothing new is built on
  it. Phases 35, 36 and 47 become `superseded`, with a dated note, and so do the two open phases that are climb and tend work themselves: 38 (tend's weekly pass) and 155 (the climb admitting measured work). Phases 43, 45 and 54 depend on climb but are about budgets, providers and the robot, and stay as they are.
- **A quiet night.** The night writes no branch, opens no pull request and files no inbox
  proposal. It fails, as a red workflow, when:
  - CI on main is red;
  - a test is flaky;
  - the gate ran no tests.

  A check the night could not read is red too ("The night could not check"): an unread
  source is unknown, never fine. A check that does not apply stays green. Each failure
  names its cause in the run's summary. The other measures stay available
  on the health page, written on demand (`plates improve`), never nightly.
- **Lessons.** Retros stay at the end of each phase that changed more than docs. A lesson
  candidate needs a real failure in that phase (a red check, a reverted change, a bug
  that escaped), never a hypothetical one. The four untriaged items in the lessons inbox
  get proposals; the owner decides them.
- **Loop weekly.** The loop practice's pull runs once a week instead of nightly.
- **Fleet.** After a few quiet nights on plates, fleet update pull requests carry the
  night and loop practice changes. The owner reviews and merges each one.

Out of scope: deleting the climb and tend code (a later cleanup once the fleet is off
them), and changes to the CI gate itself.

## Integration increments

1. **Climb and tend off for plates.** Remove the two config keys; supersede phases 35, 36
   and 47. Proof: both workflows' config check reads off, and the agent and publication
   steps are skipped. Recovery: restore
   the keys.
2. **The quiet night.** The night practice stops staging and opening its pull request and
   proposals, and fails red on the three causes. Proof: tests on the night's outcome for
   each cause, and for a quiet green night. Recovery: revert.
3. **Lessons.** The conduct practice says lessons come only from real failures; the inbox's
   four items get proposals. Recovery: revert.
4. **Loop weekly.** The loop workflow's schedule is weekly, and its words say so. Recovery:
   revert.
5. **Fleet.** After at least three quiet nights on plates, open the fleet update pull
   requests for the owner to review.

## Acceptance

- [ ] With no `climb` or `tend` key, each workflow's config check reports off, and no agent, branch or pull request work runs (checkout and the runner-clock step may still run); phases 35, 36 and 47 are superseded with a dated note: `tests/climb-pick.test.mjs: "off: with no climb key the workflow does nothing"`, `tests/climb-tend.test.mjs: "tend off: with no tend key nothing runs"`, and `node scripts/roadmap.mjs --check`.
- [x] The night opens no pull request and files no proposal, and fails red with a named cause when main's CI is red, a test is flaky, or the gate ran no tests (and when it could not check one of these), and is green otherwise: `tests/night-quiet.test.mjs: "the night fails only on a red main, a flaky test or a gate with no tests"`.
- [x] The conduct practice proposes a lesson only from a real failure in the phase: `tests/guides.test.mjs: "a lesson candidate names the failure it came from"`.
- [x] The Loop workflow runs weekly: `tests/loop.test.mjs: "the Loop pull is weekly"`.
- [ ] After three or more quiet nights on plates, a fleet update pull request is open for each other project, Ledger included, carrying the night and loop changes, for the owner to review: `gh pr list --search "plates update" --state open` in each project, and `plates fleet --json`.

## Real surfaces

- workflow shell: plates's own night runs three nights in a row with no pull request, and a red run's summary names its cause when one of the three happens.
- fleet over time: each other project's fleet update pull request, reviewed by the owner, then its nights run quiet.

## Proof

Automated: `npm run check:focused -- tests/night-quiet.test.mjs tests/loop.test.mjs tests/guides.test.mjs`, then `npm run check`.
By hand: none.

## Deliberately open

- What the morning workflow keeps: settled in increment 2. It keeps decide, send and the
  card, because an owner's plan still drives the robot and the brief. Its finalize job (the
  "as it finished" pull request) and its names evidence are gone.

## Next action

Watch plates's next three nights: no night pull request, and green unless one of the causes holds. Also confirm the next scheduled `plates-climb` and `plates-tend` runs report off (the first box). Then tell the owner and open the fleet update pull requests (increment 5) for their review.
