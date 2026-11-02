import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecovery } from '../lib/discord-pilot/recovery.mjs';
import { digest } from '../lib/discord-pilot/runtime.mjs';
import { inspectDeployment } from '../lib/discord-pilot/activation.mjs';
import { workerLabel } from '../lib/discord-pilot/host-config.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'acme-recovery-'))); t.after(() => rmSync(root, { recursive: true }));
  const state = join(root, 'state'), home = join(state, 'host');
  for (const path of [state, home, join(home, 'docker-config')]) mkdirSync(path, { mode: 0o700 });
  const manifest = JSON.parse(readFileSync(new URL('../scripts/discord-pilot/deployment.example.json', import.meta.url)));
  manifest.enabled = true; manifest.stateDirectory = state;
  manifest.runtimes = Object.fromEntries(['codex', 'claude'].map(r => [r, { model: 'acme-model', accountScope: 'Acme', authMode: 'api-key', version: '1.2.3', cwd: `${state}/runtimes/${r}/workspace`, microUsdPerToken: 2 }]));
  const config = JSON.parse(readFileSync(new URL('../scripts/discord-pilot/host.example.json', import.meta.url)));
  config.enabled = true; config.dockerSocket = `${root}/acme.sock`; config.dockerVersion = '28.1.1';
  config.secretDirectory = `${root}/secrets`; config.network = 'acme-network';
  config.sdk = { modulePath: `${root}/sdk/sdk.mjs`, packagePath: `${root}/sdk/package.json`, version: '1.2.3', moduleSha256: 'a'.repeat(64) };
  config.workers = { codex: { image: `sha256:${'a'.repeat(64)}`, volume: 'acme-codex' }, claude: { image: `sha256:${'b'.repeat(64)}`, volume: 'acme-claude' } };
  config.approval = { deploymentDigest: inspectDeployment(manifest).digest, apiFundingApproved: true, maxAdmissionMicros: 5_000_000, egress: 'runtime-internet' };
  const lock = { deploymentDigest: config.approval.deploymentDigest, configDigest: digest(config) };
  const lease = { ...lock, id: '11111111-2222-3333-4444-555555555555', name: 'plates-discord-11111111-2222-3333-4444-555555555555', runtime: 'codex' };
  const write = (name, value) => writeFileSync(join(home, name), JSON.stringify(value), { mode: 0o600 });
  write('writer.lock', lock); write(`${lease.id}.json`, lease);
  writeFileSync(join(state, 'state.json'), JSON.stringify({ trialRun: { threadId: manifest.policy.trial.threadId }, tasks: {} }), { mode: 0o600 });
  const calls = [], behavior = {};
  const run = async args => {
    calls.push(args);
    if (behavior.error) throw new Error('Acme unavailable daemon');
    if (args[0] === 'network') return JSON.stringify({ Labels: { [workerLabel]: lock.deploymentDigest }, Containers: behavior.networkUsed ? { acme: {} } : {} });
    assert.deepEqual(args.slice(0, 3), ['container', 'ls', '--all']); return behavior.container ? 'Acme-container' : '';
  };
  const options = { config, manifest, coordinatorExit: 'exec:123:exit:1', run };
  return { root, state, home, lock, lease, write, calls, behavior, options, recovery: () => createRecovery(options) };
}

test('recovery archives exact lease evidence after fresh absence checks without resetting the consumed trial', async t => {
  const f = fixture(t), r = f.recovery(), before = readFileSync(join(f.state, 'state.json'), 'utf8');
  const plan = await r.plan(); assert.deepEqual(readdirSync(f.home).sort(), ['docker-config', `${f.lease.id}.json`, 'writer.lock'].sort());
  const result = await r.apply(plan.digest), receipt = JSON.parse(readFileSync(result.receiptPath));
  assert.equal(result.status, 'recovered'); assert.equal(result.trialRemainsConsumed, true);
  assert.deepEqual(readdirSync(f.home), ['docker-config']); assert.equal(readFileSync(join(f.state, 'state.json'), 'utf8'), before);
  assert.deepEqual(receipt.archivedFiles, [`${f.lease.id}.json`, 'writer.lock']);
  assert.ok(f.calls.every(a => ['container', 'network'].includes(a[0])));
  assert.equal(JSON.parse(readFileSync(join(result.receiptPath, '..', 'writer.lock'))).deploymentDigest, f.lock.deploymentDigest);
});

