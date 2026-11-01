# Bounded single-generation harness runtime

Implementation contract, 1 November 2026. Extends phase119; activation remains
separate. This runtime measures single-generation artifact tasks, not iterative
coding-agent efficacy or execution of suggested checks. Existing offline records
and acceptance authority remain unchanged.

## Execution boundary

`single-generation-container-v1` starts a fresh supervised builder container,
populates pinned source/context, and verifies readiness before inference. A
trusted host gateway sends only the exact attested public packet. A fixed hashed
bridge receives bounded generated JSON through stdin, writes permitted regular
files and emits the existing artifact envelope. Generated code never executes
on the host. No shell tools, network, host mounts, credentials, history, sibling
state or private acceptance material enter the builder. Confirm termination
before the existing independent Docker acceptance checks. Preserve original
provider and container identities separately; one cannot settle the other.

The first provider adapter is OpenAI Responses with explicit requested/resolved
model and organization/project scope; no default model, credential discovery,
subscription credential reuse, fallback, automatic retry or prior conversation.
Transport receives an in-memory credential from a separately authorized caller;
it never reads process environment or persists the key. Count/start/inspect are
bounded fixed-endpoint requests, with redirects refused, sanitized errors and
credential-reflection checks on outgoing/public returned bytes. Stream-body
limits and deadlines apply even to slow/incomplete responses.

`count` uses the exact generation model, instructions and input; token receipts
bind their packet hash. `start` is one foreground text-only response, tools empty,
`tool_choice: none`, `store: true`, `background: false`, `stream: false`,
`truncation: disabled`, explicit `max_output_tokens`, and fixed standard service
tier. The exact transfer and retention are included in approval. Inspect reads
only a known original response ID. Foreground cancellation is unsupported: report
that limitation, never manufacture cancellation confirmation. A timeout after
POST can leave unknown spend and no response ID; never send again.

Model, actual service tier, response ID, token usage and status are validated.
Missing usage remains null. Extract bounded text only, never hidden reasoning;
unknown output item kinds, tool calls, reflected credentials, malformed usage,
identity mismatch or oversized output refuse without exporting response bodies.
A rejected response may still have incurred cost. A terminal response does not
establish acceptance, and an HTTP refusal alone never refunds a reservation.

## Quote, spending and recovery

Use the existing experiment writer lock and immutable evidence directory. Local
preview sends nothing. Counting is a separately previewed provider transfer;
freeze grants no network authority. Generation needs its exact quote approval.
No adapter call is reachable from the public CLI before the orchestration below
is wired and tested.

Before any provider operation, retain its original intent, bounded monetary
reservation and dispatch authorization. Use checked integer micro-USD arithmetic
with upward rounding and independently recorded current pricing evidence for all
charge categories. Counted identical input plus capped total output determines a
conservative reservation under explicit billing assumptions; this is not an
invoice guarantee. Unsupported rates, model/tier changes or unbounded categories
block admission. Reserve the total comparison envelope and each trial. Never
infer zero cost, refund an uncertain operation, or reuse held capacity. A cost
above its reservation is retained as a breach and closes admission.

New versioned live descriptors bind the public packet, bridge, per-case
configuration environment, credential reference/generation (not value), scope,
price evidence, token bounds and retention. Current offline descriptors retain
exact validation. Preserve historical report projections; version new receipts
rather than changing old bytes. Recovery inspects original operations without
redispatch; unknown provider state/spend remains held even when Docker stops.

## Required proof before activation

- Fake transport proves endpoints, all bounds, no retries, malformed/partial
  dispatch handling, model/tier/ID binding and synthetic credential exclusion.
- Real local Docker proves builder readiness, isolated bridge and independent
  acceptance, with no provider call.
- Currency tests prove comparison and trial ceilings, concurrent admission under
  the existing lock, unknown holds, overflow and no duplicate effects.
- A complete installed-CLI preview/run/reconcile path binds exact approvals;
  repeated preview is read-only and old offline fixtures remain compatible.
- The real historical compatibility and control cases fit unchanged artifact and
  retention bounds. Freeze five pairs per case, all20 slots, no replacements.
- Owner approves the concrete provider transfer, retention and bounded quote
  before counting or generation. No credentials or paid requests are used while
  building this implementation.

## Sources and limits

Official documentation inspected on 1 November 2026:
[Token counting](https://developers.openai.com/api/docs/guides/token-counting)
provides input counting and includes non-visible tokens in the output cap.
[Create response](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
documents storage/retrieval, foreground generation and output bounds. These
sources do not establish an account's prices, permissions or invoice ceiling;
those remain explicit activation inputs.
