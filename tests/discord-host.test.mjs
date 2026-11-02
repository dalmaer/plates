import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, writeFileSync, rmSync, chmodSync, symlinkSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { digest } from '../lib/discord-pilot/runtime.mjs';
import { inspectDeployment } from '../lib/discord-pilot/activation.mjs';
import { inspectHostConfig, workerLabel } from '../lib/discord-pilot/host-config.mjs';
import { createDockerHost, collectDockerOutput } from '../lib/discord-pilot/docker-host.mjs';
import { createSecretResolver } from '../lib/discord-pilot/secrets.mjs';
import { runEntrypoint, reviewHost } from '../lib/discord-pilot/entrypoint.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const example = name => JSON.parse(readFileSync(new URL(`../scripts/discord-pilot/${name}.example.json`, import.meta.url)));
function fixture(t, changes = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'acme-discord-host-')));
  t.after(() => rmSync(root, { recursive: true }));
  const state = join(root, 'state'), secrets = join(root, 'secrets'), sdk = join(root, 'sdk');
  for (const path of [state, secrets, sdk]) mkdirSync(path, { mode: 0o700 });
  const manifest = example('deployment'); manifest.enabled = true; manifest.stateDirectory = state;
  manifest.discordSecrets = { codex: 'secret:acme.discord.codex', claude: 'secret:acme.discord.claude' };
  manifest.authSecrets = { codex: 'secret:acme.openai', claude: 'secret:acme.anthropic' };
  manifest.runtimes = Object.fromEntries(['codex', 'claude'].map(runtime => [runtime, { model: `acme-${runtime}`, authMode: 'api-key', accountScope: 'acme-project',
    version: '1.2.3', cwd: `${state}/runtimes/${runtime}/workspace`, microUsdPerToken: 2 }]));
  const config = example('host'); config.enabled = true; config.dockerSocket = `${root}/docker.sock`; config.dockerVersion = '28.1.1';
  config.secretDirectory = secrets; config.network = 'acme-pilot-network';
  config.secrets = Object.fromEntries([...Object.values(manifest.discordSecrets), ...Object.values(manifest.authSecrets)].map((ref, i) => [ref, `acme-key-${i}`]));
  for (const file of Object.values(config.secrets)) writeFileSync(join(secrets, file), 'Acme-synthetic-key', { mode: 0o600 });
  config.workers = { codex: { image: `sha256:${'a'.repeat(64)}`, volume: 'acme-codex-state' }, claude: { image: `sha256:${'b'.repeat(64)}`, volume: 'acme-claude-state' } };
  const modulePath = join(sdk, 'sdk.mjs'), packagePath = join(sdk, 'package.json');
  writeFileSync(modulePath, '// Acme mocked SDK\n'); writeFileSync(packagePath, JSON.stringify({ name: '@anthropic-ai/claude-agent-sdk', version: '1.2.3' }));
  config.sdk = { modulePath, packagePath, version: '1.2.3', moduleSha256: createHash('sha256').update(readFileSync(modulePath)).digest('hex') };
  config.approval = { deploymentDigest: inspectDeployment(manifest).digest, apiFundingApproved: true, maxAdmissionMicros: 5_000_000, egress: 'runtime-internet' };
  const calls = [], spawns = [], frames = [], containers = new Map();
  const io = {
    async loadSdk() { return { query: args => args }; },
    async run(args) {
      calls.push(args);
      if (args[0] === '--version') return 'Docker version 28.1.1, build Acme';
      if (args[0] === 'version') return JSON.stringify({ Os: 'linux', Arch: 'arm64' });
      if (args[0] === 'image') {
        const runtime = args.at(-1) === config.workers.codex.image ? 'codex' : 'claude';
        return JSON.stringify({ Id: config.workers[runtime].image, Architecture: 'arm64', Os: 'linux', Config: { User: '1000:1000', Env: ['PATH=/usr/bin'],
          Labels: { 'plates.discord.worker': '1', 'plates.discord.runtime': runtime, 'plates.discord.runtime.version': '1.2.3' }, ...changes.image } });
      }
      if (args[0] === 'volume') {
        const runtime = args.at(-1) === config.workers.codex.volume ? 'codex' : 'claude';
        return JSON.stringify({ Driver: 'local', Scope: 'local', Labels: { [workerLabel]: config.approval.deploymentDigest, 'plates.discord.runtime': runtime }, ...changes.volume });
      }
      if (args[0] === 'network') return JSON.stringify({ Driver: 'bridge', Scope: 'local', Internal: false, Labels: { [workerLabel]: config.approval.deploymentDigest }, Containers: {}, ...changes.network });
      if (args[1] === 'ls') {
        const filter = args[args.indexOf('--filter') + 1];
        if (filter.startsWith('volume=')) return '';
        const name = filter.slice('name=^/'.length, -1), found = containers.get(name);
        if (found && !found.State.Running && changes.autoRemoveRace) containers.delete(name);
        return found?.Id ?? '';
      }
      if (args[1] === 'inspect') {
        const c = [...containers.values()].find(c => c.Id === args.at(-1) || c.Name === args.at(-1));
        if (!c) throw new Error('Acme missing container');
        return JSON.stringify(c);
      }
      if (args[1] === 'kill') {
        const c = [...containers.values()].find(c => c.Id === args.at(-1));
        if (c && !changes.ignoreKill) c.State.Running = false;
        return c?.Id ?? '';
      }
      throw new Error('Acme unexpected Docker command');
    },
    spawnWorker(command, args, options) {
      spawns.push({ command, args, options });
      const runtime = args.at(-1), name = args[args.indexOf('--name') + 1], labels = {};
      args.forEach((arg, i) => { if (arg === '--label') { const [key, value] = args[i + 1].split('='); labels[key] = value; } });
      const container = { Id: `acme-${spawns.length}`, Name: name, Image: config.workers[runtime].image, State: { Running: true },
        Config: { User: '1000:1000', WorkingDir: manifest.runtimes[runtime].cwd, OpenStdin: true, Tty: false, Labels: labels },
        Mounts: [{ Type: 'volume', Name: config.workers[runtime].volume, Destination: '/home/agent' }],
        HostConfig: { ReadonlyRootfs: true, NetworkMode: config.network, IpcMode: 'private', CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'],
          Memory: 1024 ** 3, MemorySwap: 1024 ** 3, PidsLimit: 128, NanoCpus: 1e9, LogConfig: { Type: 'none' }, ...changes.container } };
      containers.set(name, container);
      const child = new EventEmitter(), stdout = new PassThrough(); let first = true, buffer = '';
      Object.assign(child, { stdout, stderr: new PassThrough(), exitCode: null, killed: false,
        stdin: new Writable({ write(chunk, _, done) {
          buffer += chunk;
          while (buffer.includes('\n')) {
            const end = buffer.indexOf('\n'), message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
            if (first) { first = false; frames.push(message); stdout.write(JSON.stringify({ pilotReady: { runtime, version: '1.2.3', readOnlyRoot: true, emptyWorkspace: true } }) + '\n'); }
            else if (message.id) stdout.write(JSON.stringify({ id: message.id, result: message.method === 'account/login/start' ? { type: 'apiKey' } : {} }) + '\n');
          }
          done();
        } }),
        kill() { if (child.killed) return false; child.killed = true; child.exitCode = 137; queueMicrotask(() => { stdout.end(); child.emit('exit', 137); }); return true; },
      });
      return child;
    },
  };
  const host = createDockerHost({ config, configDigest: digest(config), io });
  return { root, state, config, manifest, io, host, calls, spawns, frames, containers };
}

