---
status: partial
since: 2026-11-21
goal: G9
spec: 2
depends: [178]
note: "Increments 1 and 2 built and run for real: every fleet plate is connected, with the owner joined; today is synced. The fleet sync, plates's own workspace, increment 3 (events, Home states) and 4 (typed links) remain."
evidence: ["evidence/2026-11-21-unison-status-connect-sync.md"]
---

# Each plate's work is its Unison backlog, and links back

## Done when

A plate has a Unison workspace that plates made for it (or that the owner named), and the
workspace's backlog holds one item for each open phase of the plate, and, when the plate turns on
issues, one for each open GitHub issue of its repo. Each item links back to its phase or issue;
a phase built or an issue closed closes its item; a rename or a hand-edited item never makes a
second item; and a Unison that cannot be read shows on Home as "Unison not read", never as an
empty backlog.

## Scope

Unison (digitalex/unison, MIT) is a workspace where people and agents share a ranked backlog,
chat and recurring tasks. Its CLI and HTTP API cover every backlog operation. Plates rents it as
the place work is queued and talked about (G9) and keeps the judgment: what is built, its proof,
dependency order and what is safe to land. Phase 203 then retires plates's own backlog, chat,
Recurring view and agents sidebar in favour of links to the workspace.

- **The GitHub repo is the key.** A plate, its Unison workspace and its isocan canvas are joined
  by one thing: the plate's GitHub repo (`owner/repo`). Plates finds a plate's workspace by the
  repo it lists, never by name or a stored id alone; one repo has at most one workspace, and two
  workspaces listing one repo are refused as ambiguous, never guessed between. The canvas is the
  one the workspace names.
- **The workspace, made by plates.** `plates unison connect` first looks for a workspace that
  lists the plate's repo; only when there is none does it create one
  (`unison workspace create <plate> --repo <url>`), when the owner is signed in to Unison on this
  Mac (`unison login`, once per Mac). Not signed in is a Home card that asks the owner to sign in,
  never a silent skip. Plates caches the workspace id in the plate's private state; the repo stays
  the truth.
- **Sources.** Each plate's config chooses `unison.sources`: `phases` (the default) and, where
  wanted, `issues`. Both come from the plate's own repo only: one repo has one workspace, so a
  link naming another repo listed in the workspace is never this plate's to adopt, close or
  retitle. A phase is open while its status is not built or superseded.
- **The link line.** `Phase: <url of the phase file>` or `Issue: https://github.com/<owner>/<repo>/issues/<n>`
  at the start of a line in the item's body; the first such line counts. Plates writes it as the
  body's last line, and escapes any line of copied text that would read as one (`\Issue:`,
  `\Phase:`), so copied text can never name a different link. Any other URL in the body is prose.
  An issue URL whose repo is not one of the workspace's repos is ignored.
- **The map.** Plates keeps, per plate, source id (the phase number, or the issue's node id,
  resolved through the GitHub API so a renamed repo still matches) → item id, and whether sync
  closed the item. The line is the link people see; the map is what stops a duplicate. An item
  whose line was removed by hand is unlinked, and plates does not recreate an item for a source
  its map already holds.
- **Who owns what.** The phase file or the issue owns the title and whether the work is open.
  Unison owns position and assignee; phase 201 makes the assignee the claim.
- **Closing.** A built phase or a closed issue closes its item with a note, and the map records
  that sync closed it. Reopened work reopens the item only when sync closed it; an item closed in
  Unison by a person or agent while its work is open is a Home suggestion, never an automatic
  close or reopen. Closing an item never builds a phase.
- **The other way, on request only.** `plates unison file <item> --as phase|issue` drafts a phase
  (`plates phase new`) or files an issue from an item and links both. Never automatic: the
  workspace is private and a plate's phases and issues may be public.
- **When Unison ships typed links on items** (being added upstream by the owner): read them
  first, fall back to the line, backfill them from the line, leave the line. One parser changes.

Out of scope: claims (phase 201), chat and asks (phase 202), and removing plates's own surfaces
(phase 203).

## Integration increments

1. **The line, the map and the plan, read-only.** `lib/unison-link.mjs` parses and writes link
   lines; `plates unison status` reads a workspace's items, the plate's phases and (if on) its
   issues, and prints what a sync would do, changing nothing. Compatibility: new files only;
   nothing runs unless a plate names a workspace. Proof: tests/unison-link.test.mjs against a stub
   `unison` and fixture GitHub. Recovery: revert.
