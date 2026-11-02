import { createAdmissionGuard } from './runtime.mjs';
import { openBridge, validateConfig } from './bridge.mjs';
import { inspectDeployment, issueLivePermit } from './activation.mjs';
import { createCodexAdapter } from './codex.mjs';
import { createClaudeAdapter } from './claude.mjs';
import { createDiscordAdapter } from './discord.mjs';
import { superviseTrial } from './trial.mjs';

/** Explicit host API. Factories are trusted deployment code, never loaded from Discord or JSON.
 * Host inspection and approval both precede every secret read or connection. */
export async function startPilot({ manifest, approvalDigest, host }) {
  const report = inspectDeployment(manifest);
  const policy = validateConfig({ ...manifest.policy, mode: 'live', liveEnabled: true });
  if (!report.readyForHostValidation || approvalDigest !== report.digest) throw new Error('live_start_not_approved');
  if (typeof host?.inspect !== 'function'
    || typeof host?.loadSecret !== 'function' || typeof host?.codex !== 'function' || typeof host?.claude !== 'function'
    || typeof host?.close !== 'function') throw new Error('isolated_host_required');
  let inspection;
  try { inspection = await host.inspect({ manifest, bindings: report.bindings }); }
  catch { throw new Error('host_inspection_failed'); }
  if (inspection?.deploymentDigest !== report.digest || inspection.toolPolicy !== 'conversation' || inspection.isolation !== 'separate-containers'
    || inspection.hostAccess !== 'none' || inspection.sharedCredentials !== false || inspection.auth !== 'approved') throw new Error('host_capabilities_unverified');
  const guard = createAdmissionGuard(report.bindings, policy.limits);
  let bridge, discord, supervisor, startupFault, shutdownPromise, initializing, shuttingDown = false;
  async function shutdown(status) {
    shuttingDown = true;
    return shutdownPromise ??= (async () => {
      let failure = false;
      for (const action of [() => bridge?.haltAll(status), () => discord?.stop(), () => bridge?.settle(), () => host.close(), () => bridge?.close()]) {
        try { await action(); } catch { failure = true; }
      }
      if (failure) throw new Error('shutdown_uncertain');
    })();
  }
  function fault(reason) {
    startupFault ??= reason;
    try { bridge?.haltAll(reason); } catch { /* shutdown retains uncertain cleanup */ }
    discord?.stop();
    if (supervisor) void supervisor.stop(reason);
  }
  try {
    // Claim the one-run marker before loading credentials or authenticating either runtime.
    let providers;
    bridge = openBridge({ config: policy, directory: manifest.stateDirectory,
      providers: Object.fromEntries(['codex', 'claude'].map(runtime => [runtime, { mode: 'live', turn: async request => {
        await initialize(request.signal);
        if (shuttingDown || request.signal.aborted) throw new Error('runtime_interrupted');
        return providers[runtime].turn(request);
      } }])),
      transport: { mode: 'live', send: message => discord.send(message), committed: id => discord.committed(id) },
      livePermit: issueLivePermit(policy, report.digest) });
    const credentials = {};
    for (const identity of policy.bots) credentials[identity.id] = await host.loadSecret(manifest.discordSecrets[identity.runtime]);
    function initialize(signal) {
      return initializing ??= (async () => {
        const check = () => { if (shuttingDown || signal?.aborted) throw new Error('runtime_interrupted'); };
        check();
        const auth = {};
        for (const runtime of ['codex', 'claude']) auth[runtime] = manifest.runtimes[runtime].authMode === 'api-key'
          ? { mode: 'api-key', key: await host.loadSecret(manifest.authSecrets[runtime]) } : { mode: 'isolated-login' };
        // Each host receives only its own credential. Discord keys never enter runtime constructors.
        check();
        const rpc = await host.codex({ policy: manifest.runtimes.codex, auth: auth.codex, signal });
        check();
        const claude = await host.claude({ policy: manifest.runtimes.claude, auth: auth.claude });
        check();
        if (typeof claude?.spawnClaudeCodeProcess !== 'function') throw new Error('isolated_claude_spawn_required');
        providers = {
          codex: createCodexAdapter({ enabled: true, rpc, policy: manifest.runtimes.codex, guard }),
          claude: createClaudeAdapter({ enabled: true, ...claude, policy: manifest.runtimes.claude, guard }),
        };
      })();
    }
    if (!policy.trial.waitMs) await initialize();
    discord = createDiscordAdapter({ enabled: true, config: policy, credentials,
      ...(host.discordIO ?? {}), onMessage(message) {
        try {
          if (policy.trial.waitMs && (!supervisor || !supervisor.accepting())) return;
          const outcome = bridge.admit(message);
          if (outcome === 'stopped') fault('stopped');
          else if (outcome === 'queued' && (!supervisor || supervisor.begin())) void bridge.drain(message.threadId).catch(() => fault('runtime_fault'));
        } catch { fault('runtime_fault'); }
      }, onFault() { fault('transport_fault'); },
    });
    await discord.start();
    supervisor = superviseTrial({ policy: policy.trial, snapshot: bridge.snapshot, stop: shutdown });
    if (startupFault) void supervisor.stop(startupFault);
    return { status: policy.trial.waitMs ? 'waiting_for_owner' : 'running', readiness: supervisor.readiness, snapshot: bridge.snapshot, done: supervisor.done, async stop() {
      const result = await supervisor.stop('operator');
      if (result.cleanup !== 'confirmed') throw new Error('shutdown_uncertain');
    } };
  } catch {
    try { await shutdown('startup_failed'); } catch { throw new Error('live_start_cleanup_uncertain'); }
    throw new Error('live_start_failed');
  }
}