test('host plans remain disabled and proposed five-dollar admission allowance is not spending approval', () => {
  const config = example('host'), manifest = example('deployment'), report = inspectHostConfig(config, manifest);
  assert.equal(report.ready, false); assert.equal(report.credentialReads, 0); assert.equal(report.processesStarted, 0);
  assert.equal(report.providerBillHardCap, false); assert.ok(report.blockers.includes('host_authorization_required'));
  assert.equal(config.approval.apiFundingApproved, false); assert.equal(config.approval.maxAdmissionMicros, 5_000_000);
});

test('host refuses unapproved configuration before any Docker command, SDK import or secret resolution', async t => {
  const f = fixture(t); f.config.approval.apiFundingApproved = false;
  const host = createDockerHost({ config: f.config, configDigest: digest(f.config), io: f.io });
  await assert.rejects(host.inspect({ manifest: f.manifest }), /incomplete/);
  await assert.rejects(host.loadSecret('secret:acme.openai'), /not_admitted/);
  assert.equal(f.calls.length, 0); assert.equal(f.spawns.length, 0);
});

test('explicit secret resolver rejects unknown handles, broad modes and symlinks without disclosure', async t => {
  const f = fixture(t), resolver = createSecretResolver({ directory: f.config.secretDirectory, handles: f.config.secrets, enabled: true });
  assert.equal(await resolver('secret:acme.openai'), 'Acme-synthetic-key');
  await assert.rejects(resolver('secret:personal-login'), /handle_denied/);
  const path = join(f.config.secretDirectory, f.config.secrets['secret:acme.openai']);
  chmodSync(path, 0o644); await assert.rejects(resolver('secret:acme.openai'), /^Error: secret_unavailable$/);
  rmSync(path); symlinkSync(join(f.config.secretDirectory, 'acme-key-0'), path);
  await assert.rejects(resolver('secret:acme.openai'), /^Error: secret_unavailable$/);
});

