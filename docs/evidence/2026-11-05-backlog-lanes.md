---
attempt: {"accepted":true,"verified":true,"rework":1,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 178 — the backlog in lanes, in the terminal and hosted (increments 1–3)

- Date: 2026-11-05
- Phase: 178, the backlog shows every plate's work in lanes, with reasons
- Revision: "feat: backlogOf puts every plate's work in lanes, with why-keys (phase 178, increment 1)" (2c63c86f) and this record's commit
- Claim being checked: `backlogOf` derives the lanes, why-keys, children and read state from what Home already reads; no view or CLI uses it yet.

## Automated checks

Run by the conductor from the worktree root, after the builder's report:

- `node --test tests/work-items.test.mjs`: exit 0, 14 pass, 0 fail. It holds the three new tests: "a phase owing a walk is yours, not an agent's", "backlog order is reproducible from its why-keys", "an unread plate is not an empty lane".
- `node --test tests/web-operation-coverage.test.mjs`: exit 0 (the source hash for lib/work-items.mjs refreshed in lib/web/capability-source-data.mjs).
- The builder ran `npm run check:focused -- tests/work-items.test.mjs`: exit 0. It reported that reversing the age comparison in `backlogOf` turns the ordering test red.
- The whole gate, `npm run check`, runs once in `plates integrate`; its result is in the integrate record.

## Increment 1, first gate (2026-11-05)

`npm run check` in `plates integrate` on 43509a1: failed. 40 tests in tests/names-verify.test.mjs said `names observation: limit_exceeded at $.execution.codeIdentity.files`. backlogOf's new `import { STALE_DAYS } from './claim.mjs'` pulled names.mjs into the runtime closure, which is capped at 128 files. Also, tests/lesson-status.test.mjs failed on this file's empty `lessonStatus`. Sent back to the builder (rework 1). The fix keeps backlogOf's own `BACKLOG_STALE_DAYS`, which a test holds equal to STALE_DAYS. `plates prove tests/names-verify.test.mjs --fix lib/work-items.mjs` showed it red before and green after.

## Increment 2: `plates home --backlog` (2026-11-05)

Run by the conductor from the worktree root, on the branch with both increments:

- `node --test` on each of tests/names-verify.test.mjs, tests/web-operation-coverage.test.mjs, tests/work-items.test.mjs, tests/home-isomorphism.test.mjs, tests/surface-budget.test.mjs and tests/guides.test.mjs: exit 0 for every file.
- `./bin/plates.mjs home --backlog --lane in-flight` against the owner's real fleet: exit 0. It printed "In flight 8", one line per claimed phase, showing the holder and "claim Nd left", or "claim stale" for the three codex claims past STALE_DAYS.
- "backlog matches in both forms" covers the CLI half only: `--json` equals `backlogOf` over the home snapshot and over the web's snapshot with the same roadmap. The web renderer arrives in increment 3, so the box stays unchecked.
- `.plates/surface.json` flags go from 200 to 202 (`--backlog` and `--lane` on home); no verb is added.

## Increment 3: hosted `/backlog` and `/api/backlog` (2026-11-05)

Run by the conductor from the worktree root:

- `npm run check:focused -- tests/web-backlog.test.mjs tests/home-isomorphism.test.mjs tests/work-items.test.mjs tests/web-design.test.mjs tests/web-review.test.mjs tests/web-operation-coverage.test.mjs tests/names-verify.test.mjs tests/surface-budget.test.mjs tests/guides.test.mjs`: exit 0, 227 pass, 0 fail.
- "backlog matches in both forms" (tests/home-isomorphism.test.mjs) now covers both halves. A checkout with a bare remote holds a real claim branch, and the fake App lists the same branch. The CLI `--json` and `/api/backlog` are deep-equal except for the read time and the claim's days left, and both of those are checked to be within 0.1 of 7. Both forms take phases from `projectFromSource`'s roadmap, and claims as `nextFree` reads them (claim branch, then an open PR). Increment 2's working-tree read is replaced.
- tests/web-backlog.test.mjs: signed out, `/backlog` is refused, `/api/backlog` gives 401, and GitHub is never read. A plate whose claims can't be read shows "not read", never free phases.
- `npm run look` (run by the builder, exit 0) captured `/backlog` from fixtures at 390 and 1280 px, light and dark. The conductor looked at the dark laptop and light phone captures. In flight comes first; each row is one line on the laptop with chips and "claim 5d left"; on the phone the chips wrap under the title; the sidebar shows Backlog 7, Recurring, Agents and Pending review marked "coming", and the unread plate says "not read".
- Guard change: tests/web-design.test.mjs counts `/assets/backlog.css` apart from the phase-171 CSS bound (81780 bytes over the sheets it was measured on), with its own 2600-byte cap. The old bound is unchanged over its sheets.

## The owner's first look, and two fixes (2026-11-05)

After bd41227 was deployed, the owner opened `/backlog` on the phone. Every plate (plates, ledger, duo, cajones, white-elephant, dtv, papa-tapes, isocan) said "not read", with Backlog 0. HOME_MODEL_VERSION 13 had made every cached value unusable, and `/backlog` rendered cache-only with no client to refresh it. A loading plate was also labelled "not read". A second fault was found in review: a plate older than the ten-minute cache window is `stale`, and the backlog treated stale as not read.

- "fix: /backlog fills in while plates load, and a loading plate says so" and "fix: a stale plate stays in the backlog, and the page reads until it is fresh". Each `plates prove` was VERIFIED, red before and green after: tests/web-backlog.test.mjs ("a cold cache shows every plate loading, and the backlog fills them in"; "a stale plate keeps its items, is never 'not read', and its claims are read") and tests/web-backlog-client.test.mjs ("the page keeps reading while a plate is stale").
- Conductor: `npm run check:focused -- tests/web-backlog.test.mjs tests/web-backlog-client.test.mjs tests/web-design.test.mjs tests/work-items.test.mjs tests/home-isomorphism.test.mjs tests/web-operation-coverage.test.mjs tests/names-verify.test.mjs tests/surface-budget.test.mjs tests/web-activation-plan.test.mjs`: exit 0, 224 pass.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read the new tests | Each asserts a lane rule from the spec, against a synthetic Acme fleet | They assert lanes, children, why-keys, `ageLeft`, `needsShaping` and the not-read state; the ordering test re-sorts from why strings alone | Proves the model; does not prove any rendering |
| Owner's first look on the phone, at bd41227 | Their plates in lanes | Every plate "not read", empty lanes | Found the cold-cache and stale faults; not the walk |
| Owner's walk on phone and laptop | | Not run: waits on the fix's deploy | |

## Gaps and decision

Partial; owes the walk. Still to come: the deploy, which is the real surface (the hosted workspace reading the owner's fleet through the App), and the owner's walk on phone and laptop. Seen beside the phase, not fixed: when plates home runs from a worktree, loose-ends read the main checkout as a second plate, so a ⚑ phase can show twice in Yours.
