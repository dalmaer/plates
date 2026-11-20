---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"state":"none"}}
---

# Evidence: phase 199 — Rex panes blocked on the owner reach Home (increment 1)

- Date: 2026-11-20
- Phase: 199
- Revision: base 1b4893b8 (release v0.9.1) and working tree, then "phase 199: Rex panes blocked on the owner reach Home"
- Claim being checked: the Mac's sessions scan lists each Rex pane whose program reported (OSC 7501) that it is blocked on the owner, with only its place, app, kind and time; the hosted push validates it field by field; Home's Sessions waiting on you lists it on the plate its session label names, in both forms; no Rex is "not read", never "none".

Built by the conductor (small increment: two modules, one test file, the guides).

## Automated checks

- `npm run check:focused -- tests/waiting-sessions.test.mjs tests/channel.test.mjs tests/home-isomorphism.test.mjs tests/web-simple-home.test.mjs tests/web-operation-coverage.test.mjs`: exit 0, "ℹ pass 225", "ℹ fail 0". Covers the four new tests ("a blocked Rex pane is kept with only its place and kind", "only blocked panes on known plates are listed", "no Rex is not read, never none", "a pane field the snapshot does not hold is refused") against a stub `rex` on PATH, and the largest snapshot (now with 50 panes at their bounds) still accepted by the push route.
- The whole gate, `npm run check`, runs in CI on the PR.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `scanRexPanes` against this Mac's real Rex (7 sessions, Codex and shell tabs) | a read, not a refusal; no blocked pane at the time | `[]` in 0.9 s | Rex's real `ls`, `block ls` and `api call block.method program_status` answers parse; does not prove a blocked pane end to end |
| `rex api call -s plates-codex block.method '{"block_id":…,"method":"program_status"}'` on four Codex tabs | a root record with state | `{"records":[{"state":"idle","app":"codex",…}]}` on each | Codex reports OSC 7501 status that plates can read |

## Gaps and decision

Not yet shown: a pane actually blocked (a permission prompt) on the deployed Home after a push; that is the owner's walk (⚑ box). Increments 2 and 3 are unbuilt. The phase stays partial.
