// Phase 13: the six measures of docs/research/2026-10-02-does-plates-help-measures.md,
// computed as that page names them, for docs/research/2026-11-04-does-plates-help-results.md.
//
//   node scripts/research/does-plates-help.mjs --fleet <dir> [--transcripts <dir>]
//        [--checkouts <dir>] [--until <YYYY-MM-DD>] [--refresh] [--json]
//
// Read-only. It reads git history of full clones under --fleet (it clones a missing
// one there: a network read), the GitHub API through gh GETs (`gh run list`,
// `gh issue list`, `gh api` on comments), Claude Code transcripts under
// --transcripts, and this checkout's own history. Every gh answer is cached under
// <fleet>/cache and nothing is written anywhere else. It prints counts, dates and
// medians only: never a commit message, lesson text, issue title or phase title.
// gh is PLATES_GH or gh. Exit 0 computed; 2 bad arguments or a read that failed.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { commandKind } from '../plates/improve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DAY = 86_400_000;
const RED = new Set(['failure', 'timed_out', 'startup_failure']);
const GREEN = new Set(['success']);

/** The projects of the pre-registration and how each is used there. */
export const PROJECTS = [
  { name: 'ledger', repo: 'dalmaer/ledger', use: 'before-after' },
  { name: 'duo', repo: 'dalmaer/duo', use: 'after-only' },
  { name: 'cajones', repo: 'dalmaer/cajones', use: 'after-only' },
  { name: 'isocan', repo: 'dglazkov/isocan', use: 'reference' },
];

// ---------- pure parts (tested) ----------

/** Runs sorted by createdAt; reds and greens per RED/GREEN; anything else (cancelled, skipped) is neither and breaks nothing. */
export function redStreaks(runs, start, end) {
  const sorted = runs.map(r => ({ t: Date.parse(r.createdAt), c: r.conclusion })).filter(r => !Number.isNaN(r.t)).sort((a, b) => a.t - b.t);
  const inside = sorted.filter(r => r.t >= start && r.t < end);
  const counted = inside.filter(r => RED.has(r.c) || GREEN.has(r.c));
  let longest = 0, current = 0;
  const streaks = [];
  for (const r of counted) {
    if (RED.has(r.c)) {
      if (current === 0) streaks.push({ first: r.t });
      current++;
      longest = Math.max(longest, current);
    } else current = 0;
  }
  // Recovery: the next green after the first red, read past the window's end if it is there.
  const hours = [];
  let unrecovered = 0;
  for (const s of streaks) {
    const green = sorted.find(r => r.t > s.first && GREEN.has(r.c));
    if (green) hours.push((green.t - s.first) / 3_600_000); else unrecovered++;
  }
  return { runs: inside.length, counted: counted.length, reds: counted.filter(r => RED.has(r.c)).length, longest, streaks: streaks.length, medianHoursToGreen: median(hours), unrecovered };
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  const v = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  return Math.round(v * 10) / 10;
}

/** Split a markdown table line into trimmed cells (an escaped \| stays inside a cell). */
export function cells(line) {
  const parts = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/);
  return parts.map(p => p.trim());
}

/**
 * The rows of the table whose header has a Guard column: [{ key, guard }]. key is the first cell.
 * A table split by blank lines (rows go on after one) is still one table: rows are read
 * until text, a heading or another table's header.
 */
export function lessonRows(text) {
  const lines = String(text).split('\n');
  const isSep = l => /^\|\s*:?-{3}/.test(l?.trim() ?? '');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('|')) continue;
    const head = cells(lines[i]);
    const g = head.findIndex(c => /guard/i.test(c));
    if (g < 0 || !isSep(lines[i + 1])) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length; j++) {
      const l = lines[j].trim();
      if (!l) continue;
      if (!l.startsWith('|') || isSep(lines[j + 1])) break;
      const c = cells(l);
      rows.push({ key: c[0], guard: c[g] ?? '' });
    }
    return rows;
  }
  return [];
}

