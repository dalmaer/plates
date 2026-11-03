// Not now, on the owner's machine (plates phase 173): one JSON file per user,
// outside every project, so an item put off is never written into a plate.
//
//   $XDG_STATE_HOME/plates/snoozed.json, else ~/.local/state/plates/snoozed.json
//
// plates keeps no other per-user state outside projects (its cache is
// $XDG_CACHE_HOME/plates, and a cache may be cleared), so this is the plates
// state directory. { schema: 1, items: { <itemKey>: { until, reason?, at } } }.
// The hosted workspace keeps the same records in its store (lib/web/not-now-store.mjs).
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { notNowRecord } from './work-items.mjs';

export const NOT_NOW_LIMIT = 500;
export const stateDir = (env = process.env) => join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'plates');
export const notNowFile = (env = process.env) => join(stateDir(env), 'snoozed.json');

export class NotNowError extends Error { constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; } }

/** Every Not now record: key → { until, reason?, at }. A missing file is none; an unreadable one throws, never read as none. */
export async function readNotNow(env = process.env) {
  let raw;
  try { raw = await readFile(notNowFile(env), 'utf8'); } catch (error) { if (error.code === 'ENOENT') return {}; throw new NotNowError(`${notNowFile(env)} could not be read: ${error.code ?? error.message}`); }
  let data;
  try { data = JSON.parse(raw); } catch { throw new NotNowError(`${notNowFile(env)} is not JSON; nothing is hidden until it is fixed or removed`); }
  if (data?.schema !== 1 || !data.items || typeof data.items !== 'object' || Array.isArray(data.items)) throw new NotNowError(`${notNowFile(env)} is not a schema 1 Not now file`);
  const out = {};
  for (const [key, value] of Object.entries(data.items)) {
    if (typeof key !== 'string' || !value || typeof value.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.until)) continue;
    out[key] = { until: value.until, ...(typeof value.reason === 'string' && value.reason ? { reason: value.reason } : {}), ...(typeof value.at === 'string' ? { at: value.at } : {}) };
  }
  return out;
}

/** Put one item off: { until, reason? } (checked by the model's notNowRecord). Records past their date are dropped as the file is written. */
export async function putOff(env, key, { until, reason, today, now = Date.now() }) {
  if (typeof key !== 'string' || !key || key.length > 400) throw new NotNowError('an item key is required');
  const record = notNowRecord({ until, reason, today });
  const items = Object.fromEntries(Object.entries(await readNotNow(env)).filter(([, v]) => v.until > today));
  items[key] = { ...record, at: new Date(now).toISOString() };
  if (Object.keys(items).length > NOT_NOW_LIMIT) throw new NotNowError(`more than ${NOT_NOW_LIMIT} items are put off; answer some first`);
  const file = notNowFile(env), tmp = `${file}.${process.pid}.tmp`;
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(tmp, `${JSON.stringify({ schema: 1, items }, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, file);
  return { file, key, ...record };
}
