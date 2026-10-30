# Evidence: project-set observations and task/PR usage

- Date: 2026-10-30
- Phases: 137 and U1 foundations of 138
- Revision: `f04f523c6b4471c3bf98d6527072b6ab555d1d5a` plus the local consolidation working tree; final commit and integrated gate result belong in the commit body.
- Claim: explicit local routine readers and lifecycle usage reuse the existing board/history UI and canonical agent-quality ledger. This is local implementation evidence, not hosted activation or a migration receipt.

## Automated checks

The conductor independently ran:

```sh
node --import ./tests/helpers/hermetic.mjs --test tests/agent-quality.test.mjs tests/agent-quality-records.test.mjs tests/agent-quality-report.test.mjs tests/agent-quality-lifecycle.test.mjs tests/agent-quality-execution.test.mjs tests/agent-quality-usage.test.mjs
```

Exit 0: 92 tests passed, zero failed, on 30 October 2026. Local retained log:
`../usage-conductor-final.log`. This covers optional schema-2 episode usage,
immutable attempt bytes, exact preview/apply/recovery, contributor privacy,
request/import/cumulative deduplication, partial parent/child contradictions,
repository binding and nonadditive cross-PR allocation. The imported execution
library is tested, but this candidate's CLI deliberately does not expose its
arbitrary-command runner.

The conductor's integrated focused checkpoint ran with a temporary npm cache:

```sh
npm run check:focused -- tests/routine-model.test.mjs tests/routine-sources.test.mjs tests/agent-quality.test.mjs tests/agent-quality-records.test.mjs tests/agent-quality-report.test.mjs tests/agent-quality-lifecycle.test.mjs tests/agent-quality-execution.test.mjs tests/agent-quality-usage.test.mjs tests/management-surfaces.test.mjs tests/web-management-observations.test.mjs tests/board.test.mjs tests/web-runs.test.mjs tests/web-runs-ui.test.mjs tests/web-operation-coverage.test.mjs
```

Exit 0: 304 tests passed, zero failed; roadmap/render/inbox/whitespace guards
passed. Log `../consolidation-core-focused.log` finished at 19:18:21 UTC on
30 October 2026. A subsequent IPC privacy correction moved SQLite descriptors
off child-process argument lists at 19:18:27 UTC. The conductor then ran
`node --import ./tests/helpers/hermetic.mjs --test tests/routine-model.test.mjs tests/routine-sources.test.mjs`:
exit 0, 24 passed, zero failed (`../readers-conductor-ipc-final.log`). The
generated capability inventory was refreshed for those final reader bytes.
The focused checkpoint is preliminary evidence; it does not cover that later
change or the subsequent personal-capacity increment.

An isolated installed-package walk ran from exact checkpoint `7d05a6a7` on
30 October 2026. `git archive` supplied the committed tree, `npm pack` produced
the candidate, and `npm install --offline --ignore-scripts` installed it in a
temporary Acme consumer. The installed executable read the synthetic registry,
returned one routine with partial coverage and no actions/private source fields,
left source bytes unchanged, exposed routine help, and retained the legacy
executable. Exit 0. Local script/log: `../packed-observation-walk.mjs` and
`../packed-observation-walk.log`. This proves the packed source path, not public
publication or real provider agreement.

A separate guide/CLI test initially failed because npm attempted to write its
cache outside the sandbox; no application assertion failed. Using
`npm_config_cache=/tmp/plates-consolidation-npm-cache` gave exit 0, 24/24.
Both logs are retained as `../consolidation-guide-proof.log` and
`../consolidation-guide-proof-cache.log`; no user cache was changed.

The required final integrated commands are
`npm run check` and `npm run typecheck`; they cover the combined local candidate,
including these records. Earlier set-lens gate evidence does not cover this new
implementation.

## Review and integration decisions

Agent-quality was inspected at `9f8c17adb12e4291c4a9a4c11870c3755f3d762e`.
Only its required episode, ledger, report, lifecycle, observer and supporting
modules/tests/guides were imported with provenance. The separate branch, its
phases and user work remain untouched. Consolidation drafts now use 137–141.

Independent review exposed and led to regression coverage for unknown-account
double-counting, private attempt metadata, allocation reconciliation before PR
filtering, and incompatible inclusive-parent totals/costs. Provider-like source
labels remain supplied attribution; neither stored metadata nor a hash proves
authenticated billing. A PR total needs a trusted numeric repository binding.
The optional CLI verification performs the existing bounded GitHub GET; tests
use a synthetic executable and make no live provider calls.

Routine sources are independently implemented metadata readers. Switchboard's
data and executors are not moved or modified. Local registry identity is
attribution; hosted scope comes from the currently authenticated project and a
separate transport. Browser parameters cannot select local source files.
Independent reader review required an OS-killable fixed-query SQLite subprocess,
generated-column refusal, pre-allocation record ceilings and canonical scope
identities; synthetic controls cover each. The subprocess receives private
descriptors over IPC. Independent surface review required Activity filters to
apply to local attempts while keeping usage full-lifecycle, and safe project/PR
scope to remain visible. Both surface findings were re-reviewed with no remaining
findings; the reviewer's final surface proof passed 7/7.

## By hand

| Did | Observed | Proves / does not prove |
| --- | --- | --- |
| Inspect source and retained independent review findings | Correctness and privacy boundaries reviewed against actual code and synthetic adverse cases | Does not prove current provider formats or production transport |
| Read real personal routine/account data | Not run | No live source-format or quota claim |
| Activate a local-to-hosted bridge or provider entitlement | Not run | Hosted observations remain explicitly unavailable by default |
| Publish, merge, deploy, retire routines or delete Switchboard | Not run | Existing runtime ownership remains unchanged |

## Gaps and decision

Phase 137 remains partial. Authenticated transport enrollment, replay/revocation
receipts, real selected-source comparisons and the
complete terminology/navigation migration remain separate proof. Phase 138
still needs personal capacity recommendations, collaboration/sharing policy and
separately approved activation. No synthetic result is a live multi-person,
provider-billing or executor-cutover claim.
