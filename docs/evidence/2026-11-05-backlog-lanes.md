---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{}}
---

# Evidence: phase 178 — backlogOf puts every plate's work in lanes (increment 1)

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

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read the new tests | Each asserts a lane rule from the spec, against a synthetic Acme fleet | They assert lanes, children, why-keys, `ageLeft`, `needsShaping` and the not-read state; the ordering test re-sorts from why strings alone | Proves the model; does not prove any rendering |
| Owner's walk on phone and laptop | | Not run: there is no view yet | |

## Gaps and decision

Partial. Still to come: increment 2 (`plates home --backlog`), increment 3 (hosted `/backlog` with the sidebar shell), the "backlog matches in both forms" test, `npm run look`, and the owner's walk. The unread-plate test lives in tests/work-items.test.mjs until a renderer exists; the isomorphism form arrives with increment 2.
