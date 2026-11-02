// Phase119 foreground transport only. Caller owns approval, durable intent,
// monetary reservation and original-operation recovery; this module owns no store.
// Safeguards follow this repo's web/model-provider.mjs, without its planning prompt.
import { createHash } from 'node:crypto';

export const EVALUATION_PROVIDER_LIMITS = Object.freeze({
  packetBytes: 256 * 1024, requestBytes: 1024 * 1024,
  responseBytes: 1024 * 1024, responseChunks: 4096, textBytes: 384 * 1024,
  timeoutMs: 600000, tokens: 10000000, items: 100, depth: 40,
});
const MODEL = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
const RESPONSE = /^resp_[A-Za-z0-9_-]{1,200}$/;
const SCOPE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const integer = v => Number.isSafeInteger(v) && v >= 0;
const tokenLimit = v => integer(v) && v > 0 && v <= EVALUATION_PROVIDER_LIMITS.tokens;
const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail = code => { throw new Error(code); };
const codes = new Set(['evaluation_provider_input', 'evaluation_provider_timeout', 'evaluation_provider_response',
  'evaluation_provider_limit', 'evaluation_provider_denied', 'evaluation_provider_throttled', 'evaluation_provider_unavailable']);
function safeError(code, dispatch) {
  const error = new Error(code);
  error.code = code;
  // No response/body/cause/key on errors. Even HTTP rejection can incur cost.
  error.dispatch = dispatch;
  return error;
}
const reflected = (text, key) => [key, encodeURIComponent(key), Buffer.from(key).toString('base64'), Buffer.from(key).toString('base64url')]
  .some(value => text.includes(value));
function assertNoReflection(value, key, depth = 0) {
  if (depth > EVALUATION_PROVIDER_LIMITS.depth) fail('evaluation_provider_response');
  if (typeof value === 'string' && reflected(value, key)) fail('evaluation_provider_response');
  if (value && typeof value === 'object') for (const [name, child] of Object.entries(value)) {
    if (reflected(name, key)) fail('evaluation_provider_response');
    assertNoReflection(child, key, depth + 1);
  }
}
function identity(input) {
  if (typeof input.key !== 'string' || !/^[\x21-\x7e]{16,4096}$/.test(input.key)
    || !exact(input.scope, ['organization', 'project'])
    || !Object.values(input.scope).every(v => v === null || typeof v === 'string' && SCOPE.test(v) && !reflected(v, input.key))
    || !exact(input.model, ['requested', 'resolved'])
    || !Object.values(input.model).every(v => typeof v === 'string' && MODEL.test(v) && !reflected(v, input.key))) fail('evaluation_provider_input');
  return { Authorization: `Bearer ${input.key}`, 'Content-Type': 'application/json', accept: 'application/json',
    ...(input.scope.organization === null ? {} : { 'OpenAI-Organization': input.scope.organization }),
    ...(input.scope.project === null ? {} : { 'OpenAI-Project': input.scope.project }) };
}
/** Pure packet identity shared by preparation, count and start. No credential or I/O.
 * @param {{model: {requested: string, resolved: string}, packet: {instructions: string, input: string}} input
 */
