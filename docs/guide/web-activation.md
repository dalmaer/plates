# Activate the hosted web workspace

<!-- Generated from docs/specs/web-activation-plan.json by renderActivationGuide in lib/web/activation-plan.mjs. Edit the JSON, never this page; tests/web-activation-plan.test.mjs fails when it is stale, and rewrites it when run with PLATES_WRITE_ACTIVATION_GUIDE=1. -->

The records report migrations 001–004, 014, 017–019 and the repair 023 applied (023 on 2026-11-16, with its hosted proof). A read-only check of the hosted database just before 023 found all ten 005–013 RPC pairs installed under both keel_* and plates_* names, and 022's two tables present. So 005–013 and 022 appear applied but are not recorded, and their applied bytes are unchecked: that settles the earlier contradiction (phase 127 says 014 applied, but unchanged 014 requires the 005–013 RPCs that phase 151 previously called pending) in favour of 005–013 having run. Before running any 005–013 or 022 step, inspect its applied file identity and run its proof instead of reapplying it. 015–016 and 020–021 were not inspected and remain pending.

The plan is data in [web-activation-plan.json](../specs/web-activation-plan.json), read on 2026-11-16, and belongs to [phase 151](../phases/151-the-hosted-workspace-is-the-owners-daily-driver.md). A step for a phase that is not built or partial is refused.

## How the session runs

- Run the remaining steps in order. Steps already recorded complete below ask for current inspection, not automatic reapplication. Stop at the first failed proof, follow its rollback and record what was observed.
- The owner signs in to Vercel, Supabase and GitHub when a step needs it; the conductor runs the step and records its hosted proof. No credential is typed into chat, Git, a log or browser storage.
- A permission grant, a migration or a configuration date never enables a feature by itself: each feature has its own gate, and a gate's verified date is an operator assertion of a proof already recorded.
- Pending migrations run in file order except repeatable naming repair 023: run it immediately after each installed or replayed 005–013 migration, before its feature is used, and again at the explicit step after 013. It skips absent RPCs. Never edit or replay 014 to repair late stores. Every migration is transactional; a Git revert does not undo a committed migration. Keep feature gates off on failure and retain tables.
- After every configuration change, redeploy and compare the serving revision from /api/deployment with the deployment Vercel says receives production traffic.
- Walks (97–102, 104, 105, 107, 108) come after activation, from the workspace itself, on desktop and phone. They are the owner's, not steps of this plan.

## Already applied

- 001-auth.sql (phase 95): [evidence](../evidence/2026-10-21-web-auth-service.md)
- 002-home-cache.sql (phase 96): [evidence](../evidence/2026-10-21-web-home.md)
- 003-home-retry.sql (phase 96): [evidence](../evidence/2026-10-21-web-home.md)
- 004-decision-operations.sql (phase 97): [evidence](../evidence/2026-10-31-web-activation-plan.md)
- 014-plates-names.sql (phase 127): [evidence](../phases/127-the-web-home-and-its-database-move-to-plates.md)
- 017-not-now.sql (phase 173): [evidence](../phases/173-every-item-waiting-on-the-owner-can-be-answered.md)
- 018-last-looked.sql (phase 166): [evidence](../phases/166-home-says-what-needs-you-what-happened-and-what.md)
- 019-backlog-events.sql (phase 184): [evidence](../evidence/2026-11-06-backlog-events.md)
- 023-late-rpc-names.sql (phase 127): [evidence](../evidence/2026-10-24-hosted-name-transition.md)

## Steps

1. **runtime-exception-recheck** (phase 95, decision, owner attends). Recorded complete on 2026-10-31: Node v24.22.2, sign-in working and no exception opt-in (phase 151 evidence). Re-check the 2026-10-22 hosted runtime exception before new activation: require Node 24.22.1 or later, an answering database, and the current serving revision and rollback target. The original serving revision binding was unavailable; do not invent it.
   - Rollback: Promote the pinned prior deployment in Vercel. Restore the opt-in value only if the runtime is exactly 24.21.0 and the owner keeps the dated exception.
   - Proof to record: The /api/deployment request and its response status, the Node version and revision it reports, the Vercel deployment ID receiving traffic, and the pinned rollback deployment ID.
2. **backup-destination** (phase 94, decision, owner attends). Recorded on 2026-10-31: the first independent encrypted dump was taken and read back. The provider upgrade was deferred. Inspect the current backup and restore destination before new private-data migrations; the nightly schedule and second decryption-key copy remain the owner’s actions. Do not ask again for the already recorded destination decision.
   - Rollback: No hosted change. If no destination is chosen, record the accepted risk; declining it keeps media, drafts and the connection vault off.
   - Proof to record: The owner's dated choice (destination and price, or the accepted risk) recorded in phase 94; for a destination, one snapshot time read back from it.
3. **decisions-proof-inspect** (phase 97, decision, owner attends). 004 was applied and its hosted proof and race passed on 2026-10-31 (phase 151 evidence). Inspect the retained proof and current decision RPC inventory; do not reapply 004.
   - Needs first: phase 94.
   - Rollback: Inspection does not change the database. If the hosted behavior fails, retain the original evidence, stop dependent activation and use the existing feature rollback; do not undo an applied migration.
   - Proof to record: The applied version: file name and SHA-256 matched to source. The commit result, docs/evidence/2026-10-21-web-decisions-hosted-proof.sql's result and duration, the role denials and the concurrency outcome.
