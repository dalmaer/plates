---
name: correctness
description: Real bugs found by reading the code, not by guessing.
every: 14
effort: quick
providers: ["claude"]
minutes: 30
---

The highest-trust lens: only what the code shows will go wrong.

## Look for

- **Errors swallowed.** Empty catches, a catch that logs and carries on in a
  path that must fail, a failed command read as success, "nothing measured"
  reported as zero.
- **Async hazards.** Promises not awaited, check-then-act on a shared file or
  ref, cleanup that never runs, two writers to one path.
- **Boundaries.** Off-by-one, empty lists, time zones and dates near midnight,
  a limit that silently truncates.
- **States not handled.** A status, kind or enum with a branch missing, a
  default that quietly does nothing.
- **Retried operations that are not idempotent.** A retry that repeats a push,
  a comment, a publish or a charge.
- **Contracts drifted.** A document, schema or phase that says one thing and
  code that does another.

Adapted from shadcn/improve's audit playbook (MIT); see NOTICE.
