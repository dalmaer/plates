// Hosted attach preview (phase 181). Only source reads and prospective brief
// rendering: never call attach(), claim(), a journal or a route handler here.
import { attachPreview, canonical, checkRoute } from '../attach.mjs';
import { backlogFor, homeSnapshot, roadmapOf } from '../work-items.mjs';
import { createProjectReader } from './projects.mjs';
import { createHomeStore } from './home-store.mjs';
import { WebError, hash, record } from './common.mjs';
import { navigation, navigationFooter, navigationScripts } from './navigation.mjs';

export const ATTACH_PREVIEW_NOTE = 'Preview only. Nothing is claimed or started. The session route hands you a brief to open yourself; it does not run an agent. Apply and dispatch are unavailable from this page.';
export function attachQuery(params, projectId) {
  for (const key of params.keys()) if (!['key', 'route', 'provider'].includes(key) || params.getAll(key).length !== 1) throw new WebError('invalid_query', 400);
  const key = params.get('key'), route = params.get('route'), provider = params.get('provider');
  const match = /^([a-z][a-z0-9-]{0,63}):phase:([1-9][0-9]{0,8})$/.exec(key ?? '');
  if (!match || match[1] !== projectId || route !== 'session' || (provider !== null && !/^[a-z][a-z0-9-]{0,39}$/.test(provider))) throw new WebError('invalid_attach', 400);
  return { key, route, provider, phase: Number(match[2]) };
}

export function createAttachPreview(config, { fetcher = fetch, now = Date.now } = {}) {
  // Reuse the existing quota accounting, not the Home cache or an attach store.
  const store = createHomeStore(config, fetcher);
  return async (access, token, project, input) => {
    // A phase can be owned by an open work PR even without a claim branch.
    if (access.pullRequestsRead !== true) throw new WebError('attach_ownership_unavailable');
    const reader = createProjectReader({ fetcher, store, userId: access.userId, token, now });
    const value = await reader(project, null);
    if (!value.sourceComplete || !value.roadmap || !value.recurring) throw new WebError('attach_source_unavailable');
    const claims = await reader.claims(project, { pulls: true });
    if (claims.state !== 'read' || !Array.isArray(claims.prs)) throw new WebError('attach_claims_unavailable');
    const roadmap = roadmapOf(value, claims, { now: now() });
    const snapshot = homeSnapshot([value], { today: new Date(now()).toISOString().slice(0, 10) });
    const backlog = backlogFor(snapshot, [roadmap], { now: now() });
    const item = backlog.lanes.find(l => l.lane === 'agent-ready')?.items.find(i => i.key === input.key);
    if (!item) throw new WebError('attach_not_ready', 409);
    const policy = value.recurring.config;
    try { checkRoute(policy, input.route); } catch { throw new WebError('attach_route_unavailable', 409); }
    const providers = record(policy.agents) ? Object.keys(policy.agents) : ['claude', 'codex'];
    if (input.provider !== null && !providers.includes(input.provider)) throw new WebError('invalid_provider', 400);
    const phase = value.roadmap.phases.find(p => p.id === input.phase);
    const source = { workspaceRevision: access.sourceRevision, repoId: project.repoId, repo: project.repo, revision: value.revision, path: `docs/phases/${phase.file}` };
    const preview = input.provider === null ? null : attachPreview({ projectId: project.id, phase: phase.id, title: phase.title, route: input.route, provider: input.provider });
    return { schema: 1, state: preview ? 'preview' : 'choose-provider', project: { id: project.id, name: value.name }, key: input.key, source,
      phase: phase.id, route: input.route, providers, preview,
      digest: preview ? hash(canonical({ source, key: input.key, preview })) : null,
      claimed: false, running: false, capabilities: { apply: false, dispatch: false }, note: ATTACH_PREVIEW_NOTE };
  };
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function attachPreviewView(access, model, csrf = null) {
  const { project, source, preview } = model, effect = preview?.effect;
  const facts = [['Repository', source.repo], ['Source revision', source.revision], ['Workspace revision', source.workspaceRevision], ['Phase source', source.path], ['Phase', model.phase], ['Route', model.route],
    ...(effect ? [['Provider', effect.provider], ['Prospective claim ref (not created)', effect.claimRef], ['Brief bytes', effect.brief.bytes], ['Brief SHA-256', effect.brief.sha256], ['Attach contract digest', preview.digest], ['Source-bound preview digest', model.digest], ['Budget', effect.budget.from]] : [])];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Attach preview · Plates</title><link rel="stylesheet" href="/assets/plates.css"><link rel="stylesheet" href="/assets/decision.css"></head><body><a class="skip" href="#main">Skip to content</a>${navigation(access, { path: `/projects/${project.id}/attach?${new URLSearchParams({ key: model.key, route: model.route, ...(effect ? { provider: effect.provider } : {}) })}`, project })}<main id="main" class="decision-shell"><a href="/backlog">← Backlog</a><h1>Attach preview · ${escape(project.name)} #${model.phase}</h1><p>${escape(model.note)}</p><form method="get" action="/projects/${escape(project.id)}/attach"><input type="hidden" name="key" value="${escape(model.key)}"><input type="hidden" name="route" value="session"><label>Provider <select name="provider" required>${model.providers.map(p => `<option value="${escape(p)}"${effect?.provider === p ? ' selected' : ''}>${escape(p)}</option>`).join('')}</select></label> <button type="submit"${model.providers.length ? '' : ' disabled'}>Preview brief</button></form>${model.providers.length ? '' : '<p>No providers are listed for this plate.</p>'}<section class="decision-section decision-receipt"><h2>Exact preview</h2><dl>${facts.map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl></section>${effect ? `<section class="decision-section"><h2>Prospective brief</h2><p>The wording below describes a successful future claim. This preview has not made that claim.</p><pre class="decision-file" tabindex="0">${escape(effect.brief.text)}</pre></section>` : ''}${model.preparation && csrf ? `<section class="decision-section"><h2>Keep this private preview</h2><p>Save the exact preview without claiming or starting anything. If the response is lost, open the original URL below instead of submitting again.</p><a href="${escape(model.preparation.previewUrl)}">Revisit original preview</a><form method="post" action="/projects/${escape(project.id)}/attach/prepare"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="key" value="${escape(model.key)}"><input type="hidden" name="provider" value="${escape(effect.provider)}"><input type="hidden" name="requestId" value="${escape(model.preparation.requestId)}"><button type="submit">Prepare private preview</button></form></section>` : ''}<p>Apply unavailable · Dispatch unavailable</p></main>${navigationFooter(access)}${navigationScripts}</body></html>`;
}
