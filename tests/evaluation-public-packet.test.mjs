// Synthetic reviewed Acme views only; no provider or Docker execution.
import './helpers/hermetic.mjs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture, file, ref, meta, reseal, root } from './helpers/evaluation-input-partition.mjs';
import { fingerprint, sealRecord, byteDigest } from '../lib/evaluation-records.mjs';
import { ARTIFACT_BYTES, FILE_LIMIT } from '../lib/evaluation-artifacts.mjs';

const model = { requested: 'acme-alias', resolved: 'acme-resolved' };
const format = 'utf8-file-replacements-v1';
const response = files => JSON.stringify({ schemaVersion: 1, format, files });
const replacement = (content = 'Acme changed', path = 'source-000.txt', mode = '100644') => ({ path, mode, content });
const noChanges = response([]);
const refuses = (fn, code = 'public_result_invalid') => assert.throws(fn, e => {
  assert.equal(e.code, code); assert.equal(e.message, code); assert.equal(e.exitCode, 2);
  assert.equal(e.cause, undefined); assert.equal(e.stack.includes('Acme-private-error-canary'), false); return true;
});
async function packetFixture(options) {
  const w = await fixture(options);
  w.packet = await import(pathToFileURL(join(w.app, 'lib/evaluation-public-packet.mjs')));
  w.provider = await import(pathToFileURL(join(w.app, 'lib/evaluation-provider.mjs')));
  w.handle = w.api.prepareInputPartition(await w.input()); w.view = w.api.publicInputView(w.handle);
  return w;
}
let w;
before(async () => { w = await packetFixture(); });
after(async () => { if (w) await rm(w.dir, { recursive: true, force: true }); });

test('public packet accepts only branded views and sanitizes closed-shape failures', () => {
  for (const view of [w.handle, {}, w.api.partitionRecord(w.handle), w.api.partitionIdentity(w.handle),
    structuredClone(w.view), JSON.parse(JSON.stringify(w.view)), w.api.projectPublicInput(w.view), new Proxy(w.view, {})]) {
    refuses(() => w.packet.preparePublicPacket({ view, model }), 'public_packet_invalid');
    refuses(() => w.packet.convertPublicResult({ view, text: noChanges }));
  }
  refuses(() => w.packet.preparePublicPacket({ view: w.view, model, instructions: 'Acme-private-error-canary' }), 'public_packet_invalid');
  refuses(() => w.packet.preparePublicPacket({ view: w.view, model: { requested: 'acme', resolved: null } }), 'public_packet_invalid');
  refuses(() => w.packet.convertPublicResult({ view: w.view, text: noChanges, evaluator: 'Acme-private-error-canary' }));
  refuses(() => w.packet.convertPublicResult({ view: w.view, get text() { throw Error('Acme-private-error-canary'); } }));
});

test('public packet preserves fixed template and public bytes while excluding unique private canaries', async () => {
  const prepared = w.packet.preparePublicPacket({ view: w.view, model }), payload = JSON.parse(prepared.packet.input);
  assert.deepEqual(Object.keys(payload).sort(), ['files', 'kind', 'publicBrief', 'requirements', 'schemaVersion', 'writablePaths']);
  assert.equal(payload.kind, 'evaluation-public-packet'); assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.publicBrief, w.view.publicBrief); assert.deepEqual(payload.requirements, w.view.requirements);
  assert.deepEqual(payload.files.map(f => ({ ...f, content: undefined })), w.view.files.map(f => ({ path: f.path, mode: f.mode, content: undefined })));
  for (let i = 0; i < payload.files.length; i++) assert.deepEqual(Buffer.from(payload.files[i].content), Buffer.from(w.view.files[i].base64, 'base64'));
  const contract = await readFile(join(root, 'docs/specs/harness-public-packet.md'), 'utf8');
  assert.equal(prepared.packet.instructions, contract.match(/```text\n([\s\S]*?)```/)[1]);
  assert.equal(prepared.templateDigest, byteDigest(prepared.packet.instructions));
  assert.equal(prepared.templateVersion, 'evaluation-public-packet-v1'); assert.equal(prepared.responseFormat, format);
  assert.deepEqual(sealRecord(prepared), prepared);
  assert.equal(prepared.publicViewDigest, w.api.partitionIdentity(w.handle).publicViewDigest);
  const uniquePrivateCanaries = ['Acme private provenance-canary', 'Acme control-body-canary', 'Acme target-body-canary', 'Acme expected-output-canary',
    w.api.partitionIdentity(w.handle).partitionDigest, w.api.partitionIdentity(w.handle).acceptanceDigest,
    ...w.definitions.flatMap(d => [d.task.id, d.acceptance.id, ...d.probes.map(f => f.path), ...d.materials.map(m => m.id)])];
  for (const value of uniquePrivateCanaries) assert.equal(JSON.stringify(prepared).includes(value), false, 'unique private identity/value absent');
  assert.ok(w.api.reconstructEvaluatorInput(w.handle, '{"schemaVersion":1,"files":[]}').files.some(f => f.path === 'probes/acme-original.txt'));
});

