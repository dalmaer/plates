// One real npm artifact per source tree and test invocation. Consumers still
// extract/install independent copies; npm remains the packaging oracle.
import './hermetic.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { globSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, copyFile, realpath } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout } from 'node:timers/promises';
import { run } from './run.mjs';

const source = resolve(import.meta.dirname, '../..');
// Node preloads execute in file workers, not the parent runner. Use the runner
// PID to share across its workers, including files scheduled later. Entries stay
// in system temp; a worker cannot delete them while later siblings may need them.
const runCache = join(tmpdir(), `plates-test-packs-${process.getuid?.() ?? 'user'}-${process.ppid}`);
let npmVersion;
function toolVersion() {
  if (!npmVersion) {
    const temporary = dirname(process.env.GIT_CONFIG_GLOBAL);
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^npm_config_/i.test(name)));
    const result = run('npm', ['--version'], { env: { ...env,
      npm_config_cache: join(temporary, 'npm-version-cache'),
      npm_config_userconfig: join(temporary, 'npm-userconfig'),
      npm_config_globalconfig: join(temporary, 'npm-globalconfig'),
      npm_config_offline: 'true', npm_config_update_notifier: 'false',
    } });
    assert.equal(result.status, 0, result.stderr);
    npmVersion = result.stdout.trim();
  }
  return npmVersion;
}
// Hash the declared package inputs (including ignored/untracked files) and
// npm's automatic files/ignore rules. Source-only docs/tests are not pack inputs.
// Git internals and installed dependencies are not inputs to this dependency-free
// package. Hash bytes and modes, not mtimes, so same-size edits invalidate reuse.
function treeKey(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  assert.ok(Array.isArray(pkg.files) && !pkg.bundleDependencies && !pkg.bundledDependencies,
    'packed fixtures require explicit files and no bundled dependencies');
  const hash = createHash('sha256').update(JSON.stringify([root, process.version, toolVersion()]));
  const patterns = [...pkg.files.filter(path => !path.startsWith('!')), 'package.json',
    '.npmignore', '.gitignore', '.npmrc', 'npm-shrinkwrap.json',
    ...readdirSync(root).filter(name => /^(readme|licen[sc]e|copying)(?:\.|$)/i.test(name))];
  const selected = globSync(patterns, { cwd: root });
  // A literal/globbed file still inherits ignore rules in its parent directories.
  const ignores = new Set();
  for (const path of selected) for (let parent = dirname(path); parent !== '.'; parent = dirname(parent)) {
    ignores.add(join(parent, '.npmignore')); ignores.add(join(parent, '.gitignore'));
  }
  const inputs = [...new Set([...selected, ...globSync([...ignores], { cwd: root })])].sort();
  const roots = inputs.filter(path => !inputs.some(parent => parent !== path && path.startsWith(parent + '/')));
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      if (name === '.git' || name === 'node_modules') continue;
      const path = join(dir, name), relative = prefix + name, info = lstatSync(path);
      hash.update(JSON.stringify([relative, info.mode]));
      if (info.isSymbolicLink()) hash.update(readlinkSync(path));
      else if (info.isDirectory()) walk(path, relative + '/');
      else hash.update(readFileSync(path));
    }
  }
  for (const path of roots) {
    const full = join(root, path), info = lstatSync(full);
    hash.update(JSON.stringify([path, info.mode]));
    if (info.isDirectory()) walk(full, path + '/');
    else if (info.isSymbolicLink()) hash.update(readlinkSync(full));
    else hash.update(readFileSync(full));
  }
  return hash.digest('hex');
}

export async function packedTarball(destination, { cwd = source, cache = runCache } = {}) {
  cwd = await realpath(cwd);
  const key = treeKey(cwd), entry = join(cache, key), receipt = join(entry, 'result.json');
  await mkdir(cache, { recursive: true });
  let owner = false;
  try { await mkdir(entry); owner = true; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (owner) {
    let result;
    try {
      const config = join(entry, 'npmrc'), globalConfig = join(entry, 'global-npmrc');
      await writeFile(config, ''); await writeFile(globalConfig, '');
      const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^npm_config_/i.test(name)));
      result = run('npm', ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', entry], {
        cwd, timeout: 60000, env: { ...env, npm_config_cache: join(entry, 'npm-cache'), npm_config_userconfig: config,
          npm_config_globalconfig: globalConfig, npm_config_update_notifier: 'false' },
      });
      assert.equal(treeKey(cwd), key, 'package source changed while packing');
    } catch (error) { result = { status: 1, stdout: '', stderr: error.message }; }
    await writeFile(receipt + '.tmp', JSON.stringify(result));
    await rename(receipt + '.tmp', receipt);
  }
  const deadline = Date.now() + 65000;
  let result;
  while (!result) {
    try { result = JSON.parse(await readFile(receipt, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT' || Date.now() >= deadline) throw error;
      await setTimeout(20);
    }
  }
  if (result.status === 0) {
    const [{ filename, integrity }] = JSON.parse(result.stdout), tarball = join(entry, filename);
    assert.equal('sha512-' + createHash('sha512').update(await readFile(tarball)).digest('base64'), integrity, 'cached npm artifact integrity');
    await copyFile(tarball, join(destination, filename));
  }
  return result;
}
