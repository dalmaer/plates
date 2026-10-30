// Optional local command observer. Exact preview authorizes this command only;
// it does not grant model spend, credentials, network access or a sandbox.
import { spawn } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { evaluationBytes } from './evaluation-ledger.mjs';
import { fingerprint, byteDigest, fields, evaluationId, sealRecord, checkEvaluation as check } from './evaluation-records.mjs';
import { safePath, readJson } from './session-ledger-io.mjs';
import { qualitySourceOperation } from './agent-quality-ledger.mjs';
import { qualityAgent } from './agent-quality-lifecycle.mjs';
import { qualityBinding, qualityCheckpoint, appendQualityLifecycle } from './agent-quality-observer.mjs';

async function readRecord(path) {
  const bytes = await evaluationBytes(path, 65536);
  check(!((await lstat(path)).mode & 0o077), 'execution record must be private');
  let record; try { record = JSON.parse(bytes); } catch { check(false, 'invalid quality execution JSON'); }
  fields(record, ['schemaVersion', 'id', 'binding', 'command', 'stage', 'agent', 'parentId', 'inputCheckpointDigest', 'checkpointPaths']);
  check(record.schemaVersion === 1 && evaluationId(record.id) && record.id.length <= 50 && isAbsolute(record.binding)
    && ['planning', 'coding', 'review', 'iteration'].includes(record.stage), 'invalid quality execution identity');
  fields(record.command, ['executable', 'args', 'timeoutSeconds']);
  const c = record.command;
  check(typeof c.executable === 'string' && isAbsolute(c.executable) && !/[\x00-\x1f\x7f]/.test(c.executable)
    && Array.isArray(c.args) && c.args.length <= 128 && c.args.every(a => typeof a === 'string' && a.length <= 4096 && !a.includes('\0'))
    && Number.isInteger(c.timeoutSeconds) && c.timeoutSeconds >= 1 && c.timeoutSeconds <= 3600, 'invalid bounded command');
  qualityAgent(record.agent);
  check(record.parentId === null || evaluationId(record.parentId), 'invalid parent attempt');
  check(record.inputCheckpointDigest === null || /^[a-f0-9]{64}$/.test(record.inputCheckpointDigest), 'invalid input checkpoint');
  if (['review', 'iteration'].includes(record.stage)) check(record.inputCheckpointDigest !== null, 'review or revision needs recorded input checkpoint');
  return { record, recordDigest: byteDigest(bytes) };
}
async function original(directory) {
  if (!await safePath(directory)) return null;
  check(!((await lstat(directory)).mode & 0o077), 'unsafe command receipt directory');
  const entries = await readdir(directory);
  check(entries.every(f => ['intent.json', 'result.json'].includes(f)), 'partial or foreign command receipt');
  if (!entries.includes('intent.json')) return { status: 'uncertain', reason: 'intent-unavailable' };
  const intent = await readJson(join(directory, 'intent.json'), 65536);
  check(sealRecord(intent).digest === intent.digest && intent.kind === 'quality-command-intent', 'invalid command intent');
  let result = null;
  if (entries.includes('result.json')) {
    result = await readJson(join(directory, 'result.json'), 65536);
    check(sealRecord(result).digest === result.digest && result.kind === 'quality-command-result' && result.intentDigest === intent.digest, 'invalid command result');
  }
  return { intent, result, status: result?.status ?? 'uncertain', reason: result ? null : 'original-command-outcome-unknown' };
}
function processGroupExists(pid) {
  try { process.kill(-pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function executeCommand(command, cwd, bindingPath) {
  return new Promise(resolveResult => {
    const started = Date.now(); let timedOut = false, settled = false, timer;
    const child = spawn(command.executable, command.args, { cwd, shell: false, detached: true,
      stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, PLATES_QUALITY_BINDING: bindingPath } });
    const finish = async (code, signal, spawnError = null) => {
      if (settled) return; settled = true; clearTimeout(timer);
      let terminated = !child.pid || !processGroupExists(child.pid);
      if (!terminated) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Verification decides below. */ }
        const deadline = Date.now() + 1000;
        while (Date.now() < deadline && processGroupExists(child.pid)) await new Promise(r => setTimeout(r, 20));
        terminated = !processGroupExists(child.pid);
      }
      resolveResult({ status: !terminated ? 'unknown' : spawnError ? ['EACCES', 'EPERM'].includes(spawnError) ? 'denied' : 'failed'
        : timedOut ? 'timeout' : signal ? 'aborted' : code === 0 ? 'completed' : 'failed',
      exitCode: Number.isInteger(code) ? code : null, signal: signal ?? null,
      spawnError: spawnError && ['ENOENT', 'EACCES', 'EPERM'].includes(spawnError) ? spawnError : spawnError ? 'unavailable' : null,
      timedOut, groupTermination: terminated ? 'confirmed' : 'unknown', wallMs: Date.now() - started, endedAt: new Date().toISOString() });
    };
    child.once('error', error => { void finish(null, null, error.code ?? 'unavailable'); });
    child.once('close', (code, signal) => { void finish(code, signal); });
    timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { /* close/error retains outcome. */ } }, command.timeoutSeconds * 1000);
    timer.unref();
  });
}

