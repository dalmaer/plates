// Source-only execution policy. Consumers never call this development helper.
import { spawnSync } from 'node:child_process';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRecordPolicy } from '../lib/record-validation.mjs';
import { assertFocusedRuntime } from '../lib/validation-capabilities.mjs';
import { reconcile, markdown, safePath } from './plates/reconcile.mjs';

async function referenceBytes(root, path) {
  const target = await safePath(root, path);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw Error('unavailable bounded reference');
  return readFile(target, 'utf8');
}

export async function recordReferences(root, paths, requiredPRs = [], execute = spawnSync) {
  for (const path of paths.filter(p => p !== 'docs/ROADMAP.md')) {
    const text = await readFile(resolve(root, path), 'utf8');
    for (const m of text.matchAll(/(?:docs\/|\.\.\/)?evidence\/[\w.-]+\.md(?:#[\w.-]+)?/g)) {
      const [file, anchor] = m[0].split('#');
      const target = file.startsWith('docs/') ? file : file.startsWith('../') ? 'docs/' + file.slice(3) : 'docs/' + file;
      const bytes = await referenceBytes(root, target);
      if (anchor && !markdown(bytes).sections.some(s => s.anchor === anchor)) throw Error(`missing evidence anchor: ${path}`);
    }
    for (const m of text.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
      const ref = m[1];
      if (/^https:\/\//.test(ref)) continue;
      const [file, anchor] = ref.split('#');
      const target = file ? resolve(root, dirname(path), file) : resolve(root, path);
      const relative = target.slice(root.length + 1);
      if (!target.startsWith(root + '/') || ref.includes('%') || (!file && !anchor)) throw Error(`unsupported reference: ${path}`);
      const bytes = await referenceBytes(root, relative);
      if (anchor && !markdown(bytes).sections.some(s => s.anchor === anchor)) throw Error(`missing anchor: ${path}`);
    }
  }
  const facts = {};
  for (const pr of requiredPRs) {
    const r = execute('gh', ['api', `repos/${pr}`], { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024, shell: false });
    if (r.error || r.status !== 0) throw Error('required PR reference unavailable');
    const value = JSON.parse(r.stdout);
    if (!['open', 'closed'].includes(value.state) || typeof value.draft !== 'boolean' || !(/^[a-f0-9]{40}$/.test(value.head?.sha ?? '')) || !(/^[a-f0-9]{40}$/.test(value.base?.sha ?? '')) || value.number !== Number(pr.split('/').at(-1))) throw Error('incomplete PR reference');
    if (value.cached || value.stale || value.error || !Object.hasOwn(value, 'merged_at') || (value.merged_at !== null && !Number.isFinite(Date.parse(value.merged_at))) || value.base.repo?.full_name?.toLowerCase() !== pr.split('/pulls/')[0].toLowerCase()) throw Error('unbound or incomplete PR facts');
    facts[pr.replace('/pulls/', '#')] = { state: value.state, draft: value.draft, merged_at: value.merged_at, merge_commit_sha: value.merge_commit_sha ?? null, head: { sha: value.head.sha }, base: { sha: value.base.sha }, updated_at: value.updated_at ?? null, html_url: value.html_url };
  }
  return facts;
}
export const recordStages = base => [
  { id: 'roadmap', command: process.execPath, args: ['scripts/roadmap.mjs', '--check'] },
  { id: 'render', command: process.execPath, args: ['scripts/render.mjs', '--self', '--check'] },
  { id: 'inbox', command: process.execPath, args: ['bin/plates.mjs', 'learn', 'render', '--check'] },
  { id: 'whitespace', command: 'git', args: ['-c', 'core.fsmonitor=false', 'diff', '--check', base] },
];
export async function runRecordChecks(input, { execute = spawnSync, reconcileRecords = reconcile, inspect = inspectRecordPolicy } = {}) {
  const selection = await inspect(input);
  const report = { ...selection, status: 3, fullGatePassed: false, stages: [] };
  if (selection.mode !== 'record-checks') return report;
  const root = await realpath(input.root);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_')));
  try {
    assertFocusedRuntime(root);
    const prFacts = await recordReferences(root, selection.changes, selection.requiredPRs, execute);
    report.stages.push({ id: 'references', status: 0 });
    // Only newly introduced references require fresh remote reads above.
    // Existing private history is not re-fetched with a PR-scoped token.
    // prFacts is an explicit in-memory observation map. The engine never fetches
    // when it is supplied; absent unchanged references remain coverage gaps.
    const records = await reconcileRecords({ root, github: true, prFacts, env });
    const unchangedGaps = records.unknown.filter(x => x.rule === 'github-unavailable' && !Object.hasOwn(prFacts, x.path));
    const requiredGaps = records.unknown.filter(x => !unchangedGaps.includes(x));
    const contradictions = (records.notes ?? []).filter(x => x.rule === 'pr-state-contradiction' && Object.hasOwn(prFacts, x.source?.pr));
    report.stages.push({ id: 'reconciliation', status: records.findings.length || requiredGaps.length || contradictions.length ? 1 : 0, requiredPRs: selection.requiredPRs, remote: 'new-references-only', unchangedRemote: 'not-refreshed', unchangedGaps, notes: records.notes ?? [], findings: records.findings, requiredGaps, snapshot: { ...records.snapshot, remote: 'new-references-only' } });
    if (report.stages.at(-1).status) throw Error('reconciliation findings, new-reference contradiction or missing required facts');
    for (const stage of recordStages(input.base)) {
      const r = execute(stage.command, stage.args, { cwd: root, env, shell: false, timeout: 120000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', stdio: 'pipe' });
      const status = r.error || r.status !== 0 ? 1 : 0;
      report.stages.push({ id: stage.id, status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' });
      if (status) throw Error(`${stage.id} failed`);
    }
    const after = await inspect(input);
    if (after.mode !== 'record-checks' || after.inputDigest !== selection.inputDigest) throw Error('inputs changed during record checks');
    report.status = 0;
  } catch (e) { report.status = 1; report.reasons.push(e.message); }
  return report;
}
async function main(args) {
  const allowed = new Set(['--base', '--head', '--policy', '--json', '--records-only']);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw Error('unknown record policy option');
    const key = args[i].slice(2);
    options[key] = ['json', 'records-only'].includes(key) ? true : args[++i];
  }
  const input = { root: process.cwd(), base: options.base, head: options.head, policy: options.policy };
  const selection = await inspectRecordPolicy(input);
  if (selection.mode !== 'record-checks' && !options['records-only']) {
    // This source entrypoint never uses the consumer docs-only skip path.
    const r = spawnSync(process.execPath, ['scripts/plates/test-ledger.mjs', '--gate'], { cwd: input.root, stdio: ['ignore', 2, 2], env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_'))) });
    process.exitCode = r.status ?? 1;
    console.log(JSON.stringify({ ...selection, status: process.exitCode, fullGatePassed: process.exitCode === 0 }));
    return;
  }
  const report = await runRecordChecks(input);
  console.log(JSON.stringify(report));
  process.exitCode = report.status;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 2; });
