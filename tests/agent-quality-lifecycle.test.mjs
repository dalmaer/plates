import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualityLifecycle, emptyQualityPassport } from '../lib/agent-quality-lifecycle.mjs';
import { qualityOperation } from '../lib/agent-quality-ledger.mjs';
import { qualityReport } from '../lib/agent-quality-report.mjs';
import { initializeWorkspace } from '../lib/web/workspace.mjs';
import { acmeQualityEpisode, QUALITY_TIME, QUALITY_HASH } from './helpers/agent-quality.mjs';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const at = n => new Date(Date.parse(QUALITY_TIME) + n * 1000).toISOString();
const event = (id, action, payload, second = 0) => ({ schemaVersion: 1, id, action, episodeId: 'acme-task', project: 'Acme/widget', at: at(second), payload });
const begin = (extra = {}) => event('acme-begin', 'begin', { links: ['Acme/widget#1'], workflow: 'acme-a', passport: { ...emptyQualityPassport(), family: 'feature', specialty: 'frontend', difficulty: [1, 1, 1, 1, 1], risk: 'medium', baseCommit: 'b'.repeat(40), acceptanceDigest: QUALITY_HASH, contextDigest: QUALITY_HASH, workflowDigest: QUALITY_HASH, stratum: 'acme-frontend' }, alreadyStarted: false, ...extra });
const start = (id, stage, second, inputCheckpointDigest = null, parentId = null) => event(`${id}-start`, 'start', { attemptId: id, parentId, stage, agent: null, inputCheckpointDigest, experiment: null }, second);
const finish = (id, second, checkpointDigest = QUALITY_HASH, status = 'completed', resources = {}) => event(`${id}-finish`, 'finish', { attemptId: id, status, checkpointDigest, resources, interventions: [] }, second);
async function world(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-lifecycle-')));
  t.after(() => rm(root, { recursive: true, force: true })); await mkdir(join(root, 'inputs'));
  const opts = { appRoot, manifest: join(root, 'inputs/workspace.json'), state: join(root, 'state') };
  await writeFile(opts.manifest, JSON.stringify({ version: 1, id: 'acme', name: 'Acme', repo: 'Acme/private', projects: [{ id: 'widget', repo: 'Acme/widget' }] }));
  await initializeWorkspace(opts);
  const preview = (e, now = e.at) => qualityLifecycle({ ...opts, event: e, now });
  const apply = async (e, now = e.at) => { const p = await preview(e, now); return qualityLifecycle({ ...opts, event: e, now, yes: true, digest: p.digest }); };
  return { opts, root, preview, apply, inspect: () => qualityOperation({ ...opts, action: 'inspect', now: at(100) }) };
}

test('real lifecycle APIs capture every stage with immutable input lineage and no automatic judgment', async t => {
  const w = await world(t); await w.apply(begin());
  const stages = ['planning', 'coding', 'review', 'iteration'];
  for (const [index, stage] of stages.entries()) {
    const input = index ? String(index).repeat(64) : null, checkpoint = String(index + 1).repeat(64);
    await w.apply(start(`acme-${stage}`, stage, index * 2 + 1, input, index ? `acme-${stages[index - 1]}` : null));
    await w.apply(finish(`acme-${stage}`, index * 2 + 2, checkpoint));
  }
  const inspected = await w.inspect(), e = inspected.bundle.episodes[0];
  assert.equal(e.passport.timing, 'prospective'); assert.deepEqual(e.attempts.map(a => a.stage), stages);
  assert.ok(e.attempts.every(a => a.status === 'completed' && a.resources.wallMs === 1000 && a.agent === null && a.resources.currencyUsd === null));
  assert.equal(e.evaluations.length, 0, 'process completion does not fabricate acceptance');
  assert.equal(inspected.receipts.length, 9); assert.ok(inspected.receipts.every(r => r.bundle.episodes.length === 1));
});

