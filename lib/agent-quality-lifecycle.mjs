// Local lifecycle observations, retained through the existing quality ledger.
// Caller attribution is a declaration, not authenticated human/provider identity.
import { checkEvaluation as check, fields, evaluationId, fingerprint, sealRecord } from './evaluation-records.mjs';
import { qualityEpisode, validateQualityBundle, QUALITY_STAGES, QUALITY_STATUSES } from './agent-quality-records.mjs';
import { qualityOperation } from './agent-quality-ledger.mjs';

const ISO = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const agentKeys = ['provider', 'model', 'agentBuild', 'harnessDigest', 'contextDigest', 'settingsDigest', 'promptDigest', 'skillsDigest', 'toolsDigest', 'permissionsDigest', 'runtimeDigest', 'dependencyDigest'];
const passportKeys = ['family', 'specialty', 'difficulty', 'risk', 'baseCommit', 'acceptanceDigest', 'contextDigest', 'workflowDigest', 'stratum'];
const resourceDefaults = { currencyUsd: null, currencySource: 'unknown', estimateBasis: null, priceDate: null, tokens: null, cachedTokens: null, activeHumanMinutes: null, wallMs: null };
const subset = (object, keys) => {
  check(object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).every(key => keys.includes(key)), 'unknown lifecycle metadata field');
};
export function emptyQualityPassport() { return Object.fromEntries(passportKeys.map(key => [key, null])); }
export function qualityAgent(metadata) {
  if (metadata === null || metadata === undefined) return null;
  subset(metadata, agentKeys);
  check(typeof metadata.provider === 'string' && metadata.provider.length > 0, 'agent provider is required when identity is supplied');
  return { ...Object.fromEntries(agentKeys.map(key => [key, null])), ...metadata };
}
function eventInput(event) {
  fields(event, ['schemaVersion', 'id', 'action', 'episodeId', 'project', 'at', 'payload']);
  check(event.schemaVersion === 1 && evaluationId(event.id) && evaluationId(event.episodeId) && ISO(event.at)
    && ['begin', 'start', 'finish', 'link', 'annotate', 'adjudicate', 'followup'].includes(event.action), 'invalid quality lifecycle event');
  check(typeof event.project === 'string' && /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9_.-]{0,99}$/i.test(event.project), 'invalid lifecycle project');
  check(Buffer.byteLength(JSON.stringify(event)) <= 256 * 1024, 'lifecycle event exceeds bound');
  return structuredClone(event);
}
function begin(event, now) {
  const p = event.payload;
  fields(p, ['links', 'workflow', 'passport', 'alreadyStarted']); subset(p.passport, passportKeys);
  check(typeof p.alreadyStarted === 'boolean', 'begin must declare whether work already started');
  const prospective = !p.alreadyStarted && Math.abs(Date.parse(now) - Date.parse(event.at)) <= 300000;
  const createdAt = event.at;
  const e = qualityEpisode({ id: event.episodeId, project: event.project, createdAt, links: p.links,
    source: { kind: 'observer', id: `lifecycle:${event.id}`, at: event.at, digest: fingerprint(event) } });
  e.passport = { ...e.passport, ...emptyQualityPassport(), ...p.passport, recordedAt: createdAt, timing: prospective ? 'prospective' : 'retrospective' };
  e.workflow = p.workflow; e.assignedAt = prospective ? event.at : null;
  return e;
}
function amend(current, event, now) {
  const e = structuredClone(current), p = event.payload;
  check(Date.parse(event.at) >= Date.parse(current.createdAt), 'lifecycle event predates the current observation');
  // Live lifecycle hooks must record when observed. Historical records use the
  // explicit retrospective importer; they cannot masquerade as fresh starts.
  check(Math.abs(Date.parse(now) - Date.parse(event.at)) <= 300000, 'stale lifecycle event; import historical evidence retrospectively');
  e.previousDigest = current.digest; e.createdAt = event.at;
  e.source = { kind: 'observer', id: `lifecycle:${event.id}`, at: event.at, digest: fingerprint(event) };
  if (event.action === 'start') {
    fields(p, ['attemptId', 'parentId', 'stage', 'agent', 'inputCheckpointDigest', 'experiment']);
    check(evaluationId(p.attemptId) && QUALITY_STAGES.includes(p.stage) && !e.attempts.some(a => a.id === p.attemptId), 'attempt already exists or stage is invalid');
    if (['review', 'iteration'].includes(p.stage)) check(p.inputCheckpointDigest !== null, 'review and revision start require a frozen input checkpoint');
    // Enrollment of already-started work proves assignment only from the first
    // observed stage onward; it does not reconstruct its earlier cost or timing.
    e.assignedAt ??= event.at;
    e.attempts.push({ id: p.attemptId, parentId: p.parentId, stage: p.stage, status: 'running', startedAt: event.at, endedAt: null,
      agent: qualityAgent(p.agent), checkpointDigest: null, inputCheckpointDigest: p.inputCheckpointDigest,
      resources: { ...resourceDefaults }, interventions: [], experiment: p.experiment });
  } else if (event.action === 'finish') {
    fields(p, ['attemptId', 'status', 'checkpointDigest', 'resources', 'interventions', ...(Object.hasOwn(p, 'agent') ? ['agent'] : []), ...(Object.hasOwn(p, 'endedAt') ? ['endedAt'] : [])]);
    subset(p.resources, Object.keys(resourceDefaults));
    const a = e.attempts.find(a => a.id === p.attemptId);
    check(a && ['running', 'unknown'].includes(a.status), 'finish requires an unresolved original attempt');
    check(QUALITY_STATUSES.includes(p.status) && p.status !== 'running', 'finish needs a terminal or explicitly unknown outcome');
    const endedAt = p.endedAt ?? event.at;
    check(ISO(endedAt) && endedAt <= event.at && (a.startedAt === null || endedAt >= a.startedAt), 'finish time must bind the observed attempt interval');
    a.status = p.status; a.endedAt = p.status === 'unknown' ? null : endedAt;
    a.checkpointDigest = p.checkpointDigest;
    a.resources = { ...a.resources, ...p.resources };
    if (!Object.hasOwn(p.resources, 'wallMs') && a.startedAt !== null && a.endedAt !== null) a.resources.wallMs = Date.parse(a.endedAt) - Date.parse(a.startedAt);
    check(Array.isArray(p.interventions), 'interventions must be an explicit metadata array');
    a.interventions = [...a.interventions, ...p.interventions];
    if (Object.hasOwn(p, 'agent')) a.agent = qualityAgent(p.agent === null ? null : { ...a.agent, ...p.agent });
  } else if (event.action === 'link') {
    fields(p, ['links']); check(Array.isArray(p.links), 'links must be an explicit reference array');
    e.links = [...new Set([...e.links, ...p.links])];
  } else if (event.action === 'annotate') {
    fields(p, ['passport', ...(Object.hasOwn(p, 'workflow') ? ['workflow'] : [])]); subset(p.passport, passportKeys);
    check(e.passport.timing === 'retrospective', 'prospective passport is frozen; missing labels need a future episode');
    e.passport = { ...e.passport, ...p.passport, recordedAt: event.at, timing: 'retrospective' };
    if (Object.hasOwn(p, 'workflow')) e.workflow = p.workflow;
  } else if (event.action === 'adjudicate') {
    fields(p, ['evaluation']);
    const a = e.attempts.find(a => a.id === p.evaluation?.attemptId);
    check(a && !['running', 'unknown'].includes(a.status) && a.checkpointDigest !== null, 'adjudication needs a terminal checkpoint');
    check(!e.evaluations.some(v => v.id === p.evaluation.id), 'evaluation id already exists; append an independently attributed judgment');
    e.evaluations.push(p.evaluation);
  } else if (event.action === 'followup') {
    fields(p, ['observation']);
    check(ISO(p.observation?.observedAt) && Date.parse(p.observation.observedAt) <= Date.parse(event.at), 'follow-up cannot claim a future observation');
    e.followup.push(p.observation);
  }
  return e;
}