test('reviewed public README bytes remain public when private evaluator support contains identical bytes', async t => {
  const shared = Buffer.alloc(10, 65);
  const custom = await packetFixture({ sourceFiles: [file('README.md', shared)] });
  t.after(() => rm(custom.dir, { recursive: true, force: true }));
  const original = custom.api.reconstructEvaluatorInput(custom.handle, '{"schemaVersion":1,"files":[]}');
  const privateSupport = original.files.find(f => f.path === 'probes/acme-original.txt');
  assert.deepEqual(Buffer.from(privateSupport.base64, 'base64'), shared);
  const prepared = custom.packet.preparePublicPacket({ view: custom.view, model });
  const publicReadme = JSON.parse(prepared.packet.input).files.find(f => f.path === 'README.md');
  assert.deepEqual(Buffer.from(publicReadme.content), shared);
  assert.equal(JSON.stringify(prepared).includes(privateSupport.path), false);
  const converted = custom.packet.convertPublicResult({ view: custom.view, text: response([replacement('Acme changed README', 'README.md')]) });
  assert.deepEqual(custom.api.reconstructEvaluatorInput(custom.handle, converted).files.find(f => f.path === privateSupport.path), privateSupport);
});

test('public packet snapshots are stable and explicit model identity binds locally and on wire', () => {
  const supplied = { ...model }, first = w.packet.preparePublicPacket({ view: w.view, model: supplied });
  supplied.requested = 'acme-other';
  const alias = w.packet.preparePublicPacket({ view: w.view, model: supplied });
  assert.equal(first.packetDigest, alias.packetDigest); assert.notEqual(first.digest, alias.digest);
  assert.notEqual(first.packetDigest, w.packet.preparePublicPacket({ view: w.view, model: { ...model, resolved: 'acme-other' } }).packetDigest);
  assert.equal(w.provider.prepareEvaluationProviderPacket({ model, packet: first.packet }).packetDigest, first.packetDigest);
  assert.throws(() => { first.packet.input = 'Acme changed'; }, TypeError);
  const detached = w.api.projectPublicInput(w.view); detached.files[0].base64 = '';
  assert.deepEqual(w.packet.preparePublicPacket({ view: w.view, model }), first);
});

test('public-identical classification changes bind privately without changing provider packet', async () => {
  const first = w.packet.preparePublicPacket({ view: w.view, model }), original = await readFile(w.manifestPath);
  const changed = structuredClone(w.manifest); changed.revision++;
  await writeFile(w.manifestPath, JSON.stringify(changed));
  try {
    const handle = w.api.prepareInputPartition(await w.input()), next = w.packet.preparePublicPacket({ view: w.api.publicInputView(handle), model });
    assert.equal(next.packetDigest, first.packetDigest); assert.equal(next.digest, first.digest);
    assert.notEqual(w.api.partitionIdentity(handle).digest, w.api.partitionIdentity(w.handle).digest);
    const local = h => sealRecord({ schemaVersion: 1, kind: 'evaluation-public-packet-binding', preparationDigest: first.digest,
      publicViewDigest: first.publicViewDigest, partitionIdentityDigest: w.api.partitionIdentity(h).digest, controllerDigest: 'a'.repeat(64), bridgeDigest: 'b'.repeat(64) });
    assert.notEqual(local(handle).digest, local(w.handle).digest);
  } finally { await writeFile(w.manifestPath, original); }
});

test('public packet preserves authored public overlay order and refuses an oversized packet', async t => {
  const original = await readFile(w.manifestPath), m = structuredClone(w.manifest), b = structuredClone(w.b);
  const paths = ['a-context.txt', 'z-overlay.txt'];
  m.publicMaterials = paths.map(path => ({ path, material: ref(w.lesson), ...meta(Buffer.from(w.lesson.content)) }));
  b.configurations[0].context = [{ path: paths[1], material: ref(w.lesson) }];
  b.configurations[0].overlays = [{ path: paths[0], material: ref(w.lesson) }]; reseal(b);
  await writeFile(w.manifestPath, JSON.stringify(m));
  try {
    const handle = w.api.prepareInputPartition(await w.input(b));
    const payload = JSON.parse(w.packet.preparePublicPacket({ view: w.api.publicInputView(handle), model }).packet.input);
    assert.deepEqual(payload.files.slice(-2).map(f => f.path), [...paths].reverse());
  } finally { await writeFile(w.manifestPath, original); }
  const large = await packetFixture({ sourceFiles: [file('source-000.txt', '"'.repeat(132000))] });
  t.after(() => rm(large.dir, { recursive: true, force: true }));
  // JSON escaping exceeds the packet cap although decoded source fits artifact bounds.
  const target = large.api.prepareInputPartition(await large.input(large.b, 1));
  refuses(() => large.packet.preparePublicPacket({ view: large.api.publicInputView(target), model }), 'public_packet_invalid');
});

