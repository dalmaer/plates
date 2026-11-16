// plates's generated-file check (plates practice `phases`; managed: plates render
// rewrites it). Each file this project's practices declare generated is
// rewritten whole by its generator: a line appended to it does not survive
// (plates's lesson 52). The list and the probe are scripts/plates/generated.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATORS, generatedFiles, survivors, projectConfig, leftOut } from '../scripts/plates/generated.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('each generated file is rewritten whole by its generator: a line appended to it does not survive', async t => {
  const config = await projectConfig(ROOT);
  const list = generatedFiles(config);
  const localPlan = config.practices?.includes('phases') && config.phases?.source !== 'milestones';
  assert.equal(list.some(g => g.path === 'docs/ROADMAP.md'), !!localPlan, 'only an active local plan declares docs/ROADMAP.md generated');
  if (config.phases?.source === 'milestones') t.diagnostic('Local roadmap generator inactive: milestones selected; archived plan is not probed.');
  assert.deepEqual(await survivors(ROOT, list), []);
});

test('the check can fail: a generator that appends instead of rewriting is named; one that rewrites is not', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-generated-acme-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'ACME.md'), '# Acme\n');
  await writeFile(join(dir, 'appends.mjs'), "import { appendFileSync } from 'node:fs';\nappendFileSync('docs/ACME.md', '- one more anvil\\n');\n");
  await writeFile(join(dir, 'rewrites.mjs'), "import { writeFileSync } from 'node:fs';\nwriteFileSync('docs/ACME.md', '# Acme\\n');\n");
  const appends = await survivors(dir, [{ path: 'docs/ACME.md', args: ['appends.mjs'] }]);
  assert.equal(appends.length, 1);
  assert.match(appends[0], /^docs\/ACME\.md: a line appended to it survived `node appends\.mjs`/);
  assert.deepEqual(await survivors(dir, [{ path: 'docs/ACME.md', args: ['rewrites.mjs'] }]), []);
  const broken = await survivors(dir, [{ path: 'docs/ACME.md', args: ['missing.mjs'] }]);
  assert.match(broken[0] ?? '', /its generator `node missing\.mjs` failed/);
});

test('the list: each practice\'s files only when it is on; plates\'s own files only on plates', () => {
  const paths = config => generatedFiles(config).map(g => g.path);
  assert.deepEqual(paths({ practices: ['phases'] }), ['docs/ROADMAP.md']);
  assert.deepEqual(paths({ practices: ['phases', 'loop', 'lessons'] }), ['docs/ROADMAP.md', 'docs/LOOP.md']);
  assert.deepEqual(paths({ practices: ['phases', 'loop', 'lessons'], phases: { source: 'milestones' } }), []);
  assert.deepEqual(paths({ practices: ['phases', 'lessons'], plates: 'self' }), ['docs/ROADMAP.md', 'docs/plates-lessons.md', 'docs/patterns.md', 'docs/INBOX.md']);
  assert.ok(GENERATORS.every(g => Object.isFrozen(g) && g.path && g.args.length));
});

test('generated probes exclude rotating ledgers at every project depth and retain source inputs', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-generated-acme-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const base of ['', 'tests/fixtures/acme']) {
    await mkdir(join(dir, base, '.plates', 'test-runs'), { recursive: true });
    await writeFile(join(dir, base, '.plates', 'test-runs', 'acme.json'), '{}');
    await writeFile(join(dir, base, '.plates', 'plates.json'), '{}');
  }
  await mkdir(join(dir, 'test-runs'), { recursive: true });
  await writeFile(join(dir, 'test-runs', 'source.json'), '{}');
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'ACME.md'), '# Acme\n');
  await writeFile(join(dir, 'rewrites.mjs'), `
    import assert from 'node:assert/strict';
    import { existsSync, readFileSync, writeFileSync } from 'node:fs';
    for (const base of ['', 'tests/fixtures/acme/']) {
      assert.equal(existsSync(base + '.plates/test-runs'), false);
      assert.equal(readFileSync(base + '.plates/plates.json', 'utf8'), '{}');
    }
    assert.equal(readFileSync('test-runs/source.json', 'utf8'), '{}');
    writeFileSync('docs/ACME.md', '# Acme');
  `);
  assert.deepEqual(await survivors(dir, [{ path: 'docs/ACME.md', args: ['rewrites.mjs'] }]), []);
});

