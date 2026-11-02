import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { mkdirSync, readdirSync, readFileSync, openSync, closeSync, writeFileSync, unlinkSync, fsyncSync, realpathSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectHostConfig, workerArgs, workerLabel } from './host-config.mjs';
import { createSecretResolver, privateDirectory } from './secrets.mjs';
import { createJsonRpc } from './rpc.mjs';
import { digest } from './runtime.mjs';

const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function collectDockerOutput(child) {
  return new Promise((resolve, reject) => {
    let bytes = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(new Error('docker_command_failed')) : resolve(value); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(true); }, 15000);
    child.stdout.on('data', chunk => { bytes += chunk; if (bytes.length > 256 * 1024) { child.kill('SIGKILL'); finish(true); } });
    child.stderr?.resume(); child.once('error', () => finish(true));
    child.once('close', code => finish(code !== 0, bytes.trim())); child.stdin.end();
  });
}

// Construction is inert. inspect() is called only after both configuration approvals.
// io is a test seam; production always invokes an explicit Docker binary/socket.
export function createDockerHost({ config, configDigest, io = {} }) {
  config = structuredClone(config);
  let manifest, report, home, lock, lockPath, admitted = false, probeOnly = false, closed = false, uncertain = false, sdk;
  const workers = new Map();
  const spawnProcess = io.spawnWorker ?? spawn;
  function docker(args) {
    return spawnProcess(config.dockerBinary, ['--host', `unix://${config.dockerSocket}`, ...args], {
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, DOCKER_CONFIG: join(home, 'docker-config') },
      stdio: ['pipe', 'pipe', 'pipe'], shell: false,
    });
  }
  const run = args => io.run ? io.run(args) : collectDockerOutput(docker(args));
  const json = async args => JSON.parse(await run(args));
  const inspectObject = (kind, target) => json([kind, 'inspect', '--format', '{{json .}}', target]);
  function releaseLock() { if (lock !== undefined) { closeSync(lock); lock = undefined; unlinkSync(lockPath); } }
  function checkImage(image, runtime) {
    if (image.Id !== config.workers[runtime].image || image.Architecture !== 'arm64' || image.Os !== 'linux'
      || image.Config?.User !== '1000:1000' || image.Config.Labels?.['plates.discord.worker'] !== '1'
      || image.Config.Labels?.['plates.discord.runtime'] !== runtime
      || image.Config.Labels?.['plates.discord.runtime.version'] !== manifest.runtimes[runtime].version
      || Object.keys(image.Config.Volumes ?? {}).length
      || image.Config.Env?.some(entry => !['PATH', 'NODE_VERSION', 'YARN_VERSION'].includes(entry.split('=')[0]))) throw new Error('worker_image_mismatch');
  }
  function checkContainer(container, lease) {
    const h = container.HostConfig, c = container.Config, p = config.resources;
    const mounts = container.Mounts ?? [];
    if (!container.Id || c?.Labels?.[workerLabel] !== report.deploymentDigest || c.Labels['plates.discord.lease'] !== lease.id
      || c.Labels['plates.discord.runtime'] !== lease.runtime || container.Image !== config.workers[lease.runtime].image
      || c.User !== '1000:1000' || c.WorkingDir !== manifest.runtimes[lease.runtime].cwd || c.Tty || !c.OpenStdin || !container.State?.Running
      || h?.Privileged || !h?.ReadonlyRootfs || h.NetworkMode !== config.network || h.PidMode || h.IpcMode !== 'private'
      || !h.CapDrop?.includes('ALL') || h.CapAdd?.length || !h.SecurityOpt?.includes('no-new-privileges')
      || h.Memory !== p.memoryMiB * 1024 * 1024 || h.MemorySwap !== h.Memory || h.PidsLimit !== p.pids
      || h.NanoCpus !== p.cpus * 1e9 || h.Binds?.length || Object.keys(h.PortBindings ?? {}).length
      || h.LogConfig?.Type !== 'none' || mounts.filter(m => m.Type === 'volume').length !== 1
      || mounts.some(m => m.Type === 'volume' ? m.Name !== config.workers[lease.runtime].volume || m.Destination !== '/home/agent' : m.Type !== 'tmpfs' || m.Destination !== '/tmp')) throw new Error('worker_container_mismatch');
    return container.Id;
  }
  async function findContainer(lease) {
    const list = async () => (await run(['container', 'ls', '--all', '--filter', `name=^/${lease.name}$`, '--format', '{{.ID}}'])).trim().split('\n').filter(Boolean);
    const ids = await list();
    if (!ids.length) return null;
    if (ids.length !== 1) throw new Error('worker_identity_uncertain');
    let found;
    try { found = await inspectObject('container', ids[0]); }
    catch {
      // --rm can remove the object between list and inspect. Confirm absence
      // with a successful fresh query; an inspect failure alone is never proof.
      if (!(await list()).length) return null;
      throw new Error('worker_inspection_uncertain');
    }
    // Never kill an object unless its exact deployment/lease labels match.
    if (found.Config?.Labels?.[workerLabel] !== report.deploymentDigest || found.Config.Labels['plates.discord.lease'] !== lease.id
      || found.Config.Labels['plates.discord.runtime'] !== lease.runtime) throw new Error('worker_identity_uncertain');
    return found;
  }
  function cleanup(worker) {
    return worker.cleanup ??= (async () => {
      let phase = 'setup';
      try {
        // Wait for Docker run to either create the container or report its failure.
        await worker.setup.catch(() => {});
        phase = 'find_before_kill'; let found = await findContainer(worker.lease);
        if (!found && !worker.created) throw new Error('worker_creation_uncertain');
        if (found?.State?.Running) {
          phase = 'remote_kill';
          try { await run(['container', 'kill', '--signal', 'KILL', found.Id]); } catch { /* inspect authoritative state below */ }
          phase = 'find_after_kill';
          found = await findContainer(worker.lease);
          if (found?.State?.Running) throw new Error('worker_still_running');
        }
        phase = 'local_attach_stop'; worker.killLocal('SIGKILL');
        phase = 'release_lease';
        unlinkSync(worker.leasePath); workers.delete(worker.lease.id);
      } catch (error) {
        uncertain = true;
        const codes = ['worker_creation_uncertain', 'worker_identity_uncertain', 'worker_still_running', 'worker_inspection_uncertain', 'docker_command_failed'];
        const cleanupFailure = { phase, code: codes.includes(error?.message) ? error.message : 'unclassified_cleanup_failure' };
        // Preserve only fixed diagnostic codes and existing non-secret identity.
        // If recording fails, the original durable lease is still retained.
        try {
          const tmp = `${worker.leasePath}.${randomUUID()}.tmp`, fd = openSync(tmp, 'wx', 0o600);
          try { writeFileSync(fd, JSON.stringify({ ...worker.lease, cleanupFailure })); fsyncSync(fd); } finally { closeSync(fd); }
          renameSync(tmp, worker.leasePath);
          const directory = openSync(home, 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
        } catch { /* lease/host lock remain fail-closed */ }
        throw new Error('worker_termination_uncertain');
      }
    })();
  }
  function launch(runtime, args, env, signal, probe = false) {
    if (!admitted || closed || uncertain || (probeOnly && !probe) || signal?.aborted || workers.size >= config.resources.maxWorkers) throw new Error('worker_admission_denied');
    const id = randomUUID(), lease = { id, name: `plates-discord-${id}`, runtime, deploymentDigest: report.deploymentDigest, configDigest };
    const leasePath = join(home, `${id}.json`), fd = openSync(leasePath, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify(lease)); fsyncSync(fd); } finally { closeSync(fd); }
    let child;
    try { child = docker(workerArgs(config, manifest, runtime, lease)); }
    catch { uncertain = true; throw new Error('worker_spawn_uncertain'); }
    const input = new PassThrough(), output = new PassThrough(), originalInput = child.stdin, originalOutput = child.stdout;
    const killLocal = child.kill.bind(child);
    child.stdin = input; child.stdout = output;
    let prelude = Buffer.alloc(0), resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; }); void ready.catch(() => {});
    const timer = setTimeout(() => rejectReady(new Error('worker_ready_timeout')), 15000);
    const worker = { lease, leasePath, child, ready, killLocal };
    workers.set(id, worker);
    function data(chunk) {
      prelude = Buffer.concat([prelude, chunk]);
      const newline = prelude.indexOf(10);
      if (prelude.length > 8192) { rejectReady(new Error('worker_prelude')); return; }
      if (newline < 0) return;
      try {
        const value = JSON.parse(prelude.subarray(0, newline).toString());
        if (value.pilotReady?.runtime !== runtime || value.pilotReady.version !== manifest.runtimes[runtime].version
          || value.pilotReady.readOnlyRoot !== true || value.pilotReady.emptyWorkspace !== true) throw new Error();
        originalOutput.off('data', data);
        output.write(prelude.subarray(newline + 1)); originalOutput.pipe(output); resolveReady();
      } catch { rejectReady(new Error('worker_prelude')); }
    }
    originalOutput.on('data', data); originalOutput.once('end', () => output.end()); child.stderr?.resume();
    originalInput.on('error', () => rejectReady(new Error('worker_stdin_failed')));
    originalOutput.on('error', () => rejectReady(new Error('worker_stdout_failed')));
    child.once('error', () => rejectReady(new Error('worker_process_failed')));
    child.once('exit', () => { signal?.removeEventListener('abort', abort); rejectReady(new Error('worker_exited')); void cleanup(worker).catch(() => {}); });
    child.kill = signalName => { killLocal(signalName); void cleanup(worker).catch(() => {}); return true; };
    const abort = () => child.kill('SIGTERM'); signal?.addEventListener('abort', abort, { once: true });
    worker.detachAbort = () => signal?.removeEventListener('abort', abort);
    worker.setup = (async () => {
      let container;
      for (let attempt = 0; attempt < 20; attempt++) {
        if (child.exitCode !== null) throw new Error('worker_exited');
        try { container = await inspectObject('container', lease.name); break; } catch { await delay(100); }
      }
      worker.created = !!container; // Unknown creation never releases the durable lease.
      checkContainer(container ?? {}, lease);
      if (closed || signal?.aborted) throw new Error('worker_cancelled');
      originalInput.write(JSON.stringify({ version: 1, runtime, runtimeVersion: manifest.runtimes[runtime].version,
        cwd: manifest.runtimes[runtime].cwd, args, env, probe }) + '\n');
      input.pipe(originalInput);
    })();
    void worker.setup.catch(error => { rejectReady(error); child.kill('SIGKILL'); });
    void ready.catch(() => child.kill('SIGKILL')).finally(() => { clearTimeout(timer); });
    return worker;
  }
  return {
    async inspect({ manifest: selected, probeOnly: selectedProbe = false }) {
      if (admitted || closed || configDigest !== digest(config)) throw new Error('host_configuration_unapproved');
      manifest = structuredClone(selected); probeOnly = selectedProbe === true; report = inspectHostConfig(config, manifest, { probeOnly });
      if (!report.ready) throw new Error('host_configuration_incomplete');
      privateDirectory(manifest.stateDirectory); privateDirectory(config.secretDirectory); // Metadata only.
      home = join(manifest.stateDirectory, 'host'); mkdirSync(home, { recursive: true, mode: 0o700 }); privateDirectory(home);
      if (readdirSync(home).some(name => name !== 'docker-config')) throw new Error('prior_host_lease_requires_inspection');
      const dockerConfig = join(home, 'docker-config'); mkdirSync(dockerConfig, { recursive: true, mode: 0o700 }); privateDirectory(dockerConfig);
      if (readdirSync(dockerConfig).length) throw new Error('empty_docker_config_required');
      const version = await run(['--version']);
      if (!version.startsWith(`Docker version ${config.dockerVersion},`)) throw new Error('docker_version_mismatch');
      const server = await json(['version', '--format', '{{json .Server}}']);
      if (server.Os !== 'linux' || server.Arch !== 'arm64') throw new Error('docker_platform_mismatch');
      for (const runtime of ['codex', 'claude']) {
        checkImage(await inspectObject('image', config.workers[runtime].image), runtime);
        const volume = await inspectObject('volume', config.workers[runtime].volume);
        if (volume.Driver !== 'local' || volume.Scope !== 'local' || Object.keys(volume.Options ?? {}).length
          || volume.Labels?.[workerLabel] !== report.deploymentDigest || volume.Labels['plates.discord.runtime'] !== runtime) throw new Error('worker_volume_mismatch');
        if ((await run(['container', 'ls', '--all', '--filter', `volume=${config.workers[runtime].volume}`, '--format', '{{.ID}}'])).trim()) throw new Error('worker_volume_in_use');
      }
      const network = await inspectObject('network', config.network);
      if (network.Driver !== 'bridge' || network.Scope !== 'local' || network.Internal || network.Labels?.[workerLabel] !== report.deploymentDigest
        || Object.keys(network.Containers ?? {}).length) throw new Error('worker_network_mismatch');
      if (realpathSync(config.sdk.modulePath) !== config.sdk.modulePath || dirname(config.sdk.packagePath) !== dirname(config.sdk.modulePath)
        || hashBytes(readFileSync(config.sdk.modulePath)) !== config.sdk.moduleSha256) throw new Error('sdk_module_mismatch');
      const pkg = JSON.parse(readFileSync(config.sdk.packagePath, 'utf8'));
      if (pkg.name !== '@anthropic-ai/claude-agent-sdk' || pkg.version !== config.sdk.version) throw new Error('sdk_version_mismatch');
      lockPath = join(home, 'writer.lock'); lock = openSync(lockPath, 'wx', 0o600);
      writeFileSync(lock, JSON.stringify({ deploymentDigest: report.deploymentDigest, configDigest, pid: process.pid })); fsyncSync(lock);
      admitted = true;
      return { deploymentDigest: report.deploymentDigest, toolPolicy: 'conversation', isolation: 'separate-containers', hostAccess: 'none', sharedCredentials: false, auth: probeOnly ? 'not-requested' : 'approved' };
    },
    async loadSecret(reference) {
      if (!admitted || closed || uncertain || probeOnly) throw new Error('host_not_admitted');
      return createSecretResolver({ directory: config.secretDirectory, handles: config.secrets, enabled: true })(reference);
    },
    async probe() {
      const checks = [];
      for (const runtime of ['codex', 'claude']) {
        const worker = launch(runtime, runtime === 'codex' ? ['app-server'] : [], {}, undefined, true);
        await worker.ready; await cleanup(worker);
        checks.push({ runtime, version: manifest.runtimes[runtime].version, readOnlyRoot: true, emptyWorkspace: true });
      }
      return { checks, credentialReads: 0, providerInferenceRequested: false, providerSessionsCreated: false };
    },
    async codex({ policy, auth, signal }) {
      if (digest(policy) !== digest(manifest?.runtimes.codex) || auth.mode !== 'api-key') throw new Error('runtime_policy_mismatch');
      const worker = launch('codex', ['app-server'], {}, signal); await worker.ready; worker.detachAbort();
      const rpc = createJsonRpc({ input: worker.child.stdout, output: worker.child.stdin });
      return { ...rpc, async notify(method, params) {
        rpc.notify(method, params);
        if (method === 'initialized') {
          const login = await rpc.request('account/login/start', { type: 'apiKey', apiKey: auth.key });
          if (login.type !== 'apiKey') throw new Error('codex_auth_failed');
        }
      } };
    },
    async claude({ policy, auth }) {
      if (!admitted || closed || probeOnly || digest(policy) !== digest(manifest?.runtimes.claude) || auth.mode !== 'api-key') throw new Error('runtime_policy_mismatch');
      sdk ??= await (io.loadSdk ?? (path => import(pathToFileURL(path).href)))(config.sdk.modulePath);
      if (typeof sdk.query !== 'function') throw new Error('sdk_query_missing');
      return { query: args => sdk.query({ ...args, options: { ...args.options, pathToClaudeCodeExecutable: '/usr/local/bin/claude' } }),
        environment: { HOME: '/home/agent', PATH: '/usr/local/bin:/usr/bin:/bin', CLAUDE_CONFIG_DIR: '/home/agent/.claude', ANTHROPIC_API_KEY: auth.key },
        spawnClaudeCodeProcess(options) {
          if (options.cwd !== policy.cwd || options.env.ANTHROPIC_API_KEY !== auth.key) throw new Error('claude_spawn_policy');
          const env = Object.fromEntries(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_MAX_RETRIES', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'MAX_STRUCTURED_OUTPUT_RETRIES'].map(key => [key, options.env[key]]));
          return launch('claude', options.args, env, options.signal).child;
        } };
    },
    async close() {
      closed = true;
      const results = await Promise.allSettled([...workers.values()].map(cleanup));
      if (uncertain || results.some(r => r.status === 'rejected')) throw new Error('host_shutdown_uncertain');
      releaseLock();
    },
  };
}
