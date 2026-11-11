# Plates feature proposal: from agent activity to accepted outcomes

November 10, 2026 | Prepared by ChatGPT, OpenAI assistant | Proposal for review, not implementation or spending approval.

## Recommendation

Build a small number of complete workflows rather than another layer of orchestration. Plates should let an owner give work to an agent, see what is actually happening, inspect the result, make a well-informed decision, and improve the next attempt from measured outcomes.

The six requests below form two parallel tracks. The delivery track completes delegation, live feedback and owner decisions. The learning track makes real comparisons and tested lesson promotion usable. Evaluation gates automatic learning and wider autonomy; it should not block useful preview and review improvements.

Priority order: P0 — reliable delegation and live Agent Lab. P1 — preview-to-fix, goal workspace and progress-aware Night Watch. P2 — reusable factory recipes. These are proposal IDs FR-01–FR-06, not new Plates phase numbers or filed GitHub issues.

## Starting point: extend what exists

The inspected roadmap reports 72 of 180 phases built and 77 real-world walks owed. That is a delivery gap worth addressing, not a reason to create 20 more partially connected features. This proposal uses repository documentation at a9041c04196fe06a7203bf2fd98c33fb9f68f58c; it is not a fresh runtime audit. [S1]

Phase 181 already has previewed, create-only claims, a durable handoff journal and a CLI session route. Its hosted attach, robot integration and tonight route remain unfinished; preparing a /spin brief is not proof of a running agent. Phase 183 has a private local-host command adapter and state reporting, but hosted dispatch to it is explicitly out of scope and its real-host acceptance walk is still owed. [S2–S3]

The evaluation work is also an extension, not a new framework. Phase 122 has merged offline screening and immutable reports; real screening still needs phase 119's live orchestration and an approved measured cohort. The recent research records phases 120–121 as built and 119/122/123 as partial. [S4, S5]

Keep Plates responsible for work identity, policy, approvals, evidence, funding and learning. Reuse or qualify a backend for execution mechanics. This follows the earlier build-or-adopt memo's recommendation to compare existing backends rather than expand bespoke runtime infrastructure. Do not assume that memo's October 30 local-branch gaps are still current. [S6]

## FR-01 — Reliable delegation: hand work to an agent and trust its lifecycle

Priority: P0. Type: complete and harden existing work. Primary fit: phases 181 and 183, existing owner writers, operation journal and execution qualification.

User outcome: From the owner docket, choose a ready task, see the execution plan and allowance, start it once, and follow it through review without opening a terminal or reconstructing its status from logs.

First slice: One project, one supported provider, one already available execution environment, and one task-to-reviewed-result path. Reuse the current claim and journal. Integrate one qualified runtime; do not build a universal adapter platform first. Hosted-to-local dispatch is a separately reviewed connector boundary, not a capability the existing local adapter already provides.

The task card should distinguish queued, claimed, starting, running, waiting for a person, waiting for a provider, verifying, ready for review, failed, cancelled and outcome unknown. Execution state and delivery state remain separate: an agent finishing does not establish that work was accepted, merged or deployed. Display the last authoritative update and warn when observation is stale.

Done when: Two simultaneous starts produce one winning claim and one dispatch. A lost response after dispatch is reconciled against the original operation before any retry. Reconnecting the dashboard restores the same attempt. Closing a viewer does not kill its worker. Cancellation stays requested until confirmed, and an ambiguous external effect remains unknown. A real task reaches review through the actual hosted writer and supported executor, not only fake adapters.

Runtime admission must verify the delivered instruction digest, actor-bound claim, execution authority and supported observe/cancel/recovery capabilities. Use revocable, operation-scoped delegation; never reinterpret expired user sessions or High risk tolerance as broader permission.

Measure: owner interventions per accepted task, dispatch-to-first-real-work latency, duplicate starts, unresolved outcomes and recovery time. Recoverability must not mean indiscriminate automatic retries.

Inspiration: Beads/Gas City's work identity, lifecycle and recovery lessons; portable runtime contracts from OpenCode/Pi. Their individual mechanisms are reference patterns, not evidence that any external backend already meets Plates' contract. [S5]

## FR-02 — Agent Lab: compare real configurations and promote only tested lessons

Priority: P0, parallel with FR-01. Type: finish the existing evaluation and reviewed-learning path. Primary fit: phases 119–123 and existing attempt/lesson records.

User outcome: Answer specific questions such as whether a review lesson catches more genuine defects, whether a cheaper model handles a task class safely, or whether retrieval improves a run more than another agent does.

First slice: Complete one narrow historical-lesson comparison using the existing frozen screening plan and exact provider/spend quote. Phase 122 already calls for five target pairs and five control pairs. Treat this as initial screening, not a statistically decisive general leaderboard. Preserve the option to conclude inconclusive. [S4]

