import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, readdir, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acmeQualityBundle, acmeQualityEpisode, QUALITY_TIME, QUALITY_HASH } from './helpers/agent-quality.mjs';
import { validateQualityBundle, qualityEpisode } from '../lib/agent-quality-records.mjs';
import { qualityOperation, qualitySourceOperation, qualitySourceUsage } from '../lib/agent-quality-ledger.mjs';
import { sealRecord, fingerprint } from '../lib/evaluation-records.mjs';
import { evaluations } from '../lib/evaluation-ledger.mjs';
import { storeImmutable } from '../lib/session-ledger-io.mjs';
import { acmeEvaluationPlan } from './helpers/evaluation-plan.mjs';
import { initializeWorkspace } from '../lib/web/workspace.mjs';
const appRoot = fileURLToPath(new URL('..', import.meta.url));

async function world(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-quality-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'inputs'));
  const opts = { appRoot, manifest: join(root, 'inputs/workspace.json'), state: join(root, 'state'), now: QUALITY_TIME };
  await writeFile(opts.manifest, JSON.stringify({ version: 1, id: 'acme', name: 'Acme', repo: 'Acme/private', projects: [{ id: 'widget', repo: 'Acme/widget' }] }));
  await initializeWorkspace(opts);
  const collect = inputBundle => qualityOperation({ ...opts, action: 'collect', inputBundle });
  const approve = async inputBundle => { const p = await collect(inputBundle); return qualityOperation({ ...opts, action: 'collect', inputBundle, yes: true, digest: p.digest }); };
  return { root, opts, collect, approve, inspect: () => qualityOperation({ ...opts, action: 'inspect' }), directory: join(opts.state, 'session-trials/.quality') };
}

test('quality metadata schema retains unknowns and refuses raw transcript fields', () => {
  const e = qualityEpisode({ id: 'acme-history', project: 'Acme/widget', createdAt: QUALITY_TIME, source: { kind: 'git', id: 'git:acme', at: QUALITY_TIME, digest: QUALITY_HASH } });
  assert.equal(validateQualityBundle(acmeQualityBundle([e])).episodes[0].passport.difficulty, null);
  assert.equal(Object.hasOwn(e.passport, 'workflowDigest'), false, 'original metadata factories remain byte-compatible');
  for (const mutate of [
    x => { x.transcript = 'private words'; }, x => { x.links = ['https://example.test/?secret=abc']; },
    x => { x.passport.recordedAt = QUALITY_TIME; }, x => { x.attempts[0].parentId = 'absent'; },
    x => { x.attempts[0].resources.currencySource = 'unknown'; },
    x => { x.attempts[0].resources.currencySource = 'estimate'; },
    x => { x.evaluations[0].evidence = []; }, x => { x.evaluations[0].proportionalityEvidence = null; },
    x => { x.attempts[0].stage = 'review'; x.evaluations[0].stage = 'review'; },
  ]) {
    const candidate = acmeQualityEpisode(); mutate(candidate);
    assert.throws(() => validateQualityBundle(acmeQualityBundle([sealRecord(candidate)])), /evaluations:/);
  }
});

test('collection preview writes nothing; exact approval is immutable and idempotent', async t => {
  const w = await world(t), bundle = acmeQualityBundle(), preview = await w.collect(bundle);
  assert.deepEqual(await readdir(w.opts.state), ['workspace.json']);
  await assert.rejects(qualityOperation({ ...w.opts, action: 'collect', inputBundle: bundle, yes: true, digest: '0'.repeat(64) }), /stale/);
  const result = await w.approve(bundle), path = join(w.directory, 'batches', `${result.receipt.id}.json`), bytes = await readFile(path);
  assert.equal((await stat(path)).mode & 0o777, 0o400);
  const retry = await qualityOperation({ ...w.opts, action: 'collect', inputBundle: bundle, yes: true, digest: preview.digest });
  assert.equal(retry.recovered, true); assert.deepEqual(await readFile(path), bytes);
  const inspection = await w.inspect(); assert.equal(inspection.bundle.episodes.length, 1); assert.equal(inspection.coverage.events, 1);
});

test('changed source identities and dropped failures cannot replace observations', async t => {
  const w = await world(t), original = acmeQualityEpisode();
  original.attempts[0].status = 'failed'; original.evaluations[0].acceptance = 'rejected';
  const first = sealRecord(original); await w.approve(acmeQualityBundle([first]));
  const changed = structuredClone(first); changed.workflow = 'acme-b';
  await assert.rejects(w.collect(acmeQualityBundle([sealRecord(changed)])), /source identity changed/);
  changed.workflow = first.workflow; changed.previousDigest = first.digest; changed.source.id = 'acme-followup'; changed.attempts = []; changed.evaluations = [];
  await assert.rejects(w.collect(acmeQualityBundle([sealRecord(changed)])), /prior attempt/);
});

