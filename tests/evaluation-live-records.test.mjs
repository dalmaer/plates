// Synthetic Acme receipt graphs only. No providers, credentials, Docker or private corpus reads.
import './helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, rm, chmod, writeFile, symlink, link } from 'node:fs/promises';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { acmeCaseEnvironments } from './helpers/evaluation-plan.mjs';
import { sealRecord, fingerprint, byteDigest, canonical } from '../lib/evaluation-records.mjs';
import { quoteSpend } from '../lib/evaluation-spend.mjs';
import { prepareEvaluationProviderPacket } from '../lib/evaluation-provider.mjs';
import { PUBLIC_PACKET_TEMPLATE } from '../lib/evaluation-public-packet.mjs';
import { storeImmutable } from '../lib/session-ledger-io.mjs';
import { parseLiveDescriptor, validateLiveReceipt, liveOperationIdentity, liveReceiptPath, inspectLiveInventory, inspectLiveRecords, liveRetentionPlan, planLiveReconcile } from '../lib/evaluation-live-records.mjs';
const H = 'a'.repeat(64), T = '2026-11-01T00:00:00.000Z', epoch = Date.parse(T), ref = r => ({ kind: r.kind, id: r.id, digest: r.digest });
const bytes = r => Buffer.byteLength(JSON.stringify(r) + '\n');
const model = { requested: 'acme-alias', resolved: 'acme-resolved' }, scope = { organization: 'acme-org', project: 'acme-project' };
function fixture() {
  const b = acmeCaseEnvironments();
  b.materials = b.materials.map(m => sealRecord({ ...m, mediaType: 'application/json', content: JSON.stringify({ schemaVersion: 1, driver: 'stdio-v1', checks: [{ id: 'acme-check', argv: ['node', '/work/probes/acme-check.mjs'], stdin: '', stdout: 'Acme success', exitCode: 0 }] }) }));
  b.cases = b.cases.map(c => ({ ...c, acceptanceManifest: ref(b.materials[0]) }));
  b.cases = b.cases.map(c => sealRecord({ ...c, limits: { ...c.limits, currencyUsd: 1 } }));
  b.configurations = b.configurations.map(c => sealRecord({ ...c, provider: 'openai', routing: { ...c.routing, provider: 'openai' }, model: { ...model, unresolvedReason: null },
    policy: { ...c.policy, execution: 'host-gateway-v1' }, runtime: { name: 'single-generation-container-v1', version: '1.0.0', settings: { temperature: null, maxTokens: 1000 } },
    environments: [...b.cases].sort((a, b) => a.id.localeCompare(b.id)).map(c => ({ case: ref(c), environment: c.environment })) }));
  b.comparison = sealRecord({ ...b.comparison, cases: b.cases.map(ref), baseline: ref(b.configurations[0]), candidate: ref(b.configurations[1]),
    pairs: b.comparison.pairs.map(p => ({ ...p, case: ref(b.cases.find(c => c.id === p.case.id)) })), allowance: { minutes: 1000, currencyUsd: 100 }, retention: { days: 30, maxBytes: 67108864, maxEvents: 20000 } });
  const plan = { schemaVersion: 2, digest: fingerprint(b), bundle: b }, slot = b.comparison.pairs[0].id + '-baseline', task = b.cases.find(c => c.id === b.comparison.pairs[0].case.id);
  const countOp = liveOperationIdentity({ planDigest: plan.digest, slot, stage: 'count' });
  const generationOp = liveOperationIdentity({ planDigest: plan.digest, slot, stage: 'generation' });
  const recoveryOp = liveOperationIdentity({ planDigest: plan.digest, slot, stage: 'recovery', originalGenerationOperationId: generationOp.operationId });
  const payload = { schemaVersion: 1, kind: 'evaluation-public-packet', publicBrief: task.publicBrief, requirements: task.requirements, files: [{ path: task.allowlist.paths[0], mode: '100644', content: 'Acme' }], writablePaths: task.allowlist.paths };
  const view = { schemaVersion: 1, kind: 'evaluation-public-input', publicBrief: payload.publicBrief, requirements: payload.requirements, files: [{ path: task.allowlist.paths[0], mode: '100644', base64: Buffer.from('Acme').toString('base64') }], writablePaths: payload.writablePaths };
  const packet = { instructions: PUBLIC_PACKET_TEMPLATE, input: canonical(payload) }, { packetDigest } = prepareEvaluationProviderPacket({ model, packet });
  const preparation = sealRecord({ schemaVersion: 1, kind: 'evaluation-public-packet-preparation', model, packet, packetDigest, publicViewDigest: fingerprint(view), templateVersion: 'evaluation-public-packet-v1', templateDigest: byteDigest(PUBLIC_PACKET_TEMPLATE), responseFormat: 'utf8-file-replacements-v1', converterVersion: 'utf8-file-replacements-v1' });
  const binding = { case: ref(task), configuration: ref(b.configurations[0]), environment: task.environment, partitionIdentityDigest: H, publicViewDigest: preparation.publicViewDigest, packetPreparationDigest: preparation.digest, packetDigest, templateDigest: preparation.templateDigest, converterVersion: preparation.converterVersion, controllerDigest: H, bridgeDigest: H };
  const rate = { microUsd: 0, units: 1 }, rates = Object.fromEntries(['count', 'generation', 'recovery'].map(k => [k, { inputTokens: rate, outputTokens: rate, requests: { microUsd: 10, units: 1 } }]));
  const priceEvidence = { schemaVersion: 1, sourceHash: H, observedAt: T, validUntil: '2027-11-01T00:00:00.000Z', model: model.resolved, serviceTier: 'default', scope, rates };
  const quote = quoteSpend({ kind: 'count', packetDigest, inputTokens: 0, maxOutputTokens: 0, priceEvidence });
  const authorization = { identityDigest: countOp.identityDigest, descriptorPath: '/Acme/count.json', descriptorHash: H, approvalDigest: H, binding, credential: { ref: 'acme-key', generation: 1 }, credentialChannel: 'pipe-json-v1', scope, model, quoteDigest: quote.digest, requestDigest: H };
  const R = (kind, body, op = countOp) => sealRecord({ schemaVersion: 1, kind, planDigest: plan.digest, slot, operationId: op.operationId, ...body });
  const spendReservation = sealRecord({ schemaVersion: 1, kind: 'spend-operation', planDigest: plan.digest, trialId: slot, operationId: countOp.operationId, operationKind: 'count', requestDigest: H, quoteDigest: quote.digest, priceDigest: quote.priceDigest, maximumMicroUsd: quote.maximumMicroUsd, quote });
  const packetRecord = R('live-public-packet', { identityDigest: countOp.identityDigest, preparation });
  const intent = R('live-count-intent', { authorization, time: { startedAt: T, deadlineEpochMs: epoch + 10000, reservedMs: 10000, priorChargedMs: 0 }, spendReservationDigest: spendReservation.digest, packetRecordBytesHash: byteDigest(JSON.stringify(packetRecord) + '\n') });
  const lease = { id: countOp.identityDigest.slice(0, 32), pid: 12345, uid: 501, host: 'Acme-host', repo: b.comparison.repository, root: '/Acme/repository', revision: 'a'.repeat(40), dirty: false, foregroundContract: 'in-process-request-v1', weight: 1, createdAt: T, commandDigest: H, childPid: null, state: 'reserved', operationId: countOp.operationId, requestKind: 'count', deadlineEpochMs: epoch + 10000 };
  const admission = R('live-request-admission', { intentDigest: intent.digest, lease });
  const dispatch = sealRecord({ schemaVersion: 1, kind: 'spend-dispatch', planDigest: plan.digest, operationId: countOp.operationId, reservationDigest: spendReservation.digest });
  const result = R('live-provider-result', { intentDigest: intent.digest, spendDispatchDigest: dispatch.digest, observation: { state: 'observed', response: { schemaVersion: 1, kind: 'evaluation-provider-count', provider: 'openai', model, packetDigest, inputTokens: 20, requestedServiceTier: 'default' }, error: null } });
  const settlement = { id: lease.id, foregroundContract: lease.foregroundContract, commandDigest: lease.commandDigest, operationId: lease.operationId, repo: lease.repo, root: lease.root, createdAt: T, endedAt: '2026-11-01T00:00:01.000Z', observation: { state: 'transport-closed' }, released: true };
  const local = R('live-local-completion', { intentDigest: intent.digest, coordinatorReceipt: settlement, chargedMs: 1000 });
  const live = { provider: 'openai', credential: authorization.credential, scope, model, serviceTier: 'default', retention: { store: true }, priceEvidence };
  const descriptor = { schemaVersion: 2, stage: 'count', planDigest: plan.digest, pairId: b.comparison.pairs[0].id, arm: 'baseline', repository: '/Acme/repository', sourcePaths: task.allowlist.paths, admission: { stateDir: '/Acme/admission', manifest: '/Acme/manifest.json', capacity: 2, weight: 1, repo: b.comparison.repository }, live,
    packet: { format: 'evaluation-public-packet-v1', templateDigest: preparation.templateDigest, packetDigest, responseFormat: preparation.responseFormat, converterVersion: preparation.converterVersion, controllerDigest: H, bridgeDigest: H }, billing: { schemaVersion: 1, basis: 'fixed-request-v1' }, limits: { timeoutMs: 1000, maxCountedInputTokens: 2000 } };
  return { plan, slot, countOp, generationOp, recoveryOp, R, packetRecord, intent, admission, dispatch, result, local, spendReservation, descriptor };
}
const rejects = fn => assert.throws(fn, e => e.code === 'evaluation_live_records_invalid' && e.message === e.code && e.exitCode === 2 && e.cause === undefined);
async function world(t, f = fixture()) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'acme-live-records-'))); await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const put = async (path, r) => { await mkdir(dirname(join(directory, path)), { recursive: true, mode: 0o700 }); await storeImmutable(join(directory, path), r); };
  const spendHome = `spend/operations/${f.countOp.operationId}`;
  const comparison = sealRecord({ schemaVersion: 1, kind: 'spend-reservation', planDigest: f.plan.digest, ceilingMicroUsd: 100000000, trials: f.plan.bundle.comparison.pairs.flatMap(p => ['baseline', 'candidate'].map(arm => ({ trialId: p.id + '-' + arm, caseDigest: p.case.digest, ceilingMicroUsd: 1000000 }))) });
  await put('spend/reservation.json', comparison);
  await put(spendHome + '.intent.json', sealRecord({ schemaVersion: 1, kind: 'spend-operation-initialization', reservation: f.spendReservation }));
  await put(spendHome + '/reservation.json', f.spendReservation);
  await mkdir(join(directory, spendHome, 'observations'), { mode: 0o700 });
  await put(liveReceiptPath(f.packetRecord), f.packetRecord); await put(liveReceiptPath(f.intent), f.intent);
  return { ...f, directory, put, spendHome };
}

