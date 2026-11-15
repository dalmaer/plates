---
name: test-speed
description: What makes the suite slow, and which tests cost time without catching anything.
every: 30
effort: deep
providers: ["antigravity"]
model: gemini-4-carbon
minutes: 180
---

The suite is the gate every change waits on. Measure from the project's own
records first (its test ledger, timing and health pages), then read the tests.

## Look for

- **The slowest files and why:** real timers, sleeps, polling, a package or
  database built per test, processes spawned where a function call would do.
- **Repeated setup:** the same fixture, repository or pack built in many
  files that could be shared or made once.
- **Tests that catch nothing:** assertions on mocks, checks that cannot fail,
  duplicates of another test's coverage.
- **Flaky shapes:** order dependence, shared temporary paths, wall-clock races,
  a retry that hides a failure.
- **Parallelism:** files that force serial runs, and why.

Each finding names the time it costs (from a record, not a guess) and the
change that would save it, so it can become a climb.