test('lifecycle exact preview, idempotent replay and conflicting source identifiers preserve original bytes', async t => {
  const w = await world(t), e = begin(), p = await w.preview(e);
  assert.deepEqual(await readdir(w.opts.state), ['workspace.json']);
  await assert.rejects(qualityLifecycle({ ...w.opts, event: e, now: e.at, yes: true, digest: '0'.repeat(64) }), /stale/);
  const first = await w.apply(e), path = join(w.opts.state, 'session-trials/.quality/batches', `${first.receipt.id}.json`), bytes = await readFile(path);
  const retry = await qualityLifecycle({ ...w.opts, event: e, now: at(1000), yes: true, digest: p.digest });
  assert.equal(retry.recovered, true); assert.deepEqual(await readFile(path), bytes);
  const edited = structuredClone(e); edited.payload.workflow = 'acme-b';
  await assert.rejects(w.preview(edited), /different original input/);
});

test('failed and denied attempts remain beside retries and original checkpoints cannot move', async t => {
  const w = await world(t); await w.apply(begin());
  await w.apply(start('acme-code', 'coding', 1));
  await w.apply(finish('acme-code', 2, QUALITY_HASH, 'failed', { currencyUsd: 2, currencySource: 'actual' }));
  await w.apply(start('acme-retry', 'coding', 3, QUALITY_HASH, 'acme-code'));
  await w.apply(finish('acme-retry', 4, 'b'.repeat(64), 'completed', { currencyUsd: 3, currencySource: 'actual' }));
  await w.apply(start('acme-review', 'review', 5, 'b'.repeat(64), 'acme-retry'));
  await w.apply(finish('acme-review', 6, null, 'denied'));
  const episode = (await w.inspect()).bundle.episodes[0];
  assert.deepEqual(episode.attempts.map(a => a.status), ['failed', 'completed', 'denied']);
  assert.equal(episode.attempts[0].resources.currencyUsd + episode.attempts[1].resources.currencyUsd, 5);
  const rewrite = finish('acme-code', 7, 'c'.repeat(64)); rewrite.id = 'acme-rewrite';
  await assert.rejects(w.preview(rewrite), /unresolved original/);
  await assert.rejects(w.preview(start('acme-wrong-review', 'review', 7, 'd'.repeat(64))), /input checkpoint/);
});

test('uncertain completion retains uncertainty then resolves the same attempt without double charging', async t => {
  const w = await world(t); await w.apply(begin()); await w.apply(start('acme-code', 'coding', 1));
  await w.apply(finish('acme-code', 2, null, 'unknown'));
  assert.equal((await w.inspect()).bundle.episodes[0].attempts[0].status, 'unknown');
  const resolved = finish('acme-code', 3, QUALITY_HASH, 'completed', { currencyUsd: 4, currencySource: 'actual' }); resolved.id = 'acme-resolved';
  resolved.payload.agent = { provider: 'Acme', model: 'acme-v1' };
  await w.apply(resolved);
  const inspected = await w.inspect(), a = inspected.bundle.episodes[0].attempts[0];
  assert.equal(inspected.bundle.episodes[0].attempts.length, 1); assert.equal(a.resources.currencyUsd, 4); assert.equal(a.resources.wallMs, 2000);
  assert.equal(a.agent.harnessDigest, null, 'unavailable provenance remains unavailable');
  assert.ok(inspected.receipts.some(r => r.bundle.episodes.some(e => e.attempts[0]?.status === 'unknown')));
});

test('late observations cannot become prospective and live starts cannot be backdated', async t => {
  const w = await world(t); await w.apply(begin(), at(1000));
  assert.equal((await w.inspect()).bundle.episodes[0].passport.timing, 'retrospective');
  const annotation = event('acme-labels', 'annotate', { passport: { family: 'bugfix', specialty: 'backend' } }, 1001);
  await w.apply(annotation);
  const e = (await w.inspect()).bundle.episodes[0]; assert.equal(e.passport.timing, 'retrospective'); assert.equal(e.passport.family, 'bugfix');
  const backdated = start('acme-old', 'coding', 1002);
  await assert.rejects(w.preview(backdated, at(2000)), /stale lifecycle/);
  annotation.id = 'acme-upgrade'; annotation.at = at(1002); annotation.payload.passport.timing = 'prospective';
  await assert.rejects(w.preview(annotation), /unknown lifecycle metadata/);
});

