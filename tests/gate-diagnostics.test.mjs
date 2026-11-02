import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { run } from './helpers/run.mjs';
import { scratch, project, plates, byId, setConfig, ENV } from './helpers/improve.mjs';
import * as ledger from '../practices/night/files/scripts/plates/test-ledger.mjs';
const { timedCommand, readRuns } = ledger;
const gateDiagnostics = (...args) => ledger.gateDiagnostics(...args);
import { measure, MEASURES } from '../practices/night/files/scripts/plates/improve.mjs';

const gateOnly = MEASURES.filter(m => m.id === 'gate');
async function fixture(t, source, check = 'node acme-runner.mjs', extra = {}) {
  const root = await scratch(t, 'plates-gate-diagnostics-acme-');
  const config = { name: 'Acme', check, ...extra };
  await mkdir(join(root, '.plates'));
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify(config));
  await writeFile(join(root, '.gitignore'), '.plates/test-runs/\n');
  await writeFile(join(root, 'acme-runner.mjs'), source);
  for (const args of [['init', '-q'], ['add', '.'], ['commit', '-qm', 'Acme gate']]) {
    const r = run('git', args, { cwd: root });
    assert.equal(r.status, 0, r.stderr);
  }
  const commit = run('git', ['rev-parse', 'HEAD'], { cwd: root }).stdout.trim();
  return { root, config, commit };
}

test('Vitest and typecheck failures retain output and invocation provenance without inventing test coverage', async t => {
  for (const output of ['FAIL acme.test.ts > Acme saves\nAssertionError: expected 2 to be 3', 'acme.ts(4,2): error TS2322: Type number is not assignable to string.']) {
    const f = await fixture(t, `console.error(${JSON.stringify(output)}); process.exit(1);`);
    const [g] = await measure({ ...f, measures: gateOnly });
    assert.equal(g.state, 'outside');
    assert.equal(g.facts.status, 1);
    assert.equal(g.facts.tests, null);
    assert.match(g.detail, /no node test summary/);
    assert.equal(g.facts.diagnostics.stderr.text, output + '\n');
    assert.equal(g.facts.execution.commit, f.commit);
    const receipt = (await readRuns(f.root, undefined, { gates: true })).runs.find(r => r.kind === 'gate');
    assert.equal(receipt.commit, f.commit);
    assert.equal(receipt.invocationId, g.facts.execution.invocationId);
    assert.equal(receipt.commandHash, g.facts.execution.commandHash);
    assert.equal(receipt.provenance.invocationId, receipt.invocationId);
    assert.deepEqual(receipt.diagnostics, g.facts.diagnostics);
    assert.deepEqual(receipt.tests, []);
  }
});

test('failure tails are byte and line bounded after secret redaction, with explicit truncation and unavailable streams', () => {
  const secret = 'acme-fake-credential';
  const text = 'preamble\n'.repeat(100) + '界'.repeat(9000) + `\nAPI_KEY="${secret}"\nAuthorization: Bearer ${secret}\nhttps://acme:${secret}@example.test\n${secret}\nfailed Acme`;
  const r = gateDiagnostics({ status: 1, stdout: text, stderr: null }, { ACME_CUSTOM: secret }, { configEnv: ['ACME_CUSTOM'] });
  assert.equal(r.scope, 'whole-command');
  assert.equal(r.stage, null);
  assert.equal(r.stdout.truncated, true);
  assert.ok(r.stdout.retainedBytes <= 8192);
  assert.ok(r.stdout.text.split('\n').length <= 80);
  assert.match(r.stdout.text, /failed Acme$/);
  assert.doesNotMatch(JSON.stringify(r), /acme-fake-credential/);
  assert.equal(r.stdout.observedBytes, Buffer.byteLength(text));
  assert.equal(r.stderr.available, false);
  assert.equal(r.stderr.text, null);
  const split = gateDiagnostics({ status: 1, stdout: 'password="' + 'private-acme-'.repeat(2000) + '"', stderr: '' }, {});
  assert.doesNotMatch(split.stdout.text, /private-acme/);
  assert.match(split.stdout.text, /redacted/);
});

