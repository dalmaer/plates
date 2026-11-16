import './helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, utimes, stat, symlink, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packedTarball } from './helpers/packed-tarball.mjs';
import { copyPackageSource } from './helpers/copy-package-source.mjs';
import { run, runAsync } from './helpers/run.mjs';

async function world(t) {
  const root = await mkdtemp(join(tmpdir(), 'acme-package-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), cache = join(root, 'cache');
  await mkdir(join(source, 'lib'), { recursive: true });
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'acme', version: '1.0.0', files: ['lib/'] }));
  await writeFile(join(source, 'lib/value.mjs'), 'export default 1;\n');
  const destination = async name => { const dir = join(root, name); await mkdir(dir); return dir; };
  return { root, source, cache, destination };
}

test('concurrent package consumers run npm once and extract independent copies', async t => {
  const w = await world(t), shim = await w.destination('bin'), calls = join(w.root, 'calls');
  const npm = run('which', ['npm']); assert.equal(npm.status, 0, npm.stderr);
  const runner = pathToFileURL(join(import.meta.dirname, 'helpers/run.mjs')).href;
  await writeFile(join(shim, 'npm'), `#!${process.execPath}\nimport {appendFileSync} from 'node:fs';\nimport {run} from ${JSON.stringify(runner)};\nif(!process.env.npm_config_cache||!process.env.npm_config_userconfig||!process.env.npm_config_globalconfig)throw Error('Acme npm must be isolated');\nif(process.argv[2]==='pack')appendFileSync(${JSON.stringify(calls)}, 'pack\\n');\nconst r=run(${JSON.stringify(npm.stdout.trim())}, process.argv.slice(2));\nprocess.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status;\n`, { mode: 0o755 });
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers/packed-tarball.mjs')).href;
  const destinations = await Promise.all(['one', 'two'].map(w.destination));
  const results = await Promise.all(destinations.map(dir => runAsync(process.execPath, ['--input-type=module', '-e',
    `import {packedTarball} from ${JSON.stringify(helper)}; const r=await packedTarball(${JSON.stringify(dir)},${JSON.stringify({cwd:w.source,cache:w.cache})});console.log(JSON.stringify(r));process.exitCode=r.status;`],
  { env: { ...process.env, PATH: shim + ':' + process.env.PATH } })));
  for (const result of results) assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(await readFile(calls, 'utf8'), 'pack\n', 'one npm pack across file processes');
  const filename = JSON.parse(JSON.parse(results[0].stdout).stdout)[0].filename;
  for (const dir of destinations) assert.equal(run('tar', ['xzf', join(dir, filename), '-C', dir]).status, 0);
  await writeFile(join(destinations[0], 'package/lib/value.mjs'), 'Acme changed consumer');
  assert.equal(await readFile(join(destinations[1], 'package/lib/value.mjs'), 'utf8'), 'export default 1;\n');
  await writeFile(join(destinations[0], filename), 'Acme changed archive');
  const third = await w.destination('three'), again = await packedTarball(third, { cwd: w.source, cache: w.cache });
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(await readFile(join(third, filename)), await readFile(join(destinations[1], filename)));
});

test('packed cache follows same-size dirty bytes, new ignored inputs, deletion, modes and package rules', async t => {
  const w = await world(t); let i = 0;
  const pack = async () => {
    const dest = await w.destination('pack-' + i++), result = await packedTarball(dest, { cwd: w.source, cache: w.cache });
    assert.equal(result.status, 0, result.stderr);
    const [metadata] = JSON.parse(result.stdout);
    assert.equal(run('tar', ['xzf', join(dest, metadata.filename), '-C', dest]).status, 0);
    return { metadata, pkg: join(dest, 'package') };
  };
  const first = await pack(), path = join(w.source, 'lib/value.mjs'), original = await stat(path);
  await writeFile(path, 'export default 2;\n'); await utimes(path, original.atime, original.mtime);
  const changed = await pack(); assert.notEqual(changed.metadata.shasum, first.metadata.shasum);
  assert.equal(await readFile(join(changed.pkg, 'lib/value.mjs'), 'utf8'), 'export default 2;\n');
  await writeFile(join(w.source, '.gitignore'), 'lib/ignored.mjs\n');
  await writeFile(join(w.source, 'lib/ignored.mjs'), 'Acme ignored but explicitly packed');
  assert.ok((await pack()).metadata.files.some(f => f.path === 'lib/ignored.mjs'));
  await chmod(path, 0o755); assert.ok((await pack()).metadata.files.find(f => f.path === 'lib/value.mjs').mode & 0o111);
  await rm(join(w.source, 'lib/ignored.mjs')); assert.ok(!(await pack()).metadata.files.some(f => f.path === 'lib/ignored.mjs'));
  await writeFile(join(w.source, 'package.json'), JSON.stringify({ name: 'acme', version: '1.0.0', files: ['lib/', '!lib/value.mjs'] }));
  assert.ok(!(await pack()).metadata.files.some(f => f.path === 'lib/value.mjs'));
});

