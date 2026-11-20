---
status: planned
since: 2026-11-20
goal: G9
spec: 2
depends: [178]
note: "Filed: issue to item sync through an `Issue:` line until Unison items carry issue links."
evidence: []
---

# A plate's GitHub issues are its Unison backlog, and link back

## Done when

A plate connected to a Unison workspace has each open GitHub issue of the workspace's repos as one
backlog item that links back to its issue, within one sync after the issue opens, reopens or
changes title; a closed issue closes its item; a rename or a hand-edited item never makes a second
item; and a Unison that cannot be read shows on Home as "Unison not read", never as an empty backlog.

## Scope

Unison (digitalex/unison, MIT) is a workspace where people and agents share a ranked backlog. Its
CLI and HTTP API cover every backlog operation (`backlog add|edit|move|close|reopen`, comments,
linked PRs), but an item has no issue link yet. Until it does, the link is a line:

- **The `Issue:` line.** `Issue: https://github.com/<owner>/<repo>/issues/<n>` at the start of a
  line in the item's body; the first such line counts. Plates writes it as the body's last line,
  and escapes any line of the copied issue text that would read as one (`\Issue:`), so an issue's
  own body can never name a different issue as the item's link.
  Any other issue URL in the body is prose, never a link: bodies mention related issues. A URL
  whose repo is not one of the workspace's repos (`unison workspace repos`) is ignored.
- **The map.** Plates keeps, per plate, issue node id → item id, and whether sync closed the item
  for a GitHub closure, resolved from the URL through the
  GitHub API, so a renamed or transferred repo still matches. The line is the link people see; the
  map is what stops a duplicate. An item whose line was removed by hand is unlinked, and plates
  does not recreate an item for an issue its map already holds.
- **Who owns what.** GitHub owns title, body above the line, and open or closed. Unison owns
  position, assignee and in-progress. Plates never moves, assigns or starts an item.
- **Closing.** A closed issue closes its item with a note naming the issue, and the map records
  that sync closed it. An open issue whose item is closed reopens the item only when the map says
  sync closed it; an item closed in Unison by a person or agent while its issue is open is a Home
  suggestion ("close #n?"), never an automatic close or reopen.
- **The other way, on request only.** `plates unison file <item>` files an issue from an item and
  links both. Never automatic: Unison workspaces are private and a plate's issues may be public.
- **When Unison ships issue links** (being added upstream by the owner): read the field first,
  fall back to the line, backfill the field from the line, leave the line in place. One parser
  function changes.

Out of scope: plates phases as Unison items, and one claim across Unison's lease and plates'
phase claim (later, once the issue sync has been in use); Unison's webhooks, which hand events to
agents as instructions rather than syncing them.

## Integration increments

1. **The line and the map, read-only.** `lib/unison-link.mjs` parses and writes the `Issue:` line
   and checks the repo; `plates unison status` reads a workspace's items and a plate's issues and
   says what a sync would do (create, retitle, close, reopen), changing nothing. Compatibility: new
   files only; nothing runs unless a plate names a workspace. Proof: tests/unison-link.test.mjs
   against a stub `unison` and a fixture GitHub. Recovery: revert.
2. **The sync, from the CLI.** `plates unison sync` applies the plan through the `unison` CLI;
   the map lives in the plate's private state. Exposure: only plates whose config names a
   workspace. Recovery: revert and keep the map, which the next sync reuses. The map is rebuilt
   from `Issue:` lines only when every item it holds still carries its line; otherwise sync stops
   and says which items lost theirs, since an unlinked item and an open issue would make a duplicate.
3. **The sync on GitHub events**, through the plates GitHub App, with Home's "Unison not read"
   state and the close suggestion in both forms.
4. **Unison's issue field**, read first, once upstream ships it.

## Acceptance

- [ ] Only an `Issue:` line at a line start, naming a repo of the workspace, links an item; other issue URLs in the body do not: `tests/unison-link.test.mjs: "only the Issue line links, and only to the workspace's repos"`.
- [ ] An issue body holding its own `Issue:` line naming another workspace issue is escaped when copied, and the item links only to its own issue: `tests/unison-link.test.mjs: "an issue's body cannot name the item's link"`.
- [ ] A sync plan creates one item per unlinked open issue, retitles on a title change, closes on close and reopens on reopen, and never plans a second item for an issue the map holds, even when its line was removed; the map is not rebuilt from lines while any mapped item lacks its line: `tests/unison-link.test.mjs: "the plan never makes a second item for one issue"`.
- [ ] A `unison` that is missing, fails or answers without its array leaves the plan unread, never empty: `tests/unison-link.test.mjs: "Unison not read is never an empty backlog"`.
- [ ] An open issue reopens its closed item only when sync closed it; an item a person or agent closed is a suggestion instead; plates never moves, assigns or starts an item: `tests/unison-link.test.mjs: "plates closes and reopens only what it closed"`.
- [ ] Home shows a Unison that was not read as "Unison not read" in both forms, never as an empty backlog (increment 3): `tests/unison-home.test.mjs: "Unison not read is said on Home in both forms"`.
- [ ] Home shows the "close #n?" suggestion for an item closed in Unison while its issue is open, in both forms (increment 3): `tests/unison-home.test.mjs: "a closed item with an open issue is a suggestion in both forms"`.
- [ ] ⚑ by hand: owner. A new issue on a connected plate appears as a Unison item with a working link back, and closing the issue closes it.

## Your part

- **Ask:** Open a test issue on a plate connected to your Unison workspace, check it appears in the Unison backlog with a link back, then close it and check the item closes.
- **Why:** It proves the sync against the real Unison and GitHub, which the tests stub.
- **Look at:** The plate's backlog in Unison.
- **Choices:** It works | Something is off
- **Takes:** About 5 minutes.
- **Then:** It works: the phase is built. Something is off: the conductor reads the sync log.
- **Ready when:** increment 3 is merged, deployed and installed, its Home checks pass, and a workspace is connected.

## Real surfaces

- Owner's machine: `plates unison status` against the owner's real workspace lists the plan it would apply.
- GitHub API: a real issue resolves to its node id and its state drives the plan.

## Proof

Automated: `npm run check:focused -- tests/unison-link.test.mjs` (the parser, the plan and the
not-read path against a stub `unison`), then `npm run check`.
By hand: the owner's walk above.
⚑ Connecting a workspace needs the owner signed in to Unison (`unison login`, in the browser); no
cost.

## Deliberately open

- The credential a running sync uses. An agent's pass lasts 15 minutes and its token lapses after
  24 hours idle; a member's account token does not, but is broad. Settled when increment 2 lands,
  or sooner if Unison offers a workspace integration token.
- A hand edit to the body above the `Issue:` line is overwritten by the issue's body on the next
  retitle. Whether the item's body should follow the issue at all is open until the walk.

## Next action

Increment 1: `lib/unison-link.mjs` and `plates unison status`, read-only.
