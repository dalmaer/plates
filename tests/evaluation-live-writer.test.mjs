// Synthetic Acme writer lifetime checks. No provider, credential or Docker calls.
import './helpers/hermetic.mjs';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLiveWriterFence } from '../lib/evaluation-live-writer.mjs';
import { sealRecord } from '../lib/evaluation-records.mjs';
const H = 'a'.repeat(64), owner = { id: 'acme-owner' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture(t, overrides = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'acme-live-fence-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let stopped = 0;
  const fence = createLiveWriterFence({ dir, planDigest: H, deadline: Date.now() + 5000, cleanupDeadline: Date.now() + 6000,
    owner, inspectOwner: async () => owner, spendTail: () => Promise.resolve(), stopSpend: () => { stopped++; }, ...overrides });
  const reservation = sealRecord({ schemaVersion: 2, kind: 'evaluation-reservation', id: 'acme-experiment', createdAt: '2026-11-01T00:00:00.000Z', planDigest: H,
    allowance: { minutes: 40, currencyUsd: 1 }, currencyUsage: null });
  return { dir, fence, reservation, stopped: () => stopped };
}
test('closing synchronously blocks late effects and drains registered immutable bytes before release', async t => {
  const gate = deferred(); let observations = 0;
  const f = await fixture(t, { inspectOwner: async () => { observations++; if (observations === 1) await gate.promise; return owner; } });
  const original = structuredClone(f.reservation);
  const write = f.fence.persistReservation(f.reservation);
  f.reservation.allowance.minutes = 999;
  const closing = f.fence.close(); let drained = false; closing.then(() => { drained = true; });
  assert.equal(f.fence.inspect().state, 'CLOSING'); assert.equal(f.fence.signal.aborted, true); assert.equal(f.stopped(), 1);
  assert.throws(() => f.fence.persistReservation(original), { code: 'evaluation_live_writer_closed' });
  await assert.rejects(f.fence.assertOpen(), { code: 'evaluation_live_writer_closed' });
  assert.throws(() => f.fence.released());
  await new Promise(resolve => setImmediate(resolve)); assert.equal(drained, false);
  gate.resolve(); await write; await closing;
  assert.deepEqual(JSON.parse(await readFile(join(f.dir, 'execution/reservation.json'), 'utf8')), original);
  assert.equal((await stat(join(f.dir, 'execution/reservation.json'))).mode & 0o777, 0o400);
  assert.equal(f.fence.inspect().state, 'DRAINED'); f.fence.released();
  assert.equal(f.fence.inspect().state, 'RELEASED');
  assert.throws(() => f.fence.persistReservation(original), { code: 'evaluation_live_writer_closed' });
});
test('close waits for the existing spend tail and never releases a stuck writer', async t => {
  const spend = deferred(), f = await fixture(t, { spendTail: () => spend.promise, cleanupDeadline: Date.now() + 40 });
  await assert.rejects(f.fence.close(), { code: 'evaluation_live_writer_stuck' });
  assert.equal(f.fence.inspect().state, 'STUCK'); assert.throws(() => f.fence.released());
  spend.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.fence.inspect().state, 'STUCK');
  await assert.rejects(f.fence.close(), { code: 'evaluation_live_writer_stuck' });
});
test('changed owner refuses persistence and cannot establish a drained writer', async t => {
  const f = await fixture(t, { inspectOwner: async () => ({ id: 'acme-other-owner' }) });
  await assert.rejects(f.fence.persistReservation(f.reservation), /ownership changed/);
  await assert.rejects(f.fence.close(), /ownership changed/);
  await assert.rejects(stat(join(f.dir, 'execution/reservation.json')), { code: 'ENOENT' });
  assert.throws(() => f.fence.released());
});
test('execution registration rejects missing identity and foreign plan before creating a path', async t => {
  const f = await fixture(t);
  const bad = sealRecord({ schemaVersion: 2, kind: 'evaluation-stage' });
  assert.throws(() => f.fence.persistExecution('acme-pair-baseline', 'builder', bad), /invalid live execution receipt/);
  assert.throws(() => f.fence.persistReservation(sealRecord({ ...f.reservation, planDigest: 'b'.repeat(64) })), /reservation mismatch/);
  await f.fence.close(); f.fence.released();
  await assert.rejects(stat(join(f.dir, 'execution')), { code: 'ENOENT' });
});