test('closed live descriptors retain exact variants and refuse unsupported pricing and fields', () => {
  const f = fixture(), raw = d => Buffer.from(JSON.stringify(d));
  assert.deepEqual(parseLiveDescriptor(raw(f.descriptor), { plan: f.plan }), f.descriptor);
  const generation = { ...f.descriptor, stage: 'generation', count: { operationId: f.countOp.operationId, resultDigest: f.result.digest }, limits: { timeoutMs: 1000, maxOutputTokens: 1000 } }; delete generation.billing;
  assert.equal(parseLiveDescriptor(raw(generation), { plan: f.plan }).stage, 'generation');
  for (const mutate of [d => { d.key = 'Acme-private-canary'; }, d => { d.live.model.resolved = 'wrong'; }, d => { d.live.priceEvidence.rates.count.inputTokens.microUsd = 1; }, d => { d.admission.weight = 3; }, d => { d.sourcePaths.push(d.sourcePaths[0]); }, d => { d.repository += '/..'; }, d => { d.limits.timeoutMs = 600001; }]) {
    const d = structuredClone(f.descriptor); mutate(d); rejects(() => parseLiveDescriptor(raw(d), { plan: f.plan }));
  }
  rejects(() => parseLiveDescriptor(Buffer.from('{"schemaVersion":2,"schemaVersion":2}')));
  rejects(() => parseLiveDescriptor(Buffer.from([0xff])));
  rejects(() => parseLiveDescriptor(Buffer.alloc(65537, 32)));
});

test('local-only recovery has no paid fields and operation identities never depend on editable metadata', () => {
  const f = fixture(), target = { pairId: f.descriptor.pairId, arm: 'baseline', operationKind: 'count', operationId: f.countOp.operationId, originalIntentDigest: f.intent.digest, admissionReceiptDigest: null };
  const local = { schemaVersion: 2, stage: 'recovery', mode: 'local-only', planDigest: f.plan.digest, targets: [target] };
  assert.deepEqual(parseLiveDescriptor(Buffer.from(JSON.stringify(local)), { plan: f.plan }), local);
  rejects(() => parseLiveDescriptor(Buffer.from(JSON.stringify({ ...local, live: f.descriptor.live }))));
  assert.equal(f.countOp.operationId.length, 63); assert.notEqual(f.countOp.operationId, f.generationOp.operationId); assert.notEqual(f.generationOp.operationId, f.recoveryOp.operationId);
  rejects(() => liveOperationIdentity({ planDigest: f.plan.digest, slot: f.slot, stage: 'count', approvalDigest: H }));
});

test('receipt schemas bind fixed packet identity, full operation identity and exact predecessor values', () => {
  const f = fixture();
  for (const r of [f.intent, f.packetRecord, f.admission, f.result, f.local]) assert.deepEqual(validateLiveReceipt(r, { plan: f.plan }), r);
  for (const mutate of [r => { r.extra = 'Acme-private-canary'; }, r => { r.operationId = f.generationOp.operationId; }, r => { r.authorization.binding.case.digest = H; }, r => { r.authorization.model.resolved = 'wrong'; }, r => { r.time.deadlineEpochMs += 1; }]) {
    const r = structuredClone(f.intent); mutate(r); rejects(() => validateLiveReceipt(sealRecord(r), { plan: f.plan }));
  }
  const packet = structuredClone(f.packetRecord); packet.preparation.packet.instructions = 'Acme invented prompt'; packet.preparation = sealRecord(packet.preparation);
  rejects(() => validateLiveReceipt(sealRecord(packet), { plan: f.plan }));
  const wrong = structuredClone(f.local); wrong.coordinatorReceipt.observation.state = 'unknown'; rejects(() => validateLiveReceipt(sealRecord(wrong), { plan: f.plan }));
});

test('reconcile planner budgets the complete list, credential and cleanup once within ten seconds', () => {
  const base = { mode: 'provider-get', originalOperations: [{ kind: 'docker-observe', operationId: 'Acme-builder', maximumMs: 1000 }, { kind: 'provider-get', operationId: 'acme-get', maximumMs: 1000 }], elapsedMs: 1000, credentialMs: 1000, writeCleanupMs: 1000 };
  const s = planLiveReconcile(base); assert.equal(s.maximumMs, 10000); assert.equal(s.steps.length, 3); assert.equal(s.steps.filter(x => x.kind === 'credential-read').length, 1);
  rejects(() => planLiveReconcile({ ...base, originalOperations: [...Array.from({ length: 9 }, (_, i) => ({ kind: 'docker-observe', operationId: `acme-${i}`, maximumMs: 1000 })), base.originalOperations[1]] }));
  rejects(() => planLiveReconcile({ ...base, elapsedMs: 6001 }));
  rejects(() => planLiveReconcile({ ...base, mode: 'local-only' }));
  rejects(() => planLiveReconcile({ ...base, originalOperations: [base.originalOperations[1], base.originalOperations[0]] }));
  assert.equal(planLiveReconcile({ mode: 'local-only', originalOperations: [{ kind: 'owner-observe', operationId: 'acme-count', maximumMs: 1000 }], elapsedMs: 8000, credentialMs: 0, writeCleanupMs: 1000 }).steps.length, 1);
});

