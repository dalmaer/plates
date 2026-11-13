---
status: partial
since: 2026-11-06
goal: G7
spec: 2
depends: [181]
note: "Built: metadata-only events, written locally and (after migration 019) hosted, read back the same in plates home --backlog --since and /backlog/history. Migration 019 applied 2026-11-07 and its hosted proof passed; waits on one event written from the web read back on /backlog/history."
evidence: ["evidence/2026-11-06-backlog-events.md"]
---

# The backlog remembers what happened to each item

## Done when

`backlog_events` records attach, assist, dispatch, release, answer and not-now with its reason, locally and hosted, and `plates home --backlog --since` reads them back. See [the backlog spec](../specs/web-backlog.md).

## Scope

- Local `.plates/backlog-events/` with the private file modes `feedback-store` uses; hosted migration under row-level security.
- Metadata only: no source text, no owner words.
- An owner readout: routes that landed phases, walk minutes per week.

## Integration increments

1. Local events.
2. The hosted migration and writes.
3. The readout.

## Acceptance

- [x] Events hold no source text or owner words: `tests/backlog-events.test.mjs: "metadata only"`
- [x] Ordering is identical with and without events: `tests/work-items.test.mjs: "events never reorder"`
- [x] A tracked events directory is refused: `tests/backlog-events.test.mjs: "events refuse a tracked directory"`
- [ ] After migration 019 is applied, one event written from the web is read back on /backlog/history: ⚑ by hand: the conductor, with the owner

## Real surfaces

- adopted project: one event written to the hosted store and read back after the migration.

## Proof

Automated: `node --test tests/backlog-events.test.mjs tests/work-items.test.mjs`; `npm run check`.
By hand: none.
⚑ A hosted migration on the existing Supabase Free project. No cost.

## Deliberately open

Retention: how long events are kept. Settled when the readout is first used.

## Next action

Apply migration 019 with the owner (activation step migration-019), then write one event from the web and read it back on /backlog/history.

## Trajectory
- **2026-11-06** Events are short codes only (a Not now reason is stored as `stated` or `none`); the history readout is one function, used by the CLI and /backlog/history.
