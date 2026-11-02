# One-slot live runtime integration

Implementation contract adopted on 1 November 2026. Implementation and supported-host proof must precede activation. No provider transfer or spend is authorized by this document. Reuses the existing experiment, writer, coordinator, spend accounting and independent acceptance. No second scheduler or store.

## 1. Scope, versions and entry points

Keep outer frozen plan schema2, bundle/configuration schema3. New policy.execution is exactly host-gateway-v1; both arms must use it, provider openai, runtime single-generation-container-v1 with explicit version 1.0.0, temperature null, positive bounded maxTokens, resolved model, independent review and automatic false. Exact per-case environments; positive conservatively representable case/comparison currency ceilings. Reject mixed arms. Preserve existing offline-only definitions and schema1 execution bytes/behavior.

Installed verbs: run with schema2 stage count or generation; reconcile with schema2 stage recovery. Use the closed descriptor shapes in Appendix A and section4: PacketBinding is exactly `{format,templateDigest,packetDigest,responseFormat,converterVersion,controllerDigest,bridgeDigest}`; format=evaluation-public-packet-v1, responseFormat=converterVersion=utf8-file-replacements-v1. Recovery has the explicit provider-get/local-only descriptor union in section4; targets has length exactly1 in either branch. Add live-only --credential-fd N (N>=3). Live aggregate resume refuses explicitly. Preview exits3, writes nothing and reads no FD; each count, generation and GET requires its own exact --yes --digest.

Only scope/readFrozen under the existing evaluation-ledger entry point establishes current workspace/frozen-record provenance. Revalidate both under withEvaluationWriter. Partition preparation validates values only. Bind descriptor canonical path/raw hash, selected case/config/environment, partitionIdentity, packet preparation, controller, bridge, price quote, state snapshot and credential metadata. Use the SAME branded public view for preparePublicPacket and convertPublicResult. Verify publicViewDigest against partitionIdentity. No private binding enters provider instructions/input; no invented converter hash.

## 2. Closed types and stable identities

Notation: `H` SHA256 lowercase; `Id` evaluationId; `Slot` existing pairId-arm; `Time` canonical UTC ISO; `Ms` nonnegative safe integer; `Epoch` positive safe integer; `ImageId` is 'sha256:' followed by H. `Ref` is existing exact {kind,id,digest}. `Credential={ref:Id,generation:positiveInteger}`; `Scope={organization:String,project:String}` uses existing non-null provider scope grammar; `Model={requested:String,resolved:String}` uses provider grammar. `Stage=count|generation|recovery`. Objects are closed: union branches have exactly their listed fields. No arbitrary metadata. JSON uses strict partition parser; immutable records use existing sealRecord and exact JSON.stringify(record)+'\n'. Paths are fixed by kind, never caller-supplied. Every newly persisted immutable receipt in this document, including non-R reconcile records, must have final mode0400; directories retain existing private mode0700.

`R<K,B> = {schemaVersion:1,kind:K,planDigest:H,slot:Slot,operationId:Id,...B,digest:H}`. All R records private, unlinked, regular, mode0400, immutable (existing storeImmutable final mode; no writable receipt is accepted). New reader validates schema1 independently; do NOT relax execution.immutable's existing schema2 check globally.

`identity={planDigest:H,slot:Slot,stage:Stage,attempt:1}`; identityDigest=fingerprint(identity); operationId='op-'+identityDigest.slice(0,60). A paid recovery operation also binds originalGenerationOperationId and reconcileIdentityDigest=fingerprint({planDigest,action:'reconcile',attempt:1}) in identity before hashing. This is the stable action identity, NOT the reconcile receipt digest, avoiding a hash cycle with its authorization. LOCAL-ONLY creates no provider/spend operation identity; it uses only the comparison reconcile identity and references the original operation. Retain/check full identityDigest. Changing descriptor, price, packet or approval conflicts with an existing identity, never creates an attempt. No automatic redispatch.

`Binding={case:Ref,configuration:Ref,environment:{image,platform,dependencyLock,installer},partitionIdentityDigest:H,publicViewDigest:H,packetPreparationDigest:H,packetDigest:H,templateDigest:H,converterVersion:'utf8-file-replacements-v1',controllerDigest:H,bridgeDigest:H}`. Environment uses existing exact validation.

`Authorization={identityDigest:H,descriptorPath:canonicalAbsoluteFile,descriptorHash:H,approvalDigest:H,binding:Binding,credential:Credential,credentialChannel:'pipe-json-v1',scope:Scope,model:Model,quoteDigest:H,requestDigest:H}`. requestDigest fingerprints the exact stage request specification WITHOUT keys, FD number, timestamps or any receipt digest dependent on it; count/generation request includes packetDigest, model, scope, credential metadata and stage limits; recovery includes original response ID and original generation/result identities. The controller recomputes this specification, never trusts an authored digest.

