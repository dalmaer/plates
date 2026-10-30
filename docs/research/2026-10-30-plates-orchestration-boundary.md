# Plates implementation boundary for an orchestration comparison

Repository inventory, 30 October 2026. This document makes no claims about Herdr
or another product. External product research and the build/adopt decision are
separate. No architecture change or runtime cutover follows from this inventory.

Baseline: Plates main `0165c2902784073ba89dd717256ad233faf4865f`;
consolidation checkpoint `2a40a4842ce2119c9ab2392949e74397f67ffda9`;
Switchboard `a6651db5ff570eada8b04b2c4ffb993d8e67fbe9`. Code present in main
is not proof it is enabled in a hosted instance. Phase records explicitly retain
the outstanding owner and real-provider walks.

## What exists

| Area | Source state and limits |
| --- | --- |
| Shared software practices | Main contains adoption, update, drift detection, phase/goal records, decisions, evidence, review, lessons and night-care CLI/practices. This is Plates' original purpose in [design](../design.md). These are not contingent on the new routine executor. |
| Project management and history | Main contains private workspace/auth, project Home, Daily, Learning, Routines/Activity and operation receipts. [Phases 95–108](../phases/102-routines-have-a-complete-observed-history.md) distinguish local implementation from outstanding hosted activation/walks. |
| Bounded work | Main contains typed job registration, atomic reservations, fenced begin/heartbeat, cancellation/recovery, restore quarantine and explicit schedule-source edits. The registered worker covers specific typecheck/update operations; it is not a general personal-subscription agent runner. See [phase 104](../phases/104-web-operations-run-through-durable-workers.md). |
| Connections and model work | Main contains private source policy, encrypted credentials, capacity normalization, model selection, task budgets and preserved uncertain attempts. The tool-free model-planning adapter is not a replacement for arbitrary Claude/Codex sessions. [Phases 103](../phases/103-connections-expose-scoped-model-capacity.md) and [106](../phases/106-model-routing-respects-capacity-and-policy.md) retain live proof gaps. |
| Set visibility | This unpublished branch adds a project-set lens to existing Home/Routines/Activity and the local board, plus bounded explicit local-source readers. It does not create another dashboard or change active routines. |
| Full task/PR usage | This branch selectively reuses the separate agent-quality contracts and extends their episode ledger with immutable usage observations, lifecycle attribution, coverage/privacy and duplicate prevention. It does not infer missing historical telemetry, provider invoices or remaining subscription quota. |
| Personal recommendations | This branch explains current authorized choices using separate capacity windows and relevant quality evidence. Local JSON cannot authenticate itself; advice does not reserve, dispatch or switch payer. |
| Current checkpoint work | Local service/store code adds explicit funding admission, private lesson copies, observation-only host enrollment, a bounded Codex quota protocol reader, recommendation composition and read-only policy/import preview. Funding UI/HTTP adapter wiring, host upload-client integration and checked recommendation selection remain code gaps. The recommendation service deliberately withholds available choices. See the [checkpoint evidence](../evidence/2026-10-30-consolidation-authorization-checkpoint.md); none establishes live readiness. |
| Not implemented by consolidation | Durable dormant import apply/recovery, the general routine execution/event/effect path, per-routine comparison/cutover/rollback and retirement remain future work in [139](../phases/139-a-routine-has-one-plates-policy.md), [140](../phases/140-routines-run-with-accountable-effects.md) and [141](../phases/141-a-routine-changes-owner-without-losing-work.md). No Switchboard executor has moved. |

The committed consolidation code at `10076b5b` passed the combined local gate
(3,836 tests, zero failures, four opt-in Docker skips), typecheck and an installed
Acme package walk. That evidence does **not** cover subsequent checkpoint edits;
see [the original validation record](../evidence/2026-10-30-consolidation-local-validation.md).

## Architecture worth retaining

Plates owns project practice and evidence: the source of phases and accepted
decisions, installation/drift policy, exact reviewed operations, review outcomes,
lessons with provenance, and honest distinction between code, merge, deployment
and acceptance. The existing usage/quality ledger also owns its immutable
attribution and uncertainty. An external runner need not replace these records.

The private boundary matters independently of who launches work: current numeric
repository access; an explicit funding principal rather than a collaborator's
available quota; private personal data; approved lesson audience; and the original
operation after an uncertain response. Reuse these contracts or prove equivalent
behavior before substituting an implementation.

Generic session launch, worktree/process management, scheduling, provider
connectors, log streaming and agent-monitoring UI are potential adoption targets.
Much of the new consolidated executor is still only specified, so there is less
implemented work to preserve there. Existing specialized Plates workers should
remain usable while any replacement is evaluated. No generic monitoring screen
needs to become a second authority for project acceptance or usage totals.

## Integration seams to evaluate

1. **Invoke the existing CLI/practices.** An external orchestrator can run Plates'
   documented JSON commands within an explicitly approved project context.
   It should retain source revision, exit state and original operation identity.
2. **Supply observed runs.** Map external native run/attempt IDs and source
   coverage into the existing routine observation model and Routines/Activity.
   The observer cannot gain execution or funding authority from reporting.
3. **Supply an executor adapter.** Preserve approved intent, project lane,
   funding/reservation, begin fence and uncertain outcomes around an external
   launch/cancel/reconcile protocol. Whether the external engine or Plates owns
   a scheduler must be explicit; two active writers are not an integration plan.
4. **Attach usage and results.** Bind provider receipts to stable AQ attempts and
   full PR/task lifecycles, including retries and failed work. Imported/parent
   totals must not be counted again, and unknown usage stays unknown.
5. **Project the existing record system.** An alternative UI may link or render
   Plates records, but must enforce the same actor/project/audience boundaries
   and preserve exact preview/apply/original-receipt recovery.

A useful comparison therefore tests one bounded Acme task through these seams,
including cancellation, lost response, duplicate callback, funding exhaustion,
private-data isolation and result attribution. A feature checklist or a successful
agent launch alone would not establish that replacement is safe. Selecting and
running a live third-party trial remains a separate concrete decision.

## Smallest next evaluation

Start with a read-only contract comparison at pinned source revisions. Map the
external API's session/run identity, start acknowledgement, reconnect, cancellation,
exit evidence and log/usage records against Plates' existing job/store/worker and
AQ contracts. Use static Acme records to identify which fields are available,
which require an adapter and which cannot be established. No installation,
credential, remote host or agent run is needed for that design evaluation.

Before further runtime implementation, choose the ownership boundary: does Plates
keep policy, funding and durable operation intent while an external engine owns
terminal/session execution? Then decide the supported local/SSH placement, API
version pin, credential isolation and threat boundary, original-operation recovery
on a lost launch response, and authoritative usage/result sources. An API with
shell access must be treated as a privileged executor, not presumed to enforce
Plates' per-person funding or sharing rules. A live trial would separately name
the exact host, synthetic repository, capabilities, funding ceiling and cleanup.

The current checkpoint preserves the completed visibility/accounting and in-flight
authorization work. It deliberately starts no new general executor, BenOS event
transport, durable import apply, or cutover slice while this comparison is open.
