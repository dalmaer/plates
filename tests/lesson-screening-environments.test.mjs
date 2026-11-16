// Per-case environment coverage split from lesson-screening.test.mjs; the full twenty-receipt fixtures are retained.
import { evaluatedLearningWorld } from './helpers/evaluated-learning.mjs';
import { constants } from 'node:fs';
// Acme synthetic receipt tests exercise real readers; Docker proof is separately opt-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp, { readFile, writeFile, readdir, chmod, mkdir, rm, lstat, symlink } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { screeningWorld, syntheticTerminalReceipts } from './helpers/lesson-screening.mjs';
import { evaluationSection, ref, validateHistory, seal, serializeEvaluation } from '../lib/evaluated-lessons.mjs';
import { fingerprint, sealRecord } from '../lib/evaluation-records.mjs';
import { run } from './helpers/run.mjs';
const apply=(w,p)=>w.learning.evaluatedLearning({...p.opts,yes:true,digest:p.preview.digest});
async function inventory(path){const rows=[];for(const name of (await readdir(path)).sort()){const p=join(path,name),s=await lstat(p);rows.push([name,s.mode,s.isDirectory()?await inventory(p):fingerprint((await readFile(p)).toString('base64'))]);}return rows;}
async function overwrite(path,value){await chmod(path,0o600);await writeFile(path,JSON.stringify(value)+'\n');await chmod(path,0o400);}
const evaluation=r=>evaluationSection(r.outputBytes).value.records.find(r=>r.kind==='learning-evaluation');
test('schema 3 screening retains V2 reports through evaluated learning and read-only package inspection', async t => {
  const w = await screeningWorld(t, { worldOptions: { perCaseEnvironments: true } });
  assert.equal(w.b.schemaVersion, 3);
  assert.notEqual(w.b.cases[0].environment.dependencyLock, w.b.cases[1].environment.dependencyLock);
  await syntheticTerminalReceipts(w, { recovery: true });
  const p = await w.evaluate(), result = await apply(w, p), r = evaluation(result);
  assert.equal(result.status, 'evaluated');
  assert.equal(r.data.method, 'paired-screening-v2');
  assert.equal(r.data.reporterIdentity.version, 2);
  assert.equal(r.data.disposition, 'inconclusive');
  assert.ok(r.data.reasons.includes('offline-scripted-no-agent-efficacy'));
  assert.equal(r.data.attemptRefs.length, 20);
  assert.ok(r.data.caseResults.every(c => c.comparablePairs === 5));
  const path = join(w.dir, 'reports', (await readdir(join(w.dir, 'reports')))[0]), bytes = await readFile(path);
  const receipt = JSON.parse(bytes), screening = await w.load('evaluation-screening'), ledger = await w.load('evaluation-ledger');
  assert.equal(receipt.schemaVersion, 3); assert.equal(receipt.report.schemaVersion, 2);
  assert.equal(receipt.reporterIdentity.version, 2);
  assert.equal(Object.hasOwn(receipt.report, 'recovery'), false);
  for (const c of receipt.report.cases) {
    const task = w.b.cases.find(t => t.id === c.id);
    assert.deepEqual(c.caseRef, { kind: task.kind, id: task.id, digest: task.digest }); assert.deepEqual(c.environment, task.environment);
  }
  const inspected = await ledger.evaluations({ ...w.options, action: 'inspect', experiment: w.b.comparison.id });
  assert.deepEqual(await screening.inspectReports(w.dir, inspected.receipt), [receipt]);
  assert.equal((await apply(w, p)).alreadyApplied, true);
  const before = await inventory(w.dir);
  const packaged = await w.learning.evaluatedLearning({ ...w.options, dir: w.repo, action: 'package', slug: '2026-10-24-acme', env: w.env });
  assert.equal(packaged.payload.comparisonSummary.screening.method, 'paired-screening-v2');
  assert.equal(packaged.readiness.eligible, false);
  assert.ok(packaged.readiness.gaps.includes('screening_not_supported'));
  assert.deepEqual(await inventory(w.dir), before);
  assert.deepEqual(await readFile(path), bytes);
  // Every tuple component is bound; recalculating public hashes cannot switch algorithms.
  for (const mutate of [
    r => { r.schemaVersion = 2; },
    r => { r.report.schemaVersion = 1; },
    r => { const { digest, ...body } = r.reporterIdentity; body.version = 1; r.reporterIdentity = { ...body, digest: fingerprint(body) }; },
  ]) {
    const changed = structuredClone(receipt); mutate(changed); changed.reportDigest = fingerprint(changed.report);
    assert.throws(() => screening.validateReportReceipt(sealRecord(changed), inspected.receipt));
  }
  const bridge = await w.load('evaluated-learning-screening'), history = evaluationSection(result.outputBytes).value;
  await assert.rejects(bridge.verifyRetainedEvaluation({ ...w.options, root: w.repo }, history,
    { ...r, data: { ...r.data, method: 'paired-screening-v1' } }), /original_screening_version_mismatch/);
});

test('schema 3 forged case mapping and changed execution cannot authorize retained screening or package inspection', async t => {
  for (const shape of ['case-reference', 'mapped-environment', 'observed-environment']) await t.test(shape, async t => {
    const w = await screeningWorld(t, { worldOptions: { perCaseEnvironments: true } });
    await syntheticTerminalReceipts(w);
    const p = await w.evaluate(); await apply(w, p);
    const home = join(w.dir, 'reports'), path = join(home, (await readdir(home))[0]);
    const original = JSON.parse(await readFile(path));
    if (shape === 'observed-environment') {
      const intentPath = join(w.dir, 'execution', w.b.comparison.pairs[0].id + '-baseline', 'intent.json');
      const intent = JSON.parse(await readFile(intentPath)); intent.input.environment.dependencyLock = 'f'.repeat(64);
      intent.previewDigest = fingerprint(intent.input); await overwrite(intentPath, sealRecord(intent));
    } else {
      const forged = structuredClone(original);
      if (shape === 'case-reference') forged.report.cases[0].caseRef.digest = 'f'.repeat(64);
      else forged.report.candidate.baselineConfiguration.environments[0].environment.installer = 'f'.repeat(64);
      forged.reportDigest = fingerprint(forged.report);
      const sealed = sealRecord(forged); await rm(path); await writeFile(join(home, sealed.digest + '.json'), JSON.stringify(sealed) + '\n', { mode: 0o400 });
    }
    await assert.rejects(apply(w, p), /projection mismatch|evidence changed|unverified|unavailable|binding mismatch/);
    await assert.rejects(w.learning.evaluatedLearning({ ...w.options, dir: w.repo, action: 'package', slug: '2026-10-24-acme', env: w.env }), /projection mismatch|evidence changed|unverified|unavailable|binding mismatch/);
  });
});
