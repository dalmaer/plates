import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AGY_REVIEW_MODELS, AGY_REVIEW_SCHEMA, agyReviewVerdict, selectAgyReviewModel } from '../scripts/plates/agy-review-contract.mjs';
import { findingsOf } from '../scripts/plates/cross-review.mjs';

const model = AGY_REVIEW_MODELS[0], id = 'acme-review';
const diff = 'diff --git a/src/acme.mjs b/src/acme.mjs\n--- a/src/acme.mjs\n+++ b/src/acme.mjs\n@@ -1 +1 @@\n-old\n+new\n';
const review = () => ({ summary: 'Acme has an unchecked input.', findings: [{ path: 'src/acme.mjs', line: 1, severity: 'P2', body: 'Validate the Acme input before use.' }] });
const events = () => [
  { event: 'init', conversation_id: id, init: { model, agent: 'plates-review', tools: [], permission_mode: 'request-review', json_schema: AGY_REVIEW_SCHEMA } },
  { event: 'step_update', step_update: { conversation_id: id, step_index: 0, state: 'DONE', step_type: 'user_input' } },
  { event: 'step_update', step_update: { conversation_id: id, step_index: 1, state: 'DONE', step_type: 'agent_response', text_delta: JSON.stringify(review()) } },
  { event: 'result', result: { conversation_id: id, status: 'SUCCESS', response: JSON.stringify(review()), structured_output: review(), duration_seconds: 2, num_turns: 1,
    usage: { input_tokens: 100, output_tokens: 20, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 120 } } },
];
const stream = e => e.map(v => JSON.stringify(v)).join('\n') + '\n';
const verdict = (e = events(), overrides = {}) => agyReviewVerdict({ stdout: stream(e), expectedModel: model, outcome: 'success', diff, denials: [], ...overrides });
const rewriteReview = (e, v) => { e[2].step_update.text_delta = JSON.stringify(v); Object.assign(e.at(-1).result, { response: JSON.stringify(v), structured_output: v }); };

test('valid evidence maps onto existing cross-review findings without inventing cost', () => {
  const e = events(), before = structuredClone(e), r = verdict(e);
  assert.equal(r.ok, true);
  assert.equal(r.model, model);
  assert.deepEqual(findingsOf(r.message), { ...review(), problem: null });
  assert.equal(r.usage.total_tokens, 120); assert.equal(r.cost, null);
  assert.deepEqual(e, before);
  delete e.at(-1).result.usage;
  assert.equal(verdict(e).usage, null);
  rewriteReview(e, { findings: [] });
  assert.equal(verdict(e).ok, true);
  assert.deepEqual(findingsOf(verdict(e).message).findings, []);
});

test('schema is strict, immutable and identical in root and managed practice', async () => {
  assert.deepEqual(AGY_REVIEW_SCHEMA.required, ['findings']);
  assert.equal(AGY_REVIEW_SCHEMA.additionalProperties, false);
  assert.ok(Object.isFrozen(AGY_REVIEW_SCHEMA.properties.findings.items));
  assert.equal(await readFile(new URL('../scripts/plates/agy-review-contract.mjs', import.meta.url), 'utf8'),
    await readFile(new URL('../practices/cross-review/files/scripts/plates/agy-review-contract.mjs', import.meta.url), 'utf8'));
});

test('process uncertainty and missing denial coverage cannot become a successful review', () => {
  for (const outcome of ['failure', 'timeout', 'unknown', undefined]) assert.equal(verdict(events(), { outcome }).ok, false);
  for (const denials of [undefined, null, {}, [{ required: true, denied: true }], ['soft-denied']]) assert.equal(verdict(events(), { denials }).ok, false);
  assert.equal(verdict(events(), { expectedModel: 'default' }).ok, false);
});

test('model agent tools permission mode and conversation identity are bound', () => {
  const edits = [e => { e[0].init.model = AGY_REVIEW_MODELS[1]; }, e => { delete e[0].init.model; },
    e => { e[0].init.agent = 'default'; }, e => { e[0].init.tools = ['read_file']; }, e => { delete e[0].init.tools; },
    e => { e[0].init.permission_mode = 'always-proceed'; }, e => { e[1].step_update.conversation_id = 'other'; },
    e => { e.at(-1).result.conversation_id = 'other'; }, e => { e.at(-1).conversation_id = 'other'; },
    e => { e.at(-1).result.model = AGY_REVIEW_MODELS[2]; }, e => { e[0].init.json_schema = {}; }];
  for (const edit of edits) { const e = events(); edit(e); assert.equal(verdict(e).ok, false); }
});

test('reject tools subagents and unknown event or payload shapes even with SUCCESS', () => {
  for (const edit of [e => { e[1].step_update.step_type = 'tool'; }, e => { e[1].step_update.tool_info = {}; },
    e => { e[1].step_update.subagent_info = { subagents: [] }; }, e => { e[1].step_update.permission_denials = []; },
    e => { e[1].event = 'tool_result'; }, e => { e[1].step_update.step_type = 'unknown'; },
    e => { e.at(-1).result.permission_denials = ['soft-denied']; }]) {
    const e = events(); edit(e); assert.equal(verdict(e).ok, false);
  }
});

