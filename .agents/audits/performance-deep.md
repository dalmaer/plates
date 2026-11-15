---
name: performance-deep
description: Measured slowness across the CLI, the night and the web, with the probe that measured it.
every: 30
effort: deep
providers: ["antigravity"]
model: gemini-4-carbon
minutes: 180
---

Deep where the quick performance lens is broad. Write small read-only probes
(counts of processes started, files read, modules loaded, bytes shipped) and
report what they print. Never fetch, and never run a command that fetches for
you. Read the project's personas and health pages first and say where a
finding explains a number they already track.

## Look for

- **Work per item:** a process, read or request per item in a loop.
- **Eager loading:** modules or files loaded for commands that never use them.
- **Repeated work** within one command or request.
- **Unbounded reads** of lists, histories or files.
- **What ships:** files in the package or the web function that nothing loads.

Each finding gives the measurement, the command that took it, and what the
change would save.