4. **github-app-contents-write** (phase 97, github-app, owner attends). Recorded complete on 2026-10-31 (phase 151 evidence): Contents write was granted. Inspect current installation permissions and selected repositories before later writes; request a new grant only if the required scope has changed.
   - Rollback: Owner removes Contents write in the App's settings; every write gate stays false.
   - Proof to record: A GitHub API read of the installation's permissions (contents: write) and its selected repository list, sanitized.
5. **decision-writes-gate** (phase 97, env, owner attends). Recorded enabled on 2026-10-31 (phase 151 evidence): decisionWrites true and a real decision committed. Inspect the current serving configuration and an exact decision preview before later activation; do not turn the gate off and on merely to repeat a completed step.
   - Rollback: Set decisionWrites false and redeploy, or promote the pinned deployment. A source write already committed is undone only by its own reviewed revert.
   - Proof to record: The serving revision from /api/deployment, a decision preview request and its response status, and the configuration's decisionWrites value on that deployment.
6. **rpc-name-baseline-inspect** (phase 127, decision, owner attends). Phase 127 records 014 applied on 2026-10-31 and dual writers enabled. Phase 151 previously placed 005–013 in the future; its corrected Next action now calls for inspection of the installed RPCs. Unchanged 014 requires all their RPCs and refuses overwritten forwarders. Inspect actual function definitions, signatures, grants and the applied file identity before continuing. Do not reapply 014 or infer missing migrations were applied.
   - Needs first: phase 94.
   - Rollback: Inspection does not change the database. If the hosted behavior fails, retain the original evidence, stop dependent activation and use the existing feature rollback; do not undo an applied migration.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-plates-names-hosted-proof.sql's result (grant and dependency impact, and one read through each old and new name), the measured hosted schema, and one request through each name with its response status.
7. **migration-005** (phase 98, migration, owner attends). Apply 005-walk-drafts.sql (private guided-walk drafts and observation histories) after 004, then run the existing hosted proof SQL. Immediately run 023-late-rpc-names.sql before using this feature, then verify both keel_* and plates_* callers; repeat 023 after later replays.
   - Needs first: phases 94, 97.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, walk drafts are only read and written by the walk routes; leave the tables, and keep source submission behind decisionWrites.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-21-web-walks-hosted-proof.sql's result, the role denials and a two-connection draft revision race.
8. **capture-bucket** (phase 99, decision, owner attends). Owner approves, and creates in the existing Supabase project, a private plates-captures bucket with 90-day retention and a 256 MiB application cap. No paid upgrade and no public export.
   - Needs first: phase 94.
   - Rollback: Leave the bucket empty and private, and leave media out of the configuration. Deleting the bucket is a separate owner action; expiry never starts cleanup.
   - Proof to record: The bucket's private visibility read back from Supabase, with the approved retention and cap recorded in phase 99.
9. **migration-006** (phase 99, migration, owner attends). Apply 006-private-media.sql (ciphertext capture receipts and the attachment CAS). Immediately run 023-late-rpc-names.sql before using this feature, then verify both keel_* and plates_* callers; repeat 023 after later replays.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, leave media out of the configuration so no route writes receipts.
   - Proof to record: The applied version: file name and SHA-256. The commit result, and docs/evidence/2026-10-31-web-media-hosted-proof.sql's result: the role denials and a bounded receipt RPC call run as the service role.
10. **media-config** (phase 99, env, owner attends). Add media {bucket: plates-captures, retentionDays: 90, capacityBytes: 268435456} to PLATES_WEB_CONFIG and redeploy.
   - Rollback: Remove the media member and redeploy. Stored captures and their receipts are kept.
   - Proof to record: The serving revision, and one capture upload request whose receipt reaches the verified state, with its response status.
11. **workspace-writes-gate** (phase 100, env, owner attends). Set workspaceWrites true in PLATES_WEB_CONFIG and redeploy. It is the private workspace gate: copying one to three selected lessons here, and later connection policy edits (103), fleet update publication (105) and model policy (106). It needs Contents write on the private workspace repository and the 004 operation store.
   - Needs first: phase 97.
   - Rollback: Set workspaceWrites false and redeploy. Copied lesson files stay; the originals were never changed.
   - Proof to record: The serving revision, and a lesson-copy preview request against the pinned private workspace with its response status.
12. **restore-scope** (phase 101, decision, owner attends). Owner selects the isolated restore target, the projects and participants, and the observation window for the restore drill, and records that this instance has never been restored (so no recovery epoch is set). Execution gates later in this plan date their restore assertion from this step.
   - Needs first: phase 94.
   - Rollback: No hosted change. Without a selection, keep jobs, model routing and night operations off.
   - Proof to record: The owner's dated selection, recorded privately per the recovery guide, and the serving identity comparison from /api/deployment.
