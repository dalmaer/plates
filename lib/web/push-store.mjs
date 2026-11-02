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
