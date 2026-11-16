// Channel posts on the hosted workspace (SQL024): an agent's own lines (plates say, lib/channel-say.mjs), posted
// with the owner's device key (SQL022, lib/web/waiting-store.mjs). Each line is sealed to its owner's scope and
// project, so the database holds digests, ciphertext and timestamps only. The service checks every bound the SQL
// checks (280 characters, one per session per minute, 14 days, 500 per project) and refuses first.
import { exact, hash, requestJson, seal, unseal, WebError } from './common.mjs';
import { createWaitingStore } from './waiting-store.mjs';
import { validPost, validSaid, SAY_SEALED_BYTES, SAY_PER_PROJECT } from '../channel-say.mjs';

const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function createChannelStore(config, fetcher = fetch) {
  // The owner's scope is the device keys' (SQL022): a key's owner reads and writes the same lines.
  const scope = createWaitingStore(config, fetcher).scopeFor;
  const projects = () => Object.keys(config.projectRepoIds ?? {});
  const projectFor = (owner, id) => hash(JSON.stringify(['channel-project-v1', owner, id]));
  const sessionFor = (owner, session) => hash(JSON.stringify(['channel-session-v1', owner, session]));
  const purpose = (owner, project) => `channel-post-v1:${owner}:${project}`;
  async function rpc(body) {
    return requestJson(fetcher, `${config.storageUrl}/rest/v1/rpc/plates_channel_rpc`, { method: 'POST',
      headers: { apikey: config.storageKey, Authorization: `Bearer ${config.storageKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_scope: null, p_project: null, p_session: null, p_device: null, p_value: null, p_since: null, ...body }) }, (SAY_SEALED_BYTES + 128) * SAY_PER_PROJECT + 4096);
  }
  const owner = userId => { if (!Number.isSafeInteger(userId) || userId < 1) throw new WebError('invalid_channel_owner', 400); return scope(userId); };
  return {
    projectFor, sessionFor,
    /** One line from a device ({ userId, device, label } from the waiting store's resolve): { posted: true, at }. */
    async post({ userId, device, label }, body) {
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
    /** The owner's lines on one plate, oldest first, newer than `since` (an ISO time) when given: [{ at, text, session, provider, phase, device }]. */
    async list(userId, projectId, { since = null } = {}) {
      if (!projects().includes(projectId)) throw new WebError('invalid_channel_project', 400);
      if (since !== null && !Number.isFinite(Date.parse(since))) throw new WebError('invalid_channel_since', 400);
      const mine = owner(userId), project = projectFor(mine, projectId);
      const result = await rpc({ p_operation: 'list', p_scope: mine, p_project: project, p_since: since === null ? null : new Date(Date.parse(since)).toISOString() });
      if (!exact(result, ['items']) || !Array.isArray(result.items) || result.items.length > SAY_PER_PROJECT) throw new WebError('invalid_channel_storage');
      return result.items.map(row => {
        if (!exact(row, ['value', 'postedAt']) || typeof row.value !== 'string') throw new WebError('invalid_channel_storage');
        const line = validSaid({ ...unseal(row.value, config.encryptionKey, purpose(mine, project)), at: row.postedAt });
        if (!line) throw new WebError('invalid_channel_storage');
        return line;
      });
    },
  };
}