Freeze the repository snapshot, task, harness and instruction versions, tool permissions, environment, acceptance rubric and budget. Isolate mutable dependencies, caches, databases, ports and artifact directories. Randomize or alternate run order and repeat enough cases to quantify uncertainty. Separate harness comparisons using the same model from model comparisons using the same harness.

Score independently accepted results, escaped defects, false-positive reviews, human repair time, end-to-end latency and total cost including failed attempts. Show actual, estimated and unknown costs separately. Preserve expected/executed/skipped test counts and missing observations; do not hide failed executions by reporting only successful trials.

Test skill activation separately from effectiveness. A skill may help when forced into context yet rarely be selected naturally, or activate on unrelated work and make it worse. Tessl explicitly separates these measurements. Factory's Agent Factory similarly tests harness changes across affected model families before engineers decide what ships. [S7–S9]

The learning path is: outcome → proposed lesson → controlled comparison → independent/held-out check → scoped promotion → monitored rollback. Keep lessons scoped to the project, task type and model versions actually tested. The proposing agent cannot silently rewrite its own acceptance rubric or promote its preferred result.

Done when: An intentionally broken candidate loses, shared-state contamination is detected, a no-run trial is not a success, and one authorized real comparison produces an immutable report. A rejection or inconclusive result counts as an evaluator success. Promotion requires evidence and the existing approval policy; one small win does not authorize fleet-wide deployment.

Measure: cost per accepted outcome and owner minutes saved, with correctness held constant. Report cohort sizes and uncertainty. No numerical improvement is promised in advance.

Early experiments should include read-only scripted CI inspection versus individual tool calls, single-agent execution versus improved retrieval versus multiple agents, and a narrowly scoped review lesson. Programmatic tool calling is a candidate optimization, not a reason to replace the harness. [S9]

## FR-03 — Preview → annotate → verified fix

Priority: P1; highest immediate product payoff. Type: a new end-to-end workflow built on existing tasks, runs and owner review.

User outcome: Open an agent's working application on a phone, point to the problem, describe the expected behavior, and receive a corrected preview with evidence. No copying screenshots between chat, terminals and GitHub.

First slice: One staged Plates page or isocan feature, one authenticated preview, and one feedback-to-follow-up cycle. Use an existing runner or preview provider. The first preview uses isolated test data, not production credentials or arbitrary local services.

Attach each preview to its task, attempt, source snapshot and environment. For uncommitted work, record a working-tree content digest rather than pretending a commit SHA describes all visible bytes. Capture URL/route, viewport, screenshot, selected element or coordinates, reproduction steps and expected behavior with the annotation. The screenshot is evidence, not an automated verdict of correctness.

Submitting feedback creates or updates a linked work item. The agent makes a change, runs the relevant checks, and returns a new preview. The owner review packet shows before/after evidence and unresolved acceptance items. Approval binds to the reviewed version; a new snapshot requires re-review of affected claims.

Done when: An owner completes a real phone-based review cycle; revoked or expired preview access is denied; old previews are visibly stale; duplicate submissions do not create duplicate work; a changed snapshot cannot inherit an old approval; and a successful test run does not silently mark manual acceptance complete. Annotation authorizes a request, not merge, deployment or higher spending.

Measure: time from reported defect to accepted fix, owner interactions, reproducibility of reported issues, and the number of acceptance walks actually resolved rather than administratively closed.

Inspiration: Amp's November 9 local-runner Portals and November 6 Close the Loop. Combine remote inspection with the rest of Plates' evidence and decision path; do not build a new hosting platform. [S10–S11]

## FR-04 — Goal workspace with decision-ready reviews

Priority: P1. Type: connect and extend existing goal grouping, backlog, agent presence, decision context and owner docket.

User outcome: Give Plates an outcome such as “make Ledger's receipt flow usable on mobile,” then discuss that goal in one place while agents carry out its existing phases and tasks.

First slice: One goal, one coordinating conversation and a small number of workers. The coordinator proposes decomposition, reads authoritative work state, answers what changed, and routes decisions through existing writers. Existing goals, phases, task IDs and PRs remain the source of truth. This is the product surface for consolidation, not another Switchboard beside Plates.

The workspace shows the goal and acceptance criteria, current plan, child work, previews, costs, blockers, decisions and evidence. Allow an owner to talk to an individual worker without confusing that worker's authority with the coordinator's. Keep requester, operator, approver and payer separate, especially for future multi-user use.

Replace vague “needs attention” cards with a decision packet: the exact question; recommended action and alternatives; evidence; scope and consequences; budget impact; and what the decision will unblock. Human edits to a plan create a new version, with explicit reconciliation against running work. A conversational suggestion is not an approval receipt.

