---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 200 — each plate's work is its Unison backlog (increments 1 and 2)

- Date: 2026-11-21
- Phase: 200
- Revision: base ddb46efe and working tree, then "phase 200: plates unison status, connect and sync"
- Claim being checked: `plates unison status` prints a read-only plan from the plate's phases (and issues when on) and its workspace's items; `connect` finds the workspace whose repos match the plate's repo after normalization, creates one only when none does, refuses two, and creates nothing when not signed in; `sync` applies the plan and keeps a private map; a link line links only at a line start and only to a workspace repo; copied text is escaped; no source gets a second item; plates closes and reopens only what it closed; anything not read is "not read", never empty.

Built by a builder subagent; verified by the conductor.

## Automated checks

- `npm run check:focused -- tests/unison-link.test.mjs tests/unison-connect.test.mjs tests/cli.test.mjs tests/docs.test.mjs tests/door-class.test.mjs tests/surface-budget.test.mjs tests/web-operation-coverage.test.mjs tests/guides.test.mjs`: exit 0, "ℹ pass 173", "ℹ fail 0". Covers the six named acceptance tests against a stub `unison` on PATH and fixture GitHub answers.
- The whole gate, `npm run check`, runs in CI on the PR.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `plates unison status --json` on plates, against the owner's real Unison (signed in) | finds the Plates workspace although it lists `http://github.com/dalmaer/plates`; writes nothing | found ws_89270151; plan 122 creates, 0 retitles, closes or reopens; no map written | repo normalization and the real `workspace list` and `backlog` shapes; does not prove `connect` creating or `sync` writing |
| `unison backlog --status all --json` on that workspace, read-only | the existing items | 104 items (68 open, 3 in progress, 33 done), imported earlier from plates's GitHub issues; 12 end in a Markdown `Phase: [..](…keel…)` line, which correctly does not link | the first sync on plates would sit 122 items beside 104 that describe much of the same work: a decision for the owner before sync runs there |
| `plates unison connect` on `today` (fresh worktree of its main), signed in | creates one workspace for `dalmaer/today`; a second connect finds it | created ws_3cf5749c; second run `created: false` | find-by-repo and create against the real Unison |
| `plates unison sync` on `today` with #559's code | creates the plate's open phase items | refused: "you have not joined this workspace"; nothing written | a workspace's creator must also join as a participant to write: the follow-up makes connect join |
| `plates unison connect` then `sync` on `today` with the join follow-up (7093891f) | connect joins; sync creates the open phase items; a second sync does nothing | joined (session under the user config dir); created items 401 and 402; second sync applied 0; phase 1 held as an uncertain create left by the refused run, until its 15 minutes passed | connect, join, sync and idempotence end to end on a real workspace |

## Gaps and decision

Not yet shown: `connect` creating a real workspace and `sync` filling one (to be run on a fleet plate after merge); whether `unison backlog add --json` returns the new item's id (if not, sync stops and the link line prevents a duplicate on the next run); increment 3 (events and Home states) and 4 (typed links). The phase stays partial.
