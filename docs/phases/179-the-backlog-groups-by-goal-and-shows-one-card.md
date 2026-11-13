---
status: built
since: 2026-11-06
goal: G7
spec: 2
depends: [178]
note: "Built: a grouping module gives each item one card, and By goal shows in plates home --backlog --by-goal and on /backlog/goals."
evidence: ["evidence/2026-11-06-backlog-goals.md"]
---

# The backlog groups by goal and shows one card per phase

## Done when

The By goal arrangement shows a header per goal with lane counts, and each phase's walk, decisions and review findings nest under that phase's one card. See [the backlog spec](../specs/web-backlog.md).

## Scope

- Deterministic grouping rules as a pure, golden-tested module: each item joins exactly one card; dedupe by project + phase + acceptance item; a PR's findings group under the PR.
- Goal headers collapse after 7 items; pinned goal order is a display preference.
- Out of scope: any learned or LLM grouping.

## Integration increments

1. The grouping module and golden fixtures, unused.
2. By goal in both renderers.

## Acceptance

- [x] Every item appears in exactly one card: `tests/backlog-grouping.test.mjs: "each item has one home"`
- [x] Similar items in different plates are never merged: `tests/backlog-grouping.test.mjs: "plates never merge across projects"`
- [x] Both source links survive a dedupe: `tests/backlog-grouping.test.mjs: "a merged item keeps both sources"`

## Real surfaces

- fleet over time: grouping holds on the owner's real phases, not only fixtures.

## Proof

Automated: `node --test tests/backlog-grouping.test.mjs`; `npm run check`.
By hand: none beyond 178's walk.
⚑ None.

## Deliberately open

Whether nested children are expanded by default on phones. Settled by the first week of use.

## Next action

None: built. Whether nested items start collapsed on phones stays open (Deliberately open).

## Trajectory
- **2026-11-06** Goals are per plate, so headers read "Plate · Goal"; a goal with no cards gets no header. HOME_MODEL_VERSION 17.
