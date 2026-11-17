#!/usr/bin/env node
// The measures pre-registered in docs/research/2026-10-02-does-plates-help-measures.md,
// computed from a local clone and saved `gh run list` output. Prints counts and
// durations only: no commit subject, file content or issue text leaves the clone.
//
//   windows    --repo <clone>                             adoption commit and the comparison windows
//   red-streak --runs <gh-run-list.json> --from <iso> --to <iso>
//   lessons    --repo <clone> --from <iso> --to <iso>
//   phases     --repo <clone> --from <iso> --to <iso>
//   drift      --plates <plates clone> --project <clone> --at <iso>
//   conduct    --transcripts <dir> [--root <project root>] [--check "<cmd>"]
//
// Every window is half-open: from <= t < to.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const git = (repo, args, { allowFail = false } = {}) => {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
};
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round = (n, places = 1) => n === null ? null : Math.round(n * 10 ** places) / 10 ** places;

// ---- measure 1: red streak -------------------------------------------------

const RED = new Set(['failure', 'timed_out', 'startup_failure']);
/** 'green', 'red', or null for a run that neither passed nor failed (cancelled, skipped, unfinished). */
export const colour = conclusion => conclusion === 'success' ? 'green' : RED.has(conclusion) ? 'red' : null;

/**
 * runs: [{conclusion, createdAt}] in any order. The longest run of consecutive
 * reds among the window's runs, and the hours from each first red (a red that
 * follows a green, or opens the history) in the window to the next green, which
 * may fall after the window. Runs that neither passed nor failed are left out
 * of the sequence and counted as `ignored`.
 */
export function redStreak(runs, from, to) {
  const start = Date.parse(from), end = Date.parse(to);
  const all = runs.map(r => ({ t: Date.parse(r.createdAt), c: colour(r.conclusion) })).sort((a, b) => a.t - b.t);
  const inWindow = r => r.t >= start && r.t < end;
  const seq = all.filter(r => r.c);
  let longest = 0, current = 0;
  for (const r of seq.filter(inWindow)) {
    current = r.c === 'red' ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  const hours = [];
  let episodes = 0;
  seq.forEach((r, i) => {
    if (r.c !== 'red' || !inWindow(r) || (i > 0 && seq[i - 1].c === 'red')) return;
    episodes++;
    const green = seq.slice(i + 1).find(next => next.c === 'green');
    if (green) hours.push((green.t - r.t) / 3_600_000);
  });
  const windowRuns = all.filter(inWindow);
  return {
    runs: windowRuns.length,
    green: windowRuns.filter(r => r.c === 'green').length,
    red: windowRuns.filter(r => r.c === 'red').length,
    ignored: windowRuns.filter(r => !r.c).length,
    longestRedStreak: longest,
    redEpisodes: episodes,
    resolvedEpisodes: hours.length,
    medianHoursFirstRedToGreen: round(median(hours), 2),
  };
}

// ---- measure 2: lesson to guard --------------------------------------------

const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim());
const isSeparator = row => row.every(c => /^:?-{2,}:?$/.test(c));

/** Table rows of a lessons page: {header, guardIndex, rows: Map(first cell -> cells)}. */
export function lessonTable(text) {
  let header = null, guardIndex = -1;
  const rows = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const row = cells(line);
    if (isSeparator(row)) continue;
    if (row.some(c => /^guard\b/i.test(c)) && !rows.size && !header) {
      header = row;
      guardIndex = row.findIndex(c => /^guard\b/i.test(c));
      continue;
    }
    if (header) rows.set(row[0], row);
  }
  return { header, guardIndex, rows };
}

