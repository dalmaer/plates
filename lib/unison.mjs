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
import { access, lstat, open, rename, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { environmentValue } from './names.mjs';
import { UNISON_SOURCES, normalizeRepo, repoUrl, phaseSources, issueSources, readMap, planSync, mapAfter, parseLink, rawIssueLink } from './unison-link.mjs';

export const DEFAULT_SERVER = 'https://unison.cloud.run';
export const MAP_DIR = '.plates/unison';
export const MAP_FILE = `${MAP_DIR}/map.json`;
/** One unison call; a slow Unison is not read, never waited on. */
export const UNISON_CALL_MS = 20_000;
const MAP_LIMIT = 4 * 1024 * 1024;
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
  return { repo, sources, server: server.replace(/\/+$/, ''), name: String(config?.name ?? repo.split('/')[1]).trim() || repo.split('/')[1] };
}

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
export async function callUnison(args, { env = process.env, server, timeout = UNISON_CALL_MS } = {}) {
  const bin = await onPath('unison', env);
  if (!bin) return { ok: false, code: 'missing', why: 'the unison CLI is not on PATH' };
  const childEnv = { ...env, UNISON_SERVER: server };
  delete childEnv.UNISON_WORKSPACE; delete childEnv.UNISON_TOKEN;
  return new Promise(done => {
    execFile(bin, [...args, '--json'], { cwd: tmpdir(), env: childEnv, timeout, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      const said = redact(clip(String(stderr ?? '').trim().split('\n').filter(Boolean).pop() ?? error?.message ?? ''));
      if (error) {
        if (error.killed || error.signal === 'SIGTERM') return done({ ok: false, code: 'timeout', why: `unison did not answer within ${Math.round(timeout / 1000)}s` });
        if (error.code === 4 || /not signed in|unison login|logged out|401/i.test(said)) return done({ ok: false, code: 'not-signed-in', why: said || 'not signed in to Unison' });
        return done({ ok: false, code: 'failed', why: said || `unison exited ${error.code}` });
      }
      try { done({ ok: true, value: JSON.parse(stdout) }); } catch { done({ ok: false, code: 'not-json', why: 'unison answered with something that is not JSON' }); }
    });
  });
}
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
  const dir = join(root, MAP_DIR), file = join(root, MAP_FILE), lockFile = join(dir, '.lock'), npmignore = join(dir, '.npmignore');
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
    const paths = [MAP_FILE, `${MAP_DIR}/.lock`, `${MAP_DIR}/.npmignore`, ...extra];
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
    /** The checkout's one writer (connect and sync): release(), or null when another live process holds it. */
    async lock() {
      await privacy(true);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const h = await open(lockFile, 'wx', 0o600);
          try { await h.writeFile(JSON.stringify({ pid: process.pid, host: hostname() })); await h.sync(); } finally { await h.close(); }
          return async () => { await rm(lockFile, { force: true }); };
        } catch (e) {
          if (e?.code !== 'EEXIST') throw e;
          // A lock left by a process on this host that is gone is taken over; any other is held.
          let holder = null;
          try { holder = JSON.parse((await safeRead(lockFile, 1024, { privateMode: true })).toString()); } catch { /* being written: held */ }
          const alive = pid => { try { process.kill(pid, 0); return true; } catch (err) { return err?.code === 'EPERM'; } };
          if (!holder || holder.host !== hostname() || !Number.isSafeInteger(holder.pid) || alive(holder.pid)) return null;
          await rm(lockFile, { force: true });
        }
      }
      return null;
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
export async function readIssues({ repo, mappedIds = [], env = process.env }) {
  const issues = [];
  for (let page = 1; page <= ISSUE_PAGES; page++) {
    const r = await ghCall(['api', `repos/${repo}/issues?state=open&per_page=100&page=${page}`], env);
    if (!r.ok) return { ok: false, why: `GitHub issues not read: ${r.why}` };
    if (!Array.isArray(r.value)) return { ok: false, why: 'GitHub issues not read: no list came back' };
    for (const i of r.value) if (!i?.pull_request && typeof i?.node_id === 'string') issues.push({ node_id: i.node_id, number: i.number, title: i.title, state: 'open', repo });
    if (r.value.length < 100) break;
    if (page === ISSUE_PAGES) return { ok: false, why: `GitHub issues not read: more than ${ISSUE_PAGES * 100} open` };
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
  return { ok: true, issues };
}

/**
 * Mapped issue items whose line no longer names a workspace repo's issue (the repo
 * was renamed): GitHub resolves the old URL, and when it is the mapped node id the
 * item stays linked. { ok, resolved: Map(item id → key) } or { ok: false, why }.
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
    const url = rawIssueLink(item.body);
    if (!url) continue;
    const r = await ghCall(['api', 'graphql', '-f', 'query=query($url:URI!){resource(url:$url){... on Issue{id}}}', '-f', `url=${url}`], env);
    if (!r.ok) return { ok: false, why: `GitHub issues not read: ${r.why}` };
    if (r.value?.data?.resource?.id === key.slice(6)) resolved.set(item.id, key);
  }
  return { ok: true, resolved };
}

// ---- the verbs ----------------------------------------------------------------

const notRead = (r, settings) => ({ read: false, code: r.code, why: r.code === 'not-signed-in' ? `not signed in to Unison at ${settings.server}: run unison login` : r.why });
const signInCard = settings => ({ kind: 'unison-sign-in', title: 'Sign in to Unison on this Mac', command: 'unison login', server: settings.server });

/** The workspace that lists the plate's repo, read: { read, workspace?, none?, ambiguous? } or not read. */
async function locate(settings, env) {
  const r = array(await callUnison(['workspace', 'list'], { env, server: settings.server }));
  if (!r.ok) return notRead(r, settings);
  return { read: true, ...findWorkspace(r.value, settings.repo) };
}

/** Everything the plan needs, read; any part unread makes the whole plan unread. */
async function gather({ settings, env, readPhases, map }) {
  const where = await locate(settings, env);
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
    const issues = await readIssues({ repo: settings.repo, mappedIds, env });
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
const counts = plan => Object.fromEntries(['create', 'retitle', 'close', 'reopen'].map(op => [op, plan.actions.filter(a => a.op === op).length]));
function planLines(plan) {
  const lines = [];
  for (const a of plan.actions) lines.push(a.op === 'create' ? `  create  ${a.title}` : a.op === 'retitle' ? `  retitle #${a.item} → ${a.title}` : `  ${a.op.padEnd(7)} #${a.item} (${a.key})`);
  for (const a of plan.adopt) lines.push(`  link    #${a.item} → ${a.key} (its line; the map takes it)`);
  for (const s of plan.suggestions) lines.push(s.kind === 'closed-by-hand' ? `  suggest #${s.item} was closed in Unison while ${s.key} is open: reopen it there, or settle the work` : `  suggest #${s.item} also links ${s.key}: one item per source`);
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
  const data = { ...base, read: true, workspace: wsView(g.workspace), items: g.items.length, open: g.sources.filter(s => s.open).length, plan: { counts: counts(plan), ...plan } };
  if (plan.stopped) return { data, text: `Unison ${g.workspace.id}: sync would stop. Items #${plan.stopped.items.join(', #')} lost their link lines while other lines would be taken into the map; restore the lines (or delete the items) first.`, exitCode: 1 };
  const lines = planLines(plan);
  const c = counts(plan);
  return { data, text: [`Unison ${g.workspace.id} (${settings.repo}): ${g.items.length} items; ${data.open} open sources. A sync would create ${c.create}, retitle ${c.retitle}, close ${c.close}, reopen ${c.reopen}.`, ...lines].join('\n') };
}

const held = settings => ({ data: { plate: settings.name, repo: settings.repo, ran: false, why: 'another sync is running' }, text: 'Not run: another sync is running in this checkout (plates unison connect or sync). Nothing was changed.', exitCode: 1 });

/** Run fn holding the checkout's one Unison writer lock, from before the map read through the last map write. */
async function locked(store, settings, fn) {
  const release = await store.lock();
  if (!release) return held(settings);
  try { return await fn(); } finally { await release(); }
}

async function connect({ root, config, env }) {
  const settings = unisonSettings(config, env);
  const store = await createMapStore({ root, env });
  return locked(store, settings, () => connectHeld({ settings, store, env }));
}

async function connectHeld({ settings, store, env }) {
  const map = await store.read();
  const base = { plate: settings.name, repo: settings.repo, server: settings.server };
  const where = await locate(settings, env);
  if (!where.read) {
    if (where.code === 'not-signed-in') return { data: { ...base, connected: false, created: false, signIn: signInCard(settings), why: where.why }, text: `Not signed in to Unison at ${settings.server}: run unison login, then plates unison connect. Nothing was created.`, exitCode: 3 };
    return { data: { ...base, connected: false, created: false, read: false, why: where.why }, text: `Unison not read: ${where.why}. Nothing was created.`, exitCode: 1 };
  }
  if (where.ambiguous) return { data: { ...base, connected: false, created: false, ambiguous: where.ambiguous }, text: `Refused: ${where.ambiguous.length} Unison workspaces list ${settings.repo} (${where.ambiguous.join(', ')}); one repo has one workspace.`, exitCode: 1 };
  let ws = where.workspace, created = false;
  if (!ws) {
    const r = await callUnison(['workspace', 'create', settings.name, '--repo', repoUrl(settings.repo)], { env, server: settings.server });
    if (!r.ok) {
      if (r.code === 'not-signed-in') return { data: { ...base, connected: false, created: false, signIn: signInCard(settings), why: r.why }, text: `Not signed in to Unison at ${settings.server}: run unison login. Nothing was created.`, exitCode: 3 };
      return { data: { ...base, connected: false, created: false, why: r.why }, text: `The workspace was not created: ${r.why}`, exitCode: 1 };
    }
    if (typeof r.value?.id !== 'string') return { data: { ...base, connected: false, created: null, why: 'unison answered without the new workspace id' }, text: 'Unison answered without the new workspace id: check unison workspace list before running connect again.', exitCode: 1 };
    ws = r.value; created = true;
  }
  const replaced = map.workspace && map.workspace !== ws.id ? map.workspace : null;
  await store.write({ ...(replaced ? readMap(null) : map), workspace: ws.id, repo: settings.repo });
  return { data: { ...base, connected: true, created, workspace: wsView(ws), replaced, map: store.file },
    text: `${created ? 'Made' : 'Found'} Unison workspace ${ws.id}${ws.name ? ` (${clip(ws.name, 80)})` : ''} for ${settings.repo}.${replaced ? ` The map named ${replaced}; it now starts over for ${ws.id}.` : ''} plates unison status shows what a sync would do.` };
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
  // Adopted lines, and closes a dead run left pending (settled by the item's status and close note), go into the map first.
  if (plan.adopt.length || plan.settled.length) {
    for (const a of plan.adopt) map = mapAfter(map, { op: 'adopt', ...a });
    for (const x of plan.settled) map = mapAfter(map, { op: 'settle', ...x });
    await store.write(map);
  }
  for (const a of plan.actions) {
    const args = a.op === 'create' ? ['backlog', 'add', a.title, '--body', a.body]
      : a.op === 'retitle' ? ['backlog', 'edit', String(a.item), '--title', a.title, ...(a.body !== undefined ? ['--body', a.body] : [])]
        : a.op === 'close' ? ['backlog', 'close', String(a.item), '--note', a.note]
          : ['backlog', 'reopen', String(a.item)];
    // A close is recorded as pending before it is sent, so a run that dies after Unison closed it still knows sync did.
    if (a.op === 'close') { map = mapAfter(map, { op: 'pending-close', key: a.key, note: a.note }); await store.write(map); }
    const r = await callUnison([...args, ...ws], { env, server: settings.server });
    const id = a.op === 'create' ? r.value?.id : a.item;
    if (!r.ok || (a.op === 'create' && !Number.isSafeInteger(id))) {
      const why = r.ok ? 'unison answered without the new item id' : r.why;
      return { data: { ...base, read: true, applied, failed: { ...a, why }, adopted: plan.adopt, suggestions: plan.suggestions, unlinked: plan.unlinked },
        text: [`Sync stopped at ${a.op} ${a.key}: ${why}.${a.op === 'create' && r.ok ? ' Check the backlog for it before syncing again.' : ''} ${applied.length} applied before it; the map keeps them.`, ...applied.map(x => `  ${x.op} ${x.key} #${x.item}`)].join('\n'), exitCode: 1 };
    }
    if (a.op !== 'retitle') { map = mapAfter(map, a, id); await store.write(map); }
    applied.push({ op: a.op, key: a.key, item: id });
  }
  const lines = [...applied.map(x => `  ${x.op.padEnd(7)} #${x.item} (${x.key})`), ...planLines({ actions: [], adopt: plan.adopt, suggestions: plan.suggestions, unlinked: plan.unlinked })];
  return { data: { ...base, read: true, applied, adopted: plan.adopt, suggestions: plan.suggestions, unlinked: plan.unlinked },
    text: [`Synced Unison ${map.workspace} (${settings.repo}): ${applied.length} change${applied.length === 1 ? '' : 's'}.`, ...lines].join('\n') };
}

async function local({ root, config, env }) {
  const settings = unisonSettings(config, env);
  const store = await createMapStore({ root, env });
  const map = await store.read();
  const data = { plate: settings.name, repo: settings.repo, server: settings.server, sources: settings.sources, connected: Boolean(map.workspace), workspace: map.workspace, entries: Object.keys(map.entries).length, map: store.file, read: 'local' };
  return { data, text: [map.workspace ? `Unison: ${settings.repo} is connected to ${map.workspace}; the map holds ${data.entries} item${data.entries === 1 ? '' : 's'} (local; nothing remote read).` : `Unison: ${settings.repo} is not connected (local; nothing remote read).`,
    'plates unison status — the plan; connect — find or make the workspace; sync — carry out the plan'].join('\n') };
}

/** plates unison [status|connect|sync] [--json]. readPhases: () => the plate's phases (roadmap collect). */
export async function unisonCommand({ args, root, config, env = process.env, readPhases }) {
  const rest = args.filter(a => a !== '--json');
  const [sub, ...extra] = rest;
  if (extra.length) throw usage(`unexpected argument: ${extra[0]}`);
  const run = { status, connect, sync }[sub] ?? (sub === undefined ? local : null);
  if (!run) throw usage(`plates unison: status, connect or sync (got ${clip(sub, 40)})`);
  return run({ root, config, env, readPhases });
}