test('count-only graph is visible without builder intent and strict predecessors block effects', async t => {
  const w = await world(t); let p = await inspectLiveRecords(w.directory, w.plan);
  assert.equal(p.state, 'uncertain'); assert.equal(p.slots[0].count.state, 'reserved'); assert.deepEqual(p.slots[0].builder, {});
  await w.put(liveReceiptPath(w.admission), w.admission); await w.put(w.spendHome + '/dispatch.json', w.dispatch);
  p = await inspectLiveRecords(w.directory, w.plan); assert.equal(p.state, 'uncertain'); assert.equal(p.effectsBlocked, true);
  await w.put(liveReceiptPath(w.result), w.result); await w.put(liveReceiptPath(w.local), w.local);
  p = await inspectLiveRecords(w.directory, w.plan); assert.deepEqual(p.gaps, []); assert.equal(p.slots[0].count.state, 'uncertain', 'transport evidence without spend accounting is not readiness');
  await w.put(w.spendHome + '/observations/1.json', sealRecord({ schemaVersion: 1, kind: 'spend-observation', planDigest: w.plan.digest, operationId: w.countOp.operationId, observationId: 'acme-count-observed', previousDigest: w.dispatch.digest, outcome: 'complete', usage: { inputTokens: 0, outputTokens: 0, requests: 1 }, evidenceDigest: w.result.digest, reservationDigest: w.spendReservation.digest, sequence: 1 }));
  p = await inspectLiveRecords(w.directory, w.plan); assert.deepEqual(p.gaps, []); assert.equal(p.slots[0].count.state, 'observed');
  const path = liveReceiptPath(w.result); await rm(join(w.directory, path)); await w.put(path, sealRecord({ ...w.result, intentDigest: H }));
  p = await inspectLiveRecords(w.directory, w.plan); assert.equal(p.state, 'gap'); assert.equal(p.effectsBlocked, true);
});

test('immutable modes, exact bytes, unknown files and symlink/hardlink records remain gaps', async t => {
  const w = await world(t), path = join(w.directory, liveReceiptPath(w.intent));
  await chmod(path, 0o600); assert.equal((await inspectLiveRecords(w.directory, w.plan)).state, 'gap'); await chmod(path, 0o400);
  await writeFile(join(w.directory, 'execution/unknown.json'), 'Acme-private-canary', { mode: 0o400 });
  let p = await inspectLiveRecords(w.directory, w.plan); assert.equal(p.effectsBlocked, true); assert.ok(p.files.some(f => f.path === 'execution/unknown.json' && !f.valid));
  assert.ok(!JSON.stringify(p.gaps).includes('Acme-private-canary')); await rm(join(w.directory, 'execution/unknown.json'));
  const backup = join(w.directory, 'outside'); await link(path, backup); assert.equal((await inspectLiveRecords(w.directory, w.plan)).state, 'gap'); await rm(backup);
  await rm(path); await symlink('/Acme/nonexistent', path); assert.equal((await inspectLiveRecords(w.directory, w.plan)).state, 'gap');
});

test('retention replaces retained receipt maxima, preserves pending descendants and counts unknown bytes', async t => {
  const w = await world(t), p = await inspectLiveRecords(w.directory, w.plan);
  const empty = liveRetentionPlan({ plan: w.plan, files: [], frozenUsage: { bytes: 1000, count: 2 } });
  assert.equal(empty.totalBytes, 56221696 + 1000); assert.equal(empty.totalEvents, 1342 + 2);
  const current = liveRetentionPlan({ plan: w.plan, files: p.files, frozenUsage: p.frozenUsage });
  assert.equal(current.fits, true); assert.ok(current.totalBytes < empty.totalBytes);
  const admittedBytes = p.files.reduce((n, f) => n + f.bytes, 0), replaced = 16384 * 4 + 270336;
  assert.equal(current.totalBytes, 56221696 - replaced + admittedBytes);
  assert.equal(current.totalEvents, 1342); // Valid files replace, not add to, their future event allowances.
  const pending = p.files.map(f => f.path.endsWith('/reservation.json') && f.path.includes('/operations/') ? { ...f, valid: false } : f);
  const held = liveRetentionPlan({ plan: w.plan, files: pending, frozenUsage: p.frozenUsage }); assert.equal(held.fits, false); assert.equal(held.totalBytes, current.totalBytes + 16384);
  const foreign = liveRetentionPlan({ plan: w.plan, files: [...p.files, { path: 'execution/foreign.json', bytes: 11, valid: false, record: null }], frozenUsage: p.frozenUsage });
  assert.equal(foreign.fits, false); assert.equal(foreign.totalBytes, current.totalBytes + 11);
  const tooSmall = structuredClone(w.plan); tooSmall.bundle.comparison.retention.maxBytes = current.totalBytes - 1;
  assert.equal(liveRetentionPlan({ plan: tooSmall, files: p.files, frozenUsage: p.frozenUsage }).fits, false);
});

function localRecovery(w) {
  const target = { mode: 'local-only', slot: w.slot, operationKind: 'count', operationId: w.countOp.operationId, originalIntentDigest: w.intent.digest, admissionReceiptDigest: w.admission.digest, leaseDigest: fingerprint(w.admission.lease) };
  const intent = sealRecord({ schemaVersion: 1, kind: 'live-reconcile-intent', planDigest: w.plan.digest, approvalDigest: H, descriptorPath: '/Acme/reconcile.json', descriptorHash: H, snapshotDigest: H, controllerDigest: H, startedAt: T, deadlineEpochMs: epoch + 10000,
    policy: { attemptsPerAction: 1, operationDeadlineMs: 1000, reconcileMsPerSlot: 10000, cancelMsPerSlot: 10000 }, schedule: planLiveReconcile({ mode: 'local-only', originalOperations: [{ kind: 'owner-observe', operationId: w.countOp.operationId, maximumMs: 1000 }], elapsedMs: 0, credentialMs: 0, writeCleanupMs: 1000 }), target });
  const local = sealRecord({ schemaVersion: 1, kind: 'live-local-reconcile', planDigest: w.plan.digest, reconcileIntentDigest: intent.digest, ...Object.fromEntries(Object.entries(target).filter(([k]) => k !== 'mode')), localState: 'released',
    requestSettlement: { ...w.local.coordinatorReceipt, observation: { state: 'owner-exited', pid: w.admission.lease.pid } }, dockerReconciliationDigest: null, spendEffect: 'none', providerEffect: 'none', acceptanceEffect: 'none' });
  const result = sealRecord({ schemaVersion: 1, kind: 'live-reconcile-result', planDigest: w.plan.digest, reconcileIntentDigest: intent.digest, mode: 'local-only', slot: w.slot, recoveryResultDigest: null, localCompletionDigest: local.digest, dockerReconciliationDigest: null, state: 'recorded', acceptance: 'unknown' });
  return { intent, local, result };
}

test('local-only count recovery links original lease and leaves unresolved remote spend held', async t => {
  const w = await world(t); await w.put(liveReceiptPath(w.admission), w.admission); await w.put(w.spendHome + '/dispatch.json', w.dispatch);
  const r = localRecovery(w);
  for (const record of [r.intent, r.local, r.result]) await w.put(liveReceiptPath(record, { approvalDigest: H }), record);
  let p = await inspectLiveRecords(w.directory, w.plan);
  assert.deepEqual(p.gaps, []); assert.equal(p.state, 'uncertain'); assert.equal(p.reconcile.local.localState, 'released'); assert.equal(p.spend.heldMicroUsd, 10);
  assert.equal(p.slots[0].count.result, null); assert.equal(p.effectsBlocked, true);
  const wrong = sealRecord({ ...r.local, requestSettlement: { ...r.local.requestSettlement, observation: { state: 'owner-exited', pid: 54321 } } });
  const path = liveReceiptPath(r.local, { approvalDigest: H }); await rm(join(w.directory, path)); await w.put(path, wrong);
  p = await inspectLiveRecords(w.directory, w.plan); assert.equal(p.state, 'gap');
  rejects(() => validateLiveReceipt(sealRecord({ ...r.local, spendEffect: 'refund' }), { plan: w.plan }));
});

