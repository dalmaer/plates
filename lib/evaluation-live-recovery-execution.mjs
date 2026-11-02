// Executes the finite approved schedule; no polling, renewed deadline or retry.
import { fingerprint, byteDigest, sealRecord, checkEvaluation as check } from './evaluation-records.mjs';
import { inspectDockerOperation } from './evaluation-docker.mjs';
import { unauthorizedStage } from './evaluation-execution.mjs';
import { readCredentialPipe } from './evaluation-credential-pipe.mjs';
import { isRequestCapacityRefusal } from './validation-budget.mjs';
import { liveRecord, dispatchLive, reserveLiveSpend, settleLiveSpend } from './evaluation-live-transfer.mjs';
import { settleSpend } from './evaluation-spend.mjs';

export function recoveredCountReleased(prepared, settlement) {
  if (settlement?.released !== true) return false;
  if (settlement.observation.state === 'owner-exited') return true;
  const local = prepared.original.count?.local;
  check(['transport-closed', 'not-started'].includes(settlement.observation.state) && local?.kind === 'live-local-completion'
    && local.schemaVersion === 1 && sealRecord(local).digest === local.digest && local.planDigest === prepared.input.planDigest
    && local.intentDigest === prepared.originalIntent.digest && local.operationId === prepared.originalIntent.operationId
    && fingerprint(local.coordinatorReceipt) === fingerprint(settlement), 'original released count receipt unavailable');
  return true;
}

