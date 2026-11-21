// Each plate's work is its Unison backlog, and links back (plates phase 200).
// Pure: no file, network or process access. lib/unison.mjs reads and applies.
//
// The link line. An item links to its phase or issue by one line at the start
// of a line in its body:
//
//   Phase: https://github.com/<owner>/<repo>/blob/main/docs/phases/<file>
//   Issue: https://github.com/<owner>/<repo>/issues/<n>
//
// The first such line naming one of the workspace's repos counts; a line for
// another repo, a URL anywhere else, or a Markdown link is prose. Plates
// writes the line as the body's last line and escapes any copied line that
// would read as one (a leading backslash: `\Phase:`), so copied text can never
// name a different link.
//
// The map (per plate, private): source key → { item, closedBySync }. A source
// key is `phase:<id>` or `issue:<GitHub node id>`. The line is the link people
// see; the map is what stops a duplicate. The plan never creates an item for a
// source the map holds, and lines are adopted into the map only while every
// item the map holds still carries its line.

export const UNISON_SOURCES = Object.freeze(['phases', 'issues']);
export const MAP_SCHEMA = 1;
const LINK = /^(Phase|Issue): (\S+)\s*$/;
const COPIED_LINK = /^(\\*)(Phase|Issue):/;

/**
 * A GitHub repo as `owner/repo`, lower-cased, from a URL or a slug: http or
 * https, www., a trailing .git or /, git@github.com:owner/repo. Anything else: null.
 */
export function normalizeRepo(value) {
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s || s.length > 300) return null;
  const ssh = /^git@github\.com:(.+)$/i.exec(s);
  if (ssh) s = ssh[1];
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    let url;
    try { url = new URL(s); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()) || url.port || url.username || url.password) return null;
    s = url.pathname;
  }
  s = s.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(s);
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return `${m[1]}/${m[2]}`.toLowerCase();
}

/** The URL plates gives a repo when it creates a workspace for it. */
export const repoUrl = repo => `https://github.com/${repo}`;
export const phaseUrl = (repo, file) => `https://github.com/${repo}/blob/main/docs/phases/${file}`;
export const issueUrl = (repo, number) => `https://github.com/${repo}/issues/${number}`;
const PHASE_FILE = /^(\d{1,5})-[A-Za-z0-9._-]*\.md$/;

/** What one URL from a link line names, for these repos (normalized), or null. */
function linkTarget(kind, url, repos) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || !['github.com', 'www.github.com'].includes(u.hostname.toLowerCase()) || u.search || u.hash) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const repo = normalizeRepo(`${parts[0]}/${parts[1]}`);
  if (!repo || !repos.includes(repo)) return null;
  if (kind === 'Issue') {
    if (parts.length !== 4 || parts[2] !== 'issues' || !/^[1-9]\d{0,9}$/.test(parts[3])) return null;
    return { kind: 'issue', repo, number: Number(parts[3]), url };
  }
  // Phase: .../blob/<ref>/docs/phases/<NN-name>.md
  if (parts.length !== 7 || parts[2] !== 'blob' || parts[4] !== 'docs' || parts[5] !== 'phases') return null;
  let file;
  try { file = decodeURIComponent(parts[6]); } catch { return null; } // a malformed escape (%ZZ) is prose, never a failed plan
  const m = PHASE_FILE.exec(file);
  if (!m) return null;
  return { kind: 'phase', repo, file, id: Number(m[1]), url };
}

/**
 * The link an item's body carries for these workspace repos, or null: the first
 * line that starts with `Phase: ` or `Issue: ` and whose URL names one of them.
 */
export function parseLink(body, repos) {
  if (typeof body !== 'string') return null;
  const known = (repos ?? []).map(normalizeRepo).filter(Boolean);
  for (const line of body.split(/\r?\n/)) {
    const m = LINK.exec(line);
    if (!m) continue;
    const target = linkTarget(m[1], m[2], known);
    if (target) return target;
  }
  return null;
}

/** Copied text with every line that would read as a link line escaped (one more leading backslash). */
export function escapeCopied(text) {
  return String(text ?? '').split(/\r?\n/).map(line => (COPIED_LINK.test(line) ? `\\${line}` : line)).join('\n');
}

/** The link line for a source. */
export const linkLine = source => `${source.kind === 'issue' ? 'Issue' : 'Phase'}: ${source.url}`;

/** An item's body: the copied text, escaped, then its own link line last. */
export function writeBody(text, source) {
  const copied = escapeCopied(text).trim();
  return `${copied ? `${copied}\n\n` : ''}${linkLine(source)}`;
}

/** The item title a source owns. */
export const sourceTitle = source => (source.kind === 'issue' ? `Issue #${source.number}: ${source.title}` : `Phase ${source.id}: ${source.title}`);

/** A phase is open while its status is not built, lived-in or superseded. */
export const phaseOpen = status => !['built', 'lived-in', 'superseded'].includes(status);

