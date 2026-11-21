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

## After merge (850c55ce)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `plates home --project plates --json` on the owner's Mac, at main | the three `⚑ try:` phases out of the docket, with ready ones shown as Try its | none in the docket; 59 waiting ("Ready when: two projects, one per runner, have a week of records"), 193 blocked ("Waits on 192"), and 65 waiting on "Ready when: this is built", which can't be met now that the walk is optional | readiness and docket exclusion on real records; it showed that 65's Ready when was stale |
| The same, against a local clone of this follow-up with 65's Your part set to Ready: yes | phase 65 listed as a Try it with three answers, not in the docket | "Try it (1 optional; nothing waits on these)"; phase 65 with Works / Something's off / Skip and `plates home --answer plates:walk:65 …`; the docket's 28 items exclude it | the Try it section end to end on a real phase |
| `node bin/plates.mjs home --project plates --json` on the owner's Mac, at main 83f65c47 (after #567) | phase 65 a Try it outside the docket; 59 and 193 waiting with their reasons | `tryIt`: `plates:walk:65`, `optional: true`, Works / Something's off / Skip; the docket's 6 items exclude it; 59 waiting ("Ready when: two projects, one per runner, have a week of records"); 193 waiting ("Ready when: phase 192 first") | the last acceptance box, on the default branch |
| The same with the installed `plates` 0.9.1 (1b4893b8) | — | "2 of 201 phase files could not be read or validated: …59…, …65…", no Try it | the installed runtime predates the `⚑ try:` format; the owner's Home shows Try its after the next release |

## Gaps and decision

Shown at main (above). The owner's installed plates needs the next release to read `⚑ try:` files. Fleet projects keep their records until the owner asks to move them.
