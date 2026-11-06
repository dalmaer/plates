// #307: diagnose the failure, not just the assertion it prevented. All commands
// and evidence are synthetic; no real timeout, retry or historical-cause claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gitFailure } from './fixtures/improve/git-diagnostics.mjs';
import { hygieneFixture } from './fixtures/improve/hygiene-evidence.mjs';
import * as fixture from './helpers/climb.mjs';
import { run } from './helpers/run.mjs';

const commands = [['init', '--initial-branch=main'], ['add', '--', 'anvils.mjs'], ['commit', '-m', 'Acme source fixture']];
const success = { status: 0, signal: null, stdout: '', stderr: '' };
const timeout = Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' });
const absent = Object.assign(new Error('spawnSync git ENOENT'), { code: 'ENOENT' });

test('hygiene fixture retains the command and stderr from a failed Git executable', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-acme-git-failure-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const calls = join(dir, 'calls');
  await writeFile(join(dir, 'git'), '#!/bin/sh\nprintf "%s\\n" "$PWD" >> "$ACME_GIT_CALLS"\necho "fatal: Acme Git unavailable" >&2\nexit 128\n', { mode: 0o755 });
  await assert.rejects(hygieneFixture({ env: { ...process.env, PATH: dir, ACME_GIT_CALLS: calls }, now: 0 }), error => {
    assert.match(error.message, /\["git","init","--initial-branch=main"\]/);
    assert.match(error.message, /status: 128; signal: null/);
    assert.match(error.message, /error: none/);
    assert.match(error.message, /stderr:\nfatal: Acme Git unavailable/);
    return true;
  });
  const roots = (await readFile(calls, 'utf8')).trim().split('\n');
  assert.equal(roots.length, 1, 'one failed invocation, without retry');
  await assert.rejects(access(dirname(roots[0])), { code: 'ENOENT' });
});

for (const [name, step, result] of [
  ['nonzero commit', 2, { status: 128, signal: null, stderr: 'fatal: Acme commit refused', stdout: 'Acme commit context' }],
  ['signal', 1, { status: null, signal: 'SIGTERM', stderr: 'Acme add interrupted', stdout: '' }],
  ['timeout', 0, { status: null, signal: 'SIGTERM', error: timeout, stderr: 'Acme init before timeout', stdout: 'Acme partial output' }],
  ['spawn error with no output', 0, { status: null, signal: null, error: absent, stderr: null, stdout: null }],
]) {
  test(`hygiene fixture retains Git ${name} diagnostics and cleans up without retry`, async () => {
    const calls = [];
    const env = { ...process.env, GIT_DIR: '/acme/hostile', PLATES_GIT: '/acme/stub', ACME_PRIVATE: 'must not be logged' };
    await assert.rejects(hygieneFixture({ env, now: 0, execute(command, args, options) {
      calls.push({ command, args, options });
      return calls.length === step + 1 ? result : success;
    } }), error => {
      assert.equal(calls.length, step + 1, 'stop at the first failed command; never retry');
      assert.equal(error.cause, result.error, 'retain the spawn error as the cause');
      assert.match(error.message, /synthetic Git:/);
      assert.ok(error.message.includes(JSON.stringify(['git', ...commands[step]])), error.message);
      assert.ok(error.message.includes(`status: ${result.status}; signal: ${result.signal}`), error.message);
      assert.ok(error.message.includes(result.error ? `error: ${result.error.code}: ${result.error.message}` : 'error: none'), error.message);
      assert.ok(error.message.includes(`stderr:\n${result.stderr || '(empty)'}`), error.message);
      assert.ok(error.message.includes(`stdout:\n${result.stdout || '(empty)'}`), error.message);
      assert.ok(error.message.includes(`cwd: ${calls[0].options.cwd}`), error.message);
      assert.doesNotMatch(error.message, /must not be logged|hostile|GIT_AUTHOR/);
      return true;
    });
    assert.deepEqual(calls.map(c => c.args), commands.slice(0, step + 1));
    for (const { command, options } of calls) {
      assert.equal(command, 'git');
      assert.equal(options.timeout, 5000, 'the original timeout stays unchanged');
      assert.equal(options.maxBuffer, 1024 * 1024);
      assert.equal(options.env.GIT_DIR, undefined);
      assert.equal(options.env.PLATES_GIT, 'git');
      assert.equal(options.env.GIT_AUTHOR_NAME, 'Acme');
    }
    await assert.rejects(access(dirname(calls[0].options.cwd)), { code: 'ENOENT' }, 'failed fixtures remove their temporary root');
  });
}

