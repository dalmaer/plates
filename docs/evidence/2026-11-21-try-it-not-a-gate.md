---
attempt: {"accepted":true,"verified":true,"rework":2,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 204 — trying the work by hand is an invitation, never a gate

- Date: 2026-11-21
- Phase: 204
- Revision: base 28b322cc and working tree, then "feat(home): a Try it comes only from an open ⚑ try: box…" (953bfc0a) on claude/phase-204
- Claim being checked: an open walk (now written `⚑ try: <who>: …`) never holds a phase back from built; plates's own walk boxes are removed while decisions, approvals and setup steps stay; each phase PR carries a Try it; Home lists Try its as optional in both forms, outside the docket and push, and keeps every other owner box waiting on the owner.

Built by a builder subagent and verified by the conductor. The work went back twice. A blanket removal of every `⚑ by hand` box was reworked after a rehearsal on a fleet project showed those boxes also hold decisions, approvals and setup steps. Home's split was then aligned with the roadmap's.

## Automated checks

- `node scripts/roadmap.mjs --check`: exit 0 on the migrated records.
- `npm run check:focused -- tests/roadmap.test.mjs tests/home-try-it.test.mjs tests/guides.test.mjs tests/app-fixture.test.mjs tests/work-items.test.mjs tests/home-isomorphism.test.mjs tests/door-class.test.mjs tests/docs.test.mjs tests/cli.test.mjs`: exit 0, "ℹ pass 252", "ℹ fail 0". This covers the four named acceptance tests.
- The whole gate, `npm run check`, runs in CI on the PR.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Classified plates's 140 `⚑ by hand` boxes | walks deleted, the rest kept | 76 walks deleted (11 of them checked); kept 12 decisions, 19 approvals, 18 setup steps and 12 unsure; 50 phases moved to built; 66 walk-only Your parts removed | the records migration; the kept and unsure lists are in the builder's report |
| Phases 59, 65 and 193 (only walks open, no evidence) | walks become `⚑ try:`, the phases stay partial | each has one `⚑ try:` box; roadmap check exit 0 | the new marker on real records |
| `plates home --project plates --json` on the owner's Mac | the kept owner boxes are in the docket; Try its appear once this is on the default branch | docket 42 (4 of them walks with kept boxes), 0 Try its, because Home reads the default branch | the docket split on real data; the Try its show only after merge |

## Gaps and decision

Not yet shown: Home listing phases 59, 65 and 193 as Try its, which needs this on the default branch (walked right after merge). Fleet projects keep their records until the owner asks to move them.
