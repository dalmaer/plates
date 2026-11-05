---
status: planned
since: 2026-11-05
goal: G7
spec: 2
depends: [166]
note: "Specified in docs/specs/web-backlog.md. Read-only: no writes, Attach shown unavailable."
evidence: []
---

# The backlog shows every plate's work in lanes, with reasons

## Done when

`plates backlog --json` (or `plates home --backlog --json`, per the surface budget) and `/backlog` list the same items in five lanes (Yours, Agent-ready, In flight, Waiting, Recently done), each with its why-keys, for every authorized plate. See [the backlog spec](../specs/web-backlog.md).

## Scope

- `backlogOf(snapshot, phases, claims)` in `lib/work-items.mjs`: lanes derived on every read, why-keys, `unblocks` from `depends:`, phase children (walk, review, decision).
- The Lanes view in `lib/web/views.mjs` from the design layer, the plate chip strip with counts that say "at least" under partial coverage, and the CLI renderer.
- Attach appears on agent-ready cards as unavailable, with the reason.
- Out of scope: writes, grouping by goal (179), sessions (180), agents (181).

## Integration increments

1. `backlogOf` and its tests, unused by any view. Safe to merge; nothing changes for the owner.
2. The CLI renderer behind the verb or flag the surface budget allows.
3. The hosted `/backlog` route and `/api/backlog`, linked from Home. Read-only; recovery is removing the link.

## Acceptance

- [ ] A phase owing a walk appears under Yours with the walk as its child, never under Agent-ready: `tests/work-items.test.mjs: "a phase owing a walk is yours, not an agent's"`
- [ ] Ordering is reproducible from the why-keys, with a stable tie-break: `tests/work-items.test.mjs: "backlog order is reproducible from its why-keys"`
- [ ] A plate that could not be read shows "not read", never an empty lane: `tests/home-isomorphism.test.mjs: "an unread plate is not an empty lane"`
- [ ] The CLI and the web show the same items: `tests/home-isomorphism.test.mjs: "backlog matches in both forms"`
- [ ] Lanes are captured light and dark at 390 and 1280 px: `npm run look`
- [ ] ⚑ by hand: the owner, on phone and laptop.

## Your part

- **Ask:** Open the backlog on your phone and your laptop, and find the one thing you would do first.
- **Why:** It settles whether the lanes and the reasons match how you actually choose.
- **Look at:** The reasons under the first card in each lane.
- **Choices:** Found it, the reason was right | Found it, the reason was wrong (say why) | Couldn't tell
- **Takes:** About 5 minutes.
- **Then:** Right: built. Otherwise the ordering rules change here.
- **Ready when:** `/backlog` is deployed.

## Real surfaces

- adopted project: the hosted workspace (Vercel, GitHub App, read-only) shows the owner's fleet in lanes on phone and laptop.
- owner's machine: `plates backlog` across the fleet prints the same items as the web.

## Proof

Automated: `node --test tests/work-items.test.mjs tests/home-isomorphism.test.mjs`; `npm run check`; `npm run look`.
By hand: the owner's walk above; a wrong reason changes the why-keys, not the lanes.
⚑ None: no resource, spend or new login.

## Deliberately open

- Verb or flag: `plates backlog` is clearer; `.plates/surface.json` may not take a new verb. The surface budget check at the start of this phase settles it.
- Agent-ready requires `spec: 2`. Older free phases would show "needs shaping" and may hide good agent work. Counting older free phases here settles whether to relax it.
- Whether Recently done belongs here or only on Home. The owner's walk settles it.

## Next action

Run the surface budget check for one new verb, then write `backlogOf`'s first test from today's `plates next --json`.