/** The file paths a Guard cell names: code spans (and bare words) that look like a path or a file name. */
export function guardFiles(cell) {
  const out = new Set();
  const spans = [...String(cell).matchAll(/`([^`]+)`/g)].map(m => m[1]);
  const bare = String(cell).replace(/`[^`]*`/g, ' ').split(/\s+/).filter(w => w.includes('/'));
  for (let raw of [...spans, ...bare]) {
    raw = raw.trim().replace(/^\.\//, '').replace(/[),.;:]+$/, '').replace(/#.*$/, '').replace(/:\d+(-\d+)?$/, '').replace(/\(\)$/, '');
    if (!/^[A-Za-z0-9_.@/-]+$/.test(raw) || raw.startsWith('-') || /^https?:/.test(raw)) continue;
    if (/^v?\d+(\.\d+)+$/.test(raw) || /^[0-9a-f]{7,40}$/.test(raw)) continue;
    if (raw.includes('/') ? /[A-Za-z]/.test(raw) && !raw.endsWith('/') : /\.[A-Za-z][A-Za-z0-9]{0,5}$/.test(raw)) out.add(raw);
  }
  return [...out];
}

/** Does a named file exist in the tree: the exact path, or a path it is the tail of (a bare name, or a package-relative path)? */
export function namesExisting(names, tree) {
  return names.some(n => tree.has(n) || [...tree].some(p => p.endsWith('/' + n)));
}

/** Measure 2 for one window: rows present at its end and not at its start; how many have a Guard naming a file in the end tree. */
export function lessonToGuard(startText, endText, endTree) {
  const before = new Set(lessonRows(startText ?? '').map(r => r.key));
  const added = lessonRows(endText ?? '').filter(r => !before.has(r.key));
  const naming = added.filter(r => guardFiles(r.guard).length);
  const existing = added.filter(r => namesExisting(guardFiles(r.guard), endTree));
  return { added: added.length, namingAFile: naming.length, guardFileExists: existing.length, share: added.length ? Math.round((existing.length / added.length) * 100) / 100 : null };
}

/** A phase file's front matter: { status, evidence } (evidence true when it names at least one path). */
export function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? ''));
  if (!m) return { status: null, evidence: false };
  const status = /^status:\s*([^\s#]+)/m.exec(m[1])?.[1] ?? null;
  const ev = /^evidence:\s*(.*)$/m.exec(m[1]);
  let evidence = false;
  if (ev) {
    const v = ev[1].trim();
    if (v && v !== '[]' && v !== '""' && v !== "''") evidence = true;
    else if (!v) evidence = /^evidence:\s*\n\s+-\s*\S/m.test(m[1]);
  }
  return { status, evidence };
}

/** Measure 3 for one window: status moves per week, and moves to built with an evidence path. */
export function phaseMoves(moves, start, end) {
  const inside = moves.filter(m => m.t >= start && m.t < end);
  const weeks = Math.max(1, Math.ceil((end - start) / (7 * DAY)));
  const perWeek = Array.from({ length: weeks }, () => 0);
  for (const m of inside) perWeek[Math.min(weeks - 1, Math.floor((m.t - start) / (7 * DAY)))]++;
  const built = inside.filter(m => m.to === 'built');
  const withEvidence = built.filter(m => m.evidence);
  return {
    moves: inside.length, weeks: (end - start) / (7 * DAY), perWeek, movesPerWeek: Math.round((inside.length / ((end - start) / (7 * DAY))) * 10) / 10,
    toBuilt: built.length, toBuiltWithEvidence: withEvidence.length,
    evidenceShare: built.length ? Math.round((withEvidence.length / built.length) * 100) / 100 : null,
  };
}

/** The drift value in a health page's `drift` row, or null when the page has none. */
export function driftValue(page) {
  const line = String(page ?? '').split('\n').find(l => /^\|\s*`drift`/.test(l));
  if (!line) return null;
  const v = Number(cells(line)[1]);
  return Number.isFinite(v) ? v : null;
}

// ---------- reading the world ----------

const gitRaw = (dir, args, input) => {
  const r = spawnSync('git', ['-C', dir, '-c', 'core.quotepath=off', '-c', 'diff.renames=true', ...args], { encoding: 'utf8', maxBuffer: 1 << 30, input });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${dir}: ${r.stderr.trim()}`);
  return r.stdout;
};

/** Many blobs at once: specs like "<rev>:<path>" → content, or null when missing. */
function blobs(dir, specs) {
  if (!specs.length) return [];
  const r = spawnSync('git', ['-C', dir, 'cat-file', '--batch'], { input: specs.join('\n') + '\n', maxBuffer: 1 << 30 });
  const buf = r.stdout, out = [];
  let at = 0;
  for (let i = 0; i < specs.length; i++) {
    const nl = buf.indexOf(10, at);
    const header = buf.subarray(at, nl).toString();
    at = nl + 1;
    if (/ missing$| ambiguous$/.test(header)) { out.push(null); continue; }
    const size = Number(header.split(' ')[2]);
    out.push(buf.subarray(at, at + size).toString('utf8'));
    at += size + 1;
  }
  return out;
}

/** The last first-parent commit on HEAD committed before t (ms), or null. */
function commitBefore(dir, t) {
  const out = gitRaw(dir, ['rev-list', '-1', '--first-parent', `--before=${new Date(t - 1000).toISOString()}`, 'HEAD']).trim();
  return out || null;
}

function treeSet(dir, rev) {
  return new Set(gitRaw(dir, ['ls-tree', '-r', '--name-only', rev]).split('\n').filter(Boolean));
}

/** Adoption: the first commit that added the project's keel or plates config. */
export function adoption(dir) {
  const out = gitRaw(dir, ['log', '--diff-filter=A', '--format=%H %cI', '--', '.keel/keel.json', '.plates/plates.json']).trim().split('\n').filter(Boolean);
  const last = out.at(-1);
  if (!last) return null;
  const [sha, at] = last.split(' ');
  return { sha, at: new Date(at).toISOString(), t: Date.parse(at) };
}

/** Status moves in docs/phases, as they landed on the default branch. */
export function readPhaseMoves(dir) {
  const log = gitRaw(dir, ['log', '--first-parent', '-m', '--format=@%H %cI %P', '--name-status', '-M', '--', 'docs/phases']);
  const entries = [];
  let cur = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) { const [h, at, p1] = line.slice(1).split(' '); cur = { h, t: Date.parse(at), p1 }; continue; }
    if (!line.trim() || !cur) continue;
    const parts = line.split('\t');
    const kind = parts[0][0];
    const [from, to] = kind === 'R' || kind === 'C' ? [parts[1], parts[2]] : [parts[1], parts[1]];
    if (!/\.md$/.test(to) || /README\.md$/i.test(to) || kind === 'D') continue;
    entries.push({ ...cur, kind, from, to });
  }
  const specs = [];
  for (const e of entries) { specs.push(`${e.h}:${e.to}`); specs.push(e.kind === 'A' || !e.p1 ? 'missing-on-purpose:x' : `${e.p1}:${e.from}`); }
  const got = blobs(dir, specs);
  const moves = [];
  let created = 0;
  entries.forEach((e, i) => {
    const now = frontMatter(got[2 * i]), was = e.kind === 'A' ? { status: null } : frontMatter(got[2 * i + 1]);
    if (!now.status) return;
    if (!was.status) { created++; return; }
    if (was.status !== now.status) moves.push({ t: e.t, from: was.status, to: now.status, evidence: now.evidence });
  });
  return { moves, created };
}

function ghBin() { return process.env.PLATES_GH || 'gh'; }

function cached(cacheDir, key, refresh, read) {
  const file = join(cacheDir, key.replace(/[^A-Za-z0-9_.-]/g, '_') + '.json');
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const value = read();
  writeFileSync(file, JSON.stringify(value));
  return value;
}

function gh(args) {
  const r = spawnSync(ghBin(), args, { encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')}: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout || 'null');
}

const day = t => new Date(t).toISOString().slice(0, 10);

/** Every default-branch run of a workflow created in [from, to], fetched a week at a time so no page is truncated. */
function runs(cacheDir, refresh, repo, workflow, from, to) {
  return cached(cacheDir, `runs-${repo}-${workflow}-${day(from)}-${day(to)}`, refresh, () => {
    const all = [];
    for (let s = from; s <= to; s += 7 * DAY) {
      const e = Math.min(to, s + 6 * DAY);
      const page = gh(['run', 'list', '-R', repo, '--workflow', workflow, '--branch', 'main', '--created', `${day(s)}..${day(e)}`, '--limit', '1000', '--json', 'conclusion,createdAt']);
      if (page.length >= 1000) throw new Error(`${repo} ${workflow} ${day(s)}..${day(e)}: 1000 runs, the read may be truncated`);
      all.push(...page);
    }
    return all;
  });
}

/** The gate: gateWorkflow from the project's config, else the workflow plates fleet resolves (passed in). */
function gateOf(dir, fallback) {
  for (const f of ['.plates/plates.json', '.keel/keel.json']) {
    const p = join(dir, f);
    if (existsSync(p)) { const c = JSON.parse(readFileSync(p, 'utf8')); if (c.gateWorkflow) return /\.ya?ml$/.test(c.gateWorkflow) ? c.gateWorkflow : `${c.gateWorkflow}.yml`; }
  }
  return fallback;
}

// The gate where config names none: what `plates fleet` resolved on 2026-11-04 (duo: Deploy, runs npm test; cajones: Test and deploy GitHub Pages).
const GATE_FALLBACK = { duo: 'deploy.yml', cajones: 'pages.yml' };

function ensureClone(fleet, name, repo) {
  const dir = join(fleet, name);
  if (!existsSync(dir)) execFileSync('git', ['clone', '-q', `https://github.com/${repo}.git`, dir], { stdio: 'inherit' });
  if (gitRaw(dir, ['rev-parse', '--is-shallow-repository']).trim() !== 'false') throw new Error(`${dir} is shallow: measures need full history`);
  return dir;
}

// ---------- the measures ----------

function measure1(ctx) {
  const out = {};
  for (const p of ctx.projects) {
    const wf = gateOf(p.dir, GATE_FALLBACK[p.name]);
    const ws = ctx.windows[p.name];
    const from = Math.min(...ws.map(w => w.start)), to = ctx.until + DAY;
    const all = runs(ctx.cache, ctx.refresh, p.repo, wf, from, to);
    out[p.name] = { workflow: wf, windows: ws.map(w => ({ window: w.label, from: day(w.start), to: day(w.end - 1), ...redStreaks(all, w.start, w.end) })) };
  }
  return out;
}

function lessonsPath(dir) {
  for (const f of ['.plates/plates.json', '.keel/keel.json']) {
    const p = join(dir, f);
    if (existsSync(p)) { const c = JSON.parse(readFileSync(p, 'utf8')); if (typeof c.lessons === 'string' && c.lessons.endsWith('.md')) return c.lessons; }
  }
  return 'docs/lessons.md';
}

function measure2(ctx) {
  const out = {};
  for (const p of ctx.projects) {
    let path = 'docs/lessons.md', substituted = null;
    const head = treeSet(p.dir, 'HEAD');
    if (!head.has(path)) {
      const own = lessonsPath(p.dir);
      const alt = head.has(own) ? own : head.has('docs/reviews/lessons.md') ? 'docs/reviews/lessons.md' : null;
      if (!alt) { out[p.name] = { computable: false, why: 'no docs/lessons.md in its history' }; continue; }
      path = alt; substituted = `${alt} for docs/lessons.md: the project keeps its lessons table there, with the same four columns`;
    }
    out[p.name] = { path, substituted, windows: ctx.windows[p.name].map(w => {
      const s = commitBefore(p.dir, w.start), e = commitBefore(p.dir, w.end);
      if (!e) return { window: w.label, computable: false, why: 'no commit before the window ends' };
      const [st, et] = blobs(p.dir, [s ? `${s}:${path}` : 'missing-on-purpose:x', `${e}:${path}`]);
      return { window: w.label, from: day(w.start), to: day(w.end - 1), ...lessonToGuard(st, et, treeSet(p.dir, e)) };
    }) };
  }
  return out;
}

function measure3(ctx) {
  const out = {};
  for (const p of ctx.projects) {
    if (!treeSet(p.dir, 'HEAD').has('docs/phases/README.md') && !gitRaw(p.dir, ['log', '--format=%h', '-1', '--', 'docs/phases']).trim()) {
      out[p.name] = { computable: false, why: 'no docs/phases/ in its history: it keeps phases in its own shape (docs/projects/<p>/phases.md, **Status:** lines), read by plates read-only' };
      continue;
    }
    const { moves, created } = readPhaseMoves(p.dir);
    out[p.name] = { createdInHistory: created, windows: ctx.windows[p.name].map(w => ({ window: w.label, from: day(w.start), to: day(w.end - 1), ...phaseMoves(moves, w.start, w.end) })) };
  }
  return out;
}

function fleetAt(t) {
  const c = commitBefore(ROOT, t);
  const [a, b] = blobs(ROOT, [`${c}:plates.json`, `${c}:fleet.json`]);
  const list = JSON.parse(a ?? b ?? '[]');
  return list.filter(x => x.role === 'managed').map(x => x.repo);
}

function configAt(dir, t) {
  const c = commitBefore(dir, t);
  if (!c) return null;
  const [a, b] = blobs(dir, [`${c}:.plates/plates.json`, `${c}:.keel/keel.json`]);
  try { return JSON.parse(a ?? b ?? 'null'); } catch { return null; }
}

function measure4(ctx) {
  const readings = [];
  for (let t = Date.parse('2026-10-05T00:00:00Z'); t <= ctx.until; t += 7 * DAY) {
    const date = day(t), end = t + DAY;
    const repos = fleetAt(end);
    const rows = [];
    for (const repo of repos) {
      const name = repo.split('/')[1];
      const dir = repo === 'dalmaer/plates' ? ROOT : ensureClone(ctx.fleet, name, repo);
      const config = configAt(dir, end);
      if (!config) { rows.push({ repo: name, adopted: false }); continue; }
      const dirs = [...new Set([config.health, 'docs/health', '.plates/health', '.keel/health'].filter(Boolean))];
      const pages = blobs(dir, dirs.map(d => `HEAD:${d}/${date}.md`));
      const page = pages.find(x => x !== null) ?? null;
      const local = config.local && typeof config.local === 'object' ? Object.keys(config.local).length : 0;
      rows.push({ repo: name, drift: page === null ? null : driftValue(page), local });
    }
    const read = rows.filter(r => r.drift !== null && r.drift !== undefined);
    readings.push({
      date, managed: repos.length, read: read.length,
      gaps: rows.filter(r => r.drift === null).map(r => r.repo),
      drift: read.reduce((a, r) => a + r.drift, 0), local: rows.reduce((a, r) => a + (r.local ?? 0), 0),
      total: read.reduce((a, r) => a + r.drift, 0) + rows.reduce((a, r) => a + (r.local ?? 0), 0),
      byRepo: Object.fromEntries(rows.map(r => [r.repo, { drift: r.drift ?? null, local: r.local ?? null }])),
    });
  }
  return { readings };
}

const encode = p => p.replace(/[^A-Za-z0-9]/g, '-');
const weeks = (start, end) => Array.from({ length: Math.ceil((end - start) / (7 * DAY)) }, (_, i) => ({ label: `week of ${day(start + i * 7 * DAY)}`, start: start + i * 7 * DAY, end: Math.min(end, start + (i + 1) * 7 * DAY) }));

function firstPrompt(lines) {
  for (const l of lines) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e?.type === 'user') { const c = e.message?.content; return typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x?.text ?? '').join(' ') : ''; }
  }
  return '';
}

