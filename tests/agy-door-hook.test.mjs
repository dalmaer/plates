import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, readFile, readdir, rm, symlink, stat, writeFile, chmod, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './helpers/run.mjs';
import { observeHook, MAX_INPUT_BYTES, MAX_RECEIPTS } from '../lib/agy-door-hook.mjs';

async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'acme-agy-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'workspace'), state = join(base, 'state');
  await mkdir(root);
  const input = { conversationId: 'Acme-private-session', workspacePaths: [root], stepIdx: 3,
    toolCall: { id: 'Acme-private-call', name: 'write_file', args: { Path: join(root, 'private-file'), Content: 'Acme-secret-content', Overwrite: true } },
    lastUserInput: 'Acme-private-prompt', transcriptPath: '/Acme-private-transcript', modelName: 'Acme-private-model' };
  const observe = (value = input, event = 'PreToolUse', overrides = {}) => observeHook({ raw: JSON.stringify(value), root, state, event, ...overrides });
  const receipts = async () => Promise.all((await readdir(state)).filter(n => n.endsWith('.json')).map(n => readFile(join(state, n), 'utf8').then(JSON.parse)));
  return { base, root, state, input, observe, receipts };
}

test('native delegation and sanitized metadata preserve unknown recovery', async t => {
  const f = await fixture(t);
  const r = await f.observe();
  assert.deepEqual(r.protocol, { decision: 'allow' });
  assert.equal(r.status, 'recorded');
  const [receipt] = await f.receipts();
  assert.equal(receipt.door, 'unknown');
  assert.equal(receipt.outcome, 'execution-unobserved');
  assert.equal(receipt.authorizesExecution, false);
  assert.equal(receipt.coverage, 'described-file-change-recovery-unavailable');
  assert.match(receipt.inputDigest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(receipt), /Acme|private-file|workspace|auto_approve|permissionOverrides|overwrite/);
  assert.equal((await stat(f.state)).mode & 0o777, 0o700);
  assert.equal((await stat(join(f.state, `${receipt.identity}.json`))).mode & 0o777, 0o600);
});

test('supported aliases and shell remain unknown; message effect is one-way without granting', async t => {
  const f = await fixture(t);
  for (const name of ['read_file', 'edit_file', 'write_file', 'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'run_command', 'generate_image', 'invoke_subagent', 'Acme-private-unknown-tool']) {
    const input = structuredClone(f.input); input.toolCall.name = name;
    input.toolCall.args.CommandLine = 'npm test && send-private-data';
    input.toolCall.args.approved = true;
    assert.deepEqual((await f.observe(input)).protocol, { decision: 'allow' });
  }
  assert.ok((await f.receipts()).every(r => r.door === 'unknown' && r.authorizesExecution === false));
  const send = structuredClone(f.input);
  send.toolCall = { name: 'send_message', args: { Recipient: 'Acme-private-recipient', Message: 'Acme-private-message' } };
  await f.observe(send);
  const receipt = (await f.receipts()).find(r => r.tool === 'send_message');
  assert.equal(receipt.door, 'one-way');
  assert.equal(receipt.recommendation, 'ask-or-park');
  assert.doesNotMatch(JSON.stringify(await f.receipts()), /Acme/);
});

test('empty or different workspace scopes delegate without storage or Cwd inference', async t => {
  const f = await fixture(t);
  for (const workspaces of [[], [f.base]]) {
    const input = structuredClone(f.input); input.workspacePaths = workspaces;
    input.toolCall.args.Cwd = f.root;
    const r = await f.observe(input);
    assert.equal(r.status, 'outside-scope');
    assert.deepEqual(r.protocol, { decision: 'allow' });
  }
  await assert.rejects(stat(f.state), { code: 'ENOENT' });
});

test('configured root aliases and redirected roots never enroll another workspace', async t => {
  const f = await fixture(t);
  const alias = join(f.base, 'alias'); await symlink(f.root, alias);
  assert.equal((await f.observe(f.input, 'PreToolUse', { root: alias })).status, 'unavailable');
  assert.equal((await f.observe(f.input, 'PreToolUse', { root: `${f.root}/../workspace` })).status, 'unavailable');
  const moved = join(f.base, 'moved'); await rename(f.root, moved); await symlink(moved, f.root);
  const input = structuredClone(f.input); input.workspacePaths = [moved];
  const r = await f.observe(input);
  assert.equal(r.status, 'unavailable'); assert.deepEqual(r.protocol, { decision: 'allow' });
  await assert.rejects(stat(f.state), { code: 'ENOENT' });
});

test('canonical input digests deduplicate reordered arguments and retain changed input separately', async t => {
  const f = await fixture(t);
  await f.observe();
  const reordered = structuredClone(f.input);
  reordered.toolCall.args = { Overwrite: true, Content: 'Acme-secret-content', Path: f.input.toolCall.args.Path };
  assert.equal((await f.observe(reordered)).status, 'duplicate');
  const results = await Promise.all(Array.from({ length: 12 }, () => f.observe()));
  assert.ok(results.every(r => ['duplicate', 'unavailable'].includes(r.status)));
  assert.equal((await f.receipts()).length, 1);
  reordered.toolCall.args.Content = 'Acme-changed-content';
  await f.observe(reordered);
  assert.equal((await f.receipts()).length, 2);
  assert.equal(new Set((await f.receipts()).map(r => r.inputDigest)).size, 2);
});

test('concurrent first writes publish at most one complete receipt', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 12 }, () => f.observe()));
  assert.equal(results.filter(r => r.status === 'recorded').length, 1);
  assert.equal((await f.receipts()).length, 1);
  assert.deepEqual((await readdir(f.state)).filter(n => !n.endsWith('.json')), []);
});

