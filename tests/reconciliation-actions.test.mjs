import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accessConfig, observer, identity, envelope, validateEnvelope, digest, consume } from '../practices/reconciliation/files/scripts/plates/reconcile-actions.mjs';
import { reconcile } from '../practices/reconciliation/files/scripts/plates/reconcile.mjs';
import { shapeReconciliation } from '../lib/reconcile-workflows.mjs';
import { MEASURES } from '../practices/night/files/scripts/plates/improve.mjs';
const sha = 'a'.repeat(40);
const env = { GITHUB_REPOSITORY: 'acme/app', GITHUB_REPOSITORY_ID: '12', GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha, GITHUB_REF: 'refs/heads/main', PLATES_RECONCILE_DEFAULT_BRANCH: 'main', GITHUB_EVENT_NAME: 'schedule', GITHUB_RUN_ID: '34', GITHUB_RUN_ATTEMPT: '2', GITHUB_WORKFLOW_REF: 'acme/app/.github/workflows/plates-night.yml@refs/heads/main' };
const config = { practices: ['reconciliation', 'night'], reconciliation: { githubAccess: { enabled: true, repositories: ['acme/app', 'acme/records'] } } };
const fact = { state: 'closed', draft: false, merged_at: '2026-01-01T00:00:00Z', merge_commit_sha: sha, head: { sha }, base: { sha: 'b'.repeat(40) } };
test('credential routes only to fixed adapter child for exact allowlist; overrides absent', async () => {
  const calls = [], access = accessConfig(config);
  const observe = observer(access, 'Acme-private-token', 'Acme-default-token', async (...args) => { calls.push(args); return { stdout: JSON.stringify(fact) }; });
  await observe('acme/records#12'); await observe('acme/public#13');
  assert.equal(calls[0][0], process.execPath);
  assert.match(calls[0][1][0], /reconcile-actions\.mjs$/);
  assert.deepEqual(calls[0][1].slice(1), ['--pull', 'acme/records#12']);
  assert.deepEqual(calls[0][2].env, { PLATES_RECONCILE_API_TOKEN: 'Acme-private-token' });
  assert.deepEqual(calls[1][2].env, { PLATES_RECONCILE_API_TOKEN: 'Acme-default-token' });
  assert.ok(!JSON.stringify(calls.map(x => x.slice(0, 2))).includes('token'));
  await assert.rejects(observe('acme/records#12/../../secrets'));
  await assert.rejects(observe('../records#12'));
  await assert.rejects(observe('acme/..#12'));
});
test('missing credential never falls back for allowlisted repos; child errors sanitized', async () => {
  let called = false;
  await assert.rejects(observer(accessConfig(config), '', 'Acme-default', async () => { called = true; })('acme/records#1'), /unavailable/);
  assert.equal(called, false);
  await assert.rejects(observer(accessConfig(config), 'Acme-secret', '', async () => { throw Error('Acme-secret raw stderr headers body'); })('acme/app#1'), e => e.message === 'GitHub PR observation unavailable');
});
test('configuration is optional, exact and has no arbitrary secret name', () => {
  assert.equal(accessConfig({}), null);
  for (const githubAccess of [{ enabled: true, repositories: [] }, { enabled: true, repositories: ['acme/*'] }, { enabled: true, repositories: ['acme/app'], secret: 'OTHER' }]) assert.throws(() => accessConfig({ reconciliation: { githubAccess } }));
});
test('only actual default source event/ref/workflow and revision identify producer', () => {
  assert.equal(identity(env).sha, sha);
  for (const patch of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_WORKFLOW_SHA: 'b'.repeat(40) }, { GITHUB_REPOSITORY_ID: '' }, { GITHUB_WORKFLOW_REF: 'acme/app/.github/workflows/other.yml@refs/heads/main' }]) assert.throws(() => identity({ ...env, ...patch }));
});
function fixtureEnvelope() {
  const local = { snapshot: { config_hash: 'c', inventory: ['docs/phases/01.md'], blobs: { 'docs/phases/01.md': 'd' } } };
  const result = { ...structuredClone(local), findings: [], unknown: [], notes: [], proposals: [] };
  result.snapshot.remote = 'observed'; result.snapshot.prs = { 'acme/app#1': { ...fact, head: sha, base: 'b'.repeat(40) } };
  const runtime = { 'scripts/plates/reconcile.mjs': 'e' }, id = identity(env), now = Date.parse('2026-01-02T00:00:00Z');
  const value = envelope(result, id, runtime, now), bytes = Buffer.from(JSON.stringify(value));
  return { value, options: { bytes, expectedDigest: digest(bytes), id, runtime, local, now } };
}
test('existing normalized result is immutable and head/base SHA survive transport', async () => {
  const { value, options } = fixtureEnvelope(); const facts = await validateEnvelope(value, options);
  assert.equal(facts.snapshot.prs['acme/app#1'].head, sha);
  assert.equal(facts.snapshot.prs['acme/app#1'].base, 'b'.repeat(40));
  assert.throws(() => { facts.unknown.push({}); }, TypeError);
});
for (const field of ['repository', 'repositoryId', 'sha', 'ref', 'event', 'defaultBranch', 'run', 'attempt', 'workflow', 'workflowSha']) test(`reject envelope with mismatched ${field}`, async () => {
  const { value, options } = fixtureEnvelope(); options.id = { ...options.id, [field]: 'different' };
  await assert.rejects(validateEnvelope(value, options));
});
for (const mutation of ['digest', 'runtime', 'stale', 'future', 'config', 'added', 'deleted', 'changed']) test(`reject ${mutation} source evidence`, async () => {
  const { value, options } = fixtureEnvelope();
  if (mutation === 'digest') options.expectedDigest = 'f'.repeat(64);
  if (mutation === 'runtime') options.runtime = {};
  if (mutation === 'stale') options.now += 86400001;
  if (mutation === 'future') options.now--;
  if (mutation === 'config') options.local.snapshot.config_hash = 'different';
  if (mutation === 'added') options.local.snapshot.inventory.push('docs/phases/02.md');
  if (mutation === 'deleted') options.local.snapshot.inventory = [];
  if (mutation === 'changed') options.local.snapshot.blobs['docs/phases/01.md'] = 'changed';
  await assert.rejects(validateEnvelope(value, options));
});
test('missing producer/artifact yields unknown report, without live fallback', async () => {
  const facts = await consume({ root: '/nonexistent-acme', env }); assert.equal(facts.unknown.length, 1);
  const measure = MEASURES.find(x => x.id === 'record_contradictions');
  await assert.rejects(measure.run({ root: '/nonexistent-acme', config, env: { ...env, PLATES_RECONCILE_REQUIRED: '1' }, plates: { reconcile: () => assert.fail('live fallback'), reconcileSnapshot: async () => facts } }), e => e.facts === facts && /incomplete/.test(e.message));
});
test('engine adapter retains normalized revisions and sanitizes failures before error.message', async t => {
  const root = await mkdtemp(join(tmpdir(), 'acme-reconcile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.plates')); await mkdir(join(root, 'docs/phases'), { recursive: true });
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ repo: 'acme/app' }));
  await writeFile(join(root, 'docs/phases/01.md'), '# Acme\n\nPR #1\n');
  const result = await reconcile({ root, github: true, observePR: async () => fact });
  assert.equal(result.snapshot.prs['acme/app#1'].head, sha);
  assert.equal(result.snapshot.prs['acme/app#1'].base, 'b'.repeat(40));
  const bad = await reconcile({ root, github: true, observePR: async () => { throw Error('Acme-private-token stderr'); } });
  assert.equal(bad.snapshot.remote, 'incomplete'); assert.ok(!JSON.stringify(bad).includes('Acme-private-token'));
});
test('render isolates secret in trusted producer; consumer runs on producer failure; optional unchanged', async () => {
  for (const night of [false, true]) {
    const path = night ? 'night/files/.github/workflows/plates-night.yml' : 'ci/files/.github/workflows/check.yml';
    const template = await readFile(new URL('../practices/' + path, import.meta.url), 'utf8');
    assert.equal(shapeReconciliation(template, {} , night), template);
    const rendered = shapeReconciliation(template, config, night), producer = rendered.split('  reconciliation:\n')[1].split(night ? '  night:\n' : '  check:\n')[0];
    assert.equal((rendered.match(/secrets\.PLATES_RECONCILE_TOKEN/g) ?? []).length, 1);
    assert.match(producer, /producer_attempt: \$\{\{ steps.observe.outputs.producer_attempt \}\}/);
    assert.match(producer, /github\.ref == format/); assert.match(producer, /persist-credentials: false/);
    assert.match(producer, /ref: \$\{\{ github.sha \}\}/); assert.doesNotMatch(producer, /npm|gate\.mjs|setupToken|node-version-file/);
    if (night) {
      assert.match(rendered, /needs: \[reconciliation\]\n    if: \$\{\{ !cancelled\(\) \}\}/);
      assert.ok(rendered.indexOf('Restore trusted reconciliation') < rendered.indexOf('Read the config'));
      assert.match(rendered, /PLATES_RECONCILE_REQUIRED: "1"/);
      assert.equal((rendered.match(/PLATES_RECONCILE_PRODUCER_ATTEMPT: \$\{\{ needs.reconciliation.outputs.producer_attempt \}\}/g) ?? []).length, 2);
    } else { assert.doesNotMatch(rendered.split('  check:\n')[1], /reconcile\.mjs --github/); }
  }
});
test('upload action bare digest is explicitly adapted to REST sha256 representation', async () => {
  const template = await readFile(new URL('../practices/night/files/.github/workflows/plates-night.yml', import.meta.url), 'utf8');
  const workflow = shapeReconciliation(template, config, true);
  assert.match(workflow, /artifact_digest: \$\{\{ steps.archive.outputs.artifact-digest \}\}/);
  assert.equal((workflow.match(/PLATES_RECONCILE_ARTIFACT_DIGEST: sha256:\$\{\{ needs.reconciliation.outputs.artifact_digest \}\}/g) ?? []).length, 2);
  const actionOutput = '0'.repeat(64);
  assert.equal(`sha256:${actionOutput}`, 'sha256:' + '0'.repeat(64));
});