test('recovery refuses missing exit evidence and a live coordinator or bridge writer', async t => {
  const f = fixture(t);
  assert.throws(() => createRecovery({ ...f.options, coordinatorExit: undefined }), /stopped_coordinator/);
  f.write('writer.lock', { ...f.lock, pid: process.pid });
  await assert.rejects(f.recovery().plan(), /coordinator_alive/);
  f.write('writer.lock', f.lock); writeFileSync(join(f.state, 'writer.lock'), '', { mode: 0o600 });
  await assert.rejects(f.recovery().plan(), /bridge_writer/); assert.equal(f.calls.length, 0);
});

test('recovery refuses containers, occupied networks and unavailable daemon instead of assuming absence', async t => {
  const f = fixture(t);
  for (const [flag, pattern] of [['container', /container_present/], ['networkUsed', /network_not_empty/], ['error', /unavailable/]]) {
    f.behavior[flag] = true; await assert.rejects(f.recovery().plan(), pattern); delete f.behavior[flag];
    assert.equal(existsSync(join(f.home, 'writer.lock')), true);
  }
});

test('changed plans, mismatched lease bindings and symlinks cannot be recovered', async t => {
  const f = fixture(t), r = f.recovery(), plan = await r.plan();
  await assert.rejects(r.apply('a'.repeat(64)), /plan_changed/);
  writeFileSync(join(f.home, 'writer.lock'), JSON.stringify(f.lock, null, 2), { mode: 0o600 });
  await assert.rejects(r.apply(plan.digest), /plan_changed/);
  f.write('writer.lock', f.lock);
  f.write(`${f.lease.id}.json`, { ...f.lease, configDigest: 'a'.repeat(64) });
  await assert.rejects(r.apply(plan.digest), /lease_binding/);
  rmSync(join(f.home, `${f.lease.id}.json`)); symlinkSync(join(f.home, 'writer.lock'), join(f.home, `${f.lease.id}.json`));
  await assert.rejects(r.plan()); assert.equal(existsSync(join(f.home, 'writer.lock')), true);
});

test('a failed final absence check preserves recovery lock and archive intent for manual review', async t => {
  const f = fixture(t), original = f.options.run; let networkChecks = 0;
  f.options.run = args => {
    if (args[0] === 'network' && ++networkChecks === 4) throw new Error('Acme daemon unavailable after archival');
    return original(args);
  };
  const r = f.recovery(), plan = await r.plan();
  await assert.rejects(r.apply(plan.digest), /unavailable/);
  assert.equal(existsSync(join(f.home, 'recovery.lock')), true);
  const archive = join(f.state, 'recovery', plan.digest);
  assert.equal(existsSync(join(archive, 'writer.lock')), true);
  assert.equal(JSON.parse(readFileSync(join(archive, 'receipt.json'))).status, 'intent');
  await assert.rejects(r.plan(), /unrecognized_host_state/);
});

test('recovery rechecks absence after approval before moving any lease', async t => {
  const f = fixture(t), r = f.recovery(), plan = await r.plan(); f.behavior.container = true;
  await assert.rejects(r.apply(plan.digest), /container_present/);
  assert.equal(existsSync(join(f.home, `${f.lease.id}.json`)), true); assert.equal(existsSync(join(f.home, 'writer.lock')), true);
});

test('recovery refuses metadata changed during its absence queries', async t => {
  const f = fixture(t), original = f.options.run; let networkChecks = 0;
  f.options.run = args => {
    if (args[0] === 'network' && ++networkChecks === 2) {
      writeFileSync(join(f.home, 'writer.lock'), JSON.stringify(f.lock, null, 2), { mode: 0o600 });
    }
    return original(args);
  };
  const r = f.recovery(), plan = await r.plan();
  await assert.rejects(r.apply(plan.digest), /plan_changed/);
  assert.equal(existsSync(join(f.home, 'writer.lock')), true);
  assert.equal(existsSync(join(f.state, 'recovery')), false);
});
