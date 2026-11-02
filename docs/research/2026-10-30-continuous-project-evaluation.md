# Continuous projects, learning and Mission Control: repository evaluation

30 October 2026. Audited Plates main `0165c2902784073ba89dd717256ad233faf4865f`
and local consolidation code `8d36146fc38bd0a02ad16cae958deef91629b1d4`.
Reviewed validation corrections are included in the final verified code checkpoint
`b48b3a6dcbe700fae789f5a9865e80cfd4059c77`.
Switchboard remains at `a6651db5ff570eada8b04b2c4ffb993d8e67fbe9`; its runtime
has not moved. “On main” means code is present in that revision, not that a
hosted instance has enabled or exercised it. “Local” means unpublished branch
implementation, with synthetic proof and explicit integration gaps. See the
[checkpoint evidence](../evidence/2026-10-30-consolidation-authorization-checkpoint.md).
The earlier [consolidation specification](../specs/switchboard-consolidation.md)
contains the detailed Switchboard capability inventory and Plates-native migration plan.

## Assessment

Plates has substantial foundations for bounded project care, reviewed learning,
durable operation recovery and scoped management. It does **not** yet deliver
the complete requested product: projects that continuously recover, reliably
record outcomes, learn at project and set scope, and expose humans, agents and
their coordinator in one conversational Mission Control.

The valuable part to preserve is the connection between project practices,
policy, evidence, accepted decisions, funding and learning provenance. Generic
agent sessions, process supervision, reconnectable conversations and transport
are credible adoption targets. This source audit supports evaluating an external
execution/session engine below Plates; it does not establish that any particular
engine fits or that wholesale replacement is cheaper. The separate external
comparison must prove those contracts at pinned revisions.

The largest missing capability is a reliable loop across existing components,
not another lesson database or dashboard. A launch, a transcript and a memory
file do not by themselves prove recovery, safe learning or multi-person authority.

## Requested outcomes versus repository reality

| Outcome | On main | Added locally | Remaining gap |
| --- | --- | --- | --- |
| Projects keep receiving care | Daily night/climb, weekly tend/robot workflows; bounded jobs and concurrency | Sets aggregate existing routine history; bounded source observations | An unattended coordinator with durable delegation, reconciliation and explicit pause/escalation policy |
| Crashes recover without duplicate effects | Durable jobs, atomic reservations, begin fences, original-operation recovery, cancellation and restore quarantine | Personal payer continuity and observation replay protection | General agent-session recovery and end-to-end reconciliation; safe stopping is not automatic restart |
| Repairs remain bounded | Measured climb attempts, guarded issue-to-PR robot, reviewed night retries | Dormant consolidated routine policy | General routine executor/event/effect path; continuous autonomous repair policy and evidence |
| Every attempt leaves learning evidence | Explicit feedback, project lesson tables, reviewed proposal workflow | Explicit encrypted private capture, versioned usage/quality records | Mandatory durable outcome-to-learning linkage, crash-safe capture and coverage monitoring |
| Projects benefit from shared learning | Reviewed promotion, distillation, universal/stack-matching lesson distribution | Explicit redacted copies with frozen audiences | Runtime retrieval, effectiveness evaluation and controlled promotion/rollback as one loop |
| Talk to any agent and its coordinator | Issue comments can drive later robot runs; model selection and advisory planning exist | Private recommendation composition foundation, currently withholding choices | Persistent addressable agent conversations, conversational coordinator and intervention protocol |
| Humans and agents collaborate in group chat | Issues, PR comments, guarded implementation and other-provider review | No general conversation implementation | Threads, participants, delivery, membership/revocation, references to runs and explicit action authority |
| One web Mission Control | Home, project views, Daily, Learning, Routines, Activity, operations, connections/model policy | Set lens, observed history and private-learning integration in existing UI | Agent roster, live session/transcript projection, conversation UI, overall coordinator decisions and global stop semantics |
| Multiple people bring personal providers | Configured owner identities, repository authorization, private connections, shared project lanes | Funding store/admission, immutable original payer and same-pool contention | Complete HTTP/UI enrollment and selection; durable service delegation; subscription/organization adapters where supported |
| Risk, rules and transparent control | Exact preview/apply, source digests, scoped approval, narrowing model policy, cancel/reconcile | Stricter private sharing/reporting and dormant policy | Unified action-risk policy across chat, jobs and external sessions; auditable override and confirmed stop across engines |