test('new follow-up appends with exact predecessor and preserves old receipt bytes', async t => {
  const w = await world(t), first = acmeQualityEpisode(), initial = await w.approve(acmeQualityBundle([first]));
  const path = join(w.directory, 'batches', `${initial.receipt.id}.json`), bytes = await readFile(path);
  const second = structuredClone(first); second.previousDigest = first.digest; second.source.id = 'acme-followup';
  second.followup.push({ days: 7, usedAt: QUALITY_TIME, observedAt: QUALITY_TIME, exposure: null, regressions: null, repairMinutes: null, evidence: [] });
  await w.approve(acmeQualityBundle([sealRecord(second)]));
  const observed = await w.inspect(); assert.equal(observed.coverage.events, 2); assert.equal(observed.bundle.episodes.length, 1);
  assert.equal(observed.bundle.episodes[0].followup.length, 1); assert.deepEqual(await readFile(path), bytes);
  second.passport.difficulty = [0, 0, 0, 0, 0]; second.source.id = 'acme-changing-passport';
  await assert.rejects(w.collect(acmeQualityBundle([sealRecord(second)])), /conflicting|passport/);
});

test('retention expires eligibility without deleting evidence and capacity refuses new work', async t => {
  const w = await world(t), bundle = acmeQualityBundle(); bundle.retention.days = 1; bundle.retention.maxEvents = 1;
  await w.approve(bundle);
  const expired = await qualityOperation({ ...w.opts, action: 'inspect', now: '2026-11-01T00:00:00.000Z' });
  assert.equal(expired.bundle.episodes.length, 0); assert.equal(expired.coverage.expired, 1); assert.equal(expired.receipts.length, 1);
  const other = acmeQualityBundle([acmeQualityEpisode('acme-second')]); other.retention = bundle.retention;
  await assert.rejects(w.collect(other), /capacity/);
});

test('workspace scope, explicit frozen joins, and locked or partial state refuse', async t => {
  const w = await world(t), e = acmeQualityEpisode(); e.project = 'Acme/elsewhere';
  await assert.rejects(w.collect(acmeQualityBundle([sealRecord(e)])), /outside workspace/);
  const invalidJoin = acmeQualityEpisode(); invalidJoin.attempts[0].experiment = { id: 'acme-missing', planDigest: QUALITY_HASH, pairId: 'acme-pair', arm: 'baseline', slot: 'acme-pair-baseline', attemptId: 'acme-attempt' };
  await assert.rejects(w.collect(acmeQualityBundle([sealRecord(invalidJoin)])), /experiment missing/);
  await w.approve(acmeQualityBundle());
  await writeFile(join(w.opts.state, 'session-trials/.lock'), '', { mode: 0o600 });
  await assert.rejects(w.inspect(), /locked/); await rm(join(w.opts.state, 'session-trials/.lock'));
  await writeFile(join(w.directory, 'batches', `${'0'.repeat(64)}.json`), '', { mode: 0o600 });
  await assert.rejects(w.inspect(), /invalid JSON/);
});

test('private collection refuses symlink storage without following it', async t => {
  const w = await world(t); await mkdir(join(w.opts.state, 'session-trials'), { mode: 0o700 });
  const outside = join(w.root, 'outside'); await mkdir(outside, { mode: 0o700 });
  await symlink(outside, w.directory);
  await assert.rejects(w.approve(acmeQualityBundle()), /unsafe storage/);
  assert.deepEqual(await readdir(outside), []);
});

test('approval binds collection state and detects an intervening write', async t => {
  const w = await world(t), first = acmeQualityBundle(), preview = await w.collect(first);
  await w.approve(acmeQualityBundle([acmeQualityEpisode('acme-other')]));
  await assert.rejects(qualityOperation({ ...w.opts, action: 'collect', inputBundle: first, yes: true, digest: preview.digest }), /stale/);
});

test('unknown attempts keep original identity and usage when later evidence arrives', async t => {
  const w = await world(t), first = acmeQualityEpisode(); first.attempts[0].status = 'unknown';
  const original = sealRecord(first); await w.approve(acmeQualityBundle([original]));
  const update = structuredClone(original); update.previousDigest = original.digest; update.source.id = 'acme-later';
  update.attempts[0].agent.model = 'acme-v2'; update.attempts[0].resources.currencyUsd = 0;
  await assert.rejects(w.collect(acmeQualityBundle([sealRecord(update)])), /prior attempt/);
});

