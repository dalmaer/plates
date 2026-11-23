// plates eject: hand a project everything plates manages (plates phase 206).
//
//   plates eject --dry-run [--json]   the plan, read-only: nothing is written
//
// The plan has four parts:
//   files       every managed target (.plates/lock.json), every ejected one
//               (.plates/plates.json "ejected"), every seeded file of the
//               project's practices, and .plates/ itself, each with a fate:
//                 keep     the project's own from now on (plates markers go)
//                 drop     plates-only machinery, removed
//                 rewrite  kept, with the references to plates rewritten
//                 person   the code does not decide it; a person does
//   references  every reference to plates in a file the project keeps
//               (scripts/plates/…, .plates/…, npx plates, node_modules/plates,
//               bin/plates.mjs, a dropped managed file) with its rewrite, or
//               "needs a person"
//   jobs        every scheduled workflow, so the owner can choose which become
//               Unison Recurring tasks
//   refusals    what stops eject: uncommitted changes, a managed-looking file
//               the lock does not know, a kept file that needs a plates script
//               that is not there
//
// Fates come from what the code depends on, not only from the practice. A
// practice's default (FATES) holds until a kept file calls one of its files:
// then that file and every managed file it imports are kept (the import
// graph), and moved out of scripts/plates/ so no kept file names that path.
// A call that is not a dependency is rewritten instead:
//   - an `if [ -f scripts/plates/x ] … else <plain> fi` chain is its else;
//   - a block guarded by `practices.includes("p")` for a practice the project
//     does not have is dead, and goes;
//   - an upload-artifact step of `.plates/` output with if-no-files-found:
//     ignore uploads nothing once .plates/ is gone, and goes;
//   - a package.json test reporter from scripts/plates/ goes (the default
//     reporter stays), and an npm script that only runs a dropped managed
//     file goes, with its `npm run` in other scripts.
// Anything else that names .plates/ or the plates CLI needs a person.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync, readlinkSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { load, RETIRED, placed } from './practices.mjs';
import { guidePath, guideDestination } from './guide.mjs';

