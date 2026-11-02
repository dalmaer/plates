import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, readFile, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './helpers/run.mjs';
import { initializeWorkspace } from '../lib/web/workspace.mjs';
import { qualityLifecycle, emptyQualityPassport } from '../lib/agent-quality-lifecycle.mjs';
import { qualityOperation, qualitySourceOperation } from '../lib/agent-quality-ledger.mjs';
import { qualityRun } from '../lib/agent-quality-execution.mjs';
import { qualityBinding, qualityCheckpoint, observeQualityReview } from '../lib/agent-quality-observer.mjs';
import { fingerprint, byteDigest, sealRecord } from '../lib/evaluation-records.mjs';
import { review } from '../lib/review.mjs';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const git = (root, ...args) => { const r = run('git', ['-C', root, ...args]); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
async function world(t, at = new Date().toISOString()) {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'acme-quality-run-')));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = join(home, 'repo'), inputs = join(home, 'inputs'); await mkdir(root); await mkdir(inputs, { mode: 0o700 }); await mkdir(join(root, '.plates'));
  git(root, 'init', '-q', '-b', 'main'); git(root, 'remote', 'add', 'origin', 'https://github.com/Acme/widget.git');
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ repo: 'Acme/widget' }));
  await writeFile(join(root, 'answer.txt'), 'Acme original\n'); git(root, 'add', '.plates/plates.json', 'answer.txt'); git(root, 'commit', '-qm', 'Acme source');
  const options = { manifest: join(inputs, 'workspace.json'), state: join(home, 'state'), appRoot };
  await writeFile(options.manifest, JSON.stringify({ version: 1, id: 'acme', name: 'Acme', repo: 'Acme/private', projects: [{ id: 'widget', repo: 'Acme/widget' }] }), { mode: 0o600 });
  await initializeWorkspace(options);
  const begin = { schemaVersion: 1, id: 'acme-begin', action: 'begin', episodeId: 'acme-task', project: 'Acme/widget', at,
    payload: { links: ['Acme/widget#1'], workflow: 'acme-workflow', passport: { ...emptyQualityPassport(), baseCommit: git(root, 'rev-parse', 'HEAD') }, alreadyStarted: false } };
  const preview = await qualityLifecycle({ ...options, event: begin, now: at });
  await qualityLifecycle({ ...options, event: begin, now: at, yes: true, digest: preview.digest });
  const bindingFile = join(inputs, 'binding.json');
  const bindingRecord = { schemaVersion: 1, enabled: true, ...options, project: 'Acme/widget', episodeId: 'acme-task', repository: root, sources: ['command', 'review'] }; delete bindingRecord.appRoot;
  await writeFile(bindingFile, JSON.stringify(bindingRecord), { mode: 0o600 });
  const recordPath = join(inputs, 'command.json');
  const record = { schemaVersion: 1, id: 'acme-code', binding: bindingFile,
    command: { executable: process.execPath, args: ['-e', 'require("fs").writeFileSync("answer.txt","Acme changed\\n"); console.log("ACME-PRIVATE-OUTPUT")'], timeoutSeconds: 5 },
    stage: 'coding', agent: { provider: 'Acme', model: null }, parentId: null, inputCheckpointDigest: null, checkpointPaths: [] };
  const write = async () => writeFile(recordPath, JSON.stringify(record), { mode: 0o600 }); await write();
  const call = extra => qualityRun({ record: recordPath, appRoot, cwd: root, ...extra });
  const binding = () => qualityBinding({ path: bindingFile, root, source: 'command', appRoot });
  const inspect = () => qualityOperation({ ...options, action: 'inspect' });
  return { home, root, inputs, options, bindingFile, bindingRecord, recordPath, record, write, call, binding, inspect };
}

