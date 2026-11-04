// Phase 162, increment 1: the overnight decision envelope
// (docs/phases/162-overnight-decisions-remain-bounded-and-reviewable.md;
// contract: docs/specs/night-decisions.md; design: docs/research/2026-10-14-nightwatch.md,
// "Extension: bounded overnight decisions").
//
// A pure, versioned record of one choice a night made (or parked): which plan
// item it served, which existing authority it relied on (by reference only),
// what it weighed, what it expected and what was measured, what it changed,
// how it can be recovered, and where its action actually stands. It validates
// and reads; it never executes, writes, routes or grants anything. Nothing in
// the night plan (schema 1, strict) changes: the plan gains no field, and no
// plan field becomes active because an envelope exists.
//
// Unknowns are explicit. A field whose fact is not known holds the marker
// { "unknown": "<why>" }; validateEnvelope refuses an absent field, so a writer
// cannot drop a fact silently. readEnvelope reads older or partial shapes,
// marking each absent field unknown and listing it, never defaulting it.
//
// Phase 150's loop is reused, not forked: doors are its DOORS, and follow-up
// keep/adjust/revert map onto its held/adjust/reverse outcomes, with the same
// rule that an irreversible door cannot be reverted.
import { DOORS, OUTCOMES } from './decision-loop.mjs';

export const ENVELOPE_SCHEMA = 1;
export const CONFIDENCE = Object.freeze(['low', 'medium', 'high', 'unknown']);
export const DECISION_STATES = Object.freeze(['chosen', 'parked', 'revisited']);
export const ACTION_STATES = Object.freeze(['not-started', 'running', 'completed', 'failed', 'uncertain']);
export const OBSERVATION_BASES = Object.freeze(['simulation', 'observation', 'unavailable']);
export const VALIDATION_OUTCOMES = Object.freeze(['passed', 'failed', 'not-run', 'unknown']);
/** The kinds of existing authority an envelope may reference. None of them is an approval; an envelope never carries one. */
export const AUTHORITY_KINDS = Object.freeze(['plan-item', 'autonomy-policy', 'decision-record']);
/** Follow-up requests, onto phase 150's outcomes. */
export const FOLLOW_UPS = Object.freeze({ keep: 'held', adjust: 'adjust', revert: 'reverse' });
if (!Object.values(FOLLOW_UPS).every(o => OUTCOMES.includes(o))) throw new Error('FOLLOW_UPS must map onto decision-loop OUTCOMES');

export class EnvelopeError extends Error {}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[0-9a-f]{40}$/;
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDate = s => typeof s === 'string' && DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const text1 = (s, n = 500) => typeof s === 'string' && s.trim().length > 0 && s.length <= n && !/[\r\n]/.test(s);
const textList = (v, n = 32) => Array.isArray(v) && v.length <= n && v.every(s => text1(s));
/** Is this the explicit unknown marker? */
export const isUnknown = v => isObject(v) && Object.keys(v).length === 1 && text1(v.unknown);
export const unknown = why => ({ unknown: why });

// Keys that would make an envelope look like a grant. An envelope references
// authority (`authority`, below); it never holds approval, consent or a hook skip.
const GRANT_KEY = /approv|consent|grant|permi[st]|authori[sz]|override|bypass|hook|skip|sudo|allow/i;

