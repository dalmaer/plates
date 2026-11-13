// Explicit local bindings only. Adapters retain hashes and fixed-vocabulary facts,
// never review bodies, command output or ambient agent transcripts.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { lstat, realpath, readlink } from 'node:fs/promises';
import { isAbsolute, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluationBytes, evaluationScope } from './evaluation-ledger.mjs';
import { fingerprint, byteDigest, fields, evaluationId, checkEvaluation as check } from './evaluation-records.mjs';
import { qualityOperation } from './agent-quality-ledger.mjs';
import { qualityLifecycle } from './agent-quality-lifecycle.mjs';

const execute = promisify(execFile);
export const QUALITY_APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
export async function qualityGit(root, args, maxBuffer = 4 * 1024 * 1024, raw = false) {
  const result = await execute('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000, maxBuffer,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } });
  return raw ? result.stdout : result.stdout.trim();
}
export async function qualityBinding({ path, root, source, appRoot = QUALITY_APP_ROOT }) {
  if (!path) return null;
  check(isAbsolute(path), 'quality binding path must be absolute');
  const bytes = await evaluationBytes(path, 16384), stat = await lstat(path);
  check(!(stat.mode & 0o077), 'quality binding must be private');
  let binding; try { binding = JSON.parse(bytes); } catch { check(false, 'invalid quality binding'); }
  fields(binding, ['schemaVersion', 'enabled', 'manifest', 'state', 'project', 'episodeId', 'repository', 'sources']);
  check(binding.schemaVersion === 1 && binding.enabled === true && evaluationId(binding.episodeId)
    && typeof binding.project === 'string' && Array.isArray(binding.sources) && binding.sources.length > 0
    && new Set(binding.sources).size === binding.sources.length && binding.sources.every(s => ['command', 'review'].includes(s)), 'invalid quality binding');
  check(binding.sources.includes(source), 'quality binding does not permit this observer');
  check([binding.manifest, binding.state, binding.repository].every(p => typeof p === 'string' && isAbsolute(p)), 'quality binding needs absolute paths');
  const repository = await realpath(binding.repository);
  check(repository === binding.repository && (!root || await realpath(root) === repository), 'quality binding repository mismatch');
  const top = await qualityGit(repository, ['rev-parse', '--show-toplevel']);
  check(await realpath(top) === repository, 'quality binding needs repository root');
  const metadata = JSON.parse(await evaluationBytes(join(repository, '.plates/plates.json'), 1024 * 1024));
  const origin = await qualityGit(repository, ['remote', 'get-url', 'origin']);
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/.exec(origin);
  check(match && match[1].toLowerCase() === binding.project.toLowerCase() && metadata.repo?.toLowerCase() === binding.project.toLowerCase(), 'quality binding project identity mismatch');
  const options = { manifest: binding.manifest, state: binding.state, appRoot };
  await evaluationScope(options);
  const inspected = await qualityOperation({ ...options, action: 'inspect' });
  const episode = inspected.bundle.episodes.find(e => e.id === binding.episodeId && e.project.toLowerCase() === binding.project.toLowerCase());
  check(episode, 'begin the bound quality episode before observing work');
  return { ...binding, path, bindingDigest: byteDigest(bytes), options, episode };
}

export function qualityCommitCheckpoint(project, tree) {
  check(/^[a-f0-9]{40}$/.test(tree), 'invalid checkpoint tree');
  return fingerprint({ kind: 'git-tree', project: project.toLowerCase(), tree });
}
const gitObject = (kind, bytes) => createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest('hex');
function treeDigest(entries) {
  const root = new Map();
  for (const [path, entry] of entries) {
    const names = path.split('/'); let parent = root;
    for (const part of names.slice(0, -1)) { if (!parent.has(part)) parent.set(part, new Map()); check(parent.get(part) instanceof Map, 'conflicting checkpoint paths'); parent = parent.get(part); }
    parent.set(names.at(-1), entry);
  }
  const digest = tree => {
    const children = [...tree].map(([name, entry]) => entry instanceof Map ? { name, mode: '40000', oid: digest(entry), directory: true } : { name, ...entry });
    children.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? '/' : '')), Buffer.from(b.name + (b.directory ? '/' : ''))));
    return gitObject('tree', Buffer.concat(children.map(e => Buffer.concat([Buffer.from(`${e.mode} ${e.name}\0`), Buffer.from(e.oid, 'hex')]))));
  };
  return digest(root);
}
/** Tracked bytes plus an explicit untracked allowlist; unknown files are never read. */
export async function qualityCheckpoint(binding, checkpointPaths = []) {
  check(Array.isArray(checkpointPaths) && checkpointPaths.length <= 100 && new Set(checkpointPaths).size === checkpointPaths.length, 'invalid checkpoint paths');
  const root = binding.repository, head = await qualityGit(root, ['rev-parse', 'HEAD']);
  const entries = new Map(); let unsupported = 0;
  const index = (await qualityGit(root, ['ls-files', '--stage', '-z'], 4 * 1024 * 1024, true)).split('\0').filter(Boolean);
  check(index.length <= 20000, 'tracked inventory exceeds bound');
  for (const row of index) {
    const match = /^(\d+) ([a-f0-9]{40}) ([0-3])\t([\s\S]+)$/.exec(row);
    check(match, 'unsupported git index record');
    if (match[3] !== '0' || !['100644', '100755', '120000'].includes(match[1])) { unsupported++; continue; }
    entries.set(match[4], { mode: match[1], oid: match[2] });
  }
  const changed = (await qualityGit(root, ['diff-files', '--name-only', '-z', '--'], 4 * 1024 * 1024, true)).split('\0').filter(Boolean);
  const names = (await qualityGit(root, ['ls-files', '--others', '--exclude-standard', '-z'], 4 * 1024 * 1024, true)).split('\0').filter(Boolean);
  check(names.length <= 10000, 'untracked inventory exceeds bound');
  const selected = new Set(checkpointPaths); let bytes = 0;
  for (const path of checkpointPaths) {
    check(typeof path === 'string' && path.length <= 512 && !isAbsolute(path) && !path.split('/').some(p => !p || p === '.' || p === '..') && !/[\x00-\x1f\x7f]/.test(path), 'invalid checkpoint path');
    if (!names.includes(path) && !entries.has(path)) {
      try { await lstat(resolve(root, path)); check(false, 'checkpoint allowlist cannot read ignored files'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  let fileMode = true; try { fileMode = await qualityGit(root, ['config', '--bool', 'core.filemode']) !== 'false'; } catch { /* Git defaults to executable-bit tracking. */ }
  for (const path of [...new Set([...changed, ...checkpointPaths.filter(p => names.includes(p))])]) {
    const file = resolve(root, path); check(!relative(root, file).startsWith('..'), 'checkpoint path outside repository');
    let stat; try { stat = await lstat(file); } catch (error) { if (error.code === 'ENOENT') { entries.delete(path); continue; } throw error; }
    if (!stat.isFile() && !stat.isSymbolicLink()) { unsupported++; continue; }
    const content = stat.isSymbolicLink() ? Buffer.from(await readlink(file)) : await evaluationBytes(file, 1024 * 1024);
    bytes += content.length; check(bytes <= 8 * 1024 * 1024, 'checkpoint bytes exceed bound');
    const mode = stat.isSymbolicLink() ? '120000' : !fileMode && entries.has(path) ? entries.get(path).mode : stat.mode & 0o111 ? '100755' : '100644';
    entries.set(path, { mode, oid: gitObject('blob', content) });
  }
  const omittedUntracked = names.filter(path => !selected.has(path)).length;
  const tree = treeDigest(entries), identity = qualityCommitCheckpoint(binding.project, tree);
  return { head, tree, digest: omittedUntracked || unsupported ? null : identity, inputDigest: fingerprint({ identity, omittedUntracked, unsupported }),
    coverage: omittedUntracked || unsupported ? 'incomplete' : 'tracked-and-explicit-paths', omittedUntracked, unsupported, explicitUntracked: checkpointPaths.filter(p => names.includes(p)).length };
}

export async function appendQualityLifecycle(binding, event) {
  const options = { ...binding.options, event };
  const preview = await qualityLifecycle(options);
  return qualityLifecycle({ ...options, yes: true, digest: preview.digest });
}

/** Called with already-read review metadata. No additional provider/GitHub read. */
export async function observeQualityReview({ root, env = process.env, repo, number, head, reviews, observedAt = new Date().toISOString() }) {
  if (!env.PLATES_QUALITY_BINDING) return { status: 'disabled' };
  try {
    const binding = await qualityBinding({ path: env.PLATES_QUALITY_BINDING, root, source: 'review' });
    check(repo.toLowerCase() === binding.project.toLowerCase() && Number.isInteger(number) && number > 0 && /^[a-f0-9]{40}$/.test(head), 'review target differs from quality binding');
    if (!binding.episode.links.some(link => link.toLowerCase() === `${repo}#${number}`.toLowerCase())) return { status: 'gap', reason: 'review-target-not-linked-to-episode' };
    const exact = reviews.filter(r => r.commit === head && typeof r.at === 'string' && Number.isFinite(Date.parse(r.at)));
    if (!exact.length) return { status: 'gap', reason: 'no-review-at-exact-head' };
    const tree = await qualityGit(binding.repository, ['rev-parse', `${head}^{tree}`]);
    const checkpoint = qualityCommitCheckpoint(binding.project, tree);
    const parent = binding.episode.attempts.find(a => ['coding', 'iteration'].includes(a.stage) && a.checkpointDigest === checkpoint);
    if (!parent) return { status: 'gap', reason: 'reviewed-checkpoint-not-recorded' };
    let captured = 0, retained = 0;
    for (const r of exact) {
      const metadata = { repo: repo.toLowerCase(), number, head, reviewerDigest: fingerprint(r.reviewer ?? null), at: new Date(r.at).toISOString(), state: r.state ?? null };
      const identity = fingerprint(metadata), attemptId = `review-${identity.slice(0, 50)}`;
      const previous = binding.episode.attempts.find(a => a.id === attemptId);
      if (previous?.status === 'completed') { retained++; continue; }
      const common = { schemaVersion: 1, episodeId: binding.episodeId, project: binding.project, at: previous?.startedAt ?? observedAt };
      await appendQualityLifecycle(binding, { ...common, id: `${attemptId}-start`, action: 'start', payload: { attemptId, parentId: parent.id, stage: 'review', agent: null, inputCheckpointDigest: checkpoint, experiment: null } });
      await appendQualityLifecycle(binding, { ...common, at: observedAt, id: `${attemptId}-finish`, action: 'finish', payload: { attemptId, status: 'completed', checkpointDigest: null, metadataDigest: identity,
        resources: { wallMs: null }, interventions: [] } });
      captured++;
    }
    return { status: 'observed', exactHead: head, captured, retained, acceptance: 'unknown', model: null, evidence: 'existing-review-metadata' };
  } catch {
    // Original review remains usable, while failed telemetry is a visible gap.
    return { status: 'gap', reason: 'quality-review-observation-unavailable' };
  }
}