Phases [137](../phases/137-a-project-set-shows-its-routines.md),
[138](../phases/138-people-bring-their-own-capacity-to-shared-work.md) and
[139](../phases/139-a-routine-has-one-plates-policy.md) remain partial.
[140](../phases/140-routines-run-with-accountable-effects.md) and
[141](../phases/141-a-routine-changes-owner-without-losing-work.md) remain designed.
No runtime activation, Switchboard cutover or retirement follows from this work.

## Execution and self-healing

[Jobs](../../lib/web/jobs.mjs), [job storage](../../lib/web/job-store.mjs) and
[workers](../../lib/web/job-worker.mjs) already enforce durable operation identity,
atomic workspace/project reservations and one active project lane. The worker is
a bounded, fixed-command adapter, with heartbeats and leases. An uncertain begin
or completion does not authorize another execution. Lost leases keep the lane
occupied until authoritative termination is established. Those are useful safety
properties, but they deliberately favor stopping over guessing that work died.

[Climb](../../practices/climb/files/scripts/plates/climb.mjs) supports measured
improvement with finite attempts; [robot](../../practices/climb/files/scripts/plates/robot.mjs)
binds approved issues to guarded work and review. Infrastructure failures before
substantive model work may retry on a later scan. Failures after model/judge work
generally require fresh writer action. Code PRs still require a person to merge.
[Phase 54](../phases/54-the-robot-an-agent-works-the-issues-it-is-handed.md) retains
real-run acceptance gaps; source availability is not proof of an operating fleet.

[Model-task receipts](../../lib/web/model-tasks.mjs) explicitly state that automatic
polling and wall-clock cancellation are not scheduled. Current worker authority
also depends on the initiating owner's valid session through
[resolveInitiator](../../lib/web/auth.mjs). A long-lived coordinator needs an
explicitly revocable delegation model, not removal of that check. No such general
delegation model is supplied by this consolidation checkpoint.

For this product, self-healing should mean detecting drift/failure, classifying
whether recovery is authorized, applying a bounded recovery or repair, recording
the result, and escalating on uncertainty or exhausted attempts. It should not
mean repeatedly restarting an unknown process or silently increasing authority.

## Learning that survives failure and improves decisions

Main already has [project lessons](../../practices/lessons/README.md),
[fingerprinted sending](../../lib/lessons.mjs),
[gather/propose/decide](../../lib/learn.mjs),
[distillation](../../lib/distill.mjs), and
[durable feedback](../../lib/feedback-service.mjs).
[Stack selection](../../lib/stacks.mjs) distributes universal and stack-matching
shared lessons into managed project guidance. Private promotion requires an
authored public excerpt. Distillation retains previous wording and refuses stale
proposals. These are strong ingredients for a reviewed, versioned shared brain.

They are not a universal completion hook. [Retro](../../lib/retro.mjs) produces a
worksheet without writing files. Climb's lessons lane prepares proposals without
changing the lesson table. No outcome-to-lesson call was found in the audited job,
worker, model-task, night-retry or robot completion paths. The local
[private-learning service](../../lib/web/private-learning.mjs) persists explicit
captures and copies; it does not automatically ingest runs, edit project lessons
or inject guidance into agent context. Quality observation remains opt-in.

“Always save lessons” therefore needs a precise acceptance contract: every attempt
has a durable outcome and a learning status such as pending, captured, explicitly
no useful lesson, or failed capture. Useful lessons should require evidence;
forcing a new lesson for every run would create noise. A durable outbox or an
equivalent recoverable link between completion and capture is a design candidate,
not code that exists today. Replayed capture must be idempotent and preserve
failed/abandoned attempts and missing telemetry.

