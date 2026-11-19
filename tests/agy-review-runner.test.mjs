import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, realpath, readdir, stat, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { writeFileSync } from 'node:fs';
import { cleanEnv } from './helpers/run.mjs';
import { runAgyReview, captureAgy } from '../scripts/plates/agy-review.mjs';
import { AGY_REVIEW_MODELS, selectAgyReviewModel } from '../scripts/plates/agy-review-contract.mjs';

const patch = 'diff --git a/acme.mjs b/acme.mjs\n--- a/acme.mjs\n+++ b/acme.mjs\n@@ -1 +1 @@\n-old\n+new\n';
const catalog = { outcome: 'success', stdout: AGY_REVIEW_MODELS.map(m => `${m} Acme model`).join('\n'), stderr: '' };
function success(model) {
  const structured = { summary: 'Acme supplied patch reviewed.', findings: [] };
  return { outcome: 'success', stderr: '', stdout: [
    { event: 'init', conversation_id: 'acme-review', init: { model, agent: 'plates-review', tools: [], permission_mode: 'request-review' } },
    { event: 'result', result: { conversation_id: 'acme-review', status: 'SUCCESS', response: JSON.stringify(structured), structured_output: structured, num_turns: 1, duration_seconds: 1 } },
  ].map(e => JSON.stringify(e)).join('\n') };
}
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-agy-runner-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = { models: [...AGY_REVIEW_MODELS], prompt: join(root, 'prompt'), diff: join(root, 'diff'), out: join(root, 'review.json'), binary: join(root, 'fake-agy'), minutes: 10, started: 1000 };
  await writeFile(options.prompt, 'Review Acme only.'); await writeFile(options.diff, patch);
  await writeFile(options.binary, '#!/bin/sh\nexit 99\n', { mode: 0o700 }); // Never executed: every test injects execute.
  const calls = []; let clock = 1100000;
  const deps = { now: () => clock, temporaryRoot: root, environment: { GEMINI_API_KEY: 'Acme-synthetic-key', HOME: '/Acme-do-not-read', OPENAI_API_KEY: 'Acme-other-key', NODE_OPTIONS: '--Acme-poison', HTTPS_PROXY: 'Acme-proxy', XDG_CONFIG_HOME: '/Acme-config' },
    execute: async (binary, args, options) => { calls.push({ binary, args, options }); return args[0] === 'models' ? catalog : success(args[args.indexOf('--model') + 1]); } };
  return { root, options, deps, calls, setClock: value => { clock = value; }, receipts: `${options.out}.attempts` };
}

test('configured partial catalogs never enroll unconfigured models', async t => {
  for (const model of AGY_REVIEW_MODELS) {
    const f = await fixture(t); f.options.models = [model];
    const r = await runAgyReview(f.options, f.deps);
    assert.equal(r.ok, true); assert.equal(r.model, model); assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].args[f.calls[1].args.indexOf('--model') + 1], model);
  }
  assert.equal(selectAgyReviewModel({ availability: [{ model: AGY_REVIEW_MODELS[2], state: 'unavailable' }], attemptedModels: [], deadlineMs: 200, nowMs: 100 }).model, null);
  const f = await fixture(t); f.options.models = [AGY_REVIEW_MODELS[2]];
  f.deps.execute = async (...args) => { f.calls.push(args); return { ...catalog, stdout: AGY_REVIEW_MODELS[0] }; };
  assert.equal((await runAgyReview(f.options, f.deps)).reason, 'configured-models-unavailable');
  assert.equal(f.calls.length, 1);
});

