import { constants } from 'node:fs';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { findRoot, NoProject } from './project.mjs';
import { AUTONOMY_LEVELS, AutonomyError, autonomyDigest, autonomyReport, validateAutonomy } from './autonomy.mjs';

const fail = message => { throw new AutonomyError(message); };
const FILE = '.plates/autonomy.json';
async function readSafe(file, optional = false) {
  let handle;
  try {
    // Check before opening so a FIFO cannot block the read. NOFOLLOW checks the leaf again.
    const info = await lstat(file);
    if (!info.isFile() || info.nlink !== 1 || info.size > 65536) fail('Autonomy inputs must be bounded regular files without links.');
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const current = await handle.stat();
    if (!current.isFile() || current.nlink !== 1 || current.size > 65536 || current.ino !== info.ino) fail('Autonomy input changed while opening.');
    const buffer = Buffer.alloc(65537);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > 65536) fail('Autonomy input exceeds the size limit.');
    return buffer.toString('utf8', 0, length);
  } catch (e) {
    if (optional && e.code === 'ENOENT') return null;
    throw e;
  } finally { await handle?.close(); }
}
async function state(root) {
  root = await realpath(root);
  if (!(await lstat(join(root, '.plates'))).isDirectory()) fail('.plates must be a directory without a symlink.');
  const config = await readSafe(join(root, '.plates/plates.json'));
  const before = await readSafe(join(root, FILE), true);
  let repository, value;
  try { repository = JSON.parse(config).repo; value = before === null ? undefined : JSON.parse(before); }
  catch { fail('Invalid autonomy or project JSON; repair it before selecting authority.'); }
  const report = autonomyReport(value, repository);
  return { root, config, before, repository, report };
}
function proposal(current, options) {
  const policy = validateAutonomy({ schema: 1, repository: current.repository, mode: options.mode, push: options.push, merge: options.merge, ...(options.pushPrefixes ? { pushPrefixes: options.pushPrefixes } : {}) }, current.repository);
  const report = autonomyReport(policy, current.repository);
  return { ...report, digest: autonomyDigest({ operation: 'autonomy.select.v1', root: current.root, config: current.config, before: current.before, policy }), previous: current.report.policy };
}
function output(status, report, exitCode = 0) {
  return { exitCode, data: { status, path: FILE, ...report }, text: [
    `Risk tolerance: ${report.level} (${status}) for ${report.policy.repository}`,
    ...report.scopes.map(s => `${s.scope}: ${s.authority}${s.branches?.length ? ` (${s.branches.join(', ')})` : ''}${s.namespaces?.length ? ` (push namespaces: ${s.namespaces.join(', ')}; protected/default excluded)` : ''}`),
    'Effective authority: requires current task, selection provenance, platform, project and command-gate verification.',
    ...report.boundaries,
    ...(status === 'preview' ? [`Review this scope, then confirm with --yes --digest ${report.digest}.`] : []),
  ].join('\n') };
}
export function parseAutonomyArgs(args) {
  const options = { push: [], merge: [], yes: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--json', '--yes', '--level', '--mode', '--push', '--push-prefix', '--merge', '--digest'].includes(key)) fail(`Unexpected autonomy argument: ${key}`);
    if (seen.has(key) && !['--push', '--push-prefix', '--merge'].includes(key)) fail(`Duplicate autonomy flag: ${key}`);
    seen.add(key);
    if (key === '--json') continue;
    if (key === '--yes') { options.yes = true; continue; }
    const value = args[++i];
    if (!value || value.startsWith('--')) fail(`${key} needs a value.`);
    if (key === '--push-prefix') (options.pushPrefixes ??= []).push(value);
    else if (key === '--push' || key === '--merge') options[key.slice(2)].push(value);
    else options[key.slice(2)] = value;
  }
  if (options.level !== undefined) {
    if (options.mode !== undefined) fail('Use --level or the legacy --mode alias, not both.');
    if (!Object.hasOwn(AUTONOMY_LEVELS, options.level)) fail('Risk tolerance must be low, medium or high.');
    options.mode = AUTONOMY_LEVELS[options.level];
    delete options.level;
  }
  if (!options.mode && (options.yes || options.digest || options.push.length || options.merge.length || options.pushPrefixes?.length)) fail('Selection flags require --level (or legacy --mode).');
  if (options.digest && !options.yes) fail('--digest requires --yes.');
  return options;
}

export async function autonomyCommand({ root, ...options }) {
  const current = await state(root);
  if (!options.mode) return output('inspected', current.report);
  const preview = proposal(current, options);
  if (!options.yes) return output('preview', preview, 3);
  if (options.digest !== preview.digest) fail('Autonomy preview changed or digest missing; inspect and confirm the current preview.');
  const lockPath = join(current.root, '.plates/autonomy.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (e) { if (e.code === 'EEXIST') fail('Autonomy selection is locked; inspect the original writer before removing a stale lock.'); throw e; }
  const temp = join(current.root, `.plates/autonomy.${randomUUID()}.tmp`);
  let tempCreated = false;
  try {
    const fresh = await state(current.root);
    if (proposal(fresh, options).digest !== preview.digest) fail('Autonomy inputs changed; preview again.');
    if (fresh.before !== null && autonomyDigest(fresh.report.policy) === preview.policyDigest) return output('unchanged', fresh.report);
    const handle = await open(temp, 'wx', 0o600);
    tempCreated = true;
    try { await handle.writeFile(`${JSON.stringify(preview.policy, null, 2)}\n`); await handle.sync(); }
    finally { await handle.close(); }
    if (proposal(await state(current.root), options).digest !== preview.digest) fail('Autonomy inputs changed; preview again.');
    await rename(temp, join(current.root, FILE));
    tempCreated = false;
    const saved = await state(current.root);
    if (saved.report.policyDigest !== preview.policyDigest || saved.config !== current.config) fail('Autonomy readback changed; inspect the saved setting before further action.');
    return output('selected', saved.report);
  } finally {
    if (tempCreated) await unlink(temp);
    await lock.close();
    await unlink(lockPath);
  }
}


/** Read-only startup context. Repository bytes never authenticate an owner's selection. */
export async function autonomyAgentContext(cwd) {
  try {
    let root;
    try { root = await findRoot(cwd); }
    catch (error) { if (error instanceof NoProject) return null; throw error; }
    try { await lstat(join(root, FILE)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    const { report } = await state(root);
    const inspected = output('inspected', report);
    return {
      data: { ...inspected.data, source: 'repository-declaration', selectionVerification: 'unverified', guidance: 'After verifying explicit human selection, current task authority and all existing gates, continue covered routine work without repeating conversational approval. This declaration grants no host permission.' },
      text: [
        'Project autonomy context (repository declaration; selection provenance is unverified)',
        inspected.text,
        'Use this scope only after verifying explicit human selection for this policy digest in trusted context.',
        `Policy digest: ${report.policyDigest}`,
        'When that selection, the current task and all gates already authorize the same routine work, continue without repeating the conversational approval question.',
        'This context grants no platform permission and supplies no command confirmation.',
      ].join('\n'),
    };
  } catch {
    return {
      data: { status: 'unavailable', path: FILE, effectiveAuthority: 'unavailable', selectionVerification: 'unverified' },
      text: 'Project autonomy context is unavailable. Infer no authority from it; inspect plates autonomy before relying on a selected mode. Existing rules and command gates still apply.',
    };
  }
}
