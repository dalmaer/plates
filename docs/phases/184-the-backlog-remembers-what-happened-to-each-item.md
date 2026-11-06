---
status: planned
since: 2026-11-05
goal: G7
spec: 2
depends: [181]
note: "Specified in docs/specs/web-backlog.md. Metadata only."
evidence: []
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

- [ ] Events hold no source text or owner words: `tests/backlog-events.test.mjs: "metadata only"`
- [ ] Ordering is identical with and without events: `tests/work-items.test.mjs: "events never reorder"`
- [ ] A tracked events directory is refused: `tests/backlog-events.test.mjs: "events refuse a tracked directory"`

## Real surfaces

- adopted project: one event written to the hosted store and read back after the migration.

## Proof

Automated: `node --test tests/backlog-events.test.mjs tests/work-items.test.mjs`; `npm run check`.
By hand: none.
⚑ A hosted migration on the existing Supabase Free project. No cost.

## Deliberately open

Retention: how long events are kept. Settled when the readout is first used.

## Next action

Write the local event writer with the metadata-only test.