test('public packet text decoding preserves BOM and Unicode and rejects malformed or NUL bytes', async t => {
  for (const content of [Buffer.from('\ufeffAcme 😀\r\n'), Buffer.from([0xff]), Buffer.from('Acme\0text')]) {
    const custom = await packetFixture({ sourceFiles: [{ path: 'acme.txt', mode: '100644', base64: content.toString('base64') }] });
    t.after(() => rm(custom.dir, { recursive: true, force: true }));
    if (content[0] === 0xef) {
      const payload = JSON.parse(custom.packet.preparePublicPacket({ view: custom.view, model }).packet.input);
      assert.deepEqual(Buffer.from(payload.files[0].content), content);
    } else refuses(() => custom.packet.preparePublicPacket({ view: custom.view, model }), 'public_packet_invalid');
  }
});

test('UTF8 result conversion keeps the existing bridge envelope and private reconstruction unchanged', () => {
  const content = '\ufeffAcme 😀\r\n', text = response([replacement(content)]);
  const converted = w.packet.convertPublicResult({ view: w.view, text });
  assert.equal(converted, JSON.stringify({ schemaVersion: 1, files: [{ path: 'source-000.txt', mode: '100644', base64: Buffer.from(content).toString('base64') }] }));
  const rebuilt = w.api.reconstructEvaluatorInput(w.handle, converted), original = w.api.reconstructEvaluatorInput(w.handle, '{"schemaVersion":1,"files":[]}');
  assert.deepEqual(rebuilt.driver, original.driver);
  for (const f of original.files.filter(f => f.path !== 'source-000.txt')) assert.deepEqual(rebuilt.files.find(x => x.path === f.path), f);
  assert.equal(w.packet.convertPublicResult({ view: w.view, text: noChanges }), '{"schemaVersion":1,"files":[]}');
  assert.equal(JSON.parse(w.packet.convertPublicResult({ view: w.view, text: response([replacement('')]) })).files[0].base64, '');
});

test('UTF8 result conversion rejects duplicate keys, invalid Unicode and unsupported shapes', () => {
  const invalid = [undefined, {}, Buffer.from(noChanges), '', '\ud800', '\udfff', '\0', '\ufeff' + noChanges, noChanges + ' trailing',
    '{"schemaVersion":1,"schemaVersion":1,"format":"utf8-file-replacements-v1","files":[]}',
    '{"schemaVersion":1,"format":"utf8-file-replacements-v1","files":[],"\\u0066iles":[]}',
    '{"schemaVersion":1,"format":"utf8-file-replacements-v1","files":[{"path":"source-000.txt","mode":"100644","content":"x","content":"y"}]}',
    response([replacement('\ud800')]), response([replacement('\udfff')]), response([replacement('Acme\0text')]), response([replacement('x', '\ud800')]),
    '{"schemaVersion":1,"format":"utf8-file-replacements-v1","files":[],"\\ud800":1}',
    '['.repeat(17) + '0' + ']'.repeat(17), '```json\n' + noChanges + '\n```',
    '{"schemaVersion":1,"format":"utf8-file-replacements-v1","files":[{"path":"source-000.txt","mode":"100644","content":"\\x20"}]}',
    JSON.stringify({ schemaVersion: '1', format, files: [] }), JSON.stringify({ schemaVersion: 1, format: 'base64', files: [] }),
    JSON.stringify({ schemaVersion: 1, format, files: [], hidden: 'Acme-private-error-canary' }),
    response([{ ...replacement(), extra: true }]), response([{ path: 'source-000.txt', mode: '100644', base64: 'QQ==' }]),
    response([{ ...replacement(), content: null }])];
  for (const text of invalid) refuses(() => w.packet.convertPublicResult({ view: w.view, text }));
});

