// Phase 162: standalone advisory assessment. No execution or authority verification.
import { isUnknown } from './night-decisions.mjs';
import { DOORS } from './decision-loop.mjs';

const own = (v, k) => Object.hasOwn(v, k);
const absent = v => v === undefined || (v !== null && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v)) && Object.hasOwn(v, 'unknown') && Object.hasOwn(Object.getOwnPropertyDescriptor(v, 'unknown'), 'value') && isUnknown(v));
const text = v => typeof v === 'string' && v.trim().length > 0;
const fail = at => { throw new TypeError(`${at}: malformed door assessment`); };
function object(v, keys, at) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail(at);
  for (const k of keys) if (k in v && !own(v, k)) fail(`${at}.${k}`);
  for (const k of Reflect.ownKeys(v)) {
    if (!keys.includes(k) || !own(Object.getOwnPropertyDescriptor(v, k), 'value')) fail(`${at}.${String(k)}`);
  }
}
function check(v, pred, at) { if (!absent(v) && !pred(v)) fail(at); }
const list = v => Array.isArray(v) && Array.from({ length: v.length }, (_, i) => own(v, i) && text(v[i])).every(Boolean);
const bool = v => typeof v === 'boolean';
const enumeration = values => v => values.includes(v);
const path = v => text(v) && !v.includes('\\') && !v.startsWith('/') && !v.includes('\0') && v.split('/').every(p => p && p !== '.' && p !== '..');
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const kinds = ['local-change', 'disclosure', 'message', 'spend', 'data-loss', 'unknown'];
const gates = ['authority', 'scope', 'budget', 'hooks'];

/**
 * assessDoor({ intent, effectsComplete, effects, context, operation, asOf })
 * Missing facts or envelope-style {unknown: reason} remain unknown. Invalid
 * types, enums, extra keys and inherited record fields throw TypeError.
 * Effects: {kind, description, paths, bounded, recovery}. Recovery reuses the
 * envelope's door/preconditions/knownGood/steps/limits/expires and adds evidence,
 * reliable, boundedCost, cost, preconditionsMet. All are declarations, not proof.
 * Context: {trust: 'verified'|'untrusted'|'unknown', authority/scope/budget/hooks:
 * 'allowed'|'denied'|'unknown', authorityRef, protectedPaths: [relative paths]}.
 * A future adapter must establish trust independently of model/tool arguments;
 * even trust:'verified' here is only a description. Never use this as a grant.
 * Operation: {id, state: 'not-started'|'running'|'uncertain'|'completed'|'failed'|
 * 'unknown', receipts: [reference]}. Only not-started can recommend continuing.
 * asOf is an explicit YYYY-MM-DD; expiry day itself is conservatively expired.
 */
