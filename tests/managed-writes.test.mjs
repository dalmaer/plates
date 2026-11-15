import './helpers/hermetic.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, readlink, lstat, link, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doctor } from '../lib/doctor.mjs';
import { render } from '../lib/practices.mjs';

async function project(t) {
  const home = await mkdtemp(join(tmpdir(), 'plates-managed-writes-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = join(home, 'acme'), outside = join(home, 'acme-other');
  await mkdir(join(root, '.plates'), { recursive: true });
  await mkdir(outside);
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Acme', practices: ['acme'] }));
  const practices = new Map([['acme', { name: 'acme', requires: [], files: [
    { practice: 'acme', path: 'docs/managed.md', kind: 'managed', template: 'Acme managed content\n' },
  ] }]]);
  return { root, outside, practices };
}

test('render keeps managed writes inside the checkout with a linked parent', async t => {
  const { root, outside, practices } = await project(t);
  await symlink(outside, join(root, 'docs'));
  await assert.rejects(render(root, { practices }), /docs\/managed\.md.*resolves outside the checkout/);
  assert.deepEqual(await readdir(outside), []);
});

for (const operation of ['render', 'restore']) {
  const run = ({ root, practices }, path = 'docs/managed.md') => operation === 'render'
    ? render(root, { practices })
    : doctor({ root, fix: [path, 'restore'], yes: true }, { practices });
  for (const component of ['parent', 'file', 'dangling file']) {
    if (operation === 'render' && component === 'parent') continue;
    test(`${operation} keeps managed writes inside the checkout with a linked ${component}`, async t => {
      const fixture = await project(t), { root, outside } = fixture;
      if (component === 'parent') await symlink(outside, join(root, 'docs'));
      else {
        await mkdir(join(root, 'docs'));
        if (component === 'file') await writeFile(join(outside, 'managed.md'), 'Acme original\n');
        await symlink(join(outside, 'managed.md'), join(root, 'docs/managed.md'));
      }
      await assert.rejects(run(fixture), /docs\/managed\.md.*resolves outside the checkout/);
      assert.deepEqual(await readdir(outside), component === 'file' ? ['managed.md'] : []);
      if (component === 'file') assert.equal(await readFile(join(outside, 'managed.md'), 'utf8'), 'Acme original\n');
    });
  }
  test(`${operation} refuses a final managed file alias inside the checkout`, async t => {
    const fixture = await project(t), { root } = fixture;
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'original.md'), 'Acme original\n');
    await symlink('../original.md', join(root, 'docs/managed.md'));
    await assert.rejects(run(fixture), /docs\/managed\.md.*symlink/);
    assert.equal(await readFile(join(root, 'original.md'), 'utf8'), 'Acme original\n');
  });
  for (const alias of [false, true]) {
    test(`${operation} keeps managed writes out of .git${alias ? ' through a directory alias' : ''}`, async t => {
      const fixture = await project(t), { root, practices } = fixture;
      await mkdir(join(root, '.git'));
      const path = alias ? 'docs/managed.md' : '.git/managed.md';
      if (alias) await symlink('.git', join(root, 'docs'));
      else practices.get('acme').files[0].path = path;
      await assert.rejects(run(fixture, path), /(?:docs|\.git)\/managed\.md.*checkout's \.git/);
      assert.deepEqual(await readdir(join(root, '.git')), []);
    });
  }
  for (const file of ['lock.json', 'plates.json']) {
    test(`${operation} keeps ${file} writes inside the checkout`, async t => {
      const fixture = await project(t), { root, outside } = fixture;
      const path = join(root, '.plates', file);
      const original = file === 'plates.json' ? await readFile(path, 'utf8') : '{"practice":"0.0.0","files":{}}';
      await writeFile(join(outside, file), original);
      await rm(path, { force: true });
      await symlink(join(outside, file), path);
      await assert.rejects(run(fixture), new RegExp(`\\.plates/${file.replace('.', '\\.')}.*resolves outside the checkout`));
      assert.equal(await readFile(join(outside, file), 'utf8'), original);
      await assert.rejects(lstat(join(root, 'docs/managed.md')), { code: 'ENOENT' });
    });
  }
}

test('render preserves an in-checkout guide alias and creates and replaces managed doorways', async t => {
  const { root, practices } = await project(t);
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'docs/guide.md'), '# Acme\n<!-- plates:begin acme -->\nOld rule\n<!-- plates:end acme -->\n');
  await symlink('docs/guide.md', join(root, 'CLAUDE.md'));
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Acme', practices: ['acme'], guide: 'CLAUDE.md' }));
  await mkdir(join(root, '.agents/skills/acme'), { recursive: true });
  await mkdir(join(root, '.agents/skills/acme-next'));
  const files = practices.get('acme').files;
  files.push({ practice: 'acme', path: 'AGENTS.md', kind: 'block', block: 'acme', template: 'Acme rule\n' },
    { practice: 'acme', path: '.claude/skills/acme', kind: 'managed', link: '../../.agents/skills/acme' });
  await render(root, { practices });
  assert.equal(await readlink(join(root, 'CLAUDE.md')), 'docs/guide.md');
  assert.match(await readFile(join(root, 'CLAUDE.md'), 'utf8'), /Acme rule/);
  assert.equal(await readlink(join(root, '.claude/skills/acme')), '../../.agents/skills/acme');
  files.at(-1).link = '../../.agents/skills/acme-next';
  await render(root, { practices });
  assert.equal(await readlink(join(root, '.claude/skills/acme')), '../../.agents/skills/acme-next');
});