Project learning and set-wide learning need separate reviewed promotion. Personal
originals stay private; shared copies carry explicit provenance and audience.
New set membership must not reveal old private copies. Applying guidance should
record the lesson revision and reason, allowing later comparison. Git history,
retained wording and private-copy revocation provide rollback ingredients, but
automatic evaluation, canaries and rollback of harmful learned guidance are not
implemented. Revocation cannot recall content already delivered.

## Conversations and Mission Control

Existing issue/PR workflows support human participation and agents producing or
reviewing work. [Robot issue handling](../../lib/robot-issue.mjs) preserves original
publication identities; [review](../../lib/review.mjs) works with review threads.
That is useful asynchronous collaboration, not an addressable agent conversation
service. The coordinator is currently policy/selection logic and bounded advice,
not an agent with a durable conversational identity.

There is no general group-chat route, membership store or conversation UI in the
audited web surface. The project stream route in [server](../../lib/web/server.mjs)
returns HTTP 501. An external engine could provide durable sessions and messages,
but integration must retain sender, recipient, project/set, attempt and delivery
identity, and distinguish conversation from permission to act. A chat invitation
or a model-generated instruction must not grant repository or funding authority.

The existing web UI should remain the single management surface. Its set overview
should drill into a plate, its work, runs, review, health and learning, while a
person can inspect their own capacity across sets. Proposed additions are an
agent/coordinator roster, linked conversations, visible decisions and policy
reasons, live progress with freshness, stop/recovery status and learning coverage.
These additions are missing product work, not merely configuration.

“Full transparency” must mean complete authorized shared-work provenance, with
explicit gaps. Shared run status, payer identity where authorized, approvals,
effects and usage coverage belong in the project view. Another contributor's
credentials, quota details, private lessons and unrelated conversations do not.
Raw transcripts may themselves contain private data and need explicit scope and
redaction; a summary cannot be represented as the complete transcript.

## People, capacity, usage and rules

Sets aggregate authorized projects and grant no new access. Two contributors on
one plate can have different personal accounts and quota windows. One person's
same account appearing through several sets must not become several allowances.
The local [funding foundation](../../lib/web/funding.mjs) preserves original payer
and account identity, including uncertain-response recovery and atomic shared-pool
reservations within the configured broker. It still needs HTTP trusted-source wiring and a usable personal
funding selection/enrollment flow. Supported bounded API planning is not general
personal-subscription execution or organization-plan allocation.

Historical usage and current capacity remain distinct. The
[usage ledger](../../lib/agent-quality-usage.mjs) attributes observations to full
task/PR lifecycles, including retries, reviews and failures, with duplicate control
and explicit coverage. Token totals do not establish remaining subscription quota.
Current authorized provider/model choices need separate fresh observations,
quality evidence and cost/latency tradeoffs. The local
[recommendation service](../../lib/web/recommendation-service.mjs) deliberately
withholds available choices until checked policy-selection context is integrated.
This is unfinished code, not a live credential problem.

Existing exact preview/apply and policy checks should extend to conversations and
external sessions. Proposed acceptance should distinguish read-only observation,
isolated reversible edits, externally visible publication/sharing, and production,
access or paid actions. Each action needs a scoped authority source, current rule
revision and audit result. The AQ risk classification is descriptive evidence;
it is not a universal enforcement layer. Overrides, rule changes and stop requests
need their own authenticated operations. “Stop requested” must remain distinct
from confirmed provider/process termination.

## Falsifiable evaluation scenarios