test('generation and recovery metadata remain distinct and text bytes are immutable exact UTF8', () => {
  const f = fixture(), text = '\ufeffAcme result 😀', base64 = Buffer.from(text).toString('base64');
  const tr = f.R('live-response-text', { identityDigest: f.generationOp.identityDigest, encoding: 'base64', byteDigest: byteDigest(Buffer.from(text)), bytes: Buffer.byteLength(text), base64 }, f.generationOp);
  assert.deepEqual(validateLiveReceipt(tr, { plan: f.plan }), tr);
  const response = { schemaVersion: 1, kind: 'evaluation-provider-response', provider: 'openai', id: 'resp_acme', model, actualServiceTier: 'default', status: 'completed', terminal: true,
    usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, cachedInputTokens: null, reasoningTokens: 2 }, createdAt: T, packetDigest: f.packetRecord.preparation.packetDigest, outputLimitExceeded: false };
  const result = f.R('live-provider-result', { intentDigest: H, spendDispatchDigest: H, observation: { state: 'observed', response, textDigest: tr.digest, error: null } }, f.generationOp);
  assert.deepEqual(validateLiveReceipt(result, { plan: f.plan }), result);
  const missingText = sealRecord({ ...result, observation: { ...result.observation, state: 'observed-text-unavailable', textDigest: null, error: { code: 'live_text_unavailable', dispatch: 'uncertain' } } });
  assert.equal(validateLiveReceipt(missingText, { plan: f.plan }).observation.response.usage.totalTokens, 30);
  const recovery = f.R('live-provider-result', { intentDigest: H, spendDispatchDigest: H, observation: { ...result.observation } }, f.recoveryOp);
  rejects(() => validateLiveReceipt(recovery, { plan: f.plan }));
  delete recovery.observation.response.packetDigest; delete recovery.observation.response.outputLimitExceeded;
  assert.equal(validateLiveReceipt(sealRecord(recovery), { plan: f.plan }).operationId, f.recoveryOp.operationId);
  for (const changed of [{ ...tr, base64: base64 + '=' }, { ...tr, byteDigest: H }, { ...tr, base64: '/w==', bytes: 1, byteDigest: byteDigest(Buffer.from([255])) }, { ...tr, identityDigest: H }]) rejects(() => validateLiveReceipt(sealRecord(changed), { plan: f.plan }));
});

test('refusal never coexists with request admission or spend dispatch and orphan text is a gap', async t => {
  const w = await world(t), refusal = w.R('live-request-refusal', { intentDigest: w.intent.digest, authority: 'request-capacity-refusal-v1', reason: 'capacity-busy' });
  await w.put(liveReceiptPath(refusal), refusal); let p = await inspectLiveRecords(w.directory, w.plan);
  assert.deepEqual(p.gaps, []); assert.equal(p.slots[0].count.state, 'refused');
  await w.put(liveReceiptPath(w.admission), w.admission); p = await inspectLiveRecords(w.directory, w.plan); assert.equal(p.state, 'gap');
  const orphan = w.R('live-response-text', { identityDigest: w.generationOp.identityDigest, encoding: 'base64', byteDigest: byteDigest(Buffer.from('Acme')), bytes: 4, base64: 'QWNtZQ==' }, w.generationOp);
  await w.put(liveReceiptPath(orphan), orphan); p = await inspectLiveRecords(w.directory, w.plan); assert.equal(p.state, 'gap'); assert.ok(p.gaps.some(g => g.path === `execution/${w.slot}` && g.code === 'missing-intent'));
});

async function completeCount(w) {
  for (const r of [w.admission, w.result, w.local]) await w.put(liveReceiptPath(r), r);
  await w.put(w.spendHome + '/dispatch.json', w.dispatch);
  await w.put(w.spendHome + '/observations/1.json', sealRecord({ schemaVersion: 1, kind: 'spend-observation', planDigest: w.plan.digest, operationId: w.countOp.operationId, observationId: 'acme-count-complete', previousDigest: w.dispatch.digest, outcome: 'complete', usage: { inputTokens: 0, outputTokens: 0, requests: 1 }, evidenceDigest: w.result.digest, reservationDigest: w.spendReservation.digest, sequence: 1 }));
}
async function generationPrefix(w) {
  await completeCount(w);
  const raw = JSON.parse(w.packetRecord.preparation.packet.input), task = w.plan.bundle.cases.find(c => c.digest === w.intent.authorization.binding.case.digest), identifier = 'c'.repeat(32);
  const delivered = [...raw.files.map(f => ({ path: f.path, mode: f.mode, base64: Buffer.from(f.content).toString('base64') })), { path: 'requirements.json', mode: '100644', base64: Buffer.from(JSON.stringify({ publicBrief: raw.publicBrief, requirements: raw.requirements })).toString('base64') }].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const old = (kind, body) => sealRecord({ schemaVersion: 2, kind, id: identifier, createdAt: T, ...body });
  const operations = [`plates-eval-${identifier}-builder`, `plates-eval-${identifier}-check-0`];
  let intent = old('evaluation-intent', { slot: w.slot, previewDigest: H, dispatchProtocol: 'ordered-live-authorization-v1', operations,
    input: { planDigest: w.plan.digest, request: { pairId: w.descriptor.pairId, arm: 'baseline', repository: '/Acme/repository', admission: w.descriptor.admission },
      taskDigest: task.digest, configurationDigest: w.plan.bundle.comparison.baseline.digest, checkManifestDigest: task.acceptanceManifest.digest, environment: task.environment,
      image: { id: task.environment.image, requested: task.environment.image, platform: task.environment.platform }, delivered, deliveredDigest: fingerprint(delivered), sourceDigest: H, controller: { digest: H } } });
  intent = sealRecord({ ...intent, previewDigest: fingerprint(intent.input) });
  const lease = old('evaluation-lease', { intentDigest: intent.digest, lease: { ...w.admission.lease, id: identifier, commandDigest: intent.previewDigest, foregroundContract: 'external-container-v1', operations } });
  const dispatch = old('evaluation-dispatch', { intentDigest: intent.digest, operation: operations[0], index: 0 });
  for (const [name, r] of Object.entries({ intent, lease, 'dispatch-builder': dispatch })) await w.put(`execution/${w.slot}/${name}.json`, r);
  const ready = w.R('live-builder-ready', { builderIntentDigest: intent.digest, ready: { schemaVersion: 1, operation: operations[0], containerId: H, imageId: task.environment.image, deliveredDigest: fingerprint(delivered), bridgeDigest: H, deadlineEpochMs: epoch + 9000 } }, w.generationOp);
  await w.put(liveReceiptPath(ready), ready);
  return { intent, lease, ready, operations };
}

test('generation local recovery works before provider intent and cannot omit original Docker observations', async t => {
  const w = await world(t), builder = await generationPrefix(w), local = localRecovery(w);
  const target = { mode: 'local-only', slot: w.slot, operationKind: 'generation', operationId: w.generationOp.operationId, originalIntentDigest: builder.intent.digest, admissionReceiptDigest: builder.lease.digest, leaseDigest: fingerprint(builder.lease.lease) };
  const schedule = planLiveReconcile({ mode: 'local-only', originalOperations: builder.operations.map(operationId => ({ kind: 'docker-observe', operationId, maximumMs: 1000 })), elapsedMs: 0, credentialMs: 0, writeCleanupMs: 1000 });
  const intent = sealRecord({ ...local.intent, target, schedule }); await w.put(liveReceiptPath(intent), intent);
  let p = await inspectLiveRecords(w.directory, w.plan); assert.deepEqual(p.gaps, []); assert.equal(p.state, 'uncertain'); assert.equal(p.reconcile.intent.target.operationKind, 'generation');
  const wrong = sealRecord({ ...intent, schedule: { ...schedule, steps: schedule.steps.slice(1) } });
  await rm(join(w.directory, liveReceiptPath(intent))); await w.put(liveReceiptPath(wrong), wrong);
  p = await inspectLiveRecords(w.directory, w.plan); assert.equal(p.state, 'gap');
});