/** Each practice's fate by default; one not listed is a person's call. */
export const FATES = Object.freeze({
  night: 'drop', phases: 'drop', conduct: 'drop', evidence: 'drop', lessons: 'drop', ci: 'drop',
  climb: 'drop', loop: 'drop', reconciliation: 'drop', personas: 'drop', audits: 'drop', shaping: 'drop',
  'agents-md': 'keep', renovate: 'keep', base: 'keep',
});
// Settled on the first project that has them (phase 206, Deliberately open).
const OPEN = Object.freeze({ 'cross-review': 'cross-review survives eject or not: settled on the first project that has it', delivery: 'deploy-with-rollback survives eject or not: settled on the first project that has it' });
// Files whose fate differs from their practice's.
const OVERRIDES = [
  [/^\.agents\/skills\/plates(\/|$)|^\.claude\/skills\/plates$/, 'drop', 'the plates skill: it teaches plates'],
];
const PLATES_DIR = 'scripts/plates/';
const MANAGED_LOOKING = [/^scripts\/plates\//, /^\.github\/workflows\/plates-[^/]+\.ya?ml$/, /^\.agents\/skills\/(plates|spin|conduct)\//];
const SKIP_SWEEP = [/^docs\//, /^\.plates\//, /(^|\/)node_modules\//, /(^|\/)(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml)$/];
const SWEEP_LIMIT = 2 * 1024 * 1024;
const CODE = /\.(mjs|cjs|js|jsx|ts|tsx|mts|cts)$/;
const PLATES_CLI = /\bnpx\s+plates\b|node_modules\/plates\b|\bbin\/plates\.mjs\b|`plates\s+[a-z][a-z-]*/;

class EjectError extends Error { constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; } }
const clip = (s, n = 140) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const indentOf = line => line.match(/^\s*/)[0].length;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isComment = line => /^\s*(#|\/\/|\/\*|\*)/.test(line);
const scriptPaths = text => [...String(text).matchAll(/scripts\/plates\/[A-Za-z0-9._\/-]*[A-Za-z0-9_-]/g)].map(m => m[0]);
const dotPlates = text => /(^|[^A-Za-z0-9_.-])\.plates\//.test(text);
// A bare `plates <verb>` where a shell runs a command: a workflow or script line, or an npm script's value.
const SHELL_CLI = /(?:^\s*(?:-\s+)?(?:run:\s*)?|[;&|(]\s*)plates\s+[a-z][a-z-]*/;
const NPM_CLI = /^\s*"[^"]+":\s*"(?:[^"]*(?:&&|;|\|\|?)\s*)?plates\s+[a-z][a-z-]*/;
/** Where a kept file under scripts/plates/ goes, so no kept file names that path. */
export const movedTo = path => path.startsWith(PLATES_DIR) ? `scripts/${path.slice(PLATES_DIR.length)}` : path;

function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { throw new EjectError(`git ${args[0]} failed in ${root}: ${clip(error.stderr || error.message, 200)}`); }
}
const readJson = (root, path) => {
  let text;
  try { text = readFileSync(join(root, path), 'utf8'); } catch { return null; }
  try { return JSON.parse(text); } catch { throw new EjectError(`${path} is not JSON`); }
};
function readText(root, path) {
  try {
    const at = join(root, path), st = lstatSync(at);
    if (!st.isFile() || st.size > SWEEP_LIMIT) return null;
    const text = readFileSync(at, 'utf8');
    return text.includes('\0') ? null : text;
  } catch { return null; }
}

/** A tracked symlink's target as a repo path, or null when it is not a link or leaves the repo. */
function linkTarget(root, path) {
  try {
    if (!lstatSync(join(root, path)).isSymbolicLink()) return null;
    const to = readlinkSync(join(root, path));
    if (to.startsWith('/')) return null;
    const target = posix.normalize(posix.join(posix.dirname(path), to));
    return target.startsWith('..') ? null : target;
  } catch { return null; }
}

/** The steps of a GitHub workflow: { start, end, lines } (0-based, end exclusive), leading comments included. */
export function workflowSteps(text) {
  const lines = text.split('\n'), all = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)steps:\s*$/);
    if (!m) continue;
    const base = m[1].length, steps = [];
    let j = i + 1, item = -1, cur = null;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim() || isComment(line)) continue;
      const ind = indentOf(line);
      if (ind <= base) break;
      if (/^\s*- /.test(line) && (item < 0 || ind === item)) {
        item = ind;
        if (cur) cur.end = j;
        cur = { start: j, end: j + 1 };
        steps.push(cur);
      }
    }
    if (cur) {
      let e = j;
      while (e - 1 > cur.start && (!lines[e - 1].trim() || (isComment(lines[e - 1]) && indentOf(lines[e - 1]) <= base))) e--;
      cur.end = e;
    }
    // Comments just above a step belong to it, not to the step before.
    for (let k = 1; k < steps.length; k++) {
      let s = steps[k].start;
      while (s - 1 > steps[k - 1].start && (isComment(lines[s - 1]) || !lines[s - 1].trim())) s--;
      while (s < steps[k].start && !lines[s].trim()) s++;
      steps[k - 1].end = s; steps[k].start = s;
    }
    all.push(...steps);
    i = j - 1;
  }
  return all.map(s => ({ ...s, lines: lines.slice(s.start, s.end) }));
}

/** A step's `run` body: [{ n, text }] (n is the 0-based line in the file), or []. */
function runBody(lines, step) {
  for (let i = step.start; i < step.end; i++) {
    const m = lines[i].match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].length + (lines[i].trimStart().startsWith('- ') ? 2 : 0);
    if (!/^[|>]/.test(m[2])) return [{ n: i, text: m[2] }];
    const body = [];
    for (let j = i + 1; j < step.end; j++) {
      if (lines[j].trim() && indentOf(lines[j]) <= key) break;
      body.push({ n: j, text: lines[j] });
    }
    return body;
  }
  return [];
}

/** if/elif/else/fi blocks in a shell body: [{ from, to, arms: [{ guard, lines }] }] (indexes into body). */
function shellIfs(body) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    if (!/^\s*if\s/.test(body[i].text)) continue;
    let depth = 0, arm = { guard: body[i].text.trim(), lines: [] }, arms = [arm], to = -1;
    for (let j = i + 1; j < body.length; j++) {
      const t = body[j].text.trim();
      if (/^if\s/.test(t)) depth++;
      if (t === 'fi' || /^fi\b/.test(t)) { if (depth === 0) { to = j; break; } depth--; }
      if (depth === 0 && (/^elif\s/.test(t) || t === 'else')) { arm = { guard: t, lines: [] }; arms.push(arm); continue; }
      arm.lines.push(body[j]);
    }
    if (to < 0) continue;
    out.push({ from: i, to, arms });
    i = to;
  }
  return out;
}

const fileGuard = guard => guard.match(/^(?:if|elif)\s+\[\s+-f\s+(\S+)\s+\];\s*then$/)?.[1];
// Only the exact positive guard plates writes: `if node -e '…process.exit(c.practices.includes("p")?0:1)'; then`.
// A negated or compound guard goes through the ordinary reference scan.
const practiceGuard = guard => {
  const js = guard.match(/^if node -e '([^']*)'; then$/)?.[1];
  if (!js || /!\s*c\.practices|&&|\|\|/.test(js)) return undefined;
  if ([...js.matchAll(/c\.practices\.includes\(/g)].length !== 1) return undefined;
  return js.match(/process\.exit\(\s*c\.practices\.includes\(\s*["']([a-z0-9-]+)["']\s*\)\s*\?\s*0\s*:\s*1\s*\)/)?.[1];
};
/** Every value of a step's `path:`, a scalar or a block-scalar list. */
export function artifactPaths(stepLines) {
  for (let i = 0; i < stepLines.length; i++) {
    const m = stepLines[i].match(/^(\s*)path:[ \t]*(.*)$/);
    if (!m) continue;
    const value = m[2].trim();
    if (value && !/^[|>][-+]?$/.test(value)) return [value.replace(/^["']|["']$/g, '')];
    const out = [];
    for (let j = i + 1; j < stepLines.length; j++) {
      if (stepLines[j].trim() && indentOf(stepLines[j]) <= m[1].length) break;
      const v = stepLines[j].trim().replace(/^-\s+/, '');
      if (v && !v.startsWith('#')) out.push(v);
    }
    return out;
  }
  return [];
}
const anyPlates = text => scriptPaths(text).length > 0 || dotPlates(text) || PLATES_CLI.test(text);

/** The rewrites a workflow's steps call for, and the lines they cover. */
function workflowRewrites(path, text, practices) {
  const lines = text.split('\n'), rewrites = [], covered = new Set(), empties = [];
  for (const step of workflowSteps(text)) {
    const name = step.lines.map(l => l.match(/^\s*(?:- )?name:\s*(.+)$/)?.[1]).find(Boolean) ?? `step at line ${step.start + 1}`;
    const all = step.lines.join('\n');
    if (!anyPlates(all)) continue;
    const uses = all.match(/^\s*(?:- )?uses:\s*(\S+)/m)?.[1] ?? '';
    const paths = /^actions\/upload-artifact@/.test(uses) ? artifactPaths(step.lines) : [];
    const ours = paths.filter(p => p.startsWith('.plates/'));
    const artifact = paths.join(', ');
    if (ours.length && ours.length < paths.length) {
      rewrites.push({ path, line: step.start + 1, kind: 'step', text: clip(name), rewrite: null, targets: ours, needsPerson: `uploads ${ours.join(', ')} beside ${paths.filter(p => !p.startsWith('.plates/')).join(', ')}: remove only the .plates/ entries by hand` });
      for (let i = step.start; i < step.end; i++) covered.add(i);
      continue;
    }
    if (paths.length && ours.length === paths.length && /if-no-files-found:\s*ignore/.test(all)) {
      rewrites.push({ path, line: step.start + 1, kind: 'step', text: clip(name), rewrite: `drop the step: it keeps ${artifact} only, and with .plates/ gone it uploads nothing`, targets: [artifact], edit: { op: 'delete', from: step.start, to: step.end } });
      for (let i = step.start; i < step.end; i++) covered.add(i);
      continue;
    }
    const body = runBody(lines, step);
    const deleted = new Set(), kept = [];
    for (const block of shellIfs(body)) {
      const lineNos = body.slice(block.from, block.to + 1).map(b => b.n);
      const targets = [...new Set(lineNos.flatMap(n => scriptPaths(lines[n])))];
      const practice = practiceGuard(block.arms[0].guard);
      if (practice && !practices.includes(practice) && block.arms.length === 1) {
        rewrites.push({ path, line: body[block.from].n + 1, kind: 'dead-block', text: clip(name), rewrite: `remove lines ${body[block.from].n + 1}-${body[block.to].n + 1}: that block runs only with the ${practice} practice, which this project does not have`, targets, edit: { op: 'delete', from: body[block.from].n, to: body[block.to].n + 1 } });
        lineNos.forEach(n => { covered.add(n); deleted.add(n); });
        continue;
      }
      const last = block.arms.at(-1);
      const guarded = block.arms.slice(0, -1);
      if (last.guard === 'else' && guarded.length && guarded.every(a => fileGuard(a.guard)?.startsWith(PLATES_DIR)) && !anyPlates(last.lines.map(l => l.text).join('\n'))) {
        // The plain branch, byte for byte: only the indentation it shares beyond the `if` goes, so a
        // heredoc or a Python body keeps its shape. A branch that cannot be dedented that way is a person's.
        const replacement = dedentTo(last.lines.map(l => l.text), lines[body[block.from].n].match(/^[ \t]*/)[0]);
        if (!replacement) {
          rewrites.push({ path, line: body[block.from].n + 1, kind: 'guarded-call', text: clip(name), rewrite: null, targets, needsPerson: 'the plain branch mixes tabs and spaces, or is less indented than itself: lift it out of the if by hand' });
          lineNos.forEach(n => covered.add(n));
          kept.push('(a person rewrites it)');
          continue;
        }
        const plain = replacement.filter(l => l.trim());
        const edit = { op: 'replace', from: body[block.from].n, to: body[block.to].n + 1, lines: replacement };
        const results = last.lines.filter(l => l.text.trim()).map(l => ({ line: l.n + 1, text: l.text }));
        rewrites.push({ path, line: body[block.from].n + 1, kind: 'guarded-call', text: clip(name), rewrite: `replace lines ${body[block.from].n + 1}-${body[block.to].n + 1} with their plain branch, byte for byte:\n${replacement.join('\n')}`, targets, results, lines: replacement, edit });
        // The guards go; the plain branch's own lines stay, so the sweep reads them like any kept line.
        const stays = new Set(last.lines.map(l => l.n));
        lineNos.forEach(n => { if (!stays.has(n)) covered.add(n); });
        kept.push(...plain.filter(l => !isComment(l.trim())));
      }
    }
    // What still runs: live lines no rewrite touches, and the commands of each plain branch.
    const live = body.filter(b => b.text.trim() && !isComment(b.text));
    const runs = live.filter(b => !covered.has(b.n)).length + kept.length;
    // A step whose only live lines were dead blocks has nothing to do: the plan drops it.
    if (deleted.size && live.every(b => deleted.has(b.n))) {
      const last = rewrites.at(-1);
      last.rewrite = `drop the step: ${last.rewrite.replace(/^remove lines \d+-\d+: that block/, 'it')}`;
      last.line = step.start + 1;
      last.kind = 'step';
      last.edit = { op: 'delete', from: step.start, to: step.end };
      for (let i = step.start; i < step.end; i++) covered.add(i);
    } else if (body.length && live.length && !runs) empties.push({ path, line: step.start + 1, name });
  }
  return { rewrites, covered, empties };
}

/**
 * Lines re-indented to `pad`: the indentation every non-blank line shares is replaced by `pad`, and
 * everything after it (relative indentation, blank lines) stays byte for byte. null when the lines
 * mix tabs and spaces in their indentation or do not all start with that shared indentation.
 */
export function dedentTo(lines, pad) {
  const filled = lines.filter(l => l.trim());
  if (!filled.length) return lines.slice();
  const leads = filled.map(l => l.match(/^[ \t]*/)[0]);
  if (leads.some(w => w.includes(' ')) && leads.some(w => w.includes('\t'))) return null;
  const common = leads.reduce((a, b) => a.length <= b.length ? a : b);
  if (filled.some(l => !l.startsWith(common))) return null;
  return lines.map(l => l.trim() ? pad + l.slice(common.length) : l);
}

/** Literal paths a module reads relative to its own location: new URL('…', import.meta.url), join/resolve(__dirname, '…'). */
export function resourcesOf(text) {
  const out = new Set();
  for (const m of text.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) if (!/^[a-z]+:/i.test(m[1])) out.add(m[1]);
  for (const m of text.matchAll(/\b(?:join|resolve)\(\s*(?:__dirname|import\.meta\.dirname)\s*,\s*((?:['"][^'"]*['"]\s*,?\s*)+)\)/g)) {
    out.add(posix.join(...[...m[1].matchAll(/['"]([^'"]*)['"]/g)].map(x => x[1])));
  }
  return [...out];
}

/** Relative import specifiers of a JS/TS module: import, export … from, import() and require(). */
export function importsOf(text) {
  const out = new Set();
  for (const re of [/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g, /\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g, /\bimport\s+['"](\.{1,2}\/[^'"]+)['"]/g, /\brequire\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g]) {
    for (const m of text.matchAll(re)) out.add(m[1]);
  }
  return [...out];
}

/** The plan, read-only. root is the project's checkout. */
export async function planEject({ root, practicesDir, keepPhases = false } = {}) {
  const config = readJson(root, '.plates/plates.json');
  if (!config) throw new EjectError('no .plates/plates.json here: plates eject runs in a project plates manages');
  const lock = readJson(root, '.plates/lock.json');
  if (!lock || typeof lock.files !== 'object' || !lock.files) throw new EjectError('no .plates/lock.json with "files": which files plates manages cannot be told, so nothing can be planned');
  if (git(root, ['rev-parse', '--is-inside-work-tree']).trim() !== 'true') throw new EjectError(`${root} is not a Git checkout`);
  const known = await load(practicesDir);
  const practices = Array.isArray(config.practices) ? config.practices : [];
  const tracked = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  const trackedSet = new Set(tracked);
  const dirty = git(root, ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0').filter(Boolean);
  const refusals = [], references = [], files = [];
  if (dirty.length) refusals.push({ code: 'uncommitted', detail: `${dirty.length} uncommitted change${dirty.length === 1 ? '' : 's'} (${dirty.slice(0, 3).map(d => d.slice(3)).join(', ')}${dirty.length > 3 ? ', …' : ''}): eject plans from a clean tree` });

  // An open phase not yet carried elsewhere would be stranded: refuse, unless the owner keeps them as history.
  const open = openPhases(root, tracked);
  if (open.length && !keepPhases) refusals.push({ code: 'open-phases', detail: `${open.length} open phase${open.length === 1 ? '' : 's'} (${open.slice(0, 4).map(p => `${p.file} ${p.status}`).join(', ')}${open.length > 4 ? ', …' : ''}): import them into Unison first (phase 205), or pass --keep-phases to keep the phase files as history` });
  const destinationOf = path => { try { return guideDestination(root, path); } catch { return path; } };

  // 1. Every managed target, with its practice's fate.
  const byPath = new Map();
  for (const [key, entry] of Object.entries(lock.files)) {
    const hash = key.lastIndexOf('#');
    const block = hash > 0 && !key.slice(hash).includes('/') ? key.slice(hash + 1) : undefined;
    const path = block ? key.slice(0, hash) : key;
    const practice = entry?.practice ?? null;
    let st = null;
    try { st = lstatSync(join(root, path)); } catch {}
    const row = { path, ...(block ? { block } : {}), practice, kind: block ? 'block' : st?.isSymbolicLink() ? 'link' : 'file', ...(st ? {} : { missing: true }) };
    const override = !block && OVERRIDES.find(([re]) => re.test(path));
    if (!practice || (!known.has(practice) && !RETIRED.has(practice))) {
      Object.assign(row, { fate: 'person', reason: `practice ${practice ?? '(none)'} is not one plates knows` });
      refusals.push({ code: 'unknown-managed', path: key, detail: `${key}: the lock names practice ${practice ?? '(none)'}, which plates does not know; its fate cannot be told` });
    } else if (override) Object.assign(row, { fate: override[1], reason: override[2] });
    else if (RETIRED.has(practice)) Object.assign(row, { fate: 'keep', reason: `retired practice: ${RETIRED.get(practice)}` });
    else if (OPEN[practice]) Object.assign(row, { fate: 'person', reason: OPEN[practice] });
    else if (FATES[practice]) Object.assign(row, { fate: FATES[practice], reason: FATES[practice] === 'drop' ? `plates-only (${practice})` : `the project's own (${practice})` });
    else Object.assign(row, { fate: 'person', reason: `no default for practice ${practice}` });
    if (block) row.reason = row.fate === 'drop' ? `section removed from ${path}` : row.fate === 'keep' ? `section stays in ${path}, plates markers removed` : row.reason;
    const runtime = practices.some(p => (known.get(p)?.runtimeFiles ?? []).some(r => r.practice === practice && r.path === path));
    if (practice && known.has(practice) && !practices.includes(practice) && !runtime) {
      refusals.push({ code: 'unknown-managed', path: key, detail: `${key}: the lock says practice ${practice}, which .plates/plates.json does not list` });
    }
    // A section in an aliased guide (AGENTS.md → docs/team.md) lives at the alias's destination.
    if (block) { const at = destinationOf(path); if (at !== path) Object.assign(row, { path: at, alias: path }); }
    files.push(row);
    if (!block) byPath.set(path, row);
  }
  // Already the project's: ejected targets, and seeded files of its practices.
  const ejected = Array.isArray(config.ejected) ? config.ejected : [];
  for (const key of ejected) {
    const hash = key.lastIndexOf('#');
    const block = hash > 0 ? key.slice(hash + 1) : undefined;
    const path = block ? key.slice(0, hash) : key;
    const owner = [...known.values()].find(p => p.files.some(f => f.path === path && (block ? f.block === block : f.kind !== 'block')))?.name ?? null;
    const row = { path, ...(block ? { block } : {}), practice: owner, kind: 'ejected', fate: 'keep', reason: 'already the project\'s (ejected)', ...(existsSync(join(root, path)) ? {} : { missing: true }) };
    files.push(row);
    if (!block) byPath.set(path, row);
  }
  for (const name of practices) {
    for (const f of known.get(name)?.files ?? []) {
      if (f.kind !== 'seeded' || f.when) continue;
      let where;
      try { where = placed(f, config).path; } catch { where = f.path; }
      if (byPath.has(where) || !existsSync(join(root, where))) continue;
      const row = { path: where, practice: name, kind: 'seeded', fate: 'keep', reason: 'seeded: already the project\'s' };
      files.push(row); byPath.set(where, row);
    }
  }
  // A file that looks like plates's but the lock does not know.
  for (const path of tracked) {
    if (byPath.has(path) || ![...byPath.keys()].every(p => !path.startsWith(`${p}/`))) continue;
    if (MANAGED_LOOKING.some(re => re.test(path))) {
      files.push({ path, practice: null, kind: 'file', fate: 'person', reason: 'looks like plates\'s, but the lock does not name it' });
      refusals.push({ code: 'unknown-managed', path, detail: `${path} looks like a plates file, but .plates/lock.json does not name it: its fate cannot be told` });
    }
  }

  // 2. Sweep what the project keeps; a kept call to a managed file keeps that file.
  const dropped = path => {
    const row = byPath.get(path);
    if (row) return row.fate === 'drop';
    return [...byPath.values()].some(r => r.fate === 'drop' && r.kind === 'link' && path.startsWith(`${r.path}/`));
  };
  // The selected guide is swept wherever it lives, docs/ included, like a root AGENTS.md.
  const guide = destinationOf(guidePath(config));
  const kept = path => (path === guide || !SKIP_SWEEP.some(re => re.test(path))) && !dropped(path);
  const neededBy = new Map();
  const need = (target, by, line) => {
    if (!neededBy.has(target)) neededBy.set(target, []);
    if (!neededBy.get(target).includes(by)) neededBy.get(target).push(by);
    if (!existsSync(join(root, target))) refusals.push({ code: 'missing-script', path: target, detail: `${by}${line ? `:${line}` : ''} needs ${target}, which is not in the checkout` });
  };
  const removedScripts = [], removedTargets = [], imports = [], links = [];
  let droppedManaged = [...byPath.values()].filter(r => r.fate === 'drop' && r.kind === 'file' && !r.path.startsWith(PLATES_DIR)).map(r => r.path);
  const sweep = (path, text) => {
    const isMd = /\.md$/i.test(path), isWorkflow = /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path);
    let shown = text;
    if (path === guide || /(^|\/)AGENTS\.md$/.test(path)) {
      shown = text.replace(/<!-- plates:begin ([a-z0-9-]+) -->([\s\S]*?)<!-- plates:end \1 -->/g, (all, id, body) => {
        const row = files.find(r => r.path === path && r.block === id);
        return row?.fate === 'drop' ? all.replace(/[^\n]/g, '') : `${all.match(/^[^\n]*/)[0].replace(/./g, '')}${body}`;
      });
    }
    const covered = new Set();
    // plates's own words in a kept section (a paragraph naming .plates/ or the plates CLI) go with plates.
    for (const b of blocksOf(text.split('\n'))) {
      if (files.find(r => r.path === path && r.block === b.id)?.fate !== 'keep') continue;
      const blines = text.split('\n');
      let from = b.begin + 1;
      for (let i = b.begin + 1; i <= b.end; i++) {
        if (i < b.end && blines[i].trim()) continue;
        const para = blines.slice(from, i);
        if (para.some(l => dotPlates(l) || PLATES_CLI.test(l))) {
          references.push({ path, line: from + 1, kind: 'plates-text', text: clip(para.join(' ')), targets: ['.plates/'], rewrite: `drop plates's own paragraph from the kept ${b.id} section`, edit: { op: 'delete', from, to: i } });
          for (let k = from; k < i; k++) covered.add(k);
        }
        from = i + 1;
      }
    }
    if (isWorkflow) {
      const w = workflowRewrites(path, shown, practices);
      references.push(...w.rewrites);
      for (const e of w.empties) refusals.push({ code: 'empty-step', path: e.path, detail: `${e.path}:${e.line} step "${e.name}" would be left with no command to run; rewrite it by hand` });
      w.covered.forEach(n => covered.add(n));
    }
    if (path === 'package.json') packageRewrites(path, shown, covered);
    const lines = shown.split('\n'), isShell = isWorkflow || /\.(sh|bash)$/.test(path);
    let fenced = false;
    lines.forEach((line, n) => {
      if (isMd && /^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (covered.has(n)) return;
      // A kept file that still names an npm script eject removes.
      const removed = path !== 'package.json' && removedScripts.find(g => new RegExp(`npm run ${escape(g)}(?![\\w:-])`).test(line));
      if (removed) {
        const alone = isMd && fenced && new RegExp(`^\\s*npm run ${escape(removed)}(?![\\w:-])(\\s+--(\\s+[^#]*)?)?\\s*(#.*)?$`).test(line);
        references.push({ path, line: n + 1, text: clip(line), kind: 'npm-run', targets: [`npm run ${removed}`], ...(alone ? { rewrite: `delete the line: eject removes npm run ${removed}`, edit: { op: 'delete', from: n, to: n + 1 } } : { rewrite: null, needsPerson: `names npm run ${removed}, which eject removes: reword or drop` }) });
        if (alone) return;
      }
      const targets = [...new Set(scriptPaths(line))];
      const prose = isMd || isComment(line);
      const at = { path, line: n + 1, text: clip(line) };
      for (const t of targets) {
        if (prose) references.push({ ...at, kind: 'prose', targets: [t], rewrite: null, needsPerson: `names ${t} in prose: reword or drop` });
        else { need(t, path, n + 1); references.push({ ...at, kind: 'call', targets: [t], rewrite: `${t} → ${movedTo(t)} (kept: this file calls it)`, results: [{ line: n + 1, text: line.split(t).join(movedTo(t)) }], edit: { op: 'move', line: n, target: t } }); }
      }
      for (const dead of droppedManaged.filter(p => line.includes(p))) {
        if (prose) references.push({ ...at, kind: 'prose', targets: [dead], rewrite: null, needsPerson: `names ${dead}, which eject drops: reword or drop` });
        else { need(dead, path, n + 1); references.push({ ...at, kind: 'call', targets: [dead], rewrite: `none: ${dead} is kept, since this file calls it` }); }
      }
      if (dotPlates(line)) references.push({ ...at, kind: prose ? 'prose' : 'config', targets: ['.plates/'], rewrite: null, needsPerson: 'names .plates/, which eject removes' });
      else if (PLATES_CLI.test(line)) references.push({ ...at, kind: prose ? 'prose' : 'cli', targets: [line.match(PLATES_CLI)[0].replace(/^`/, '')], rewrite: null, needsPerson: 'calls the plates CLI, which the project will not have' });
      else if (!prose && ((isShell && SHELL_CLI.test(line)) || (path === 'package.json' && NPM_CLI.test(line)))) {
        references.push({ ...at, kind: 'cli', targets: [line.match(/plates\s+[a-z][a-z-]*/)[0]], rewrite: null, needsPerson: 'calls the plates CLI, which the project will not have' });
      }
    });
    if (CODE.test(path)) {
      imports.push({ path, text });
      for (const spec of importsOf(text)) {
        const { target, unresolved } = resolveSpec(path, spec);
        if (unresolved && (target.startsWith(PLATES_DIR) || [...byPath.keys()].some(k => k.startsWith(`${target}/`) || k.startsWith(`${target}.`)))) {
          references.push({ path, line: null, kind: 'import', text: spec, targets: [target], rewrite: null, needsPerson: `imports ${spec}, which does not resolve to one file plates managed: check it by hand` });
          continue;
        }
        if (byPath.get(target)?.fate === 'drop' || (target.startsWith(PLATES_DIR) && byPath.has(target))) need(target, path);
      }
      // A resource it reads beside itself (new URL('./x', import.meta.url), join(__dirname, 'x')) is kept, and moves with it.
      for (const rel of resourcesOf(text)) {
        const target = posix.normalize(posix.join(posix.dirname(path), rel));
        if (byPath.get(target)?.fate === 'drop') need(target, path);
      }
    }
  };
  const packageRewrites = (path, text, covered) => {
    let pkg;
    try { pkg = JSON.parse(text); } catch { return; }
    const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
    const lines = text.split('\n');
    const lineOf = name => lines.findIndex(l => l.trimStart().startsWith(`${JSON.stringify(name)}:`));
    const gone = removedScripts, reported = new Set();
    for (const [name, cmd] of Object.entries(scripts)) {
      if (typeof cmd !== 'string') continue;
      const n = lineOf(name);
      const reporter = /\s*--test-reporter=(\S*scripts\/plates\/\S+)(\s+--test-reporter-destination=\S+)?/g;
      if (reporter.test(cmd)) {
        reported.add(name);
        const after = cmd.replace(reporter, '');
        const left = after;
        references.push({ path, line: n + 1, kind: 'reporter', text: clip(`"${name}": ${cmd}`), targets: scriptPaths(cmd).filter(t => !scriptPaths(left).includes(t)), rewrite: `"${name}": "${left}" (plates's test reporter goes; node's own stays)`, results: [{ line: n + 1, text: left }], edit: { op: 'script', name, value: left } });
        if (n >= 0) covered.add(n);
        // What the rewritten command still calls is a dependency, or a person's call, like any other script's.
        for (const t of new Set(scriptPaths(left))) { need(t, path, n + 1); references.push({ path, line: n + 1, kind: 'call', text: clip(`"${name}": ${left}`), targets: [t], rewrite: `${t} → ${movedTo(t)} (kept: this script calls it)` }); }
        const dead = [...left.matchAll(/\bnode\s+(\S+\.m?js)\b/g)].map(m => m[1]).filter(f => !f.startsWith(PLATES_DIR) && byPath.get(f)?.fate === 'drop');
        if (dead.length) references.push({ path, line: n + 1, kind: 'npm-script', text: clip(`"${name}": ${left}`), targets: dead, rewrite: null, needsPerson: `runs ${dead.join(', ')}, which eject drops, beside the test reporter: cut it out by hand` });
        continue;
      }
      // Removed whole only when the script is exactly one `node <dropped file> [--flags]`; a compound one is a person's call.
      const calls = [...cmd.matchAll(/\bnode\s+(\S+\.m?js)\b/g)].map(m => m[1]).filter(f => !f.startsWith(PLATES_DIR) && byPath.get(f)?.fate === 'drop');
      const runs = cmd.match(/^node\s+(\S+\.m?js)(\s+--?[A-Za-z0-9][A-Za-z0-9-]*)*$/)?.[1];
      if (calls.length && !(runs && calls.length === 1 && calls[0] === runs)) {
        references.push({ path, line: n + 1, kind: 'npm-script', text: clip(`"${name}": ${cmd}`), targets: calls, rewrite: null, needsPerson: `runs ${calls.join(', ')}, which eject drops, inside a compound command: cut it out by hand` });
        if (n >= 0) covered.add(n);
        continue;
      }
      // A script under scripts/plates/ is a dependency (kept, like a workflow's); another dropped file takes its npm script with it.
      if (runs && !runs.startsWith(PLATES_DIR) && byPath.get(runs)?.fate === 'drop') {
        if (['check', 'test'].includes(name)) { refusals.push({ code: 'empty-script', path, detail: `package.json "${name}" only runs ${runs}, which eject drops: the project would have no ${name}; give it one first` }); if (n >= 0) covered.add(n); continue; }
        gone.push(name);
        removedTargets.push(runs);
        references.push({ path, line: n + 1, kind: 'npm-script', text: clip(`"${name}": ${cmd}`), targets: [runs], rewrite: `remove "${name}": it runs ${runs}, which eject drops (${byPath.get(runs).practice})`, edit: { op: 'script', name, value: null } });
        if (n >= 0) covered.add(n);
      }
    }
    for (const [name, cmd] of Object.entries(scripts)) {
      // A script whose reporter is rewritten is read once, through that rewrite (the recheck reads what is left).
      if (typeof cmd !== 'string' || gone.includes(name) || reported.has(name)) continue;
      const uses = gone.filter(g => new RegExp(`npm run ${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w:-])`).test(cmd));
      if (!uses.length) continue;
      let after = cmd;
      for (const g of uses) {
        const e = escape(g), call = `npm run ${e}(?![\\w:-])(?:\\s+--(?:\\s+[^&|;]*?)?)?`;
        after = after.replace(new RegExp(`\\s*&&\\s*${call}(?=\\s*(?:&&|$))`), '').replace(new RegExp(`^${call}\\s*&&\\s*`), '');
      }
      // Anything left of a removed invocation (an `||`, a pipe, a stray argument) is not cut out safely.
      if (uses.length === 1 && new RegExp(`^npm run ${escape(uses[0])}(?![\\w:-])(?:\\s+--(?:\\s+[^&|;]*?)?)?$`).test(cmd.trim())) after = '';
      if (uses.some(g => new RegExp(`npm run ${escape(g)}(?![\\w:-])`).test(after))) after = cmd;
      if (!after.trim() && ['check', 'test'].includes(name)) { refusals.push({ code: 'empty-script', path, detail: `package.json "${name}" would be left empty once ${uses.join(', ')} goes: give it a command first` }); continue; }
      if (!after.trim()) after = cmd;
      const n = lineOf(name);
      references.push({ path, line: n + 1, kind: 'npm-script', text: clip(`"${name}": ${cmd}`), targets: uses.map(g => `npm run ${g}`), rewrite: after === cmd ? null : `"${name}": "${after}"`, ...(after === cmd ? { needsPerson: `runs ${uses.join(', ')}, which eject removes, in a way that cannot be cut out safely` } : { results: [{ line: n + 1, text: after }], edit: { op: 'script', name, value: after } }) });
    }
  };
  const resolveSpec = (from, spec) => {
    const base = posix.normalize(posix.join(posix.dirname(from), spec));
    for (const suffix of ['', '.js', '.cjs', '.mjs', '.json', '/index.js', '/index.cjs', '/index.mjs', '/index.json']) {
      const target = base + suffix;
      if (trackedSet.has(target) || byPath.has(target)) return { target, suffix };
    }
    return { target: base, suffix: '', unresolved: true };
  };
  const marks = { references: references.length, refusals: refusals.length };
  // What a planned rewrite leaves behind is read again: a dropped file it still calls is kept (and the
  // sweep runs again); a removed npm script, .plates/ or an unmoved scripts/plates/ path needs a person.
  const recheck = ({ keep }) => {
    let changed = false;
    const refs = [];
    const said = new Set(references.map(r => `${r.path}:${r.line}:${(r.targets ?? []).join(',')}`));
    for (const ref of [...references]) for (const r of ref.results ?? []) {
      const prose = /\.md$/i.test(ref.path) || isComment(r.text);
      const hit = (target, why) => {
        const key = `${ref.path}:${r.line}:${target}`;
        if (said.has(key)) return;
        said.add(key);
        refs.push({ path: ref.path, line: r.line, kind: 'recheck', text: clip(r.text), targets: [target], rewrite: null, needsPerson: `the planned rewrite still ${why}: fix it by hand` });
      };
      for (const row of byPath.values()) {
        if (row.fate !== 'drop' || row.kind !== 'file' || !r.text.includes(row.path)) continue;
        if (keep && !prose) { row.fate = 'keep'; row.reason = `needed by ${ref.path} (a planned rewrite calls it)`; changed = true; }
        else if (!keep) hit(row.path, `names ${row.path}, which eject drops`);
      }
      if (keep) continue;
      for (const g of removedScripts) if (new RegExp(`npm run ${escape(g)}(?![\\w:-])`).test(r.text)) hit(`npm run ${g}`, `runs npm run ${g}, which eject removes`);
      if (dotPlates(r.text)) hit('.plates/', 'names .plates/, which eject removes');
      for (const t of scriptPaths(r.text)) if (!byPath.get(t)?.to) hit(t, `names ${t}, which does not move out of scripts/plates/`);
    }
    return { changed, refs };
  };
  for (let pass = 0; ; pass++) {
  const swept = new Set();
  // package.json first: which npm scripts eject removes is known before other files name them.
  const queue = tracked.filter(kept).sort((a, b) => (b === 'package.json') - (a === 'package.json'));
  while (queue.length) {
    const path = queue.shift();
    if (swept.has(path)) continue;
    swept.add(path);
    const text = readText(root, path);
    if (text !== null) sweep(path, text);
    else {
      const target = linkTarget(root, path);
      if (target && byPath.has(target) && !byPath.get(target).block) { need(target, path); links.push({ path, target }); }
    }
    // A newly needed managed file is kept: sweep it, and walk its imports.
    for (const target of neededBy.keys()) {
      const row = byPath.get(target);
      if (row && row.fate === 'drop') {
        row.fate = 'keep';
        row.reason = `needed by ${neededBy.get(target).join(', ')}`;
        const twin = target.replace(/\.mjs$/, '.d.mts');
        if (twin !== target && byPath.get(twin)?.fate === 'drop') { byPath.get(twin).fate = 'keep'; byPath.get(twin).reason = `types for ${target}`; }
      }
      if (row && !swept.has(target) && trackedSet.has(target)) queue.push(target);
    }
  }
  // A script was removed for running a file the closure then kept, or a planned result calls a dropped
  // file: sweep again with the fates now final.
  const stale = removedTargets.some(t => byPath.get(t)?.fate !== 'drop');
  const keptByResult = recheck({ keep: true }).changed;
  if ((!stale && !keptByResult) || pass >= 4) break;
  references.length = marks.references; refusals.length = marks.refusals;
  removedScripts.length = 0; removedTargets.length = 0; imports.length = 0; links.length = 0; neededBy.clear();
  droppedManaged = [...byPath.values()].filter(r => r.fate === 'drop' && r.kind === 'file' && !r.path.startsWith(PLATES_DIR)).map(r => r.path);
  }
  for (const [target, by] of neededBy) {
    const row = byPath.get(target);
    if (!row) continue;
    row.neededBy = by;
  }
  // A kept file under scripts/plates/ moves, so no kept file names that path.
  const keptPaths = new Set(files.filter(r => r.fate !== 'drop' && !r.block).map(r => r.path));
  for (const row of files) {
    if (row.block || row.fate === 'drop' || !row.path.startsWith(PLATES_DIR)) continue;
    const to = movedTo(row.path);
    if (existsSync(join(root, to)) && !dropped(to)) { row.fate = 'person'; row.reason += `; moving it to ${to} would overwrite the project's file`; continue; }
    row.to = to;
    const own = readText(root, row.path) ?? '';
    // Any file that finds paths from its own location: the move may change them (siblings it names move with it).
    if (/import\.meta\b|__dirname|__filename|\brootOf\b/.test(own)) {
      references.push({ path: row.path, line: null, kind: 'location', text: row.path, targets: [row.path], rewrite: null, needsPerson: `finds paths from its own location (import.meta, __dirname or __filename): moving it to ${to} may change them; check each by hand` });
    }
  }
  for (const { path, target } of links) {
    const row = byPath.get(target);
    if (row?.to) refusals.push({ code: 'link-to-moved', path, detail: `${path} is a symlink to ${target}, which eject would move to ${row.to}: the link would dangle; repoint or remove it first` });
    else references.push({ path, line: null, kind: 'link', text: `${path} → ${target}`, targets: [target], rewrite: null, needsPerson: `a symlink to ${target}, which plates managed: it is kept, so the link stays whole; decide whether the project wants it` });
  }
  // A relative import whose importer or target moves is rewritten from the importer's new place.
  const finalPath = path => byPath.get(path)?.to ?? path;
  for (const { path, text } of imports) {
    if (byPath.get(path)?.fate === 'drop') continue;
    const lines = text.split('\n');
    for (const spec of importsOf(text)) {
      const { target, suffix, unresolved } = resolveSpec(path, spec);
      if (unresolved || (finalPath(target) === target && finalPath(path) === path)) continue;
      let next = posix.relative(posix.dirname(finalPath(path)), finalPath(target));
      // The specifier keeps its own form: extensionless stays extensionless, a directory stays a directory.
      if (suffix && next.endsWith(suffix)) next = next.slice(0, -suffix.length);
      if (!next.startsWith('.')) next = `./${next}`;
      if (next === spec) continue;
      lines.forEach((line, n) => {
        if (!line.includes(`'${spec}'`) && !line.includes(`"${spec}"`)) return;
        references.push({ path, line: n + 1, kind: 'import', text: clip(line), targets: [target], rewrite: `import '${spec}' → '${next}' (${target} → ${finalPath(target)})`, results: [{ line: n + 1, text: line.split(`'${spec}'`).join(`'${next}'`).split(`"${spec}"`).join(`"${next}"`) }], edit: { op: 'import', line: n, from: spec, to: next } });
      });
    }
  }
  references.push(...recheck({ keep: false }).refs);
  // A kept file with a rewrite to make is "rewrite".
  const rewritten = new Set(references.filter(r => r.rewrite).map(r => r.path));
  for (const row of files) if (!row.block && row.fate === 'keep' && rewritten.has(row.path)) { row.fate = 'rewrite'; row.reason += '; its references to plates are rewritten (below)'; }
  files.push({ path: '.plates/', practice: null, kind: 'directory', fate: 'drop', reason: 'plates\'s config and lock; the project leaves plates\'s fleet' });

  // 3. The night shift: every scheduled workflow, and what it does.
  const jobs = tracked.filter(p => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)).flatMap(path => {
    const job = scheduledJob(path, readText(root, path) ?? '');
    return job ? [{ ...job, fate: byPath.get(path)?.fate ?? 'keep', managed: byPath.get(path)?.kind === 'file' }] : [];
  });

  const seen = new Set();
  const uniqueRefusals = refusals.filter(r => { const k = `${r.code}:${r.detail}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const counts = { managed: Object.keys(lock.files).length, ejected: ejected.length, seeded: files.filter(r => r.kind === 'seeded').length, keep: 0, drop: 0, rewrite: 0, person: 0 };
  for (const row of files) counts[row.fate]++;
  counts.references = references.length;
  counts.needsPerson = references.filter(r => r.needsPerson).length;
  return { schema: 1, dryRun: true, wrote: false, project: config.name ?? null, repo: config.repo ?? null, practice: lock.practice ?? config.practice ?? null, keepPhases, openPhases: open, counts, files, references, jobs, refusals: uniqueRefusals };
}

/** The plates:begin/end sections of a file's lines: [{ id, begin, end }] (line indexes of the markers). */
export function blocksOf(lines) {
  const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/<!-- plates:begin ([a-z0-9-]+) -->/);
    if (!m) return;
    const end = lines.findIndex((l, j) => j > i && l.includes(`<!-- plates:end ${m[1]} -->`));
    if (end > i) out.push({ id: m[1], begin: i, end });
  });
  return out;
}

/** Phase files whose status is not done or superseded: [{ file, status }]. */
export function openPhases(root, tracked) {
  return tracked.filter(p => /^docs\/phases\/[^/]+\.md$/.test(p) && !/\/README\.md$/i.test(p)).flatMap(file => {
    const text = readText(root, file) ?? '';
    const status = text.match(/^---\n[\s\S]*?^status:\s*["']?([a-z-]+)["']?\s*$/m)?.[1];
    return status && !CLOSED.includes(status) ? [{ file, status }] : [];
  });
}
const CLOSED = ['built', 'lived-in', 'superseded'];

/** A workflow's schedule (cron and workflow_run) and its one-line purpose, or null when nothing schedules it. */
export function scheduledJob(path, text) {
  const crons = [...text.matchAll(/^\s*-\s*cron:\s*["']?([^"'\n]+?)["']?\s*$/gm)].map(m => m[1]);
  const after = workflowRunSources(text);
  if (!crons.length && !after.length) return null;
  const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? path;
  return { path, name, cron: crons, after, summary: summaryOf(text) };
}

/** The workflows a `workflow_run` trigger follows: `workflows: [a, b]` or a block list, wherever it sits in the trigger. */
export function workflowRunSources(text) {
  const lines = text.split('\n'), out = [], unq = v => v.trim().replace(/^["']|["']$/g, '');
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*)workflow_run:\s*$/);
    if (!m) return;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() && indentOf(lines[j]) <= m[1].length) break;
      const w = lines[j].match(/^(\s*)workflows:\s*(.*)$/);
      if (!w) continue;
      const inline = w[2].replace(/\s+#.*$/, '').trim();
      if (inline.startsWith('[')) out.push(...inline.replace(/^\[|\]$/g, '').split(',').map(unq).filter(Boolean));
      else if (inline) out.push(unq(inline));
      else for (let k = j + 1; k < lines.length; k++) {
        if (lines[k].trim() && indentOf(lines[k]) <= w[1].length && !/^\s*-\s/.test(lines[k])) break;
        const item = lines[k].match(/^\s*-\s+(.+?)\s*(#.*)?$/);
        if (item) out.push(unq(item[1]));
        else if (lines[k].trim()) break;
      }
    }
  });
  return out;
}

function summaryOf(text) {
  const head = [];
  for (const line of text.split('\n')) { if (!/^#/.test(line)) break; head.push(line.replace(/^#\s?/, '')); }
  const paras = head.join('\n').split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!paras.length) return '(no header comment)';
  const title = paras[0].replace(/\s*\(.*?\)\.?$/, '').replace(/\.$/, '');
  const first = paras[1]?.replace(/\s*\([^()]*\)/g, '').match(/^(.+?\.)(\s|$)/)?.[1] ?? paras[1] ?? '';
  return clip(first ? `${title}: ${first}` : title, 160);
}

/** The plan as text: files by fate, references, jobs, refusals. */
export function planText(plan) {
  const out = [];
  const c = plan.counts;
  out.push(`plates eject --dry-run: ${plan.project ?? '(unnamed)'} (practice ${plan.practice ?? '?'}). Nothing was written.`);
  out.push(`${c.managed} managed targets in the lock, ${c.ejected} ejected, ${c.seeded} seeded, and .plates/: keep ${c.keep}, rewrite ${c.rewrite}, drop ${c.drop}, a person's call ${c.person}.`);
  for (const fate of ['keep', 'rewrite', 'person', 'drop']) {
    const rows = plan.files.filter(r => r.fate === fate);
    if (!rows.length) continue;
    out.push('', `${{ keep: 'Keep', rewrite: 'Rewrite', person: 'Needs a person', drop: 'Drop' }[fate]} (${rows.length}):`);
    for (const r of rows) out.push(`  ${r.block ? `${r.path}#${r.block}` : r.path}${r.to ? ` → ${r.to}` : ''}  [${r.practice ?? '-'}] ${r.reason}${r.missing ? ' (missing)' : ''}`);
  }
  out.push('', `References to plates in kept files (${plan.references.length}):`);
  if (!plan.references.length) out.push('  none');
  for (const r of plan.references) out.push(`  ${r.path}${r.line ? `:${r.line}` : ''} [${r.kind}] ${r.text}`, `    → ${r.rewrite ?? `needs a person: ${r.needsPerson}`}`);
  out.push('', `Night-shift jobs (${plan.jobs.length}): choose which become Unison Recurring tasks.`);
  if (!plan.jobs.length) out.push('  none');
  for (const j of plan.jobs) out.push(`  ${j.name} (${j.path}, ${j.fate}): ${[...j.cron.map(x => `cron ${x}`), ...j.after.map(x => `after ${x}`)].join(', ')}`, `    ${j.summary}`);
  out.push('', `Refusals (${plan.refusals.length}):`);
  if (!plan.refusals.length) out.push('  none: increment 2 could apply this plan');
  for (const r of plan.refusals) out.push(`  ${r.code}: ${r.detail}`);
  return out.join('\n');
}

/**
 * Each kept file's new text under the plan: Map(path → text). Throws when two
 * edits overlap, before anything is written.
 */
export function plannedTexts(root, plan) {
  const ops = new Map(), add = (path, op) => { if (!ops.has(path)) ops.set(path, []); ops.get(path).push(op); };
  const moves = new Map(plan.files.filter(r => r.to).map(r => [r.path, r.to]));
  for (const ref of plan.references) {
    if (!ref.edit || !ref.rewrite) continue;
    if (ref.edit.op === 'move') { if (moves.has(ref.edit.target)) add(ref.path, { ...ref.edit, to: moves.get(ref.edit.target) }); }
    else add(ref.path, ref.edit);
  }
  // Sections: a kept one loses its markers, a dropped one goes whole.
  const sections = plan.files.filter(r => r.block && (r.fate === 'keep' || r.fate === 'drop'));
  for (const path of new Set(sections.map(r => r.path))) {
    const text = readText(root, path);
    if (text === null) continue;
    for (const b of blocksOf(text.split('\n'))) {
      const row = sections.find(r => r.path === path && r.block === b.id);
      if (!row) continue;
      if (row.fate === 'drop') add(path, { op: 'delete', from: b.begin, to: b.end + 1, section: true });
      else { add(path, { op: 'delete', from: b.begin, to: b.begin + 1, section: true }); add(path, { op: 'delete', from: b.end, to: b.end + 1, section: true }); }
    }
  }
  const out = new Map();
  for (const [path, list] of ops) {
    const text = readText(root, path);
    if (text === null) throw new EjectError(`${path}: cannot read it to rewrite it`);
    const lines = text.split('\n');
    for (const op of list.filter(o => o.op === 'move')) lines[op.line] = lines[op.line].split(op.target).join(op.to);
    for (const op of list.filter(o => o.op === 'import')) for (const q of ["'", '"']) lines[op.line] = lines[op.line].split(`${q}${op.from}${q}`).join(`${q}${op.to}${q}`);
    const ranges = list.filter(o => o.op === 'delete' || o.op === 'replace').sort((a, b) => b.from - a.from);
    for (let i = 1; i < ranges.length; i++) if (ranges[i].to > ranges[i - 1].from) throw new EjectError(`${path}: two rewrites overlap at line ${ranges[i - 1].from + 1}; nothing was changed`);
    for (const op of ranges) lines.splice(op.from, op.to - op.from, ...(op.op === 'replace' ? op.lines : []));
    let next = lines.join('\n');
    if (list.some(o => o.section)) next = next.replace(/\n{3,}/g, '\n\n');
    const scripts = list.filter(o => o.op === 'script');
    if (scripts.length) {
      const pkg = JSON.parse(next), indent = next.match(/^([ \t]+)"/m)?.[1] ?? '  ';
      // A kept script under scripts/plates/ moves, inside a rewritten script's value too.
      const moved = value => [...moves].reduce((v, [from, to]) => v.split(from).join(to), value);
      for (const op of scripts) { if (op.value === null) delete pkg.scripts[op.name]; else pkg.scripts[op.name] = moved(op.value); }
      next = `${JSON.stringify(pkg, null, indent)}\n`;
    }
    if (next !== text) out.set(path, next);
  }
  return out;
}

/** Clone `branch` of `root` into a temp dir and run `npm ci` and `npm run check` there. */
export function cleanCheck({ root, branch, timeoutMs = 30 * 60_000 }) {
  const dir = mkdtempSync(join(tmpdir(), 'plates-eject-check-')), clone = join(dir, 'clone');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST_')));
  const tail = s => String(s ?? '').split('\n').slice(-40).join('\n').trim();
  try {
    for (const [cmd, args, cwd] of [['git', ['clone', '-q', '--no-hardlinks', '--single-branch', '--branch', branch, root, clone], dir], ['npm', ['ci'], clone], ['npm', ['run', 'check'], clone]]) {
      const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0) return { ran: true, passed: false, step: `${cmd} ${args.slice(0, 2).join(' ')}`, exitCode: r.status, output: tail(`${r.stdout ?? ''}\n${r.stderr ?? r.error?.message ?? ''}`) };
    }
    return { ran: true, passed: true };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Apply the plan on a new branch in this checkout, commit once, then run the project's own check in a clean clone. */
export async function applyEject({ root, keepPhases = false, branch = 'plates-eject', check = true, practicesDir } = {}) {
  const plan = await planEject({ root, practicesDir, keepPhases });
  const needsPerson = plan.references.filter(r => r.needsPerson).map(r => ({ path: r.path, line: r.line, text: r.text, why: r.needsPerson }));
  const refuse = why => ({ data: { ...plan, dryRun: false, applied: false, why }, text: `${planText(plan)}\n\nRefused: ${why}. Nothing was changed.`, exitCode: 1 });
  if (plan.refusals.length) return refuse(`${plan.refusals.length} refusal${plan.refusals.length === 1 ? '' : 's'} above`);
  const branches = git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']).split('\n').filter(Boolean);
  try { git(root, ['check-ref-format', '--branch', branch]); } catch { return refuse(`${branch} is not a branch name`); }
  if (['main', 'master'].includes(branch) || branches.includes(branch)) return refuse(`branch ${branch} exists (or is a default branch); eject always makes a new one`);
  const texts = plannedTexts(root, plan);
  const from = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), base = git(root, ['rev-parse', 'HEAD']).trim();
  const trackedNow = new Set(git(root, ['ls-files', '-z']).split('\0').filter(Boolean));
  const moved = plan.files.filter(r => r.to), deleted = plan.files.filter(r => r.fate === 'drop' && !r.block && r.kind !== 'directory' && trackedNow.has(r.path));
  git(root, ['switch', '-q', '-c', branch]);
  try {
    for (const [path, text] of texts) writeFileSync(join(root, path), text);
    if (texts.size) git(root, ['add', '--', ...texts.keys()]);
    for (const r of moved) { mkdirSync(join(root, posix.dirname(r.to)), { recursive: true }); git(root, ['mv', '--', r.path, r.to]); }
    if (deleted.length) git(root, ['rm', '-q', '--', ...deleted.map(r => r.path)]);
    git(root, ['rm', '-r', '-q', '--ignore-unmatch', '--', '.plates']);
    const body = [
      `Every file plates managed is the project's own or gone (plates phase 206). Moved ${moved.length}, rewrote ${texts.size}, deleted ${deleted.length} and .plates/.`,
      ...(keepPhases && plan.openPhases.length ? [`Open phases stay in docs/phases as history (--keep-phases): ${plan.openPhases.map(p => p.file).join(', ')}.`] : []),
      needsPerson.length ? `Needs a person (not edited):\n${needsPerson.map(n => `- ${n.path}${n.line ? `:${n.line}` : ''}: ${n.why}`).join('\n')}` : 'Nothing needs a person.',
    ].join('\n\n');
    git(root, ['commit', '-q', '-m', 'Leave plates: the project owns what plates managed', '-m', body]);
  } catch (error) {
    // Nothing of the owner's is lost: the tree was clean, and every change is on the new branch.
    try { git(root, ['reset', '-q', '--hard', base]); git(root, ['switch', '-q', from]); git(root, ['branch', '-q', '-D', branch]); } catch {}
    throw new EjectError(`eject stopped and undid itself: ${error.message}`, 1);
  }
  const commit = git(root, ['rev-parse', 'HEAD']).trim();
  const stat = git(root, ['show', '--shortstat', '--format=', commit]).trim();
  const result = check ? cleanCheck({ root, branch }) : { ran: false };
  const data = { schema: 1, applied: true, branch, base, commit, stat, moved: moved.map(r => ({ from: r.path, to: r.to })), rewritten: [...texts.keys()], deleted: deleted.map(r => r.path), needsPerson, keepPhases, openPhases: plan.openPhases, check: result };
  const text = [
    `plates eject: committed ${commit.slice(0, 12)} on ${branch} (from ${from}): ${stat}.`,
    `Moved ${moved.length}, rewrote ${texts.size}, deleted ${deleted.length} and .plates/.`,
    needsPerson.length ? `Needs a person (${needsPerson.length}, not edited):\n${needsPerson.map(n => `  ${n.path}${n.line ? `:${n.line}` : ''}: ${n.why}`).join('\n')}` : 'Nothing needs a person.',
    !result.ran ? 'The clean-clone check was not run.' : result.passed ? 'Clean clone: npm ci and npm run check passed.' : `Clean clone: ${result.step} failed (exit ${result.exitCode}); the branch stays for inspection.\n${result.output}`,
    'Nothing was pushed.',
  ].join('\n');
  return { data, text, exitCode: result.ran && !result.passed ? 1 : 0 };
}

/** plates eject --dry-run | --apply [--keep-phases] [--branch <name>]. */
export async function ejectCommand({ root, args = [], branch }) {
  const dry = args.includes('--dry-run'), apply = args.includes('--apply'), keepPhases = args.includes('--keep-phases');
  if (dry === apply) throw new EjectError('plates eject --dry-run | --apply [--keep-phases] [--branch <name>] [--json]: say which, once');
  if (branch !== undefined && !apply) throw new EjectError('--branch goes with --apply');
  if (apply) return applyEject({ root, keepPhases, ...(branch ? { branch } : {}) });
  const plan = await planEject({ root, keepPhases });
  return { data: plan, text: planText(plan), exitCode: plan.refusals.length ? 1 : 0 };
}
