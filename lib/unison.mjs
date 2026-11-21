// plates unison: each plate's work is its Unison backlog (plates phase 200).
//
//   plates unison            this plate's local Unison state (the map); reads nothing remote
//   plates unison status     the plan a sync would carry out; changes nothing
//   plates unison connect    find the workspace that lists the plate's repo, or make one
//   plates unison sync       carry out the plan with the unison CLI; keep the map
//
// The GitHub repo is the key: a workspace belongs to a plate when one of its
// repos normalizes to the plate's `repo`; two such workspaces are refused,
// never guessed between. The workspace id is cached in the map, the repo
// stays the truth. Plates never moves, assigns or starts an item.
//
// Every `unison` call goes through callUnison: `unison` on PATH, one timeout,
// UNISON_SERVER from the environment, else the plate's `unison.server`, else
// https://unison.cloud.run. A missing binary, a nonzero exit, an answer that
// is not JSON or lacks its array is "not read", never an empty backlog. No
// token is ever printed or passed on the command line.
//
// The map is private state: <project>/.plates/unison/map.json, the directory
// 0700 and the file 0600, git-ignored through info/exclude and refused when Git
// tracks it (as lib/backlog-events.mjs keeps its store).
import { constants } from 'node:fs';
import { access, chmod, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { environmentValue } from './names.mjs';
import { UNISON_SOURCES, PENDING_CREATE_MS, normalizeRepo, repoUrl, phaseSources, issueSources, readMap, planSync, mapAfter, parseLink, rawIssueLinks, phaseKey, keyPart, lineMatcher } from './unison-link.mjs';

export const DEFAULT_SERVER = 'https://unison.cloud.run';
export const MAP_DIR = '.plates/unison';
export const MAP_FILE = `${MAP_DIR}/map.json`;
/** One unison call; a slow Unison is not read, never waited on. */
export const UNISON_CALL_MS = 20_000;
const MAP_LIMIT = 4 * 1024 * 1024;
/** A second writer waits this long for the first, then is not run; a live holder's lock never ages out. */
export const LOCK_WAIT_MS = 2_000, LOCK_STALE_MS = 7 * 86_400_000;
const ISSUE_PAGES = 10;

class UnisonError extends Error { constructor(message, exitCode = 1) { super(message); this.exitCode = exitCode; } }
const usage = message => new UnisonError(message, 2);
const clip = (s, n = 200) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// Nothing token-shaped leaves this module, even inside a CLI's error line.
const redact = s => String(s ?? '').replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]').replace(/\b[A-Za-z]{1,6}_[A-Za-z0-9]{16,}\b/g, '[redacted]');

