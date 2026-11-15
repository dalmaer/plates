---
name: size
description: What the project ships and carries that it does not need.
every: 30
effort: quick
providers: ["codex", "claude"]
minutes: 30
---

Size is paid by every install, every clone and every agent that reads the
tree. Measure before claiming (`wc`, `du`, `git ls-files`, `npm pack
--dry-run --json` reads without publishing).

## Look for

- **The published payload.** Files the package ships (package.json `files`)
  that its users never load: fixtures, generated data, documentation copies.
- **Checked-in generated files.** Data generated from other files and
  committed, where generating at build or reading at run would do.
- **Modules an order of magnitude larger than the median** that most
  changes touch: name the seams to split along.
- **Dependencies for trivial use** and two dependencies doing one job.
- **Dead code.** Modules nothing imports, flags fully rolled out but still
  branching, scripts no workflow or document runs.

Each finding gives the bytes or lines now and what removing or moving it would
save.

Adapted from shadcn/improve's audit playbook (MIT); see NOTICE.
