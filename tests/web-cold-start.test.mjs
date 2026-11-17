// A cold hosted instance that answers Home loads only Home's modules (perf-05). Every other route's feature
// (lib/web/server.mjs lazyFeature) and the CLI-only stacks behind lib/work-items.mjs, lib/channel-say.mjs and
// lib/web/routines.mjs load on first use. Measured on one machine: the cold import of api/index.mjs went from
// 275 modules (4.9 MB) in about 100 ms to 121 modules (1.8 MB) in about 35 ms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './helpers/run.mjs';

const root = new URL('..', import.meta.url).href;
// What a cold Home must not read: each route feature, and the stacks the shared modules used to pull in.
const deferred = ['attach-controller', 'capability-registry', 'connections', 'daily', 'decisions', 'editor-drafts', 'export',
  'fleet-updates', 'home-answers', 'home-ask', 'job-oidc', 'jobs', 'learning', 'lesson-rollout', 'migration', 'model-policy',
  'model-tasks', 'night-plan', 'night-retry', 'operations', 'phase-walks', 'run-receipts', 'runs', 'step-marks', 'walks']
  .map(name => `lib/web/${name}.mjs`)
  .concat(['lib/learn.mjs', 'lib/adopt.mjs', 'lib/sessions.mjs', 'lib/cli.mjs', 'lib/doctor.mjs', 'scripts/plates/climb.mjs']);

// Node's own loader in a fresh process, so the answer is the modules actually read, not a parse of import lines.
const loaded = steps => {
  const result = run(process.execPath, ['--input-type=module', '-e', `
  import { registerHooks } from 'node:module';
  const seen = new Set();
  registerHooks({ resolve(specifier, context, next) { const r = next(specifier, context); seen.add(r.url); return r; } });
  ${steps}
  process.stdout.write(JSON.stringify([...seen].filter(u => u.startsWith(${JSON.stringify(root)})).map(u => u.slice(${root.length}))));
`], { timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test('starting the hosted service reads no route feature and none of the CLI-only stacks', () => {
  const modules = loaded(`await import(${JSON.stringify(new URL('api/index.mjs', root).href)});`);
  assert.ok(modules.includes('lib/web/server.mjs') && modules.includes('lib/web/home.mjs'), 'the service and Home load');
  assert.deepEqual(deferred.filter(path => modules.includes(path)), []);
});

test('a cold instance signs in and answers Home and /api/home without loading another route\'s feature', () => {
  const modules = loaded(`
    const { harness } = await import(${JSON.stringify(new URL('tests/helpers/web-http.mjs', root).href)});
    const h = harness(), { cookie } = await h.login();
    for (const path of ['/', '/api/home']) { const r = await h.service(h.request(path, { cookie })); if (r.status !== 200) throw new Error(path + ' ' + r.status); await r.text(); }
  `);
  assert.deepEqual(deferred.filter(path => modules.includes(path)), []);
});

test('a route loads its feature on first use and answers as before', () => {
  const modules = loaded(`
    const { harness } = await import(${JSON.stringify(new URL('tests/helpers/web-http.mjs', root).href)});
    const h = harness(), { cookie } = await h.login();
    const r = await h.service(h.request('/api/capabilities', { cookie })); await r.text();
    if (r.status !== 200) throw new Error('capabilities ' + r.status);
  `);
  assert.ok(modules.includes('lib/web/capability-registry.mjs'), 'the capability route read its registry when asked');
  assert.ok(!modules.includes('lib/web/jobs.mjs'), 'and nothing it did not need');
});
