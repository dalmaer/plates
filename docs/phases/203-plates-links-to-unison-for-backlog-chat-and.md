---
status: planned
since: 2026-11-20
goal: G9
spec: 2
depends: [200, 201, 202]
note: "Filed: plates's backlog, chat and channel, Recurring view and agents sidebar are removed from the CLI and the site; each becomes a link to the plate's Unison workspace."
evidence: []
---

# Plates links to Unison for backlog, chat, recurring and agents

## Done when

Plates has no backlog, chat or channel, Recurring view or agents sidebar of its own, in the CLI or
on the site; where each was, a plate with a workspace shows a link to the same place in its Unison
workspace, and a plate without one shows Home's offer to make one; and Home, phases, `plates next`,
reviews, deploys and the night shift work as before.

## Scope

Removed, with their commands, routes, views, stores and tests:

- the backlog: lanes, goal groups, one-card view, item history and assists (phases 178, 179, 180,
  184; lib/web/backlog-*, lib/backlog-events.mjs, lib/assist.mjs);
- chat and the channel: the visible chat, the per-project channel, `plates channel`, the Discord
  bridge (phases 149, 194; lib/channel*.mjs, lib/chat/, lib/web/channel-*);
- the Recurring view (phase 185; lib/web/recurring-model.mjs). The routines themselves keep
  running: only the view goes;
- the agents sidebar (phase 186; lib/web/agents-model.mjs).

Each removed phase moves to `superseded`, its note naming this phase. Phase 196's workspace
becomes Home plus links. The removal is for every plate, with or without a workspace: the owner
approved deleting it all on 2026-11-20. The hosted rows of removed features are dropped by a
migration in increment 4; its exact tables are shown to the owner before it runs against
production.

## Integration increments

1. **Links in place**: each surface shows a link to the workspace beside it. Nothing removed yet.
2. **The CLI surfaces go**, with their tests; the commands say where the thing now lives.
3. **The site surfaces go**, with their routes and views, and the removed phases are superseded.
4. **The hosted rows go**: one migration drops the removed features' tables, shown to the owner
   before it runs against production. Recovery: the pre-migration backup.

## Acceptance

- [ ] Each removed command says where its thing now lives, with the plate's workspace link or the offer to make one: `tests/unison-retire.test.mjs: "a removed command points at Unison"`.
- [ ] The site has no backlog, channel, Recurring or agents routes, and Home links to the workspace in both forms: `tests/unison-retire.test.mjs: "the site links to Unison instead"`.
- [ ] Home, `plates next`, reviews, deploys and routines are unchanged: `npm run check`.
- [ ] ⚑ by hand: owner. The deployed site shows Home and links to Unison, and nothing it used to show is missing from Unison.

## Your part

- **Ask:** Open the Plates site on your phone and check each old page now links to Unison, and that what it used to show is there.
- **Why:** It proves nothing was lost in the move.
- **Look at:** Home on the Plates site.
- **Choices:** Nothing missing | Something missing
- **Takes:** About 10 minutes.
- **Then:** Nothing missing: the phase is built. Something missing: it becomes a fix before the removal stands.
- **Ready when:** increment 3 is merged and deployed.

## Real surfaces

- Owner's machine: the removed commands on the installed CLI point at the real workspace.

## Proof

Automated: `npm run check:focused -- tests/unison-retire.test.mjs`, then `npm run check`.
By hand: the owner's walk above.
⚑ The migration that drops the removed features' hosted tables runs against production only
after the owner sees its table list.

## Deliberately open

- Fleet projects that used plates's backlog or channel lose them until they connect a workspace;
  the owner accepted this on 2026-11-20. Home's offer to make a workspace is the path.

## Next action

Increment 1, once phases 200 to 202 have landed: links in place.
