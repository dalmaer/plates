// Explicit source policy; the advisory validation planner and consumer gates are unchanged.
import { spawnSync } from 'node:child_process';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RECORD_POLICY = 'plates-source-records-v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const sha = /^[a-f0-9]{40}$/;
const safe = path => /^[\w./-]+$/.test(path) && !path.split('/').some(p => !p || p === '.' || p === '..');
export function recordPRs(text) {
  return [...text.matchAll(/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)|\b([\w.-]+\/[\w.-]+)#([1-9]\d*)/g)].map(m => `${m[1] || m[3]}/pulls/${m[2] || m[4]}`);
}
const MAX = 8 * 1024 * 1024;
function git(root, args) {
  const r = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.filemode=true', '--no-pager', ...args], { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: MAX, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (r.error || r.status !== 0) throw Error('incomplete Git observation');
  return r.stdout;
}
function changes(text) {
  if (!text) return [];
  const parts = text.split('\0');
  if (parts.pop() !== '' || parts.length % 2) throw Error('incomplete diff');
  const rows = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (!['A', 'M'].includes(parts[i]) || !safe(parts[i + 1])) throw Error('unsupported structural change');
    rows.push(parts[i + 1]);
  }
  return rows;
}
async function regular(root, path) {
  const full = join(root, path);
  if (await realpath(full) !== full) throw Error('symlink input');
  const stat = await lstat(full);
  if (!stat.isFile() || stat.size > MAX || (stat.mode & 0o111)) throw Error('unsupported file type');
  const bytes = await readFile(full);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes) || text.includes('\0')) throw Error('non-text input');
  return text;
}
// Only these attribution slots may differ. Every other byte, including acceptance
// wording, scope, proof, decisions and unknown sections, must remain identical.
export function recordChange(path, before, after) {
  if (path === 'docs/ROADMAP.md') return before !== null;
  if (/^docs\/evidence\/[\w.-]+\.md$/.test(path)) {
    if (path.endsWith('/README.md') || (before !== null && !before.endsWith('\n'))) return false;
    let fence = null;
    for (const line of (before ?? '').split('\n')) {
      const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (m) { if (!fence) fence = m[1]; else if (m[1][0] === fence[0] && m[1].length >= fence.length) fence = null; }
    }
    if (fence) return false;
    const appended = before === null ? after : after.startsWith(before) ? after.slice(before.length) : null;
    return appended !== null && appended.trim().length > 0 && !/```|~~~|<!--|^---|^#{1,6}\s+.*(?:decision|policy|scope|acceptance|proof)/im.test(appended);
  }
  if (!/^docs\/phases\/\d+[\w.-]*\.md$/.test(path) || before === null) return false;
  function fixed(text) {
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
    if (!match) throw Error('unsupported phase syntax');
    const seen = new Set();
    const meta = match[1].split('\n').filter(line => {
      const m = /^(status|since|note|evidence|owes|waits): .+$/.exec(line);
      if (!m) return true;
      if (seen.has(m[1])) throw Error('duplicate attribution');
      seen.add(m[1]); return false;
    }).join('\n');
    const references = text => text.replace(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*|\b[\w.-]+\/[\w.-]+#[1-9]\d*|(?:\.\.\/)?evidence\/[\w.-]+\.md(?:#[\w.-]+)?/g, '<record-reference>');
    const body = match[2].replace(/(^## (?:Next action|Progress|Evidence|History)\n)([\s\S]*?)(?=^## |$(?![\s\S]))/gm, (_, heading, body) => {
      // Code and structured fields are deliberately unsupported, even in a
      // progress section. A reference can change; its surrounding instruction cannot.
      return heading + (/`|~~~|<!--/.test(body) ? body : references(body));
    })
      .replace(/(^## Acceptance\n)([\s\S]*?)(?=^## |$(?![\s\S]))/gm, (_, heading, body) => heading + body.replace(/(^- \[)[ xX](\] )/gm, '$1 $2'));
    return meta + '\n---\n' + body;
  }
  try { return fixed(before) === fixed(after); } catch { return false; }
}
/** Complete endpoint, index and worktree inventory. Any unsupported observation is broad. */
export async function inspectRecordPolicy({ root, base, head, policy }, { sourceRoot = SOURCE_ROOT } = {}) {
  const out = { policy, mode: 'full-gate', provenance: 'full-gate-required', base, head, reasons: [], changes: [] };
  try {
    root = await realpath(root);
    if (policy !== RECORD_POLICY || !sha.test(base ?? '') || !sha.test(head ?? '')) throw Error('explicit policy and full base/head required');
    if (git(root, ['rev-parse', '--show-toplevel']).trim() !== root || git(root, ['rev-parse', 'HEAD']).trim() !== head) throw Error('head/root mismatch');
    for (const ref of [base, head]) if (git(root, ['rev-parse', '--verify', `${ref}^{commit}`]).trim() !== ref) throw Error('missing revision');
    git(root, ['merge-base', '--is-ancestor', base, head]);
    sourceRoot = await realpath(sourceRoot);
    if (git(sourceRoot, ['rev-parse', '--show-toplevel']).trim() !== sourceRoot) throw Error('policy runtime is not a source checkout');
    const common = dir => realpath(resolve(dir, git(dir, ['rev-parse', '--git-common-dir']).trim()));
    if (await common(root) !== await common(sourceRoot)) throw Error('target is outside the source checkout');
    if (JSON.parse(await regular(sourceRoot, '.plates/plates.json')).plates !== 'self') throw Error('runtime is not Plates source');
    const config = JSON.parse(await regular(root, '.plates/plates.json'));
    if (config.plates !== 'self' || config.phases?.source === 'milestones') throw Error('source policy not applicable');
    const configs = git(root, ['config', '--list']);
    if (/^filter\./m.test(configs)) throw Error('Git filters unsupported');
    const diff = ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--ignore-submodules=none', '--name-status', '-z'];
    const committed = git(root, [...diff, base, head, '--']);
    const staged = git(root, [...diff, '--cached', head, '--']);
    const working = git(root, [...diff, '--']);
    const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
    if (/^160000 /m.test(git(root, ['ls-files', '--stage']))) throw Error('submodule inspection unsupported');
    if (/^[a-zS]/m.test(git(root, ['ls-files', '-v']))) throw Error('hidden index worktree state');
    const paths = [...new Set([...changes(committed), ...changes(staged), ...changes(working), ...untracked.split('\0').filter(Boolean)])].sort();
    if (!paths.length || paths.length > 2048 || paths.some(p => !safe(p))) throw Error('empty or unsupported inventory');
    const snapshots = [];
    for (const path of paths) {
      const versions = [];
      for (const ref of [base, head]) {
        const tree = git(root, ['ls-tree', ref, '--', path]);
        if (!tree) versions.push(null);
        else {
          if (!tree.startsWith('100644 blob ')) throw Error(`unsupported tree mode: ${path}`);
          versions.push(git(root, ['show', `${ref}:${path}`]));
        }
      }
      const index = git(root, ['ls-files', '--stage', '--', path]);
      if (index && !/^100644 [a-f0-9]{40} 0\t[^\n]+\n$/.test(index)) throw Error(`unsupported index mode: ${path}`);
      versions.push(index ? git(root, ['show', `:${path}`]) : versions[1]);
      versions.push(await regular(root, path));
      for (let i = 1; i < versions.length; i++) if (versions[i] !== versions[i - 1] && (versions[i] === null || !recordChange(path, versions[i - 1], versions[i]))) throw Error(`non-record change: ${path}`);
      if (/[ \t]+$/m.test(versions.at(-1))) throw Error(`record whitespace: ${path}`);
      snapshots.push({ path, versions });
    }
    out.changes = paths;
    out.requiredPRs = [...new Set(snapshots.flatMap(({ versions }) => {
      const old = recordPRs(versions[0] ?? '');
      return versions.slice(1).flatMap(v => recordPRs(v ?? '').filter((ref, index) => old[index] !== ref));
    }))];
    out.acceptanceAttribution = snapshots.filter(s => s.path.startsWith('docs/phases/')).flatMap(({ path, versions }) => {
      const boxes = text => (text ?? '').match(/^- \[[ xX]\].*$/gm) ?? [];
      return JSON.stringify(boxes(versions[0])) === JSON.stringify(boxes(versions.at(-1))) ? [] : [{ path, before: boxes(versions[0]), after: boxes(versions.at(-1)), authority: 'attribution-only' }];
    });
    out.inputDigest = hash(JSON.stringify({ base, head, committed, staged, working, untracked, snapshots }));
    out.mode = 'record-checks'; out.provenance = 'record-checks';
  } catch (e) { out.reasons.push(e.message); }
  return out;
}

/** Source-only managed workflow shape; consumer templates need no dev helper. */
export function shapeRecordWorkflow(text, config) {
  if (config.plates !== 'self') return text;
  const expression = value => '${{ ' + value + ' }}';
  const step = `      - name: Run the configured gate\n        env:\n          GH_TOKEN: ${expression('github.token')}`;
  const gate = '          if [ -f scripts/plates/gate.mjs ]; then';
  if (!text.includes(step) || !text.includes(gate)) throw Error('source check workflow no longer matches record-policy shape');
  return text.replace(step, `${step}\n          RECORD_BASE: ${expression('github.event.pull_request.base.sha || github.event.before')}\n          RECORD_HEAD: ${expression('github.event.pull_request.head.sha || github.sha')}`)
    .replace(gate, `          SELF=$(node -e 'const c=JSON.parse(require("fs").readFileSync(".plates/plates.json","utf8"));console.log(c.plates === "self" ? "true" : "false")')
          if [ "$SELF" = true ]; then
            node scripts/check-records.mjs --policy ${RECORD_POLICY} --base "$RECORD_BASE" --head "$RECORD_HEAD" --json
          elif [ -f scripts/plates/gate.mjs ]; then`);
}
