# Where local output goes

You run an agent or an automation on your own machine, and it writes something
nobody else needs: a morning digest, a diagnosis of last night's failure, a run
log, an edition of a report. That output is private and belongs to one machine.
It never belongs in a project's checkout.

## Why not in the checkout

- **The checkout is shared.** Plates is public, and most plates are pushed
  somewhere. An untracked folder is one `git add .` away from a commit, and a
  digest usually carries other projects' names, links and observations.
- **The checkout is read as evidence.** The night records whether the checked
  revision was clean (`verification.mjs`). Stray output makes it read
  `dirty`, so every report afterwards says less than it could.
- **Agents read the checkout.** A folder of old JSON next to the code looks like
  source. The next session may read it, cite it, or try to tidy it.

## The rule

Local output goes under the plates state directory, by kind and then by project:

```text
$XDG_STATE_HOME/plates/<kind>/<owner>/<repo>/…
```

`$XDG_STATE_HOME` defaults to `~/.local/state`, as it does for the Not now file
(`lib/not-now.mjs`, `stateDir`). For example:

| What | Where |
| --- | --- |
| A daily digest for `acme/widgets` | `~/.local/state/plates/morning-reports/acme/widgets/2026-11-08.md` |
| A diagnosis of one production failure | `~/.local/state/plates/production-diagnostics/acme/widgets/2026-11-06/…` |
| An agent's run logs | `~/.local/state/plates/run-logs/acme/widgets/…` |

- `<kind>` is a lowercase name for what the files are (`morning-reports`,
  `production-diagnostics`, `run-logs`). Use one kind per producer, so two
  automations never write into each other's folder.
- `<owner>/<repo>` is the GitHub name in `.plates/plates.json` `repo`. A digest
  that covers several projects goes under the project that asked for it, or
  under `_fleet` when none did.
- Write a new dated file rather than rewriting an old one. Keep corrections as
  their own files.
- Nothing under it is a source record. To make something durable and shared,
  write a phase, an evidence file or an issue, and link back to the run.

This is not the place for plates's own runtime folders. Those live inside the
project and ignore themselves with a `*` `.gitignore` (`.plates/test-runs/`, the
night journal, the canvas sync state). Leave them where they are.

## The guard

Plates's root `.gitignore` ignores the folder names that keep turning up inside
`.plates/`: `*-reports/`, `*-diagnostics/` and `*-logs/`. A digest written there
by mistake can't be committed by accident, and it no longer marks the checkout
dirty. The patterns cover folders only, so no tracked `.plates/` file
(`plates.json`, `lock.json`, `climb.json`, `name-transition/…`) is hidden;
`tests/local-output.test.mjs` checks both.

The guard is a safety net, not a home. If you find one of these folders in a
checkout, move it to the state directory and change whatever wrote it.