async function generationWorld(w) {
  const builder = await generationPrefix(w), op = w.generationOp;
  const quote = quoteSpend({ kind: 'generation', packetDigest: w.packetRecord.preparation.packetDigest, inputTokens: 20, maxOutputTokens: 50, priceEvidence: w.descriptor.live.priceEvidence });
  const reservation = sealRecord({ ...w.spendReservation, operationId: op.operationId, operationKind: 'generation', quoteDigest: quote.digest, priceDigest: quote.priceDigest, maximumMicroUsd: quote.maximumMicroUsd, quote });
  const dispatch = sealRecord({ schemaVersion: 1, kind: 'spend-dispatch', planDigest: w.plan.digest, operationId: op.operationId, reservationDigest: reservation.digest });
  const spendHome = `spend/operations/${op.operationId}`;
  await w.put(spendHome + '.intent.json', sealRecord({ schemaVersion: 1, kind: 'spend-operation-initialization', reservation }));
  await w.put(spendHome + '/reservation.json', reservation); await w.put(spendHome + '/dispatch.json', dispatch);
  await mkdir(join(w.directory, spendHome, 'observations'), { mode: 0o700 });
  const intent = w.R('live-generation-intent', { authorization: { ...w.intent.authorization, identityDigest: op.identityDigest, quoteDigest: quote.digest }, time: { startedAt: T, deadlineEpochMs: epoch + 9000, reservedMs: 9000, priorChargedMs: 1000 }, countResultDigest: w.result.digest, builderIntentDigest: builder.intent.digest, readyDigest: builder.ready.digest, spendReservationDigest: reservation.digest }, op);
  const text = w.R('live-response-text', { identityDigest: op.identityDigest, encoding: 'base64', byteDigest: byteDigest('Acme output'), bytes: 11, base64: Buffer.from('Acme output').toString('base64') }, op);
  const response = { schemaVersion: 1, kind: 'evaluation-provider-response', provider: 'openai', id: 'resp_acme', model, actualServiceTier: 'default', status: 'completed', terminal: true, usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, cachedInputTokens: null, reasoningTokens: null }, createdAt: T, packetDigest: w.packetRecord.preparation.packetDigest, outputLimitExceeded: false };
  const result = w.R('live-provider-result', { intentDigest: intent.digest, spendDispatchDigest: dispatch.digest, observation: { state: 'observed', response, textDigest: text.digest, error: null } }, op);
  for (const r of [intent, text, result]) await w.put(liveReceiptPath(r), r);
  await w.put(spendHome + '/observations/1.json', sealRecord({ schemaVersion: 1, kind: 'spend-observation', planDigest: w.plan.digest, operationId: op.operationId, observationId: 'acme-generation-complete', previousDigest: dispatch.digest, outcome: 'complete', usage: { inputTokens: 20, outputTokens: 10, requests: 1 }, evidenceDigest: result.digest, reservationDigest: reservation.digest, sequence: 1 }));
  return { builder, intent, text, result, spendHome, reservation, dispatch };
}

test('complete generation receipt graph binds original count, public delivery, text and spend evidence', async t => {
  const w = await world(t), { text } = await generationWorld(w);
  let p = await inspectLiveRecords(w.directory, w.plan); assert.deepEqual(p.gaps, []); assert.equal(p.slots[0].generation.state, 'observed'); assert.equal(p.slots[0].generation.text.digest, text.digest);
  const path = liveReceiptPath(text); await rm(join(w.directory, path));
  p = await inspectLiveRecords(w.directory, w.plan); assert.equal(p.state, 'gap'); assert.ok(p.gaps.some(g => g.path === `execution/${w.slot}/`));
});

test('one original-ID recovery binds both receipt chains and accounts GET separately', async t => {
  const w = await world(t), g = await generationWorld(w), op = w.recoveryOp, original = localRecovery(w);
  const quote = quoteSpend({ kind: 'recovery', packetDigest: w.packetRecord.preparation.packetDigest, inputTokens: 0, maxOutputTokens: 0, priceEvidence: w.descriptor.live.priceEvidence });
  const authorization = { ...w.intent.authorization, identityDigest: op.identityDigest, quoteDigest: quote.digest };
  const reservation = sealRecord({ ...w.spendReservation, operationId: op.operationId, operationKind: 'recovery', quoteDigest: quote.digest, priceDigest: quote.priceDigest, maximumMicroUsd: quote.maximumMicroUsd, quote });
  const dispatch = sealRecord({ schemaVersion: 1, kind: 'spend-dispatch', planDigest: w.plan.digest, operationId: op.operationId, reservationDigest: reservation.digest });
  const target = { mode: 'provider-get', slot: w.slot, generationOperationId: w.generationOp.operationId, generationIntentDigest: g.intent.digest, sourceResultDigest: g.result.digest, responseId: 'resp_acme', authorization };
  const schedule = planLiveReconcile({ mode: 'provider-get', originalOperations: [...g.builder.operations.map(operationId => ({ kind: 'docker-observe', operationId, maximumMs: 1000 })), { kind: 'provider-get', operationId: op.operationId, maximumMs: 1000 }], elapsedMs: 100, credentialMs: 1000, writeCleanupMs: 1000 });
  const reconcileIntent = sealRecord({ ...original.intent, target, schedule }); await w.put(liveReceiptPath(reconcileIntent), reconcileIntent);
  const spendHome = `spend/operations/${op.operationId}`;
  await w.put(spendHome + '.intent.json', sealRecord({ schemaVersion: 1, kind: 'spend-operation-initialization', reservation }));
  await w.put(spendHome + '/reservation.json', reservation); await w.put(spendHome + '/dispatch.json', dispatch); await mkdir(join(w.directory, spendHome, 'observations'), { mode: 0o700 });
  const intent = w.R('live-recovery-intent', { reconcileIntentDigest: reconcileIntent.digest, generationIntentDigest: g.intent.digest, sourceResultDigest: g.result.digest, responseId: 'resp_acme', authorization,
    time: { startedAt: T, deadlineEpochMs: epoch + 10000, reservedMs: 10000, priorChargedMs: 0 }, spendReservationDigest: reservation.digest }, op);
  const admission = w.R('live-request-admission', { intentDigest: intent.digest, lease: { ...w.admission.lease, id: op.identityDigest.slice(0, 32), operationId: op.operationId, requestKind: 'recovery' } }, op);
  const text = w.R('live-response-text', { ...Object.fromEntries(['encoding', 'byteDigest', 'bytes', 'base64'].map(k => [k, g.text[k]])), identityDigest: op.identityDigest }, op);
  const response = structuredClone(g.result.observation.response); delete response.packetDigest; delete response.outputLimitExceeded;
  const result = w.R('live-provider-result', { intentDigest: intent.digest, spendDispatchDigest: dispatch.digest, observation: { state: 'observed', response, textDigest: text.digest, error: null } }, op);
  const local = w.R('live-local-completion', { intentDigest: intent.digest, coordinatorReceipt: { ...w.local.coordinatorReceipt, id: admission.lease.id, operationId: op.operationId }, chargedMs: 1000 }, op);
  for (const r of [intent, admission, text, result, local]) await w.put(liveReceiptPath(r), r);
  await w.put(spendHome + '/observations/1.json', sealRecord({ schemaVersion: 1, kind: 'spend-observation', planDigest: w.plan.digest, operationId: op.operationId, observationId: 'acme-get-complete', previousDigest: dispatch.digest, outcome: 'complete', usage: { inputTokens: 0, outputTokens: 0, requests: 1 }, evidenceDigest: result.digest, reservationDigest: reservation.digest, sequence: 1 }));
  const done = sealRecord({ schemaVersion: 1, kind: 'live-reconcile-result', planDigest: w.plan.digest, reconcileIntentDigest: reconcileIntent.digest, mode: 'provider-get', slot: w.slot, recoveryResultDigest: result.digest, localCompletionDigest: local.digest, dockerReconciliationDigest: null, state: 'uncertain', acceptance: 'unknown' });
  await w.put(liveReceiptPath(done, { approvalDigest: H }), done);
  let p = await inspectLiveRecords(w.directory, w.plan); assert.deepEqual(p.gaps, []); assert.equal(p.reconcile.recovery.result.digest, result.digest); assert.equal(p.spend.knownMicroUsd, 30);
  const wrong = sealRecord({ ...intent, responseId: 'resp_foreign' }), path = liveReceiptPath(intent); await rm(join(w.directory, path)); await w.put(path, wrong);
  p = await inspectLiveRecords(w.directory, w.plan); assert.equal(p.state, 'gap');
});