test('successful gate receipts retain status and coverage without saving command output', async t => {
  const f = await fixture(t, 'console.log("acme output not retained"); console.log("# tests 3");');
  const [g] = await measure({ ...f, measures: gateOnly });
  assert.equal(g.state, 'ok');
  assert.equal(g.facts.tests, 3);
  assert.equal(g.facts.diagnostics, null);
  const receipt = (await readRuns(f.root, undefined, { gates: true })).runs.find(r => r.kind === 'gate');
  assert.equal(receipt.status, 0);
  assert.equal(receipt.diagnostics, null);
  assert.doesNotMatch(JSON.stringify(receipt), /output not retained/);
});

test('signal termination stays broken and preserves signal, null status and diagnostics', async t => {
  const f = await fixture(t, '', 'printf "Acme interrupted\\n" >&2; kill -TERM $$');
  const [g] = await measure({ ...f, measures: gateOnly });
  assert.equal(g.state, 'broken');
  assert.equal(g.facts.status, null);
  assert.equal(g.facts.signal, 'SIGTERM');
  assert.equal(g.facts.diagnostics.outcome, 'signal');
  assert.match(g.facts.diagnostics.stderr.text, /Acme interrupted/);
  const receipt = (await readRuns(f.root, undefined, { gates: true })).runs.find(r => r.kind === 'gate');
  assert.equal(receipt.signal, 'SIGTERM');
  assert.equal(receipt.status, null);
});

test('spawn failure remains broken with bounded error code and no raw error-message leakage', async t => {
  const f = await fixture(t, '');
  const operations = (await import('node:child_process')).default;
  const original = operations.spawnSync;
  t.mock.method(operations, 'spawnSync', (...args) => args[0] === f.config.check
    ? { status: null, signal: null, stdout: null, stderr: null, error: Object.assign(new Error('acme-private-error'), { code: 'ENOENT' }) }
    : original(...args));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const [g] = await measure({ ...f, measures: gateOnly });
  assert.equal(g.state, 'broken');
  assert.equal(g.facts.diagnostics.errorCode, 'ENOENT');
  assert.equal(g.facts.diagnostics.outcome, 'execution-error');
  assert.equal(g.facts.diagnostics.stdout.available, false);
  assert.doesNotMatch(JSON.stringify(g), /acme-private-error/);
  assert.equal((await readRuns(f.root, undefined, { gates: true })).runs.find(r => r.kind === 'gate').diagnostics.errorCode, 'ENOENT');
});

test('compound early failure retains the whole command result and never claims a later stage ran', async t => {
  const f = await fixture(t, 'console.error("Acme first stage failed; later && text is just output"); process.exit(7);', 'node acme-runner.mjs && node acme-later.mjs');
  await writeFile(join(f.root, 'acme-later.mjs'), 'import {writeFileSync} from "node:fs"; writeFileSync("later-ran", "yes");');
  const r = await timedCommand(f.config.check, { cwd: f.root });
  assert.equal(r.status, 7);
  assert.equal(r.diagnostics.stage, null);
  assert.equal(r.diagnostics.scope, 'whole-command');
  assert.ok(!(await readdir(f.root)).includes('later-ran'));
  assert.match((await readRuns(f.root, undefined, { gates: true })).runs.find(r => r.kind === 'gate').diagnostics.stderr.text, /first stage failed/);
});

test('improve JSON stdout remains parseable while failed gate evidence is retained in existing ledger artifact paths', async t => {
  const root = await project(t);
  await writeFile(join(root, 'acme-runner.mjs'), 'console.log("Acme Vitest preamble"); console.error("FAIL acme.test.ts\\npassword=acme-fake-secret"); process.exit(1);');
  await setConfig(root, { check: 'node acme-runner.mjs' });
  const result = plates(['improve', '--json'], root, { ...ENV, PLATES_GH: '/acme/unavailable-gh' });
  const g = byId(result.json(), 'gate');
  assert.notEqual(result.code, 0);
  assert.equal(g.state, 'outside');
  assert.match(g.facts.diagnostics.stderr.text, /FAIL acme.test.ts/);
  assert.doesNotMatch(result.out, /acme-fake-secret/);
  const names = (await readdir(join(root, '.plates/test-runs'))).filter(n => n.endsWith('.json'));
  assert.ok(names.length > 0);
  const workflow = await readFile(new URL('../practices/night/files/.github/workflows/plates-night.yml', import.meta.url), 'utf8');
  assert.match(workflow, /\.plates\/test-runs\/\*\.json/);
  assert.match(workflow, /- name: Keep the test ledger\n        if: always\(\)/);
});


