import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityReport, renderQualityReport, qualityStratum } from '../lib/agent-quality-report.mjs';
import { qualityEpisode } from '../lib/agent-quality-records.mjs';
import { sealRecord, fingerprint } from '../lib/evaluation-records.mjs';
import { acmeQualityEpisode, acmeQualityBundle, QUALITY_TIME, QUALITY_HASH as HASH } from './helpers/agent-quality.mjs';
import { acmeEvaluationPlan } from './helpers/evaluation-plan.mjs';

const report = (episodes, options = {}) => qualityReport(acmeQualityBundle(episodes), { now: QUALITY_TIME, ...options });
function edited(id, edit) { const e = acmeQualityEpisode(id); edit(e); return sealRecord(e); }
function evaluation(e, attempt, overrides = {}) { return { ...structuredClone(e.evaluations[0]), id: `evaluation-${attempt.id}`, attemptId: attempt.id, stage: attempt.stage, ...overrides }; }
function extraAttempt(e, stage, id, overrides = {}) {
  return { ...structuredClone(e.attempts[0]), id, stage, parentId: e.attempts.at(-1).id,
    startedAt: '2026-10-29T02:00:00.000Z', checkpointDigest: 'c'.repeat(64), inputCheckpointDigest: e.attempts.at(-1).checkpointDigest, ...overrides };
}
function finding(id, label, overrides = {}) { return { id, label, severity: 'major', presentedAsConsequential: true, remedy: 'helpful', evidence: [HASH], ...overrides }; }
function mix(e, extra = []) { return { id: 'acme-reference', createdAt: '2026-10-28T00:00:00.000Z', strata: [{ ...qualityStratum(e), weight: extra.length ? 0.5 : 1 }, ...extra] }; }

test('metadata candidates are not assigned episodes or agent successes', () => {
  const e = qualityEpisode({ id: 'acme-history', project: 'Acme/widget', createdAt: QUALITY_TIME, source: { kind: 'git', id: 'a'.repeat(40), at: QUALITY_TIME, digest: HASH } });
  const r = report([e]);
  assert.equal(r.coverage.metadataCandidates, 1);
  assert.equal(r.coverage.assignedEpisodes, 0);
  assert.equal(r.coverage.comparableEpisodes, 0);
  assert.equal(r.workload.completion.denominator, 0);
  assert.equal(r.workload.currencyUsd.total, null);
  assert.equal(r.recommendation.status, 'unknown');
  assert.equal(r.recommendation.winner, null);
  assert.equal(r.recommendation.automaticRouting, false);
  assert.match(renderQualityReport(r), /1 metadata candidates awaiting task mapping/);
});

test('failed skipped denied aborted and unknown assignments stay in completion and cost denominators', () => {
  const states = ['failed', 'timeout', 'blocked', 'skipped', 'denied', 'aborted', 'unknown'];
  const episodes = [acmeQualityEpisode(), ...states.map(status => edited(`acme-${status}`, e => {
    e.attempts[0].status = status; e.attempts[0].checkpointDigest = null; e.evaluations = [];
    e.attempts[0].resources.currencyUsd = 3;
  }))];
  const r = report(episodes);
  assert.equal(r.workload.completion.denominator, 8);
  assert.equal(r.workload.completion.accepted, 1);
  assert.equal(r.workload.completion.failed, 6);
  assert.equal(r.workload.completion.unknown, 1);
  assert.equal(r.coverage.comparableEpisodes, 7);
  assert.equal(r.workload.currencyUsd.knownSubtotal, 23);
  assert.equal(r.workload.currencyUsd.total, null, 'unknown attempt is incomplete accounting');
  const terminal = report(episodes.slice(0, -1));
  assert.equal(terminal.workload.currencyUsd.total, 20);
  assert.equal(terminal.workload.currencyUsd.costPerAccepted, 20);
  for (const status of states) assert.equal(r.workload.attemptStatuses[status], 1);
});