test('source copies retain package inputs, explicit records, modes and relative links without the test tree', async t => {
  const w = await world(t);
  await mkdir(join(w.source, 'tests')); await writeFile(join(w.source, 'tests/large.test.mjs'), 'Acme source-only test');
  await mkdir(join(w.source, 'docs')); await writeFile(join(w.source, 'docs/record.md'), 'Acme record');
  await writeFile(join(w.source, 'lib/.gitignore'), 'Acme source template');
  await chmod(join(w.source, 'lib/value.mjs'), 0o755);
  await symlink('value.mjs', join(w.source, 'lib/alias.mjs'));
  await writeFile(join(w.source, 'lib/excluded.mjs'), 'Acme omitted');
  await writeFile(join(w.source, 'package.json'), JSON.stringify({ name: 'acme', files: ['lib/', '!lib/excluded.mjs'] }));
  const dest = await w.destination('copied'); await copyPackageSource(w.source, dest, ['docs/record.md']);
  assert.equal(await readFile(join(dest, 'lib/value.mjs'), 'utf8'), 'export default 1;\n');
  assert.ok((await stat(join(dest, 'lib/value.mjs'))).mode & 0o111);
  assert.equal(await readlink(join(dest, 'lib/alias.mjs')), 'value.mjs');
  assert.equal(await readFile(join(dest, 'lib/.gitignore'), 'utf8'), 'Acme source template');
  assert.equal(await readFile(join(dest, 'docs/record.md'), 'utf8'), 'Acme record');
  for (const path of ['tests', 'lib/excluded.mjs']) await assert.rejects(stat(join(dest, path)), { code: 'ENOENT' });
  await writeFile(join(dest, 'lib/value.mjs'), 'Acme local edit');
  assert.equal(await readFile(join(w.source, 'lib/value.mjs'), 'utf8'), 'export default 1;\n');
});

test('file workers share a cache even when the runner does not preload the parent', async t => {
  const w = await world(t), preload = join(import.meta.dirname, 'helpers/hermetic.mjs');
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers/packed-tarball.mjs')).href;
  const files = [];
  for (const name of ['first', 'second']) {
    const dest = await w.destination(name), file = join(w.root, name + '.test.mjs'); files.push(file);
    await writeFile(file, `import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {packedTarball} from ${JSON.stringify(helper)};
const result=await packedTarball(${JSON.stringify(dest)}, {cwd:${JSON.stringify(w.source)}});
assert.equal(result.status,0,result.stderr);
await writeFile(${JSON.stringify(join(dest, 'cache-path'))},String(process.ppid));
`);
  }
  const env = { ...process.env }; delete env.PLATES_TEST_PACK_CACHE;
  const result = run(process.execPath, ['--import', preload, '--test', ...files], { env });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const paths = await Promise.all(['first', 'second'].map(name => readFile(join(w.root, name, 'cache-path'), 'utf8')));
  assert.equal(paths[0], paths[1], 'file workers share the same runner');
  const cache = join(tmpdir(), `plates-test-packs-${process.getuid?.() ?? 'user'}-${paths[0]}`);
  t.after(() => rm(cache, { recursive: true, force: true }));
  const { readdir } = await import('node:fs/promises');
  assert.equal((await readdir(cache)).length, 1, 'one packed tree for the two worker processes');
});
