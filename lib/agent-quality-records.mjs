// Minimal metadata observations. Digests bind attribution, never establish correctness.
import { canonical, fingerprint, sealRecord, fields, evaluationId, checkEvaluation as check } from './evaluation-records.mjs';

export const QUALITY_BYTES = 4 * 1024 * 1024;
export const QUALITY_STAGES = ['planning', 'coding', 'review', 'iteration'];
export const QUALITY_STATUSES = ['completed', 'failed', 'timeout', 'blocked', 'skipped', 'denied', 'unknown', 'aborted', 'running'];
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const sha = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const text = x => typeof x === 'string' && x.length > 0 && x.length <= 160 && !/[\x00-\x1f\x7f]/.test(x);
const time = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const nullable = (x, predicate) => x === null || predicate(x);
const number = x => Number.isFinite(x) && x >= 0 && x <= 1e12;
const integer = x => Number.isSafeInteger(x) && number(x);
const score = x => Number.isInteger(x) && x >= 0 && x <= 3;
const repo = x => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9_.-]{0,99}$/i.test(x) && !x.toLowerCase().endsWith('.git');
function list(items, predicate, max = 1000) {
  check(Array.isArray(items) && items.length <= max, 'quality list exceeds bound');
  for (const item of items) check(predicate(item), 'invalid quality list item');
}
function unique(items, key, name) { check(new Set(items.map(key)).size === items.length, `duplicate quality ${name}`); }

export function qualityEpisode({ id, project, source, createdAt, links = [] }) {
  return sealRecord({ schemaVersion: 2, kind: 'quality-episode', id, createdAt, previousDigest: null, source, project, links,
    passport: { timing: 'retrospective', recordedAt: createdAt, family: null, specialty: null, difficulty: null, risk: null, baseCommit: null, acceptanceDigest: null, contextDigest: null, stratum: null },
    workflow: null, assignedAt: null, attempts: [], evaluations: [], followup: [] });
}

