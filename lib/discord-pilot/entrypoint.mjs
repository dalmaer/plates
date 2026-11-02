import { readFileSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectDeployment } from './activation.mjs';
import { startPilot } from './service.mjs';
import { inspectHostConfig } from './host-config.mjs';

// Host code is an operator-selected trusted module, never a path from the manifest.
// Its dependencies and pinned worker images are part of the operator's code review.
export function reviewHost(path) {
  if (!isAbsolute(path) || !path.endsWith('.mjs') || !lstatSync(path).isFile()) throw new Error('host_module_path');
  const bytes = readFileSync(path);
  if (bytes.length > 1_000_000) throw new Error('host_module_size');
  return createHash('sha256').update(bytes).digest('hex');
}

export async function runEntrypoint(args, { loadHost = url => import(url), start = startPilot } = {}) {
  const [action, path, ...rest] = args;
  if (!['dry-run', 'start'].includes(action) || !path) throw new Error('arguments');
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (!['--json', '--host', '--approve', '--approve-host', '--host-config', '--approve-host-config'].includes(key) || key in flags) throw new Error('arguments');
    flags[key] = key === '--json' ? true : rest[++i];
    if (!flags[key]) throw new Error('arguments');
  }
  const bytes = readFileSync(path, 'utf8');
  if (bytes.length > 65536) throw new Error('manifest_too_large');
  const manifest = JSON.parse(bytes);
  const report = inspectDeployment(manifest);
  // Even a supplied host path is not read or imported during dry-run.
  if (action === 'dry-run') return { report };
  if (!report.readyForHostValidation || flags['--approve'] !== report.digest) throw new Error('live_start_not_approved');
  if (!flags['--host'] || !/^[a-f0-9]{64}$/.test(flags['--approve-host'] ?? '')
    || reviewHost(flags['--host']) !== flags['--approve-host']) throw new Error('host_module_not_approved');
  let config, configDigest;
  if (flags['--host-config'] || flags['--approve-host-config']) {
    if (!flags['--host-config'] || !flags['--approve-host-config']) throw new Error('host_config_not_approved');
    const raw = readFileSync(flags['--host-config'], 'utf8'); if (raw.length > 65536) throw new Error('host_config_size');
    config = JSON.parse(raw);
    const plan = inspectHostConfig(config, manifest); configDigest = plan.digest;
    if (!plan.ready || flags['--approve-host-config'] !== configDigest) throw new Error('host_config_not_approved');
  }
  const module = await loadHost(pathToFileURL(flags['--host']).href);
  if (typeof module.createHost !== 'function') throw new Error('host_factory_required');
  const host = await module.createHost({ config, configDigest });
  const service = await start({ manifest, approvalDigest: report.digest, host });
  return { report: { digest: report.digest, hostDigest: flags['--approve-host'], status: service.status, readiness: service.readiness?.(), liveStarted: true }, service };
}
