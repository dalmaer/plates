import './helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './helpers/run.mjs';

// Only synthetic values enter the controller. The fake client records booleans,
// never environment values or argv, and cannot invoke Docker or a provider.
const canaries = Object.fromEntries([
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_RUNTIME_TOKEN',
  'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'ACME_PRIVATE_CREDENTIAL',
].map((key, i) => [key, `acme-synthetic-credential-${i}-only`]));
const image = 'sha256:' + 'a'.repeat(64), containerId = 'b'.repeat(64);
const adapter = new URL('../lib/evaluation-docker.mjs', import.meta.url).href;

async function fixture(t, inheritedCredential = false) {
  const root = await mkdtemp(join(tmpdir(), 'acme-evaluation-credentials-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const observations = join(root, 'observations.jsonl');
  const metadata = [{ Id: image, Os: 'linux', Architecture: 'arm64', Config: {
    Env: ['PATH=/usr/local/bin', 'NODE_VERSION=24.22.1',
      ...(inheritedCredential ? [`OPENAI_API_KEY=${canaries.OPENAI_API_KEY}`] : [])],
  } }];
  await writeFile(join(root, 'docker'), `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const canaries = ${JSON.stringify(canaries)};
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(observations)}, JSON.stringify({
  environment: Object.fromEntries(Object.entries(canaries).map(([key, value]) =>
    [key, Object.hasOwn(process.env, key) || Object.values(process.env).some(v => v.includes(value))])),
  arguments: Object.fromEntries(Object.entries(canaries).map(([key, value]) =>
    [key, args.some(v => v.includes(key) || v.includes(value))])),
  image: args[0] === 'image', create: args[0] === 'create',
  builder: args.includes('/work/acme-builder.mjs'),
}) + '\\n');
if (args[0] === 'image') console.log(JSON.stringify(${JSON.stringify(metadata)}));
else if (args[0] === 'create') console.log(${JSON.stringify(containerId)});
else if (args.includes('--version')) console.log('v24.22.1');
else if (args.includes('console.log(Date.now())')) console.log(Date.now());
else if (args[0] === 'inspect') console.log(args.includes('{{json .}}')
  ? JSON.stringify({ Id: ${JSON.stringify(containerId)}, State: { Running: false, Paused: false } }) : 'false');
else if (args.includes('/work/acme-builder.mjs')) console.log(JSON.stringify({ schemaVersion: 1, files: [] }));
else if (!['start', 'exec'].includes(args[0])) process.exitCode = 2;
`, { mode: 0o700 });
  return { root, observations, env: { PATH: root, HOME: root, ...canaries } };
}

function assertNoValues(text) {
  for (const value of Object.values(canaries)) assert.equal(text.includes(value), false, 'receipt reflected a synthetic credential');
}

test('evaluation Docker children and builder arguments exclude host credential canaries', async t => {
  const f = await fixture(t);
  const result = run(process.execPath, ['--input-type=module', '-e', `
    import { preflightDocker, runDockerStage } from ${JSON.stringify(adapter)};
    const image = await preflightDocker({ image: ${JSON.stringify(image)}, platform: 'linux/arm64' });
    const stage = await runDockerStage({ name: 'acme-credentials', image,
      files: [], argv: ['node', '/work/acme-builder.mjs'], submission: true,
      deadline: Date.now() + 10000 });
    console.log(JSON.stringify({ image, stage }));
  `], { env: f.env, timeout: 20000 });
  assertNoValues(result.stdout + result.stderr);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.stage.setup, 'passed');
  assert.equal(receipt.stage.execution, 'passed');
  assert.equal(receipt.stage.termination.state, 'terminated');
  const raw = await readFile(f.observations, 'utf8');
  assertNoValues(raw);
  const observed = raw.trim().split('\n').map(JSON.parse);
  for (const stage of ['image', 'create', 'builder']) assert.equal(observed.some(row => row[stage]), true, `${stage} must actually reach the fake client`);
  const absent = Object.fromEntries(Object.keys(canaries).map(key => [key, false]));
  for (const row of observed) {
    assert.deepEqual(row.environment, absent, 'Docker child observed a host credential');
    assert.deepEqual(row.arguments, absent, 'Docker arguments included a host credential');
  }
});

test('evaluation preflight refuses inherited image credentials without reflecting their values', async t => {
  const f = await fixture(t, true);
  const result = run(process.execPath, ['--input-type=module', '-e', `
    import { preflightDocker } from ${JSON.stringify(adapter)};
    try {
      await preflightDocker({ image: ${JSON.stringify(image)}, platform: 'linux/arm64' });
      console.log(JSON.stringify({ refused: false }));
    } catch (error) {
      console.log(JSON.stringify({ refused: true, message: error.message }));
    }
  `], { env: f.env, timeout: 15000 });
  assertNoValues(result.stdout + result.stderr);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { refused: true, message: 'evaluations: unsafe inherited image environment' });
  const raw = await readFile(f.observations, 'utf8');
  assertNoValues(raw);
  const observed = raw.trim().split('\n').map(JSON.parse);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].image, true);
  assert.equal(observed[0].create, false);
  assert.deepEqual(observed[0].environment, Object.fromEntries(Object.keys(canaries).map(key => [key, false])));
});