`TimeBudget={startedAt:Time,deadlineEpochMs:Epoch,reservedMs:Ms,priorChargedMs:Ms}`; startedAt and deadline are actual execution observations, NOT stable operation identity. Deadline never renews on recovery.

## 3. Immutable receipt graph and exact paths

Under existing execution root:

- `preparations/<slot>/count-intent.json`: R<'live-count-intent', {authorization:Authorization,time:TimeBudget,spendReservationDigest:H,packetRecordBytesHash:H}>.
- `preparations/<slot>/packet.json`: R<'live-public-packet', {identityDigest:H,preparation:PreparedPublicPacket}>. PreparedPublicPacket is the adopted exact pure packet record. Compute the complete packet record bytes/hash before count intent; this record refers to the stable count identityDigest, not its receipt digest, avoiding a hash cycle. No source/private evaluator snapshot is added here.
- `preparations/<slot>/count-admission.json`: R<'live-request-admission', {intentDigest:H,lease:RequestLease}>.
- `preparations/<slot>/count-refusal.json`: R<'live-request-refusal', {intentDigest:H,authority:'request-capacity-refusal-v1',reason:'capacity-busy'}>. Only the coordinator's branded pre-insertion refusal may create it. Refusal plus lease/dispatch is a gap. This consumes count attempt1 without transfer, blocks generation for this slot and permits other slots; no retry protocol.
- `preparations/<slot>/count-result.json`: R<'live-provider-result', {intentDigest:H,spendDispatchDigest:H,observation:CountObservation}>.
- `preparations/<slot>/count-local.json`: R<'live-local-completion', {intentDigest:H,coordinatorReceipt:RequestSettlement,chargedMs:Ms}>.
- `<slot>/ready.json`: R<'live-builder-ready', {builderIntentDigest:H,ready:{schemaVersion:1,operation:String,containerId:H,imageId:ImageId,deliveredDigest:H,bridgeDigest:H,deadlineEpochMs:Epoch}}>; ready is the existing runLiveBuilder observation, validated against the actual builder intent/image/public files.
- `<slot>/provider-intent.json`: R<'live-generation-intent', {authorization:Authorization,time:TimeBudget,countResultDigest:H,builderIntentDigest:H,readyDigest:H,spendReservationDigest:H}>.
- `<slot>/provider-result.json`: R<'live-provider-result', {intentDigest:H,spendDispatchDigest:H,observation:GenerationObservation}>.
- `<slot>/provider-text.json`: R<'live-response-text', {identityDigest:H,encoding:'base64',byteDigest:H,bytes:Ms,base64:canonicalBase64}>. bytes<=393216; decoded UTF8 exactly equals extracted provider text. Result references this record digest. Write text before result; interrupted text/result is a retained gap, never permission to repeat generation. Base64 is local bounded storage, not a requested model output format.

Generation's original builder intent/lease/dispatch-builder/builder/artifact/check/verdict/result remain existing execution records, with an explicitly versioned live dispatchProtocol accepted only for host-gateway-v1. Link builder intent -> ready -> provider intent -> provider result -> conversion/artifact -> independent checks/verdict. No cycle. Live validation must check these predecessors rather than merely accept extra filenames. Preserve frozen offline chain validation unchanged.

`CountObservation = {state:'observed',response:ProviderCount,error:null} | {state:'uncertain',response:null,error:ProviderError}`.
`GenerationObservation = {state:'observed',response:StartMetadata,textDigest:H,error:null} | {state:'uncertain',response:null,textDigest:null,error:ProviderError}`.
ProviderCount is the exact existing count result. StartMetadata is the exact provider.start result with ONLY text removed (includes packetDigest/outputLimitExceeded). `ProviderError={code:existingFixedProviderCode,dispatch:'not-dispatched'|'uncertain'}`. No raw exception/HTTP body/headers. Observed means validated transport evidence, not terminal success or acceptance. A retained observed nonterminal response preserves its original ID. An error ID is never scraped.

Known response metadata/usage must not be discarded merely because text storage, conversion or artifact validation fails: retain a bounded result variant `{state:'observed-text-unavailable',response:StartMetadata,textDigest:null,error:{code:'live_text_unavailable',dispatch:'uncertain'}}`; this closes artifact application but supports accounting and original-ID GET. This is the only additional generation branch.

## 4. Unified reconcile: provider GET or explicit LOCAL-ONLY