// The shape: each field is [check, mayBeUnknown]. check(value, at, bad) reports problems through bad.
const one = (pred, msg) => (v, at, bad) => { if (!pred(v)) bad(`${at}: ${msg}`); };
const listOf = (pred, msg, n = 32) => (v, at, bad) => { if (!Array.isArray(v) || v.length > n) bad(`${at}: a list of at most ${n}`); else v.forEach((x, i) => { if (!pred(x)) bad(`${at}[${i}]: ${msg}`); }); };
const shape = fields => (v, at, bad) => {
  if (!isObject(v)) { bad(`${at}: an object with ${Object.keys(fields).join(', ')}`); return; }
  for (const k of Object.keys(v)) if (!(k in fields)) bad(GRANT_KEY.test(k) ? `${at}.${k}: an envelope references existing authority; it never carries approval, consent or a hook skip` : `${at}: unknown field "${k}" (it has ${Object.keys(fields).join(', ')})`);
  for (const [k, [check, mayBeUnknown]] of Object.entries(fields)) {
    if (!(k in v)) { bad(`${at}.${k}: absent; record it, or mark it { "unknown": "<why>" }`); continue; }
    if (isUnknown(v[k])) { if (!mayBeUnknown) bad(`${at}.${k}: must be known`); continue; }
    check(v[k], `${at}.${k}`, bad);
  }
};
const authorityRef = v => isObject(v) && Object.keys(v).every(k => ['kind', 'ref', 'digest'].includes(k)) && AUTHORITY_KINDS.includes(v.kind) && text1(v.ref) && (v.digest === undefined || /^[0-9a-f]{64}$/.test(v.digest));
const observation = shape({
  basis: [one(b => OBSERVATION_BASES.includes(b), OBSERVATION_BASES.join(', ')), false],
  evidence: [one(e => e === null || text1(e), 'null or an evidence reference'), false],
  version: [one(text1, 'the version or flag state observed'), true],
  window: [shape({ from: [one(isDate, 'YYYY-MM-DD'), false], to: [one(isDate, 'YYYY-MM-DD'), false] }), true],
  denominator: [one(n => Number.isInteger(n) && n >= 0, 'the count of meaningful operations, an integer of at least 0'), true],
  result: [one(r => r === null || text1(r, 1000), 'null or the observed result'), false],
});

