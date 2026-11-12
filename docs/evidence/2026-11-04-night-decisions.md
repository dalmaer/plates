---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---
# Evidence: phase 162 — Overnight decisions stay within bounds and can be corrected in the morning

- Date: 2026-11-04
- Phase: 162, increments 1 and 2
- Revision: f0adb484 on origin/main 406cabce, and this record
- Claim being checked: a versioned, validate-only decision envelope (lib/night-decisions.mjs, docs/specs/night-decisions.md) binds one overnight choice to its plan item, source revision and existing authority by reference; unknowns are explicit; legacy plans and phase 150's decision records read exactly as before; an envelope cannot carry or imply approval.

## Automated checks

- `node --import ./tests/helpers/hermetic.mjs --test tests/night-decisions.test.mjs`: exit 0, 3 pass (conductor): "envelope preserves scope, evidence, effects and unknowns", "legacy plans and decision records remain readable", "overnight mode cannot manufacture authority or bypass a hook" (at the envelope level).
- Conductor read lib/night-decisions.mjs for side effects: it validates and reads; nothing writes, spawns or fetches.
- Builder: `npm run check:focused -- tests/night-decisions.test.mjs tests/night-plan.test.mjs tests/decision-loop.test.mjs`, exit 0, 157 pass.
- The whole gate, `npm run check`, runs through `plates integrate` after this file is written.

## Increment 2 (99363f4e, 9fd7a799)

- `node --import ./tests/helpers/hermetic.mjs --test tests/night-decisions.test.mjs`: exit 0, 5 pass (conductor), including "resume inspects the original uncertain operation without redispatch" and "the journal appends beside the working plan, reads old shapes and keeps gaps".
- The journal is `.plates/night/decisions/<night>.jsonl`, beside the working plan in the night's ignored working directory: append-only, keyed by the original operation, a retry a no-op, an uncertain operation inspected from its receipt and never dispatched again. Not the plan branch (force-pushed each reshaping) and not a branch of a possibly public repository.
- Escape found and fixed: increment 1's `readEnvelope` mangled a group marked unknown as a whole. `plates prove` (builder): VERIFIED, red at 697923d, green with the fix.
- Builder: `npm run check:focused` over night-decisions, night-plan, decision-loop and goodnight tests, exit 0, 171 pass.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| An already-authorized night with a bounded choice, a parked action and a morning correction | reviewed by the owner | Not run (increments 2–5 first) | the ⚑ box |

## Gaps and decision

- Partial: increments 1 and 2 of 5. Nothing routes questions yet, and the morning does not show them. A hosted night has no approved private place for the journal until increment 3 chooses one.
- The authority box is proven at the envelope only; the routing increment must prove hooks and refusals hold at run time.
- `willNotTouch` and `settledToday` free-text lines are not machine-matched; exact and directory-prefix paths are.