test('estimates and unknown effort never become actual charges or zero', () => {
  const e = edited('acme-estimated', e => {
    Object.assign(e.attempts[0].resources, { currencySource: 'estimate', estimateBasis: HASH, priceDate: '2026-10-28', activeHumanMinutes: null });
  });
  const r = report([e]);
  assert.equal(r.workload.currencyUsd.knownSubtotal, 0);
  assert.equal(r.workload.currencyUsd.total, null);
  assert.equal(r.workload.currencyUsd.costPerAccepted, null);
  assert.equal(r.workload.estimates.knownSubtotal, 2);
  assert.equal(r.workload.estimates.records[0].priceDate, '2026-10-28');
  assert.equal(r.workload.activeHumanMinutes.total, null);
});

test('initial code remains separate from successful revision and repeated attempts are one task', () => {
  const e = edited('acme-revised', e => {
    e.evaluations[0].quality = 1; e.evaluations[0].proportionality = 1; e.evaluations[0].acceptance = 'rejected';
    const attempt = extraAttempt(e, 'iteration', 'acme-revision');
    e.attempts.push(attempt); e.evaluations.push(evaluation(e, attempt, { quality: 3, proportionality: 3, acceptance: 'accepted' }));
  });
  const r = report([e]);
  assert.equal(r.workload.independentTasks, 1);
  assert.equal(r.workload.attempts, 2);
  assert.equal(r.workload.completion.accepted, 1);
  assert.equal(r.workload.stages.coding.quality.mean, 1);
  assert.equal(r.workload.stages.iteration.quality.mean, 3);
  assert.equal(r.workload.currencyUsd.costPerAccepted, 4);
  assert.equal(r.episodes[0].finalAttemptId, 'acme-revision');
});

test('failed revision cannot inherit earlier accepted code', () => {
  const e = edited('acme-failed-revision', e => e.attempts.push(extraAttempt(e, 'iteration', 'acme-revision', { status: 'failed', checkpointDigest: null })));
  const r = report([e]);
  assert.equal(r.workload.completion.accepted, 0);
  assert.equal(r.workload.completion.failed, 1);
});

test('human disagreement and model-only judgments remain unknown rather than averaging away dissent', () => {
  const disagreement = edited('acme-disputed', e => e.evaluations.push({ ...structuredClone(e.evaluations[0]), id: 'acme-other-evaluation', evaluator: 'acme-other-human', quality: 1, acceptance: 'rejected' }));
  const model = edited('acme-model-only', e => { e.evaluations[0].authority = 'model'; });
  const r = report([disagreement, model]);
  assert.equal(r.workload.completion.accepted, 0);
  assert.equal(r.workload.completion.unknown, 2);
  assert.equal(r.workload.stages.coding.quality.mean, null);
  assert.equal(r.workload.stages.coding.disputedAttempts.length, 1);
});

test('review precision deduplicates findings and retains false alarms harmful advice and unresolved sensitivity', () => {
  const e = edited('acme-reviewed', e => {
    const a = extraAttempt(e, 'review', 'acme-review'); e.attempts.push(a);
    const v = evaluation(e, a, { acceptance: 'unknown', findings: [finding('defect', 'consequential'), finding('false', 'false-positive', { remedy: 'harmful' }), finding('optional', 'optional', { presentedAsConsequential: false }), finding('unresolved', 'indeterminate'), finding('duplicate', 'duplicate')] });
    e.evaluations.push(v, { ...structuredClone(v), id: 'acme-second-review-evaluation', evaluator: 'acme-second-human' });
  });
  const r = report([e]), m = r.workload.stages.review.review;
  assert.equal(m.distinctFindings, 4);
  assert.equal(m.duplicateComments, 1);
  assert.equal(m.harmfulAdvice, 1);
  assert.equal(m.consequentialPrecision.denominator, 3);
  assert.equal(m.consequentialPrecision.value, null);
  assert.equal(m.consequentialPrecision.lower, 1 / 3);
  assert.equal(m.consequentialPrecision.upper, 2 / 3);
  assert.equal(m.recall.value, null);
});

