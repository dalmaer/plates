// "Since you last looked" on the hosted workspace (SQL018, plates phase 166):
// per owner, an opaque scope digest and two times the database keeps itself
// (clock_timestamp), never a time or anything else from the request. A visit is
// a run of Home page loads under thirty minutes apart; `previous` is the last
// load of the visit before this one, which is where "since" starts. The CLI
// keeps its own last run (lib/not-now.mjs's state directory).
import { exact, hash, requestJson, WebError } from './common.mjs';

const time = value => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(Date.parse(value)));

/** Where Home's "since" would start if it were loaded at `now`, from a read
 * (never a visit): a last load at least thirty minutes old begins a new visit,
 * so it is the start; otherwise the visit before this one is. Null: none stored.
 * Changes (phase 172's look found its first-visit filter empty) reads this so
 * both pages agree, without counting a Changes load as a Home visit. */
export function lookedSince({ seen = null, previous = null } = {}, now = Date.now()) {
  const at = Date.parse(seen ?? '');
  return Number.isFinite(at) && at <= now - 30 * 60000 ? seen : previous ?? null;
}

export function createLastLookedStore(config, fetcher = fetch) {
  const scopeFor = userId => hash(JSON.stringify(['last-looked-v1', config.appId, config.installationId, config.workspace.id, config.workspace.repoId, userId]));
  async function rpc(operation, userId) {
    if (!Number.isSafeInteger(userId) || userId < 1) throw new WebError('invalid_last_looked_owner', 400);
    const result = await requestJson(fetcher, `${config.storageUrl}/rest/v1/rpc/plates_last_looked_rpc`, { method: 'POST',
      headers: { apikey: config.storageKey, Authorization: `Bearer ${config.storageKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_operation: operation, p_scope: scopeFor(userId) }) }, 4096);
    if (result?.capacity === true) throw new WebError('last_looked_capacity', 413);
    if (!exact(result, ['seen', 'previous']) || !time(result.seen) || !time(result.previous)) throw new WebError('invalid_last_looked_storage');
    return result;
  }
  return {
    scopeFor,
    /** This owner's times without recording a load: { seen, previous } (ISO or null). */
    read: userId => rpc('read', userId),
    /** Record a load of the Home page and return the times after it. */
    visit: userId => rpc('visit', userId),
  };
}
