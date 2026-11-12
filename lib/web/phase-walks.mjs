// Home's walk answers on the hosted workspace (plates phase 173): a phase walk
// with no authored guided walk, answered with the owner's choice and/or note.
//
// This writer records the owner's own answer and nothing else: it writes
// exactly what `plates walk done` writes in the CLI, through the same pure
// walkWritePlan (the choice and/or note appended to the phase's evidence, the
// box checked, and the phase built only when no box is left). It synthesizes
// no step pass, no observation the owner did not type and no guided-walk
// draft. A phase with an authored docs/walks/<id>.json keeps that guided walk
// (lib/web/walks.mjs), and this writer refuses it, so the two never race.
//
// Gated by decisionWrites through the existing operations route: preview here,
// then /api/projects/<id>/decisions/apply, which re-reads the source through
// inspectPreview and refuses when the phase, its box text or the evidence
// changed since the preview (the files differ, or the head moved).
import { operationMarker } from './name-transition.mjs';
import { walkWritePlan, yourPartIn, openBoxes, WorkItemError } from '../work-items.mjs';
import { parsePhase, validateGraph, render, DONE, dated, waitsOf, satisfies, yourPartReady } from '../../practices/phases/files/scripts/roadmap.mjs';
import { decisionContext } from '../../practices/reconciliation/files/scripts/plates/decision-context.mjs';
import { digestOf } from '../feedback.mjs';
import { hash, random, WebError } from './common.mjs';
import { createDecisionGitHub, intentFiles, readAll, PHASE_INVENTORY_LIMIT } from './decision-github.mjs';
import { createOperationStore } from './operation-store.mjs';

const utf8 = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const read = async (reader, path) => utf8(await reader.readFile(path));
const day = now => new Date(now()).toISOString().slice(0, 10);
export const PHASE_WALK = 'phase-walk';

/** The answer a preview carries: { phase, box, choice?, note? }, checked. */
function answerOf(value) {
  const keys = ['phase', 'box', 'choice', 'note'];
  if (!value || typeof value !== 'object' || Object.keys(value).some(k => !keys.includes(k))) throw new WebError('invalid_walk_answer', 400);
  const { phase, box, choice, note } = value;
  if (!Number.isSafeInteger(phase) || phase < 0 || box !== null && !(Number.isSafeInteger(box) && box > 0)) throw new WebError('invalid_walk_answer', 400);
  for (const text of [choice, note]) if (text !== undefined && (typeof text !== 'string' || text.length > 500 || /[\x00-\x1f]/.test(text))) throw new WebError('invalid_walk_answer', 400);
  return { phase, box, ...(choice !== undefined ? { choice } : {}), ...(note ? { note } : {}) };
}