test('host verifies images, volumes and dedicated network rather than trusting configuration claims', async t => {
  for (const changes of [{ image: { User: '0' } }, { volume: { Options: { device: '/acme/host', type: 'none', o: 'bind' } } }, { network: { Driver: 'host' } }]) {
    const f = fixture(t, changes);
    await assert.rejects(f.host.inspect({ manifest: f.manifest }), /mismatch/);
    assert.equal(f.spawns.length, 0); await assert.rejects(f.host.loadSecret('secret:acme.openai'), /not_admitted/);
  }
});

test('separate host probe requests only version and boundary checks, without credentials or provider sessions', async t => {
  const f = fixture(t); f.config.approval.apiFundingApproved = false;
  const host = createDockerHost({ config: f.config, configDigest: digest(f.config), io: f.io });
  await host.inspect({ manifest: f.manifest, probeOnly: true });
  await assert.rejects(host.loadSecret('secret:acme.openai'), /not_admitted/);
  await assert.rejects(host.codex({ policy: f.manifest.runtimes.codex, auth: { mode: 'api-key', key: 'Acme-unused' } }), /admission_denied/);
  const result = await host.probe(); await host.close();
  assert.equal(result.credentialReads, 0); assert.equal(result.providerInferenceRequested, false);
  assert.equal(result.checks.length, 2); assert.ok(f.frames.every(frame => frame.probe && Object.keys(frame.env).length === 0));
});