13. **github-app-actions-read** (phase 102, github-app, owner attends). Owner approves GitHub App Actions read on the selected project repositories, for routine definitions and run history. It grants no dispatch.
   - Rollback: Owner removes Actions read; the routine pages show the missing permission as a gap.
   - Proof to record: A GitHub API read of the installation's permissions (actions: read) and one workflow-run list request with its response status.
14. **migration-007** (phase 102, migration, owner attends). Apply 007-run-history.sql, the read-only history RPC over the 004 operation store. It has no recovery or purge. Immediately run 023-late-rpc-names.sql before using this feature, then verify both keel_* and plates_* callers; repeat 023 after later replays.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. The function only reads; after commit, the history page can be hidden by redeploying the pinned deployment.
   - Proof to record: The applied version: file name and SHA-256. The commit result, and docs/evidence/2026-11-15-web-run-history-after-rpc-names-proof.sql's result after 023 (the plates_run_history contract and its keel_ forwarder): the role denials and one bounded actor-scoped history call.
15. **connections-choice** (phase 103, decision, owner attends). Owner decides whether to switch on the optional connection vault now, and which provider (OpenAI or Anthropic) to validate. Declining skips the connection steps and model routing (106), which needs them.
   - Rollback: No hosted change; connections stay disabled.
   - Proof to record: The owner's dated choice, recorded in phase 103.
16. **migration-008** (phase 103, migration, owner attends). Apply 008-connections.sql (runtime credential ciphertext; its RPC never returns ciphertext). Immediately run 023-late-rpc-names.sql before using this feature, then verify both keel_* and plates_* callers; repeat 023 after later replays.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep connections.enabled false so no credential is stored.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-connections-hosted-proof.sql's result (the role denials and a service-role CAS exercise) and its CAS rotation race between two connections.
17. **connection-wrapping-key** (phase 103, env, owner attends). Bind a separate production wrapping key as KEEL_CONNECTION_ENCRYPTION_KEY (32 bytes, base64, different from the session key) in Vercel's secret store, with a copy in the protected recovery location the backup decision chose. Redeploy.
   - Rollback: Keep connections.enabled false. Never remove or rotate the key while any credential ciphertext exists; removing Plates's copy of a credential does not revoke the provider key.
   - Proof to record: The serving revision, a startup that passes configuration validation, and the key's recovery-location reference (never the key).
18. **connections-gate** (phase 103, env, owner attends). After the owner enters the chosen provider credential in the workspace's own form and its live metadata validation passes, set connections {enabled, vaultVerifiedAt, providers} with the actual validation dates and redeploy. No inference request is made.
   - Rollback: Set connections.enabled false and redeploy. Revoke the provider key at the provider if it should stop working.
   - Proof to record: The serving revision, the credential form's save request and response status, and the provider validation date (no key echoed).
19. **github-app-actions-write** (phase 104, github-app, owner attends). Owner approves GitHub App Actions write on the selected project repository, for dispatching the registered typecheck worker (and, later, night retries).
   - Needs first: phase 102.
   - Rollback: Owner removes Actions write; jobs.enabled stays false.
   - Proof to record: A GitHub API read of the installation's permissions (actions: write) on the selected repository.
20. **migration-009** (phase 104, migration, owner attends). Apply 009-jobs.sql (job records, reservations and fences). It refuses to run once 013 owns job admission, so it must precede 010 and 013. Immediately run 023-late-rpc-names.sql before using this feature, then verify both keel_* and plates_* callers; repeat 023 after later replays.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep jobs.enabled false; never replay 009 after 013.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-jobs-hosted-proof.sql's result (the role denials and a service-role admission exercise) and its two-connection lane and weekly-minute reservation race.
21. **typecheck-worker** (phase 104, worker, owner attends). Register the typecheck worker: the approved project carries the reviewed workflow, bridge and runtime at their paths; workers/<project>.json in the private workspace pins their blobs, disabled; the PLATES_WEB_ORIGIN repository variable names the HTTPS origin as the only callback; the project's weekly runtime allowance is written down.
   - Rollback: Set the registration's enabled false (or delete it through review) and remove the repository variable; the copied workflow keeps only its ordinary CI triggers.
   - Proof to record: The registration's commit in the private workspace, the blob identities read back from the project's default branch, and the repository variable read back.
22. **jobs-gate** (phase 104, env, owner attends). Set jobs {enabled: true, verifiedAt, restoreReconciledAt, weeklyMinutes, scheduleWrites: false} with dates from the recorded proofs and redeploy. Effects stay off until this step.
   - Needs first: phase 101.
   - Rollback: Set jobs.enabled false and redeploy. Running work is not cancelled by that: reconcile outstanding operations from their original receipts, never by redispatching.
   - Proof to record: The serving revision, and one reservation request's response status with its reserved minutes; no dispatch yet.
23. **schedule-writes** (phase 104, schedule, owner attends). For one existing workflow with a single literal UTC cron, owner approves Contents and Workflows write, its schedule budget and overlap, then scheduleWrites true. No schedule is added to a workflow that has none.
   - Needs first: phase 97.
   - Rollback: Set scheduleWrites false and redeploy. A committed cron change is undone by a reviewed revert that restores the exact prior bytes.
   - Proof to record: The cron change's commit with every unrelated byte unchanged, and the next scheduled run observed at the new time.
