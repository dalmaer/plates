// plates sessions: this machine's home sessions waiting on you (lib/waiting-scan.mjs),
// and `push`, which sends that snapshot to the owner's Plates workspace with this
// device's key (SQL022). The key is read at run time from PLATES_DEVICE_KEY or the
// macOS keychain item "plates-device-key"; it is never printed, logged or written.
import { execFile } from 'node:child_process';
import { hostname } from 'node:os';
import { scanWaitingSessions } from './waiting-scan.mjs';

export class SessionsError extends Error {
  constructor(message, exitCode = 1) { super(message); this.exitCode = exitCode; }
}

const lines = snapshot => snapshot.sessions.length
  ? snapshot.sessions.map(s => `  ${s.plate}: ${s.title}${s.since ? ` (since ${s.since.slice(0, 16).replace('T', ' ')} UTC)` : ''}${s.question ? `\n    ${s.question}` : ''}`)
  : ['  none'];

const scriptLines = snapshot => (snapshot.scripts.length ? snapshot.scripts.map(x => `  ${x.name}${x.checked ? '' : ' [not checked]'}\n    ${x.why}`) : ['  none']);
/** Rex panes blocked on the owner (phase 199): absent is not read, never none. */
const PANE_WAITS = { permission: 'asking for permission', question: 'asking you a question', auth: 'waiting for a sign-in or password' };
const paneLines = snapshot => [`Rex panes waiting on you${snapshot.panes ? ` (${snapshot.panes.length})` : ''}`,
  ...(!snapshot.panes ? ['  not read: rex is not on PATH or did not answer'] : snapshot.panes.length
    ? snapshot.panes.map(p => `  ${p.tab} in ${p.session}: ${p.app ? `${p.app} ` : ''}${PANE_WAITS[p.kind] ?? 'says it is blocked on you'}${p.since ? ` (since ${p.since.slice(0, 16).replace('T', ' ')} UTC)` : ''}\n    rex focus -s ${p.sid} ${p.block}`)
    : ['  none'])];

export async function waiting({ env = process.env, now = Date.now(), machine = hostname() } = {}) {
  const snapshot = await scanWaitingSessions({ env, machine, now });
  return { data: snapshot, text: [`Home sessions waiting on you on ${snapshot.machine} (${snapshot.sessions.length})`, ...lines(snapshot),
    `Scripts waiting for you to run (${snapshot.scripts.length}): runme`, ...scriptLines(snapshot), ...paneLines(snapshot)].join('\n') };
}

/** The device key, from the environment or the keychain; null when neither has one. */
export function deviceKey(env = process.env, run = execFile) {
  if (typeof env.PLATES_DEVICE_KEY === 'string' && env.PLATES_DEVICE_KEY.trim()) return Promise.resolve(env.PLATES_DEVICE_KEY.trim());
  if (process.platform !== 'darwin') return Promise.resolve(null);
  return new Promise(done => run('security', ['find-generic-password', '-s', 'plates-device-key', '-a', 'plates', '-w'], { timeout: 10_000, encoding: 'utf8' },
    (error, stdout) => done(error ? null : String(stdout).trim() || null)));
}

/** The workspace to push to: --site, or PLATES_SITE; an https origin (http only for localhost). */
export function siteOf(site, env = process.env) {
  const value = site ?? env.PLATES_SITE;
  if (!value) throw new SessionsError('which workspace? --site https://<your plates site>, or PLATES_SITE', 2);
  let url;
  try { url = new URL(value); } catch { throw new SessionsError(`--site ${value} is not a URL`, 2); }
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new SessionsError('--site must be https', 2);
  return url.origin;
}

export async function push({ site, env = process.env, now = Date.now(), machine = hostname(), fetcher = fetch, key = deviceKey } = {}) {
  const origin = siteOf(site, env), secret = await key(env);
  if (!secret) throw new SessionsError('no device key: create one on your workspace\'s Devices page, then store it with: security add-generic-password -U -s plates-device-key -a plates -w (or set PLATES_DEVICE_KEY)', 2);
  const snapshot = await scanWaitingSessions({ env, machine, now });
  let response;
  try {
    response = await fetcher(`${origin}/api/sessions/waiting`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot), signal: AbortSignal.timeout(20_000), redirect: 'error' });
  } catch (error) { throw new SessionsError(`could not reach ${origin}: ${String(error?.message ?? error).slice(0, 160)}`); }
  const body = await response.json().catch(() => null);
  if (response.status === 401) throw new SessionsError(`${origin} refused this device's key (revoked, or not this workspace's); create a new one on its Devices page`);
  if (!response.ok || body?.pushed !== true) throw new SessionsError(`${origin} answered ${response.status}${body?.error ? ` (${String(body.error).slice(0, 60)})` : ''}`);
  const { deliverOwnerLines } = await import('./channel-deliver.mjs');
  const delivery = await deliverOwnerLines({ origin, env, fetcher, key: async () => secret });
  return { data: { pushed: true, site: origin, sessions: snapshot.sessions.length, scripts: snapshot.scripts.length, panes: snapshot.panes?.length ?? null, scannedAt: snapshot.scannedAt, ...(delivery.length ? { delivery } : {}) },
    text: [`Sent ${snapshot.sessions.length} waiting session${snapshot.sessions.length === 1 ? '' : 's'} and ${snapshot.scripts.length} runme script${snapshot.scripts.length === 1 ? '' : 's'} from ${snapshot.machine} to ${origin}.`, ...lines(snapshot), ...scriptLines(snapshot), ...paneLines(snapshot),
      ...delivery.map(d => `Channel delivery ${d.run}: ${d.error ?? `sent ${d.delivered} owner line(s)`}`)].join('\n') };
}
