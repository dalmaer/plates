// The owner's own devices: read the public VAPID key, subscribe, unsubscribe.
// The server checks session, origin and CSRF before these run; a rotation,
// sent by the worker without a page, is checked by origin and its old endpoint.
import { deny, exact, WebError } from './common.mjs';
import { createPushStore } from './push-store.mjs';
import { vapidKeys } from './push.mjs';

export function createPushSubscriptions(config, { fetcher }) {
  const store = createPushStore(config, fetcher);
  const owner = access => { if (!config.ownerIds.includes(access?.userId)) deny(); return access.userId; };
  return {
    status: access => { owner(access); return { publicKey: vapidKeys(config.encryptionKey).publicKey }; },
    async subscribe(access, data) {
      const userId = owner(access);
      if (!exact(data, ['subscription'])) throw new WebError('invalid_push_subscription', 400);
      return store.subscribe(userId, data.subscription);
    },
    // A subscription the browser rotated. Its old endpoint is the authority, so
    // a session is optional; with one, only that owner's own record can change.
    // An unknown old endpoint is refused and nothing new is ever created here.
    async rotate(access, data) {
      if (!exact(data, ['oldEndpoint', 'subscription']) || typeof data.oldEndpoint !== 'string' || !data.oldEndpoint || data.oldEndpoint.length > 1024)
        throw new WebError('invalid_push_subscription', 400);
      for (const userId of access ? [owner(access)] : config.ownerIds) {
        if ((await store.list(userId)).some(subscription => subscription.endpoint === data.oldEndpoint)) return store.replace(userId, data.oldEndpoint, data.subscription);
      }
      throw new WebError('unknown_push_subscription', 404);
    },
    async unsubscribe(access, data) {
      const userId = owner(access);
      if (!exact(data, ['endpoint'])) throw new WebError('invalid_push_subscription', 400);
      return store.unsubscribe(userId, data.endpoint);
    },
  };
}