export function validateQualityEpisode(e) {
  fields(e, ['schemaVersion', 'kind', 'id', 'createdAt', 'digest', 'previousDigest', 'source', 'project', 'links', 'passport', 'workflow', 'assignedAt', 'attempts', 'evaluations', 'followup']);
  check(e.schemaVersion === 2 && e.kind === 'quality-episode' && evaluationId(e.id) && time(e.createdAt) && hash(e.digest) && sealRecord(e).digest === e.digest && nullable(e.previousDigest, hash), 'invalid quality episode identity or digest');
  check(repo(e.project) && nullable(e.workflow, text) && nullable(e.assignedAt, time), 'invalid quality project or assignment');
  fields(e.source, ['kind', 'id', 'at', 'digest']);
  check(['git', 'github', 'observer'].includes(e.source.kind) && text(e.source.id) && time(e.source.at) && hash(e.source.digest), 'invalid quality source');
  // Pointers only: no arbitrary URLs, query strings, prose or transcript fields.
  list(e.links, x => typeof x === 'string' && (/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*#[1-9]\d{0,8}$/i.test(x) || /^git:[a-f0-9]{40}$/.test(x)), 100);
  const p = e.passport;
  // Early metadata-only observations omit workflowDigest. Absence is unknown,
  // not permission to rewrite or rehash retained source receipts.
  fields(p, ['timing', 'recordedAt', 'family', 'specialty', 'difficulty', 'risk', 'baseCommit', 'acceptanceDigest', 'contextDigest', 'stratum', ...(Object.hasOwn(p, 'workflowDigest') ? ['workflowDigest'] : [])]);
  check(['prospective', 'retrospective'].includes(p.timing) && time(p.recordedAt), 'invalid passport timing');
  check(nullable(p.family, x => ['bugfix', 'feature', 'refactor', 'tests', 'investigation'].includes(x)) && nullable(p.specialty, x => ['frontend', 'backend', 'fullstack', 'infrastructure'].includes(x)), 'invalid task classification');
  check(p.difficulty === null || Array.isArray(p.difficulty) && p.difficulty.length === 5 && p.difficulty.every(x => Number.isInteger(x) && x >= 0 && x <= 2), 'invalid pre-outcome difficulty vector');
  check(nullable(p.risk, x => ['low', 'medium', 'high', 'critical'].includes(x)) && nullable(p.baseCommit, sha) && nullable(p.acceptanceDigest, hash) && nullable(p.contextDigest, hash) && nullable(p.stratum, text), 'invalid passport provenance');
  check(nullable(p.workflowDigest ?? null, hash), 'invalid preassignment workflow digest');
  if (p.timing === 'prospective') check(e.assignedAt !== null && p.recordedAt <= e.assignedAt, 'passport must precede assignment');
  list(e.attempts, a => {
    fields(a, ['id', 'parentId', 'stage', 'status', 'startedAt', 'endedAt', 'agent', 'checkpointDigest', 'inputCheckpointDigest', 'resources', 'interventions', 'experiment']);
    check(evaluationId(a.id) && nullable(a.parentId, evaluationId) && a.parentId !== a.id && QUALITY_STAGES.includes(a.stage) && QUALITY_STATUSES.includes(a.status), 'invalid quality attempt');
    check(nullable(a.startedAt, time) && nullable(a.endedAt, time) && (!a.startedAt || !a.endedAt || a.startedAt <= a.endedAt), 'invalid attempt time');
    check(nullable(a.checkpointDigest, hash) && nullable(a.inputCheckpointDigest, hash), 'invalid checkpoint');
    if (a.agent !== null) {
      fields(a.agent, ['provider', 'model', 'agentBuild', 'harnessDigest', 'contextDigest', 'settingsDigest', 'promptDigest', 'skillsDigest', 'toolsDigest', 'permissionsDigest', 'runtimeDigest', 'dependencyDigest']);
      check(text(a.agent.provider) && nullable(a.agent.model, text) && nullable(a.agent.agentBuild, text) && ['harnessDigest', 'contextDigest', 'settingsDigest', 'promptDigest', 'skillsDigest', 'toolsDigest', 'permissionsDigest', 'runtimeDigest', 'dependencyDigest'].every(k => nullable(a.agent[k], hash)), 'invalid agent provenance');
    }
    fields(a.resources, ['currencyUsd', 'currencySource', 'estimateBasis', 'priceDate', 'tokens', 'cachedTokens', 'activeHumanMinutes', 'wallMs']);
    check([a.resources.currencyUsd, a.resources.activeHumanMinutes, a.resources.wallMs].every(v => nullable(v, number)) && [a.resources.tokens, a.resources.cachedTokens].every(v => nullable(v, integer)), 'invalid quality usage');
    check(['actual', 'estimate', 'unknown'].includes(a.resources.currencySource), 'invalid currency attribution');
    check(nullable(a.resources.estimateBasis, hash) && nullable(a.resources.priceDate, x => typeof x === 'string' && /^\d{4}-\d\d-\d\d$/.test(x) && Number.isFinite(Date.parse(x))), 'invalid price basis');
    if (a.resources.currencySource === 'unknown') check(a.resources.currencyUsd === null, 'unknown charge is not zero');
    if (a.resources.currencySource === 'estimate') check(a.resources.estimateBasis !== null && a.resources.priceDate !== null, 'estimate needs dated price basis');
    list(a.interventions, i => {
      fields(i, ['type', 'activeMinutes', 'at']);
      return ['specification', 'correction', 'rescue', 'adjudication', 'repair'].includes(i.type) && nullable(i.activeMinutes, number) && time(i.at);
    }, 100);
    if (a.experiment !== null) {
      fields(a.experiment, ['id', 'planDigest', 'pairId', 'arm', 'slot', 'attemptId']);
      check(evaluationId(a.experiment.id) && hash(a.experiment.planDigest) && evaluationId(a.experiment.pairId) && ['baseline', 'candidate'].includes(a.experiment.arm) && text(a.experiment.slot) && text(a.experiment.attemptId), 'invalid frozen slot reference');
    }
    return true;
  });
  unique(e.attempts, a => a.id, 'attempt');
  for (const [index, a] of e.attempts.entries()) {
    if (a.parentId !== null) check(e.attempts.slice(0, index).some(parent => parent.id === a.parentId), 'attempt parent must precede child');
    if (a.inputCheckpointDigest !== null) check(e.attempts.slice(0, index).some(parent => parent.checkpointDigest === a.inputCheckpointDigest), 'missing frozen input checkpoint');
    if (['review', 'iteration'].includes(a.stage) && a.checkpointDigest !== null) check(a.inputCheckpointDigest !== null, 'review or revision lacks frozen input');
  }
  list(e.evaluations, v => {
    fields(v, ['id', 'attemptId', 'stage', 'evaluator', 'authority', 'independent', 'blinded', 'rubricVersion', 'quality', 'proportionality', 'proportionalityEvidence', 'acceptance', 'evidence', 'findings']);
    const a = e.attempts.find(a => a.id === v.attemptId);
    check(evaluationId(v.id) && a && v.stage === a.stage && text(v.evaluator) && ['human', 'model'].includes(v.authority) && typeof v.independent === 'boolean' && typeof v.blinded === 'boolean' && text(v.rubricVersion), 'invalid adjudication attribution');
    check(nullable(v.quality, score) && nullable(v.proportionality, score) && ['accepted', 'rejected', 'unknown'].includes(v.acceptance), 'invalid quality judgment');
    list(v.evidence, hash, 100);
    if (v.acceptance !== 'unknown' || v.quality !== null || v.proportionality !== null) check(v.evidence.length > 0 && a.checkpointDigest !== null, 'judgment lacks checkpoint evidence');
    if (v.proportionalityEvidence !== null) {
      fields(v.proportionalityEvidence, ['requirementRiskDigest', 'simplerAlternativeDigest', 'maintenanceCostDigest', 'testBurdenDigest', 'seriousRisk', 'requiredSafeguard']);
      check(['requirementRiskDigest', 'simplerAlternativeDigest', 'maintenanceCostDigest', 'testBurdenDigest'].every(k => hash(v.proportionalityEvidence[k])) && typeof v.proportionalityEvidence.seriousRisk === 'boolean' && typeof v.proportionalityEvidence.requiredSafeguard === 'boolean', 'invalid proportionality justification');
    }
    if (v.proportionality !== null) check(v.proportionalityEvidence !== null, 'proportionality needs requirement, simpler alternative and maintenance evidence');
    list(v.findings, f => {
      fields(f, ['id', 'label', 'severity', 'presentedAsConsequential', 'remedy', 'evidence']);
      check(evaluationId(f.id) && ['consequential', 'optional', 'false-positive', 'duplicate', 'indeterminate', 'miss'].includes(f.label) && ['critical', 'major', 'minor'].includes(f.severity) && typeof f.presentedAsConsequential === 'boolean' && ['helpful', 'harmful', 'unknown'].includes(f.remedy), 'invalid finding');
      list(f.evidence, hash, 100); check(f.label === 'indeterminate' || f.evidence.length > 0, 'finding lacks evidence'); return true;
    });
    unique(v.findings, f => f.id, 'finding'); return true;
  });
  unique(e.evaluations, v => v.id, 'evaluation');
  list(e.followup, f => {
    fields(f, ['days', 'usedAt', 'observedAt', 'exposure', 'regressions', 'repairMinutes', 'evidence']);
    check([7, 30].includes(f.days) && nullable(f.usedAt, time) && time(f.observedAt) && (!f.usedAt || f.usedAt <= f.observedAt) && nullable(f.exposure, number) && nullable(f.regressions, integer) && nullable(f.repairMinutes, number), 'invalid follow-up');
    list(f.evidence, hash, 100); if (f.regressions !== null) check(f.evidence.length > 0, 'follow-up lacks evidence'); return true;
  }, 100);
  return e;
}

export function validateQualityBundle(bundle) {
  check(Buffer.byteLength(canonical(bundle)) <= QUALITY_BYTES, 'quality bundle exceeds byte bound');
  fields(bundle, ['schemaVersion', 'kind', 'retention', 'episodes']);
  check(bundle.schemaVersion === 2 && bundle.kind === 'agent-quality', 'agent-quality bundle required');
  fields(bundle.retention, ['days', 'maxBytes', 'maxEvents']);
  const r = bundle.retention;
  check(Number.isInteger(r.days) && r.days >= 1 && r.days <= 3650 && Number.isInteger(r.maxBytes) && r.maxBytes >= 1024 && r.maxBytes <= QUALITY_BYTES && Number.isInteger(r.maxEvents) && r.maxEvents >= 1 && r.maxEvents <= 10000, 'invalid quality retention');
  list(bundle.episodes, e => Boolean(validateQualityEpisode(e)), 1000);
  unique(bundle.episodes, e => `${e.project.toLowerCase()}:${e.id}`, 'episode');
  unique(bundle.episodes, e => `${e.project.toLowerCase()}:${e.source.kind}:${e.source.id}`, 'source');
  return bundle;
}

export const qualitySourceKey = e => fingerprint({ project: e.project.toLowerCase(), kind: e.source.kind, id: e.source.id });
export const qualityEpisodeKey = e => `${e.project.toLowerCase()}:${e.id}`;
