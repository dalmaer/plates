---
attempt: {"accepted":true,"verified":true,"rework":1,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 187 — every answer on a card is a button that works

- Date: 2026-11-06
- Phase: 187
- Revision: the base commit 0d471cf6 and branch claude/phase-187 (ffb051f5, e0eaf493, c630337d, a4ed6d6b, 3fedc6f9), and this record's commit
- Claim being checked: hosted walk answers no longer time out; no web view shows an answer's command; Done on a step writes its mark from the card; Merge from Review completes.

## What started it

The owner, on their phone in the hosted Review session:

- Done on `plates:step:75` said it was not written from here and to run a command.
- A walk answer came back "The write was refused (upstream_unavailable)".

Production logs (`vercel logs --project plates --environment production`, read 2026-11-06 around 22:05 UTC) showed `POST /api/home/answer` returning 503 five times and 200 once, plus one `decisions/apply` 200. The walk preview read all 180 `docs/phases/*.md` blobs one after another under one 25s deadline. Twenty sequential blob reads from this machine took 9s, and the phase files total 886,859 bytes, under the 4 MB read cap.

## Automated checks

- `node --test tests/web-home-answers.test.mjs`: exit 0, 5 pass (conductor, after increment 0). The builder later ran 16 test files, listed below.
- Builder, after each increment: `npm run check:focused` exit 0. `node --test` passed on web-home-answers, web-review (16 pass), loose-ends, work-items, web-operations, web-walks, web-walk-operations, web-walk-ui, web-home, home-isomorphism, names-verify, web-operation-coverage, web-design, surface-budget, door-class, cli and backlog-events.
- `plates prove` VERIFIED for ffb051f5 (the 190-phase walk test failed before the fix with 413 phase_inventory_limit) and for 3fedc6f9 (the held Merge test failed before the fix).
- `tests/web-activation-plan.test.mjs` with the new step `step-done-web`.
- The gate runs after this record: `plates integrate` runs `npm run check` (the whole suite, lint, guards) on the integrated tree. Its result goes in the integrate record.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read `lib/web/step-marks.mjs` and `lib/loose-ends-marks.mjs` | The web writes the CLI's mark shape, re-checks at apply, never overwrites a bad file | As expected; the CLI's `mark()` imports the same module lazily | The shape is shared, not copied |
| Owner presses Done on a step from their phone | The step leaves Home | Not run (needs deploy) | Owed: the ⚑ walk |

## Gaps and decision

- Hand to an agent is not built on the web (increment 3). It keeps its reason, the App's Issues permission, and no command.
- The test harness's Home reader cannot read 190 phases (a planning gap there). The test adds the extra phases after Home's read. Production Home reads through a different path, so this may be a harness limit only; not checked further.
- Status `partial`, owes the owner's walk after deploy.
