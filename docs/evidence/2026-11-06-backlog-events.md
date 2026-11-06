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