test('approved local command records live boundaries and exact dirty checkpoint without keeping command output', async t => {
  const w = await world(t), preview = await w.call();
  assert.equal(preview.preview, true); assert.equal(await readFile(join(w.root, 'answer.txt'), 'utf8'), 'Acme original\n');
  assert.ok(!JSON.stringify(preview).includes('ACME-PRIVATE-OUTPUT'));
  const result = await w.call({ yes: true, digest: preview.digest });
  assert.equal(result.status, 'completed'); assert.equal(result.result.lifecycle, 'observed');
  assert.equal(result.result.acceptance, 'unknown'); assert.equal(result.result.output, 'discarded');
  const e = (await w.inspect()).bundle.episodes[0], a = e.attempts[0];
  assert.equal(a.status, 'completed'); assert.equal(a.agent.model, null); assert.equal(a.resources.currencyUsd, null);
  assert.match(a.checkpointDigest, /^[a-f0-9]{64}$/); assert.ok(a.startedAt <= a.endedAt);
  assert.ok(!JSON.stringify(await w.inspect()).includes('ACME-PRIVATE-OUTPUT'));
  const beforeCommit = a.checkpointDigest; git(w.root, 'add', 'answer.txt'); git(w.root, 'commit', '-qm', 'Acme result');
  assert.equal((await qualityCheckpoint(await w.binding())).digest, beforeCommit, 'same content joins before and after conductor commit');
  const recovered = await w.call({ yes: true, digest: preview.digest });
  assert.equal(recovered.recovered, true); assert.equal(recovered.redispatched, false);
  assert.equal((await w.inspect()).bundle.episodes[0].attempts.length, 1);
});

test('snapshot reads only tracked changes and explicit untracked paths, preserving bytes and modes', async t => {
  const w = await world(t), binding = await w.binding();
  await writeFile(join(w.root, 'secret.txt'), 'ACME-UNLISTED-SECRET'); await chmod(join(w.root, 'secret.txt'), 0);
  const skipped = await qualityCheckpoint(binding); assert.equal(skipped.digest, null); assert.equal(skipped.omittedUntracked, 1);
  await chmod(join(w.root, 'secret.txt'), 0o600); await rm(join(w.root, 'secret.txt'));
  await writeFile(join(w.root, 'new.txt'), 'Acme new\n');
  await writeFile(join(w.root, 'answer.txt'), 'Acme trailing   \n');
  const first = await qualityCheckpoint(binding, ['new.txt']);
  await writeFile(join(w.root, 'answer.txt'), 'Acme trailing \n');
  assert.notEqual((await qualityCheckpoint(binding, ['new.txt'])).digest, first.digest);
  const before = await qualityCheckpoint(binding, ['new.txt']);
  git(w.root, 'add', 'answer.txt', 'new.txt'); git(w.root, 'commit', '-qm', 'Acme same bytes');
  assert.equal((await qualityCheckpoint(binding, ['new.txt'])).digest, before.digest);
});

test('stale preview and stale review input refuse before child dispatch', async t => {
  const w = await world(t), p = await w.call();
  await writeFile(join(w.root, 'answer.txt'), 'Acme other\n');
  await assert.rejects(w.call({ yes: true, digest: p.digest }), /stale/);
  const fresh = await w.call(); await w.call({ yes: true, digest: fresh.digest });
  const previous = (await w.inspect()).bundle.episodes[0].attempts[0];
  await writeFile(join(w.root, 'answer.txt'), 'Acme not reviewed\n');
  Object.assign(w.record, { id: 'acme-review', stage: 'review', parentId: previous.id, inputCheckpointDigest: previous.checkpointDigest }); await w.write();
  await assert.rejects(w.call(), /differs from the frozen/);
  assert.equal((await w.inspect()).bundle.episodes[0].attempts.length, 1);
});

