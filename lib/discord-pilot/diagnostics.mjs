// Never retain remote messages, stack traces, request parameters or SDK error bodies.
const codes = new Set(['rpc_closed', 'rpc_capacity', 'rpc_timeout', 'rpc_remote_error',
  'rpc_invalid_params', 'rpc_method_missing', 'rpc_invalid_request', 'rpc_internal_error',
  'codex_auth_failed', 'codex_quarantined', 'codex_runtime_mismatch', 'codex_turn_unavailable',
  'codex_connection', 'codex_output', 'codex_event_capacity', 'codex_tool_refused', 'codex_model_changed',
  'codex_turn_failed', 'codex_stream_timeout', 'codex_turn_identity', 'codex_cancel_uncertain',
  'claude_turn_unavailable', 'claude_environment', 'claude_runtime_mismatch', 'claude_tool_refused',
  'claude_result', 'claude_usage', 'claude_stream_timeout', 'claude_cancel_uncertain', 'claude_quarantined',
  'runtime_interrupted', 'runtime_guard_unavailable', 'runtime_admission_denied', 'runtime_session_binding',
  'runtime_session', 'runtime_session_changed', 'runtime_policy', 'runtime_usage', 'runtime_cost', 'runtime_output',
  'invalid_result', 'invalid_delivery', 'output_too_long', 'interrupted', 'turn_timeout', 'state_write_failed',
  'discord_send_uncertain', 'discord_interrupted', 'discord_channel_scope', 'discord_send_scope', 'discord_disabled']);
const phases = new Set(['admission', 'initialize', 'session_start', 'session_resume', 'session_validate', 'generation', 'delivery']);
const methods = new Set(['initialize', 'account/login/start', 'thread/start', 'thread/resume', 'turn/start', 'turn/interrupt']);
const metadata = new WeakMap();
const runtimeEvents = new Set(['initialize_started', 'initialize_completed', 'session_started', 'session_resumed',
  'generation_started', 'first_output', 'generation_completed', 'provider_error']);
const providerCodes = new Set(['contextWindowExceeded', 'sessionBudgetExceeded', 'usageLimitExceeded', 'rateLimitExceeded',
  'flexUnavailable', 'serverOverloaded', 'modelNotFound', 'policyCapacityUnavailable', 'cyberPolicy',
  'misalignmentPolicyViolation', 'tooManyDenials', 'internalServerError', 'unauthorized', 'badRequest',
  'threadRollbackFailed', 'sandboxError', 'other', 'httpConnectionFailed', 'responseStreamConnectionFailed',
  'responseStreamDisconnected', 'responseTooManyFailedAttempts', 'activeTurnNotSteerable']);
export function safeRuntimeEvent(value) {
  if (!runtimeEvents.has(value?.event)) return null;
  return { event: value.event, ...(providerCodes.has(value.providerCode) ? { providerCode: value.providerCode } : {}),
    ...(Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? { httpStatus: value.httpStatus } : {}),
    ...(typeof value.retrying === 'boolean' ? { retrying: value.retrying } : {}) };
}
export function providerErrorEvent(error, retrying) {
  const info = error?.codexErrorInfo;
  const code = typeof info === 'string' ? info : info && typeof info === 'object' && Object.keys(info).length === 1 ? Object.keys(info)[0] : 'other';
  return safeRuntimeEvent({ event: 'provider_error', providerCode: providerCodes.has(code) ? code : 'other',
    httpStatus: typeof info === 'object' ? info?.[code]?.httpStatusCode : null, retrying });
}
export function failureDetails(error, phase) {
  const prior = error && typeof error === 'object' ? metadata.get(error) : null;
  return { code: codes.has(error?.message) ? error.message : 'unclassified_failure',
    ...(prior ?? {}), ...(phases.has(phase) ? { phase } : {}) };
}
export function stageError(error, phase) {
  const details = failureDetails(error, phase), safe = new Error(details.code);
  metadata.set(safe, details); return safe;
}
export function rpcFailure(method, remoteCode) {
  const code = new Map([[-32602, 'rpc_invalid_params'], [-32601, 'rpc_method_missing'],
    [-32600, 'rpc_invalid_request'], [-32603, 'rpc_internal_error']]).get(remoteCode) ?? 'rpc_remote_error';
  const safe = new Error(code);
  metadata.set(safe, { ...(methods.has(method) ? { method } : {}),
    ...(Number.isSafeInteger(remoteCode) && Math.abs(remoteCode) <= 2_147_483_647 ? { rpcCode: remoteCode } : {}) });
  return safe;
}
