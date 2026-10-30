// Pure projections of private quality observations; never authorizes routing or execution.
import { fingerprint, fields, evaluationId, checkEvaluation as check } from './evaluation-records.mjs';
import { validateQualityBundle, qualityEpisodeKey } from './agent-quality-records.mjs';
import { summarizeComparison } from './evaluation-comparison-report.mjs';

const STAGES = ['planning', 'coding', 'review', 'iteration'];
const TERMINAL = new Set(['completed', 'failed', 'timeout', 'blocked', 'skipped', 'denied', 'aborted']);
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const unique = values => [...new Set(values)];
const sort = (items, key) => [...items].sort((a, b) => String(key(a)).localeCompare(String(key(b)), 'en'));
const consensus = values => values.length && values.every(value => value !== null && value === values[0]) ? values[0] : null;
function distribution(values) {
  const known = values.filter(number), ordered = [...known].sort((a, b) => a - b);
  return { observed: known.length, denominator: values.length, mean: mean(known),
    median: known.length ? (ordered[Math.floor((known.length - 1) / 2)] + ordered[Math.floor(known.length / 2)]) / 2 : null,
    min: ordered[0] ?? null, max: ordered.at(-1) ?? null };
}
function total(values, covered = true) {
  const known = values.filter(number), complete = covered && values.length > 0 && known.length === values.length;
  return { observed: known.length, denominator: values.length, knownSubtotal: known.reduce((sum, value) => sum + value, 0),
    complete, total: complete ? known.reduce((sum, value) => sum + value, 0) : null };
}
export function qualityStratum(episode) {
  const p = episode.passport, difficulty = p.difficulty?.reduce((sum, value) => sum + value, 0);
  return { project: episode.project.toLowerCase(), specialty: p.specialty, family: p.family,
    difficultyBand: difficulty == null ? null : difficulty <= 3 ? 'low' : difficulty <= 6 ? 'medium' : 'high', risk: p.risk };
}
const stratumKey = stratum => fingerprint(stratum);
function trustedEvaluations(episode, attempt) {
  return episode.evaluations.filter(e => e.attemptId === attempt.id && e.stage === attempt.stage
    && e.authority === 'human' && e.independent && e.evidence.length > 0 && attempt.checkpointDigest !== null);
}
function attemptProjection(episode, attempt) {
  const evaluations = trustedEvaluations(episode, attempt);
  const quality = consensus(evaluations.map(e => e.quality)), proportionality = consensus(evaluations.map(e => e.proportionality));
  const acceptance = consensus(evaluations.map(e => e.acceptance)) ?? 'unknown';
  const rubricVersions = unique(evaluations.map(e => e.rubricVersion));
  const findings = [];
  // The same finding repeated by two adjudicators is not two detected defects.
  const ids = unique(evaluations.flatMap(e => e.findings.map(f => f.id))).sort();
  for (const id of ids) {
    const labels = evaluations.flatMap(e => e.findings.filter(f => f.id === id));
    const supported = labels.every(f => f.evidence.length > 0);
    const label = supported ? consensus(labels.map(f => f.label)) ?? 'indeterminate' : 'indeterminate';
    findings.push({ id, label, severity: consensus(labels.map(f => f.severity)),
      presentedAsConsequential: labels.some(f => f.presentedAsConsequential),
      remedy: consensus(labels.map(f => f.remedy)) ?? 'unknown', evidence: unique(labels.flatMap(f => f.evidence)).sort() });
  }
  const disputes = ['quality', 'proportionality', 'acceptance'].filter(key => unique(evaluations.map(e => e[key])).length > 1);
  return { episodeId: episode.id, episodeKey: qualityEpisodeKey(episode), project: episode.project, id: attempt.id, parentId: attempt.parentId,
    stage: attempt.stage, status: attempt.status, agent: attempt.agent, cohort: attempt.agent ? fingerprint(attempt.agent) : null,
    checkpointDigest: attempt.checkpointDigest, inputCheckpointDigest: attempt.inputCheckpointDigest,
    experiment: attempt.experiment, resources: attempt.resources, startedAt: attempt.startedAt, endedAt: attempt.endedAt,
    evaluationIds: evaluations.map(e => e.id).sort(), evaluatorIds: unique(evaluations.map(e => e.evaluator)).sort(),
    blinded: evaluations.length > 0 && evaluations.every(e => e.blinded), rubricVersions,
    quality: rubricVersions.length === 1 ? quality : null, proportionality: rubricVersions.length === 1 ? proportionality : null,
    proportionalityEvidence: evaluations.map(e => ({ evaluator: e.evaluator, evidence: e.proportionalityEvidence })),
    acceptance, disputes: [...disputes, ...(rubricVersions.length > 1 ? ['rubric-version-drift'] : [])], findings };
}
function followup(episode, days, now) {
  const records = episode.followup.filter(f => f.days === days && Date.parse(f.observedAt) <= now);
  const last = sort(records, f => f.observedAt).at(-1);
  const usedAt = last?.usedAt;
  if (!usedAt) return { days, state: 'unknown', regressions: null, repairMinutes: null, evidence: [] };
  const due = Date.parse(usedAt) + days * 86400000;
  if (now < due) return { days, state: 'immature', dueAt: new Date(due).toISOString(), regressions: null, repairMinutes: null, evidence: last.evidence };
  if (Date.parse(last.observedAt) < due || !number(last.exposure) || last.exposure <= 0 || !number(last.regressions) || !last.evidence.length) {
    return { days, state: 'unknown', dueAt: new Date(due).toISOString(), regressions: null, repairMinutes: null, evidence: last.evidence };
  }
  return { days, state: 'mature', dueAt: new Date(due).toISOString(), observedAt: last.observedAt,
    exposure: last.exposure, regressions: last.regressions, repairMinutes: last.repairMinutes, evidence: last.evidence };
}
function projectEpisode(episode, now) {
  const attempts = episode.attempts.map(a => attemptProjection(episode, a));
  const p = episode.passport, gaps = [];
  for (const key of ['family', 'specialty', 'difficulty', 'risk', 'baseCommit', 'acceptanceDigest', 'contextDigest']) if (p[key] === null) gaps.push(`passport.${key}`);
  if (p.timing !== 'prospective' || !episode.assignedAt || Date.parse(p.recordedAt) > Date.parse(episode.assignedAt)) gaps.push('passport.not-frozen-before-assignment');
  if (!episode.workflow) gaps.push('workflow');
  if (!p.workflowDigest) gaps.push('passport.workflowDigest');
  // Selection is frozen at assignment. Missing or denied execution can lower
  // evidence coverage, but must never remove the task from its route denominator.
  const comparisonGaps = [...gaps];
  if (!attempts.length) gaps.push('attempts');
  for (const attempt of attempts) {
    if (!attempt.agent || Object.values(attempt.agent).some(value => value === null)) gaps.push('agent.provenance');
    if (attempt.status === 'completed' && !attempt.checkpointDigest) gaps.push('checkpoint');
  }
  const finalAttempts = attempts.filter(a => ['coding', 'iteration'].includes(a.stage));
  const final = finalAttempts.at(-1); // Append order is the retained attempt lineage, including failed revisions.
  const accepted = Boolean(episode.assignedAt && p.acceptanceDigest && final?.status === 'completed' && final.acceptance === 'accepted');
  const rejected = Boolean(final?.acceptance === 'rejected');
  const stopped = final ?? attempts.at(-1);
  const failed = stopped && TERMINAL.has(stopped.status) && stopped.status !== 'completed';
  const contradictoryOutcome = stopped && stopped.status !== 'completed' && stopped.acceptance === 'accepted';
  if (contradictoryOutcome) gaps.push('acceptance-status-conflict');
  const outcome = contradictoryOutcome ? 'unknown' : accepted ? 'accepted' : rejected ? 'rejected' : failed ? 'failed' : 'unknown';
  if (outcome === 'unknown') gaps.push('acceptance');
  const criticalFindings = attempts.flatMap(a => a.findings.filter(f => f.severity === 'critical' && ['consequential', 'miss'].includes(f.label)).map(f => ({ attemptId: a.id, stage: a.stage, ...f })));
  return { id: episode.id, key: qualityEpisodeKey(episode), digest: episode.digest, source: episode.source, links: episode.links, project: episode.project.toLowerCase(),
    assigned: episode.assignedAt !== null, assignedAt: episode.assignedAt, workflow: episode.workflow, workflowDigest: p.workflowDigest ?? null, workflowCohort: episode.workflow ? fingerprint({ workflow: episode.workflow, workflowDigest: p.workflowDigest ?? null }) : null, stratum: qualityStratum(episode),
    passportTiming: p.timing, attempts, outcome, finalAttemptId: final?.id ?? null,
    gaps: unique(gaps).sort(), comparisonEligible: comparisonGaps.length === 0, comparable: gaps.length === 0, criticalFindings,
    followup: [followup(episode, 7, now), followup(episode, 30, now)] };
}
function reviewMetrics(attempts) {
  const findings = attempts.flatMap(a => a.findings.filter(f => f.label !== 'duplicate').map(f => ({ ...f, key: `${a.episodeKey}:${a.inputCheckpointDigest ?? a.checkpointDigest}:${f.id}` })));
  const distinct = new Map();
  for (const f of findings) {
    if (!distinct.has(f.key)) distinct.set(f.key, f);
    else if (fingerprint({ label: distinct.get(f.key).label, severity: distinct.get(f.key).severity }) !== fingerprint({ label: f.label, severity: f.severity })) distinct.set(f.key, { ...f, label: 'indeterminate' });
  }
  const all = [...distinct.values()], consequential = all.filter(f => f.presentedAsConsequential), unresolved = consequential.filter(f => f.label === 'indeterminate').length;
  const confirmed = consequential.filter(f => f.label === 'consequential').length, denominator = consequential.length;
  return { distinctFindings: all.length, labels: Object.fromEntries(['consequential', 'optional', 'false-positive', 'indeterminate', 'miss'].map(label => [label, all.filter(f => f.label === label).length])),
    duplicateComments: attempts.flatMap(a => a.findings).filter(f => f.label === 'duplicate').length + findings.length - distinct.size,
    harmfulAdvice: all.filter(f => f.remedy === 'harmful').length,
    consequentialPrecision: { confirmed, denominator, unresolved, value: denominator && unresolved === 0 ? confirmed / denominator : null,
      lower: denominator ? confirmed / denominator : null, upper: denominator ? (confirmed + unresolved) / denominator : null },
    recall: { value: null, reason: 'No independently enumerated audited-defect universe is present; finding labels alone cannot establish recall.' } };
}
function stageSummary(episodes, stage) {
  const attempts = episodes.flatMap(e => e.attempts.filter(a => a.stage === stage));
  const rubricVersions = unique(attempts.flatMap(a => a.rubricVersions)).sort();
  const taskValues = episodes.map(e => {
    const observed = sort(e.attempts.filter(a => a.stage === stage), a => `${a.startedAt ?? ''}:${a.id}`);
    // Initial planning/code are scored before later repairs; review and revision
    // are averaged within a task so extra passes never become independent tasks.
    const selected = ['planning', 'coding'].includes(stage) ? observed.slice(0, 1) : observed;
    const values = key => selected.length && selected.every(a => a[key] !== null) ? mean(selected.map(a => a[key])) : null;
    return { episodeId: e.id, project: e.project, quality: values('quality'), proportionality: values('proportionality') };
  });
  return { stage, tasks: episodes.length, observedTasks: episodes.filter(e => e.attempts.some(a => a.stage === stage)).length, attempts: attempts.length,
    quality: distribution(taskValues.map(v => rubricVersions.length === 1 ? v.quality : null)),
    proportionality: distribution(taskValues.map(v => rubricVersions.length === 1 ? v.proportionality : null)), rubricVersions,
    taskScores: taskValues, disputedAttempts: attempts.filter(a => a.disputes.length).map(a => ({ episodeId: a.episodeId, project: a.project, attemptId: a.id, disputes: a.disputes })),
    ...(stage === 'review' ? { review: reviewMetrics(attempts) } : {}) };
}
function summarize(episodes) {
  const assigned = episodes.filter(e => e.assigned), attempts = episodes.flatMap(e => e.attempts), accepted = assigned.filter(e => e.outcome === 'accepted').length;
  const covered = episodes.length > 0 && episodes.every(e => e.attempts.length > 0 && e.attempts.every(a => TERMINAL.has(a.status)));
  const costs = total(attempts.map(a => a.resources.currencySource === 'actual' ? a.resources.currencyUsd : null), covered);
  const estimates = attempts.filter(a => a.resources.currencySource === 'estimate').map(a => ({ episodeId: a.episodeId, project: a.project, attemptId: a.id, currencyUsd: a.resources.currencyUsd, basis: a.resources.estimateBasis, priceDate: a.resources.priceDate }));
  return { episodes: episodes.length, metadataCandidates: episodes.length - assigned.length, assigned: assigned.length, independentTasks: assigned.length, attempts: attempts.length,
    comparableEpisodes: episodes.filter(e => e.comparable).length,
    completion: { accepted, failed: assigned.filter(e => e.outcome === 'failed').length, rejected: assigned.filter(e => e.outcome === 'rejected').length, unknown: assigned.filter(e => e.outcome === 'unknown').length,
      denominator: assigned.length, rate: assigned.length ? accepted / assigned.length : null,
      upper: assigned.length ? (accepted + assigned.filter(e => e.outcome === 'unknown').length) / assigned.length : null },
    attemptStatuses: Object.fromEntries(unique(attempts.map(a => a.status)).sort().map(status => [status, attempts.filter(a => a.status === status).length])),
    currencyUsd: { ...costs, costPerAccepted: costs.complete && accepted > 0 ? costs.total / accepted : null },
    estimates: { records: estimates, knownSubtotal: estimates.reduce((sum, e) => sum + (e.currencyUsd ?? 0), 0), attribution: 'declared estimates; never actual charges' },
    activeHumanMinutes: total(attempts.map(a => a.resources.activeHumanMinutes), covered),
    wallMs: distribution(attempts.map(a => a.resources.wallMs)),
    stages: Object.fromEntries(STAGES.map(stage => [stage, stageSummary(episodes, stage)])),
    followup: Object.fromEntries([7, 30].map(days => {
      const values = episodes.map(e => e.followup.find(f => f.days === days));
      return [days, { denominator: values.length, mature: values.filter(f => f.state === 'mature').length,
        immature: values.filter(f => f.state === 'immature').length, unknown: values.filter(f => f.state === 'unknown').length,
        regressions: total(values.filter(f => f.state === 'mature').map(f => f.regressions)),
        repairMinutes: total(values.filter(f => f.state === 'mature').map(f => f.repairMinutes)) }];
    })), criticalFindings: episodes.flatMap(e => e.criticalFindings.map(f => ({ episodeId: e.id, project: e.project, ...f }))) };
}
function grouped(episodes, keyOf) {
  const groups = new Map();
  for (const e of episodes) { const key = keyOf(e); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(e); }
  return sort([...groups], ([key]) => key).map(([key, selected]) => ({ key, episodeIds: selected.map(e => e.id), episodeKeys: selected.map(e => e.key), summary: summarize(selected) }));
}
function fixedMix(episodes, referenceMix) {
  if (referenceMix == null) return { state: 'unconfigured', digest: null, coverageWeight: 0, completionRate: null, strata: [], reason: 'Freeze an explicit reference mix before observing outcomes.' };
  fields(referenceMix, ['id', 'createdAt', 'strata']);
  check(evaluationId(referenceMix.id) && time(referenceMix.createdAt) && Array.isArray(referenceMix.strata) && referenceMix.strata.length > 0 && referenceMix.strata.length <= 1000, 'invalid reference mix');
  for (const s of referenceMix.strata) {
    fields(s, ['project', 'specialty', 'family', 'difficultyBand', 'risk', 'weight']);
    check(typeof s.project === 'string' && /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9_.-]{0,99}$/i.test(s.project)
      && ['frontend', 'backend', 'fullstack', 'infrastructure'].includes(s.specialty)
      && ['bugfix', 'feature', 'refactor', 'tests', 'investigation'].includes(s.family)
      && ['low', 'medium', 'high'].includes(s.difficultyBand) && ['low', 'medium', 'high', 'critical'].includes(s.risk), 'invalid reference mix dimension');
  }
  const normalized = referenceMix.strata.map(s => ({ ...s, project: s.project.toLowerCase() }));
  const keys = normalized.map(s => stratumKey(Object.fromEntries(['project', 'specialty', 'family', 'difficultyBand', 'risk'].map(k => [k, s[k]]))));
  check(unique(keys).length === keys.length && referenceMix.strata.every(s => number(s.weight) && s.weight > 0) && Math.abs(referenceMix.strata.reduce((sum, s) => sum + s.weight, 0) - 1) < 1e-9, 'reference mix needs unique strata and weights summing to one');
  const assignments = episodes.filter(e => e.comparisonEligible).map(e => e.assignedAt).filter(Boolean);
  const frozenBeforeAssignment = assignments.every(at => Date.parse(referenceMix.createdAt) <= Date.parse(at));
  const strata = normalized.map((s, index) => {
    const selected = episodes.filter(e => stratumKey(e.stratum) === keys[index] && e.comparisonEligible);
    const summary = summarize(selected);
    return { ...s, independentTasks: selected.length, covered: selected.length > 0, accepted: summary.completion.accepted,
      denominator: summary.completion.denominator, unknownOutcomes: summary.completion.unknown, acceptedOverAssigned: summary.completion.rate,
      incompleteObservationEpisodes: selected.filter(e => !e.comparable).length,
      completionRate: selected.every(e => e.comparable) && summary.completion.unknown === 0 ? summary.completion.rate : null, upper: summary.completion.upper };
  });
  const coverageWeight = strata.filter(s => s.covered).reduce((sum, s) => sum + s.weight, 0);
  const completeOutcomes = strata.every(s => s.completionRate !== null);
  return { state: frozenBeforeAssignment ? coverageWeight >= 1 - 1e-9 && completeOutcomes ? 'exploratory' : 'unknown' : 'not-prespecified',
    id: referenceMix.id, digest: fingerprint(referenceMix), frozenBeforeAssignment, coverageWeight,
    completionRate: frozenBeforeAssignment && completeOutcomes ? strata.reduce((sum, s) => sum + s.weight * s.completionRate, 0) : null,
    strata, reason: 'Missing strata retain their frozen weight; observational standardization does not establish causal agent superiority.' };
}
function paired(episodes, comparisons) {
  const declared = episodes.flatMap(e => e.attempts.filter(a => a.experiment).map(a => ({ episodeId: e.id, attemptId: a.id, ...a.experiment })));
  // Existing frozen comparison projections own planned slots, attempts and recovery.
  // This view cannot reconstruct unobserved slots from declaration-only metadata.
  return { state: comparisons.length ? 'exploratory' : 'unknown', declaredAttemptLinks: declared,
    comparisons: comparisons.map(c => ({ comparisonId: c.comparisonId, planDigest: c.planDigest,
      plannedPairs: c.pairs?.length ?? null, comparablePairs: c.pairs?.filter(p => p.comparable).length ?? null,
      plannedSlots: c.slots?.length ?? null, attempts: c.attempts?.length ?? null, pairs: c.pairs ?? [],
      candidate: c.candidate ?? null, arms: c.arms ?? null, cases: c.cases ?? [],
      recommendation: c.recommendation ?? null })),
    independentTasks: null, interval: null,
    limitation: 'Frozen comparison reports retain planned denominators. Repeated runs are not independent tasks. No confirmatory effect or task-cluster interval can be inferred from these observational declarations.' };
}
function changes(report, previous) {
  if (!previous) return [];
  const { digest, ...body } = previous;
  if (previous.kind !== 'agent-quality-report' || fingerprint(body) !== digest) return [{ kind: 'previous-unavailable', severity: 'watch', reason: 'Previous report integrity is unavailable.' }];
  const result = [], oldCohorts = new Set(previous.cohorts.map(c => c.key));
  for (const cohort of report.cohorts) if (!oldCohorts.has(cohort.key)) result.push({ kind: 'new-agent-cohort', severity: 'watch', cohort: cohort.key, reason: 'New agent provenance cohort; inspect model, harness and task context before comparing.' });
  if (report.coverage.comparableEpisodes !== previous.coverage.comparableEpisodes || report.coverage.episodes !== previous.coverage.episodes) result.push({ kind: 'coverage-changed', severity: 'info', previous: previous.coverage, current: report.coverage });
  const oldCritical = new Set(previous.episodes.flatMap(e => e.criticalFindings.map(f => `${e.key}:${f.attemptId}:${f.id}`)));
  for (const e of report.episodes) for (const f of e.criticalFindings) if (!oldCritical.has(`${e.key}:${f.attemptId}:${f.id}`)) result.push({ kind: 'critical-finding', severity: 'investigate', episodeId: e.id, project: e.project, attemptId: f.attemptId, findingId: f.id });
  const oldScoped = new Map((previous.scopedAgentCohorts ?? []).map(c => [c.key, c]));
  for (const c of report.scopedAgentCohorts) {
    const old = oldScoped.get(c.key); if (!old) continue;
    for (const metric of ['quality', 'proportionality']) {
      const before = old.scorecard[metric], after = c.scorecard[metric];
      if (before.mean !== null && after.mean !== null && before.mean !== after.mean) result.push({ kind: 'stage-score-changed', severity: 'watch', cohort: c.key, metric, previous: before, current: after,
        reason: 'Descriptive change within this task stratum; practical significance and repeated-check thresholds are not prespecified.' });
    }
  }
  const oldEpisodes = new Map(previous.episodes.map(e => [e.key, e]));
  for (const e of report.episodes) {
    const old = oldEpisodes.get(e.key);
    if (old && old.outcome !== e.outcome) result.push({ kind: 'acceptance-changed', severity: 'watch', episodeId: e.id, project: e.project, previous: old.outcome, current: e.outcome });
  }
  for (const e of report.episodes) for (const f of e.followup) {
    const before = oldEpisodes.get(e.key)?.followup.find(old => old.days === f.days);
    if (f.state === 'mature' && f.regressions > 0 && (!before || before.regressions !== f.regressions)) result.push({ kind: 'delayed-regression', severity: 'investigate', episodeId: e.id, project: e.project, days: f.days, regressions: f.regressions });
  }
  return result;
}
/** Deterministic when `now` is supplied; input validation precedes every projection. */
export function qualityReport(bundle, { now = new Date().toISOString(), previous = null, referenceMix = null, comparisons = [], frozen = [] } = {}) {
  validateQualityBundle(bundle);
  const instant = now instanceof Date ? now.toISOString() : now;
  check(time(instant), 'report needs a valid observation time');
  check(Array.isArray(frozen) && Array.isArray(comparisons), 'invalid frozen comparison inventory');
  const comparisonReports = [...comparisons, ...frozen.map(({ plan, execution }) => summarizeComparison(plan, execution))];
  const episodes = sort(bundle.episodes, e => `${e.project}:${e.id}`).map(e => projectEpisode(e, Date.parse(instant)));
  const attempts = episodes.flatMap(e => e.attempts), missingness = {};
  for (const e of episodes) for (const gap of e.gaps) missingness[gap] = (missingness[gap] ?? 0) + 1;
  const projects = grouped(episodes, e => e.project), strata = grouped(episodes, e => stratumKey(e.stratum)).map(g => ({ ...g, stratum: episodes.find(e => g.episodeKeys.includes(e.key)).stratum }));
  const cohortGroups = new Map();
  for (const e of episodes) for (const a of e.attempts) {
    const key = fingerprint({ stage: a.stage, agent: a.agent });
    if (!cohortGroups.has(key)) cohortGroups.set(key, { key, stage: a.stage, agent: a.agent, episodes: [] });
    const group = cohortGroups.get(key); let projected = group.episodes.find(item => item.key === e.key);
    if (!projected) { projected = { ...e, attempts: [] }; group.episodes.push(projected); }
    projected.attempts.push(a);
  }
  const cohorts = sort([...cohortGroups.values()], c => c.key).map(c => ({ key: c.key, stage: c.stage, agent: c.agent, scorecard: stageSummary(c.episodes, c.stage) }));
  const scopedAgentCohorts = strata.flatMap(stratum => {
    const selected = episodes.filter(e => stratum.episodeKeys.includes(e.key));
    return cohorts.filter(c => selected.some(e => e.attempts.some(a => a.stage === c.stage && fingerprint({ stage: a.stage, agent: a.agent }) === c.key))).map(c => {
      const scoped = selected.map(e => ({ ...e, attempts: e.attempts.filter(a => a.stage === c.stage && fingerprint({ stage: a.stage, agent: a.agent }) === c.key) })).filter(e => e.attempts.length);
      return { key: fingerprint({ stratum: stratum.stratum, cohort: c.key }), stratum: stratum.stratum, stage: c.stage, agent: c.agent, scorecard: stageSummary(scoped, c.stage) };
    });
  });
  const comparableEpisodes = episodes.filter(e => e.comparable).length;
  const workflows = grouped(episodes.filter(e => e.workflowCohort), e => e.workflowCohort).map(group => {
    const selected = episodes.filter(e => e.workflowCohort === group.key);
    return { ...group, workflow: selected[0].workflow, workflowDigest: selected[0].workflowDigest,
      configurationState: selected[0].workflowDigest ? 'declared-frozen' : 'unknown', cohortBasis: 'assigned workflow and pre-outcome route digest; never observed completion path', projects: unique(selected.map(e => e.project)).sort(),
      projectScorecards: grouped(selected, e => e.project),
      strata: grouped(selected, e => stratumKey(e.stratum)).map(g => ({ ...g, stratum: selected.find(e => g.episodeKeys.includes(e.key)).stratum })),
      agents: unique(selected.flatMap(e => e.attempts.map(a => fingerprint({ stage: a.stage, agent: a.agent })))).sort().map(key => {
        const a = selected.flatMap(e => e.attempts).find(a => fingerprint({ stage: a.stage, agent: a.agent }) === key); return { stage: a.stage, agent: a.agent };
      }), fixedMix: selected[0].workflowDigest ? fixedMix(selected, referenceMix) : { ...fixedMix(selected, referenceMix), state: 'unknown-route-configuration', completionRate: null } };
  });
  const report = { schemaVersion: 1, kind: 'agent-quality-report', generatedAt: instant, sourceDigest: fingerprint(bundle),
    coverage: { episodes: episodes.length, metadataCandidates: episodes.filter(e => !e.assigned).length, assignedEpisodes: episodes.filter(e => e.assigned).length, attempts: attempts.length,
      projects: projects.length, comparisonEligibleEpisodes: episodes.filter(e => e.comparisonEligible).length, comparableEpisodes, missingness }, episodes, projects, strata, cohorts, scopedAgentCohorts, workflows,
    fixedMix: fixedMix(episodes, referenceMix), workload: { label: 'workload-weighted observational view; task mix changes', ...summarize(episodes) },
    paired: paired(episodes, comparisonReports), materialChanges: [],
    recommendation: { status: comparableEpisodes ? 'exploratory' : 'unknown', automaticRouting: false, winner: null,
      reason: 'Human-reviewed observations support scoped hypotheses. Confirmatory paired evidence, worthwhile-effect thresholds and holdout confirmation are required for a routing recommendation.' },
    limitations: ['Retrospective task labels are excluded from comparable cohorts.', 'Human evaluation and cost fields are attributed declarations bound to evidence hashes, not authenticated provider telemetry or independently verified correctness. Merge or CI is not acceptance.',
      'Missing charges, human effort and outcomes are unknown; known subtotals are not complete cost.', 'Stage scores remain separate; no universal leaderboard or line-count proxy.',
      'Finding labels alone cannot establish recall or the causal benefit of review.', 'Statistical drift is a watch signal until practical thresholds and repeated-check controls are prespecified.',
      'Serious security, authorization, privacy and data-integrity safeguards are quality requirements even when the triggering event is rare.'] };
  report.materialChanges = changes(report, previous);
  return { ...report, digest: fingerprint(report) };
}
const cell = value => String(value ?? 'unknown').replace(/[|\r\n<>]/g, ' ');
export function renderQualityReport(report) {
  const lines = ['# Agent quality', '', `${report.coverage.comparableEpisodes}/${report.coverage.assignedEpisodes} comparable assigned episodes; ${report.coverage.metadataCandidates} metadata candidates awaiting task mapping; ${report.coverage.attempts} attempts across ${report.coverage.projects} projects. Evidence: ${report.recommendation.status}.`, '',
    '| Project | Accepted / assigned | Unknown outcomes | Comparable episodes | Declared actual USD / complete total |', '| --- | --- | --- | --- | --- |'];
  for (const p of report.projects) { const s = p.summary; lines.push(`| ${cell(p.key)} | ${s.completion.accepted} / ${s.completion.denominator} | ${s.completion.unknown} | ${s.comparableEpisodes} / ${s.episodes} | ${s.currencyUsd.knownSubtotal} / ${cell(s.currencyUsd.total)} |`); }
  lines.push('', '| Workflow cohort | Assigned | Accepted | Failed | Unknown |', '| --- | --- | --- | --- | --- |');
  for (const w of report.workflows) lines.push(`| ${cell(w.workflow)} (${w.key.slice(0, 12)}) | ${w.summary.assigned} | ${w.summary.completion.accepted} | ${w.summary.completion.failed} | ${w.summary.completion.unknown} |`);
  lines.push('', 'Stage scores (declared independent human adjudication; 0–3, kept separate):', '', '| Stage | Rated tasks / observed tasks | Quality | Proportionality |', '| --- | --- | --- | --- |');
  for (const s of Object.values(report.workload.stages)) lines.push(`| ${s.stage} | ${s.quality.observed} / ${s.observedTasks} | ${cell(s.quality.mean)} | ${cell(s.proportionality.mean)} |`);
  lines.push('', `Fixed reference mix: ${report.fixedMix.state}; covered weight ${report.fixedMix.coverageWeight}; completion ${cell(report.fixedMix.completionRate)}.`,
    `Delayed outcomes: day 7 mature ${report.workload.followup[7].mature}/${report.coverage.episodes}; day 30 mature ${report.workload.followup[30].mature}/${report.coverage.episodes}.`,
    '', 'Evidence gaps:', ...Object.entries(report.coverage.missingness).map(([key, n]) => `- ${cell(key)}: ${n} episodes.`), '',
    'Changes requiring attention:', ...(report.materialChanges.length ? report.materialChanges.map(c => `- ${cell(c.kind)} (${cell(c.severity)}): ${cell(c.episodeId ?? c.reason ?? 'inspect structured report')}.`) : ['- None recorded against the supplied previous report.']), '',
    'No automatic routing changes or paid replay runs.', ...report.limitations.map(l => `- ${l}`), '', `Report digest: ${report.digest}`);
  return lines.join('\n') + '\n';
}