Done when: The owner can explain a goal's current state without opening multiple transcripts. A coordinator restart does not invent tasks or lose decisions. All visible child work maps to canonical work IDs. Partial project reads appear incomplete, not empty. Concurrent approval attempts produce one accepted action; stale versions are refused and ambiguous remote results reconciled.

Measure: owner minutes per decision, decision wait time, reopened decisions and time from request to accepted outcome. Start with a useful review packet rather than a full collaborative document editor, video room or Slack replacement.

Inspiration: Amp Spaces provides a goal-level coordinating conversation. The important borrowing is coherent supervision, not unbounded agent spawning. [S12]

## FR-05 — Progress-aware Night Watch

Priority: P1, after FR-01's trustworthy observation and effect handling. Type: extend existing night plans, pause behavior, budgets and morning summaries; no new scheduler.

User outcome: Overnight work either advances, safely recovers, or stops with a precise explanation. A green workflow or a busy agent must not masquerade as useful progress.

First slice: Put a progress governor around one existing lane. Observe successful claims, execution milestones, produced evidence and acceptance movement. A heartbeat proves liveness, not progress. Conversely, a long reasoning or build step without a commit is not automatically a stall; use task-specific deadlines and corroborating signals.

Classify provider outages/rate limits, repeated claim failures, stale demand, repeated review findings, genuine execution stalls and human waits separately. Use bounded backoff and a single controlled probe after provider failures. Hold further starts when the lane is not claiming work. Permission denials must not trigger a provider switch that attempts to evade the same restriction.

Reserve allowances before dispatch and reconcile actual use afterward. Retry only when the prior effect is known and policy permits it. Unknown effects remain blocked for reconciliation. Paused projects stay visible; pausing suppresses routine activity but does not erase historical failures or authorize automatic resume outside the declared policy.

Done when: Simulated rate limits do not produce a spawn storm; stale demand does not duplicate claimed work; a real human wait survives restart; a silent provider does not become “completed”; and confirmed orphan children can be cleaned up without killing a sibling worker. On shared Macs, require process-start identity and trustworthy inventory before termination; incomplete inventory means no speculative kill.

The morning brief should separate accepted progress, produced-but-unverified work, stopped/failed work, and decisions needed. Report cost and evidence gaps alongside each outcome. Do not send repetitive unchanged alerts.

Measure: wasted-start cost, useful completions per budget, time stuck before detection, false stall alerts and actionable versus redundant notifications. Begin in observe-only mode, then enable only policy-approved recovery actions.

Inspiration: the recent Gas City stall, duplicate-start, lifecycle and orphan-cleanup findings, and Beads' identity and concurrency failure patterns. These are synthesized from the dated research, not newly benchmarked here. [S5]

## FR-06 — Versioned factory recipes

Priority: P2. Type: package a proven workflow; do not introduce another workflow engine.

User outcome: Enable a known, evaluated workflow on a project without repeatedly assembling prompts, policies and checks by hand.

First recipe: review → verified finding → bounded fix → independent re-review → owner decision. Later candidates include CI repair, dependency updates and release verification. Use the execution, evidence and decision machinery above; recipes add configuration and versioning, not duplicate ownership.

A recipe pins its trigger and deduplication key, inputs, instruction/skill versions, runtime requirements, permission envelope, budget, verifiers, retry and stop conditions, approval points and rollback version. Project-specific overrides must stay explicit. Pin executable dependencies and provenance rather than trusting a mutable skill name.

A paused recipe must not enqueue work. A duplicate webhook must not create a second attempt. Replay tests use the original event and version without repeating external side effects. Recipe updates should run in shadow mode before changing an active project's behavior.

Done when: Two projects use the same pinned recipe while retaining their own policies; a deliberately failing recipe is rejected; a duplicate trigger is harmless; and rollback restores the prior recipe for new attempts without rewriting historical evidence.

Measure: setup effort, accepted outcomes, human interventions and regressions per recipe version. Add per-role/model routing only after Agent Lab establishes a project-relevant benefit; choose the cheapest qualified configuration, not the cheapest model or a universal leaderboard winner.

Inspiration: Tessl's composed ticket/review/check workflows and versioned skill evaluations. Vendor productivity claims are not acceptance targets for Plates. [S7, S13]

## Shared acceptance contract, not six new infrastructure projects

Every request should reuse one evidence envelope: project/goal/task and original operation IDs; attempt and worker incarnation; source snapshot; recipe/instruction versions; permission and funding scope; expected versus observed execution; costs with provenance; artifacts; owner decisions; and delivery outcomes.

Keep task intent, runtime state and external-effect state distinct. Preserve append-only history and compacted operation identities. Do not promise exactly-once distributed execution: use preconditions and idempotency where supported, and reconciliation for uncertain effects. A missing receipt is unknown, not permission to retry.

