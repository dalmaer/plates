// Done on a step, on the hosted workspace (plates phase 187): the owner's
// answer that a roadmap step is taken, written as the `drop` mark
// `plates home --answer <key> done` writes in a checkout (lib/looseends.mjs
// mark): fingerprint phase:<n>, kind phase, the owner's why as its reason, in
// the plate's .plates/loose-ends.json. Home stops listing a step once its mark
// is on the default branch (lib/web/projects.mjs).
//
// The same flow as a walk answer (lib/web/phase-walks.mjs): a preview here,
// stored as an operation, then /api/projects/<id>/decisions/apply, which
// re-reads this plan from current sources and refuses when the default branch
// moved, the phase changed (its bytes are the context digest) or the marks file
// changed. Gated by decisionWrites. A marks file that is not JSON is refused,
// never overwritten.
import { operationMarker } from './name-transition.mjs';
import { MARKS, marksIn, markEntry, withMark } from '../loose-ends-marks.mjs';
import { parsePhase, DONE } from '../../practices/phases/files/scripts/roadmap.mjs';
import { digestOf } from '../feedback.mjs';
import { hash, random, WebError } from './common.mjs';
import { createDecisionGitHub, intentFiles } from './decision-github.mjs';
import { createOperationStore } from './operation-store.mjs';

const utf8 = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const day = now => new Date(now()).toISOString().slice(0, 10);
export const STEP_MARK = 'step-mark';

/** The answer a preview carries: { phase, reason, date }, checked. */
function answerOf(value) {
  const keys = ['phase', 'reason', 'date'];
  if (!value || typeof value !== 'object' || Object.keys(value).some(k => !keys.includes(k))) throw new WebError('invalid_answer', 400);
  const { phase, reason, date } = value;
  if (!Number.isSafeInteger(phase) || phase < 0) throw new WebError('invalid_answer', 400);
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 300 || /[\x00-\x1f]/.test(reason)) throw new WebError('invalid_why', 400);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new WebError('invalid_answer', 400);
  return { phase, reason: reason.trim(), date };
}

export function createStepMarks(config, { fetcher = fetch, now = Date.now } = {}) {
  const operations = createOperationStore(config, fetcher);
  async function plan(access, token, project, input) {
    const answer = answerOf(input);
    const provider = createDecisionGitHub(token, { fetcher }), snapshot = await provider.snapshot(project), { reader, entries, source } = snapshot;
    const files = [...entries.keys()].filter(p => /^docs\/phases\/\d+-[a-z0-9-]+\.md$/.test(p) && Number(p.slice(12).split('-')[0]) === answer.phase);
    if (files.length !== 1) throw new WebError('phase_not_found', 404);
    const path = files[0], raw = utf8(await reader.readFile(path)), phase = parsePhase(path.split('/').at(-1), raw);
    if (DONE.includes(phase.status) || phase.status === 'superseded') throw new WebError('phase_not_open', 409);
    const prior = entries.has(MARKS) ? utf8(await reader.readFile(MARKS)) : null;
    let marks;
    try { marks = marksIn(prior); } catch { throw new WebError('invalid_marks_file', 409); }
    const fingerprint = `phase:${answer.phase}`;
    if (marks.some(m => m?.fingerprint === fingerprint && m.move === 'drop')) throw new WebError('item_not_waiting', 409);
    const entry = markEntry({ fingerprint, kind: 'phase', move: 'drop', reason: answer.reason, today: answer.date });
    const content = withMark(marks, entry);
    return { answer, source, provider, entry, files: intentFiles({ files: [{ path: MARKS, content, originalBlob: entries.get(MARKS)?.sha ?? null }] }),
      consequence: `Mark phase ${answer.phase} (${phase.title}) done: a drop mark in ${MARKS} — ${answer.reason}`,
      context: { state: 'step', digest: hash(raw) }, canWrite: snapshot.canWrite && access.contentsPermission === 'write' };
  }
  async function preview(access, token, project, input) {
    const checked = await plan(access, token, project, { ...input, date: day(now) });
    const id = hash(random()), operationId = hash(`step-mark-operation:${id}`), commitMessage = `Record Plates step done\n\n${operationMarker(operationId)}`;
    const result = { schema: 1, kind: 'walk', id, operationId, operationUrl: `/projects/${project.id}/operations/${operationId}`, expiresAt: new Date(now() + 900000).toISOString(),
      project: { ...project }, source: checked.source, target: { kind: STEP_MARK, ...checked.answer }, mark: checked.entry, sourceDigest: digestOf({ source: checked.source, files: checked.files }),
      contextDigest: checked.context.digest, files: checked.files, consequence: checked.consequence, commitMessage, visibility: checked.source.visibility,
      canSubmit: config.decisionWrites === true && checked.canWrite,
      refusal: config.decisionWrites !== true ? 'Submission is disabled until the owner enables decision writes.' : !checked.canWrite ? 'Current App and user Contents write permission is unavailable.' : null };
    result.digest = digestOf(result);
    if (!await operations.createPreview(id, operations.scopeFor(access.userId, project), { ...result, actorId: access.userId, sourceRevision: access.sourceRevision })) throw new WebError('preview_conflict', 409);
    return result;
  }
  /** Apply's re-read: the same plan, on the preview's date, from current sources. */
  async function inspectPreview(access, token, project, saved) {
    const { kind, ...answer } = saved.target;
    const checked = await plan(access, token, project, answer);
    return { model: { supported: true, source: checked.source, context: checked.context }, canWrite: checked.canWrite, provider: checked.provider, files: checked.files };
  }
  return { preview, inspectPreview };
}