test('exact models and rubrics remain separate cohorts', () => {
  const first = acmeQualityEpisode('acme-one');
  const second = edited('acme-two', e => { e.attempts[0].agent.model = 'acme-v2'; e.evaluations[0].rubricVersion = 'quality-v2'; });
  const r = report([first, second]);
  assert.equal(r.cohorts.length, 2);
  assert.equal(r.workflows.length, 1, 'observed model drift does not redefine assigned workflow denominator');
  assert.equal(r.workload.stages.coding.quality.mean, null, 'incompatible rubrics are not averaged');
  assert.equal(r.cohorts[0].scorecard.quality.mean, 3);
});

test('fixed mix preserves missing stratum weight and rejects outcome-selected weights', () => {
  const e = acmeQualityEpisode(), referenceMix = mix(e, [{ ...qualityStratum(e), project: 'Acme/other', weight: 0.5 }]);
  const r = report([e], { referenceMix });
  assert.equal(r.fixedMix.coverageWeight, 0.5);
  assert.equal(r.fixedMix.completionRate, null);
  assert.equal(r.fixedMix.state, 'unknown');
  assert.equal(r.workflows[0].fixedMix.coverageWeight, 0.5);
  assert.equal(r.workload.completion.rate, 1, 'workload mix remains explicitly distinct');
  const late = report([e], { referenceMix: { ...mix(e), createdAt: QUALITY_TIME } });
  assert.equal(late.fixedMix.state, 'not-prespecified');
  assert.equal(late.fixedMix.completionRate, null);
  assert.throws(() => report([e], { referenceMix: { ...mix(e), strata: [{ ...qualityStratum(e), weight: 0.5 }] } }), /weights/);
});

test('retrospective labels are excluded while missing actual model remains denominator uncertainty', () => {
  const historical = edited('acme-history', e => { e.passport.timing = 'retrospective'; });
  const unknownModel = edited('acme-unresolved', e => { e.attempts[0].agent.model = null; });
  const r = report([historical, unknownModel], { referenceMix: mix(historical) });
  assert.equal(r.coverage.comparableEpisodes, 0);
  assert.equal(r.fixedMix.coverageWeight, 1);
  assert.equal(r.fixedMix.strata[0].denominator, 1);
  assert.equal(r.fixedMix.strata[0].incompleteObservationEpisodes, 1);
  assert.equal(r.fixedMix.completionRate, null);
  assert.equal(r.recommendation.status, 'unknown');
  assert.equal(r.workload.completion.accepted, 2, 'declared outcomes remain visible outside comparison');
});

test('follow-up requires elapsed window observed exposure and evidence', () => {
  const mature = edited('acme-mature', e => { e.followup = [{ days: 7, usedAt: '2026-10-01T00:00:00.000Z', observedAt: '2026-10-09T00:00:00.000Z', exposure: 100, regressions: 1, repairMinutes: 10, evidence: [HASH] }]; });
  const immature = edited('acme-immature', e => { e.followup = [{ days: 7, usedAt: '2026-10-28T00:00:00.000Z', observedAt: QUALITY_TIME, exposure: 10, regressions: 0, repairMinutes: 0, evidence: [HASH] }]; });
  const unexposed = edited('acme-unexposed', e => { e.followup = [{ ...mature.followup[0], exposure: 0 }]; });
  const stale = edited('acme-stale', e => { e.followup = [{ ...mature.followup[0], observedAt: '2026-10-02T00:00:00.000Z' }]; });
  const r = report([mature, immature, unexposed, stale]);
  assert.equal(r.workload.followup[7].mature, 1);
  assert.equal(r.workload.followup[7].immature, 1);
  assert.equal(r.workload.followup[7].unknown, 2);
  assert.equal(r.workload.followup[7].regressions.total, 1);
  assert.equal(r.workload.followup[30].mature, 0);
  assert.equal(r.workload.followup[30].regressions.total, null);
});