export async function qualityRun(options) {
  check(process.platform !== 'win32', 'quality run requires a POSIX host; Windows process-group termination is unsupported');
  check(typeof options.record === 'string' && isAbsolute(options.record), 'quality run needs absolute record path');
  check(options.digest === undefined || options.yes, 'quality run digest requires --yes');
  const input = await readRecord(options.record), { record } = input;
  const binding = await qualityBinding({ path: record.binding, root: options.cwd, source: 'command', appRoot: options.appRoot });
  const identity = { recordPath: options.record, recordDigest: input.recordDigest, bindingDigest: binding.bindingDigest,
    episodeId: binding.episodeId, project: binding.project, commandId: record.id };
  const directory = join(binding.state, 'session-trials', '.quality', 'sources', `command-${fingerprint({ project: binding.project.toLowerCase(), episodeId: binding.episodeId, id: record.id })}`);
  const sourceId = directory.split('/').at(-1);
  const prior = await original(directory);
  if (prior) {
    check(prior.intent && fingerprint(prior.intent.identity) === fingerprint(identity), 'original command intent unavailable or inputs changed; never redispatch');
    check(!options.yes || options.digest === prior.intent.previewDigest, 'original command approval digest required');
    let lifecycleRecovery = null;
    if (options.yes && prior.result?.lifecycle === 'unavailable') {
      const attempt = binding.episode.attempts.find(a => a.id === record.id);
      if (attempt && !['running', 'unknown'].includes(attempt.status)) lifecycleRecovery = { status: 'observed', retainedOriginal: true };
      else if (attempt) {
        await appendQualityLifecycle(binding, { schemaVersion: 1, id: `${record.id}-recover-finish`, action: 'finish', episodeId: binding.episodeId, project: binding.project, at: new Date().toISOString(),
          payload: { attemptId: record.id, status: prior.result.execution.status, endedAt: prior.result.execution.endedAt, checkpointDigest: prior.result.checkpoint?.digest ?? null,
            resources: { wallMs: prior.result.execution.wallMs }, interventions: [] } });
        lifecycleRecovery = { status: 'observed', retainedOriginal: true, completedAt: prior.result.createdAt, observedLater: true };
      }
    }
    return { action: 'run', preview: false, recovered: true, ...prior, lifecycleRecovery, redispatched: false };
  }
  check(!binding.episode.attempts.some(a => a.id === record.id), 'attempt already exists; never dispatch it again');
  const checkpoint = await qualityCheckpoint(binding, record.checkpointPaths);
  if (['review', 'iteration'].includes(record.stage)) check(checkpoint.digest !== null && checkpoint.digest === record.inputCheckpointDigest, 'current repository differs from the frozen review or revision input');
  const digest = fingerprint({ identity, checkpoint, executable: record.command.executable, commandDigest: fingerprint(record.command) });
  const preview = { action: 'run', preview: true, digest, recordPath: options.record, recordDigest: input.recordDigest,
    executable: record.command.executable, argumentCount: record.command.args.length, timeoutSeconds: record.command.timeoutSeconds,
    checkpoint, stage: record.stage, episodeId: binding.episodeId, argumentReview: 'Inspect the exact private record bytes before approving; arguments are not persisted or displayed.',
    output: 'discarded', executionBoundary: 'local process group; not a sandbox or provider budget authorization' };
  if (!options.yes) return preview;
  check(options.digest === digest, 'stale or missing command preview digest');
  check(byteDigest(await evaluationBytes(options.record, 65536)) === input.recordDigest
    && byteDigest(await evaluationBytes(record.binding, 16384)) === binding.bindingDigest
    && fingerprint(await qualityCheckpoint(binding, record.checkpointPaths)) === fingerprint(checkpoint), 'command inputs changed before dispatch');
  const at = new Date().toISOString();
  const intent = sealRecord({ schemaVersion: 2, kind: 'quality-command-intent', id: record.id, createdAt: at, identity, previewDigest: digest,
    commandDigest: fingerprint(record.command), inputCheckpoint: checkpoint, output: 'discarded' });
  const reservation = await qualitySourceOperation({ ...binding.options, id: sourceId, kind: 'intent', record: intent });
  check(!reservation.recovered, 'command already reserved; inspect original attempt');
  const event = { schemaVersion: 1, episodeId: binding.episodeId, project: binding.project, at };
  await appendQualityLifecycle(binding, { ...event, id: `${record.id}-start`, action: 'start', payload: {
    attemptId: record.id, parentId: record.parentId, stage: record.stage, agent: record.agent,
    inputCheckpointDigest: record.inputCheckpointDigest, experiment: null } });
  const stillCurrent = fingerprint(await qualityCheckpoint(binding, record.checkpointPaths)) === fingerprint(checkpoint);
  const execution = stillCurrent ? await executeCommand(record.command, binding.repository, binding.path) : {
    status: 'blocked', exitCode: null, signal: null, spawnError: null, timedOut: false, groupTermination: 'not-dispatched', wallMs: 0, endedAt: new Date().toISOString() };
  let after = null, finish = 'unavailable';
  try { after = await qualityCheckpoint(binding, record.checkpointPaths); } catch { /* Changed inventory may be incomplete, never invented. */ }
  try {
    await appendQualityLifecycle(binding, { ...event, at: new Date().toISOString(), id: `${record.id}-finish`, action: 'finish', payload: {
      attemptId: record.id, status: execution.status, endedAt: execution.endedAt, checkpointDigest: after?.digest ?? null,
      resources: { wallMs: execution.wallMs }, interventions: [] } });
    finish = 'observed';
  } catch { /* Preserve the command receipt even when lifecycle storage is blocked. */ }
  const result = sealRecord({ schemaVersion: 2, kind: 'quality-command-result', id: record.id, createdAt: new Date().toISOString(),
    intentDigest: intent.digest, status: execution.status, execution, checkpoint: after, lifecycle: finish, acceptance: 'unknown', output: 'discarded' });
  await qualitySourceOperation({ ...binding.options, id: sourceId, kind: 'result', record: result });
  return { action: 'run', preview: false, recovered: false, status: result.status, intent, result, redispatched: false };
}

export async function qualityRunCommand({ args, appRoot, cwd }) {
  const options = { appRoot, cwd }, seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]; check(['--record', '--yes', '--digest', '--json'].includes(flag) && !seen.has(flag), 'unknown or repeated quality run option'); seen.add(flag);
    if (['--yes', '--json'].includes(flag)) options[flag.slice(2)] = true;
    else { check(args[i + 1] && !args[i + 1].startsWith('--'), 'quality run option needs value'); options[flag.slice(2)] = args[++i]; }
  }
  if (options.record) options.record = resolve(cwd, options.record);
  const data = await qualityRun(options);
  return { data, text: JSON.stringify(data, null, 2), exitCode: data.preview ? 3 : data.status === 'completed' && (data.result?.lifecycle === 'observed' || data.lifecycleRecovery?.status === 'observed') ? 0 : 1 };
}
