import { admitRuntime, bindSession, outputOf, outputSchemaOf, promptOf, runtimeBinding, usageResult } from './runtime.mjs';
import { stageError, providerErrorEvent } from './diagnostics.mjs';

// Defence in depth; this config is NOT a proof that every runtime tool is unavailable.
export const codexConversationConfig = Object.freeze({
  'features.shell_tool': false, 'features.shell_snapshot': false, 'features.apps': false,
  'features.plugins': false, 'features.remote_plugin': false, 'features.hooks': false,
  'features.multi_agent': false, 'features.memories': false, 'features.goals': false,
  'features.request_permissions_tool': false, 'features.skill_mcp_dependency_install': false,
  'skills.bundled.enabled': false, 'skills.include_instructions': false, web_search: 'disabled', allow_login_shell: false,
  'permissions.discord-conversation.filesystem': { ':root': 'deny', ':minimal': 'read', ':workspace_roots': { '.': 'read' } },
  'permissions.discord-conversation.network.enabled': false,
});

export function createCodexAdapter({ enabled = false, rpc, policy, guard, cancellationMs = 5000 }) {
  const binding = runtimeBinding('codex', policy);
  let initialized, quarantined = false;
  const initialize = () => initialized ??= rpc.request('initialize', {
    clientInfo: { name: 'plates_discord_pilot', title: 'Plates Discord pilot', version: '0.1.0' },
    capabilities: { experimentalApi: true },
  }).then(() => rpc.notify('initialized'));
  return { mode: 'live', binding, async turn(request) {
    if (quarantined) throw new Error('codex_quarantined');
    await admitRuntime({ enabled, runtime: 'codex', policy, binding, guard }, request);
    request.recordRuntimeEvent?.({ event: 'initialize_started' });
    try { await initialize(); } catch (error) { throw stageError(error, 'initialize'); }
    request.recordRuntimeEvent?.({ event: 'initialize_completed' });
    const params = { model: policy.model, cwd: policy.cwd, approvalPolicy: 'never', permissions: 'discord-conversation',
      config: { ...codexConversationConfig }, environments: [], runtimeWorkspaceRoots: [],
      developerInstructions: request.system };
    const prior = request.providerSession;
    let thread;
    try { thread = await rpc.request(prior ? 'thread/resume' : 'thread/start', prior
      ? { model: params.model, cwd: params.cwd, approvalPolicy: params.approvalPolicy, permissions: params.permissions, config: params.config, developerInstructions: params.developerInstructions, runtimeWorkspaceRoots: [], threadId: prior.id, excludeTurns: true }
      : { ...params, ephemeral: false, dynamicTools: [], serviceName: 'plates-discord-pilot' });
    } catch (error) { throw stageError(error, prior ? 'session_resume' : 'session_start'); }
    const sources = thread?.instructionSources === undefined ? [] : thread.instructionSources;
    if (thread?.model !== policy.model || thread?.cwd !== policy.cwd || !Array.isArray(sources)
      || sources.length) throw stageError(new Error('codex_runtime_mismatch'), 'session_validate');
    const threadId = thread.thread?.id;
    try { bindSession(request, 'codex', binding, threadId); } // Durable mapping before turn/start, not after inference.
    catch (error) { throw stageError(error, 'session_validate'); }
    request.recordRuntimeEvent?.({ event: prior ? 'session_resumed' : 'session_started' });
    if (request.signal.aborted) throw new Error('runtime_interrupted');
    let turnId, cancelled = false, cancellationTimer, deadline, settled = false, usage, text = '', early = [], outputSeen = false;
    let finish, fail;
    const completed = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    void completed.catch(() => {});
    const stop = () => {
      cancelled = true;
      if (turnId) void rpc.request('turn/interrupt', { threadId, turnId }).catch(() => {});
      if (!cancellationTimer) cancellationTimer = setTimeout(() => { request.recordCancellation?.({ confirmed: false }); fail(new Error('codex_cancel_uncertain')); }, cancellationMs);
    };
    function receive(event) {
      if (settled) return;
      if (event.method === 'bridge/disconnected' || event.method === 'bridge/serverRequestDenied') { fail(new Error('codex_connection')); return; }
      const p = event.params;
      if (p?.threadId !== threadId) return;
      if (!turnId) { if (early.length >= 2000) fail(new Error('codex_event_capacity')); else early.push(event); return; }
      if ((p.turnId ?? p.turn?.id) !== turnId) return;
      if (event.method === 'error') {
        request.recordRuntimeEvent?.(providerErrorEvent(p.error, p.willRetry));
        if (p.willRetry === false) fail(new Error('codex_turn_failed'));
      }
      if (event.method === 'item/started' && !['userMessage', 'agentMessage', 'reasoning'].includes(p.item?.type)) {
        quarantined = true; stop(); fail(new Error('codex_tool_refused')); return;
      }
      if (event.method === 'item/agentMessage/delta') {
        if (!outputSeen) { outputSeen = true; request.recordRuntimeEvent?.({ event: 'first_output' }); }
        if (typeof p.delta !== 'string' || text.length + p.delta.length > 16_000) { stop(); fail(new Error('codex_output')); return; }
        text += p.delta;
      }
      if (event.method === 'item/completed' && p.item?.type === 'agentMessage') {
        if (typeof p.item.text !== 'string' || p.item.text.length > 16_000) { stop(); fail(new Error('codex_output')); return; }
        text = p.item.text;
      }
      if (event.method === 'model/rerouted') { quarantined = true; stop(); fail(new Error('codex_model_changed')); return; }
      if (event.method === 'thread/tokenUsage/updated') {
        usage = p.tokenUsage?.last?.totalTokens;
        try { usageResult(request, policy, usage); } catch (error) { stop(); fail(error); }
      }
      if (event.method === 'turn/completed') {
        request.recordRuntimeEvent?.({ event: 'generation_completed' });
        if (p.turn?.error) request.recordRuntimeEvent?.(providerErrorEvent(p.turn.error, false));
        if (cancelled || request.signal.aborted) {
          request.recordCancellation?.({ confirmed: ['completed', 'interrupted', 'failed'].includes(p.turn?.status) });
          fail(new Error('runtime_interrupted'));
        } else if (p.turn?.status === 'completed') finish(); else fail(new Error('codex_turn_failed'));
      }
    }
    const unsubscribe = rpc.subscribe(receive);
    request.signal.addEventListener('abort', stop, { once: true });
    deadline = setTimeout(() => { stop(); fail(new Error('codex_stream_timeout')); }, 65_000);
    try {
      const started = await rpc.request('turn/start', { threadId, model: policy.model, input: [{ type: 'text', text: promptOf(request) }],
        outputSchema: outputSchemaOf(request), permissions: 'discord-conversation', environments: [], runtimeWorkspaceRoots: [] });
      turnId = started.turn?.id;
      if (typeof turnId !== 'string' || !turnId) throw new Error('codex_turn_identity');
      request.recordRuntimeEvent?.({ event: 'generation_started' });
      if (cancelled || request.signal.aborted) stop();
      for (const event of early) receive(event); early = [];
      await completed;
      return { ...outputOf(text, request), ...usageResult(request, policy, usage) };
    } catch (error) { throw stageError(cancelled ? new Error('runtime_interrupted') : error, 'generation'); }
    finally { settled = true; clearTimeout(deadline); clearTimeout(cancellationTimer); unsubscribe(); request.signal.removeEventListener('abort', stop); }
  } };
}