test('UTF8 result conversion rejects new, evaluator, read-only, aliased and changed-mode replacements', () => {
  for (const path of ['new.txt', 'source-001.txt', 'lesson.txt', 'requirements.json', 'probes/acme-control-private.mjs',
    '../source-000.txt', '/source-000.txt', './source-000.txt', 'a/../source-000.txt', 'a\\source-000.txt', '.git/config', '-source-000.txt', 'a:b', 'x'.repeat(101)])
    refuses(() => w.packet.convertPublicResult({ view: w.view, text: response([replacement('Acme', path)]) }));
  for (const mode of ['100755', '120000', '100600', 100644]) refuses(() => w.packet.convertPublicResult({ view: w.view, text: response([replacement('Acme', 'source-000.txt', mode)]) }));
  refuses(() => w.packet.convertPublicResult({ view: w.view, text: response([replacement(), replacement()]) }));
  refuses(() => w.packet.convertPublicResult({ view: w.view, text: response([replacement(), replacement('x', 'source-000.txt/child')]) }));
});

test('UTF8 result conversion retains executable mode and sorts replacements by UTF8 bytes', async t => {
  const custom = await packetFixture({ sourceFiles: [file('é.txt', 'Acme accent', '100755'), file('z.txt', 'Acme z')], writablePaths: ['é.txt', 'z.txt'] });
  t.after(() => rm(custom.dir, { recursive: true, force: true }));
  const files = [replacement('Acme é', 'é.txt', '100755'), replacement('Acme z', 'z.txt')];
  const first = custom.packet.convertPublicResult({ view: custom.view, text: response(files) });
  assert.equal(first, custom.packet.convertPublicResult({ view: custom.view, text: response([...files].reverse()) }));
  assert.deepEqual(JSON.parse(first).files.map(f => [f.path, f.mode]), [['z.txt', '100644'], ['é.txt', '100755']]);
  assert.ok(custom.api.reconstructEvaluatorInput(custom.handle, first).files.some(f => f.path === 'é.txt' && f.mode === '100755'));
});

test('UTF8 result conversion enforces raw, replacement and reconstructed public bounds', () => {
  const cap = 393216;
  assert.equal(w.packet.convertPublicResult({ view: w.view, text: noChanges + ' '.repeat(cap - Buffer.byteLength(noChanges)) }), '{"schemaVersion":1,"files":[]}');
  refuses(() => w.packet.convertPublicResult({ view: w.view, text: noChanges + ' '.repeat(cap - Buffer.byteLength(noChanges) + 1) }));
  refuses(() => w.packet.convertPublicResult({ view: w.view, text: response(Array.from({ length: FILE_LIMIT + 1 }, () => replacement())) }));
  refuses(() => w.packet.convertPublicResult({ view: w.view, text: response([replacement('x'.repeat(ARTIFACT_BYTES + 1))]) }));
  const publicOverhead = w.view.files.filter(f => f.path !== 'source-000.txt').reduce((n, f) => n + Buffer.from(f.base64, 'base64').length, 0)
    + Buffer.byteLength(JSON.stringify({ publicBrief: w.view.publicBrief, requirements: w.view.requirements }));
  const content = 'x'.repeat(ARTIFACT_BYTES - publicOverhead);
  const converted = w.packet.convertPublicResult({ view: w.view, text: response([replacement(content)]) });
  assert.ok(Buffer.byteLength(converted) <= cap);
  assert.equal(JSON.parse(converted).files[0].base64.length, 4 * Math.ceil(Buffer.byteLength(content) / 3));
  refuses(() => w.packet.convertPublicResult({ view: w.view, text: response([replacement(content + 'x')]) }));
  // Public-only validation cannot silently omit the retained private files.
  assert.throws(() => w.api.reconstructEvaluatorInput(w.handle, converted));
});

test('pure packet and converter perform no fetch, process execution or filesystem writes', t => {
  let calls = 0; const denied = () => { calls++; throw Error('Acme forbidden effect'); };
  const original = { writeFile: fsPromises.writeFile, writeFileSync: fs.writeFileSync, spawnSync: childProcess.spawnSync, spawn: childProcess.spawn, execFile: childProcess.execFile };
  t.mock.method(globalThis, 'fetch', denied);
  fsPromises.writeFile = denied; fs.writeFileSync = denied; childProcess.spawnSync = denied; childProcess.spawn = denied; childProcess.execFile = denied;
  syncBuiltinESMExports();
  try {
    assert.ok(w.packet.preparePublicPacket({ view: w.view, model }).packetDigest);
    assert.ok(w.packet.convertPublicResult({ view: w.view, text: response([replacement()]) }));
    assert.equal(calls, 0);
  } finally {
    fsPromises.writeFile = original.writeFile; fs.writeFileSync = original.writeFileSync;
    childProcess.spawnSync = original.spawnSync; childProcess.spawn = original.spawn; childProcess.execFile = original.execFile;
    syncBuiltinESMExports();
  }
});