test('execution errors preserve output and signal without claiming the child never started', async t => {
  const f = await fixture(t, '');
  const operations = (await import('node:child_process')).default;
  const original = operations.spawnSync;
  let code = 'ETIMEDOUT';
  t.mock.method(operations, 'spawnSync', (...args) => args[0] === f.config.check
    ? { status: null, signal: 'SIGTERM', stdout: 'Acme started', stderr: 'Acme interrupted', error: Object.assign(new Error('acme-private-error'), { code }) }
    : original(...args));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  for (code of ['ETIMEDOUT', 'ENOBUFS']) {
    const [g] = await measure({ ...f, measures: gateOnly });
    assert.equal(g.state, 'broken');
    assert.equal(g.facts.status, null);
    assert.equal(g.facts.signal, 'SIGTERM');
    assert.equal(g.facts.diagnostics.errorCode, code);
    assert.equal(g.facts.diagnostics.outcome, 'execution-error');
    assert.equal(g.facts.diagnostics.stdout.text, 'Acme started');
    assert.match(g.detail, /gate execution failed/);
    assert.doesNotMatch(JSON.stringify(g), /acme-private-error|could not run|spawn-error/);
  }
});

test('nested diagnostics identify the revision that started the command even if HEAD changes', async t => {
  const f = await fixture(t, 'console.error("Acme nested failure"); process.exit(1);',
    'git -c commit.gpgsign=false -c user.name=Acme -c user.email=acme@example.test commit --allow-empty -qm acme-next && node acme-runner.mjs');
  const id = randomUUID();
  await mkdir(join(f.root, '.plates/test-runs'));
  await writeFile(join(f.root, '.plates/test-runs', `active-${id}`), JSON.stringify({ id, root: await realpath(f.root), pid: process.pid, completed: false }));
  const r = await timedCommand(f.config.check, { cwd: f.root, env: { ...ENV, PLATES_GATE_INVOCATION: id } });
  assert.equal(r.status, 1);
  assert.equal(r.execution.nested, true);
  assert.equal(r.execution.invocationId, id);
  assert.equal(r.execution.commit, f.commit);
  assert.notEqual(run('git', ['rev-parse', 'HEAD'], { cwd: f.root }).stdout.trim(), f.commit);
  assert.match(r.diagnostics.stderr.text, /Acme nested failure/);
});


test('malformed redaction config preserves gate outcomes and active receipt ownership without retaining output', async t => {
  for (const [label, tests] of [['null-tests', null], ['number-names', { configEnv: 42 }], ['null-names', { configEnv: null }], ['string-names', { configEnv: 'ACME_CUSTOM' }], ['invalid-name', { configEnv: [42] }]]) {
    for (const nested of [false, true]) for (const status of [0, 7]) {
      await t.test(`${label} ${nested ? 'nested' : 'outer'} exit ${status}`, async t => {
        const f = await fixture(t, `console.log(process.env.ACME_CUSTOM); process.exit(${status});`, 'node acme-runner.mjs', { tests });
        const id = randomUUID(), env = { ...ENV, ACME_CUSTOM: 'acme-configured-private-value' };
        if (nested) {
          await mkdir(join(f.root, '.plates/test-runs'));
          await writeFile(join(f.root, '.plates/test-runs', `active-${id}`), JSON.stringify({ id, root: await realpath(f.root), pid: process.pid, completed: false }));
          env.PLATES_GATE_INVOCATION = id;
        }
        const r = await timedCommand(f.config.check, { cwd: f.root, env });
        assert.equal(r.status, status);
        assert.equal(r.execution.nested, nested);
        if (status === 0) assert.equal(r.diagnostics, null);
        else for (const stream of ['stdout', 'stderr']) {
          assert.equal(r.diagnostics[stream].available, false);
          assert.equal(r.diagnostics[stream].reason, 'invalid-redaction-config');
          assert.equal(r.diagnostics[stream].text, null);
        }
        assert.doesNotMatch(JSON.stringify(r.diagnostics), /acme-configured-private-value/);
        const files = await readdir(join(f.root, '.plates/test-runs'));
        assert.deepEqual(files.filter(name => name.startsWith('active-')), nested ? [`active-${id}`] : []);
        for (const name of files.filter(name => name.endsWith('.json'))) {
          assert.doesNotMatch(await readFile(join(f.root, '.plates/test-runs', name), 'utf8'), /acme-configured-private-value/);
        }
      });
    }
  }
});
