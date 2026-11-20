---
status: planned
since: 2026-11-20
goal: G7
spec: 2
depends: [193,194]
note: "Increment 1 (Rex panes blocked on the owner reach Home) is being built."
evidence: []
---

# An agent waiting on me anywhere reaches me, and my answer reaches it

## Done when

An agent that stops for the owner (a permission prompt, a question or a sign-in in its Rex pane,
or an ask it raises itself) shows on Home in both forms within one push of the Mac's sessions
scan, says what it waits for and where, and the owner's answer reaches that agent with a delivery
state Home shows (delivered, waiting for the agent, or failed) — without plates typing into a pane
the owner may be using.

## Scope

Learned from Plannotator's Inbox (backnotprop/plannotator, MIT/Apache-2.0), which reads Rex's
per-pane program status and never types into a pane:

- **Blocked panes (increment 1).** Rex keeps, for each terminal block, the status a program in it
  reported with OSC 7501 (`block.method` `program_status`: `idle`, `working`, `done`, `blocked`,
  `error`; a blocked record's `kind` is `permission`, `question` or `auth`). Codex and Claude Code
  report it. The Mac's sessions scan (`plates sessions push`, lib/waiting-scan.mjs) asks this Mac's
  Rex for each block's root record and keeps only blocked ones: the block id, its session's label,
  its tab label, the reporting app, the kind and when it was reported. A record's free text
  (`title`, `msg`) and the pane's contents are never read. The plate is the session label's plate
  (`<plate>-<provider>`, rexLabel): the longest known plate the label equals or starts with;
  any other session is counted, not listed. Home's "Sessions waiting on you" row lists them in both
  forms with `rex focus` as the command that goes there. No Rex, a slow Rex or an unreadable answer
  is "Rex not read" in the row's reason, never "none waiting".
- **Asks an agent raises (increment 2).** `plates ask` (CLI and an MCP tool) lets a working agent
  put a typed card on Home (a question with options and a recommended answer, a blocker, a plan or
  a diff to review) and keep working. The card names the agent's attach receipt or session.
- **Answers that arrive (increment 3).** An answer reaches the agent through its own channel where
  one exists (the next turn of a Claude Code or Codex session, read with `plates channel inbox`),
  else by resuming the session in a new Rex tab, never by typing into an existing pane. Home shows
  each answer's delivery state. This replaces lib/channel-deliver.mjs's typed delivery.

Out of scope: Rex on another machine (`rex -S`), which phase 193's remote increment owns; batching
answers before sending (#542), the sent-version check (#543) and sectioned review (#544).

## Integration increments

1. **Blocked Rex panes reach Home.** The snapshot gains optional `panes` (absent: not read; `[]`:
   read, none), validated field by field on push; `waitingRows` lists them. Compatibility: older
   snapshots and devices without Rex are unchanged; the hosted store keeps the same sealed column and
   bound (panes fit the existing 384 KiB budget). Proof: tests/waiting-sessions.test.mjs, then the
   real surfaces below. Recovery: revert, then the next push from the Mac drops `panes`.
2. **`plates ask`**: typed asks on Home, answered in place.
3. **Delivery through the agent's own channel**, with delivery states, replacing typed delivery.

## Acceptance

- [ ] A blocked pane in this Mac's Rex is in the snapshot with only its block id, session label, tab label, app, kind and time, and a record's free text never is: `tests/waiting-sessions.test.mjs: "a blocked Rex pane is kept with only its place and kind"`.
- [ ] Panes that are working, idle, done or in error are not kept, and panes in sessions that name no known plate are counted, not listed: `tests/waiting-sessions.test.mjs: "only blocked panes on known plates are listed"`.
- [ ] No Rex, or a Rex that fails, leaves `panes` absent and the row says Rex was not read: `tests/waiting-sessions.test.mjs: "no Rex is not read, never none"`.
- [ ] A pushed snapshot with a pane field it does not hold is refused: `tests/waiting-sessions.test.mjs: "a pane field the snapshot does not hold is refused"`.
- [ ] ⚑ by hand: owner. A Codex or Claude tab in Rex stopped on a permission prompt shows on the deployed Home within one push.
- [ ] `plates ask` puts a typed card on Home in both forms (increment 2).
- [ ] An answer reaches the asking agent without typing into a pane, and Home shows its delivery state (increment 3).

## Your part

- **Ask:** Leave one agent tab in Rex waiting on a permission prompt, then open the Plates site on your phone and check it is listed under Sessions waiting on you.
- **Why:** It proves the Mac's scan reads Rex and the site shows it, which a test cannot.
- **Look at:** Home on the Plates site, the "Sessions waiting on you" row.
- **Choices:** It shows | It does not show
- **Takes:** About 5 minutes.
- **Then:** It shows: increment 1's walk is done. It does not show: the conductor reads the push log.
- **Ready when:** increment 1 is merged, deployed and installed on the Mac.

## Real surfaces

- Owner's machine: `plates sessions waiting --json` on this Mac lists a pane Rex reports blocked.
- Hosted Home: the deployed site lists it after `plates sessions push`.

## Proof

Automated: `npm run check:focused -- tests/waiting-sessions.test.mjs` (the scan against a stub `rex`
that answers `ls`, `block ls` and `api call block.method`, the validator and the rows), then
`npm run check`.
By hand: the owner's walk above.

## Deliberately open

- Rex reports what a program says of itself. A program that never sends OSC 7501 is never listed;
  one that says blocked and is not stays listed until it says otherwise. Plates shows Rex's word,
  with the time it was reported.
- Panes in sessions plates did not create are listed when their label names a plate, since the
  owner's own tabs waiting on them are the point. Whether that is too broad is open until the walk.

## Next action

Build increment 1 on `claude/phase-199-agents-blocked-anywhere`.
