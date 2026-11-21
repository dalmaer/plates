// Each plate's work is its Unison backlog, and links back (plates phase 200).
// Pure: no file, network or process access. lib/unison.mjs reads and applies.
//
// The link line. An item links to its phase or issue by one line at the start
// of a line in its body:
//
//   Phase: https://github.com/<owner>/<repo>/blob/HEAD/docs/phases/<file>  (any ref matches: repo + file)
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
// HEAD: GitHub resolves it to the repo's default branch, whatever it is called.
export const phaseUrl = (repo, file) => `https://github.com/${repo}/blob/HEAD/docs/phases/${file}`;
export const issueUrl = (repo, number) => `https://github.com/${repo}/issues/${number}`;
const PHASE_FILE = /^(\d{1,5})-[A-Za-z0-9._-]*\.md$/;
const PROJECT = /^[A-Za-z0-9._-]{1,64}$/, ANCHOR = /^[\p{Ll}\p{Lo}\p{Lm}\p{N}_-]{1,200}$/u;

/** GitHub's anchor for a Markdown heading's text: lower case, punctuation dropped, spaces to hyphens. */
// GitHub keeps Unicode letters and digits (`## Phase 2 — Café` → `phase-2--café`).
export const headingAnchor = text => String(text ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
/** A projects-shape phase's link: its project's phases.md at the phase heading. */
export const projectPhaseUrl = (repo, project, anchor) => `https://github.com/${repo}/blob/HEAD/docs/projects/${project}/phases.md#${anchor}`;

/** What one URL from a link line names, for these repos (normalized), or null. */
function linkTarget(kind, url, repos) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || !['github.com', 'www.github.com'].includes(u.hostname.toLowerCase()) || u.search) return null;
  // Only a projects-shape phase link carries an anchor (its heading).
  const projectsShape = /^\/[^/]+\/[^/]+\/blob\/[^/]+\/docs\/projects\/[^/]+\/phases\.md$/.test(u.pathname);
  if (u.hash && !projectsShape) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const repo = normalizeRepo(`${parts[0]}/${parts[1]}`);
  if (!repo || !repos.includes(repo)) return null;
  if (kind === 'Issue') {
    if (parts.length !== 4 || parts[2] !== 'issues' || !/^[1-9]\d{0,9}$/.test(parts[3])) return null;
    return { kind: 'issue', repo, number: Number(parts[3]), url };
  }
  // Phase (projects shape): .../blob/<ref>/docs/projects/<project>/phases.md#<heading anchor>
  if (projectsShape) {
    // The URL parser percent-encodes a Unicode anchor: read it back decoded, so both spellings match.
    let anchor;
    try { anchor = decodeURIComponent(u.hash.slice(1)); } catch { return null; }
    const project = parts[6];
    if (!PROJECT.test(project) || !ANCHOR.test(anchor)) return null;
    return { kind: 'phase', repo, project, anchor, file: `docs/projects/${project}/phases.md#${anchor}`, url };
  }
  // Phase: .../blob/<ref>/docs/phases/<NN-name>.md
  if (parts.length !== 7 || parts[2] !== 'blob' || !parts[3] || parts[4] !== 'docs' || parts[5] !== 'phases') return null;
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
  const lines = body.split(/\r?\n/);
  for (let at = 0; at < lines.length; at++) {
    const m = LINK.exec(lines[at]);
    if (!m) continue;
    const target = linkTarget(m[1], m[2], known);
    // line: the index of the very line that links, so a rewrite touches only it.
    if (target) return { ...target, line: at };
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
export const sourceTitle = source => (source.kind === 'issue' ? `Issue #${source.number}: ${source.title}` : `Phase ${source.project ? `${source.project}/` : ''}${source.id}: ${source.title}`);

/** A phase is open while its status is not built, lived-in, superseded or done (a local variant's word). */
export const phaseOpen = status => !['built', 'lived-in', 'superseded', 'done', 'closed', 'shipped'].includes(String(status ?? '').toLowerCase());

/** A phase's source key names its repo: two repos' phase 2 are two sources. */
export const phaseKey = (repo, id) => `phase:${normalizeRepo(repo)}:${id}`;
const KEY = /^(?:phase:[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9._-]{1,100}:(?:[A-Za-z0-9._-]{1,64}\/\d{1,5}(?:\.\d{1,5})?|\d{1,5})(?:#[\p{L}\p{N}._-]{1,200})?|issue:[A-Za-z0-9_=-]{1,100})$/u;

/** Every `Issue: <url>` line naming any GitHub repo, as { url, line } (for resolving a renamed repo's URL). */
export function rawIssueLinks(body) {
  const out = [];
  String(body ?? '').split(/\r?\n/).forEach((text, line) => {
    const m = LINK.exec(text);
    if (!m || m[1] !== 'Issue') return;
    const repo = (() => { try { const u = new URL(m[2]); const parts = u.pathname.split('/').filter(Boolean); return parts.length === 4 && parts[2] === 'issues' && /^[1-9]\d{0,9}$/.test(parts[3]) ? normalizeRepo(`${parts[0]}/${parts[1]}`) : null; } catch { return null; } })();
    if (repo) out.push({ url: m[2], line });
  });
  return out;
}

/** The body with exactly line `at` (the one that links) replaced by the source's own link line; every other line kept. */
export function relink(body, source, at) {
  const lines = String(body ?? '').split(/\r?\n/);
  if (!Number.isSafeInteger(at) || at < 0 || at >= lines.length || !LINK.test(lines[at])) return writeBody(body, source);
  lines[at] = linkLine(source);
  return lines.join('\n');
}

/**
 * The plate's phases as sources. A phase is { id, file, title, status, done? } (docs/phases, strict or loose), or
 * { project, id, anchor, title, status } (the projects shape: docs/projects/<project>/phases.md, keyed by project).
 */
export function phaseSources(phases, repo) {
  const out = phaseSourcesRaw(phases, repo);
  // Two phases with one number (two "Phase 5" headings, or 5-a.md and 5-b.md): every member of the collision is
  // keyed by its heading anchor or file too, so no key ever names two sources.
  const count = new Map();
  for (const x of out) count.set(x.key, (count.get(x.key) ?? 0) + 1);
  return out.map(x => (count.get(x.key) > 1 ? { ...x, key: `${x.key}#${x.project !== undefined ? x.anchor : x.file.replace(/\.md$/, '')}` } : x));
}

function phaseSourcesRaw(phases, repo) {
  return (phases ?? []).flatMap(p => {
    if (p?.project !== undefined) {
      if (!PROJECT.test(p.project) || !/^\d{1,5}(?:\.\d{1,5})?$/.test(String(p.id)) || !ANCHOR.test(p.anchor ?? '')) return [];
      return [{ key: phaseKey(repo, `${p.project}/${p.id}`), kind: 'phase', project: p.project, id: String(p.id), anchor: p.anchor, repo,
        file: `docs/projects/${p.project}/phases.md#${p.anchor}`, title: String(p.title ?? '').trim() || `${p.project} ${p.id}`,
        open: phaseOpen(p.status), status: p.status, url: projectPhaseUrl(repo, p.project, p.anchor), text: '' }];
    }
    if (!Number.isSafeInteger(p?.id) || typeof p.file !== 'string') return [];
    return [{ key: phaseKey(repo, p.id), kind: 'phase', id: p.id, repo, file: p.file, title: String(p.title ?? '').trim() || p.file,
      open: phaseOpen(p.status), status: p.status, url: phaseUrl(repo, p.file), text: p.done ? `Done when: ${p.done}` : '' }];
  });
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
  // Creates sent without a confirmed answer: key → { title, at } (an add that timed out may still have landed).
  const pendingCreates = {};
  for (const [key, p] of Object.entries(value.pendingCreates ?? {})) {
    if (!KEY.test(key) || typeof p?.title !== 'string' || !Number.isFinite(Date.parse(p?.at))) throw new Error(`the Unison map's pending create ${key} is not one plates wrote`);
    pendingCreates[key] = { title: p.title, at: p.at };
  }
  // A workspace create sent without a confirmed answer: { repo, name, at }.
  const pw = value.pendingWorkspace;
  if (pw !== undefined && (!normalizeRepo(pw?.repo) || typeof pw.name !== 'string' || !Number.isFinite(Date.parse(pw.at)))) throw new Error("the Unison map's pending workspace is not one plates wrote");
  return { schema: MAP_SCHEMA, workspace: typeof value.workspace === 'string' ? value.workspace : null, repo: typeof value.repo === 'string' ? value.repo : null, entries,
    ...(Object.keys(pendingCreates).length ? { pendingCreates } : {}), ...(pw ? { pendingWorkspace: { repo: normalizeRepo(pw.repo), name: pw.name, at: pw.at } } : {}) };
}

/** How long an uncertain create holds back a second add for its source. */
export const PENDING_CREATE_MS = 15 * 60_000;

const isDone = item => item.status === 'done';

/**
 * What a sync would do. items: the workspace's backlog (every status); sources:
 * phaseSources/issueSources; map: readMap; repos: the workspace's repos; repo: the
 * plate's own repo (only items whose line names it are linked, adopted or closed);
 * resolved: Map(item id → { key, line }) for mapped items whose old issue URL (on that line)
 * GitHub resolved to the same node id (a renamed repo).
 * Returns { actions, adopt, settled, suggestions, unlinked, stopped }:
 *   settled      [{ key, closedBySync }]  the map's corrected value: a pending close settled, or an item seen open
 *   actions      [{ op: create|retitle|relink|close|reopen, key, item?, title?, body?, note? }]
 *   adopt        [{ key, item }]   lines the map does not hold yet, taken into it
 *   suggestions  [{ kind, key, item }]   for a person: closed-by-hand, duplicate
 *   unlinked     [{ key, item, why }]    mapped items that lost their line, or are gone
 *   waiting      [{ key, since }]   an uncertain create (pendingCreates) under 15 minutes old: not added again yet
 *   expired      [keys]  uncertain creates past 15 minutes with no item: treated as failed (planned again if open)
 *   stopped      null, or { reason: 'lost-lines', items } when lines would be adopted
 *                while a mapped item lacks its line: then nothing is planned.
 */
export function planSync({ items, sources, map, repos, repo, resolved = new Map(), now = Date.now() }) {
  const own = normalizeRepo(repo);
  // The plate's link names its own repo (when the workspace lists it); another workspace repo's link line is prose here.
  const mine = (repos ?? []).map(normalizeRepo).includes(own) ? [own] : [];
  const byId = new Map(items.map(i => [i.id, i]));
  const issueKey = new Map(sources.filter(s => s.kind === 'issue').map(s => [`${s.repo}#${s.number}`, s.key]));
  // Each item's line, as a source key: only a line naming the plate's own repo (or resolved to its issue) links.
  // A projects-shape link names its heading: the exact anchor, else (a renamed heading) the phase number it starts with.
  const projectKey = new Map(), projectId = new Map();
  for (const src of sources.filter(x => x.project !== undefined)) {
    projectKey.set(`${src.project}#${src.anchor}`, src.key);
    const digits = `${src.project}#${src.id.replace('.', '')}`;
    projectId.set(digits, projectId.has(digits) ? null : src.key);
  }
  const projectLink = link => projectKey.get(`${link.project}#${link.anchor}`)
    ?? projectId.get(`${link.project}#${/^(?:phase-)?(\d+)/.exec(link.anchor)?.[1] ?? ''}`) ?? null;
  // A files-shape link names its file: that file's source, else (a renamed file) its number's.
  const fileKey = new Map(sources.filter(x => x.kind === 'phase' && x.project === undefined).map(x => [x.file, x.key]));
  const lineKey = item => {
    const link = parseLink(item.body, mine);
    const key = !link || link.repo !== own ? null : link.kind === 'phase' ? (link.project !== undefined ? projectLink(link) : fileKey.get(link.file) ?? phaseKey(own, link.id)) : issueKey.get(`${link.repo}#${link.number}`) ?? null;
    return key ?? resolved.get(item.id)?.key ?? null;
  };
  const lines = new Map(items.map(i => [i.id, lineKey(i)]));
  const entries = { ...map.entries };
  // A key the sources no longer produce (it became ambiguous and was split by anchor or file) moves to the key its
  // item's line now names, when that key is not already held: the item made earlier links to one of them.
  const sourceKeys = new Set(sources.map(x => x.key));
  const rekey = [];
  for (const [key, entry] of Object.entries(map.entries)) {
    if (sourceKeys.has(key) || !key.startsWith('phase:')) continue;
    const to = lines.get(entry.item);
    if (to && to !== key && to.startsWith(`${key}#`) && !entries[to]) { entries[to] = entry; delete entries[key]; rekey.push({ from: key, to }); }
  }
  // The plan never acts on a key that more than one source produced: that is for a person.
  const produced = new Map();
  for (const x of sources) produced.set(x.key, (produced.get(x.key) ?? 0) + 1);
  const ambiguous = new Set([...produced].filter(([, n]) => n > 1).map(([k]) => k));
  // A close sent by a run that died before recording it: the item's status and close note say whether sync closed it.
  // A mapped item seen open is not closed by sync, whatever the map said (reopened by hand, or a reopen's answer lost),
  // so a later hand close is a suggestion, never an automatic reopen. settled carries the map's new value.
  const settled = [];
  for (const [key, entry] of Object.entries(entries)) {
    const item = byId.get(entry.item);
    let closedBySync = entry.closedBySync;
    if (entry.pendingClose !== undefined) closedBySync = Boolean(item && isDone(item) && item.close_note === entry.pendingClose) || entry.closedBySync;
    if (item && !isDone(item)) closedBySync = false;
    if (entry.pendingClose === undefined && closedBySync === entry.closedBySync) continue;
    settled.push({ key, closedBySync });
    entries[key] = { item: entry.item, closedBySync };
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
    return { actions: [], adopt: [], rekey: [], settled: [], waiting: [], expired: [], suggestions, unlinked, stopped: { reason: 'lost-lines', items: lost.map(u => u.item) } };
  }
  for (const a of adopt) entries[a.key] = { item: a.item, closedBySync: false };
  const broken = new Set(unlinked.map(u => u.key));
  const actions = [], waiting = [], expired = [];
  for (const [key, p] of Object.entries(map.pendingCreates ?? {})) {
    if (entries[key]) continue; // its item came through: adopted by its line, and the pending clears
    if (now - Date.parse(p.at) < PENDING_CREATE_MS) waiting.push({ key, since: p.at });
    else expired.push(key);
  }
  const held = new Set(waiting.map(w => w.key));
  for (const key of ambiguous) suggestions.push({ kind: 'ambiguous-source', key, item: entries[key]?.item ?? null });
  for (const source of sources) {
    if (ambiguous.has(source.key)) continue;
    const entry = entries[source.key];
    if (!entry) {
      if (source.open && !held.has(source.key)) actions.push({ op: 'create', key: source.key, title: sourceTitle(source), body: writeBody(source.text, source) });
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
    // A line linked through a renamed repo, or naming a phase file since renamed (same number), is brought to the
    // current URL: only the link line changes, with the retitle when there is one, else on its own (relink).
    const link = source.kind === 'phase' ? parseLink(item.body, mine) : null;
    const stale = resolved.has(item.id) || Boolean(link && link.kind === 'phase' && link.file !== source.file);
    const body = stale ? { body: relink(item.body, source, resolved.get(item.id)?.line ?? link?.line) } : {};
    if (source.open && item.title !== title) actions.push({ op: 'retitle', key: source.key, item: item.id, title, ...body });
    else if (source.open && stale) actions.push({ op: 'relink', key: source.key, item: item.id, ...body });
  }
  // A mapped source no longer read (a phase file removed) is left alone.
  return { actions, adopt, rekey, settled, waiting, expired, suggestions, unlinked, stopped: null };
}

/** The map after one applied action (pure). */
export function mapAfter(map, action, itemId) {
  const entries = { ...map.entries };
  const pendingCreates = { ...(map.pendingCreates ?? {}) };
  if (action.op === 'pending-create') pendingCreates[action.key] = { title: action.title, at: action.at };
  if (['create', 'adopt', 'expire'].includes(action.op)) delete pendingCreates[action.key];
  if (action.op === 'rekey' && entries[action.from] && !entries[action.to]) { entries[action.to] = entries[action.from]; delete entries[action.from]; }
  if (action.op === 'create') entries[action.key] = { item: itemId, closedBySync: false };
  if (action.op === 'adopt') entries[action.key] = { item: action.item, closedBySync: false };
  if (action.op === 'pending-close') entries[action.key] = { ...entries[action.key], pendingClose: action.note };
  if (action.op === 'close') { const { pendingClose, ...rest } = entries[action.key]; void pendingClose; entries[action.key] = { ...rest, closedBySync: true }; }
  if (action.op === 'clear-pending-close' && entries[action.key]) { const { pendingClose, ...rest } = entries[action.key]; void pendingClose; entries[action.key] = rest; }
  if (action.op === 'settle') { const { pendingClose, ...rest } = entries[action.key]; void pendingClose; entries[action.key] = { ...rest, closedBySync: action.closedBySync }; }
  if (action.op === 'reopen') entries[action.key] = { ...entries[action.key], closedBySync: false };
  const { pendingCreates: _old, ...rest } = map; void _old;
  return { ...rest, entries, ...(Object.keys(pendingCreates).length ? { pendingCreates } : {}) };
}
