import test from 'node:test';
import assert from 'node:assert/strict';
import { requireHostedRuntime } from '../lib/web/hosted-runtime.mjs';
import { requireRuntime, configFromEnv } from '../lib/web/config.mjs';
import handler from '../api/index.mjs';
import { harness } from './helpers/web-http.mjs';

const approved = {
  VERCEL: '1', VERCEL_ENV: 'production',
  PLATES_HOSTED_RUNTIME_EXCEPTION: 'node-24.21.0-until-vercel-patched',
};

test('the ended exception no longer admits Node 24.21.0', () => {
  for (const version of ['24.21.0', '24.20.0', '24.21.99', '22.23.4', 'v24.21.0', 'invalid']) {
    assert.throws(() => requireHostedRuntime(approved, version), { code: 'unsupported_runtime' }, version);
    assert.throws(() => requireHostedRuntime({}, version), { code: 'unsupported_runtime' }, version);
  }
});

test('patched startup needs no exception and local/runtime/configuration guards stay strict', () => {
  for (const env of [{}, approved, { ...approved, PLATES_HOSTED_RUNTIME_EXCEPTION: '' }]) {
    assert.doesNotThrow(() => requireHostedRuntime(env, '24.22.1'));
  }
  assert.throws(() => requireRuntime('24.21.0'), { code: 'unsupported_runtime' });
  assert.throws(() => configFromEnv(approved), { code: 'invalid_service_configuration' });
  assert.throws(() => configFromEnv({ ...approved, VERCEL_ENV: 'preview' }), { code: 'preview_not_configured' });
});

test('real hosted entry point keeps configuration, authentication, origin and recovery checks', async t => {
  const h = harness();
  const env = { ...approved, PLATES_WEB_CONFIG: JSON.stringify(h.input),
    PLATES_GITHUB_CLIENT_SECRET: h.secrets.clientSecret, SUPABASE_URL: h.secrets.storageUrl,
    SUPABASE_SERVICE_ROLE_KEY: h.secrets.storageKey, PLATES_SESSION_ENCRYPTION_KEY: h.secrets.encryptionKey };
  const prior = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const version = Object.getOwnPropertyDescriptor(process.versions, 'node');
  t.after(() => {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    Object.defineProperty(process.versions, 'node', version);
  });
  Object.assign(process.env, env);
  Object.defineProperty(process.versions, 'node', { ...version, value: '24.22.2' });
  t.mock.method(globalThis, 'fetch', h.fetcher);
  assert.equal((await handler.fetch(h.request('/signin'))).status, 200);
  assert.equal((await handler.fetch(h.request('/api/session'))).status, 401);
  assert.equal((await handler.fetch(new Request('https://foreign.acme.test/signin'))).status, 403);
  const signed = await h.login();
  process.env.PLATES_WEB_CONFIG = JSON.stringify({ ...h.input, recovery: {
    epoch: 'a'.repeat(32), startedAt: '2026-01-01T00:00:00.000Z', reconciledAt: null,
  } });
  assert.equal((await handler.fetch(h.request('/projects/studio', { cookie: signed.cookie }))).status, 503);
  process.env.PLATES_WEB_CONFIG = env.PLATES_WEB_CONFIG;
  process.env.VERCEL_ENV = 'preview';
  assert.equal((await handler.fetch(h.request('/signin'))).status, 503);
  process.env.VERCEL_ENV = 'production';
  Object.defineProperty(process.versions, 'node', { ...version, value: '24.21.0' });
  assert.equal((await handler.fetch(h.request('/signin'))).status, 503);
  Object.defineProperty(process.versions, 'node', { ...version, value: '24.22.2' });
  process.env.PLATES_WEB_CONFIG = '{}';
  assert.equal((await handler.fetch(h.request('/signin'))).status, 503);
});