export function assessDoor(input) {
  object(input, ['intent', 'effectsComplete', 'effects', 'context', 'operation', 'asOf'], 'input');
  check(input.intent, text, 'intent');
  check(input.effectsComplete, bool, 'effectsComplete');
  check(input.asOf, date, 'asOf');
  check(input.effects, Array.isArray, 'effects');
  const effects = absent(input.effects) ? [] : input.effects;
  // Array holes must not hide an unexamined effect.
  for (let i = 0; i < effects.length; i++) {
    if (!own(effects, i)) fail(`effects[${i}]`);
    const e = effects[i];
    object(e, ['kind', 'description', 'paths', 'bounded', 'recovery'], `effects[${i}]`);
    check(e.kind, enumeration(kinds), 'effect.kind');
    check(e.description, text, 'effect.description');
    check(e.paths, v => list(v) && v.every(path), 'effect.paths');
    check(e.bounded, bool, 'effect.bounded');
    if (!absent(e.recovery)) {
      const r = e.recovery;
      object(r, ['door', 'preconditions', 'knownGood', 'steps', 'limits', 'expires', 'evidence', 'reliable', 'boundedCost', 'cost', 'preconditionsMet'], 'recovery');
      check(r.door, enumeration(DOORS), 'recovery.door');
      for (const k of ['preconditions', 'steps', 'limits', 'evidence']) check(r[k], list, `recovery.${k}`);
      for (const k of ['knownGood', 'cost']) check(r[k], text, `recovery.${k}`);
      for (const k of ['reliable', 'boundedCost', 'preconditionsMet']) check(r[k], bool, `recovery.${k}`);
      check(r.expires, v => v === null || date(v), 'recovery.expires');
    }
  }
  const c = absent(input.context) ? {} : input.context;
  object(c, [...gates, 'trust', 'authorityRef', 'protectedPaths'], 'context');
  for (const k of gates) check(c[k], enumeration(['allowed', 'denied', 'unknown']), `context.${k}`);
  check(c.trust, enumeration(['verified', 'untrusted', 'unknown']), 'context.trust');
  check(c.authorityRef, text, 'context.authorityRef');
  check(c.protectedPaths, v => list(v) && v.every(p => path(p.endsWith('/') ? p.slice(0, -1) : p)), 'context.protectedPaths');
  const op = absent(input.operation) ? {} : input.operation;
  object(op, ['id', 'state', 'receipts'], 'operation');
  check(op.id, text, 'operation.id');
  check(op.state, enumeration(['not-started', 'running', 'uncertain', 'completed', 'failed', 'unknown']), 'operation.state');
  check(op.receipts, list, 'operation.receipts');

  const assessed = effects.map((e, index) => {
    const r = absent(e.recovery) ? {} : e.recovery;
    const reasons = [];
    let door = 'unknown';
    if (['disclosure', 'message', 'spend', 'data-loss'].includes(e.kind) || r.door === 'irreversible') {
      door = 'one-way';
      reasons.push('An irreversible effect remains after compensation or a Git revert.');
    } else if (e.kind === 'local-change') {
      if (e.bounded !== true || !Array.isArray(e.paths) || !e.paths.length) reasons.push('Local scope and affected paths must be bounded.');
      if (!text(r.knownGood) || !Array.isArray(r.evidence) || !r.evidence.length) reasons.push('Retained preimage/known-good state and recovery evidence are missing.');
      if (!Array.isArray(r.steps) || !r.steps.length || !Array.isArray(r.preconditions) || !Array.isArray(r.limits)) reasons.push('Recovery steps, preconditions and limits must be recorded.');
      if (r.reliable !== true || r.preconditionsMet !== true || r.boundedCost !== true || !text(r.cost)) reasons.push('Reliable recovery, satisfied preconditions and bounded recovery cost are not established in the description.');
      if (!['reversible', 'windowed'].includes(r.door)) reasons.push('Recovery door is unknown.');
      if (absent(r.expires) || (r.door === 'windowed' && r.expires === null)) reasons.push('Recovery expiry is unknown.');
      else if (r.expires !== null && (!date(input.asOf) || input.asOf >= r.expires)) reasons.push('Recovery window is expired or the assessment date is unknown.');
      if (!reasons.length) { door = 'two-way'; reasons.push('Described bounded local effects have a retained preimage and bounded recovery.'); }
    } else reasons.push('Effect semantics are unknown; command names are not evidence.');
    return { index, description: e.description ?? 'unknown', door, reasons,
      paths: Array.isArray(e.paths) ? [...e.paths] : [],
      recovery: { steps: Array.isArray(r.steps) ? [...r.steps] : [], evidence: Array.isArray(r.evidence) ? [...r.evidence] : [], cost: text(r.cost) ? r.cost : 'unknown' } };
  });
  const reasons = assessed.flatMap(e => e.reasons.map(r => `Effect ${e.index + 1}: ${r}`));
  const complete = input.effectsComplete === true && assessed.length > 0;
  if (!complete) reasons.push('The complete effect inventory is unknown.');
  const door = assessed.some(e => e.door === 'one-way') ? 'one-way'
    : complete && assessed.every(e => e.door === 'two-way') ? 'two-way' : 'unknown';
  const denied = gates.filter(k => c[k] === 'denied');
  const missing = gates.filter(k => c[k] !== 'allowed' && c[k] !== 'denied');
  const protectedHits = assessed.flatMap(e => e.paths).filter(p => (Array.isArray(c.protectedPaths) ? c.protectedPaths : []).some(q => p === q.replace(/\/$/, '') || p.startsWith(q.endsWith('/') ? q : `${q}/`)));
  for (const k of denied) reasons.push(`${k}: denied; preserve the refusal.`);
  for (const k of missing) reasons.push(`${k}: unknown; obtain the missing decision or evidence.`);
  if (protectedHits.length) reasons.push(`Protected paths: ${protectedHits.join(', ')}.`);
  const identityKnown = text(input.intent) && effects.every(e => text(e.description)) && text(op.id);
  if (!identityKnown) reasons.push('Intent, effect descriptions and original operation identity must be explicit.');
  const contextKnown = c.trust === 'verified' && text(c.authorityRef) && Array.isArray(c.protectedPaths);
  if (!contextKnown) reasons.push('Trusted current context, authority reference or protected-path coverage is missing; declarations do not verify trust.');
  let recommendation = 'ask-or-park';
  let nextAction = 'Park dependent actions; obtain the missing evidence or exact decision. Continue independent authorized work.';
  if (denied.length || protectedHits.length) { recommendation = 'block'; nextAction = 'Preserve the refusal and protected scope; do not execute.'; }
  if (op.state !== 'not-started') {
    reasons.push('Prior execution is not established as not-started; preserve the original operation and receipts.');
    nextAction = 'Inspect the original operation receipt; do not retry or create a new operation.';
    if (!denied.length && !protectedHits.length) recommendation = 'inspect-receipt';
  } else if (!denied.length && !protectedHits.length && !missing.length && contextKnown && identityKnown && door === 'two-way') {
    recommendation = 'continue-within-existing-authority';
    nextAction = 'Recommendation only: revalidate described evidence and current authority through existing controls before any effect.';
  }
  if (op.state === 'not-started' && !denied.length && !protectedHits.length && !missing.length && contextKnown && identityKnown && complete && assessed.every(e => e.door !== 'unknown') && door === 'one-way') {
    recommendation = 'review-existing-exact-approval';
    nextAction = 'Use the existing exact approval path to verify coverage of every irreversible effect; this assessment supplies no new authorization.';
  }
  return { door, recommendation, authorizesExecution: false, evidenceBasis: 'declared-not-verified',
    intent: text(input.intent) ? input.intent : 'unknown', effects: assessed, reasons,
    authorityRef: text(c.authorityRef) ? c.authorityRef : 'unknown',
    operation: { id: text(op.id) ? op.id : 'unknown', receipts: Array.isArray(op.receipts) ? [...op.receipts] : [] }, nextAction };
}

/** A decision card, never an approval prompt or executable recovery command. */
export function formatDoorCard(result) {
  return [result.intent, `Door: ${result.door} — ${result.recommendation}`,
    'Advisory only; execution authorization: false; evidence: declared, not verified.',
    `Authority reference: ${result.authorityRef}`,
    ...result.effects.map(e => `Effect ${e.index + 1}: ${e.description}; scope: ${e.paths.join(', ') || 'unknown'}; recovery: ${e.recovery.steps.join('; ') || 'unknown'}; evidence: ${e.recovery.evidence.join(', ') || 'unknown'}; cost: ${e.recovery.cost}`),
    ...result.reasons.map(r => `- ${r}`),
    `Original operation: ${result.operation.id}; receipts: ${result.operation.receipts.join(', ') || 'unknown'}`,
    `Next: ${result.nextAction}`].join('\n');
}