24. **migration-010** (phase 105, migration, owner attends). Apply 010-fleet-updates.sql (update preparation sharing the job lanes and charges) after 009. Immediately run 023-late-rpc-names.sql before using this feature, then verify both keel_* and plates_* callers; repeat 023 after later replays.
   - Needs first: phases 94, 104.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep fleetUpdates.enabled false; never replay 010 after 013.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-11-15-web-fleet-updates-after-rpc-names-proof.sql's result after 023 (the plates_* contract, the keel_* forwarders, the role denials and a service-role preparation exercise) and its two-connection race between an update preparation and an ordinary job on one lane.
25. **fleet-canary-choice** (phase 105, decision, owner attends). Owner selects one adopted canary project (Plates itself cannot stand in), the exact trusted build (commit, CLI and practice versions, bundle digest), the container image digest, platform and network policy, and the runtime allowance. Docker must be available for the isolated worker walk.
   - Rollback: No hosted change; fleet updates stay disabled.
   - Proof to record: The owner's dated selection, recorded in phase 105.
26. **github-app-canary-write** (phase 105, github-app, owner attends). Owner approves Workflows and Pull requests write (with Contents write) on the canary project only, for installing the pinned workflow and publishing the reviewed update PR.
   - Rollback: Owner removes those permissions from the canary repository; publishEnabled stays false.
   - Proof to record: A GitHub API read of the installation's permissions and selected repositories, sanitized.
27. **update-worker** (phase 105, worker, owner attends). Install the update-preparation workflow generated for the exact target in the canary project through its own review, and write update-workers/<project>.json and the shared job-budgets record in the private workspace.
   - Needs first: phase 104.
   - Rollback: Remove the workflow through a reviewed PR in the canary project and disable the registration. The workflow has no schedule, so nothing runs on its own.
   - Proof to record: The canary project's commit installing the workflow, and the registration's commit with its pinned blobs and image digest.
28. **fleet-updates-gate** (phase 105, env, owner attends). Set fleetUpdates {enabled: true, publishEnabled: false, target} and redeploy; prepare and review one canary. Turn publishEnabled true only for publishing that reviewed canary PR.
   - Needs first: phase 104.
   - Rollback: Set enabled and publishEnabled false and redeploy. An opened PR is closed, not merged; merge and rollback stay separate operations.
   - Proof to record: The serving revision, the preparation request's response status and its reviewed patch identity, and (after publish) the PR receipt.
29. **migration-011** (phase 106, migration, owner attends). Apply 011-model-routing.sql (model records, tasks and independent monetary accounting; no Actions minute authority). Immediately run 023-late-rpc-names.sql before using this feature, then verify both keel_* and plates_* callers; repeat 023 after later replays.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep modelRouting.enabled false.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-model-routing-hosted-proof.sql's result (the role denials and a service-role allowance exercise) and its two-connection allowance reservation race.
30. **model-allowance** (phase 106, decision, owner attends). Owner approves the provider credential already validated in 103, the exact source and retention policy, and a small monetary allowance for one bounded run and its saved-summary continuation. No subscription credential is copied.
   - Needs first: phase 103.
   - Rollback: No hosted change; model routing stays disabled.
   - Proof to record: The owner's dated approval with the allowance amount, recorded in phase 106.
31. **model-routing-gate** (phase 106, env, owner attends). Set modelRouting {enabled: true, verifiedAt, restoreReconciledAt, models} with dated model evidence and redeploy. It requires connections enabled with a verified OpenAI provider and the wrapping key.
   - Needs first: phases 101, 103, 104.
   - Rollback: Set modelRouting.enabled false and redeploy. A request already sent is not recalled and unknown usage is not refunded; keep its original receipt.
   - Proof to record: The serving revision, and a cost-check request's response status with the pinned quote; no generation request yet.
32. **migration-012** (phase 107, migration, owner attends). Apply 012-editor-drafts.sql (optional encrypted daily and model editor drafts; never an approval or a dispatch queue). Immediately run 023-late-rpc-names.sql before using this feature, then verify both keel_* and plates_* callers; repeat 023 after later replays.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep drafts.enabled false.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-editor-drafts-hosted-proof.sql's result (the role denials and a service-role draft exercise) and its two-connection draft CAS race.
33. **drafts-gate** (phase 107, env, owner attends). Set drafts {enabled: true, verifiedAt} and redeploy. Draft activation enables neither night action.
   - Rollback: Set drafts.enabled false and redeploy; saved drafts keep their explicit expiry.
   - Proof to record: The serving revision, and one draft save request with its response status and revision.
