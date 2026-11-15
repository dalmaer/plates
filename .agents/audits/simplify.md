---
name: simplify
description: Code that does one job in several places, or does a simple job the hard way.
every: 30
effort: deep
providers: ["antigravity"]
model: gemini-4-carbon
minutes: 180
---

Read widely: the value is in seeing two distant copies of one idea.

## Look for

- **Duplication:** the same logic written two or more times, especially copies
  that have already drifted apart; name the one to keep.
- **Modules far larger than the rest** that most changes touch: name the seams
  to split along, with the files that would move.
- **Abstractions with one user,** and missing ones where a change always
  touches the same handful of files together.
- **Dead code:** exports nothing imports, flags fully rolled out but still
  branching, scripts nothing runs. Check dynamic loading before calling
  anything dead.
- **The hard way:** hand-rolled parsing, retries or path handling where the
  project already has a helper.

Each finding gives the lines it would remove or merge, and what must be tested
first so the change is safe.
