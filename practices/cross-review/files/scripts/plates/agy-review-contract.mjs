// Phase 197: pure AGY review evidence contract. No dispatch, credentials or retry.
// These shared functions are called only after module initialization, avoiding
// initialization-order dependencies if the publisher imports this contract.
import { diffRanges, checkFindings } from './cross-review.mjs';

export const AGY_REVIEW_MODELS = Object.freeze(['gemini-4-neon-high', 'gemini-4-carbon-high', 'gemini-4-hydrogen-high']);
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
// Matches cross-review's 30 findings, P1–P3, 4000-character body and 6000 summary.
export const AGY_REVIEW_SCHEMA = freeze({
  type: 'object', additionalProperties: false, required: ['findings'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 6000 },
    findings: { type: 'array', maxItems: 30, items: {
      type: 'object', additionalProperties: false, required: ['path', 'line', 'severity', 'body'],
      properties: { path: { type: 'string', minLength: 1, maxLength: 4096 }, line: { type: 'integer', minimum: 1 },
        severity: { type: 'string', enum: ['P1', 'P2', 'P3'] }, body: { type: 'string', minLength: 1, maxLength: 4000 } },
    } },
  },
});
const MAX_BYTES = 8 * 1024 * 1024;
const own = (v, k) => Object.hasOwn(v, k);
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const text = (v, max = 4096) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const integer = v => Number.isSafeInteger(v) && v >= 0;
const shape = (v, required, optional = []) => obj(v) && required.every(k => own(v, k)) && Reflect.ownKeys(v).every(k => [...required, ...optional].includes(k) && own(Object.getOwnPropertyDescriptor(v, k), 'value'));
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : obj(v) ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const usageKeys = ['input_tokens', 'output_tokens', 'thinking_tokens', 'cache_read_tokens', 'total_tokens'];
function usageOf(v) {
  if (v === undefined) return null;
  if (!shape(v, [], usageKeys) || !Object.values(v).every(integer)) throw new Error();
  return Object.fromEntries(usageKeys.map(k => [k, own(v, k) ? v[k] : null]));
}
const refuse = reason => ({ ok: false, state: 'blocked', reason, message: null, model: null, usage: null, cost: null });

/**
 * Complete single-turn stream-json only. denials must be explicit [] from the
 * runner's complete diagnostics coverage, never inferred here from missing data.
 * All failure reasons are fixed strings: no provider output leaks into logs.
 * cost:null means unknown, including when tokens are reported. No retry verdict.
 */