const SHAPE = shape({
  schema: [one(s => s === ENVELOPE_SCHEMA, `${ENVELOPE_SCHEMA}`), false],
  id: [one(s => ID.test(s ?? ''), 'lowercase letters, digits and dashes, at most 64'), false],
  night: [one(isDate, "the night's date, YYYY-MM-DD"), false],
  planItem: [one(s => ID.test(s ?? ''), "the night plan item's id"), false],
  operation: [shape({ id: [one(text1, 'the original operation id'), false], attempts: [listOf(text1, 'an attempt id'), false] }), true],
  sourceRevision: [one(s => SHA.test(s ?? ''), 'a 40-character commit'), true],
  authority: [listOf(authorityRef, `{ kind: ${AUTHORITY_KINDS.join(' | ')}, ref, digest? }`, 8), true],
  dependsOn: [listOf(s => ID.test(s ?? ''), 'a decision id'), true],
  choice: [shape({
    question: [one(text1, 'one line'), false],
    alternatives: [listOf(text1, 'one line', 16), true],
    selected: [one(s => s === null || text1(s), 'the selected alternative, or null when parked'), false],
    rationale: [one(s => text1(s, 1000), 'text, at most 1000 characters'), true],
    evidence: [listOf(text1, 'a path, run URL or measure'), true],
    confidence: [one(c => CONFIDENCE.includes(c), CONFIDENCE.join(', ')), false],
    unknowns: [listOf(text1, 'one named unknown'), false],
    affects: [listOf(text1, 'a decision record ref'), true],
  }), false],
  consequences: [shape({
    expects: [one(text1, 'one checkable sentence'), true],
    checkBy: [one(isDate, 'YYYY-MM-DD'), true],
    interactions: [listOf(i => isObject(i) && Object.keys(i).every(k => ['with', 'expects'].includes(k)) && ID.test(i.with ?? '') && text1(i.expects), '{ with: <decision id>, expects }'), true],
    observations: [(v, at, bad) => { if (!Array.isArray(v) || v.length > 32) bad(`${at}: a list of at most 32`); else v.forEach((o, i) => observation(o, `${at}[${i}]`, bad)); }, true],
  }), false],
  change: [shape({
    commits: [listOf(s => SHA.test(s ?? ''), 'a 40-character commit'), true],
    flags: [listOf(text1, 'a flag name'), true],
    configuration: [listOf(text1, 'a configuration path'), true],
    references: [listOf(text1, 'an issue or PR reference'), true],
    validation: [listOf(v => isObject(v) && Object.keys(v).every(k => ['command', 'outcome'].includes(k)) && text1(v.command) && VALIDATION_OUTCOMES.includes(v.outcome), `{ command, outcome: ${VALIDATION_OUTCOMES.join(' | ')} }`), true],
    effects: [listOf(text1, 'an original effect receipt reference'), true],
  }), false],
  recovery: [shape({
    door: [one(d => DOORS.includes(d), DOORS.join(', ')), true],
    preconditions: [listOf(text1, 'one line'), true],
    knownGood: [one(text1, 'the known-good revision or configuration'), true],
    steps: [listOf(text1, 'one undo or compensation step'), true],
    limits: [listOf(text1, 'one limit'), true],
    expires: [one(s => s === null || isDate(s), 'null or YYYY-MM-DD'), true],
  }), true],
  state: [shape({
    decision: [one(s => DECISION_STATES.includes(s), DECISION_STATES.join(', ')), false],
    parked: [one(p => p === null || (isObject(p) && Object.keys(p).every(k => ['missing', 'dependents', 'next'].includes(k)) && textList(p.missing) && p.missing.length > 0 && Array.isArray(p.dependents) && p.dependents.every(s => ID.test(s ?? '')) && text1(p.next)), 'null, or { missing: [≥1], dependents: [plan item ids], next }'), false],
    action: [one(s => ACTION_STATES.includes(s), ACTION_STATES.join(', ')), false],
    receipts: [listOf(text1, 'an original operation receipt reference'), false],
  }), false],
  followUp: [one(f => f === null || isObject(f), 'null or a follow-up'), false],
});
const FOLLOW_UP = shape({
  of: [one(s => ID.test(s ?? ''), 'the original decision id'), false],
  requested: [one(r => r in FOLLOW_UPS, Object.keys(FOLLOW_UPS).join(', ')), false],
  source: [one(s => SHA.test(s ?? ''), 'the current source revision, 40 characters'), true],
  observed: [one(text1, 'the evidence it was judged on'), true],
  result: [one(s => s === null || text1(s), 'null or the resulting correction or decision reference'), false],
});

const known = v => v !== undefined && !isUnknown(v);

