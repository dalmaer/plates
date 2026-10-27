import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './helpers/run.mjs';
import { pathToFileURL } from 'node:url';
import { agentGitArgs } from '../practices/night/files/scripts/plates/lib.mjs';
import { PROJECT, shapePublish, PUBLISH_GATE } from '../lib/practices.mjs';

for (const alias of ['PLATES_AGENT_GIT', 'KEEL_AGENT_GIT']) test(`phase128 agent Git ${alias} selects only a valid local Git directory`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'plates-runtime-agent-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.plates/agent-git'), { recursive: true });
  await writeFile(join(root, '.plates/agent-git/HEAD'), 'ref: refs/heads/main\n');
  assert.deepEqual(agentGitArgs(root, { [alias]: '.plates/agent-git' }), [`--git-dir=${join(root, '.plates/agent-git')}`, `--work-tree=${root}`]);
  assert.deepEqual(agentGitArgs(root, { KEEL_AGENT_GIT: '.plates/agent-git', PLATES_AGENT_GIT: '' }), []);
  assert.deepEqual(agentGitArgs(root, { KEEL_AGENT_GIT: '.plates/agent-git', PLATES_AGENT_GIT: '../outside' }), []);
});
for (const namespace of ['plates', 'keel']) test(`phase128 project symbol ${namespace} actually shapes the publisher`, () => {
  const config = { [Symbol.for(`${namespace}.project`)]: { gateName: 'Acme acceptance' } };
  assert.match(shapePublish(PUBLISH_GATE, config), /Acme acceptance/);
  assert.equal(Symbol.keyFor(PROJECT), 'plates.project');
  const both = { ...config, [Symbol.for('plates.project')]: { gateName: 'Current acceptance' } };
  assert.match(shapePublish(PUBLISH_GATE, both), /Current acceptance/);
});
for (const alias of ['PLATES_GH', 'KEEL_GH']) test(`phase128 GitHub ${alias} executes the selected transport`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'plates-runtime-gh-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'gh-acme');
  await writeFile(bin, `#!${process.execPath}\nprocess.stdout.write('HTTP/2 200 OK\\r\\ncontent-type: application/json\\r\\n\\r\\n{"id":7}');\n`, { mode: 0o755 });
  const module = pathToFileURL(resolve('practices/night/files/scripts/plates/robot-delivery.mjs')).href;
  const code = `const {robotGithub}=await import(${JSON.stringify(module)});const r=await robotGithub({path:'/repos/acme/anvils'});if(r.data.id!==7)throw Error('wrong transport');`;
  const env = { ...process.env, PATH: root }; delete env.PLATES_GH; delete env.KEEL_GH; env[alias] = bin;
  const selected = run(process.execPath, ['--input-type=module', '-e', code], { env });
  assert.equal(selected.status, 0, `selected GitHub alias must execute the real adapter: ${selected.stderr}`);
  const invalidCurrent = run(process.execPath, ['--input-type=module', '-e', code], { env: { ...env, KEEL_GH: bin, PLATES_GH: '' } });
  assert.notEqual(invalidCurrent.status, 0, 'invalid current transport must not fall back to legacy');
});
test('phase128 importing night helpers does not activate uncatalogued or held environment aliases', () => {
  const module = pathToFileURL(resolve('practices/night/files/scripts/plates/lib.mjs')).href;
  const env = { ...process.env, KEEL_ACME_UNLISTED: 'unapproved' }; delete env.PLATES_ACME_UNLISTED;
  const output = run(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(module)}); console.log(Object.hasOwn(process.env,'PLATES_ACME_UNLISTED'));`], { env });
  assert.equal(output.status, 0, output.stderr);
  assert.equal(output.stdout.trim(), 'false');
});
