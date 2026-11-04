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
| Plates adopts delivery with `vercel:plates`; one real deploy | passes revision, smoke, errors; one deploy record | Not run (increment 4) | The real CLI's JSON shapes |
| A deliberate failure on a throwaway commit | rolls back to the recorded deployment, which serves | Not run (increment 4) | The real rollback |
| The owner adds the grant and its rule to Claude Code settings | an agent's `plates promote --yes` runs without a typed approval; `vercel deploy` is still refused | Not run | The ⚑ grant |

## Gaps and decision

- Partial, owes increment 4 and the owner's walk.
- `inspect --json` and `logs --json` field names are parsed defensively, not yet checked against real output.
- No CLI verb prints the grant's settings preview yet; it is `renderHostControls(...).promote`.
- An agent could write `delivery.grant` into `.plates/plates.json`; it opens nothing until the owner adds the rule to their Claude Code settings, which agents cannot edit.
- Found beside the phase: `.plates/lock.json` holds a stale hash for `scripts/plates/morning.mjs`, so `npm run render` refuses it; `lib/web/capability-source-data.mjs` digests are updated by hand for each reviewed file.
