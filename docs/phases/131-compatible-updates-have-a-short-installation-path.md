---
status: partial
since: 2026-10-25
goal: G2
spec: 2
depends: [111, 116, 128]
review: wait
note: "Implementation in progress: installer, source record policy and read-only morning reporting; integrated proof, review and real installation walk remain."
evidence: ["evidence/2026-10-25-compatible-update-path.md"]
---

# Compatible updates have a short installation path

## Done when

An authorized compatible update reaches a verified installation through one source-bound prepare/review/install/recover path, without waiting for optimization or broad nightly acceptance, while unsafe changes, stale authority and incomplete installation evidence still refuse completion.

## Scope

The owner approved the migration retro recommendations on 2026-10-25. Phase
129 coupled installing reviewed updates to proving a full night, improve
observations, morning readiness and a planned climb. The owner separated those
requirements and all six prepared consumer updates then installed under their
approved barriers. Preparation and earlier testing are excluded from that short
execution interval; it is not evidence that testing was unnecessary or a measured
speedup. See [phase 129](129-plates-then-the-fleet-move-tonight.md) and its
[evidence](../evidence/2026-10-25-name-rollout-preparation.md).

Implement the agreed simplification in existing Plates mechanisms. This is one
phase with small implementation milestones, not another coordinator. No second
scheduler, task authority, approval database or evidence store.

### Existing mechanisms and changes

| Existing mechanism | Extension in this phase |
| --- | --- |
| `lib/update-prepare.mjs`, `lib/update.mjs`, `lib/fleet.mjs` | Keep preparation/review separate from installation; retain an original per-project operation through merge and installed-source readback. |
| `lib/update-artifact.mjs`, existing private-state patterns and a local installation receipt family | Bind installation evidence and a compact authorization summary to the existing operation; recover original uncertain writes. |
| `lib/names-actions.mjs` and the name-transition concurrency preflight | Apply an exact affected-workflow barrier only when the reviewed change alters concurrency identity; do not require it for ordinary compatible updates. |
| `lib/validation-plan.mjs`, `scripts/check-focused.mjs`, `lib/integrate.mjs`, configured CI | Add a narrowly defined source-owned record-only policy; preserve broad validation for executable, policy, mixed or unknown changes. |
| `scripts/plates/reconcile.mjs`, roadmap/render/inbox guards | Validate changed records, qualified PR references and generated outputs before the expensive checkpoint. |
| Shipped night-plan/morning/verification scripts, `lib/fleet.mjs` | Report installation independently of pending/failed optimization and incomplete operational verification. Reuse existing night reports and approved schedules. |
| `lib/review.mjs`, selected project guide and spin skill | Repair recurring failure shapes, reuse unchanged evidence/authority, and batch related corrections before one integrated checkpoint. |
| Existing validation audit and test ledger | Attribute gate runs, waits, review rounds and gaps; measure improvement without inventing charges or time saved. |

Phases 110–111 provide audit and advisory selection, not an existing exemption.
This phase introduces one reviewed, explicit **Plates source record-only** policy.
It does not activate phase 114's unfinished consumer attestations or phase 115's
broader shadow selection, and does not claim complete consumer gate equivalence.
Phase 128's source is available with an owner walk owed. Phases 129 and 130 are
not dependencies: remaining migration observations and retirement must not block
building the simpler delivery path.

### 1. Separate outcomes and the required path

The minimum path is **prepare → check/review → install → read back**. Recover
resumes an existing operation; it is not a new execution lane. Extend existing
JSON output and receipts with separately attributed observations:

- `installation`: pending, installed, failed, aborted or unknown; include target release,
  canonical repository, reviewed head/base, actual merge/default revision,
  installed lock/workflow identities and prior/restored workflow states.
- `verification`: pending, passed, failed or unavailable; cite revision-bound
  project/night evidence and gaps. No merge or installed version proves it.
- `retirement`: not-required, pending, complete or unavailable; preserve exact
  retained aliases and active continuations. Historical records are unchanged.
- Keep acceptance and lived-in use in their existing phase/evidence owners;
  none of these observations silently checks an acceptance box.

Installation requires a compatible reviewed candidate, applicable checks,
current explicit authority, protection of project-owned edits, and successful
source/readback checks. A destructive migration, incompatible consumer contract,
unknown compatibility, active concurrency conflict or failed installation check
still blocks. Classify compatibility from the actual migration/diff contract,
not a version number or a caller's assertion.