34. **migration-013** (phase 107, migration, owner attends). Apply 013-night-retries.sql after 010: native reruns and existing workers share one admission lock. From here on, 013 owns job admission. Immediately run 023-late-rpc-names.sql before using this feature, then verify both keel_* and plates_* callers; repeat 023 after later replays.
   - Needs first: phases 94, 105.
   - Rollback: A failure inside the transaction rolls back by itself; the migration refuses an ambiguous partial state. After commit, keep nightOperations off, and reapply 013 (never 009 or 010) if admission must be restored.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-11-15-web-night-retries-after-rpc-names-proof.sql's result after 023 (the canonical wrapper, role denials, saved 010 delegate and a service-role shared-lane exercise) and its hosted race between a night retry and an ordinary job on one lane.
35. **late-rpc-names-inspect** (phase 127, decision, owner attends). 023 was applied on 2026-11-16 and its hosted proof passed (phase 127 evidence). Do not treat it as pending. It is repeatable: run it again after any 005–013 replay, and once more to confirm its definitions and grants stay unchanged, which was not done on 2026-11-16. Never replay 014 as a repair.
   - Needs first: phase 94.
   - Rollback: Inspection does not change the database. If the hosted behavior fails, retain the original evidence, keep affected feature gates off and inspect the reported contract; do not undo an applied migration.
   - Proof to record: The applied version: file name and SHA-256 matched to source. docs/evidence/2026-11-15-web-late-rpc-names-hosted-proof.sql's result, with any absent-store notices, and, for the confirming run, unchanged pg_proc definitions and grants for each installed 005–013 pair.
36. **night-operations-gate** (phase 107, env, owner attends). Write the reviewed night-retries/<project>.json profile in the private workspace, then set nightOperations {retryEnabled, planWrites, verifiedAt, restoreReconciledAt, profiles} and redeploy. Retry needs Actions write and the jobs gate; plan writes need Contents write.
   - Needs first: phases 97, 101, 104.
   - Rollback: Set retryEnabled and planWrites false and redeploy. A retry already dispatched is reconciled from its original receipt, never sent again.
   - Proof to record: The serving revision, the profile's commit, and one retry preview request with its response status.
37. **main-build** (phase 153, env, owner attends). Deploy the reviewed main build as production from a clean source archive with the same configuration: it carries the name-compatibility readers 014 needs, plain-English decisions (153) and the push routes (152). Pin the prior deployment as the rollback target. Then the owner opens the newest health proposal on its decision page.
   - Rollback: Promote the pinned prior deployment; the configuration is unchanged, so nothing else moves.
   - Proof to record: The serving revision and Node version from /api/deployment, a signed-in Home request, and the newest health proposal's decision page request with its response status.
38. **fleet-trial-scope** (phase 108, decision, owner attends). Owner selects the fleet projects, participants and devices, the private evidence destination and the observation window for operating the fleet from the web.
   - Needs first: phases 101, 107.
   - Rollback: No hosted change.
   - Proof to record: The owner's dated selection, recorded privately per the fleet trial worksheet.
39. **migration-015** (phase 152, migration, owner attends). After the G7 activation steps, apply 015-push.sql (the plates_push schema: encrypted push subscriptions, the once-per-item notification ledger and plates_push_rpc), so the installed app can subscribe; until then the push routes answer a bounded 503.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, drop the plates_push schema; nothing else reads it, and the push routes return to their bounded 503.
   - Proof to record: The applied version: file name and SHA-256; docs/evidence/2026-10-31-web-push-hosted-proof.sql's result (the schema, its grants and the RPC run as the service role); the measured hosted schema size; one authenticated subscribe request and its response status.
40. **migration-016** (phase 154, migration, owner attends). After 014, and before deploying the build with phase 154, apply 016-long-sessions.sql: plates_web_rpc accepts session lifetimes up to 365 days (31,536,000 seconds) while attempts and versioned records keep eight hours, and keel_web_rpc keeps forwarding. The build before it never asks for more than thirty minutes, so 016 is safe under either build; the phase 154 build cannot sign anyone in until it is applied.
   - Needs first: phases 94, 127.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, nothing needs undoing: a rollback build never asks for more than thirty minutes, so the wider session bound goes unused until the phase 154 build is deployed again.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-long-sessions-hosted-proof.sql's result (grants unchanged, a synthetic 365-day session created and rolled back, longer attempts and records refused), and one sign-in on the deployed build with its session cookie's Max-Age.
41. **every-plate-listed** (phase 163, decision, owner attends). After deploying a build with phase 163, the owner opens Home: every manifest plate is listed, a plate the App cannot read says so with its fix, and a plate without the phases practice says its plan is not tracked here instead of listing phase errors.
   - Needs first: phase 151.
   - Rollback: Redeploy the previous build; access and project reads return to the earlier behaviour, and nothing was written.
   - Proof to record: The deployed revision, and the owner's answer recorded in docs/evidence/2026-11-02-workspace-reads-each-plate.md: which plates were listed, and which said unavailable or not tracked.
42. **draft-survives-update** (phase 164, decision, owner attends). After deploying a build with phase 164, the owner installs Plates on the phone, leaves a draft unsaved across the next deploy, and returns: the draft is still there and the page says a new version is ready instead of reloading.
   - Needs first: phase 152.
   - Rollback: Redeploy the previous build; the earlier worker replaces this one through the same upgrade path, and pages reload on a new shell as before.
   - Proof to record: The two deployed revisions, and the owner's answer recorded in docs/evidence/2026-11-02-app-update-unsaved-work.md: whether the draft was kept and the notice shown.