test('project-local identities avoid merging same episode IDs across projects', () => {
  const one = acmeQualityEpisode();
  const two = edited('acme-task', e => { e.project = 'Acme/other'; e.evaluations[0].quality = 1; });
  const r = report([one, two]);
  assert.equal(r.coverage.projects, 2);
  assert.equal(r.workload.independentTasks, 2);
  assert.equal(r.cohorts[0].scorecard.tasks, 2);
  assert.equal(r.cohorts[0].scorecard.quality.mean, 2);
  assert.equal(r.strata.length, 2);
});

test('material changes flag new cohorts and critical evidence without claiming statistical improvement', () => {
  const before = report([acmeQualityEpisode()]);
  const e = edited('acme-task', e => {
    e.attempts[0].agent.model = 'acme-v2';
    e.evaluations[0].findings = [finding('serious-risk', 'consequential', { severity: 'critical' })];
    e.evaluations[0].proportionalityEvidence.seriousRisk = true;
    e.evaluations[0].proportionalityEvidence.requiredSafeguard = true;
  });
  const r = report([e], { previous: before });
  assert.ok(r.materialChanges.some(c => c.kind === 'new-agent-cohort' && c.severity === 'watch'));
  assert.ok(r.materialChanges.some(c => c.kind === 'critical-finding' && c.severity === 'investigate'));
  assert.equal(r.recommendation.winner, null);
  assert.equal(r.workload.stages.coding.proportionality.mean, 3, 'required safeguards are not penalized automatically for rarity');
  assert.equal(report([e], { previous: r }).materialChanges.length, 0);
  const invalidPrevious = structuredClone(before); invalidPrevious.coverage.episodes = 999;
  assert.equal(report([e], { previous: invalidPrevious }).materialChanges[0].kind, 'previous-unavailable');
});

test('frozen comparison preserves every missing planned arm and candidate mapping', () => {
  const bundle = acmeEvaluationPlan(), plan = { bundle, digest: HASH };
  const r = report([], { frozen: [{ experiment: bundle.comparison.id, plan, execution: { trials: [], issues: [] } }] });
  const c = r.paired.comparisons[0];
  assert.equal(c.plannedPairs, bundle.comparison.pairs.length);
  assert.equal(c.plannedSlots, bundle.comparison.pairs.length * 2);
  assert.equal(c.comparablePairs, 0);
  assert.equal(c.arms.baseline.missing, bundle.comparison.pairs.length);
  assert.equal(c.arms.candidate.missing, bundle.comparison.pairs.length);
  assert.deepEqual(c.candidate.candidate, bundle.comparison.candidate);
  assert.equal(r.paired.interval, null);
  assert.equal(r.recommendation.status, 'unknown');
});

test('report is deterministic source-bound immutable and rejects duplicates and tampering', () => {
  const b = acmeQualityBundle(), before = structuredClone(b), options = { now: QUALITY_TIME };
  const a = qualityReport(b, options), second = qualityReport(b, options);
  assert.deepEqual(a, second); assert.deepEqual(b, before);
  const { digest, ...body } = a; assert.equal(digest, fingerprint(body));
  assert.equal(a.sourceDigest, fingerprint(b));
  assert.throws(() => report([b.episodes[0], b.episodes[0]]), /duplicate quality episode/);
  b.episodes[0].workflow = 'tampered';
  assert.throws(() => qualityReport(b, options), /digest/);
});