export function agyReviewVerdict({ stdout, expectedModel, outcome, diff, denials } = {}) {
  if (!AGY_REVIEW_MODELS.includes(expectedModel)) return refuse('unsupported-model');
  if (outcome !== 'success') return refuse('process-not-successful');
  if (!Array.isArray(denials) || denials.length !== 0) return refuse('denial-or-missing-coverage');
  if (typeof diff !== 'string' || Buffer.byteLength(diff) > MAX_BYTES) return refuse('invalid-diff');
  if (typeof stdout !== 'string' || !stdout.trim() || Buffer.byteLength(stdout) > MAX_BYTES) return refuse('missing-or-oversized-stream');
  try {
    const lines = stdout.trim().split('\n');
    if (lines.length < 2 || lines.length > 4096 || lines.some(l => !l.trim() || Buffer.byteLength(l) > 1024 * 1024)) return refuse('invalid-stream-framing');
    const events = lines.map(l => JSON.parse(l));
    const first = events[0], last = events.at(-1);
    if (!shape(first, ['event', 'conversation_id', 'init']) || first.event !== 'init' || !text(first.conversation_id)) return refuse('missing-init');
    const id = first.conversation_id, init = first.init;
    if (!shape(init, ['model', 'tools', 'agent', 'permission_mode'], ['cwd', 'json_schema'])
      || init.model !== expectedModel || init.agent !== 'plates-review' || init.permission_mode !== 'request-review'
      || !Array.isArray(init.tools) || init.tools.length !== 0) return refuse('unsafe-or-mismatched-init');
    if (own(init, 'cwd') && typeof init.cwd !== 'string') return refuse('invalid-init');
    if (own(init, 'json_schema') && canonical(init.json_schema) !== canonical(AGY_REVIEW_SCHEMA)) return refuse('schema-mismatch');
    if (!shape(last, ['event', 'result'], ['conversation_id']) || last.event !== 'result') return refuse('missing-terminal-result');
    if (own(last, 'conversation_id') && last.conversation_id !== id) return refuse('conversation-mismatch');
    const steps = new Map(); let responseText = '', previousIndex = -1;
    for (const e of events.slice(1, -1)) {
      if (!shape(e, ['event', 'step_update'], ['conversation_id']) || e.event !== 'step_update') return refuse('unexpected-or-duplicate-event');
      if (own(e, 'conversation_id') && e.conversation_id !== id) return refuse('conversation-mismatch');
      const s = e.step_update;
      if (!shape(s, ['conversation_id', 'step_index', 'state', 'step_type'], ['text_delta', 'duration_seconds', 'usage'])
        || s.conversation_id !== id || !integer(s.step_index) || !['ACTIVE', 'DONE'].includes(s.state)
        || !['user_input', 'agent_response', 'checkpoint'].includes(s.step_type)) return refuse('tool-subagent-or-invalid-step');
      const prior = steps.get(s.step_index);
      if (s.step_index < previousIndex || prior?.state === 'DONE' || (prior && prior.type !== s.step_type)) return refuse('invalid-step-order');
      previousIndex = s.step_index;
      if (own(s, 'duration_seconds') && (!Number.isFinite(s.duration_seconds) || s.duration_seconds < 0)) return refuse('invalid-duration');
      usageOf(s.usage);
      if (own(s, 'text_delta')) {
        if (typeof s.text_delta !== 'string' || s.step_type !== 'agent_response') return refuse('invalid-response-step');
        responseText += s.text_delta;
      }
      steps.set(s.step_index, { state: s.state, type: s.step_type });
    }
    if ([...steps.values()].some(s => s.state !== 'DONE')) return refuse('unfinished-step');
    const r = last.result;
    if (!shape(r, ['conversation_id', 'status', 'response', 'num_turns', 'duration_seconds', 'structured_output'], ['usage', 'json_schema', 'model', 'error'])
      || r.conversation_id !== id || r.status !== 'SUCCESS' || r.num_turns !== 1
      || !text(r.response, MAX_BYTES) || !Number.isFinite(r.duration_seconds) || r.duration_seconds < 0
      || (own(r, 'error') && r.error !== '') || (own(r, 'model') && r.model !== expectedModel)) return refuse('invalid-success-envelope');
    if (own(r, 'json_schema') && canonical(r.json_schema) !== canonical(AGY_REVIEW_SCHEMA)) return refuse('schema-mismatch');
    const review = r.structured_output;
    if (!shape(review, ['findings'], ['summary']) || !Array.isArray(review.findings) || review.findings.length > 30
      || (own(review, 'summary') && (!text(review.summary, 6000) || review.summary.includes('```')))) return refuse('invalid-review');
    for (const f of review.findings) {
      if (!shape(f, ['path', 'line', 'severity', 'body']) || !text(f.path) || f.path.startsWith('/') || f.path.includes('\\') || /[\x00-\x1f]/.test(f.path)
        || f.path.split('/').some(p => !p || p === '.' || p === '..') || !integer(f.line) || f.line < 1
        || !['P1', 'P2', 'P3'].includes(f.severity) || !text(f.body, 4000)) return refuse('invalid-finding');
    }
    if (canonical(JSON.parse(r.response)) !== canonical(review)
      || (responseText.trim() && canonical(JSON.parse(responseText)) !== canonical(review))) return refuse('response-mismatch');
    const checked = checkFindings(review.findings, diffRanges(diff));
    if (checked.dropped.length) return refuse('finding-outside-diff');
    const usage = usageOf(r.usage);
    const summary = review.summary?.trim() || 'AGY completed the supplied-diff review.';
    const message = `${summary}\n\n\`\`\`json\n${JSON.stringify(checked.kept)}\n\`\`\`\n`;
    return { ok: true, state: 'completed', reason: 'validated-review', message, model: expectedModel, usage, cost: null };
  } catch { return refuse('malformed-evidence'); }
}

/**
 * Preflight only. Any dispatched model ends this MVP's selection sequence;
 * even an apparent pre-execution refusal does not authorize a second dispatch.
 * Availability lists only the configured subset, with explicit catalog evidence
 * for each entry. Omitted models are unconfigured, never fallback candidates.
 * Epoch milliseconds and the original deadline are supplied by the runner.
 */
export function selectAgyReviewModel({ availability, attemptedModels, deadlineMs, nowMs } = {}) {
  const no = reason => ({ model: null, remainingMs: 0, reason });
  if (!integer(deadlineMs) || !integer(nowMs) || nowMs >= deadlineMs) return no('deadline-unavailable-or-exhausted');
  if (!Array.isArray(attemptedModels) || attemptedModels.some(m => !AGY_REVIEW_MODELS.includes(m))) return no('invalid-attempt-history');
  if (attemptedModels.length) return no('post-dispatch-retry-unavailable');
  if (!Array.isArray(availability) || (availability.length < 1 || availability.length > AGY_REVIEW_MODELS.length)
    || !Array.from({ length: availability.length }, (_, i) => own(availability, i)).every(Boolean)
    || availability.some(v => !shape(v, ['model', 'state']) || !AGY_REVIEW_MODELS.includes(v.model) || !['available', 'unavailable', 'unknown'].includes(v.state))
    || new Set(availability.map(v => v.model)).size !== availability.length) return no('invalid-availability-catalog');
  const model = AGY_REVIEW_MODELS.find(m => availability.some(v => v.model === m && v.state === 'available'));
  return model ? { model, remainingMs: deadlineMs - nowMs, reason: 'available-before-dispatch' } : no('no-known-available-model');
}