test('reject incomplete trailing duplicated or oversized streams', () => {
  const e = events();
  for (const stdout of ['', 'not JSON Acme-private', JSON.stringify(e.at(-1).result), stream(e.slice(0, -1)),
    stream([...e, e.at(-1)]), stream([e[0], e[0], ...e.slice(1)]), stream(e) + '{}\n', stream(e) + 'partial',
    stream(e).replace('\n', '\n\n'), ' '.repeat(8 * 1024 * 1024 + 1)]) {
    const r = verdict(e, { stdout }); assert.equal(r.ok, false); assert.doesNotMatch(r.reason, /Acme-private/);
  }
  const active = events(); active[2].step_update.state = 'ACTIVE'; assert.equal(verdict(active).ok, false);
  const duplicateStep = events(); duplicateStep.splice(2, 0, duplicateStep[1]); assert.equal(verdict(duplicateStep).ok, false);
});

test('complete ACTIVE fragments are accepted only with a matching terminal response', () => {
  const e = events(), response = e[2].step_update.text_delta;
  const active = structuredClone(e[2]); active.step_update.state = 'ACTIVE'; active.step_update.text_delta = response.slice(0, 12);
  e[2].step_update.text_delta = response.slice(12); e.splice(2, 0, active);
  assert.equal(verdict(e).ok, true);
  e[2].step_update.text_delta = 'substantive conflicting answer';
  assert.equal(verdict(e).ok, false);
});

test('SUCCESS must include a well-formed single-turn matching structured result', () => {
  const edits = [r => { r.status = 'ERROR'; }, r => { r.num_turns = 0; }, r => { r.num_turns = '1'; },
    r => { r.num_turns = 2; }, r => { r.duration_seconds = -1; }, r => { delete r.structured_output; },
    r => { r.response = 'Apparently fine'; }, r => { r.response = '{"findings":[]}'; }, r => { r.error = 'Required action denied'; },
    r => { r.usage = { input_tokens: -1 }; }, r => { r.usage = { total_tokens: '120' }; }];
  for (const edit of edits) { const e = events(); edit(e.at(-1).result); assert.equal(verdict(e).ok, false); }
});

test('all findings must be structurally valid and inside the supplied diff', () => {
  const edits = [v => { v.findings[0].line = 2; }, v => { v.findings[0].line = 0; }, v => { v.findings[0].line = '1'; },
    v => { v.findings[0].path = 'src/other.mjs'; }, v => { v.findings[0].path = '../src/acme.mjs'; },
    v => { v.findings[0].severity = 'P0'; }, v => { v.findings[0].body = ''; }, v => { v.findings[0].body = 'x'.repeat(4001); },
    v => { v.findings[0].approved = true; }, v => { v.findings = Array(31).fill(v.findings[0]); },
    v => { v.summary = '```json\n[]\n```'; }, v => { v.findings = {}; }];
  for (const edit of edits) { const e = events(), v = review(); edit(v); rewriteReview(e, v); assert.equal(verdict(e).ok, false); }
});

const catalog = states => AGY_REVIEW_MODELS.map((model, i) => ({ model, state: states[i] }));
const select = overrides => selectAgyReviewModel({ availability: catalog(['available', 'available', 'available']), attemptedModels: [], deadlineMs: 10000, nowMs: 1000, ...overrides });
test('preflight selects ordered known availability within the original deadline', () => {
  assert.deepEqual(select(), { model, remainingMs: 9000, reason: 'available-before-dispatch' });
  assert.equal(select({ availability: catalog(['unavailable', 'available', 'available']) }).model, AGY_REVIEW_MODELS[1]);
  assert.equal(select({ availability: catalog(['unknown', 'unavailable', 'available']) }).model, AGY_REVIEW_MODELS[2]);
  assert.equal(select({ availability: catalog(['unknown', 'unknown', 'unavailable']) }).model, null);
  assert.equal(select({ nowMs: 9000 }).remainingMs, 1000);
  assert.equal(select({ nowMs: 10000 }).model, null);
  assert.equal(select({ deadlineMs: undefined }).model, null);
});

test('no post-dispatch retry and no unknown or malformed availability grants', () => {
  for (const attemptedModels of [[model], [AGY_REVIEW_MODELS[1]], ['unknown'], undefined]) assert.equal(select({ attemptedModels }).model, null);
  for (const availability of [[], undefined, {}, catalog(['yes', 'available', 'available']),
    [catalog(['available', 'available', 'available'])[0], ...catalog(['available', 'available', 'available']).slice(0, 2)]]) assert.equal(select({ availability }).model, null);
  const sparse = catalog(['available', 'available', 'available']); delete sparse[2];
  assert.equal(select({ availability: sparse }).model, null);
  const inherited = Object.create({ model }); inherited.state = 'available';
  assert.equal(select({ availability: [inherited, ...catalog(['available', 'available', 'available']).slice(1)] }).model, null);
});