A missing improve observation, pending climb, optional optimization failure or
unrelated health backlog is visible follow-up, not an installation prerequisite.
Morning can publish a truthful partial report with pending/failed work; it must
not mark that work terminal, cancel it or launch it to make the report ready.
Preserve original plan identities, later outcomes and explicit completion rules
for genuinely required work. No additional model run, retry or budget follows.

The proposed CLI extends the existing command: `plates fleet update --install
<owner/repo#PR> --json` previews the exact reviewed candidate and required actions;
`--yes --digest <preview-digest>` applies only that approved operation.
`plates fleet update --recover <operation-id> --json` inspects/resumes its retained
receipt, never creates a replacement operation after uncertainty. Existing update
preparation remains the default. These flags are implemented in this phase's source and documented together; older installed CLIs do not acquire them until updated.

### 2. Barriers and recovery only where needed

Prepare, test and obtain review before pausing anything. For an actual change to
workflow concurrency identity, preview the exact affected workflow IDs and old/new
paths/groups, approvals and prior states. Pause only those workflows, confirm
complete active-run coverage across refs/events, naturally drain, then install
under that maintained barrier. Cancellation needs its existing separate authority.

After merging the exact reviewed head, read back the installed lock and affected
workflow bytes, then restore only prior active states. Filename replacements may
produce deleted old IDs and new IDs; validate explicit old/new mappings and the
reviewed new bytes before restoring. Never infer replacements by pattern or enable
unrelated/previously disabled workflows. Ordinary updates with unchanged groups
must prove that no pause/restore calls occur.

Retain the original intent before each mutation. On an uncertain merge, API
response or restoration, inspect the original operation and actual state; do not
repeat a PR POST, merge or dispatch. An interrupted installation retains its
pending restoration obligation. Report installed-but-restoration-pending without
claiming the whole operation complete. A conflict affecting shared compatibility
still stops dependent projects; unrelated audit gaps do not.

### 3. Conservative record-only validation

Extend existing planning/execution interfaces with an explicit, versioned policy
for Plates itself. Do not add a global `--skip-check` flag. The classifier uses
complete base/head and staged/working/untracked inputs, file types and semantic
record changes; directory names alone cannot establish eligibility.

Initially eligible: status/progress attribution, qualified evidence/PR references
and appended observation records in `docs/phases/` and `docs/evidence/`, plus
`docs/ROADMAP.md` proven to equal regeneration from those records. Required checks
include record schema/reference/anchor validation, roadmap consistency, applicable
render/inbox conventions, whitespace and review of changed acceptance attribution.
Resolve newly introduced cross-repository PR references before the integrated
checkpoint; missing required facts are gaps, not a pass. Historical observations
must remain unchanged.

Changes to acceptance requirements, Scope/Proof commands, execution policy,
architectural decisions, goals, instructions/skills/guides, templates, scripts,
workflows, configuration, dependencies, tests or source are **not record-only**.
Unknown paths, mixed changes, unsafe symlinks, incomplete diffs and unsupported
renames fall back to the configured full gate. Machine-read evidence fields must
pass their dedicated schema checks; unsupported fields fall back broadly.

Label the result `record-checks`, never a full-gate pass on the new commit. Keep
prior full-gate provenance at its original revision. Existing exact-head CI reuse
rules remain intact. A change to the classifier, allowlist or check policy itself
requires full validation and exact-head review. Align local delivery and CI so
neither silently takes a weaker path. Consumers retain their own configured gate
unless separately reviewed adoption explicitly enables an equivalent policy.

### 4. Reuse authority and proof without manufacturing either

Expose a compact continuation summary derived from existing owner decisions,
operation intents and receipts: action/destination scope, exact source/digest,
permitted mutations, budget, previous states, proof references, pending obligations
and original operation IDs. It is a view, not another authority store; user-written
metadata alone cannot grant permission.

Use an explicit invalidation matrix. Changed patch/head invalidates exact-head
review; changed release/config/tool/environment invalidates affected checks;
changed workflow IDs/groups invalidates that barrier preview; changed recipient,
permissions, spend, destructive scope or revocation requires appropriate fresh
approval. An unrelated record edit or session handoff must not erase unchanged
approval for another exact operation. Changed facts require fresh inspection;
only changed authority requires asking the owner again. Never broaden an approval
bound to an exact commit to cover a different commit.

