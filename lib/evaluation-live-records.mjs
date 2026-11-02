// Live receipt values and read-only projections. No writer, dispatch or acceptance authority.
import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fields, canonical, fingerprint, byteDigest, sealRecord, evaluationId, resolveCaseEnvironment } from './evaluation-records.mjs';
import { parsePartitionJson } from './evaluation-input-partition.mjs';
import { filePath, validateFiles } from './evaluation-artifacts.mjs';
import { PUBLIC_PACKET_TEMPLATE, PUBLIC_PACKET_TEMPLATE_VERSION, PUBLIC_RESULT_FORMAT } from './evaluation-public-packet.mjs';
import { prepareEvaluationProviderPacket } from './evaluation-provider.mjs';
import { quoteSpend, inspectSpend } from './evaluation-spend.mjs';
import { evaluationBytes } from './evaluation-ledger.mjs';
import { safePath } from './session-ledger-io.mjs';

export const LIVE_RECORD_LIMITS = Object.freeze({ descriptor: 65536, small: 16384, packet: 270336, text: 528384, decodedText: 393216, bytes: 67108864, events: 20000, reconcileMs: 10000 });
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const id = evaluationId;
const slotId = x => typeof x === 'string' && /^[a-z][a-z0-9-]{0,63}-(baseline|candidate)$/.test(x);
const modelName = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(x);
const scopeName = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(x);
const responseId = x => typeof x === 'string' && /^resp_[A-Za-z0-9_-]{1,200}$/.test(x);
const integer = (x, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(x) && x >= min && x <= max;
const word = x => typeof x === 'string' && x.length > 0 && x.length <= 4096 && x.isWellFormed() && !/[\x00-\x1f\x7f]/.test(x);
const time = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const pathValue = x => word(x) && isAbsolute(x) && resolve(x) === x;
const equal = (a, b) => canonical(a) === canonical(b);
const ref = x => ({ kind: x.kind, id: x.id, digest: x.digest });
const bytes = x => Buffer.byteLength(JSON.stringify(x) + '\n');
const need = ok => { if (!ok) throw Error('live-record-refused'); };
function boundary(work) { try { return work(); } catch { throw Object.assign(new Error('evaluation_live_records_invalid'), { code: 'evaluation_live_records_invalid', exitCode: 2 }); } }
function copy(x) { canonical(x); return parsePartitionJson(Buffer.from(JSON.stringify(x))); }
function keys(x, list) { fields(x, list); }
function hashes(x, list) { for (const k of list) need(hash(x[k])); }
function model(x) { keys(x, ['requested', 'resolved']); need(modelName(x.requested) && modelName(x.resolved)); }
function scope(x) { keys(x, ['organization', 'project']); need(scopeName(x.organization) && scopeName(x.project)); }
function credential(x) { keys(x, ['ref', 'generation']); need(id(x.ref) && integer(x.generation, 1)); }
function reference(x, kind) { keys(x, ['kind', 'id', 'digest']); need(x.kind === kind && id(x.id) && hash(x.digest)); }
function environment(x) { keys(x, ['image', 'platform', 'dependencyLock', 'installer']); need(/^sha256:[a-f0-9]{64}$/.test(x.image) && ['linux/arm64', 'linux/amd64'].includes(x.platform)); hashes(x, ['dependencyLock', 'installer']); }
function billing(x) { keys(x, ['schemaVersion', 'basis']); need(x.schemaVersion === 1 && x.basis === 'fixed-request-v1'); }
function packetBinding(x) {
  keys(x, ['format', 'templateDigest', 'packetDigest', 'responseFormat', 'converterVersion', 'controllerDigest', 'bridgeDigest']);
  need(x.format === 'evaluation-public-packet-v1' && x.responseFormat === 'utf8-file-replacements-v1' && x.converterVersion === x.responseFormat);
  hashes(x, ['templateDigest', 'packetDigest', 'controllerDigest', 'bridgeDigest']);
}
function live(x, stage) {
  keys(x, ['provider', 'credential', 'scope', 'model', 'serviceTier', 'retention', 'priceEvidence']);
  need(x.provider === 'openai' && x.serviceTier === 'default'); credential(x.credential); scope(x.scope); model(x.model);
  keys(x.retention, ['store']); need(x.retention.store === true);
  const p = x.priceEvidence;
  // Existing spend validator owns rational rates and pricing schema. This is value-only, not a price/entitlement check.
  quoteSpend({ kind: stage, packetDigest: '0'.repeat(64), inputTokens: 0, maxOutputTokens: 0, priceEvidence: p });
  need(p.model === x.model.resolved && p.serviceTier === x.serviceTier && equal(p.scope, x.scope));
  if (stage !== 'generation') need(p.rates[stage].inputTokens.microUsd === 0 && p.rates[stage].outputTokens.microUsd === 0);
}
function admission(x) {
  keys(x, ['stateDir', 'manifest', 'capacity', 'weight', 'repo']);
  need(pathValue(x.stateDir) && pathValue(x.manifest) && integer(x.capacity, 1, 128) && integer(x.weight, 1, x.capacity) && word(x.repo));
}
function selected(plan, slot) {
  need(hash(plan.digest) && plan.schemaVersion === 2 && plan.bundle.schemaVersion === 3 && slotId(slot));
  const arm = slot.endsWith('-baseline') ? 'baseline' : 'candidate', pairId = slot.slice(0, -(arm.length + 1));
  const b = plan.bundle, pair = b.comparison.pairs.find(p => p.id === pairId); need(pair);
  const task = b.cases.find(c => equal(ref(c), pair.case)), config = b.configurations.find(c => equal(ref(c), b.comparison[arm])); need(task && config);
  need(sealRecord(task).digest === task.digest && sealRecord(config).digest === config.digest);
  return { task, config, environment: resolveCaseEnvironment(b, config, pair.case), pairId, arm };
}
function descriptorValue(d, plan) {
  need(d.schemaVersion === 2 && hash(d.planDigest));
  if (d.stage === 'recovery') {
    const remote = d.mode === 'provider-get'; need(remote || d.mode === 'local-only');
    keys(d, ['schemaVersion', 'stage', 'mode', 'planDigest', 'targets', ...(remote ? ['live', 'billing'] : [])]);
    need(Array.isArray(d.targets) && d.targets.length === 1);
    const t = d.targets[0];
    keys(t, ['pairId', 'arm', ...(remote ? ['generationIntentDigest', 'generationSpendOperationId', 'sourceResultDigest', 'responseId'] : ['operationKind', 'operationId', 'originalIntentDigest', 'admissionReceiptDigest'])]);
    need(id(t.pairId) && ['baseline', 'candidate'].includes(t.arm));
    if (remote) { hashes(t, ['generationIntentDigest', 'sourceResultDigest']); need(id(t.generationSpendOperationId) && responseId(t.responseId)); live(d.live, 'recovery'); billing(d.billing); }
    else { need(['count', 'generation'].includes(t.operationKind) && id(t.operationId) && hash(t.originalIntentDigest) && (t.admissionReceiptDigest === null || hash(t.admissionReceiptDigest))); }
    if (plan) { need(plan.digest === d.planDigest); const s = selected(plan, t.pairId + '-' + t.arm); if (remote) need(equal(s.config.model, { ...d.live.model, unresolvedReason: null })); }
  } else {
    const count = d.stage === 'count'; need(count || d.stage === 'generation');
    keys(d, ['schemaVersion', 'stage', 'planDigest', 'pairId', 'arm', 'repository', 'sourcePaths', 'admission', 'live', 'packet', 'limits', count ? 'billing' : 'count']);
    need(id(d.pairId) && ['baseline', 'candidate'].includes(d.arm) && pathValue(d.repository));
    need(Array.isArray(d.sourcePaths) && d.sourcePaths.length > 0 && d.sourcePaths.length <= 128 && new Set(d.sourcePaths).size === d.sourcePaths.length); d.sourcePaths.forEach(filePath);
    admission(d.admission); live(d.live, d.stage); packetBinding(d.packet);
    keys(d.limits, ['timeoutMs', count ? 'maxCountedInputTokens' : 'maxOutputTokens']);
    need(integer(d.limits.timeoutMs, 1, 600000) && integer(d.limits[count ? 'maxCountedInputTokens' : 'maxOutputTokens'], 1, 10000000));
    if (count) billing(d.billing); else { keys(d.count, ['operationId', 'resultDigest']); need(id(d.count.operationId) && hash(d.count.resultDigest)); }
    if (plan) {
      need(plan.digest === d.planDigest); const s = selected(plan, d.pairId + '-' + d.arm);
      need(equal(s.config.model, { ...d.live.model, unresolvedReason: null }) && d.admission.repo === plan.bundle.comparison.repository);
      need(d.limits.timeoutMs <= s.task.limits.minutes * 60000);
      if (!count) need(d.limits.maxOutputTokens <= s.config.runtime.settings.maxTokens);
    }
  }
  return d;
}
/** Pure byte parser. Caller separately checks descriptor realpath/regular-file identity and current authority. */
export function parseLiveDescriptor(raw, { plan } = {}) { return boundary(() => descriptorValue(parsePartitionJson(raw, LIVE_RECORD_LIMITS.descriptor), plan)); }
export function liveOperationIdentity(input) {
  return boundary(() => {
    const recovery = input.stage === 'recovery';
    keys(input, ['planDigest', 'slot', 'stage', ...(recovery ? ['originalGenerationOperationId'] : [])]);
    need(hash(input.planDigest) && slotId(input.slot) && ['count', 'generation', 'recovery'].includes(input.stage));
    const identity = { planDigest: input.planDigest, slot: input.slot, stage: input.stage, attempt: 1 };
    if (recovery) { need(id(input.originalGenerationOperationId)); Object.assign(identity, { originalGenerationOperationId: input.originalGenerationOperationId, reconcileIdentityDigest: fingerprint({ planDigest: input.planDigest, action: 'reconcile', attempt: 1 }) }); }
    const identityDigest = fingerprint(identity); return { identity, identityDigest, operationId: 'op-' + identityDigest.slice(0, 60) };
  });
}
function binding(x, plan, slot) {
  keys(x, ['case', 'configuration', 'environment', 'partitionIdentityDigest', 'publicViewDigest', 'packetPreparationDigest', 'packetDigest', 'templateDigest', 'converterVersion', 'controllerDigest', 'bridgeDigest']);
  reference(x.case, 'case'); reference(x.configuration, 'configuration'); environment(x.environment);
  hashes(x, ['partitionIdentityDigest', 'publicViewDigest', 'packetPreparationDigest', 'packetDigest', 'templateDigest', 'controllerDigest', 'bridgeDigest']); need(x.converterVersion === 'utf8-file-replacements-v1');
  if (plan) { const s = selected(plan, slot); need(equal(x.case, ref(s.task)) && equal(x.configuration, ref(s.config)) && equal(x.environment, s.environment)); }
}
function authorization(x, r, context) {
  keys(x, ['identityDigest', 'descriptorPath', 'descriptorHash', 'approvalDigest', 'binding', 'credential', 'credentialChannel', 'scope', 'model', 'quoteDigest', 'requestDigest']);
  hashes(x, ['identityDigest', 'descriptorHash', 'approvalDigest', 'quoteDigest', 'requestDigest']); need(pathValue(x.descriptorPath) && x.credentialChannel === 'pipe-json-v1');
  credential(x.credential); scope(x.scope); model(x.model); binding(x.binding, context.plan, r.slot);
  if (context.plan) need(equal(selected(context.plan, r.slot).config.model, { ...x.model, unresolvedReason: null }));
}
function timeBudget(x) {
  keys(x, ['startedAt', 'deadlineEpochMs', 'reservedMs', 'priorChargedMs']);
  need(time(x.startedAt) && integer(x.deadlineEpochMs, 1) && integer(x.reservedMs, 1) && integer(x.priorChargedMs));
  need(x.deadlineEpochMs > Date.parse(x.startedAt) && x.deadlineEpochMs - Date.parse(x.startedAt) <= x.reservedMs);
}
function requestLease(x) {
  keys(x, ['id', 'pid', 'uid', 'host', 'repo', 'root', 'revision', 'dirty', 'foregroundContract', 'weight', 'createdAt', 'commandDigest', 'childPid', 'state', 'operationId', 'requestKind', 'deadlineEpochMs']);
  need(/^[a-f0-9]{32}$/.test(x.id) && integer(x.pid, 1, 2147483647) && integer(x.uid) && word(x.host) && word(x.repo) && pathValue(x.root) && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(x.revision));
  need(typeof x.dirty === 'boolean' && x.foregroundContract === 'in-process-request-v1' && integer(x.weight, 1, 128) && time(x.createdAt) && hash(x.commandDigest) && x.childPid === null && ['reserved', 'uncertain'].includes(x.state));
  need(id(x.operationId) && ['count', 'recovery'].includes(x.requestKind) && integer(x.deadlineEpochMs, 1));
}
function requestSettlement(x) {
  keys(x, ['id', 'foregroundContract', 'commandDigest', 'operationId', 'repo', 'root', 'createdAt', 'endedAt', 'observation', 'released']);
  need(/^[a-f0-9]{32}$/.test(x.id) && x.foregroundContract === 'in-process-request-v1' && hash(x.commandDigest) && id(x.operationId) && word(x.repo) && pathValue(x.root) && time(x.createdAt) && time(x.endedAt) && x.endedAt >= x.createdAt);
  const o = x.observation; keys(o, o.state === 'owner-exited' ? ['state', 'pid'] : ['state']);
  need(['not-started', 'transport-closed', 'owner-exited', 'unknown'].includes(o.state)); if (o.state === 'owner-exited') need(integer(o.pid, 1, 2147483647));
  need(typeof x.released === 'boolean' && x.released === (o.state !== 'unknown'));
}
const providerErrors = ['evaluation_provider_input', 'evaluation_provider_timeout', 'evaluation_provider_response', 'evaluation_provider_limit', 'evaluation_provider_denied', 'evaluation_provider_throttled', 'evaluation_provider_unavailable'];
function providerError(e) { keys(e, ['code', 'dispatch']); need(providerErrors.includes(e.code) && ['not-dispatched', 'uncertain'].includes(e.dispatch)); }
function providerUsage(x) {
  if (x === null) return;
  keys(x, ['inputTokens', 'outputTokens', 'totalTokens', 'cachedInputTokens', 'reasoningTokens']);
  need(integer(x.inputTokens) && integer(x.outputTokens) && integer(x.totalTokens) && integer(x.inputTokens + x.outputTokens) && x.totalTokens === x.inputTokens + x.outputTokens);
  need((x.cachedInputTokens === null || integer(x.cachedInputTokens, 0, x.inputTokens)) && (x.reasoningTokens === null || integer(x.reasoningTokens, 0, x.outputTokens)));
}
function providerResponse(x, stage) {
  if (stage === 'count') {
    keys(x, ['schemaVersion', 'kind', 'provider', 'model', 'packetDigest', 'inputTokens', 'requestedServiceTier']);
    need(x.schemaVersion === 1 && x.kind === 'evaluation-provider-count' && x.provider === 'openai' && hash(x.packetDigest) && integer(x.inputTokens, 1, 10000000) && x.requestedServiceTier === 'default'); model(x.model); return;
  }
  keys(x, ['schemaVersion', 'kind', 'provider', 'id', 'model', 'actualServiceTier', 'status', 'terminal', 'usage', 'createdAt', ...(stage === 'generation' ? ['packetDigest', 'outputLimitExceeded'] : [])]);
  need(x.schemaVersion === 1 && x.kind === 'evaluation-provider-response' && x.provider === 'openai' && responseId(x.id) && x.actualServiceTier === 'default'); model(x.model);
  need(['queued', 'in_progress', 'completed', 'failed', 'cancelled', 'incomplete'].includes(x.status) && x.terminal === !['queued', 'in_progress'].includes(x.status) && time(x.createdAt)); providerUsage(x.usage);
  if (stage === 'generation') need(hash(x.packetDigest) && (x.usage === null ? x.outputLimitExceeded === null : typeof x.outputLimitExceeded === 'boolean'));
}
function observation(x, stage) {
  keys(x, ['state', 'response', 'error', ...(stage === 'count' ? [] : ['textDigest'])]);
  if (x.state === 'uncertain') { need(x.response === null && (stage === 'count' || x.textDigest === null)); providerError(x.error); }
  else {
    need(x.state === 'observed' || stage !== 'count' && x.state === 'observed-text-unavailable'); providerResponse(x.response, stage);
    if (x.state === 'observed') need(x.error === null && (stage === 'count' || hash(x.textDigest)));
    else { need(x.textDigest === null); keys(x.error, ['code', 'dispatch']); need(x.error.code === 'live_text_unavailable' && x.error.dispatch === 'uncertain'); }
  }
}
function preparedPacket(p) {
  keys(p, ['schemaVersion', 'kind', 'model', 'packet', 'packetDigest', 'publicViewDigest', 'templateVersion', 'templateDigest', 'responseFormat', 'converterVersion', 'digest']);
  need(p.schemaVersion === 1 && p.kind === 'evaluation-public-packet-preparation' && sealRecord(p).digest === p.digest);
  const expected = prepareEvaluationProviderPacket({ model: p.model, packet: p.packet });
  need(p.packet.instructions === PUBLIC_PACKET_TEMPLATE && p.templateVersion === PUBLIC_PACKET_TEMPLATE_VERSION && p.responseFormat === PUBLIC_RESULT_FORMAT);
  const payload = parsePartitionJson(Buffer.from(p.packet.input));
  keys(payload, ['schemaVersion', 'kind', 'publicBrief', 'requirements', 'files', 'writablePaths']);
  need(payload.schemaVersion === 1 && payload.kind === 'evaluation-public-packet' && word(payload.publicBrief) && Array.isArray(payload.requirements) && payload.requirements.every(word) && Array.isArray(payload.files));
  const publicFiles = payload.files.map(f => { keys(f, ['path', 'mode', 'content']); need(typeof f.content === 'string' && f.content.isWellFormed() && !f.content.includes('\0')); return { path: f.path, mode: f.mode, base64: Buffer.from(f.content).toString('base64') }; });
  validateFiles(publicFiles);
  need(Array.isArray(payload.writablePaths) && new Set(payload.writablePaths).size === payload.writablePaths.length && payload.writablePaths.every(path => publicFiles.some(f => f.path === path)) && !publicFiles.some(f => f.path === 'requirements.json'));
  need(canonical(payload) === p.packet.input && fingerprint({ schemaVersion: 1, kind: 'evaluation-public-input', publicBrief: payload.publicBrief, requirements: payload.requirements, files: publicFiles, writablePaths: payload.writablePaths }) === p.publicViewDigest);
  need(expected.packetDigest === p.packetDigest && hash(p.publicViewDigest) && p.templateVersion === 'evaluation-public-packet-v1' && p.responseFormat === 'utf8-file-replacements-v1' && p.converterVersion === p.responseFormat && byteDigest(p.packet.instructions) === p.templateDigest);
}
function scheduleValue(x) {
  keys(x, ['steps', 'credentialMs', 'writeCleanupMs', 'maximumMs']);
  need(Array.isArray(x.steps) && x.steps.length <= 11 && integer(x.credentialMs, 0, 1000) && integer(x.writeCleanupMs, 1, 10000) && integer(x.maximumMs, 1, 10000));
  const seen = new Set(); let total = x.writeCleanupMs, credentials = 0;
  for (const s of x.steps) { keys(s, ['kind', 'operationId', 'maximumMs']); need(['credential-read', 'owner-observe', 'docker-observe', 'provider-get'].includes(s.kind) && word(s.operationId) && integer(s.maximumMs, 1, 1000) && !seen.has(s.operationId)); seen.add(s.operationId); total += s.maximumMs; if (s.kind === 'credential-read') { credentials++; need(s.maximumMs === x.credentialMs); } }
  need(credentials <= 1 && (credentials === 0) === (x.credentialMs === 0) && total <= x.maximumMs);
}
/** Caller supplies the complete retained-operation order; this pure schedule grants no effects. */
export function planLiveReconcile(input) {
  return boundary(() => {
    keys(input, ['mode', 'originalOperations', 'elapsedMs', 'credentialMs', 'writeCleanupMs']);
    const x = copy(input), remote = x.mode === 'provider-get'; need(remote || x.mode === 'local-only');
    need(Array.isArray(x.originalOperations) && integer(x.elapsedMs, 0, 10000) && integer(x.credentialMs, 0, 1000));
    need(x.originalOperations.every(s => s.kind !== 'credential-read'));
    const gets = x.originalOperations.filter(s => s.kind === 'provider-get');
    need(remote ? gets.length === 1 && x.originalOperations.at(-1) === gets[0] && x.credentialMs > 0 : gets.length === 0 && x.credentialMs === 0);
    const steps = [...x.originalOperations];
    if (remote) steps.splice(steps.length - 1, 0, { kind: 'credential-read', operationId: 'credential-read', maximumMs: x.credentialMs });
    const result = { steps, credentialMs: x.credentialMs, writeCleanupMs: x.writeCleanupMs, maximumMs: 10000 };
    scheduleValue(result); need(x.elapsedMs + steps.reduce((n, s) => n + s.maximumMs, x.writeCleanupMs) <= result.maximumMs); return result;
  });
}
const COMMON = ['schemaVersion', 'kind', 'planDigest', 'slot', 'operationId', 'digest'];
const EXTRA = {
  'live-count-intent': ['authorization', 'time', 'spendReservationDigest', 'packetRecordBytesHash'],
  'live-public-packet': ['identityDigest', 'preparation'],
  'live-request-admission': ['intentDigest', 'lease'],
  'live-request-refusal': ['intentDigest', 'authority', 'reason'],
  'live-provider-result': ['intentDigest', 'spendDispatchDigest', 'observation'],
  'live-local-completion': ['intentDigest', 'coordinatorReceipt', 'chargedMs'],
  'live-builder-ready': ['builderIntentDigest', 'ready'],
  'live-generation-intent': ['authorization', 'time', 'countResultDigest', 'builderIntentDigest', 'readyDigest', 'spendReservationDigest'],
  'live-response-text': ['identityDigest', 'encoding', 'byteDigest', 'bytes', 'base64'],
  'live-recovery-intent': ['reconcileIntentDigest', 'generationIntentDigest', 'sourceResultDigest', 'responseId', 'authorization', 'time', 'spendReservationDigest'],
};
function operation(planDigest, slot, stage) {
  return liveOperationIdentity({ planDigest, slot, stage, ...(stage === 'recovery' ? { originalGenerationOperationId: liveOperationIdentity({ planDigest, slot, stage: 'generation' }).operationId } : {}) });
}
function stageOf(r, supplied) {
  const fixed = { 'live-count-intent': 'count', 'live-public-packet': 'count', 'live-builder-ready': 'generation', 'live-generation-intent': 'generation', 'live-recovery-intent': 'recovery' }[r.kind];
  const stage = fixed ?? supplied ?? ['count', 'generation', 'recovery'].find(s => operation(r.planDigest, r.slot, s).operationId === r.operationId);
  need(['count', 'generation', 'recovery'].includes(stage) && (!supplied || stage === supplied)); return stage;
}
function recoveryBinding(t, r, context) {
  if (t.mode === 'provider-get') {
    keys(t, ['mode', 'slot', 'generationOperationId', 'generationIntentDigest', 'sourceResultDigest', 'responseId', 'authorization']);
    need(slotId(t.slot) && responseId(t.responseId)); hashes(t, ['generationIntentDigest', 'sourceResultDigest']);
    need(t.generationOperationId === operation(r.planDigest, t.slot, 'generation').operationId);
    const op = operation(r.planDigest, t.slot, 'recovery'); authorization(t.authorization, { ...r, slot: t.slot }, context); need(t.authorization.identityDigest === op.identityDigest);
  } else {
    keys(t, ['mode', 'slot', 'operationKind', 'operationId', 'originalIntentDigest', 'admissionReceiptDigest', 'leaseDigest']);
    need(t.mode === 'local-only' && slotId(t.slot) && ['count', 'generation'].includes(t.operationKind) && hash(t.originalIntentDigest));
    need(t.operationId === operation(r.planDigest, t.slot, t.operationKind).operationId);
    for (const k of ['admissionReceiptDigest', 'leaseDigest']) need(t[k] === null || hash(t[k]));
    need((t.admissionReceiptDigest === null) === (t.leaseDigest === null));
  }
  if (context.plan) selected(context.plan, t.slot);
}
function reconcileReceipt(r, context) {
  const prefix = ['schemaVersion', 'kind', 'planDigest', 'digest'];
  if (r.kind === 'live-reconcile-intent') {
    keys(r, [...prefix, 'approvalDigest', 'descriptorPath', 'descriptorHash', 'snapshotDigest', 'controllerDigest', 'startedAt', 'deadlineEpochMs', 'policy', 'schedule', 'target']);
    hashes(r, ['approvalDigest', 'descriptorHash', 'snapshotDigest', 'controllerDigest']); need(pathValue(r.descriptorPath) && time(r.startedAt) && integer(r.deadlineEpochMs, 1));
    need(equal(r.policy, { attemptsPerAction: 1, operationDeadlineMs: 1000, reconcileMsPerSlot: 10000, cancelMsPerSlot: 10000 }));
    scheduleValue(r.schedule); need(r.deadlineEpochMs - Date.parse(r.startedAt) === r.schedule.maximumMs);
    recoveryBinding(r.target, r, context);
    const gets = r.schedule.steps.filter(s => s.kind === 'provider-get'), credentials = r.schedule.steps.filter(s => s.kind === 'credential-read');
    need(r.target.mode === 'local-only' ? gets.length === 0 && credentials.length === 0 : gets.length === 1 && credentials.length === 1 && r.schedule.steps.at(-1).kind === 'provider-get');
  } else if (r.kind === 'live-local-reconcile') {
    keys(r, [...prefix, 'reconcileIntentDigest', 'slot', 'operationKind', 'operationId', 'originalIntentDigest', 'admissionReceiptDigest', 'leaseDigest', 'localState', 'requestSettlement', 'dockerReconciliationDigest', 'spendEffect', 'providerEffect', 'acceptanceEffect']);
    need(hash(r.reconcileIntentDigest));
    recoveryBinding({ mode: 'local-only', ...Object.fromEntries(['slot', 'operationKind', 'operationId', 'originalIntentDigest', 'admissionReceiptDigest', 'leaseDigest'].map(k => [k, r[k]])) }, r, context);
    need(['released', 'retained-uncertain', 'lease-unavailable'].includes(r.localState) && r.spendEffect === 'none' && r.providerEffect === 'none' && r.acceptanceEffect === 'none');
    need(r.dockerReconciliationDigest === null || hash(r.dockerReconciliationDigest));
    if (r.requestSettlement !== null) requestSettlement(r.requestSettlement);
    if (r.operationKind === 'count') {
      need(r.dockerReconciliationDigest === null);
      if (r.requestSettlement) need(r.requestSettlement.operationId === r.operationId);
      if (r.localState === 'released') need(r.requestSettlement?.released === true && ['owner-exited', 'transport-closed', 'not-started'].includes(r.requestSettlement.observation.state) && r.leaseDigest !== null);
      else need(r.requestSettlement === null || r.requestSettlement.released === false);
    } else { need(r.requestSettlement === null); if (r.localState === 'released') need(hash(r.dockerReconciliationDigest) && r.leaseDigest !== null); }
    if (r.localState === 'lease-unavailable') need(r.leaseDigest === null && r.requestSettlement === null);
  } else {
    need(r.kind === 'live-reconcile-result');
    keys(r, [...prefix, 'reconcileIntentDigest', 'mode', 'slot', 'recoveryResultDigest', 'localCompletionDigest', 'dockerReconciliationDigest', 'state', 'acceptance']);
    need(hash(r.reconcileIntentDigest) && slotId(r.slot) && ['provider-get', 'local-only'].includes(r.mode) && ['recorded', 'uncertain'].includes(r.state) && ['unknown', 'preserved'].includes(r.acceptance));
    for (const k of ['recoveryResultDigest', 'localCompletionDigest', 'dockerReconciliationDigest']) need(r[k] === null || hash(r[k]));
    if (r.mode === 'local-only') need(r.recoveryResultDigest === null && hash(r.localCompletionDigest));
    if (context.plan) selected(context.plan, r.slot);
  }
}
/** Closed values only. Disk encoding/mode and predecessor relationships are checked by inspectLiveRecords. */
export function validateLiveReceipt(value, context = {}) {
  return boundary(() => {
    const r = copy(value);
    need(r.schemaVersion === 1 && hash(r.planDigest) && hash(r.digest) && sealRecord(r).digest === r.digest);
    if (context.plan) need(r.planDigest === context.plan.digest);
    if (['live-reconcile-intent', 'live-local-reconcile', 'live-reconcile-result'].includes(r.kind)) reconcileReceipt(r, context);
    else {
      need(Object.hasOwn(EXTRA, r.kind)); keys(r, [...COMMON, ...EXTRA[r.kind]]); need(slotId(r.slot) && id(r.operationId));
      if (context.slot) need(r.slot === context.slot);
      if (context.plan) selected(context.plan, r.slot);
      const stage = stageOf(r, context.stage), op = operation(r.planDigest, r.slot, stage); need(r.operationId === op.operationId);
      if (r.authorization) { authorization(r.authorization, r, context); need(r.authorization.identityDigest === op.identityDigest); }
      if (r.time) {
        timeBudget(r.time);
        if (stage === 'recovery') need(r.time.reservedMs <= 10000);
        else if (context.plan) need(r.time.reservedMs + r.time.priorChargedMs <= selected(context.plan, r.slot).task.limits.minutes * 60000);
      }
      for (const k of EXTRA[r.kind].filter(k => k.endsWith('Digest') || k === 'packetRecordBytesHash')) need(hash(r[k]));
      if (r.identityDigest) need(r.identityDigest === op.identityDigest);
      if (r.kind === 'live-public-packet') preparedPacket(r.preparation);
      if (r.kind === 'live-response-text') {
        need(stage !== 'count' && r.encoding === 'base64' && integer(r.bytes, 0, LIVE_RECORD_LIMITS.decodedText) && typeof r.base64 === 'string');
        const b = Buffer.from(r.base64, 'base64'); need(b.toString('base64') === r.base64 && b.length === r.bytes && byteDigest(b) === r.byteDigest);
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b); need(text.isWellFormed() && !text.includes('\0') && Buffer.from(text).equals(b));
      }
      if (r.kind === 'live-request-admission') { need(stage !== 'generation'); requestLease(r.lease); need(r.lease.id === op.identityDigest.slice(0, 32)); need(r.lease.operationId === r.operationId && r.lease.requestKind === stage); }
      if (r.kind === 'live-request-refusal') need(stage !== 'generation' && r.authority === 'request-capacity-refusal-v1' && r.reason === 'capacity-busy');
      if (r.kind === 'live-local-completion') { need(stage !== 'generation'); requestSettlement(r.coordinatorReceipt); need(r.coordinatorReceipt.id === op.identityDigest.slice(0, 32)); need(r.coordinatorReceipt.operationId === r.operationId && integer(r.chargedMs)); }
      if (r.kind === 'live-provider-result') observation(r.observation, stage);
      if (r.kind === 'live-recovery-intent') need(responseId(r.responseId));
      if (r.kind === 'live-builder-ready') {
        const x = r.ready; keys(x, ['schemaVersion', 'operation', 'containerId', 'imageId', 'deliveredDigest', 'bridgeDigest', 'deadlineEpochMs']);
        need(x.schemaVersion === 1 && /^plates-eval-[a-f0-9]{32}-builder$/.test(x.operation) && hash(x.containerId) && /^sha256:[a-f0-9]{64}$/.test(x.imageId) && integer(x.deadlineEpochMs, 1)); hashes(x, ['deliveredDigest', 'bridgeDigest']);
      }
    }
    const max = r.kind === 'live-public-packet' ? LIVE_RECORD_LIMITS.packet : r.kind === 'live-response-text' ? LIVE_RECORD_LIMITS.text : LIVE_RECORD_LIMITS.small;
    need(bytes(r) <= max); return r;
  });
}
/** Fixed experiment-relative path. Reconcile output names require their retained approval digest. */
export function liveReceiptPath(r, { stage, approvalDigest } = {}) {
  return boundary(() => {
    if (r.kind === 'live-reconcile-intent') return 'execution/control/reconcile-intent.json';
    if (r.kind === 'live-local-reconcile' || r.kind === 'live-reconcile-result') {
      need(hash(approvalDigest)); return `execution/control/${r.kind === 'live-local-reconcile' ? 'local-reconcile' : 'reconcile'}-${approvalDigest}.json`;
    }
    const s = stageOf(r, stage); need(slotId(r.slot) && id(r.operationId));
    const name = {
      'live-count-intent': 'count-intent', 'live-public-packet': 'packet', 'live-generation-intent': 'provider-intent', 'live-builder-ready': 'ready',
      'live-request-admission': s === 'count' ? 'count-admission' : 'admission', 'live-request-refusal': s === 'count' ? 'count-refusal' : 'refusal',
      'live-provider-result': s === 'count' ? 'count-result' : s === 'generation' ? 'provider-result' : 'result',
      'live-local-completion': s === 'count' ? 'count-local' : 'local', 'live-response-text': s === 'generation' ? 'provider-text' : 'text', 'live-recovery-intent': 'intent',
    }[r.kind]; need(name);
    return `execution/${s === 'count' ? `preparations/${r.slot}` : s === 'generation' ? r.slot : `control/provider-recovery/${r.operationId}`}/${name}.json`;
  });
}
const legacyNames = /^(?:intent|lease|admission-refusal|dispatch-builder|builder|artifact|verdict|result|dispatch-check-[0-7]|check-[0-7]|reconciliation-[a-f0-9]{64})\.json$/;
function slotNames(plan) { return plan.bundle.comparison.pairs.flatMap(p => ['baseline', 'candidate'].map(a => p.id + '-' + a)); }
function pathType(path, plan) {
  const names = slotNames(plan), parts = path.split('/');
  if (parts[0] === 'execution') {
    if (path === 'execution/reservation.json') return { type: 'legacy', category: 'execution-reservation' };
    if (parts[1] === 'preparations' && names.includes(parts[2]) && parts.length === 4) {
      if (!['packet.json', 'count-intent.json', 'count-admission.json', 'count-refusal.json', 'count-result.json', 'count-local.json'].includes(parts[3])) return null;
      return { type: 'live', stage: 'count', slot: parts[2], category: parts[3] === 'packet.json' ? `packet:${parts[2]}` : `small:${parts[2]}` };
    }
    if (names.includes(parts[1]) && parts.length === 3) {
      if (['ready.json', 'provider-intent.json', 'provider-result.json', 'provider-text.json'].includes(parts[2])) return { type: 'live', stage: 'generation', slot: parts[1], category: parts[2] === 'provider-text.json' ? `text:${parts[1]}` : `small:${parts[1]}` };
      if (legacyNames.test(parts[2])) return { type: 'legacy', slot: parts[1], category: parts[2].startsWith('reconciliation-') ? 'legacy-recovery' : `builder:${parts[1]}` };
    }
    if (parts[1] === 'control') {
      if (parts.length === 3 && /^(?:reconcile-intent|reconcile-[a-f0-9]{64}|local-reconcile-[a-f0-9]{64})\.json$/.test(parts[2])) return { type: 'live', category: 'recovery-small' };
      if (parts.length === 3 && /^(?:cancel|cancel-intent|cancel-[a-f0-9]{64})\.json$/.test(parts[2])) return { type: 'legacy', category: 'legacy-recovery' };
      if (parts[2] === 'provider-recovery' && id(parts[3]) && parts.length === 5 && ['intent.json', 'admission.json', 'refusal.json', 'local.json', 'text.json', 'result.json'].includes(parts[4])) return { type: 'live', stage: 'recovery', operationId: parts[3], category: parts[4] === 'text.json' ? 'recovery-text' : 'recovery-small' };
    }
  }
  if (path === 'spend/reservation.json') return { type: 'spend', category: 'spend-reservation' };
  if (parts[0] === 'spend' && parts[1] === 'operations') {
    const opId = parts[2]?.endsWith('.intent.json') ? parts[2].slice(0, -12) : parts[2];
    if (!id(opId)) return null;
    const init = parts.length === 3 && parts[2].endsWith('.intent.json');
    const small = parts.length === 4 && ['reservation.json', 'dispatch.json'].includes(parts[3]);
    const observation = parts.length === 5 && parts[3] === 'observations' && /^[1-8]\.json$/.test(parts[4]);
    if (init || small || observation) {
      for (const slot of names) for (const stage of ['count', 'generation', 'recovery']) if (operation(plan.digest, slot, stage).operationId === opId)
        return { type: 'spend', slot, stage, operationId: opId, category: stage === 'recovery' ? 'recovery-spend' : `spend:${slot}`, maximum: init || parts[3] === 'reservation.json' ? 16384 : 4096 };
    }
  }
  return null;
}
function directoryKnown(path, plan) {
  const p = path.split('/'), names = slotNames(plan);
  return path === 'execution' || path === 'execution/preparations' || path === 'execution/control' || path === 'execution/control/provider-recovery'
    || p.length === 2 && p[0] === 'execution' && names.includes(p[1])
    || p.length === 3 && p[0] === 'execution' && p[1] === 'preparations' && names.includes(p[2])
    || p.length === 4 && p.slice(0, 3).join('/') === 'execution/control/provider-recovery' && id(p[3])
    || path === 'spend' || path === 'spend/operations'
    || p[0] === 'spend' && p[1] === 'operations' && id(p[2]) && (p.length === 3 || p.length === 4 && p[3] === 'observations');
}
function leaseMatch(receipt, lease) {
  need(receipt.id === lease.id && receipt.operationId === lease.operationId && receipt.commandDigest === lease.commandDigest && receipt.repo === lease.repo && receipt.root === lease.root && receipt.createdAt === lease.createdAt);
  if (receipt.observation.state === 'owner-exited') need(receipt.observation.pid === lease.pid);
}
function linkOperations(rows, plan, spend, gap) {
  const byPath = new Map(rows.filter(f => f.valid).map(f => [f.path, f.record]));
  const get = path => byPath.get(path), slots = [];
  const check = (name, fn) => { try { fn(); } catch { gap(name, 'binding'); } };
  const spendOps = spend?.operations ?? [];
  function chain(stage, slot, prefix, names) {
    const intent = get(prefix + names.intent), packet = stage === 'count' ? get(prefix + 'packet.json') : null;
    const admission = names.admission ? get(prefix + names.admission) : null, refusal = names.refusal ? get(prefix + names.refusal) : null;
    const result = get(prefix + names.result), local = names.local ? get(prefix + names.local) : null, text = names.text ? get(prefix + names.text) : null;
    const present = [intent, packet, admission, refusal, result, local, text].some(Boolean);
    if (!present) return null;
    const opId = operation(plan.digest, slot, stage).operationId, op = spendOps.find(o => o.reservation.operationId === opId);
    check(prefix, () => {
      need(intent);
      need(intent.operationId === opId && intent.slot === slot);
      for (const r of [admission, refusal, result, local].filter(Boolean)) need(r.intentDigest === intent.digest && r.slot === slot && r.operationId === opId);
      need(op && op.reservation.digest === intent.spendReservationDigest && op.reservation.planDigest === plan.digest && op.reservation.trialId === slot && op.reservation.operationKind === stage && op.reservation.quoteDigest === intent.authorization.quoteDigest && op.reservation.requestDigest === intent.authorization.requestDigest);
      need(op.reservation.quote.packetDigest === intent.authorization.binding.packetDigest && op.reservation.quote.priceEvidence.model === intent.authorization.model.resolved && equal(op.reservation.quote.priceEvidence.scope, intent.authorization.scope));
      if (stage !== 'generation') need(op.reservation.quote.inputTokens === 0 && op.reservation.quote.maxOutputTokens === 0 && op.reservation.quote.priceEvidence.rates[stage].inputTokens.microUsd === 0 && op.reservation.quote.priceEvidence.rates[stage].outputTokens.microUsd === 0);
      if (stage === 'count') {
        need(packet && byteDigest(JSON.stringify(rows.find(f => f.path === prefix + 'packet.json').record) + '\n') === intent.packetRecordBytesHash);
        need(packet.slot === slot && packet.operationId === opId && packet.identityDigest === intent.authorization.identityDigest);
        const p = packet.preparation, b = intent.authorization.binding;
        const payload = parsePartitionJson(Buffer.from(p.packet.input)), task = selected(plan, slot).task;
        need(payload.publicBrief === task.publicBrief && equal(payload.requirements, task.requirements) && equal(payload.writablePaths, [...task.allowlist.paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))));
        need(p.digest === b.packetPreparationDigest && p.packetDigest === b.packetDigest && p.publicViewDigest === b.publicViewDigest && p.templateDigest === b.templateDigest && equal(p.model, intent.authorization.model));
      }
      if (refusal) need(!admission && !result && !local && !op.dispatch);
      if (admission) need(admission.lease.operationId === opId && admission.lease.commandDigest === intent.authorization.approvalDigest && admission.lease.deadlineEpochMs === intent.time.deadlineEpochMs);
      if (result) {
        need((stage === 'generation' || admission) && !refusal && op.dispatch && result.spendDispatchDigest === op.dispatch.digest);
        const o = result.observation;
        if (o.response) {
          need(equal(o.response.model, intent.authorization.model));
          if (stage !== 'recovery') need(o.response.packetDigest === intent.authorization.binding.packetDigest);
          if (stage === 'recovery') need(o.response.id === intent.responseId);
        }
        if (stage !== 'count' && o.state === 'observed') { need(text && text.digest === o.textDigest); if (o.response.status === 'completed') need(Buffer.from(text.base64, 'base64').toString('utf8').trim().length > 0); }
      }
      for (const observed of op.observations) {
        if (observed.usage === null) continue;
        const source = rows.find(f => f.valid && f.record?.digest === observed.evidenceDigest)?.record;
        need(source?.kind === 'live-provider-result' && source.observation.state !== 'uncertain' && source.slot === slot);
        const response = source.observation.response;
        if (stage === 'generation') {
          need(response.kind === 'evaluation-provider-response' && response.usage && equal(observed.usage, { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, requests: 1 }));
          need(source.operationId === opId || source.operationId === operation(plan.digest, slot, 'recovery').operationId && result?.observation.response?.id === response.id);
          if (observed.outcome === 'complete') need(response.terminal);
        } else need(source.operationId === opId && equal(observed.usage, { inputTokens: 0, outputTokens: 0, requests: 1 }));
      }
      if (text) need(result && result.observation.state === 'observed' && result.observation.textDigest === text.digest && text.operationId === opId && text.slot === slot && text.identityDigest === intent.authorization.identityDigest);
      if (local) { need(admission); leaseMatch(local.coordinatorReceipt, admission.lease); need(local.chargedMs >= intent.time.priorChargedMs); }
    });
    const state = refusal ? 'refused' : result?.observation.state === 'observed' && op?.complete === true && (stage === 'count' || result.observation.response.terminal) && (stage === 'generation' || local?.coordinatorReceipt.released) ? 'observed' : result || op?.dispatch ? 'uncertain' : admission ? 'admitted' : 'reserved';
    return { state, intent: intent ?? null, packet: packet ?? null, admission: admission ?? null, refusal: refusal ?? null, result: result ?? null, local: local ?? null, text: text ?? null, spend: op ?? null };
  }
  for (const slot of slotNames(plan)) {
    const count = chain('count', slot, `execution/preparations/${slot}/`, { intent: 'count-intent.json', admission: 'count-admission.json', refusal: 'count-refusal.json', result: 'count-result.json', local: 'count-local.json' });
    const generation = chain('generation', slot, `execution/${slot}/`, { intent: 'provider-intent.json', result: 'provider-result.json', text: 'provider-text.json' });
    const ready = get(`execution/${slot}/ready.json`), builder = Object.fromEntries(rows.filter(f => f.valid && f.type?.type === 'legacy' && f.type.slot === slot && !f.path.includes('/reconciliation-')).map(f => [f.path.split('/').at(-1).slice(0, -5), f.record]));
    if (generation || ready) check(`execution/${slot}`, () => {
      need(builder.intent && builder.lease && builder['dispatch-builder'] && ready);
      need(count?.packet);
      const payload = parsePartitionJson(Buffer.from(count.packet.preparation.packet.input));
      const expectedFiles = validateFiles([...payload.files.map(f => ({ path: f.path, mode: f.mode, base64: Buffer.from(f.content).toString('base64') })), { path: 'requirements.json', mode: '100644', base64: Buffer.from(JSON.stringify({ publicBrief: payload.publicBrief, requirements: payload.requirements })).toString('base64') }]);
      need(fingerprint(expectedFiles) === ready.ready.deliveredDigest && fingerprint(validateFiles(builder.intent.input.delivered)) === ready.ready.deliveredDigest);
      need(ready.builderIntentDigest === builder.intent.digest && ready.ready.operation === builder.intent.operations[0] && ready.ready.imageId === builder.intent.input.image.id && ready.ready.deliveredDigest === builder.intent.input.deliveredDigest);
      if (generation) {
        const i = generation.intent; need(i && i.readyDigest === ready.digest && i.builderIntentDigest === builder.intent.digest && i.countResultDigest === count?.result?.digest);
        need(count?.result?.observation.state === 'observed' && count.local?.coordinatorReceipt.released && count.spend?.complete === true);
        need(equal(count.intent.authorization.binding, i.authorization.binding) && equal(count.intent.authorization.model, i.authorization.model) && equal(count.intent.authorization.scope, i.authorization.scope) && equal(count.intent.authorization.credential, i.authorization.credential));
        need(i.authorization.binding.bridgeDigest === ready.ready.bridgeDigest && i.time.deadlineEpochMs <= ready.ready.deadlineEpochMs);
      }
      if (builder.artifact) need(generation?.result?.observation.state === 'observed' && generation.result.observation.response.status === 'completed' && generation.result.observation.response.outputLimitExceeded === false && builder.builder?.stage?.termination?.state === 'terminated');
    });
    if (count || generation || ready || Object.keys(builder).length) slots.push({ slot, count, generation, ready: ready ?? null, builder });
  }
  const intent = get('execution/control/reconcile-intent.json'); let reconcile = null;
  if (intent) {
    const approval = intent.approvalDigest, target = intent.target, slot = slots.find(s => s.slot === target.slot);
    const local = get(`execution/control/local-reconcile-${approval}.json`), result = get(`execution/control/reconcile-${approval}.json`);
    const recovery = target.mode === 'provider-get' ? chain('recovery', target.slot, `execution/control/provider-recovery/${operation(plan.digest, target.slot, 'recovery').operationId}/`, { intent: 'intent.json', admission: 'admission.json', refusal: 'refusal.json', result: 'result.json', local: 'local.json', text: 'text.json' }) : null;
    check('execution/control/reconcile-intent.json', () => {
      need(slot);
      const observedSteps = intent.schedule.steps.filter(s => s.kind !== 'credential-read' && s.kind !== 'provider-get');
      const originalOperations = target.mode === 'local-only' && target.operationKind === 'count'
        ? slot.count?.admission ? [{ kind: 'owner-observe', operationId: target.operationId }] : []
        : (slot.builder.intent?.operations ?? []).map(operationId => ({ kind: 'docker-observe', operationId }));
      need(equal(observedSteps.map(({ kind, operationId }) => ({ kind, operationId })), originalOperations));
      if (target.mode === 'provider-get') need(intent.schedule.steps.find(s => s.kind === 'provider-get').operationId === operation(plan.digest, target.slot, 'recovery').operationId);
      if (target.mode === 'local-only') {
        const original = target.operationKind === 'count' ? slot.count?.intent : slot.generation?.intent ?? slot.builder.intent;
        const admitted = target.operationKind === 'count' ? slot.count?.admission : slot.builder.lease;
        need(original && target.originalIntentDigest === original.digest && target.operationId === operation(plan.digest, target.slot, target.operationKind).operationId);
        need(target.admissionReceiptDigest === (admitted?.digest ?? null) && target.leaseDigest === (admitted ? fingerprint(admitted.lease) : null));
        if (local) {
          need(local.reconcileIntentDigest === intent.digest);
          for (const k of ['slot', 'operationKind', 'operationId', 'originalIntentDigest', 'admissionReceiptDigest', 'leaseDigest']) need(equal(local[k], target[k]));
          if (local.requestSettlement) {
            need(admitted); leaseMatch(local.requestSettlement, admitted.lease);
            if (local.localState === 'released' && local.requestSettlement.observation.state !== 'owner-exited') {
              // Recover prior closure only from the original immutable completion;
              // coordinator history alone cannot manufacture experiment evidence.
              need(slot.count?.local && equal(local.requestSettlement, slot.count.local.coordinatorReceipt));
            }
          }
          if (local.dockerReconciliationDigest !== null) {
            const docker = rows.find(f => f.valid && f.type?.slot === target.slot && f.record?.digest === local.dockerReconciliationDigest)?.record;
            need(docker && docker.kind === 'evaluation-reconciliation' && docker.intentDigest === slot.builder.intent.digest && equal(docker.observations, docker.settlement?.observations));
            need(Array.isArray(docker.observations) && docker.observations.length === slot.builder.intent.operations.length && docker.observations.every((o, i) => o.operation === slot.builder.intent.operations[i] && ['terminated', 'unknown', 'not-dispatched'].includes(o.state)));
            need(docker.settlement.id === slot.builder.lease.lease.id && docker.settlement.commandDigest === slot.builder.lease.lease.commandDigest);
            if (local.localState === 'released') need(docker.settlement.released === true && docker.observations.every(o => o.state !== 'unknown'));
          }
        }
      } else {
        need(!local && slot.generation?.intent.digest === target.generationIntentDigest && slot.generation?.result?.digest === target.sourceResultDigest && slot.generation.result.observation.response?.id === target.responseId);
        if (recovery) { const originalAuth = slot.generation.intent.authorization; for (const key of ['binding', 'credential', 'scope', 'model']) need(equal(target.authorization[key], originalAuth[key])); const r = recovery.intent; need(r && r.reconcileIntentDigest === intent.digest && r.generationIntentDigest === target.generationIntentDigest && r.sourceResultDigest === target.sourceResultDigest && r.responseId === target.responseId && equal(r.authorization, target.authorization)); }
      }
      if (result) {
        need(result.reconcileIntentDigest === intent.digest && result.slot === target.slot && result.mode === target.mode);
        need(result.recoveryResultDigest === (recovery?.result?.digest ?? null) && result.localCompletionDigest === (target.mode === 'local-only' ? local?.digest ?? null : recovery?.local?.digest ?? null));
        if (result.acceptance === 'preserved') need(slot.builder.verdict && ['accepted', 'rejected', 'unknown'].includes(slot.builder.verdict.acceptance));
        if (result.dockerReconciliationDigest !== null) need(rows.some(f => f.valid && f.type?.slot === target.slot && f.record?.kind === 'evaluation-reconciliation' && f.record.digest === result.dockerReconciliationDigest));
      }
    });
    reconcile = { intent, local: local ?? null, recovery, result: result ?? null };
  }
  for (const f of rows.filter(f => f.valid && f.type?.type === 'live')) {
    check(f.path, () => {
      need(liveReceiptPath(f.record, { stage: f.type.stage, approvalDigest: intent?.approvalDigest }) === f.path);
      if (f.path.startsWith('execution/control/') && f.record.kind !== 'live-reconcile-intent') need(intent);
      if (f.type.stage === 'recovery') need(intent?.target.mode === 'provider-get' && f.record.slot === intent.target.slot);
      if (intent?.target.mode === 'local-only') need(f.type.stage !== 'recovery');
    });
  }
  return { slots, reconcile };
}
/** One fresh canonical scan shared by capacity accounting and authority replay. */
async function scanLiveInventory(directory, plan) {
  const gaps = [], files = [], managedDirectories = [], frozenUsage = { bytes: 0, count: 0 }; let totalBytes = 0, totalCount = 0, visitedEntries = 0;
  const gap = (path, code) => { if (!gaps.some(g => g.path === path && g.code === code)) gaps.push({ path, code }); const prefix = path.replace(/\/$/, ''); for (const f of files) if (f.path === prefix || f.path.startsWith(prefix + '/')) f.valid = false; };
  try {
    need(pathValue(directory) && await realpath(directory) === directory && await safePath(directory));
    need(((await lstat(directory)).mode & 0o7777) === 0o700);
    const names = slotNames(plan); need(new Set(names).size === names.length && names.length <= 2000);
    async function visit(relative = '', depth = 0) {
      need(depth <= 8);
      for (const name of (await readdir(join(directory, relative))).sort()) {
        need(++visitedEntries <= 40000);
        const path = relative ? relative + '/' + name : name, absolute = join(directory, path), stat = await lstat(absolute);
        const managed = path === 'execution' || path.startsWith('execution/') || path === 'spend' || path.startsWith('spend/');
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          if (managed) managedDirectories.push(path);
          if ((stat.mode & 0o7777) !== 0o700) gap(path, 'directory-mode');
          if (managed ? !directoryKnown(path, plan) : !['attachments', 'reports'].includes(path.split('/')[0])) gap(path, 'unknown-directory');
          await visit(path, depth + 1); continue;
        }
        totalCount++; totalBytes += stat.size; need(totalCount <= LIVE_RECORD_LIMITS.events && totalBytes <= LIVE_RECORD_LIMITS.bytes);
        if (!managed) {
          frozenUsage.bytes += stat.size; frozenUsage.count++;
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !(path === 'state.json' || path.startsWith('attachments/') || path.startsWith('reports/'))) gap(path, 'unknown-frozen-file');
          continue;
        }
        const type = pathType(path, plan), row = { path, bytes: stat.size, valid: false, record: null, type }; files.push(row);
        if (!type) { gap(path, 'unknown-file'); continue; }
        try {
          need(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && (stat.mode & 0o7777) === 0o400);
          const max = type.type === 'legacy' ? 4 * 1024 * 1024 : path.endsWith('/packet.json') ? LIVE_RECORD_LIMITS.packet : /\/(?:provider-text|text)\.json$/.test(path) ? LIVE_RECORD_LIMITS.text : type.maximum ?? LIVE_RECORD_LIMITS.small;
          const raw = await evaluationBytes(absolute, max), parsed = parsePartitionJson(raw, max > 1048576 ? 1048576 : max);
          need(raw.toString('utf8') === JSON.stringify(parsed) + '\n' && sealRecord(parsed).digest === parsed.digest);
          const after = await lstat(absolute); need(after.ino === stat.ino && after.dev === stat.dev && after.size === stat.size && after.mtimeMs === stat.mtimeMs && after.nlink === 1 && (after.mode & 0o7777) === 0o400);
          if (type.type === 'live') validateLiveReceipt(parsed, { plan, slot: type.slot, stage: type.stage });
          else if (type.type === 'legacy') {
            need(parsed.schemaVersion === 2);
            if (/\/reconciliation-[a-f0-9]{64}\.json$/.test(path)) need(path.endsWith(`/reconciliation-${parsed.digest}.json`) && parsed.kind === 'evaluation-reconciliation');
            if (path === 'execution/reservation.json') {
              keys(parsed, ['schemaVersion', 'kind', 'id', 'createdAt', 'planDigest', 'allowance', 'currencyUsage', 'digest']);
              need(parsed.kind === 'evaluation-reservation' && parsed.planDigest === plan.digest && equal(parsed.allowance, plan.bundle.comparison.allowance) && parsed.currencyUsage === null);
            } else if (path.startsWith('execution/control/')) need(parsed.planDigest === plan.digest && ['evaluation-cancel', 'evaluation-control', 'evaluation-recovery-reservation'].includes(parsed.kind));
          }
          else need(parsed.schemaVersion === 1);
          row.record = parsed; row.valid = true;
        } catch { gap(path, 'invalid-record'); }
      }
    }
    await visit();
    return { gaps, files, managedDirectories, usage: { bytes: totalBytes, count: totalCount }, frozenUsage };
  } catch { gap('', 'unavailable'); return { gaps, files, managedDirectories, usage: null, frozenUsage: null }; }
}
/** Retention-only readback. Structural gaps refuse capacity; no dispatch/acceptance authority. */
export async function inspectLiveInventory(directory, plan) {
  const { managedDirectories: _directories, ...inventory } = await scanLiveInventory(directory, plan);
  return inventory;
}
/** Read-only experiment inspection; gaps preserve original records and prohibit effects. */
export async function inspectLiveRecords(directory, plan) {
  const { gaps, files, managedDirectories, usage, frozenUsage } = await scanLiveInventory(directory, plan);
  const gap = (path, code) => { if (!gaps.some(g => g.path === path && g.code === code)) gaps.push({ path, code }); const prefix = path.replace(/\/$/, ''); for (const f of files) if (f.path === prefix || f.path.startsWith(prefix + '/')) f.valid = false; };
  try {
    need(usage !== null && frozenUsage !== null);
    let spend = null;
    if (files.some(f => f.path.startsWith('spend/'))) {
      spend = await inspectSpend(directory, { plan });
      if (spend.state !== 'ready') { gap('spend', 'spend-gap'); for (const f of files.filter(f => f.type?.type === 'spend')) f.valid = false; }
    }
    for (const path of managedDirectories) {
      if (/^execution\/preparations\/[^/]+$/.test(path) && !files.some(f => f.path === path + '/count-intent.json')) gap(path, 'missing-intent');
      if (/^execution\/[^/]+$/.test(path) && !['execution/control', 'execution/preparations'].includes(path) && !files.some(f => f.path === path + '/intent.json')) gap(path, 'missing-intent');
      if (/^execution\/control\/provider-recovery\/[^/]+$/.test(path) && !files.some(f => f.path === path + '/intent.json')) gap(path, 'missing-intent');
    }
    const projection = linkOperations(files, plan, spend, gap);
    const { validateTrialChain } = await import('./evaluation-execution.mjs');
    for (const s of projection.slots) if (Object.keys(s.builder).length) {
      try {
        need(s.builder.intent && s.builder.intent.dispatchProtocol === 'ordered-live-authorization-v1'); // Legacy source bindings remain in intent.input.
        need(s.builder.intent.input.planDigest === plan.digest);
        for (const [name, r] of Object.entries(s.builder)) if (name !== 'intent') need(r.intentDigest === s.builder.intent.digest);
        validateTrialChain(s.builder, plan, s.slot);
        for (const f of files.filter(f => f.valid && f.type?.slot === s.slot && f.record?.kind === 'evaluation-reconciliation')) {
          const r = f.record; need(r.intentDigest === s.builder.intent.digest && r.result?.intentDigest === r.intentDigest && r.verdict?.intentDigest === r.intentDigest && sealRecord(r.result).digest === r.result.digest && sealRecord(r.verdict).digest === r.verdict.digest);
          need(r.verdict.acceptance === 'unknown' || r.verdict.digest === s.builder.verdict?.digest);
          need(r.result.verdictDigest === r.verdict.digest && equal(r.result.settlement, r.settlement) && equal(r.observations, r.settlement.observations));
          need(Array.isArray(r.observations) && r.observations.length === s.builder.intent.operations.length && r.observations.every((o, i) => o.operation === s.builder.intent.operations[i]));
        }
        for (const name of Object.keys(s.builder).filter(n => /^(?:dispatch-)?check-[0-7]$/.test(n))) need(Number(name.at(-1)) + 1 < s.builder.intent.operations.length);
        for (const name of Object.keys(s.builder).filter(n => n === 'builder' || /^check-[0-7]$/.test(n))) need(s.builder['dispatch-' + name]);
      } catch { gap(`execution/${s.slot}`, 'builder-chain'); }
    }
    for (const op of spend?.operations ?? []) {
      const slot = projection.slots.find(s => s.slot === op.reservation.trialId), kind = op.reservation.operationKind;
      if (kind === 'count' && !slot?.count?.intent || kind === 'generation' && !slot?.generation?.intent && !slot?.builder.intent || kind === 'recovery' && projection.reconcile?.recovery?.intent?.operationId !== op.reservation.operationId) gap(`spend/operations/${op.reservation.operationId}`, 'missing-live-intent');
    }
    const uncertainty = projection.slots.some(s => s.count && !['observed', 'refused'].includes(s.count.state) || s.generation && s.generation.state !== 'observed' || s.builder.intent && !s.builder.result) || projection.reconcile && !projection.reconcile.result;
    return { state: gaps.length ? 'gap' : uncertainty ? 'uncertain' : files.length ? 'ready' : 'absent', gaps, ...projection, files, usage, frozenUsage, spend, effectsBlocked: Boolean(gaps.length > 0 || uncertainty) };
  } catch { gap('', 'unavailable'); return { state: 'gap', gaps, slots: [], reconcile: null, files, usage: null, frozenUsage: null, spend: null, effectsBlocked: true }; }
}
/** Disjoint existing-experiment categories. No allocation store and no monetary authority. */
export function liveRetentionPlan(input) {
  return boundary(() => {
    keys(input, ['plan', 'files', 'frozenUsage']); const { plan, files, frozenUsage } = input;
    keys(frozenUsage, ['bytes', 'count']); need(integer(frozenUsage.bytes) && integer(frozenUsage.count));
    need(Array.isArray(files) && files.length <= LIVE_RECORD_LIMITS.events);
    const categories = new Map(), add = (name, maximumBytes, maximumEvents, pooled = false) => categories.set(name, { name, maximumBytes, maximumEvents, actualBytes: 0, actualEvents: 0, replacedBytes: 0, replacedEvents: 0, pooled });
    const slots = slotNames(plan); need(new Set(slots).size === slots.length && slots.length > 0 && slots.length <= 2000);
    for (const slot of slots) {
      add(`builder:${slot}`, 1572864, 26, true); add(`packet:${slot}`, 270336, 1); add(`text:${slot}`, 528384, 1);
      add(`small:${slot}`, 196608, 12); add(`spend:${slot}`, 139264, 22);
    }
    add('recovery-text', 528384, 1); add('recovery-small', 131072, 8); add('recovery-spend', 69632, 11);
    add('legacy-recovery', slots.length * 65536, slots.length * 4, true); add('spend-reservation', 16384, 1); add('execution-reservation', 16384, 1);
    let actualBytes = frozenUsage.bytes, actualEvents = frozenUsage.count;
    const gaps = [], seen = new Set();
    for (const f of files) {
      need(typeof f.path === 'string' && integer(f.bytes)); actualBytes += f.bytes; actualEvents++;
      need(integer(actualBytes) && integer(actualEvents));
      const t = pathType(f.path, plan), category = t && categories.get(t.category);
      if (seen.has(f.path)) { gaps.push({ path: f.path, code: 'duplicate-file' }); continue; } seen.add(f.path);
      if (!category || f.valid !== true || !f.record) { gaps.push({ path: f.path, code: 'uncredited-file' }); continue; }
      let valid = false;
      try {
        need(bytes(f.record) === f.bytes);
        if (t.type === 'live') {
          validateLiveReceipt(f.record, { plan, slot: t.slot, stage: t.stage });
          const reconcileIntent = files.find(x => x.path === 'execution/control/reconcile-intent.json' && x.valid)?.record;
          need(liveReceiptPath(f.record, { stage: t.stage, approvalDigest: reconcileIntent?.approvalDigest }) === f.path);
        } else need(sealRecord(f.record).digest === f.record.digest && f.record.schemaVersion === (t.type === 'spend' ? 1 : 2));
        valid = true;
      } catch { gaps.push({ path: f.path, code: 'invalid-credit' }); }
      if (!valid) continue;
      const maximum = category.pooled ? f.bytes : t.maximum ?? (t.category.startsWith('packet:') ? 270336 : t.category.startsWith('text:') || t.category === 'recovery-text' ? 528384 : 16384);
      if (f.bytes > maximum) { gaps.push({ path: f.path, code: 'file-category-overflow' }); continue; }
      category.actualBytes += f.bytes; category.actualEvents++; category.replacedBytes += maximum; category.replacedEvents++;
    }
    let remainingFutureBytes = 0, remainingFutureEvents = 0;
    for (const c of categories.values()) {
      if (c.actualBytes > c.maximumBytes || c.replacedBytes > c.maximumBytes || c.actualEvents > c.maximumEvents) gaps.push({ path: c.name, code: 'category-overflow' });
      c.remainingBytes = Math.max(0, c.maximumBytes - c.replacedBytes); c.remainingEvents = Math.max(0, c.maximumEvents - c.replacedEvents);
      remainingFutureBytes += c.remainingBytes; remainingFutureEvents += c.remainingEvents;
    }
    const totalBytes = actualBytes + remainingFutureBytes, totalEvents = actualEvents + remainingFutureEvents, policy = plan.bundle.comparison.retention;
    need(integer(policy.maxBytes, 1024, LIVE_RECORD_LIMITS.bytes) && integer(policy.maxEvents, 1, LIVE_RECORD_LIMITS.events));
    return { fits: gaps.length === 0 && totalBytes <= policy.maxBytes && totalEvents <= policy.maxEvents, gaps, actualBytes, actualEvents, remainingFutureBytes, remainingFutureEvents, totalBytes, totalEvents, categories: [...categories.values()] };
  });
}
