# Evidence: personal agent recommendations remain advisory

- Date: 2026-10-30
- Phase: 138, U1/S1 read-side increment
- Revision: local checkpoint `7d05a6a7` plus the personal-recommendation working tree; final commit/gate results belong in the commit body.
- Claim: current-person advice separates provider allowance from durable task consumption, relevant quality evidence and execution permission.

## Automated checks

The conductor ran:

```sh
node --import ./tests/helpers/hermetic.mjs --test tests/routine-recommendations.test.mjs tests/web-capacity.test.mjs tests/agent-quality-report.test.mjs
```

Exit 0: 56 passed, zero failed on 30 October 2026; local log
`../capacity-conductor.log`. The pure advice tests exercise two contributors on
one plate, duplicated account/window references, source claims without authority,
policy/connection generation, stale and exhausted capacity, reset transitions,
distinct simultaneous windows, exact task/configuration quality matches and
missing cost/latency. The conductor repeated that exact command after the report-reuse refactor:
exit 0, 56/56 (`../capacity-conductor-final.log`). Final surface changes require
the combined proof below.

The final combined focused preflight exited 0: **350 tests passed, zero failed**,
with roadmap/render/inbox/whitespace guards passing. The exact selection is
retained in `../consolidation-final-focused.log`: the observation/usage files
named in the companion evidence plus `tests/routine-recommendations.test.mjs`,
`tests/recommendation-surfaces.test.mjs`,
`tests/web-recommendation-surfaces.test.mjs`, `tests/web-capacity.test.mjs`,
`tests/web-model-selection.test.mjs` and `tests/web-project-sets.test.mjs`.
It used `npm_config_cache=/tmp/plates-consolidation-npm-cache` and approved
loopback access for synthetic test servers.

Independent final review found no remaining production-code findings; its
recommendation/management proof passed 23/23 and targeted board proof 2/2.
An old board structural assertion expected a zero-argument renderer; it was
updated to the actual injected renderer contract and re-proved. The affected
board suite passed 42/42. Initial sandbox loopback refusals were resolved using
the approved local-test execution environment, not by weakening assertions.

Required remaining integrated proof is `npm run check` and `npm run typecheck`
on the committed candidate. This file does not claim their result in advance.

## Design and review decisions

The pure projector reuses `capacityModel` and the canonical AQ quality report.
Authority is separate from input and binds actor, workspace, plate slug, numeric
repository, policy, connection generation, account mapping and exact evidence.
The trusted adapter attests that context; hashes and provider-like labels cannot
authenticate local files. Both caller authority and capacity have a five-minute
freshness bound. A positive allowance observation is not a task quote or guarantee
of sufficient capacity.

Every applicable active window constrains advice independently. A fresh reading
after a completed reset can supersede only the same account/pool/kind/unit/duration
cycle. Other active durations, conflicts, unknown model coverage and unsupported
organization grants remain unavailable. No token history becomes remaining
subscription quota, and no set membership becomes pooled entitlement.

Quality summaries require matching provider/model/build, harness/settings/skills/
tools/permissions/runtime/dependency configuration, stage and task stratum.
Sparse, stale, disputed or missing judgments remain uncertain. The projection
retains separate historical cost and latency coverage; it makes no causal
quality ranking. Explicit preferences may order available choices. Selection
never reserves, dispatches, changes payer or authorizes a provider call.

Local CLI/board input is bounded and obtains quality from initialized canonical
private state. It cannot supply an authority or replacement quality bundle.
The existing hosted project view has an injected authenticated-reader seam;
set views do not aggregate personal quota. No adapter is activated by default.
The service rechecks actor/project access, timing and evidence after asynchronous
reads before displaying a recommendation.

## By hand

| Did | Observed | Proves / does not prove |
| --- | --- | --- |
| Independent source and synthetic negative-control review | Reset/freshness and async-expiry boundaries inspected and corrected | Does not authenticate a real provider account |
| Read or change a real person's quotas, credentials or grants | Not run | No live availability or authorization claim |
| Execute a recommended agent or reserve allowance | Not run | Advice grants no paid execution |
| Activate organization pooling, collaborator policy or lesson sharing | Not run | Existing permissions and data ownership remain unchanged |

## Gaps and decision

Phase 138 remains partial. This is an advisory read-side foundation; live account
identity, provider quota adapters, collaboration/funding reservations, organization
grants and reviewed lesson sharing are separate work. A synthetic two-person
fixture is not a live multi-person acceptance walk. Hosted activation still needs
the exact adapter, identities, provider scope and access reviewed before enabling
it. No credential transfer, publication, merge or deployment occurred.
