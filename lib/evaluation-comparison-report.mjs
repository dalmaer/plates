import { validateLiveGenerationRefusal, liveOperationIdentity } from './evaluation-live-records.mjs';
import { validateLiveTrialLinks, validateLiveCountRefusal } from './evaluation-live-inspection.mjs';
// Pure projections of a frozen plan and controller-validated execution receipts.
// This module grants no execution, acceptance-store or promotion authority.
import { fingerprint, sealRecord, resolveCaseEnvironment, checkEvaluation as check } from './evaluation-records.mjs';
const arms = ['baseline', 'candidate'];
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const number = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const equal = (a, b) => {
  try { return a != null && b != null && fingerprint(a) === fingerprint(b); } catch { return false; }
};
function sealed(r, kind) {
  try { return r?.schemaVersion === 2 && r.kind === kind && hash(r.digest) && sealRecord(r).digest === r.digest; } catch { return false; }
}
function coherentController(controller) {
  try {
    const { digest, ...body } = controller;
    return hash(digest) && typeof body.nodeVersion === 'string' && Array.isArray(body.sources) && body.sources.length > 0
      && body.sources.every(s => typeof s.path === 'string' && hash(s.byteDigest))
      && fingerprint(body) === digest;
  } catch { return false; }
}
function boundImage(image, environment) {
  // preflightDocker already verified requested against Id or RepoDigests.
  // A manifest digest and its resolved local image ID may legitimately differ.
  return image && /^sha256:[a-f0-9]{64}$/.test(image.id) && image.requested === environment?.image
    && image.platform === environment?.platform && Array.isArray(image.inherited)
    && image.inherited.every(v => typeof v === 'string') && typeof image.nodeVersion === 'string' && image.nodeVersion.length > 0;
}
function projectedRecovery(trial) {
  const recovery = trial.recovery, original = trial.records ?? {}, intent = original.intent;
  if (!recovery) return null;
  const { receipt, result, verdict } = recovery;
  if (!sealed(receipt, 'evaluation-reconciliation') || receipt.intentDigest !== intent?.digest
    || !Object.values(original).some(r => r.digest === receipt.digest)
    || !sealed(result, 'evaluation-result') || !sealed(verdict, 'evaluation-verdict')
    || !equal(result, receipt.result) || !equal(verdict, receipt.verdict)
    || result.intentDigest !== intent.digest || verdict.intentDigest !== intent.digest
    || !hash(receipt.inputDigest) || result.recoveryInputDigest !== receipt.inputDigest
    || result.verdictDigest !== verdict.digest || receipt.status !== 'terminal' || result.status !== 'terminal'
    || !equal(result.settlement, receipt.settlement) || receipt.settlement?.released !== true
    || receipt.settlement.id !== intent.id || receipt.settlement.commandDigest !== intent.previewDigest
    || !receipt.originalEvidence || !Object.entries(receipt.originalEvidence).every(([key, digest]) => original[key]?.digest === digest)
    || receipt.originalEvidence.intent !== intent.digest || !sealed(original.lease, 'evaluation-lease')
    || original.lease.intentDigest !== intent.digest || original.lease.lease?.id !== intent.id
    || receipt.originalEvidence.lease !== original.lease.digest
    || !Array.isArray(intent.operations) || !intent.operations.length || !Array.isArray(receipt.observations)
    || receipt.observations.length !== intent.operations.length
    || !receipt.observations.every((o, index) => o.operation === intent.operations[index]
      && (o.state === 'terminated' && hash(o.containerId) && o.running === false
        || o.state === 'not-dispatched' && o.authority === 'ordered-authorization-v1' && o.intentDigest === intent.digest))
    || (verdict.acceptance !== 'unknown' && verdict.digest !== original.verdict?.digest)
    || (verdict.digest !== original.verdict?.digest && verdict.recoveryInputDigest !== receipt.inputDigest)) return null;
  return recovery;
}
function recoveredProjection(trial, linked) {
  const r = trial.records ?? {}, i = r.intent, v = r.verdict, result = r.result;
  return Object.entries(r).filter(([key]) => key.startsWith('reconciliation-')).some(([, recovery]) => {
    if (!linked(recovery, 'evaluation-reconciliation') || recovery.status !== 'terminal' || recovery.acceptance !== 'unknown'
      || !Array.isArray(i.operations) || !i.operations.length || !Array.isArray(recovery.observations)
      || recovery.observations.length !== i.operations.length || recovery.settlement?.released !== true
      || recovery.settlement.id !== i.id || recovery.settlement.commandDigest !== i.previewDigest
      || recovery.originalEvidence?.intent !== i.digest || !linked(r.lease, 'evaluation-lease')
      || r.lease.lease?.id !== i.id || recovery.originalEvidence.lease !== r.lease.digest) return false;
    if (!recovery.observations.every((o, index) => o.operation === i.operations[index]
      && o.state === 'terminated' && hash(o.containerId) && o.running === false)) return false;
    // inspectExecutions replaces missing result/verdict fields in memory only.
    // The sealed recovery receipt remains the authority for termination, never
    // for acceptance or reconstructed usage. Original verdict bytes may have
    // been replaced by the explicitly unknown projection.
    return trial.status === 'terminal' && v?.kind === 'evaluation-verdict' && v.digest === recovery.digest
      && v.acceptance === 'unknown' && v.failureCategory === 'missing-evidence'
      && result?.kind === 'evaluation-result' && result.digest === recovery.digest && result.verdictDigest === recovery.digest
      && result.status === 'terminal' && result.validation === 'unknown' && equal(result.settlement, recovery.settlement);
  });
}
function distribution(values) {
  const known = values.filter(number), sorted = [...known].sort((a, b) => a - b), n = sorted.length;
  return { observed: n, denominator: values.length, raw: values.map(v => number(v) ? v : null),
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
    min: n ? sorted[0] : null, max: n ? sorted[n - 1] : null };
}
function observe(plan, trial, pair, arm) {
  const recovery = projectedRecovery(trial), original = trial.records ?? {};
  const r = recovery ? { ...original, verdict: recovery.verdict, result: recovery.result } : original;
  const i = r.intent, v = r.verdict, result = r.result, input = i?.input;
  const task = plan.bundle.cases.find(c => c.id === pair?.case.id);
  const config = plan.bundle.configurations.find(c => c.id === plan.bundle.comparison[arm]?.id);
  if (plan.bundle.schemaVersion === 3 && config?.policy.execution === 'host-gateway-v1'
    && trial.status === 'terminal' && trial.reason === 'generation-not-admitted') {
    try {
      const { intent, refusal, spend } = validateLiveGenerationRefusal(trial.live, plan);
      check(intent.slot === trial.slot && intent.input.request.pairId === pair.id && intent.input.request.arm === arm, 'refusal slot mismatch');
      return { slot: trial.slot, pairId: pair.id, caseId: task.id, arm, attemptId: intent.id, attempt: 1, parentAttemptId: null,
        status: 'completed', terminal: true, outcome: 'unknown', recovered: false, recoveryInputDigest: null, failureCategory: 'infrastructure',
        reasons: ['generation-capacity-refused-no-provider-dispatch'], identity: null,
        resources: Object.fromEntries(['wallMs', 'setupMs', 'executionMs', 'validationMs', 'cpuMs', 'currencyUsd', 'activeHumanMinutes'].map(k => [k, null])),
        resourceAttribution: { source: 'durable-builder-admission-refusal', coverage: 'generation not admitted; original spend reservation held; no builder or acceptance' },
        interventionAttribution: 'unavailable', interventions: null, repairRounds: null,
        evidence: [{ record: 'intent', digest: intent.digest }, { record: 'admission-refusal', digest: refusal.digest }, { record: 'spend-reservation', digest: spend.reservation.digest }], checks: [] };
    } catch { /* Incomplete or contradictory refusals remain uncertain. */ }
  }
  if (config?.policy.execution === 'host-gateway-v1' && trial.reason === 'count-not-admitted') {
    try {
      const count = validateLiveCountRefusal(trial.live, plan);
      return { slot: trial.slot, pairId: pair.id, caseId: task.id, arm, attemptId: count.intent.operationId, attempt: 1, parentAttemptId: null,
        status: 'completed', terminal: true, outcome: 'unknown', recovered: false, recoveryInputDigest: null, failureCategory: 'infrastructure',
        reasons: ['count-capacity-refused-no-provider-dispatch'], identity: null,
        resources: Object.fromEntries(['wallMs', 'setupMs', 'executionMs', 'validationMs', 'cpuMs', 'currencyUsd', 'activeHumanMinutes'].map(k => [k, null])),
        resourceAttribution: { source: 'durable-request-admission-refusal', coverage: 'count slot only; no builder or acceptance' },
        interventionAttribution: 'unavailable', interventions: null, repairRounds: null,
        evidence: ['intent', 'packet', 'refusal'].map(record => ({ record: 'count-' + record, digest: count[record].digest })), checks: [] };
    } catch { /* Invalid/conflicting refusal stays an uncertain original attempt. */ }
  }
  const reasons = [];
  let liveBound = true;
  if (config?.policy.execution === 'host-gateway-v1') {
    try { validateLiveTrialLinks(r, trial.live, plan); } catch { liveBound = false; reasons.push('missing-live-provider-chain'); }
  }
  const bound = liveBound && (!trial.recovery || Boolean(recovery)) && sealed(i, 'evaluation-intent') && i.slot === trial.slot && input?.planDigest === plan.digest
    && i.previewDigest === fingerprint(input) && input.request?.pairId === pair?.id && input.request?.arm === arm
    && input.taskDigest === task?.digest && input.configurationDigest === config?.digest;
  if (!bound) reasons.push('invalid-intent-reference');
  const linked = (record, kind) => sealed(record, kind) && bound && record.intentDigest === i.digest;
  const verdict = linked(v, 'evaluation-verdict') && v.checkManifestDigest === task?.acceptanceManifest.digest
    && input.checkManifestDigest === v.checkManifestDigest && v.artifactDigest === (r.artifact?.digest ?? null)
    && coherentController(input.controller) && equal(v.evaluator?.controller, input.controller) && equal(v.evaluator?.image, input.image);
  const recovered = recoveredProjection(trial, linked);
  const terminal = recovered || verdict && linked(result, 'evaluation-result') && result.verdictDigest === v.digest
    && result.status === 'terminal' && trial.status === 'terminal' && result.settlement?.released === true;
  if (!verdict && !recovered) reasons.push('missing-or-invalid-verdict');
  if (!terminal) reasons.push('missing-or-invalid-terminal-result');
  let checksValid = false;
  try {
    const material = plan.bundle.materials.find(m => m.digest === task.acceptanceManifest.digest);
    const driver = JSON.parse(material.content);
    checksValid = driver.driver === 'stdio-v1' && driver.checks.length > 0 && v.checks.length === driver.checks.length
      && driver.checks.every((c, index) => {
        const check = v.checks[index], observation = r[`check-${index}`];
        return check.id === c.id && ['passed', 'failed'].includes(check.status)
          && linked(observation, 'evaluation-stage') && check.observationDigest === observation.digest
          && observation.stage?.setup === 'passed' && !observation.stage.error
          && observation.stage.termination?.state === 'terminated' && observation.stage.output?.signal === null
          && (check.status === 'passed') === (observation.stage.output.exit === c.exitCode && observation.stage.output.stdout === c.stdout);
      });
  } catch { /* Unavailable acceptance references remain unknown. */ }
  const artifact = linked(r.artifact, 'evaluation-artifact') && Array.isArray(r.artifact.files) && r.artifact.filesDigest === fingerprint(r.artifact.files)
    && r.artifact.sourceDigest === input?.sourceDigest;
  const accepted = !recovered && terminal && artifact && checksValid && v.acceptance === 'accepted'
    && v.checks.every(c => c.status === 'passed') && result.validation === 'passed';
  if (v?.acceptance === 'accepted' && !accepted) reasons.push('unverified-acceptance');
  const rejected = !recovered && terminal && v.acceptance === 'rejected' && result.validation === 'failed'
    && (v.failureCategory === 'invalid-submission' || (artifact && checksValid && v.checks.some(c => c.status === 'failed')));
  const outcome = accepted ? 'accepted' : rejected ? 'rejected' : 'unknown';
  const resources = linked(result, 'evaluation-result') ? result.resources ?? {} : {};
  return { slot: trial.slot, pairId: pair?.id ?? null, caseId: task?.id ?? null, arm,
    attemptId: bound ? i.id : null, attempt: bound ? i.attempt ?? null : null, parentAttemptId: bound ? i.parentAttemptId ?? null : null,
    status: terminal && !reasons.includes('unverified-acceptance') ? 'completed' : 'invalid', terminal: Boolean(terminal), outcome,
    recovered: Boolean(recovery) || recovered, recoveryInputDigest: recovery?.receipt.inputDigest ?? null,
    failureCategory: recovered ? 'missing-evidence' : verdict ? v.failureCategory ?? null : trial.reason ?? 'missing-evidence', reasons,
    identity: bound ? { controller: input.controller ?? null, image: input.image ?? null, sourceDigest: input.sourceDigest ?? null,
      taskDigest: input.taskDigest, checkManifestDigest: input.checkManifestDigest,
      model: input.model ?? null, environment: input.environment ?? null } : null,
    resources: Object.fromEntries(['wallMs', 'setupMs', 'executionMs', 'validationMs', 'cpuMs', 'currencyUsd', 'activeHumanMinutes'].map(k => [k, number(resources[k]) ? resources[k] : null])),
    resourceAttribution: { source: resources.source ?? null, coverage: resources.coverage ?? null },
    interventionAttribution: 'initial-intent-declaration; subsequent external help unknown',
    interventions: bound && Array.isArray(i.interventions) ? i.interventions : null,
    repairRounds: bound && Number.isSafeInteger(i.repairRounds) && i.repairRounds >= 0 ? i.repairRounds : null,
    evidence: Object.entries({ ...r, ...(recovery && original.result ? { originalResult: original.result } : {}), ...(recovery && original.verdict ? { originalVerdict: original.verdict } : {}) }).filter(([, record]) => hash(record?.digest)).map(([record, value]) => ({ record, digest: value.digest })),
    checks: verdict ? v.checks ?? [] : [] };
}
function totals(slots, attempts) {
  const accepted = slots.filter(s => s.outcome === 'accepted').length;
  const cost = attempts.map(a => a.resources.currencyUsd), known = cost.filter(number);
  // Missing planned work and extra attempts must never improve cost coverage.
  const completeCost = slots.every(s => s.status === 'completed') && attempts.every(a => a.terminal) && known.length === cost.length && cost.length > 0;
  const failures = {};
  for (const a of attempts) if (a.failureCategory) failures[a.failureCategory] = (failures[a.failureCategory] ?? 0) + 1;
  return { planned: slots.length, attempted: slots.filter(s => s.attempts.length).length, attempts: attempts.length,
    completed: slots.filter(s => s.status === 'completed').length,
    failed: slots.filter(s => s.outcome === 'rejected' || s.attempts.some(a => a.failureCategory && a.terminal)).length,
    invalid: slots.filter(s => s.status === 'invalid').length, missing: slots.filter(s => s.status === 'missing').length,
    accepted, denominator: slots.length, acceptanceRate: slots.length ? accepted / slots.length : null,
    unknown: slots.filter(s => s.outcome === 'unknown').length, failures,
    currencyUsd: { knownSubtotal: known.reduce((a, b) => a + b, 0), observed: known.length, denominator: cost.length,
      complete: completeCost, total: completeCost ? known.reduce((a, b) => a + b, 0) : null,
      costPerAcceptedOutcome: completeCost && accepted > 0 ? known.reduce((a, b) => a + b, 0) / accepted : null },
    resources: Object.fromEntries(['wallMs', 'setupMs', 'executionMs', 'validationMs', 'cpuMs', 'activeHumanMinutes'].map(k => [k, distribution(attempts.map(a => a.resources[k]))])),
    interventions: { source: 'initial-intent-declarations', actualCount: null, actualCoverage: 'unknown', recordedSubtotal: attempts.reduce((n, a) => n + (a.interventions?.length ?? 0), 0), recordsPresent: attempts.filter(a => a.interventions !== null).length, denominator: attempts.length },
    repairRounds: { source: 'initial-intent-declarations', actualCount: null, actualCoverage: 'unknown', recordedSubtotal: attempts.reduce((n, a) => n + (a.repairRounds ?? 0), 0), recordsPresent: attempts.filter(a => a.repairRounds !== null).length, denominator: attempts.length } };
}
// Current diagnostics consume the controller-validated inspection projection.
// They never perform I/O, establish current ownership or grant a recovery action.
const recoveryActions = {
  'inspect-evidence': 'Inspect the named original evidence. No safe recovery preview is currently established.',
  'inspect-original-recovery': 'Inspect the original reconciliation and its retained outcome; do not create another recovery.',
  'inspect-terminal': 'Inspect the original terminal evidence; do not redispatch this slot.',
  'inspect-refusal': 'This refused slot is consumed. Inspect capacity before preparing other missing work; do not replace this slot.',
  'inspect-closed-admission': 'Admission is closed. Inspect original operations; cancellation does not prove termination.',
  'preview-offline-reconcile': 'Prepare an original-operation reconciliation preview under the remaining offline allowance; never redispatch.',
  'preview-offline-resume': 'Prepare a fresh resume preview for this missing offline slot, subject to current admission checks.',
  'preview-live-count': 'Preview an explicit count descriptor for this missing live slot; no aggregate live resume.',
  'preview-live-generation': 'Preview an explicit generation descriptor bound to the original completed count; no aggregate live resume.',
  'preview-provider-get': 'Preview a separately approved GET for this original response ID; never restart generation.',
  'preview-local-only': 'Preview local-only recovery of the original operation; no credential, provider request, refund or acceptance.',
};
function operationGuidance(plan, execution, report) {
  const livePolicy = plan.bundle.configurations.every(c => c.policy.execution === 'host-gateway-v1');
  const live = execution?.live;
  const controls = execution?.recoveryControl;
  const closed = execution?.cancellation?.admissionClosed === true || controls?.admissionClosed === true || live?.spend?.admissionClosed === true;
  const rows = [], files = live?.files ?? [];
  const validFile = record => record && files.find(f => f.valid === true && equal(f.record, record) && hash(record.digest) && sealRecord(record).digest === record.digest);
  const evidence = record => {
    const f = validFile(record); return f ? [{ record: f.path, digest: record.digest }] : [];
  };
  const intentFile = files.find(f => f.path === 'execution/control/reconcile-intent.json');
  const reconcile = live?.reconcile?.intent ?? controls?.reconcileIntent;
  const consumed = Boolean(intentFile || reconcile || controls?.reconcileIntentPresent);
  const recoveryEvidence = livePolicy ? [...(intentFile ? [{ record: intentFile.path, digest: intentFile.valid && hash(intentFile.record?.digest) ? intentFile.record.digest : null }] : []), ...evidence(live?.reconcile?.result)]
    : (controls?.evidence ?? []).filter(e => e.record === 'execution/control/reconcile-intent.json' || e.digest === controls?.reconcileResult?.digest);
  const gapEvidence = [...(live ? [] : execution?.issues ?? []).map(g => ({ record: g.record?.startsWith('execution/') ? g.record : 'execution/' + (g.record ?? 'unknown'), digest: null })), ...(live?.gaps ?? []).map(g => ({ record: g.path || 'execution', digest: null })), ...(controls?.gaps ?? []).map(g => ({ record: g.record, digest: null }))];
  const gaps = [];
  if (controls?.coverage === 'unavailable') gaps.push('validated-recovery-control-evidence');
  if ((execution?.issues ?? []).length || (live?.gaps ?? []).length) gaps.push('valid-original-evidence');
  if (livePolicy && (!live || live.state === 'gap')) gaps.push('validated-live-inspection');
  if (livePolicy && live && live.spend?.state !== 'ready' && live.state !== 'absent') gaps.push('valid-spend-ledger');
  function add(slot, kind, id, reason, action, refs = [], missing = [], checks = []) {
    if (closed) refs = [...refs, ...(controls?.evidence ?? []).filter(e => /\/cancel(?:-intent)?\.json$/.test(e.record)), ...(execution?.cancellation?.digest ? [{ record: 'execution/control/cancel.json', digest: execution.cancellation.digest }] : [])];
    rows.push({ slot, operationKind: kind, operationId: id ?? null, reason, evidence: [...refs, ...gapEvidence.filter(g => !refs.some(e => e.record === g.record))],
      nextAction: { kind: action, description: recoveryActions[action] }, missingPrerequisites: [...new Set(missing)],
      requiredChecks: checks, authorizesMutation: false });
  }
  if (consumed) add(reconcile?.target?.slot ?? null, 'reconcile', null,
    live?.reconcile?.result || controls?.reconcileResult ? 'recovery-recorded' : 'recovery-result-unavailable', 'inspect-original-recovery', recoveryEvidence,
    [...gaps, ...(!live?.reconcile?.result && !controls?.reconcileResult ? ['original-recovery-result'] : [])]);
  const checks = ['current-source-and-workspace-authority', 'verified-writer-ownership', 'original-descriptor-and-coordinator-evidence', 'remaining-retention-and-deadline'];
  for (const slot of report.slots) {
    const trials = (execution?.trials ?? []).filter(t => t.slot === slot.slot), trial = trials[0];
    const context = live?.slots?.find(s => s.slot === slot.slot);
    const missing = [...gaps];
    if (trials.length > 1) missing.push('unique-original-slot');
    if (livePolicy) {
      if (!context) {
        const reserved = (live?.spend?.operations ?? []).filter(o => o.reservation.trialId === slot.slot);
        if (reserved.length) {
          for (const op of reserved) add(slot.slot, op.reservation.operationKind, op.reservation.operationId, 'original-intent-unavailable', 'inspect-evidence',
            [{ record: `spend/operations/${op.reservation.operationId}/reservation.json`, digest: hash(op.reservation.digest) ? op.reservation.digest : null }], [...missing, 'original-intent'], checks);
          continue;
        }
        if (live?.effectsBlocked) missing.push('resolve-original-uncertainty-before-new-work');
        const action = missing.length ? 'inspect-evidence' : closed ? 'inspect-closed-admission' : 'preview-live-count';
        add(slot.slot, 'count', null, 'missing-live-count', action, [], missing, checks); continue;
      }
      const builder = context.builder ?? {}, count = context.count, generation = context.generation;
      const operations = [[ 'count', count ], ...(generation || builder.intent ? [[ 'generation', generation ?? { intent: builder.intent } ]] : [])];
      for (const [kind, op] of operations) {
        if (!op) continue;
        const original = op.intent, admission = kind === 'count' ? op.admission : builder.lease;
        const refs = [original, admission, op.result, op.local, op.refusal].flatMap(evidence);
        const prefix = kind === 'count' ? `execution/preparations/${slot.slot}/` : `execution/${slot.slot}/`;
        if (!validFile(original)) refs.push({ record: prefix + (kind === 'count' ? 'count-intent.json' : 'provider-intent.json'), digest: null });
        const needs = [...missing];
        if (!validFile(original) || original.planDigest !== plan.digest && original.input?.planDigest !== plan.digest || original.slot !== slot.slot) needs.push('original-intent');
        if (op.result && (!validFile(op.result) || op.result.intentDigest !== original?.digest)) needs.push('original-provider-result');
        let generationRefusal = null;
        if (kind === 'generation' && builder['admission-refusal']) {
          try {
            generationRefusal = validateLiveGenerationRefusal(context, plan);
            if (!validFile(generationRefusal.refusal)) needs.push('original-generation-refusal');
            refs.push(...evidence(generationRefusal.refusal), ...evidence(generationRefusal.spend.reservation));
          } catch { needs.push('validated-generation-refusal'); }
        }
        const refused = !needs.length && (generationRefusal || kind === 'count' && validFile(op.refusal) && !op.admission && !op.result && !op.spend?.dispatch);
        let action, reason;
        if (refused) { action = 'inspect-refusal'; reason = 'proven-capacity-refusal'; }
        else if (consumed) { action = 'inspect-original-recovery'; reason = 'recovery-allowance-consumed'; refs.push(...recoveryEvidence); }
        else if (op.state === 'observed' && (kind === 'count' || slot.attempts.some(a => a.terminal))) {
          action = needs.length ? 'inspect-evidence' : 'inspect-terminal'; reason = 'original-operation-observed';
        } else {
          if (!validFile(admission)) { needs.push('original-admission-lease'); refs.push({ record: prefix + (kind === 'count' ? 'count-admission.json' : 'lease.json'), digest: null }); }
          if (kind === 'count' && op.local && (!validFile(op.local) || op.local.intentDigest !== original?.digest)) needs.push('exact-original-local-completion');
          if (!op.spend && (generation === op || kind === 'count')) needs.push('original-spend-operation');
          const responseId = op.result?.observation?.response?.id;
          if (needs.length) { action = 'inspect-evidence'; reason = 'original-evidence-unavailable'; }
          else if (kind === 'generation' && responseId && !closed) { action = 'preview-provider-get'; reason = 'original-response-retained'; }
          else { action = 'preview-local-only'; reason = closed ? 'paid-admission-closed' : kind === 'count' ? 'count-outcome-unresolved' : 'no-original-response-id'; }
        }
        const prefixOperationId = kind === 'generation' && original?.kind === 'evaluation-intent' && validFile(original)
          && original.input?.planDigest === plan.digest && original.slot === slot.slot
          ? liveOperationIdentity({ planDigest: plan.digest, slot: slot.slot, stage: 'generation' }).operationId : null;
        add(slot.slot, kind, generationRefusal?.spend.reservation.operationId ?? original?.operationId ?? prefixOperationId, reason, action, refs, needs,
          action.startsWith('preview-') ? [...checks, 'unused-reconcile-allowance', ...(action === 'preview-provider-get' ? ['current-price-budget-and-credential-scope'] : ['local-release-evidence-does-not-settle-money', ...(kind === 'count' ? ['exact-original-completion-for-previously-released-count'] : [])])] : []);
      }
      if (count?.state === 'observed' && !generation && !builder.intent) {
        const ready = validFile(count.intent) && validFile(count.result) && validFile(count.local) && count.local.coordinatorReceipt?.released === true && count.spend?.complete === true;
        const needs = [...missing, ...(!ready ? ['completed-bound-count'] : []), ...(live?.effectsBlocked ? ['resolve-original-uncertainty-before-new-work'] : [])];
        add(slot.slot, 'generation', null, 'missing-live-generation', needs.length ? 'inspect-evidence' : closed ? 'inspect-closed-admission' : 'preview-live-generation',
          [count.intent, count.result, count.local].flatMap(evidence), needs, checks);
      }
      continue;
    }
    const records = trial?.records ?? {}, original = records.intent;
    const refs = Object.entries(records).filter(([,r]) => hash(r?.digest)).map(([name,r]) => ({ record: `execution/${slot.slot}/${name}.json`, digest: r.digest }));
    const refusal = records['admission-refusal'];
    const bound = sealed(original, 'evaluation-intent') && original.slot === slot.slot && original.input?.planDigest === plan.digest && original.previewDigest === fingerprint(original.input);
    const refused = bound && sealed(refusal, 'evaluation-admission-refusal') && Object.keys(records).length === 2
      && refusal.intentDigest === original.digest && refusal.id === original.id && refusal.commandDigest === original.previewDigest
      && refusal.authority === 'external-admission-refusal-v1' && refusal.reason === 'capacity_busy_inspect_existing_leases' && original.dispatchProtocol === 'ordered-authorization-v1';
    if (refused && !missing.length) add(slot.slot, 'offline', original.id, 'proven-capacity-refusal', 'inspect-refusal', refs);
    else if (slot.attempts.some(a => a.terminal) && !missing.length) add(slot.slot, 'offline', original?.id, 'original-operation-terminal', 'inspect-terminal', refs);
    else if (!trial) {
      if (execution?.status === 'uncertain') missing.push('resolve-original-uncertainty-before-new-work');
      add(slot.slot, 'offline', null, 'missing-offline-work', missing.length ? 'inspect-evidence' : closed ? 'inspect-closed-admission' : 'preview-offline-resume', [], missing, checks);
    } else if (consumed) add(slot.slot, 'offline', original?.id, 'recovery-allowance-consumed', 'inspect-original-recovery', [...refs, ...recoveryEvidence], missing);
    else if (bound && sealed(records.lease, 'evaluation-lease') && records.lease.intentDigest === original.digest
      && records.lease.lease?.id === original.id && records.lease.lease?.commandDigest === original.previewDigest
      && Array.isArray(original.operations) && equal(records.lease.lease?.operations, original.operations)
      && controls?.coverage === 'complete' && !missing.length)
      add(slot.slot, 'offline', original.id, 'original-operation-unresolved', 'preview-offline-reconcile', refs, [], checks);
    else add(slot.slot, 'offline', original?.id, 'original-evidence-unavailable', 'inspect-evidence', refs,
      [...missing, ...(!bound ? ['original-intent'] : []), ...(!records.lease ? ['original-admission-lease'] : []), 'current-reconcile-allowance-and-control-evidence'], checks);
  }
  return rows;
}
// These diagnostics describe retained controller observations. They cannot
// substitute for a fresh, digest-bound recovery preview or release a lease.
function recoverySummary(plan, execution, report) {
  const operations = operationGuidance(plan, execution, report);
  const uncertainSlots = (execution?.trials ?? []).filter(t => t.status === 'uncertain').map(t => ({
    slot: t.slot, reason: t.reason ?? 'original-operation-unresolved',
    operations: t.records?.intent?.operations ?? [],
    settlementReleased: typeof t.records?.result?.settlement?.released === 'boolean' ? t.records.result.settlement.released : null,
  }));
  return { executionStatus: execution?.status ?? 'not-observed',
    admissionClosed: execution?.cancellation?.admissionClosed === true || execution?.recoveryControl?.admissionClosed === true || execution?.live?.spend?.admissionClosed === true ? true : null,
    authorizesMutation: false, uncertainSlots, operations,
    refusedSlots: operations.filter(o => o.nextAction.kind === 'inspect-refusal').map(o => o.slot),
    nextAction: execution?.cancellation?.admissionClosed === true || execution?.recoveryControl?.admissionClosed === true || execution?.live?.spend?.admissionClosed === true
      ? 'Admission is closed. Inspect original operation receipts; cancellation does not prove termination. Do not redispatch.'
      : execution?.status === 'uncertain' || uncertainSlots.length || execution?.recoveryControl?.coverage === 'unavailable'
      ? 'Inspect the per-operation next steps and missing prerequisites. Do not redispatch or release reserved capacity from missing evidence.'
      : execution?.live ? 'For missing live work, preview one count or generation descriptor under its separate approval. Live aggregate resume is unavailable.'
          : 'For missing work, prepare a fresh resume preview; it must recheck locks, cancellation and original operations before approval.' };
}
/** plan is frozenLedger.plan; execution is inspectExecutions' validated projection. */
// Retained report schema 1 uses this exact projection. Future algorithms need
// a new version and must keep this reader for historical immutable receipts.
export function summarizeComparisonV1(plan, execution) {
  check(plan.bundle.schemaVersion === 2, 'report projection V1 requires bundle schema 2');
  return summarizeProjection(plan, execution, 1);
}
export function summarizeComparisonV2(plan, execution) {
  check(plan.bundle.schemaVersion === 3, 'report projection V2 requires bundle schema 3');
  return summarizeProjection(plan, execution, 2);
}
function summarizeProjection(plan, execution, version) {
  const b = plan.bundle, comparison = b.comparison, attempts = [], slots = [], pairs = [];
  const configurations = arms.map(arm => b.configurations.find(c => c.id === comparison[arm].id));
  const offline = configurations.every(c => c.provider === 'offline' && c.runtime.name === 'scripted-node-v1');
  for (const pair of comparison.pairs) {
    const paired = arms.map(arm => {
      const slot = pair.id + '-' + arm;
      const observations = (execution?.trials ?? []).filter(t => t.slot === slot).map(t => observe(plan, t, pair, arm));
      attempts.push(...observations);
      const a = observations[0], unique = observations.length === 1;
      const s = { slot, pairId: pair.id, caseId: pair.case.id, arm, attempts: observations,
        status: !a ? 'missing' : unique ? a.status : 'invalid', outcome: unique ? a.outcome : 'unknown' };
      slots.push(s); return s;
    });
    const reasons = [], [baseline, candidate] = paired.map(s => s.attempts[0]);
    if (paired.some(s => s.status !== 'completed')) reasons.push('incomplete-or-invalid-pair');
    if (paired.some(s => s.outcome === 'unknown')) reasons.push('unknown-outcome');
    const x = baseline?.identity, y = candidate?.identity;
    for (const key of ['controller', 'image', 'sourceDigest', 'taskDigest', 'checkManifestDigest']) {
      if (!equal(x?.[key], y?.[key])) reasons.push(`${key}-unknown-or-drift`);
    }
    // Offline trials have no model invocation. Live configuration aliases cannot
    // substitute for the actual resolved identity recorded at execution.
    if (configurations.some(c => !c.model?.resolved)) reasons.push('unresolved-model-alias');
    const task = b.cases.find(c => c.id === pair.case.id);
    if (!boundImage(x?.image, task.environment) || !boundImage(y?.image, task.environment)) reasons.push('image-differs-from-frozen-environment');
    if (version === 1) {
      if (!equal(configurations[0].environment, configurations[1].environment)) reasons.push('configured-environment-drift');
    } else {
      let environments;
      try { environments = configurations.map(config => resolveCaseEnvironment(b, config, pair.case)); }
      catch { reasons.push('configured-environment-unknown-or-mismatch'); }
      if (environments && (!equal(environments[0], environments[1])
        || !equal(x?.environment, environments[0]) || !equal(y?.environment, environments[1]))) reasons.push('environment-unknown-or-drift');
    }
    if (!coherentController(x?.controller) || !coherentController(y?.controller)) reasons.push('unknown-controller');
    if (!offline) {
      if (!x?.model?.resolved || !y?.model?.resolved || !equal(x.model, y.model)) reasons.push('model-unknown-or-drift');
      if (!equal(x?.environment, y?.environment)) reasons.push('environment-unknown-or-drift');
    }
    if (!equal(configurations[0].runtime, configurations[1].runtime)) reasons.push('runtime-drift');
    const comparable = reasons.length === 0;
    pairs.push({ id: pair.id, caseId: pair.case.id, order: pair.order, slots: paired.map(s => s.slot),
      completed: paired.every(s => s.status === 'completed'), comparable, exclusions: reasons,
      baseline: paired[0].outcome, candidate: paired[1].outcome,
      discordance: comparable && paired[0].outcome !== paired[1].outcome ? paired[1].outcome === 'accepted' ? 'candidate-gain' : 'candidate-regression' : null });
  }
  const knownSlots = new Set(slots.map(s => s.slot));
  const unplanned = (execution?.trials ?? []).filter(t => !knownSlots.has(t.slot)).map(t => observe(plan, t, null, t.records?.intent?.input?.request?.arm ?? null));
  attempts.push(...unplanned);
  const summarize = selected => Object.fromEntries(arms.map(arm => [arm, totals(selected.filter(s => s.arm === arm), attempts.filter(a => a.arm === arm && (!selected.length ? false : selected.some(s => s.caseId === a.caseId))))]));
  const cases = b.cases.filter(c => comparison.cases.some(r => r.id === c.id)).map(c => {
    const cohort = pairs.filter(p => p.caseId === c.id), comparable = cohort.filter(p => p.comparable);
    return { id: c.id, taskClass: c.taskClass, ...(version === 2 ? { caseRef: { kind: c.kind, id: c.id, digest: c.digest }, environment: c.environment } : {}), arms: summarize(slots.filter(s => s.caseId === c.id)),
      plannedPairs: cohort.length, completedPairs: cohort.filter(p => p.completed).length, comparablePairs: comparable.length,
      screeningFloor: cohort.length >= 5 && comparable.length >= 5,
      discordant: { baselineFailCandidatePass: comparable.filter(p => p.discordance === 'candidate-gain').length,
        baselinePassCandidateFail: comparable.filter(p => p.discordance === 'candidate-regression').length },
      comparableAccepted: Object.fromEntries(arms.map(arm => [arm, { accepted: comparable.filter(p => p[arm] === 'accepted').length, denominator: comparable.length }])) };
  });
  const screening = cases.some(c => c.taskClass === 'control') && cases.some(c => c.taskClass !== 'control') && cases.every(c => c.screeningFloor);
  const reasons = [];
  if (offline) reasons.push('Offline scripted outcomes establish machinery only; no agent efficacy claim.');
  if (comparison.promotion.criteria === null) reasons.push('Promotion criteria are unset.');
  if (!screening) reasons.push('Screening requires at least five comparable pairs for every affected case and selected control.');
  if (cases.some(c => c.taskClass === 'control' && c.discordant.baselinePassCandidateFail)) reasons.push('Comparable control regression observed.');
  if (unplanned.length) reasons.push('Unplanned attempts retained; execution differs from the frozen plan.');
  reasons.push('Five pairs are a screening floor, not statistical proof; ambiguous evidence needs a preregistered larger comparison.');
  return { schemaVersion: version, comparisonId: comparison.id, planDigest: plan.digest,
    status: pairs.every(p => p.completed) && !unplanned.length && !(execution?.issues?.length) ? 'completed' : 'incomplete',
    cases, arms: Object.fromEntries(arms.map(arm => [arm, totals(slots.filter(s => s.arm === arm), attempts.filter(a => a.arm === arm))])),
    pairs, slots, attempts, unplannedAttempts: unplanned, issues: execution?.issues ?? [],
    screening: { eligible: screening, minimumPairsPerCase: 5, plannedCoverage: cases.some(c => c.taskClass === 'control') && cases.some(c => c.taskClass !== 'control') && cases.every(c => c.plannedPairs >= 5) },
    recommendation: { disposition: 'inconclusive', automaticPromotion: false, agentEfficacy: false, reasons },
    candidate: { baseline: comparison.baseline, candidate: comparison.candidate, baselineConfiguration: configurations[0], candidateConfiguration: configurations[1], changes: Object.keys(configurations[0]).filter(key => !['id', 'digest', 'createdAt'].includes(key) && !equal(configurations[0][key], configurations[1][key]) && configurations[0][key] !== configurations[1][key]).map(key => ({ field: key, baseline: configurations[0][key], candidate: configurations[1][key] })) },
    limitations: ['Wall-time distributions are per attempt, not summed elapsed comparison time.', 'Missing resource observations are unknown, not zero.', 'No subsequent escaped-defect observation window or exposure cohort is available.'] };
}
// Current inspection adds diagnostics without changing the retained V1 report.
export function summarizeComparison(plan, execution) {
  check([2, 3].includes(plan.bundle.schemaVersion), 'unsupported comparison bundle schema');
  const report = plan.bundle.schemaVersion === 3 ? summarizeComparisonV2(plan, execution) : summarizeComparisonV1(plan, execution);
  return { ...report, recovery: recoverySummary(plan, execution, report) };
}
const cell = x => String(x ?? 'unknown').replace(/[|\r\n]/g, ' ').replace(/[<>]/g, '');
/** Render the same report without adding a score or changing its denominators. */
export function renderComparison(report) {
  const lines = ['# Harness comparison', '', '| Case | Arm | Accepted / planned | Completed | Failed | Invalid | Missing |', '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const c of report.cases) for (const arm of arms) {
    const a = c.arms[arm]; lines.push(`| ${cell(c.id)} | ${arm} | ${a.accepted} / ${a.denominator} | ${a.completed} | ${a.failed} | ${a.invalid} | ${a.missing} |`);
  }
  lines.push('', `Recommendation: ${report.recommendation.disposition}. No automatic promotion.`, ...report.recommendation.reasons.map(r => `- ${r}`), '', 'Paired outcomes (comparable subset):');
  for (const c of report.cases) lines.push(`- ${cell(c.id)}: ${c.comparablePairs}/${c.plannedPairs} comparable; baseline fail / candidate pass ${c.discordant.baselineFailCandidatePass}; baseline pass / candidate fail ${c.discordant.baselinePassCandidateFail}.`);
  lines.push('', 'Cost and resources (all attempts, including failures):');
  for (const arm of arms) {
    const a = report.arms[arm], cost = a.currencyUsd, wall = a.resources.wallMs;
    lines.push(`- ${arm}: USD known subtotal ${cost.knownSubtotal}; coverage ${cost.observed}/${cost.denominator}, complete ${cost.complete}; cost per accepted outcome ${cell(cost.costPerAcceptedOutcome)}.`,
      `  Wall ms median ${cell(wall.median)}, range ${cell(wall.min)}–${cell(wall.max)}, coverage ${wall.observed}/${wall.denominator}; raw ${JSON.stringify(wall.raw)}.`,
      ...Object.entries(a.resources).filter(([key]) => key !== 'wallMs').map(([key, d]) => `  ${key}: median ${cell(d.median)}, range ${cell(d.min)}–${cell(d.max)}; coverage ${d.observed}/${d.denominator}; raw ${JSON.stringify(d.raw)}.`),
      `  Recorded intervention declarations ${a.interventions.recordedSubtotal} (${a.interventions.recordsPresent}/${a.interventions.denominator} initial records present); recorded repair rounds ${a.repairRounds.recordedSubtotal} (${a.repairRounds.recordsPresent}/${a.repairRounds.denominator} initial records present). Actual human help and repair coverage unknown.`);
  }
  if (report.recovery) {
    const r = report.recovery;
    lines.push('', 'Execution and recovery (inspection only):',
      `- Execution: ${cell(r.executionStatus)}. Admission closed: ${cell(r.admissionClosed)}.`,
      `- ${cell(r.nextAction)}`);
    for (const op of r.operations ?? []) lines.push(`- ${cell(op.slot ?? 'comparison')} / ${cell(op.operationKind)} / ${cell(op.operationId)}: ${cell(op.reason)}. ${cell(op.nextAction.description)} Missing prerequisites: ${op.missingPrerequisites.map(cell).join(', ') || 'none observed'}. Required fresh checks: ${op.requiredChecks.map(cell).join(', ') || 'none proposed'}. Evidence: ${op.evidence.map(e => `${cell(e.record)}:${cell(e.digest)}`).join(', ') || 'unavailable'}. Authorizes mutation: false.`);
    for (const slot of r.refusedSlots) lines.push(`- ${cell(slot)}: capacity admission refused; no execution or acceptance. This slot is consumed under the frozen no-replacement policy; inspect capacity before preparing other missing work.`);
    for (const slot of r.uncertainSlots) lines.push(`- ${cell(slot.slot)}: ${cell(slot.reason)}; settlement released: ${cell(slot.settlementReleased)}; original operations: ${slot.operations.length ? slot.operations.map(cell).join(', ') : 'unknown'}.`);
  }
  for (const issue of report.issues ?? []) lines.push(`- Evidence gap ${cell(issue.record)}: ${cell(issue.reason)}; ${cell(issue.detail)}.`);
  lines.push('', 'All planned pairs:');
  for (const p of report.pairs) lines.push(`- ${cell(p.id)} (${p.order}): ${p.baseline} / ${p.candidate}; ${p.comparable ? 'comparable' : p.exclusions.join(', ')}.`);
  lines.push('', 'All attempts and evidence:');
  for (const a of report.attempts) lines.push(`- ${cell(a.slot)} attempt ${cell(a.attempt)}: ${a.status}, ${a.outcome}; failure ${cell(a.failureCategory ?? (a.outcome === 'accepted' ? 'none' : null))}; ${a.reasons.join(', ')}; evidence ${a.evidence.map(e => `${cell(e.record)}:${e.digest}`).join(', ')}; initial intervention declarations ${cell(JSON.stringify(a.interventions))}; subsequent human help unknown.`);
  lines.push('', ...report.limitations.map(l => `- ${l}`));
  return lines.join('\n') + '\n';
}
