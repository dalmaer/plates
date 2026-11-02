// Installed one-slot controller. Authority enters only through ledger scope and
// readFrozen; partition handles and authored descriptors never establish it.
import { checkEvaluation as check, sealRecord } from './evaluation-records.mjs';
import { withEvaluationWriter, evaluationLiveFence } from './evaluation-ledger.mjs';
import { liveDescriptor } from './evaluation-live-input.mjs';
import { readLiveState, originalLiveAttempt, prepareLiveRun } from './evaluation-live-state.mjs';
import { reserveLiveSpend, runLiveCount } from './evaluation-live-transfer.mjs';
import { runLiveGeneration } from './evaluation-live-generation.mjs';
import { prepareLiveRecovery, liveReconcileIntent } from './evaluation-live-reconcile.mjs';
import { executeLiveRecovery } from './evaluation-live-recovery-execution.mjs';

export async function runLiveEvaluation(options, ledgerApi, invocationStartedAt) {
  check(Number.isSafeInteger(invocationStartedAt) && invocationStartedAt <= Date.now(), 'approved invocation clock required');
  const state = await readLiveState(options, ledgerApi), loaded = await liveDescriptor(options.execution, state.plan);
  check(loaded.descriptor.stage !== 'recovery', 'recovery requires reconcile');
  const previous = originalLiveAttempt(state, loaded);
  if (previous) {
    check(options.yes && options.digest === previous.original.authorization.approvalDigest, 'original live approval required');
    return { action: 'run', stage: loaded.descriptor.stage, preview: false, recovered: true, slot: previous.slot,
      status: previous.existing[loaded.descriptor.stage]?.state ?? 'uncertain', execution: previous.existing, efficacy: 'unavailable' };
  }
  check(!state.lock, 'storage locked; explicit verified recovery required');
  const prepared = await prepareLiveRun(options, state, loaded, invocationStartedAt);
  if (!options.yes) return prepared.publicPreview;
  check(options.digest === prepared.digest, 'stale or missing live preview digest');
  check(process.platform === 'darwin', 'credential pipe unsupported on this host');
  check(Number.isInteger(options.credentialFd) && options.credentialFd >= 3, 'approved live action requires credential pipe');
  return withEvaluationWriter(options, async () => {
    const current = await readLiveState(options, ledgerApi), descriptor = await liveDescriptor(options.execution, current.plan);
    const next = await prepareLiveRun(options, current, descriptor, invocationStartedAt);
    check(next.digest === prepared.digest, 'live inputs changed before mutation');
    const started = Date.now(), remaining = next.totalMs - next.priorChargedMs - next.preparationMs;
    const reservedMs = descriptor.descriptor.stage === 'count' ? descriptor.descriptor.limits.timeoutMs + 3000 : remaining;
    check(reservedMs > 0 && reservedMs <= remaining, 'approved live invocation time exhausted');
    const time = { startedAt: new Date(started).toISOString(), deadlineEpochMs: started + reservedMs, reservedMs,
      priorChargedMs: next.priorChargedMs + next.preparationMs };
    const fence = await evaluationLiveFence(options, { planDigest: current.plan.digest, deadline: time.deadlineEpochMs - 500, cleanupDeadline: time.deadlineEpochMs });
    if (!current.live.files.some(f => f.path === 'execution/reservation.json')) {
      await fence.persistReservation(sealRecord({ schemaVersion: 2, kind: 'evaluation-reservation', id: options.experiment, createdAt: new Date().toISOString(),
        planDigest: current.plan.digest, allowance: current.plan.bundle.comparison.allowance, currencyUsage: null }));
    }
    const reservation = await reserveLiveSpend(options, next, fence);
    const result = descriptor.descriptor.stage === 'count' ? await runLiveCount(options, next, reservation, fence, time)
      : await runLiveGeneration(options, next, reservation, fence, time);
    return { action: 'run', stage: descriptor.descriptor.stage, preview: false, recovered: false, slot: next.slot, ...result, efficacy: 'unavailable' };
  });
}

export async function reconcileLiveEvaluation(options, ledgerApi, invocationStartedAt) {
  check(Number.isSafeInteger(invocationStartedAt) && invocationStartedAt <= Date.now(), 'approved invocation clock required');
  const state = await readLiveState(options, ledgerApi), loaded = await liveDescriptor(options.execution, state.plan);
  check(loaded.descriptor.stage === 'recovery', 'reconcile requires recovery descriptor');
  check(loaded.descriptor.mode !== 'local-only' || options.credentialFd === undefined, 'local-only forbids credential pipe');
  const original = state.live.reconcile?.intent;
  if (original) {
    check(original.descriptorPath === loaded.descriptorPath && original.descriptorHash === loaded.descriptorHash
      && options.yes && options.digest === original.approvalDigest, 'original reconcile approval required');
    return { action: 'reconcile', preview: false, recovered: true, status: state.live.reconcile.result?.state ?? 'uncertain',
      receipt: state.live.reconcile, efficacy: 'unavailable' };
  }
  const prepared = await prepareLiveRecovery(options, state, loaded, invocationStartedAt);
  if (!options.yes) return { action: 'reconcile', preview: true, digest: prepared.digest, input: prepared.input, efficacy: 'unavailable' };
  check(options.digest === prepared.digest, 'stale or missing live reconcile digest');
  if (loaded.descriptor.mode === 'provider-get') {
    check(process.platform === 'darwin', 'credential pipe unsupported on this host');
    check(Number.isInteger(options.credentialFd) && options.credentialFd >= 3, 'approved GET requires credential pipe');
  }
  return withEvaluationWriter(options, async () => {
    const current = await readLiveState(options, ledgerApi), descriptor = await liveDescriptor(options.execution, current.plan);
    // Acquisition has independently verified/replaced the exact old lock. The
    // approved snapshot retains that old observation, never the new owner's ID.
    const next = await prepareLiveRecovery(options, { ...current, lock: state.lock }, descriptor, invocationStartedAt);
    check(next.digest === prepared.digest, 'reconcile source changed before mutation');
    const intent = liveReconcileIntent(next, invocationStartedAt);
    const fence = await evaluationLiveFence(options, { planDigest: current.plan.digest, deadline: intent.deadlineEpochMs - 500, cleanupDeadline: intent.deadlineEpochMs });
    await fence.persist(intent, { plan: current.plan });
    const result = await executeLiveRecovery(options, next, intent, fence);
    return { action: 'reconcile', preview: false, recovered: false, ...result, efficacy: 'unavailable' };
  }, state.lock ? { recover: state.lock } : undefined);
}
