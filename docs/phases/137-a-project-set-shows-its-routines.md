---
status: partial
since: 2026-10-30
goal: G8
spec: 2
depends: [93, 102]
note: "Local set visibility/readers and observation-only bridge implemented; live enrollment/source walks and remaining navigation/terminology work are unverified."
evidence: ["evidence/2026-10-30-project-set-lens.md", "evidence/2026-10-30-consolidated-observations-usage.md", "evidence/2026-10-30-consolidation-local-validation.md", "evidence/2026-10-30-consolidation-authorization-checkpoint.md"]
---

# A project set shows its routines and what actually ran

## Done when

An authorized owner can inspect the routines and observed runs associated with a project set or their private workspace in Plates, with source provenance, missing coverage and placement reasons, without visiting a separate Switchboard application or changing an executor.

## Scope

The first Plates-native outcome in the [consolidation contract](../specs/switchboard-consolidation.md):
T1's observation/identity contracts, T2 readers and T3 shared views. It is a useful
read-only delivery independently of routine ownership and execution. Switchboard's
components are evidence and possible implementation material, not the new product
structure. Reuse, redesign and discard choices are explicit in that contract.

Extend existing Routines/Activity and local board projections. Local and hosted
views share normalized observations; local sources remain unavailable to hosted
views until a separately approved observation-only bridge is activated. Personal
routine visibility is actor scoped; a project set is a view grouping, not an
access-control grant. Use “project set” and “set” in product language;
keep existing fleet command/API identifiers stable during this work.

The remaining outcomes are [personal capacity for shared work](138-people-bring-their-own-capacity-to-shared-work.md),
[policy and reversible import](139-a-routine-has-one-plates-policy.md),
[accountable execution and effects](140-routines-run-with-accountable-effects.md)
and [safe replacement](141-a-routine-changes-owner-without-losing-work.md).
The first local slice adds a read-only lens to existing web views. Personal state
and active routines remain at their existing sources.

Extend the existing set overview → plate detail → work/runs/reviews/health
journey, with Learning, full task/PR usage and Connections/capacity in the same navigation. Source
records remain authoritative; provider success is not phase acceptance. A set
selector filters authorized plates, retains view context and never clones work.
Safe terminology migration N1 inventories visible labels and compatibility names,
changes user-facing “fleet” language to “set”/“project set,” and preserves old
routes, commands and receipts until a separately verified alias retirement.

U1 exposes lifecycle usage through current work/Activity views using the existing
agent-quality episode/attempt ledger, with selective integration described
in the contract. Observing consumption is separate from current quota or funding
permission. Do not add a competing routine telemetry store.

## Acceptance

- [x] An optional bounded registry filters existing Home/Routines/Activity before source reads; hidden members are not returned, pagination is membership/source-bound, refresh retains the set, access revocation fails closed, and original project/attempt links work: `npm run check:focused -- tests/web-project-sets.test.mjs tests/web-home.test.mjs tests/web-events.test.mjs tests/web-runs-ui.test.mjs tests/web-responsive.test.mjs tests/web-recovery.test.mjs`.

- [ ] A task/PR usage view includes planning, coding, review, remediation, retries and failed/abandoned work, with person/account/model/stage/token/cost breakdowns, source coverage and nonadditive shared-work attribution: `npm run check:focused -- tests/agent-quality-usage.test.mjs tests/management-surfaces.test.mjs tests/web-management-observations.test.mjs`. Local ledger and sanitized views are implemented; private per-account drill-down and live walkthrough remain.

- [ ] Existing Home, project detail, decisions/reviews, Daily/health, Learning, Connections and job/operation views remain reachable through the set/plate lens with source-bound return routes, filters and pending receipts preserved: `npm run check:focused -- tests/routine-views.test.mjs tests/web-home.test.mjs tests/web-operation-coverage.test.mjs` (first file planned).
- [ ] N1 inventories user-facing fleet labels, moves product language to set/project set and tests existing routes/JSON/CLI aliases and stored receipts without broad runtime renaming: `npm run check:focused -- tests/routine-views.test.mjs tests/web-operation-coverage.test.mjs` (first file planned).

