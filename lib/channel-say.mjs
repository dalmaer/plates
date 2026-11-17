// plates say (phase 194, increment 2): an agent posts one line to its project's channel on the owner's Plates
// workspace, with this machine's device key (the key `plates sessions push` uses, lib/sessions.mjs). The line is
// tagged with the session (PLATES_SESSION, or the agent's own session id), the provider and the phase this
// checkout claims; the workspace seals it (lib/web/channel-store.mjs, SQL024) and the channel shows it as a `say`
// line (lib/channel.mjs). Every line is an observation: it triggers nothing and carries no authority.
//
//   sayProblem(text)            why a line cannot be posted, or null (the CLI and the service ask the same question)
//   validPost(body, projects)   a posted body checked field by field, or null
//   validSaid(record)           a stored line read back, checked the same way, or null
//   say({ root, text, ... })    the CLI: refuse before anything is read or sent, then post
//   readSays({ plates, ... })   the CLI channel's say lines (and the owner's, lib/channel-owner.mjs) per plate, or a gap naming why they are not read here
//   postProgress({ ... })       plates's own progress line for an attach or Rex run (provider "plates"), best effort
//
// Progress lines (phases 181, 193, 194): plates itself posts a run's steps (dispatched, cancelled, ...) through the same
// route, device key and limits, as provider "plates" with a session per step and attach (`plates-<step>-<digest12>`), so
// one step's line never waits on another's per-session minute. A device may post only what plates on it did
// (DEVICE_STEPS); the service refuses any other "plates" line from a device key, and the channel shows each as a
// `progress` line attributed to the device that posted it, never as plates's own authority. An agent's plates say may
// not use the provider "plates". Like every line, a progress line triggers nothing.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** A line is at most this many characters (UTF-16 units, as every plates bound counts them). */
export const SAY_CHARS = 280;
/** One line per session per this many milliseconds. */
export const SAY_EVERY_MS = 60_000;
/** Lines are kept this many days. */
export const SAY_DAYS = 14;
/** At most this many lines per project; the oldest go first. */
export const SAY_PER_PROJECT = 500;
/** The sealed record's bound in SQL024 (base64url ciphertext of the largest record, with room). */
export const SAY_SEALED_BYTES = 2048;
/**
 * Text shaped like a credential: the audits' detector (scripts/plates/audit.mjs KEY_SHAPED, a practice
 * script that cannot be imported here), with a Plates device key added. Never posted, never echoed.
 */
export const KEY_SHAPED = /(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}|pdk_[A-Za-z0-9_-]{43})/;
const SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, PROVIDER = /^[a-z][a-z0-9-]{0,39}$/, PROJECT = /^[a-z][a-z0-9-]{0,63}$/;
const LABEL = /^[A-Za-z0-9 ._-]{1,40}$/;
/** A string that matches `re` in full: a number, array or object is refused, never coerced to text first. */
const is = (re, value) => typeof value === 'string' && re.test(value);

/** The steps of an attach or Rex run that plates posts to the plate's channel. */
export const PROGRESS_STEPS = Object.freeze(['dispatched', 'recovered', 'preview', 'correction', 'cancelled', 'finished', 'accepted']);
/** The provider plates's own lines carry; reserved: plates say refuses it. */
export const PROGRESS_PROVIDER = 'plates';
/** A progress line's session: the step and the attach's digest (12 hex). lib/channel.mjs keeps the same pattern (it imports nothing). */
export const PROGRESS_SESSION = /^plates-(dispatched|recovered|preview|correction|cancelled|finished|accepted)-[0-9a-f]{12}$/;
export const progressSession = (step, digest) => `plates-${step}-${String(digest ?? '').slice(0, 12)}`;
/**
 * The steps a device may post: what plates on that machine did itself. Preview, correction, finished and accepted
 * carry the owner's authority and come only from the owner's signed-in site session (increment 3), never a device key.
 * lib/channel.mjs keeps the same list.
 */
export const DEVICE_STEPS = Object.freeze(['dispatched', 'recovered', 'cancelled']);
/**
 * Why a device may not post this body as provider "plates", as the service's error code; null when it may (any other
 * provider, or a device step). Checked by the device-key route before anything is stored.
 */
export function deviceProgressProblem(body) {
  if (body?.provider !== PROGRESS_PROVIDER) return null;
  const step = PROGRESS_SESSION.exec(typeof body.session === 'string' ? body.session : '')?.[1];
  if (!step) return 'channel_provider_reserved';
  return DEVICE_STEPS.includes(step) ? null : 'channel_step_owner_only';
}

export class SayError extends Error {
  constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; }
}

/** Why `text` cannot be a channel line, in words; null when it can. */
export function sayProblem(text) {
  if (typeof text !== 'string' || !text.trim()) return 'a line needs some text';
  if (text.length > SAY_CHARS) return `a line is at most ${SAY_CHARS} characters; this one is ${text.length}`;
  if (!text.isWellFormed()) return 'a line must be well-formed text';
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(text)) return 'a line cannot hold control characters';
  if (KEY_SHAPED.test(text)) return 'the text is shaped like a credential (a key or token); name what it is, never its value';
  return null;
}

