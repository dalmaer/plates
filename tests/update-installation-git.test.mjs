import './helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './helpers/run.mjs';
import { conditionalGit, mergeArtifact } from '../lib/update-installation-git.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'plates-acme-lease-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => { const r = run('git', args, { cwd: root }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git('init', '-q', '-b', 'main');
  await writeFile(join(root, 'acme.txt'), 'base\n'); git('add', 'acme.txt'); git('commit', '-qm', 'Acme base');
  const base = git('rev-parse', 'HEAD');
  git('checkout', '-qb', 'candidate');
  await writeFile(join(root, 'acme.txt'), 'candidate\n'); git('commit', '-qam', 'Acme candidate');
  const head = git('rev-parse', 'HEAD'); git('checkout', '-q', 'main');
  // Use a bare remote so publication never touches a checked-out working tree.
  git('clone', '--bare', '-q', root, join(root, 'remote.git'));
  const plan = { repo: 'acme/project', candidate: 'acme/project#7', base, head, defaultBranch: 'main' };
  const adapter = conditionalGit(process.env, { remoteFor: () => join(root, 'remote.git') });
  const remote = (...args) => git('--git-dir='+join(root, 'remote.git'), ...args);
  return { root, plan, adapter, git, remote };
}
test('conditional installation publishes only the retained merge with exact parents and candidate tree', async t => {
  const f = await fixture(t), a = await f.adapter.prepareMerge(f.plan);
  assert.equal(f.remote('rev-parse', 'main'), f.plan.base, 'preparation is read-only');
  await f.adapter.mergeConditional(f.plan, a, { beforePublish: async () => {} });
  assert.equal(f.remote('rev-parse', 'main'), a.sha);
  assert.equal(f.remote('show', '-s', '--format=%P', a.sha), `${f.plan.base} ${f.plan.head}`);
  assert.equal(f.remote('show', 'main:acme.txt'), 'candidate');
});
test('a concurrent base advance is rejected at publication, not after merging', async t => {
  const f = await fixture(t), a = await f.adapter.prepareMerge(f.plan);
  await writeFile(join(f.root, 'other.txt'), 'independent change\n'); f.git('add', 'other.txt'); f.git('commit', '-qm', 'Acme concurrent main');
  const advanced = f.git('rev-parse', 'HEAD'); f.git('push', '-q', join(f.root, 'remote.git'), 'main');
  await assert.rejects(f.adapter.mergeConditional(f.plan, a, { beforePublish: async () => {} }), /push unavailable or refused/);
  assert.equal(f.remote('rev-parse', 'main'), advanced);
  assert.equal(f.remote('show', 'main:acme.txt'), 'base');
});
test('retained artifact cannot replace the approved tree or parents', async t => {
  const f = await fixture(t), a = await f.adapter.prepareMerge(f.plan);
  assert.throws(() => mergeArtifact({ ...f.plan, base: f.plan.head }, a), /identity differs/);
  await assert.rejects(f.adapter.mergeConditional(f.plan, { ...a, tree: f.plan.base }, { beforePublish: async () => {} }), /identity differs/);
  assert.equal(f.remote('rev-parse', 'main'), f.plan.base);
});
test('publication requires its durable preflight after Git preparation', async t => {
  const f = await fixture(t), a = await f.adapter.prepareMerge(f.plan);
  await assert.rejects(f.adapter.mergeConditional(f.plan, a), /durable publication callback required/);
  let observed = false;
  await assert.rejects(f.adapter.mergeConditional(f.plan, a, { beforePublish: async () => {
    observed = true; assert.equal(f.remote('rev-parse', 'main'), f.plan.base);
    throw Error('fresh scope refused');
  } }), /fresh scope refused/);
  assert.equal(observed, true); assert.equal(f.remote('rev-parse', 'main'), f.plan.base);
});
