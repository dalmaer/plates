---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---
# Evidence: phase 166 — Home says what needs you, what happened and what is next

- Date: 2026-11-04
- Phase: 166, increments 1 to 4
- Revision: 114ea38c on origin/main e3dc75b4, and this record
- Claim being checked: one four-section model (Needs you, Since you last looked, What should happen next?, Your plates) in lib/work-items.mjs; `plates home --json` and `/api/home` carry the same sections, items and counts; Needs you holds only the owner's turn, ranked fix, decide, try; the hosted page's HTML is unchanged in this increment.

## Automated checks

- `node --test --test-name-pattern="the four home sections are one model|needs you holds only the owner's turn" tests/home-isomorphism.test.mjs tests/work-items.test.mjs`: exit 0, 2 pass (conductor).
- `node --test tests/web-design.test.mjs tests/web-home.test.mjs`: exit 0, 24 pass (conductor): the hosted page's markup golden is unchanged.
- Builder: `npm run check:focused` over 9 test files, exit 0, 194 pass; 24 further home and work-items test files, 403 pass.
- The whole gate, `npm run check`, runs through `plates integrate` after this file is written.

## Increment 2 (b558bd66, dd041f75)

- `node --test tests/web-home.test.mjs tests/home-isomorphism.test.mjs tests/web-design.test.mjs`: exit 0, 32 pass (conductor). "the page shows the four sections in order with the model's items and counts" checks headings, verbs, counts and that the Start panel counts what Needs you counts; the markup golden was regenerated on purpose (home and project pages only).
- Builder: all `tests/web-*.test.mjs`, 811 pass, exit 0; `npm run check:focused` over 9 files, 196 pass.
- Sent back once: the rendered page said "6 to answer" above "Needs you · 7", because a failed night has no answers. Both renderers now count what Needs you counts ("7 need you · about 27 min").

## Increment 3 (cf54694b)

- `node --test --test-name-pattern="an ask is queued only after" tests/web-home.test.mjs`: exit 0, 1 pass (conductor). Against the night-plan harness's fake GitHub: the preview writes nothing; a missing, unknown or stale preview, or a wrong public digest, is refused and writes nothing; an approved ask makes exactly one write, equal to what `plates goodnight add --title <ask> --kind triage` shapes.
- Conductor read the new route in lib/web/server.mjs: signed-in session, the plate in the session's access, csrf compared, input bounded at 4,000 bytes; it calls only the night-plan writer's preview. No route-level test of it yet.
- Builder: 951 pass across web, home, work-items, cli, feedback-cli and goodnight tests, exit 0.
- The agent-issue path has no hosted writer (the App has no Issues write), so on the web it gives the filled-in `plates issue new --agent` command; no new write action was added.

## Increment 4 (a9e0a2b2)

- `node --test --test-name-pattern="since you last looked starts at the last visit" tests/web-home.test.mjs`: exit 0, 1 pass (conductor). On PGlite with migrations 017 and 018: a first visit uses the fixed window; with a stored previous visit Since lists only what happened after it; a background refresh and a reload within 30 minutes leave it alone; the table holds a digest and times only; a missing RPC falls back to the fixed window with a footer note, and the page renders.
- `node --test tests/web-migrations.test.mjs tests/web-hosted-proofs.test.mjs`: exit 0, 31 pass (conductor).
- Conductor read lib/web/migrations/018-last-looked.sql: additive and idempotent, RLS on, privileges revoked, a security-definer RPC with an empty search_path granted to service_role only, input bounded to two operations and a digest.
- Migration 018 is not applied on the hosted store; its hosted proof is docs/evidence/2026-11-04-web-last-looked-hosted-proof.sql.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node bin/plates.mjs home --json` on the owner's real fleet, scratch state dir (builder) | four sections, read-only | exit 0 in 65 s: Needs you 35 (18 decide, 17 try, 0 fix), marked known; Since 27 lines across 7 plates (fixed 7 days); Next 1 queued agent issue, tonight's plan empty; Your plates 11 (7 with items, 3 all clear, 1 not read), 3 source problems in one line | the model reads the real fleet; not the owner's judgment of clarity |
| Rendered the hosted home from a synthetic Acme fleet at 375 px (conductor, browser pane) | the four sections in order, no horizontal scroll, source problems under Your plates | as expected after the count fix | layout and order; not the owner's judgment |
| The owner opens home on the phone | clear what to do next | Not run (after deploy) | the ⚑ box |

## Gaps and decision

- Partial: all four increments built; migration 018 waits for the owner's yes to be applied, then the owner's look on the phone.
- Since does not yet read merges, releases or installed fleet updates; its footer says so.
- The web cannot read tonight's plan branch or agent issues (the App has no Issues permission); both are named there with a reason and a command.
