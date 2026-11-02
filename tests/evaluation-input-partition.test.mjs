import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, cp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { run } from './helpers/run.mjs';
import { acmeEvaluationPlan } from './helpers/evaluation-plan.mjs';
import { sealRecord, byteDigest, fingerprint, validateEvaluationBundle } from '../lib/evaluation-records.mjs';
import { exportSource } from '../lib/evaluation-artifacts.mjs';
import { composeExecutionDelivery } from '../lib/evaluation-execution-input.mjs';
import * as installed from '../lib/evaluation-corpus.mjs';
import * as partition from '../lib/evaluation-input-partition.mjs';
const root = resolve(import.meta.dirname, '..'), ref = x => ({ kind: x.kind, id: x.id, digest: x.digest });
const meta = bytes => ({ byteDigest: byteDigest(bytes), bytes: bytes.length });
const file = (path, text, mode = '100644') => ({ path, mode, base64: Buffer.from(text).toString('base64') });
const material = (id, content) => sealRecord({ schemaVersion: 2, kind: 'material', id, createdAt: '2026-10-23T00:00:00.000Z', mediaType: 'text/plain', content });
const empty = JSON.stringify({ schemaVersion: 1, files: [] });
function reseal(b) {
  b.cases = b.cases.map(sealRecord);
  b.configurations = b.configurations.map(c => { const { environment, ...body } = c; return sealRecord({ ...body, schemaVersion: 3, environments: [...b.cases].sort((a, b) => a.id < b.id ? -1 : 1).map(c => ({ case: ref(c), environment: c.environment })) }); });
  b.comparison = sealRecord({ ...b.comparison, repository: b.cases[0].repository, cases: b.cases.map(ref), baseline: ref(b.configurations[0]), candidate: ref(b.configurations[1]),
    pairs: b.cases.flatMap((c, j) => Array.from({ length: 5 }, (_, i) => ({ id: `acme-pair-${j}-${i}`, case: ref(c), order: i % 2 ? 'BA' : 'AB' }))), allowance: { minutes: 1000, currencyUsd: null } });
  return b;
}
function plan(bundle) {
  const b = structuredClone(bundle);
  const input = { binding: { schemaVersion: 1, workspace: 'Acme local binding' }, bundlePath: '/Acme/bundle.json', bundleHash: byteDigest(JSON.stringify(b)), planHash: fingerprint(b), destination: '/Acme/state/acme-comparison' };
  return { schemaVersion: 2, kind: 'harness', status: 'draft', preview: true, digest: fingerprint(input), ...input, bundle: b, budgetReserved: false, acceptance: 'unknown' };
}
function bundle(definitions, lesson) {
  const b = acmeEvaluationPlan(); b.schemaVersion = 3; b.cases = definitions.map(d => structuredClone(d.task));
  b.materials = [...new Map(definitions.flatMap(d => d.materials).map(m => [m.id, m])).values()];
  if (lesson) { b.materials.push(lesson); for (const c of b.configurations) c.context = [{ path: 'lesson.txt', material: ref(lesson) }]; }
  return reseal(b);
}
function manifestFor(definitions, catalogDigest, lesson) {
  return { schemaVersion: 1, kind: 'evaluation-input-classification', revision: 1, catalogDigest,
    cases: definitions.map(d => ({ case: ref(d.task), startingCommit: d.task.startingCommit,
      sources: d.definition.sources.map(s => ({ path: s.path, mode: '100644', blob: s.blob, byteDigest: s.sha256, bytes: s.bytes, role: 'public' })).sort((a, b) => a.path < b.path ? -1 : 1),
      evaluatorFiles: d.probes.map((f, i) => ({ path: f.path, material: ref(d.materials[i]), ...meta(Buffer.from(f.base64, 'base64')) })).sort((a, b) => a.path < b.path ? -1 : 1),
      acceptance: { material: ref(d.acceptance), ...meta(Buffer.from(d.acceptance.content)) }, requirements: { role: 'public', ...meta(Buffer.from(JSON.stringify({ publicBrief: d.task.publicBrief, requirements: d.task.requirements }))) } })).sort((a, b) => a.case.id < b.case.id ? -1 : 1),
    publicMaterials: lesson ? [{ path: 'lesson.txt', material: ref(lesson), ...meta(Buffer.from(lesson.content)) }] : [] };
}
async function fixture({ sourceCount = 2, sourceBytes = 10 } = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'acme-partition-'))), repository = join(dir, 'repository'), app = join(dir, 'app');
  await mkdir(repository); await mkdir(app); await cp(join(root, 'lib'), join(app, 'lib'), { recursive: true });
  const git = args => { const r = run('git', ['-C', repository, ...args]); assert.equal(r.status, 0, 'synthetic Git setup succeeds'); return r.stdout.trim(); };
  git(['init', '-q']); const sources = [];
  for (let i = 0; i < sourceCount; i++) {
    const path = `source-${String(i).padStart(3, '0')}.txt`, bytes = Buffer.alloc(sourceBytes, 65);
    await writeFile(join(repository, path), bytes);
    sources.push({ path, blob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), sha256: byteDigest(bytes), bytes: bytes.length });
  }
  git(['add', '.']); git(['-c', 'user.name=Acme', '-c', 'user.email=acme@example.invalid', 'commit', '-qm', 'Acme source']); const start = git(['rev-parse', 'HEAD']);
  const corpusDir = join(app, 'lib/evaluation-corpus'), header = '// Acme private provenance-canary\n';
  await writeFile(join(corpusDir, 'probes/acme-target-private.mjs'), header + '// Acme target-body-canary\n');
  await writeFile(join(corpusDir, 'probes/acme-control-private.mjs'), header + '// Acme control-body-canary\n');
  await writeFile(join(corpusDir, 'probes/acme-original.txt'), Buffer.alloc(sourceBytes, 65));
  const catalog = { schemaVersion: 1, createdAt: '2026-10-23T00:00:00.000Z', repository: 'Acme/widget', license: 'Apache-2.0', image: 'sha256:' + 'a'.repeat(64), platform: 'linux/arm64',
    cases: Array.from({ length: 6 }, (_, i) => ({ id: i === 0 ? 'acme-control' : i === 1 ? 'acme-target' : `acme-unused-${i}`, version: 1, taskClass: i === 0 ? 'control' : 'compatibility', start, fix: 'b'.repeat(40), sources: i < 2 ? sources : sources.slice(0, 1), writable: [sources[0].path], brief: 'Acme public task', requirements: ['Acme public requirement'], probe: i === 0 ? 'acme-control-private.mjs' : 'acme-target-private.mjs', support: i === 0 ? ['acme-original.txt'] : [], stdout: 'Acme expected-output-canary', coverageLimits: [], closure: 'Acme reviewed closure' })),
    probeHeaders: { 'acme-target-private.mjs': header, 'acme-control-private.mjs': header } };
  const catalogBytes = JSON.stringify(catalog); await writeFile(join(corpusDir, 'catalog.json'), catalogBytes);
  const corpus = await import(pathToFileURL(join(app, 'lib/evaluation-corpus.mjs'))), api = await import(pathToFileURL(join(app, 'lib/evaluation-input-partition.mjs')));
  const definitions = await Promise.all(['acme-control', 'acme-target'].map(id => corpus.corpusDefinition(id))), lesson = material('acme-public-lesson', 'Acme public lesson');
  const manifest = manifestFor(definitions, byteDigest(catalogBytes), lesson), manifestPath = join(corpusDir, 'input-classification-v1.json');
  await writeFile(manifestPath, JSON.stringify(manifest));
  const b = bundle(definitions, lesson), sourcesExport = exportSource(repository, start, sources.map(s => s.path));
  const input = async (selected = b, index = 0, arm = 0) => ({ plan: plan(selected), caseRef: ref(selected.cases[index]), configurationRef: ref(selected.configurations[arm]), sourceFiles: structuredClone(sourcesExport), reviewed: await corpus.loadReviewedInputClassification() });
  return { dir, repository, corpus, api, definitions, lesson, manifest, manifestPath, b, input, sources: sourcesExport };
}
let w;
before(async () => { w = await fixture(); });
after(async () => { if (w) await rm(w.dir, { recursive: true, force: true }); });
function refuses(fn, code) {
  assert.throws(fn, e => { assert.ok(/^partition_[a-z_]+$/.test(e.message), 'fixed sanitized error'); assert.equal(e.message, e.code); assert.equal(e.exitCode, 2); assert.equal(e.cause, undefined); if (code) assert.equal(e.code, code); return true; });
}
async function classified(mutator, action) {
  const m = structuredClone(w.manifest); mutator(m); await writeFile(w.manifestPath, JSON.stringify(m));
  try { return await action(); } finally { await writeFile(w.manifestPath, JSON.stringify(w.manifest)); }
}
test('shared configurations prepare both case closures and arms with stable private reconstruction', async () => {
  for (const index of [0, 1]) for (const arm of [0, 1]) {
    const input = await w.input(w.b, index, arm), h = w.api.prepareInputPartition(input), v = w.api.publicInputView(h), p = w.api.projectPublicInput(v);
    assert.equal(input.plan.schemaVersion, 2); assert.equal(input.plan.bundle.schemaVersion, 3);
    assert.deepEqual(w.api.partitionIdentity(h), w.api.partitionIdentity(w.api.prepareInputPartition(input)));
    assert.deepEqual(w.api.partitionRecord(h).environment, input.plan.bundle.cases[index].environment);
    assert.deepEqual(p.files.map(f => f.path), ['source-000.txt', 'source-001.txt', 'lesson.txt']); assert.deepEqual(p.writablePaths, ['source-000.txt']);
    const serialized = JSON.stringify(p);
    assert.ok(!serialized.includes(w.definitions[index].probes[0].base64), 'private probe bytes absent even when encoded');
    for (const canary of ['private', 'canary', 'probes/', 'expected-output', 'classification', 'digest', 'provenance', '/Acme/']) assert.ok(!serialized.includes(canary), 'private canary absent');
    const reconstructed = w.api.reconstructEvaluatorInput(h, empty);
    const expected = w.definitions[index].probes;
    assert.ok(expected.every(f => reconstructed.files.some(r => JSON.stringify(r) === JSON.stringify(f))), 'all private dependencies retained');
    assert.equal(reconstructed.files.length, 4 + expected.length, 'classification does not duplicate file occurrences');
    assert.equal(reconstructed.driver.checks[0].stdout, 'Acme expected-output-canary');
    assert.ok(!reconstructed.files.some(f => f.path.includes(index === 0 ? 'target-private' : 'control-private')));
    if (index === 0) assert.equal(reconstructed.files.find(f => f.path === 'probes/acme-original.txt').base64, p.files[0].base64);
  }
});
test('actual corpus wrapper shape exports Git and uses the same pure preparation', async () => {
  const input = await w.input(); const args = { plan: input.plan, caseRef: input.caseRef, configurationRef: input.configurationRef, repository: w.repository, sourcePaths: w.sources.map(f => f.path) };
  const h = await w.corpus.prepareCorpusInputPartition(args);
  assert.deepEqual(w.api.partitionIdentity(h), w.api.partitionIdentity(w.api.prepareInputPartition(input)));
  await assert.rejects(w.corpus.prepareCorpusInputPartition({ ...args, sourcePaths: args.sourcePaths.slice(1) }), { code: 'partition_invalid' });
  await assert.rejects(w.corpus.prepareCorpusInputPartition({ ...args, repository: '/Acme/unavailable-private-path' }), { message: 'partition_invalid' });
});
test('only currency ceiling may vary from the exact reviewed case', async () => {
  const b = structuredClone(w.b); b.cases[0].limits.currencyUsd = 0.01; reseal(b); validateEvaluationBundle(b);
  const original = w.api.prepareInputPartition(await w.input()), funded = w.api.prepareInputPartition(await w.input(b));
  assert.notEqual(w.api.partitionIdentity(original).digest, w.api.partitionIdentity(funded).digest);
  assert.equal(w.api.partitionRecord(funded).case.digest, b.cases[0].digest);
  for (const change of [c => { c.publicBrief += ' altered'; }, c => { c.requirements.push('Acme changed'); }, c => { c.limits.minutes += 1; }, c => { c.allowlist.paths.push('source-001.txt'); }, c => { c.provenance.push('Acme altered'); }, c => { c.environment.platform = 'linux/amd64'; }, c => { c.acceptanceManifest = ref(w.definitions[1].acceptance); }]) {
    const bad = structuredClone(b); change(bad.cases[0]); reseal(bad); const input = await w.input(bad);
    refuses(() => w.api.prepareInputPartition(input), 'partition_binding_mismatch');
  }
});
test('brands and immutable snapshots separate public projection from reconstruction', async () => {
  const input = await w.input(), h = w.api.prepareInputPartition(input), v = w.api.publicInputView(h), identity = w.api.partitionIdentity(h);
  input.sourceFiles[0].base64 = Buffer.from('Acme changed').toString('base64'); input.plan.bundle.materials[0].content = 'Acme mutated';
  assert.throws(() => { v.files[0].base64 = ''; }, TypeError); assert.throws(() => { identity.digest = ''; }, TypeError);
  const copy = w.api.projectPublicInput(v); copy.files.length = 0; assert.ok(w.api.projectPublicInput(v).files.length);
  for (const value of [h, {}, JSON.parse(JSON.stringify(v)), w.api.partitionRecord(h)]) refuses(() => w.api.projectPublicInput(value));
  for (const value of [v, {}, JSON.parse(JSON.stringify(identity))]) refuses(() => w.api.reconstructEvaluatorInput(value, empty));
  refuses(() => w.api.prepareInputPartition({ ...input, reviewed: {} }), 'partition_unreviewed');
  assert.ok(w.api.reconstructEvaluatorInput(h, empty).files.some(f => f.path === 'probes/acme-original.txt'));
});
test('exact source bindings, plan, refs, closure and exclusions refuse without disclosure', async () => {
  for (const mutate of [x => { x.sourceFiles[0].base64 = Buffer.from('changed').toString('base64'); }, x => { x.sourceFiles[0].mode = '100755'; }, x => { x.sourceFiles.pop(); }, x => { x.sourceFiles.push(file('extra.txt', 'Acme')); }, x => { x.caseRef.digest = '0'.repeat(64); }, x => { x.configurationRef.digest = '0'.repeat(64); }, x => { x.plan.digest = '0'.repeat(64); }, x => { x.plan.schemaVersion = 3; }]) {
    const input = await w.input(); mutate(input); refuses(() => w.api.prepareInputPartition(input));
  }
  const missing = structuredClone(w.b); missing.materials = missing.materials.filter(m => m.id !== 'acme-original-txt'); const input = await w.input(missing);
  refuses(() => w.api.prepareInputPartition(input), 'partition_incomplete');
  const excluded = structuredClone(w.b); excluded.configurations.forEach(c => c.exclusions.push('source-001.txt')); reseal(excluded);
  const excludedInput = await w.input(excluded); refuses(() => w.api.prepareInputPartition(excludedInput), 'partition_unsupported');
  const wrongMaterial = structuredClone(w.b); wrongMaterial.materials.find(m => m.id === 'acme-original-txt').content += 'changed';
  wrongMaterial.materials = wrongMaterial.materials.map(sealRecord); const wrong = await w.input(wrongMaterial);
  refuses(() => w.api.prepareInputPartition(wrong), 'partition_incomplete');
});
test('unreviewed public materials and private relabeling cannot enter shared config', async () => {
  for (const entry of [{ path: 'renamed.txt', material: ref(w.lesson) }, { path: 'probes/acme-original.txt', material: ref(w.definitions[0].materials[1]) }]) {
    const b = structuredClone(w.b); b.configurations[0].overlays.push(entry); reseal(b); const input = await w.input(b);
    refuses(() => w.api.prepareInputPartition(input), 'partition_unreviewed');
  }
  await classified(m => { m.publicMaterials.push({ ...m.cases[0].evaluatorFiles[0] }); m.publicMaterials.sort((a, b) => a.path < b.path ? -1 : 1); }, async () => {
    await assert.rejects(w.corpus.loadReviewedInputClassification(), { code: 'partition_unreviewed' });
  });
});
test('cross-role and requirements collisions refuse before merging files', async () => {
  for (const path of ['source-000.txt', 'source-000.txt/child', 'requirements.json', 'probes/acme-original.txt', 'probes']) {
    await classified(m => { m.publicMaterials[0].path = path; }, async () => {
      const b = structuredClone(w.b); b.configurations[0].context[0].path = path; reseal(b); const input = await w.input(b);
      refuses(() => w.api.prepareInputPartition(input), 'partition_collision');
    });
  }
  const b = structuredClone(w.b); b.configurations[0].overlays.push(b.configurations[0].context[0]); reseal(b); const input = await w.input(b);
  refuses(() => w.api.prepareInputPartition(input), 'partition_collision');
});
test('submission changes only existing writable bytes, never modes or private dependencies', async () => {
  const h = w.api.prepareInputPartition(await w.input());
  const changed = w.api.reconstructEvaluatorInput(h, JSON.stringify({ schemaVersion: 1, files: [file('source-000.txt', 'Acme replacement')] }));
  assert.equal(changed.files.find(f => f.path === 'source-000.txt').base64, Buffer.from('Acme replacement').toString('base64'));
  for (const f of [file('source-001.txt', 'A'.repeat(10), '100755'), file('source-000.txt', 'Acme', '100755'), file('source-001.txt', 'Acme'), file('lesson.txt', 'Acme'), file('requirements.json', 'Acme'), file('new.txt', 'Acme'), file('probes/acme-original.txt', 'Acme')]) {
    refuses(() => w.api.reconstructEvaluatorInput(h, JSON.stringify({ schemaVersion: 1, files: [f] })));
  }
  const again = w.api.reconstructEvaluatorInput(h, empty); assert.ok(w.definitions[0].probes.every(p => again.files.some(f => fingerprint(f) === fingerprint(p))), 'private bytes cannot be omitted');
});
test('strict new parser rejects duplicate keys, UTF8, surrogates and deep JSON', async () => {
  for (const bytes of [Buffer.from('{"x":1,"x":2}'), Buffer.from('{"x":1,"\\u0078":2}'), Buffer.from('"\\ud800"'), Buffer.from([0x22, 0xff, 0x22]), Buffer.from('['.repeat(17) + '0' + ']'.repeat(17)), Buffer.from('null trailing')]) refuses(() => w.api.parsePartitionJson(bytes));
  assert.equal(w.api.parsePartitionJson(Buffer.from('"Acme 😀"')), 'Acme 😀');
  const h = w.api.prepareInputPartition(await w.input());
  for (const s of ['{"schemaVersion":1,"files":[],"files":[]}', '{"schemaVersion":1,"files":[],"private-canary":"\\ud800"}', empty + ' '.repeat(393217), '"\ud800"']) refuses(() => w.api.reconstructEvaluatorInput(h, s));
  assert.ok(w.api.reconstructEvaluatorInput(h, empty + ' '.repeat(393216 - Buffer.byteLength(empty))).files.length);
});
test('installed classification refuses drift, incomplete, duplicate and unordered rows', async () => {
  for (const mutate of [m => { m.catalogDigest = '0'.repeat(64); }, m => { m.cases[0].sources[0].blob = '0'.repeat(40); }, m => { m.cases[0].evaluatorFiles.pop(); }, m => { m.cases.reverse(); }, m => { m.cases[0].sources.reverse(); }, m => { m.cases.push(m.cases[0]); }, m => { m.extra = 'Acme private-canary'; }]) {
    await classified(mutate, async () => { await assert.rejects(w.corpus.loadReviewedInputClassification(), { code: 'partition_unreviewed', message: 'partition_unreviewed' }); });
  }
  const h = w.api.prepareInputPartition(await w.input());
  await classified(m => { m.revision++; }, async () => { const changed = w.api.prepareInputPartition(await w.input()); assert.notEqual(w.api.partitionIdentity(h).digest, w.api.partitionIdentity(changed).digest); });
});
test('initial and reconstructed combined bounds include retained private files exactly once', async t => {
  const large = await fixture({ sourceCount: 124, sourceBytes: 1 }); t.after(() => rm(large.dir, { recursive: true, force: true }));
  // 124 sources + lesson + requirements + two private files = 128.
  const h = large.api.prepareInputPartition(await large.input()); assert.equal(large.api.reconstructEvaluatorInput(h, empty).files.length, 128);
  const b = structuredClone(large.b); const extra = material('acme-extra', 'A'); b.materials.push(extra); b.configurations[0].overlays.push({ path: 'extra.txt', material: ref(extra) }); reseal(b);
  const m = structuredClone(large.manifest); m.publicMaterials.unshift({ path: 'extra.txt', material: ref(extra), ...meta(Buffer.from(extra.content)) }); await writeFile(large.manifestPath, JSON.stringify(m));
  const input = await large.input(b); refuses(() => large.api.prepareInputPartition(input), 'partition_bounds');
  const basic = w.api.prepareInputPartition(await w.input()), original = w.api.reconstructEvaluatorInput(basic, empty).files;
  const otherBytes = original.filter(f => f.path !== 'source-000.txt').reduce((n, f) => n + Buffer.byteLength(f.base64, 'base64'), 0);
  const payload = n => JSON.stringify({ schemaVersion: 1, files: [file('source-000.txt', 'A'.repeat(n))] });
  assert.equal(w.api.reconstructEvaluatorInput(basic, payload(262144 - otherBytes)).files.reduce((n, f) => n + Buffer.byteLength(f.base64, 'base64'), 0), 262144);
  refuses(() => w.api.reconstructEvaluatorInput(basic, payload(262145 - otherBytes)), 'partition_bounds');
});
test('historical metadata and actual wrapper preserve complete public inventory with narrow writable paths', async () => {
  const definitions = await Promise.all(['package-entry', 'workspace-command-doc'].map(id => installed.corpusDefinition(id))), b = bundle(definitions);
  validateEvaluationBundle(b);
  for (let i = 0; i < definitions.length; i++) {
    const d = definitions[i], p = plan(b), h = await installed.prepareCorpusInputPartition({ plan: p, caseRef: ref(b.cases[i]), configurationRef: ref(b.configurations[0]), repository: root, sourcePaths: d.definition.sources.map(s => s.path) });
    const v = partition.projectPublicInput(partition.publicInputView(h)), reconstructed = partition.reconstructEvaluatorInput(h, empty);
    assert.ok(d.probes.every(p => reconstructed.files.some(f => fingerprint(f) === fingerprint(p))), 'historical private bytes retained without printing bodies');
    assert.deepEqual(v.files.map(f => f.path).sort(), d.definition.sources.map(s => s.path).sort());
    if (d.task.id === 'workspace-command-doc') { assert.deepEqual(v.files.map(f => f.path), ['README.md', 'lib/cli.mjs']); assert.deepEqual(v.writablePaths, ['README.md']); }
  }
});
test('legacy offline delivery and exclusions remain exact before and after partition preparation', async () => {
  const b = structuredClone(w.b), task = b.cases[0];
  b.configurations.forEach(c => { c.context = []; c.overlays = w.definitions[0].probes.map((f, i) => ({ path: f.path, material: ref(w.definitions[0].materials[i]) })); c.exclusions = ['source-001.txt']; }); reseal(b);
  const config = b.configurations[0], command = ['node', '/work/probes/acme-control-private.mjs'];
  const before = JSON.stringify(composeExecutionDelivery(b, task, config, w.sources, command));
  w.api.prepareInputPartition(await w.input());
  assert.equal(JSON.stringify(composeExecutionDelivery(b, task, config, w.sources, command)), before);
  const expected = [...w.sources.filter(f => f.path !== 'source-001.txt'), ...w.definitions[0].probes, file('requirements.json', JSON.stringify({ publicBrief: task.publicBrief, requirements: task.requirements }))].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  assert.equal(JSON.stringify(JSON.parse(before).delivered), JSON.stringify(expected));
});