/** One subagent transcript: builder?, phase, wall minutes, whole-check runs (any dir, and as the CLI counts in root; root may be several names of one checkout). */
export function readTranscript(text, meta, check, root) {
  const lines = String(text).split('\n').filter(l => l.trim());
  const prompt = firstPrompt(lines);
  const desc = meta?.description ?? '';
  const builder = /you are the builder/i.test(prompt) || /\bbuild/i.test(desc);
  const phase = Number((/brief-(\d+)\.md/.exec(prompt) ?? /\bphase[- ]?(\d+)/i.exec(prompt) ?? /\bphase[- ]?(\d+)/i.exec(desc) ?? [])[1]) || null;
  let first = Infinity, last = -Infinity, whole = 0, wholeInRoot = 0;
  for (const l of lines) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    const t = Date.parse(e?.timestamp ?? '');
    if (!Number.isNaN(t)) { first = Math.min(first, t); last = Math.max(last, t); }
    const content = e?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type !== 'tool_use' || part.name !== 'Bash') continue;
      const cmd = part.input?.command ?? '';
      if (commandKind(cmd, check, undefined).startsWith('whole')) whole++;
      if ([root].flat().some(r => commandKind(cmd, check, r).startsWith('whole'))) wholeInRoot++;
    }
  }
  return { builder, phase, start: Number.isFinite(first) ? first : null, minutes: Number.isFinite(first) ? Math.round(((last - first) / 60_000) * 10) / 10 : null, whole, wholeInRoot };
}

