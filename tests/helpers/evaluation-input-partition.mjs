// Synthetic Acme reviewed partition fixtures. No provider calls or real project data.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, cp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { run } from './run.mjs';
import { acmeEvaluationPlan } from './evaluation-plan.mjs';
import { sealRecord, byteDigest, fingerprint } from '../../lib/evaluation-records.mjs';
import { exportSource } from '../../lib/evaluation-artifacts.mjs';
export const root = resolve(import.meta.dirname, '../..'), ref = x => ({ kind: x.kind, id: x.id, digest: x.digest });
export const meta = bytes => ({ byteDigest: byteDigest(bytes), bytes: bytes.length });
export const file = (path, text, mode = '100644') => ({ path, mode, base64: Buffer.from(text).toString('base64') });
export const material = (id, content) => sealRecord({ schemaVersion: 2, kind: 'material', id, createdAt: '2026-10-23T00:00:00.000Z', mediaType: 'text/plain', content });
export const empty = JSON.stringify({ schemaVersion: 1, files: [] });
export function reseal(b) {
  b.cases = b.cases.map(sealRecord);
  b.configurations = b.configurations.map(c => { const { environment, ...body } = c; return sealRecord({ ...body, schemaVersion: 3, environments: [...b.cases].sort((a, b) => a.id < b.id ? -1 : 1).map(c => ({ case: ref(c), environment: c.environment })) }); });
  b.comparison = sealRecord({ ...b.comparison, repository: b.cases[0].repository, cases: b.cases.map(ref), baseline: ref(b.configurations[0]), candidate: ref(b.configurations[1]),
    pairs: b.cases.flatMap((c, j) => Array.from({ length: 5 }, (_, i) => ({ id: `acme-pair-${j}-${i}`, case: ref(c), order: i % 2 ? 'BA' : 'AB' }))), allowance: { minutes: 1000, currencyUsd: null } });
  return b;
}
export function plan(bundle) {
  const b = structuredClone(bundle);
  const input = { binding: { schemaVersion: 1, workspace: 'Acme local binding' }, bundlePath: '/Acme/bundle.json', bundleHash: byteDigest(JSON.stringify(b)), planHash: fingerprint(b), destination: '/Acme/state/acme-comparison' };
  return { schemaVersion: 2, kind: 'harness', status: 'draft', preview: true, digest: fingerprint(input), ...input, bundle: b, budgetReserved: false, acceptance: 'unknown' };
}
export function bundle(definitions, lesson) {
  const b = acmeEvaluationPlan(); b.schemaVersion = 3; b.cases = definitions.map(d => structuredClone(d.task));
  b.materials = [...new Map(definitions.flatMap(d => d.materials).map(m => [m.id, m])).values()];
  if (lesson) { b.materials.push(lesson); for (const c of b.configurations) c.context = [{ path: 'lesson.txt', material: ref(lesson) }]; }
  return reseal(b);
}
export function manifestFor(definitions, catalogDigest, lesson) {
  return { schemaVersion: 1, kind: 'evaluation-input-classification', revision: 1, catalogDigest,
    cases: definitions.map(d => ({ case: ref(d.task), startingCommit: d.task.startingCommit,
      sources: d.definition.sources.map(s => ({ path: s.path, mode: '100644', blob: s.blob, byteDigest: s.sha256, bytes: s.bytes, role: 'public' })).sort((a, b) => a.path < b.path ? -1 : 1),
      evaluatorFiles: d.probes.map((f, i) => ({ path: f.path, material: ref(d.materials[i]), ...meta(Buffer.from(f.base64, 'base64')) })).sort((a, b) => a.path < b.path ? -1 : 1),
      acceptance: { material: ref(d.acceptance), ...meta(Buffer.from(d.acceptance.content)) }, requirements: { role: 'public', ...meta(Buffer.from(JSON.stringify({ publicBrief: d.task.publicBrief, requirements: d.task.requirements }))) } })).sort((a, b) => a.case.id < b.case.id ? -1 : 1),
    publicMaterials: lesson ? [{ path: 'lesson.txt', material: ref(lesson), ...meta(Buffer.from(lesson.content)) }] : [] };
}
export async function fixture({ sourceCount = 2, sourceBytes = 10, sourceFiles = null, writablePaths = null } = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'acme-partition-'))), repository = join(dir, 'repository'), app = join(dir, 'app');
  await mkdir(repository); await mkdir(app); await cp(join(root, 'lib'), join(app, 'lib'), { recursive: true });
  const git = args => { const r = run('git', ['-C', repository, ...args]); assert.equal(r.status, 0, 'synthetic Git setup succeeds'); return r.stdout.trim(); };
  git(['init', '-q']); const sources = [];
  if (sourceFiles) sourceCount = sourceFiles.length;
  for (let i = 0; i < sourceCount; i++) {
    const path = sourceFiles?.[i].path ?? `source-${String(i).padStart(3, '0')}.txt`, bytes = sourceFiles ? Buffer.from(sourceFiles[i].base64, 'base64') : Buffer.alloc(sourceBytes, 65);
    await mkdir(dirname(join(repository, path)), { recursive: true });
    await writeFile(join(repository, path), bytes, { mode: sourceFiles?.[i].mode === '100755' ? 0o755 : 0o644 });
    sources.push({ path, blob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), sha256: byteDigest(bytes), bytes: bytes.length });
  }
  git(['add', '.']); git(['-c', 'user.name=Acme', '-c', 'user.email=acme@example.invalid', 'commit', '-qm', 'Acme source']); const start = git(['rev-parse', 'HEAD']);
  const corpusDir = join(app, 'lib/evaluation-corpus'), header = '// Acme private provenance-canary\n';
  await writeFile(join(corpusDir, 'probes/acme-target-private.mjs'), header + '// Acme target-body-canary\n');
  await writeFile(join(corpusDir, 'probes/acme-control-private.mjs'), header + '// Acme control-body-canary\n');
  await writeFile(join(corpusDir, 'probes/acme-original.txt'), Buffer.alloc(sourceBytes, 65));
  const catalog = { schemaVersion: 1, createdAt: '2026-10-23T00:00:00.000Z', repository: 'Acme/widget', license: 'Apache-2.0', image: 'sha256:' + 'a'.repeat(64), platform: 'linux/arm64',
    cases: Array.from({ length: 6 }, (_, i) => ({ id: i === 0 ? 'acme-control' : i === 1 ? 'acme-target' : `acme-unused-${i}`, version: 1, taskClass: i === 0 ? 'control' : 'compatibility', start, fix: 'b'.repeat(40), sources: i < 2 ? sources : sources.slice(0, 1), writable: writablePaths ?? [sources[0].path], brief: 'Acme public task', requirements: ['Acme public requirement'], probe: i === 0 ? 'acme-control-private.mjs' : 'acme-target-private.mjs', support: i === 0 ? ['acme-original.txt'] : [], stdout: 'Acme expected-output-canary', coverageLimits: [], closure: 'Acme reviewed closure' })),
    probeHeaders: { 'acme-target-private.mjs': header, 'acme-control-private.mjs': header } };
  const catalogBytes = JSON.stringify(catalog); await writeFile(join(corpusDir, 'catalog.json'), catalogBytes);
  const corpus = await import(pathToFileURL(join(app, 'lib/evaluation-corpus.mjs'))), api = await import(pathToFileURL(join(app, 'lib/evaluation-input-partition.mjs')));
  const definitions = await Promise.all(['acme-control', 'acme-target'].map(id => corpus.corpusDefinition(id))), lesson = material('acme-public-lesson', 'Acme public lesson');
  const manifest = manifestFor(definitions, byteDigest(catalogBytes), lesson), manifestPath = join(corpusDir, 'input-classification-v1.json');
  if (sourceFiles) for (const c of manifest.cases) for (const row of c.sources) row.mode = sourceFiles.find(f => f.path === row.path).mode;
  await writeFile(manifestPath, JSON.stringify(manifest));
  const b = bundle(definitions, lesson), sourcesExport = exportSource(repository, start, sources.map(s => s.path));
  const input = async (selected = b, index = 0, arm = 0) => ({ plan: plan(selected), caseRef: ref(selected.cases[index]), configurationRef: ref(selected.configurations[arm]), sourceFiles: structuredClone(sourcesExport), reviewed: await corpus.loadReviewedInputClassification() });
  return { dir, app, repository, corpus, api, definitions, lesson, manifest, manifestPath, b, input, sources: sourcesExport };
}
