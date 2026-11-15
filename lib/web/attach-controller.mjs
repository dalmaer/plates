// Private preparation only: no publisher, journal reservation or dispatch adapter.
import { createAttachPreview, attachQuery, ATTACH_PREVIEW_NOTE } from './attach-preview.mjs';
import { createOperationStore } from './operation-store.mjs';
import { attachPreview, canonical } from '../attach.mjs';
import { exact, hash, random, seal, unseal, requestJson, WebError } from './common.mjs';
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const unavailable = { apply: false, dispatch: false, recover: false };
export function createAttachController(config, { fetcher = fetch, now = Date.now } = {}) {
  const store = createOperationStore(config, fetcher), inspect = createAttachPreview(config, { fetcher, now });
  const urls = (project, id) => ({ previewUrl: `/projects/${project.id}/attach/previews/${id}`, operationUrl: `/projects/${project.id}/attach/operations/${id}` });
  const purpose = (access, project) => `attach-prepare-v1:${store.scopeFor(access.userId, project)}`;
  // Sealed request identity is issued without persistence. It is not an approval
  // or a claim credential. Its deadline prevents an expired request being recreated.
  function offer(access, project, model) {
    if (!model.preview) return model;
    const id = hash(random()), expiresAt = new Date(now() + 15 * 60000).toISOString();
    const request = seal({ schema: 1, id, fence: hash(random()), digest: model.digest, workspaceRevision: access.sourceRevision,
      key: model.key, route: model.route, provider: model.preview.effect.provider, expiresAt }, config.encryptionKey, purpose(access, project));
    return { ...model, preparation: { requestId: request, expiresAt, ...urls(project, id) } };
  }
  async function binding(token, project, revision) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    const repo = await requestJson(fetcher, `https://api.github.com/repositories/${project.repoId}`, { headers }, 65536);
    if (repo.id !== project.repoId || repo.full_name !== project.repo || typeof repo.private !== 'boolean' || typeof repo.node_id !== 'string' || !/^[!-~]{1,200}$/.test(repo.node_id)) throw new WebError('attach_identity_unavailable');
    const result = await requestJson(fetcher, 'https://api.github.com/graphql', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query AttachPreviewIdentity($id:ID!){node(id:$id){... on Repository{id databaseId nameWithOwner isPrivate defaultBranchRef{name target{... on Commit{oid tree{oid}}}}}}}', variables: { id: repo.node_id } }) }, 65536);
    const node = result.data?.node, ref = node?.defaultBranchRef;
    if (result.errors?.length || node?.id !== repo.node_id || node.databaseId !== project.repoId || node.nameWithOwner !== project.repo || node.isPrivate !== repo.private || ref?.name !== repo.default_branch || ref?.target?.oid !== revision || !sha(ref?.target?.tree?.oid)) throw new WebError('attach_source_changed', 409);
    return { repositoryNodeId: node.id, parent: revision, tree: ref.target.tree.oid, visibility: node.isPrivate ? 'private' : 'public' };
  }
  function validateSaved(access, project, id, value) {
    const invalid = () => { throw new WebError('invalid_attach_preview'); };
    const model = value?.model, source = model?.source, effect = model?.preview?.effect;
    const sourceKeys = ['workspaceRevision','repoId','repo','revision','path','repositoryNodeId','parent','tree','visibility'];
    if (!exact(value, ['schema','kind','id','operationId','fence','actorId','scope','projectScope','model','digest','expiresAt'])
      || value.kind !== 'attach-preview' || value.schema !== 1 || value.id !== id || value.operationId !== id || value.actorId !== access.userId
      || value.scope !== store.scopeFor(access.userId, project) || value.projectScope !== store.projectFor(project) || !hex(value.fence)
      || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)) || new Date(value.expiresAt).toISOString() !== value.expiresAt
      || !exact(model, ['schema','state','project','key','source','phase','route','providers','preview','digest','claimed','running','capabilities','note'])
      || model.schema !== 1 || model.state !== 'preview' || model.claimed !== false || model.running !== false || model.note !== ATTACH_PREVIEW_NOTE
      || canonical(model.capabilities) !== canonical({ apply: false, dispatch: false })
      || !exact(model.project, ['id','name']) || model.project.id !== project.id || typeof model.project.name !== 'string' || model.project.name.length > 200
      || !Number.isSafeInteger(model.phase) || model.phase < 1 || model.phase > 999999999 || model.key !== `${project.id}:phase:${model.phase}` || model.route !== 'session'
      || !Array.isArray(model.providers) || model.providers.length > 100 || new Set(model.providers).size !== model.providers.length
      || model.providers.some(p => typeof p !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(p)) || !model.providers.includes(effect?.provider)
      || !exact(source, sourceKeys) || source.repoId !== project.repoId || source.repo !== project.repo || ![source.workspaceRevision,source.revision,source.parent,source.tree].every(sha)
      || source.parent !== source.revision || typeof source.path !== 'string' || !/^docs\/phases\/[a-zA-Z0-9_-]+\.md$/.test(source.path)
      || typeof source.repositoryNodeId !== 'string' || !/^[!-~]{1,200}$/.test(source.repositoryNodeId) || !['private','public'].includes(source.visibility)
      || typeof effect?.title !== 'string' || effect.title.length > 500) invalid();
    const expected = attachPreview({ projectId: project.id, phase: model.phase, title: effect.title, route: 'session', provider: effect.provider });
    const { repositoryNodeId, parent, tree, visibility, ...readSource } = source;
    if (canonical(model.preview) !== canonical(expected) || model.digest !== hash(canonical({ source: readSource, key: model.key, preview: expected }))
      || value.digest !== hash(canonical(model))) invalid();
    return value;
  }
  const visible = (project, value) => ({ ...value.model, state: 'prepared-preview', previewId: value.id, operationId: value.operationId,
    digest: value.digest, expiresAt: value.expiresAt, ...urls(project, value.id), capabilities: unavailable });
  async function preview(access, project, id) {
    if (!hex(id)) throw new WebError('invalid_preview', 400);
    const row = await store.preview(id, store.scopeFor(access.userId, project));
    if (!row) return { schema: 1, state: 'preview-unavailable', ...urls(project, id), capabilities: unavailable, running: false,
      note: 'The original private preview is expired or unavailable. Inspect the original receipt separately. Do not repeat an uncertain preparation.' };
    const value = validateSaved(access, project, id, row.value);
    if (Date.parse(value.expiresAt) <= now()) return { schema: 1, state: 'preview-expired', ...urls(project, id), capabilities: unavailable, running: false };
    return visible(project, value);
  }
  async function prepare(access, token, project, input, { reauthorize } = {}) {
    if (!exact(input, ['key','provider','requestId']) || typeof input.requestId !== 'string' || input.requestId.length > 3000 || typeof reauthorize !== 'function') throw new WebError('invalid_attach_prepare', 400);
    let ticket;
    try { ticket = unseal(input.requestId, config.encryptionKey, purpose(access, project)); } catch { throw new WebError('invalid_attach_prepare', 400); }
    if (!exact(ticket, ['schema','id','fence','digest','workspaceRevision','key','route','provider','expiresAt']) || ticket.schema !== 1 || ![ticket.id,ticket.fence,ticket.digest].every(hex) || !Number.isFinite(Date.parse(ticket.expiresAt))) throw new WebError('invalid_attach_prepare', 400);
    if (input.key !== ticket.key || input.provider !== ticket.provider) throw new WebError('invalid_attach_prepare', 400);
    const existing = await store.preview(ticket.id, store.scopeFor(access.userId, project));
    if (existing) {
      await reauthorize();
      const original = validateSaved(access, project, ticket.id, existing.value);
      if (original.fence !== ticket.fence || original.expiresAt !== ticket.expiresAt) throw new WebError('invalid_attach_preview');
      if (Date.parse(original.expiresAt) <= now()) throw new WebError('preview_expired', 410);
      return visible(project, original);
    }
    if (Date.parse(ticket.expiresAt) <= now()) throw new WebError('preview_expired', 410);
    if (ticket.workspaceRevision !== access.sourceRevision) throw new WebError('attach_source_changed', 409);
    const inputQuery = attachQuery(new URLSearchParams({ key: ticket.key, route: ticket.route, provider: ticket.provider }), project.id);
    const model = await inspect(access, token, project, inputQuery);
    if (model.digest !== ticket.digest) throw new WebError('attach_source_changed', 409);
    const source = await binding(token, project, model.source.revision);
    const bound = { ...model, source: { ...model.source, ...source } };
    const value = { schema: 1, kind: 'attach-preview', id: ticket.id, operationId: ticket.id, fence: ticket.fence, actorId: access.userId,
      scope: store.scopeFor(access.userId, project), projectScope: store.projectFor(project), model: bound, digest: hash(canonical(bound)), expiresAt: ticket.expiresAt };
    validateSaved(access, project, ticket.id, value);
    await reauthorize();
    if (Date.parse(ticket.expiresAt) <= now()) throw new WebError('preview_expired', 410);
    try {
      const saved = await store.createPreview(ticket.id, value.scope, value);
      if (saved) return visible(project, validateSaved(access, project, ticket.id, saved.value));
      // A competing request may have won. Read it; never repeat the write.
      return await preview(access, project, ticket.id);
    } catch {
      return { schema: 1, state: 'preparation-uncertain', operationId: ticket.id, ...urls(project, ticket.id), capabilities: unavailable, running: false,
        note: 'Preparation acknowledgement is unavailable. Revisit the original preview URL; do not submit again.' };
    }
  }
  async function receipt(access, project, id) {
    if (!hex(id)) throw new WebError('invalid_operation', 400);
    const scope = store.scopeFor(access.userId, project), original = await store.read(id, scope);
    if (!original || original.value?.kind !== 'attach') throw new WebError('operation_not_found', 404);
    const value = original.value;
    if (value.id !== id || value.scope !== scope || value.project !== store.projectFor(project)) throw new WebError('operation_not_found', 404);
    // Recover identity from encrypted server state, then use the strict stage,
    // intent and observation validator. No preview read or journal transition.
    const row = await store.attachRead({ id, scope, project: value.project, previewId: value.previewId, fence: value.fence });
    if (!row || row.value.intent.repoId !== project.repoId || row.value.intent.repo !== project.repo) throw new WebError('operation_not_found', 404);
    return { schema: 1, state: 'original-receipt', operationId: id, previewId: row.previewId, journalState: row.state, stage: row.stage,
      observations: row.observations, claimVerified: false, running: false, dispatch: false, capabilities: unavailable,
      note: 'Original journal observation only. Current claim ownership and agent execution are not verified by this receipt.', ...urls(project, id), previewUrl: urls(project, row.previewId).previewUrl };
  }
  return { offer, prepare, preview, receipt };
}
