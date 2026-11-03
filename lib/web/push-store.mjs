// Private push records (SQL015): sealed subscriptions per owner and the ledger
// that lets one item notify once. Every operation is one database transaction.
import { exact, hash, requestJson, seal, unseal, WebError } from './common.mjs';
import { validSubscription } from './push.mjs';

const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function createPushStore(config, fetcher = fetch) {
  const scopeFor = userId => hash(JSON.stringify(['push-v1', config.appId, config.installationId, config.workspace.id, config.workspace.repoId, userId]));
  async function rpc(operation, userId, key = null, value = null) {
    if (!Number.isSafeInteger(userId) || userId < 1) throw new WebError('invalid_push_owner', 400);
    const result = await requestJson(fetcher, `${config.storageUrl}/rest/v1/rpc/plates_push_rpc`, { method: 'POST',
      headers: { apikey: config.storageKey, Authorization: `Bearer ${config.storageKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_operation: operation, p_scope: scopeFor(userId), p_key: key, p_value: value }) }, 65536);
    if (result?.capacity === true) throw new WebError('push_capacity', 413);
    return result;
  }
  const purpose = (userId, key) => `push-subscription-v1:${scopeFor(userId)}:${key}`;
  return {
    scopeFor,
    async subscribe(userId, subscription) {
      const valid = validSubscription(subscription);
      if (!valid) throw new WebError('invalid_push_subscription', 400);
      const key = hash(valid.endpoint), result = await rpc('subscribe', userId, key, seal(valid, config.encryptionKey, purpose(userId, key)));
      if (!exact(result, ['subscribed', 'devices']) || result.subscribed !== true || !Number.isSafeInteger(result.devices)) throw new WebError('invalid_push_storage');
      return { subscribed: true, devices: result.devices };
    },
    async unsubscribe(userId, endpoint) {
      if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 1024) throw new WebError('invalid_push_subscription', 400);
      const result = await rpc('unsubscribe', userId, hash(endpoint));
      if (!exact(result, ['removed', 'devices']) || typeof result.removed !== 'boolean' || !Number.isSafeInteger(result.devices)) throw new WebError('invalid_push_storage');
      return result;
    },
    // A rotated subscription: the new record replaces the old one for the same
    // owner. The old record goes first so a full device list cannot refuse it.
    async replace(userId, oldEndpoint, subscription) {
      if (!validSubscription(subscription)) throw new WebError('invalid_push_subscription', 400);
      if (subscription.endpoint !== oldEndpoint) await this.unsubscribe(userId, oldEndpoint);
      const result = await this.subscribe(userId, subscription);
      return { rotated: true, devices: result.devices };
    },
    async list(userId) {
      const result = await rpc('list', userId);
      if (!exact(result, ['subscriptions']) || !Array.isArray(result.subscriptions) || result.subscriptions.length > 10) throw new WebError('invalid_push_storage');
      return result.subscriptions.map(row => {
        if (!exact(row, ['key', 'value']) || !hex(row.key) || typeof row.value !== 'string') throw new WebError('invalid_push_storage');
        const value = validSubscription(unseal(row.value, config.encryptionKey, purpose(userId, row.key)));
        if (!value || hash(value.endpoint) !== row.key) throw new WebError('invalid_push_storage');
        return value;
      });
    },
    // true only for the first claim of this item for this owner.
    async claim(userId, itemKey) {
      if (!hex(itemKey)) throw new WebError('invalid_push_item', 400);
      const result = await rpc('claim', userId, itemKey);
      if (!exact(result, ['claimed']) || typeof result.claimed !== 'boolean') throw new WebError('invalid_push_storage');
      return result.claimed;
    },
  };
}

/**
 * The last "N new for you" (plates phase 175): { count, date } per owner, the
 * count the owner was last told of (or the lower count seen since) and the
 * owner's local date it was sent. It is kept in phase 173's per-owner store
 * (SQL017, plates_not_now_rpc) under its own scope, so Not now never lists it
 * and no migration is needed; the row is kept 300 days after each write.
 */
export function createDocketState(config, fetcher = fetch) {
  const scopeFor = userId => hash(JSON.stringify(['push-docket-v1', config.appId, config.installationId, config.workspace.id, config.workspace.repoId, userId]));
  const key = hash('push-docket-v1:last'), purpose = userId => `push-docket-v1:${scopeFor(userId)}:${key}`;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  async function rpc(operation, userId, value = null, until = null) {
    if (!Number.isSafeInteger(userId) || userId < 1) throw new WebError('invalid_push_owner', 400);
    return requestJson(fetcher, `${config.storageUrl}/rest/v1/rpc/plates_not_now_rpc`, { method: 'POST',
      headers: { apikey: config.storageKey, Authorization: `Bearer ${config.storageKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_operation: operation, p_scope: scopeFor(userId), p_key: operation === 'list' ? null : key, p_value: value, p_until: until }) }, 65536);
  }
  return {
    scopeFor,
    /** { count, date } or null when nothing was ever sent. */
    async read(userId) {
      const result = await rpc('list', userId);
      if (!exact(result, ['items']) || !Array.isArray(result.items) || result.items.length > 1) throw new WebError('invalid_push_storage');
      const row = result.items[0];
      if (!row) return null;
      if (!exact(row, ['key', 'value', 'until']) || row.key !== key || typeof row.value !== 'string') throw new WebError('invalid_push_storage');
      const value = unseal(row.value, config.encryptionKey, purpose(userId));
      if (!exact(value, ['count', 'date']) || !Number.isSafeInteger(value.count) || value.count < 0 || !(value.date === null || day(value.date))) throw new WebError('invalid_push_storage');
      return value;
    },
    async write(userId, { count, date }, now = Date.now()) {
      if (!Number.isSafeInteger(count) || count < 0 || count > 100000 || !(date === null || day(date))) throw new WebError('invalid_push_storage');
      // Well inside the store's 400-day bound, so a clock that differs from the database's by days still writes.
      const until = new Date(now + 300 * 86_400_000).toISOString().slice(0, 10);
      const result = await rpc('put', userId, seal({ count, date }, config.encryptionKey, purpose(userId)), until);
      if (result?.capacity === true) throw new WebError('push_capacity', 413);
      if (!exact(result, ['put', 'count']) || result.put !== true) throw new WebError('invalid_push_storage');
      return { count, date };
    },
  };
}
