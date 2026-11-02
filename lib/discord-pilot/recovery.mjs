import { constants, openSync, closeSync, fstatSync, readFileSync, readdirSync, writeFileSync,
  mkdirSync, renameSync, unlinkSync, fsyncSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { inspectHostConfig, workerLabel } from './host-config.mjs';
import { digest } from './runtime.mjs';
import { privateDirectory } from './secrets.mjs';
import { collectDockerOutput } from './docker-host.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const exact = (value, fields) => value && Object.keys(value).sort().join() === [...fields].sort().join();
function readRecord(path, maxBytes = 8192) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = fstatSync(fd);
    if (!s.isFile() || s.uid !== process.getuid() || (s.mode & 0o077) || s.nlink !== 1 || s.size < 1 || s.size > maxBytes) throw new Error('recovery_private_record_required');
    const bytes = readFileSync(fd);
    return { value: JSON.parse(bytes), fingerprint: { sha256: sha(bytes), dev: s.dev, ino: s.ino, size: s.size } };
  } finally { closeSync(fd); }
}
function syncDirectory(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function receipt(path, value, exclusive = false) {
  const fd = openSync(path, exclusive ? 'wx' : 'w', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}

// Recovery can only inspect Docker and archive non-secret lease metadata. It has
// no secret resolver, runtime constructor, kill, start, or trial-reset operation.
export function createRecovery({ config, manifest, coordinatorExit, run, processAlive = pid => {
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw new Error('recovery_process_uncertain'); }
} }) {
  config = structuredClone(config); manifest = structuredClone(manifest);
  const scope = inspectHostConfig(config, manifest);
  if (!scope.ready || !/^exec:[0-9]{1,12}:exit:(?:[0-9]{1,2}|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/.test(coordinatorExit ?? '')) throw new Error('recovery_stopped_coordinator_evidence_required');
  const state = privateDirectory(manifest.stateDirectory), home = privateDirectory(join(state, 'host'));
  const dockerConfig = privateDirectory(join(home, 'docker-config'));
  if (readdirSync(dockerConfig).length) throw new Error('empty_docker_config_required');
  const query = run ?? (args => collectDockerOutput(spawn(config.dockerBinary, ['--host', `unix://${config.dockerSocket}`, ...args], {
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, DOCKER_CONFIG: dockerConfig }, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
  })));
  async function absent(leases) {
    const filters = [`label=${workerLabel}=${scope.deploymentDigest}`,
      ...leases.flatMap(l => [`name=^/${l.name}$`, `label=plates.discord.lease=${l.id}`]),
      ...Object.values(config.workers).map(w => `volume=${w.volume}`)];
    for (const filter of filters) {
      if ((await query(['container', 'ls', '--all', '--filter', filter, '--format', '{{.ID}}'])).trim()) throw new Error('recovery_container_present');
    }
    const network = JSON.parse(await query(['network', 'inspect', '--format', '{{json .}}', config.network]));
    if (network.Labels?.[workerLabel] !== scope.deploymentDigest || Object.keys(network.Containers ?? {}).length) throw new Error('recovery_network_not_empty');
  }
  function snapshot() {
    if (existsSync(join(state, 'writer.lock'))) throw new Error('recovery_bridge_writer_present');
    const trial = readRecord(join(state, 'state.json'), 16 * 1024 * 1024);
    if (trial.value.trialRun?.threadId !== manifest.policy.trial.threadId) throw new Error('recovery_consumed_trial_required');
    const names = readdirSync(home).filter(n => n !== 'docker-config').sort();
    if (!names.includes('writer.lock') || names.some(n => n !== 'writer.lock' && (!n.endsWith('.json') || !uuid.test(n.slice(0, -5))))) throw new Error('recovery_unrecognized_host_state');
    const records = names.map(name => ({ name, ...readRecord(join(home, name)) }));
    const lock = records.find(r => r.name === 'writer.lock').value;
    if (!exact(lock, lock.pid === undefined ? ['deploymentDigest', 'configDigest'] : ['deploymentDigest', 'configDigest', 'pid'])
      || lock.deploymentDigest !== scope.deploymentDigest || lock.configDigest !== scope.digest) throw new Error('recovery_lock_binding');
    if (lock.pid !== undefined && (!Number.isSafeInteger(lock.pid) || lock.pid < 1 || processAlive(lock.pid))) throw new Error('recovery_coordinator_alive');
    const leases = records.filter(r => r.name !== 'writer.lock').map(r => {
      const l = r.value;
      if (!exact(l, l.cleanupFailure === undefined ? ['id', 'name', 'runtime', 'deploymentDigest', 'configDigest'] : ['id', 'name', 'runtime', 'deploymentDigest', 'configDigest', 'cleanupFailure'])
        || !uuid.test(l.id) || r.name !== `${l.id}.json` || l.name !== `plates-discord-${l.id}` || !['codex', 'claude'].includes(l.runtime)
        || l.deploymentDigest !== scope.deploymentDigest || l.configDigest !== scope.digest) throw new Error('recovery_lease_binding');
      if (l.cleanupFailure && (!exact(l.cleanupFailure, ['phase', 'code'])
        || !['setup', 'find_before_kill', 'remote_kill', 'find_after_kill', 'local_attach_stop', 'release_lease'].includes(l.cleanupFailure.phase)
        || !['worker_creation_uncertain', 'worker_identity_uncertain', 'worker_still_running', 'worker_inspection_uncertain', 'docker_command_failed', 'unclassified_cleanup_failure'].includes(l.cleanupFailure.code))) throw new Error('recovery_lease_diagnostic');
      return l;
    });
    return { records, leases, trial: trial.fingerprint };
  }
  async function plan() {
    const s = snapshot(); await absent(s.leases);
    const body = { version: 1, deploymentDigest: scope.deploymentDigest, configDigest: scope.digest, coordinatorExit,
      trialFingerprint: s.trial, files: s.records.map(({ name, fingerprint }) => ({ name, fingerprint })),
      action: 'archive-host-lock-and-leases', trialReset: false, credentialReads: 0, containersStarted: 0 };
    return { ...body, digest: digest(body) };
  }
  async function apply(approvedDigest) {
    const selected = await plan();
    if (selected.digest !== approvedDigest) throw new Error('recovery_plan_changed');
    const current = snapshot();
    if (digest(current.trial) !== digest(selected.trialFingerprint)
      || digest(current.records.map(({ name, fingerprint }) => ({ name, fingerprint }))) !== digest(selected.files)) throw new Error('recovery_plan_changed');
    const guardPath = join(home, 'recovery.lock'), guard = openSync(guardPath, 'wx', 0o600);
    let mutated = false, completed = false;
    try {
      writeFileSync(guard, JSON.stringify({ recoveryDigest: approvedDigest, pid: process.pid })); fsyncSync(guard);
      await absent(current.leases);
      const archiveRoot = join(state, 'recovery'); mkdirSync(archiveRoot, { mode: 0o700, recursive: true }); privateDirectory(archiveRoot);
      const archive = join(archiveRoot, approvedDigest); mkdirSync(archive, { mode: 0o700 });
      const result = { ...selected, status: 'intent', checkedAt: new Date().toISOString(), archivedFiles: [] };
      const receiptPath = join(archive, 'receipt.json'); receipt(receiptPath, result, true);
      const order = [...current.records.filter(r => r.name !== 'writer.lock'), current.records.find(r => r.name === 'writer.lock')];
      for (const record of order) {
        if (digest(readRecord(join(home, record.name)).fingerprint) !== digest(record.fingerprint)
          || digest(readRecord(join(state, 'state.json'), 16 * 1024 * 1024).fingerprint) !== digest(current.trial)) throw new Error('recovery_record_changed');
        mutated = true; renameSync(join(home, record.name), join(archive, record.name));
        result.archivedFiles.push(record.name); receipt(receiptPath, result); syncDirectory(home); syncDirectory(archive);
      }
      await absent(current.leases);
      result.status = 'recovered'; result.trialRemainsConsumed = true; receipt(receiptPath, result); syncDirectory(archive);
      completed = true;
      return { status: 'recovered', receiptPath, archivedFiles: result.archivedFiles, trialRemainsConsumed: true, credentialReads: 0, containersStarted: 0 };
    } finally {
      closeSync(guard);
      if (completed || !mutated) { unlinkSync(guardPath); syncDirectory(home); }
      // A partial archive deliberately retains recovery.lock for manual review.
    }
  }
  return { plan, apply };
}
