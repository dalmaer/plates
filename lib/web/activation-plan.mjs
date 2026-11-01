// Phase 151: the hosted activation plan's checker and renderer. Pure: the caller
// reads docs/specs/web-activation-plan.json, the phase records and the migration
// folder, and passes them in. Nothing here reads files or contacts a hosted
// service; a plan that passes is a plan, never a proof that a step ran.

export const STEP_KINDS = Object.freeze(['migration', 'env', 'github-app', 'worker', 'schedule', 'decision']);
/** A step may name only phases that are at least partly built. */
export const READY_STATUSES = Object.freeze(['partial', 'built', 'lived-in']);
/** Kinds that change a hosted service, so the owner must be signed in for them. */
const HOSTED_KINDS = new Set(['migration', 'env', 'github-app', 'schedule']);
const STEP_FIELDS = ['id', 'phase', 'kind', 'what', 'prerequisites', 'ownerAttended', 'rollback', 'proof'];
const PLAN_FIELDS = ['schema', 'phase', 'goal', 'record', 'readAt', 'runtimeBaseline', 'summary', 'rules', 'applied', 'steps', 'open'];
const RUNTIME_EXCEPTION_DATE = '2026-10-22';

const text = v => typeof v === 'string' && v.trim().length > 0;
const keysAre = (value, required, optional = []) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && required.every(k => Object.hasOwn(value, k))
  && Object.keys(value).every(k => required.includes(k) || optional.includes(k));

/**
 * Whether a phase note says hosted work remains: "hosted …" and "remain",
 * "await" or "unverified" in one clause. "Hosted SQL checks pass" is not a gap.
 * @param {string} note
 */
export function hostedGap(note) {
  if (typeof note !== 'string') return false;
  return note.split(/[.;]/).some(clause => /\bhosted\b/i.test(clause) && /\b(remains?|awaits?|unverified)\b/i.test(clause));
}

/**
 * The phases of a goal the plan must cover: at least partly built, and owing a
 * walk or naming a hosted gap. The plan's own phase is not one of them.
 * @param {Array<{id:number,status:string,goal:string,owes?:string,note:string}>} phases
 * @param {string} goal
 * @param {number} [self]
 */
export function phasesNeedingSteps(phases, goal, self) {
  return phases
    .filter(p => p.goal === goal && p.id !== self && READY_STATUSES.includes(p.status) && (p.owes === 'walk' || hostedGap(p.note)))
    .map(p => p.id)
    .sort((a, b) => a - b);
}