function measure5(ctx) {
  const projects = [
    { name: 'plates', dirs: ['plates', 'keel'], repoDir: ROOT, windows: weeks(Date.parse('2026-10-02T00:00:00Z'), ctx.until + DAY) },
    ...ctx.projects.map(p => ({ name: p.name, dirs: p.name === 'cajones' ? ['cajones', 'ritmo'] : [p.name], repoDir: p.dir, windows: ctx.windows[p.name] })),
  ];
  const out = { transcriptsDir: ctx.transcripts, projects: {} };
  for (const p of projects) {
    const config = JSON.parse(readFileSync(join(p.repoDir, existsSync(join(p.repoDir, '.plates/plates.json')) ? '.plates/plates.json' : '.keel/keel.json'), 'utf8'));
    const check = config.check ?? 'npm run check';
    const sessions = new Set(), files = new Map(), roots = p.dirs.map(d => join(ctx.checkouts, d));
    for (const d of p.dirs) {
      const base = join(ctx.transcripts, encode(join(ctx.checkouts, d)));
      if (!existsSync(base)) continue;
      for (const s of readdirSync(base)) {
        const sub = join(base, s, 'subagents');
        if (!existsSync(sub) || !statSync(sub).isDirectory()) continue;
        sessions.add(s);
        // A renamed checkout's sessions can be copied under both names: each agent is read once, its longest copy.
        for (const f of readdirSync(sub).filter(f => /^agent-.*\.jsonl$/.test(f))) {
          const path = join(sub, f), size = statSync(path).size, had = files.get(`${s}/${f}`);
          if (!had || had.size < size) files.set(`${s}/${f}`, { path, size });
        }
      }
    }
    const all = [...files.values()].map(({ path }) => {
      const metaFile = path.replace(/\.jsonl$/, '.meta.json');
      const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null;
      return readTranscript(readFileSync(path, 'utf8'), meta, check, roots);
    });
    const builders = all.filter(t => t.builder && t.start !== null);
    const log = gitRaw(p.repoDir, ['log', '--first-parent', '--format=%cI%x09%s %b%x00']).split('\0').map(x => x.trim()).filter(Boolean).map(x => { const [at, ...m] = x.split('\t'); return { t: Date.parse(at), m: m.join('\t') }; });
    const committed = new Map();
    for (const b of builders) {
      if (!b.phase) continue;
      const re = new RegExp(`\\bphase[- ]?${b.phase}\\b`, 'i');
      if (log.some(c => c.t >= b.start && re.test(c.m))) committed.set(b.phase, (committed.get(b.phase) ?? 0) + b.minutes);
    }
    const summarize = list => {
      const phases = new Map();
      for (const b of list) if (b.phase && committed.has(b.phase)) phases.set(b.phase, (phases.get(b.phase) ?? 0) + b.minutes);
      return {
        transcripts: list.length, wholeRuns: list.reduce((a, b) => a + b.whole, 0), wholeRunsInCheckout: list.reduce((a, b) => a + b.wholeInRoot, 0),
        buildersWithWholeRun: list.filter(b => b.whole > 0).length, buildersWithWholeRunInCheckout: list.filter(b => b.wholeInRoot > 0).length,
        committedPhases: phases.size, medianMinutesPerCommittedPhase: median([...phases.values()]), builderMinutes: Math.round(list.reduce((a, b) => a + (b.minutes ?? 0), 0)),
        from: list.length ? day(Math.min(...list.map(b => b.start))) : null, to: list.length ? day(Math.max(...list.map(b => b.start))) : null,
      };
    };
    const first = builders.length ? day(Math.min(...builders.map(b => b.start))) : null;
    out.projects[p.name] = {
      sessions: sessions.size, transcripts: all.length, builders: builders.length,
      all: summarize(builders),
      firstSession: first ? summarize(builders.filter(b => day(b.start) === first)) : null,
      windows: p.windows ? p.windows.map(w => ({ window: w.label, ...summarize(builders.filter(b => b.start >= w.start && b.start < w.end)) })) : undefined,
    };
  }
  return out;
}