test('successful runner isolates HOME CWD environment settings and tool-free agent', async t => {
  const f = await fixture(t), environment = { ...f.deps.environment };
  const r = await runAgyReview(f.options, f.deps);
  assert.equal(r.ok, true); assert.equal(r.cost, null); assert.equal(r.usage, null);
  assert.deepEqual(JSON.parse(await readFile(f.options.out, 'utf8')), r);
  assert.deepEqual(f.deps.environment, environment);
  for (const call of f.calls) {
    assert.deepEqual(Object.keys(call.options.env).sort(), ['GEMINI_API_KEY', 'HOME', 'LANG', 'PATH']);
    assert.equal(call.options.env.GEMINI_API_KEY, 'Acme-synthetic-key');
    assert.notEqual(call.options.env.HOME, environment.HOME);
    assert.equal(call.options.cwd, join(call.options.env.HOME, 'workspace'));
    assert.deepEqual(await readdir(call.options.cwd), []);
    assert.equal(call.options.env.PATH, '/usr/bin:/bin');
    assert.equal((await stat(call.options.env.HOME)).mode & 0o777, 0o700);
  }
  const home = f.calls[0].options.env.HOME;
  const settings = JSON.parse(await readFile(join(home, '.gemini/antigravity-cli/settings.json'), 'utf8'));
  assert.deepEqual(settings.permissions.allow, []);
  assert.deepEqual(settings.permissions.deny, ['read_file(*)', 'write_file(*)', 'read_url(*)', 'execute_url(*)', 'command(*)', 'unsandboxed(*)', 'mcp(*)']);
  const agent = await readFile(join(home, '.gemini/config/agents/plates-review.md'), 'utf8');
  assert.match(agent, /tools: \[\]/); assert.match(agent, /commandExecutionPolicy: off/);
  const generation = f.calls[1];
  assert.ok(!generation.args.some(a => /dangerously|permission-mode|always-proceed|continue/.test(a)));
  assert.equal(generation.args[generation.args.indexOf('--agent') + 1], 'plates-review');
  assert.equal(generation.args[generation.args.indexOf('--output-format') + 1], 'stream-json');
  assert.match(JSON.parse(generation.options.input).message.content, /Review Acme only/);
  assert.match(JSON.parse(generation.options.input).message.content, /<patch-data>/);
  const receipts = await readdir(f.receipts);
  assert.deepEqual(receipts.sort(), ['catalog.json', 'generation-intent.json', 'generation-result.json', 'intent.json']);
  for (const name of receipts) {
    assert.doesNotMatch(await readFile(join(f.receipts, name), 'utf8'), /Acme-synthetic-key|Acme-other-key|Acme-proxy/);
    assert.equal((await stat(join(f.receipts, name))).mode & 0o777, 0o600);
  }
});

test('missing malformed or blank credential dispatches nothing and writes no receipts', async t => {
  for (const key of [undefined, '', '  ', true]) {
    const f = await fixture(t); f.deps.environment.GEMINI_API_KEY = key;
    assert.equal((await runAgyReview(f.options, f.deps)).reason, 'credential-unavailable');
    assert.equal(f.calls.length, 0);
    await assert.rejects(stat(f.receipts), { code: 'ENOENT' });
  }
});

test('catalog and generation share original deadline and insufficient remaining time stops dispatch', async t => {
  const f = await fixture(t), execute = f.deps.execute;
  f.deps.execute = async (...args) => { const r = await execute(...args); if (args[1][0] === 'models') f.setClock(1110000); return r; };
  assert.equal((await runAgyReview(f.options, f.deps)).ok, true);
  assert.equal(f.calls[0].options.timeoutMs, 30000);
  assert.equal(f.calls[1].options.timeoutMs, 490000);
  for (const time of [1590000, 999999, NaN]) {
    const g = await fixture(t); g.setClock(time);
    assert.equal((await runAgyReview(g.options, g.deps)).reason, 'original-deadline-exhausted');
    assert.equal(g.calls.length, 0);
  }
  const g = await fixture(t), exec = g.deps.execute;
  g.deps.execute = async (...args) => { const r = await exec(...args); g.setClock(1590000); return r; };
  assert.equal((await runAgyReview(g.options, g.deps)).reason, 'original-deadline-exhausted');
  assert.equal(g.calls.length, 1);
});

test('elapsed deadline after generation cannot turn late SUCCESS into acceptance', async t => {
  const f = await fixture(t), execute = f.deps.execute;
  f.deps.execute = async (...args) => { const r = await execute(...args); if (args[1][0] !== 'models') f.setClock(1600000); return r; };
  assert.equal((await runAgyReview(f.options, f.deps)).ok, false);
  assert.equal(f.calls.length, 2);
});

test('uncertain substantive denied malformed and timed-out generation never retry', async t => {
  const cases = [() => ({ outcome: 'timeout', stdout: '', stderr: '' }),
    () => ({ outcome: 'failure', stdout: 'Acme substantive response', stderr: 'model unavailable' }),
    m => ({ ...success(m), stderr: 'Acme soft-denied required action' }),
    m => ({ ...success(m), stderr: undefined }),
    () => ({ outcome: 'success', stdout: 'partial', stderr: '' }),
    () => { throw Error('Acme-private exception'); },
    m => { const r = success(m); r.stdout = r.stdout.replace('request-review', 'always-proceed'); return r; }];
  for (const response of cases) {
    const f = await fixture(t);
    f.deps.execute = async (binary, args, options) => { f.calls.push({ binary, args, options }); return args[0] === 'models' ? catalog : response(args[args.indexOf('--model') + 1]); };
    const r = await runAgyReview(f.options, f.deps);
    assert.equal(r.ok, false); assert.equal(f.calls.length, 2); assert.equal(r.cost, null);
    assert.doesNotMatch(await readFile(join(f.receipts, 'generation-result.json'), 'utf8'), /Acme-private|Acme soft-denied|Acme substantive/);
  }
});

