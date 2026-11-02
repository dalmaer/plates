// One original builder lease, one generation, independent private acceptance.
import { checkEvaluation as check, sealRecord, fingerprint, byteDigest } from './evaluation-records.mjs';
import { runLiveBuilder, runDockerStage } from './evaluation-docker.mjs';
import { reconstructEvaluatorInput } from './evaluation-input-partition.mjs';
import { convertPublicResult } from './evaluation-public-packet.mjs';
import { isExternalCapacityRefusal } from './validation-budget.mjs';
import { liveRecord, liveAuthorization, transferLive, settleLiveSpend } from './evaluation-live-transfer.mjs';
const record = (kind, id, body) => sealRecord({ schemaVersion: 2, kind, id, createdAt: new Date().toISOString(), ...body });
export async function runLiveGeneration(options, prepared, reservation, fence, time) {
  const { task, driver, image } = prepared, request = prepared.loaded.descriptor, id = prepared.identity.identityDigest.slice(0, 32);
  const operations = [`plates-eval-${id}-builder`, ...driver.checks.map((_, i) => `plates-eval-${id}-check-${i}`)];
  const input = { request, planDigest: prepared.input.planDigest, taskDigest: task.digest, configurationDigest: prepared.config.digest,
    checkManifestDigest: task.acceptanceManifest.digest, environment: prepared.binding.environment, image, controller: prepared.controller, model: request.live.model,
    sourceDigest: prepared.binding.partitionIdentityDigest, delivered: prepared.builderFiles, deliveredDigest: fingerprint(prepared.builderFiles) };
  const intent = record('evaluation-intent', id, { slot: prepared.slot, previewDigest: fingerprint(input), input, operations,
    approvedExecution: { approvedAt: Date.parse(time.startedAt), deadlineEpochMs: time.deadlineEpochMs, preparationMs: prepared.preparationMs,
      coverage: 'preparation-plus-admitted-slot-v1' }, dispatchProtocol: 'ordered-live-authorization-v1', attempt: 1, parentAttemptId: null,
    reservedMinutes: task.limits.minutes, repairRounds: 0, interventions: [] });
  await fence.persistExecution(prepared.slot, 'intent', intent);
  const save = async (name, kind, body) => { const r = record(kind, id, { intentDigest: intent.digest, ...body }); await fence.persistExecution(prepared.slot, name, r); return r; };
  const a = request.admission; let lease;
  try { lease = await fence.reserveBuilder({ stateDir: a.stateDir, capacity: a.capacity, weight: a.weight, target: prepared.target, id, commandDigest: intent.previewDigest, operations, deadline: time.deadlineEpochMs }); }
  catch (error) {
    if (!isExternalCapacityRefusal(error)) throw error;
    const refusal = await save('admission-refusal', 'evaluation-admission-refusal', { authority: 'external-admission-refusal-v1', commandDigest: intent.previewDigest, reason: error.code });
    return { status: 'not-admitted', intent, refusal };
  }
  await save('lease', 'evaluation-lease', { lease });
  const deadline = Math.min(Date.now() + task.limits.timeoutSeconds * 1000, time.deadlineEpochMs - (driver.checks.length + 1) * 10000 - 2000);
  check(deadline > Date.now(), 'live builder interval exhausted');
  const observations = operations.map(operation => ({ operation, state: 'not-dispatched' }));
  await save('dispatch-builder', 'evaluation-dispatch', { operation: operations[0], index: 0 });
  let conversionFailure = false;
  await fence.assertOpen();
  const builder = await runLiveBuilder({ name: operations[0], image, files: prepared.builderFiles, allowlist: prepared.view.writablePaths,
    protectedPaths: prepared.protectedPaths, deadline, cleanupDeadline: time.deadlineEpochMs,
    generate: async ({ ready, signal, deadline: providerDeadline }) => {
      await fence.assertOpen(); check(!signal.aborted && Date.now() < providerDeadline, 'live readiness expired');
      const readyReceipt = liveRecord(prepared, 'live-builder-ready', { builderIntentDigest: intent.digest, ready });
      await fence.persist(readyReceipt, { stage: 'generation' });
      const providerIntent = liveRecord(prepared, 'live-generation-intent', { authorization: liveAuthorization(prepared),
        time: { ...time, deadlineEpochMs: providerDeadline }, countResultDigest: request.count.resultDigest, builderIntentDigest: intent.digest,
        readyDigest: readyReceipt.digest, spendReservationDigest: reservation.digest });
      await fence.persist(providerIntent, { stage: 'generation' });
      const transfer = await transferLive(options, prepared, reservation, fence, providerDeadline, AbortSignal.any([signal, fence.signal]));
      let observation;
      if (transfer.response) {
        const { text, ...response } = transfer.response;
        try {
          const bytes = Buffer.from(text, 'utf8');
          const textRecord = liveRecord(prepared, 'live-response-text', { identityDigest: prepared.identity.identityDigest,
            encoding: 'base64', byteDigest: byteDigest(bytes), bytes: bytes.length, base64: bytes.toString('base64') });
          await fence.persist(textRecord, { stage: 'generation' });
          observation = { state: 'observed', response, textDigest: textRecord.digest, error: null };
        } catch {
          observation = { state: 'observed-text-unavailable', response, textDigest: null, error: { code: 'live_text_unavailable', dispatch: 'uncertain' } };
        }
      } else observation = { state: 'uncertain', response: null, textDigest: null, error: transfer.error };
      const result = liveRecord(prepared, 'live-provider-result', { intentDigest: providerIntent.digest, spendDispatchDigest: transfer.dispatch.digest, observation });
      await fence.persist(result, { stage: 'generation' });
      await settleLiveSpend(options, prepared, transfer.dispatch, result, fence);
      check(observation.state === 'observed' && observation.response.status === 'completed' && observation.response.outputLimitExceeded === false, 'original generation incomplete');
      let envelope;
      try { envelope = convertPublicResult({ view: prepared.view, text: transfer.response.text }); reconstructEvaluatorInput(prepared.handle, envelope); }
      catch (error) { conversionFailure = true; throw error; }
      await fence.assertOpen(); check(!signal.aborted && Date.now() < providerDeadline, 'live bridge deadline expired');
      return envelope;
    } });
  observations[0] = builder.termination;
  await save('builder', 'evaluation-stage', { stage: builder });
  let artifact = null, artifactFailure = conversionFailure ? 'public_result_invalid' : null, acceptance = conversionFailure ? 'rejected' : 'unknown';
  let failureCategory = conversionFailure ? 'invalid-submission' : builder.setup === 'passed' ? 'execution' : 'setup';
  const checks = [];
  if (builder.setup === 'passed' && builder.execution === 'passed' && !builder.error && builder.termination.state === 'terminated') {
    try {
      const reconstructed = reconstructEvaluatorInput(prepared.handle, builder.output.stdout);
      artifact = await save('artifact', 'evaluation-artifact', { files: reconstructed.files, filesDigest: fingerprint(reconstructed.files),
        submissionDigest: fingerprint(builder.output.stdout), sourceDigest: input.sourceDigest });
    } catch { artifactFailure = 'partition_submission_invalid'; acceptance = 'rejected'; failureCategory = 'invalid-submission'; }
  }
  if (artifact) {
    for (let i = 0; i < driver.checks.length; i++) {
      const checkDeadline = time.deadlineEpochMs - (driver.checks.length - i) * 10000 - 2000;
      if (Date.now() >= checkDeadline || observations.some(o => o.state === 'unknown')) break;
      const c = driver.checks[i]; await fence.assertOpen();
      await save(`dispatch-check-${i}`, 'evaluation-dispatch', { operation: operations[i + 1], index: i + 1 });
      const stage = await runDockerStage({ name: operations[i + 1], image, files: artifact.files, argv: c.argv, stdin: c.stdin, deadline: checkDeadline, cleanupDeadline: time.deadlineEpochMs });
      observations[i + 1] = stage.termination;
      const retained = await save(`check-${i}`, 'evaluation-stage', { stage });
      const known = stage.setup === 'passed' && !stage.error && stage.output?.signal === null && stage.termination.state === 'terminated';
      checks.push({ id: c.id, status: !known ? 'unknown' : stage.output.exit === c.exitCode && stage.output.stdout === c.stdout ? 'passed' : 'failed', observationDigest: retained.digest });
    }
    acceptance = checks.length !== driver.checks.length || checks.some(c => c.status === 'unknown') ? 'unknown' : checks.every(c => c.status === 'passed') ? 'accepted' : 'rejected';
    failureCategory = acceptance === 'accepted' ? null : acceptance === 'rejected' ? 'acceptance' : 'evaluation';
  }
  const verdict = await save('verdict', 'evaluation-verdict', { artifactDigest: artifact?.digest ?? null, checkManifestDigest: input.checkManifestDigest,
    evaluator: { identity: 'plates-host-stdio-v1', version: 1, controller: input.controller, image }, acceptance, failureCategory, checks, artifactFailure,
    supersedesVerdictId: null, limitations: ['Independent checks establish only this submitted artifact outcome.', 'No cohort efficacy or promotion claim.'] });
  const settlement = await fence.settleBuilder({ stateDir: a.stateDir, capacity: a.capacity, lease, observations, deadline: time.deadlineEpochMs });
  const result = await save('result', 'evaluation-result', { status: settlement.released ? 'terminal' : 'uncertain', verdictDigest: verdict.digest,
    setup: builder.setup, execution: builder.execution, validation: acceptance === 'accepted' ? 'passed' : acceptance === 'rejected' ? 'failed' : 'unknown', settlement,
    resources: { wallMs: Date.now() - Date.parse(time.startedAt), approvedWallMs: prepared.preparationMs + Date.now() - Date.parse(time.startedAt),
      preparationMs: prepared.preparationMs, source: 'observed-clock', coverage: 'live admitted generation and independent checks; prior count separately retained',
      currencyUsd: null, cpuMs: null, activeHumanMinutes: null } });
  return { status: result.status, intent, result, verdict };
}
