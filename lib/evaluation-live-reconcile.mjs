// One comparison-wide reconciliation allowance. No generation redispatch and no
// acceptance from recovered text; local-only has no credential/provider effects.
import { fingerprint, sealRecord, checkEvaluation as check } from './evaluation-records.mjs';
import { liveDescriptor, fixedRequestQuote } from './evaluation-live-input.mjs';
import { liveOperationIdentity, planLiveReconcile } from './evaluation-live-records.mjs';
import { controllerIdentity } from './evaluation-provenance.mjs';
import { inspectBudgetTarget } from './validation-budget.mjs';
import { liveAuthorization } from './evaluation-live-transfer.mjs';
const same = (a, b) => fingerprint(a) === fingerprint(b);
export const LIVE_RECOVERY_POLICY = Object.freeze({ attemptsPerAction: 1, operationDeadlineMs: 1000, reconcileMsPerSlot: 10000, cancelMsPerSlot: 10000 });
export async function prepareLiveRecovery(options, state, loaded, invocationStartedAt) {
  check(Number.isSafeInteger(invocationStartedAt) && Date.now() - invocationStartedAt < 10000, 'reconcile preparation exhausted');
  const request = loaded.descriptor;
  check(request.stage === 'recovery' && request.planDigest === state.plan.digest, 'explicit recovery descriptor required');
  const remote = request.mode === 'provider-get';
  check(remote || options.credentialFd === undefined, 'local-only forbids credential pipe');
  check(state.live.reconcile === null && !state.live.files.some(f => f.path === 'execution/control/reconcile-intent.json'), 'original reconcile allowance consumed');
  check(state.retention.fits && state.live.gaps.length === 0, 'recovery evidence or retention unavailable');
  check(!state.lock || state.lock.status === 'recoverable', 'original writer remains active or unverifiable');
  const selected = request.targets[0], slot = selected.pairId + '-' + selected.arm;
  const original = state.live.slots.find(s => s.slot === slot); check(original, 'original slot unavailable');
  let operationKind, originalIntent, admission;
  if (remote) {
    operationKind = 'generation'; originalIntent = original.generation?.intent; admission = original.builder.lease;
    check(!state.closed && state.live.spend?.state === 'ready' && !state.live.spend.admissionClosed, 'paid recovery admission closed');
    check(originalIntent?.digest === selected.generationIntentDigest && originalIntent?.operationId === selected.generationSpendOperationId
      && original.generation.result?.digest === selected.sourceResultDigest && original.generation.result.observation.response?.id === selected.responseId, 'original response binding mismatch');
    for (const field of ['credential', 'scope', 'model']) check(same(request.live[field], originalIntent.authorization[field]), 'original recovery attribution changed');
  } else {
    operationKind = selected.operationKind; originalIntent = operationKind === 'count' ? original.count?.intent : original.generation?.intent ?? original.builder.intent;
    admission = operationKind === 'count' ? original.count?.admission : original.builder.lease;
    const originalId = liveOperationIdentity({ planDigest: state.plan.digest, slot, stage: operationKind }).operationId;
    check(originalIntent?.digest === selected.originalIntentDigest && selected.operationId === originalId
      && selected.admissionReceiptDigest === (admission?.digest ?? null), 'original local binding mismatch');
  }
  const originalOperations = operationKind === 'count' ? admission ? [{ kind: 'owner-observe', operationId: selected.operationId, maximumMs: 1000 }] : []
    : (original.builder.intent?.operations ?? []).map(operationId => ({ kind: 'docker-observe', operationId, maximumMs: 1000 }));
  const identity = remote ? liveOperationIdentity({ planDigest: state.plan.digest, slot, stage: 'recovery', originalGenerationOperationId: originalIntent.operationId }) : null;
  if (remote) originalOperations.push({ kind: 'provider-get', operationId: identity.operationId, maximumMs: 1000 });
  const schedule = planLiveReconcile({ mode: request.mode, originalOperations, elapsedMs: Date.now() - invocationStartedAt, credentialMs: remote ? 1000 : 0, writeCleanupMs: 2000 });
  const sourceAuth = originalIntent.authorization;
  // Count has no builder intent; its exact retained descriptor supplies the
  // original coordinator policy. Missing source is a gap, never a new authority.
  const sourcePath = sourceAuth?.descriptorPath ?? original.builder.intent?.input?.requestPath;
  let source;
  if (sourceAuth) {
    source = await liveDescriptor(sourcePath, state.plan);
    check(source.descriptorHash === sourceAuth.descriptorHash, 'original descriptor unavailable');
    const d = source.descriptor;
    check(['count', 'generation'].includes(d.stage) && fingerprint({ stage: d.stage, packetDigest: d.packet.packetDigest,
      model: d.live.model, scope: d.live.scope, credential: d.live.credential, credentialChannel: 'pipe-json-v1', limits: d.limits }) === sourceAuth.requestDigest,
    'original request specification mismatch');
  } else {
    check(operationKind === 'generation' && !remote, 'original recovery descriptor unavailable');
    source = { descriptor: original.builder.intent.input.request };
  }
  const a = source.descriptor.admission, controller = await controllerIdentity();
  let target = null;
  if (remote) {
    const deadline = invocationStartedAt + 10000 - schedule.steps.reduce((n, s) => n + s.maximumMs, schedule.writeCleanupMs);
    check(Date.now() < deadline, 'recovery target preparation exhausted');
    target = await inspectBudgetTarget({ manifest: a.manifest, root: source.descriptor.repository, repo: a.repo, deadline });
  }
  planLiveReconcile({ mode: request.mode, originalOperations, elapsedMs: Date.now() - invocationStartedAt, credentialMs: remote ? 1000 : 0, writeCleanupMs: schedule.writeCleanupMs });
  const quote = remote ? fixedRequestQuote('recovery', originalIntent.authorization.binding.packetDigest, request.live) : null;
  const binding = remote ? originalIntent.authorization.binding : null;
  const requestDigest = remote ? fingerprint({ stage: 'recovery', originalGenerationOperationId: originalIntent.operationId,
    generationIntentDigest: originalIntent.digest, sourceResultDigest: selected.sourceResultDigest, responseId: selected.responseId,
    scope: request.live.scope, credential: request.live.credential, model: request.live.model, credentialChannel: 'pipe-json-v1' }) : null;
  const localTarget = remote ? null : { mode: 'local-only', slot, operationKind, operationId: selected.operationId, originalIntentDigest: originalIntent.digest,
    admissionReceiptDigest: admission?.digest ?? null, leaseDigest: admission ? fingerprint(admission.lease) : null };
  const input = { schemaVersion: 1, planDigest: state.plan.digest, descriptorPath: loaded.descriptorPath, descriptorHash: loaded.descriptorHash,
    snapshotDigest: state.snapshot, lock: state.lock, controllerDigest: controller.digest, target: remote ? selected : localTarget,
    binding, identity, quote, requestDigest, schedule, admission: a, inspectedTarget: target };
  const prepared = { loaded, input, digest: fingerprint(input), identity, binding, quote, requestDigest, descriptorPath: loaded.descriptorPath, descriptorHash: loaded.descriptorHash,
    slot, original, originalIntent, admission, coordinatorPolicy: a, target, responseId: selected.responseId, controller, schedule, operationKind };
  prepared.reconcileTarget = remote ? { mode: 'provider-get', slot, generationOperationId: originalIntent.operationId, generationIntentDigest: originalIntent.digest,
    sourceResultDigest: selected.sourceResultDigest, responseId: selected.responseId, authorization: liveAuthorization(prepared) } : localTarget;
  return prepared;
}
export function liveReconcileIntent(prepared, invocationStartedAt) {
  return sealRecord({ schemaVersion: 1, kind: 'live-reconcile-intent', planDigest: prepared.input.planDigest, approvalDigest: prepared.digest,
    descriptorPath: prepared.descriptorPath, descriptorHash: prepared.descriptorHash, snapshotDigest: prepared.input.snapshotDigest,
    controllerDigest: prepared.controller.digest, startedAt: new Date(invocationStartedAt).toISOString(), deadlineEpochMs: invocationStartedAt + 10000,
    policy: LIVE_RECOVERY_POLICY, schedule: prepared.schedule, target: prepared.reconcileTarget });
}
