# Product experiments that produce decisions and lessons

Proposed design, 31 October 2026. Repository inspection at
`037e13b4f78c061405cef899b528badb536584ad`. This is additive design work on the
isolated consolidation branch, not implementation or an accepted architecture
decision. No phase IDs, running experiments, provider connections, production
configuration, permissions or data exports change. The integration option below
incorporates official-source research checked on 31 October 2026; it is not a
provider selection, a compatibility certification or permission to connect it.

## Outcome and boundaries

An owner can take an idea through a hypothesis, a controlled small-cohort release,
verified exposure and observations, a recorded decision, and an approved expansion,
revision or rollback. Each completed or interrupted experiment produces an outcome
and an explicit learning status. Useful findings can become versioned project
lessons and, after separate review, shared learning for a project set.

Plates owns the idea-to-decision record and its policy, provenance and review.
Use an existing feature-delivery provider, experiment-analysis service and
observability stack for allocation, serving, collection and statistical analysis.
Do not build a new flag service, event warehouse, statistical engine or parallel
dashboard. The first implementation should integrate one selected stack well;
provider-neutral records do not require a universal adapter framework upfront.

Keep three related activities distinct:

| Activity | Question and unit | Acceptance authority |
| --- | --- | --- |
| Product experiment | Does an experience improve a defined user outcome? Randomized user, account, organization or another declared unit. | Frozen experiment plan, valid observation/analysis and an authorized product decision |
| Deployment canary | Is this release operationally safe for a limited traffic or infrastructure slice? | Delivery verification, operational guardrails and rollout policy; health alone does not prove product benefit |
| Engineering/agent evaluation | Does a model, instruction or implementation improve a frozen engineering workload? | Existing harness/quality contracts and independent artifact evidence; task pairs are not user cohorts |

A product experiment can run on a canaried release and link to an agent evaluation,
but their IDs, denominators, budgets and verdicts remain distinct. A green deploy,
an agent's recommendation or a successful engineering trial cannot declare a
product experiment a winner.

## Repository inventory: reuse and gaps

| Existing capability | Source and useful proof | Reuse and boundary |
| --- | --- | --- |
| Bounded production observations | [Production contract](production-errors.md), [collectors](../../practices/night/files/scripts/plates/production-collectors.mjs), [state and verification](../../practices/night/files/scripts/plates/production.mjs); [error tests](../../tests/production-errors.test.mjs), [integration tests](../../tests/production-integration.test.mjs) | GCP/Vercel/JSON error readers, redaction, replay/overlap handling, late-arrival invalidation, revision/window/traffic proof. Live CLI reads preserve completeness gaps. These are not conversion analytics, browser instrumentation or a low-latency experiment safety controller. |
| Immutable-result feedback | [Records](../../lib/feedback.mjs), [service](../../lib/feedback-service.mjs), [store](../../lib/feedback-store.mjs), [feedback tests](../../tests/feedback.test.mjs) | Exact result bytes/version, private words, chained edits, reviewable excerpts and original issue handoff. Current capture attribution is explicitly manual; no authenticated in-app survey or product-exposure binding exists. |
| Engineering experiments | [Session trials](session-handoff-trials.md), [harness contract](harness-regression-evaluation.md), [session tests](../../tests/session-trials.test.mjs) | Immutable plans, bounded reservations, original receipts and explicit unknowns. Do not reuse ABBA task assignment, the three-pair rule or handoff automatic promotion as product-experiment statistics or rollout authority. |
| Reviewed delivery and canaries | [Web update contract](web-fleet-updates.md), [job service](../../lib/web/jobs.mjs) | Reuse exact preview/apply, fresh authorization and uncertain-effect reconciliation patterns. The existing project-update canary prepares/publishes PRs; it does not allocate app users or change traffic. |
| Learning | [Learn](../../lib/learn.mjs), [distill](../../lib/distill.mjs), [private Learning](../../lib/web/private-learning.mjs) | Reviewed promotion, retained wording and explicit private copies. No automatic per-experiment outcome capture, runtime retrieval or measured shared-learning loop is implemented. |
| Consolidated management observations | [Observation boundary](../../lib/web/observations.mjs), [host report schema](../../lib/web/host-observation-model.mjs) | Existing authorized, freshness-labeled projections. The host bridge accepts bounded routine/attempt metadata; do not send arbitrary product telemetry through it or widen its grant implicitly. |