Both branches use existing `execution/control/reconcile-intent.json`, and consume the SAME comparison-wide one-reconcile allowance. Preserve the old schema2 evaluation-recovery-reservation shape for offline plans. Neither branch grants another cancellation/reconcile attempt; a preexisting offline/live intent prevents a new reservation. Repeated approval inspects the original records, not a renewed deadline or operation list.

Closed live descriptor union (schema2 is new/unshipped, so no implicit legacy mode):

```
RemoteTarget={pairId:Id,arm:'baseline'|'candidate',generationIntentDigest:H,
 generationSpendOperationId:Id,sourceResultDigest:H,responseId:ResponseId}
LocalTarget={pairId:Id,arm:'baseline'|'candidate',operationKind:'count'|'generation',
 operationId:Id,originalIntentDigest:H,admissionReceiptDigest:H|null}
ProviderRecovery={schemaVersion:2,stage:'recovery',mode:'provider-get',planDigest:H,
 targets:[RemoteTarget],live:Live,billing:{schemaVersion:1,basis:'fixed-request-v1'}}
LocalRecovery={schemaVersion:2,stage:'recovery',mode:'local-only',planDigest:H,
 targets:[LocalTarget]}
```

Live is the exact Appendix A type with explicit credential metadata/scope/model/price evidence. LocalRecovery has NO live, billing, credential, responseId, sourcePaths, repository or admission-policy input. Reject --credential-fd for local-only, including on preview; never read it. Target identity/slot/kind and original lease are obtained from validated immutable receipts and matched exactly, not asserted through the descriptor. A null admissionReceiptDigest binds the observed absence: it remains a gap and cannot establish that no lease/request exists or release host capacity. Local-only supports count-only uncertainty and generation uncertainty without a retained validated response ID; no fake response ID is required. For generation, reconcile the existing container lease under its existing termination rules. For count, reconcile the request lease under verified owner-exit rules below. It creates no request lease or spend operation.

Closed shared planning types:

```
Step={kind:'credential-read'|'owner-observe'|'docker-observe'|'provider-get',
 operationId:String,maximumMs:positiveInteger<=1000}
Schedule={steps:[Step],credentialMs:Ms,writeCleanupMs:positiveInteger,
 maximumMs:positiveInteger<=10000}
RecoveryPolicy={attemptsPerAction:1,operationDeadlineMs:1000,
 reconcileMsPerSlot:10000,cancelMsPerSlot:10000}
RemoteBinding={mode:'provider-get',slot:Slot,generationOperationId:Id,
 generationIntentDigest:H,sourceResultDigest:H,responseId:ResponseId,
 authorization:Authorization}
LocalBinding={mode:'local-only',slot:Slot,operationKind:'count'|'generation',
 operationId:Id,originalIntentDigest:H,admissionReceiptDigest:H|null,
 leaseDigest:H|null}
```

Step.operationId is derived from the exact retained operation (existing Docker name, request operation ID, or fixed credential-read identifier), never authored argv. Steps are unique and in recorded operation order; length<=11, also constrained by the aggregate ceiling. Credential read is at most one step; credentialMs equals its reserved maximum, or zero when absent, and is NOT added twice. writeCleanupMs is a separately reserved remainder for immutable writes, coordinator settlement and lock/fence closure, including their awaits.

New live reconcile intent, sealed exact schema1:
`{schemaVersion:1,kind:'live-reconcile-intent',planDigest:H,approvalDigest:H,descriptorPath:canonicalAbsoluteFile,descriptorHash:H,snapshotDigest:H,controllerDigest:H,startedAt:Time,deadlineEpochMs:Epoch,policy:RecoveryPolicy,schedule:Schedule,target:RemoteBinding|LocalBinding,digest:H}`.

The approving invocation starts one aggregate deadline at entry; descriptor/workspace/lock reads, any necessary Git/Docker observations, FD, GET and receipt/fence cleanup all consume it. No source export or Docker readiness is required for provider GET, and local-only performs no provider work. `sum(steps.maximumMs)+writeCleanupMs <= maximumMs <=10000`, and the execution-time check is `chargedPreparationMs + sum(remaining steps.maximumMs) + writeCleanupMs <= maximumMs`; already elapsed preparation is never added outside that maximum. Each dispatched step receives min(its bound, remaining aggregate time minus reserved writeCleanupMs); never reset the deadline. Local-only has no credential-read/provider-get step. Refuse the entire plan before mutation/FD/GET if the complete required original operation list plus reserves cannot fit; do not omit checks to make it fit. One provider GET is <=1000ms INCLUDING its local transport cleanup, not an additional second outside the schedule. A Docker observation's subprocesses likewise share its <=1000ms bound. Coordinator/write awaits must accept the remaining reserved deadline rather than silently spend their default timeout after expiry.