test('normalization cannot discard missing outcomes after assignment', () => {
  const accepted = acmeQualityEpisode('acme-accepted');
  const missing = edited('acme-missing-judgment', e => { e.evaluations = []; });
  const r = report([accepted, missing], { referenceMix: mix(accepted) });
  assert.equal(r.coverage.comparisonEligibleEpisodes, 2);
  assert.equal(r.fixedMix.coverageWeight, 1);
  assert.equal(r.fixedMix.strata[0].independentTasks, 2);
  assert.equal(r.fixedMix.strata[0].denominator, 2);
  assert.equal(r.fixedMix.strata[0].acceptedOverAssigned, 0.5);
  assert.equal(r.fixedMix.strata[0].unknownOutcomes, 1);
  assert.equal(r.fixedMix.strata[0].upper, 1);
  assert.equal(r.fixedMix.completionRate, null);
  assert.equal(r.fixedMix.state, 'unknown');
  assert.equal(r.workflows[0].fixedMix.strata[0].denominator, 2);
  const checkpointMissing = edited('acme-checkpoint-missing', e => { e.evaluations = []; e.attempts[0].checkpointDigest = null; });
  assert.equal(report([accepted, checkpointMissing], { referenceMix: mix(accepted) }).fixedMix.strata[0].denominator, 2);
});

test('accepted adjudication contradicting a failed attempt remains unknown', () => {
  const e = edited('acme-conflict', e => { e.attempts[0].status = 'failed'; });
  const r = report([e]);
  assert.equal(r.workload.completion.accepted, 0);
  assert.equal(r.workload.completion.failed, 0);
  assert.equal(r.workload.completion.unknown, 1);
  assert.ok(r.episodes[0].gaps.includes('acceptance-status-conflict'));
});

test('agent comparisons remain scoped to project task stratum and exact workflow pairing', () => {
  const first = acmeQualityEpisode('acme-one');
  const second = edited('acme-two', e => { e.project = 'Acme/other'; e.evaluations[0].quality = 1; });
  const reverse = edited('acme-reverse', e => { e.workflow = 'acme-b'; e.evaluations[0].quality = 2; });
  const r = report([first, second, reverse], { referenceMix: mix(first) });
  assert.equal(r.workflows.length, 2);
  assert.equal(r.scopedAgentCohorts.length, 2);
  const other = r.scopedAgentCohorts.find(c => c.stratum.project === 'acme/other');
  assert.equal(other.scorecard.quality.mean, 1);
  const widget = r.scopedAgentCohorts.find(c => c.stratum.project === 'acme/widget');
  assert.equal(widget.scorecard.quality.mean, 2.5);
  const a = r.workflows.find(w => w.workflow === 'acme-a'), b = r.workflows.find(w => w.workflow === 'acme-b');
  assert.equal(a.projectScorecards.length, 2);
  assert.equal(a.strata.length, 2);
  assert.equal(a.fixedMix.strata[0].denominator, 1);
  assert.equal(b.fixedMix.strata[0].denominator, 1);
  assert.equal(a.projectScorecards.find(p => p.key === 'acme/widget').summary.stages.coding.quality.mean, 3);
  assert.equal(b.projectScorecards[0].summary.stages.coding.quality.mean, 2);
});

test('observed stage score changes are watch signals without statistical significance claims', () => {
  const before = report([acmeQualityEpisode()]);
  const after = report([edited('acme-task', e => { e.evaluations[0].quality = 2; })], { previous: before });
  const change = after.materialChanges.find(c => c.kind === 'stage-score-changed');
  assert.equal(change.severity, 'watch');
  assert.equal(change.previous.mean, 3);
  assert.equal(change.current.mean, 2);
  assert.match(change.reason, /not prespecified/);
});

test('early failures keep the preassigned workflow denominator despite missing later stages', () => {
  const accepted = acmeQualityEpisode('acme-accepted');
  const failed = edited('acme-failed', e => {
    e.attempts[0].stage = 'planning'; e.attempts[0].status = 'failed'; e.attempts[0].checkpointDigest = null; e.evaluations = [];
  });
  const r = report([accepted, failed]);
  assert.equal(r.workflows.length, 1);
  assert.equal(r.workflows[0].summary.assigned, 2);
  assert.equal(r.workflows[0].summary.completion.accepted, 1);
  assert.equal(r.workflows[0].summary.completion.failed, 1);
  assert.equal(r.workflows[0].summary.completion.rate, 0.5);
  const unknownRoute = [accepted, failed].map(e => { const copy = structuredClone(e); delete copy.passport.workflowDigest; return sealRecord(copy); });
  const unknown = report(unknownRoute);
  assert.equal(unknown.workflows.length, 1);
  assert.equal(unknown.workflows[0].configurationState, 'unknown');
  assert.equal(unknown.workflows[0].fixedMix.completionRate, null);
});