The audited tree has no product-experiment assignment/exposure/metric contract,
feature-flag provider integration, statistical decision service or product
experiment Mission Control view. Existing `experiment` and `cohort` fields mostly
describe engineering evaluations. Repository code and synthetic tests establish
these narrow capabilities, not production activation.

## Product flow and ownership

1. **Propose.** Record the problem, evidence, hypothesis, expected mechanism,
   eligible audience, owner, idea/issue and intended decision. An agent may propose
   hypotheses and instrumentation work; proposal creation grants no rollout.
2. **Freeze a plan.** Pin variants, allocation, metric definitions, validity checks,
   minimum/maximum duration and stopping rules, risk limits, fallback and authority. Link implementation
   PRs, commits, build artifacts, flag configuration and environments. Missing
   required evidence leaves the plan unready.
3. **Verify measurement.** Exercise both variants and control in a test environment;
   check assignment, actual exposure, conversions, guardrails, duplicates, consent
   and failure behavior. A/A or shadow verification may be appropriate; its
   scope and acceptance are explicit, not proof of causal uplift.
4. **Release within an approved envelope.** Apply an exact provider change only
   after current checks. Observe provider readback and app-effective behavior.
   Reconcile an uncertain write using the original operation; never issue a new
   change because an acknowledgement was lost.
5. **Observe and decide.** Separate operational safety, data validity, statistical
   readiness and qualitative feedback. The decision can be expand, revise,
   rollback, stop, continue within the frozen limits, or inconclusive. A suggested
   decision is distinct from an authorized effect.
6. **Record learning.** Preserve negative and null results, failures, stopped runs,
   analysis revisions, decision rationale and remaining uncertainty. Record a
   lesson candidate, explicit no-useful-lesson, or pending/failed capture. A later
   experiment gets its own versioned plan; it does not erase an earlier outcome.

An ongoing experimentation program is a backlog with bounded concurrent work,
owners and review cadences, not permission to run unbounded tests. Prioritize the
next idea using the prior evidence; conflicting experiments, absent exposure
coverage or exhausted budgets can block admission. Project policy can later
authorize specific automation within a bounded envelope. That automation is not
introduced or enabled by this design.

## Provider-neutral identities and durable records

Reuse Plates' source-record/private-workspace separation, digests, append-only
receipts and original-operation recovery patterns. Product experiments need a
separate tagged contract; do not reinterpret existing harness or feedback records.
Concrete storage and schema migration are decisions for implementation, not a new
database prescribed here.

| Record | Required identity and evidence |
| --- | --- |
| Experiment plan | Stable Plates experiment ID, workspace/project numeric repository identity, immutable plan revision/digest, hypothesis/idea, accountable owner, risk policy and approved audience/environment |
| Delivery binding | PR/commit, immutable artifact and release/deployment identity, service/environment, provider connection reference, provider project/experiment/flag IDs and configuration version; display names are not identity |
| Allocation | Randomization unit, eligibility version, namespace/salt or provider allocation version, enrollment and variant weights, control, exclusions/overlap policy and assignment persistence guarantees |
| Assignment and exposure | Provider-namespaced event ID, plan/allocation version, opaque subject or cluster reference where permitted, variant, occurred/received times, app release and actual exposure point; assignment/evaluation/exposure are separate event kinds |
| Metric evidence | Metric definition/version, query/report identity and digest, analysis method/version, denominator/unit, event-time window, cohort/variant, numerator/estimate/uncertainty, inclusion policy, completeness/freshness and source provenance |
| Feedback | Original feedback identity/revision, authorized excerpt or private pointer, idea/PR/release/experiment/variant and exposure reference where available; unknown links remain unknown |
| Decision and effect | Actor and authority, exact plan/source/analysis revisions, rationale, intended transition, original operation ID, provider request/ack/readback, effective-state evidence and unresolved gaps |
| Learning | Outcome and capture status, lesson version, evidence, applicability, audience, promotion/withdrawal decision and references to later applications/results |