When review repeats an earlier finding's shape, inspect the shared boundary and
known callers, add a regression that fails without the correction, and inventory
rendered copies, capability/lock hashes, migration pins and intentionally historical
fixtures before the integrated checkpoint. Batch related fixes, test focused
behavior/conventions while iterating, then run one full gate on the final changed
executable tree. Preserve every failure and reason for another run. Do not raise
review limits or waive required review automatically; keep existing owner escalation
for unresolved high-risk findings or exhausted budgets.

### 5. Reporting and non-goals

Existing CLI JSON, fleet status and night/morning summaries show installed,
verification gaps and retirement obligations separately. No new dashboard or
scheduled model process. Update shipped agent help, selected-guide instructions,
spin and the development validation guide together so they describe one policy.
Update the relevant historical spec with a dated successor-policy pointer rather
than rewriting its prior observations.

Measure preparation time separately from ready-to-install/restoration time;
record barrier duration, full gates per source/input identity and reason,
record-only gates, repeated approval asks within unchanged scope, review recurrence
by failure shape, installation defects and missing coverage. Costs remain unknown
unless measured. A shorter path cannot hide weaker correctness or lost restoration.

Non-goals: automatic acceptance/promotion/merge authority, provider routing,
universal consumer check skipping, autonomous model retries, new budgets or
schedules, broad instruction rewrites, deleting historical evidence, automatic
legacy-name retirement, or completing unrelated web/database/machine activation.

## Implementation milestones

1. Add failure-first synthetic Acme fixtures for pending optimization, missing
   observation, ordinary update, changed concurrency groups and stale authority.
   Define the additive outcome/continuation contracts in existing update receipts.
2. Implement one compatible update end to end through existing update/fleet
   paths, with no night/climb dependency; exercise uncertain-write recovery and
   restored-state readback before generalizing to the managed fleet.
3. Implement the source record-only classifier and shared local/CI execution
   policy with negative controls. Keep its implementation PR on the full gate.
4. Integrate continuation summaries, invalidation reasons and failure-shape
   preflight into review/spin. Extend existing morning/fleet reporting to show
   incomplete operational work without inventing completion or scheduling work.
5. Replay retained migration evidence read-only; compare old required dependencies
   with the new path. Perform one already-authorized real compatible update when
   available, retaining preparation/install/gate costs and all coverage gaps.
   Publish evidence and reconcile guides/specs before calling the phase built.

## Acceptance

- [x] A compatible candidate installs without invoking improve, climb, morning or any model; installation does not mark verification/acceptance complete: `tests/update.test.mjs`, `tests/fleet.test.mjs`.
- [x] Unchanged concurrency groups cause no barrier mutation; changed groups require complete drain, exact reviewed installation and verified restoration, including deleted-old/new-ID replacement and an atomic base lease: `tests/update-installation.test.mjs`, `tests/update-installation-git.test.mjs` (new).
- [x] Partial API coverage, stale heads, incompatible/unknown candidates, changed human content and uncertain writes fail safely; recovery retains the original operation and restoration obligation: `tests/update-installation.test.mjs`, `tests/update-installation-recovery.test.mjs`, `tests/update-artifact.test.mjs` (new).
- [x] Pure qualifying record changes run the complete narrow bundle; policy/acceptance/source/mixed/unknown changes require the full gate; local/CI decisions agree and no old pass is relabelled as current full-gate proof: `tests/validation-plan.test.mjs`, `tests/check-focused.test.mjs`, `tests/workflows.test.mjs`, `tests/integrate.test.mjs`.
- [x] A handoff and unrelated record edit retain unchanged scoped authority; head, destination, policy, budget or relevant input changes invalidate exactly the affected proof/approval; fabricated summaries grant no authority: `tests/update-installation.test.mjs` (new), `tests/review.test.mjs`.
- [x] Morning/fleet views show installed, pending/failed optimization, incomplete verification and retirement separately; reporting cannot tick work complete, retry it or invoke a consumer gate: `tests/morning.test.mjs`, `tests/night-plan.test.mjs`, `tests/fleet-verification.test.mjs`.
- [x] Recurring-review guidance and source-pin/convention preflight are consistent across shipped skill/help/selected guides; failure-first tests prove the changed behavior: `tests/check-focused.test.mjs`, `tests/practices.test.mjs`; `npm run render:check`.
- [ ] Integrated implementation and type contracts pass, with all review findings answered: `npm run check`; `npm run typecheck`; `node bin/plates.mjs review dalmaer/plates#<implementation-PR> --gate --json` using its actual PR number.
- [ ] A real compatible update records exact source, applicable checks/review, any required barrier, installation readback and restored prior states, with independent verification gaps preserved: ⚑ by hand: conductor under an existing owner-authorized project update.