2. **Connect and sync from the CLI.** `plates unison connect` and `plates unison sync`. Exposure:
   only plates that ran connect. Recovery: revert and keep the map, which the next sync reuses.
   The map is rebuilt from lines only when every item it holds still carries its line; otherwise
   sync stops and names the items that lost theirs.
3. **Sync on events** (a phase's status change landing on main; GitHub issue events through the
   plates GitHub App), with Home's "Unison not read" state, the close suggestion and the
   sign-in card, in both forms.
4. **Unison's typed links**, read first, once upstream ships them.

## Acceptance

- [x] Only a link line at a line start links an item, and an issue URL only for a workspace repo; other URLs in the body do not: `tests/unison-link.test.mjs: "only the link line links, and only to the workspace's repos"`.
- [x] Copied text holding its own link line is escaped, and the item links only to its own phase or issue: `tests/unison-link.test.mjs: "copied text cannot name the item's link"`.
- [x] A sync plan creates one item per unlinked open phase (and issue, when on), retitles, closes and reopens, and never plans a second item for a source the map holds, even when its line was removed; the map is not rebuilt from lines while any mapped item lacks its line: `tests/unison-link.test.mjs: "the plan never makes a second item for one source"`.
- [x] Open work reopens its closed item only when sync closed it; an item a person or agent closed is a suggestion instead: `tests/unison-link.test.mjs: "plates closes and reopens only what it closed"`.
- [x] A `unison` that is missing, fails or answers without its array leaves the plan unread, never empty: `tests/unison-link.test.mjs: "Unison not read is never an empty backlog"`.
- [x] `plates unison connect` finds the workspace that lists the plate's repo, creates one only when none does, refuses two, and when not signed in leaves a sign-in card and creates nothing: `tests/unison-connect.test.mjs: "the repo finds the workspace, or connect makes one"`.
- [ ] Home shows "Unison not read", the close suggestion and the sign-in card in both forms (increment 3): `tests/unison-home.test.mjs: "Unison's states are said on Home in both forms"`.

## Your part

- **Ask:** Sign in to Unison on your Mac when plates asks, let it make a workspace for one plate, check the plate's open phases are in its backlog with links back, and check a phase marked built closes its item.
- **Why:** It proves plates can make and fill a workspace against the real Unison, which the tests stub.
- **Look at:** The plate's backlog in Unison.
- **Choices:** It works | Something is off
- **Takes:** About 10 minutes.
- **Then:** It works: the phase is built. Something is off: the conductor reads the sync log.
- **Ready when:** increment 3 is merged, deployed and installed, and its Home checks pass.

## Real surfaces

- Owner's machine: `plates unison connect` makes a real workspace, and `plates unison status` lists the plan for it.
- GitHub API: a real issue resolves to its node id and its state drives the plan, for a plate with issues on.

## Proof

Automated: `npm run check:focused -- tests/unison-link.test.mjs tests/unison-connect.test.mjs`
(the parser, the plan, connect and the not-read path against a stub `unison`), then
`npm run check`.
By hand: the owner's walk above.
⚑ Signing in to Unison once per Mac (`unison login`, in the browser); no cost.

## Deliberately open

- The credential a running sync uses on the hosted side. An agent's pass lasts 15 minutes and its
  token lapses after 24 hours idle; a member's account token does not, but is broad. The CLI uses
  the owner's local sign-in; the hosted side waits for a workspace integration token upstream, or
  a decision to seal the owner's.
- Whether an item's body follows its phase's Done when or stays the owner's to edit. Open until
  the walk.

## Next action

Sync the fleet; close the 68 open imported items in plates's own workspace (the owner chose this) and sync plates; then increment 3.

## Trajectory

- **2026-11-21** — A workspace's creator cannot write to it until they join it as a participant (`unison join --account`); reads work without. connect now joins once and keeps the session outside every checkout.
- **2026-11-21** — Most fleet plates keep phases in shapes other than plates's own (local variants, the projects shape, none); sync reads them with the readers `plates next` already uses rather than refusing them.

- **2026-11-21** — Plates's own workspace already held 104 items imported from its GitHub issues, with Markdown phase links to the old keel URLs that the link line rightly ignores; a first sync there would duplicate them in substance, so adopting or retiring imported items is a decision before syncing an existing workspace.
- **2026-11-21** — The agent guide's cold start reached its 3,200-character cap with this verb; the next verb needs a trim or a raised cap.