test('the command child receives an allowlisted environment without parent credentials', async t => {
  const saved = { GH_TOKEN: process.env.GH_TOKEN, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
  t.after(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  process.env.GH_TOKEN = 'acme-gh-token'; process.env.OPENAI_API_KEY = 'acme-openai-key';
  const w = await world(t), out = join(w.inputs, 'env.json');
  w.record.command.args = ['-e', `require("fs").writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.env))`]; await w.write();
  const p = await w.call(), r = await w.call({ yes: true, digest: p.digest });
  assert.equal(r.status, 'completed');
  const env = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(env.GH_TOKEN, undefined); assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.PLATES_QUALITY_BINDING, w.bindingFile); assert.equal(env.PATH, process.env.PATH);
});

test('failed and timed-out commands remain attempts with unknown charges and no acceptance', async t => {
  for (const [id, code, expected] of [['acme-failed', 'process.exit(9)', 'failed'], ['acme-timeout', 'setInterval(()=>{},100)', 'timeout']]) {
    const w = await world(t); w.record.id = id; w.record.command.args = ['-e', code]; w.record.command.timeoutSeconds = 1; await w.write();
    const p = await w.call(), r = await w.call({ yes: true, digest: p.digest });
    assert.equal(r.status, expected); assert.equal(r.result.execution.groupTermination, 'confirmed');
    const e = (await w.inspect()).bundle.episodes[0]; assert.equal(e.attempts[0].status, expected); assert.equal(e.evaluations.length, 0);
  }
});

test('exact-head review metadata joins the recorded patch and retries without inferring the reviewer model', async t => {
  const w = await world(t), p = await w.call(); await w.call({ yes: true, digest: p.digest });
  git(w.root, 'add', 'answer.txt'); git(w.root, 'commit', '-qm', 'Acme reviewed result');
  const head = git(w.root, 'rev-parse', 'HEAD'), reviews = [{ reviewer: 'Acme-reviewer', commit: head, at: new Date().toISOString(), state: 'COMMENTED' }];
  const args = { root: w.root, env: { PLATES_QUALITY_BINDING: w.bindingFile }, repo: 'Acme/widget', number: 1, head, reviews };
  const first = await observeQualityReview(args); assert.equal(first.status, 'observed'); assert.equal(first.captured, 1);
  const second = await observeQualityReview(args); assert.equal(second.status, 'observed'); assert.equal(second.retained, 1);
  const e = (await w.inspect()).bundle.episodes[0], review = e.attempts.find(a => a.stage === 'review');
  assert.equal(review.inputCheckpointDigest, e.attempts[0].checkpointDigest); assert.equal(review.agent, null); assert.equal(review.resources.wallMs, null);
  assert.equal(review.checkpointDigest, null, 'review metadata is not a repository checkpoint');
  assert.match(review.metadataDigest, /^[a-f0-9]{64}$/); assert.notEqual(review.metadataDigest, review.inputCheckpointDigest);
  assert.equal(e.attempts[0].metadataDigest, undefined);
  assert.equal(e.evaluations.length, 0);
  assert.equal((await observeQualityReview({ ...args, reviews: [{ ...reviews[0], commit: 'a'.repeat(40) }] })).reason, 'no-review-at-exact-head');
  assert.equal((await observeQualityReview({ ...args, number: 2 })).reason, 'review-target-not-linked-to-episode');
  assert.equal((await w.inspect()).bundle.episodes[0].attempts.length, 2, 'same bytes in another PR do not join this task');
});

test('ordinary plates review observes only linked exact-head metadata and displays capture gaps', async t => {
  const w = await world(t), p = await w.call(); await w.call({ yes: true, digest: p.digest });
  git(w.root, 'add', 'answer.txt'); git(w.root, 'commit', '-qm', 'Acme reviewed result');
  const head = git(w.root, 'rev-parse', 'HEAD'), at = new Date().toISOString(), log = join(w.inputs, 'gh.log'), stub = join(w.inputs, 'gh');
  const pr = { number: 1, title: 'Acme review', url: 'https://github.com/Acme/widget/pull/1', state: 'OPEN', mergedAt: null, headRefOid: head,
    author: { login: 'acme-owner' }, reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
    comments: { pageInfo: { hasNextPage: false }, nodes: [] }, reviews: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } };
  await writeFile(stub, `#!${process.execPath}\nconst fs = require('node:fs'), a = process.argv.slice(2);\nfs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(a)+'\\n');\nif(a[0]==='api' && a[1]==='graphql') console.log(${JSON.stringify(JSON.stringify({ data: { repository: { pullRequest: pr } } }))});\nelse if(a.some(x=>/\\/pulls\\/[12]\\/reviews[?]/.test(x))) console.log(${JSON.stringify(JSON.stringify([{ user: { login: 'acme-reviewer' }, commit_id: head, submitted_at: at, state: 'COMMENTED' }]))});\nelse process.exit(1);\n`, { mode: 0o700 });
  const env = { ...process.env, PLATES_GH: stub, PLATES_CACHE: join(w.home, 'cache'), PLATES_QUALITY_BINDING: w.bindingFile };
  const observed = await review({ root: w.root, target: 'Acme/widget#1' }, { env });
  assert.equal(observed.data.qualityObservation.status, 'observed'); assert.match(observed.text, /Quality capture: 1 observed/);
  assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 2, 'capture makes no extra provider reads');
  const unrelated = await review({ root: w.root, target: 'Acme/widget#2' }, { env });
  assert.match(unrelated.text, /Quality capture: gap \(review-target-not-linked-to-episode\)/);
});

