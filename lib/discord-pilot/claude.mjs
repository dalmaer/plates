import { randomUUID } from 'node:crypto';
import { admitRuntime, bindSession, outputOf, outputSchemaOf, promptOf, runtimeBinding, usageResult } from './runtime.mjs';
import { stageError } from './diagnostics.mjs';

// query is the official Agent SDK's query function, loaded by an approved isolated host.
export function createClaudeAdapter({ enabled = false, query, policy, guard, environment, spawnClaudeCodeProcess, cancellationMs = 5000 }) {
  const binding = runtimeBinding('claude', policy);
  let quarantined = false;
  return { mode: 'live', binding, async turn(request) {
    if (quarantined) throw new Error('claude_quarantined');
    await admitRuntime({ enabled, runtime: 'claude', policy, binding, guard }, request);
    if (!environment || typeof environment !== 'object' || Object.keys(environment).some(k => !['HOME', 'PATH', 'ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_MAX_RETRIES'].includes(k))) throw new Error('claude_environment');
    const controller = new AbortController();
    const userMessageId = randomUUID();
    const prompt = (async function* () { yield { type: 'user', uuid: userMessageId, session_id: request.providerSession?.id ?? '', parent_tool_use_id: null,
      message: { role: 'user', content: promptOf(request) } }; })();
    const options = { model: policy.model, cwd: policy.cwd, env: { ...environment, CLAUDE_CODE_MAX_RETRIES: '0', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(request.maxOutputTokens ?? request.maxTokens), MAX_STRUCTURED_OUTPUT_RETRIES: '1' },
      tools: [], allowedTools: [], disallowedTools: ['*'], mcpServers: {}, strictMcpConfig: true, plugins: [], settingSources: [],
      ...(spawnClaudeCodeProcess ? { spawnClaudeCodeProcess } : {}),
      permissionMode: 'dontAsk', canUseTool: async () => ({ behavior: 'deny', message: 'Conversation only' }),
      systemPrompt: request.system, maxTurns: 1, maxBudgetUsd: request.maxCostMicros / 1_000_000,
      persistSession: true, includePartialMessages: true, abortController: controller,
      outputFormat: { type: 'json_schema', schema: outputSchemaOf(request) }, ...(request.providerSession ? { resume: request.providerSession.id } : {}) };
    let stream, cancelled = false, timer, deadline, sessionId, result, init = false, interruptAttempt;
    let rejectStopped;
    const stopped = new Promise((_, reject) => { rejectStopped = reject; }); void stopped.catch(() => {});
    function stop() {
      cancelled = true;
      interruptAttempt ??= Promise.resolve().then(() => stream?.interrupt()).catch(() => undefined);
      if (!timer) timer = setTimeout(() => { controller.abort(); request.recordCancellation?.({ confirmed: false }); rejectStopped(new Error('claude_cancel_uncertain')); }, cancellationMs);
    }
    request.signal.addEventListener('abort', stop, { once: true });
    deadline = setTimeout(() => { controller.abort(); rejectStopped(new Error('claude_stream_timeout')); }, 65_000);
    try {
      if (request.signal.aborted) throw new Error('runtime_interrupted');
      stream = query({ prompt, options });
      const iterator = stream[Symbol.asyncIterator]();
      for (let count = 0; ; count++) {
        if (count > 2000) throw new Error('claude_event_capacity');
        const next = await Promise.race([iterator.next(), stopped]);
        if (next.done) break;
        const event = next.value;
        if (event.type === 'system' && event.subtype === 'init') {
          if (init || event.model !== policy.model || !Array.isArray(event.tools) || event.tools.length) { quarantined = true; throw new Error('claude_runtime_mismatch'); }
          sessionId = event.session_id; bindSession(request, 'claude', binding, sessionId); init = true;
        }
        if (event.session_id && init && event.session_id !== sessionId) throw new Error('claude_session_changed');
        if (event.type === 'assistant' && event.message?.content?.some(part => part.type === 'tool_use')
          || event.type === 'stream_event' && event.event?.content_block?.type === 'tool_use') { quarantined = true; throw new Error('claude_tool_refused'); }
        if (event.type === 'result') {
          if (cancelled || request.signal.aborted) {
            const receipt = await Promise.race([interruptAttempt, stopped]);
            request.recordCancellation?.({ confirmed: Array.isArray(receipt?.still_queued) && receipt.still_queued.length === 0 && !(event.queued_turn_count > 0) });
            throw new Error('runtime_interrupted');
          }
          result = event; break;
        }
      }
      if (!init || !result || result.subtype !== 'success' || result.is_error || result.session_id !== sessionId
        || result.permission_denials?.length || result.queued_turn_count > 0
        || !result.modelUsage || Object.keys(result.modelUsage).some(model => model !== policy.model)) throw new Error('claude_result');
      const u = result.usage;
      const numbers = [u?.input_tokens, u?.output_tokens, u?.cache_read_input_tokens ?? 0, u?.cache_creation_input_tokens ?? 0];
      if (!numbers.every(n => Number.isSafeInteger(n) && n >= 0) || typeof result.total_cost_usd !== 'number'
        || !Number.isFinite(result.total_cost_usd) || result.total_cost_usd < 0) throw new Error('claude_usage');
      const cost = Math.ceil(result.total_cost_usd * 1_000_000);
      return { ...outputOf(result.structured_output ?? result.result, request),
        ...usageResult(request, policy, numbers.reduce((a, b) => a + b, 0), cost) };
    } catch (error) { throw stageError(cancelled ? new Error('runtime_interrupted') : error, init ? 'generation' : 'initialize'); }
    finally { clearTimeout(timer); clearTimeout(deadline); request.signal.removeEventListener('abort', stop); controller.abort(); }
  } };
}
