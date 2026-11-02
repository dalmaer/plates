// Controller-private preparation from the existing ledger's scope/readFrozen.
// Nothing in this module grants dispatch, consumes a credential or writes state.
import { join } from 'node:path';
import { checkEvaluation as check, fingerprint, evaluationId } from './evaluation-records.mjs';
import { inspectHarnessLock } from './session-ledger-io.mjs';
import { admissionClosed } from './evaluation-execution.mjs';
import { inspectLiveRecords, liveRetentionPlan } from './evaluation-live-records.mjs';
import { liveDescriptor, liveSlot, prepareLiveInput } from './evaluation-live-input.mjs';
import { livePlan } from './evaluation-live-inspection.mjs';
import { preflightDocker } from './evaluation-docker.mjs';
const same = (a, b) => fingerprint(a) === fingerprint(b);
export async function readLiveState(options, { scope, readFrozen }) {
  check(evaluationId(options.experiment) && options.bundle === undefined, 'live action needs frozen experiment');
  const bound = await scope(options), home = join(bound.paths.state, 'session-trials'), dir = join(home, options.experiment);
  const ledger = await readFrozen(dir, bound, options.experiment), plan = ledger.plan;
  check(livePlan(plan), 'explicit live policy required');
  const live = await inspectLiveRecords(dir, plan), lock = await inspectHarnessLock(home);
  const retention = liveRetentionPlan({ plan, files: live.files, frozenUsage: live.frozenUsage });
  const snapshot = fingerprint({ planDigest: plan.digest, files: live.files.map(f => ({ path: f.path, bytes: f.bytes, valid: f.valid,
    digest: f.record?.digest ?? null })), gaps: live.gaps, spend: live.spend, frozenUsage: live.frozenUsage });
  return { bound, home, dir, ledger, plan, live, lock, retention, snapshot, closed: await admissionClosed(dir) };
}
export function originalLiveAttempt(state, loaded) {
  const request = loaded.descriptor;
  check(['count', 'generation'].includes(request.stage), 'unsupported run stage');
  const { slot } = liveSlot(state.plan, request.pairId, request.arm), existing = state.live.slots.find(s => s.slot === slot);
  const original = request.stage === 'count' ? existing?.count?.intent : existing?.generation?.intent;
  if (!original) return null;
  check(original.authorization.descriptorHash === loaded.descriptorHash && original.authorization.descriptorPath === loaded.descriptorPath, 'original live descriptor changed');
  return { original, existing, slot };
}
export async function prepareLiveRun(options, state, loaded, invocationStartedAt) {
  check(Number.isSafeInteger(invocationStartedAt) && invocationStartedAt <= Date.now(), 'live invocation clock required');
  const started = invocationStartedAt, request = loaded.descriptor, stage = request.stage;
  check(['count', 'generation'].includes(stage), 'run needs count or generation descriptor');
  check(state.live.gaps.length === 0 && !state.live.effectsBlocked && state.retention.fits, 'live retained state or capacity unavailable');
  check(!state.closed && (!state.live.spend || state.live.spend.state === 'not-configured' || !state.live.spend.admissionClosed), 'live admission closed');
  const { slot } = liveSlot(state.plan, request.pairId, request.arm), existing = state.live.slots.find(s => s.slot === slot);
  check(stage === 'count' ? !existing : !existing?.generation && !existing?.builder?.intent, 'original live slot already reserved');
  const count = existing?.count;
  if (stage === 'generation') {
    check(count?.state === 'observed' && count.local?.coordinatorReceipt.released && count.spend?.complete, 'completed original count required');
    const original = await liveDescriptor(count.intent.authorization.descriptorPath, state.plan);
    check(original.descriptorHash === count.intent.authorization.descriptorHash && original.descriptor.stage === 'count'
      && count.result.observation.response.inputTokens <= original.descriptor.limits.maxCountedInputTokens, 'original count threshold unavailable or exceeded');
    for (const field of ['credential', 'scope', 'model']) check(same(request.live[field], count.intent.authorization[field]), 'original count attribution changed');
  }
  const prepared = await prepareLiveInput(options, state.plan, loaded, count?.result);
  check(!state.live.spend?.operations.some(op => op.reservation.operationId === prepared.identity.operationId), 'original spend operation already reserved');
  if (stage === 'generation') check(same(prepared.binding, count.intent.authorization.binding), 'original count preparation changed');
  const priorChargedMs = stage === 'generation' ? count.local.chargedMs : 0;
  const totalMs = Math.floor(prepared.task.limits.minutes * 60000), cleanupMs = 2000;
  const requiredMs = request.limits.timeoutMs + 1000 + cleanupMs + (stage === 'generation' ? (prepared.driver.checks.length + 1) * 10000 : 0);
  check(requiredMs + priorChargedMs + Date.now() - started < totalMs, 'live trial time unavailable');
  const plannedMinutes = state.plan.bundle.comparison.pairs.reduce((sum, p) => sum + 2 * state.plan.bundle.cases.find(c => c.digest === p.case.digest).limits.minutes, 0);
  check(plannedMinutes + state.plan.bundle.comparison.pairs.length * 2 / 3 <= state.plan.bundle.comparison.allowance.minutes, 'comparison recovery time unavailable');
  const image = stage === 'generation' ? await preflightDocker(prepared.binding.environment, { deadline: started + Math.min(10000, totalMs - priorChargedMs - requiredMs) }) : null;
  const input = { schemaVersion: 1, stage, planDigest: state.plan.digest, destination: state.dir, descriptorPath: loaded.descriptorPath,
    descriptorHash: loaded.descriptorHash, binding: prepared.binding, identity: prepared.identity, quote: prepared.quote, requestDigest: prepared.requestDigest,
    snapshot: state.snapshot, admissionManifestHash: prepared.admissionManifestHash, target: prepared.target, image,
    priorChargedMs, maximumReservedMs: totalMs - priorChargedMs, retention: state.retention };
  const digest = fingerprint(input);
  return { ...prepared, image, input, digest, priorChargedMs, totalMs, cleanupMs, preparationMs: Date.now() - started,
    publicPreview: { action: 'run', stage, preview: true, digest, input, efficacy: 'unavailable' } };
}
