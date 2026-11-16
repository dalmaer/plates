---
attempt: {"accepted":true,"verified":true,"rework":1,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 194 — agents post (increment 2) on the hosted workspace

- Date: 2026-11-16
- Phase: 194
- Revision: plates `45c0880c` (#469, `plates say`), deployed as `b461ee7` (with #468 and #470)
- Claim being checked: Acceptance box 6. `plates say` posts one sealed line with session, provider and phase. Over-long, too-frequent, key-shaped and keyless posts are refused, naming why. The hosted table holds ciphertext, digests and times only.

Built by a builder subagent, verified by the conductor. Rework 1: review found that `--since` was narrowing the posts read, so Here now changed with it, and that non-string identifiers were accepted. Both were fixed in `1c622a96` with tests.

## Automated checks

- `node --import ./tests/helpers/hermetic.mjs --test tests/channel-say.test.mjs`: exit 0, pass 4, fail 0 (run by the conductor at `1c622a96`).
- `node --import ./tests/helpers/hermetic.mjs --test tests/channel.test.mjs`: exit 0, pass 7, fail 0.
- PR #469 CI: `check`, `impact` and `typecheck` passed at `182f09f4`. The review gate was open.
- Gate: main's `check` on `b461ee7` passed (4744 tests), and so did `Reconcile GitHub records`.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read-only check before applying | 022's `device_keys` present; no `channel_posts` | `plates_home.device_keys` present; `channel_posts` and `plates_channel_rpc` null | 024's prerequisite was met and it had not been applied before |
| Applied `lib/web/migrations/024-channel-posts.sql` in the Supabase SQL editor (owner's yes, 2026-11-16) | the editor holds exactly the merged file | SHA-256 `ff0e59de8d18b92e48650f32d5bf330e8f61312581d209323bffa4822db78181` matched in the page; "Success. No rows returned" | The reviewed bytes were applied |
| Ran `docs/evidence/2026-11-16-web-channel-posts-hosted-proof.sql` (SHA-256 `90b36b24…98e` matched) | one row `PASS 024-channel-posts hosted proof` | `PASS 024-channel-posts hosted proof`; its synthetic rows rolled back | RLS on and no privileges for browser roles; the RPC is service-role only; columns are digests, ciphertext and times only; the post, list, once-a-minute, unknown-device, size, 14-day and 500 limits all hold |
| `plates promote b461ee7 --migrated lib/web/migrations/024-channel-posts.sql --yes` | deployed and checked | revision exact, 3 smoke checks, no errors in 120s; serving `dpl_7QvvJSDLNHTeRSQYkddkeiHrA6Jy` | 024's code serves production |
| `plates say` from this Mac with the keychain device key, then `plates channel plates --since 15m --json` | the line posts and reads back as a `say` line | "Posted to plates's channel … as plates@claude-d69ff709-conductor (claude)"; read back as kind `say` at 2026-11-16T19:33:56Z | A real post works through the deployed route and the read model |

## Gaps and decision

- The refusals are proven by tests, not by hand on the hosted site.
- Box 7 (the owner's lines and `plates channel inbox`) is increment 3. Box 8 is the owner's walk.
- The phase stays partial; box 6 is checked.