/** The rules between fields: a record's own consistency, with no outside context. */
function ruleProblems(e, bad) {
  const c = e.choice, s = e.state, r = e.recovery;
  if (!isObject(c) || !isObject(s)) return;
  if (s.decision === 'parked') {
    if (c.selected !== null) bad('state: a parked choice selects nothing (choice.selected is null)');
    if (s.parked === null) bad('state.parked: a parked choice names the missing permission or evidence, its dependents and the next action');
    if (s.action !== 'not-started') bad(`state.action: a parked choice's dependent action has not started (it is ${s.action})`);
  } else {
    if (s.parked !== null) bad(`state.parked: only a parked choice has parked details (this one is ${s.decision})`);
    if (c.selected === null) bad(`choice.selected: a ${s.decision} choice names what it selected`);
    else if (Array.isArray(c.alternatives) && !c.alternatives.includes(c.selected)) bad('choice.selected: one of choice.alternatives');
    if (s.decision === 'chosen' && !known(e.authority)) bad('authority: unknown authority cannot back a chosen option; park it and name the missing authority');
    if (s.decision === 'chosen' && Array.isArray(e.authority) && !e.authority.some(a => a.kind === 'plan-item' && a.ref === e.planItem)) bad(`authority: a chosen option names its plan item (${e.planItem}) as { kind: plan-item, ref: ${e.planItem} }`);
  }
  // The action is derived from original receipts: a chosen option or an exit is not a completed effect.
  if (['completed', 'failed', 'uncertain'].includes(s.action) && Array.isArray(s.receipts) && !s.receipts.length) bad(`state.receipts: a ${s.action} action is read from its original operation receipt; none is named`);
  if (s.action === 'completed' && isObject(e.change) && Array.isArray(e.change.effects) && !e.change.effects.length) bad('change.effects: a completed action names its effect receipt');
  if (isObject(e.consequences) && Array.isArray(e.consequences.observations)) e.consequences.observations.forEach((o, i) => {
    if (!isObject(o)) return;
    if (o.basis === 'unavailable' && (o.evidence !== null || o.result !== null)) bad(`consequences.observations[${i}]: unavailable evidence has no evidence or result (null is not zero)`);
    if (o.basis !== 'unavailable' && (o.evidence === null || o.result === null)) bad(`consequences.observations[${i}]: a ${o.basis} names its evidence and result; mark it unavailable instead`);
    if (isObject(o.window) && isDate(o.window.from) && isDate(o.window.to) && o.window.to < o.window.from) bad(`consequences.observations[${i}].window: ends before it starts`);
  });
  if (isObject(e.consequences) && Array.isArray(e.consequences.interactions) && e.consequences.interactions.some(i => i?.with === e.id)) bad('consequences.interactions: a choice does not interact with itself');
  if (Array.isArray(e.dependsOn) && e.dependsOn.includes(e.id)) bad('dependsOn: a decision does not depend on itself');
  const f = e.followUp;
  if (isObject(f)) {
    FOLLOW_UP(f, 'followUp', bad);
    if (f.requested === 'revert' && isObject(r) && r.door === 'irreversible') bad('followUp: an irreversible door cannot be reverted; record adjust and decide a compensating or forward change');
    if (f.requested === 'revert' && isObject(r) && !known(r.door)) bad('followUp: a revert needs a known door; its recovery is unknown');
    if (s.decision !== 'revisited') bad('state.decision: a record with a follow-up is revisited');
  }
}

/**
 * Is this a complete schema-1 envelope? Every field present, each with a value
 * or the explicit unknown marker. Pure. Returns { ok, problems: [text] }.
 */
export function validateEnvelope(envelope) {
  const problems = [];
  const bad = m => problems.push(m);
  if (!isObject(envelope)) return { ok: false, problems: ['an envelope is a JSON object'] };
  SHAPE(envelope, 'envelope', bad);
  if (envelope.schema === ENVELOPE_SCHEMA) ruleProblems(envelope, bad);
  return { ok: !problems.length, problems };
}

/**
 * Against its context: the night plan (schema 1, validated elsewhere) and phase
 * 150's collected decision records. The envelope binds to an existing plan
 * item; a settled (accepted) decision it affects, or a willNotTouch path it
 * changes, means it cannot be chosen: it parks. Reads its inputs, never mutates them.
 */
export function contextProblems(envelope, { plan = null, decisions = [] } = {}) {
  const out = [];
  if (!isObject(envelope)) return ['an envelope is a JSON object'];
  if (plan) {
    if (plan.date !== envelope.night) out.push(`night: the envelope is for ${envelope.night}; the plan is ${plan.date}`);
    const item = (plan.items ?? []).find(i => i?.id === envelope.planItem);
    if (!item) out.push(`planItem: ${envelope.planItem} is not an item of the ${plan.date} plan; an envelope cannot add work`);
  }
  if (envelope.state?.decision !== 'chosen') return out;
  const settled = new Map(decisions.filter(d => d?.decision === 'accepted').map(d => [d.ref, d]));
  for (const ref of Array.isArray(envelope.choice?.affects) ? envelope.choice.affects : []) {
    if (settled.has(ref)) out.push(`choice.affects: ${ref} is a settled decision; an overnight choice cannot override it (park it for the owner)`);
  }
  const touched = [...(Array.isArray(envelope.change?.configuration) ? envelope.change.configuration : []), ...(Array.isArray(envelope.change?.flags) ? envelope.change.flags : [])];
  for (const line of Array.isArray(plan?.willNotTouch) ? plan.willNotTouch : []) {
    const l = line.trim();
    for (const p of touched) if (p === l || (l.endsWith('/') && p.startsWith(l))) out.push(`change: ${p} is in the plan's willNotTouch (${l})`);
  }
  return out;
}