test('empty known storage is absent, while unknown and partial directory prefixes are never effects authority', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'acme-live-empty-'))); await chmod(directory, 0o700); t.after(() => rm(directory, { recursive: true, force: true }));
  const f = fixture(); let p = await inspectLiveRecords(directory, f.plan); assert.equal(p.state, 'absent'); assert.equal(p.effectsBlocked, false); assert.deepEqual(p.usage, { bytes: 0, count: 0 });
  await mkdir(join(directory, 'execution/unknown'), { recursive: true, mode: 0o700 }); p = await inspectLiveRecords(directory, f.plan); assert.equal(p.state, 'gap'); assert.equal(p.effectsBlocked, true);
});

test('result predecessor binding refuses before spend accounting', async t => {
  const w = await world(t); await w.put(liveReceiptPath(w.admission), w.admission); await w.put(w.spendHome + '/dispatch.json', w.dispatch);
  const wrong = sealRecord({ ...w.result, intentDigest: H }); await w.put(liveReceiptPath(wrong), wrong);
  const p = await inspectLiveRecords(w.directory, w.plan); assert.equal(p.state, 'gap'); assert.equal(p.effectsBlocked, true);
});

test('unavailable storage exposes unknown usage rather than an invented empty allowance', async () => {
  const p = await inspectLiveRecords('/Acme/nonexistent-live-records', fixture().plan);
  assert.equal(p.state, 'gap'); assert.equal(p.usage, null); assert.equal(p.frozenUsage, null); assert.equal(p.effectsBlocked, true);
  rejects(() => liveRetentionPlan({ plan: fixture().plan, files: p.files, frozenUsage: p.frozenUsage }));
});

test('real spend initialization prefixes keep absent descendants reserved without double counting', async t => {
  const w = await world(t), before = await inspectLiveRecords(w.directory, w.plan), budgetBefore = liveRetentionPlan({ plan: w.plan, files: before.files, frozenUsage: before.frozenUsage });
  const reservationPath = join(w.directory, w.spendHome, 'reservation.json'); await rm(reservationPath);
  const pending = await inspectLiveRecords(w.directory, w.plan); assert.deepEqual(pending.gaps, []); assert.equal(pending.state, 'uncertain'); assert.equal(pending.spend.operations[0].initializationPending, true);
  const budget = liveRetentionPlan({ plan: w.plan, files: pending.files, frozenUsage: pending.frozenUsage });
  assert.equal(budget.totalEvents, budgetBefore.totalEvents); assert.equal(budget.totalBytes, budgetBefore.totalBytes + 16384 - bytes(w.spendReservation));
  await writeFile(reservationPath, '{"schemaVersion":1', { mode: 0o600 });
  const partial = await inspectLiveRecords(w.directory, w.plan); assert.equal(partial.state, 'gap'); assert.equal(partial.effectsBlocked, true);
  const rejected = liveRetentionPlan({ plan: w.plan, files: partial.files, frozenUsage: partial.frozenUsage }); assert.equal(rejected.fits, false);
  assert.ok(rejected.actualBytes > budget.actualBytes);
});

test('local-only count recovers prior release only from the exact retained original completion', async t => {
  for (const state of ['transport-closed', 'not-started']) {
    const w = await world(t); await w.put(liveReceiptPath(w.admission), w.admission);
    const original = sealRecord({ ...w.local, coordinatorReceipt: { ...w.local.coordinatorReceipt, observation: { state } } });
    await w.put(liveReceiptPath(original), original);
    const r = localRecovery(w);
    r.local = sealRecord({ ...r.local, requestSettlement: original.coordinatorReceipt });
    r.result = sealRecord({ ...r.result, localCompletionDigest: r.local.digest });
    for (const record of [r.intent, r.local, r.result]) await w.put(liveReceiptPath(record, { approvalDigest: H }), record);
    let p = await inspectLiveRecords(w.directory, w.plan);
    assert.deepEqual(p.gaps, [], state); assert.equal(p.effectsBlocked, true); assert.equal(p.spend.heldMicroUsd, 10);
    assert.deepEqual(p.reconcile.local.requestSettlement, original.coordinatorReceipt);
    const originalPath = join(w.directory, liveReceiptPath(original));
    await rm(originalPath);
    p = await inspectLiveRecords(w.directory, w.plan);
    assert.equal(p.state, 'gap', 'history without original completion is no release evidence');
    assert.ok(p.gaps.some(g => g.path === 'execution/control/reconcile-intent.json' && g.code === 'binding'));
    // A different still-valid completion cannot support exact-history recovery.
    await w.put(liveReceiptPath(original), sealRecord({ ...original, coordinatorReceipt: { ...original.coordinatorReceipt, endedAt: '2026-11-01T00:00:02.000Z' } }));
    p = await inspectLiveRecords(w.directory, w.plan);
    assert.equal(p.state, 'gap', 'changed original settlement is not exact recovery');
    await rm(originalPath);
    await w.put(liveReceiptPath(original), sealRecord({ ...original, intentDigest: H }));
    p = await inspectLiveRecords(w.directory, w.plan);
    assert.equal(p.state, 'gap', 'an unbound completion never provides provenance');
  }
});

test('retention inventory reads each canonical receipt once without spend replay or graph projection', async t => {
  const w = await world(t); await completeCount(w);
  const originalOpen = fs.open, reads = new Map();
  fs.open = async (path, ...args) => { if (String(path).startsWith(w.directory + '/')) reads.set(String(path), (reads.get(String(path)) ?? 0) + 1); return originalOpen(path, ...args); };
  syncBuiltinESMExports();
  try {
    const inventory = await inspectLiveInventory(w.directory, w.plan);
    assert.deepEqual(Object.keys(inventory).sort(), ['files', 'frozenUsage', 'gaps', 'usage']);
    assert.deepEqual(inventory.gaps, []);
    assert.equal(reads.size, inventory.files.length);
    assert.ok([...reads.values()].every(n => n === 1), 'inventory has no second spend read');
    reads.clear();
    const full = await inspectLiveRecords(w.directory, w.plan);
    assert.deepEqual(full.gaps, []);
    assert.ok(reads.get(join(w.directory, w.spendHome, 'reservation.json')) > 1, 'full authority replay still reads original spend evidence');
    assert.deepEqual(inventory.files, full.files);
    assert.deepEqual(inventory.usage, full.usage);
    assert.deepEqual(liveRetentionPlan({ plan: w.plan, files: inventory.files, frozenUsage: inventory.frozenUsage }), liveRetentionPlan({ plan: w.plan, files: full.files, frozenUsage: full.frozenUsage }));
  } finally { fs.open = originalOpen; syncBuiltinESMExports(); }
});