| Scenario | Required result | Present evidence or gap |
| --- | --- | --- |
| Lose the launch response and restart the coordinator | Recover one original run, payer and charge; never launch twice | [Jobs](../../tests/web-jobs.test.mjs) and [model routing](../../tests/web-model-routing.test.mjs); an external launch adapter must prove equivalence |
| Browser disconnects after an approved submission | Reconnect inspects the original receipt without replaying submission; stale observations remain labeled | [Recovery](../../tests/web-recovery.test.mjs) and [job UI](../../tests/web-jobs-ui.test.mjs); external session/message reconnection remains a gap |
| Kill a worker after begin; receive an old callback | No replacement until termination is known; stale callbacks cannot free the lane | [Worker](../../tests/web-worker.test.mjs) and jobs tests; general session recovery missing |
| Owner signs out or revokes delegation during work | Stop further authorized work; preserve outstanding effects for reconciliation | Existing initiating-session checks; unattended delegation model missing |
| Crash after completion but before lesson capture | Durable outcome survives; capture reconciles exactly once or visibly remains pending | No end-to-end implementation found |
| Repeat a failure in two projects | Propose one evidenced shared lesson, review it, distribute only to eligible projects | [Lessons](../../tests/lessons.test.mjs), [learn](../../tests/learn.test.mjs), [distill](../../tests/distill.test.mjs); automatic closed-loop detection/evaluation missing |
| A promoted lesson makes outcomes worse | Trace affected attempts to lesson revision; withdraw or roll back guidance | Versioned records provide ingredients; effectiveness/canary/rollback loop missing |
| A is exhausted while B has capacity on the same plate | Never spend B's allowance or expose B's private quota without explicit authority | [Funding](../../tests/routine-ownership.test.mjs), [recommendation boundaries](../../tests/web-recommendation-surfaces.test.mjs); local fixtures, incomplete activation |
| One account appears in two sets; work spans two PRs | Count each allowance/usage observation once; retain allocation and unknown coverage | [Set views](../../tests/web-project-sets.test.mjs), [usage](../../tests/agent-quality-usage.test.mjs) |
| Address an agent, then its coordinator, in a human/agent group | Durable ordered messages reference the same work; membership does not grant execution rights | General conversation implementation absent |
| Edit a rule after approval; request stop during an uncertain effect | Refuse stale approval; show pending stop until authoritative termination | [Robot](../../tests/robot-runtime.test.mjs), jobs/recovery; cross-engine policy/stop unimplemented |
| Revoke access during buffered history/lesson delivery | Final authorization suppresses disclosure; new members cannot read old private copies | [Host observations](../../tests/web-host-observations.test.mjs), [private learning](../../tests/web-private-learning.test.mjs) |
| Restore an old database | Old sessions/callbacks fail; unresolved effects remain visibly unresolved | [Restore](../../tests/web-restore.test.mjs); external engine needs matching generation fences |

These scenarios are acceptance criteria for the comparison. Existing focused
tests prove specific boundaries, not the complete requested loop or deployment.

## Retain, adopt or redesign

Retain Plates' project practices, acceptance/evidence records, review gates,
scoped lessons and promotion, usage attribution, original-operation identity and
person/funding boundaries. Wholesale replacement would need to reproduce or
migrate these capabilities explicitly. It would also need to preserve existing
installed-project workflows and their source/version provenance.

Evaluate adopting generic sessions, process/worktree lifecycle, SSH transport,
reconnection, agent messaging and log streaming. Keep scheduling ownership
explicit: two engines must not independently launch the same work. The external
engine must supply stable native run/attempt identities, acknowledgements,
checkpoints, authoritative exit/cancel evidence, and usage coverage; Plates can
invoke existing CLI/practices and project those records into its current UI.
Observation alone must not authorize execution or funding.

Redesign the missing coordinator around durable work/outcome/learning links,
scoped conversations and explicit delegated authority. The Switchboard concepts
are provisional; preserving its component structure is not an acceptance goal.
Use “set” or “project set” in proposed product language while planning compatibility
for existing names independently.

The next useful evaluation is a pinned read-only mapping of each candidate's
session, cancellation, messaging, permission and receipt contracts to the scenarios
above, using static Acme examples. Classify each requirement as native, adapter
work, conflicting or unknown. This can disqualify a poor fit before installing it.
The repository-only audit cannot settle external API behavior, operational cost
or usability. A later trial would name the exact engine/version, synthetic project,
host, capabilities, funding ceiling and cleanup. No such trial, installation,
adoption, persistent permission expansion or publication occurred here.