test('the probe copies source only: a large ignored build tree stays behind; a generator\'s own inputs come along', async t => {
  for (const git of [true, false]) {
    const dir = await mkdtemp(join(tmpdir(), 'plates-generated-acme-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    if (git) {
      execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
      await writeFile(join(dir, '.gitignore'), 'target/\nout/\n');
    }
    // A build tree with many files: each would be copied, once per generator.
    for (let i = 0; i < 50; i++) {
      await mkdir(join(dir, 'target', 'release', `crate-${i}`), { recursive: true });
      await writeFile(join(dir, 'target', 'release', `crate-${i}`, 'anvil.rlib'), 'x'.repeat(64 * 1024));
    }
    await mkdir(join(dir, 'out'), { recursive: true });
    await writeFile(join(dir, 'out', 'catalog.json'), '{"anvils":3}');
    await mkdir(join(dir, 'docs'), { recursive: true });
    await writeFile(join(dir, 'docs', 'ACME.md'), '# Acme\n');
    await writeFile(join(dir, 'rewrites.mjs'), `
      import assert from 'node:assert/strict';
      import { existsSync, readFileSync, writeFileSync } from 'node:fs';
      assert.equal(existsSync('target'), false, 'the build tree was copied');
      assert.equal(readFileSync('out/catalog.json', 'utf8'), '{"anvils":3}');
      writeFileSync('docs/ACME.md', '# Acme');
    `);
    // out/ is ignored when git is asked, but this generator declares it read.
    assert.deepEqual(await survivors(dir, [{ path: 'docs/ACME.md', reads: ['out/catalog.json'], args: ['rewrites.mjs'] }]), [], git ? 'in a git repository' : 'outside one');
    assert.ok(leftOut(dir).includes('target'));
    assert.equal(leftOut(dir).includes('out'), git, 'only git ignores out/; the fixed list does not name it');
  }
});

test('a directory declared in reads keeps its ignored files, however git lists them', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-generated-acme-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  // A file-pattern rule: git names inputs/catalog.json itself, not inputs/.
  await writeFile(join(dir, '.gitignore'), '*.json\n');
  await mkdir(join(dir, 'inputs'), { recursive: true });
  await writeFile(join(dir, 'inputs', 'source.txt'), 'anvils\n');
  await writeFile(join(dir, 'inputs', 'catalog.json'), '{"anvils":3}');
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'ACME.md'), '# Acme\n');
  await writeFile(join(dir, 'rewrites.mjs'), `
    import { readFileSync, writeFileSync } from 'node:fs';
    writeFileSync('docs/ACME.md', '# Acme ' + JSON.parse(readFileSync('inputs/catalog.json', 'utf8')).anvils);
  `);
  assert.ok(leftOut(dir).includes('inputs/catalog.json'));
  assert.deepEqual(await survivors(dir, [{ path: 'docs/ACME.md', reads: ['inputs'], args: ['rewrites.mjs'] }]), []);
});

test('survivors queries git ls-files once and runs co-generated outputs in one shared generator invocation', async t => {
  const { chmod, readFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'plates-generated-acme-'));
  const binDir = await mkdtemp(join(tmpdir(), 'plates-generated-bin-'));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(binDir, { recursive: true, force: true });
  });
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  const gitLog = join(binDir, 'git.log'), genLog = join(binDir, 'gen.log'), gitWrap = join(binDir, 'git');
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'A.md'), '# A\n');
  await writeFile(join(dir, 'docs', 'B.md'), '# B\n');
  await writeFile(join(dir, 'docs', 'C.md'), '# C\n');
  await writeFile(join(dir, 'gen-ab.mjs'), `import { appendFileSync, writeFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(genLog)}, 'ab\\n');\nwriteFileSync('docs/A.md', '# A\\n');\nwriteFileSync('docs/B.md', '# B\\n');\n`);
  await writeFile(join(dir, 'gen-c.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync('docs/C.md', '# C\\n');\n`);

  const origPath = process.env.PATH;
  if (process.platform !== 'win32') {
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    await writeFile(gitWrap, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${gitLog.replaceAll("'", "'\\''")}'\nexec '${realGit.replaceAll("'", "'\\''")}' "$@"\n`);
    await chmod(gitWrap, 0o755);
    process.env.PATH = `${binDir}:${origPath}`;
  }
  try {
    const out = await survivors(dir, [
      { path: 'docs/A.md', args: ['gen-ab.mjs'] },
      { path: 'docs/B.md', args: ['gen-ab.mjs'] },
      { path: 'docs/C.md', args: ['gen-c.mjs'] },
    ]);
    assert.deepEqual(out, []);
  } finally {
    process.env.PATH = origPath;
  }
  if (process.platform !== 'win32') {
    assert.equal((await readFile(gitLog, 'utf8')).trim().split('\n').filter(l => /\bls-files\b/.test(l)).length, 1, 'leftOut runs git ls-files once');
  }
  assert.equal((await readFile(genLog, 'utf8')).trim().split('\n').length, 1, 'co-generated files share one generator run');

  // If a shared generator rewrites A.md but appends to B.md, B.md is still caught and named.
  await writeFile(join(dir, 'gen-partial.mjs'), `import { appendFileSync, writeFileSync } from 'node:fs';\nwriteFileSync('docs/A.md', '# A\\n');\nappendFileSync('docs/B.md', 'more\\n');\n`);
  const partial = await survivors(dir, [
    { path: 'docs/A.md', args: ['gen-partial.mjs'] },
    { path: 'docs/B.md', args: ['gen-partial.mjs'] },
  ]);
  assert.equal(partial.length, 1);
  assert.match(partial[0], /^docs\/B\.md:/);
});
