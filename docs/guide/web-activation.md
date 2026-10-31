# Activate the hosted web workspace

<!-- Generated from docs/specs/web-activation-plan.json by renderActivationGuide in lib/web/activation-plan.mjs. Edit the JSON, never this page; tests/web-activation-plan.test.mjs fails when it is stale, and rewrites it when run with PLATES_WRITE_ACTIVATION_GUIDE=1. -->

Every hosted step still needed to switch on what goal G7 has built and proven locally, in the order to run them in one owner-attended session. Read from phases 94–108 (status, note, Next action, Your part, Real surfaces), the web specs and guides they cite, and the migrations in lib/web/migrations. Nothing here has been run; this is the plan, not its proof.

The plan is data in [web-activation-plan.json](../specs/web-activation-plan.json), read on 2026-10-30, and belongs to [phase 151](../phases/151-the-hosted-workspace-is-the-owners-daily-driver.md). A step for a phase that is not built or partial is refused.

## How the session runs

- Run the steps in order. Stop at the first step whose proof does not hold, run that step's rollback, and record what was observed.
- The owner signs in to Vercel, Supabase and GitHub when a step needs it; the conductor runs the step and records its hosted proof. No credential is typed into chat, Git, a log or browser storage.
- A permission grant, a migration or a configuration date never enables a feature by itself: each feature has its own gate, and a gate's verified date is an operator assertion of a proof already recorded.
- Migrations run in file order, once, each in one transaction. A Git revert cannot undo a committed migration: rolling back means turning its feature's gate off and leaving the tables in place.
- After every configuration change, redeploy and compare the serving revision from /api/deployment with the deployment Vercel says receives production traffic.
- Walks (97–102, 104, 105, 107, 108) come after activation, from the workspace itself, on desktop and phone. They are the owner's, not steps of this plan.

## Already applied

- 001-auth.sql (phase 95): [evidence](../evidence/2026-10-21-web-auth-service.md)
- 002-home-cache.sql (phase 96): [evidence](../evidence/2026-10-21-web-home.md)
- 003-home-retry.sql (phase 96): [evidence](../evidence/2026-10-21-web-home.md)

## Steps

1. **runtime-exception-recheck** (phase 95, decision, owner attends). Re-check the 2026-10-22 hosted runtime exception before anything else. Signed in, read /api/deployment on a fresh production function and record the serving deployment and revision; that deployment is the rollback target for every later step. If the runtime is Node 24.22.1 or later, remove PLATES_HOSTED_RUNTIME_EXCEPTION from the replacement production deployment (the exception branch in lib/web/hosted-runtime.mjs is removed separately, through review). If it still reports 24.21.0, stop: the owner decides whether the exception still stands before any migration runs.
   - Rollback: Promote the pinned prior deployment in Vercel. Restore the opt-in value only if the runtime is exactly 24.21.0 and the owner keeps the dated exception.
   - Proof to record: The /api/deployment request and its response status, the Node version and revision it reports, the Vercel deployment ID receiving traffic, and the pinned rollback deployment ID.