test('fresh retention inventory preserves individual credit while broken chains still block full authority', async t => {
  const w = await world(t); await completeCount(w);
  const path = liveReceiptPath(w.result); await rm(join(w.directory, path));
  await w.put(path, sealRecord({ ...w.result, intentDigest: H }));
  const inventory = await inspectLiveInventory(w.directory, w.plan), full = await inspectLiveRecords(w.directory, w.plan);
  assert.deepEqual(inventory.gaps, [], 'canonical predecessor mismatch is not a byte inventory failure');
  assert.equal(full.effectsBlocked, true); assert.equal(full.state, 'gap');
  assert.ok(full.gaps.some(g => g.code === 'binding'));
  assert.deepEqual(liveRetentionPlan({ plan: w.plan, files: inventory.files, frozenUsage: inventory.frozenUsage }), liveRetentionPlan({ plan: w.plan, files: full.files.map(f => ({ ...f, valid: f.record !== null })), frozenUsage: full.frozenUsage }), 'same individual credit as the prior fence projection');
  await chmod(join(w.directory, path), 0o600);
  const changed = await inspectLiveInventory(w.directory, w.plan);
  assert.equal(changed.files.find(f => f.path === path).record, null, 'fresh reread never caches prior canonical credit');
  assert.equal(liveRetentionPlan({ plan: w.plan, files: changed.files, frozenUsage: changed.frozenUsage }).fits, false);
});

test('inventory preserves malformed mode link unknown and unavailable failures without capacity credit', async t => {
  for (const variant of ['malformed', 'noncanonical', 'oversize', 'mode', 'hardlink', 'symlink', 'unknown-file', 'unknown-directory', 'directory-mode', 'unavailable']) {
    const w = await world(t), path = liveReceiptPath(w.intent), absolute = join(w.directory, path);
    if (['malformed', 'noncanonical', 'oversize'].includes(variant)) {
      await rm(absolute); await writeFile(absolute, variant === 'malformed' ? '{Acme' : variant === 'oversize' ? ' '.repeat(16385) : JSON.stringify(w.intent, null, 2) + '\n', { mode: 0o400 });
    } else if (variant === 'mode') await chmod(absolute, 0o600);
    else if (variant === 'hardlink') await link(absolute, join(w.directory, 'Acme-hardlink'));
    else if (variant === 'symlink') { await rm(absolute); await symlink('/Acme/missing', absolute); }
    else if (variant === 'unknown-file') await writeFile(join(w.directory, 'execution/Acme-unknown'), 'Acme', { mode: 0o400 });
    else if (variant === 'unknown-directory') await mkdir(join(w.directory, 'execution/Acme-unknown'), { mode: 0o700 });
    else if (variant === 'directory-mode') await chmod(join(w.directory, 'execution'), 0o755);
    else await rm(w.directory, { recursive: true });
    const inventory = await inspectLiveInventory(w.directory, w.plan), full = await inspectLiveRecords(w.directory, w.plan);
    assert.ok(inventory.gaps.length, variant); assert.equal(full.effectsBlocked, true, variant);
    for (const gap of inventory.gaps) assert.ok(full.gaps.some(g => g.path === gap.path && g.code === gap.code), variant);
    assert.deepEqual(inventory.usage, full.usage); assert.deepEqual(inventory.frozenUsage, full.frozenUsage);
    assert.deepEqual(inventory.files.map(f => [f.path, f.bytes, f.record !== null]), full.files.map(f => [f.path, f.bytes, f.record !== null]));
    if (variant === 'unavailable') { assert.equal(inventory.frozenUsage, null); assert.throws(() => liveRetentionPlan({ plan: w.plan, files: inventory.files, frozenUsage: inventory.frozenUsage })); }
    else if (!['unknown-directory', 'directory-mode'].includes(variant)) assert.equal(liveRetentionPlan({ plan: w.plan, files: inventory.files, frozenUsage: inventory.frozenUsage }).fits, false, variant);
    // Empty or unsafe directories may consume no file credit: callers MUST check
    // inventory.gaps before considering a retention plan, as the fence does.
  }
});