Receipts must survive experiment archival and provider display-name changes.
Provider-specific fields remain explicitly namespaced. A manually supplied export
is attributed evidence, not authenticated provider state. Preserve original
provider IDs alongside normalized IDs so imports cannot count the same events
twice. Access to a set grants no new access to its projects or participants.

## Cohorts, control and actual exposure

Choose the randomization unit before enrollment. A collaboration feature may need
account/organization-level allocation to avoid contamination between users; event
counts cannot be treated as independent users. Use the provider's stable allocation
mechanism and qualify its behavior across processes, SDKs, cached configurations,
anonymous-to-signed-in transitions and multiple devices. Do not invent a second
Plates bucketing algorithm that disagrees with the serving provider.

For illustration only, enrolling 10% of eligible accounts with a 50/50 control and
treatment split puts the idea in 5% of eligible accounts. The other 90% are outside
the experiment, not automatically a valid control. Percentages need an explicit
denominator: eligible accounts, all accounts and requests are different quantities.
Never select a production allocation from this example.

A small percentage limits exposure; it does not establish statistical power.
With one or a few users, dogfooding can produce useful qualitative/task evidence,
but the causal comparison may remain inconclusive. More page views by the same
person do not manufacture an adequate sample of independent users.

Expansion must preserve existing assignments or declare and analyze a new cohort
version. Pin any control holdout, allocation epochs and overlapping-experiment
exclusion layers. Changing targeting, allocation weights, implementation or metric
definitions cannot silently rewrite the original plan or rerandomize existing
participants. Record external flag edits as drift; pause expansion until reconciled.

Flag evaluation is not proof of exposure. Emit exposure when the user actually
reaches the declared behavior, with the evaluation's variant/configuration identity.
Record assignment separately so drop-off and missing instrumentation remain visible.
Predeclare intention-to-treat and any triggered analysis; do not exclude assigned
users after observing their outcomes to manufacture a benefit. Exposed-only
diagnostics need their own validity caveats. Fallback/default/error evaluations
remain distinguishable from the assigned treatment actually being served.

## Metrics, validity and stopping rules

Freeze the primary outcome, minimum meaningful effect, guardrails, diagnostic
metrics, population, unit, metric definitions, attribution/maturation windows and
analysis engine before starting. Choose an appropriate fixed-horizon or supported
sequential procedure through a qualified analysis provider. Record the baseline,
power/sample-size assumptions and decision thresholds used by that provider; do
not substitute a universal participant count or the engineering three-pair rule.

Require checks for sample-ratio mismatch, assignment/exposure integrity, duplicate
and bot/internal traffic, missingness by variant, identity switching, spillover,
seasonality and concurrent changes. Unsupported analysis or invalid data means
inconclusive, never zero effect or a winner. Account for repeated users/clusters,
multiple variants/metrics/comparisons and planned segment analyses in the selected
method. Post-hoc segments are exploratory and cannot silently become the primary
success criterion. Do not repeatedly peek at a fixed-horizon test and stop on the
first favorable result.

Report effect sizes and uncertainty with denominators and coverage; distinguish
statistical evidence from practical significance and operational cost. Low traffic
may require a longer bounded test or an inconclusive decision. A safety stop can
happen before statistical readiness without constituting a success verdict.
New or corrected data creates a new analysis revision, preserving prior decisions
and triggering explicit reconsideration where material.

