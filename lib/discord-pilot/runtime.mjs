import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const providerId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
export const outputSchema = { type: 'object', additionalProperties: false, required: ['text', 'handoff'], properties: {
  text: { type: 'string', minLength: 1, maxLength: 1500 }, handoff: { type: 'boolean' },
} };
export const outputSchemaOf = request => ({ ...outputSchema, properties: { ...outputSchema.properties,
  text: { ...outputSchema.properties.text, maxLength: request.maxReplyChars ?? 1500 } } });
export function outputOf(value, request) {
  let result;
  try { result = typeof value === 'string' ? JSON.parse(value) : value; } catch { throw new Error('runtime_output'); }
  if (!result || Object.keys(result).sort().join() !== 'handoff,text' || typeof result.text !== 'string'
    || !result.text.trim() || result.text.length > (request.maxReplyChars ?? 1500) || typeof result.handoff !== 'boolean') throw new Error('runtime_output');
  return { text: result.text, nextBotId: result.handoff ? request.peerBotId : null };
}
export function runtimeBinding(runtime, policy) {
  if (!policy || typeof policy.model !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(policy.model)
    || typeof policy.accountScope !== 'string' || !policy.accountScope || !['api-key', 'isolated-login'].includes(policy.authMode)
    || typeof policy.version !== 'string' || !policy.version || typeof policy.cwd !== 'string' || !policy.cwd.startsWith('/')
    || !Number.isSafeInteger(policy.microUsdPerToken) || policy.microUsdPerToken <= 0) throw new Error('runtime_policy');
  return digest({ runtime, ...policy });
}
// Core reservations bound how much work we admit, not the provider's eventual bill.
// Isolation is verified at startup; this guard binds each turn to that deployment.
export function createAdmissionGuard(bindings, limits) {
  return { async admit(request) {
    if (bindings[request.runtime] !== request.binding || request.signal.aborted
      || !Number.isSafeInteger(request.maxTokens) || request.maxTokens <= 0 || request.maxTokens > limits.turnTokens
      || !Number.isSafeInteger(request.maxCostMicros) || request.maxCostMicros <= 0 || request.maxCostMicros > limits.turnMicros) throw new Error('runtime_admission_denied');
    return { binding: request.binding, budgetPolicy: 'admission-estimates', maxTokens: request.maxTokens, maxCostMicros: request.maxCostMicros };
  } };
}
export async function admitRuntime({ enabled, runtime, policy, binding, guard }, request) {
  if (!enabled) throw new Error('live_disabled');
  if (request.signal.aborted) throw new Error('runtime_interrupted');
  if (typeof guard?.admit !== 'function') throw new Error('runtime_guard_unavailable');
  const admission = await guard.admit({ runtime, binding, model: policy.model, sessionId: request.sessionId,
    providerSession: request.providerSession ?? null, maxTokens: request.maxTokens, maxCostMicros: request.maxCostMicros,
    input: request.input, history: request.history, signal: request.signal });
  if (!admission || admission.binding !== binding || admission.budgetPolicy !== 'admission-estimates'
    || admission.maxTokens !== request.maxTokens || admission.maxCostMicros !== request.maxCostMicros
    || request.signal.aborted) throw new Error('runtime_admission_denied');
  const prior = request.providerSession;
  if (prior && (prior.runtime !== runtime || prior.binding !== binding || !providerId(prior.id))) throw new Error('runtime_session_binding');
}
export function bindSession(request, runtime, binding, id) {
  if (!providerId(id) || typeof request.bindProviderSession !== 'function') throw new Error('runtime_session');
  const prior = request.providerSession;
  if (prior && prior.id !== id) throw new Error('runtime_session_changed');
  request.bindProviderSession({ runtime, binding, id });
}
export function promptOf(request) {
  // Only the current attributed message goes into a resumed provider session; history is not duplicated.
  return `${request.system}\nReturn JSON with text and handoff (true only to invite the configured peer).\nDiscord message data:\n${JSON.stringify(request.input)}`;
}
export function usageResult(request, policy, tokens, reportedCost = null) {
  if (!Number.isSafeInteger(tokens) || tokens < 0) throw new Error('runtime_usage');
  const upper = tokens * policy.microUsdPerToken;
  const cost = reportedCost === null ? upper : Math.max(upper, reportedCost);
  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error('runtime_cost');
  request.recordUsage?.({ tokens, costMicros: cost }); // Retain observed overruns, even when no reply is sent.
  if (tokens > request.maxTokens) throw new Error('runtime_usage');
  if (cost > request.maxCostMicros) throw new Error('runtime_cost');
  return { sessionId: request.sessionId, tokens, costMicros: cost, costBasis: 'conservative-estimate' };
}
