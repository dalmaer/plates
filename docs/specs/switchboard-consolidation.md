# Switchboard consolidation into Plates

Implementation contract for Plates phases 137–141, 30 October 2026. This is an implementation contract and task inventory; proposed paths and commands
below are not shipped features unless the owning phase records implementation evidence. Each phase owns its acceptance/status; this document owns no duplicate progress state.

## Source baseline and boundaries

Inspected local Plates `0165c290` and Switchboard
`a6651db5ff570eada8b04b2c4ffb993d8e67fbe9`, including both `AGENTS.md`, manifests,
designs, phase records, runtime modules and test declarations. Source references
of the form `SB:src/file.ts` mean that exact path at the pinned Switchboard commit,
not a live dependency or a file to vendor wholesale. Revalidate the baseline
before implementation because independent work can advance either repository.

Switchboard records 6/11 phases built: 0–5; event listener 7, reviewed effects 8
and adoption 9 are partial with walks owed; cloud 6 and BenOS remote access 10
are planned. Phase 9 retains a 2026-10-30 through 2026-11-06 comparison. Those
are source-record claims, not newly verified live behavior. Plates phases
[102](../phases/102-routines-have-a-complete-observed-history.md),
[103](../phases/103-connections-expose-scoped-model-capacity.md),
[104](../phases/104-web-operations-run-through-durable-workers.md) and
[106](../phases/106-model-routing-respects-capacity-and-policy.md) already supply
parts of the destination but still carry hosted activation/owner proof gaps.

This work does not install a listener, run a routine, read personal task bodies,
change permissions, copy credentials, publish code, deploy, or retire anything.
Switchboard's installed Plates practices are not evidence of product migration.
Preserve the existing agent-quality branches and any uncommitted user work.

## First local implementation boundary

