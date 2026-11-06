---
status: partial
owes: walk
since: 2026-11-05
goal: G7
spec: 2
depends: [166]
note: "Built in three increments: backlogOf, plates home --backlog, and the hosted /backlog list beside the sidebar. Owes the deploy, then the owner's walk."
evidence: ["evidence/2026-11-05-backlog-lanes.md"]
---

# The backlog shows every plate's work in lanes, with reasons

## Done when

`plates home --backlog --json` and `/backlog` list the same items in lane sections (In flight, Yours, Agent-ready, Waiting, Recently done), each with its why-keys, for every authorized plate. The web shows them as a one-line-per-row list beside the workspace sidebar, as the spec's Views say. See [the backlog spec](../specs/web-backlog.md).

## Scope

- `backlogOf(snapshot, phases, claims)` in `lib/work-items.mjs`: lanes derived on every read, why-keys, `unblocks` from `depends:`, phase children (walk, review, decision).
- The List view and the sidebar shell in `lib/web/views.mjs` from the design layer (Backlog live; Recurring, Agents and Pending review arrive in 185 and 186), the plate chip strip with counts that say "at least" under partial coverage, and the CLI renderer.
- Attach appears on agent-ready cards as unavailable, with the reason.
- Out of scope: writes, grouping by goal (179), sessions (180), agents (181).

## Integration increments

1. `backlogOf` and its tests, unused by any view. Safe to merge; nothing changes for the owner.
2. The CLI renderer behind `plates home --backlog [--lane <l>]` (the verb budget is full: 50 of 50).
3. The hosted `/backlog` route and `/api/backlog`, linked from Home. Read-only; recovery is removing the link.

## Acceptance

- [x] A phase owing a walk appears under Yours with the walk as its child, never under Agent-ready: `tests/work-items.test.mjs: "a phase owing a walk is yours, not an agent's"`
- [x] Ordering is reproducible from the why-keys, with a stable tie-break: `tests/work-items.test.mjs: "backlog order is reproducible from its why-keys"`
- [x] A plate that could not be read shows "not read", never an empty lane: `tests/work-items.test.mjs: "an unread plate is not an empty lane"`
- [x] The CLI and the web show the same items: `tests/home-isomorphism.test.mjs: "backlog matches in both forms"`
- [x] The list is captured light and dark at 390 and 1280 px: `npm run look`
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
- owner's machine: `plates home --backlog` across the fleet prints the same items as the web.

## Proof

Automated: `node --test tests/work-items.test.mjs tests/home-isomorphism.test.mjs`; `npm run check`; `npm run look`.
By hand: the owner's walk above; a wrong reason changes the why-keys, not the lanes.
⚑ None: no resource, spend or new login.

## Deliberately open

- Agent-ready requires `spec: 2`. Older free phases would show "needs shaping" and may hide good agent work. Counting older free phases here settles whether to relax it.
- Whether Recently done belongs here or only on Home. The owner's walk settles it.

## Next action

Deploy, then the owner's walk on phone and laptop (Your part).

## Trajectory

- **2026-11-05** Increment 1 landed `backlogOf(snapshot, roadmaps, {now})`, not `(snapshot, phases, claims)`: claims arrive in each plate's `plates next` data, and each plate has its own roadmap.
- **2026-11-05** Yours orders by the spec's Ordering rules, not `DOCKET_GROUPS`; the owner's walk settles whether decisions must come before walks.
- **2026-11-05** Any edit to lib/work-items.mjs needs its sha256 refreshed in lib/web/capability-source-data.mjs, or the operation-coverage test fails.
- **2026-11-05** Importing STALE_DAYS from lib/claim.mjs broke the names observation's 128-file closure cap; backlogOf keeps its own constant, tested equal.
- **2026-11-05** `plates home --backlog` reads each plate's roadmap from its working tree through `collect` and `nextFree`, while the snapshot reads the default branch; a dirty or behind tree can disagree.
- **2026-11-05** Increment 3: the web reads claims with one App GraphQL query per plate (claim branches, then open PRs), and both forms take phases from projectFromSource's roadmap; HOME_MODEL_VERSION is 13.
- **2026-11-05** backlog.css is counted apart from the phase-171 CSS bound, with its own 2600-byte cap.
- **2026-11-05** The owner's first look found every plate "not read": `/backlog` rendered cache-only after a model-version bump, and stale counted as not read. The page now loads like Home, and stale plates stay readable with "at least" counts.
