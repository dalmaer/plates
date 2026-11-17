import test from 'node:test';
import assert from 'node:assert/strict';
import { priorityScore, auditLeverage, normalizeAudit, normalizeReview, normalizeObservation, groupFindings, evaluateDecision } from '../lib/findings.mjs';

import { leverage } from '../practices/audits/files/scripts/plates/audit.mjs';
import { auditLeverage as renderedLeverage } from '../scripts/plates/finding-score.mjs';

const finding = { id: 'one', title: 'Acme duplicate parser', severity: 'high', effort: 'M', confidence: 'MED', risk: 'LOW', evidence: [{ path: 'lib/acme.mjs', line: 3, what: 'Same parser' }], impact: 'Twice the maintenance', fix: 'Try a shared parser' };
const doc = { lens: 'simplify', date: '2026-11-16', commit: 'a'.repeat(40), findings: [finding] };
const audit = (d = doc, repo = 'acme/app') => normalizeAudit(d, { repo, page: `docs/audits/${d.date}-${d.lens}.md` });
const decision = { action: 'keep', rationale: 'Remove duplicate code without adding layers', payoff: { verdict: 'yes', benefit: 'One bug fix reaches both callers', cost: 'One small change', complexity: 'Removes one parser; no new dependency' } };

test('shared score preserves leverage and missing evidence never becomes zero', () => {
  assert.equal(auditLeverage(finding), 3 / 2 * .6);
  assert.equal(priorityScore({}).score, null);
  assert.deepEqual(priorityScore({ severity: 'high' }).missing, ['effort', 'confidence', 'risk']);
  assert.equal(priorityScore({ ...finding, effort: 'constructor' }).score, null);
});
test('source-qualified identity never conflates same finding id across records or repos', () => {
  const a = audit()[0];
  assert.equal(a.id, audit()[0].id);
  assert.notEqual(a.id, audit({ ...doc, date: '2026-11-17' })[0].id);
  assert.notEqual(a.id, audit(doc, 'acme/other')[0].id);
  assert.notEqual(a.fingerprint, audit({ ...doc, commit: 'b'.repeat(40) })[0].fingerprint);
  assert.deepEqual(doc.findings[0], finding);
});
test('review adapters retain answered status and do not invent cost or ROI', () => {
  const data = { repo: 'acme/app', number: 3, head: 'a'.repeat(40), comments: [{ id: 'T1', text: 'Acme bug', answered: true, severity: 'P1', path: 'a.mjs', line: 5 }, { id: 'S1', status: true, text: 'Review running' }] };
  const [one] = normalizeReview(data);
  assert.equal(normalizeReview(data).length, 1);
  assert.equal(one.status, 'answered');
  assert.equal(one.priority.score, null);
  const [next] = normalizeReview({ ...data, head: 'b'.repeat(40) });
  assert.equal(one.id, next.id);
  assert.notEqual(one.fingerprint, next.fingerprint);
  assert.throws(() => normalizeReview({ repo: 'acme/app', comments: [] }), /PR number/);
});
test('generic deterministic observations use the same contract without false numerical certainty', () => {
  const one = normalizeObservation({ source: { kind: 'measure', repo: 'acme/app', record: '2026-11-16' }, localId: 'lint', title: 'Two lint failures' });
  assert.equal(one.priority.score, null);
  assert.equal(one.status, 'open');
  assert.throws(() => normalizeObservation({ source: {}, title: 'Acme' }), /source.kind/);
});
test('only explicit links group different observations, and all evidence survives', () => {
  const a = audit()[0], b = audit({ ...doc, date: '2026-11-17' })[0];
  assert.equal(groupFindings([a, b]).length, 2);
  const [group] = groupFindings([a, b], [{ from: a.id, to: b.id }]);
  assert.equal(group.observations.length, 2);
  assert.equal(group.duplicate, true);
  assert.equal(groupFindings([a, a]).length, 1);
  assert.throws(() => groupFindings([a], [{ from: a.id, to: 'missing' }]), /unknown/);
  assert.throws(() => groupFindings([a, { ...a, title: 'Different' }]), /conflicting/);
  assert.deepEqual(groupFindings([b, a], [{ from: b.id, to: a.id }]), [group]);
});
test('payoff assessment includes ongoing complexity without becoming an automatic gate', () => {
  const result = evaluateDecision(audit()[0], decision);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.payoff.complexity, decision.payoff.complexity);
  assert.equal(result.priority.score, 3 / 2 * .6);
  assert.throws(() => evaluateDecision(audit()[0], { ...decision, payoff: { ...decision.payoff, complexity: '' } }), /complexity/);
  assert.equal(evaluateDecision(audit()[0], { ...decision, payoff: { ...decision.payoff, verdict: 'no' } }).warnings.length, 1);
});
test('bounded exploration accepts uncertainty but requires a question and stopping rule', () => {
  const explore = { ...decision, action: 'explore', payoff: { ...decision.payoff, verdict: 'unknown' }, experiment: { question: 'Can sharing remove code?', minutes: 30, success: 'Fewer lines with equal behavior', stop: 'Stop if tests expose incompatible semantics' } };
  assert.equal(evaluateDecision(audit()[0], explore).experiment.minutes, 30);
  assert.throws(() => evaluateDecision(audit()[0], { ...explore, experiment: null }), /experiment/);
  assert.throws(() => evaluateDecision(audit()[0], { ...explore, experiment: { ...explore.experiment, minutes: Infinity } }), /minutes/);
  assert.throws(() => evaluateDecision(audit()[0], { ...decision, action: 'build' }), /action/);
});

test('source and rendered audit leverage share the scorer for every supported input', () => {
  assert.equal(leverage, auditLeverage);
  for (const [severity, weight] of Object.entries({ high: 3, medium: 2, low: 1 })) {
    for (const [effort, cost] of Object.entries({ S: 1, M: 2, L: 4 })) {
      for (const [confidence, certainty] of Object.entries({ HIGH: 1, MED: .6, LOW: .3 })) {
        for (const [risk, discount] of Object.entries({ LOW: 1, MED: .8, HIGH: .6 })) {
          const input = { severity, effort, confidence, risk };
          assert.equal(leverage(input), weight / cost * certainty * discount);
          assert.equal(renderedLeverage(input), leverage(input));
        }
      }
    }
  }
});


test('review fingerprints bind the complete review content revision, not only its excerpt', () => {
  const data = {repo:'acme/app',number:1,head:'a'.repeat(40),contentRevision:'b'.repeat(64),comments:[{id:'T1',text:'Same title',answered:false}]};
  const [before] = normalizeReview(data);
  const [after] = normalizeReview({...data,contentRevision:'c'.repeat(64)});
  assert.equal(before.id,after.id);
  assert.notEqual(before.fingerprint,after.fingerprint);
});
