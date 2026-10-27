import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { autonomyReport, validateAutonomy, evaluateAutonomy, suggestAutonomy } from '../lib/autonomy.mjs';
import { run } from './helpers/run.mjs';

const repository = 'acme/app';
const policy = (mode = 'local', push = [], merge = []) => ({ schema: 1, repository, mode, push, merge });
const action = (scope = 'local-edits', target) => ({ scope, repository, target });
const context = p => ({ taskAuthorized: true, selectionVerified: autonomyReport(p, repository).policyDigest, classification: 'routine', platform: 'allowed', project: 'allowed', commandGates: 'allowed' });
const evaluate = (p, a = action(), c = {}) => evaluateAutonomy({ policy: p, repository, action: a, context: { ...context(p), ...c } });
const BIN = resolve('bin/plates.mjs');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'plates-autonomy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.plates'));
  await writeFile(join(root, '.plates/plates.json'), '{"name":"Acme","repo":"acme/app","check":"npm test"}\n');
  const cli = args => {
    const r = run(process.execPath, [BIN, 'autonomy', ...args, '--json'], { cwd: root });
    return { status: r.status, data: JSON.parse(r.stdout), stderr: r.stderr };
  };
  return { root, cli, file: join(root, '.plates/autonomy.json') };
}

test('missing/default preserves existing behavior; report separates configured and effective authority', () => {
  const report = autonomyReport(undefined, repository);
  assert.equal(report.configured, false);
  assert.equal(report.policy.mode, 'default');
  assert.equal(report.effectiveAuthority, 'requires-current-context');
  assert.equal(report.scopes.length, 6);
  assert.ok(report.scopes.every(s => s.authority === 'existing-policy'));
  for (const p of [undefined, policy('default')]) {
    for (const scope of report.scopes.map(s => s.scope)) assert.equal(evaluate(p, action(scope)).decision, 'inherit');
    assert.equal(evaluate(p, action(), { platform: 'denied' }).decision, 'blocked');
  }
});

test('local allows only routine authorized edits/tests with verified independent constraints', () => {
  const p = policy();
  for (const scope of ['local-edits', 'tests']) {
    assert.equal(evaluate(p, action(scope)).decision, 'proceed');
    for (const key of ['platform', 'project', 'commandGates']) {
      assert.equal(evaluate(p, action(scope), { [key]: 'denied' }).decision, 'blocked');
      for (const value of [undefined, 'unknown', true]) assert.equal(evaluate(p, action(scope), { [key]: value }).decision, 'unavailable');
    }
    for (const c of [{ taskAuthorized: false }, { selectionVerified: false }, { selectionVerified: 'old-digest' }]) assert.equal(evaluate(p, action(scope), c).decision, 'ask');
    assert.equal(evaluate(p, action(scope), { classification: undefined }).decision, 'unavailable');
    for (const classification of ['sensitive', 'destructive']) assert.equal(evaluate(p, action(scope), { classification }).decision, 'ask');
  }
  for (const scope of ['push', 'merge', 'deployment', 'security']) assert.equal(evaluate(p, action(scope, 'main')).decision, 'ask');
  assert.equal(evaluate(p, { ...action(), repository: 'acme/other' }).decision, 'ask');
  assert.equal(evaluate(p, action('unknown')).decision, 'unavailable');
  for (const repository of [null, 42, {}, undefined]) assert.equal(evaluate(p, { ...action(), repository }).decision, 'ask');
});

