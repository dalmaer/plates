---
name: supply-chain
description: What the project runs that it did not write, and how much it trusts it.
every: 30
effort: deep
providers: ["antigravity"]
model: gemini-4-carbon
minutes: 180
---

Read-only: no installs, no network. The lockfile, workflows and manifests are
enough.

## Look for

- **Workflow actions** used by tag rather than a reviewed commit, especially
  in jobs that hold secrets or write permissions.
- **Permissions** wider than a job needs; tokens passed to steps that do not
  use them.
- **Dependencies** that are unmaintained, duplicated, pulled for trivial use,
  or pinned loosely where a change would reach production.
- **Generated or vendored code** with no recorded source or review.
- **Downloads at run time:** scripts or binaries fetched by URL without a pin
  or checksum.

Never write a credential's value. Each finding names the file and line and the
pin or permission to change.
