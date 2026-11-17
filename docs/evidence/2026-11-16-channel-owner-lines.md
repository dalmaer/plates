---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 194 — the owner addresses agents (increment 3)

- Date: 2026-11-16
- Phase: 194
- Revision: base `8fc283f0`, working tree on `claude/phase-194-inbox` (commit "phase 194: Each project has a channel on the Plates site")
- Claim being checked: Acceptance box 7. The owner's line naming a phase reaches that session's `plates channel inbox` once. An agent's line naming another agent reaches no inbox. A checkpoint shows answered after that session's next line. This file records the code and tests; the hosted half waits on migration 025.

Built by a builder subagent and verified by the conductor.

## Automated checks

- `node --import ./tests/helpers/hermetic.mjs --test tests/channel-inbox.test.mjs tests/channel.test.mjs tests/channel-say.test.mjs`: exit 0, 17 tests passed, run by the conductor on the working tree. `tests/channel-inbox.test.mjs` applies 001–025 to an in-process database and drives the real site routes and the CLI. Its three box-7 tests:
  - "the owner's line naming a phase reaches that session's plates channel inbox exactly once";
  - "an agent's say line naming another agent reaches no inbox, and a device-key body claiming to be an owner line is refused";
  - "a checkpoint shows answered after that session's next line".
  A fourth test, "before migration 025 the form says the channel cannot take the owner's lines yet, and agents' lines still work", covers the window before 025 is applied.
- The builder ran `npm run check:focused` on the channel, hosted-proof, activation-plan, operation-coverage, web-design, surface-budget, door-class, guides, cli and docs tests: exit 0, 236 tests passed.
- The whole gate is `npm run check` (the full suite, the installed-package tests, roadmap, render and inbox checks), run once by `plates integrate` on the combined tree. Its result goes in the commit that records the landing.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read migration 025 | `post` and `list` unchanged from 024; adds `owner-post` and `list-marked`; same signature and grants | As expected; `owner-post` refuses a digest that is a device key and allows 10 of the owner's lines per project per minute | The migration only adds operations; it does not prove the hosted apply |
| Read the new tests | They drive real routes and storage, not stand-ins | The tests post through the site's form with CSRF, origin and session checks, read through the device route and the CLI's `inbox`, and check that the dumped table holds no plaintext | The tests can fail on the behaviour box 7 names |
| Applied 025 on the hosted database | — | Not run: ⚑ the owner's yes | — |

## Gaps and decision

- Migration 025 and its hosted proof (`docs/evidence/2026-11-16-web-channel-owner-lines-hosted-proof.sql`) need the owner's yes. Until then the deployed form refuses with a clear 503, and every other part of the channel works.
- Box 7 stays unchecked until the hosted proof passes and a real owner line reaches a real `plates channel inbox`. Box 8 is the owner's walk.
- Preview, correction and accepted progress steps from the site are not built here.
- The phase stays partial.

## Hosted (2026-11-17, conductor)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read-only check before applying | the channel function present, without `owner-post` | `rpc_present` true, `owner_post_already` false | 025 had not been applied |
| Applied `lib/web/migrations/025-channel-owner-lines.sql` from merge `b6d9fb36` in the Supabase SQL editor (owner's yes, 2026-11-17) | the editor holds exactly the merged file | SHA-256 `8c9ddc6c5170b1cf083aa25e16db047b222b30eaed58965145cccb6f3cc53b86` matched in the page; "Success. No rows returned" | The reviewed bytes were applied |
| Ran `docs/evidence/2026-11-16-web-channel-owner-lines-hosted-proof.sql` (SHA-256 `8377bf18…dd16` matched) | one row `PASS 025-channel-owner-lines hosted proof` | `PASS 025-channel-owner-lines hosted proof`; synthetic rows rolled back | device `post`/`list` unchanged; `owner-post` refuses a device key's digest; `list-marked` marks the owner's lines; the per-minute bound; owner lines stamped under the lock, in order |
| Main CI on `b6d9fb36` | pass | first attempt failed two timing tests in `tests/backlog-attach.test.mjs` ("attach settled promptly"), which pass locally and on the previous commit; the re-run of the failed job passed | the failure was timing under CI load, not #488 (tracked) |
