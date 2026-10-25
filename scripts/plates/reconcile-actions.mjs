// Trusted Actions boundary for the existing reconciliation engine. No project commands.
import { readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { reconcile } from './reconcile.mjs';
const exec = promisify(execFile);
const SELF = fileURLToPath(import.meta.url);
const LIMIT = 8 * 1024 * 1024;
export const digest = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const same = (a, b) => stable(a) === stable(b);
const insist = value => { if (!value) throw Error('Reconciliation Actions evidence unavailable or mismatched'); };
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const validRepo = value => typeof value === 'string' && repoPattern.test(value) && value.split('/').every(part => part !== '.' && part !== '..');
const validPR = key => typeof key === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#[1-9]\d*$/.test(key) && validRepo(key.split('#')[0]);
export function accessConfig(config) {
  const value = config.reconciliation?.githubAccess;
  if (value === undefined || value?.enabled === false) return null;
  insist(value && value.enabled === true && !Object.hasOwn(value, 'secret'));
  insist(Array.isArray(value.repositories) && value.repositories.length > 0 && value.repositories.length <= 32 && value.repositories.every(x => validRepo(x)));
  insist(new Set(value.repositories).size === value.repositories.length);
  return { repositories: [...value.repositories] };
}
// Neither a configurable executable, host nor redirect can receive this credential.
// Secrets are environment-only in this one child; errors never return stderr/body.
export function observer(access, token, defaultToken, run = exec) {
  return async key => {
    insist(validPR(key));
    const allowed = access?.repositories.includes(key.split('#')[0]);
    if (allowed && !token) throw Error('Reconciliation credential unavailable');
    try {
      const { stdout } = await run(process.execPath, [SELF, '--pull', key], {
        env: { PLATES_RECONCILE_API_TOKEN: allowed ? token : defaultToken ?? '' },
        timeout: 20000, maxBuffer: 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch { throw Error('GitHub PR observation unavailable'); }
  };
}
export function identity(env) {
  const value = {
    repository: env.GITHUB_REPOSITORY, repositoryId: env.GITHUB_REPOSITORY_ID,
    sha: env.GITHUB_SHA, ref: env.GITHUB_REF, event: env.GITHUB_EVENT_NAME,
    defaultBranch: env.PLATES_RECONCILE_DEFAULT_BRANCH,
    run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    workflow: env.GITHUB_WORKFLOW_REF, workflowSha: env.GITHUB_WORKFLOW_SHA,
  };
  insist(validRepo(value.repository) && /^[a-f0-9]{40}$/.test(value.sha ?? ''));
  insist(['repositoryId', 'run', 'attempt'].every(k => /^[1-9]\d*$/.test(value[k] ?? '')));
  insist(value.defaultBranch && value.ref === `refs/heads/${value.defaultBranch}` && value.workflowSha === value.sha);
  const path = value.workflow?.split('@')[0];
  insist(value.workflow === `${path}@${value.ref}`);
  insist(path === `${value.repository}/.github/workflows/check.yml` ? value.event === 'push' : path === `${value.repository}/.github/workflows/plates-night.yml` && ['schedule', 'workflow_dispatch'].includes(value.event));
  return value;
}
async function bounded(path) {
  const st = await lstat(path); insist(st.isFile() && !st.isSymbolicLink() && st.size <= LIMIT);
  const bytes = await readFile(path); insist(bytes.length <= LIMIT); return bytes;
}
async function source(root, id) {
  const { stdout } = await exec('git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], { cwd: root, timeout: 10000 });
  insist(stdout.trim() === id.sha);
  const paths = ['scripts/plates/reconcile-actions.mjs', 'scripts/plates/reconcile.mjs', 'scripts/plates/names.mjs', id.workflow.split('@')[0].slice(id.repository.length + 1)];
  const hashes = {};
  for (const path of paths) {
    insist(await realpath(join(root, path)) === join(await realpath(root), path));
    const bytes = await bounded(join(root, path));
    const original = await exec('git', ['-c', 'core.fsmonitor=false', 'show', `${id.sha}:${path}`], { cwd: root, encoding: 'buffer', timeout: 10000, maxBuffer: LIMIT });
    insist(digest(bytes) === digest(original.stdout)); hashes[path] = digest(bytes);
  }
  return hashes;
}
export function envelope(facts, id, runtime, now = Date.now()) {
  return { schema: 1, identity: id, runtime, observedAt: new Date(now).toISOString(), result: facts };
}
export async function validateEnvelope(value, { expectedDigest, bytes, id, runtime, local, now = Date.now() }) {
  insist(/^[a-f0-9]{64}$/.test(expectedDigest ?? '') && digest(bytes) === expectedDigest);
  insist(value.schema === 1 && same(value.identity, id) && same(value.runtime, runtime));
  const age = now - Date.parse(value.observedAt); insist(Number.isFinite(age) && age >= 0 && age <= 24 * 3600000);
  const facts = value.result;
  insist(facts && ['findings', 'unknown', 'notes', 'proposals'].every(k => Array.isArray(facts[k])) && facts.snapshot);
  insist(['config_hash', 'inventory', 'blobs'].every(k => same(facts.snapshot[k], local.snapshot[k])));
  insist(['observed', 'incomplete'].includes(facts.snapshot.remote));
  return freeze(facts);
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export function unavailable() {
  return { findings: [], notes: [], proposals: [], unknown: [{ rule: 'github-unavailable', path: '', message: 'Trusted reconciliation snapshot unavailable or source changed' }], snapshot: { remote: 'incomplete', blobs: {}, prs: {} } };
}
export async function consume({ root, env = process.env }) {
  try {
    const id = identity(env), bytes = await bounded(env.PLATES_RECONCILE_SNAPSHOT);
    const value = JSON.parse(bytes);
    insist(value.artifact && value.artifact.id === env.PLATES_RECONCILE_ARTIFACT_ID && value.artifact.digest === env.PLATES_RECONCILE_ARTIFACT_DIGEST);
    const raw = Buffer.from(value.bytes, 'base64'); insist(raw.length <= LIMIT);
    return await validateEnvelope(JSON.parse(raw), { bytes: raw, expectedDigest: env.PLATES_RECONCILE_RESULT_DIGEST, id, runtime: await source(root, id), local: await reconcile({ root }) });
  } catch { return unavailable(); }
}
async function github(path, env, binary = false) {
  // Default repository token only; never the cross-repository credential.
  try {
    const { stdout } = await exec('/usr/bin/gh', ['api', '--hostname', 'github.com', '--method', 'GET', path], {
      env: { PATH: '/usr/bin:/bin', GH_TOKEN: env.GH_TOKEN ?? '', HOME: env.RUNNER_TEMP },
      timeout: 30000, maxBuffer: LIMIT, encoding: binary ? 'buffer' : 'utf8',
    });
    return binary ? stdout : JSON.parse(stdout);
  } catch { throw Error('Reconciliation artifact unavailable'); }
}
export async function restore(root, env, readGithub = github) {
  const id = identity(env), artifactId = env.PLATES_RECONCILE_ARTIFACT_ID;
  insist(/^[1-9]\d*$/.test(artifactId ?? '') && /^sha256:[a-f0-9]{64}$/.test(env.PLATES_RECONCILE_ARTIFACT_DIGEST ?? ''));
  const run = await readGithub(`repos/${id.repository}/actions/runs/${id.run}`, env);
  insist(String(run.id) === id.run && String(run.run_attempt) === id.attempt && String(run.repository?.id) === id.repositoryId && run.head_sha === id.sha && run.head_branch === id.defaultBranch && run.event === id.event && run.path === id.workflow.split('@')[0].slice(id.repository.length + 1));
  const artifact = await readGithub(`repos/${id.repository}/actions/artifacts/${artifactId}`, env);
  insist(String(artifact.id) === artifactId && artifact.name === `plates-reconciliation-${id.run}-${id.attempt}` && artifact.expired === false && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= LIMIT && artifact.digest === env.PLATES_RECONCILE_ARTIFACT_DIGEST && String(artifact.workflow_run?.id) === id.run && artifact.workflow_run?.head_sha === id.sha);
  const zip = await readGithub(`repos/${id.repository}/actions/artifacts/${artifactId}/zip`, env, true);
  insist(`sha256:${digest(zip)}` === artifact.digest);
  const archive = join(env.RUNNER_TEMP, 'plates-reconciliation.zip');
  await writeFile(archive, zip, { mode: 0o600 });
  const listing = await exec('/usr/bin/unzip', ['-Z1', archive], { timeout: 10000, maxBuffer: LIMIT });
  insist(listing.stdout === 'result.json\n');
  const { stdout: bytes } = await exec('/usr/bin/unzip', ['-p', archive, 'result.json'], { encoding: 'buffer', timeout: 10000, maxBuffer: LIMIT });
  await validateEnvelope(JSON.parse(bytes), { bytes, expectedDigest: env.PLATES_RECONCILE_RESULT_DIGEST, id, runtime: await source(root, id), local: await reconcile({ root }) });
  await writeFile(env.PLATES_RECONCILE_SNAPSHOT, JSON.stringify({ artifact: { id: artifactId, digest: artifact.digest }, bytes: bytes.toString('base64') }), { mode: 0o600 });
}
async function main() {
  if (process.argv[2] === '--pull') {
    const key = process.argv[3]; insist(validPR(key));
    const token = process.env.PLATES_RECONCILE_API_TOKEN; delete process.env.PLATES_RECONCILE_API_TOKEN;
    const response = await fetch(`https://api.github.com/repos/${key.replace('#', '/pulls/')}`, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    insist(response.ok);
    let bytes = 0, chunks = [];
    for await (const chunk of response.body) { bytes += chunk.length; insist(bytes <= 1024 * 1024); chunks.push(chunk); }
    // Only the existing engine sees the response; no response diagnostics escape.
    process.stdout.write(Buffer.concat(chunks)); return;
  }
  const token = process.env.PLATES_RECONCILE_TOKEN; delete process.env.PLATES_RECONCILE_TOKEN;
  const env = { ...process.env }, root = process.cwd();
  if (process.argv[2] === '--restore') { await restore(root, env); return; }
  insist(process.argv[2] === '--produce');
  const id = identity(env), runtime = await source(root, id);
  const config = JSON.parse(await bounded(join(root, '.plates/plates.json'))), access = accessConfig(config);
  insist(access);
  const facts = await reconcile({ root, github: true, observePR: observer(access, token, env.GH_TOKEN) });
  if (!token) { facts.unknown.push({ rule: 'github-unavailable', path: '', message: 'Reconciliation credential unavailable' }); facts.snapshot.remote = 'incomplete'; }
  const bytes = JSON.stringify(envelope(facts, id, runtime));
  await writeFile(join(env.RUNNER_TEMP, 'result.json'), bytes, { mode: 0o600 });
  await writeFile(env.GITHUB_OUTPUT, `digest=${digest(bytes)}\nstatus=${facts.unknown.length ? 2 : facts.findings.length ? 1 : 0}\n`, { flag: 'a' });
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => '') === SELF) {
  main().catch(() => { process.stderr.write('Reconciliation Actions evidence unavailable\n'); process.exitCode = 2; });
}
