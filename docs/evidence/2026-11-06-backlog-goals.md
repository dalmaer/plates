---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 179 — the backlog groups by goal and shows one card per phase

- Date: 2026-11-06
- Phase: 179
- Revision: "grouping module" (b13b5425), "By goal in both forms" (88f49d48), and this record's commit
- Claim being checked: every item joins exactly one card, plates never merge, and By goal shows a header per goal with lane counts, in the CLI and on /backlog/goals.

## Automated checks

- The builder ran `npm run check:focused` over backlog-grouping, home-isomorphism, web-backlog, web-backlog-client, web-design, web-operation-coverage, names-verify, surface-budget, web-activation-plan, guides and work-items: exit 0, 236 pass. `npm run render:check`: exit 0.
- Acceptance tests in tests/backlog-grouping.test.mjs: "each item has one home" (held to tests/fixtures/backlog-grouping/golden.json), "plates never merge across projects", and "a merged item keeps both sources". Also "by goal matches in both forms" in tests/home-isomorphism.test.mjs.
- The builder ran `plates home --backlog --by-goal` on plates itself: it grouped under G0–G9, and phase 129's stale claim nested under that phase's card.
- The conductor looked at the light phone capture of /backlog/goals. It shows "Plate · Goal" headers with lane counts; the question-led walk row leads G1; "List · By goal" sits at the top.

## Gaps and decision

Built. Real surface: the hosted /backlog/goals after deploy, read with the rest of the backlog. HOME_MODEL_VERSION is 17, the backlog.css cap is 3300, and flags are 205. Still open, as the phase says: whether nested items start collapsed on phones.