43. **immutable-assets-live** (phase 165, decision, owner attends). After deploying a build with phase 165, the conductor reads one digest asset's headers on the workspace with curl -sI (Cache-Control: public, max-age=31536000, immutable) and the owner reloads a signed-in page with the browser's network panel open: its assets come from cache.
   - Needs first: phase 152.
   - Rollback: Redeploy the previous build; logical asset paths never stopped answering, so open pages keep working.
   - Proof to record: The deployed revision, the curl -sI header lines, and the second load's cache column, recorded in docs/evidence/2026-11-02-cached-assets.md.
44. **family-look** (phase 168, decision, owner attends). After deploying a build with phase 168, the owner opens the workspace on a phone and a laptop, in light and dark through the new theme toggle, with Ledger beside it, and says whether plates and Ledger feel like one family while plates still reads as its own blue and white.
   - Needs first: phase 151.
   - Rollback: Redeploy the previous build; the theme choice is a per-device preference and nothing else was written.
   - Proof to record: The deployed revision and the owner answer (same family, too alike, or too different and where), recorded in docs/evidence/2026-11-02-blue-and-white-glass.md.
45. **home-calmer** (phase 169, decision, owner attends). After deploying a build with phase 169, the owner reads Home on a phone, top first and then one long scroll, and says whether it is calmer and still clear what needs them.
   - Needs first: phase 151.
   - Rollback: Redeploy the previous build; only styles and added class names changed, and nothing was written.
   - Proof to record: The deployed revision and the owner answer (better, or worse and where), recorded in docs/evidence/2026-11-02-home-design-layer.md.
46. **one-home-model** (phase 156, decision, owner attends). After deploying a build with phase 156, the owner opens the hosted home with the fleet authorized and plates home in a terminal side by side, and says whether each section and count matches and whether anything plates board showed is missing.
   - Needs first: phase 151.
   - Rollback: Redeploy the previous build; the hosted home only reads, and nothing was written.
   - Proof to record: The deployed revision and the owner answer (nothing missing, or what is missing), recorded in docs/evidence/2026-11-03-one-home-model.md.
47. **not-now-hosted-walk** (phase 173, decision, owner attends). 017 is recorded applied on 2026-11-04 by phase 173. Verify the current Not now behavior and retained proof; the owner’s phone walk remains. Do not reapply the migration.
   - Needs first: phase 94.
   - Rollback: Inspection does not change the database. If the hosted behavior fails, retain the original evidence, stop dependent activation and use the existing feature rollback; do not undo an applied migration.
   - Proof to record: The applied version: file name and SHA-256; docs/evidence/2026-11-03-web-not-now-hosted-proof.sql's result (the schema, its grants and the RPC run as the service role); one authenticated Not now answer and its response status, and the item counted as put off on Home.
48. **last-looked-hosted-walk** (phase 166, decision, owner attends). 018 is recorded applied on 2026-11-04 by phase 166. Verify the deployed Home view across two visits and record the owner’s phone check. Do not reapply the migration.
   - Needs first: phase 94.
   - Rollback: Inspection does not change the database. If the hosted behavior fails, retain the original evidence, stop dependent activation and use the existing feature rollback; do not undo an applied migration.
   - Proof to record: The applied version: file name and SHA-256; docs/evidence/2026-11-04-web-last-looked-hosted-proof.sql's result (the table, its grants and the RPC run as the service role); one authenticated Home load, then a second after thirty minutes, and Since you last looked naming the first visit's time.
49. **backlog-hosted-walk** (phase 184, decision, owner attends). 019 is recorded applied with hosted proof on 2026-11-07 in phase 184 and its evidence. Its corrected Next action retains the web event read-back. Write one event from the web and read it on /backlog/history; do not reapply the migration.
   - Needs first: phase 94.
   - Rollback: Inspection does not change the database. If the hosted behavior fails, retain the original evidence, stop dependent activation and use the existing feature rollback; do not undo an applied migration.
   - Proof to record: The applied version: file name and SHA-256; docs/evidence/2026-11-06-web-backlog-events-hosted-proof.sql's result (the table, its grants, the append-only trigger and the RPC run as the service role); one Not now answered on the deployed web, and its event read back as the service role, holding codes only.
50. **migration-020** (phase 181, migration, owner attends). After reviewing the exact migration and backup/restore boundary, apply the additive attach-stage fences to the existing decision operation journal. This does not enable a hosted route, mint a credential, claim a phase or start an agent.
   - Rollback: Keep hosted attach disabled and preserve all original staged operations and project reservations. Do not downgrade the RPC or drop stage columns while unresolved operations exist. Inspect original effects before any separately reviewed correction.
   - Proof to record: The applied version: file name and SHA-256, compared with source; run docs/evidence/2026-11-14-web-attach-stages-hosted-proof.sql and its two-connection race. Record role grants, single-winner stage acknowledgments, unchanged legacy calls and no residual proof rows. Local PGlite replay is not hosted concurrency verification.
