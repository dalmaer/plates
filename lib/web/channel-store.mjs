// Channel posts on the hosted workspace (SQL024): an agent's own lines (plates say, lib/channel-say.mjs), posted
// with the owner's device key (SQL022, lib/web/waiting-store.mjs). Each line is sealed to its owner's scope and
// project, so the database holds digests, ciphertext and timestamps only. The service checks every bound the SQL
// checks (280 characters, one per session per minute, 14 days, 500 per project) and refuses first.
// The owner's lines (SQL025, phase 194 increment 3, lib/channel-owner.mjs) share the table: posted from the signed-in site,
// sealed with the owner marker under the owner's own digest in the device column (no device key), at most
// OWNER_PER_MINUTE a minute per plate. A line read back is the owner's only when its row carries that digest AND its
// sealed value says so; either alone is a storage fault. Before 025 is applied the owner's post says the channel cannot
// take the owner's lines yet, and agents' lines are read as before.
import { boundedJson, exact, hash, requestJson, seal, unseal, WebError } from './common.mjs';
import { createWaitingStore } from './waiting-store.mjs';
import { validPost, validSaid, deviceProgressProblem, SAY_SEALED_BYTES, SAY_PER_PROJECT } from '../channel-say.mjs';
import { validOwnerPost, validOwnerSaid, ownerLineProblem, OWNER_KIND } from '../channel-owner.mjs';