test('delivery binds independent exact push and merge destinations and never supplies missing gates', () => {
  const p = policy('delivery', ['feature/acme'], ['main']);
  assert.equal(evaluate(p, action('push', 'feature/acme')).decision, 'proceed');
  assert.equal(evaluate(p, action('merge', 'main')).decision, 'proceed');
  for (const [scope, target] of [['push', 'main'], ['merge', 'feature/acme'], ['push', 'feature/other'], ['merge', undefined]]) {
    assert.equal(evaluate(p, action(scope, target)).decision, 'ask');
  }
  assert.equal(evaluate(p, action('merge', 'main'), { commandGates: 'unknown' }).decision, 'unavailable');
  assert.equal(evaluate(p, action('push', 'feature/acme'), { classification: 'destructive' }).decision, 'ask');
  assert.equal(evaluate(p, { ...action('push', 'feature/acme'), force: true }).decision, 'unavailable');
  assert.equal(evaluate(p, action('merge', 'main'), { classification: 'sensitive' }).decision, 'ask');
  for (const scope of ['security', 'deployment']) assert.equal(evaluate(p, action(scope)).decision, 'ask');
  const changed = policy('delivery', ['feature/acme'], ['release']);
  assert.equal(evaluate(changed, action('merge', 'release'), context(p)).decision, 'ask');
});

test('invalid policy fails closed, including extra fields, unknown modes and widened destinations', () => {
  for (const p of [null, [], {}, { ...policy(), mode: 'full' }, { ...policy(), confirmed: true }, { ...policy(), repository: 'acme/other' }, policy('local', ['main']), { ...policy(), schema: 2 }]) {
    assert.throws(() => validateAutonomy(p, repository));
  }
  for (const branch of ['*', 'feature/*', 'refs/heads/main', 'main:other', '--all', 'HEAD', '../main', 'a..b', 'a//b', '.hidden', 'a.lock', 'a/', 'a.', 'a@{1}']) {
    assert.throws(() => validateAutonomy(policy('delivery', [branch]), repository), branch);
  }
  assert.throws(() => validateAutonomy(policy('delivery', ['main', 'main']), repository));
});

test('approval patterns only suggest local mode and never establish selection', () => {
  assert.equal(suggestAutonomy({ approved: 4, declined: 0 }), null);
  assert.equal(suggestAutonomy({ approved: 100, declined: 1 }), null);
  assert.equal(suggestAutonomy({ approved: '100', declined: 0 }), null);
  const suggestion = suggestAutonomy({ approved: 100, declined: 0 });
  assert.equal(suggestion.authority, 'suggestion-only');
  assert.equal(suggestion.requiresExplicitSelection, true);
  assert.equal(suggestion.mode, 'local');
  assert.equal(evaluate(policy(), action(), { selectionVerified: suggestion }).decision, 'ask');
  assert.equal(autonomyReport(undefined, repository).policy.mode, 'default');
});

test('CLI inspect and preview write nothing; exact explicit confirmation selects only the setting', async t => {
  const { root, cli, file } = await fixture(t);
  const config = await readFile(join(root, '.plates/plates.json'), 'utf8');
  const inspected = cli([]);
  assert.equal(inspected.status, 0);
  assert.equal(inspected.data.configured, false);
  const preview = cli(['--mode', 'local']);
  assert.equal(preview.status, 3);
  assert.deepEqual(await readdir(join(root, '.plates')), ['plates.json']);
  for (const args of [['--mode', 'local', '--yes'], ['--mode', 'delivery', '--yes', '--digest', preview.data.digest]]) {
    assert.equal(cli(args).status, 2);
    assert.deepEqual(await readdir(join(root, '.plates')), ['plates.json']);
  }
  const selected = cli(['--mode', 'local', '--yes', '--digest', preview.data.digest]);
  assert.equal(selected.status, 0);
  assert.equal(selected.data.status, 'selected');
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), policy());
  assert.equal(await readFile(join(root, '.plates/plates.json'), 'utf8'), config);
  assert.deepEqual((await readdir(join(root, '.plates'))).sort(), ['autonomy.json', 'plates.json']);
  assert.equal(cli([]).data.configured, true);
  const repeated = cli(['--mode', 'local']).data;
  const before = await readFile(file, 'utf8');
  assert.equal(cli(['--mode', 'local', '--yes', '--digest', repeated.digest]).data.status, 'unchanged');
  assert.equal(await readFile(file, 'utf8'), before);
  const reset = cli(['--mode', 'default']);
  assert.equal(cli(['--mode', 'default', '--yes', '--digest', reset.data.digest]).status, 0);
  assert.equal(cli([]).data.policy.mode, 'default');
});