**The existing 20 seconds per slot is 10 seconds reconcile + 10 seconds cancel.** This slice may use only the 10-second reconcile half; the cancel half is untouched, not borrowed. The frozen comparison ceiling remains unchanged. For one selected slot there is no ability to borrow unused reconcile time from other slots. Preview has its own bounded read invocation but establishes no new operation budget; execution time is recomputed and charged under its single deadline. Existing intent recovery never grants another ten seconds of effects.

Provider-get receipt paths remain:
- `execution/control/provider-recovery/<operationId>/intent.json`: R<'live-recovery-intent',{reconcileIntentDigest:H,generationIntentDigest:H,sourceResultDigest:H,responseId:ResponseId,authorization:Authorization,time:TimeBudget,spendReservationDigest:H}>.
- Same directory: admission.json/refusal.json/local.json use request schemas; text.json uses live-response-text; result.json uses live-provider-result with RecoveryObservation (GenerationObservation with exact provider.inspect metadata minus text, without start-only fields).

Local-only writes NO provider-recovery directory. Its one bounded observation is `execution/control/local-reconcile-<approvalDigest>.json`, exact sealed schema1:
`{schemaVersion:1,kind:'live-local-reconcile',planDigest:H,reconcileIntentDigest:H,slot:Slot,operationKind:'count'|'generation',operationId:Id,originalIntentDigest:H,admissionReceiptDigest:H|null,leaseDigest:H|null,localState:'released'|'retained-uncertain'|'lease-unavailable',requestSettlement:RequestSettlement|null,dockerReconciliationDigest:H|null,spendEffect:'none',providerEffect:'none',acceptanceEffect:'none',digest:H}`.
For count: released requires matching RequestSettlement.released=true from internal verified owner exit; other states cannot claim release. For generation: released requires the exact existing container reconciliation receipt proving all required original operations stopped. Absent/ambiguous ownership or missing lease stays unavailable/uncertain. Verified local owner exit can release host capacity ONLY: no FD, GET, POST, redispatch, refund, usage inference, new acceptance or generation approval. Unknown remote outcome and its money hold remain unchanged. Count uncertainty without a count result still blocks generation after host release.

Both branches terminate at `execution/control/reconcile-<approvalDigest>.json`, exact sealed schema1:
`{schemaVersion:1,kind:'live-reconcile-result',planDigest:H,reconcileIntentDigest:H,mode:'provider-get'|'local-only',slot:Slot,recoveryResultDigest:H|null,localCompletionDigest:H|null,dockerReconciliationDigest:H|null,state:'recorded'|'uncertain',acceptance:'unknown'|'preserved',digest:H}`.
Local-only requires recoveryResultDigest=null and localCompletionDigest referencing its local-reconcile record. Preserved acceptance requires the preexisting immutable verdict. Recorded means the bounded observations are retained, not that remote work is resolved. No branch may create a verdict from returned text or recreate a builder.

GET charges fixed-request-v1 separately; terminal validated generation usage updates the ORIGINAL generation spend at its original quote, with cumulative predecessor-bound evidence. Already-complete identical settlement recovers locally; contradictions remain gaps/breaches. GET uncertainty holds its own reservation without releasing generation's hold. Local-only does not call spend settlement; unknown money stays held. Both modes require the existing current/recovered writer context defined in section7.

## 5. Coordinator extension: in-process requests, not containers

Existing reserveExternalBudget accepts only Docker builder/check names and termination observations. Its container proof cannot describe count/GET. Add reserveRequestBudget / settleRequestBudget / reconcileRequestBudget alongside it, using the SAME locked state, capacity, inspected target handle and history, with a discriminated foregroundContract. Do not reuse process-group cleanup, invent container names or create another queue.

`RequestLease={id:hex32,pid:positiveInteger,uid:Integer,host:String,repo:String,root:canonicalAbsoluteDirectory,revision:GitSHA,dirty:Boolean,foregroundContract:'in-process-request-v1',weight:Integer,createdAt:Time,commandDigest:H,childPid:null,state:'reserved'|'uncertain',operationId:Id,requestKind:'count'|'recovery',deadlineEpochMs:Epoch}`. An uncertain state adds no loose reason field; the fixed contract determines its meaning. ID derives from the full live operation identity, with full binding checked on lookup. Trusted caller passes a coordinator-inspected target; caller JSON is not target authority. Existing container/process variants remain unchanged.

`LocalObservation = {state:'not-started'} | {state:'transport-closed'} | {state:'owner-exited',pid:positiveInteger} | {state:'unknown'}`.
`RequestSettlement={id:hex32,foregroundContract:'in-process-request-v1',commandDigest:H,operationId:Id,repo:String,root:String,createdAt:Time,endedAt:Time,observation:LocalObservation,released:Boolean}`.