2. **backup-destination** (phase 94, decision, owner attends). Owner chooses the independent backup and restore destination (phase 94's open decision), or records that private-data features are being switched on without one and accepts that risk. No paid backup resource is selected silently.
   - Rollback: No hosted change. If no destination is chosen, record the accepted risk; declining it keeps media, drafts and the connection vault off.
   - Proof to record: The owner's dated choice (destination and price, or the accepted risk) recorded in phase 94; for a destination, one snapshot time read back from it.
3. **migration-004** (phase 97, migration, owner attends). Apply 004-decision-operations.sql (encrypted decision previews and fenced durable operations) through the owner's Supabase SQL session, unchanged and atomically, then run the existing hosted proof SQL and a two-connection reservation race.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep decisionWrites false so nothing writes the new tables; dropping them needs a separately reviewed down-migration.
   - Proof to record: The applied version: file name and SHA-256 matched to source. The commit result, docs/evidence/2026-10-21-web-decisions-hosted-proof.sql's result and duration, the role denials and the concurrency outcome.
4. **github-app-contents-write** (phase 97, github-app, owner attends). Owner approves GitHub App Contents read and write on the selected private workspace repository and the selected project repositories. This is the grant decisions (97), walk acceptance (98), lesson copies (100), connection policy (103) and night plan writes (107) wait for; it enables none of them.
   - Rollback: Owner removes Contents write in the App's settings; every write gate stays false.
   - Proof to record: A GitHub API read of the installation's permissions (contents: write) and its selected repository list, sanitized.
5. **decision-writes-gate** (phase 97, env, owner attends). Deploy the verified revision with decisionWrites false and walk an exact decision preview; then set decisionWrites true in KEEL_WEB_CONFIG and redeploy. The same instance write setting gates walk acceptance (98).
   - Rollback: Set decisionWrites false and redeploy, or promote the pinned deployment. A source write already committed is undone only by its own reviewed revert.
   - Proof to record: The serving revision from /api/deployment, a decision preview request and its response status, and the configuration's decisionWrites value on that deployment.
6. **migration-005** (phase 98, migration, owner attends). Apply 005-walk-drafts.sql (private guided-walk drafts and observation histories) after 004, then run the existing hosted proof SQL.
   - Needs first: phases 94, 97.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, walk drafts are only read and written by the walk routes; leave the tables, and keep source submission behind decisionWrites.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-21-web-walks-hosted-proof.sql's result, the role denials and a two-connection draft revision race.
7. **capture-bucket** (phase 99, decision, owner attends). Owner approves, and creates in the existing Supabase project, a private keel-captures bucket with 90-day retention and a 256 MiB application cap. No paid upgrade and no public export.
   - Needs first: phase 94.
   - Rollback: Leave the bucket empty and private, and leave media out of the configuration. Deleting the bucket is a separate owner action; expiry never starts cleanup.
   - Proof to record: The bucket's private visibility read back from Supabase, with the approved retention and cap recorded in phase 99.
8. **migration-006** (phase 99, migration, owner attends). Apply 006-private-media.sql (ciphertext capture receipts and the attachment CAS).
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, leave media out of the configuration so no route writes receipts.
   - Proof to record: The applied version: file name and SHA-256. The commit result, and docs/evidence/2026-10-31-web-media-hosted-proof.sql's result: the role denials and a bounded receipt RPC call run as the service role.
9. **media-config** (phase 99, env, owner attends). Add media {bucket: keel-captures, retentionDays: 90, capacityBytes: 268435456} to KEEL_WEB_CONFIG and redeploy.
   - Rollback: Remove the media member and redeploy. Stored captures and their receipts are kept.
   - Proof to record: The serving revision, and one capture upload request whose receipt reaches the verified state, with its response status.
10. **workspace-writes-gate** (phase 100, env, owner attends). Set workspaceWrites true in KEEL_WEB_CONFIG and redeploy. It is the private workspace gate: copying one to three selected lessons here, and later connection policy edits (103), fleet update publication (105) and model policy (106). It needs Contents write on the private workspace repository and the 004 operation store.
   - Needs first: phase 97.
   - Rollback: Set workspaceWrites false and redeploy. Copied lesson files stay; the originals were never changed.
   - Proof to record: The serving revision, and a lesson-copy preview request against the pinned private workspace with its response status.
11. **restore-scope** (phase 101, decision, owner attends). Owner selects the isolated restore target, the projects and participants, and the observation window for the restore drill, and records that this instance has never been restored (so no recovery epoch is set). Execution gates later in this plan date their restore assertion from this step.
   - Needs first: phase 94.
   - Rollback: No hosted change. Without a selection, keep jobs, model routing and night operations off.
   - Proof to record: The owner's dated selection, recorded privately per the recovery guide, and the serving identity comparison from /api/deployment.
12. **github-app-actions-read** (phase 102, github-app, owner attends). Owner approves GitHub App Actions read on the selected project repositories, for routine definitions and run history. It grants no dispatch.
   - Rollback: Owner removes Actions read; the routine pages show the missing permission as a gap.
   - Proof to record: A GitHub API read of the installation's permissions (actions: read) and one workflow-run list request with its response status.
13. **migration-007** (phase 102, migration, owner attends). Apply 007-run-history.sql, the read-only history RPC over the 004 operation store. It has no recovery or purge.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. The function only reads; after commit, the history page can be hidden by redeploying the pinned deployment.
   - Proof to record: The applied version: file name and SHA-256. The commit result, and docs/evidence/2026-10-31-web-run-history-hosted-proof.sql's result: the role denials and one bounded actor-scoped history call.
14. **connections-choice** (phase 103, decision, owner attends). Owner decides whether to switch on the optional connection vault now, and which provider (OpenAI or Anthropic) to validate. Declining skips the connection steps and model routing (106), which needs them.
   - Rollback: No hosted change; connections stay disabled.
   - Proof to record: The owner's dated choice, recorded in phase 103.
15. **migration-008** (phase 103, migration, owner attends). Apply 008-connections.sql (runtime credential ciphertext; its RPC never returns ciphertext).
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep connections.enabled false so no credential is stored.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-connections-hosted-proof.sql's result (the role denials and a service-role CAS exercise) and its CAS rotation race between two connections.
16. **connection-wrapping-key** (phase 103, env, owner attends). Bind a separate production wrapping key as KEEL_CONNECTION_ENCRYPTION_KEY (32 bytes, base64, different from the session key) in Vercel's secret store, with a copy in the protected recovery location the backup decision chose. Redeploy.
   - Rollback: Keep connections.enabled false. Never remove or rotate the key while any credential ciphertext exists; removing Plates's copy of a credential does not revoke the provider key.
   - Proof to record: The serving revision, a startup that passes configuration validation, and the key's recovery-location reference (never the key).
17. **connections-gate** (phase 103, env, owner attends). After the owner enters the chosen provider credential in the workspace's own form and its live metadata validation passes, set connections {enabled, vaultVerifiedAt, providers} with the actual validation dates and redeploy. No inference request is made.
   - Rollback: Set connections.enabled false and redeploy. Revoke the provider key at the provider if it should stop working.
   - Proof to record: The serving revision, the credential form's save request and response status, and the provider validation date (no key echoed).
18. **github-app-actions-write** (phase 104, github-app, owner attends). Owner approves GitHub App Actions write on the selected project repository, for dispatching the registered typecheck worker (and, later, night retries).
   - Needs first: phase 102.
   - Rollback: Owner removes Actions write; jobs.enabled stays false.
   - Proof to record: A GitHub API read of the installation's permissions (actions: write) on the selected repository.
19. **migration-009** (phase 104, migration, owner attends). Apply 009-jobs.sql (job records, reservations and fences). It refuses to run once 013 owns job admission, so it must precede 010 and 013.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep jobs.enabled false; never replay 009 after 013.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-jobs-hosted-proof.sql's result (the role denials and a service-role admission exercise) and its two-connection lane and weekly-minute reservation race.
20. **typecheck-worker** (phase 104, worker, owner attends). Register the typecheck worker: the approved project carries the reviewed workflow, bridge and runtime at their paths; workers/<project>.json in the private workspace pins their blobs, disabled; the PLATES_WEB_ORIGIN repository variable names the HTTPS origin as the only callback; the project's weekly runtime allowance is written down.
   - Rollback: Set the registration's enabled false (or delete it through review) and remove the repository variable; the copied workflow keeps only its ordinary CI triggers.
   - Proof to record: The registration's commit in the private workspace, the blob identities read back from the project's default branch, and the repository variable read back.
21. **jobs-gate** (phase 104, env, owner attends). Set jobs {enabled: true, verifiedAt, restoreReconciledAt, weeklyMinutes, scheduleWrites: false} with dates from the recorded proofs and redeploy. Effects stay off until this step.
   - Needs first: phase 101.
   - Rollback: Set jobs.enabled false and redeploy. Running work is not cancelled by that: reconcile outstanding operations from their original receipts, never by redispatching.
   - Proof to record: The serving revision, and one reservation request's response status with its reserved minutes; no dispatch yet.
22. **schedule-writes** (phase 104, schedule, owner attends). For one existing workflow with a single literal UTC cron, owner approves Contents and Workflows write, its schedule budget and overlap, then scheduleWrites true. No schedule is added to a workflow that has none.
   - Needs first: phase 97.
   - Rollback: Set scheduleWrites false and redeploy. A committed cron change is undone by a reviewed revert that restores the exact prior bytes.
   - Proof to record: The cron change's commit with every unrelated byte unchanged, and the next scheduled run observed at the new time.
23. **migration-010** (phase 105, migration, owner attends). Apply 010-fleet-updates.sql (update preparation sharing the job lanes and charges) after 009.
   - Needs first: phases 94, 104.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep fleetUpdates.enabled false; never replay 010 after 013.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-fleet-updates-hosted-proof.sql's result (the role denials and a service-role preparation exercise) and its two-connection race between an update preparation and an ordinary job on one lane.
24. **fleet-canary-choice** (phase 105, decision, owner attends). Owner selects one adopted canary project (Plates itself cannot stand in), the exact trusted build (commit, CLI and practice versions, bundle digest), the container image digest, platform and network policy, and the runtime allowance. Docker must be available for the isolated worker walk.
   - Rollback: No hosted change; fleet updates stay disabled.
   - Proof to record: The owner's dated selection, recorded in phase 105.
25. **github-app-canary-write** (phase 105, github-app, owner attends). Owner approves Workflows and Pull requests write (with Contents write) on the canary project only, for installing the pinned workflow and publishing the reviewed update PR.
   - Rollback: Owner removes those permissions from the canary repository; publishEnabled stays false.
   - Proof to record: A GitHub API read of the installation's permissions and selected repositories, sanitized.
26. **update-worker** (phase 105, worker, owner attends). Install the update-preparation workflow generated for the exact target in the canary project through its own review, and write update-workers/<project>.json and the shared job-budgets record in the private workspace.
   - Needs first: phase 104.
   - Rollback: Remove the workflow through a reviewed PR in the canary project and disable the registration. The workflow has no schedule, so nothing runs on its own.
   - Proof to record: The canary project's commit installing the workflow, and the registration's commit with its pinned blobs and image digest.
27. **fleet-updates-gate** (phase 105, env, owner attends). Set fleetUpdates {enabled: true, publishEnabled: false, target} and redeploy; prepare and review one canary. Turn publishEnabled true only for publishing that reviewed canary PR.
   - Needs first: phase 104.
   - Rollback: Set enabled and publishEnabled false and redeploy. An opened PR is closed, not merged; merge and rollback stay separate operations.
   - Proof to record: The serving revision, the preparation request's response status and its reviewed patch identity, and (after publish) the PR receipt.
28. **migration-011** (phase 106, migration, owner attends). Apply 011-model-routing.sql (model records, tasks and independent monetary accounting; no Actions minute authority).
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep modelRouting.enabled false.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-model-routing-hosted-proof.sql's result (the role denials and a service-role allowance exercise) and its two-connection allowance reservation race.
29. **model-allowance** (phase 106, decision, owner attends). Owner approves the provider credential already validated in 103, the exact source and retention policy, and a small monetary allowance for one bounded run and its saved-summary continuation. No subscription credential is copied.
   - Needs first: phase 103.
   - Rollback: No hosted change; model routing stays disabled.
   - Proof to record: The owner's dated approval with the allowance amount, recorded in phase 106.
30. **model-routing-gate** (phase 106, env, owner attends). Set modelRouting {enabled: true, verifiedAt, restoreReconciledAt, models} with dated model evidence and redeploy. It requires connections enabled with a verified OpenAI provider and the wrapping key.
   - Needs first: phases 101, 103, 104.
   - Rollback: Set modelRouting.enabled false and redeploy. A request already sent is not recalled and unknown usage is not refunded; keep its original receipt.
   - Proof to record: The serving revision, and a cost-check request's response status with the pinned quote; no generation request yet.
31. **migration-012** (phase 107, migration, owner attends). Apply 012-editor-drafts.sql (optional encrypted daily and model editor drafts; never an approval or a dispatch queue).
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, keep drafts.enabled false.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-editor-drafts-hosted-proof.sql's result (the role denials and a service-role draft exercise) and its two-connection draft CAS race.
32. **drafts-gate** (phase 107, env, owner attends). Set drafts {enabled: true, verifiedAt} and redeploy. Draft activation enables neither night action.
   - Rollback: Set drafts.enabled false and redeploy; saved drafts keep their explicit expiry.
   - Proof to record: The serving revision, and one draft save request with its response status and revision.
33. **migration-013** (phase 107, migration, owner attends). Apply 013-night-retries.sql after 010: native reruns and existing workers share one admission lock. From here on, 013 owns job admission.
   - Needs first: phases 94, 105.
   - Rollback: A failure inside the transaction rolls back by itself; the migration refuses an ambiguous partial state. After commit, keep nightOperations off, and reapply 013 (never 009 or 010) if admission must be restored.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-night-retries-hosted-proof.sql's result (the role denials, the saved 010 delegate and a service-role shared-lane exercise) and its hosted race between a night retry and an ordinary job on one lane.
34. **night-operations-gate** (phase 107, env, owner attends). Write the reviewed night-retries/<project>.json profile in the private workspace, then set nightOperations {retryEnabled, planWrites, verifiedAt, restoreReconciledAt, profiles} and redeploy. Retry needs Actions write and the jobs gate; plan writes need Contents write.
   - Needs first: phases 97, 101, 104.
   - Rollback: Set retryEnabled and planWrites false and redeploy. A retry already dispatched is reconciled from its original receipt, never sent again.
   - Proof to record: The serving revision, the profile's commit, and one retry preview request with its response status.
35. **migration-014** (phase 127, migration, owner attends). Phase 127 (goal G2) owns this last migration in the folder; it is listed so the folder is complete. After the compatibility-reader baseline is deployed and pinned as the rollback target, apply 014-plates-names.sql (plates_* public RPC names, old names forwarding) and verify both callers. Its 20 held writer rows move only in a separate reviewed change.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, the old names keep forwarding, so the pinned compatibility baseline still serves; promote it if a caller fails.
   - Proof to record: The applied version: file name and SHA-256. The commit result, docs/evidence/2026-10-31-web-plates-names-hosted-proof.sql's result (grant and dependency impact, and one read through each old and new name), the measured hosted schema, and one request through each name with its response status.
36. **fleet-trial-scope** (phase 108, decision, owner attends). Owner selects the fleet projects, participants and devices, the private evidence destination and the observation window for operating the fleet from the web.
   - Needs first: phases 101, 107.
   - Rollback: No hosted change.
   - Proof to record: The owner's dated selection, recorded privately per the fleet trial worksheet.
37. **migration-015** (phase 152, migration, owner attends). After the G7 activation steps, apply 015-push.sql (the plates_push schema: encrypted push subscriptions, the once-per-item notification ledger and plates_push_rpc), so the installed app can subscribe; until then the push routes answer a bounded 503.
   - Needs first: phase 94.
   - Rollback: A failure inside the transaction rolls back by itself. After commit, drop the plates_push schema; nothing else reads it, and the push routes return to their bounded 503.
   - Proof to record: The applied version: file name and SHA-256; docs/evidence/2026-10-31-web-push-hosted-proof.sql's result (the schema, its grants and the RPC run as the service role); the measured hosted schema size; one authenticated subscribe request and its response status.

## Still open

- Backup destination (phase 94) is still the owner's choice; the second step asks it, and every migration waits for it.
- Hosted proof SQL exists for every migration step: 004 and 005 have theirs from phases 97–98, and 006–015 each have docs/evidence/2026-10-31-web-<topic>-hosted-proof.sql, which tests/web-hosted-proofs.test.mjs runs on PGlite after migrations 001..N. SQL cannot check the applied file's SHA-256, so each step still compares it with source. PGlite cannot stand in for Supabase's real roles, grants or connection pooling: there anon, authenticated and service_role are plain roles and each two-tab race replays serially on one connection, so the races' lock waits are first observed in the session.
- Connections (103) are optional. Declining them skips their steps and model routing (106), and the plan records that choice rather than a gap.
- G9's owner-facing pieces (phases 144, 145, 150) are planned, so they have no step yet; a step for an unbuilt phase is refused.