## Your part

- **Ask:** Authorize a concrete project update only if no existing approval covers the real installation proof.
- **Why:** Creating this phase and agreeing with the retro do not grant arbitrary remote changes or new spend.
- **Look at:** The implementation's exact candidate/diff, check/review evidence, and any affected-workflow preview.
- **Choices:** Use the existing authorized update | Authorize the presented update | Defer the real walk
- **Keeps it open:** Defer the real walk
- **Takes:** A few minutes to inspect the concrete preview; execution time is measured separately.
- **Then:** Perform the approved update and retain its evidence; if deferred, keep the phase partial with the walk explicitly owed.
- **Ready when:** The reviewed implementation and synthetic negative controls pass and the actual update is identified.

## Real surfaces

- workflow shell: run the same classification and proof bundle locally and in candidate CI, including adversarial mixed changes; preserve exact run/source identities.
- published package: pack/install the candidate in a synthetic Acme consumer and exercise its shipped update/help/report paths, not source-only imports.
- adopted project: perform the authorized compatible update named in Your part; verify actual installed lock and managed bytes independently.
- GitHub API: verify exact head/review/check facts, conditional barrier coverage where required, merge readback and restored workflow states using original receipts.

## Proof

Implementation proof (new test files must be created before these commands run):

```sh
npm run check:focused -- tests/update-installation-git.test.mjs tests/update-installation-recovery.test.mjs tests/record-validation.test.mjs tests/update.test.mjs tests/update-installation.test.mjs tests/update-artifact.test.mjs tests/fleet.test.mjs tests/validation-plan.test.mjs tests/check-focused.test.mjs tests/workflows.test.mjs tests/integrate.test.mjs tests/review.test.mjs tests/morning.test.mjs tests/night-plan.test.mjs tests/fleet-verification.test.mjs tests/practices.test.mjs
npm run roadmap
npm run check
npm run typecheck
```

Record actual negative-control commands and results for each changed safety
boundary. Capture source and installed package identity, exact local/CI selection,
original failures, real update commands and immutable receipt links in the phase's
evidence. New test names/commands above are a proof plan, not existing proof.
The implementation itself uses the current full gate; specifying this phase does
not activate an exemption. No paid evaluation or new scheduled execution is needed.

## Deliberately open

- **Settled during implementation review:** the PR merge API does not atomically
  bind both approved parents. Publication uses the existing integrator's exact
  Git ref lease with a retained two-parent commit; branch protections can refuse
  it and are never bypassed. A pre-merge restoration-only preview/apply path
  terminates an installation whose immutable scope changed, verifying original
  workflow preimages. It cannot resolve an attempted or uncertain merge.
- **Settled 2026-10-25:** the owner approved the retro's direction. Installation,
  broad operational verification and retirement are distinct; optimization is not
  an installation prerequisite. This approval is not acceptance of unbuilt code.
- **Settled for MVP:** source-only record checks with semantic exclusions; general
  consumer coverage/attestation and broad change-aware selection stay in phases
  114–115. No dependency on their unfinished adoption is needed for this slice.
- **Settled for MVP:** early morning observation is an explicit read-only report. It preserves ordinary final-send readiness and deduplication; it cannot send an early issue, publish a card or finalize the plan. Installation never depends on final morning readiness.
- **Real project:** select the smallest compatible already-authorized update when
  implementation is ready. Absence of one leaves a walk owed, not invented proof.
- **Unknown observations:** historical receipts do not establish total hours saved,
  full session spend or all approval repetition. Report coverage and comparable
  intervals; do not require a new telemetry service to start improving.
- **Activation boundary:** current required gates remain until the classifier and
  local/CI policy are implemented, adversarially checked and reviewed. Unknown
  classifications always retain the configured full gate.

## Next action

Finish integrated proof and exact-head review, then identify a concrete compatible authorized update for the real installation walk. Keep operational verification and retirement gaps separate from installation.