/** A phase's source key names its repo: two repos' phase 2 are two sources. */
export const phaseKey = (repo, id) => `phase:${normalizeRepo(repo)}:${id}`;
const KEY = /^(?:phase:[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9._-]{1,100}:\d{1,5}|issue:[A-Za-z0-9_=-]{1,100})$/;

/** The first `Issue: <url>` line naming any GitHub repo (for resolving a renamed repo's URL), or null. */
export function rawIssueLink(body) {
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const m = LINK.exec(line);
    if (!m || m[1] !== 'Issue') continue;
    const repo = (() => { try { const u = new URL(m[2]); const parts = u.pathname.split('/').filter(Boolean); return parts.length === 4 && parts[2] === 'issues' && /^[1-9]\d{0,9}$/.test(parts[3]) ? normalizeRepo(`${parts[0]}/${parts[1]}`) : null; } catch { return null; } })();
    if (repo) return m[2];
  }
  return null;
}

/** The body with its first link line replaced by the source's own (a renamed repo's URL brought current). */
export function relink(body, source) {
  const lines = String(body ?? '').split(/\r?\n/);
  const at = lines.findIndex(l => LINK.test(l));
  if (at < 0) return writeBody(body, source);
  lines[at] = linkLine(source);
  return lines.join('\n');
}

/** The phases of a roadmap as sources. */
export function phaseSources(phases, repo) {
  return (phases ?? []).filter(p => Number.isSafeInteger(p?.id) && typeof p.file === 'string').map(p => ({
    key: phaseKey(repo, p.id), kind: 'phase', id: p.id, repo, file: p.file, title: String(p.title ?? '').trim() || p.file,
    open: phaseOpen(p.status), status: p.status, url: phaseUrl(repo, p.file), text: p.done ? `Done when: ${p.done}` : '',
  }));
}

/** GitHub issues ({ node_id, number, title, state, repo }) as sources. */
export function issueSources(issues) {
  return (issues ?? []).filter(i => typeof i?.node_id === 'string' && Number.isSafeInteger(i.number) && normalizeRepo(i.repo)).map(i => ({
    key: `issue:${i.node_id}`, kind: 'issue', number: i.number, repo: normalizeRepo(i.repo), title: String(i.title ?? '').trim() || `#${i.number}`,
    open: String(i.state).toLowerCase() === 'open', url: issueUrl(normalizeRepo(i.repo), i.number), text: '',
  }));
}

/**
 * An empty map, or the stored one if it has the right shape; anything else throws (a map is never guessed).
 * An entry is { item, closedBySync, pendingClose? }: pendingClose is the note of a close sent but not yet confirmed.
 */
export function readMap(value) {
  if (value === null || value === undefined) return { schema: MAP_SCHEMA, workspace: null, repo: null, entries: {} };
  if (!value || typeof value !== 'object' || value.schema !== MAP_SCHEMA || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) throw new Error('the Unison map is not one plates wrote');
  const entries = {};
  for (const [stored, entry] of Object.entries(value.entries)) {
    // A map written before phase keys named their repo: phase:<n> is the map's own repo's.
    const key = /^phase:\d{1,5}$/.test(stored) && normalizeRepo(value.repo) ? phaseKey(value.repo, stored.slice(6)) : stored;
    entries[key] = entry;
    if (!KEY.test(key) || !Number.isSafeInteger(entry?.item) || typeof entry.closedBySync !== 'boolean' || (entry.pendingClose !== undefined && typeof entry.pendingClose !== 'string')) throw new Error(`the Unison map's entry ${key} is not one plates wrote`);
  }
  return { schema: MAP_SCHEMA, workspace: typeof value.workspace === 'string' ? value.workspace : null, repo: typeof value.repo === 'string' ? value.repo : null, entries };
}

const isDone = item => item.status === 'done';

/**
 * What a sync would do. items: the workspace's backlog (every status); sources:
 * phaseSources/issueSources; map: readMap; repos: the workspace's repos; repo: the
 * plate's own repo (only items whose line names it are linked, adopted or closed);
 * resolved: Map(item id → issue source key) for mapped items whose old issue URL
 * GitHub resolved to the same node id (a renamed repo).
 * Returns { actions, adopt, settled, suggestions, unlinked, stopped }:
 *   settled      [{ key, closedBySync }]  closes left pending by a run that died
 *   actions      [{ op: create|retitle|close|reopen, key, item?, title?, body?, note? }]
 *   adopt        [{ key, item }]   lines the map does not hold yet, taken into it
 *   suggestions  [{ kind, key, item }]   for a person: closed-by-hand, duplicate
 *   unlinked     [{ key, item, why }]    mapped items that lost their line, or are gone
 *   stopped      null, or { reason: 'lost-lines', items } when lines would be adopted
 *                while a mapped item lacks its line: then nothing is planned.
 */
