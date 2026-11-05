# Evidence: phase 177 — a deploy checks itself and rolls itself back

- Date: 2026-11-03
- Phase: 177, A deploy checks itself and rolls itself back
- Revision: branch claude/phase-177 (1307395a, 6a53fa99) on origin/main dbac2c79, and this record
- Claim being checked: `plates promote --yes` on a `vercel:<project>` target reads the deployment serving production before anything else, deploys the tested commit from a clean checkout, checks revision, smoke paths and error logs, and rolls back to the recorded deployment on any failure; `--back` alone returns to the last good deploy; a deploy that adds a migration waits for `--migrated`; the owner's `delivery.grant` renders allow rules for exactly `plates promote --yes` and `plates promote --back`; a rollback reaches the docket and the brief, a failed one first.

## Automated checks

- `node --test tests/promote-vercel.test.mjs tests/autonomy-hosts.test.mjs tests/work-items.test.mjs tests/web-deployment.test.mjs tests/morning.test.mjs tests/work-items-sources.test.mjs` — exit 0, 89 pass, 0 fail (conductor).
- Named tests: "no rollback target, no deploy"; "each failed check rolls back to the recorded deployment" (revision, smoke and error watch each fail in turn; a failed rollback; a failed build that moves nothing); "back means the last good deployment"; "a deploy waits for its migration"; "a promote grant opens exactly plates promote"; "a failed rollback is the first thing the owner sees".
- The fake Vercel in tests/promote-vercel.test.mjs keeps deployments and which one production points at, and a stub production server on 127.0.0.1 serves whichever that is, so a rollback is observed by reading production, not by trusting the call.
- Every CLI flag the client passes (`deploy --prod --skip-domain --yes --json --env --meta --project`, `promote|rollback <id> --yes --timeout`, `logs --deployment --level --since --json --limit --project`, `inspect --json`) was checked against `vercel <cmd> --help` on CLI 59.23.2 (conductor, read-only).
- Builder: `npm run check:focused` over 15 test files, exit 0, 311 pass; `npm run typecheck` exit 0; `npm run render:check` exit 0.
- The whole gate, `npm run check`, runs through `plates integrate` after this file is written.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Plates adopts delivery with `vercel:plates` (7f18410, landed bb01577); `plates promote --yes` on green 80d8920, 2026-11-04 07:10Z | passes revision, smoke, errors; one deploy record | exit 0: dpl_AcY4Kc84QqYWCUE7snMMQH6gcSkg; revision exactly 80d8920, 3 smoke checks, no error in 120s (11 log reads); recorded on plates-verify 0c9b354; `/api/version` reports 80d8920 and `/`, `/api/deployment`, `/review` answer 401 | The real CLI's deploy, promote and logs shapes; a log read with no errors, not one with an error |
| A deliberate failure: 80d8920 with the `/` smoke check set to expect 418 in an uncommitted local config, so no broken code shipped | rolls back to the recorded deployment, which serves | exit 1: revision ok, smoke failed (expected 418, got 401) on dpl_AzVo2JGZY5YwP7yBNpCy4r9pohXA; rolled back to dpl_DpX63tP2SqwNSSW6f8qNXQHodUUZ (4bab17b); `inspect` named it at once, and `/api/version` reported 4bab17b within seconds; recorded on plates-verify 3bc94c4 | The real rollback |
| Before both: the first real `--yes` on bb01577 | — | exit 1: Vercel refused `--meta plates-commit` before building; production stayed on dpl_DpX…, recorded on plates-verify 3b8ff10 | A refused build moves nothing |
| The owner adds the grant and its rule to Claude Code settings | an agent's `plates promote --yes` runs without a typed approval; `vercel deploy` is still refused | Not run | The ⚑ grant |

## Gaps and decision

- Partial, owes the owner's grant and walk; increment 4 is walked.
- `inspect --json` checked against real output (no ready time; the watch starts when the deploy returns). `logs --json` was read with no error entries, so the shape of a real error entry is still unseen.
- No CLI verb prints the grant's settings preview yet; it is `renderHostControls(...).promote`.
- An agent could write `delivery.grant` into `.plates/plates.json`; it opens nothing until the owner adds the rule to their Claude Code settings, which agents cannot edit.
- Found beside the phase: `.plates/lock.json` holds a stale hash for `scripts/plates/morning.mjs`, so `npm run render` refuses it; `lib/web/capability-source-data.mjs` digests are updated by hand for each reviewed file.