test('render uses in-checkout parent aliases and replaces file contents without changing another link', async t => {
  const { root, outside, practices } = await project(t);
  await mkdir(join(root, 'content'));
  await symlink('content', join(root, 'docs'));
  await writeFile(join(outside, 'original.md'), 'Acme original\n');
  await link(join(outside, 'original.md'), join(root, 'content/managed.md'));
  await chmod(join(root, 'content/managed.md'), 0o755);
  await render(root, { practices });
  assert.equal(await readFile(join(root, 'content/managed.md'), 'utf8'), 'Acme managed content\n');
  assert.equal(await readFile(join(outside, 'original.md'), 'utf8'), 'Acme original\n');
  assert.equal((await lstat(join(root, 'content/managed.md'))).mode & 0o777, 0o755);
  assert.deepEqual(await readdir(join(root, 'content')), ['managed.md']);
});

test('render keeps an existing seeded file the project made an in-checkout link, and still contains a new seed', async t => {
  const { root, outside, practices } = await project(t);
  practices.get('acme').files.push({ practice: 'acme', path: 'docs/lessons.md', kind: 'seeded', template: 'Acme lessons seed\n' });
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'team-lessons.md'), 'Acme team lessons\n');
  await symlink('../team-lessons.md', join(root, 'docs/lessons.md'));
  await render(root, { practices });
  assert.equal(await readlink(join(root, 'docs/lessons.md')), '../team-lessons.md');
  assert.equal(await readFile(join(root, 'team-lessons.md'), 'utf8'), 'Acme team lessons\n');
  assert.equal((await render(root, { practices, check: true })).ok, true);
  // A seed that must be created still may not land outside the checkout.
  const fresh = await project(t);
  fresh.practices.get('acme').files.push({ practice: 'acme', path: 'notes/seed.md', kind: 'seeded', template: 'Acme seed\n' });
  await symlink(fresh.outside, join(fresh.root, 'notes'));
  await assert.rejects(render(fresh.root, { practices: fresh.practices }), /notes\/seed\.md.*resolves outside the checkout/);
  await assert.rejects(lstat(join(fresh.outside, 'seed.md')), { code: 'ENOENT' });
});
