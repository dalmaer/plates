# Plates build or adopt evaluation

Decision memo for Dion Almaer  |  October 30, 2026

Recommendation: retain a small Plates management and learning layer while qualifying an existing orchestration backend. Gas City and OpenHands deserve the first comparison. Herdr alone is not a replacement for the full system you described.

## The product we are evaluating

One person, or several people, should be able to run a set of projects that keep working, recover safely, preserve project lessons, and improve through a shared coordinating brain. Humans must be able to talk directly to workers and the coordinator, collaborate through issues, pull requests and group chat, and see the whole system in a web Mission Control.

The important distinction is between keeping an agent process alive and preserving an accountable outcome. Restarting a worker is not enough if it creates a second PR, spends another person’s quota, repeats a rejected action, or loses the lesson from a failure.

## Decision for now

- Do not replace Plates wholesale with Herdr or commit to a backend yet. Herdr is strongest at interactive session and runtime machinery.

- Stop expanding bespoke runtime infrastructure until the closest alternatives pass the same recovery, authority, accounting and learning tests as Plates.

- Keep the local work already built and tested. Treat it as reusable product logic, not a reason to protect the current architecture.

- Evaluate Gas City for a composable substrate and OpenHands for a more complete coding platform. Use Gas Town as the opinionated full-system baseline.

## What the evidence establishes

This memo combines current official documentation and selected source inspection with a separate audit of the Plates repository and its local consolidation branch. External frameworks have not been installed or benchmarked. Published main-branch code may differ from installable releases. A documented capability is not a passed operational test.

No framework adoption, deployment, credential grant, live migration or paid agent trial was performed for this evaluation.

## Candidate comparison

The matrix describes inspected capabilities and limits, not numerical scores. “Not established” means the reviewed evidence did not demonstrate the requirement.

| Candidate | Useful existing capability | Material gap for this vision |
| --- | --- | --- |
| Herdr | Interactive agents, terminals, SSH machines, parent and child communication; open runtime API. | Not a task and effect ledger. Core trusts the host user and is not a permission broker. No governed shared learning loop established. |
| Gas City | Configurable roles, sessions, work records, formulas, reconciliation, REST and event APIs, group and external messaging surfaces. | Some dedupe is process-local; chat delivery has documented gaps. Per-person funding and governed lesson promotion not established. |
| OpenHands | Canvas and conversations, automation scheduler, subagents, Software Factory roles, project and user memory, cloud team controls. | Local shared key maps to one admin identity. Shared learning governance and exact external-effect recovery still need proof. |
| Gas Town | Mayor and workers, durable work tracking, watchdog roles, merge queue, web dashboard and stored memory. | Opinionated operating model. Durable step detail depends on configuration; shared host authority is not multi-tenant isolation. |
| Symphony | Issue-driven isolated workspaces, bounded concurrency, retry and reconciliation, repository-owned workflow. | Intentionally not a general workflow or multi-tenant control plane. No complete Mission Control or learning plane established. |

### Where the shortlist changes the plan

Gas City is closer to a configurable foundation for Plates than bare Herdr. It already exposes agent interaction, pending decisions and messaging primitives. OpenHands covers more of the finished coding experience, making it a serious partial replacement rather than just another worker backend. Gas Town is worth adopting only if its operating model fits without rebuilding Plates on top of every concept. [S2–S4]

### An important Herdr compatibility distinction

The new native Herdr app and herdr-core are separate from the original TUI runtime. Gas City’s documented Herdr provider targets the original runtime, has version-specific compatibility limits, and must not be assumed to support new herdr-core. Pin the actual combination before a trial. [S1, S2]

## What Plates has and what remains

### Existing foundations

Audited main revision 0165c290 contains bounded scheduled care, durable operation identity and recovery, policy and evidence records, and reviewed lesson workflows. Uncertain execution deliberately stops rather than guessing that a worker died. These are valuable safety properties, but not continuous autonomous recovery. No universal completion-to-learning hook was found.

### New local consolidation work

The unpublished branch adds project-set views within the existing UI, bounded routine readers, full task and PR usage accounting, private-learning foundations and explicit funding ownership with original-payer continuity. A read-only import preview does not activate migration or cutover.