/** The plate's Unison settings from .plates/plates.json and the environment. */
export function unisonSettings(config, env = process.env) {
  const repo = normalizeRepo(config?.repo);
  if (!repo) throw usage('this plate names no GitHub repo (.plates/plates.json "repo": "owner/repo"); Unison finds a workspace by it');
  const own = config?.unison ?? {};
  if (own === null || typeof own !== 'object' || Array.isArray(own)) throw usage('.plates/plates.json "unison" must be an object');
  const sources = own.sources ?? ['phases'];
  if (!Array.isArray(sources) || !sources.length || sources.some(s => !UNISON_SOURCES.includes(s)) || new Set(sources).size !== sources.length) {
    throw usage(`.plates/plates.json "unison.sources" must list ${UNISON_SOURCES.join(' and/or ')}`);
  }
  const server = env.UNISON_SERVER || own.server || DEFAULT_SERVER;
  let parsed;
  try { parsed = new URL(server); } catch { throw usage(`the Unison server ${clip(server, 80)} is not a URL`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw usage('the Unison server must be an http(s) URL with no credentials');
  const base = server.replace(/\/+$/, '');
  // The committed mapping (connect writes it; the repo stays the truth): a workspace id and its URL on this server.
  const workspace = own.workspace;
  if (workspace !== undefined && (typeof workspace !== 'string' || !WORKSPACE_ID.test(workspace))) throw usage('.plates/plates.json "unison.workspace" must be a Unison workspace id (ws_…)');
  // The url's shape is checked on its own; a url for another server than the current one is stale, not invalid:
  // status and sync say so and point at connect, and connect rewrites it.
  let stale = false;
  if (own.url !== undefined) {
    const m = typeof own.url === 'string' ? /^(https?:\/\/[^/?#\s]+)\/w\/([^/?#\s]+)$/.exec(own.url) : null;
    if (!m || workspace === undefined || m[2] !== workspace) throw usage(`.plates/plates.json "unison.url" must be the server URL + /w/${workspace ?? '<workspace>'}, with "unison.workspace"`);
    if (!own.url.startsWith('https://') && !/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//.test(own.url)) throw usage('.plates/plates.json "unison.url" must be https');
    stale = m[1] !== base;
  }
  return { repo, sources, server: base, name: String(config?.name ?? repo.split('/')[1]).trim() || repo.split('/')[1], workspace: stale ? null : workspace ?? null, committed: workspace ?? null, stale };
}
export const WORKSPACE_ID = /^ws_[A-Za-z0-9]+$/;
export const workspaceUrl = (server, id) => `${server}/w/${id}`;
/** A backlog item's page in the web app (as Unison's own app links it). */
export const itemUrl = (server, id, item) => `${workspaceUrl(server, id)}?item=${item}`;

async function onPath(name, env) {
  for (const dir of String(env.PATH ?? '').split(delimiter)) {
    if (!isAbsolute(dir)) continue;
    try { await access(join(dir, name), constants.X_OK); return join(dir, name); } catch { /* not here */ }
  }
  return null;
}

/**
 * One unison call: { ok: true, value } or { ok: false, code, why }. code is
 * missing | not-signed-in | failed | timeout | not-json. The call runs outside
 * any checkout, so an agent's .unison.json never stands in for the owner's sign-in.
 */
export async function callUnison(args, { env = process.env, server, timeout = UNISON_CALL_MS, config } = {}) {
  const bin = await onPath('unison', env);
  if (!bin) return { ok: false, code: 'missing', why: 'the unison CLI is not on PATH' };
  const childEnv = { ...env, UNISON_SERVER: server };
  delete childEnv.UNISON_WORKSPACE; delete childEnv.UNISON_TOKEN; delete childEnv.UNISON_CONFIG;
  // config: the plate's participant session for this workspace (writes need a participant; reads work with the account).
  if (config) childEnv.UNISON_CONFIG = config;
  return new Promise(done => {
    execFile(bin, [...args, '--json'], { cwd: tmpdir(), env: childEnv, timeout, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      const answer = String(stderr ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
      const said = redact(clip(answer || error?.message || ''));
      if (error) {
        if (error.killed || error.signal === 'SIGTERM') return done({ ok: false, code: 'timeout', why: `unison did not answer within ${Math.round(timeout / 1000)}s` });
        if (/have not joined|not joined this workspace/i.test(said)) return done({ ok: false, code: 'not-joined', why: said });
        if (error.code === 4 || /not signed in|unison login|logged out|401/i.test(said)) return done({ ok: false, code: 'not-signed-in', why: said || 'not signed in to Unison' });
        // A transport failure may have landed server-side (uncertain); any other answer is a definite refusal.
        // Only a recognized refusal is definite (nothing landed). A 5xx (500 included), a transport failure, no answer
        // at all, or anything unclassified is uncertain: the write may have landed, so its pending record holds.
        if (answer && !UNCERTAIN.test(answer) && DEFINITE.test(answer)) return done({ ok: false, code: 'failed', why: said });
        return done({ ok: false, code: 'uncertain', why: said || `unison exited ${error.code}` });
      }
      try { done({ ok: true, value: JSON.parse(stdout) }); } catch { done({ ok: false, code: 'not-json', why: 'unison answered with something that is not JSON' }); }
    });
  });
}
const UNCERTAIN = /timed? ?out|timeout|deadline|connection|connect:|dial tcp|\bEOF\b|reset by peer|no such host|network|\b5\d\d\b|server error|internal|bad gateway|unavailable/i;
// The unison CLI prints the server's refusal ("unison: backlog item #9: not found"), not its status: a 4xx code
// named in the answer, or a refusal's own words.
const DEFINITE = /\b4(?:00|03|04|09|22)\b|not found|not a member|forbidden|already exists|invalid|is required|must be|\btaken\b|conflict|bad request|unprocessable/i;
/** Whether a failed write may still have landed (hold its pending), or was refused for certain (clear it). */
export const uncertainFailure = r => !r.ok && ['uncertain', 'timeout', 'not-json'].includes(r.code);
const array = r => (r.ok && !Array.isArray(r.value) ? { ok: false, code: 'not-json', why: 'unison answered without its list' } : r);

/** The workspaces that list this repo: { workspace } for one, { none: true }, or { ambiguous: [ids] }. */
export function findWorkspace(list, repo) {
  const lists = ws => [ws?.repo_url, ...(Array.isArray(ws?.repos) ? ws.repos.map(r => r?.url) : [])].some(u => normalizeRepo(u) === repo);
  const hits = list.filter(ws => typeof ws?.id === 'string' && lists(ws));
  if (hits.length > 1) return { ambiguous: hits.map(ws => ws.id) };
  return hits.length ? { workspace: hits[0] } : { none: true };
}
export const workspaceRepos = ws => [...new Set([ws?.repo_url, ...(Array.isArray(ws?.repos) ? ws.repos.map(r => r?.url) : [])].map(normalizeRepo).filter(Boolean))];

// ---- the map ----------------------------------------------------------------

/**
 * The plate's private map store: read() → the map (empty when none), write(map),
 * lock() → release(), or null when another writer holds it.
 * Privacy is checked on the real paths (the map, the temp file about to be
 * written, the lock), never a stand-in: a negation in .gitignore cannot leave
 * the map visible. The directory carries a .npmignore of `*`, so npm pack in a
 * package with default files never ships it.
 */
export async function createMapStore({ root, env = process.env }) {
  const { safeDirectory, safeRead } = await import('./feedback-store.mjs');
  root = await safeDirectory(resolve(root));
  const dir = join(root, MAP_DIR), file = join(root, MAP_FILE), npmignore = join(dir, '.npmignore');
  const git = args => new Promise((done, fail) => execFile('git', ['-C', root, ...args], { env, encoding: 'utf8', timeout: 10000, maxBuffer: 1 << 20 }, (error, stdout) => error ? fail(Object.assign(error, { stdout })) : done(stdout.trim())));
  // Every path given must be reported ignored (check-ignore lists only ignored paths; a negated match is not one).
  const ignored = async paths => {
    let out = '';
    try { out = await git(['check-ignore', '--no-index', '--', ...paths]); } catch (e) { if (e.code !== 1) throw e; out = String(e.stdout ?? '').trim(); }
    const hit = new Set(out.split('\n').filter(Boolean));
    return paths.every(p => hit.has(p));
  };
  const missing = e => e?.code === 'ENOENT';
  const exists = async path => { try { await lstat(path); return true; } catch (e) { if (missing(e)) return false; throw e; } };
  async function privacy(create, extra = []) {
    try { await git(['rev-parse', '--show-toplevel']); } catch {
      // Outside Git there is no private map; reading one that is not there is no map.
      if (!create && !await exists(dir)) return false;
      throw new UnisonError('the Unison map lives in a Git checkout, and this is not one');
    }
    if (await git(['ls-files', '--', MAP_DIR])) throw new UnisonError(`${MAP_DIR} is tracked by Git; the map is private state`);
    const paths = [MAP_FILE, `${MAP_DIR}/writer.lock`, `${MAP_DIR}/.npmignore`, ...extra];
    let ok = await ignored(paths);
    if (!ok && create) {
      const exclude = resolve(root, await git(['rev-parse', '--git-path', 'info/exclude']));
      await safeDirectory(dirname(exclude), { create: true });
      const h = await open(exclude, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
      try { const st = await h.stat(); if (!st.isFile() || st.nlink !== 1) throw new UnisonError('info/exclude is not a plain file'); await h.writeFile(`${st.size ? '\n' : ''}/${MAP_DIR}/\n`); await h.sync(); } finally { await h.close(); }
      ok = await ignored(paths);
    }
    if (!ok) {
      if (!create && !await exists(dir)) return false;
      throw new UnisonError(`${MAP_DIR} is not git-ignored (a .gitignore rule un-ignores it); the map is private state, so nothing was written`);
    }
    if (create) await safeDirectory(dir, { create: true, privateMode: true });
    try { await safeDirectory(dir, { privateMode: true }); } catch (e) { if (missing(e)) return false; throw e; }
    // The package exclusion: exactly `*`, made when writing, refused when changed.
    try { if ((await safeRead(npmignore, 64, { privateMode: true })).toString() !== '*\n') throw new UnisonError(`${MAP_DIR}/.npmignore is not "*"; the map could be packed`); }
    catch (e) {
      if (e instanceof UnisonError) throw e;
      if (!missing(e)) throw new UnisonError(`${MAP_DIR}/.npmignore could not be read (${e?.code ?? e?.message})`);
      if (!create) { if (await exists(file)) throw new UnisonError(`${MAP_DIR} has no .npmignore; the map could be packed`); return true; }
      const h = await open(npmignore, 'wx', 0o600);
      try { await h.writeFile('*\n'); await h.sync(); } finally { await h.close(); }
    }
    return true;
  }
  return {
    file: MAP_FILE,
    async read() {
      if (!await privacy(false)) return readMap(null);
      let bytes;
      try { bytes = await safeRead(file, MAP_LIMIT, { privateMode: true }); } catch (e) { if (missing(e)) return readMap(null); throw new UnisonError(`the Unison map could not be read (${e?.code ?? e?.message})`); }
      let value;
      try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new UnisonError('the Unison map is not JSON'); }
      return readMap(value);
    },
    async write(map) {
      const name = `.tmp-${randomBytes(8).toString('hex')}`;
      await privacy(true, [`${MAP_DIR}/${name}`]);
      const temp = join(dir, name);
      const h = await open(temp, 'wx', 0o600);
      try { await h.writeFile(`${JSON.stringify(map, null, 2)}\n`); await h.sync(); } finally { await h.close(); }
      try { await rename(temp, file); } finally { await rm(temp, { force: true }); }
    },
    /**
     * Run fn as the checkout's one writer (connect and sync): { ran: true, value } or { ran: false } when another live
     * process holds it. The lock is the channel inbox's (withCursorLock): an owner token published by exclusive link,
     * a dead holder reclaimed by one reclaimer only, and release removing only this owner's token.
     */
    async withLock(fn, { waitMs = LOCK_WAIT_MS } = {}) {
      await privacy(true);
      const { withCursorLock, InboxError } = await import('./channel-owner.mjs');
      try {
        // Age never reclaims a live sync's lock (a long sync holds it for minutes): only a holder process that is gone.
        return { ran: true, value: await withCursorLock(join(dir, 'writer'), fn, { waitMs, staleMs: LOCK_STALE_MS, partialStaleMs: 10_000 }) };
      } catch (e) {
        if (e instanceof InboxError && /^not read: another plates channel inbox/.test(e.message)) return { ran: false };
        if (e instanceof InboxError) throw new UnisonError(e.message.replace(/this session's inbox lock/, 'the Unison writer lock'));
        throw e;
      }
    },
  };
}

// ---- GitHub issues ------------------------------------------------------------

const ghCall = (args, env) => new Promise(done => {
  execFile(environmentValue('variable:KEEL_GH', env) ?? 'gh', args, { env, encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) return done({ ok: false, why: redact(clip(String(stderr ?? '').trim().split('\n').pop() || error.message)) });
    try { done({ ok: true, value: JSON.parse(stdout) }); } catch { done({ ok: false, why: 'gh answered with something that is not JSON' }); }
  });
});

/**
 * The repo's open issues, and the state of each issue the map holds that is not
 * among them (by node id, so a renamed or transferred issue still matches):
 * { ok: true, issues } or { ok: false, why }. Pull requests are not issues.
 */
export async function readIssues({ repo, mappedIds = [], linkedNumbers = [], env = process.env }) {
  const issues = [];
  for (let page = 1; page <= ISSUE_PAGES; page++) {
    const r = await ghCall(['api', `repos/${repo}/issues?state=open&per_page=100&page=${page}`], env);
    if (!r.ok) return { ok: false, why: `GitHub issues not read: ${r.why}` };
    if (!Array.isArray(r.value)) return { ok: false, why: 'GitHub issues not read: no list came back' };
    for (const i of r.value) if (!i?.pull_request && typeof i?.node_id === 'string') issues.push({ node_id: i.node_id, number: i.number, title: i.title, state: 'open', repo });
    if (r.value.length < 100) break;
    if (page === ISSUE_PAGES) return { ok: false, why: `GitHub issues not read: more than ${ISSUE_PAGES * 100} open` };
  }
  // Issues of the plate's repo that existing items link but that are not open (closed, so not in the list above):
  // read one by one, so an unmapped item for a closed issue is still adopted and closed.
  const openNumbers = new Set(issues.map(i => i.number));
  for (const n of [...new Set(linkedNumbers)].filter(n => Number.isSafeInteger(n) && !openNumbers.has(n))) {
    const r = await ghCall(['api', `repos/${repo}/issues/${n}`], env);
    if (!r.ok) { if (/404|Not Found/i.test(r.why)) continue; return { ok: false, why: `GitHub issues not read: ${r.why}` }; }
    const i = r.value;
    if (!i?.pull_request && typeof i?.node_id === 'string') issues.push({ node_id: i.node_id, number: i.number, title: i.title, state: i.state, repo });
  }
  const open = new Set(issues.map(i => i.node_id));
  const rest = mappedIds.filter(id => !open.has(id));
  for (let at = 0; at < rest.length; at += 100) {
    const ids = rest.slice(at, at + 100);
    const query = 'query($ids:[ID!]!){nodes(ids:$ids){... on Issue{id number title state repository{nameWithOwner}}}}';
    const r = await ghCall(['api', 'graphql', '-f', `query=${query}`, ...ids.flatMap(id => ['-f', `ids[]=${id}`])], env);
    const nodes = r.ok ? r.value?.data?.nodes : null;
    if (!Array.isArray(nodes)) return { ok: false, why: `GitHub issues not read: ${r.ok ? 'no nodes came back' : r.why}` };
    for (const n of nodes) if (typeof n?.id === 'string') issues.push({ node_id: n.id, number: n.number, title: n.title, state: n.state, repo: normalizeRepo(n.repository?.nameWithOwner) ?? repo });
  }
  // One source per node id.
  const seen = new Set();
  return { ok: true, issues: issues.filter(i => !seen.has(i.node_id) && seen.add(i.node_id)) };
}

/**
 * Mapped issue items whose line no longer names a workspace repo's issue (the repo
 * was renamed): GitHub resolves the old URL, and when it is the mapped node id the
 * item stays linked. { ok, resolved: Map(item id → { key, line }) } or { ok: false, why }.
 */
export async function resolveRenamed({ items, map, repos, repo, sources, env = process.env }) {
  const byId = new Map(items.map(i => [i.id, i]));
  const known = new Set(sources.filter(s => s.kind === 'issue').map(s => `${s.repo}#${s.number}`));
  const resolved = new Map();
  for (const [key, entry] of Object.entries(map.entries)) {
    if (!key.startsWith('issue:')) continue;
    const item = byId.get(entry.item);
    if (!item) continue;
    const link = parseLink(item.body, repos);
    if (link?.kind === 'issue' && link.repo === repo && known.has(`${link.repo}#${link.number}`)) continue;
    // Each Issue line in turn: the one GitHub resolves to the mapped node id is the item's link (others are prose).
    for (const { url, line } of rawIssueLinks(item.body)) {
      const r = await ghCall(['api', 'graphql', '-f', 'query=query($url:URI!){resource(url:$url){... on Issue{id}}}', '-f', `url=${url}`], env);
      if (!r.ok) return { ok: false, why: `GitHub issues not read: ${r.why}` };
      if (r.value?.data?.resource?.id === key.slice(6)) { resolved.set(item.id, { key, line }); break; }
    }
  }
  return { ok: true, resolved };
}

// ---- the plate's phases ----------------------------------------------------------

/**
 * The plate's phases, read as plates next and plates status read them, in every shape:
 * - the projects shape (docs/projects/<p>/phases.md): lib/phases-projects.mjs, each phase at its heading's anchor;
 * - plates's phases practice: strict(), the CLI's own roadmap read;
 * - a local variant, or a plate without the practice: docs/phases/ read loosely (adopt's reader: front matter
 *   status and the first heading). No docs/phases there is zero phases, read. A file even the loose reader cannot
 *   place (no NN- number or no status) leaves the phases unread.
 */
export async function readPlatePhases({ root, config, strict }) {
  const { shapeOf, readProjects } = await import('./phases-projects.mjs');
  if (shapeOf(config) === 'projects') {
    const { headingAnchor } = await import('./unison-link.mjs');
    const out = [];
    for (const p of (await readProjects(root)).projects) {
      const lines = (await readFile(join(root, p.file), 'utf8')).split(/\r?\n/);
      for (const ph of p.phases) out.push({ project: p.project, id: ph.id, anchor: headingAnchor((lines[ph.line - 1] ?? '').replace(/^##\s+/, '')), title: ph.title, status: ph.status });
    }
    return out;
  }
  const local = config?.local && typeof config.local === 'object' && Object.hasOwn(config.local, 'phases');
  if (config?.phases?.source === 'milestones' || ((config?.practices ?? []).includes('phases') && !local)) return strict();
  const { loosePhases } = await import('./adopt.mjs');
  const { names, loose } = await loosePhases(root);
  if (!names.length) return [];
  const unread = loose.filter(p => !/^\d{1,5}-/.test(p.file) || !p.status);
  if (unread.length) throw new UnisonError(`${unread.length} of ${names.length} phase files have no NN- number or no status, even read loosely (${unread.slice(0, 3).map(p => p.file).join(', ')})`);
  return loose.map(p => ({ id: Number(/^(\d+)/.exec(p.file)[1]), file: p.file, title: (p.heading ?? '').replace(/^Phase\s+\d+\s*[:.—–-]\s*/i, '') || p.file, status: p.status.replace(/^["']|["']$/g, '') }));
}

// ---- the participant session ----------------------------------------------------

/**
 * The plate's participant session for one workspace, outside every checkout:
 * <XDG_CONFIG_HOME or ~/.config>/plates/unison/<server host>/<workspace>.json (directory 0700, file 0600).
 * It holds the participant token the unison CLI writes on join; plates never prints it.
 */
export function sessionPath(server, workspace, env = process.env) {
  const base = env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : join(env.HOME || homedir(), '.config');
  const host = new URL(server).host.replace(/[^A-Za-z0-9.-]/g, '_');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(workspace)) throw new UnisonError('the workspace id is not one plates can name a session file by');
  return join(base, 'plates', 'unison', host, `${workspace}.json`);
}

/** A session file that names this server and workspace and holds a token, or null. Its content is never returned. */
async function validSession(file, server, workspace) {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) return false;
    const v = JSON.parse(await readFile(file, 'utf8'));
    return v?.workspace === workspace && typeof v.token === 'string' && v.token.length > 0 && String(v.server ?? '').replace(/\/+$/, '') === server;
  } catch { return false; }
}

/**
 * The Git working tree a directory is in (through symlinked ancestors: its deepest existing ancestor, realpath'd),
 * or null. Both git's answer and a walk up for .git count.
 */
export async function insideCheckout(dir, env = process.env) {
  let at = resolve(dir);
  for (;;) { try { at = await realpath(at); break; } catch { const up = dirname(at); if (up === at) return null; at = up; } }
  for (let d = at; ; d = dirname(d)) {
    try { await lstat(join(d, '.git')); return d; } catch { /* not here */ }
    if (dirname(d) === d) break;
  }
  return new Promise(done => execFile('git', ['-C', at, 'rev-parse', '--show-toplevel'], { env, encoding: 'utf8', timeout: 10000 }, (error, stdout) => done(error ? null : stdout.trim() || null)));
}

/** One word for the participant's name, from the signed-in account's display name. */
export const participantName = display => (String(display ?? '').trim().split(/\s+/)[0] ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 32) || 'Plates';

/**
 * Join the workspace as the signed-in account (once): { ok, file, joined } or a failed call. An existing valid
 * session is reused; the join writes the session file itself (UNISON_CONFIG), kept 0600 in a 0700 directory.
 */
export async function ensureSession({ settings, workspace, env }) {
  const file = sessionPath(settings.server, workspace, env);
  const inside = await insideCheckout(dirname(file), env);
  if (inside) return { ok: false, code: 'unsafe-session', why: `the session directory ${dirname(file)} is inside the Git checkout ${inside}; the participant token never goes in a checkout (set XDG_CONFIG_HOME outside any repo)` };
  // A session path that exists but is not a plain file (a symlink into a checkout, say) is refused, never treated
  // as absent: join would write the token through it.
  try { const st = await lstat(file); if (!st.isFile() || st.isSymbolicLink()) return { ok: false, code: 'unsafe-session', why: `the session path ${file} is not a plain file (a symlink?); plates writes the participant token only to a plain file outside any checkout` }; }
  catch (e) { if (e?.code !== 'ENOENT') return { ok: false, code: 'unsafe-session', why: `the session path ${file} could not be checked (${e?.code ?? e?.message})` }; }
  if (await validSession(file, settings.server, workspace)) return { ok: true, file, joined: false };
  const who = await callUnison(['whoami', '--user'], { env, server: settings.server });
  if (!who.ok) return who;
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await chmod(dirname(file), 0o700);
  const r = await callUnison(['join', `${settings.server}/w/${workspace}`, '--account', '--name', participantName(who.value?.display_name ?? who.value?.name), '--server', settings.server], { env, server: settings.server, config: file });
  if (!r.ok) return r;
  try { await chmod(file, 0o600); } catch { /* the check below says */ }
  if (!await validSession(file, settings.server, workspace)) return { ok: false, code: 'failed', why: 'unison join answered, but left no session for this workspace' };
  return { ok: true, file, joined: true };
}

// ---- the verbs ----------------------------------------------------------------

const notRead = (r, settings) => ({ read: false, code: r.code, why: r.code === 'not-signed-in' ? `not signed in to Unison at ${settings.server}: run unison login` : r.why });
const signInCard = settings => ({ kind: 'unison-sign-in', title: 'Sign in to Unison on this Mac', command: 'unison login', server: settings.server });

/** The workspace that lists the plate's repo, read: { read, workspace?, none?, ambiguous? } or not read. */
async function locate(settings, env, { committed = false } = {}) {
  // The repo always decides (two workspaces listing it are refused). For status and sync, the committed mapping must
  // agree with what the repo found, and be for this server; otherwise it is stale and connect corrects it.
  if (committed && settings.stale) return { read: false, code: 'committed-mismatch', why: `the committed workspace ${settings.committed} is on another Unison server than ${settings.server}; run plates unison connect` };
  const r = array(await callUnison(['workspace', 'list'], { env, server: settings.server }));
  if (!r.ok) return notRead(r, settings);
  const found = findWorkspace(r.value, settings.repo);
  if (committed && settings.workspace && found.workspace && found.workspace.id !== settings.workspace) return { read: false, code: 'committed-mismatch', why: `the committed workspace ${settings.workspace} does not list ${settings.repo}; run plates unison connect` };
  if (committed && settings.workspace && found.none) return { read: false, code: 'committed-mismatch', why: `the committed workspace ${settings.workspace} does not list ${settings.repo}; run plates unison connect` };
  return { read: true, ...found };
}

/** Everything the plan needs, read; any part unread makes the whole plan unread. */
async function gather({ settings, env, readPhases, map }) {
  const where = await locate(settings, env, { committed: true });
  if (!where.read) return where;
  if (where.ambiguous) return { read: true, ambiguous: where.ambiguous };
  if (where.none) return { read: true, none: true };
  const ws = where.workspace;
  const backlog = array(await callUnison(['backlog', '--workspace', ws.id, '--status', 'all'], { env, server: settings.server }));
  if (!backlog.ok) return { ...notRead(backlog, settings), workspace: ws };
  const items = backlog.value.filter(i => Number.isSafeInteger(i?.id));
  const sources = [];
  if (settings.sources.includes('phases')) {
    let phases;
    try { phases = await readPhases(); } catch (e) { return { read: false, code: 'phases', why: `the plate's phases were not read: ${clip(e?.message ?? e)}`, workspace: ws }; }
    sources.push(...phaseSources(phases, settings.repo));
  }
  if (settings.sources.includes('issues')) {
    const mappedIds = Object.keys(map.entries).filter(k => k.startsWith('issue:')).map(k => k.slice(6));
    const mappedItems = new Set(Object.values(map.entries).map(e => e.item));
    const linkedNumbers = items.filter(i => !mappedItems.has(i.id)).map(i => parseLink(i.body, [settings.repo])).filter(l => l?.kind === 'issue').map(l => l.number);
    const issues = await readIssues({ repo: settings.repo, mappedIds, linkedNumbers, env });
    if (!issues.ok) return { read: false, code: 'issues', why: issues.why, workspace: ws };
    sources.push(...issueSources(issues.issues));
  }
  const repos = workspaceRepos(ws);
  const held = map.workspace && map.workspace !== ws.id ? readMap(null) : map;
  let resolved = new Map();
  if (settings.sources.includes('issues')) {
    const r = await resolveRenamed({ items, map: held, repos, repo: settings.repo, sources, env });
    if (!r.ok) return { read: false, code: 'issues', why: r.why, workspace: ws };
    resolved = r.resolved;
  }
  return { read: true, workspace: ws, items, sources, repos, plan: planSync({ items, sources, map: held, repos, repo: settings.repo, resolved }) };
}

const wsView = ws => (ws ? { id: ws.id, name: typeof ws.name === 'string' ? clip(ws.name, 80) : null } : null);
const counts = plan => Object.fromEntries(['create', 'retitle', 'relink', 'close', 'reopen'].map(op => [op, plan.actions.filter(a => a.op === op).length]));
function planLines(plan) {
  const lines = [];
  for (const a of plan.actions) lines.push(a.op === 'create' ? `  create  ${a.title}` : a.op === 'retitle' ? `  retitle #${a.item} → ${a.title}` : a.op === 'relink' ? `  relink  #${a.item} → its phase's current file` : `  ${a.op.padEnd(7)} #${a.item} (${a.key})`);
  for (const a of plan.adopt) lines.push(`  link    #${a.item} → ${a.key} (its line; the map takes it)`);
  for (const s of plan.suggestions) lines.push(s.kind === 'closed-by-hand' ? `  suggest #${s.item} was closed in Unison while ${s.key} is open: reopen it there, or settle the work` : `  suggest #${s.item} also links ${s.key}: one item per source`);
  for (const g of plan.gaps ?? []) lines.push(`  gap     ${g.what}: plates cannot represent this source, so it is not synced`);
  for (const w of plan.waiting ?? []) lines.push(`  uncertain create for ${w.key}, waiting (sent ${w.since}; added again after 15 minutes if no item carries its line)`);
  for (const u of plan.unlinked) lines.push(u.why === 'gone' ? `  unlinked ${u.key}: its item #${u.item} is gone; plates does not make another` : `  unlinked #${u.item} lost its line for ${u.key}; plates leaves it, and does not make another`);
  return lines;
}

async function status({ root, config, env, readPhases }) {
  const settings = unisonSettings(config, env);
  const store = await createMapStore({ root, env });
  const map = await store.read();
  const base = { plate: settings.name, repo: settings.repo, server: settings.server, sources: settings.sources, map: { file: store.file, workspace: map.workspace, entries: Object.keys(map.entries).length } };
  const g = await gather({ settings, env, readPhases, map });
  if (!g.read) return { data: { ...base, read: false, why: g.why, workspace: wsView(g.workspace), plan: null, ...(g.code === 'not-signed-in' ? { signIn: signInCard(settings) } : {}) }, text: `Unison not read: ${g.why}`, exitCode: 1 };
  if (g.ambiguous) return { data: { ...base, read: true, ambiguous: g.ambiguous, workspace: null, plan: null }, text: `Refused: ${g.ambiguous.length} Unison workspaces list ${settings.repo} (${g.ambiguous.join(', ')}); one repo has one workspace. Remove the repo from all but one.`, exitCode: 1 };
  if (g.none) return { data: { ...base, read: true, workspace: null, plan: null }, text: `No Unison workspace lists ${settings.repo}. plates unison connect makes one.` };
  const plan = g.plan;
  const data = { ...base, read: true, workspace: wsView(g.workspace), url: workspaceUrl(settings.server, g.workspace.id), items: g.items.length, open: g.sources.filter(s => s.open).length, plan: { counts: counts(plan), ...plan } };
  if (plan.stopped) return { data, text: `Unison ${g.workspace.id}: sync would stop. Items #${plan.stopped.items.join(', #')} lost their link lines while other lines would be taken into the map; restore the lines (or delete the items) first.`, exitCode: 1 };
  const lines = planLines(plan);
  const c = counts(plan);
  return { data, text: [`Unison ${g.workspace.id} (${settings.repo}) ${data.url}: ${g.items.length} items; ${data.open} open sources. A sync would create ${c.create}, retitle ${c.retitle}, relink ${c.relink}, close ${c.close}, reopen ${c.reopen}.`, ...lines].join('\n') };
}

const held = settings => ({ data: { plate: settings.name, repo: settings.repo, ran: false, why: 'another sync is running' }, text: 'Not run: another sync is running in this checkout (plates unison connect or sync). Nothing was changed.', exitCode: 1 });

/** Run fn holding the checkout's one Unison writer lock, from before the map read through the last map write. */
async function locked(store, settings, fn) {
  const r = await store.withLock(fn);
  return r.ran ? r.value : held(settings);
}

async function connect({ root, config, env }) {
  const settings = unisonSettings(config, env);
  const store = await createMapStore({ root, env });
  return locked(store, settings, () => connectHeld({ root, settings, store, env }));
}

/**
 * Write the committed mapping into .plates/plates.json ("unison": { workspace, url }, other unison keys kept), only
 * when it differs. Plates never commits it: the owner does. Returns { changed, previous }.
 */
export async function writeMapping(root, settings, id) {
  const file = join(root, '.plates', 'plates.json');
  const config = JSON.parse(await readFile(file, 'utf8'));
  const own = config.unison && typeof config.unison === 'object' && !Array.isArray(config.unison) ? config.unison : {};
  const url = workspaceUrl(settings.server, id);
  if (own.workspace === id && own.url === url) return { changed: false, previous: null };
  config.unison = { ...own, workspace: id, url };
  const temp = `${file}.tmp-${randomBytes(6).toString('hex')}`;
  await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`);
  await rename(temp, file);
  return { changed: true, previous: own.workspace ?? null };
}

async function connectHeld({ root, settings, store, env }) {
  const map = await store.read();
  const base = { plate: settings.name, repo: settings.repo, server: settings.server };
  const where = await locate(settings, env);
  if (!where.read) {
    if (where.code === 'not-signed-in') return { data: { ...base, connected: false, created: false, signIn: signInCard(settings), why: where.why }, text: `Not signed in to Unison at ${settings.server}: run unison login, then plates unison connect. Nothing was created.`, exitCode: 3 };
    return { data: { ...base, connected: false, created: false, read: false, why: where.why }, text: `Unison not read: ${where.why}. Nothing was created.`, exitCode: 1 };
  }
  if (where.ambiguous) return { data: { ...base, connected: false, created: false, ambiguous: where.ambiguous }, text: `Refused: ${where.ambiguous.length} Unison workspaces list ${settings.repo} (${where.ambiguous.join(', ')}); one repo has one workspace.`, exitCode: 1 };
  let ws = where.workspace, created = false;
  const pending = map.pendingWorkspace?.repo === settings.repo ? map.pendingWorkspace : null;
  // A create whose answer was lost may still land: wait for it rather than make a second workspace for the repo.
  if (!ws && pending && Date.now() - Date.parse(pending.at) < PENDING_CREATE_MS) {
    return { data: { ...base, connected: false, created: false, waiting: { repo: settings.repo, since: pending.at } },
      text: `Uncertain workspace create for ${settings.repo}, waiting (sent ${pending.at}); connect again later. After 15 minutes with no workspace listing the repo, connect creates one again.`, exitCode: 1 };
  }
  if (!ws) {
    await store.write({ ...map, pendingWorkspace: { repo: settings.repo, name: settings.name, at: new Date().toISOString() } });
    const r = await callUnison(['workspace', 'create', settings.name, '--repo', repoUrl(settings.repo)], { env, server: settings.server });
    // A definite refusal made nothing: the pending clears, so no 15-minute wait. Only an uncertain failure holds.
    if (!r.ok && !uncertainFailure(r)) await store.write(map);
    if (!r.ok) {
      if (r.code === 'not-signed-in') return { data: { ...base, connected: false, created: false, signIn: signInCard(settings), why: r.why }, text: `Not signed in to Unison at ${settings.server}: run unison login. Nothing was created.`, exitCode: 3 };
      return { data: { ...base, connected: false, created: false, why: r.why }, text: `The workspace was not created: ${r.why}`, exitCode: 1 };
    }
    if (typeof r.value?.id !== 'string') return { data: { ...base, connected: false, created: null, why: 'unison answered without the new workspace id' }, text: 'Unison answered without the new workspace id: check unison workspace list before running connect again.', exitCode: 1 };
    ws = r.value; created = true;
  }
  const replaced = map.workspace && map.workspace !== ws.id ? map.workspace : null;
  const { pendingWorkspace: _pending, ...kept } = map; void _pending;
  await store.write({ ...(replaced ? readMap(null) : kept), workspace: ws.id, repo: settings.repo, server: settings.server });
  // Writes need a participant: join once as the signed-in account, with the session kept outside the checkout.
  const session = await ensureSession({ settings, workspace: ws.id, env });
  const sessionDir = dirname(sessionPath(settings.server, ws.id, env));
  if (!session.ok) {
    if (session.code === 'not-signed-in') return { data: { ...base, connected: false, created, workspace: wsView(ws), joined: false, signIn: signInCard(settings), why: session.why }, text: `Found ${ws.id}, but not signed in to Unison at ${settings.server} to join it: run unison login, then plates unison connect.`, exitCode: 3 };
    return { data: { ...base, connected: false, created, workspace: wsView(ws), joined: false, why: session.why }, text: `Found ${ws.id}, but could not join it to write: ${session.why}. Run plates unison connect again.`, exitCode: 1 };
  }
  const mapping = await writeMapping(root, settings, ws.id);
  const corrected = mapping.changed && mapping.previous && mapping.previous !== ws.id ? mapping.previous : null;
  const mappingText = mapping.changed ? ` ${corrected ? `The committed workspace was ${corrected}, which is not the one listing ${settings.repo}; corrected to ${ws.id}.` : `Wrote the workspace to .plates/plates.json.`} Commit .plates/plates.json.` : '';
  return { data: { ...base, connected: true, created, workspace: wsView(ws), url: workspaceUrl(settings.server, ws.id), replaced, joined: session.joined, sessionDir, map: store.file, committed: { changed: mapping.changed, corrected, file: '.plates/plates.json' } },
    text: `${created ? 'Made' : 'Found'} Unison workspace ${ws.id}${ws.name ? ` (${clip(ws.name, 80)})` : ''} for ${settings.repo}${session.joined ? ', and joined it' : ''}: ${workspaceUrl(settings.server, ws.id)}.${replaced ? ` The map named ${replaced}; it now starts over for ${ws.id}.` : ''}${mappingText} plates unison status shows what a sync would do.` };
}

async function sync({ root, config, env, readPhases }) {
  const settings = unisonSettings(config, env);
  const store = await createMapStore({ root, env });
  if (!(await store.read()).workspace) throw usage('this plate is not connected to Unison: run plates unison connect first');
  return locked(store, settings, () => syncHeld({ settings, store, env, readPhases }));
}

async function syncHeld({ settings, store, env, readPhases }) {
  let map = await store.read();
  if (!map.workspace) throw usage('this plate is not connected to Unison: run plates unison connect first');
  const base = { plate: settings.name, repo: settings.repo, server: settings.server, workspace: map.workspace };
  const g = await gather({ settings, env, readPhases, map });
  if (!g.read) return { data: { ...base, read: false, why: g.why, applied: [], ...(g.code === 'not-signed-in' ? { signIn: signInCard(settings) } : {}) }, text: `Unison not read: ${g.why}. Nothing was changed.`, exitCode: 1 };
  if (g.ambiguous) return { data: { ...base, read: true, ambiguous: g.ambiguous, applied: [] }, text: `Refused: ${g.ambiguous.length} Unison workspaces list ${settings.repo}. Nothing was changed.`, exitCode: 1 };
  if (g.none || g.workspace.id !== map.workspace) return { data: { ...base, read: true, found: g.workspace?.id ?? null, applied: [] }, text: `The map names ${map.workspace}, but ${g.workspace ? `${g.workspace.id} is the workspace that lists ${settings.repo}` : `no workspace lists ${settings.repo}`}: run plates unison connect. Nothing was changed.`, exitCode: 1 };
  const plan = g.plan;
  if (plan.stopped) return { data: { ...base, read: true, stopped: plan.stopped, applied: [] }, text: `Stopped: items #${plan.stopped.items.join(', #')} lost their link lines, so the map is not rebuilt from lines. Restore the lines (or delete the items), then sync. Nothing was changed.`, exitCode: 1 };
  const applied = [];
  const ws = ['--workspace', map.workspace];
  // Writes go as the plate's participant (connect joined it); without a session nothing is sent.
  const session = sessionPath(settings.server, map.workspace, env);
  const usedToken = await readFile(session, 'utf8').then(t => JSON.parse(t).token).catch(() => null);
  if (plan.actions.length && !await validSession(session, settings.server, map.workspace)) {
    return { data: { ...base, read: true, applied, why: 'not joined', hint: 'plates unison connect' }, text: `Not joined to ${map.workspace} as a participant, so nothing was written: run plates unison connect.`, exitCode: 1 };
  }
  // Adopted lines, and closes a dead run left pending (settled by the item's status and close note), go into the map first.
  if (plan.rekey.length || plan.adopt.length || plan.settled.length || plan.expired.length || Object.keys(map.pendingCreates ?? {}).some(k => map.entries[k])) {
    for (const x of plan.rekey) map = mapAfter(map, { op: 'rekey', ...x });
    for (const a of plan.adopt) map = mapAfter(map, { op: 'adopt', ...a });
    for (const x of plan.settled) map = mapAfter(map, { op: 'settle', ...x });
    for (const key of plan.expired) map = mapAfter(map, { op: 'expire', key });
    for (const key of Object.keys(map.pendingCreates ?? {})) if (map.entries[key]) map = mapAfter(map, { op: 'expire', key });
    await store.write(map);
  }
  for (const a of plan.actions) {
    const args = a.op === 'create' ? ['backlog', 'add', a.title, '--body', a.body]
      : a.op === 'retitle' ? ['backlog', 'edit', String(a.item), '--title', a.title, ...(a.body !== undefined ? ['--body', a.body] : [])]
        : a.op === 'relink' ? ['backlog', 'edit', String(a.item), '--body', a.body]
        : a.op === 'close' ? ['backlog', 'close', String(a.item), '--note', a.note]
          : ['backlog', 'reopen', String(a.item)];
    // A close is recorded as pending before it is sent, so a run that dies after Unison closed it still knows sync did.
    if (a.op === 'close') { map = mapAfter(map, { op: 'pending-close', key: a.key, note: a.note }); await store.write(map); }
    // An add that times out may still land: it is recorded as pending first, and a later sync waits for its item.
    if (a.op === 'create') { map = mapAfter(map, { op: 'pending-create', key: a.key, title: a.title, at: new Date().toISOString() }); await store.write(map); }
    const r = await callUnison([...args, ...ws], { env, server: settings.server, config: session });
    const id = a.op === 'create' ? r.value?.id : a.item;
    if (!r.ok || (a.op === 'create' && !Number.isSafeInteger(id))) {
      // A definite refusal changed nothing: clear what was written as pending, so nothing waits on it.
      if (!r.ok && !uncertainFailure(r)) { map = mapAfter(map, { op: a.op === 'create' ? 'expire' : a.op === 'close' ? 'clear-pending-close' : 'none', key: a.key }); await store.write(map); }
      if (r.code === 'not-joined' || r.code === 'not-signed-in') {
        // The session was refused: remove exactly that file (still under the lock, and only while it holds the refused
        // token), so the next connect joins again instead of reusing it.
        const now = await readFile(session, 'utf8').then(t => JSON.parse(t).token).catch(() => null);
        if (usedToken && now === usedToken) await rm(session, { force: true });
        return { data: { ...base, read: true, applied, failed: { op: a.op, key: a.key, why: r.why }, hint: 'plates unison connect' },
          text: `Sync stopped at ${a.op} ${a.key}: Unison refused the write (${r.why}). Run plates unison connect. ${applied.length} applied before it; nothing is pending.`, exitCode: 1 };
      }
      const why = r.ok ? 'unison answered without the new item id' : r.why;
      return { data: { ...base, read: true, applied, failed: { ...a, why }, adopted: plan.adopt, suggestions: plan.suggestions, unlinked: plan.unlinked },
        text: [`Sync stopped at ${a.op} ${a.key}: ${why}.${a.op === 'create' && r.ok ? ' Check the backlog for it before syncing again.' : ''} ${applied.length} applied before it; the map keeps them.`, ...applied.map(x => `  ${x.op} ${x.key} #${x.item}`)].join('\n'), exitCode: 1 };
    }
    if (!['retitle', 'relink'].includes(a.op)) { map = mapAfter(map, a, id); await store.write(map); }
    applied.push({ op: a.op, key: a.key, item: id });
  }
  const lines = [...applied.map(x => `  ${x.op.padEnd(7)} #${x.item} (${x.key})`), ...planLines({ actions: [], adopt: plan.adopt, waiting: plan.waiting, suggestions: plan.suggestions, unlinked: plan.unlinked, gaps: plan.gaps })];
  // Sources plates could not represent were left out: the sync is partial, never reported as complete.
  const partial = (plan.gaps ?? []).length > 0;
  return { data: { ...base, read: true, partial, applied, adopted: plan.adopt, waiting: plan.waiting, suggestions: plan.suggestions, unlinked: plan.unlinked, gaps: plan.gaps ?? [] },
    text: [`Synced Unison ${map.workspace} (${settings.repo}): ${applied.length} change${applied.length === 1 ? '' : 's'}${partial ? `; partial: ${plan.gaps.length} source${plan.gaps.length === 1 ? '' : 's'} could not be synced` : ''}.`, ...lines].join('\n'),
    ...(partial ? { exitCode: 1 } : {}) };
}

async function local({ root, config, env }) {
  const settings = unisonSettings(config, env);
  const store = await createMapStore({ root, env });
  const map = await store.read();
  const data = { plate: settings.name, repo: settings.repo, server: settings.server, sources: settings.sources, connected: Boolean(map.workspace), workspace: map.workspace, entries: Object.keys(map.entries).length, map: store.file, read: 'local' };
  return { data, text: [map.workspace ? `Unison: ${settings.repo} is connected to ${map.workspace}; the map holds ${data.entries} item${data.entries === 1 ? '' : 's'} (local; nothing remote read).` : `Unison: ${settings.repo} is not connected (local; nothing remote read).`,
    'plates unison status — the plan; connect — find or make the workspace; sync — carry out the plan'].join('\n') };
}

/** The command that shows a URL on this machine (open on macOS, xdg-open elsewhere with a display), or null. */
async function opener(env) {
  if (process.platform === 'darwin') return onPath('open', env);
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return null;
  return onPath('xdg-open', env);
}

/**
 * plates unison open [--item <phase>]: the workspace's page, or one phase's item. The workspace is the committed one
 * (connect wrote it) or the map's; the item is the map's, else the backlog item whose link line names the phase.
 * Under --json, or with nothing to open it with, the URL is printed only.
 */
async function openPage({ root, config, env, json, item: phase, readPhases }) {
  const settings = unisonSettings(config, env);
  const map = await (await createMapStore({ root, env })).read();
  // A mapping for another server is never carried over: the id (and its items) mean nothing on this one.
  const mapElsewhere = map.server !== undefined && map.server !== settings.server;
  if (settings.stale || (!settings.workspace && mapElsewhere)) {
    return { data: { url: null, item: null, why: 'the workspace mapping is for another Unison server' }, text: `The workspace mapping is for another Unison server than ${settings.server}: run plates unison connect.`, exitCode: 1 };
  }
  const id = settings.workspace ?? map.workspace;
  if (!id) throw usage('this plate is not connected to Unison: run plates unison connect first');
  let url = workspaceUrl(settings.server, id), item = null;
  if (phase !== undefined) {
    // <n>, or <project>/<n>: any project name the phase reader accepts (spaces, Unicode).
    const slash = phase.lastIndexOf('/');
    const project = slash < 0 ? undefined : phase.slice(0, slash), number = phase.slice(slash + 1);
    if (!/^\d{1,5}(?:\.\d{1,5})?$/.test(number) || (project !== undefined && !/^[^/\\\x00-\x1f]{1,200}$/u.test(project))) throw usage('--item takes a phase: <n>, or <project>/<n> in the projects shape');
    // The phase's exact source key(s), from the plate's own phases (a number two headings share names both).
    let phases;
    try { phases = await readPhases(); } catch (e) { return { data: { url, item: null, why: `the plate's phases were not read: ${clip(e?.message ?? e)}` }, text: `The plate's phases were not read: ${clip(e?.message ?? e)}`, exitCode: 1 }; }
    const sources = phaseSources(phases, settings.repo).filter(x => x.kind === 'phase');
    const wanted = new Set(sources.filter(x => String(x.id) === number && x.project === project).map(x => x.key));
    if (!wanted.size) return { data: { url, item: null, phase }, text: `No phase ${phase} in this plate: ${url}`, exitCode: 1 };
    // The map's items only when the map is for this workspace; otherwise this workspace's backlog, by link line.
    if (map.workspace === id && !mapElsewhere) {
      const mapped = [...new Set(Object.entries(map.entries).filter(([key]) => wanted.has(key)).map(([, e]) => e.item))];
      if (mapped.length > 1) return { data: { url, item: null, phase, items: mapped, keys: [...wanted] }, text: `Phase ${phase} is linked from items #${mapped.join(', #')} (${[...wanted].join(', ')}): open the workspace and pick one: ${url}`, exitCode: 1 };
      item = mapped[0] ?? null;
    }
    if (item === null) {
      const r = array(await callUnison(['backlog', '--workspace', id, '--status', 'all'], { env, server: settings.server }));
      if (!r.ok) return { data: { url, item: null, why: r.why }, text: `Unison not read: ${r.why}`, exitCode: 1 };
      const match = lineMatcher({ sources, repos: [settings.repo], repo: settings.repo });
      const found = r.value.filter(i => Number.isSafeInteger(i?.id) && wanted.has(match(i)?.key));
      if (found.length > 1) return { data: { url, item: null, phase, items: found.map(i => i.id), keys: [...wanted] }, text: `Phase ${phase} is linked from items #${found.map(i => i.id).join(', #')} (${[...wanted].join(', ')}): open the workspace and pick one: ${url}`, exitCode: 1 };
      item = found[0]?.id ?? null;
    }
    if (item === null) return { data: { url, item: null, phase }, text: `No item links phase ${phase} in ${id} yet: ${url}`, exitCode: 1 };
    url = itemUrl(settings.server, id, item);
  }
  const bin = json ? null : await opener(env);
  if (!bin) return { data: { url, workspace: id, item, opened: false }, text: url };
  const ok = await new Promise(done => execFile(bin, [url], { env, timeout: 10_000 }, error => done(!error)));
  return { data: { url, workspace: id, item, opened: ok }, text: ok ? `Opened ${url}` : `Could not open it here: ${url}`, exitCode: ok ? 0 : 1 };
}

/** plates unison [status|connect|sync|open [--item <phase>]] [--json]. readPhases: () => the plate's phases. */
export async function unisonCommand({ args, root, config, env = process.env, readPhases }) {
  const json = args.includes('--json');
  const rest = args.filter(a => a !== '--json');
  const [sub, ...extra] = rest;
  if (sub === 'open') {
    const at = extra.indexOf('--item');
    const item = at < 0 ? undefined : extra[at + 1];
    if (at >= 0 && (item === undefined || item.startsWith('--'))) throw usage('--item needs a phase');
    const left = at < 0 ? extra : extra.filter((_, i) => i !== at && i !== at + 1);
    if (left.length) throw usage(`unexpected argument: ${left[0]}`);
    return openPage({ root, config, env, json, item, readPhases });
  }
  if (extra.length) throw usage(`unexpected argument: ${extra[0]}`);
  const run = { status, connect, sync }[sub] ?? (sub === undefined ? local : null);
  if (!run) throw usage(`plates unison: status, connect, sync or open (got ${clip(sub, 40)})`);
  return run({ root, config, env, readPhases });
}
