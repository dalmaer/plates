// The guard on tests/helpers/hermetic.mjs: inside the suite, git reads none of
// the developer's own config — in this process and in every child it spawns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './helpers/run.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// What git sees: the global config, the fsmonitor and gpgsign settings, the branch new repos get, and who commits.
const PROBE = `
const { execFileSync } = require('node:child_process');
const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
console.log(JSON.stringify({
  global: git('config', '--global', '--list'),
  fsmonitor: git('config', '--get', 'core.fsmonitor'),
  gpgsign: git('config', '--get', 'commit.gpgsign'),
  branch: git('config', '--get', 'init.defaultBranch'),
  ident: git('var', 'GIT_AUTHOR_IDENT').replace(/>.*/, '>'),
}));`;
const EXPECTED = { global: '', fsmonitor: 'false', gpgsign: 'false', branch: 'main', ident: 'Acme Builder <builder@acme.test>' };

test('npm test loads the hermetic bootstrap before every test file', async () => {
  const { scripts } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  assert.match(scripts.test, /^node --import \.\/tests\/helpers\/hermetic\.mjs --test /);
});

test('inside the suite, git reads no global config and pins fsmonitor off', () => {
  assert.equal(execFileSync('git', ['config', '--global', '--list'], { encoding: 'utf8' }), '');
  assert.equal(execFileSync('git', ['config', '--get', 'core.fsmonitor'], { encoding: 'utf8' }).trim(), 'false');
  assert.equal(process.env.GIT_CONFIG_NOSYSTEM, '1');
});

test('a spawned child sees the same git', () => {
  const r = run(process.execPath, ['-e', PROBE]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), EXPECTED);
});

// A phase's Proof may run a test file alone (`node --test tests/<file>`), without
// npm test's --import. Files that commit import the bootstrap themselves, so a
// hostile global config (signing on, with a signer that always fails; no
// identity) still never reaches their git (review of PR 58, phase 65's proof).
test('a test file run alone, without npm test\'s --import, is hermetic too', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-hostile-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const hostile = join(dir, 'gitconfig');
  await writeFile(hostile, '[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = false\n[user]\n\tuseConfigOnly = true\n');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/.test(k)));
  env.GIT_CONFIG_GLOBAL = hostile;
  const alone = [
    ['tests/contracts.test.mjs', 'contracts render into the guide'],
    ['tests/doctor.test.mjs', 'platform guard: doctor fails a tracked test'],
  ];
  for (const [file, name] of alone) {
    const r = run(process.execPath, ['--test', `--test-name-pattern=${name}`, file], { cwd: ROOT, env });
    assert.equal(r.status, 0, `${file} run alone under a hostile git config:\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^ℹ pass 1$/m, `${file}: the named test ran`);
  }
});

// These are enclosing-night inputs, not defaults for synthetic projects.
const NIGHT_CONTEXT = {
  NAMES_EVIDENCE: 'true', PLATES_NIGHT_RECOVERY: '1',
  PLATES_NAMES_RUNTIME_ROOT: '/Acme/observer', PLATES_NAMES_IMPORTS_FILE: '/Acme/imports.json',
  PLATES_NAMES_EVIDENCE_REPOSITORY_ID: '123',
  PLATES_RECONCILE_REQUIRED: '1', PLATES_RECONCILE_DEFAULT_BRANCH: 'main',
  PLATES_RECONCILE_SNAPSHOT: '/Acme/snapshot.json', PLATES_RECONCILE_PRODUCER_ATTEMPT: '1',
  PLATES_RECONCILE_ARTIFACT_ID: '456', PLATES_RECONCILE_ARTIFACT_DIGEST: 'sha256:' + 'a'.repeat(64),
  PLATES_RECONCILE_RESULT_DIGEST: 'b'.repeat(64),
};
test('bootstrap isolates enclosing night context while explicit test child environments still work', () => {
  const probe = `
    const { run, runAsync } = await import('./tests/helpers/run.mjs');
    const context = ${JSON.stringify(NIGHT_CONTEXT)};
    const keys = Object.keys(context);
    const inherited = Object.fromEntries(keys.filter(k => k in process.env).map(k => [k, process.env[k]]));
    const code = 'console.log(JSON.stringify(Object.fromEntries(' + JSON.stringify(keys) + '.filter(k => k in process.env).map(k => [k, process.env[k]]))))';
    const plain = run(process.execPath, ['-e', code]);
    const explicit = run(process.execPath, ['-e', code], { env: { ...process.env, ...context } });
    const asynchronous = await runAsync(process.execPath, ['-e', code], { env: { ...process.env, ...context } });
    console.log(JSON.stringify({ inherited, plain: JSON.parse(plain.stdout), explicit: JSON.parse(explicit.stdout), asynchronous: JSON.parse(asynchronous.stdout), statuses: [plain.status, explicit.status, asynchronous.status], unrelated: process.env.ACME_TEST_CONTEXT }));
  `;
  const r = run(process.execPath, ['--import', './tests/helpers/hermetic.mjs', '--input-type=module', '-e', probe], {
    cwd: ROOT, env: { ...process.env, ...NIGHT_CONTEXT, ACME_TEST_CONTEXT: 'kept' },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { inherited: {}, plain: {}, explicit: NIGHT_CONTEXT, asynchronous: NIGHT_CONTEXT, statuses: [0, 0, 0], unrelated: 'kept' });
});