/** A line as posted: { schema: 1, project, text, session, provider, phase }, every field checked; null when any is not. */
export function validPost(body, projects = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body).sort().join(',');
  if (keys !== 'phase,project,provider,schema,session,text' || body.schema !== 1) return null;
  if (!is(PROJECT, body.project) || (projects && !projects.includes(body.project))) return null;
  if (sayProblem(body.text) !== null || !is(SESSION, body.session)) return null;
  if (body.provider !== null && !is(PROVIDER, body.provider)) return null;
  if (body.phase !== null && !(Number.isSafeInteger(body.phase) && body.phase >= 0)) return null;
  return { schema: 1, project: body.project, text: body.text.trim(), session: body.session, provider: body.provider, phase: body.phase };
}

/** A line read back from the store or the site: { at, text, session, provider, phase, device }; null when it is not one. */
export function validSaid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const at = Date.parse(value.at ?? '');
  if (!Number.isFinite(at) || sayProblem(value.text) !== null || !is(SESSION, value.session)) return null;
  if (value.provider !== null && !is(PROVIDER, value.provider)) return null;
  if (value.phase !== null && !(Number.isSafeInteger(value.phase) && value.phase >= 0)) return null;
  if (value.device !== null && !is(LABEL, value.device)) return null;
  return { at: new Date(at).toISOString(), text: value.text, session: value.session, provider: value.provider, phase: value.phase, device: value.device };
}