The initial read-only set lens extends existing Home, Routines and Activity using
an optional `projectSets` web-service configuration registry. It intersects current
project access and repository pins before source reads, preserves full authorization
for existing operations, and binds continuation to the visible member/source digest.
It uses existing project caches and run models. It copies no Switchboard source,
creates no telemetry store and adds no runtime worker. Unattributed workspace
receipts remain explicitly outside a set. See the
[configuration and view guide](../guide/web-routine-history.md#inspect-a-project-set)
and the phase's evidence for verified scope. Personal capacity, task/PR usage,
set-wide Learning, observation enrollment and routine import are subsequent slices.

This registry is deliberately an interim observation configuration. A future
authored set model must provide versioned import from it, stable IDs, conditional
writes and an ownership decision; it must not silently treat grouping as access
or copy private account allowances into shared project data.

## Plates outcomes and reuse decisions

The owner's confirmed 30 October direction is to reconsider every Switchboard abstraction
and build phases that make sense for Plates. “Project set,” shortened to “set” in
context, is the chosen design language. A set groups projects for viewing and
operations; it does not grant access, create another runtime workspace, imply
ordering or rename JavaScript `Set`. Task N1 inventories existing fleet labels, APIs, commands, URLs, receipts and
actual callers. Change user-facing terminology to set/project set in the existing
views; preserve old identifiers and deep links through explicit aliases and
versioned readers. Removal requires observed usage and its own reviewed window;
no bulk runtime search/replace or historical receipt rewrite.

| Plates phase | User outcome | Tasks and boundary |
| --- | --- | --- |
| [137: A project set shows its routines](../phases/137-a-project-set-shows-its-routines.md) | See what exists and what actually ran in the existing Plates surfaces. | T1 observation identities, T2 readers, T3 projections/observation bridge and N1 terminology; independently useful without execution. |
| [138: People bring their own capacity](../phases/138-people-bring-their-own-capacity-to-shared-work.md) | Collaborate on a plate without sharing private accounts or inventing pooled allowance. | P1 scope, funding, reservation and lesson-sharing contracts; preserve existing access until reviewed activation. |
| [139: A routine has one Plates policy](../phases/139-a-routine-has-one-plates-policy.md) | Review one explicit policy and reversible dormant import. | T1 authored policy and T4; legacy declarations are translated, not adopted as authority. |
| [140: Routines run with accountable effects](../phases/140-routines-run-with-accountable-effects.md) | Time, events and manual intent reach the same bounded operation and effect review. | T5–T7 combine execution and effects around a user outcome, not separate old subsystems. |
| [141: A routine changes owner safely](../phases/141-a-routine-changes-owner-without-losing-work.md) | Replace an incumbent with proof and recovery. | T8 and real per-routine comparison/cutover; explicit retirement, no automatic source deletion. |

| Decision | Rationale |
| --- | --- |
| Reuse Plates Routines/Activity, private workspace, operations, policy, budget and Connections. | Those are established product authorities; another scheduler dashboard or vault would divide ownership. |
| Reuse proven source-reader behavior and negative tests, subject to current format/capability evidence. | WAL consistency, bounded reads and explicit gaps solve real problems independently of the old UI/schema. |
| Redesign legacy definition/ID/permission/state schemas as versioned Plates contracts. | Source-prefixed names and local folders cannot express actor/project authorization or durable operation identity. |
| Redesign dispatch, event checkpoints and outbox delivery around original intents and recovery. | Process-local serialization and rename-after-send do not settle crashes or uncertain effects. |
| Combine board/timeline/placement presentation into existing Plates views. | One owner journey should explain source, placement, execution, effects and gaps together; a separate static app adds no authority. |
| Drop implicit unknown-quota-as-available, personal prefix defaults and ambient config/state discovery from canonical execution. | Availability is not permission; portable scope and explicit capability evidence fit Plates policy better. |
| Drop duplicated roadmap/practice plumbing and any default requirement to keep all Switchboard module names or phase boundaries. | Consumer tooling already exists in Plates; moving it back creates redundant machinery. |
| Retain only compatibility needed for actual stored data and observed callers. | Original evidence must remain readable, but an old CLI/schema is not the conceptual design constraint. |
| Defer unimplemented provider integrations, arbitrary triggers/runners and remote BenOS activation. | Aspirations are not migrated functionality; unsupported capabilities should be visible rather than guessed. |

## Existing web UI audit and the whole-product journey

The audit is of source at the baseline, not a claim that every route is active in
production. Existing phase activation/walk gaps remain. Extend these surfaces:

| Existing route/model/component | Overlap and planned treatment |
| --- | --- |
| `/`, `/projects/:id`, `/api/home`; `lib/web/home.mjs`, `views.mjs`, `home-client.mjs`, `home-store.mjs` | Already aggregate project observations, changes and GitHub-read quota. Add a project-set lens and routine/capacity coverage summaries; keep this Home, not a new Switchboard landing page. |
| `lib/web/navigation.mjs`, `navigation-routes.mjs`, `navigation-client.mjs` | Existing All plates/project lens, validated return paths and detail-scope notices. Extend to set selection; retain day/status filters and original operation scope. No redirect may replay a mutation. |
| `/projects/:id/decisions`, `/projects/:id/operations/:id`, walks/changes/media | Existing reviewable source decisions, guided proof and result review. Link work/phase/review/health summaries to these records and native provider review facts; do not build another approval inbox or treat a provider review as owner acceptance. |
| `/daily`, `/projects/:id/daily`, night-plan/night-retries; daily/night models and views | Existing work plans, authored outcomes, nightly health and retry receipts. Add routine relationships and funding/wait summaries while keeping authored vs observed outcomes distinct. |
| `/routines`, `/activity`, project variants and Actions attempt details; `routines.mjs`, `runs.mjs`, `run-model.mjs`, `run-views.mjs` | Already definitions, attempts, gaps, costs and original receipts. Enrich the shared model with supported local/personal sources rather than rebuilding history UI. Current route parser restricts routine IDs largely to workflow paths/known built-ins; typed new IDs need explicit parser/tests, never arbitrary paths. |
| `/jobs`, `/projects/:id/routines/:id`, `/projects/:id/jobs/:id`; job registry/store/views | Existing exact preview/start/cancel/reconcile/retry and schedule editing. Add supported routine adapters, scope and payer facts; no generic command endpoint or new execution queue. |
| `/connections`, project variants, `/model-policy`, project model-tasks; connection/capacity/model views | Existing encrypted-vault metadata and policy views. Connection UI currently reports inference/subscription capacity unavailable; capacity.mjs is normalization, not a reporter or endpoint. Extend with authenticated personal/org observations and explicit funding choice; do not label today's UI as multi-account quota management. |
| `/learning`, project variants and trace/operation views; `learning.mjs`, `learning-model.mjs`, `learning-views.mjs`, `lesson-rollout.mjs` | Existing project authority, selected-copy migration/export and trace provenance. Add personal and set-scoped projections/promotion; do not duplicate the lesson catalogue or silently share private observations. |
| `/versions`, `/updates/...`; fleet model/registry/store/views | Existing project update/rollout work. Surface as set coordination using existing operation receipts and per-project lanes; display set terms without renaming source history. |
| `/capabilities`, `/setup`, `/recovery`; auth and operation capability coverage | Retain supported/implemented/activated distinctions, permission gaps, restore quarantine and original receipt recovery. Generic links cannot stand in for the real operating journey. |

The intended journey is **set overview → plate detail → work, runs, reviews and
health**, with **Learning**, **task/PR usage** and **Connections/capacity** reachable at every lens.
Set Home shows authorized plates needing attention, active work, observed health,
routines waiting for approval/capacity and coverage timestamps. Plate detail shows
its source plans, current changes, review decisions, job attempts and outcomes.
Activity retains original operation links and links to the task/PR lifecycle usage
projection, including failed and abandoned work. Learning compares patterns with source
provenance; Capacity shows “my accounts” and explicitly authorized organization
pools separately from the plate's configured budget and consumed usage.

A set is a versioned grouping of existing plate IDs within one workspace, not a
new permission principal. A plate may be in more than one set. Removing it from a
set changes the view/coordination target, not the plate or its jobs/history.
Personal set preferences are private; shared set definitions are reviewed
workspace records with editors/audience. Cross-workspace aggregation is deferred
until identity and authorization can be proved; it is never inferred from names.
For a run, pin the selected plate and policy; a later set edit cannot retarget it.

N1 inventories labels, navigation, CLI help, persisted names and links before any
terminology implementation. Phase 137 changes display labels and adds a validated
set selector to the current navigation. Keep existing routes/JSON as supported
compatibility, with explicit set-context query/route variants in the shared route
registry. Preserve project detail URLs and original receipts during scope changes,
login/reconnect and browser back. Test screen-reader labels, keyboard behavior,
mobile widths, filtered pagination and absent/denied sources; do not claim a
coherent whole-product experience from a fresh dashboard screenshot alone.

## Historical usage and current capacity are different products

The owner's 30 October clarification distinguishes **what a full task/PR consumed**
from **which of my authorized agents is suitable and available now**. Persist
historical usage for the entire lifecycle; use fresh capacity as a separate
selection input. Tokens, dollars, reserved ceilings, subscription quota and
quality are different measures. A task's token sum cannot reconstruct remaining
subscription allowance when provider window/accounting semantics differ.

### Integrate the existing agent-quality contract

Additional read-only baseline: `codex/agent-quality` at
`9f8c17adb12e4291c4a9a4c11870c3755f3d762e`, inspected 30 October 2026. References
prefixed `AQ:` below mean that exact branch/commit. The consolidation candidate
selectively imports its episode/ledger/report/lifecycle modules and tests, with
provenance retained in their headers; its execution runner remains unavailable
through this candidate's CLI. Its `AQ:docs/specs/agent-quality.md` and lifecycle/adapters
guides already define an episode as one outcome with all attempts, many-to-many
PR links, prospective task passports, exact checkpoints, source-idempotent
observations and unknown usage. It is locally implemented with installation and
human-calibration gaps, not verified provider billing or an automatic router.

| Existing agent-quality seam | Extension or reuse |
| --- | --- |
| `AQ:lib/agent-quality-records.mjs` | Reuse episode/source/attempt/checkpoint identity and versioned strict validation. Current `resources` has `tokens`, `cachedTokens`, `currencyUsd`, currency provenance and time; it lacks full input/output/cache and funding decomposition. Extend with a versioned usage measurement/reference contract rather than guessing missing fields. |
| `AQ:lib/agent-quality-lifecycle.mjs`, `agent-quality-observer.mjs`, `agent-quality-execution.mjs` | Reuse begin/link/start/finish, original command receipts, parent attempts and exact review checkpoints. Feed routine and supported runner telemetry into this lifecycle; collection does not authorize execution. |
| `AQ:lib/agent-quality-ledger.mjs` | Reuse the initialized external workspace, shared session-ledger lock, source deduplication, append-only revisions and retention/refusal semantics. No new routine-token ledger. Existing terminal attempts remain immutable; a new usage observation can reference them without editing old receipts. |
| `AQ:lib/agent-quality-report.mjs`, `agent-quality-weekly.mjs` | Add task/PR lifecycle projections and source-bound filtered breakdowns to existing reporting. Preserve known subtotal vs complete total, original failures, coverage and quality cohorts. Hosted views consume authorized projections, not another telemetry store. |
| `AQ:docs/specs/agent-quality.md`, `AQ:docs/guide/agent-quality-lifecycle.md`, `AQ:docs/guide/agent-quality-adapters.md` | Preserve metadata-only privacy, exact preview/recovery, explicit provider/model uncertainty and no routing or model spend from collection. New recommendation semantics require their own reviewed contract below. |

Draft allocation resolved on 30 October 2026 under the owner's instruction:
consolidation drafts 132–136 now use **137–141**, leaving the existing
agent-quality branch's phases 132 (risk), 133 (review continuation) and 134
(agent quality) untouched. Earlier evidence keeps its tested commit and original
numbering. Selective source integration reuses the pinned AQ modules/contracts;
it is not a merge, publication or activation of that branch. U1/S1 extend the
same ledger rather than creating a second telemetry store.

### Full task and PR lifecycle accounting

An episode is the durable unit, created before work when possible; a PR is a
many-to-many view over episodes and attempts. Retain planning before a PR exists,
implementation, independent or self-review, iteration/remediation, retries,
verification/model work and failed, denied, timed-out or abandoned attempts.
Use existing stage names `planning`, `coding`, `review`, `iteration`; add a typed
activity/retry reason for finer detail rather than conflating retry with a new
stage. Abandoned work stays an episode even if no PR is ever opened. A merged PR
is neither complete telemetry nor accepted quality.

Bind mappings to canonical repository numeric identity plus PR number/provider ID,
commit SHA and exact input/output checkpoint digest where available. Preserve old
name-based AQ links as source references; verify them before joining to canonical
PR identities. Commit authors, branch names, temporal proximity and reviewer names
do not establish funding identity, exact model or usage. A late PR link appends
mapping provenance without pretending the original task classification was
prospective. Rebase/squash/review-again relationships are explicit, not duplicated
work inferred from new commit hashes.

Each usage observation references the existing episode/attempt and records:

- Stable source receipt/provider request ID, measurement ID/revision, observation
  time and authenticated/provider/declared provenance; opaque account identity
  and actor/funding principal under existing private scope.
- Agent/provider, exact model/version and harness/configuration identity when
  actually known; role/stage/activity, attempt parent and checkpoint/commit/PR
  mappings with their provenance. Missing version remains unknown.
- Input and output tokens, cache-read and cache-write tokens, optional reasoning
  or other provider units, raw numeric provider counters and a versioned semantics
  descriptor. Fields may overlap: record whether cached/reasoning tokens are
  subsets of another field, rather than adding them twice. Preserve unknowns and
  provider-defined units; do not infer input/output from a legacy total.
- Whether a counter is per-call, cumulative session or inclusive parent total,
  its covered interval/request set and whether child work is included. Successive
  snapshots replace/refine one measurement in the projection; they are not new
  consumption. A counter reset starts a new explicit segment; do not subtract
  unrelated sessions or assume monotonicity across resets.
- Observed monetary charge/currency with source evidence, or a separately labeled
  estimate carrying price/version/date, billable-unit/cache semantics and coverage.
  Keep subscription allocation estimates distinct from provider invoiced charges.
  Preserve reservations separately. No conversion across currencies without an
  explicit dated rate; missing cost is null rather than a free run.

Reports show whole lifecycle and breakdowns by person/account (within visibility),
agent/model/version, stage, attempt and input/output/cache units. For each metric
show observed/expected attempt coverage, unknown fields, first-observed cutoff,
retention gaps and known subtotal. A complete total is null if required parts are
missing or overlap is unresolved; do not advertise complete PR cost from the last
successful attempt. Private details can be hidden in a shared PR projection;
its coverage must say restricted rather than leaking another person's account.
Durability uses the existing explicit retention policy: retain original structured
receipts and mappings while within approved bounds, flag expired evidence, and
never silently enlarge retention or delete data to make a rollup look complete.

Deduplication and allocation rules:

1. One provider request/measurement identity has one canonical observation even
   when imported, read by multiple hosts, linked to a retry, or seen in both AQ
   and routine receipts. Import retains source aliases; conflicting counters are
   a reconciliation gap, not additive independent usage.
2. Parent session totals that include children and leaf request totals are
   alternative views of the same consumption. Prefer disjoint verified request
   coverage; retain parent as a reconciliation total. If inclusion is unknown,
   expose overlap and withhold a complete rollup. A retry with a genuinely new
   provider request is separate consumption even when its prompt is identical.
3. Task-to-PR association does not allocate cost automatically. A single-PR episode
   may attribute fully after explicit binding. Shared work across PRs carries an
   explicit versioned allocation per metric/request, whose weights sum to at most
   one; any remainder is unallocated. Without a justified split, show it as shared
   unallocated work on each related PR, excluded from additive attributed totals.
   A separate “associated usage” view is labeled nonadditive. Project/set rollups
   deduplicate canonical measurements regardless of how many PRs reference them.
4. Reused evidence or a checkpoint link incurs no new recorded model consumption.
   A new review of the same patch does. Historical expense stays at its original
   attempt; no repeated attribution because a PR, task or set references it.
5. Later billing/telemetry can append a superseding measurement in the same ledger
   domain; retain original uncertainty and both provenance records. Never rewrite
   immutable terminal attempts or count old and refined measurements together.

### Agent recommendations for the current person

Initial selection is an **explainable recommendation**, not automatic assignment
or a paid run. Start with the current person's authorized account/model choices
and explicit delegated/org grants; filter by plate/workspace policy, task-role
capabilities, privacy/isolation, context/tool support and current funding scope.
Then present fit tradeoffs using fresh observed allowance/reset windows, observed
latency, bounded cost estimates and agent-quality evidence relevant to planning,
coding, review or iteration and the task's specialty/difficulty/risk. A cheap or
available agent is not necessarily the strongest reviewer; unsupported required
independence is a refusal, not a second model from the same provider relabeled.

Reuse AQ's exact model/harness/configuration cohorts and human adjudication;
include sample/coverage, freshness, task similarity and disputed judgments.
Retrospective correlations are advisory and not causal rankings. Sparse,
unmatched or version-mismatched evidence says “quality unknown”; do not invent a
universal score or train a routing rule from token totals. Without calibrated
comparative evidence, explain capability/capacity and user preferences while
withholding a quality-superiority claim. Agent/model updates invalidate applicable
quality matches unless explicitly supported by evidence.

The recommendation records candidate reasons, evidence digests, observation times,
quality uncertainty, expected latency/cost ranges and selected funding principal.
The person chooses, overrides within existing authority, or waits. Selection does
not reserve/spend until the existing exact run-preview/action boundary; overrides
cannot widen permission or use another person's account. Refresh stale quota or
changed policy/connection evidence before execution. Subscription remaining quota
comes from the provider's own authorized observation semantics, never historical
PR tokens, price estimates or other collaborators' allowances. Exhaustion can
suggest an authorized alternative, but never silently switches payer/model on an
in-flight or uncertain attempt. Existing deliberately approved automatic policies
retain their own bounded scope; this recommendation feature enables none.

### Usage and recommendation acceptance cases

| Case | Required assertion |
| --- | --- |
| Alice plans/codes and Bob reviews/remediates one Acme PR | One lifecycle includes both contributors, all stage/retry failures and permitted cost/token breakdowns; personal remaining quota and account IDs stay private. Missing Bob telemetry makes the relevant total unknown. |
| A research episode supports two PRs, then one commit is rebased and evidence reused | Explicit allocations plus unallocated remainder conserve observed usage; associated views are nonadditive; project/set totals count each measurement once. Rebase/evidence reuse creates no new consumption. |
| Parent session includes a child review; both are imported with cumulative snapshots | Use a verified disjoint request set or report overlap; duplicate imports/snapshots do not add tokens. Unknown inclusion prevents a complete total. |
| A failed attempt retries with cache hits and a changed model version | Both real requests count; input/output/cache counters follow each provider's semantics; cache subsets are not added twice; price estimates and exact versions stay separate. |
| A terminal attempt lacks usage; later a billing receipt arrives | Original attempt remains immutable; append referenced measurement/refinement and revise projection once. Unknown is never zero and observed charge never silently replaces an estimate without provenance. |
| Quota window resets, report becomes stale, or outside apps spend allowance | Historical PR usage remains unchanged; selection requests fresh evidence or explains a wait. Token totals never imply remaining subscription percent. |
| A fast cheap coder has weaker relevant review evidence, or quality evidence is sparse/version-mismatched | Recommendation explains role-specific evidence/uncertainty and tradeoffs; it neither makes unsupported superiority claims nor launches a paid trial. User retains the authorized choice. |

U1 extends AQ records/lifecycle/report tests with synthetic fixtures for the first
five cases. S1 adds planned `tests/routine-recommendations.test.mjs` plus existing
web-capacity/model-selection tests for the last two and funding/permission refusal.
The imported AQ tests and new `tests/agent-quality-usage.test.mjs` exercise the
same ledger on this branch; evidence records the actual verified revisions.
No fixture needs actual provider tokens or spend.

## Person, plate, set and provider ownership decisions

These are proposed implementation decisions to review and prove in phase 138,
not claims that current code supports them or permission to change live access.
Current `learning.mjs` checks configured owner IDs and workspace membership;
`connection-policy.mjs` binds project lists and requires access to every named
project. Its schema has no personal owner/funding-principal field. Existing
actor-scoped operation receipts remain private; extending collaboration requires
a reviewed schema/access model, not just adding a collaborator to a view.

| Scope | Owns | Visibility and authority |
| --- | --- | --- |
| Person | Personal provider-account bindings, preferences, local hosts, private task text/notes/lessons and consent to fund work | Actor-private by default; credentials never returned. Explicit scoped delegation can authorize a service to use an account, not reveal its secret or whole personal quota history. |
| Plate/project | Shared purpose, phases, source policy, authorized work/results, health, run summaries and project lessons | Current project access plus operation capability governs read/review/write/execute separately. Repository access alone is not permission to spend somebody else's allowance. |
| Project set | Membership, filtered summaries, approved batch coordination and selected shared lessons | Intersection of current plate access; set membership cannot widen access or pool funds. Counts deduplicate plate/run/lesson identities and expose incomplete coverage. |
| Provider account or organization pool | Actual entitlement/rate windows/charges | Established provider account/workspace/pool identity, not a local display label. Organizational grants and allocation are explicit; no personal-to-org conversion inferred from a shared plate. |
| Workspace/runtime | Source registry, approved policy bounds, encrypted private state and shared reservation coordination | Workspace administrators manage allowed infrastructure but do not automatically acquire personal-account use or personal lesson visibility. |

Effective authority is the intersection of actor permission, current plate policy,
workspace adapter/connection policy, account-owner funding grant and source/host
capability. Apply narrowing plate overrides to workspace defaults. Personal
preferences only rank already permitted candidates. Set selection has no policy
inheritance that broadens a plate. Shared set coordination must resolve a separate
approved operation per plate; incompatible policies yield explained partial plans,
not one permissive union. Owner-only legacy records keep current visibility until
an exact migration says otherwise.

Persist personal account bindings/preferences in actor-scoped encrypted runtime
storage or an actor-only private source, never in shared workspace Git readable by
all collaborators. Public/shared run summaries are a new minimal projection with
an allowlisted schema; do not broaden the actor-specific original receipt table.
Show routine, plate, state, sanctioned actor/funding label and permitted evidence
links; private prompts, record refs, account identifiers, personal remaining quota
and unrelated usage remain hidden. Personal/account owners can inspect their own
funding detail; authorized org billing operators can inspect their pool. A plate
reviewer can see “awaiting approved capacity” without seeing another person's plan.
Revocation hides future detail and prevents new dispatch; minimal historic
provenance remains according to existing authorized record-retention policy.

### Funding and nonadditive capacity

Every attempt pins `initiatorActorId`, `fundingPrincipal` (person or organization),
verified provider account/workspace/pool identity, connection ID/generation,
model/runner, plate ID, policy digest, allowance/reservation IDs and source evidence
time. Private identity and public label are separate. A manual run defaults to the
initiator's explicitly approved account; a scheduled routine needs a named funding
grant and expiry. “Whichever collaborator has quota” is never a default.

Two contributors may use different personal subscriptions on the same plate.
If Alice's account is exhausted, her operation waits with observed reset/gap
information. It does not spend Bob's allowance. Switching principal requires a
new exact preview and Bob's current scoped grant, and only for work known not to
have started; uncertain work remains bound to Alice's original attempt. A known
failed attempt can have an explicitly authorized child retry with its own payer.
Never treat reset time passing as proof quota refilled; fresh evidence or an
explicit existing allow-budgeted policy is required. Unknown/stale/conflicting
quota waits by default. The existing API routing allow-budgeted option remains
an explicit bounded choice, not silent subscription entitlement.

Reuse `lib/web/capacity.mjs` tuple normalization: provider, identity scope,
account/workspace, pool, kind/unit and window. Maintain a canonical pool alias
registry only from verified provider evidence. One account seen on two hosts,
plates or sets is one pool; do not sum identical observations, independent windows,
percentages, tokens, currency and runner minutes. Same pool/window conflicts make
capacity unavailable. A short and long window both constrain selection; neither
is added to the other. Unknown pool identity cannot be made eligible with a name.

Reserve atomically against that canonical pool and all applicable personal,
plate and workspace ceilings, regardless of which set initiated the run. A set
budget may narrow coordination but is not extra provider credit. Reuse shared
reservation/store mechanisms; local and hosted adapters must use one authorized
reservation broker for the same pool. If separate offline hosts/Plates instances
cannot coordinate, do not claim global protection or enable concurrent scheduling
against the same pool. Outside apps can still consume provider allowance; retain
freshness/uncertainty, react to provider refusal, and never infer a guaranteed
remaining balance from internal reservations alone. A wait/cooldown is not a
failed effect or a refund. Usage/price unknown remains null, distinct from a
conservative reserved ceiling and estimated weighted Actions minutes.

Organizational plans are supported only when provider evidence establishes the
shared pool and an organization administrator explicitly grants this plate/actor
an allocation. Different API keys can point at the same pool and must contend
for the same reservation. If provider/account identity or enforcement is absent,
display configured policy and unknown capacity; do not invent support. Removing
one person's account grant does not revoke an unrelated org pool or change old
receipt attribution.

### Lesson scope and promotion

Personal observations default to personal. A plate lesson is explicitly accepted
into that project's source catalogue with its provenance. Set-shared learning is
a filtered projection of already authorized plate lessons, or an exact selected
copy into a private set catalogue with source revision, author, audience and
promotion receipt. “Same failure shape” may group records but never erase their
provenance or declare a new rule. Sharing is a reviewed promotion/copy through the
existing Learning preview/apply flow; it is not automatic inheritance and grants
no execution authority. Public export is a separate exact-text/destination action.

Shared-set audience is versioned. Adding members/plates cannot silently widen a
personal lesson's prior export: preview the changed audience and redact/approve
an appropriate copy. Source access revocation removes inaccessible live
projections; independently approved copies retain their declared provenance and
retention semantics rather than claiming to retract already delivered content.
Keep raw personal wording, task text and private attachments out of shared traces.
Extend existing learning schema/readers compatibly; historical lessons do not
become set-shared merely because the new product terminology says “set.”

### Required cross-scope acceptance matrix

| Scenario | Expected result and proof |
| --- | --- |
| Alice and Bob share one Acme plate with different provider accounts and quota windows | Both see permitted work/health; each sees only their own private account detail. Alice's exhaustion waits and cannot choose Bob automatically. `tests/routine-ownership.test.mjs` (planned), existing web-auth/connections/model-selection tests. |
| Alice uses one account on two plates in overlapping sets | Exactly one pool/window observation and shared reservation; one run appears once in cross-set totals. Set removal does not cancel the run or erase history. Planned ownership/views tests and existing web-capacity tests. |
| Two connection keys belong to one verified org pool | Single contention boundary with explicit allocations; no doubled credit. Unknown linkage remains unavailable. Planned ownership tests. |
| Personal account/plate access revoked after preview or during a wait | New execution denied; original uncertain receipt retained and privacy rechecked on every read; no automatic payer switch. Planned ownership/execution tests and existing jobs tests. |
| Private lesson proposed for project/set sharing | Exact redacted text, destination and audience reviewed; original private words never leak through grouped counts/traces. Membership expansion requires renewed scope review. Planned ownership tests and existing web-learning tests. |
| Existing owner opens old project/operation URLs after terminology change | Same receipt and permissions; set/plate lens preserves filters or explains unavailable scope; no mutation replay after login. Planned views tests and existing web-operation-coverage/home tests. |
| No current quota observation, reset passed, conflicting sources, outside consumption or broker unavailable | Explicit unavailable/wait or previously approved bounded policy; no inferred zero use, pooled entitlement or released uncertain reservation. Existing capacity/model-selection plus planned ownership/execution tests. |

## Product and structural decisions

Plates becomes the operating surface for routines as well as project care.
Existing project operations retain repository identity and policy. A personal
routine belongs to a private workspace and explicitly authorized actor; it is
not assigned a fake repository or made visible to every project member.

Add a dependency-light `lib/routines/` domain with contracts, observation,
definition, placement, import, execution and effect modules. Source adapters
live under `lib/routines/sources/`; host-specific process/BenOS/effect adapters
under `lib/routines/adapters/`. Pure contracts never import CLI, HTML or hosted
transport. `lib/cli.mjs` delegates to a small routine command module; existing
`lib/web/routines.mjs`, `runs.mjs`, views and clients consume the same normalized
model. Do not copy Switchboard's large CLI or introduce another board application.

Use `.mjs` with JSDoc and runtime validation to match Plates' no-build, zero
runtime dependency contract. Port behavior and synthetic tests from TypeScript;
do not add a compiler to package execution. Keep native tools (launchctl, plutil,
SQLite access, gh, runner binaries, rclone, osascript) behind injected adapters
with explicit capability reporting. Missing tools mean unavailable coverage.

Keep routine capability opt-in. The product domain ships in Plates core; any
later practice installs only nonprivate scaffolding and references, never
personal definitions or runtime state into consumer repositories. A practice
manifest is needed only if consumer files are actually distributed.

Reuse existing concepts, not misleading names: `lib/quota.mjs` is **GitHub API
quota**, not model capacity. Subscription runner observations normalize into
the capacity model while hosted selection remains policy controlled. The current
hosted model adapter is a tool-free evidence brief, not a general Claude/Codex
routine executor. The current web worker starts a registered typecheck operation,
not arbitrary shell or MCP. New adapter support must be explicit and tested.

## Complete capability inventory and destination

All 33 Switchboard `src/` modules are accounted for below; CLI entrypoint,
configuration/state, tests and planned capabilities follow. Test paths in this
table are Switchboard source tests, not claims of Plates coverage.

| Capability and source | Verified source boundary / disposition | Plates home and proof carried forward |
| --- | --- | --- |
| `SB:src/types.ts`, `inventory.ts` | Seven source kinds; per-source readability/count/cache attribution; source IDs are not global identities | `lib/routines/model.mjs`, `sources/index.mjs`; preserve incomplete vs empty and source conflicts. `inventory.test.ts`, `timeline.test.ts` |
| `launchd.ts`, `runs-launchd.ts` | User/vendor inventory, KeepAlive, last observed run only; machine-specific prefixes | `sources/launchd.mjs`; configurable owner prefixes, explicit host identity, no launchctl mutation. `launchd.test.ts`, `runs-launchd.test.ts` |
| `claude-desktop.ts`, `runs-claude.ts` | Across-account definitions and session/skipped-run observations; private files stay local | `sources/claude-desktop.mjs`; account namespace, prompt-free output, format gaps. `claude-desktop.test.ts`, `runs-claude.test.ts` |
| `codex.ts`, `runs-codex.ts` | Database/WAL/SHM snapshot and heartbeat turn history; unknown rollout formats reported | `sources/codex.mjs`; consistent bounded snapshot, original DB untouched, turn identities. `codex.test.ts`, `runs-codex.test.ts` |
| `github-actions.ts`, `runs-github.ts`, `gh.ts`, `workflow-yaml.ts` | Bounded CLI API reads and scheduled-run cache; restricted YAML, not a full parser | Extend existing `lib/web/routines.mjs`, `runs.mjs`, `run-model.mjs` and shared source adapter. Keep numeric repo/run/attempt identity and existing attempt history; do not downgrade to last scheduled run. `github-actions.test.ts`, `runs-github.test.ts` plus Plates web-runs tests |
| `vercel.ts` | Crons from repo `vercel.json`; execution history is not available from that definition | `sources/vercel.mjs`; record definition/revision, leave run coverage unknown. `vercel.test.ts` |
| `declared.ts` | Manual Claude cloud/Grok declarations; last-confirmed date, no fabricated run history | `sources/declared.mjs`; private authoring and freshness; no speculative provider integration. `declared.test.ts` |
| `schedule.ts`, `cron.ts` | Descriptions of cron/RRULE/interval/calendar/event/manual schedules; cron next-time logic is limited | Shared schedule normalization under `lib/routines/`; preserve raw expression, provider timezone and unsupported semantics. Coordinate with `lib/web/job-schedules.mjs`, not an extra scheduler. `schedule.test.ts` |
| `placement.ts` | Advisory home/cloud/unknown signals from local task/script content; home services and tailnet exceptions | `lib/routines/placement.mjs`; return reason codes only, never task excerpts; no signal means unknown, no automatic move. `placement.test.ts` |
| `routines.ts` | Strict routine.json/task.md validation, runner order, needs, permissions and review; circular imports noted in source | `lib/routines/definitions.mjs` plus pure shared placement/permission constants; break inventory/placement/routine import cycle. `routines.test.ts` |
| `quota.ts`, `permissions.ts`, `dispatch.ts`, `run.ts` | Local Claude/Codex fit/85% policy, restrictive flags, 20-minute timeout, declared outcome marker; queued is a recorded wait, not a durable queue service | Shared capacity contract plus `adapters/claude.mjs`, `codex.mjs` behind operation reservation/fencing. Port `quota.test.ts`, `dispatch.test.ts`; separately test new durability |
| `state.ts` | Config, declared list, immutable-content and hour-TTL caches, JSONL runs/approvals, cursor files | Existing explicit external workspace boundary plus `lib/routines/store.mjs`/`import.mjs`; disposable caches, durable original receipts, versioned records. Covered across inventory, timeline, events, review tests; add importer/crash tests |
| `benos-client.ts`, `match.ts`, `listener.ts` | Unix-socket SSE sync.completed plus active-record listing, from/label/title matching, reconnect/catch-up, per-process serialization; no public changes-log cursor | `adapters/benos.mjs` and `lib/routines/events.mjs`; durable per-routine lane and source watermark. `events.test.ts` |
| `outbox.ts`, `notify.ts` | Bounded Drive file/attachment copy and notify, holds/digests, no overwrite, scoped refs, archived outbox; approved effects append history | `lib/routines/effects.mjs`, `adapters/drive.mjs`, `notifications.mjs`; original-operation recovery before effect execution. `review.test.ts` |
| `adopt.ts` | Read-only old-seen vs held results, includes notification-only cases; missing held file can currently resemble empty | `lib/routines/adoption.mjs`; require complete evidence and distinguish file parity from notification parity. `adopt.test.ts` |
| `timeline.ts`, `render.ts`, `board.ts` | One local table/static HTML view, skips collapsed, unknown is never success; no web authentication | Shared projections into existing Plates Routines/Activity and local board navigation; preserve coverage and exact identities. `timeline.test.ts`, `board.test.ts` |
| `cli.ts`, `bin/switchboard.ts`, package scripts | inventory, timeline, board, check/run/approve/compare, listen and plist; not all verbs support JSON | `plates routines …` namespace and a temporary thin compatibility shim; existing `plates board` keeps its meaning. CLI/help/package tests plus source CLI fixtures |

Remaining scope is deliberately explicit:

| Source plan or repository material | Destination / disposition |
| --- | --- |
| Switchboard phases 0–5 | Preserve provenance; acceptance must be reproven in Plates rather than copied as checked boxes. |
| Phase 6 cloud scheduler and phase 10 remote BenOS | Planned work integrated into T5/T6 adapters, blocked on actual host/protocol availability and separate activation. No cloud execution or credential portability claim. |
| Phases 7–9 real event/effect/adoption walks | Retain dates, original receipts, comparison state and unresolved observations in T8; no automatic status promotion. |
| Cross-model review in design | Existing Plates cross-review where applicable; code review does not authorize personal-data effects. No new automatic reviewer or spend by default. |
| `.plates`, practices, workflows, roadmap scripts and generated lessons | Existing consumer tooling, not product features to copy back into Plates. Retain useful Switchboard lessons with attribution through the normal lesson flow. |
| README, design and guides | Consolidate user documentation only as commands ship; keep a historical source reference and exact compatibility table. Do not advertise planned commands in the current registered CLI guide. |
| Future file/PR/routine-completion triggers, generic shell/vendor runners | Design aspirations, no source adapter proven here. Represent as unsupported extension points; they do not become fake migration parity claims. |

## Ownership, identities and privacy

Definition v1 carries `id`, `scope` (workspace or project), source provenance,
revision/digest, trigger, placement/reason, ordered runner policy, needs,
permission targets, review, bounded allowance, overlap policy and task reference.
Private workspace definitions live at `routines/<id>/routine.json` and `task.md`
in the explicit private source workspace; personal tasks never enter public
application Git. Do not alter the current workspace manifest implicitly.
T1 adds a separate versioned routine policy, preserving manifest compatibility.

Runtime state stays in the explicitly initialized external workspace state root,
under `routines/`, outside all Git trees and application code. Hosted runtime
uses existing encrypted operation/store boundaries with reviewed schema additions.
Secrets remain in their current local credential tool or encrypted vault. A
definition stores a connection reference, never a credential or copied login.
BenOS retains its data and approval policy; providers retain scheduler definitions
and native run facts until an individually approved transfer.

Observation v1 carries source/host/account scope, observation time, definition
revision, coverage and gaps. Routine identity is a versioned tuple
`(workspace, scope, source, host-or-provider-account, native-id)`; provider run
identity additionally pins attempt/turn identity when supported. Human names are
labels. Preserve GitHub's numeric repository/run/attempt tuple. A dispatch intent
and execution attempt are distinct; a retry gets a new child operation with its
original parent. Exit status, routine-reported outcome, external effect state and
Plates acceptance are four different facts.

Local readers inspect only explicitly selected roots/accounts. Normalize and
redact before any transport: no task bodies, transcript text, file contents,
personal addresses, notification bodies, local paths or record refs in shared
hosted inventory. Treat even names, errors and filenames as private source text;
bounded safe summaries and authorized detail are separate views. Local detailed
record refs stay in private receipts for comparison. Cross-project aggregate
views use current scope intersection; workspace membership alone cannot reveal
another actor's personal routines. CLI JSON and HTML obey the same rules.

Hosted local observation is a new capability: explicit owner enrollment binds
host ID, workspace, actor, permitted sources and expiry to an observation-only
credential. POST bounded metadata through an authenticated typed endpoint with
sequence/digest replay checks and server read authorization; revoke independently
of execution. Never upload databases/transcripts. Until enrollment is implemented
and activated, hosted history shows local coverage unavailable. Browser cookies
and an observation token never authorize local execution. T5 requires a distinct
host execution credential/protocol; GitHub workers keep their existing OIDC trust.

## Compatibility and migration contract

Canonical proposed interface uses the `plates routines` namespace. Observation,
policy/import, operation and effect actions follow the phase outcomes; exact verb
selection is fixed with T1/T3 against existing CLI conventions. Legacy inventory,
timeline, check, run, approve, compare, listen and listener-plist behavior maps to
those actions only where actual callers need compatibility. Plist output remains
a preview, never installation. Every subcommand has `--json`. `board` compatibility routes to the
routine projection within Plates' existing local board; it does not replace the
project board. Existing Plates commands and JSON remain compatible.

Keep `switchboard` source IDs and `SWITCHBOARD-OUTCOME:` as legacy input aliases.
New output uses versioned Plates records and `PLATES-ROUTINE-OUTCOME:`; if both
markers occur and disagree, outcome is unknown/refused for effects. Keep legacy
exit meanings (0 ok, 1 failed/not runnable, 2 usage, 3 waiting, 4 no fitting runner)
in the shim and stable documented JSON reason codes. `SWITCHBOARD_HOME` and
`SWITCHBOARD_ROUTINES` are accepted only by the explicit import/legacy shim,
never ambient defaults for hosted or new Plates commands. The shim delegates
to the shared domain; it may not run a second listener or quietly import state.

Import proceeds as preview → approved snapshot copy → verify → dormant imported
state. Its digest binds source identity, file digests, source routine IDs,
destination ownership marker and schema version. Copy explicit definitions,
declared routines, original `state/runs.jsonl`, cursors/seen state and held/done
outboxes; do not import credentials, transient locks, processes or caches.
Map nonsecret config only; destination connection references must already exist
or remain unavailable. Keep an alias manifest from every legacy ID/record offset
to its new ID with original bytes/hash and attribution. Missing IDs do not become
invented provider attempts. Conflicting timestamps and malformed/torn JSONL are
quarantined as gaps; they cannot silently count as success.

Preview reads may run while Switchboard is active but are provisional. Commit
requires a separately approved quiescent snapshot or a demonstrated stable
snapshot boundary; do not claim consistency from a copy made during appends.
Recheck all source/destination hashes before writing, use private staged files
and atomic publication, and refuse symlinks, traversal, wrong ownership and
unexpected existing content. Retrying the same verified digest returns the
original receipt; changed inputs require a new preview. Never remove the source.
Imported routines are disabled for dispatch until explicit per-routine cutover.

Held effects keep their original bytes, target, source record and held digest.
Import is not approval: reevaluate current policy plus exact imported payload
before delivery. Completed effects are historical and never replayed. Unknown
effects remain blocked for reconciliation. Retain legacy receipts unchanged and
new interpretation separately; do not rewrite Switchboard's historical JSONL.

## Execution and crash boundaries

Time triggers remain in their existing scheduler until approved cutover. A
schedule edit has its own source/digest/budget/overlap review through the existing
worker schedule operation. Preserve timezone/DST semantics; unsupported RRULE or
calendar shapes are observed but not silently converted to cron. This phase does
not introduce another polling scheduler to cover missing provider access.

Select runner by current supported capabilities, policy, placement, connection,
capacity and all budgets. Switchboard's unknown-quota-as-available rule is not
silently retained: unknown/stale entitlement waits by default. Its 85% threshold
can be an explicitly reviewed policy setting, separate from money/minute ceilings.
Expired quota observations do not prove renewed capacity. Permission mapping
refuses unknown tools; task prose grants nothing. Re-prove current runner flags
and MCP availability before activation, preserving the dated Codex/BenOS refusal
until evidence changes. No personal configuration or subscription login is copied
to GitHub, a hosted worker or the provider vault.

All entrypoints (manual, event, schedule, retry and shim) share a durable routine
lane and original intent. Use existing worker reservation/fence rules where
applicable, extending scope for personal routines and an explicit local backend.
Reserve before spawning, persist a single begin transition, and retain uncertainty
after a crash/timeout. Local backend uses an atomic file/lock protocol and durable
receipts; it must pass the same conformance tests as the hosted store. An expired
lease or missing process observation is not evidence that no effect occurred.
An unknown attempt cannot move to another runner. Cancellation request is separate
from confirmed termination; process descendants are accounted for before release.

For BenOS, implement the actual socket protocol: sync.completed is a wake-up,
then bounded record listing by activity and matching from/label/title. Preserve
the existing 10-minute overlap, 14-day seen retention and no-backfill default as
versioned policy, not a promise of complete history. Changed record activity can
trigger again. Missing pages, a gap beyond retained evidence, null activity and
clock anomalies are explicit coverage gaps. An engine restart invalidates the
SSE event ID; reconnect still performs catch-up. No imaginary changes-log API.

Persist a matched batch intent keyed by routine definition revision and exact
record/activity tuples before dispatch. Atomically associate it with the durable
operation and checkpoint; on recovery inspect the original operation instead of
creating a new dispatch for an unchanged cursor. Queued/refused/auth-error cases
remain pending without blind new attempts. A crash between process start and
cursor write must not reproduce Switchboard's replay risk. Two listeners and a
manual run contend for the same lane. Reuse a bounded retry wake-up only for known
not-started work; uncertainty needs reconciliation. Logs carry sanitized counts
and operation IDs, not private match values.

Effects are typed operations: Drive file, notification or a correlated BenOS
change. Bind payload hash, destination, current authority, connection generation
and run identity; use exact reviewed preview/approval and an effect-specific
reservation before the external call. A successful process alone never authorizes
effects. Failed/unknown runs refuse new effects; held items require current approval.
Validate files/attachments, scope, regular-file containment and bytes at delivery,
not only when the outbox was written. Keep no-overwrite Drive behavior, target
allowlists, 50-item/200-character source bounds and safe argv handling.

Moving an outbox directory after sending is not exactly-once proof. Crash after
upload/notification but before receipt is unknown: retain the original intent,
inspect provider evidence when available, never send again automatically. A
same-name Drive file is skipped/needs inspection, not proof it is the same bytes.
Notification delivery may remain unresolved when the channel offers no receipt.
BenOS approval is independent of Plates approval; correlation needs verified
session support and action readback. Cross-model review supplies advice, not effect
authority. Remote MCP waits for the public authentication contract and live proof.

## Ordered implementation tasks

These tasks implement the outcome phases above; they are not a port of Switchboard's
phase structure. Each commit updates the relevant phase and records its real proof. Planned
test filenames below are created with their implementation, never empty placeholders.

| Task | Dependencies | Concrete patch and exit condition | Focused proof |
| --- | --- | --- | --- |
| N1: set terminology and navigation | Read-side route audit; phase 137 | Inventory fleet labels/callers; adopt set/project set in existing product views and validated set lens. Preserve routes, JSON, CLI and receipt identifiers; document versioned aliases and retirement window separately. | Planned routine-views and existing web-home/web-operation-coverage tests, deep-link and reconnect cases. |
| U1: whole-task/PR usage | AQ contract integration and ID reconciliation, T1/P1 identity; phases 137–138 | Extend the existing AQ ledger schema/adapters with funding and provider-specific token/cost measurements; project full lifecycles, allocation, coverage and privacy in current work/Activity views. No duplicate telemetry store. | AQ records/lifecycle/report tests extended for contributor splits, multi-PR allocation, imported/parent-child duplicates, retries/cache and missing telemetry. |
| S1: personal agent recommendation | P1, AQ quality evidence integration, U1 metric boundaries; phase 138 | Read current authorized choices and capacity, combine role/capability and relevant quality/latency/cost evidence, and explain recommendation or uncertainty. No automatic execution or payer switch. | Planned `tests/routine-recommendations.test.mjs`, existing web-capacity/model-selection and AQ report tests; sparse/version mismatch, reset/stale quota, override and spend refusal. |
| P1: shared work and personal capacity | T1 observation identity; phase 138 | Extend actor/project/account ownership, funding grants, canonical pool reservations and reviewed lesson promotion. No live access migration. | Planned `tests/routine-ownership.test.mjs` and existing web-auth/capacity/connections/model-selection/learning tests; cross-scope matrix above. |
| T1: domain and policy | Existing workspace/history/worker/model contracts; no live activation | Add pure versioned model, definition validators, scope/alias/coverage contracts and destination policy. Record provenance/reuse basis before porting; remove source circular coupling. Lock the module boundary and all inventory dispositions. | `tests/routine-model.test.mjs`: strict schema, ID collision, private scope, unsupported trigger/capability and unknown outcome fixtures. |
| T2: observation adapters | T1 | Port local launchd/Claude/Codex, declared and Vercel readers; share GitHub extraction/history with Plates. Bound file/API/time reads, retain freshness and format gaps, keep consistent WAL snapshot. No provider writes. | `tests/routine-sources.test.mjs`: source tests in inventory table plus torn snapshot, stale cache, malformed YAML, unsupported schedule/timezone and privacy sentinel fixtures. |
| T3: shared views and observation bridge | T1–T2; phase 102 access contract | Add routine CLI namespace/JSON; integrate existing local board and hosted Routines/Activity. Implement observation-only enrollment/transport and revoke tests, without activating it. Add help/guide and capability registry when commands ship. | `tests/routine-views.test.mjs`, existing `tests/web-runs.test.mjs`, `tests/web-runs-ui.test.mjs`: account/project revocation, forged host, replay, mixed sources, attempts, keyboard/mobile filters and no mutation on refresh. |
| T4: reversible import | T1–T2, P1; phase 139 | Implement preview/digest/import receipt/verification, original-data retention, aliases and dormant definitions. Include pending outboxes/cursors and reject inconsistent or changed snapshots; caches discarded. | `tests/routine-import.test.mjs`: same-digest recovery, conflicting destination, source race, symlink/traversal, duplicate timestamp, missing held files and restore to original snapshot. |
| T5: one execution path | T1, P1, T4; phases 103/104/106 contracts | Introduce supported local runner adapters and registered cloud extension, shared intent/budget/fence protocol, separate host execution enrollment. Keep unsupported remote/subscription adapters off. Capability/permission/placement and unknown capacity must be checked before reservation/spawn. | `tests/routine-execution.test.mjs`, existing `tests/web-jobs.test.mjs`: concurrent manual/shim/schedule calls, spawn/receipt loss, timeout descendants, stale fence, budget exhaustion, auth revocation and forbidden fallback. |
| T6: durable events and time integration | T2, T5 | Port matcher/socket/SSE plus durable batch/cursor linking. Generate launchd definition only; time scheduling uses existing approved schedulers. Preserve cloud-first recommendation and home requirement facts separately. | `tests/routine-events.test.mjs`: split SSE, restart IDs, partial pages, source gap, queued/auth refusal, changed record activity, concurrent listeners and crash at every intent/start/checkpoint boundary. |
| T7: reviewed effects | T4–T6 | Typed outbox/Drive/notification adapters and BenOS action correlation. Shared operation recovery and current scope checks; no auto-retry of uncertain effects. Preserve held effects and original approval records. | `tests/routine-effects.test.mjs`: changed payload/target/policy, path escape, missing attachment, duplicate approval, partial delivery, lost upload/notify response, and unresolved BenOS action. |
| T8: compatibility and retirement | T3–T7 | Thin legacy shim, Acme packed-package proof, comparison reports and cutover/rollback runbook. Keep old state readable; select routine/window, gather actual evidence, then request exact retirement authorization. | `tests/routine-adoption.test.mjs`: missing comparison evidence, notification-only vs file mismatch, changed definition resets relevant observation, drain/rollback fencing and no duplicate effect. Real owner walks follow. |

Do not combine all adapters into one large change. Review T1/T2 contracts first,
then deliver read-only visibility and P1 ownership/funding before importer/execution
changes. T3 and the T4 preview can be developed independently after T2, but T4
acceptance waits for P1 ownership and funding rules; use the same identity contract.
Cloud activation remains blocked independently of local implementation.

## Rollout and rollback

1. **Inventory:** read the selected sources with current authorization and record
   exact revision, host/account identity, gaps, current scheduler/listener labels,
   routine digest and expected output. Do not infer live state from these repo docs.
2. **Observe:** run Plates readers alongside existing execution. Compare normalized
   observations and coverage against independent provider facts. This spends no
   model budget and never starts a routine. Reader failure is reversible by removal.
3. **Prepare import:** review exact source/destination digest and private snapshot.
   After approval, pause/drain only affected writers for a consistent copy; retain
   original configuration/state and restore observed prior states. Imported entries
   remain dormant. Record any unresolved in-flight operation before proceeding.
4. **Shadow:** only with an explicit routine/budget/effect hold approval, compare
   Plates results against the incumbent over a suitable window. One system owns
   external delivery; shadow output stays held. BenOS direct changes require a
   read-only/held mode too, otherwise that routine cannot safely shadow. Missing
   coverage, no qualifying events, notification-only parity for a required file,
   or unknown costs are gaps, not a pass.
5. **Cut over one routine:** present reviewed digests, parity, active-work inventory,
   allowance and rollback receipt. On owner approval pause incumbent dispatch,
   drain/reconcile every active or uncertain operation, freeze final checkpoint,
   verify import delta, atomically assign the new writer generation and enable
   only that routine. Verify one listener/scheduler, one run and expected effects
   against independent evidence. Never switch credentials or widen permission
   implicitly. Observe the agreed window before selecting the next routine.
6. **Rollback:** stop new Plates dispatch and block affected effect operations;
   drain or reconcile outstanding attempts. Preserve all new receipts and cursor
   advances. Translate reconciled completed-record/effect identities back into the
   legacy checkpoint before restoring the old writer under a new generation. Do
   not restore an old snapshot blindly: it would reprocess newly delivered work.
   If safe reverse translation or effect certainty is unavailable, leave both
   dispatchers paused for owner resolution. Restore exact prior scheduler state
   only after proving Plates cannot still act. Keep dormant imported state for audit.
7. **Retire:** require complete source coverage, observed outcome/effect parity,
   zero unresolved operations, verified final state transfer, tested rollback,
   approved per-routine ownership and a dated owner decision. Separately retain
   the compatibility shim for an agreed usage window. Archive/decommission of
   Switchboard and deletion of any state need a later explicit request; this
   phase does neither automatically. Historical links/receipts remain usable.

Health-reports is already comparing Claude desktop with held Switchboard effects.
Preserve its original 2026-10-30 start and earliest 2026-11-06 review; do not start
a third writer or reset that clock because code moved. Compare reports, portal
notifications and missing observations separately. Its existing comparison code
can count notifications as reporting a ref; that is not proof a required file was
copied. Port this distinction before relying on its result for retirement.

## Validation and review record

The [dated review record](../evidence/2026-10-30-switchboard-consolidation-design.md)
names inspected revisions, checks actually run and remaining implementation work.

For the specification, regenerate the roadmap and run phase/format/link and
focused conventions checks. No model calls, provider writes or full suites are
needed for this deliverable. Implementation proof commands are in phases 137–141 and
N1, P1, U1, S1 and T1–T8; existing source tests establish what to preserve, not that a port passes.

Repository review corrections incorporated into this contract: current BenOS
code uses active-record listing, despite older design references to a changes
log; local Switchboard queued records are not a durable scheduler; current web
history cannot scan the owner's machine; model planning is not routine execution;
GitHub quota is not model quota; per-process listener serialization and outbox
renaming need stronger crash proofs; comparison notification parity is weaker
than required-file parity. These gaps are concrete implementation requirements,
not reasons to mark the consolidation built.
