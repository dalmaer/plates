// Read-only grouping. Membership never changes the authenticated project scope.
import { exact, hash, projectId, WebError } from './common.mjs';

export function validateProjectSets(value, projectRepoIds) {
  if (!Array.isArray(value) || value.length > 50) throw new WebError('invalid_project_sets', 400);
  const ids = new Set();
  for (const set of value) {
    if (!exact(set, ['id', 'name', 'projects']) || !projectId(set.id) || ids.has(set.id)
      || typeof set.name !== 'string' || set.name !== set.name.trim() || !set.name.length || set.name.length > 120
      || /[\x00-\x1f\x7f]/.test(set.name) || !Array.isArray(set.projects) || !set.projects.length || set.projects.length > 100
      || new Set(set.projects).size !== set.projects.length
      || !set.projects.every(id => projectId(id) && Object.hasOwn(projectRepoIds, id))) throw new WebError('invalid_project_sets', 400);
    ids.add(set.id);
  }
  return structuredClone(value);
}

export function authorizedProjectSets(config, access) {
  return validateProjectSets(config.projectSets ?? [], config.projectRepoIds).flatMap(set => {
    const projects = access.projects.filter(p => set.projects.includes(p.id) && config.projectRepoIds[p.id] === p.repoId);
    if (!projects.length) return [];
    return [{ id: set.id, name: set.name, projectIds: projects.map(p => p.id),
      version: hash(JSON.stringify([access.workspace.id, access.sourceRevision, set.id, set.name, projects.map(p => [p.id, p.repoId, p.repo])])) }];
  });
}

export function resolveProjectSet(config, access, id = null) {
  if (id === null) return { projectSet: null, projects: access.projects };
  if (!projectId(id)) throw new WebError('invalid_project_set', 400);
  const projectSet = authorizedProjectSets(config, access).find(set => set.id === id);
  if (!projectSet) throw new WebError('project_set_unavailable', 404);
  return { projectSet, projects: access.projects.filter(p => projectSet.projectIds.includes(p.id)) };
}