Live-owner settlement requires exact owner/lease identity and controller-owned local evidence. not-started is allowed only before local transport begins; transport-closed requires the adapter lifecycle to confirm local request/body handles closed, regardless of HTTP/provider status or known spend. A provider method's Promise.race timeout alone is NOT transport-closed. Extend the trusted adapter with an internal completion witness separate from its result; it cannot be a descriptor boolean or arbitrary callback assertion. Exact proposed internal adapter entry: `beginEvaluationRequest({operationId:Id,operation:'count'|'start'|'inspect',input,timeoutMs,signal}) -> {result:Promise<ExistingProviderResult>,localCompletion:Promise<OpaqueLocalCompletion>,abort:()=>void}`. input is the existing closed operation argument; one invocation starts at most one transport, never a retry. OpaqueLocalCompletion is branded by the adapter and resolved only after that operation's local request/body lifecycle is finished; the coordinator/controller's trusted bridge validates its operation identity. Existing public count/start/inspect wrappers may await result, preserving their result shapes. localCompletion may remain pending after result timeout; writer closure must not await it indefinitely. Only timely completion or later verified owner exit can release capacity. Awaiting remote inference completion is not required. Deadline requests abort; if local closure cannot be confirmed, retain the lease as uncertain. Remote uncertainty and spend holds persist even after local capacity release.

Recovery under the existing recovered writer may release on verified same-host/uid original PID absence (ESRCH), because no detached child owns an in-process transport. Alive, reused, inaccessible or ambiguous PID retains the lease; no assertion from a missing process record. Prior released history recovers exactly, no new insertion or request. History eviction is not proof of no request; immutable experiment intent/result remains authoritative. Generation uses its existing builder lease, never a separate request lease.

## 6. Retention and finite time allocation

All new small receipts <=16384 encoded bytes. Packet record <=270336 bytes. Text record <=528384 bytes (393216 decoded bytes ->524288 base64 plus <=4096 fixed header). Reject oversized metadata before dispatch; on a validated post-dispatch text/storage failure retain observed-text-unavailable metadata and usage within its pre-reserved small-record slot.

Reserve worst-case capacity BEFORE count dispatch, across all frozen slots, while executing only one slot:

- Per slot: existing SLOT_BYTES=1572864 /26 events for builder/artifact/check/verdict chain; +270336/1 packet; +528384/1 generation text; +196608/12 small live receipts; +139264/22 for two spend operations (each initialization intent16KiB + reservation16KiB + dispatch4KiB + eight observations4KiB).
- One comparison-wide GET: +528384/1 text; +131072/8 small recovery/control receipts; +69632/11 one spend operation.
- Existing recovery capacity: N*65536 bytes / N*4 events, plus exact already-present frozen bytes and one spend comparison reservation bounded16KiB/1. Existing execution reservation is included in actual usage or an explicit additional16KiB/1 if absent.

Local-only observation and result occupy the existing bounded recovery/control allowance, not an additional per-slot allocation or second GET reservation. Per-slot new+existing allowance=2707456 bytes/62 events. For N=20 this is 54,149,120 bytes before the one-GET/global/frozen additions; check the actual total against the unchanged <=64MiB and maxEvents ceiling. Refuse an authored retention policy that cannot fit; do not enlarge it automatically. Bound each category so this reservation is executable, not just an initial estimate. Add readers/path bounds before writers. Existing spend capacity checks still run, but do not add this full future envelope twice: it is a proof that the disjoint category maxima plus actual frozen bytes fit, not a second monetary or file allocation ledger. Confirm count of immutable filenames against these maxima in tests; unexpected files consume capacity and are gaps. At every subsequent check use `actualRetainedBytes + remainingFutureBytes` and the corresponding event count. For each disjoint receipt/category, a valid retained file REPLACES its future maximum (subtract its allocated maximum from future, count its actual bytes once); a pending/in-flight file keeps its full outstanding maximum until read-back resolves it. A retained initialization prefix consumes its own assigned allowance while remaining descendants keep theirs. Never add actual bytes to the complete original future envelope or separately add spend-reserved descendants already assigned to that envelope. Unknown/foreign bytes still count as actual and do not earn a future-allocation credit. Verify these substitutions in retained/pending/completed and spend-initialization replay cases.

Partial directory/file writes never imply absent dispatch. Original immutable intent and matching prefix may finish structural initialization only; conflicting/unbound prefixes are gaps. Before any provider call all predecessor files must read back and all corresponding spend/coordinator identities must match. No write/prune/overwrite to manufacture a clean attempt.