test('catalog errors warnings and missing diagnostic coverage never start generation', async t => {
  for (const response of [{ ...catalog, stderr: 'Acme warning' }, { ...catalog, outcome: 'timeout' }, { ...catalog, stderr: undefined }, null]) {
    const f = await fixture(t); f.deps.execute = async (...args) => { f.calls.push(args); return response; };
    assert.equal((await runAgyReview(f.options, f.deps)).ok, false);
    assert.equal(f.calls.length, 1);
    await assert.rejects(stat(join(f.receipts, 'generation-intent.json')), { code: 'ENOENT' });
  }
});

test('create-only output and operation receipts prevent duplicates and preserve uncertainty', async t => {
  const f = await fixture(t);
  await runAgyReview(f.options, f.deps);
  const original = await readFile(f.options.out, 'utf8');
  await assert.rejects(runAgyReview(f.options, f.deps), /output already exists/);
  assert.equal(f.calls.length, 2); assert.equal(await readFile(f.options.out, 'utf8'), original);
  await rm(f.options.out);
  await assert.rejects(runAgyReview(f.options, f.deps), { code: 'EEXIST' });
  assert.equal(f.calls.length, 2);
  const g = await fixture(t); await mkdir(g.receipts, { mode: 0o700 });
  await writeFile(join(g.receipts, 'intent.json'), '{"state":"uncertain"}');
  await assert.rejects(runAgyReview(g.options, g.deps), { code: 'EEXIST' });
  assert.equal(g.calls.length, 0);
});

test('input and output symlinks are refused without invoking a provider', async t => {
  for (const field of ['prompt', 'diff', 'out', 'binary']) {
    const f = await fixture(t), link = join(f.root, `linked-${field}`);
    await symlink(f.options[field], link); f.options[field] = link;
    await assert.rejects(runAgyReview(f.options, f.deps));
    assert.equal(f.calls.length, 0);
  }
});

test('managed and root runners remain byte-identical', async () => {
  assert.equal(await readFile(new URL('../scripts/plates/agy-review.mjs', import.meta.url), 'utf8'), await readFile(new URL('../practices/cross-review/files/scripts/plates/agy-review.mjs', import.meta.url), 'utf8'));
});


test('captureAgy preserves split UTF-8 and emoji independently on both real child pipes', async t => {
  const f = await fixture(t);
  const stdoutText = 'Acme café 漢字 🛠️🚀';
  const stderrText = 'Acme naïve 日本 🌍';
  const script = join(f.root, 'split-utf8.mjs');
  await writeFile(script, `
    import { readFileSync } from 'node:fs';
    import { setTimeout } from 'node:timers/promises';
    const texts = JSON.parse(process.argv[2]);
    for (const name of ['stdout', 'stderr']) {
      const bytes = Buffer.from(texts[name]);
      for (let i = 0; i < bytes.length; i++) {
        process[name].write(bytes.subarray(i, i + 1));
        // Parent acknowledges an actual data event before the next byte, so
        // OS scheduling cannot coalesce the multibyte characters in this test.
        while (true) {
          let count = 0;
          try { count = Number(readFileSync(process.argv[3] + '/' + name + '.ack', 'utf8')); } catch {}
          if (count >= i + 1) break;
          await setTimeout(1);
        }
      }
    }
  `);
  const realSpawn = childProcess.spawn;
  const chunks = { stdout: [], stderr: [] };
  t.mock.method(childProcess, 'spawn', (...args) => {
    const child = realSpawn(...args); // Real process and OS pipes, no synthetic data events.
    for (const name of ['stdout', 'stderr']) child[name].on('data', data => {
      chunks[name].push(data.length);
      writeFileSync(join(f.root, name + '.ack'), String(chunks[name].length));
    });
    return child;
  });
  syncBuiltinESMExports();
  let result;
  try {
    result = await captureAgy(process.execPath, [script, JSON.stringify({ stdout: stdoutText, stderr: stderrText }), f.root],
      { cwd: f.root, env: cleanEnv({ PATH: '/usr/bin:/bin' }), timeoutMs: 10000 });
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
  }
  assert.equal(result.outcome, 'success');
  for (const name of ['stdout', 'stderr']) assert.ok(chunks[name].length > 10 && chunks[name].every(n => n === 1), name);
  assert.deepEqual({ stdout: result.stdout, stderr: result.stderr }, { stdout: stdoutText, stderr: stderrText });
});


