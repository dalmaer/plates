---
status: partial
since: 2026-11-04
goal: G5
spec: 2
depends: [157]
note: "Increment 1 built: the measurement contract and a pure reader, proven on synthetic cases; nothing is shown to the owner yet."
evidence: ["evidence/2026-11-04-integration-delays.md"]
---

# Integration delays and work in progress are visible

## Done when

An owner can distinguish active work from branch, review, CI and integration waiting with source coverage and a concrete next action.

## Scope

Extend existing ready/claim, board and measurement readers with attributed
branch age, WIP and review/CI/queue wait. Reuse phases 56 (time), 83 (integration),
110–111 (validation audit/preflight), 116 (verification) and existing health views.
Non-goals: another scheduler, new approval store, automatic cleanup, gate bypass,
new merge authority or a claim of speedup from fixture data.

Read [the Plates philosophy](../philosophy.md); preserve existing phase ownership
and evidence. Dependencies name prerequisites, not automatic acceptance of their
outstanding real-surface walks.

## Integration increments

1. First safe merge: read-only timestamp/coverage contracts and synthetic cases;
   existing outputs remain compatible and missing data is explicitly unavailable.
2. Add opt-in CLI/report observations, then surface them in existing board/night
   views. Keep thresholds advisory and record the source/revision/time window.
3. Capture a dated real baseline before recommending queue limits. Revert the
   presentation/reader changes if faulty; do not mutate branches or claims.

## Acceptance

- [ ] An owner can distinguish active work from branch, review, CI and integration waiting with source coverage and a concrete next action. Check: `npm run check:focused -- tests/integrate.test.mjs tests/work-items.test.mjs tests/integration-delays.test.mjs` plus read-only baseline inspection.
- [ ] Hours/same-day branch guidance and one active increment per builder produce actionable observations, with no automatic deletion or authority expansion Check: `npm run check` with added synthetic age/WIP cases.
- [x] Missing timestamps, skew, unreadable claims and incomplete history stay gaps rather than zero wait; start/end definitions and denominators are documented Check: `npm run check` with negative cases for incomplete observations (tests/integration-delays.test.mjs, the "unknown:" and "conflicting:" cases; docs/specs/integration-delays.md).
- [ ] A dated baseline pairs time-to-main, waits and work in progress with change failure, recovery and escaped-defect evidence, including unavailable measures Check: `node bin/plates.mjs time --json` plus a retained read-only report of the pilot project.

## Proof

Named test cases (tests/integration-delays.test.mjs, 2026-11-04): fresh, quiet, stale and work-in-progress branches; ready with the lock free, behind a live lock and behind a stale one; sent back; PR checks pending, failed and passed; main CI running and red; deploy waiting and done; the tested ref current, behind and unread; and unknown (unread source, missing timestamp, unreadable claim, skew, partial source, deleted ready ref) and conflicting observations. Exercise fixed
clock fixtures for stale, fresh, unknown and conflicting observations, then run
`npm run check:focused -- tests/integrate.test.mjs tests/work-items.test.mjs tests/integration-delays.test.mjs`,
`npm run check` and `npm run typecheck`. Read existing history on one authorized
project without starting work or spending money; retain source IDs, measurement
commands, window and gaps. Set proposed queue budgets from that baseline.

## Real surfaces

- GitHub API: read one authorized project's ready/claim, PR and CI history; preserve unavailable permissions and incomplete coverage.

## Deliberately open

Metric start/end timestamps and queue service targets must be selected from
available source evidence before implementation. A timestamp proxy cannot prove
active coding time. Existing users may lack enough traffic to estimate failure
rate or recovery time; keep that limitation visible.

## Next action

Increment 2: an opt-in reader that builds observations from git, gh and the repository activity API, put into the home/work-items model so `plates home` and the hosted home show the same waits.

## Trajectory

- **2026-11-04** — The board named in Acceptance and Proof is retired; its checks are tests/work-items.test.mjs (the home model) and tests/integration-delays.test.mjs.
- **2026-11-04** — A ready/<branch> ref is deleted when it lands, so the time it became ready survives only in the repository activity API; and an integrate merge's committer date runs about ten minutes ahead of its push to main, so landing is measured from the push. docs/evidence/2026-11-04-integration-delays.md.