test('operating-system execution denial is retained without invoking the command', async t => {
  const w = await world(t), executable = join(w.inputs, 'denied');
  await writeFile(executable, '#!/bin/sh\nexit 0\n', { mode: 0o600 });
  w.record.command.executable = executable; w.record.command.args = []; await w.write();
  const p = await w.call(), result = await w.call({ yes: true, digest: p.digest });
  assert.equal(result.status, 'denied'); assert.equal(result.result.execution.spawnError, 'EACCES');
  assert.equal((await w.inspect()).bundle.episodes[0].attempts[0].status, 'denied');
});

test('retained terminal result reconciles after freshness expiry without rerunning command or inflating duration', async t => {
  const old = new Date(Date.now() - 20 * 60 * 1000).toISOString(), w = await world(t, old);
  const binding = await w.binding(), preview = await w.call(), checkpoint = await qualityCheckpoint(binding);
  const event = { schemaVersion: 1, id: 'acme-code-start', action: 'start', episodeId: binding.episodeId, project: binding.project, at: old,
    payload: { attemptId: 'acme-code', parentId: null, stage: 'coding', agent: w.record.agent, inputCheckpointDigest: null, experiment: null } };
  const lp = await qualityLifecycle({ ...w.options, event, now: old }); await qualityLifecycle({ ...w.options, event, now: old, yes: true, digest: lp.digest });
  const identity = { recordPath: w.recordPath, recordDigest: byteDigest(await readFile(w.recordPath)), bindingDigest: binding.bindingDigest, episodeId: binding.episodeId, project: binding.project, commandId: w.record.id };
  const id = `command-${fingerprint({ project: binding.project.toLowerCase(), episodeId: binding.episodeId, id: w.record.id })}`;
  const intent = sealRecord({ schemaVersion: 2, kind: 'quality-command-intent', id: w.record.id, createdAt: old, identity, previewDigest: preview.digest, commandDigest: fingerprint(w.record.command), inputCheckpoint: checkpoint, output: 'discarded' });
  await qualitySourceOperation({ ...w.options, id, kind: 'intent', record: intent });
  const endedAt = new Date(Date.parse(old) + 7).toISOString();
  const result = sealRecord({ schemaVersion: 2, kind: 'quality-command-result', id: w.record.id, createdAt: endedAt, intentDigest: intent.digest, status: 'completed', execution: { status: 'completed', wallMs: 7, endedAt }, checkpoint, lifecycle: 'unavailable', acceptance: 'unknown', output: 'discarded' });
  await qualitySourceOperation({ ...w.options, id, kind: 'result', record: result });
  const recovered = await w.call({ yes: true, digest: preview.digest });
  assert.equal(recovered.redispatched, false); assert.equal(recovered.lifecycleRecovery.status, 'observed');
  assert.equal(await readFile(join(w.root, 'answer.txt'), 'utf8'), 'Acme original\n');
  const attempt = (await w.inspect()).bundle.episodes[0].attempts[0];
  assert.equal(attempt.status, 'completed'); assert.equal(attempt.endedAt, endedAt); assert.equal(attempt.resources.wallMs, 7);
});