/**
 * Every way the plan is incomplete, misordered or names an unbuilt phase.
 * @param {any} plan the parsed plan JSON
 * @param {{ phases: Array<{id:number,status:string,goal:string,owes?:string,note:string}>, migrations: string[] }} facts
 *   the actual phase records and the migration file names in the web SQL folder
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkActivationPlan(plan, { phases, migrations }) {
  const problems = [];
  const say = p => problems.push(p);
  if (!keysAre(plan, PLAN_FIELDS) || plan.schema !== 1) return { ok: false, problems: ['plan: needs exactly the fields ' + PLAN_FIELDS.join(', ') + ' and schema 1'] };
  if (!Array.isArray(plan.steps) || !plan.steps.length) return { ok: false, problems: ['plan: no steps'] };
  for (const field of ['goal', 'record', 'readAt', 'runtimeBaseline', 'summary']) if (!text(plan[field])) say(`plan: missing ${field}`);
  if (!Array.isArray(plan.rules) || !plan.rules.length || !plan.rules.every(text)) say('plan: rules must be a nonempty list of sentences');
  if (!Array.isArray(plan.open) || !plan.open.every(text)) say('plan: open must be a list of sentences');

  const byId = new Map(phases.map(p => [p.id, p]));
  const ready = id => READY_STATUSES.includes(byId.get(id)?.status);
  const seen = new Set();
  plan.steps.forEach((s, i) => {
    const at = `step ${i + 1} (${s?.id ?? '?'})`;
    if (!keysAre(s, STEP_FIELDS, ['migration'])) { say(`${at}: needs exactly ${STEP_FIELDS.join(', ')} (and migration for a migration step)`); return; }
    if (!text(s.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) say(`${at}: id must be lowercase words joined by hyphens`);
    if (seen.has(s.id)) say(`${at}: duplicate id`);
    seen.add(s.id);
    if (!STEP_KINDS.includes(s.kind)) say(`${at}: kind ${JSON.stringify(s.kind)} is not one of ${STEP_KINDS.join(', ')}`);
    if (!text(s.what)) say(`${at}: says nothing about what it does`);
    if (!text(s.rollback)) say(`${at}: has no rollback`);
    if (!text(s.proof)) say(`${at}: has no proof to record`);
    if (typeof s.ownerAttended !== 'boolean') say(`${at}: ownerAttended must be true or false`);
    else if (HOSTED_KINDS.has(s.kind) && !s.ownerAttended) say(`${at}: a ${s.kind} step changes a hosted service, so the owner attends it`);
    if ((s.kind === 'migration') !== Object.hasOwn(s, 'migration')) say(`${at}: a migration step names its file, and only a migration step does`);
    if (!Number.isSafeInteger(s.phase)) say(`${at}: phase must be a phase number`);
    if (!Array.isArray(s.prerequisites) || !s.prerequisites.length || !s.prerequisites.every(Number.isSafeInteger)
      || new Set(s.prerequisites).size !== s.prerequisites.length) { say(`${at}: prerequisites must be distinct phase numbers`); return; }
    if (!s.prerequisites.includes(s.phase)) say(`${at}: its own phase ${s.phase} must be among its prerequisites`);
    // The refusal: a step cannot switch on what is not built yet.
    for (const id of s.prerequisites) {
      if (!byId.has(id)) say(`${at}: prerequisite phase ${id} does not exist; refused`);
      else if (!ready(id)) say(`${at}: prerequisite phase ${id} is ${byId.get(id).status}, not built or partial; refused`);
    }
    // Prerequisites come first: every step of another prerequisite phase runs earlier.
    for (const id of s.prerequisites) {
      if (id === s.phase) continue;
      const later = plan.steps.slice(i + 1).filter(t => t?.phase === id).map(t => t.id);
      if (later.length) say(`${at}: needs phase ${id}, but its step${later.length > 1 ? 's' : ''} ${later.join(', ')} come${later.length > 1 ? '' : 's'} after`);
    }
  });

  // The 2026-10-22 runtime exception is re-checked before anything else.
  const first = plan.steps[0];
  if (!(text(first?.what) && first.what.includes(RUNTIME_EXCEPTION_DATE) && text(plan.runtimeBaseline) && first.what.includes(`Node ${plan.runtimeBaseline}`)))
    say(`step 1: must be the ${RUNTIME_EXCEPTION_DATE} hosted runtime exception re-check (Node ${plan.runtimeBaseline} or later)`);

  // Every migration in the folder is applied (with evidence) or has exactly one step, in file order.
  const files = [...migrations].sort();
  const applied = Array.isArray(plan.applied) ? plan.applied : [];
  const appliedFiles = applied.map(a => a?.migration);
  applied.forEach(a => {
    if (!keysAre(a, ['migration', 'phase', 'evidence']) || !text(a.evidence)) say(`applied ${a?.migration ?? '?'}: needs migration, phase and evidence`);
    if (!files.includes(a?.migration)) say(`applied ${a?.migration}: no such migration`);
  });
  if (appliedFiles.join() !== files.slice(0, appliedFiles.length).join()) say('applied: must be the first migrations, in file order');
  const planned = plan.steps.filter(s => s?.kind === 'migration').map(s => s.migration);
  for (const f of planned) if (!files.includes(f)) say(`migration ${f}: no such file in the web SQL folder`);
  for (const f of files) {
    const count = planned.filter(p => p === f).length + appliedFiles.filter(a => a === f).length;
    if (count === 0) say(`migration ${f}: neither applied nor planned`);
    if (count > 1) say(`migration ${f}: listed ${count} times`);
  }
  const order = planned.filter(f => files.includes(f));
  if (order.join() !== [...order].sort().join()) say(`migrations: must run in file order (${order.join(', ')})`);

  // Coverage: each phase that still owes hosted work has at least one step.
  const covered = new Set(plan.steps.map(s => s?.phase));
  for (const id of phasesNeedingSteps(phases, plan.goal, plan.phase)) {
    if (!covered.has(id)) say(`phase ${id}: owes a walk or names a hosted gap, but has no step`);
  }
  return { ok: problems.length === 0, problems };
}

const GUIDE_PATH = 'docs/guide/web-activation.md';
const relative = path => path.startsWith('docs/') ? '../' + path.slice('docs/'.length) : '../../' + path;

/**
 * The human-readable plan, generated from the JSON: docs/guide/web-activation.md.
 * @param {any} plan
 */
export function renderActivationGuide(plan) {
  const out = [
    '# Activate the hosted web workspace',
    '',
    `<!-- Generated from docs/specs/web-activation-plan.json by renderActivationGuide in lib/web/activation-plan.mjs. Edit the JSON, never this page; tests/web-activation-plan.test.mjs fails when it is stale, and rewrites it when run with PLATES_WRITE_ACTIVATION_GUIDE=1. -->`,
    '',
    plan.summary,
    '',
    `The plan is data in [web-activation-plan.json](${relative('docs/specs/web-activation-plan.json')}), read on ${plan.readAt}, and belongs to [phase ${plan.phase}](${relative(plan.record)}). A step for a phase that is not built or partial is refused.`,
    '',
    '## How the session runs',
    '',
    ...plan.rules.map(r => `- ${r}`),
    '',
    '## Already applied',
    '',
    ...plan.applied.map(a => `- ${a.migration} (phase ${a.phase}): [evidence](${relative(a.evidence)})`),
    '',
    '## Steps',
    '',
  ];
  plan.steps.forEach((s, i) => {
    const needs = s.prerequisites.filter(p => p !== s.phase);
    out.push(`${i + 1}. **${s.id}** (phase ${s.phase}, ${s.kind}${s.ownerAttended ? ', owner attends' : ''}). ${s.what}`);
    if (needs.length) out.push(`   - Needs first: phase${needs.length > 1 ? 's' : ''} ${needs.join(', ')}.`);
    out.push(`   - Rollback: ${s.rollback}`);
    out.push(`   - Proof to record: ${s.proof}`);
  });
  out.push('', '## Still open', '', ...plan.open.map(o => `- ${o}`), '');
  return out.join('\n');
}

export { GUIDE_PATH };