Personal recommendations are a foundation, not a usable live chooser: the service deliberately withholds choices until trusted policy-selection context is integrated. Funding still lacks complete HTTP wiring and usable enrollment/selection. These are implementation gaps, not merely missing credentials.

### The gaps are substantial

Direct agent conversations, a conversational coordinator, group chat and complete live Mission Control remain missing. The project stream route returns HTTP 501. Long-lived execution needs a revocable delegation model; current worker authority depends on the initiating owner’s valid session.

Project and shared lessons already have reviewed promotion, distillation and distribution. Reliable outcome capture, runtime retrieval and measured promotion/rollback as one loop remain unfinished. Phases 137–139 are partial; 140–141 remain designed. Work is paused at a safe local checkpoint for the adoption decision.

### What was actually tested

Code b48b3a6d passed 3,897 tests, zero failures and four opt-in Docker skips. Typecheck, installed-package checks and independent reviews passed. Documentation-only commit 037e13b4 followed; its checks covered 44 tests and 59 links.

These results concern local implementation, not deployment, a live multi-user trial or external-framework compatibility. The clean branch remains unpublished.

### Implication for the decision

Keep the policy, evidence, original-operation identity, funding and reviewed-learning contracts, but require the complete system to pass the same end-to-end scenarios as every candidate. Existing stores and tests do not excuse the missing connections.

### Repository evidence

Evidence at the audited revisions: lib/web/jobs.mjs, job-worker.mjs, auth.mjs, funding.mjs and recommendation-service.mjs; lib/learn.mjs, distill.mjs and agent-quality-usage.mjs. Validation: docs/evidence/2026-10-30-consolidation-authorization-checkpoint.md. These are repository-local references, not published links.

## The architecture worth keeping

Plates should own durable product identities and policy. A qualified backend should own agent execution mechanics. Start with one backend; a universal adapter layer before a working integration would add another system to maintain.

| Plates responsibility | Backend responsibility |
| --- | --- |
| Person, set, project, task, PR and attempt identities; provenance of every command. | Start, observe, interrupt and reconnect to supported agent sessions. |
| Durable command and effect records, approvals, dedupe, reconciliation and audit. | Worker lifecycle, execution environment and runtime-specific recovery signals. |
| Personal funding, reservations, quota freshness, usage reconciliation and routing policy. | Provider-specific usage and capacity observations, with explicit unknown states. |
| Project lessons, evidence, promotion rules, shared versions and rollback. | Supply execution evidence and consume approved context. |
| Web Mission Control and human collaboration across GitHub and group chat. | Expose stable events, interactions and control APIs without bypassing policy. |

### A learning loop with evidence

Every completed or interrupted attempt should persist an outcome record and an explicit learning status: pending, captured, or no useful lesson. A run that yields no new lesson still needs a durable record. A candidate lesson needs its source, scope and evidence. Validate it within the project, then optionally promote an approved version into shared learning. Record where it was applied and whether outcomes improved; allow revocation and rollback. Private user memory must remain separate.

“Always save lessons” should therefore mean reliable outcome capture plus an explicit lesson decision, not forcing an agent to invent a lesson after every run. Agent-authored memory is evidence to evaluate, not automatically trusted policy.

### Mission Control and risk

Show project health, active agents, coordinator decisions, conversation provenance, waiting approvals, recovery state, spending and lesson lineage from one event history. Let a human address a worker or the coordinator, pause work, reject a proposed effect, or revise goals. Group-chat messages must retain authenticated author and thread identity; a quoted instruction or agent message cannot grant human authority.

Risk rules need versioned policy and enforceable tool boundaries. Transparency means authorized users can inspect decisions and evidence; it does not mean exposing private credentials, personal quota details or every private conversation to all collaborators.

## Qualification scenarios

Use the same two disposable projects and fixed task fixtures for each finalist. Start with mocked providers and read-only replay; only then run a separately authorized, budgeted live trial. Capture exact backend versions, configuration, events, side effects and costs.

