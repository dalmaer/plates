// Phase 196: one project model for the site and plates home --project.
// Existing backlog order, source identity and attach policy remain authoritative.
import {offeredRoutes} from './agents-model.mjs';
const list = v => Array.isArray(v) ? v : [];
export const PROJECT_STATES = Object.freeze({'in-flight':'Agent working', yours:'Needs you', 'agent-ready':'Ready', done:'Done'});
export const UNKNOWN_ASSIGNMENT = Object.freeze({provider:null,why:'Agent quota is unavailable; no recommendation.',candidates:[]});
export function simpleProject(snapshot, projectId, {config = null, recommendation = UNKNOWN_ASSIGNMENT} = {}) {
  const project = list(snapshot.projects).find(p => p.id === projectId);
  if (!project) return null;
  config ??= project.recurring?.config ?? {};
  const routes = offeredRoutes(config).on.filter(r => ['session','local-host'].includes(r));
  const providers = Object.keys(config.agents ?? {}).filter(p => /^[a-z][a-z0-9-]{0,39}$/.test(p));
  const unreadAssignments = list(snapshot.backlog?.claims).find(c => c.projectId === projectId && c.read === false);
  const assignmentGap = unreadAssignments ? `Agent assignments could not be read${unreadAssignments.why ? `: ${unreadAssignments.why}` : '.'}` : null;
  const cards = list(snapshot.home?.glance?.cards).filter(c => c.projectId === projectId);
  const seen = new Set(), items = [], waiting = [];
  for (const lane of list(snapshot.backlog?.lanes)) for (const item of list(lane.items)) {
    if (item.projectId !== projectId || seen.has(item.key)) continue;
    seen.add(item.key);
    const commands = !assignmentGap && lane.lane === 'agent-ready' && item.kind === 'phase' &&
      new RegExp(`^${projectId}:phase:[1-9][0-9]{0,8}$`).test(item.key) ? routes.flatMap(route => providers.map(provider => ({route, provider,
        recommended: provider === recommendation.provider,
        command:`plates home --attach ${item.key} --route ${route} --provider ${provider}`}))) : [];
    const canAssign = lane.lane === 'agent-ready';
    const assignUnavailable = !canAssign || commands.length ? null : assignmentGap ?? (!routes.length ? 'No attachment route is enabled for this project.' : !providers.length ? 'No agents are configured for this project.' : 'This item has no supported attachment.');
    const row = {...item, state:PROJECT_STATES[lane.lane] ?? null, canAssign, assign:commands, assignUnavailable, blocked:[]};
    if (row.state) items.push(row); else waiting.push(row);
  }
  const remaining = [];
  for (const row of waiting) {
    const dependency = items.find(i => list(row.depends).map(String).includes(String(i.ref)));
    if (dependency) dependency.blocked.push(row); else remaining.push(row);
  }
  const plate = list(snapshot.backlog?.plates).find(p => p.projectId === projectId);
  const gaps = [assignmentGap, ...list(project.gaps).map(g => g.reason),
    ...(!plate ? ['Work has not been read.'] : plate.state !== 'read' || plate.coverage === 'partial' ? [plate.reason ?? `Showing available work; source read is ${plate.state === 'read' ? 'partial' : plate.state}.`] : [])];
  return {projectId, name:project.name ?? projectId, cards, items, waiting:remaining, recommendation,
    gaps:[...new Set(gaps.filter(Boolean))]};
}
const plain = value => String(value ?? '').replace(/<!--[\s\S]*?-->/g,'').replace(/\*\*|`/g,'');
export function simpleProjectLines(model) {
  if (!model) return [];
  const out = [];
  if (model.items.length) out.push('Backlog');
  const detail = (item, indent) => {
    out.push(`${indent}${item.state ? `${item.state} · ` : ''}${plain(item.title)}${item.holder?.provider ? ` · ${item.holder.provider}` : ''}`);
    if (item.done) out.push(`${indent}  Done when: ${plain(item.done)}`);
    if (item.next) out.push(`${indent}  Next: ${plain(item.next)}`);
    if (item.canAssign) {
      if (item.assignUnavailable) out.push(`${indent}  Assign unavailable: ${item.assignUnavailable}`);
      else out.push(`${indent}  Assign: ${model.recommendation.why}`);
      for (const a of item.assign) out.push(`${indent}    ${a.command}${a.recommended ? ' (recommended)' : ''}`);
      if (item.assign.length) out.push(`${indent}    Preview first; approval is required before attaching.`);
    }
    if (!item.state) out.push(`${indent}  ${list(item.why ?? item.reasons).map(plain).join('; ')}`);
    for (const row of item.blocked) detail(row, `${indent}  `);
  };
  for (const item of model.items) detail(item,'  ');
  if (model.waiting.length) { out.push('Other work, waiting'); for (const item of model.waiting) detail(item,'  '); }
  for (const gap of model.gaps) out.push(`Source: ${gap}`);
  return out;
}