export function prepareEvaluationProviderPacket(input) {
  try {
    if (!exact(input, ['model', 'packet']) || !exact(input.model, ['requested', 'resolved'])
      || !exact(input.packet, ['instructions', 'input'])) fail('evaluation_provider_input');
    const model = { requested: input.model.requested, resolved: input.model.resolved };
    if (!Object.values(model).every(v => typeof v === 'string' && MODEL.test(v))) fail('evaluation_provider_input');
    const p = { instructions: input.packet.instructions, input: input.packet.input };
    if (!Object.values(p).every(v => typeof v === 'string' && v.isWellFormed() && v.trim() && !v.includes('\0'))
      || Buffer.byteLength(JSON.stringify(p)) > EVALUATION_PROVIDER_LIMITS.packetBytes) fail('evaluation_provider_input');
    const body = Object.freeze({ model: model.resolved, instructions: p.instructions, input: p.input });
    if (Buffer.byteLength(JSON.stringify(body)) > EVALUATION_PROVIDER_LIMITS.requestBytes) fail('evaluation_provider_input');
    return Object.freeze({ body, packetDigest: digest(body) });
  } catch { throw safeError('evaluation_provider_input', 'not-dispatched'); }
}
function usageOf(value) {
  if (value === null || value === undefined) return null;
  if (!record(value) || ![value.input_tokens, value.output_tokens, value.total_tokens].every(integer)
    || !Number.isSafeInteger(value.input_tokens + value.output_tokens)
    || value.input_tokens + value.output_tokens !== value.total_tokens) fail('evaluation_provider_response');
  for (const [field, detail, total] of [['input_tokens_details', 'cached_tokens', value.input_tokens],
    ['output_tokens_details', 'reasoning_tokens', value.output_tokens]]) {
    if (value[field] !== undefined && value[field] !== null && (!record(value[field])
      || !integer(value[field][detail]) || value[field][detail] > total)) fail('evaluation_provider_response');
  }
  return { inputTokens: value.input_tokens, outputTokens: value.output_tokens, totalTokens: value.total_tokens,
    cachedInputTokens: value.input_tokens_details?.cached_tokens ?? null,
    reasoningTokens: value.output_tokens_details?.reasoning_tokens ?? null };
}
function responseOf(value, model, responseId, now) {
  if (!record(value) || value.object !== 'response' || typeof value.id !== 'string' || !RESPONSE.test(value.id)
    || responseId !== null && value.id !== responseId || value.model !== model.resolved || value.service_tier !== 'default'
    || !['queued', 'in_progress', 'completed', 'failed', 'cancelled', 'incomplete'].includes(value.status)
    || !integer(value.created_at) || value.created_at > Math.floor(now / 1000) + 60
    || value.created_at * 1000 > 8640000000000000
    || !Array.isArray(value.output) || value.output.length > EVALUATION_PROVIDER_LIMITS.items) fail('evaluation_provider_response');
  const parts = [];
  for (const item of value.output) {
    if (!record(item)) fail('evaluation_provider_response');
    if (item.type === 'reasoning') continue; // Hidden reasoning never leaves the adapter.
    if (item.type !== 'message' || item.role !== 'assistant' || !Array.isArray(item.content)
      || item.content.length > EVALUATION_PROVIDER_LIMITS.items) fail('evaluation_provider_response');
    for (const part of item.content) {
      if (!record(part) || part.type !== 'output_text' || typeof part.text !== 'string' || part.text.includes('\0')) fail('evaluation_provider_response');
      parts.push(part.text);
    }
  }
  const text = parts.join('\n');
  if (Buffer.byteLength(text) > EVALUATION_PROVIDER_LIMITS.textBytes) fail('evaluation_provider_limit');
  if (value.status === 'completed' && !text.trim()) fail('evaluation_provider_response');
  return { schemaVersion: 1, kind: 'evaluation-provider-response', provider: 'openai', id: value.id,
    model: { ...model }, actualServiceTier: value.service_tier, status: value.status,
    terminal: !['queued', 'in_progress'].includes(value.status), text, usage: usageOf(value.usage),
    createdAt: new Date(value.created_at * 1000).toISOString() };
}

/**
 * No default model, key lookup, retries, persistence or approval inference.
 * count({key,scope,model,packet}); start({...countInput,maxOutputTokens});
 * inspect({key,scope,model,responseId}). scope={organization,project} (explicit
 * null permitted); model={requested,resolved}; packet={instructions,input}.
 * timeoutMs must be supplied (1..600000); caller narrows it to its remaining
 * admitted deadline. fetcher defaults to native fetch only when a method runs.
 */
