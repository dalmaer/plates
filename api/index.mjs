import { configFromEnv, webConfigEnvironment } from '../lib/web/config.mjs';
import { requireHostedRuntime } from '../lib/web/hosted-runtime.mjs';
import { createWebService, unavailableResponse } from '../lib/web/server.mjs';

// One current configuration, never a history of credentials or authorization
// grants. A changed binding/key/restore epoch discards the old service's caches.
export function createHostedHandler({ environment = () => process.env, fetcher = fetch, now = Date.now } = {}) {
  let previous, service;
  return async request => {
    try {
      requireHostedRuntime();
      const env = webConfigEnvironment(environment()), key = JSON.stringify(env);
      if (key !== previous) {
        previous = undefined; service = undefined;
        service = createWebService(configFromEnv(env), { fetcher, now });
        previous = key;
      }
      return await service(request);
    } catch {
      previous = undefined; service = undefined;
      return unavailableResponse();
    }
  };
}

// Vercel Web Handler: no build step, SDK or process-local authorization grant.
export default { fetch: createHostedHandler() };
