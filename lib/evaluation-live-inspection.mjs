// Read-only live projection into the existing trial/report boundary.
import { inspectLiveRecords, validateLiveReceipt } from './evaluation-live-records.mjs';
import { checkEvaluation as check, fingerprint, sealRecord, byteDigest } from './evaluation-records.mjs';
export const livePlan = plan => plan?.bundle?.schemaVersion === 3 && plan.bundle.configurations.every(c => c.policy.execution === 'host-gateway-v1');
export function validateLiveCountRefusal(context, plan) {
  const count = context?.count;
  for (const r of [count?.intent, count?.packet, count?.refusal]) validateLiveReceipt(r, { plan, stage: 'count' });
  check(!count.admission && !count.result && !count.local && !count.spend?.dispatch && !context.builder?.intent
    && count.refusal.intentDigest === count.intent.digest && count.packet.operationId === count.intent.operationId
    && count.intent.packetRecordBytesHash === byteDigest(JSON.stringify(count.packet) + '\n')
    && count.packet.preparation.digest === count.intent.authorization.binding.packetPreparationDigest
    && count.spend?.reservation?.digest === count.intent.spendReservationDigest
    && sealRecord(count.spend.reservation).digest === count.spend.reservation.digest
    && count.spend.reservation.operationId === count.intent.operationId, 'conflicting count refusal');
  return count;
}
export async function inspectLiveExecutions(dir, plan) {
  const live = await inspectLiveRecords(dir, plan);
  const trials = live.slots.map(s => ({ slot: s.slot, records: s.builder, history: [], live: s,
    status: live.gaps.some(g => g.path.includes(s.slot)) ? 'uncertain' : s.count?.refusal || s.generationRefusal ? 'terminal'
      : s.builder.result?.status ?? (!s.builder.intent && s.count?.state === 'observed' ? 'prepared' : 'uncertain'),
    reason: s.generationRefusal && live.gaps.length === 0 ? 'generation-not-admitted' : s.count?.refusal ? 'count-not-admitted' : s.builder.intent ? 'original-live-attempt' : s.count?.state === 'observed' ? 'count-complete-generation-not-started' : 'count-only-no-builder' }));
  return { status: live.effectsBlocked || trials.some(t => t.status === 'uncertain') ? 'uncertain' : 'ready',
    issues: live.gaps, reservation: live.files.find(f => f.path === 'execution/reservation.json' && f.valid)?.record ?? null,
    trials, control: live.reconcile, live };
}
export function validateLiveTrialLinks(records, context, plan) {
  const count = context?.count, generation = context?.generation, ready = context?.ready, intent = records.intent;
  check(intent?.dispatchProtocol === 'ordered-live-authorization-v1', 'live dispatch protocol required');
  if (records.artifact) {
    for (const r of [count?.intent, count?.packet, count?.admission, count?.result, count?.local]) validateLiveReceipt(r, { plan, stage: 'count' });
    for (const r of [ready, generation?.intent, generation?.result, generation?.text]) validateLiveReceipt(r, { plan, stage: 'generation' });
    check(generation.text.digest === generation.result.observation.textDigest && generation.text.operationId === generation.intent.operationId
      && count.result.intentDigest === count.intent.digest && count.local.intentDigest === count.intent.digest
      && count.admission.intentDigest === count.intent.digest && count.local.coordinatorReceipt.operationId === count.intent.operationId,
    'live result predecessor mismatch');
    const countObservation = count.spend?.observations?.find(o => o.outcome === 'complete');
    check(countObservation && sealRecord(countObservation).digest === countObservation.digest
      && countObservation.operationId === count.intent.operationId && countObservation.planDigest === intent.input.planDigest
      && countObservation.evidenceDigest === count.result.digest
      && fingerprint(countObservation.usage) === fingerprint({ inputTokens: 0, outputTokens: 0, requests: 1 }), 'count accounting evidence unavailable');
    check(ready && generation?.intent && generation.result?.observation.state === 'observed'
      && generation.result.observation.response.status === 'completed' && generation.result.observation.response.outputLimitExceeded === false
      && generation.intent.builderIntentDigest === intent.digest && generation.intent.readyDigest === ready.digest
      && ready.builderIntentDigest === intent.digest && generation.result.intentDigest === generation.intent.digest
      && generation.intent.countResultDigest === count?.result?.digest && count?.local?.coordinatorReceipt.released === true
      && count.result.observation.state === 'observed' && count.spend?.complete === true
      && fingerprint(count.intent.authorization.binding) === fingerprint(generation.intent.authorization.binding)
      && fingerprint(intent.input.model) === fingerprint(generation.result.observation.response.model)
      && fingerprint(intent.input.model) === fingerprint(count.result.observation.response.model)
      && records.builder?.stage?.termination?.state === 'terminated', 'live artifact lacks original provider chain');
  }
}