test('retention persistence scans fresh canonical inventory without replaying the authority graph', async () => {
  // Isolated loader instrumentation counts real work, not elapsed time. It adds
  // no injectable scanner or authorization switch to the production controller.
  const script = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    import { mkdtemp, realpath, rm, chmod, readFile } from 'node:fs/promises';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    globalThis.acmeScans = { inventory: 0, graph: 0 };
    registerHooks({ load(url, context, nextLoad) {
      const loaded = nextLoad(url, context);
      if (!url.endsWith('/evaluation-live-records.mjs')) return loaded;
      let source = String(loaded.source);
      for (const [name, counter] of [['scanLiveInventory', 'inventory'], ['inspectLiveRecords', 'graph']]) {
        const signature = 'async function ' + name + '(directory, plan) {';
        assert.ok(source.includes(signature));
        source = source.replace(signature, signature + ' globalThis.acmeScans.' + counter + '++;');
      }
      return { ...loaded, source };
    } });
    const { createLiveWriterFence } = await import(${JSON.stringify(new URL('../lib/evaluation-live-writer.mjs', import.meta.url).href)});
    const { sealRecord } = await import(${JSON.stringify(new URL('../lib/evaluation-records.mjs', import.meta.url).href)});
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'acme-inventory-fence-')));
    const H = 'a'.repeat(64), owner = { id: 'acme-owner' };
    const allowance = { minutes: 40, currencyUsd: 1 };
    const plan = { digest: H, bundle: { comparison: { pairs: [{ id: 'acme-pair' }], allowance,
      retention: { maxBytes: 67108864, maxEvents: 20000 } } } };
    const fence = createLiveWriterFence({ dir, planDigest: H, plan, deadline: Date.now() + 10000,
      cleanupDeadline: Date.now() + 11000, owner, inspectOwner: async () => owner,
      spendTail: () => Promise.resolve(), stopSpend: () => {} });
    try {
      await fence.persistReservation(sealRecord({ schemaVersion: 2, kind: 'evaluation-reservation',
        id: 'acme-experiment', createdAt: '2026-11-01T00:00:00.000Z', planDigest: H, allowance, currencyUsage: null }));
      assert.deepEqual(globalThis.acmeScans, { inventory: 1, graph: 0 });
      const stage = sealRecord({ schemaVersion: 2, kind: 'evaluation-stage', id: 'b'.repeat(32) });
      await fence.persistExecution('acme-pair-baseline', 'builder', stage);
      assert.deepEqual(globalThis.acmeScans, { inventory: 2, graph: 0 });
      assert.deepEqual(JSON.parse(await readFile(join(dir, 'execution/acme-pair-baseline/builder.json'), 'utf8')), stage);
      // A subsequent write must reread changed immutable metadata, not cache the
      // previous successful inventory or confuse capacity with chain authority.
      await chmod(join(dir, 'execution/reservation.json'), 0o600);
      await assert.rejects(fence.persistExecution('acme-pair-baseline', 'check-0', stage), /inventory unavailable/);
      assert.deepEqual(globalThis.acmeScans, { inventory: 3, graph: 0 });
      await assert.rejects(readFile(join(dir, 'execution/acme-pair-baseline/check-0.json')), { code: 'ENOENT' });
    } finally { await fence.close(); fence.released(); await rm(dir, { recursive: true, force: true }); }
  `;
  await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], { timeout: 20000 });
});
