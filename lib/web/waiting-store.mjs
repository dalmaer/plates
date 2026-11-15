// Sessions waiting on you on the hosted workspace (SQL022): the owner's device
// keys, and the newest snapshot each device pushed (lib/waiting-sessions.mjs).
// A key is shown once, at creation, and only its SHA-256 is stored; each
// record is sealed to its owner's scope, so the database holds digests,
// ciphertext and timestamps only.
import { exact, hash, random, requestJson, seal, unseal, WebError } from './common.mjs';
import { validSnapshot } from '../waiting-sessions.mjs';

export const KEY_PREFIX = 'pdk_';
const KEY = /^pdk_[A-Za-z0-9_-]{43}$/, hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const LABEL = /^[A-Za-z0-9 ._-]{1,40}$/;
/** A device key's shape, or false (a malformed key is refused before any store read). */
export const deviceKeyShape = value => typeof value === 'string' && KEY.test(value);

export function createWaitingStore(config, fetcher = fetch, { now = Date.now } = {}) {
  const scopeFor = userId => hash(JSON.stringify(['waiting-v1', config.appId, config.installationId, config.workspace.id, config.workspace.repoId, userId]));
  async function rpc(body) {
    const result = await requestJson(fetcher, `${config.storageUrl}/rest/v1/rpc/plates_waiting_rpc`, { method: 'POST',
      headers: { apikey: config.storageKey, Authorization: `Bearer ${config.storageKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_scope: null, p_key_hash: null, p_device: null, p_value: null, p_at: null, ...body }) }, 12 * 1024 * 1024); // a list holds up to ten sealed snapshots of at most 1 MiB
    if (result?.capacity === true) throw new WebError('waiting_capacity', 413);
    return result;
  }
  const owner = userId => { if (!Number.isSafeInteger(userId) || userId < 1) throw new WebError('invalid_waiting_owner', 400); return scopeFor(userId); };
  return {
    scopeFor,
    /** A new device key for the owner: { key, device, label }. The key is returned here once and never again. */
    async createKey(userId, label) {
      const scope = owner(userId);
      if (typeof label !== 'string' || !LABEL.test(label.trim())) throw new WebError('invalid_device_label', 400);
      const key = `${KEY_PREFIX}${random()}`, keyHash = hash(key), device = hash(`device-v1:${scope}:${random()}`);
      const record = { userId, label: label.trim(), createdAt: new Date(now()).toISOString() };
      const result = await rpc({ p_operation: 'key-create', p_scope: scope, p_key_hash: keyHash, p_device: device, p_value: seal(record, config.encryptionKey, `waiting-device-v1:${scope}:${device}`) });
      if (!exact(result, ['created']) || result.created !== true) throw new WebError('invalid_waiting_storage');
      return { key, device, label: record.label };
    },
    /** The owner's devices: [{ device, label, createdAt, scannedAt }]. */
    async listKeys(userId) {
      const scope = owner(userId), result = await rpc({ p_operation: 'key-list', p_scope: scope });
      if (!exact(result, ['items']) || !Array.isArray(result.items) || result.items.length > 10) throw new WebError('invalid_waiting_storage');
      return result.items.map(row => {
        if (!exact(row, ['device', 'value', 'createdAt', 'scannedAt']) || !hex(row.device)) throw new WebError('invalid_waiting_storage');
        const label = unseal(row.value, config.encryptionKey, `waiting-device-v1:${scope}:${row.device}`);
        return { device: row.device, label: typeof label?.label === 'string' ? label.label : 'a device', createdAt: row.createdAt, scannedAt: row.scannedAt ?? null };
      });
    },
    async revokeKey(userId, device) {
      if (!hex(device)) throw new WebError('invalid_device', 400);
      const result = await rpc({ p_operation: 'key-revoke', p_scope: owner(userId), p_device: device });
      if (!exact(result, ['revoked']) || typeof result.revoked !== 'boolean') throw new WebError('invalid_waiting_storage');
      return result;
    },
    /** The device a key names: { userId, device, label }, or a 401 for a key that is malformed, unknown or revoked. */
    async resolve(key) {
      if (!deviceKeyShape(key)) throw new WebError('device_key_required', 401);
      const keyHash = hash(key), result = await rpc({ p_operation: 'key-resolve', p_key_hash: keyHash });
      if (result?.found !== true) throw new WebError('device_key_required', 401);
      if (!exact(result, ['found', 'scope', 'device', 'value']) || !hex(result.scope) || !hex(result.device)) throw new WebError('invalid_waiting_storage');
      const record = unseal(result.value, config.encryptionKey, `waiting-device-v1:${result.scope}:${result.device}`);
      if (!Number.isSafeInteger(record?.userId) || scopeFor(record.userId) !== result.scope) throw new WebError('device_key_required', 401);
      return { userId: record.userId, device: result.device, label: record.label };
    },
    /** Replace the device's snapshot with this one (checked field by field). */
    async push({ userId, device, label }, snapshot) {
      const valid = validSnapshot(snapshot);
      if (!valid) throw new WebError('invalid_waiting_snapshot', 400);
      const at = Date.parse(valid.scannedAt);
      if (at > now() + 5 * 60_000 || now() - at > 24 * 3600_000) throw new WebError('invalid_waiting_snapshot', 400);
      const scope = owner(userId), body = seal({ snapshot: valid, label }, config.encryptionKey, `waiting-snapshot-v1:${scope}:${device}`);
      const result = await rpc({ p_operation: 'push', p_scope: scope, p_device: device, p_value: body, p_at: valid.scannedAt });
      if (result?.revoked === true) throw new WebError('device_key_required', 401);
      if (!exact(result, ['pushed', 'kept']) || result.pushed !== true || typeof result.kept !== 'boolean') throw new WebError('invalid_waiting_storage');
      // kept: a newer scan from this device is already stored, so this older one changed nothing.
      return { pushed: true, sessions: valid.sessions.length, ...(result.kept ? { superseded: true } : {}) };
    },
    /** Every device's newest snapshot for the owner. */
    async list(userId) {
      const scope = owner(userId), result = await rpc({ p_operation: 'list', p_scope: scope });
      if (!exact(result, ['items']) || !Array.isArray(result.items) || result.items.length > 10) throw new WebError('invalid_waiting_storage');
      return result.items.map(row => {
        if (!exact(row, ['device', 'value', 'scannedAt']) || !hex(row.device)) throw new WebError('invalid_waiting_storage');
        const value = unseal(row.value, config.encryptionKey, `waiting-snapshot-v1:${scope}:${row.device}`);
        const snapshot = validSnapshot(value?.snapshot);
        if (!snapshot) throw new WebError('invalid_waiting_storage');
        // The device's stable id (a digest the store made), so two devices with one machine name never share an item key.
        return { ...snapshot, device: row.device.slice(0, 16) };
      });
    },
  };
}
