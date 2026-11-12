---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 185 — Recurring shows every routine each plate runs

- Date: 2026-11-06
- Phase: 185
- Revision: "feat: routinesOf reads every routine a plate runs (phase 185, increment 1)" (1e02d2bc), "feat: Recurring and the sidebar's Humans and Links, in both forms (phase 185, increment 2)" (42daa604), and this record's commit
- Claim being checked: the CLI and the hosted page list each plate's routines with schedule, next run, last result and budget; the sidebar carries Humans and Links.

## Automated checks

- The builder ran `npm run check:focused` over backlog-recurring, home-isomorphism, web-recurring, web-backlog, web-backlog-client, web-design, web-operation-coverage, names-verify, surface-budget, web-activation-plan, guides and web-projects: exit 0, 235 pass. `npm run render:check`: exit 0.
- Acceptance: tests/backlog-recurring.test.mjs "each routine once, next run from its cron" and "an off routine says why"; tests/home-isomorphism.test.mjs "recurring matches in both forms".
- The whole gate, `npm run check`, runs in `plates integrate`.

## On plates itself (conductor, 2026-11-06)

`node bin/plates.mjs home --recurring --project plates`, exit 0, with times in America/Denver:

| Routine | Schedule | Last result |
| --- | --- | --- |
| Night | daily 00:23 | 1 failed (2026-11-05) |
| Climb | daily 03:17 | failure (2026-11-05), budget 45 min |
| Tend | Mon 03:18 | success (2026-11-02), budget 30 min |
| Morning | daily 10:07 | success (2026-11-05) |
| Robot | Mon 04:37 | success (2026-11-02), 60 min a week |
| Cross-review | on pull_request and issue_comment | skipped (2026-11-06) |
| Publish | on workflow_run | skipped (2026-11-06) |

Links showed the repo, the canvas and production. The conductor looked at the dark laptop capture from `npm run look`.

## Gaps and decision

Partial. The real surface still to show is the hosted `/recurring` reading the fleet through the App after deploy. Guard changes: the backlog.css cap went from 2900 to 3000 bytes, the flag budget went from 202 to 203, and HOME_MODEL_VERSION is 15.
