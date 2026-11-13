---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 155 — the scheduled climb failed five nights on permission denials

- Date: 2026-11-06
- Phase: 155, climb admits useful measured work before spending its night
- Revision: "fix: tell the climb agent a denied call blocks the night" (9538f83b) and this record's commit
- Claim being checked: the five failed scheduled climbs (1–5 November) share one cause, and the agent's brief now prevents it.

## What the runs show

`gh run list --workflow plates-climb.yml`: the scheduled runs on 1, 2, 3, 4 and 5 November all concluded failure (42010228882 is the latest). In each run:
- admission admitted the work;
- the agent step ended `"subtype": "success", "is_error": false` after 19–38 turns;
- the job then failed at "Did the agent run?". On 11-05: `blocked: the agent recorded 7 permission denials; nothing is judged or pushed`. The other nights had 5, 9, 10 and 9 denials.

`climb-execution.json` in the `plates-climb-agent` artifacts shows every denial was a Bash call: `node` outside `node scripts/plates/climb.mjs *`, a compound `git diff …`, and readers that aren't on the allowlist (cat, ls, cd, jq). The protocol never told the agent that one denial blocks the night. On 11-04 a candidate was committed but never compared (`tried: []`).

## The fix

The brief (practices/climb/files/.agents/climb/PROTOCOL.md and jobs/test-time.md, plus their rendered copies) now:
- says a denied call blocks the night;
- names the denied shapes (pipes, chains, redirection, `$(…)`, a leading `cd`, environment prefixes);
- points reading and search at Read, Glob and Grep;
- forbids running the measurement command, `node --test` or `node -e` directly.

The allowlist and the denial gate are unchanged.

## Checks

- `node --test tests/climb-protocol.test.mjs`: 4 of 4 red before the fix; exit 0 after (conductor rerun). `plates prove` VERIFIED; the trailer is in the fix commit.
- `npm run render:check`: exit 0 (conductor rerun).
- The builder ran the climb, workflow, agents, skill and loop tests: exit 0.

## Gaps and decision

Partial. The fix lowers the chance of a denial but can't rule one out, because the denied commands themselves are withheld. The real proof is the next scheduled climb: admitted, the agent run with 0 denials, "Did the agent run?" green, and at least one compared attempt in `tried`. If denials persist, the next step is the owner's: review a wider denial classifier or allowlist.