Count time reserves `count timeout + credential-read<=1s + bounded local-write/cleanup allowance`, all within task.limits.minutes. Generation preview subtracts retained count chargedMs; count uncertainty or absent local completion blocks generation. chargedMs includes preparation time and observed elapsed admitted work, never just network time; retain at least the reserved ceiling if elapsed provenance is unavailable. Generation and its checks use remaining trial time and existing cleanup bounds. GET and LOCAL-ONLY use only the pre-reserved 10-second reconcile half, inclusive of preparation and closing writes, not a fresh task allowance or the 10-second cancel half. Repeated invocations cannot reset any spent interval or deadline. Refuse insufficient time before FD/provider use.

## 7. Writer fence and credential pipe

### Exact recovered entry into the existing writer

Extend the existing signature narrowly: `withEvaluationWriter(options, work, recovery?)`, where recovery, if present, is exactly `{recover:VerifiedRecoverableLockObservation}`. The observation is the full unchanged value returned by existing inspectHarnessLock(home), with status recoverable, owner and file identity; it is NOT a descriptor object or caller declaration of death. The controller obtains it through the existing verified preview/recovery path, binds its exact fingerprint into the approved snapshot, and supplies it only for explicit reconcile under that same approval.

Inside this helper: derive/revalidate scope and canonical home; reject nested writer acquisition; acquire `ledgerLock(home,{harness:true,recover:recovery.recover})` (normal entry omits recover). The existing ledger lock must re-observe the exact bytes/file identity and verified owner death under its guard before archiving the old lock. Changed/live/unverifiable lock refuses before callback. After acquisition, inspect the NEW owner and establish the SAME AsyncLocalStorage context as ordinary withEvaluationWriter: home, actual new owner, spendTail and acceptingSpend, plus the live fence below. Revalidate scope/readFrozen/plan and approved original-operation state inside that context before effects. The inherited dead owner's observation never becomes the new owner identity.

The work callback uses withEvaluationSpendWriter through that context; its existing scope/owner checks and serialized tail remain mandatory. Never acquire a raw recovery ledgerLock outside this helper then call a spend API that tries to acquire another writer. Do not make the general writer reentrant or permit recovery assertions from CLI JSON. Release/drain and STUCK behavior below are identical for normal and recovered entries. A recoverable lock is not blanket approval for any action; local-only remains local-only.

### Bounded mutation fence

Introduce a narrow live fence within withEvaluationWriter, not a reentrant writer. State OPEN -> CLOSING -> DRAINED -> RELEASED; failure to drain -> STUCK. It captures actual writer identity, deadline and original operation. Exact internal operations:

- `assertOpen()` verifies time, owner, unchanged operation and OPEN state; required immediately before spend dispatch and bridge delivery.
- `persist(pathKind,record)` synchronously validates/snapshots a known bounded receipt and registers its promise before any await; serialize through the existing writer. No arbitrary closure/task queue. Registration after CLOSING rejects.
- `close()` synchronously blocks new registration/dispatch/bridge, aborts credential/transport reads, then drains registered writes plus spendTail before release. Late callbacks cannot acquire a new fence or register settlement. Timely retained results can be settled by later explicit local recovery.
- A closing deadline is bounded by reserved cleanup time. If registered filesystem mutation has not settled, do NOT release the writer behind it. Mark in-memory STUCK, stop dispatch, terminate the CLI with the original lock retained; recovery requires verified owner death and inspecting original prefixes. Do not pretend Promise.race cancels an active write. Process termination/no subsequent writes must be tested on supported hosts.

Credential reader `readCredentialPipe({fd,expected:{ref,generation},deadline,signal})` is an internal approved-controller operation. Require integer fd>=3, fstat FIFO/pipe, exact channel pipe-json-v1; reject regular file/socket/device/stdio. Ownership transfers once after those checks. Use nonblocking event-driven Node pipe wrapping, bounded8192-byte accumulation, and timeout min(1000ms,remaining action time). Require EOF and strict UTF8/duplicate-key-safe JSON:
`{schemaVersion:1,ref:Id,generation:positiveInteger,key:existingProviderASCIIKey}`.

On EOF validate exact metadata/key then close the handle and return only the in-memory key. On timeout/oversize/abort/error, destroy/close it, remove listeners/timer, reject once with fixed code and discard buffers; ignore all late events. No blocking fs.read/readFile with Promise.race; no /dev/fd reopening, environment fallback, logs, key fingerprint, receipt or subprocess argument. Metadata is owner attribution, not authenticated key-generation proof. JS cannot promise physical memory erasure.