test('synthetic Git diagnostics bound output while retaining both ends and failure metadata', () => {
  const text = gitFailure(['commit', '-m', 'Acme'.repeat(2000)], {
    status: null, signal: 'SIGTERM', error: timeout,
    stderr: `Acme stderr start${'x'.repeat(20000)}Acme stderr end`,
    stdout: Buffer.from(`Acme stdout start${'y'.repeat(20000)}Acme stdout end`),
  }, '/acme');
  assert.ok(text.length < 11000, `bounded diagnostic: ${text.length} characters`);
  for (const expected of ['status: null; signal: SIGTERM', 'error: ETIMEDOUT: spawnSync git ETIMEDOUT', 'Acme stderr start', 'Acme stderr end', 'Acme stdout start', 'Acme stdout end']) assert.ok(text.includes(expected), expected);
  assert.equal((text.match(/\[truncated \d+ characters\]/g) ?? []).length, 3);
});

test('synthetic gate retains Git stderr after the guard suppresses a failed commit', async t => {
  const dir = await fixture.acme(t, {
    climb: { jobs: ['test-time'], testCommand: fixture.LEDGER_TEST },
    config: { check: fixture.LEDGER_TEST },
    files: { 'acme.test.mjs': fixture.suite('acme holds') },
  });
  const base = fixture.git(dir, ['rev-parse', 'HEAD']);
  await fixture.commit(dir, { 'acme.test.mjs': `${fixture.suite('acme holds')}// Acme candidate\n` }, 'Acme candidate');
  const gateGit = await fixture.diagnosticGit(t);
  const good = run('sh', ['-c', `${gateGit.command} rev-parse HEAD`], { cwd: dir });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(good.stdout.trim(), fixture.git(dir, ['rev-parse', 'HEAD']));
  assert.equal(await gateGit.failure(), '', 'successful commands leave no failure');
  // A missing synthetic git dir forces commit to exit 128. Only the candidate
  // runs it: the base's linked worktree has a .git file, not a directory.
  const tail = `if [ -d .git ]; then ${gateGit.command} --git-dir=acme-missing-git-dir commit -q -m sneak; fi`;
  await fixture.write(dir, { '.plates/plates.json': JSON.stringify({ name: 'Acme', climb: { jobs: ['test-time'] }, check: `${fixture.LEDGER_TEST} && ${tail}` }) });
  const failed = fixture.climb(dir, ['guard', '--base', base, '--json']);
  const diagnostic = await gateGit.failure();
  assert.equal(failed.status, 1, failed.stdout + failed.stderr + diagnostic);
  assert.match(fixture.json(failed).problems.join('\n'), /failed \(exit 128\)/, diagnostic);
  assert.doesNotMatch(failed.stdout + failed.stderr, /fatal: not a git repository/);
  assert.match(diagnostic, /\["git","--git-dir=acme-missing-git-dir","commit","-q","-m","sneak"\]/);
  assert.match(diagnostic, /status: 128; signal: null/);
  assert.match(diagnostic, /stderr:\nfatal: not a git repository: 'acme-missing-git-dir'/);
  assert.equal(fixture.git(dir, ['status', '--porcelain', '--untracked-files=all']).includes('failure.txt'), false, 'diagnostics stay outside the guarded checkout');
  await gateGit.clear();
  const next = run('sh', ['-c', `${gateGit.command} rev-parse HEAD`], { cwd: dir });
  assert.equal(next.status, 0, next.stderr);
  assert.equal(await gateGit.failure(), '', 'a new gate run cannot inherit an earlier failure');
});
