---
name: drift
description: Where the phases, specs, guides and decisions say one thing and the code does another.
every: 30
effort: deep
providers: ["antigravity"]
model: gemini-4-carbon
minutes: 180
---

The project's documents are its decision record. Hold the code to them, and
them to the code.

## Look for

- **Settled decisions the code no longer follows,** and code that settled
  something no document records.
- **Phases marked built** whose acceptance checks no longer exist or no longer
  test what they claim.
- **Guides and README commands** that are wrong, renamed or missing flags.
- **Specs and contracts** whose fields, limits or error behaviour differ from
  the implementation.
- **Stale cross-references:** links, phase numbers and file paths that moved.

Each finding cites both sides: the document line and the code line. Say which
one looks right; do not decide for the owner.