test('unknown-to-terminal refinement fills missing charges once and retains original uncertainty', async t => {
  const w = await world(t), first = acmeQualityEpisode(); first.attempts[0].status = 'unknown'; first.evaluations = [];
  first.attempts[0].resources.currencyUsd = null; first.attempts[0].resources.currencySource = 'unknown';
  first.attempts[0].endedAt = null;
  const original = sealRecord(first), firstReceipt = await w.approve(acmeQualityBundle([original]));
  const update = structuredClone(original); update.previousDigest = original.digest; update.source.id = 'acme-terminal';
  update.attempts[0].status = 'completed'; update.attempts[0].endedAt = QUALITY_TIME;
  update.attempts[0].resources.currencyUsd = 3; update.attempts[0].resources.currencySource = 'actual';
  await w.approve(acmeQualityBundle([sealRecord(update)]));
  const result = await w.inspect(); assert.equal(result.bundle.episodes[0].attempts.length, 1);
  assert.equal(result.bundle.episodes[0].attempts[0].resources.currencyUsd, 3);
  const originalBytes = JSON.parse(await readFile(join(w.directory, 'batches', `${firstReceipt.receipt.id}.json`), 'utf8'));
  assert.equal(originalBytes.bundle.episodes[0].attempts[0].status, 'unknown');
  assert.equal(originalBytes.bundle.episodes[0].attempts[0].resources.currencyUsd, null);
});

test('attempt order cannot change the final outcome through a later snapshot', async t => {
  const w = await world(t), first = acmeQualityEpisode();
  first.attempts.push({ ...structuredClone(first.attempts[0]), id: 'acme-failed', status: 'failed' });
  const original = sealRecord(first); await w.approve(acmeQualityBundle([original]));
  const update = structuredClone(original); update.previousDigest = original.digest; update.source.id = 'acme-reordered'; update.attempts.reverse();
  await assert.rejects(w.collect(acmeQualityBundle([sealRecord(update)])), /reordered/);
});

test('passive observations join frozen original attempts without inventing execution or changing harness bytes', async t => {
  const w = await world(t), b = acmeEvaluationPlan(), path = join(w.root, 'inputs/harness.json');
  await writeFile(path, JSON.stringify(b));
  const preview = await evaluations({ ...w.opts, action: 'freeze', bundle: path });
  const frozen = await evaluations({ ...w.opts, action: 'freeze', bundle: path, yes: true, digest: preview.digest });
  const plan = frozen.receipt.plan, home = join(w.opts.state, 'session-trials', b.comparison.id), frozenBytes = await readFile(join(home, 'state.json'));
  const execution = join(home, 'execution'), slot = `${b.comparison.pairs[0].id}-baseline`, slotHome = join(execution, slot);
  await mkdir(execution, { mode: 0o700 }); await mkdir(slotHome, { mode: 0o700 });
  const record = (kind, id, body) => sealRecord({ schemaVersion: 2, kind, id, createdAt: QUALITY_TIME, ...body });
  await storeImmutable(join(execution, 'reservation.json'), record('evaluation-reservation', b.comparison.id, { planDigest: plan.digest, allowance: b.comparison.allowance }));
  const input = { request: { pairId: b.comparison.pairs[0].id, arm: 'baseline' }, planDigest: plan.digest, taskDigest: b.cases[0].digest, configurationDigest: b.configurations[0].digest, checkManifestDigest: b.cases[0].acceptanceManifest.digest };
  const intent = record('evaluation-intent', 'acme-original', { slot, input, previewDigest: fingerprint(input), operations: ['plates-eval-acme-original-builder'] });
  await storeImmutable(join(slotHome, 'intent.json'), intent);
  const e = acmeQualityEpisode(); e.evaluations = []; e.attempts[0].status = 'unknown';
  e.passport.acceptanceDigest = b.cases[0].acceptanceManifest.digest;
  e.attempts[0].experiment = { id: b.comparison.id, planDigest: plan.digest, pairId: b.comparison.pairs[0].id, arm: 'baseline', slot, attemptId: intent.id };
  const mismatched = structuredClone(e); mismatched.attempts[0].experiment.planDigest = '0'.repeat(64);
  await assert.rejects(w.collect(acmeQualityBundle([sealRecord(mismatched)])), /plan join mismatch/);
  await w.approve(acmeQualityBundle([sealRecord(e)]));
  const observed = await w.inspect(); assert.equal(observed.frozen.length, 1); assert.equal(observed.bundle.episodes[0].attempts[0].status, 'unknown');
  assert.deepEqual(await readFile(join(home, 'state.json')), frozenBytes);
  const duplicate = structuredClone(e); duplicate.id = 'acme-duplicate'; duplicate.source.id = 'acme-duplicate';
  await assert.rejects(w.collect(acmeQualityBundle([sealRecord(duplicate)])), /another episode/);
});