test('prospective missing labels remain frozen and human versus model judgments stay distinct', async t => {
  const w = await world(t); await w.apply(begin({ passport: emptyQualityPassport() }));
  await assert.rejects(w.preview(event('acme-late-labels', 'annotate', { passport: { family: 'feature' } }, 1)), /prospective passport is frozen/);
  await w.apply(start('acme-code', 'coding', 1)); await w.apply(finish('acme-code', 2));
  const template = acmeQualityEpisode().evaluations[0]; template.attemptId = 'acme-code';
  await w.apply(event('acme-model-judge', 'adjudicate', { evaluation: { ...template, id: 'acme-model', authority: 'model', evaluator: 'acme-judge-model' } }, 3));
  await w.apply(event('acme-human-judge', 'adjudicate', { evaluation: { ...template, id: 'acme-human', authority: 'human', evaluator: 'acme-human' } }, 4));
  assert.deepEqual((await w.inspect()).bundle.episodes[0].evaluations.map(v => v.authority), ['model', 'human']);
  await assert.rejects(w.preview(event('acme-replace-judge', 'adjudicate', { evaluation: { ...template, id: 'acme-human', quality: 0 } }, 5)), /evaluation id already exists/);
});

test('follow-up preserves unknown exposure and rejects future observations and unrestricted metadata', async t => {
  const w = await world(t); await w.apply(begin());
  const observation = { days: 7, usedAt: at(0), observedAt: at(3), exposure: null, regressions: null, repairMinutes: null, evidence: [] };
  await w.apply(event('acme-followup', 'followup', { observation }, 3));
  assert.equal((await w.inspect()).bundle.episodes[0].followup[0].exposure, null);
  observation.observedAt = at(100);
  await assert.rejects(w.preview(event('acme-future-followup', 'followup', { observation }, 4)), /future observation/);
  const invalid = start('acme-private', 'coding', 4); invalid.payload.transcript = 'private words';
  await assert.rejects(w.preview(invalid), /invalid fields/);
});

test('first observed stage assigns retrospective work without inventing preassignment comparability', async t => {
  const w = await world(t); await w.apply(begin({ alreadyStarted: true }));
  assert.equal((await w.inspect()).bundle.episodes[0].assignedAt, null);
  await w.apply(start('acme-code', 'coding', 1)); await w.apply(finish('acme-code', 2));
  const evaluation = acmeQualityEpisode().evaluations[0]; evaluation.attemptId = 'acme-code';
  await w.apply(event('acme-real-judgment', 'adjudicate', { evaluation }, 3));
  const inspected = await w.inspect(), e = inspected.bundle.episodes[0], report = qualityReport(inspected.bundle, { now: at(100) });
  assert.equal(e.assignedAt, at(1)); assert.equal(e.passport.timing, 'retrospective');
  assert.equal(report.workload.completion.accepted, 1); assert.equal(report.coverage.comparisonEligibleEpisodes, 0);
});

test('late receipt reconciliation preserves original end time and measured usage', async t => {
  const w = await world(t); await w.apply(begin()); await w.apply(start('acme-code', 'coding', 1));
  const recovered = finish('acme-code', 1000, QUALITY_HASH, 'completed', { wallMs: 1000 });
  recovered.payload.endedAt = at(2); await w.apply(recovered);
  const a = (await w.inspect()).bundle.episodes[0].attempts[0];
  assert.equal(a.endedAt, at(2)); assert.equal(a.resources.wallMs, 1000);
  const w2 = await world(t); await w2.apply(begin()); await w2.apply(start('acme-code', 'coding', 1));
  recovered.payload.endedAt = at(0);
  await assert.rejects(w2.preview(recovered), /observed attempt interval/);
});

test('a prospective task may append its future PR link without changing its frozen passport', async t => {
  const w = await world(t); await w.apply(begin({ links: [] }));
  const before = (await w.inspect()).bundle.episodes[0];
  await w.apply(event('acme-link-pr', 'link', { links: ['Acme/widget#12', 'Acme/widget#12'] }, 1));
  const after = (await w.inspect()).bundle.episodes[0];
  assert.deepEqual(after.links, ['Acme/widget#12']); assert.deepEqual(after.passport, before.passport);
  assert.equal(after.passport.timing, 'prospective'); assert.equal(after.assignedAt, before.assignedAt);
  await w.apply(event('acme-link-related', 'link', { links: ['Acme/widget#13'] }, 2));
  assert.deepEqual((await w.inspect()).bundle.episodes[0].links, ['Acme/widget#12', 'Acme/widget#13']);
  await assert.rejects(w.preview(event('acme-link-private-url', 'link', { links: ['https://example.test/?private=words'] }, 3)), /quality list item/);
});
