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

## Spend receipt storage extension

Only new schema-3 experiments may retain a `spend` child beside existing
`state.json`, `attachments`, `execution` and `reports`, inside the same experiment
and retention budget. This is a typed extension of the existing ledger, not a
second store. Schema-2 roots keep their exact allowlist. Missing/partial/foreign
spend state is an explicit gap and blocks spending; it must never be ignored as
an absent balance. Existing read-only inspection remains available with gaps.

The spend component owns strict, hashed schema-1 records under `spend`:
`reservation.json` binds the frozen plan, comparison ceiling and all planned
trial ceilings; `operations/<id>/reservation.json` binds one trial, provider
operation kind, exact public request/price/quote digests and maximum microUSD;
`dispatch.json` authorizes that original operation; immutable numbered
`observations/<sequence>.json` retain settlement observations with predecessor
hashes. No arbitrary files or symlinks are accepted. IDs are validated before
path construction. Reservation/publication uncertainty preserves the original
identity and all holds. Repeating an identical operation recovers it; conflicting
reuse refuses. Missing sequence/predecessor evidence is uncertain, never free.

Use `withEvaluationWriter` and its verified writer context for mutations; a
read-only inspector never acquires authority to dispatch. Verify frozen currency
ceilings are non-null, positive and representable without increasing them.
Reserve against both comparison and trial ceilings. The sum of new quoted
operation maximums plus known spent and unresolved held amounts cannot exceed
either. All-count/recovery/generation categories must have explicit supplied
pricing evidence and bounds; unknown categories refuse admission. Price evidence
is attributed input, not authentication or a claim that a public URL proves a
rate. Exact approved quotes retain its source hash, date, model/tier and scope.

Include every spend byte/event in existing retention accounting before writing.
Conservatively reserve room for authorization and terminal-or-unknown observations
before admitting an operation; lack of capacity refuses before its external
effect. Never prune or rewrite receipts. Usage remains null when unknown; confirmed
charges above a reservation are preserved as a breach and close further spend
admission. Legacy offline execution does not consult or create spend state.

The existing writer context serializes narrow spend transactions invoked by the
execution controller, then drains them before releasing its lock. This does not
make the generic writer reentrant. A nested spend transaction refuses promptly;
parallel top-level spend calls queue and revalidate the original lock owner.
Schema-3 offline plans with null currency and verified absent spend storage report
`not-configured`, closed admission and null balances. Unexpected retained spend
state still reports a gap; it is never treated as free capacity.

Provider response streams admit at most 4,096 nonempty chunks as well as the byte
ceiling. Empty chunks refuse immediately, so progress cannot depend solely on a
timer that an immediately resolving stream could starve.

Observed charge arithmetic uses exact integers even when a charge exceeds the
JSON safe-integer range. Preserve usage and price evidence, expose the exact
micro-USD decimal string with the numeric projection null, retain the original
hold and close admission on the breach. Quoted admission amounts must still be
representable; overflow is never a refund or a reason to discard an observation.

## Recoverable directory initialization — 1 November 2026

New operation reservations first retain
`spend/operations/<operationId>.intent.json`, an immutable sealed schema-1 record
with kind `spend-operation-initialization` and one `reservation` field containing
the exact final sealed spend-operation record. Its filename, operation identity,
plan, quote and digest must agree. This is the original initialization intent,
not a second budget or approval source; the eventual reservation must equal it.
Keep it after completion.

Publication order is intent, operation directory, empty observations directory,
then exact reservation. A valid intent with no directory, an empty directory,
or only an empty observations directory is pending initialization. Count the
quoted hold once, reserve the missing reservation's bytes/event plus dispatch
and observation capacity, and block new admission and dispatch. Only the exact
retained request may finish those creation prefixes under the existing writer.
Structural completion grants no dispatch, refunds no money and preserves all
original records. It may restore an already reserved operation after cancellation,
price expiry or a breach, but must not reopen admission or bypass the separate
current-price/authority checks required before any new dispatch.

Complete legacy operations remain readable. A legacy empty directory without
an initialization intent remains a gap: it cannot establish the original request.
Partial files, foreign entries, changed records, symlinks and dispatch/observation
evidence in an incomplete structure are refusals, never cleanup candidates.
Partial intent files remain immutable uncertainty; this protocol does not promise
recovery from arbitrary file corruption or lost storage.

For comparison-root initialization, only an empty spend directory or one containing
solely an empty operations directory is a recognized creation prefix. Complete it
from the deterministic frozen comparison reservation under its original admission
checks. Missing root reservation with any operation content remains unavailable.
Neither root nor operation recovery invokes a provider or authorizes an effect.
