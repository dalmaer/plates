// Versioned measurements inside the existing quality episode ledger. No quota inference.
import { fields, fingerprint, sealRecord, evaluationId, checkEvaluation as check } from './evaluation-records.mjs';
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const count = value => value === null || Number.isSafeInteger(value) && value >= 0 && value <= 1e12;
export const USAGE_METRICS = ['input','output','cacheRead','cacheWrite','reasoning','tokens'];
export function usageMeasurementId(value) {
  const { provider, funding, counter, source, actorId } = value;
  const identity = funding.accountId === null ? { unknownAccount: actorId, source: source.id } : { account: funding.accountId };
  return fingerprint({ provider, ...identity, ...(counter.mode === 'request' ? { request: counter.requestIds[0] } : { mode: counter.mode, session: counter.sessionId, segment: counter.segmentId }) });
}
export function sealUsageObservation(value) {
  const record = sealRecord({ ...value, measurementId: usageMeasurementId(value) });
  validateUsageObservation(record); return record;
}
export function validateUsageObservation(value) {
  fields(value, ['schemaVersion','measurementId','revision','previousDigest','digest','attemptId','actorId','funding','provider','model','modelVersion','source','observedAt','counter','tokens','semantics','cost','attribution','visibility']);
  check(value.schemaVersion === 1 && hash(value.measurementId) && Number.isSafeInteger(value.revision) && value.revision >= 1 && value.revision <= 10000 && (value.previousDigest === null || hash(value.previousDigest)) && hash(value.digest) && sealRecord(value).digest === value.digest, 'invalid usage record identity');
  check(evaluationId(value.attemptId) && id(value.actorId) && id(value.provider) && [value.model,value.modelVersion].every(v => v === null || id(v)) && iso(value.observedAt) && ['personal','project'].includes(value.visibility), 'invalid usage attribution');
  fields(value.funding, ['kind','principalId','accountId']);
  check(['person','organization','unknown'].includes(value.funding.kind) && (value.funding.principalId === null || id(value.funding.principalId)) && (value.funding.accountId === null || id(value.funding.accountId)), 'invalid funding principal');
  fields(value.source, ['id','kind','evidenceDigest']);
  check(hash(value.source.id) && ['provider-response','authenticated-reporter','declared'].includes(value.source.kind) && hash(value.source.evidenceDigest), 'invalid usage source');
  const c = value.counter;
  fields(c, ['mode','sessionId','segmentId','requestIds','includesChildren']);
  check(['request','cumulative','parent'].includes(c.mode) && hash(c.sessionId) && hash(c.segmentId) && Array.isArray(c.requestIds) && c.requestIds.length <= 1000 && c.requestIds.every(hash) && new Set(c.requestIds).size === c.requestIds.length && ['yes','no','unknown'].includes(c.includesChildren), 'invalid usage counter');
  check(c.mode !== 'request' || c.requestIds.length === 1 && c.includesChildren === 'no', 'request counters need one disjoint request');
  check(value.measurementId === usageMeasurementId(value), 'usage measurement identity differs');
  fields(value.tokens, USAGE_METRICS); check(Object.values(value.tokens).every(count), 'invalid usage token count');
  fields(value.semantics, ['version','cacheRead','cacheWrite','reasoning']);
  check(value.semantics.version === 1 && ['included-input','separate','unknown'].includes(value.semantics.cacheRead) && ['included-input','separate','unknown'].includes(value.semantics.cacheWrite) && ['included-output','separate','unknown'].includes(value.semantics.reasoning), 'invalid token semantics');
  for (const key of ['cacheRead','cacheWrite','reasoning']) {
    const parent = key === 'reasoning' ? 'output' : 'input';
    if (value.semantics[key].startsWith('included-') && value.tokens[key] !== null && value.tokens[parent] !== null) check(value.tokens[key] <= value.tokens[parent], 'token subset exceeds parent');
  }
  const known = value.tokens.input !== null && value.tokens.output !== null && ['cacheRead','cacheWrite','reasoning'].every(k => value.semantics[k] !== 'unknown' && (value.semantics[k] !== 'separate' || value.tokens[k] !== null));
  if (known && value.tokens.tokens !== null) {
    const expected = value.tokens.input + value.tokens.output + ['cacheRead','cacheWrite','reasoning'].reduce((n,k) => n + (value.semantics[k] === 'separate' ? value.tokens[k] : 0),0);
    check(expected === value.tokens.tokens, 'total contradicts provider token semantics');
  }
  const cost = value.cost;
  fields(cost, ['currency','kind','amount','basisDigest','priceDate']);
  check(typeof cost.currency === 'string' && /^[A-Z]{3}$/.test(cost.currency) && ['observed','estimate','unknown'].includes(cost.kind) && (cost.amount === null || Number.isFinite(cost.amount) && cost.amount >= 0 && cost.amount <= 1e12) && (cost.basisDigest === null || hash(cost.basisDigest)) && (cost.priceDate === null || /^\d{4}-\d\d-\d\d$/.test(cost.priceDate) && Number.isFinite(Date.parse(cost.priceDate))), 'invalid usage cost');
  check(cost.kind !== 'unknown' || cost.amount === null, 'unknown usage cost is not zero');
  check(cost.kind !== 'estimate' || cost.basisDigest !== null && cost.priceDate !== null, 'usage estimate needs dated basis');
  const a = value.attribution; fields(a, ['repositoryId','prs','commits','evidenceDigest']);
  check(Number.isSafeInteger(a.repositoryId) && a.repositoryId > 0 && hash(a.evidenceDigest) && Array.isArray(a.prs) && a.prs.length <= 100 && Array.isArray(a.commits) && a.commits.length <= 100 && a.commits.every(v => /^[a-f0-9]{40}$/.test(v)) && new Set(a.commits).size === a.commits.length, 'invalid usage work mapping');
  for (const pr of a.prs) { fields(pr, ['number','weight']); check(Number.isSafeInteger(pr.number) && pr.number > 0 && (pr.weight === null || Number.isFinite(pr.weight) && pr.weight >= 0 && pr.weight <= 1), 'invalid PR allocation'); }
  check(new Set(a.prs.map(p => p.number)).size === a.prs.length && a.prs.reduce((n,p) => n + (p.weight ?? 0),0) <= 1 + 1e-10, 'usage allocations exceed whole measurement');
  return value;
}
export function validateEpisodeUsage(episode) {
  const records = episode.usage ?? [];
  check(Array.isArray(records) && records.length <= 1000, 'usage records exceed bound');
  const latest = new Map(), digests = new Set();
  for (const record of records) {
    validateUsageObservation(record);
    check(episode.attempts.some(a => a.id === record.attemptId), 'usage attempt missing');
    check(!digests.has(record.digest), 'duplicate usage receipt'); digests.add(record.digest);
    const prior = latest.get(record.measurementId);
    check(prior ? record.previousDigest === prior.digest && record.revision === prior.revision + 1 : record.previousDigest === null && record.revision === 1, 'usage revision chain broken');
    if (prior) {
      const stable = r => ({ attemptId:r.attemptId,actorId:r.actorId,funding:r.funding,provider:r.provider,model:r.model,modelVersion:r.modelVersion,counter:{...r.counter,requestIds:[]},semantics:r.semantics,visibility:r.visibility });
      check(fingerprint(stable(prior)) === fingerprint(stable(record)) && record.observedAt >= prior.observedAt, 'usage identity or scope changed');
      check(prior.counter.requestIds.every(id => record.counter.requestIds.includes(id)), 'usage request coverage removed');
      if (prior.cost.kind === 'observed') check(fingerprint(prior.cost) === fingerprint(record.cost), 'observed charge cannot be rewritten');
      if (record.counter.mode === 'cumulative') for (const metric of USAGE_METRICS) check(prior.tokens[metric] === null || record.tokens[metric] !== null && record.tokens[metric] >= prior.tokens[metric], 'cumulative counter reset needs new segment');
      else for (const metric of USAGE_METRICS) check(prior.tokens[metric] === null || record.tokens[metric] === prior.tokens[metric], 'known request tokens changed');
    }
    latest.set(record.measurementId,record);
  }
  return latest;
}
