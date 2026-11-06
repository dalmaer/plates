---
status: planned
since: 2026-11-05
goal: G7
spec: 2
depends: [178]
note: "Specified in docs/specs/web-backlog.md. Read-only: starts, stops and reschedules nothing."
evidence: []
---

# Recurring shows every routine each plate runs, and when it next runs

## Done when

The sidebar's Recurring and `plates home --recurring --json` list, per plate, each scheduled routine (night, climb, tend, morning, robot, cross-review, publish) with its schedule in the owner's time zone, its next run, its last result and its budget. The sidebar also carries Humans and Links. See [the backlog spec](../specs/web-backlog.md).

## Scope

- `routinesOf(plate)`: a pure reader over the workflow files' `schedule:` crons and `.plates/plates.json` (`climb.schedule`, `tend.schedule`, `robot`, `morning`, budgets); the last result from the night journal and the receipts the fleet already reads.
- A routine whose config says one schedule and whose workflow says another shows both, never a guess.
- Humans (the workspace's authorized people) and Links (`repo`, `canvas.home`, `production`) in the sidebar.
- Out of scope: changing any schedule. That stays in the workflow file, through `job-schedules.mjs`.

## Integration increments

1. `routinesOf` and its tests, unused by any view. Safe to merge.
2. `plates home --recurring` and the sidebar's Recurring, Humans and Links. Read-only; recovery is removing the entries.

## Acceptance

- [ ] Every scheduled workflow appears once, with its next run computed from its cron: `tests/backlog-recurring.test.mjs: "each routine once, next run from its cron"`
- [ ] A routine switched off in config shows off, with the key that says so: `tests/backlog-recurring.test.mjs: "an off routine says why"`
- [ ] The CLI and the web show the same routines: `tests/home-isomorphism.test.mjs: "recurring matches in both forms"`

## Real surfaces

- adopted project: the hosted workspace (Vercel, GitHub App, read-only) lists each fleet plate's routines.

## Proof

Automated: `node --test tests/backlog-recurring.test.mjs tests/home-isomorphism.test.mjs`; `npm run check`.
By hand: none beyond the hosted read.
⚑ None: no resource, spend or new login.

## Deliberately open

- Last result for a routine that writes no journal (publish, cross-review) comes from its latest workflow run, which costs one Actions read per plate. If that read is over the quota guard, the routine shows its schedule and "last run not read".

## Next action

Write `routinesOf`'s first test from plates's own `.github/workflows/*.yml` crons and `.plates/plates.json`.