- [x] Versioned routine/source/attempt identities distinguish workspace/actor, project, host and provider, preserving conflicts and unknown outcomes: `npm run check:focused -- tests/routine-model.test.mjs`.
- [x] All inventoried reader capabilities have a reasoned reuse/redesign/drop disposition; supported sources retain bounded reads, provenance, timezone and explicit gaps: `npm run check:focused -- tests/routine-sources.test.mjs`.
- [ ] Existing CLI/board/Routines/Activity consume one model; filters, keyboard/mobile use, old run attempts and current authorization survive aggregation: `npm run check:focused -- tests/management-surfaces.test.mjs tests/web-management-observations.test.mjs tests/web-runs.test.mjs tests/web-runs-ui.test.mjs`; real desktop/mobile source comparison still requires its walk.
- [ ] Observation enrollment cannot dispatch work; revoked/forged hosts, replayed uploads and cross-actor/project reads fail without exposing private source content: `npm run check:focused -- tests/routine-views.test.mjs` (planned file).
- [x] The installed candidate exposes JSON and help for supported observation commands, preserves current board/fleet contracts, and passes source conventions: `npm run check` and `npm run typecheck` on the integrated implementation.
- [ ] Selected authorized sources agree with independent provider observations on desktop/mobile, with unavailable sources visibly incomplete: ⚑ by hand: owner and conductor; observation-only activation reviewed separately.

## Your part

- **Ask:** Compare the routine view with a few selected source tools and confirm that it shows what you need.
- **Why:** Synthetic fixtures cannot establish current provider formats or useful real coverage.
- **Look at:** The project set's Routines and Activity views and their coverage report.
- **Choices:** View is useful | Missing context
- **Keeps it open:** Missing context
- **Takes:** About 10 minutes.
- **Then:** View is useful: record read-side acceptance. Missing context: record the missing source or explanation and refine the view.
- **Ready when:** Read-side implementation checks pass and exact sources/observation access are approved.

## Real surfaces

- published package: install a packed candidate in an Acme consumer and exercise JSON/help and source fixtures without ambient personal data.
- owner's machine: explicitly selected source reads compared with provider facts; no scheduler edits or routine execution.
- GitHub API: authorized numeric-repository workflow/attempt reads with bounded coverage and no writes.

## Proof

For this specification delivery run `npm run roadmap`, `npm run roadmap:check`,
`npm run render:check`, `npm run inbox:check`, `git diff --check`, and
`npm run check:focused -- tests/roadmap.test.mjs`; inspect all local links and
inventory paths against pinned repositories. These prove records, not features.
No expensive full suite for documentation alone.

For implementation run the named focused files as added, then `npm run check`
and `npm run typecheck` once on the integrated candidate. Source Switchboard tests
are porting evidence, not passing Plates tests. Record actual source/host/scope,
window, gaps and observation-only activation separately from acceptance.

## Deliberately open

- **Settled 2026-10-30:** The owner authorized resolving the unpublished draft
  allocation. Consolidation drafts 132–136 now use 137–141. Agent-quality keeps
  its existing 132–134 identities and branch untouched. Historical checkpoint
  evidence retains its original numbering; current links point here.

- Local-to-hosted observation is a new authenticated capability. Until T3 proves
  and the owner activates enrollment, local views work and hosted coverage says
  unavailable; no filesystem scan or transcript upload is implied.
- Provider formats and quota/capability evidence are dated. T2 records current
  observed versions; no missing read can count as empty or current.
- No Switchboard license file was found. Before copying source, T1 records the
  reuse basis and provenance; this specification copies no implementation.
- “Project set” is the product direction, not a broad fleet rename. N1 inventories
  commands, URLs and stored names, changes product labels and tests continuity;
  identifier removal needs a separately reviewed compatibility window. No global
  search/replace is part of this phase.

## Next action

Safeguard the local observation bridge checkpoint and compare external orchestration seams before further runtime work. Live source enrollment, selected-source comparisons and the remaining navigation/terminology inventory are still unverified; no service is activated.

## Trajectory

- **2026-10-30** — Created from repository inventory, then split into five user outcomes after the owner asked for Plates-native phases and preferred “set.” Product migration has not started.

- **2026-10-30** — Owner authorized local implementation. Added the optional project-set lens in existing Home/Routines/Activity with focused authorization, polling and continuation checks. Phase remains partial; no runtime enrollment, provider execution or migration is claimed.

- **2026-10-30** — Reallocated this unpublished consolidation draft from 132 to 137 after inspecting agent-quality at `9f8c17ad`; existing agent-quality phases are unchanged.

- **2026-10-30** — Bounded metadata readers and canonical AQ lifecycle usage now feed the existing board/history surfaces. Independent review required fail-closed limits, stable identity, scoped totals and filter continuity; local checkpoint `7d05a6a7` passes focused and installed-package proof. Hosted enrollment and live source agreement remain unverified.

## Integration checkpoint — 2 November 2026

The consolidation source is integrated with current main and the passive quality
branch. Current session recovery, content-addressed browser assets, installed
test gates and the refusal of public quality execution are retained. This
checkpoint does not establish a fresh full-gate pass, independent complete-head
review, live enrollment or human acceptance. Those remain merge/activation work.