51. **migration-021** (phase 181, migration, owner attends). After migration 020 and review of the exact source, add the narrow terminal outcome for a proven pre-ref-publication lost race. This preserves earlier effects and does not enable hosted attach or start an agent.
   - Rollback: Keep hosted attach disabled; preserve original operations, observations and reservations. Do not downgrade the RPC while staged or terminal attach outcomes exist. Inspect uncertain effects before separately reviewed repair.
   - Proof to record: The applied version: file name and SHA-256, compared with source; run docs/evidence/2026-11-14-web-attach-outcomes-hosted-proof.sql and its two-connection race. Record the terminal-refusal versus ref-begin CAS, retained evidence, existing grants/aliases and no residual proof rows. Local serial replay is not hosted concurrency proof.
52. **migration-022** (phase 166, migration, owner attends). Apply 022-waiting-sessions.sql (plates_home.device_keys: each owner device key's SHA-256, an opaque owner and device digest and a sealed name; plates_home.waiting_sessions: each device's newest sealed snapshot of its home sessions waiting on the owner; and plates_waiting_rpc) after the build with Sessions waiting on you, so a device can push and Home lists them. The build goes first and is safe without it: until 022 is applied Home's Sessions waiting on you row says they are not stored yet, the Devices page says the database needs 022, and a push is refused.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, drop the tables plates_home.waiting_sessions and plates_home.device_keys and the function public.plates_waiting_rpc(text,text,text,text,text,timestamptz); Home's row says waiting sessions are not stored and every device key stops working. Leave the plates_home schema: 017's Not now, 018's visits and 019's events live in it.
   - Proof to record: The applied version: file name and SHA-256; docs/evidence/2026-11-15-web-waiting-sessions-hosted-proof.sql's result (both tables, their grants and the RPC run as the service role); one device key made on the Devices page, one plates sessions push from the owner's Mac, and Home's Sessions waiting on you showing that Mac's waiting home sessions.
53. **answers-from-home** (phase 173, decision, owner attends). After deploying a build with phase 173 and applying migration 017, the owner answers one walk and one health proposal from Home on the phone and puts one item off with Not now, and says whether each landed.
   - Needs first: phase 151.
   - Rollback: Redeploy the previous build; each answer is an ordinary commit that can be reverted, and Not now rows are per owner and can be deleted.
   - Proof to record: The deployed revision, the commits the answers wrote, and the owner answer, recorded in docs/evidence/2026-11-03-every-item-answerable.md.
54. **review-session** (phase 174, decision, owner attends). After deploying a build with phases 173 and 174 and applying migration 017, the owner taps Start review on Home on the phone, goes through the items waiting, and says whether this is how they want to keep plates moving.
   - Needs first: phases 151, 173.
   - Rollback: Redeploy the previous build; each answer is an ordinary commit that can be reverted, and Not now rows are per owner and can be deleted.
   - Proof to record: The deployed revision, the commits the session wrote, and the owner answer (this is it, close but what, or not the right shape), recorded in docs/evidence/2026-11-03-review-session.md.
55. **backlog-look** (phase 178, decision, owner attends). After deploying a build with phase 178, the owner opens /backlog on the phone and the laptop, finds the one thing they would do first, and says whether its lane and reasons match how they choose.
   - Needs first: phase 166.
   - Rollback: Redeploy the previous build; /backlog is read-only and writes nothing, and Home only gains a link to it.
   - Proof to record: The deployed revision and the owner answer (found it and the reason was right, found it and the reason was wrong, or could not tell), recorded in docs/evidence/2026-11-05-backlog-lanes.md.
56. **agents-look** (phase 186, decision, owner attends). After deploying a build with phase 186, the owner opens the sidebar's Agents and Pending review and says whether they match what is running and what waits for review.
   - Needs first: phase 178.
   - Rollback: Redeploy the previous build; /agents is read-only and writes nothing.
   - Proof to record: The deployed revision and the owner answer (matches, something missing, or something wrong), recorded in docs/evidence/2026-11-06-agents.md.
57. **lane-session** (phase 180, decision, owner attends). After deploying a build with phase 180, the owner taps Start on the Yours lane, clears five items in one sitting, and says whether it was faster than before.
   - Needs first: phases 174, 178.
   - Rollback: Redeploy the previous build; each answer is an ordinary commit that can be reverted, and Not now rows are per owner.
   - Proof to record: The deployed revision and the owner answer (faster, same, or slower and where), recorded in docs/evidence/2026-11-06-lane-session.md.
58. **step-done-web** (phase 187, decision, owner attends). After deploying a build with phase 187, the owner opens Review on their phone, presses Done on a step with a one-line why, confirms, and says whether the step left Home.
   - Needs first: phases 173, 174.
   - Rollback: Redeploy the previous build; the mark is an ordinary commit to .plates/loose-ends.json that can be reverted.
   - Proof to record: The deployed revision and the owner answer (It worked, still listed, or asked to run something), recorded in docs/evidence/2026-11-06-hosted-answers.md.