for (const producerAttempt of ['1', '2']) test(`real ZIP transport binds producer ${producerAttempt} to consumer 2 and rejects forged reruns`, async t => {
  const { restore } = await import('../practices/reconciliation/files/scripts/plates/reconcile-actions.mjs');
  const { run } = await import('./helpers/run.mjs');
  const { cp } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'acme-reconcile-transport-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['.plates', '.github/workflows', 'scripts/plates', 'docs/phases', 'transport']) await mkdir(join(root, path), { recursive: true });
  const paths = ['scripts/plates/reconcile-actions.mjs', 'scripts/plates/reconcile.mjs', 'scripts/plates/names.mjs'];
  for (const path of paths) await cp(new URL(`../practices/${path.endsWith('/names.mjs') ? 'night' : 'reconciliation'}/files/${path}`, import.meta.url), join(root, path));
  const workflow = '.github/workflows/plates-night.yml'; paths.push(workflow);
  await writeFile(join(root, workflow), 'name: Acme\n');
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ repo: 'acme/app', reconciliation: config.reconciliation }));
  await writeFile(join(root, 'docs/phases/01.md'), '# Acme\n');
  for (const args of [['init'], ['add', '.'], ['commit', '-m', 'Acme source']]) assert.equal(run('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: root }).status, 0);
  const revision = run('git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], { cwd: root }).stdout.trim();
  const transportEnv = { ...env, PLATES_RECONCILE_PRODUCER_ATTEMPT: producerAttempt, GITHUB_SHA: revision, GITHUB_WORKFLOW_SHA: revision, RUNNER_TEMP: join(root, 'transport'), PLATES_RECONCILE_ARTIFACT_ID: '56', PLATES_RECONCILE_SNAPSHOT: join(root, 'transport/snapshot.json') };
  const output = join(root, 'transport/outputs');
  const produced = run(process.execPath, ['scripts/plates/reconcile-actions.mjs', '--produce'], { cwd: root,
    env: { ...process.env, ...transportEnv, GITHUB_RUN_ATTEMPT: producerAttempt, GITHUB_OUTPUT: output, GH_TOKEN: 'Acme-default-token', PLATES_RECONCILE_TOKEN: 'Acme-private-token' } });
  assert.equal(produced.status, 0, produced.stderr);
  const outputs = Object.fromEntries((await readFile(output, 'utf8')).trim().split('\n').map(line => line.split('=')));
  assert.equal(outputs.producer_attempt, producerAttempt, 'job output comes from the actual producer invocation');
  const bytes = await readFile(join(root, 'transport/result.json'), 'utf8');
  assert.equal(outputs.digest, digest(bytes));
  assert.equal(JSON.parse(bytes).identity.attempt, outputs.producer_attempt);
  assert.equal(run('/usr/bin/zip', ['-q', 'source.zip', 'result.json'], { cwd: join(root, 'transport') }).status, 0);
  const zip = await readFile(join(root, 'transport/source.zip'));
  const bareActionDigest = digest(zip);
  transportEnv.PLATES_RECONCILE_ARTIFACT_DIGEST = `sha256:${bareActionDigest}`;
  transportEnv.PLATES_RECONCILE_RESULT_DIGEST = digest(bytes);
  const runMetadata = { id: 34, run_attempt: 2, repository: { id: 12, full_name: 'acme/app' }, head_sha: revision, head_branch: 'main', event: 'schedule', path: workflow };
  const artifact = { id: 56, name: `plates-reconciliation-34-${producerAttempt}`, digest: `sha256:${bareActionDigest}`, expired: false, size_in_bytes: zip.length, workflow_run: { id: 34, head_sha: revision } };
  let mutation; const calls = [];
  const api = async path => {
    calls.push(path);
    if (path.endsWith('/zip')) return mutation === 'zip' ? Buffer.from('Acme damaged archive') : zip;
    const requestedAttempt = /^repos\/acme\/app\/actions\/runs\/34\/attempts\/([12])$/.exec(path)?.[1];
    if (requestedAttempt || path.endsWith('/runs/34')) return { ...runMetadata, run_attempt: Number(requestedAttempt ?? 2),
      ...(mutation === 'attempt' ? { run_attempt: 3 } : mutation === 'run' ? { id: 35 } : mutation === 'repo' ? { repository: { id: 99, full_name: 'acme/other' } } : mutation === 'source' ? { head_sha: 'f'.repeat(40) } : mutation === 'workflow' ? { path: '.github/workflows/other.yml' } : mutation === 'ref' ? { path: `${workflow}@other` } : mutation === 'qualified-path' ? { path: `${workflow}@main` } : {}) };
    assert.ok(path.endsWith('/artifacts/56'));
    return { ...artifact, ...(mutation === 'expired' ? { expired: true } : mutation === 'artifact' ? { id: 99 } : mutation === 'digest' ? { digest: 'sha256:' + 'f'.repeat(64) } : {}) };
  };
  await restore(root, transportEnv, api);
  const consumed = await consume({ root, env: transportEnv });
  assert.deepEqual(consumed.unknown, []);
  assert.equal(consumed.snapshot.actions.producer.attempt, producerAttempt);
  assert.equal(consumed.snapshot.actions.consumer.attempt, '2');
  assert.ok(Object.isFrozen(consumed.snapshot.actions.producer));
  assert.deepEqual(calls.filter(path => path.includes('/runs/')), [
    'repos/acme/app/actions/runs/34/attempts/2', ...(producerAttempt === '1' ? ['repos/acme/app/actions/runs/34/attempts/1'] : []),
  ]);
  const restored = await readFile(transportEnv.PLATES_RECONCILE_SNAPSHOT, 'utf8');
  const wrapper = JSON.parse(restored);
  assert.equal(wrapper.consumer.attempt, '2');
  assert.equal(JSON.parse(Buffer.from(wrapper.bytes, 'base64')).identity.attempt, producerAttempt);
  for (mutation of ['attempt', 'run', 'repo', 'source', 'workflow', 'ref', 'expired', 'artifact', 'digest', 'zip']) {
    await writeFile(transportEnv.PLATES_RECONCILE_SNAPSHOT, restored);
    await assert.rejects(restore(root, transportEnv, api), undefined, mutation);
    assert.equal((await consume({ root, env: transportEnv })).unknown.length, 1, `${mutation}: failed restore cannot reuse a previous wrapper`);
  }
  mutation = 'qualified-path'; await restore(root, transportEnv, api); mutation = undefined;
  for (const attempt of [undefined, '0', '3', '9007199254740992', producerAttempt === '1' ? '2' : '1']) {
    const forged = { ...transportEnv, PLATES_RECONCILE_PRODUCER_ATTEMPT: attempt };
    await assert.rejects(restore(root, forged, api));
    assert.equal((await consume({ root, env: forged })).unknown.length, 1);
  }
  await writeFile(transportEnv.PLATES_RECONCILE_SNAPSHOT, restored);
  for (const patch of [{ GITHUB_RUN_ATTEMPT: '3' }, { GITHUB_RUN_ID: '35' }, { GITHUB_REPOSITORY_ID: '13' }, { GITHUB_SHA: 'f'.repeat(40) }])
    assert.equal((await consume({ root, env: { ...transportEnv, ...patch } })).unknown.length, 1);
  for (const age of [-10000, 24 * 3600000 + 10000]) {
    const old = JSON.parse(bytes); old.observedAt = new Date(Date.now() - age).toISOString();
    const raw = JSON.stringify(old);
    await writeFile(transportEnv.PLATES_RECONCILE_SNAPSHOT, JSON.stringify({ ...wrapper, bytes: Buffer.from(raw).toString('base64') }));
    assert.equal((await consume({ root, env: { ...transportEnv, PLATES_RECONCILE_RESULT_DIGEST: digest(raw) } })).unknown.length, 1, 'original observation freshness is never reset at restore');
  }
  await writeFile(transportEnv.PLATES_RECONCILE_SNAPSHOT, restored);
  await writeFile(transportEnv.PLATES_RECONCILE_SNAPSHOT, JSON.stringify({ ...wrapper, consumer: { ...wrapper.consumer, attempt: '1' } }));
  assert.equal((await consume({ root, env: transportEnv })).unknown.length, 1, 'wrapper from another consumer attempt cannot be transplanted');
  await writeFile(transportEnv.PLATES_RECONCILE_SNAPSHOT, restored);
  await writeFile(join(root, 'docs/phases/02.md'), '# Added by setup\n');
  assert.equal((await consume({ root, env: transportEnv })).unknown.length, 1);
});
test('measure captures snapshot before any project command and cannot turn required coverage off', async () => {
  const { measure } = await import('../practices/night/files/scripts/plates/improve.mjs');
  const facts = (await validateEnvelope(...(() => { const f = fixtureEnvelope(); return [f.value, f.options]; })()));
  const order = [];
  const results = await measure({ root: '/Acme', config: {}, env: { PLATES_RECONCILE_REQUIRED: '1' },
    plates: { reconcile: () => assert.fail('live fallback'), reconcileSnapshot: async () => { order.push('snapshot'); return facts; } },
    measures: [{ id: 'Acme-project-command', run() { order.push('command'); return { value: 0 }; } }, MEASURES.find(x => x.id === 'record_contradictions')],
  });
  assert.deepEqual(order, ['snapshot', 'command']); assert.equal(results[1].state, 'ok');
});
test('names verifier supports the new runtime paths and exact configured workflow parity', async () => {
  const { supportedObservationSource, observationWorkflowBytes } = await import('../lib/names-verify.mjs');
  for (const path of ['lib/reconcile-workflows.mjs', 'practices/reconciliation/files/scripts/plates/reconcile-actions.mjs', 'scripts/plates/reconcile-actions.mjs']) assert.ok((await supportedObservationSource(path)).length > 0);
  const path = '.github/workflows/plates-night.yml';
  const { fill } = await import('../lib/practices.mjs');
  const template = await readFile(new URL('../practices/night/files/' + path, import.meta.url), 'utf8');
  assert.equal((await observationWorkflowBytes(path, config)).toString(), fill(template, config, path));
});