## Observability and feedback back into Plates

Instrumentation lives in the application and its existing telemetry stack. Bind
service/environment, release, experiment/plan, variant and exposure-point versions
to authorized observations. Operational traces/errors and product outcomes should
be correlatable without moving raw user data into Plates. The standards and first
adapter option below define the proposed seams and their qualification limits.

The observability provider retains raw events, traces and high-cardinality data.
Plates reads bounded summaries and evidence references through a scoped adapter:
actual query/report versions, windows, freshness, coverage, sampling and source
identity. A provider dashboard link is useful navigation, not verification. The
current production error reader can contribute incident evidence; its nightly
cadence and incomplete live-provider coverage cannot enforce a near-real-time stop.
Declare which independently operating provider controller evaluates guardrails.

Keep metrics distinct: errors per request need a request denominator; latency
needs its sampling/population definition; a sampled trace count is not an exposure
census. Reconcile assignment, exposure and outcome coverage rather than assuming
they share a denominator. Unknown or stale telemetry blocks expansion and follows
the explicitly approved hold/stop policy. It does not imply healthy behavior.

In-app feedback should bind the actual displayed result/release and variant where
established, with original source and consent metadata. Reuse the immutable-result
feedback and explicit redacted-excerpt workflow through a separately versioned
product binding; do not smuggle new fields into today's strict manual schema.
Qualitative comments explain failure modes and generate hypotheses, but voluntary
respondents are not a representative metric denominator. Replies and surveys,
especially provider exports or new recipients, require their own authorization.

## Standards and the first adapter option