Require supported-host proof that pipe wrapping sets nonblocking behavior and that destroy cancels pending read/owns closure. Before any Git/Docker/evaluator spawn, prove the inherited FD is excluded from child inheritance (including preparatory Git before approved consumption); use the platform's close-on-exec/explicit descriptor handling, not an assumption that omitted stdio closes every arbitrary inherited FD. If Node's supported primitives cannot meet this, refuse channel activation until a narrowly reviewed bootstrap/isolated-reader design is supplied. Preview never reads/consumes it. Repeated original dispatch recovery reads no FD. An explicitly approved original-ID GET may receive a new pipe envelope with the same approved credential metadata.

## 8. Finite operation transitions and acceptance

Count: ABSENT -> INTENT/SPEND-RESERVED -> REQUEST-LEASE -> FD-READ -> SPEND-DISPATCH -> OBSERVED|UNCERTAIN -> LOCAL-CLOSED|LOCAL-UNKNOWN. Typed capacity refusal instead reaches NOT-ADMITTED (terminal attempt, no dispatch). Only retained successful counted packet/model plus completed local accounting permits generation. Any consumed dispatch forbids a second POST, including crashes before the HTTP call actually starts.

Generation: ABSENT -> BUILDER-INTENT/SPEND-RESERVED -> BUILDER-LEASE -> READY -> PROVIDER-INTENT -> FD-READ -> SPEND-DISPATCH -> RESPONSE -> CONVERTED/RECONSTRUCTED -> BRIDGE -> CONFIRMED-TERMINATED -> INDEPENDENT-CHECKS -> VERDICT. Any uncertainty retains original identities/holds; no repeated provider dispatch. Conversion failure retains known usage and records invalid submission; provider completion is not acceptance.

Provider recovery: ABSENT unified reservation -> ORIGINAL-ID-GET-INTENT -> REQUEST-LEASE -> FD-READ -> SPEND-DISPATCH -> OBSERVED|UNCERTAIN -> ACCOUNTING/LOCAL-COMPLETION -> immutable reconcile result. One finite GET, no polling, no restarted builder, no new verdict from returned text. Cancellation closes paid admission; local inspection/structural recovery remain available without conferring dispatch. Spend breach also closes paid GET admission.

LOCAL-ONLY: ABSENT unified reservation -> VERIFIED ORIGINAL INTENT/LEASE -> OWNER/CONTAINER OBSERVATIONS -> HOST RELEASE OR RETAINED UNCERTAINTY -> LOCAL RECEIPT -> immutable reconcile result. No credential, provider or spend-dispatch transition exists. This consumes the same one-action reconcile reservation and ten-second half; repeat invocation inspects original records only.

## 9. Raw proof interfaces required before public routing

These internal interfaces and their causal proofs must exist before any installed live branch can dispatch; declarations or receipts asserted by a caller are insufficient:

- **Recovered writer:** the third argument above passes the actual inspectHarnessLock observation into ledgerLock({recover}) internally. Child-process proof with a dead original owner must enter one real writer context, execute a spend mutation without nested acquisition, drain/release once, and reject altered/live lock observations. Removing exact observation comparison or reusing the dead owner must fail targeted assertions.
- **Local lease evidence:** `reconcileRequestBudget({stateDir,capacity,lease,deadline})` obtains owner-exit evidence internally under the coordinator lock and recovered evaluation writer; it accepts NO `dead:true`/LocalObservation from external input. Runtime settleRequestBudget consumes an adapter-branded completion handle bound to operationId, never a forged structural token. Proof distinguishes ESRCH from EPERM/alive/reused PID and confirms local release leaves unknown spend unchanged. Existing container reconciliation remains separate and exact.
- **Transport lifecycle:** beginEvaluationRequest's localCompletion needs observable completion/abort/closed-handle evidence independent of resultPromise. A timed-out result with pending body cancellation must leave the lease held; confirmed local close with remote uncertainty may release it. No test-only trust bypass in the installed route.
- **Deadline planning/execution:** pure `planLiveReconcile({mode,originalOperations,elapsedMs,credentialMs,writeCleanupMs}) -> Schedule` (originalOperations is the complete controller-derived ordered list of `{kind:'owner-observe'|'docker-observe'|'provider-get',operationId:String,maximumMs:positiveInteger<=1000}`) validates the complete original operation list; its executor passes one absolute deadline through owner/coordinator, credential, Docker/GET and persist/close boundaries. Synthetic clock/subprocess proofs cover nine Docker checks plus GET/FD/writes refusing when they cannot fit, elapsed lock/path preparation, per-step<=1000ms, and no use of cancel's ten seconds. Removing aggregate propagation must fail an effect-count/time-budget assertion.
- **Writer fence:** immutable path-kind registration plus close/drain/STUCK interfaces above require delayed real-write/fake-provider tests: late callbacks cannot register/dispatch/apply, existing writes drain before unlock, and an unresolved write cannot coexist with a newly admitted writer. Raw filesystem errors never become successful completion witnesses.
- **Credential pipe:** real child-process inherited FIFO tests establish bounded nonblocking EOF/oversize/timeout/cancel, handle closure, no post-close callback effects and no FD in Git/Docker/evaluator children, including before consumption. No route until these supported-host properties are demonstrated. Use synthetic Acme envelope/key values only; never real credentials.
- **Receipt/retention readers:** exact discriminated local-only/provider-get paths, mode0400, predecessor bindings and replay substitution of actual versus future bytes/events must pass crash-prefix and negative mutation controls. Installed CLI proof must traverse LOCAL-ONLY for count-only/no-ID uncertainty without touching the FD or provider factory, using the same one-action reservation.