export function planSync({ items, sources, map, repos, repo, resolved = new Map() }) {
  const own = normalizeRepo(repo);
  const byId = new Map(items.map(i => [i.id, i]));
  const issueKey = new Map(sources.filter(s => s.kind === 'issue').map(s => [`${s.repo}#${s.number}`, s.key]));
  // Each item's line, as a source key: only a line naming the plate's own repo (or resolved to its issue) links.
  const lineKey = item => {
    const link = parseLink(item.body, repos);
    const key = !link || link.repo !== own ? null : link.kind === 'phase' ? phaseKey(own, link.id) : issueKey.get(`${link.repo}#${link.number}`) ?? null;
    return key ?? resolved.get(item.id) ?? null;
  };
  const lines = new Map(items.map(i => [i.id, lineKey(i)]));
  const entries = { ...map.entries };
  // A close sent by a run that died before recording it: the item's status and close note say whether sync closed it.
  const settled = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (entry.pendingClose === undefined) continue;
    const item = byId.get(entry.item);
    const closedBySync = Boolean(item && isDone(item) && item.close_note === entry.pendingClose);
    settled.push({ key, closedBySync });
    entries[key] = { item: entry.item, closedBySync: closedBySync || entry.closedBySync };
  }
  const unlinked = [], suggestions = [], adopt = [];
  const mappedItems = new Set(Object.values(entries).map(e => e.item));
  for (const [key, entry] of Object.entries(entries)) {
    const item = byId.get(entry.item);
    if (!item) unlinked.push({ key, item: entry.item, why: 'gone' });
    else if (lines.get(item.id) !== key) unlinked.push({ key, item: entry.item, why: 'lost-line' });
  }
  // Lines the map does not hold: adopted only when no mapped item lost its line.
  const byLine = new Map();
  for (const item of items) {
    const key = lines.get(item.id);
    if (!key || mappedItems.has(item.id)) continue;
    if (entries[key]) { suggestions.push({ kind: 'duplicate', key, item: item.id }); continue; }
    (byLine.get(key) ?? byLine.set(key, []).get(key)).push(item.id);
  }
  for (const [key, ids] of byLine) {
    ids.sort((a, b) => a - b);
    adopt.push({ key, item: ids[0] });
    for (const id of ids.slice(1)) suggestions.push({ kind: 'duplicate', key, item: id });
  }
  const lost = unlinked.filter(u => u.why === 'lost-line');
  if (adopt.length && lost.length) {
    return { actions: [], adopt: [], settled: [], suggestions, unlinked, stopped: { reason: 'lost-lines', items: lost.map(u => u.item) } };
  }
  for (const a of adopt) entries[a.key] = { item: a.item, closedBySync: false };
  const broken = new Set(unlinked.map(u => u.key));
  const actions = [];
  for (const source of sources) {
    const entry = entries[source.key];
    if (!entry) {
      if (source.open) actions.push({ op: 'create', key: source.key, title: sourceTitle(source), body: writeBody(source.text, source) });
      continue;
    }
    // A mapped item without its line (or gone) is left alone, and never made again.
    if (broken.has(source.key)) continue;
    const item = byId.get(entry.item), title = sourceTitle(source);
    if (source.open && isDone(item)) {
      if (entry.closedBySync) actions.push({ op: 'reopen', key: source.key, item: item.id });
      else suggestions.push({ kind: 'closed-by-hand', key: source.key, item: item.id });
    } else if (!source.open && !isDone(item)) {
      actions.push({ op: 'close', key: source.key, item: item.id, note: source.kind === 'phase' ? `plates: phase ${source.id} is ${source.status}` : `plates: issue #${source.number} is closed` });
    }
    // A line linked through a renamed repo is brought to the current URL with the next retitle.
    const stale = resolved.has(item.id);
    if (source.open && (item.title !== title || stale)) actions.push({ op: 'retitle', key: source.key, item: item.id, title, ...(stale ? { body: relink(item.body, source) } : {}) });
  }
  // A mapped source no longer read (a phase file removed) is left alone.
  return { actions, adopt, settled, suggestions, unlinked, stopped: null };
}

/** The map after one applied action (pure). */
export function mapAfter(map, action, itemId) {
  const entries = { ...map.entries };
  if (action.op === 'create') entries[action.key] = { item: itemId, closedBySync: false };
  if (action.op === 'adopt') entries[action.key] = { item: action.item, closedBySync: false };
  if (action.op === 'pending-close') entries[action.key] = { ...entries[action.key], pendingClose: action.note };
  if (action.op === 'close') { const { pendingClose, ...rest } = entries[action.key]; void pendingClose; entries[action.key] = { ...rest, closedBySync: true }; }
  if (action.op === 'settle') { const { pendingClose, ...rest } = entries[action.key]; void pendingClose; entries[action.key] = { ...rest, closedBySync: action.closedBySync || rest.closedBySync }; }
  if (action.op === 'reopen') entries[action.key] = { ...entries[action.key], closedBySync: false };
  return { ...map, entries };
}