const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function createChannelStore(config, fetcher = fetch) {
  // The owner's scope is the device keys' (SQL022): a key's owner reads and writes the same lines.
  const scope = createWaitingStore(config, fetcher).scopeFor;
  const projects = () => Object.keys(config.projectRepoIds ?? {});
  const projectFor = (owner, id) => hash(JSON.stringify(['channel-project-v1', owner, id]));
  const sessionFor = (owner, session) => hash(JSON.stringify(['channel-session-v1', owner, session]));
  const purpose = (owner, project) => `channel-post-v1:${owner}:${project}`;
  // The owner's lines carry this digest in the device (and session) column: derived here from the owner's scope, never a device key's.
  const ownerDeviceFor = owner => hash(JSON.stringify(['channel-owner-v1', owner]));
  async function rpc(body) {
    return requestJson(fetcher, `${config.storageUrl}/rest/v1/rpc/plates_channel_rpc`, { method: 'POST',
      headers: { apikey: config.storageKey, Authorization: `Bearer ${config.storageKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_scope: null, p_project: null, p_session: null, p_device: null, p_value: null, p_since: null, ...body }) }, (SAY_SEALED_BYTES + 128) * SAY_PER_PROJECT + 4096);
  }
  /**
   * The owner's post, read closer than requestJson reads: before SQL025, 024's RPC raises 'invalid channel operation', which
   * PostgREST answers as a 400 with code P0001 and that message, and nothing was stored. That answer alone means the
   * migration is missing. Any other failure (a timeout, a lost or cut response, a 5xx, anything unknown) may come after the
   * insert committed, so it is uncertain, never "nothing was posted".
   */
  async function ownerRpc(body) {
    let response;
    try {
      response = await fetcher(`${config.storageUrl}/rest/v1/rpc/plates_channel_rpc`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { apikey: config.storageKey, Authorization: `Bearer ${config.storageKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_scope: null, p_project: null, p_session: null, p_device: null, p_value: null, p_since: null, ...body }) });
    } catch { throw new WebError('channel_owner_uncertain', 503); }
    if (response.status === 400) {
      let answer = null;
      try { answer = JSON.parse((await response.text()).slice(0, 4096)); } catch { /* not PostgREST's answer */ }
      if (answer?.code === 'P0001' && answer?.message === 'invalid channel operation') throw new WebError('channel_owner_unavailable', 503);
      throw new WebError('channel_owner_uncertain', 503);
    }
    try { return await boundedJson(response, 4096); }
    catch { throw new WebError('channel_owner_uncertain', 503); }
  }
  const owner = userId => { if (!Number.isSafeInteger(userId) || userId < 1) throw new WebError('invalid_channel_owner', 400); return scope(userId); };
  return {
    projectFor, sessionFor, ownerDeviceFor,
    /** One line from a device ({ userId, device, label } from the waiting store's resolve): { posted: true, at }. */
    async post({ userId, device, label }, body) {
      // A device key posts only what plates on that device did; the owner's steps (accepted, correction, preview, finished)
      // and any other "plates" line are refused by name before anything is stored; so is a body shaped like the owner's line.
      const reserved = ownerLineProblem(body) ?? deviceProgressProblem(body);
      if (reserved) throw new WebError(reserved, 403);
      const valid = validPost(body);
      if (!valid) throw new WebError('invalid_channel_post', 400);
      if (!projects().includes(valid.project)) throw new WebError('invalid_channel_project', 400);
      if (!hex(device)) throw new WebError('device_key_required', 401);
      const mine = owner(userId), project = projectFor(mine, valid.project);
      const value = seal({ text: valid.text, session: valid.session, provider: valid.provider, phase: valid.phase, device: typeof label === 'string' ? label : null }, config.encryptionKey, purpose(mine, project));
      if (Buffer.byteLength(value) > SAY_SEALED_BYTES) throw new WebError('invalid_channel_post', 400);
      const result = await rpc({ p_operation: 'post', p_scope: mine, p_project: project, p_session: sessionFor(mine, valid.session), p_device: device, p_value: value });
      if (result?.revoked === true) throw new WebError('device_key_required', 401);
      if (result?.tooFrequent === true) throw new WebError('channel_too_frequent', 429);
      if (!exact(result, ['posted', 'at']) || result.posted !== true || !Number.isFinite(Date.parse(result.at))) throw new WebError('invalid_channel_storage');
      return { posted: true, at: new Date(Date.parse(result.at)).toISOString() };
    },
    /**
     * The owner's own line from the signed-in site ({ project, text }; the route has checked the session, origin and CSRF):
     * { posted: true, at, to }. Before SQL025 is applied the store cannot take it: channel_owner_unavailable; any other storage
     * failure is channel_owner_uncertain (the line may have been stored). Both are said on the page.
     */
    async ownerPost(userId, body) {
      const valid = validOwnerPost(body);
      if (valid?.refused) throw new WebError(valid.refused, 400);
      if (!valid) throw new WebError('invalid_channel_post', 400);
      if (!projects().includes(valid.project)) throw new WebError('invalid_channel_project', 400);
      const mine = owner(userId), project = projectFor(mine, valid.project), device = ownerDeviceFor(mine);
      const value = seal({ kind: OWNER_KIND, text: valid.text, to: valid.to, by: `github:${userId}` }, config.encryptionKey, purpose(mine, project));
      if (Buffer.byteLength(value) > SAY_SEALED_BYTES) throw new WebError('invalid_channel_post', 400);
      let result;
      result = await ownerRpc({ p_operation: 'owner-post', p_scope: mine, p_project: project, p_session: device, p_device: device, p_value: value });
      if (result?.tooFrequent === true) throw new WebError('channel_owner_too_frequent', 429);
      if (!exact(result, ['posted', 'at']) || result.posted !== true || !Number.isFinite(Date.parse(result.at))) throw new WebError('invalid_channel_storage');
      return { posted: true, at: new Date(Date.parse(result.at)).toISOString(), to: valid.to };
    },
    /**
     * The lines on one plate, oldest first, newer than `since` (an ISO time) when given: agents' lines
     * [{ at, text, session, provider, phase, device }] and, unless `owner` is false, the owner's [{ at, kind: 'owner', text, to, by }].
     * Read with the owner mark (SQL025); before 025 is applied that read is refused and agents' lines are read alone.
     */
    async list(userId, projectId, { since = null, owner: withOwner = true } = {}) {
      if (!projects().includes(projectId)) throw new WebError('invalid_channel_project', 400);
      if (since !== null && !Number.isFinite(Date.parse(since))) throw new WebError('invalid_channel_since', 400);
      const mine = owner(userId), project = projectFor(mine, projectId), p_since = since === null ? null : new Date(Date.parse(since)).toISOString();
      let result, marked = true;
      try { result = await rpc({ p_operation: 'list-marked', p_scope: mine, p_project: project, p_device: ownerDeviceFor(mine), p_since }); }
      catch (error) {
        if (!(error instanceof WebError) || error.code !== 'upstream_unavailable') throw error;
        marked = false; result = await rpc({ p_operation: 'list', p_scope: mine, p_project: project, p_since });
      }
      if (!exact(result, ['items']) || !Array.isArray(result.items) || result.items.length > SAY_PER_PROJECT) throw new WebError('invalid_channel_storage');
      const lines = result.items.flatMap(row => {
        if (!exact(row, marked ? ['value', 'postedAt', 'owner'] : ['value', 'postedAt']) || typeof row.value !== 'string' || (marked && typeof row.owner !== 'boolean')) throw new WebError('invalid_channel_storage');
        const value = unseal(row.value, config.encryptionKey, purpose(mine, project));
        // The owner's line needs both marks: the owner's digest on its row and the owner's kind in its sealed value.
        const ownerRow = marked && row.owner === true, ownerValue = value?.kind !== undefined;
        // Read without marks (024's list: before 025, or after 025 is rolled back), an owner's stored line cannot be
        // authenticated: it is hidden, never trusted and never a fault, so agents' lines keep reading. Re-applying 025 shows it.
        if (!marked && ownerValue) return [];
        if (ownerRow !== ownerValue) throw new WebError('invalid_channel_storage');
        const line = ownerRow ? validOwnerSaid({ ...value, at: row.postedAt }) : validSaid({ ...value, at: row.postedAt });
        if (!line) throw new WebError('invalid_channel_storage');
        return line;
      });
      return withOwner ? lines : lines.filter(l => l.kind !== OWNER_KIND);
    },
  };
}