test('project case differences cannot create new project strata', () => {
  const a = acmeQualityEpisode('acme-one');
  const b = edited('acme-two', e => { e.project = 'acme/widget'; });
  const r = report([a, b]);
  assert.equal(r.coverage.projects, 1);
  assert.equal(r.strata.length, 1);
  assert.equal(r.workflows[0].projectScorecards.length, 1);
});

test('repeated findings on the same reviewed patch do not reward comment volume', () => {
  const e = edited('acme-repeated-review', e => {
    const first = extraAttempt(e, 'review', 'acme-review-one', { checkpointDigest: 'b'.repeat(64), inputCheckpointDigest: HASH });
    e.attempts.push(first);
    const second = extraAttempt(e, 'review', 'acme-review-two', { checkpointDigest: 'c'.repeat(64), inputCheckpointDigest: HASH });
    e.attempts.push(second);
    e.evaluations.push(evaluation(e, first, { findings: [finding('same-defect', 'consequential'), finding('false-alarm', 'false-positive')] }),
      evaluation(e, second, { findings: [finding('same-defect', 'consequential')] }));
  });
  const m = report([e]).workload.stages.review.review;
  assert.equal(m.distinctFindings, 2);
  assert.equal(m.labels.consequential, 1);
  assert.equal(m.duplicateComments, 1);
  assert.equal(m.consequentialPrecision.value, 0.5);
});

test('preassigned routes retain never-started and denied-without-agent episodes', () => {
  const accepted = acmeQualityEpisode('acme-accepted');
  const noStart = edited('acme-no-start', e => { e.attempts = []; e.evaluations = []; });
  const denied = edited('acme-denied', e => {
    e.attempts[0].status = 'denied'; e.attempts[0].agent = null;
    e.attempts[0].checkpointDigest = null; e.evaluations = [];
  });
  for (const incomplete of [noStart, denied]) {
    const r = report([accepted, incomplete], { referenceMix: mix(accepted) });
    assert.equal(r.coverage.comparisonEligibleEpisodes, 2);
    assert.equal(r.workflows.length, 1);
    assert.equal(r.workflows[0].summary.completion.denominator, 2);
    for (const fixed of [r.fixedMix, r.workflows[0].fixedMix]) {
      assert.equal(fixed.strata[0].denominator, 2);
      assert.equal(fixed.strata[0].acceptedOverAssigned, 0.5);
      assert.equal(fixed.strata[0].incompleteObservationEpisodes, 1);
      assert.equal(fixed.completionRate, null);
      assert.equal(fixed.state, 'unknown');
    }
  }
});

test('reference mix only accepts bounded metadata dimensions and rejects extra fields', () => {
  const e = acmeQualityEpisode(), referenceMix = mix(e);
  assert.throws(() => report([e], { referenceMix: { ...referenceMix, privateText: 'must not enter report' } }), /fields/);
  assert.throws(() => report([e], { referenceMix: { ...referenceMix, strata: [{ ...referenceMix.strata[0], privateText: 'must not enter report' }] } }), /fields/);
  assert.throws(() => report([e], { referenceMix: { ...referenceMix, strata: [{ ...referenceMix.strata[0], risk: 'arbitrary-text' }] } }), /dimension/);
  const uppercase = { ...referenceMix, strata: [{ ...referenceMix.strata[0], project: 'Acme/widget' }] };
  assert.equal(report([e], { referenceMix: uppercase }).fixedMix.coverageWeight, 1);
});