test('selection digest binds config, prior policy, destinations and checkout; no stale overwrite', async t => {
  const { root, cli, file } = await fixture(t);
  const other = await fixture(t);
  const args = ['--mode', 'delivery', '--push', 'feature/acme', '--merge', 'main'];
  const preview = cli(args).data;
  assert.equal(other.cli([...args, '--yes', '--digest', preview.digest]).status, 2);
  assert.equal(cli(['--mode', 'delivery', '--merge', 'release', '--yes', '--digest', preview.digest]).status, 2);
  const configPath = join(root, '.plates/plates.json');
  const original = await readFile(configPath, 'utf8');
  await writeFile(configPath, `${original}\n`);
  assert.equal(cli([...args, '--yes', '--digest', preview.digest]).status, 2);
  await writeFile(configPath, original);
  await writeFile(file, JSON.stringify(policy()));
  assert.equal(cli([...args, '--yes', '--digest', preview.digest]).status, 2);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), policy());
  const fresh = cli(args).data;
  assert.equal(cli([...args, '--yes', '--digest', fresh.digest]).status, 0);
  assert.deepEqual(cli([]).data.policy, policy('delivery', ['feature/acme'], ['main']));
  const replace = cli(['--mode', 'delivery', '--merge', 'release']).data;
  assert.equal(cli(['--mode', 'delivery', '--merge', 'release', '--yes', '--digest', replace.digest]).status, 0);
  assert.deepEqual(cli([]).data.policy, policy('delivery', [], ['release']));
});

test('locked, malformed, linked and differently bound settings refuse without overwrite', async t => {
  const { root, cli, file } = await fixture(t);
  const preview = cli(['--mode', 'local']).data;
  const lock = join(root, '.plates/autonomy.lock');
  await writeFile(lock, 'original writer');
  assert.equal(cli(['--mode', 'local', '--yes', '--digest', preview.digest]).status, 2);
  assert.equal(await readFile(lock, 'utf8'), 'original writer');
  await rm(lock);
  for (const bytes of ['{bad', 'null', JSON.stringify({ ...policy(), repository: 'acme/other' })]) {
    await writeFile(file, bytes);
    assert.notEqual(cli([]).status, 0);
    assert.equal(await readFile(file, 'utf8'), bytes);
  }
  await rm(file);
  const target = join(root, 'external.json');
  const bytes = JSON.stringify(policy());
  await writeFile(target, bytes);
  await symlink(target, file);
  assert.notEqual(cli(['--mode', 'local']).status, 0);
  await rm(file);
  await link(target, file);
  assert.notEqual(cli([]).status, 0);
  assert.equal(await readFile(target, 'utf8'), bytes);
});

test('CLI rejects ambiguous flags and never treats confirmation alone as a selection', async t => {
  const { cli } = await fixture(t);
  for (const args of [['--yes'], ['--push', 'main'], ['--mode'], ['--mode', 'local', '--mode', 'delivery'], ['--mode', 'local', '--digest', 'abc'], ['--mode', 'full'], ['--history'], ['--mode', 'local', '--push', 'main']]) {
    assert.equal(cli(args).status, 2, JSON.stringify(args));
  }
});


test('directory symlinks and oversized inputs cannot redirect or expand the selection write', async t => {
  const { root, cli, file } = await fixture(t);
  await writeFile(file, ' '.repeat(65537));
  assert.notEqual(cli([]).status, 0);
  await rm(file);
  const redirected = await fixture(t);
  await rm(join(root, '.plates'), { recursive: true });
  await symlink(join(redirected.root, '.plates'), join(root, '.plates'));
  assert.notEqual(cli(['--mode', 'local']).status, 0);
  assert.deepEqual(await readdir(join(redirected.root, '.plates')), ['plates.json']);
});