test('Post observations never imply success or approval; conflicts preserve originals', async t => {
  const f = await fixture(t);
  await f.observe(); // No Post yet: do not manufacture a completed operation.
  assert.equal((await f.receipts())[0].outcome, 'execution-unobserved');
  assert.deepEqual((await f.observe(f.input, 'PostToolUse')).protocol, {});
  let receipts = await f.receipts();
  assert.equal(receipts.length, 2);
  assert.equal(receipts.find(r => r.event === 'PostToolUse').outcome, 'observed-completion');
  const failed = { ...f.input, error: 'Acme-private-error-secret' };
  assert.equal((await f.observe(failed, 'PostToolUse')).status, 'unavailable');
  assert.deepEqual(await f.receipts(), receipts);
  failed.stepIdx++;
  await f.observe(failed, 'PostToolUse');
  receipts = await f.receipts();
  assert.ok(receipts.some(r => r.outcome === 'reported-error'));
  assert.ok(receipts.every(r => r.authorizesExecution === false));
  assert.doesNotMatch(JSON.stringify(receipts), /Acme-private-error-secret|success|approval/);
});

test('unsafe storage including symlinks and workspace nesting only disables observation', async t => {
  const f = await fixture(t);
  const other = join(f.base, 'other'); await mkdir(other, { mode: 0o700 });
  await symlink(other, f.state);
  assert.equal((await f.observe()).status, 'unavailable');
  assert.deepEqual(await readdir(other), []);
  await rm(f.state); await mkdir(f.state, { mode: 0o755 }); await chmod(f.state, 0o755);
  assert.equal((await f.observe()).status, 'unavailable');
  await rm(f.state, { recursive: true });
  for (const state of [join(f.root, 'state'), join(f.base, 'link-parent', 'state')]) {
    if (state.includes('link-parent')) await symlink(other, join(f.base, 'link-parent'));
    const r = await f.observe(f.input, 'PreToolUse', { state });
    assert.equal(r.status, 'unavailable'); assert.deepEqual(r.protocol, { decision: 'allow' });
  }
  const input = { ...f.input, workspacePaths: [f.root, f.base] };
  assert.equal((await f.observe(input)).status, 'unavailable');
});

test('bounded receipt count and unsafe receipt entries retain existing bytes', async t => {
  const f = await fixture(t); await f.observe();
  const [receipt] = await f.receipts();
  const target = join(f.state, `${receipt.identity}.json`), original = await readFile(target, 'utf8');
  await rm(target); await symlink(join(f.base, 'untouched'), target);
  assert.equal((await f.observe()).status, 'unavailable');
  await rm(target); await writeFile(target, original, { mode: 0o600 });
  for (let i = 0; i < MAX_RECEIPTS - 1; i++) await writeFile(join(f.state, `${i.toString(16).padStart(64, '0')}.json`), '{}', { mode: 0o600 });
  const changed = structuredClone(f.input); changed.stepIdx++;
  assert.equal((await f.observe(changed)).status, 'unavailable');
  assert.equal(await readFile(target, 'utf8'), original);
  assert.equal((await readdir(f.state)).length, MAX_RECEIPTS);
});

test('CLI malformed or oversized input delegates with sanitized diagnostics and no receipts', async t => {
  const f = await fixture(t);
  const cli = (body, event = 'PreToolUse') => run(process.execPath, ['scripts/agy-door-hook.mjs', '--event', event, '--root', f.root, '--state', f.state], { input: body });
  const bad = ['{"Acme-secret":broken}', 'x'.repeat(MAX_INPUT_BYTES + 1), JSON.stringify({ ...f.input, stepIdx: '3' }), JSON.stringify({ ...f.input, toolCall: { name: 'run_command', args: [] } })];
  for (const body of bad) {
    const r = cli(body);
    assert.deepEqual(JSON.parse(r.stdout), { decision: 'allow' });
    assert.match(r.stderr, /Malformed|oversized/);
    assert.doesNotMatch(r.stderr + r.stdout, /Acme-secret/);
  }
  assert.deepEqual(JSON.parse(cli('{broken', 'PostToolUse').stdout), {});
  await assert.rejects(stat(f.state), { code: 'ENOENT' });
  const good = cli(JSON.stringify(f.input));
  assert.equal(good.status, 0);
  assert.deepEqual(JSON.parse(good.stdout), { decision: 'allow' });
  assert.deepEqual(JSON.parse(cli(JSON.stringify({ ...f.input, error: 'Acme-secret-error' }), 'PostToolUse').stdout), {});
});


test('invalid configuration refuses observation while preserving Pre and Post delegation', async t => {
  const f = await fixture(t);
  for (const event of ['PreToolUse', 'PostToolUse']) {
    const expected = event === 'PreToolUse' ? { decision: 'allow' } : {};
    const result = await f.observe(f.input, event, { root: 'relative' });
    assert.equal(result.status, 'malformed');
    assert.deepEqual(result.protocol, expected);
    assert.equal(result.diagnostic, 'Invalid observer configuration.');
    for (const extra of [['--root', 'relative'], ['--unknown', 'Acme-private-config']]) {
      const r = run(process.execPath, ['scripts/agy-door-hook.mjs', '--event', event, '--state', f.state, ...extra], { input: JSON.stringify(f.input) });
      assert.deepEqual(JSON.parse(r.stdout), expected);
      assert.doesNotMatch(r.stderr + r.stdout, /Acme-private/);
      assert.ok(r.stderr.length > 0);
    }
  }
  await assert.rejects(stat(f.state), { code: 'ENOENT' });
});
