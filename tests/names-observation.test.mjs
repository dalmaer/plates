import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { OBSERVATION_LIMITS, NamesObservationError, observationArtifactName, validateObservation,
  encodeObservation, decodeObservation, observationFiles, decodeObservationArchive } from '../lib/names-observation.mjs';
import * as rendered from '../scripts/plates/names-observation.mjs';

const h = b => createHash('sha256').update(b).digest('hex');
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), at = '2026-10-24T10:00:00Z';
const source = path => ({ repositoryId: 10, commitSha: A, path, blobSha: B, sha256: h(path) });
const present = content => ({ state: 'present', commitSha: A, blobSha: B, sha256: h(content), labelIds: [], providerUpdatedAt: null });
function fixture() {
  const body = Buffer.from('<!-- plates:health-report:begin -->\nAcme generated health\n'), projection = Buffer.from('{"date":"2026-10-24","items":[]}\n');
  const fragments = new Map([['fragments/health.txt', body], ['fragments/plan.txt', projection]]);
  const observation = {
    schema: 1, kind: 'night', repository: { id: 10, fullName: 'Acme/project' },
    execution: { workflowPath: '.github/workflows/night.yml', runId: 20, runAttempt: 2, event: 'workflow_dispatch', headSha: A, codeSha: A, startedAt: at, finishedAt: at, codeIdentity: null },
    scope: { workflow: source('.github/workflows/night.yml'), configuration: source('.plates/plates.json'), runtime: { codeSha: A, sourceFiles: [source('scripts/plates/improve.mjs')] }, producers: [{ id: 'improve', job: 'night', step: 'night/improve', source: source('scripts/plates/improve.mjs'), mode: 'enabled', reason: null }] },
    originatingNight: null,
    association: { kind: 'night', date: '2026-10-24', branch: 'plates-night/2026-10-24', leaseId: null, preexisting: false, preimageHeadSha: null, prId: 30, prNumber: 3, headSha: A, planPath: '.plates/plan.json', planBlobSha: B },
    producers: [{ id: 'improve', job: 'night', step: 'night/improve', outcome: 'completed', observedAt: at, reason: null }],
    writes: [{ producerId: 'improve', sequence: 1, operationId: null, target: { kind: 'pr', repositoryId: 10, id: 30, number: 3, headSha: A }, outcome: 'confirmed', before: null,
      intended: { fragment: 'fragments/health.txt', sha256: h(body), names: [{ rowId: 'marker:keel:health-report:begin', value: 'plates:health-report:begin' }] }, after: present(body), observedAt: at }],
    reads: [{ consumer: 'board', sourceKind: 'plan', repositoryId: 10, ref: 'plates-night-plan', path: 'plan.json', commitSha: A, blobSha: B, sha256: h(projection), state: 'read', absence: null, selected: true, contributed: true, outputSection: 'plan', outputProjection: { fragment: 'fragments/plan.txt', sha256: h(projection) }, recordIds: [] }],
    projections: [], artifacts: [], fragments: [...fragments].map(([path, b]) => ({ path, bytes: b.length, sha256: h(b), kind: path.includes('health') ? 'managed-fragment' : 'projection' })), gaps: [],
  };
  return { observation, fragments };
}
const rejects = (fn, code) => assert.throws(fn, e => e instanceof NamesObservationError && (!code || e.code === code));
const plain = v => JSON.parse(JSON.stringify(v));
// Real ZIP bytes exercise the production reader; no mocked archive verdicts.
function zip(files, { method = 0, descriptor = false, overrides = [] } = {}) {
  const locals = [], centrals = []; let offset = 0;
  [...files].forEach(([name, bytes], i) => {
    const o = overrides[i] ?? {}; const n = Buffer.from(o.name ?? name), b = Buffer.from(bytes), packed = method === 8 ? deflateRawSync(b) : b;
    const extra = o.extra ?? Buffer.alloc(0), local = Buffer.alloc(30), central = Buffer.alloc(46), flags = o.flags ?? (descriptor ? 0x808 : 0x800);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(o.method ?? method, 8);
    if (!descriptor) { local.writeUInt32LE(crc32(b), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(b.length, 22); }
    local.writeUInt16LE(n.length, 26); local.writeUInt16LE(extra.length, 28);
    let tail = Buffer.alloc(0);
    if (descriptor) { tail = Buffer.alloc(16); tail.writeUInt32LE(0x08074b50); tail.writeUInt32LE(crc32(b), 4); tail.writeUInt32LE(packed.length, 8); tail.writeUInt32LE(b.length, 12); }
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(o.method ?? method, 10);
    central.writeUInt32LE(crc32(b), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(o.bytes ?? b.length, 24);
    central.writeUInt16LE(n.length, 28); central.writeUInt16LE(extra.length, 30); central.writeUInt32LE(((o.mode ?? 0o100644) << 16) >>> 0, 38); central.writeUInt32LE(o.offset ?? offset, 42);
    locals.push(local, n, extra, packed, tail); centrals.push(central, n, extra); offset += local.length + n.length + extra.length + packed.length + tail.length;
  });
  const centralBytes = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size ?? files.length, 8); end.writeUInt16LE(files.size ?? files.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}
function artifact(bytes, change = {}) { return { id: 40, name: observationArtifactName(20, 2), repositoryId: 10, runId: 20, runAttempt: 2, headSha: A, digest: `sha256:${h(bytes)}`, expired: false, ...change }; }
const unpack = (b, change) => decodeObservationArchive(b, { artifact: artifact(b, change) });

test('actual canonical serializer/facade/rendered helper agree, deterministic roundtrip and copied members', () => {
  const { observation: o, fragments } = fixture();
  const bytes = encodeObservation(o, { fragments });
  assert.deepEqual(plain(decodeObservation(bytes, { fragments })), o);
  assert.deepEqual(rendered.encodeObservation(o, { fragments }), bytes);
  const reversed = Object.fromEntries(Object.entries(o).reverse()); assert.deepEqual(encodeObservation(reversed, { fragments }), bytes);
  const files = observationFiles(o, fragments); files.get('fragments/health.txt').fill(0); assert.notEqual(fragments.get('fragments/health.txt')[0], 0);
  assert.equal(readFileSync(new URL('../practices/night/files/scripts/plates/names-observation.mjs', import.meta.url), 'utf8'), readFileSync(new URL('../scripts/plates/names-observation.mjs', import.meta.url), 'utf8'));
  assert.equal(observationArtifactName(20, 2), 'plates-names-observation-20-2'); rejects(() => observationArtifactName('20', 2));
});

test('external expected identities constrain data; validation does not invent a verdict', () => {
  const { observation: o, fragments } = fixture();
  assert.equal(validateObservation(o, { expected: { repository: o.repository, kind: 'night', execution: { runId: 20, runAttempt: 2, headSha: A } }, fragments }), o);
  for (const expected of [{ repository: { id: 11, fullName: 'Acme/project' } }, { repository: { id: 10, fullName: 'Acme/other' } }, { kind: 'morning' }, { execution: { runAttempt: 1 } }, { execution: { headSha: B } }, { passed: true }]) rejects(() => validateObservation(o, { expected }));
  o.producers = []; o.gaps.push({ code: 'missing-producer', producerId: 'improve', source: null });
  assert.equal(validateObservation(o), o); assert.equal(Object.hasOwn(o, 'verified'), false);
});

const badShapes = [
  ['top-level pass flag', o => { o.passed = true; }],
  ['nested status authority', o => { o.producers[0].complete = true; }],
  ['string provider ID', o => { o.execution.runId = '20'; }],
  ['unsafe provider ID', o => { o.repository.id = Number.MAX_SAFE_INTEGER + 1; }],
  ['repository source mismatch', o => { o.scope.configuration.repositoryId = 11; }],
  ['runtime commit mismatch', o => { o.scope.runtime.sourceFiles[0].commitSha = B; }],
  ['workflow source mismatch', o => { o.scope.workflow.path = '.github/workflows/other.yml'; }],
  ['workflow traversal', o => { o.execution.workflowPath = '.github/workflows/../night.yml'; }],
  ['bad date', o => { o.association.date = '2026-02-30'; }],
  ['backwards time', o => { o.execution.finishedAt = '2026-10-23T10:00:00Z'; }],
  ['bad timestamp', o => { o.execution.startedAt = '2026-02-30T10:00:00Z'; }],
  ['wrong step job', o => { o.producers[0].step = 'other/improve'; }],
  ['unsupported mode without reason', o => { o.scope.producers[0].mode = 'unsupported'; }],
  ['duplicate producer', o => { o.producers.push(o.producers[0]); }],
  ['duplicate write sequence', o => { o.writes.push(o.writes[0]); }],
  ['duplicate read identity', o => { o.reads.push(o.reads[0]); }],
  ['cross-repo object', o => { o.writes[0].target.repositoryId = 11; }],
  ['confirmed write missing object ID', o => { o.writes[0].target.id = null; }],
  ['uncertain write invents after', o => { o.writes[0].outcome = 'attempted-unknown'; }],
  ['no-change without preimage', o => { o.writes[0].outcome = 'no-change'; }],
  ['read without blob', o => { o.reads[0].blobSha = null; }],
  ['unavailable read claims contribution', o => { o.reads[0].state = 'unavailable'; }],
  ['unknown name row', o => { o.writes[0].intended.names[0].rowId = 'marker:Acme-unknown'; }],
  ['name not in row', o => { o.writes[0].intended.names[0].value = 'Acme-unknown'; }],
  ['fragment traversal', o => { o.fragments[0].path = 'fragments/../outside.txt'; }],
  ['unknown fragment classifier', o => { o.fragments[0].kind = 'private-body'; }],
  ['duplicate fragment', o => { o.fragments.push(o.fragments[0]); }],
  ['unreferenced fragment', o => { o.fragments.push({ ...o.fragments[0], path: 'fragments/extra.txt' }); }],
  ['wrong projection digest', o => { o.reads[0].outputProjection.sha256 = h('wrong'); }],
  ['unknown gap field', o => { o.gaps.push({ code: 'missing', producerId: null, source: null, secret: 'Acme' }); }],
];
for (const [name, edit] of badShapes) test(`rejects ${name}`, () => { const { observation: o } = fixture(); edit(o); rejects(() => validateObservation(o)); });

test('strict JSON refuses duplicate/escaped duplicate keys, malformed UTF8, depth and byte overflow', () => {
  const { observation: o, fragments } = fixture(), b = encodeObservation(o, { fragments }).toString();
  rejects(() => decodeObservation(Buffer.from(b.replace('"schema":1', '"schema":1,"schema":1'))), 'duplicate_key');
  rejects(() => decodeObservation(Buffer.from(b.replace('"schema":1', '"schema":1,"\\u0073chema":1'))), 'duplicate_key');
  rejects(() => decodeObservation(Buffer.from('{"schema":1,}')), 'invalid_json');
  rejects(() => decodeObservation(Buffer.from([0xff])), 'invalid_utf8');
  rejects(() => decodeObservation(Buffer.from('['.repeat(65) + '0' + ']'.repeat(65))), 'limit_exceeded');
  rejects(() => decodeObservation(Buffer.alloc(OBSERVATION_LIMITS.jsonBytes + 1)), 'limit_exceeded');
  const secret = 'AcmeSensitiveValue';
  assert.throws(() => decodeObservation(Buffer.from(JSON.stringify({ secret }))), e => e instanceof NamesObservationError && !e.message.includes(secret));
});

test('accessor fields refused without executing getter', () => {
  const { observation: o } = fixture(); let reads = 0; Object.defineProperty(o, 'schema', { get() { reads++; return 1; }, enumerable: true });
  rejects(() => validateObservation(o), 'non_data_value'); assert.equal(reads, 0);
});

test('byte-bound source manifest includes imported runtime, rejects entrypoint omission and duplicate/cross-commit files', () => {
  const { observation: o } = fixture();
  o.execution.codeIdentity = { repository: { id: 11, fullName: 'Acme/runtime' }, commitSha: C, entrypoint: 'lib/board.mjs', files: ['lib/board.mjs', 'lib/reader.mjs'].map(path => ({ ...source(path), repositoryId: 11, commitSha: C })) };
  assert.equal(validateObservation(o), o);
  const c = o.execution.codeIdentity; c.files[1].commitSha = B; rejects(() => validateObservation(o)); c.files[1].commitSha = C;
  c.files.push(c.files[1]); rejects(() => validateObservation(o), 'duplicate_identity'); c.files.pop();
  c.entrypoint = 'missing.mjs'; rejects(() => validateObservation(o), 'missing_source');
  c.entrypoint = 'lib/board.mjs'; c.files = Array.from({ length: 129 }, (_, i) => ({ ...source(`lib/file${i}.mjs`), repositoryId: 11, commitSha: C })); rejects(() => validateObservation(o), 'limit_exceeded');
});

test('both exact alias reads retained independently; absent ref differs from absent path and unavailable', () => {
  const { observation: o } = fixture(), r = o.reads[0];
  o.reads.push({ ...r, ref: 'keel-night-plan', selected: false, contributed: true }); assert.equal(validateObservation(o), o);
  const absent = { ...r, state: 'absent', absence: 'ref', commitSha: null, blobSha: null, sha256: null, selected: false, contributed: false, recordIds: [] };
  o.reads = [absent]; assert.equal(validateObservation(o), o);
  absent.absence = 'path'; rejects(() => validateObservation(o)); absent.commitSha = A; assert.equal(validateObservation(o), o);
  absent.absence = 'ref'; rejects(() => validateObservation(o));
  absent.state = 'unavailable'; absent.absence = null; assert.equal(validateObservation(o), o);
  absent.absence = 'path'; rejects(() => validateObservation(o));
});

test('actual fragments bind content, byte lengths and exact canonical tokens; missing/extra members refuse', () => {
  const { observation: o, fragments } = fixture();
  fragments.set('fragments/health.txt', Buffer.from('Acme tamper')); rejects(() => encodeObservation(o, { fragments }), 'fragment_digest_mismatch');
  fragments.delete('fragments/health.txt'); rejects(() => observationFiles(o, fragments), 'fragment_set_mismatch');
  const good = fixture(); good.fragments.set('fragments/unrelated.txt', Buffer.from('Acme')); rejects(() => observationFiles(good.observation, good.fragments), 'fragment_set_mismatch');
  const named = fixture(); named.observation.writes[0].intended.names[0].value = 'keel:health-report:begin'; rejects(() => encodeObservation(named.observation, { fragments: named.fragments }), 'missing_name_token');
});

test('full intended hash is distinct from extracted fragment; transport readback mismatch remains observable', () => {
  const { observation: o, fragments } = fixture(), w = o.writes[0];
  const full = 'Acme retained history\n' + fragments.get(w.intended.fragment).toString();
  w.intended.sha256 = h(full); w.after = present(full); assert.equal(validateObservation(o, { fragments }), o);
  w.after = present('Acme concurrent writer'); assert.equal(validateObservation(o, { fragments }), o);
  w.outcome = 'no-change'; w.before = present(full); rejects(() => validateObservation(o), 'no_change_mismatch');
  w.after = plain(w.before); assert.equal(validateObservation(o, { fragments }), o);
});

test('local actual generated write may lack pushed blob while preserving observed absence versus unknown', () => {
  const { observation: o } = fixture(), w = o.writes[0]; w.target = { kind: 'git', repositoryId: 10, ref: 'plates-night/2026-10-24', path: 'HEALTH.md' };
  w.after.commitSha = null; w.after.blobSha = null; assert.equal(validateObservation(o), o);
  w.before = { state: 'absent', commitSha: A, blobSha: null, sha256: null, labelIds: [], providerUpdatedAt: null }; assert.equal(validateObservation(o), o);
  w.outcome = 'attempted-unknown'; w.after = null; assert.equal(validateObservation(o), o);
});

test('morning originating artifact binds exact night identity, final and brief associations', () => {
  const { observation: o } = fixture(); o.kind = 'morning'; o.association = { kind: 'morning', date: '2026-10-24', nightBranch: 'keel-night/2026-10-24', finalPrId: 31, finalPrNumber: 4, finalHeadSha: B, briefIssueId: 32, briefIssueNumber: 5 };
  rejects(() => validateObservation(o));
  o.originatingNight = { repositoryId: 10, runId: 19, runAttempt: 1, headSha: B, artifactId: 39, artifactDigest: `sha256:${h('Acme night archive')}` }; assert.equal(validateObservation(o), o);
  o.originatingNight.repositoryId = 11; rejects(() => validateObservation(o), 'identity_mismatch');
});

test('drain projection references actual bounded JSON fragment rather than fabricated Git read', () => {
  const { observation: o, fragments } = fixture(), bytes = Buffer.from('{"before":[],"after":[],"actions":[]}');
  fragments.set('fragments/drain.txt', bytes); o.fragments.push({ path: 'fragments/drain.txt', kind: 'projection', bytes: bytes.length, sha256: h(bytes) });
  o.projections.push({ producerId: 'improve', kind: 'drain-queue', fragment: 'fragments/drain.txt', sha256: h(bytes) });
  assert.equal(validateObservation(o, { fragments }), o); o.projections[0].sha256 = h('other'); rejects(() => validateObservation(o), 'fragment_digest_mismatch');
});

for (const method of [0, 8]) for (const descriptor of [false, true]) test(`actual ZIP roundtrip method${method} descriptor${descriptor}`, () => {
  const { observation: o, fragments } = fixture(); const b = zip(observationFiles(o, fragments), { method, descriptor });
  const result = unpack(b); assert.deepEqual(plain(result.observation), o); assert.deepEqual(result.fragments, fragments);
});

test('fresh artifact metadata, own digest and attempt-specific name all bound; no caller pass flag', () => {
  const { observation: o, fragments } = fixture(), b = zip(observationFiles(o, fragments));
  for (const change of [{ repositoryId: 11 }, { runId: 21, name: observationArtifactName(21, 2) }, { runAttempt: 1, name: observationArtifactName(20, 1) }, { headSha: B }, { digest: `sha256:${h('other')}` }, { expired: true }, { passed: true }, { name: 'plates-names-observation-20-1' }]) rejects(() => unpack(b, change));
  rejects(() => decodeObservationArchive(b));
  o.artifacts.push({ id: 41, name: observationArtifactName(20, 2), runId: 20, runAttempt: 2, headSha: A, digest: `sha256:${h(b)}`, expired: false, step: 'night/upload' });
  rejects(() => validateObservation(o), 'self_certified_artifact'); o.artifacts[0].name = 'plates-test-runs'; assert.equal(validateObservation(o), o);
  o.artifacts[0].runAttempt = 1; rejects(() => validateObservation(o), 'identity_mismatch');
});

const hostileZip = [
  ['traversal', { name: '../observation.json' }], ['absolute', { name: '/observation.json' }], ['backslash', { name: 'fragments\\health.txt' }],
  ['unexpected filename', { name: 'secrets.json' }], ['symlink', { mode: 0o120777 }], ['device', { mode: 0o020600 }],
  ['encryption', { flags: 1 }], ['unsupported compression', { method: 12 }], ['huge declared JSON', { bytes: OBSERVATION_LIMITS.jsonBytes + 1 }],
  ['unknown metadata', { extra: Buffer.from([0x34, 0x12, 0, 0]) }], ['ZIP64 metadata', { extra: Buffer.from([1, 0, 0, 0]) }],
];
for (const [name, override] of hostileZip) test(`archive refuses ${name} before inflation`, () => {
  const { observation: o, fragments } = fixture(); const b = zip(observationFiles(o, fragments), { overrides: [override] }); rejects(() => unpack(b));
});

test('archive duplicate names, hidden/trailing bytes, local mismatch, corrupt content and overlapping members refuse', () => {
  const { observation: o, fragments } = fixture(), files = observationFiles(o, fragments);
  const duplicate = zip([...files, [...files][1]]); rejects(() => unpack(duplicate), 'duplicate_archive_name');
  const b = zip(files); rejects(() => unpack(Buffer.concat([b, Buffer.from('hidden')])));
  const mismatch = Buffer.from(b); mismatch[30] = 120; rejects(() => unpack(mismatch), 'archive_header_mismatch');
  const corrupt = Buffer.from(b); corrupt[30 + 'observation.json'.length] ^= 1; rejects(() => unpack(corrupt), 'archive_content_mismatch');
  const overlap = zip(files, { overrides: [{}, { offset: 0 }] }); rejects(() => unpack(overlap));
  const missing = new Map(files); missing.delete('fragments/health.txt'); rejects(() => unpack(zip(missing)), 'fragment_set_mismatch');
  const extra = new Map(files); extra.set('fragments/unrelated.txt', Buffer.from('Acme')); rejects(() => unpack(zip(extra)), 'fragment_set_mismatch');
});

test('archive validates later dangerous entry before attempting invalid first deflate stream', () => {
  const { observation: o, fragments } = fixture(), files = observationFiles(o, fragments);
  const b = zip(files, { method: 8, overrides: [{}, { mode: 0o120777 }] }); b[30 + 'observation.json'.length] = 255;
  rejects(() => unpack(b), 'unsafe_archive_mode');
});

test('collection bounds reject write/read counts, oversized fragment and total expanded archive', () => {
  const { observation: o, fragments } = fixture(); o.writes = Array(513).fill(o.writes[0]); rejects(() => validateObservation(o), 'limit_exceeded');
  const next = fixture(); next.observation.reads = Array(65).fill(next.observation.reads[0]); rejects(() => validateObservation(next.observation), 'limit_exceeded');
  const large = fixture(); large.observation.fragments[0].bytes = OBSERVATION_LIMITS.fragmentBytes + 1; rejects(() => validateObservation(large.observation), 'limit_exceeded');
  const tooBig = Buffer.alloc(OBSERVATION_LIMITS.archiveBytes + 1); rejects(() => unpack(tooBig), 'limit_exceeded');
  const files = new Map([['observation.json', Buffer.from('{}')], ...Array.from({ length: 33 }, (_, i) => [`fragments/member${i}.txt`, Buffer.alloc(OBSERVATION_LIMITS.fragmentBytes)])]);
  rejects(() => unpack(zip(files, { method: 8 })), 'limit_exceeded');
  assert.equal(fragments.size, 2);
});


test('inert ZIP metadata is bounded and malformed or duplicate metadata refuses', () => {
  const { observation: o, fragments } = fixture(), files = observationFiles(o, fragments);
  const timestamp = Buffer.from([0x55, 0x54, 5, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual(plain(unpack(zip(files, { overrides: [{ extra: timestamp }] })).observation), o);
  const malformed = Buffer.from(timestamp); malformed[4] = 0;
  rejects(() => unpack(zip(files, { overrides: [{ extra: malformed }] })), 'unsupported_archive_metadata');
  rejects(() => unpack(zip(files, { overrides: [{ extra: Buffer.concat([timestamp, timestamp]) }] })), 'duplicate_archive_metadata');
});


test('publication serializer requires actual fragment bytes, not authored digest claims', () => {
  const { observation: o } = fixture();
  assert.equal(validateObservation(o), o); // Explicitly structural, not verified.
  rejects(() => encodeObservation(o), 'fragment_bytes_required');
  rejects(() => encodeObservation(o, { fragments: new Map() }), 'fragment_set_mismatch');
});

for (const installedRepositoryId of [10, 11]) test(`installed producer source binds exact declared manifest tuple (repository ${installedRepositoryId})`, () => {
  const { observation: o, fragments } = fixture();
  const installedSource = { ...source('lib/board.mjs'), repositoryId: installedRepositoryId, commitSha: C };
  o.execution.codeIdentity = { repository: { id: installedRepositoryId, fullName: installedRepositoryId === 10 ? 'Acme/project' : 'Acme/runtime' }, commitSha: C, entrypoint: 'lib/board.mjs', files: [installedSource] };
  o.scope.producers[0].source = { ...installedSource };
  assert.equal(validateObservation(o, { fragments }), o);
  const archive = zip(observationFiles(o, fragments));
  assert.deepEqual(plain(unpack(archive).observation), o);
  // The main run and its writes/reads retain the original repository. An
  // installed-code declaration is not permission to change their association.
  const badWrite = plain(o); badWrite.writes[0].target.repositoryId = 12;
  rejects(() => validateObservation(badWrite), 'identity_mismatch');
  const badRead = plain(o); badRead.reads[0].repositoryId = 12;
  rejects(() => validateObservation(badRead), 'identity_mismatch');
  const badRuntime = plain(o); badRuntime.scope.runtime.sourceFiles = [{ ...installedSource }];
  rejects(() => validateObservation(badRuntime), 'identity_mismatch');
  for (const patch of [{ repositoryId: 12 }, { commitSha: B }, { path: 'lib/unlisted.mjs' }, { blobSha: C }, { sha256: h('Acme changed runtime') }]) {
    const bad = plain(o); Object.assign(bad.scope.producers[0].source, patch);
    rejects(() => validateObservation(bad), 'identity_mismatch');
  }
  const missing = plain(o); missing.execution.codeIdentity = null;
  rejects(() => validateObservation(missing), 'identity_mismatch');
});

test('checkout producer keeps original source contract even when an installed runtime is declared', () => {
  const { observation: o } = fixture();
  o.execution.codeIdentity = { repository: { id: 11, fullName: 'Acme/runtime' }, commitSha: C, entrypoint: 'lib/board.mjs', files: [{ ...source('lib/board.mjs'), repositoryId: 11, commitSha: C }] };
  assert.equal(validateObservation(o), o);
  o.scope.producers[0].source.commitSha = B;
  rejects(() => validateObservation(o), 'identity_mismatch');
});
