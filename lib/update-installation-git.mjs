// The same exact-ref lease used by integrate: API pull-request merge only
// conditions on the head and cannot protect an approved base from a race.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const oid = value => /^[a-f0-9]{40}$/.test(value ?? '');
const identity = 'Plates <plates@users.noreply.github.com>';
export function mergeArtifact(plan, artifact) {
  if (!artifact || !oid(artifact.sha) || !oid(artifact.tree) || typeof artifact.commit !== 'string' || artifact.commit.length > 16384) throw Error('invalid retained merge artifact');
  const bytes = Buffer.from(artifact.commit, 'base64');
  if (bytes.toString('base64') !== artifact.commit) throw Error('invalid retained merge encoding');
  const text = bytes.toString('utf8');
  const prefix = `tree ${artifact.tree}\nparent ${plan.base}\nparent ${plan.head}\n`;
  const tail = /^author Plates <plates@users\.noreply\.github\.com> \d+ \+0000\ncommitter Plates <plates@users\.noreply\.github\.com> \d+ \+0000\n\n/;
  if (!text.startsWith(prefix) || !tail.test(text.slice(prefix.length)) ||
      createHash('sha1').update(`commit ${bytes.length}\0`).update(bytes).digest('hex') !== artifact.sha) throw Error('merge artifact identity differs');
  return bytes;
}

/** No checkout, hooks, project code, global Git configuration or API merge. */
export function conditionalGit(env = process.env, { remoteFor = repo => `https://github.com/${repo}.git` } = {}) {
  async function repository(plan, use) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(plan.repo) || !oid(plan.base) || !oid(plan.head) || typeof plan.defaultBranch !== 'string') throw Error('invalid conditional source');
    const root = await mkdtemp(join(tmpdir(), 'plates-install-git-'));
    const clean = Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('GIT_') && !k.startsWith('NODE_TEST_')));
    Object.assign(clean, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0' });
    const git = (args, input) => {
      const r = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'gc.auto=0', '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', ...args],
        { cwd: root, env: clean, input, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024 });
      // Avoid echoing provider output, which may contain credential diagnostics.
      if (r.error || r.status !== 0) throw Error(`conditional Git ${args[0]} unavailable or refused; inspect the original operation`);
      return r.stdout.trimEnd();
    };
    try {
      git(['init', '--bare', '--quiet']);
      git(['check-ref-format', `refs/heads/${plan.defaultBranch}`]);
      git(['remote', 'add', 'origin', remoteFor(plan.repo)]);
      git(['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', '--depth=1', 'origin', plan.base, plan.head]);
      for (const sha of [plan.base, plan.head]) if (git(['rev-parse', `${sha}^{commit}`]) !== sha) throw Error('conditional source unavailable');
      const tree = git(['rev-parse', `${plan.head}^{tree}`]);
      if (!oid(tree)) throw Error('candidate tree unavailable');
      return await use(git, tree);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  return {
    prepareMerge: plan => repository(plan, async (git, tree) => {
      // Compatibility inspection proved the complete base/head tree diff, so
      // the reviewed head tree is the approved result; no merge driver runs.
      const at = Math.floor(Date.now() / 1000);
      const text = `tree ${tree}\nparent ${plan.base}\nparent ${plan.head}\nauthor ${identity} ${at} +0000\ncommitter ${identity} ${at} +0000\n\nplates: install ${plan.candidate}\n`;
      const sha = git(['hash-object', '-t', 'commit', '-w', '--stdin'], text);
      const artifact = { sha, tree, commit: Buffer.from(text).toString('base64') };
      mergeArtifact(plan, artifact);
      return artifact;
    }),
    mergeConditional: (plan, artifact, { beforePublish } = {}) => repository(plan, async (git, tree) => {
      const bytes = mergeArtifact(plan, artifact);
      if (tree !== artifact.tree || git(['hash-object', '-t', 'commit', '-w', '--stdin'], bytes) !== artifact.sha) throw Error('conditional merge tree differs');
      if (typeof beforePublish !== 'function') throw Error('durable publication callback required');
      await beforePublish();
      // Parent base makes this a fast-forward only from that exact base. The
      // lease atomically rejects a concurrent advance; branch protections still
      // apply. No force-only or API fallback is permitted after refusal.
      git(['push', '--quiet', `--force-with-lease=refs/heads/${plan.defaultBranch}:${plan.base}`, 'origin', `${artifact.sha}:refs/heads/${plan.defaultBranch}`]);
      return { sha: artifact.sha };
    }),
  };
}
