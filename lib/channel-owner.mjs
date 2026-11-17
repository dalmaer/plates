// The owner addresses agents (phase 194, increment 3). The owner posts a line to one plate's channel from the
// signed-in site (lib/web/server.mjs /channel/post, the same origin, session and CSRF checks as Home's forms); the
// workspace seals it with the owner marker (`kind: 'owner'`) under the owner's own device digest, never a device key
// (lib/web/channel-store.mjs, SQL025). A line that @-names a phase (`@2`, `@studio#2`) or a session (`@<PLATES_SESSION>`)
// is a checkpoint; `plates channel inbox` returns the owner's lines addressed to this session, or to the phase this
// checkout claims, once each (a local cursor per session and plate). Authority comes only from the site session: an
// agent's say line that contains `@...` is a say line, addressed to nobody, and a device-key body shaped like an owner
// line is refused by name before anything is stored.
//
//   addresseesOf(text, plate)    the phases and sessions a line names: [{ plate, phase } | { session }], or a refusal code
//   validOwnerPost(body, plates) the site's form, checked: { project, text, to } or null
//   validOwnerSaid(value)        an owner line read back: { at, kind: 'owner', text, to, by } or null
//   validLine(value)             a stored line read back, owner or say (lib/channel-say.mjs validSaid), or null
//   ownerLineProblem(body)       why a device-key body may not be stored (it claims to be the owner's), or null
//   addressedTo(line, me)        whether an owner line names this session or this plate's phase
//   inbox({ root, ... })         the CLI: plates channel inbox
import { sayProblem, validSaid } from './channel-say.mjs';

export const OWNER_KIND = 'owner';
/** The owner may post at most this many lines per plate per minute (SQL025 holds the same bound). */
export const OWNER_PER_MINUTE = 10;
/** A line names at most this many addressees. */
export const OWNER_ADDRESSEES = 10;
const PLATE = /^[a-z][a-z0-9-]{0,63}$/, SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, BY = /^github:[1-9][0-9]{0,15}$/;
const is = (re, value) => typeof value === 'string' && re.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The phases and sessions an owner's line names, in the order written, once each. `@<n>` and `@<plate>#<n>` name a
 * phase (the plate must be the one posted to: { refused: 'channel_address_elsewhere' } otherwise). A bare `@<name>`
 * names a session only when the id ends in a letter or digit: a trailing `.` or `:` is the sentence's punctuation and is
 * not part of the id, and a bare name that still ends in `-` or `_` (`@worker- hold`) names nobody, never a shorter id.
 * `@{<id>}` names exactly that session id, verbatim and untrimmed (`@{worker-}`); it must be a session id or the braces
 * name nobody. An `@` inside a word (an address like a@b) names nobody. More than OWNER_ADDRESSEES is
 * { refused: 'channel_too_many_addressees' }.
 */