test('inventory retains stat reread and aggregate byte caps with unknown usage on incomplete scans', async t => {
  const w = await world(t), absolute = join(w.directory, liveReceiptPath(w.intent)), originalOpen = fs.open;
  let changed = false;
  fs.open = async (path, ...args) => {
    const handle = await originalOpen(path, ...args);
    if (String(path) === absolute) {
      const read = handle.read.bind(handle);
      handle.read = async (...input) => { const result = await read(...input); if (!changed) { changed = true; await fs.utimes(absolute, new Date(0), new Date(0)); } return result; };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    const inventory = await inspectLiveInventory(w.directory, w.plan);
    assert.ok(changed); assert.ok(inventory.gaps.some(g => g.path === liveReceiptPath(w.intent) && g.code === 'invalid-record'));
    assert.equal(inventory.files.find(f => f.path === liveReceiptPath(w.intent)).record, null);
  } finally { fs.open = originalOpen; syncBuiltinESMExports(); }
  const oversized = join(w.directory, 'execution/Acme-large'); await writeFile(oversized, ''); await fs.truncate(oversized, 67108865);
  const inventory = await inspectLiveInventory(w.directory, w.plan);
  assert.equal(inventory.usage, null); assert.equal(inventory.frozenUsage, null); assert.ok(inventory.gaps.some(g => g.code === 'unavailable'));
});

async function generationRefusalWorld(t, { expiredPrice = false } = {}) {
  const w = await world(t), task = w.plan.bundle.cases.find(c => c.digest === w.intent.authorization.binding.case.digest);
  for (const r of [w.admission, w.result, w.local]) await w.put(liveReceiptPath(r), r);
  await w.put(w.spendHome + '/dispatch.json', w.dispatch);
  await w.put(w.spendHome + '/observations/1.json', sealRecord({ schemaVersion: 1, kind: 'spend-observation', planDigest: w.plan.digest,
    operationId: w.countOp.operationId, observationId: 'acme-count-observed', previousDigest: w.dispatch.digest, outcome: 'complete',
    usage: { inputTokens: 0, outputTokens: 0, requests: 1 }, evidenceDigest: w.result.digest, reservationDigest: w.spendReservation.digest, sequence: 1 }));
  const request = { ...w.descriptor, stage: 'generation', count: { operationId: w.countOp.operationId, resultDigest: w.result.digest }, limits: { timeoutMs: 1000, maxOutputTokens: 1000 } };
  delete request.billing;
  if (expiredPrice) request.live = { ...request.live, priceEvidence: { ...request.live.priceEvidence, validUntil: '2026-11-01T00:00:00.001Z' } };
  const quote = quoteSpend({ kind: 'generation', packetDigest: request.packet.packetDigest, inputTokens: 20, maxOutputTokens: 1000, priceEvidence: request.live.priceEvidence });
  const requestDigest = fingerprint({ stage: 'generation', packetDigest: request.packet.packetDigest, model, scope, credential: request.live.credential, credentialChannel: 'pipe-json-v1', limits: request.limits });
  const reservation = sealRecord({ ...w.spendReservation, operationId: w.generationOp.operationId, operationKind: 'generation', requestDigest,
    quoteDigest: quote.digest, priceDigest: quote.priceDigest, maximumMicroUsd: quote.maximumMicroUsd, quote });
  const home = `spend/operations/${w.generationOp.operationId}`;
  await w.put(home + '.intent.json', sealRecord({ schemaVersion: 1, kind: 'spend-operation-initialization', reservation }));
  await w.put(home + '/reservation.json', reservation); await mkdir(join(w.directory, home, 'observations'), { mode: 0o700 });
  const id = w.generationOp.identityDigest.slice(0, 32), binding = w.intent.authorization.binding;
  const payload = JSON.parse(w.packetRecord.preparation.packet.input);
  const delivered = [...payload.files.map(f => ({ path: f.path, mode: f.mode, base64: Buffer.from(f.content).toString('base64') })),
    { path: 'requirements.json', mode: '100644', base64: Buffer.from(JSON.stringify({ publicBrief: payload.publicBrief, requirements: payload.requirements })).toString('base64') }].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const input = { request, planDigest: w.plan.digest, taskDigest: task.digest, configurationDigest: binding.configuration.digest,
    checkManifestDigest: task.acceptanceManifest.digest, environment: binding.environment,
    image: { requested: binding.environment.image, platform: binding.environment.platform, id: H }, controller: { digest: H }, model,
    sourceDigest: binding.partitionIdentityDigest, delivered, deliveredDigest: fingerprint(delivered) };
  const intent = sealRecord({ schemaVersion: 2, kind: 'evaluation-intent', id, createdAt: T, slot: w.slot, previewDigest: fingerprint(input), input,
    operations: [`plates-eval-${id}-builder`, `plates-eval-${id}-check-0`], dispatchProtocol: 'ordered-live-authorization-v1',
    attempt: 1, parentAttemptId: null, reservedMinutes: task.limits.minutes, repairRounds: 0, interventions: [] });
  const refusal = sealRecord({ schemaVersion: 2, kind: 'evaluation-admission-refusal', id, createdAt: T, intentDigest: intent.digest,
    authority: 'external-admission-refusal-v1', commandDigest: intent.previewDigest, reason: 'capacity_busy_inspect_existing_leases' });
  await w.put(`execution/${w.slot}/intent.json`, intent); await w.put(`execution/${w.slot}/admission-refusal.json`, refusal);
  return { ...w, generationHome: home, builderIntent: intent, refusal, generationReservation: reservation };
}

test('bound generation refusal terminates only execution, retains spend hold and exposes other missing slots', async t => {
  const { inspectLiveExecutions } = await import('../lib/evaluation-live-inspection.mjs');
  const { summarizeComparison } = await import('../lib/evaluation-comparison-report.mjs');
  const w = await generationRefusalWorld(t), live = await inspectLiveRecords(w.directory, w.plan);
  assert.deepEqual(live.gaps, []); assert.equal(live.effectsBlocked, false); assert.equal(live.state, 'ready');
  const retained = live.spend.operations.find(o => o.reservation.operationId === w.generationOp.operationId);
  assert.equal(retained.dispatch, null); assert.equal(retained.complete, false); assert.equal(retained.heldMicroUsd, w.generationReservation.maximumMicroUsd);
  assert.equal(live.slots[0].generationRefusal.refusal.digest, w.refusal.digest);
  const execution = await inspectLiveExecutions(w.directory, w.plan);
  assert.equal(execution.status, 'ready'); assert.equal(execution.trials[0].status, 'terminal');
  assert.equal(execution.trials[0].reason, 'generation-not-admitted'); assert.equal(execution.trials[0].records.result, undefined);
  const report = summarizeComparison(w.plan, execution);
  assert.deepEqual(report.recovery.refusedSlots, [w.slot]); assert.equal(report.recovery.uncertainSlots.length, 0);
  assert.equal(report.attempts[0].failureCategory, 'infrastructure'); assert.equal(report.attempts[0].terminal, true);
  assert.deepEqual(report.attempts[0].reasons, ['generation-capacity-refused-no-provider-dispatch']);
  assert.equal(report.attempts[0].outcome, 'unknown'); assert.equal(report.attempts[0].resources.currencyUsd, null);
  assert.equal(report.arms.baseline.accepted, 0); assert.equal(report.pairs[0].comparable, false);
});

test('missing or contradictory generation refusal evidence remains blocked and unaccepted', async t => {
  const cases = ['missing-refusal', 'missing-spend', 'wrong-command', 'wrong-reason', 'wrong-request', 'wrong-operation', 'lease', 'dispatch', 'provider-intent', 'ready', 'output', 'unknown-file'];
  for (const name of cases) {
    const w = await generationRefusalWorld(t), prefix = `execution/${w.slot}/`;
    const replace = async (path, record) => { await rm(join(w.directory, path)); await w.put(path, record); };
    if (name === 'missing-refusal') await rm(join(w.directory, prefix + 'admission-refusal.json'));
    else if (name === 'missing-spend') { await rm(join(w.directory, w.generationHome), { recursive: true }); await rm(join(w.directory, w.generationHome + '.intent.json')); }
    else if (name.startsWith('wrong-') && ['wrong-command', 'wrong-reason'].includes(name)) await replace(prefix + 'admission-refusal.json', sealRecord({ ...w.refusal, [name === 'wrong-command' ? 'commandDigest' : 'reason']: H }));
    else if (name === 'wrong-request' || name === 'wrong-operation') {
      const reservation = sealRecord({ ...w.generationReservation, [name === 'wrong-request' ? 'requestDigest' : 'operationId']: H });
      await replace(w.generationHome + '/reservation.json', reservation);
      await replace(w.generationHome + '.intent.json', sealRecord({ schemaVersion: 1, kind: 'spend-operation-initialization', reservation }));
    } else if (name === 'dispatch') await w.put(w.generationHome + '/dispatch.json', sealRecord({ ...w.dispatch, operationId: w.generationOp.operationId, reservationDigest: w.generationReservation.digest }));
    else await w.put(prefix + ({ lease: 'lease', 'provider-intent': 'provider-intent', ready: 'ready', output: 'builder', 'unknown-file': 'foreign' }[name]) + '.json', sealRecord({ schemaVersion: 2, kind: 'evaluation-stage', id: w.builderIntent.id, intentDigest: w.builderIntent.digest }));
    const live = await inspectLiveRecords(w.directory, w.plan);
    assert.equal(live.effectsBlocked, true, name); assert.notEqual(live.state, 'ready', name);
    assert.ok(!live.slots[0]?.generationRefusal, name);
  }
});


test('generation refusal rejects singular-target recovery and retains expired historical quote semantics', async t => {
  const w = await generationRefusalWorld(t, { expiredPrice: true });
  const before = await inspectLiveRecords(w.directory, w.plan);
  assert.deepEqual(before.gaps, []); assert.equal(before.effectsBlocked, false);
  assert.equal(before.slots[0].generationRefusal.spend.reservation.quote.priceEvidence.validUntil, '2026-11-01T00:00:00.001Z');
  const local = localRecovery(w);
  const target = { mode: 'local-only', slot: w.slot, operationKind: 'generation', operationId: w.generationOp.operationId,
    originalIntentDigest: w.builderIntent.digest, admissionReceiptDigest: null, leaseDigest: null };
  const schedule = planLiveReconcile({ mode: 'local-only', originalOperations: w.builderIntent.operations.map(operationId => ({ kind: 'docker-observe', operationId, maximumMs: 1000 })), elapsedMs: 0, credentialMs: 0, writeCleanupMs: 1000 });
  const intent = sealRecord({ ...local.intent, target, schedule }); await w.put(liveReceiptPath(intent), intent);
  const after = await inspectLiveRecords(w.directory, w.plan);
  assert.equal(after.reconcile.intent.target.slot, w.slot);
  assert.ok(after.gaps.some(g => g.path === `execution/${w.slot}` && g.code === 'generation-refusal'));
  assert.equal(after.slots[0].generationRefusal, null); assert.equal(after.effectsBlocked, true);
});

test('generation refusal report revalidates reservation and source instead of trusting terminal labels', async t => {
  const { inspectLiveExecutions } = await import('../lib/evaluation-live-inspection.mjs');
  const { summarizeComparison } = await import('../lib/evaluation-comparison-report.mjs');
  const w = await generationRefusalWorld(t), original = await inspectLiveExecutions(w.directory, w.plan);
  for (const corrupt of [s => { s.generationSpend.dispatch = {}; }, s => { s.generationSpend = null; },
    s => { s.generationSpend.reservation = sealRecord({ ...s.generationSpend.reservation, requestDigest: H }); },
    s => { s.count.spend.observations = []; }, s => { s.builder.lease = {}; }]) {
    const execution = structuredClone(original); corrupt(execution.trials[0].live);
    const report = summarizeComparison(w.plan, execution);
    assert.equal(report.attempts[0].terminal, false); assert.equal(report.attempts[0].outcome, 'unknown');
    assert.deepEqual(report.recovery.refusedSlots, []);
    assert.ok(!report.attempts[0].reasons.includes('generation-capacity-refused-no-provider-dispatch'));
  }
});