test('launcher uses isolated workers, private stdin credentials and confirmed remote termination', async t => {
  const f = fixture(t);
  const inspection = await f.host.inspect({ manifest: f.manifest }); assert.equal(inspection.hostAccess, 'none');
  assert.equal(f.spawns.length, 0);
  const rpc = await f.host.codex({ policy: f.manifest.runtimes.codex, auth: { mode: 'api-key', key: 'Acme-openai-secret' } });
  await rpc.request('initialize', {}); await rpc.notify('initialized');
  const claude = await f.host.claude({ policy: f.manifest.runtimes.claude, auth: { mode: 'api-key', key: 'Acme-anthropic-secret' } });
  const controller = new AbortController();
  const child = claude.spawnClaudeCodeProcess({ command: '/acme/ignored-host-binary', args: ['--print', '--input-format', 'stream-json'], cwd: f.manifest.runtimes.claude.cwd,
    env: { ...claude.environment, CLAUDE_CODE_MAX_RETRIES: '0', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '1000', MAX_STRUCTURED_OUTPUT_RETRIES: '1', ACME_UNRELATED_SECRET: 'do-not-forward' }, signal: controller.signal });
  child.on('error', () => {}); await tick();
  assert.equal(f.frames.length, 2); assert.deepEqual(f.frames[0].env, {});
  assert.equal(f.frames[1].env.ANTHROPIC_API_KEY, 'Acme-anthropic-secret');
  assert.equal(f.frames[1].env.ACME_UNRELATED_SECRET, undefined);
  const publicData = JSON.stringify({ spawns: f.spawns, calls: f.calls });
  assert.ok(!publicData.includes('Acme-openai-secret') && !publicData.includes('Acme-anthropic-secret'));
  for (const s of f.spawns) { assert.ok(s.args.includes('--read-only')); assert.ok(s.args.includes('never')); assert.equal(s.options.shell, false); }
  assert.equal(f.spawns[0].options.env.HOME, join(f.state, 'host'));
  assert.throws(() => claude.spawnClaudeCodeProcess({ args: [], cwd: f.manifest.runtimes.claude.cwd, env: claude.environment, signal: controller.signal }), /admission_denied/);
  controller.abort(); await tick(); await f.host.close();
  assert.ok(f.calls.some(args => args[1] === 'kill'));
  assert.ok([...f.containers.values()].every(c => !c.State.Running));
  assert.deepEqual(readdirSync(join(f.state, 'host')), ['docker-config']); rpc.close();
});

test('mismatched actual container configuration refuses credentials before worker setup', async t => {
  const f = fixture(t, { container: { Privileged: true } }); await f.host.inspect({ manifest: f.manifest });
  await assert.rejects(f.host.codex({ policy: f.manifest.runtimes.codex, auth: { mode: 'api-key', key: 'Acme-secret' } }));
  await f.host.close(); assert.equal(f.frames.length, 0);
});

test('uncertain remote termination retains durable leases and blocks another host', async t => {
  const f = fixture(t, { ignoreKill: true }); await f.host.inspect({ manifest: f.manifest });
  const rpc = await f.host.codex({ policy: f.manifest.runtimes.codex, auth: { mode: 'api-key', key: 'Acme-secret' } });
  await assert.rejects(f.host.close(), /shutdown_uncertain/); rpc.close();
  assert.ok(existsSync(join(f.state, 'host', 'writer.lock')));
  assert.ok(readdirSync(join(f.state, 'host')).some(name => name.endsWith('.json')));
  const lease = JSON.parse(readFileSync(join(f.state, 'host', readdirSync(join(f.state, 'host')).find(name => name.endsWith('.json')))));
  assert.deepEqual(lease.cleanupFailure, { phase: 'find_after_kill', code: 'worker_still_running' });
  const next = createDockerHost({ config: f.config, configDigest: digest(f.config), io: f.io });
  await assert.rejects(next.inspect({ manifest: f.manifest }), /prior_host_lease/);
});

test('lost Docker run outcome retains a lease even when no container is currently listed', async t => {
  const f = fixture(t), fakeSpawnWorker = f.io.spawnWorker;
  f.io.spawnWorker = (...args) => { const child = fakeSpawnWorker(...args); f.containers.clear(); child.exitCode = 1; return child; };
  const host = createDockerHost({ config: f.config, configDigest: digest(f.config), io: f.io });
  await host.inspect({ manifest: f.manifest });
  await assert.rejects(host.codex({ policy: f.manifest.runtimes.codex, auth: { mode: 'api-key', key: 'Acme-secret' } }));
  await assert.rejects(host.close(), /shutdown_uncertain/);
  assert.ok(readdirSync(join(f.state, 'host')).some(name => name.endsWith('.json')));
});