export function createEvaluationProvider({ fetcher = globalThis.fetch, now = Date.now, timeoutMs } = {}) {
  if (typeof fetcher !== 'function' || typeof now !== 'function' || !integer(timeoutMs)
    || timeoutMs < 1 || timeoutMs > EVALUATION_PROVIDER_LIMITS.timeoutMs) throw safeError('evaluation_provider_input', 'not-dispatched');
  async function perform(input, operation) {
    let attempted = false, timer, reader, response;
    const abort = new AbortController();
    // Cancellation of hostile/unfinished streams must never delay the deadline.
    const discard = () => { try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch {} };
    try {
      const fields = ['key', 'scope', 'model', ...(operation === 'inspect' ? ['responseId'] : ['packet']),
        ...(operation === 'start' ? ['maxOutputTokens'] : [])];
      if (!exact(input, fields)) fail('evaluation_provider_input');
      // Preserve the original key/cap across awaits even if the caller mutates
      // its input object while fetch is pending. Nested data is captured below.
      input = { ...input };
      const headers = identity(input), model = { ...input.model };
      let body, packetDigest = null;
      if (operation === 'inspect') {
        if (typeof input.responseId !== 'string' || !RESPONSE.test(input.responseId) || reflected(input.responseId, input.key)) fail('evaluation_provider_input');
      } else {
        const prepared = prepareEvaluationProviderPacket({ model, packet: input.packet });
        body = prepared.body; packetDigest = prepared.packetDigest;
        if (Object.values(body).some(v => reflected(v, input.key))) fail('evaluation_provider_input');
        if (operation === 'start') {
          if (!tokenLimit(input.maxOutputTokens)) fail('evaluation_provider_input');
          body = { ...body, tools: [], tool_choice: 'none', store: true, background: false, stream: false,
            truncation: 'disabled', max_output_tokens: input.maxOutputTokens, service_tier: 'default' };
        }
      }
      const encoded = body === undefined ? undefined : JSON.stringify(body);
      if (encoded !== undefined && (Buffer.byteLength(encoded) > EVALUATION_PROVIDER_LIMITS.requestBytes || reflected(encoded, input.key))) fail('evaluation_provider_input');
      const expectedId = operation === 'inspect' ? input.responseId : null;
      const url = 'https://api.openai.com/v1/responses' + (operation === 'count' ? '/input_tokens' : expectedId ? '/' + expectedId : '');
      const clock = now();
      if (!Number.isSafeInteger(clock) || clock < 0 || clock > 8640000000000000 - 60000) fail('evaluation_provider_input');
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { abort.abort(); discard(); reject(new Error('evaluation_provider_timeout')); }, timeoutMs);
      });
      const work = async () => {
        attempted = true;
        response = await fetcher(url, { method: operation === 'inspect' ? 'GET' : 'POST', headers,
          body: encoded, redirect: 'error', signal: abort.signal });
        if (abort.signal.aborted) { discard(); fail('evaluation_provider_timeout'); }
        if (response.redirected || response.url && response.url !== url) fail('evaluation_provider_response');
        for (const [name, value] of response.headers) if (reflected(name + ':' + value, input.key)) fail('evaluation_provider_response');
        if (!response.ok) fail(response.status === 401 || response.status === 403 ? 'evaluation_provider_denied'
          : response.status === 429 ? 'evaluation_provider_throttled' : 'evaluation_provider_unavailable');
        reader = response.body?.getReader();
        if (!reader) fail('evaluation_provider_response');
        const chunks = []; let size = 0, chunkCount = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (abort.signal.aborted) fail('evaluation_provider_timeout');
          if (done) break;
          // Count every chunk, including empty ones: immediately resolved reads
          // can starve the deadline timer without increasing the byte total.
          if (++chunkCount > EVALUATION_PROVIDER_LIMITS.responseChunks) fail('evaluation_provider_limit');
          if (!(value instanceof Uint8Array)) fail('evaluation_provider_response');
          if (value.byteLength === 0) fail('evaluation_provider_response');
          size += value.byteLength;
          if (size > EVALUATION_PROVIDER_LIMITS.responseBytes) fail('evaluation_provider_limit');
          chunks.push(value);
        }
        let raw, parsed;
        try { raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); parsed = JSON.parse(raw); }
        catch { fail('evaluation_provider_response'); }
        if (reflected(raw, input.key)) fail('evaluation_provider_response');
        assertNoReflection(parsed, input.key);
        if (operation === 'count') {
          if (!exact(parsed, ['object', 'input_tokens']) || parsed.object !== 'response.input_tokens' || !tokenLimit(parsed.input_tokens)) fail('evaluation_provider_response');
          return { schemaVersion: 1, kind: 'evaluation-provider-count', provider: 'openai', model,
            packetDigest, inputTokens: parsed.input_tokens, requestedServiceTier: 'default' };
        }
        const result = responseOf(parsed, model, expectedId, clock);
        // Retain observed usage even if it exceeds a requested cap; caller must
        // record the breach, never clamp charges or turn it into a refund.
        return operation === 'start' ? { ...result, packetDigest,
          outputLimitExceeded: result.usage === null ? null : result.usage.outputTokens > input.maxOutputTokens } : result;
      };
      return await Promise.race([work(), deadline]);
    } catch (error) {
      const code = abort.signal.aborted ? 'evaluation_provider_timeout'
        : codes.has(error?.message) ? error.message : 'evaluation_provider_unavailable';
      throw safeError(code, attempted ? 'uncertain' : 'not-dispatched');
    } finally { clearTimeout(timer); abort.abort(); discard(); }
  }
  return Object.freeze({
    count: input => perform(input, 'count'),
    start: input => perform(input, 'start'),
    inspect: input => perform(input, 'inspect'),
    requestCancel: () => ({ supported: false, reason: 'foreground-cancellation-unsupported', confirmation: 'unavailable' }),
  });
}