/** The phase this checkout claims: its one claim made here by this session, else the phase its branch names, else null. */
export async function claimedPhase(root, config, env) {
  const { readClaims, phaseOfBranch } = await import('./claim.mjs');
  try {
    const mine = (await readClaims({ root, config, env, fetch: false, prs: false })).claims.filter(c => c.mine);
    if (mine.length === 1) return mine[0].phase;
  } catch { /* no remote, or the claims cannot be read here: the branch may still name the phase */ }
  try {
    const { execFile } = await import('node:child_process');
    const branch = await new Promise(done => execFile('git', ['-C', root, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8', timeout: 10_000 }, (e, out) => done(e ? null : out.trim())));
    return branch ? phaseOfBranch(branch) : null;
  } catch { return null; }
}

/**
 * plates say "<text>": one line for this checkout's project. Refused, naming why, before anything is read or
 * sent: no text, over SAY_CHARS, key-shaped, no session, no workspace, no device key. The workspace refuses a
 * second line from one session within a minute, and a key it does not know.
 */
export async function say({ root, text, site, env = process.env, fetcher = fetch, key, phase: given } = {}) {
  // lib/sessions.mjs loads here, not at the top: lib/web/channel-store.mjs imports only the validators above.
  const { deviceKey, siteOf, SessionsError } = await import('./sessions.mjs');
  key ??= deviceKey;
  const problem = sayProblem(text);
  if (problem) throw new SayError(`not posted: ${problem}`);
  const { sessionOf, providerOf, ClaimError } = await import('./claim.mjs');
  const session = sessionOf(env);
  if (!session) throw new SayError('not posted: no session to post as; set PLATES_SESSION (a stable id for this session)');
  if (!is(SESSION, session)) throw new SayError('not posted: the session id is not letters, digits, ., _, : and - (at most 128); set PLATES_SESSION');
  let provider;
  try { provider = providerOf(env); } catch (error) { if (error instanceof ClaimError) throw new SayError(`not posted: ${error.message}`); throw error; }
  if (provider === PROGRESS_PROVIDER) throw new SayError(`not posted: the provider "${PROGRESS_PROVIDER}" is reserved for plates's own progress lines; set PLATES_PROVIDER to the agent's name`);
  const config = JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8'));
  const { plateIdOf } = await import('./work-items.mjs');
  const project = plateIdOf(config.repo ?? config.name);
  let origin;
  try { origin = siteOf(site, env); } catch (error) { if (error instanceof SessionsError) throw new SayError(`not posted: ${error.message}`); throw error; }
  const secret = await key(env);
  if (!secret) throw new SayError('not posted: no device key; create one on your workspace\'s Devices page, then store it with: security add-generic-password -U -s plates-device-key -a plates -w (or set PLATES_DEVICE_KEY)');
  const phase = given !== undefined ? given : await claimedPhase(root, config, env);
  const body = { schema: 1, project, text: text.trim(), session, provider, phase };
  let response;
  try {
    response = await fetcher(`${origin}/api/channel/say`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20_000), redirect: 'error' });
  } catch (error) { throw new SayError(`not posted: could not reach ${origin}: ${String(error?.message ?? error).slice(0, 160)}`, 1); }
  const answer = await response.json().catch(() => null);
  if (response.status === 401) throw new SayError(`not posted: ${origin} refused this device's key (revoked, or not this workspace's); create a new one on its Devices page`, 1);
  if (response.status === 429) throw new SayError(`not posted: too frequent; one line per session per minute (${session} posted in the last minute)`, 1);
  if (response.status === 400 && answer?.error === 'invalid_channel_project') throw new SayError(`not posted: ${origin} has no plate ${project} in its workspace`, 1);
  if (!response.ok || answer?.posted !== true) throw new SayError(`not posted: ${origin} answered ${response.status}${answer?.error ? ` (${String(answer.error).slice(0, 60)})` : ''}`, 1);
  const actor = phase !== null ? `${project}#${phase}` : `${project}@${session}`;
  return { data: { posted: true, site: origin, project, phase, session, provider, at: answer.at, text: body.text },
    text: `Posted to ${project}'s channel on ${origin} as ${actor}${provider ? ` (${provider})` : ''}: ${body.text}` };
}

/**
 * The CLI channel's say lines, per plate: { [plateId]: { state: 'read', items } | { state: 'unavailable', why } }.
 * Lines are kept on the owner's workspace; with no workspace named (PLATES_SITE) or no device key, every plate
 * says why they are not read here: a named gap, never a quiet channel. The key is read only when a site is named.
 */
export async function readSays({ plates, since, env = process.env, fetcher = fetch, key, requireOwner = false }) {
  const { deviceKey, siteOf } = await import('./sessions.mjs');
  key ??= deviceKey;
  const all = why => Object.fromEntries(plates.map(id => [id, { state: 'unavailable', why }]));
  let origin;
  try { origin = siteOf(undefined, env); } catch { return all('agents\' lines are kept on your Plates workspace; set PLATES_SITE and a device key to read them here'); }
  const secret = await key(env);
  if (!secret) return all(`agents' lines are kept on ${origin}; no device key here to read them (PLATES_DEVICE_KEY or the keychain)`);
  const out = {};
  // The owner's lines (increment 3) come with agents' lines when asked for (owner=1); a workspace that does not serve them yet
  // refuses the query, and is asked again for agents' lines alone.
  const { validLine } = await import('./channel-owner.mjs');
  const ask = (id, owner) => fetcher(`${origin}/api/channel/says?project=${encodeURIComponent(id)}${owner ? '&owner=1' : ''}${since ? `&since=${encodeURIComponent(since)}` : ''}`,
    { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(20_000), redirect: 'error' });
  await Promise.all(plates.map(async id => {
    try {
      let response = await ask(id, true), body = await response.json().catch(() => null);
      if (!requireOwner && response.status === 400 && body?.error === 'invalid_query') { response = await ask(id, false); body = await response.json().catch(() => null); }
      if (response.status === 401) { out[id] = { state: 'unavailable', why: `${origin} refused this device's key` }; return; }
      if (!response.ok || !Array.isArray(body?.items)) { out[id] = { state: 'unavailable', why: `${origin} answered ${response.status}${body?.error ? ` (${String(body.error).slice(0, 60)})` : ''}` }; return; }
      const items = body.items.map(validLine);
      out[id] = items.every(Boolean) ? { state: 'read', items } : { state: 'unavailable', why: `${origin} sent a line that is not one` };
    } catch (error) { out[id] = { state: 'unavailable', why: `could not reach ${origin}: ${String(error?.message ?? error).slice(0, 120)}` }; }
  }));
  return out;
}

/**
 * Post one progress line for an attach: { posted: true, at } or { note } naming why not. Never throws, so an attach
 * or cancel never fails because its line could not be posted. No workspace named (PLATES_SITE) or no device key is a
 * note too: the step itself is in the attach journal either way. Bounded by `timeoutMs`.
 */
export async function postProgress({ project, phase, step, digest, text }, { env = process.env, fetcher = fetch, key, timeoutMs = 5_000 } = {}) {
  const { deviceKey, siteOf } = await import('./sessions.mjs');
  key ??= deviceKey;
  const session = progressSession(step, digest);
  const body = { schema: 1, project, text: String(text ?? '').trim(), session, provider: PROGRESS_PROVIDER, phase: Number.isSafeInteger(phase) ? phase : null };
  if (!PROGRESS_STEPS.includes(step) || !PROGRESS_SESSION.test(session) || !validPost(body)) return { note: `progress line not posted: it is not a valid ${step} line` };
  if (deviceProgressProblem(body)) return { note: `progress line not posted: ${step} is the owner's step, posted from the signed-in site, never with a device key` };
  let origin;
  try { origin = siteOf(undefined, env); } catch { return { note: 'progress line not posted: no Plates workspace named here (PLATES_SITE)' }; }
  let secret;
  try { secret = await key(env); } catch { secret = null; }
  if (!secret) return { note: `progress line not posted: no device key here for ${origin}` };
  try {
    const response = await fetcher(`${origin}/api/channel/say`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    const answer = await response.json().catch(() => null);
    if (response.status === 429) return { note: `progress line not posted: ${step} was already posted for this attach in the last minute` };
    if (!response.ok || answer?.posted !== true) return { note: `progress line not posted: ${origin} answered ${response.status}${answer?.error ? ` (${String(answer.error).slice(0, 60)})` : ''}` };
    return { posted: true, at: answer.at };
  } catch (error) { return { note: `progress line not posted: could not reach ${origin}: ${String(error?.message ?? error).slice(0, 120)}` }; }
}
