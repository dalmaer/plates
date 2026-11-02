// Explicit local input disclosure and independent reconstruction. No execution authority.
import { createHash } from 'node:crypto';
import { fields, canonical, fingerprint, byteDigest, sealRecord, evaluationId, validateEvaluationBundle, resolveCaseEnvironment, EVALUATION_BYTES } from './evaluation-records.mjs';
import { filePath, validateFiles, submittedArtifact, FILE_LIMIT, ARTIFACT_BYTES } from './evaluation-artifacts.mjs';
import { acceptanceDriver } from './evaluation-execution-input.mjs';
import { reviewedInputClassification } from './evaluation-corpus.mjs';
const prepared = new WeakMap(), views = new WeakMap(), errors = new WeakSet();
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const sha = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const same = (a, b) => canonical(a) === canonical(b);
const ref = x => ({ kind: x.kind, id: x.id, digest: x.digest });
// UTF-8 lexicographic order matches Unicode code points (unlike UTF-16 '<').
const order = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function fail(code = 'partition_invalid') { const e = Object.assign(new Error(code), { code, exitCode: 2 }); errors.add(e); throw e; }
function need(ok, code) { if (!ok) fail(code); }
function boundary(fn, code = 'partition_invalid') { try { return fn(); } catch (e) { if (errors.has(e)) throw e; fail(code); } }
function freeze(x) { if (x && typeof x === 'object') { for (const v of Object.values(x)) freeze(v); Object.freeze(x); } return x; }
function strings(x, depth = 0) {
  need(depth <= 16, 'partition_bounds');
  if (typeof x === 'string') { need(x.isWellFormed()); return; }
  if (x === null || typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x))) return;
  need(x && typeof x === 'object' && (Array.isArray(x) || Object.getPrototypeOf(x) === Object.prototype));
  if (Array.isArray(x)) need(Object.keys(x).length === x.length);
  for (const [k, v] of Object.entries(x)) { need(k.isWellFormed()); strings(v, depth + 1); }
}
// Internal shared reader for the installed manifest and new submission boundary.
export function parsePartitionJson(bytes, limit = EVALUATION_BYTES) {
  return boundary(() => {
    need(Number.isSafeInteger(limit) && limit > 0 && limit <= EVALUATION_BYTES, 'partition_bounds');
    need(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= limit, 'partition_bounds');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const stack = [];
    for (const token of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g)) {
      const t = token[0], top = stack.at(-1);
      if (t === '{' || t === '[') { stack.push({ object: t === '{', key: true, names: new Set() }); need(stack.length <= 16, 'partition_bounds'); }
      else if (t === '}' || t === ']') stack.pop();
      else if (t === ',' && top?.object) top.key = true;
      else if (t.startsWith('"') && top?.object && top.key) { const name = JSON.parse(t); need(!top.names.has(name)); top.names.add(name); top.key = false; }
    }
    const value = JSON.parse(text); strings(value); return value;
  });
}
function snapshot(x) { strings(x); const text = canonical(x); need(Buffer.byteLength(text) <= EVALUATION_BYTES, 'partition_bounds'); return parsePartitionJson(Buffer.from(text)); }
function reference(r, kind) { fields(r, ['kind', 'id', 'digest']); need(r.kind === kind && evaluationId(r.id) && hash(r.digest)); }
function bytesRow(x) { need(hash(x.byteDigest) && Number.isSafeInteger(x.bytes) && x.bytes >= 0); }
function sorted(xs, key, max) { need(Array.isArray(xs) && xs.length <= max, 'partition_bounds'); for (let i = 1; i < xs.length; i++) need(order(key(xs[i - 1]), key(xs[i])) < 0); }
function materialRow(x, path = true) { fields(x, [...(path ? ['path'] : []), 'material', 'byteDigest', 'bytes']); if (path) filePath(x.path); reference(x.material, 'material'); bytesRow(x); need(x.bytes <= 65536, 'partition_bounds'); }
const metadata = bytes => ({ byteDigest: byteDigest(bytes), bytes: bytes.length });
const materialMetadata = m => ({ material: ref(m), ...metadata(Buffer.from(m.content)) });
const requirementBytes = task => Buffer.from(JSON.stringify({ publicBrief: task.publicBrief, requirements: task.requirements }));
// Validation does not mint a reviewed handle; only the installed corpus loader does.
export function validateInputClassification(raw, catalogDigest, definitions) {
  return boundary(() => {
    const m = parsePartitionJson(raw); fields(m, ['schemaVersion', 'kind', 'revision', 'catalogDigest', 'cases', 'publicMaterials']);
    need(m.schemaVersion === 1 && m.kind === 'evaluation-input-classification' && Number.isSafeInteger(m.revision) && m.revision > 0 && hash(m.catalogDigest));
    need(m.catalogDigest === catalogDigest, 'partition_binding_mismatch');
    sorted(m.cases, x => x.case.id, 20); sorted(m.publicMaterials, x => [x.path, x.material.id, x.material.digest].join('\0'), 200);
    for (const p of m.publicMaterials) materialRow(p);
    for (const c of m.cases) {
      fields(c, ['case', 'startingCommit', 'sources', 'evaluatorFiles', 'acceptance', 'requirements']); reference(c.case, 'case'); need(sha(c.startingCommit));
      sorted(c.sources, x => x.path, FILE_LIMIT); sorted(c.evaluatorFiles, x => x.path, FILE_LIMIT);
      for (const s of c.sources) { fields(s, ['path', 'mode', 'blob', 'byteDigest', 'bytes', 'role']); filePath(s.path); bytesRow(s); need(['100644', '100755'].includes(s.mode) && sha(s.blob) && ['public', 'evaluator-only'].includes(s.role)); }
      for (const e of c.evaluatorFiles) materialRow(e);
      materialRow(c.acceptance, false); fields(c.requirements, ['role', 'byteDigest', 'bytes']); bytesRow(c.requirements); need(c.requirements.role === 'public');
      const d = definitions.find(d => same(ref(d.task), c.case)); need(d, 'partition_unreviewed');
      need(c.startingCommit === d.task.startingCommit, 'partition_binding_mismatch');
      const sources = c.sources.map(({ role, mode, byteDigest, ...s }) => ({ ...s, sha256: byteDigest }));
      need(same(sources, [...d.definition.sources].sort((a, b) => order(a.path, b.path))), 'partition_binding_mismatch');
      const dependencies = d.probes.map((f, i) => ({ path: f.path, ...materialMetadata(d.materials[i]) })).sort((a, b) => order(a.path, b.path));
      need(same(c.evaluatorFiles, dependencies) && same(c.acceptance, materialMetadata(d.acceptance))
        && same(c.requirements, { role: 'public', ...metadata(requirementBytes(d.task)) }), 'partition_binding_mismatch');
    }
    const privateRefs = new Set(m.cases.flatMap(c => [...c.evaluatorFiles, c.acceptance]).map(x => canonical(x.material)));
    need(m.publicMaterials.every(p => !privateRefs.has(canonical(p.material))), 'partition_collision');
    return freeze({ manifest: m, classificationDigest: byteDigest(raw), cases: definitions.map(d => snapshot(d.task)) });
  });
}
function files(xs) {
  const paths = [];
  for (const f of xs) { filePath(f.path); need(!paths.some(p => p === f.path || p.startsWith(f.path + '/') || f.path.startsWith(p + '/')), 'partition_collision'); paths.push(f.path); }
  need(xs.length <= FILE_LIMIT && xs.reduce((n, f) => n + Buffer.byteLength(f.base64, 'base64'), 0) <= ARTIFACT_BYTES, 'partition_bounds');
  return validateFiles(xs);
}
// Value validation only. Executing callers must use readFrozen and current workspace validation.
function boundPlan(plan) {
  fields(plan, ['schemaVersion', 'kind', 'status', 'preview', 'digest', 'binding', 'bundlePath', 'bundleHash', 'planHash', 'destination', 'bundle', 'budgetReserved', 'acceptance']);
  need(plan.schemaVersion === 2 && plan.bundle.schemaVersion === 3, 'partition_unsupported');
  need(plan.kind === 'harness' && plan.status === 'draft' && plan.preview === true && plan.budgetReserved === false && plan.acceptance === 'unknown');
  validateEvaluationBundle(plan.bundle);
  need(hash(plan.bundleHash) && hash(plan.digest) && fingerprint(plan.bundle) === plan.planHash
    && fingerprint(Object.fromEntries(['binding', 'bundlePath', 'bundleHash', 'planHash', 'destination'].map(k => [k, plan[k]]))) === plan.digest, 'partition_binding_mismatch');
}
function reviewedMaterial(bundle, row) {
  const m = bundle.materials.find(m => same(ref(m), row.material)); need(m, 'partition_incomplete');
  need(same(materialMetadata(m), { material: row.material, byteDigest: row.byteDigest, bytes: row.bytes }), 'partition_binding_mismatch'); return m;
}
function publicMaterialRow(reviewed, entry) {
  const row = reviewed.manifest.publicMaterials.find(p => p.path === entry.path && same(p.material, entry.material));
  need(row && !reviewed.manifest.cases.some(c => [...c.evaluatorFiles, c.acceptance].some(e => same(e.material, entry.material))), 'partition_unreviewed');
  return row;
}
// Internal shared pre-export selection. No freeze-receipt or execution authority.
export function validatePartitionSelection(input) {
  return boundary(() => {
    const reviewed = reviewedInputClassification(input.reviewed); need(reviewed, 'partition_unreviewed');
    const { plan, caseRef, configurationRef, sourcePaths } = snapshot({ plan: input.plan, caseRef: input.caseRef, configurationRef: input.configurationRef, sourcePaths: input.sourcePaths });
    boundPlan(plan); reference(caseRef, 'case'); reference(configurationRef, 'configuration');
    const b = plan.bundle, task = b.cases.find(c => same(ref(c), caseRef)), config = b.configurations.find(c => same(ref(c), configurationRef));
    need(task && config, 'partition_binding_mismatch');
    const environment = resolveCaseEnvironment(b, config, caseRef);
    need(config.exclusions.length === 0, 'partition_unsupported');
    const base = reviewed.cases.find(c => c.id === task.id); need(base, 'partition_unreviewed');
    const normalized = sealRecord({ ...task, limits: { ...task.limits, currencyUsd: base.limits.currencyUsd } });
    need(same(normalized, base), 'partition_binding_mismatch');
    const c = reviewed.manifest.cases.find(c => same(c.case, ref(base))); need(c, 'partition_unreviewed');
    need(Array.isArray(sourcePaths) && sourcePaths.length === c.sources.length, 'partition_incomplete');
    for (const path of sourcePaths) filePath(path);
    need(same([...sourcePaths].sort(order), c.sources.map(s => s.path)), 'partition_incomplete');
    for (const entry of [...config.context, ...config.overlays]) reviewedMaterial(b, publicMaterialRow(reviewed, entry));
    for (const row of [...c.evaluatorFiles, c.acceptance]) reviewedMaterial(b, row);
    // Known path collisions can refuse without reading any source blob.
    files([...c.sources, ...config.context, ...config.overlays, ...c.evaluatorFiles, { path: 'requirements.json' }]
      .map(f => ({ path: f.path, mode: '100644', base64: '' })));
    return freeze({ plan, caseRef, configurationRef, task, config, environment, c, sourcePaths: c.sources.map(s => s.path), reviewed });
  });
}
export function prepareInputPartition(input) {
  return boundary(() => {
    const sourceFiles = snapshot(input.sourceFiles);
    const { plan, caseRef, configurationRef, task, config, environment, c, reviewed } = validatePartitionSelection({
      plan: input.plan, caseRef: input.caseRef, configurationRef: input.configurationRef, sourcePaths: sourceFiles.map(f => f.path), reviewed: input.reviewed,
    });
    const b = plan.bundle;
    const sources = files(sourceFiles).sort((a, b) => order(a.path, b.path));
    need(sources.length === c.sources.length, 'partition_incomplete');
    const entries = [], publicFiles = [], evaluatorFiles = [];
    for (let i = 0; i < sources.length; i++) {
      const f = sources[i], row = c.sources[i], bytes = Buffer.from(f.base64, 'base64');
      const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      need(same({ path: f.path, mode: f.mode, blob, ...metadata(bytes), role: row.role }, row), 'partition_binding_mismatch');
      entries.push({ kind: 'source', ...row }); (row.role === 'public' ? publicFiles : evaluatorFiles).push(f);
    }
    for (const [kind, list] of [['context', config.context], ['overlay', config.overlays]]) for (const [index, e] of list.entries()) {
      const row = publicMaterialRow(reviewed, e);
      const m = reviewedMaterial(b, row); entries.push({ kind, role: 'public', index, path: e.path, mode: '100644', ...materialMetadata(m) });
      publicFiles.push({ path: e.path, mode: '100644', base64: Buffer.from(m.content).toString('base64') });
    }
    for (const row of c.evaluatorFiles) {
      const m = reviewedMaterial(b, row); entries.push({ kind: 'evaluator', role: 'evaluator-only', path: row.path, mode: '100644', ...materialMetadata(m) });
      evaluatorFiles.push({ path: row.path, mode: '100644', base64: Buffer.from(m.content).toString('base64') });
    }
    const acceptance = reviewedMaterial(b, c.acceptance); need(same(task.acceptanceManifest, c.acceptance.material), 'partition_binding_mismatch');
    parsePartitionJson(Buffer.from(acceptance.content)); const driver = acceptanceDriver(acceptance);
    need(driver.checks.every(check => evaluatorFiles.some(f => f.path === check.argv[1].slice(6))), 'partition_incomplete');
    need(publicFiles.every(f => byteDigest(Buffer.from(f.base64, 'base64')) !== c.acceptance.byteDigest), 'partition_unreviewed');
    const requirements = requirementBytes(task); need(same(metadata(requirements), { byteDigest: c.requirements.byteDigest, bytes: c.requirements.bytes }), 'partition_binding_mismatch');
    entries.push({ kind: 'acceptance', role: 'evaluator-only', ...c.acceptance }, { kind: 'requirements', role: 'public', path: 'requirements.json', mode: '100644', ...metadata(requirements) });
    const builderFiles = files([...publicFiles, { path: 'requirements.json', mode: '100644', base64: requirements.toString('base64') }]);
    const privateFiles = files(evaluatorFiles); files([...builderFiles, ...privateFiles]);
    const writablePaths = [...task.allowlist.paths].sort(order);
    need(new Set(writablePaths).size === writablePaths.length && writablePaths.every(p => c.sources.some(s => s.path === p && s.role === 'public')), 'partition_unreviewed');
    const view = freeze({ schemaVersion: 1, kind: 'evaluation-public-input', publicBrief: task.publicBrief, requirements: task.requirements, files: publicFiles, writablePaths });
    const record = sealRecord({ schemaVersion: 1, kind: 'evaluation-input-partition', planDigest: plan.digest, case: caseRef, configuration: configurationRef, startingCommit: task.startingCommit, environment, classificationDigest: reviewed.classificationDigest, entries });
    snapshot(record);
    const identity = sealRecord({ schemaVersion: 1, kind: 'evaluation-input-preparation', planDigest: plan.digest, partitionDigest: record.digest, classificationDigest: reviewed.classificationDigest,
      builderFilesDigest: fingerprint(builderFiles), evaluatorFilesDigest: fingerprint(privateFiles), acceptanceDigest: acceptance.digest, publicViewDigest: fingerprint(view) });
    const handle = Object.freeze({}); views.set(view, identity.publicViewDigest);
    prepared.set(handle, freeze({ record, identity, view, builderFiles, privateFiles, driver })); return handle;
  });
}
function state(handle) { const s = prepared.get(handle); need(s, 'partition_invalid'); return s; }
export function partitionIdentity(handle) { return boundary(() => state(handle).identity); }
export function partitionRecord(handle) { return boundary(() => state(handle).record); }
export function publicInputView(handle) { return boundary(() => state(handle).view); }
export function projectPublicInput(view) {
  return boundary(() => { need(views.has(view) && views.get(view) === fingerprint(view)); return structuredClone(view); });
}
export function reconstructEvaluatorInput(handle, stdout) {
  return boundary(() => {
    const s = state(handle); need(typeof stdout === 'string' && stdout.isWellFormed(), 'partition_submission_invalid');
    const envelope = parsePartitionJson(Buffer.from(stdout), 393216);
    fields(envelope, ['schemaVersion', 'files']); need(envelope.schemaVersion === 1, 'partition_submission_invalid');
    const replacements = files(envelope.files);
    need(replacements.every(f => s.builderFiles.some(before => before.path === f.path && before.mode === f.mode)), 'partition_submission_invalid');
    const protectedPaths = s.builderFiles.filter(f => !s.view.writablePaths.includes(f.path)).map(f => f.path);
    const rebuilt = submittedArtifact(stdout, s.builderFiles, s.view.writablePaths, protectedPaths);
    return structuredClone({ files: files([...rebuilt, ...s.privateFiles]), driver: s.driver });
  }, 'partition_submission_invalid');
}
