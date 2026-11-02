import { isAbsolute, normalize } from 'node:path';
import { digest } from './runtime.mjs';
import { inspectDeployment } from './activation.mjs';

const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join() === [...keys].sort().join();
const absolute = value => typeof value === 'string' && isAbsolute(value) && normalize(value) === value && !value.includes('\0');
const name = value => typeof value === 'string' && /^[a-z][a-z0-9_.-]{2,79}$/.test(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const workerLabel = 'plates.discord.deployment';

// Pure planning only. Does not probe Docker, import an SDK or read a secret.
export function inspectHostConfig(config, manifest, { probeOnly = false } = {}) {
  if (!exact(config, ['version', 'enabled', 'dockerBinary', 'dockerSocket', 'dockerVersion', 'sdk', 'secretDirectory', 'secrets', 'workers', 'network', 'resources', 'approval'])
    || config.version !== 1 || typeof config.enabled !== 'boolean'
    || !exact(config.sdk, ['modulePath', 'packagePath', 'version', 'moduleSha256'])
    || !exact(config.workers, ['codex', 'claude'])
    || !exact(config.resources, ['memoryMiB', 'cpus', 'pids', 'maxWorkers'])
    || !exact(config.approval, ['deploymentDigest', 'apiFundingApproved', 'maxAdmissionMicros', 'egress'])) throw new Error('host_config_schema');
  const deployment = inspectDeployment(manifest), blockers = [...deployment.blockers];
  if (!config.enabled) blockers.push('host_disabled');
  if (!absolute(config.dockerBinary) || !absolute(config.dockerSocket) || typeof config.dockerVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(config.dockerVersion)) blockers.push('docker_unselected');
  if (!absolute(config.sdk.modulePath) || !absolute(config.sdk.packagePath) || !sha(config.sdk.moduleSha256)
    || typeof config.sdk.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(config.sdk.version)) blockers.push('sdk_unselected');
  if (!absolute(config.secretDirectory) || config.secretDirectory === manifest.stateDirectory || config.secretDirectory?.startsWith(`${manifest.stateDirectory}/`)) blockers.push('separate_secret_directory_required');
  const references = [...Object.values(manifest.discordSecrets), ...Object.values(manifest.authSecrets)];
  if (!exact(config.secrets, references) || references.some(ref => typeof ref !== 'string' || !/^secret:[A-Za-z0-9._-]+$/.test(ref)
    || !name(config.secrets[ref])) || new Set(Object.values(config.secrets ?? {})).size !== 4) blockers.push('explicit_secret_handles_required');
  if (['codex', 'claude'].some(runtime => manifest.runtimes[runtime].authMode !== 'api-key')) blockers.push('api_key_auth_only');
  for (const runtime of ['codex', 'claude']) {
    const worker = config.workers[runtime];
    if (!exact(worker, ['image', 'volume'])) throw new Error('worker_config_schema');
    if (typeof worker.image !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(worker.image) || !name(worker.volume)) blockers.push(`${runtime}_image_volume_unselected`);
    if (!absolute(manifest.runtimes[runtime].cwd) || !manifest.runtimes[runtime].cwd?.endsWith(`/runtimes/${runtime}/workspace`)
      || !/^\d+\.\d+\.\d+$/.test(manifest.runtimes[runtime].version)) blockers.push(`${runtime}_version_workspace_required`);
  }
  if (config.workers.codex.volume === config.workers.claude.volume) blockers.push('distinct_worker_volumes_required');
  if (!name(config.network) || ['host', 'bridge', 'none'].includes(config.network)) blockers.push('dedicated_network_required');
  const r = config.resources;
  if (!Number.isInteger(r.memoryMiB) || r.memoryMiB < 512 || r.memoryMiB > 4096
    || ![0.5, 1, 2].includes(r.cpus) || !Number.isInteger(r.pids) || r.pids < 32 || r.pids > 256
    || !Number.isInteger(r.maxWorkers) || r.maxWorkers < 2 || r.maxWorkers > 4) blockers.push('resource_limits_required');
  if (config.approval.deploymentDigest !== deployment.digest || (!probeOnly && config.approval.apiFundingApproved !== true)
    || config.approval.egress !== 'runtime-internet' || !Number.isSafeInteger(config.approval.maxAdmissionMicros)
    || config.approval.maxAdmissionMicros <= 0 || manifest.policy.limits.totalMicros > config.approval.maxAdmissionMicros) blockers.push('host_authorization_required');
  return { mode: probeOnly ? 'probe' : 'live', digest: digest(config), deploymentDigest: deployment.digest, ready: blockers.length === 0, blockers,
    credentialReads: 0, processesStarted: 0, providerBillHardCap: false,
    egress: 'runtime-internet', persistence: 'separate-named-volumes', maxWorkers: r.maxWorkers };
}

export function workerArgs(config, manifest, runtime, lease) {
  const p = config.resources, worker = config.workers[runtime];
  return ['run', '--pull', 'never', '--rm', '-i', '--name', lease.name,
    '--label', `${workerLabel}=${lease.deploymentDigest}`, '--label', `plates.discord.lease=${lease.id}`,
    '--label', `plates.discord.runtime=${runtime}`, '--platform', 'linux/arm64', '--user', '1000:1000',
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', String(p.pids),
    '--memory', `${p.memoryMiB}m`, '--memory-swap', `${p.memoryMiB}m`, '--cpus', String(p.cpus),
    '--network', config.network, '--ipc', 'private', '--log-driver', 'none',
    '--mount', `type=volume,src=${worker.volume},dst=/home/agent`, '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m,mode=1777',
    '--workdir', manifest.runtimes[runtime].cwd, '--entrypoint', '/usr/local/bin/node', worker.image,
    '/opt/pilot/worker.mjs', runtime];
}
