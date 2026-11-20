import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileActionPins } from '../scripts/workflow-action-pins.mjs';
import { WORKFLOW_ACTIONS } from '../lib/telemetry.mjs';
import { run } from './helpers/run.mjs';
import { runBlocks } from './helpers/workflows.mjs';

const script = fileURLToPath(new URL('../scripts/workflow-action-pins.mjs', import.meta.url));
const stale = pin => pin.replace(/@[0-9a-f]{40}/, '@0000000000000000000000000000000000000000');
const yaml = pin => `      - uses: ${pin}\n`;

test('a workflow-only update cannot select a different same-major action pin', () => {
  const other = '      - uses: ./local # unchanged\n      - uses: acme/example@deadbeef # not in the registry\n';
  const expected = WORKFLOW_ACTIONS.claudeCode;
  const result = reconcileActionPins(other + yaml(stale(expected)));
  assert.deepEqual(result.differences, [{ line: 3, expected }]);
  assert.equal(result.content, other + yaml(expected));
  assert.deepEqual(reconcileActionPins(result.content), { content: result.content, differences: [] });
});

test('the canonical version label and SHA must match even when a use is quoted', () => {
  const expected = WORKFLOW_ACTIONS.codex;
  const ref = expected.split(' # ')[0];
  const result = reconcileActionPins(yaml(`"${ref}" # not-the-version`));
  assert.deepEqual(result.differences, [{ line: 1, expected }]);
  assert.equal(result.content, yaml(expected));
});

test('the preflight refuses stale Claude and Codex pins in templates and rendered workflow copies', async t => {
  const root = await mkdtemp(join(tmpdir(), 'plates-ci-pins-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const templateDir = join(root, 'practices/sample/files/.github/workflows');
  const renderedDir = join(root, '.github/workflows');
  await Promise.all([mkdir(templateDir, { recursive: true }), mkdir(renderedDir, { recursive: true })]);
  const template = join(templateDir, 'sample.yml');
  const rendered = join(renderedDir, 'sample.yml');
  const claude = WORKFLOW_ACTIONS.claudeCode;
  const codex = WORKFLOW_ACTIONS.codex;
  const good = yaml(claude) + yaml(codex);
  const badTemplate = yaml(stale(claude)) + yaml(codex);
  const badRendered = yaml(claude) + yaml(stale(codex));
  await Promise.all([writeFile(template, badTemplate), writeFile(rendered, badRendered)]);
  const cli = mode => run(process.execPath, [script, mode], { cwd: root, timeout: 10_000 });
  const rejected = cli('--check');
  assert.equal(rejected.status, 1, rejected.stderr);
  assert.ok(rejected.stderr.includes(`practices/sample/files/.github/workflows/sample.yml:1: expected ${claude}`));
  assert.ok(rejected.stderr.includes(`.github/workflows/sample.yml:2: expected ${codex}`));
  assert.equal(await readFile(template, 'utf8'), badTemplate);
  assert.equal(await readFile(rendered, 'utf8'), badRendered);

  const synced = cli('--sync-templates');
  assert.equal(synced.status, 0, synced.stderr);
  assert.equal(await readFile(template, 'utf8'), good);
  assert.equal(await readFile(rendered, 'utf8'), badRendered);
  await writeFile(rendered, good);
  const accepted = cli('--check');
  assert.equal(accepted.status, 0, accepted.stderr);
});

test('the checked-in workflow templates and rendered workflows agree with the canonical action pins', () => {
  const checked = run(process.execPath, [script, '--check'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), timeout: 10_000,
  });
  assert.equal(checked.status, 0, checked.stderr);
});

test('the rendered preflight runs for relevant changes and missing refs, but skips a verified irrelevant diff', async t => {
  const root = await mkdtemp(join(tmpdir(), 'plates-ci-pin-diff-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = run('git', args, { cwd: root, timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  git('commit', '--allow-empty', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  await writeFile(join(root, 'README.md'), 'Only text.\n');
  git('add', 'README.md');
  git('commit', '-qm', 'irrelevant');
  const docs = git('rev-parse', 'HEAD');
  const template = 'practices/acme/files/.github/workflows';
  await mkdir(join(root, template), { recursive: true });
  await writeFile(join(root, template, 'check.yml'), yaml(WORKFLOW_ACTIONS.codex));
  git('add', template);
  git('commit', '-qm', 'workflow');
  const relevant = git('rev-parse', 'HEAD');

  const workflow = await readFile(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
  const body = runBlocks(workflow).find(block => block.step === 'Check source workflow pins and contracts')?.script;
  assert.ok(body);
  // Run Git for real, but capture the preflight calls rather than executing the suite in the fixture.
  const commands = 'node() { printf "node %s\\n" "$1"; }\nnpm() { printf "npm %s %s\\n" "$1" "$2"; }\n';
  const preflight = (base, head) => run('bash', ['-e', '-o', 'pipefail', '-c', commands + body], {
    cwd: root, timeout: 10_000, env: { ...process.env, WORKFLOW_BASE: base, WORKFLOW_HEAD: head },
  });
  const skipped = preflight(base, docs);
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.equal(skipped.stdout, '');
  for (const [from, to] of [[docs, relevant], ['', docs], ['0'.repeat(40), docs], [base, '']]) {
    const checked = preflight(from, to);
    assert.equal(checked.status, 0, checked.stderr);
    assert.deepEqual(checked.stdout.trim().split('\n'), ['node scripts/workflow-action-pins.mjs', 'npm run render:check', 'node --import']);
  }
});