/** Path-shaped words in a Guard cell: a word with a slash or a file extension, `:line` and punctuation trimmed. */
export function guardPaths(cell) {
  const out = new Set();
  for (const raw of String(cell ?? '').split(/[\s`*()<>,;"']+/)) {
    const word = raw.replace(/[.:]+$/, '').replace(/:\d+(-\d+)?$/, '').replace(/^\.\//, '');
    if (!word || /^https?:/.test(word) || /^[\d.]+$/.test(word)) continue;
    if (/^[\w@.\-/[\]]+$/.test(word) && (/\//.test(word) ? /[A-Za-z]/.test(word) : /^[\w@.-]+\.[A-Za-z][A-Za-z0-9]{0,5}$/.test(word))) out.add(word.replace(/\/$/, ''));
  }
  return [...out];
}

export function lessons(repo, from, to, file = 'docs/lessons.md') {
  const at = when => git(repo, ['rev-list', '-1', `--before=${when}`, 'HEAD']).trim();
  const startSha = at(new Date(Date.parse(from) - 1000).toISOString()), endSha = at(new Date(Date.parse(to) - 1000).toISOString());
  if (!endSha) return { computable: false, why: 'no commit before the window ends' };
  const show = sha => sha ? git(repo, ['show', `${sha}:${file}`], { allowFail: true }) : null;
  const endText = show(endSha);
  if (endText === null && !git(repo, ['log', '--format=%H', '-1', '--', file]).trim()) return { computable: false, why: `${file} has never existed` };
  const before = lessonTable(show(startSha) ?? '').rows;
  const patch = git(repo, ['log', '-p', '--reverse', '--format=commit %H', `--since=${from}`, `--until=${new Date(Date.parse(to) - 1000).toISOString()}`, '--', file]);
  const commits = (patch.match(/^commit [0-9a-f]{40}$/gm) ?? []).length;
  const added = new Map();
  let guardIndex = lessonTable(endText ?? '').guardIndex;
  for (const line of patch.split('\n')) {
    if (!line.startsWith('+|')) continue;
    const row = cells(line.slice(1));
    if (isSeparator(row)) continue;
    if (row.some(c => /^guard\b/i.test(c)) && !/^\d/.test(row[0])) { guardIndex = row.findIndex(c => /^guard\b/i.test(c)); continue; }
    if (!before.has(row[0])) added.set(row[0], row);
  }
  const tree = new Set(git(repo, ['ls-tree', '-r', '--name-only', endSha]).split('\n').filter(Boolean));
  let naming = 0, existing = 0;
  for (const row of added.values()) {
    const paths = guardIndex >= 0 ? guardPaths(row[guardIndex]) : [];
    if (paths.length) naming++;
    if (paths.some(p => tree.has(p))) existing++;
  }
  return {
    computable: true, commits, rowsAdded: added.size, guardNamesAPath: naming, guardNamesAnExistingFile: existing,
    share: added.size ? round(existing / added.size, 3) : null,
  };
}

// ---- measure 3: phases moved per week ---------------------------------------

export function frontMatter(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? '')?.[1];
  if (block === undefined) return null;
  const status = /^status:\s*["']?([\w-]+)/m.exec(block)?.[1] ?? null;
  const evidence = (/^evidence:[ \t]*(.*)$/m.exec(block)?.[1] ?? '').replace(/(^|\s)#.*$/, '').trim();
  const listed = /^evidence:\s*\r?\n(\s+-\s+\S.*)/m.test(block);
  return { status, evidence: listed || (evidence !== '' && !/^(\[\s*\]|""|''|null|~)$/.test(evidence)) };
}

export function phases(repo, from, to, dir = 'docs/phases') {
  if (!git(repo, ['log', '--format=%H', '-1', '--', dir]).trim()) return { computable: false, why: `${dir} has never existed` };
  const log = git(repo, ['log', '--no-merges', '--format=commit %H', '--name-only', `--since=${from}`, `--until=${new Date(Date.parse(to) - 1000).toISOString()}`, '--', dir]);
  const transitions = {};
  let commits = 0, changes = 0, toBuilt = 0, toBuiltWithEvidence = 0, created = 0, sha = null;
  for (const line of log.split('\n')) {
    const commit = /^commit ([0-9a-f]{40})$/.exec(line);
    if (commit) { sha = commit[1]; commits++; continue; }
    if (!sha || !line.startsWith(`${dir}/`) || !line.endsWith('.md')) continue;
    const after = frontMatter(git(repo, ['show', `${sha}:${line}`], { allowFail: true }));
    if (!after?.status) continue;
    const before = frontMatter(git(repo, ['show', `${sha}^:${line}`], { allowFail: true }));
    if (!before?.status) { created++; continue; }
    if (before.status === after.status) continue;
    changes++;
    const key = `${before.status}>${after.status}`;
    transitions[key] = (transitions[key] ?? 0) + 1;
    if (after.status === 'built') { toBuilt++; if (after.evidence) toBuiltWithEvidence++; }
  }
  const weeks = (Date.parse(to) - Date.parse(from)) / (7 * DAY);
  return {
    computable: true, commits, statusChanges: changes, perWeek: round(changes / weeks, 2), filesCreatedWithStatus: created,
    toBuilt, toBuiltWithEvidence, evidenceShare: toBuilt ? round(toBuiltWithEvidence / toBuilt, 3) : null, transitions,
  };
}

// ---- measure 4: practice drift ----------------------------------------------

/** Doctor's reading of `project` as both stood at `at`, by the CLI plates carried at `at`. */
export function drift(plates, project, at) {
  const shaAt = repo => git(repo, ['rev-list', '-1', `--before=${at}`, 'HEAD']).trim();
  const cliSha = shaAt(plates), projectSha = shaAt(project);
  if (!cliSha || !projectSha) return { computable: false, why: 'no commit at that time' };
  const tmp = mkdtempSync(join(tmpdir(), 'does-plates-help-'));
  const cli = join(tmp, 'cli'), tree = join(tmp, 'project');
  try {
    git(plates, ['worktree', 'add', '-q', '--detach', cli, cliSha]);
    git(project, ['worktree', 'add', '-q', '--detach', tree, projectSha]);
    if (!existsSync(join(tree, '.plates', 'plates.json')) && !existsSync(join(tree, '.keel', 'keel.json'))) return { computable: false, why: 'not adopted at that time' };
    const bin = ['plates.mjs', 'keel.mjs'].map(n => join(cli, 'bin', n)).find(existsSync);
    let out;
    try { out = execFileSync('node', [bin, 'doctor', '--json'], { cwd: tree, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (error) { out = error.stdout; }
    const report = JSON.parse(out);
    const count = state => (report.drift ?? []).filter(d => d.state === state).length;
    const local = Object.keys(report.local ?? {}).length;
    return { computable: true, edited: count('edited'), both: count('both'), localVariants: local, total: count('edited') + count('both') + local };
  } finally {
    git(plates, ['worktree', 'remove', '--force', cli], { allowFail: true });
    git(project, ['worktree', 'remove', '--force', tree], { allowFail: true });
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- measure 5: conduct cost ------------------------------------------------

export async function conduct(transcripts, root, check) {
  const { conductCost } = await import('../../practices/night/files/scripts/plates/improve.mjs');
  const cost = await conductCost(resolve(transcripts), check ?? 'npm run check', root ? resolve(root) : undefined);
  const minutes = round(Object.values(cost.kinds).reduce((sum, k) => sum + k.minutes, 0));
  return { transcripts: cost.transcripts, wholeRuns: cost.wholeRuns, transcriptsWithAWholeRun: cost.agents.filter(a => a.wholeRuns).length, bashWallMinutes: minutes, kinds: cost.kinds };
}

// ---- windows ----------------------------------------------------------------

export function windows(repo) {
  const adoption = git(repo, ['log', '--diff-filter=A', '--reverse', '--format=%H %cI', '--', '.keel/keel.json', '.plates/plates.json']).split('\n')[0];
  const first = git(repo, ['log', '--reverse', '--format=%cI']).split('\n')[0];
  if (!adoption) return { adopted: false, firstCommit: first };
  const [sha, date] = adoption.split(' ');
  const t = Date.parse(date), iso = ms => new Date(ms).toISOString();
  return {
    adopted: true, adoptionCommit: sha.slice(0, 8), adoptedAt: iso(t), firstCommit: iso(Date.parse(first)),
    daysOfHistoryBefore: round((t - Date.parse(first)) / DAY),
    before17: { from: iso(t - 17 * DAY), to: iso(t) }, after17: { from: iso(t), to: iso(t + 17 * DAY) }, after28: { from: iso(t), to: iso(t + 28 * DAY) },
  };
}

// ---- cli --------------------------------------------------------------------

async function main(argv) {
  const [verb, ...rest] = argv;
  const opt = name => { const i = rest.indexOf(`--${name}`); return i < 0 ? undefined : rest[i + 1]; };
  const need = name => { const value = opt(name); if (!value) throw new Error(`${verb}: --${name} is required`); return value; };
  switch (verb) {
    case 'windows': return windows(need('repo'));
    case 'red-streak': return redStreak(JSON.parse(readFileSync(need('runs'), 'utf8')), need('from'), need('to'));
    case 'lessons': return lessons(need('repo'), need('from'), need('to'));
    case 'phases': return phases(need('repo'), need('from'), need('to'));
    case 'drift': return drift(need('plates'), need('project'), need('at'));
    case 'conduct': return conduct(need('transcripts'), opt('root'), opt('check'));
    default: throw new Error('usage: does-plates-help.mjs windows|red-streak|lessons|phases|drift|conduct (see the file header)');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    result => console.log(JSON.stringify(result, null, 2)),
    error => { console.error(error.message); process.exit(2); },
  );
}
