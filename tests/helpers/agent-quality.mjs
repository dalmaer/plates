// Synthetic Acme metadata; no real task, provider or payment evidence.
import { qualityEpisode, QUALITY_BYTES } from '../../lib/agent-quality-records.mjs';
import { sealRecord } from '../../lib/evaluation-records.mjs';
export const QUALITY_TIME = '2026-10-30T00:00:00.000Z';
export const QUALITY_HASH = 'a'.repeat(64);
export function acmeQualityEpisode(id = 'acme-task') {
  const e = qualityEpisode({ id, project: 'Acme/widget', createdAt: QUALITY_TIME,
    source: { kind: 'observer', id, at: QUALITY_TIME, digest: QUALITY_HASH }, links: ['Acme/widget#1'] });
  e.passport = { timing: 'prospective', recordedAt: '2026-10-29T00:00:00.000Z', family: 'feature', specialty: 'frontend', difficulty: [1, 1, 1, 1, 1], risk: 'medium', baseCommit: 'b'.repeat(40), acceptanceDigest: QUALITY_HASH, contextDigest: QUALITY_HASH, workflowDigest: QUALITY_HASH, stratum: 'acme-frontend-medium' };
  e.assignedAt = '2026-10-29T01:00:00.000Z'; e.workflow = 'acme-a';
  e.attempts = [{ id: 'acme-code', parentId: null, stage: 'coding', status: 'completed', startedAt: e.assignedAt, endedAt: QUALITY_TIME,
    agent: { provider: 'Acme', model: 'acme-v1', agentBuild: '1.0.0', harnessDigest: QUALITY_HASH, contextDigest: QUALITY_HASH, settingsDigest: QUALITY_HASH, promptDigest: QUALITY_HASH, skillsDigest: QUALITY_HASH, toolsDigest: QUALITY_HASH, permissionsDigest: QUALITY_HASH, runtimeDigest: QUALITY_HASH, dependencyDigest: QUALITY_HASH },
    checkpointDigest: QUALITY_HASH, inputCheckpointDigest: null,
    resources: { currencyUsd: 2, currencySource: 'actual', estimateBasis: null, priceDate: null, tokens: 200, cachedTokens: 0, activeHumanMinutes: 5, wallMs: 2000 }, interventions: [], experiment: null }];
  e.evaluations = [{ id: 'acme-evaluation', attemptId: 'acme-code', stage: 'coding', evaluator: 'acme-human', authority: 'human', independent: true, blinded: true, rubricVersion: 'quality-v1', quality: 3, proportionality: 3,
    proportionalityEvidence: { requirementRiskDigest: QUALITY_HASH, simplerAlternativeDigest: QUALITY_HASH, maintenanceCostDigest: QUALITY_HASH, testBurdenDigest: QUALITY_HASH, seriousRisk: false, requiredSafeguard: false }, acceptance: 'accepted', evidence: [QUALITY_HASH], findings: [] }];
  return sealRecord(e);
}
export function acmeQualityBundle(episodes = [acmeQualityEpisode()]) {
  return { schemaVersion: 2, kind: 'agent-quality', retention: { days: 90, maxBytes: QUALITY_BYTES, maxEvents: 1000 }, episodes };
}