function measure6(ctx) {
  const inbox = 'dalmaer/plates-inbox';
  const issues = cached(ctx.cache, `issues-${inbox}-lesson`, ctx.refresh, () => gh(['issue', 'list', '-R', inbox, '--label', 'lesson', '--state', 'all', '--limit', '1000', '--json', 'number,createdAt,closedAt,labels,title']))
    .filter(i => Date.parse(i.createdAt) < ctx.until + DAY);
  const onPlates = cached(ctx.cache, 'issues-dalmaer-plates-lesson', ctx.refresh, () => gh(['issue', 'list', '-R', 'dalmaer/plates', '--label', 'lesson', '--state', 'all', '--limit', '1000', '--json', 'number,createdAt'])).length;
  const labels = i => i.labels.map(l => l.name);
  const decided = issues.filter(i => labels(i).some(n => n.startsWith('decided:')));
  const byDecision = {};
  for (const i of decided) for (const n of labels(i)) if (n.startsWith('decided:')) byDecision[n.slice(8)] = (byDecision[n.slice(8)] ?? 0) + 1;
  const byProject = {};
  for (const i of issues) { const k = /^lesson\(([^)]+)\)/.exec(i.title)?.[1] ?? '?'; byProject[k] = (byProject[k] ?? 0) + 1; }
  const tags = gitRaw(ROOT, ['for-each-ref', '--sort=creatordate', '--format=%(refname:short) %(creatordate:iso-strict)', 'refs/tags']).trim().split('\n').filter(Boolean).map(l => { const [tag, at] = l.split(' '); return { tag, t: Date.parse(at) }; });
  const tagLessons = blobs(ROOT, tags.map(t => `${t.tag}:docs/lessons.md`));
  const accepted = decided.filter(i => labels(i).some(n => n === 'decided:lesson' || n === 'decided:practice'));
  const shipped = [], notShipped = [], unknown = [];
  for (const i of accepted) {
    const comments = cached(ctx.cache, `comments-${inbox}-${i.number}`, ctx.refresh, () => gh(['api', `repos/${inbox}/issues/${i.number}/comments`, '--paginate']));
    const note = comments.map(c => c.body ?? '').find(b => /accepted/i.test(b)) ?? '';
    const n = /lesson\s+(\d+)/i.exec(note.split('\n')[0] ?? '')?.[1];
    const decidedAt = Date.parse(i.closedAt ?? i.createdAt);
    if (!n) { unknown.push(i.number); continue; }
    const row = new RegExp(`^\\|\\s*${n}\\s*\\|`, 'm');
    const k = tags.findIndex((t, j) => t.t >= decidedAt && row.test(tagLessons[j] ?? ''));
    if (k >= 0) shipped.push({ issue: i.number, lesson: Number(n), tag: tags[k].tag, days: Math.round(((tags[k].t - decidedAt) / DAY) * 10) / 10 });
    else notShipped.push(i.number);
  }
  const days = shipped.map(s => s.days);
  return {
    target: inbox, onPlatesRepo: onPlates, filed: issues.length, byProject, decided: decided.length, byDecision,
    accepted: accepted.length, shippedInRelease: shipped.length, notShipped: notShipped.length, shipNotDeterminable: unknown.length,
    medianDaysDecisionToRelease: median(days), firstFiled: issues.length ? issues.map(i => i.createdAt).sort()[0].slice(0, 10) : null,
  };
}

