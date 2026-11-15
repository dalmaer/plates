import { milestoneSource } from '../roadmap.mjs';
// plates's generated-file check (plates practice `phases`; managed: plates render
// rewrites it). plates's lesson 52: a file declared generated is only a view
// while its generator rewrites it whole. A generator that appends, or keeps
// lines it did not write, leaves a hand edit standing in a file everybody is
// told never to edit. tests/plates-generated.test.mjs copies the project to a
// temporary directory, appends a marker line to each generated file, runs that
// file's generator, and fails if the marker survives.
//
// GENERATORS is the one list: each generated file, the practice that makes
// it, and the command that writes it, run with node from the project's root.
// plates-only entries (`self`) are files plates itself generates with code a
// project does not have. docs/plates-lessons.md is a managed file plates renders
// into a project, so a project has no generator of its own for it; on plates,
// its renderer is probed, and a managed file is the one case where the marker
// stays: plates never overwrites a project's edit (drift is signal), so the
// renderer must refuse, exit non-zero and name the file (`refuses`). A
// renderer that kept the edit silently, or overwrote it, fails the same.
//
// The copy holds source only: what git ignores (build output, a Rust target/)
// stays behind, unless a generator names it as its file, script or `reads`.
//
// Zero dependencies. Generators run with the test runner's NODE_TEST_*
// variables stripped, so a generator that runs tests runs them.
import { readFile, appendFile, mkdtemp, cp, rm, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';

export const GENERATORS = Object.freeze([
  { path: 'docs/ROADMAP.md', practice: 'phases', args: ['scripts/roadmap.mjs'] },
  { path: 'docs/LOOP.md', practice: 'loop', args: ['scripts/loop.mjs', 'render'] },
  { path: 'docs/plates-lessons.md', practice: 'lessons', self: true, refuses: true, args: ['scripts/render.mjs', '--self'] },
  { path: 'docs/patterns.md', self: true, args: ['--input-type=module', '-e', "await (await import('./lib/distill.mjs')).renderLocal('.')"] },
  { path: 'docs/INBOX.md', self: true, args: ['--input-type=module', '-e', "await (await import('./lib/distill.mjs')).renderLocal('.')"] },
].map(Object.freeze));

/** The generated files this project declares, from its .plates/plates.json: GENERATORS filtered. */
export function generatedFiles(config, list = GENERATORS) {
  const milestones = milestoneSource(config);
  const on = new Set(config?.practices ?? []);
  const self = config?.plates === 'self';
  // The local roadmap and Loop triage page are inactive archives when GitHub owns the plan.
  return list.filter(g => (!g.self || self) && (!g.practice || on.has(g.practice))
    && !(['docs/ROADMAP.md', 'docs/LOOP.md'].includes(g.path) && milestones));
}

/** Never copied: git's own directory and installed packages. */
const SKIP = new Set(['.git', 'node_modules']);
/** Also never copied outside a git repository: common build output. */
const BUILD = ['target', 'dist', 'build', '.next'];

/**
 * What the probe leaves out of its copy of root: [path relative to root].
 * A build tree (a Rust target/ can run to tens of gigabytes) is not source, and
 * copying it once per generator can fill the disk. In a git repository that is
 * everything git ignores, asked of git; elsewhere a fixed list of build output.
 */
export function leftOut(root) {
  const r = spawnSync('git', ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ignored = !r.error && r.status === 0 ? r.stdout.split('\0').filter(Boolean).map(p => p.replace(/\/$/, '')) : BUILD;
  return [...SKIP, ...ignored];
}

/**
 * The copy filter for one generator: skips what leftOut names, except a path
 * the generator writes or reads (its file, its script, its declared `reads`)
 * or a directory holding one. Rotating test ledgers are never copied.
 */
function copyFilter(root, g, skip = leftOut(root)) {
  const needed = [g.path, ...(g.reads ?? []), ...g.args.filter(a => !a.startsWith('-') && !/\s/.test(a))]
    .map(p => p.split(sep).join('/').replace(/^\.\//, '').replace(/\/$/, ''));
  const out = new Set(skip.filter(p => !needed.some(n => n === p || n.startsWith(`${p}/`))));
  return src => {
    const path = relative(root, src).split(sep).join('/');
    // Nested fixture projects have their own rotating ledgers too. Exclude the
    // directory before cp enumerates it, not individual files after rotation.
    return !out.has(path) && path !== '.plates/test-runs' && !path.endsWith('/.plates/test-runs');
  };
}

const env = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST_')));

/**
 * One generator probed: copy root, append a marker line to g.path, run the
 * generator in the copy. Returns null when the marker is gone (for a
 * `refuses` entry: when the generator refused, naming the file, and kept the
 * edit), else the problem.
 */
export async function probe(root, g) {
  const tmp = await mkdtemp(join(tmpdir(), 'plates-generated-'));
  const dir = join(tmp, 'project');
  try {
    await cp(root, dir, { recursive: true, verbatimSymlinks: true, filter: copyFilter(root, g) });
    const file = join(dir, g.path);
    const marker = `<!-- plates generated-file probe ${Date.now().toString(36)}${Math.random().toString(36).slice(2)}: a hand edit, which the generator must not keep -->`;
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `\n${marker}\n`);
    const r = spawnSync(process.execPath, g.args, { cwd: dir, env: env(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60_000 });
    const command = `node ${g.args.map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`;
    const said = `${r.stderr ?? ''}${r.stdout ?? ''}`;
    if (g.refuses) {
      const kept = (await readFile(file, 'utf8').catch(() => '')).includes(marker);
      if (r.error) return `${g.path}: its renderer \`${command}\` did not run (${r.error.message})`;
      if (!kept) return `${g.path}: \`${command}\` overwrote a line appended to it; a managed file's edit is refused and named, never overwritten`;
      if (r.status === 0 || !said.includes(g.path)) return `${g.path}: \`${command}\` kept a line appended to it without refusing and naming the file (exit ${r.status})`;
      return null;
    }
    if (r.error || r.status !== 0) return `${g.path}: its generator \`${command}\` failed (${r.error?.message ?? `exit ${r.status}`}): ${said.trim().split('\n').slice(-3).join(' | ')}`;
    const after = await readFile(file, 'utf8').catch(() => '');
    return after.includes(marker) ? `${g.path}: a line appended to it survived \`${command}\`; its generator must rewrite it whole` : null;
  } finally { await rm(tmp, { recursive: true, force: true }); }
}

/** Every generated file under root probed: [problem]. */
export async function survivors(root, list) {
  const out = [];
  for (const g of list) { const p = await probe(root, g); if (p) out.push(p); }
  return out;
}

/** The project's .plates/plates.json, or {} when it has none. */
export async function projectConfig(root) {
  try { return JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8')); } catch { return {}; }
}