59. **docket-notify** (phase 175, decision, owner attends). After deploying a build with phase 175 and adding quietHours (timeZone, from, to) to PLATES_WEB_CONFIG, the owner gets "N new for you" on the phone outside quiet hours, taps it, does the quick ones, and says whether it is fast enough.
   - Needs first: phases 151, 152, 174.
   - Rollback: Remove quietHours from PLATES_WEB_CONFIG: nothing is sent without it. Redeploying the previous build also stops it.
   - Proof to record: The deployed revision, the push delivery record, and the owner answer (fast enough, too many nudges, or too slow to get in), recorded in docs/evidence/2026-11-03-docket-order-and-notify.md.
60. **look-captures** (phase 172, decision, owner attends). With one design change pending, the owner runs npm run look, opens the printed folder, and reviews the change from its captures in light and dark at phone and laptop widths instead of opening the app; then says whether the captures are useful or not worth keeping.
   - Needs first: phase 171.
   - Rollback: Nothing to roll back: the script runs locally against fixture data, writes images only to a temporary folder outside the repo, and changes nothing deployed.
   - Proof to record: The owner's answer (useful, or not worth it), and which design change was reviewed, recorded in docs/evidence/2026-11-04-look-captured.md.
61. **local-host-walk** (phase 183, decision, owner attends). The owner lists local-host in a plate's backlog.routes, writes ~/.config/plates/local-hosts.json for one agent host on their machine, attaches one ready phase with plates home --attach <key> --route local-host --provider <p> --yes, and watches its card.
   - Needs first: phase 181.
   - Rollback: Remove local-host from backlog.routes and release the claim; nothing hosted changes.
   - Proof to record: The claim, the receipt, the host's session id, and the owner answer, recorded in docs/evidence/2026-11-06-local-host.md.
62. **github-app-pull-requests-write** (phase 176, github-app, owner attends). Owner grants the Plates GitHub App "Pull requests: Read and write" on the plates installation (with the Contents: Read and write already granted for decisions, which GitHub's merge endpoint requires) and Checks: Read, so a ready pull request's card can show its checks and Merge can be submitted. Merging also needs decisionWrites on; until both hold, Merge is listed unavailable with this reason.
   - Needs first: phase 97.
   - Rollback: Owner removes Pull requests write in the App's settings; Merge returns to unavailable with its reason, and nothing else changes.
   - Proof to record: A GitHub API read of the installation's permissions (pull_requests: write, contents: write, checks: read), sanitized.
63. **merge-from-docket** (phase 176, decision, owner attends). After deploying a build with phase 176 and the Pull requests write grant, the owner opens a review session on the phone, merges one ready pull request from its card, and says whether what was being merged was clear before the tap.
   - Needs first: phase 174.
   - Rollback: A merge is reverted with an ordinary revert PR; redeploying the previous build removes Merge from the card.
   - Proof to record: The deployed revision, the merged PR and its merge commit from the operation receipt, and the owner answer (merged, clear; merged, but unclear; or didn't trust it), recorded in phase 176's evidence.
64. **migration-024** (phase 194, migration, owner attends). Apply 024-channel-posts.sql (plates_home.channel_posts: each agent line's opaque owner, plate, session and device digests, its sealed text and the time it was posted; and plates_channel_rpc) after the build with plates say, so a device can post and the channel shows agents' lines. The build goes first and is safe without it: until 024 is applied each plate's channel says agents' lines could not be read, and plates say is refused. It needs 022's device keys.
   - Needs first: phase 166.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, drop the table plates_home.channel_posts and the function public.plates_channel_rpc(text,text,text,text,text,text,timestamptz); each plate's channel says agents' lines could not be read and plates say is refused. Leave the plates_home schema and 022's device keys.
   - Proof to record: The applied version: file name and SHA-256; docs/evidence/2026-11-16-web-channel-posts-hosted-proof.sql's result (the table, its grants and the RPC run as the service role); one plates say from the owner's Mac, and that line on the plate's Channel.

## Still open

- The first encrypted backup was verified on 2026-10-31; the nightly schedule and second key copy remain. The provider upgrade was deferred. Inspect current backup freshness before new migrations.
- Existing hosted proof SQL covers 005–016 and the later feature migrations; its comments assuming contiguous prior migrations are prerequisites, not evidence that those migrations ran. Repair 023 has local PGlite coverage and docs/evidence/2026-11-15-web-late-rpc-names-hosted-proof.sql, not a recorded hosted application. PGlite cannot establish real Supabase grants, pooling, lock waits or applied file hashes.
- Connections (103) are optional. Declining them skips their steps and model routing (106), and the plan records that choice rather than a gap.
- G9's owner-facing pieces (phases 144, 145, 150) are planned, so they have no step yet; a step for an unbuilt phase is refused.
- Historical conflict: phase 127 recorded 014 applied, while phase 151 left 005–013 pending; phase 151 now directs inspection of the installed RPCs. Current 014 cannot produce that sequence. The synthetic retained-state test models core aliases without optional stores and separately proves the literal sequence fails; it does not reconstruct unknown production bytes. Phase 184’s 019 Next action now asks for the outstanding web event read-back, consistent with its dated application evidence. Phases 152 and 154 leave 015 and 016 pending; phase 181 explicitly keeps 020 and 021 unapplied.