/**
 * Read an envelope of this schema, or an older/partial shape (no schema field,
 * or fields missing): each absent field becomes { unknown: "not recorded" } and
 * is listed in `unknowns`. A newer schema is unreadable, a gap, never "no
 * decision". Pure; never mutates its input.
 * Returns { envelope, schema: 1 | 'unknown', unknowns: [path], problems: [text], gap: text | null }.
 */
export function readEnvelope(value) {
  if (!isObject(value)) return { envelope: null, schema: 'unknown', unknowns: [], problems: [], gap: 'not an envelope object' };
  if (value.schema !== undefined && value.schema !== ENVELOPE_SCHEMA) {
    return { envelope: null, schema: 'unknown', unknowns: [], problems: [], gap: Number.isInteger(value.schema) && value.schema > ENVELOPE_SCHEMA ? `schema ${value.schema} is newer than this reader (${ENVELOPE_SCHEMA})` : `schema ${JSON.stringify(value.schema)} is not an envelope schema` };
  }
  const unknowns = [];
  const NOT = unknown('not recorded');
  const fill = (v, groups, at) => {
    const out = { ...v };
    for (const k of groups) if (!(k in out)) { out[k] = NOT; unknowns.push(at ? `${at}.${k}` : k); }
    return out;
  };
  const e = fill(value, ['operation', 'sourceRevision', 'authority', 'dependsOn'], '');
  e.schema = ENVELOPE_SCHEMA;
  if (value.schema === undefined) unknowns.unshift('schema');
  const group = (k, leaves) => { e[k] = isObject(value[k]) && !isUnknown(value[k]) ? fill(value[k], leaves, k) : value[k] === undefined ? (unknowns.push(...leaves.map(l => `${k}.${l}`)), fill({}, leaves, null)) : value[k]; };
  group('choice', ['alternatives', 'rationale', 'evidence', 'affects']);
  if (isObject(e.choice)) {
    if (!('confidence' in e.choice)) { e.choice.confidence = 'unknown'; unknowns.push('choice.confidence'); }
    if (!('unknowns' in e.choice)) { e.choice.unknowns = []; unknowns.push('choice.unknowns'); }
  }
  group('consequences', ['expects', 'checkBy', 'interactions', 'observations']);
  group('change', ['commits', 'flags', 'configuration', 'references', 'validation', 'effects']);
  if (!isObject(value.recovery) || isUnknown(value.recovery)) { e.recovery = value.recovery === undefined ? fill({}, ['door', 'preconditions', 'knownGood', 'steps', 'limits', 'expires'], null) : value.recovery; if (value.recovery === undefined) unknowns.push('recovery'); }
  else group('recovery', ['door', 'preconditions', 'knownGood', 'steps', 'limits', 'expires']);
  if (!('followUp' in e)) e.followUp = null;
  const { problems } = validateEnvelope(e);
  return { envelope: e, schema: value.schema === undefined ? 'unknown' : ENVELOPE_SCHEMA, unknowns, problems, gap: null };
}

/** The pure write's guard: the envelope unchanged, or refused (EnvelopeError) with every problem. */
export function assertEnvelope(envelope, context) {
  const problems = [...validateEnvelope(envelope).problems, ...(context ? contextProblems(envelope, context) : [])];
  if (problems.length) throw new EnvelopeError(problems.join('; '));
  return envelope;
}
