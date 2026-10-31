// The owner's own devices: read the public VAPID key, subscribe, unsubscribe.
// The server checks session, origin and CSRF before these run.
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
    async unsubscribe(access, data) {
      const userId = owner(access);
      if (!exact(data, ['endpoint'])) throw new WebError('invalid_push_subscription', 400);
      return store.unsubscribe(userId, data.endpoint);
    },
  };
}