test('code-point manifest ordering preserves occurrence order and malformed wrapper inputs stay sanitized', async () => {
  const paths = ['\ue000.txt', '\u{10000}.txt'];
  await classified(m => {
    m.publicMaterials = paths.map(path => ({ ...m.publicMaterials[0], path }));
  }, async () => {
    const b = structuredClone(w.b); b.configurations[0].context = [...paths].reverse().map(path => ({ path, material: ref(w.lesson) })); reseal(b);
    const h = w.api.prepareInputPartition(await w.input(b));
    assert.deepEqual(w.api.projectPublicInput(w.api.publicInputView(h)).files.slice(-2).map(f => f.path), [...paths].reverse());
  });
  await classified(m => { m.publicMaterials = [...paths].reverse().map(path => ({ ...m.publicMaterials[0], path })); }, async () => {
    await assert.rejects(w.corpus.loadReviewedInputClassification(), { code: 'partition_unreviewed' });
  });
  for (const value of [undefined, null, {}, { plan: 'Acme private-canary' }]) await assert.rejects(w.corpus.prepareCorpusInputPartition(value), { message: 'partition_invalid', code: 'partition_invalid', exitCode: 2 });
});

function observeGit(t, onCall) {
  const original = childProcess.spawnSync;
  childProcess.spawnSync = (...args) => {
    if (args[0] === '/usr/bin/git') onCall(args);
    return original(...args);
  };
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawnSync = original; syncBuiltinESMExports(); });
}
async function wrapperOptions() {
  const input = await w.input();
  return { plan: input.plan, caseRef: input.caseRef, configurationRef: input.configurationRef, repository: w.repository, sourcePaths: w.sources.map(f => f.path) };
}
test('wrapper rejects invalid reviewed selections and inventories before any Git command', async t => {
  let calls = 0; observeGit(t, () => { calls++; });
  const mutations = [
    x => { x.plan.digest = '0'.repeat(64); },
    x => { x.caseRef.digest = '0'.repeat(64); },
    x => { x.configurationRef.digest = '0'.repeat(64); },
    x => { x.sourcePaths.pop(); },
    x => { x.sourcePaths.push('Acme-private-extra.txt'); },
    x => { x.sourcePaths[1] = x.sourcePaths[0]; },
    x => { x.sourcePaths[0] = '../Acme-private.txt'; },
    x => { const b = x.plan.bundle; b.cases[0].startingCommit = '0'.repeat(40); reseal(b); x.plan = plan(b); x.caseRef = ref(b.cases[0]); x.configurationRef = ref(b.configurations[0]); },
    x => { const b = x.plan.bundle; b.configurations.forEach(c => c.exclusions.push('source-001.txt')); reseal(b); x.plan = plan(b); x.configurationRef = ref(b.configurations[0]); },
    x => { const b = x.plan.bundle; b.configurations[0].context[0].path = 'Acme-unreviewed.txt'; reseal(b); x.plan = plan(b); x.configurationRef = ref(b.configurations[0]); },
  ];
  for (const mutate of mutations) {
    const options = await wrapperOptions(); mutate(options);
    await assert.rejects(w.corpus.prepareCorpusInputPartition(options), { code: 'partition_invalid' });
    assert.equal(calls, 0, 'invalid selection must issue zero Git commands');
  }
  const valid = await wrapperOptions(); valid.sourcePaths.reverse();
  const h = await w.corpus.prepareCorpusInputPartition(valid);
  assert.equal(calls, 4, 'valid two-file inventory actually exercises the Git observer');
  assert.deepEqual(w.api.publicInputView(h).files.slice(0, 2).map(f => f.path), ['source-000.txt', 'source-001.txt']);
});
test('wrapper passes one aggregate deadline through every Git subprocess and refuses expiry', async t => {
  const originalNow = Date.now; let now = 100000, step = 1000; const timeouts = [];
  Date.now = () => now; t.after(() => { Date.now = originalNow; });
  observeGit(t, args => { timeouts.push(args[2].timeout); now += step; });
  const options = await wrapperOptions();
  await w.corpus.prepareCorpusInputPartition(options);
  assert.deepEqual(timeouts, [10000, 9000, 8000, 7000], 'Git timeouts must spend one shared preparation budget');
  timeouts.length = 0; step = 6000;
  await assert.rejects(w.corpus.prepareCorpusInputPartition(options), { code: 'partition_invalid' });
  assert.deepEqual(timeouts, [10000, 4000], 'expired aggregate budget prevents the next Git subprocess');
  timeouts.length = 0; step = 2500;
  await assert.rejects(w.corpus.prepareCorpusInputPartition(options), { code: 'partition_invalid' });
  assert.deepEqual(timeouts, [10000, 7500, 5000, 2500], 'completion at the deadline cannot return a prepared result');
});
test('wrapper snapshots caller values before asynchronous classification reads', async () => {
  const options = await wrapperOptions(), expected = w.api.partitionIdentity(w.api.prepareInputPartition(await w.input()));
  const pending = w.corpus.prepareCorpusInputPartition(options);
  options.sourcePaths.length = 0; options.plan.bundle.cases[0].publicBrief = 'Acme changed while awaiting'; options.configurationRef.digest = '0'.repeat(64);
  assert.deepEqual(w.api.partitionIdentity(await pending), expected);
});