export function addresseesOf(text, plate) {
  const out = [], seen = new Set();
  for (const m of String(text ?? '').matchAll(/(?:^|[\s(,;])@(?:\{([^{}\s]*)\}|([A-Za-z0-9][A-Za-z0-9._:#-]*))/g)) {
    let to;
    if (m[1] !== undefined) {
      if (!is(SESSION, m[1])) continue;
      to = { session: m[1] };
    } else {
      const name = m[2].replace(/[.:]+$/, '');
      if (!/[A-Za-z0-9]$/.test(name)) continue;
      const phase = /^(?:([a-z][a-z0-9-]{0,63})#)?(\d{1,9})$/.exec(name);
      if (phase) {
        if (phase[1] !== undefined && phase[1] !== plate) return { refused: 'channel_address_elsewhere' };
        to = { plate, phase: Number(phase[2]) };
      } else if (is(SESSION, name)) to = { session: name };
      else continue;
    }
    const key = JSON.stringify(to);
    if (seen.has(key)) continue;
    seen.add(key); out.push(to);
  }
  return out.length > OWNER_ADDRESSEES ? { refused: 'channel_too_many_addressees' } : out;
}

const validTo = (to, plate = null) => Array.isArray(to) && to.length <= OWNER_ADDRESSEES && to.every(a => record(a) && (
  (Object.keys(a).sort().join(',') === 'phase,plate' && is(PLATE, a.plate) && (plate === null || a.plate === plate) && Number.isSafeInteger(a.phase) && a.phase >= 0)
  || (Object.keys(a).join(',') === 'session' && is(SESSION, a.session))));

/** The site's form: { project, text }, every field checked; { project, text, to } or null (or { refused } naming why). */
export function validOwnerPost(body, plates = null) {
  if (!record(body) || Object.keys(body).sort().join(',') !== 'project,text') return null;
  if (!is(PLATE, body.project) || (plates && !plates.includes(body.project)) || sayProblem(body.text) !== null) return null;
  const text = body.text.trim(), to = addresseesOf(text, body.project);
  if (!Array.isArray(to)) return to;
  return { project: body.project, text, to };
}

/** An owner line read back (the site's sealed value with its time): { at, kind: 'owner', text, to, by } or null. */
export function validOwnerSaid(value) {
  if (!record(value) || value.kind !== OWNER_KIND) return null;
  if (Object.keys(value).sort().join(',') !== 'at,by,kind,text,to') return null;
  const at = Date.parse(value.at ?? '');
  if (!Number.isFinite(at) || sayProblem(value.text) !== null || !validTo(value.to) || !is(BY, value.by)) return null;
  return { at: new Date(at).toISOString(), kind: OWNER_KIND, text: value.text, to: value.to.map(a => ('session' in a ? { session: a.session } : { plate: a.plate, phase: a.phase })), by: value.by };
}

/** A line read back from the store or the site: an owner line when it says so, else an agent's say line. */
export const validLine = value => (record(value) && value.kind !== undefined ? validOwnerSaid(value) : validSaid(value));

/**
 * Why a body posted with a device key may not be stored: it names a kind, addressees or an author, as only the owner's
 * line does. The device route asks this before anything else, so an owner line can never come from a device.
 */
export function ownerLineProblem(body) {
  if (!record(body)) return null;
  return ['kind', 'to', 'by'].some(key => Object.hasOwn(body, key)) ? 'channel_owner_only' : null;
}

/** Whether an owner line names this session, or this plate's phase. A say line (no kind) names nobody, whatever its text. */
export function addressedTo(line, { plate, session, phase }) {
  if (line?.kind !== OWNER_KIND || !Array.isArray(line.to)) return false;
  return line.to.some(a => (a.session !== undefined ? a.session === session : a.plate === plate && phase !== null && phase !== undefined && a.phase === phase));
}

export class InboxError extends Error {
  constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; }
}

/** Where this session's cursor on this plate and workspace is kept: the plates state dir, keyed by a digest. */
async function cursorPath(env, { origin, project, session }) {
  const [{ createHash }, { join }, { stateDir }] = await Promise.all([import('node:crypto'), import('node:path'), import('./not-now.mjs')]);
  return join(stateDir(env), 'channel-inbox', `${createHash('sha256').update(JSON.stringify(['channel-inbox-v1', origin, project, session])).digest('hex')}.json`);
}
const lineKey = line => JSON.stringify([line.at, line.text, line.to]);

async function readCursor(path) {
  const { readFile } = await import('node:fs/promises');
  let text;
  try { text = await readFile(path, 'utf8'); } catch (error) { if (error?.code === 'ENOENT') return null; throw new InboxError(`not read: this session's inbox cursor could not be read (${error?.code ?? 'unknown'}): ${path}`, 1); }
  let value;
  try { value = JSON.parse(text); } catch { value = null; }
  if (!record(value) || value.schema !== 1 || !Number.isFinite(Date.parse(value.at ?? '')) || !Array.isArray(value.seen) || !value.seen.every(s => typeof s === 'string'))
    throw new InboxError(`not read: this session's inbox cursor is not one; remove it to start again from the workspace's 14 days: ${path}`, 1);
  return value;
}

async function writeCursor(path, value) {
  const { mkdir, writeFile, rename } = await import('node:fs/promises'), { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

/** How long an inbox call waits for another one on the same cursor, and how old a lock is before it is taken as abandoned. */
export const INBOX_LOCK = Object.freeze({ waitMs: 30_000, staleMs: 120_000, pollMs: 25 });
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; } };

/**
 * Run `work` holding this cursor's lock: an exclusive-create file beside it, so two inbox calls for one session (in any
 * process) never both read the same cursor and return the same line. Waits at most `waitMs`, then refuses (exit 1).
 * A lock whose holder process is gone, or older than `staleMs` (longer than any read holds it), is removed and taken.
 */
async function withCursorLock(path, work, { waitMs = INBOX_LOCK.waitMs, staleMs = INBOX_LOCK.staleMs, pollMs = INBOX_LOCK.pollMs } = {}) {
  const { mkdir, open, readFile, rm, stat } = await import('node:fs/promises'), { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lock = `${path}.lock`, token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`, deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const handle = await open(lock, 'wx', 0o600);
      try { await handle.writeFile(token); } finally { await handle.close(); }
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw new InboxError(`not read: this session's inbox lock could not be made (${error?.code ?? 'unknown'}): ${lock}`, 1);
    }
    let abandoned = false;
    try {
      const [held, info] = await Promise.all([readFile(lock, 'utf8'), stat(lock)]);
      const pid = Number(held.split(':')[0]);
      abandoned = Date.now() - info.mtimeMs > staleMs || (Number.isSafeInteger(pid) && pid > 0 && !alive(pid));
    } catch { continue; } // released between our attempt and this look: try again at once
    if (abandoned) { await rm(lock, { force: true }); continue; }
    if (Date.now() >= deadline) throw new InboxError(`not read: another plates channel inbox for this session is reading (its lock is ${lock}); ask again when it finishes`, 1);
    await new Promise(done => setTimeout(done, pollMs));
  }
  try { return await work(); }
  finally {
    // Remove only our own lock: one taken over as abandoned belongs to its new holder.
    try { if ((await readFile(lock, 'utf8')) === token) await rm(lock, { force: true }); } catch { /* already gone */ }
  }
}

/** One owner line as phase 149's envelope: the owner's request, its origin authenticated by the site session. */
async function envelopeOf(line, { project, session, origin }) {
  const [{ createEnvelope }, { createHash }] = await Promise.all([import('./chat/envelope.mjs'), import('node:crypto')]);
  const digest = createHash('sha256').update(JSON.stringify(['channel-owner-line-v1', origin, project, line.at, line.text])).digest('hex');
  return createEnvelope({ provider: 'plates-site', scopeId: project, conversationId: `channel-${project}`, messageId: digest.slice(0, 32), kind: 'request',
    origin: { kind: 'human', id: line.by, authenticated: true }, target: { kind: 'agent', id: session }, projectId: project, command: { name: 'ask', effect: 'none' }, text: line.text });
}

/**
 * plates channel inbox: the owner's lines on this checkout's plate addressed to this session (PLATES_SESSION) or to
 * the phase this checkout claims, newer than this session last asked; each is returned once (the cursor moves only
 * after a full read). A source that cannot be read is a refusal naming it, never an empty inbox: no session, no
 * workspace or no device key exits 2; the workspace refusing or not answering, or a cursor that cannot be read, exits 1.
 */
export async function inbox({ root, site, env = process.env, fetcher = fetch, key, phase: given, lock: lockOptions } = {}) {
  const { deviceKey, siteOf, SessionsError } = await import('./sessions.mjs');
  const { sessionOf } = await import('./claim.mjs');
  const { claimedPhase } = await import('./channel-say.mjs');
  key ??= deviceKey;
  const session = sessionOf(env);
  if (!session) throw new InboxError('not read: no session to read for; set PLATES_SESSION (the stable id this session posts and claims as)');
  if (!is(SESSION, session)) throw new InboxError('not read: the session id is not letters, digits, ., _, : and - (at most 128); set PLATES_SESSION');
  const { readFile } = await import('node:fs/promises'), { join } = await import('node:path');
  const config = JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8'));
  const { plateIdOf } = await import('./work-items.mjs');
  const project = plateIdOf(config.repo ?? config.name);
  let origin;
  try { origin = siteOf(site, env); } catch (error) { if (error instanceof SessionsError) throw new InboxError(`not read: ${error.message}`); throw error; }
  let secret;
  try { secret = await key(env); } catch { secret = null; }
  if (!secret) throw new InboxError(`not read: the owner's lines are kept on ${origin}; no device key here to read them (PLATES_DEVICE_KEY or the keychain)`);
  const phase = given !== undefined ? given : await claimedPhase(root, config, env);
  const path = await cursorPath(env, { origin, project, session });
  // From reading the cursor, through the fetch, until it is written: one inbox call per session and plate at a time.
  const { cursor, items } = await withCursorLock(path, async () => {
    const cursor = await readCursor(path);
    // The workspace's since is exclusive and its times are to the millisecond: ask from a millisecond before the cursor and
    // drop what was already returned at the cursor's own time, so a line is neither lost nor returned twice.
    const since = cursor ? new Date(Date.parse(cursor.at) - 1).toISOString() : null;
    let response;
    try {
      response = await fetcher(`${origin}/api/channel/says?project=${encodeURIComponent(project)}&owner=1${since ? `&since=${encodeURIComponent(since)}` : ''}`,
        { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(20_000), redirect: 'error' });
    } catch (error) { throw new InboxError(`not read: could not reach ${origin}: ${String(error?.message ?? error).slice(0, 160)}`, 1); }
    const body = await response.json().catch(() => null);
    if (response.status === 401) throw new InboxError(`not read: ${origin} refused this device's key (revoked, or not this workspace's); create a new one on its Devices page`, 1);
    if (response.status === 400 && body?.error === 'invalid_query') throw new InboxError(`not read: ${origin} does not serve the owner's lines yet (deploy the build with phase 194's increment 3)`, 1);
    if (response.status === 400 && body?.error === 'invalid_channel_project') throw new InboxError(`not read: ${origin} has no plate ${project} in its workspace`, 1);
    if (!response.ok || !Array.isArray(body?.items)) throw new InboxError(`not read: ${origin} answered ${response.status}${body?.error ? ` (${String(body.error).slice(0, 60)})` : ''}`, 1);
    const lines = body.items.map(validLine);
    if (!lines.every(Boolean)) throw new InboxError(`not read: ${origin} sent a line that is not one`, 1);
    const seen = new Set(cursor?.at ? cursor.seen : []);
    const fresh = lines.filter(l => l.kind === OWNER_KIND && (!cursor || l.at > cursor.at || (l.at === cursor.at && !seen.has(lineKey(l)))));
    const mine = fresh.filter(l => addressedTo(l, { plate: project, session, phase }));
    const items = await Promise.all(mine.map(async l => ({ at: l.at, kind: 'checkpoint', text: l.text, to: l.to, envelope: await envelopeOf(l, { project, session, origin }) })));
    // The cursor moves to the newest owner line read (addressed here or not), remembering every line at that time; last, so
    // nothing that fails above moves it.
    const newest = fresh.map(l => l.at).sort().at(-1);
    if (newest) {
      const atNewest = fresh.filter(l => l.at === newest).map(lineKey);
      await writeCursor(path, { schema: 1, at: newest, seen: newest === cursor?.at ? [...seen, ...atNewest] : atNewest });
    }
    return { cursor, items };
  }, lockOptions);
  const who = phase !== null && phase !== undefined ? `${session} on ${project}#${phase}` : `${session} on ${project}`;
  const text = items.length
    ? [`The owner's lines for ${who} (${items.length}), oldest first:`, ...items.map(i => `  ${i.at.slice(0, 16).replace('T', ' ')} UTC  ${i.text}`), '', 'Answer with plates say "<text>": the checkpoint shows answered once this session says something after it.'].join('\n')
    : `Nothing new from the owner for ${who} since ${cursor ? `${cursor.at.slice(0, 16).replace('T', ' ')} UTC` : 'the workspace\'s last 14 days'}.`;
  return { data: { schema: 1, site: origin, project, session, phase: phase ?? null, since: cursor?.at ?? null, items }, text };
}