test('Docker output collection waits for close so late stdout is not truncated', async () => {
  const child = new EventEmitter(); Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() {} });
  const result = collectDockerOutput(child);
  child.emit('exit', 0); child.stdout.write('{"Acme":"complete"}'); child.stdout.end(); child.emit('close', 0);
  assert.equal(await result, '{"Acme":"complete"}');
});

test('container auto-removal between list and inspect confirms absence instead of stranding a lease', async t => {
  const f = fixture(t, { autoRemoveRace: true }); await f.host.inspect({ manifest: f.manifest });
  const rpc = await f.host.codex({ policy: f.manifest.runtimes.codex, auth: { mode: 'api-key', key: 'Acme-unused' } });
  await f.host.close(); rpc.close();
  assert.equal(f.containers.size, 0); assert.deepEqual(readdirSync(join(f.state, 'host')), ['docker-config']);
});

test('inspect failure with a still-listed container retains the lease and safe cleanup stage', async t => {
  const f = fixture(t), original = f.io.run;
  f.io.run = args => {
    if (args[1] === 'inspect' && [...f.containers.values()].some(c => !c.State.Running)) throw new Error('Acme secret-bearing daemon detail');
    return original(args);
  };
  await f.host.inspect({ manifest: f.manifest });
  const rpc = await f.host.codex({ policy: f.manifest.runtimes.codex, auth: { mode: 'api-key', key: 'Acme-unused' } });
  await assert.rejects(f.host.close(), /shutdown_uncertain/); rpc.close();
  const path = join(f.state, 'host', readdirSync(join(f.state, 'host')).find(n => n.endsWith('.json')));
  const raw = readFileSync(path, 'utf8'); assert.equal(raw.includes('secret-bearing'), false);
  assert.deepEqual(JSON.parse(raw).cleanupFailure, { phase: 'find_after_kill', code: 'worker_inspection_uncertain' });
  assert.equal(existsSync(join(f.state, 'host', 'writer.lock')), true);
});

test('entrypoint binds host configuration bytes before importing an executable host module', async t => {
  const f = fixture(t), hostPath = join(f.root, 'host.mjs'), configPath = join(f.root, 'host.json'), manifestPath = join(f.root, 'manifest.json');
  writeFileSync(hostPath, '// Acme selected host\n'); writeFileSync(configPath, JSON.stringify(f.config)); writeFileSync(manifestPath, JSON.stringify(f.manifest));
  const args = ['start', manifestPath, '--approve', inspectDeployment(f.manifest).digest, '--host', hostPath, '--approve-host', reviewHost(hostPath), '--host-config', configPath];
  let imports = 0;
  const deps = { async loadHost() { imports++; return { createHost: options => { assert.equal(options.configDigest, digest(f.config)); return {}; } }; },
    async start() { return { status: 'running' }; } };
  await assert.rejects(runEntrypoint([...args, '--approve-host-config', 'a'.repeat(64)], deps), /not_approved/);
  assert.equal(imports, 0);
  const started = await runEntrypoint([...args, '--approve-host-config', digest(f.config)], deps);
  assert.equal(started.report.status, 'running'); assert.equal(imports, 1);
});

test('Codex startup cancellation detaches when ready so finishing a turn preserves its worker', async t => {
  const f = fixture(t), controller = new AbortController();
  await f.host.inspect({ manifest: f.manifest });
  const rpc = await f.host.codex({ policy: f.manifest.runtimes.codex, auth: { mode: 'api-key', key: 'Acme-synthetic-key' }, signal: controller.signal });
  controller.abort(); await tick();
  assert.equal(f.calls.some(args => args[0] === 'container' && args[1] === 'kill'), false);
  await rpc.request('initialize', {}); await f.host.close();
  assert.equal(f.calls.some(args => args[0] === 'container' && args[1] === 'kill'), true);
});
