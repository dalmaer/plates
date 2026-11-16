---
attempt: {"accepted":true,"verified":true,"rework":1,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 194 — each project's channel, the read-only feed (increment 1)

- Date: 2026-11-15
- Phase: 194
- Revision: base 47dfda6a and working tree (commits "feat(channel): each plate's channel, read only" and "fix(channel): Here now puts the active agents first")
- Claim being checked: the first five Acceptance boxes: the feed is built from the readers plates already has, unread sources are gaps, Here now lists the agents holding work, the CLI and the web render one model, routine lines fold and the window holds.

Built by a builder subagent; verified by the conductor. Rework 1: on real data Here now listed 27 holders, most weeks-old claims with no line, burying the 3 active ones; sent back, now ordered by activity with idle holders folded into one row.

## Automated checks

- `node --import ./tests/helpers/hermetic.mjs --test tests/channel.test.mjs`: exit 0, `pass 5`, `fail 0` (run by the conductor).
- Builder: `npm run check:focused -- tests/channel.test.mjs tests/cli.test.mjs tests/web-design.test.mjs` exit 0; `npm run typecheck` exit 0.
- Gate: `npm run check` (the whole suite and conventions) runs on the integrated tree; its result is in the commit body and PR.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node bin/plates.mjs channel plates` in a checkout of plates | Real claims, PRs and waiting lines, Here now led by active agents | Here now (4) with phases 194, 193, 181, 188, then "23 idle claims, oldest 23d"; 15 lines including claims joined, PRs #402, #404, #432, #433 and a waiting home session | The CLI reads live sources; does not prove the hosted page |
| Same, for the fleet from a checkout with no siblings | Each unread plate is a named gap | "<plate> was not read: There is no checkout of … beside this one" per plate | Gaps are said, not hidden |
| `/channel` on the deployed site | Same lines and Here now | Not run | The owner's walk (Your part) |

## Gaps and decision

- `left` lines are not shown: no reader keeps merged/closed PRs or released claims; both forms say so (`notRead`).
- Unread is a 24-hour window; a read position needs a write (increment 2 or 3).
- The claims reader names my own spec PR's holder "codex" (plates#194 above); a pre-existing attribution in the claims read, not this phase's code.
- Supports partial: boxes 1–5 checked; increments 2–4 and the owner's walk remain.
