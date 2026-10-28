import { bytesDigest, parseEvidenceJson, validateEvidence } from '../../../../lib/validation-evidence.mjs';

/** Read-only projection of Plates' existing shadow validator; no gate/reuse authority. */
export function projectEvidence({ expected, source, artifactBytes, planned = [] } = {}) {
  const empty = { testedCommit: null, testedTree: null, expectedCommit: expected?.candidate?.head ?? null,
    authority: 'advisory-only', reuseAuthorized: false, checks: [], findings: [], coverageComplete: false };
  if (!expected || !source || !artifactBytes) return { ...empty,
    checks: (expected?.manifest?.stages ?? []).map(s => ({ id: s.id, status: 'unknown', detail: 'No evidence supplied.' })),
    findings: [{ code: 'evidence_unavailable' }] };
  let report, artifact;
  try {
    report = validateEvidence(expected, source, artifactBytes);
    // Do not project potentially tampered record claims before exact-byte validation.
    if (bytesDigest(artifactBytes) !== source.sha256) return { ...empty, ...report, findings: report.findings };
    artifact = parseEvidenceJson(artifactBytes);
  } catch (error) {
    return { ...empty, findings: [{ code: error.code ?? 'invalid_evidence' }] };
  }
  const checks = expected.manifest.stages.map(stage => {
    const matches = Array.isArray(artifact.stages) ? artifact.stages.filter(s => s?.id === stage.id) : [];
    const record = matches.length === 1 ? matches[0] : null;
    const related = report.findings.filter(f => !f.stage || f.stage === stage.id);
    // A failed result is still displayable; every other validation defect makes its applicability unknown.
    const defects = related.filter(f => !['outer_failed_or_incomplete', 'stage_failed_or_incomplete', 'stage_missing'].includes(f.code));
    let status = 'unknown';
    if (artifact.completed === true && Number.isSafeInteger(artifact.status) && artifact.status >= 0 &&
        record?.completed === true && Number.isSafeInteger(record.status) && record.status >= 0 && !defects.length) {
      status = record.status === 0 ? 'passed' : 'failed';
    }
    return { id: stage.id, status, commit: record?.candidate?.head ?? null,
      detail: !record ? 'Missing or duplicate record; absence is not a pass or a not-run declaration.'
        : defects.length ? `Identity or provenance unresolved: ${defects.map(f => f.code).join(', ')}`
          : `Caller-supplied execution record; exit ${record.status ?? 'unknown'}.`,
      commandDigest: stage.commandDigest };
  });
  // Explicitly authored plans are separate from required-stage evidence. Absence never means not-run.
  for (const item of planned) if (item?.status === 'not-run' && typeof item.id === 'string' && typeof item.reason === 'string') {
    checks.push({ id: item.id, status: 'not-run', commit: null, detail: `Declared plan only: ${item.reason}` });
  }
  return { ...empty, ...report, testedCommit: artifact.candidate?.head ?? null,
    testedTree: artifact.candidate?.tree ?? null, expectedCommit: expected.candidate.head,
    source: { provider: source.provider, runId: source.runId, attempt: source.attempt, provenance: 'caller-supplied; unauthenticated' }, checks };
}