export async function main(argv) {
  const opts = { transcripts: join(homedir(), '.claude/projects'), checkouts: join(homedir(), 'code'), until: '2026-11-02' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--refresh') opts.refresh = true;
    else if (['--fleet', '--transcripts', '--checkouts', '--until'].includes(a) && argv[i + 1]) opts[a.slice(2)] = argv[++i];
    else if (a === '--help') { console.log('usage: node scripts/research/does-plates-help.mjs --fleet <dir> [--transcripts <dir>] [--checkouts <dir>] [--until <YYYY-MM-DD>] [--refresh] [--json]'); return 0; }
    else { console.error(`does-plates-help: unexpected argument: ${a}`); return 2; }
  }
  if (!opts.fleet) { console.error('does-plates-help: --fleet <dir> is required (full clones live there, and the gh cache)'); return 2; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.until)) { console.error('does-plates-help: --until is YYYY-MM-DD'); return 2; }
  const fleet = resolve(opts.fleet), cache = join(fleet, 'cache');
  mkdirSync(cache, { recursive: true });
  const projects = PROJECTS.map(p => ({ ...p, dir: ensureClone(fleet, p.name, p.repo) }));
  for (const p of projects) p.adoption = adoption(p.dir);
  const ledger = projects.find(p => p.name === 'ledger').adoption.t;
  const before = { label: 'before', start: ledger - 17 * DAY, end: ledger }, after = { label: 'after', start: ledger, end: ledger + 17 * DAY };
  const windows = {};
  for (const p of projects) {
    if (p.use === 'before-after' || p.use === 'reference') windows[p.name] = [before, after];
    else windows[p.name] = [{ label: 'first 4 weeks', start: p.adoption.t, end: p.adoption.t + 28 * DAY }];
  }
  const ctx = { fleet, cache, refresh: !!opts.refresh, projects, windows, until: Date.parse(`${opts.until}T00:00:00Z`), transcripts: resolve(opts.transcripts), checkouts: resolve(opts.checkouts) };
  const adopted = projects.map(p => ({ project: p.name, use: p.use, adoptedAt: p.adoption?.at ?? null, commit: p.adoption?.sha.slice(0, 9) ?? null }));
  const secondAdoption = adopted.map(a => a.adoptedAt).filter(Boolean).sort()[1] ?? null;
  const result = {
    at: new Date().toISOString(), until: opts.until, plates: gitRaw(ROOT, ['rev-parse', '--short=9', 'HEAD']).trim(),
    adoption: adopted, secondAdoption, earliestResults: secondAdoption ? day(Math.max(Date.parse(secondAdoption) + 28 * DAY, Date.parse('2026-11-01'))) : null,
    windows: Object.fromEntries(Object.entries(windows).map(([k, ws]) => [k, ws.map(w => ({ window: w.label, from: new Date(w.start).toISOString(), to: new Date(w.end).toISOString() }))])),
    m1RedStreak: measure1(ctx), m2LessonToGuard: measure2(ctx), m3PhasesMoved: measure3(ctx), m4Drift: measure4(ctx), m5ConductCost: measure5(ctx), m6LessonsHome: measure6(ctx),
  };
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else console.log(text(result));
  return 0;
}

function text(r) {
  const out = [`does plates help — plates ${r.plates}, until ${r.until}`, ''];
  out.push('adoption: ' + r.adoption.map(a => `${a.project} ${a.adoptedAt?.slice(0, 10) ?? 'never'}`).join(', ') + `; second ${r.secondAdoption?.slice(0, 10)}; earliest results ${r.earliestResults}`);
  for (const [k, v] of Object.entries(r).filter(([k]) => /^m\d/.test(k))) out.push('', k, JSON.stringify(v, null, 1).replace(/\n\s*/g, ' '));
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { console.error(`does-plates-help: ${e.message}`); process.exitCode = 2; });
}
