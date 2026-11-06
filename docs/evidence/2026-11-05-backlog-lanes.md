---
attempt: {"accepted":true,"verified":true,"rework":1,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 178 — backlogOf and plates home --backlog (increments 1 and 2)

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

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read the new tests | Each asserts a lane rule from the spec, against a synthetic Acme fleet | They assert lanes, children, why-keys, `ageLeft`, `needsShaping` and the not-read state; the ordering test re-sorts from why strings alone | Proves the model; does not prove any rendering |
| Owner's walk on phone and laptop | | Not run: there is no view yet | |

## Gaps and decision

Partial. Still to come: increment 3 (hosted `/backlog` with the sidebar shell), the "backlog matches in both forms" test, `npm run look`, and the owner's walk. The unread-plate test lives in tests/work-items.test.mjs until a renderer exists; the web half of the isomorphism test arrives with increment 3. Seen beside the phase, not fixed: when plates home runs from a worktree, loose-ends read the main checkout as a second plate, so a ⚑ phase can show twice in Yours.