export function createPhaseWalks(config, { fetcher = fetch, now = Date.now } = {}) {
  const operations = createOperationStore(config, fetcher);
  async function plan(access, token, project, input) {
    const answer = answerOf(input);
    const provider = createDecisionGitHub(token, { fetcher }), snapshot = await provider.snapshot(project), { reader, entries, source } = snapshot;
    const files = [...entries.keys()].filter(p => /^docs\/phases\/\d+-[a-z0-9-]+\.md$/.test(p) && Number(p.slice(12).split('-')[0]) === answer.phase);
    if (files.length !== 1) throw new WebError('phase_not_found', 404);
    const path = files[0], raw = await read(reader, path), file = path.split('/').at(-1);
    // An authored guided walk owns its phase's walks on the web.
    const guides = [...entries.keys()].filter(p => /^docs\/walks\/[a-z][a-z0-9-]{0,63}\.json$/.test(p)).slice(0, 50);
    const guideBytes = await readAll({ readFile: walk => reader.readFile(walk).catch(error => { if (error?.status === 401) throw error; return null; }) }, guides);
    for (const bytes of guideBytes) {
      let target = null;
      try { target = bytes ? JSON.parse(utf8(bytes))?.target?.phase ?? null : null; } catch { target = null; }
      if (target === path) throw new WebError('guided_walk_owns_phase', 409);
    }
    const cfg = JSON.parse(await read(reader, entries.has('.plates/plates.json') ? '.plates/plates.json' : '.keel/keel.json'));
    if (cfg.phases?.source === 'milestones') throw new WebError('milestone_planning_inspect_only', 409);
    const names = [...entries.keys()].filter(p => /^docs\/phases\/\d+-[a-z0-9-]+\.md$/.test(p));
    if (names.length > PHASE_INVENTORY_LIMIT) throw new WebError('phase_inventory_limit', 413);
    const raws = new Map((await readAll(reader, names)).map((bytes, i) => [names[i].split('/').at(-1), utf8(bytes)]));
    const phases = [...raws].map(([n, t]) => parsePhase(n, t)).sort((a, b) => a.id - b.id), goals = JSON.parse(await read(reader, 'docs/goals.json'));
    try { validateGraph(phases, goals); } catch { throw new WebError('invalid_phase_inventory', 409); }
    const phase = phases.find(p => p.file === file);
    // The CLI's refusals: not open, not the owner's, not ready ("Ready when"), its dependencies not met.
    if (DONE.includes(phase.status) || phase.status === 'superseded') throw new WebError('phase_not_open', 409);
    if (dated(phase, day(now)) || waitsOf(phase) !== 'owner' || phase.depends.some(id => !satisfies(phases.find(p => p.id === id)))) throw new WebError('walk_not_ready', 409);
    const yp = yourPartIn(raw);
    if (yp && !yourPartReady(yp)) throw new WebError('walk_not_ready', 409);
    if (!openBoxes(raw).some(b => b.walk)) throw new WebError('box_not_open', 409);
    const evidence = phase.evidence[0], evidencePath = evidence ? `docs/${evidence}` : null;
    if (evidencePath && !/^docs\/evidence\/[^/]+\.md$/.test(evidencePath)) throw new WebError('unsupported_evidence_path', 409);
    const evidenceText = evidencePath ? await read(reader, evidencePath) : undefined;
    let write;
    try { write = walkWritePlan({ file, raw, evidenceText, note: answer.note, box: answer.box ?? undefined, choice: answer.choice, today: day(now) }); }
    catch (error) { if (error instanceof WorkItemError) throw new WebError('invalid_walk_answer', 400); throw error; }
    const replaced = new Map(write.writes), next = phases.map(p => replaced.has(`docs/phases/${p.file}`) ? parsePhase(p.file, replaced.get(`docs/phases/${p.file}`)) : p);
    try { validateGraph(next, goals); } catch { throw new WebError('invalid_phase_inventory', 409); }
    const links = [];
    for (const [label, doc] of [['Design', 'design.md'], ['Lessons', 'lessons.md']]) if (entries.has(`docs/${doc}`) && (await reader.stat(`docs/${doc}`)).type === 'file') links.push([label, doc]);
    const roadmap = render({ config: cfg, phases: next, goals, links });
    const prior = entries.has('docs/ROADMAP.md') ? await read(reader, 'docs/ROADMAP.md') : null;
    if (roadmap !== prior) write.writes.push(['docs/ROADMAP.md', roadmap]);
    for (const [p] of write.writes) if (![path, write.data.evidence, 'docs/ROADMAP.md'].includes(p)) throw new WebError('invalid_write_files', 400);
    for (const p of write.created) if (entries.has(p)) throw new WebError('evidence_destination_exists', 409);
    const bundle = await decisionContext({ reader, phase: String(phase.id) });
    if (bundle.gaps.length) throw new WebError('decision_context_unavailable', 409);
    return { answer, source, provider, files: intentFiles({ files: write.writes.map(([p, content]) => ({ path: p, content, originalBlob: entries.get(p)?.sha ?? null })) }),
      consequence: write.what, context: { state: bundle.state, digest: bundle.digest }, canWrite: snapshot.canWrite && access.contentsPermission === 'write',
      project: { ...project, name: typeof cfg.name === 'string' ? cfg.name : project.id } };
  }
  async function preview(access, token, project, input) {
    const checked = await plan(access, token, project, input);
    const id = hash(random()), operationId = hash(`walk-operation:${id}`), commitMessage = `Record Plates walk answer\n\n${operationMarker(operationId)}`;
    const result = { schema: 1, kind: 'walk', id, operationId, operationUrl: `/projects/${project.id}/operations/${operationId}`, expiresAt: new Date(now() + 900000).toISOString(),
      project: checked.project, source: checked.source, target: { kind: PHASE_WALK, ...checked.answer }, sourceDigest: digestOf({ source: checked.source, files: checked.files }),
      contextDigest: checked.context.digest, files: checked.files, consequence: checked.consequence, commitMessage, visibility: checked.source.visibility,
      canSubmit: config.decisionWrites === true && checked.canWrite,
      refusal: config.decisionWrites !== true ? 'Submission is disabled until the owner enables decision writes.' : !checked.canWrite ? 'Current App and user Contents write permission is unavailable.' : null };
    result.digest = digestOf(result);
    if (!await operations.createPreview(id, operations.scopeFor(access.userId, project), { ...result, actorId: access.userId, sourceRevision: access.sourceRevision })) throw new WebError('preview_conflict', 409);
    return result;
  }
  /** Apply's re-read: the same plan from current sources; operations compares its files and source with the preview's. */
  async function inspectPreview(access, token, project, saved) {
    const { kind, ...answer } = saved.target;
    const checked = await plan(access, token, project, answer);
    return { model: { supported: true, source: checked.source, context: checked.context }, canWrite: checked.canWrite, provider: checked.provider, files: checked.files };
  }
  return { preview, inspectPreview };
}