/** Explicit bindings only. Callers opt in; this API never discovers credentials or transcripts. */
export async function qualityLifecycle(options) {
  const event = eventInput(options.event), now = options.now ?? new Date().toISOString();
  check(ISO(now) && Date.parse(event.at) <= Date.parse(now) + 300000, 'invalid or future lifecycle observation time');
  const ledger = { manifest: options.manifest, state: options.state, appRoot: options.appRoot, now };
  const inspected = await qualityOperation({ ...ledger, action: 'inspect' });
  const sourceId = `lifecycle:${event.id}`;
  const original = inspected.receipts.flatMap(r => r.bundle.episodes).find(e => e.project.toLowerCase() === event.project.toLowerCase() && e.source.kind === 'observer' && e.source.id === sourceId);
  let episode;
  if (original) {
    check(original.source.digest === fingerprint(event) && original.id === event.episodeId, 'lifecycle event id has different original input');
    episode = original;
  } else {
    const current = inspected.bundle.episodes.find(e => e.project.toLowerCase() === event.project.toLowerCase() && e.id === event.episodeId);
    if (event.action === 'begin') {
      check(!current && !inspected.receipts.some(r => r.bundle.episodes.some(e => e.project.toLowerCase() === event.project.toLowerCase() && e.id === event.episodeId)), 'episode already exists; inspect its original lifecycle');
      episode = begin(event, now);
    } else {
      check(current, 'active episode missing; begin or inspect original retention first');
      episode = amend(current, event, now);
    }
    episode = sealRecord(episode);
  }
  const inputBundle = { ...inspected.bundle, episodes: [episode] }; validateQualityBundle(inputBundle);
  const result = await qualityOperation({ ...ledger, action: 'collect', inputBundle, yes: options.yes ?? false, digest: options.digest });
  return { ...result, kind: 'agent-quality-lifecycle', eventId: event.id, episodeId: episode.id, observation: event.action,
    episode, provenance: 'local-observer-declaration', modelRuns: 0, automaticRouting: false };
}