test('saved report bytes share collection retention and stale an earlier approval', async t => {
  const w = await world(t); await w.approve(acmeQualityBundle());
  const before = await w.inspect(), next = acmeQualityBundle([acmeQualityEpisode('acme-after-report')]), preview = await w.collect(next);
  const reports = join(w.directory, 'reports'); await mkdir(reports, { mode: 0o700 });
  const path = join(reports, `${QUALITY_HASH}.json`);
  await storeImmutable(path, { kind: 'acme-synthetic-report', metadataOnly: true });
  const observed = await w.inspect(), bytes = (await stat(path)).size;
  assert.equal(observed.coverage.reportBytes, bytes);
  assert.equal(observed.coverage.retainedBytes, before.coverage.retainedBytes + bytes);
  await assert.rejects(qualityOperation({ ...w.opts, action: 'collect', inputBundle: next, yes: true, digest: preview.digest }), /stale/);
  await writeFile(join(reports, `${'b'.repeat(64)}.json`), Buffer.alloc(4 * 1024 * 1024), { mode: 0o400 });
  await assert.rejects(w.inspect(), /retention byte bound/);
});

test('command source reservations share bounds and keep uncertain intent without a second dispatch', async t => {
  const w = await world(t), bundle = acmeQualityBundle(); bundle.retention.maxEvents = 2; await w.approve(bundle);
  const identity = { project: 'Acme/widget', episodeId: 'acme-task' }, id = `command-${fingerprint({ project: 'acme/widget', episodeId: 'acme-task', id: 'acme-command' })}`;
  const intent = sealRecord({ schemaVersion: 2, kind: 'quality-command-intent', id: 'acme-command', createdAt: QUALITY_TIME, identity, output: 'discarded' });
  const options = { ...w.opts, id, kind: 'intent', record: intent };
  const first = await qualitySourceOperation(options); assert.equal(first.recovered, false);
  assert.equal((await qualitySourceOperation(options)).recovered, true);
  const usage = await qualitySourceUsage(w.directory); assert.equal(usage.events, 1); assert.ok(usage.bytes > 0);
  assert.equal(usage.issues[0].reason, 'result-unavailable');
  const result = sealRecord({ schemaVersion: 2, kind: 'quality-command-result', id: 'acme-command', createdAt: QUALITY_TIME, intentDigest: intent.digest, output: 'discarded' });
  await assert.rejects(qualitySourceOperation({ ...options, kind: 'result', record: result }), /capacity/);
  assert.deepEqual(JSON.parse(await readFile(first.path, 'utf8')), intent);
  assert.equal((await w.inspect()).coverage.sourceEvents, 1);
});

test('terminal source result binds the original intent and same receipt recovery is immutable', async t => {
  const w = await world(t); await w.approve(acmeQualityBundle());
  const identity = { project: 'Acme/widget', episodeId: 'acme-task' }, id = `command-${fingerprint({ project: 'acme/widget', episodeId: 'acme-task', id: 'acme-command' })}`;
  const intent = sealRecord({ schemaVersion: 2, kind: 'quality-command-intent', id: 'acme-command', createdAt: QUALITY_TIME, identity, output: 'discarded' });
  const options = { ...w.opts, id }; await qualitySourceOperation({ ...options, kind: 'intent', record: intent });
  const result = sealRecord({ schemaVersion: 2, kind: 'quality-command-result', id: 'acme-command', createdAt: QUALITY_TIME, intentDigest: intent.digest, output: 'discarded' });
  await assert.rejects(qualitySourceOperation({ ...options, kind: 'result', record: sealRecord({ ...result, intentDigest: QUALITY_HASH }) }), /original intent/);
  await qualitySourceOperation({ ...options, kind: 'result', record: result });
  assert.equal((await qualitySourceOperation({ ...options, kind: 'result', record: result })).recovered, true);
  const usage = await qualitySourceUsage(w.directory); assert.equal(usage.events, 2); assert.deepEqual(usage.issues, []);
});

test('raw metadata imports cannot upgrade retrospective outcomes into prospective comparisons', async t => {
  const w = await world(t), e = acmeQualityEpisode(); e.passport.timing = 'retrospective';
  const original = sealRecord(e); await w.approve(acmeQualityBundle([original]));
  const update = structuredClone(original); update.previousDigest = original.digest; update.source.id = 'acme-upgraded'; update.passport.timing = 'prospective';
  await assert.rejects(w.collect(acmeQualityBundle([sealRecord(update)])), /cannot become prospective/);
});

test('later observations cannot delete or replace an existing task mapping', async t => {
  const w = await world(t), original = acmeQualityEpisode(); await w.approve(acmeQualityBundle([original]));
  for (const links of [[], ['Acme/widget#2']]) {
    const update = structuredClone(original); update.previousDigest = original.digest; update.source.id = 'acme-remapped'; update.links = links;
    await assert.rejects(w.collect(acmeQualityBundle([sealRecord(update)])), /prior task mapping removed/);
  }
});