**OpenFeature for evaluation portability.** Its evaluation context supplies a
targeting key and custom context; some providers depend on that key for fractional
evaluation. Propose a stable project-scoped pseudonymous key and a minimal context
allowlist, with the actual provider implementing allocation. OpenFeature is not
the source of consent, verified exposure, causal analysis or production approval.
Qualify the chosen SDK/provider combination and persistence behavior explicitly;
the standard alone cannot promise stable cohorts. See the official
[evaluation-context specification](https://openfeature.dev/specification/sections/evaluation-context/).

**GrowthBook as the initial configuration/results adapter candidate.** Its
[statistics overview](https://docs.growthbook.io/statistics/overview) documents
Bayesian and frequentist engines. Start by mapping a pinned configuration and
results export to the neutral records above; retain the actual engine, parameters,
query version and uncertainty rather than importing a green badge as acceptance.
This is a design option if it fits the app's existing data stack and access model,
not a recommendation to replace a working analytics provider or create a new
connection now.

Qualify GrowthBook's [sticky bucketing](https://docs.growthbook.io/app/sticky-bucketing)
for the selected SDK/storage, login transitions, enrollment changes and restarts;
its persistence is an integration responsibility, not just a setting name. Preserve
its [experiment health](https://docs.growthbook.io/app/experiment-results) warnings,
including sample-ratio mismatch and multiple exposures, as decision-blocking
validity evidence until resolved. Its documented
[sequential testing](https://docs.growthbook.io/statistics/sequential) applies to
the frequentist engine; do not label every analysis sequential or assume changing
the engine permits arbitrary stopping. Pin the selected procedure and its settings.

**OpenTelemetry for approved operational correlation.** Keep the application's
existing telemetry backend and read bounded aggregates plus authorized trace links.
Only allowlisted, nonsensitive experiment, variant and release metadata may be
propagated when needed. Baggage can escape to third-party services and has no
built-in integrity guarantee; never use it as authority or a verified assignment.
Do not propagate participant mappings or raw feedback. Baggage is also separate
from recorded attributes: explicitly instrument the needed observation rather
than assuming propagation persists it. See the official
[baggage guidance](https://opentelemetry.io/docs/concepts/signals/baggage/).

These sources establish design seams, not an end-to-end tested integration.
Pin installable SDK/provider/API versions, relevant licenses and deployment/data
boundaries before implementation. Do not send OTLP or experiment participant
payloads to the existing routine-only host observation endpoint.

## Late events, privacy and failure recovery

Namespace event IDs by provider/source/project/environment. Identical replays are
idempotent; an existing ID with different bytes is a visible conflict. Retain
occurred, received and processed times, source cursors and bounded lateness policy.
Out-of-order exposures/conversions wait for reconciliation or remain unattributed;
do not guess their variant from today's flag value. Closed windows have a declared
watermark and correction policy. Late data must not silently mutate a previously
accepted analysis or disappear to preserve a favorable conclusion.

Queue/transport loss, consent gaps, sampling, retention limits, stale caches and
unsupported provider fields reduce coverage visibly. A source restart must recover
its original cursor/receipts; missing state is not an empty experiment. Bounded
retention must disclose evictions and preserve decisions and their evidence status.
Raw-event backfills and new exports need reviewed scope and destination.

Collect the minimum authorized data. Prefer project-scoped opaque identifiers;
hashing an email is not anonymization. Keep identity mappings and raw feedback out
of Git, shared lessons, telemetry baggage and broad dashboard views. Avoid subject
IDs as metric labels and avoid attaching raw URLs, request bodies, credentials or
free text. Honor consent/opt-out, retention and deletion policies at the provider
and Plates boundary. A deletion can remove personal payload while retaining a
nonpersonal receipt/tombstone and marking affected evidence unavailable; it cannot
silently rewrite history. Cross-project learning shares reviewed findings, not
participant identities or private feedback.

## Risk gates, stop and rollback

Keep experiment planning, measurement reads, production flag writes, expansion,
data export and lesson sharing as separate capabilities. Current actor, project,
environment, source version and policy must be checked at every effect. A model
suggestion, chat message, webhook or imported telemetry cannot grant authority.
Existing personal model allowance is unrelated to a flag/analytics subscription
or the application's operational budget; each cost source is explicit.

The frozen rollout envelope names maximum reach/duration, approved steps, guardrail
thresholds, freshness bounds, stop controller, fallback, expected propagation/cache
time and original recovery route. Preauthorized automation may later stop or return
to the specified safe state within that envelope; it cannot broaden reach, switch
funding identity or grant itself access. Expansion and new irreversible effects
need their own authority. No automatic stop authority is activated here.

Show requested, provider-acknowledged, app-effective and verified states separately.
On an uncertain write, recover the original provider operation/configuration before
retrying. If the provider lacks idempotency or conditional version writes, report
the gap and require reconciliation; do not promise exactly-once external effects.
Pin rollback to a known configuration and implementation compatibility. Turning a
flag off cannot undo emails, payments, schema changes or persisted user data;
these need an explicit compensating-action plan and stronger review before launch.

## Mission Control and versioned learning

Extend the existing set overview and project drill-down with an experiment view,
not a separate console. Show hypothesis and owner, idea/PR/release lineage, audience
and actual reach, control/variants, assignment versus exposure, data validity,
primary outcomes and uncertainty, guardrails, feedback coverage, pending approvals,
provider freshness/drift and original-operation recovery. Make it possible to
inspect a decision and its exact evidence, request a permitted stop, or propose a
revision. Set-level totals do not add overlapping audiences or pool personal data.

Every terminal/interrupted experiment needs a durable outcome and recoverable
learning-capture status, including negative/inconclusive results. Reuse the
reviewed project lesson workflow; sharing a lesson to a set is a separate audience
and applicability decision. Record both successful and failed applications of
shared guidance. A later regression can withdraw guidance or reopen the decision,
without deleting the original experiment or claiming a feature rollback recalled
already delivered behavior. A shared lesson is evidence to evaluate in the next
project, not an instruction to roll a feature out everywhere.

The future implementation must durably couple a terminal outcome with an
idempotent pending learning work item, or prove an equivalent recovery mechanism.
A crash between completion and lesson processing cannot erase the outcome or
silently count capture as complete. Replaying that work must recover the original
capture identity; the eventual result can explicitly be no useful lesson.

## Smallest fixture-backed next slice

The next slice is a local product-experiment plan and observation inspector, not
production rollout. Its user outcome: an owner can review one idea's frozen
experiment plan against explicit synthetic provider observations and see why a
decision is ready, blocked or inconclusive, without a network request or write to
an application. This document specifies that slice; it does not implement it.

Use two synthetic Acme projects with distinct scopes and pre-authored plan,
assignment/exposure, metric-report, feedback-reference and effect-receipt fixtures.
Validate a separate versioned product contract and source-bound replay/projection.
Reuse existing identity/digest/private-state and original-receipt patterns where
applicable. Keep statistical output an attributed provider report; do not implement
statistical inference or user bucketing to make the fixtures pass. Unsupported
provider claims stay unverified. A preview proposes an action but has no apply path.

Acceptance cases for that slice and later adapter qualification:

| Scenario | Required observation |
| --- | --- |
| Same participant returns; enrollment expands | Existing assignment remains stable or explicit incompatible-allocation gap; control is not silently replaced |
| SDK evaluates flag but UI is never shown | Assignment/evaluation recorded; no fabricated exposure or conversion denominator |
| Exposure/conversion replay, late delivery or conflicting ID | Deduplicate identical evidence, quarantine conflicts, preserve window revisions and unknown attribution |
| Apparent uplift with sample-ratio mismatch or differential missingness | No favorable readiness verdict; exact validity gaps displayed |
| Fixed-horizon result appears favorable before its stopping rule | Continue/inconclusive under the frozen plan; no early winner inferred |
| Guardrail breaches or telemetry becomes stale | Correct proposed hold/stop transition; no production call in the local slice |
| Stop receipt says success but provider/configuration or app-effective state differs | Show acknowledged versus effective/unverified states; only matching synthetic readback confirms the fixture's rollback, never live readiness |
| Flag write acknowledgement is lost | Original operation remains unresolved; no second effect is suggested as a blind retry |
| Feedback refers to an older PR/release/variant | Retain original immutable result; never relabel it with the current experiment version |
| Two projects receive overlapping provider IDs | Scope prevents accidental joins; private words and participant identifiers stay isolated |
| Consent withdrawn or payload deleted | No further collection/export; tombstone and evidence gap without leaking prior payload |
| Experiment stops with no useful lesson or failed capture | Durable negative outcome and explicit capture status; no invented lesson |
| Good or harmful shared lesson is applied elsewhere | Versioned applicability, outcome and withdrawal references; no automatic cross-project rollout |

Run these as one replayable synthetic journey as well as isolated cases: stable
cohorts → actual exposures → SRM blocks a favorable decision → a guardrail stop
and matching simulated rollback readback → restart/replay without duplicate effects
→ reviewed lesson promotion, plus a small-sample inconclusive branch. Retain
fixture provenance on every reported result; simulations cannot attest to a live
provider, population or completed production rollback.

After the local slice, qualify a read-only adapter against pinned real provider
schemas using recorded or authorized sandbox data. Only then propose an exact
test environment, connection scopes, production envelope and costs for a live
pilot. No fixture result establishes real targeting, telemetry completeness,
statistical validity, stop latency or deployment readiness.

## Decisions to resolve before a live integration

Choose the existing app/flag/analytics/observability stack and its supported versions;
the app's eligible population/randomization unit and privacy boundaries; the
analysis owner/method; the independent guardrail controller and safe fallback;
and the exact granted read/write/export scopes. The GrowthBook adapter is the
first design option to qualify against those facts. None of
these choices is inferred from an existing Plates model connection or host grant.
