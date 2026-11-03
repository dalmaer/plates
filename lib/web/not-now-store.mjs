// Not now on the hosted workspace (SQL017, plates phase 173): one sealed record
// per owner and item, { key, until, reason? }, keyed by the item's itemKey
// digest. Its return date is the only plain field, so expired rows can be
// removed. The CLI keeps the same records in a file (lib/not-now.mjs).
import { exact, hash, requestJson, seal, unseal, WebError } from './common.mjs';
import { notNowRecord } from '../work-items.mjs';

const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function createNotNowStore(config, fetcher = fetch) {
  const scopeFor = userId => hash(JSON.stringify(['not-now-v1', config.appId, config.installationId, config.workspace.id, config.workspace.repoId, userId]));
  const purpose = (userId, key) => `not-now-v1:${scopeFor(userId)}:${key}`;
  async function rpc(operation, userId, key = null, value = null, until = null) {
    if (!Number.isSafeInteger(userId) || userId < 1) throw new WebError('invalid_not_now_owner', 400);
    const result = await requestJson(fetcher, `${config.storageUrl}/rest/v1/rpc/plates_not_now_rpc`, { method: 'POST',
      headers: { apikey: config.storageKey, Authorization: `Bearer ${config.storageKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_operation: operation, p_scope: scopeFor(userId), p_key: key, p_value: value, p_until: until }) }, 262144);
    if (result?.capacity === true) throw new WebError('not_now_capacity', 413);
    return result;
  }
  return {
    scopeFor,
    /** Put one item off until its date. */
    async put(userId, itemKey, { until, reason, today }) {
      if (typeof itemKey !== 'string' || !itemKey || itemKey.length > 400) throw new WebError('invalid_not_now_item', 400);
      let record;
      try { record = notNowRecord({ until, reason, today }); } catch { throw new WebError('invalid_not_now', 400); }
      const key = hash(itemKey), result = await rpc('put', userId, key, seal({ key: itemKey, ...record }, config.encryptionKey, purpose(userId, key)), record.until);
      if (!exact(result, ['put', 'count']) || result.put !== true || !Number.isSafeInteger(result.count)) throw new WebError('invalid_not_now_storage');
      return { key: itemKey, ...record, count: result.count };
    },
    async clear(userId, itemKey) {
      if (typeof itemKey !== 'string' || !itemKey) throw new WebError('invalid_not_now_item', 400);
      const result = await rpc('clear', userId, hash(itemKey));
      if (!exact(result, ['cleared']) || typeof result.cleared !== 'boolean') throw new WebError('invalid_not_now_storage');
      return result;
    },
    /** Every record still before its date: itemKey → { until, reason? }. */
    async list(userId) {
      const result = await rpc('list', userId);
      if (!exact(result, ['items']) || !Array.isArray(result.items) || result.items.length > 500) throw new WebError('invalid_not_now_storage');
      const out = {};
      for (const row of result.items) {
        if (!exact(row, ['key', 'value', 'until']) || !hex(row.key) || typeof row.value !== 'string' || !day(row.until)) throw new WebError('invalid_not_now_storage');
        const value = unseal(row.value, config.encryptionKey, purpose(userId, row.key));
        if (!value || typeof value.key !== 'string' || hash(value.key) !== row.key || value.until !== row.until) throw new WebError('invalid_not_now_storage');
        out[value.key] = { until: value.until, ...(typeof value.reason === 'string' && value.reason ? { reason: value.reason } : {}) };
      }
      return out;
    },
  };
}
