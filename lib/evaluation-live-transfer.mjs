// Approved controller transfer only. Durable spend dispatch always precedes I/O;
// a local-completion witness releases host capacity, never financial uncertainty.
import { checkEvaluation as check, fingerprint, sealRecord, byteDigest } from './evaluation-records.mjs';
import { reserveComparisonSpend, reserveSpend, authorizeSpendDispatch, settleSpend } from './evaluation-spend.mjs';
import { beginEvaluationRequest } from './evaluation-provider.mjs';
import { readCredentialPipe } from './evaluation-credential-pipe.mjs';
import { isRequestCapacityRefusal } from './validation-budget.mjs';
const providerCodes = new Set(['evaluation_provider_input', 'evaluation_provider_timeout', 'evaluation_provider_response', 'evaluation_provider_limit', 'evaluation_provider_denied', 'evaluation_provider_throttled', 'evaluation_provider_unavailable']);
const errorValue = error => ({ code: providerCodes.has(error?.code) ? error.code : 'evaluation_provider_unavailable', dispatch: error?.dispatch === 'not-dispatched' ? 'not-dispatched' : 'uncertain' });
export function liveRecord(prepared, kind, body) {
  return sealRecord({ schemaVersion: 1, kind, planDigest: prepared.input.planDigest, slot: prepared.slot, operationId: prepared.identity.operationId, ...body });
}
export function liveAuthorization(prepared) {
  const live = prepared.loaded.descriptor.live;
  return { identityDigest: prepared.identity.identityDigest, descriptorPath: prepared.descriptorPath, descriptorHash: prepared.descriptorHash,
    approvalDigest: prepared.digest, binding: prepared.binding, credential: live.credential, credentialChannel: 'pipe-json-v1', scope: live.scope,
    model: live.model, quoteDigest: prepared.quote.digest, requestDigest: prepared.requestDigest };
}
export async function reserveLiveSpend(options, prepared, fence) {
  await fence.assertOpen();
  await reserveComparisonSpend(options, { planDigest: prepared.input.planDigest });
  await fence.assertOpen();
  const reserved = await reserveSpend(options, { planDigest: prepared.input.planDigest, trialId: prepared.slot, operationId: prepared.identity.operationId,
    requestDigest: prepared.requestDigest, quote: prepared.quote, quoteDigest: prepared.quote.digest });
  check(!reserved.recovered, 'original spend attempt already exists'); return reserved.receipt;
}
export async function settleLiveSpend(options, prepared, dispatch, result, fence, previousDigest = dispatch.digest) {
  const response = result.observation.response, generation = prepared.loaded.descriptor.stage === 'generation';
  const usage = response && (!generation || response.usage) ? generation
    ? { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, requests: 1 }
    : { inputTokens: 0, outputTokens: 0, requests: 1 } : null;
  await fence.assertOpen();
  return settleSpend(options, { planDigest: prepared.input.planDigest, operationId: prepared.identity.operationId,
    observationId: 'obs-' + fingerprint({ operationId: prepared.identity.operationId, evidence: result.digest }).slice(0, 60), previousDigest,
    outcome: usage && (!generation || response.terminal) ? 'complete' : 'unknown', usage, evidenceDigest: result.digest });
}
// The completion callback only captures an opaque value. It never writes,
// settles spend, releases capacity, or acquires a writer after this call returns.
export async function transferLive(options, prepared, reservation, fence, deadline, signal = fence.signal) {
  await fence.assertOpen();
  const key = await readCredentialPipe({ fd: options.credentialFd, expected: prepared.loaded.descriptor.live.credential, deadline, signal });
  // Count/generation reserve their local cleanup in the enclosing action. GET
  // uses dispatchLive directly after its separate scheduled credential step.
  return dispatchLive(options, prepared, reservation, fence, { key, transportDeadline: deadline - 1000, completionDeadline: deadline, signal });
}
export async function dispatchLive(options, prepared, reservation, fence, interval) {
  const request = prepared.loaded.descriptor, operation = request.stage === 'generation' ? 'start' : request.stage === 'count' ? 'count' : 'inspect';
  let { key } = interval;
  const { transportDeadline, completionDeadline, signal = fence.signal } = interval;
  const timeoutMs = Math.min(request.limits?.timeoutMs ?? 1000, transportDeadline - Date.now());
  check(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && Number.isSafeInteger(completionDeadline)
    && completionDeadline >= transportDeadline, 'provider interval exhausted');
  await fence.assertOpen();
  const dispatch = await authorizeSpendDispatch(options, { planDigest: prepared.input.planDigest, operationId: prepared.identity.operationId, reservationDigest: reservation.digest });
  check(dispatch.dispatch && !dispatch.recovered, 'original provider dispatch consumed');
  await fence.assertOpen();
  const remainingMs = Math.min(timeoutMs, transportDeadline - Date.now());
  check(remainingMs > 0, 'provider interval exhausted after durable authorization');
  let requestHandle, response = null, error = null, completion = null;
  try {
    requestHandle = beginEvaluationRequest({ operationId: prepared.identity.operationId, operation, timeoutMs: remainingMs, signal,
      input: { key, scope: request.live.scope, model: request.live.model,
        ...(operation === 'inspect' ? { responseId: prepared.responseId } : { packet: prepared.packet.packet }),
        ...(operation === 'start' ? { maxOutputTokens: request.limits.maxOutputTokens } : {}) } });
    key = undefined;
    void requestHandle.localCompletion.then(value => { completion = value; });
    response = await requestHandle.result;
  } catch (e) { error = errorValue(e); }
  finally { key = undefined; }
  return { response, error, dispatch: dispatch.receipt, completion: async () => {
    if (!completion && requestHandle && Date.now() < completionDeadline) {
      let timer;
      try { await Promise.race([requestHandle.localCompletion, new Promise(resolve => { timer = setTimeout(resolve, Math.max(1, Math.min(250, completionDeadline - Date.now()))); })]); }
      finally { clearTimeout(timer); }
    }
    return completion;
  } };
}
export async function runLiveCount(options, prepared, reservation, fence, time) {
  const stage = 'count', packet = liveRecord(prepared, 'live-public-packet', { identityDigest: prepared.identity.identityDigest, preparation: prepared.packet });
  const intent = liveRecord(prepared, 'live-count-intent', { authorization: liveAuthorization(prepared), time,
    spendReservationDigest: reservation.digest, packetRecordBytesHash: byteDigest(JSON.stringify(packet) + '\n') });
  await fence.persist(intent, { stage }); await fence.persist(packet, { stage });
  const a = prepared.loaded.descriptor.admission;
  let lease;
  try {
    lease = await fence.reserveRequest({ stateDir: a.stateDir, capacity: a.capacity, weight: a.weight, target: prepared.target,
      id: prepared.identity.identityDigest.slice(0, 32), commandDigest: prepared.digest, operationId: prepared.identity.operationId,
      requestKind: stage, deadline: time.deadlineEpochMs });
  } catch (error) {
    if (!isRequestCapacityRefusal(error)) throw error;
    const refusal = liveRecord(prepared, 'live-request-refusal', { intentDigest: intent.digest, authority: 'request-capacity-refusal-v1', reason: 'capacity-busy' });
    await fence.persist(refusal, { stage }); return { status: 'not-admitted', intent, refusal };
  }
  await fence.persist(liveRecord(prepared, 'live-request-admission', { intentDigest: intent.digest, lease }), { stage });
  const transfer = await transferLive(options, prepared, reservation, fence, time.deadlineEpochMs);
  const result = liveRecord(prepared, 'live-provider-result', { intentDigest: intent.digest, spendDispatchDigest: transfer.dispatch.digest,
    observation: transfer.response ? { state: 'observed', response: transfer.response, error: null } : { state: 'uncertain', response: null, error: transfer.error } });
  await fence.persist(result, { stage });
  await settleLiveSpend(options, prepared, transfer.dispatch, result, fence);
  const completion = await transfer.completion();
  const coordinatorReceipt = await fence.settleRequest({ stateDir: a.stateDir, capacity: a.capacity, lease, completion, deadline: time.deadlineEpochMs });
  const chargedMs = completion ? prepared.preparationMs + Date.now() - Date.parse(time.startedAt) : time.reservedMs + time.priorChargedMs;
  const local = liveRecord(prepared, 'live-local-completion', { intentDigest: intent.digest, coordinatorReceipt, chargedMs });
  await fence.persist(local, { stage });
  return { status: transfer.response && coordinatorReceipt.released ? 'observed' : 'uncertain', intent, result, local };
}