test('captureAgy flushes incomplete final bytes on each pipe at close', async t => {
  const f = await fixture(t);
  const result = await captureAgy(process.execPath, ['-e', "process.stdout.write(Buffer.from([0xe2, 0x82])); process.stderr.write(Buffer.from([0xf0, 0x9f, 0x9a]));"],
    { cwd: f.root, env: cleanEnv({ PATH: '/usr/bin:/bin' }), timeoutMs: 10000 });
  assert.equal(result.outcome, 'success');
  assert.equal(result.stdout, '\ufffd'); assert.equal(result.stderr, '\ufffd');
});

test('captureAgy retains the shared raw-byte cap across stdout and stderr', async t => {
  const f = await fixture(t);
  const result = await captureAgy(process.execPath, ['-e', "process.stdout.write(Buffer.alloc(1024 * 1024, 65), () => process.stderr.write(Buffer.alloc(1024 * 1024 + 65536, 66)));"],
    { cwd: f.root, env: cleanEnv({ PATH: '/usr/bin:/bin' }), timeoutMs: 10000 });
  assert.equal(result.outcome, 'failure'); assert.equal(result.stopped, 'output-limit');
  assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 2 * 1024 * 1024);
  assert.ok(result.stdout.length > 0 && result.stderr.length > 0);
});

test('exact catalog progress permits selection and retains truthful diagnostic metadata', async t => {
  for (const stderr of ['Fetching available models...\n', '']) {
    const f = await fixture(t), execute = f.deps.execute;
    f.deps.execute = async (...args) => { const r = await execute(...args); return args[1][0] === 'models' ? { ...r, stderr } : r; };
    assert.equal((await runAgyReview(f.options, f.deps)).ok, true);
    assert.equal(f.calls.length, 2);
    const receipt = JSON.parse(await readFile(join(f.receipts, 'catalog.json'), 'utf8'));
    assert.equal(receipt.diagnosticPresent, stderr !== '');
    assert.equal(receipt.diagnosticClass, stderr === '' ? 'none' : 'catalog-progress');
    assert.deepEqual(receipt.available, AGY_REVIEW_MODELS);
  }
});

test('catalog progress exception rejects siblings additions denials and failed commands', async t => {
  for (const [stderr, outcome] of [
    ['Fetching available models...', 'success'], ['Fetching available models...\r\n', 'success'],
    [' Fetching available models...\n', 'success'], ['Fetching available models...\n\n', 'success'],
    ['Acme unknown progress\n', 'success'], ['permission denied\n', 'success'],
    ['Fetching available models...\npermission denied\n', 'success'],
    ['Fetching available models...\nAcme additional diagnostic\n', 'success'],
    ['Fetching available models...\n', 'failure'],
  ]) {
    const f = await fixture(t);
    f.deps.execute = async (...args) => { f.calls.push(args); return { ...catalog, stderr, outcome }; };
    assert.equal((await runAgyReview(f.options, f.deps)).ok, false);
    assert.equal(f.calls.length, 1);
    const receipt = JSON.parse(await readFile(join(f.receipts, 'catalog.json'), 'utf8'));
    assert.equal(receipt.diagnosticPresent, true);
    assert.equal(receipt.diagnosticClass, stderr === 'Fetching available models...\n' ? 'catalog-progress' : 'unrecognized');
    assert.deepEqual(receipt.available, []);
    await assert.rejects(stat(join(f.receipts, 'generation-intent.json')), { code: 'ENOENT' });
  }
});

test('known catalog progress on generation stderr remains blocked', async t => {
  const f = await fixture(t), execute = f.deps.execute;
  f.deps.execute = async (...args) => { const r = await execute(...args); return { ...r, stderr: 'Fetching available models...\n' }; };
  const result = await runAgyReview(f.options, f.deps);
  assert.equal(f.calls.length, 2);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'denial-or-missing-coverage');
  assert.equal(JSON.parse(await readFile(join(f.receipts, 'generation-result.json'), 'utf8')).diagnosticPresent, true);
});
