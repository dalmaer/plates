---
name: tests
description: Which untested code is dangerous, and which tests prove nothing.
every: 14
effort: quick
providers: ["claude"]
minutes: 30
---

Not a coverage percentage: which code would break silently.

## Look for

- **Critical paths with no real test.** Whatever this project exists to do,
  anything that writes, deletes, merges, publishes or spends, and anything
  that decides permission. Name the path and the test that should exist.
- **High churn, no tests.** Files changed often in `git log` with no test
  that loads them: the first place a refactor breaks.
- **Tests that prove nothing.** Assertions on mocks, snapshots nobody reads,
  a test that would pass with the code removed, a check that cannot fail.
- **Flaky shapes.** Real timers, real network, shared temporary paths, order
  dependence, a retry that hides a failure.
- **Missing layers.** Only unit tests where a boundary (a command line, an
  HTTP route, a workflow) is the thing that breaks, or only slow end-to-end
  tests where a unit test would catch it.

Each finding names the test to write, the file it goes in, and an existing
test to model it on.

Adapted from shadcn/improve's audit playbook (MIT); see NOTICE.