function remaining(prepared, intent, index) {
  const rest = prepared.schedule.steps.slice(index).reduce((n, s) => n + s.maximumMs, prepared.schedule.writeCleanupMs);
  check(Date.now() + rest <= intent.deadlineEpochMs, 'remaining reconcile schedule cannot fit');
  return Math.min(intent.deadlineEpochMs - prepared.schedule.writeCleanupMs, Date.now() + prepared.schedule.steps[index].maximumMs);
}
async function dockerReceipt(prepared, intent, fence, observations) {
  const records = prepared.original.builder, original = records.intent, lease = records.lease?.lease;
  if (!original || !lease) return null;
  const a = prepared.coordinatorPolicy;
  const settlement = await fence.reconcileBuilder({ stateDir: a.stateDir, capacity: a.capacity, lease, observations, deadline: intent.deadlineEpochMs });
  const base = { schemaVersion: 2, id: original.id, createdAt: new Date().toISOString(), intentDigest: original.digest, recoveryInputDigest: prepared.digest };
  const verdict = records.verdict ?? sealRecord({ ...base, kind: 'evaluation-verdict', artifactDigest: records.artifact?.digest ?? null,
    checkManifestDigest: original.input.checkManifestDigest, evaluator: { identity: 'plates-host-stdio-v1', version: 1, controller: original.input.controller, image: original.input.image },
    acceptance: 'unknown', failureCategory: 'missing-evidence', checks: [], supersedesVerdictId: null, limitations: ['Recovered local termination only; missing original evidence remains unavailable.'] });
  const result = sealRecord({ ...base, kind: 'evaluation-result', status: settlement.released ? 'terminal' : 'uncertain', verdictDigest: verdict.digest, settlement,
    setup: records.builder?.stage.setup ?? 'unknown', execution: records.builder?.stage.execution ?? 'unknown',
    validation: verdict.acceptance === 'accepted' ? 'passed' : verdict.acceptance === 'rejected' ? 'failed' : 'unknown',
    resources: records.result?.resources ?? { currencyUsd: null, wallMs: null, activeHumanMinutes: null, cpuMs: null } });
  const value = sealRecord({ schemaVersion: 2, kind: 'evaluation-reconciliation', id: original.id, createdAt: new Date().toISOString(),
    intentDigest: original.digest, inputDigest: prepared.digest, originalEvidence: Object.fromEntries(Object.entries(records).map(([k, r]) => [k, r.digest])),
    observations, settlement, result, verdict, status: settlement.released ? 'terminal' : 'uncertain', acceptance: verdict.acceptance });
  await fence.persistExecution(prepared.slot, 'reconciliation-' + value.digest, value); return value;
}
async function settleOriginalGeneration(options, prepared, result, fence) {
  const original = prepared.original.generation.spend, response = result.observation.response;
  if (!response?.terminal || !response.usage) return;
  const usage = { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, requests: 1 };
  if (original.complete) {
    check(fingerprint(original.observations.at(-1).usage) === fingerprint(usage), 'original completed usage contradicts recovery'); return;
  }
  await fence.assertOpen();
  await settleSpend(options, { planDigest: prepared.input.planDigest, operationId: original.reservation.operationId,
    observationId: 'obs-' + fingerprint({ original: original.reservation.operationId, result: result.digest }).slice(0, 60),
    previousDigest: original.observations.at(-1)?.digest ?? original.dispatch.digest, outcome: 'complete', usage, evidenceDigest: result.digest });
}
export async function executeLiveRecovery(options, prepared, intent, fence) {
  const remote = prepared.loaded.descriptor.mode === 'provider-get', a = prepared.coordinatorPolicy;
  const observations = [], records = prepared.original.builder;
  let requestSettlement = null, docker = null, key, paid = null, paidLocal = null, reservation = null, paidIntent = null, lease = null;
  if (remote) {
    reservation = await reserveLiveSpend(options, prepared, fence);
    paidIntent = liveRecord(prepared, 'live-recovery-intent', { reconcileIntentDigest: intent.digest, generationIntentDigest: prepared.originalIntent.digest,
      sourceResultDigest: prepared.loaded.descriptor.targets[0].sourceResultDigest, responseId: prepared.responseId, authorization: prepared.reconcileTarget.authorization,
      time: { startedAt: intent.startedAt, deadlineEpochMs: intent.deadlineEpochMs, reservedMs: 10000, priorChargedMs: 0 }, spendReservationDigest: reservation.digest });
    await fence.persist(paidIntent, { stage: 'recovery' });
  }
  for (let index = 0; index < prepared.schedule.steps.length; index++) {
    const step = prepared.schedule.steps[index];
    if (step.kind === 'credential-read') {
      docker = await dockerReceipt(prepared, intent, fence, observations);
      try {
        lease = await fence.reserveRequest({ stateDir: a.stateDir, capacity: a.capacity, weight: a.weight, target: prepared.target,
          id: prepared.identity.identityDigest.slice(0, 32), commandDigest: prepared.digest, operationId: prepared.identity.operationId,
          requestKind: 'recovery', deadline: intent.deadlineEpochMs });
      } catch (error) {
        if (!isRequestCapacityRefusal(error)) throw error;
        await fence.persist(liveRecord(prepared, 'live-request-refusal', { intentDigest: paidIntent.digest, authority: 'request-capacity-refusal-v1', reason: 'capacity-busy' }), { stage: 'recovery' });
        return { status: 'not-admitted', intent };
      }
      await fence.persist(liveRecord(prepared, 'live-request-admission', { intentDigest: paidIntent.digest, lease }), { stage: 'recovery' });
    }
    const deadline = remaining(prepared, intent, index);
    await fence.assertOpen();
    if (step.kind === 'owner-observe') {
      requestSettlement = await fence.reconcileRequest({ stateDir: a.stateDir, capacity: a.capacity, lease: prepared.admission.lease, deadline });
    } else if (step.kind === 'docker-observe') {
      const position = records.intent.operations.indexOf(step.operationId), prior = records[position ? `check-${position - 1}` : 'builder']?.stage?.termination;
      observations.push(unauthorizedStage(records, position) ? { operation: step.operationId, state: 'not-dispatched' }
        : await inspectDockerOperation(step.operationId, records.intent.input.image, { expectedId: prior?.containerId ?? null, deadline }));
    } else if (step.kind === 'credential-read') {
      key = await readCredentialPipe({ fd: options.credentialFd, expected: prepared.loaded.descriptor.live.credential, deadline, signal: fence.signal });
    } else {
      check(step.kind === 'provider-get' && remote && key, 'invalid recovery transfer step');
      const transfer = await dispatchLive(options, prepared, reservation, fence, { key, transportDeadline: deadline - 200, completionDeadline: deadline }); key = undefined;
      const completion = await transfer.completion();
      let observation;
      if (transfer.response) {
        const { text, ...response } = transfer.response;
        try {
          const bytes = Buffer.from(text, 'utf8');
          const value = liveRecord(prepared, 'live-response-text', { identityDigest: prepared.identity.identityDigest, encoding: 'base64', byteDigest: byteDigest(bytes), bytes: bytes.length, base64: bytes.toString('base64') });
          await fence.persist(value, { stage: 'recovery' });
          observation = { state: 'observed', response, textDigest: value.digest, error: null };
        } catch { observation = { state: 'observed-text-unavailable', response, textDigest: null, error: { code: 'live_text_unavailable', dispatch: 'uncertain' } }; }
      } else observation = { state: 'uncertain', response: null, textDigest: null, error: transfer.error };
      paid = liveRecord(prepared, 'live-provider-result', { intentDigest: paidIntent.digest, spendDispatchDigest: transfer.dispatch.digest, observation });
      await fence.persist(paid, { stage: 'recovery' });
      await settleLiveSpend(options, prepared, transfer.dispatch, paid, fence);
      await settleOriginalGeneration(options, prepared, paid, fence);
      const coordinatorReceipt = await fence.settleRequest({ stateDir: a.stateDir, capacity: a.capacity, lease, completion, deadline: intent.deadlineEpochMs });
      paidLocal = liveRecord(prepared, 'live-local-completion', { intentDigest: paidIntent.digest, coordinatorReceipt,
        chargedMs: completion ? Date.now() - Date.parse(intent.startedAt) : 10000 });
      await fence.persist(paidLocal, { stage: 'recovery' });
    }
  }
  if (prepared.operationKind === 'generation' && !docker) docker = await dockerReceipt(prepared, intent, fence, observations);
  let local = null;
  if (!remote) {
    const released = prepared.operationKind === 'count' ? recoveredCountReleased(prepared, requestSettlement) : docker?.settlement.released === true;
    local = sealRecord({ schemaVersion: 1, kind: 'live-local-reconcile', planDigest: prepared.input.planDigest, reconcileIntentDigest: intent.digest,
      ...Object.fromEntries(['slot', 'operationKind', 'operationId', 'originalIntentDigest', 'admissionReceiptDigest', 'leaseDigest'].map(k => [k, prepared.reconcileTarget[k]])),
      localState: !prepared.admission ? 'lease-unavailable' : released ? 'released' : 'retained-uncertain', requestSettlement,
      dockerReconciliationDigest: docker?.digest ?? null, spendEffect: 'none', providerEffect: 'none', acceptanceEffect: 'none' });
    await fence.persist(local, { approvalDigest: prepared.digest });
  }
  const value = sealRecord({ schemaVersion: 1, kind: 'live-reconcile-result', planDigest: prepared.input.planDigest, reconcileIntentDigest: intent.digest,
    mode: remote ? 'provider-get' : 'local-only', slot: prepared.slot, recoveryResultDigest: paid?.digest ?? null, localCompletionDigest: remote ? paidLocal?.digest ?? null : local.digest,
    dockerReconciliationDigest: docker?.digest ?? null, state: remote ? paid?.observation.state !== 'uncertain' && paidLocal?.coordinatorReceipt.released ? 'recorded' : 'uncertain'
      : local.localState === 'released' ? 'recorded' : 'uncertain', acceptance: records.verdict ? 'preserved' : 'unknown' });
  await fence.persist(value, { approvalDigest: prepared.digest }); return { status: value.state, intent, result: value };
}