Implementation lands as one installed controller path plus strict reader/admission/fence extensions. Required focused synthetic CLI proof traverses preview/count/quote/generation/acceptance and explicit original-ID reconciliation; tests every crash edge, byte/category ceiling, no-ID uncertainty, no duplicate effects, late callbacks, pipe cancellation/inheritance, local-capacity release with unknown spend, and unchanged offline bytes. No paid activation or efficacy claim follows from this contract or its synthetic proof.


## Appendix A. Closed live descriptors and pricing

All fields below are required; reject extras. H, Id, Scope, Model, Credential and
Binding retain the definitions above. Canonical descriptors are bounded to 65536
UTF-8 bytes, regular files at their exact absolute real path, parsed with the
strict JSON reader. Bind both raw bytes and path. No key or endpoint is a field.

```
Live={provider:'openai',credential:Credential,scope:Scope,model:Model,
 serviceTier:'default',retention:{store:true},priceEvidence:SpendPriceEvidence}
PacketBinding={format:'evaluation-public-packet-v1',templateDigest:H,
 packetDigest:H,responseFormat:'utf8-file-replacements-v1',
 converterVersion:'utf8-file-replacements-v1',controllerDigest:H,bridgeDigest:H}
Admission={stateDir,manifest,capacity,weight,repo}
Count={schemaVersion:2,stage:'count',planDigest:H,pairId:Id,
 arm:'baseline'|'candidate',repository:canonicalAbsoluteDirectory,
 sourcePaths:[safeRelativePath],admission:Admission,live:Live,packet:PacketBinding,
 billing:{schemaVersion:1,basis:'fixed-request-v1'},
 limits:{timeoutMs:positiveInteger,maxCountedInputTokens:positiveInteger}}
Generation={schemaVersion:2,stage:'generation',planDigest:H,pairId:Id,
 arm:'baseline'|'candidate',repository:canonicalAbsoluteDirectory,
 sourcePaths:[safeRelativePath],admission:Admission,live:Live,packet:PacketBinding,
 count:{operationId:Id,resultDigest:H},
 limits:{timeoutMs:positiveInteger,maxOutputTokens:positiveInteger}}
```

Admission uses the existing exact host-policy validation: canonical external state,
regular manifest, capacity 1..128, weight 1..capacity and authorized comparison repo.
Model fields match the frozen configuration; non-null scope and credential metadata
match the exact approved action. Token bounds are at most 10000000; timeouts at most
600000ms and within remaining task/stage time. Output cap cannot exceed the frozen
runtime cap. Count threshold is a post-response refusal threshold, not a billing cap.
Count and generation retain identical packet/model across separate approvals.
Recovery descriptors are only the provider-get/local-only union in section4.

SpendPriceEvidence is the existing exact schema1 contract in evaluation-spend.mjs:
`{schemaVersion:1,sourceHash,observedAt,validUntil,model,serviceTier,scope,rates}`.
Rates have count/generation/recovery, each with inputTokens/outputTokens/requests,
each `{microUsd,units}` with nonnegative safe integer microUsd and positive units.
For count and GET, fixed-request-v1 requires both token rates explicitly zero and
an explicit request rate, including a documented zero when applicable. Unknown
rates are never zero. Quote one request using existing quoteSpend with token
quantities zero; unsupported token-priced bootstrap refuses before credentials.
Pricing evidence is attributable input, not verified entitlement or an invoice.
On a validated successful fixed-request operation, record token quantities zero
and requests1; returned generation usage belongs to its original generation
operation. Uncertainty/errors retain usage null and the original hold. No rate
fetch, speculative tokenizer bound, refund inference or automatic retry.

The adapter's local-completion witness binds the supplied stable operationId;
that identifier is local metadata and never enters the provider payload. It must
not derive identity from a credential value or retain a key fingerprint.