Turn the Beads/Gas City lessons into a shared conformance suite: duplicate dispatch and stale claims; reconnect/replay gaps; wrong-store and wrong-actor effects; partial or truncated reads; permission and endpoint overrides; path/symlink confinement; lost evidence during cleanup; canary-secret leakage through logs/telemetry; skipped-test accounting; and process ownership. Do not create a separate feature epic for every upstream bug.

## Delivery order and decision gates

Slice A — One dependable task. Finish one supported handoff from the owner docket through execution and review, with durable receipts. Finish the actual acceptance walk. Reuse the current runtime where possible; qualify an alternative before expanding execution mechanics.

Slice B — One visible feedback loop. Attach a secure preview and one annotation-to-correction cycle to Slice A. Add the compact decision packet. This is the first meaningful product demonstration, not a simulated dashboard.

Parallel learning slice — One honest comparison. Complete the existing live-evaluation quote and one approved narrow comparison. Retain a negative or inconclusive result honestly. No paid runs are authorized by this proposal.

Slice C — One reliable unattended lane. Add progress observation to an existing night lane, exercise failure scenarios, then selectively enable already authorized recovery. Review one real morning brief.

Slice D — Package and scale. Add the richer goal coordinator and turn the proven path into one versioned recipe. Broaden providers, projects and autonomy only after the earlier slices demonstrate value.

Limit work in progress: one delivery slice plus the bounded evaluation track. Do not launch six parallel architectural initiatives.

## What to defer

Defer a new scheduler, task database, general agent runtime, hosting platform, feature-flag service, broad collaboration editor, voice-first interface and automatic fleet-wide skill optimization. Mac verification satellites and post-release outcome checks are useful later extensions when a concrete project needs them.

The older Nerd findings about run histories, human verdicts and lessons remain conceptual input. Recent Nerd source changes were not independently verified for this proposal, so no critical dependency or adoption recommendation rests on them.

## Success scorecard

Primary outcome: owner minutes per independently accepted change, with correctness not degraded. Track request-to-acceptance time, total cost per accepted outcome including failures, escaped defects/reverts, duplicate or unknown operations, acceptance-walk completion, and complete evidence coverage.

Collect a baseline before setting improvement thresholds. Security and identity invariants are pass/fail gates; quality, cost and latency are cohort-based comparisons. A small smoke test validates plumbing, not general model superiority.

Decision requested: endorse these priorities and the first narrow delivery slice. Implementation phase changes, GitHub issues, runtime adoption, credentials, spending, merging and deployment remain separate actions. The proposal itself changes none of them.

## Sources and evidence status

[S1] Plates roadmap, inspected at a9041c04196fe06a7203bf2fd98c33fb9f68f58c: https://github.com/dalmaer/plates/blob/a9041c04196fe06a7203bf2fd98c33fb9f68f58c/docs/ROADMAP.md

[S2] Phase 181 — attach an agent: https://github.com/dalmaer/plates/blob/a9041c04196fe06a7203bf2fd98c33fb9f68f58c/docs/phases/181-i-can-attach-an-agent-to-a-phase-and-see-it.md

[S3] Phase 183 — local agent host: https://github.com/dalmaer/plates/blob/a9041c04196fe06a7203bf2fd98c33fb9f68f58c/docs/phases/183-a-local-agent-host-can-take-a-phase.md

[S4] Phase 122 — lesson screening: https://github.com/dalmaer/plates/blob/a9041c04196fe06a7203bf2fd98c33fb9f68f58c/docs/phases/122-lesson-screening.md

[S5] Agent Hub Software Factories, dated research October 24–November 10, read with comments (none): https://docs.google.com/document/d/1JgMcbV2np-CcoYePYPsBqjCRa9IpiLXDiVsTxd0yL5I

[S6] Plates build or adopt evaluation.docx, October 30, 2026, existing Library decision memo. Historical architecture recommendation, not current proof of deployment or backend compatibility.

[S7] Tessl evaluation documentation: https://docs.tessl.io/improving-your-skills/evaluate-skill-quality-using-scenarios

[S8] Tessl skill optimizer, separate activation/content evaluation: https://tessl.io/registry/tessl/skill-optimizer/files/skills/optimize-skill-performance-and-instructions/SKILL.md

[S9] Factory, Droid 1.0 and Agent Factory, October 29: https://factory.com/news/frontier-harness

[S10] Amp, Portals on Your Runner, November 9: https://ampcode.com/news/runner-portals

[S11] Amp, Close the Loop, November 6: https://ampcode.com/news/close-the-loop

[S12] Amp, Spaces, November 6: https://ampcode.com/news/spaces

[S13] Tessl factory setup: https://tessl.io/registry/tessl/factory-setup/files/README.md

External product documentation was checked for the cited design ideas. Historical Beads/Gas City commit findings are retained research evidence, not independently executed tests. No vendor benchmark gains are assumed. All proposed metrics, behavior, sequencing and acceptance tests are recommendations, not delivered Plates capabilities.