| Scenario | Pass condition |
| --- | --- |
| Crash during a PR write | Worker, orchestrator and host restart preserve task identity. Reconciliation avoids a second PR or comment; no automatic duplicate merge. |
| Replay issue and chat inputs | Duplicate provider events and group-chat commands create one authorized command and effect. Original actor and thread remain traceable. |
| Human talks to worker and coordinator | Both remain addressable. Conflicting instructions are visible and resolved by explicit authority, not silent last-writer wins. |
| Quota expires or a user is revoked | Admission checks fresh capacity and authority. No unapproved switch to another person’s account; safe recovery remains possible. |
| A bad lesson is proposed | It stays project-scoped until validated. Shared rollout has provenance, versioning and a demonstrable rollback. |
| A good lesson is promoted | A second project consumes the approved version; its effect can be measured and reversed. |
| UI or chat transport disconnects | Catch-up reconstructs state and marks stale views. Failed outbound messages are observable and recover without duplicate effects. |
| Malicious content claims approval | Issue, PR and chat text cannot forge identity, change risk policy or access another user’s secrets. |
| Usage spans a complete PR | Planning, coding, review, retries and failures reconcile across attempts. Cache semantics, allocations and unknown usage remain explicit. |

### Decision rule

Adopt the candidate that satisfies the required lifecycle with the least custom code and clearest operational boundary. Reject an integration that needs a second scheduler, parallel authority model or fragile transcript parsing to make its core promises true. A successful process restart alone is not success.

## Evidence and qualification limits

The following are the principal official sources reviewed for the alternatives. These links support the specific distinctions above; they are not certificates of production readiness. Sources were checked October 30, 2026.

### S1 Herdr

[App and core overview](https://herdr.dev/)  ·  [Core architecture](https://herdr.dev/core/)  ·  [Core security boundary](https://github.com/herdrdev/herdr-core/blob/master/docs/security.md)

Core is explicitly not a sandbox or permission broker. Recovery differs between products and restart types.

### S2 Gas City

[Repository](https://github.com/gastownhall/gascity)  ·  [API](https://raw.githubusercontent.com/gastownhall/gascity/main/docs/reference/api.md)  ·  [Connected clients](https://raw.githubusercontent.com/gastownhall/gascity/main/docs/guides/connected-clients.md)  ·  [Server implementation](https://raw.githubusercontent.com/gastownhall/gascity/main/internal/api/server.go)  ·  [Herdr provider](https://raw.githubusercontent.com/gastownhall/gascity/main/docs/reference/herdr-provider.md)  ·  [Trust boundaries](https://raw.githubusercontent.com/gastownhall/gascity/main/docs/reference/trust-boundaries.md)

Inbound transcript dedupe does not prevent every duplicate agent notification. Outbound failures lack automatic retry; adapters must be re-registered after restart. Some response and webhook caches are process-lifetime.

### S3 OpenHands

[Architecture](https://docs.openhands.dev/openhands/usage/agent-canvas/architecture)  ·  [Software Factory](https://docs.openhands.dev/openhands/usage/use-cases/software-factory)  ·  [Persistent memory](https://docs.openhands.dev/sdk/guides/persistent-memory)  ·  [Local authentication](https://raw.githubusercontent.com/OpenHands/automation/main/openhands/automation/auth.py)  ·  [Organization budgets](https://docs.openhands.dev/openhands/usage/cloud/organizations/budgets)  ·  [Security](https://docs.openhands.dev/sdk/guides/security)

Project and user memories exist but are unverified hints. Local shared-key identity differs from cloud team identity. Risk analyzers are not a substitute for enforcement.

### S4 Gas Town

[Repository](https://github.com/gastownhall/gastown)  ·  [Molecule checkpoints](https://github.com/gastownhall/gastown/blob/main/docs/concepts/molecules.md)  ·  [Memory implementation](https://raw.githubusercontent.com/gastownhall/gastown/main/internal/cmd/remember.go)  ·  [Security](https://raw.githubusercontent.com/gastownhall/gastown/main/SECURITY.md)

Persistent work and memory are real capabilities. They do not themselves prove per-effect recovery, governed learning or multi-user isolation.

### S5 Symphony

[Specification](https://github.com/openai/symphony/blob/main/SPEC.md)  ·  [Orchestrator implementation](https://raw.githubusercontent.com/openai/symphony/main/elixir/lib/symphony_elixir/orchestrator.ex)

Scope deliberately excludes a multi-tenant control plane. Retry and claim state in the inspected orchestrator are in memory.

Remaining qualification: pin installable versions; verify licensing of the chosen packages and deployment; exercise recovery and security boundaries; measure live usage, overspend limits and maintenance cost. No external-framework live benchmark or penetration test has been run.
