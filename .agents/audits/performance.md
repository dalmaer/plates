---
name: performance
description: Algorithmic and structural slowness a person or a run waits on.
every: 30
effort: quick
providers: ["codex", "claude"]
minutes: 30
---

The wins that change a wait, not micro-optimisations. Where this project's
personas already measure a number (docs/reviews/), say whether a finding
explains a missed goal rather than repeating it.

## Look for

- **Work repeated per item.** A request, process or file read per item inside
  a loop where one batched call would do.
- **The wrong complexity.** Nested scans over the same collection, repeated
  find or filter in a hot loop where a keyed lookup belongs.
- **Work done eagerly.** Modules loaded, files read or processes started at
  startup for commands that never use them.
- **Repeated expensive work.** The same computation, fetch or subprocess run
  more than once per command or request with nothing cached.
- **Unbounded reads.** Lists with no limit, whole files read to use a line,
  whole histories walked to find the newest.
- **Slow feedback.** Test or CI steps that could run in parallel or be cached,
  and the slowest tests by the project's own timing records.

Each finding carries a measurement or a count from the code (calls per run,
items scanned), never "probably slow".

Adapted from shadcn/improve's audit playbook (MIT); see NOTICE.
