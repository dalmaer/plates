---
attempt: {"accepted":true,"verified":true,"rework":1,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 184 — the backlog remembers what happened to each item

- Date: 2026-11-06
- Phase: 184
- Revision: "local events" (a013e965), "hosted events" (2c0c2d6b), "the history readout in both forms" (d9463485), and this record's commit
- Claim being checked: the events hold metadata only, never reorder the backlog, and read back the same in the CLI (`plates home --backlog --since`) and on the web (`/backlog/history`).

## Automated checks

- The builder ran `npm run check:focused` over 21 files: exit 0, 343 pass. `npm run typecheck` and `npm run render:check`: exit 0. `npm run look` captured /backlog/history with events and before 019.
- Acceptance tests:
  - tests/backlog-events.test.mjs "metadata only": every 12-character window of a long owner reason and title is checked against the local bytes, the RPC body and the PGlite row.
  - tests/backlog-events.test.mjs "events refuse a tracked directory".
  - tests/work-items.test.mjs "events never reorder".
  - tests/home-isomorphism.test.mjs "history matches in both forms".
- Rework: the first build had the readout in the CLI only, so it went back for the web form under the one-model rule.

## Migration

`lib/web/migrations/019-backlog-events.sql`, SHA-256 `25cea9a2acb0c6d1904b3979f3369e75899c46861cad8c5617430e70ecc3b597`, with its hosted proof `docs/evidence/2026-11-06-web-backlog-events-hosted-proof.sql`. It is append-only (a trigger blocks UPDATE and DELETE) and scoped by an owner digest. Not applied yet: that is activation step `migration-019`, with the owner.

## Gaps and decision

Partial. Still to do:
- apply 019 and read one event back from the hosted store;
- web answers to walks and decisions don't write events yet (only Not now does);
- nothing records "view" events;
- retention is not decided.

## Migration 019 applied (2026-11-07)

- Applied `lib/web/migrations/019-backlog-events.sql` to the hosted database (Supabase project plates-workspace) in the SQL editor, at the owner's "apply 019". The editor's text was set from the file at 9b3c234; its SHA-256 in the page was `25cea9a2acb0c6d1904b3979f3369e75899c46861cad8c5617430e70ecc3b597` (5,916 bytes), equal to the source. Result: "Success. No rows returned".
- Ran `docs/evidence/2026-11-06-web-backlog-events-hosted-proof.sql` (SHA-256 `ca9fea06…fdb10b`, checked in the page). Result: one row, `PASS 019-backlog-events hosted proof`. Its synthetic Acme rows were rolled back.
- Production serves 9b3c234, which carries 184's hosted writes, so events are stored from now on.
- Not yet observed: one event written from the deployed web and read back on /backlog/history. It needs the owner's next answer on the web (a Not now, or any written answer).
