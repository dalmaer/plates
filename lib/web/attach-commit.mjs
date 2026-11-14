// Dormant exact-repository claim commit publication (phase 181).
// Requires acknowledged mint/commit journal hooks. One in-memory use is not a journal.
// Scoped-token contract: docs.github.com/en/rest/apps/apps#create-a-scoped-access-token
// No installation credential, renewal, ref mutation, parent fallback or token export.
import { prepareClaimIntent, createAttachGitHub } from './attach-github.mjs';
import { canonical } from '../attach.mjs';
import { exact, WebError } from './common.mjs';
const API = 'https://api.github.com';
const keys = ['appId', 'clientId', 'clientSecret', 'installationId', 'actorId', 'ownerId', 'repoId', 'repositoryNodeId', 'repo'];
const intentKeys = ['operationId', 'repoId', 'repositoryNodeId', 'repo', 'phase', 'provider', 'machine', 'at', 'parent', 'tree', 'identity'];
const numeric = n => Number.isSafeInteger(n) && n > 0;
const credential = s => typeof s === 'string' && s.length >= 10 && s.length <= 2048 && !/[\x00-\x20\x7f]/.test(s);
const permissions = p => exact(p, ['contents', 'metadata']) && p.contents === 'write' && p.metadata === 'read';
const expiry = s => typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s) && Number.isFinite(Date.parse(s)) ? Date.parse(s) : NaN;
const cancel = value => { try { Promise.resolve(value?.cancel()).catch(() => {}); } catch {} };
class Refusal extends Error {}
const fail = reason => { throw new Refusal(reason); };
const writeQuery = `query HostedClaimCommitAccess($id: ID!, $parent: GitObjectID!) {
  node(id: $id) { ... on Repository { id databaseId nameWithOwner viewerPermission
    owner { ... on User { databaseId } ... on Organization { databaseId } }
    source: object(oid: $parent) { ... on Commit { oid tree { oid } } }
  } }
}`;

/** Freeze everything before IO. Returned publisher grants no reusable credential capability. */
export function createAttachCommit(config, original, parent, { fetcher = fetch, now = Date.now, signal, timeoutMs = 25000, beforeMint, beforeCommit } = {}) {
  let c, i, p;
  try {
    c = structuredClone(config); p = structuredClone(parent);
    const saved = structuredClone(original);
    i = prepareClaimIntent(Object.fromEntries(intentKeys.map(k => [k, saved[k]])));
    if (canonical(saved) !== canonical(i)) throw Error();
    if (!exact(c, keys) || !['appId', 'installationId', 'actorId', 'ownerId', 'repoId'].every(k => numeric(c[k]))
      || typeof c.clientId !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(c.clientId) || !credential(c.clientSecret)
      || c.repoId !== i.repoId || c.repositoryNodeId !== i.repositoryNodeId || c.repo !== i.repo
      || !exact(p, ['token', 'tokenExpiry']) || !credential(p.token) || !numeric(p.tokenExpiry)
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 25000) throw Error();
  } catch { throw new WebError('invalid_attach_commit', 400); }
  let attempted = false;
  return { async publishCommit() {
    const result = (state, stage, reason, mint = 'not-started', commit = 'not-started') => ({ state, stage, reason,
      operationId: i.operationId, repoId: i.repoId, commit: i.commit, mintObservation: mint, commitObservation: commit, retryAuthorized: false });
    if (attempted) return result('unavailable', 'parent', 'original_operation_already_attempted');
    attempted = true;
    const controller = new AbortController(), cleanups = new Set();
    let stopped = false, calls = 0, stage = 'parent', mint = 'not-started', committed = 'not-started', child = null, childExpiry = null, rejectDeadline;
    const active = () => {
      if (stopped || controller.signal.aborted) fail('operation_ended');
      if (p.tokenExpiry <= now() || childExpiry !== null && childExpiry <= now()) fail('credential_expired');
    };
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
    const stop = () => { stopped = true; controller.abort(); for (const cleanup of cleanups) cleanup(); cleanups.clear(); rejectDeadline(new Refusal('operation_ended')); };
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    const headers = auth => ({ Authorization: auth, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' });
    // Also bounds late callbacks from immutable inspection; no provider URL is followed.
    async function boundedFetch(url, options) {
      active(); if (++calls > 24 || !url.startsWith(`${API}/`)) fail('request_limit');
      const response = await fetcher(url, { ...options, redirect: 'error', signal: controller.signal });
      if (stopped || controller.signal.aborted) { cancel(response.body); fail('operation_ended'); }
      try { active(); return response; } catch (error) { cancel(response.body); throw error; }
    }
    async function request(path, token, { body, basic = false, status = 200, effect = null } = {}) {
      active();
      const auth = basic ? `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}` : `Bearer ${token}`;
      if (effect) {
        const hook=effect==='mint'?beforeMint:beforeCommit;
        if(typeof hook!=='function')fail('journal_ack_required');
        const expected={operationId:i.operationId,stage:effect+'-started'};
        const ack=await hook({...expected}); active();
        if(!exact(ack,['operationId','stage','granted'])||ack.operationId!==expected.operationId||ack.stage!==expected.stage||ack.granted!==true)fail('journal_ack_required');
      }
      if (effect === 'mint') mint = 'uncertain';
      if (effect === 'commit') committed = 'uncertain';
      const response = await boundedFetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: headers(auth), ...(body ? { body: JSON.stringify(body) } : {}) });
      if (response.status !== status) { cancel(response.body); fail('provider_unavailable'); }
      const reader = response.body?.getReader(); if (!reader) fail('provider_unavailable');
      const cleanup = () => cancel(reader); cleanups.add(cleanup);
      try {
        const chunks = []; let bytes = 0;
        for (;;) { active(); const read = await reader.read(); active(); if (read.done) break;
          bytes += read.value.length; if (bytes > 262144) fail('response_limit'); chunks.push(read.value); }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } finally { cleanups.delete(cleanup); cleanup(); }
    }
    const complete = (data, field) => {
      if (!numeric(data?.total_count) || data.total_count > 100 || !Array.isArray(data[field]) || data[field].length !== data.total_count
        || data[field].some(x => !numeric(x?.id)) || new Set(data[field].map(x => x.id)).size !== data.total_count) fail('incomplete_authorization');
      return data[field];
    };
    function grant(data, token, narrowed) {
      if (data?.token !== token || data.user?.id !== c.actorId || data.app?.client_id !== c.clientId || !Array.isArray(data.scopes) || data.scopes.length) fail('token_binding_unverified');
      const expires = expiry(data.expires_at);
      if (narrowed && (!Number.isFinite(expires) || expires <= now() || expires > p.tokenExpiry || expires > now() + 28800000)) fail('child_expiry_unverified');
      if (!narrowed && data.expires_at != null && (!Number.isFinite(expires) || expires <= now() || p.tokenExpiry > expires)) fail('parent_expiry_unverified');
      return expires;
    }
    async function authorize(token, narrowed) {
      if ((await request('/user', token))?.id !== c.actorId) fail('actor_unverified');
      const installs = complete(await request('/user/installations?per_page=100&page=1', token), 'installations');
      const install = installs.find(x => x.id === c.installationId);
      // Installation permissions describe the App installation, not this token.
      // Selected mode remains existing Plates policy; exact child permissions
      // are checked on the minted and verified authorization grants instead.
      if (!install || install.app_id !== c.appId || install.account?.id !== c.ownerId || install.suspended_at !== null
        || install.repository_selection !== 'selected' || install.permissions?.contents !== 'write'
        || narrowed && installs.length !== 1) fail('installation_unverified');
      // Listing is consistency evidence, not independently proven enforcement of
      // repository_ids. A valid provider grant may be conservatively refused.
      const repos = complete(await request(`/user/installations/${c.installationId}/repositories?per_page=100&page=1`, token), 'repositories');
      const listed = repos.find(x => x.id === i.repoId);
      if (!listed || listed.node_id !== i.repositoryNodeId || listed.full_name !== i.repo || listed.owner?.id !== c.ownerId
        || narrowed && repos.length !== 1) fail('repository_scope_unverified');
      const repo = await request(`/repositories/${i.repoId}`, token);
      if (repo?.id !== i.repoId || repo.node_id !== i.repositoryNodeId || repo.full_name !== i.repo || repo.owner?.id !== c.ownerId || repo.permissions?.push !== true) fail('repository_write_unverified');
      const graph = await request('/graphql', token, { body: { query: writeQuery, variables: { id: i.repositoryNodeId, parent: i.parent } } });
      const node = graph?.data?.node;
      if (graph.errors?.length || node?.id !== i.repositoryNodeId || node.databaseId !== i.repoId || node.nameWithOwner !== i.repo || node.owner?.databaseId !== c.ownerId
        || !['WRITE', 'MAINTAIN', 'ADMIN'].includes(node.viewerPermission) || node.source?.oid !== i.parent || node.source.tree?.oid !== i.tree) fail('immutable_write_unverified');
    }
    async function work() {
      active();
      if(typeof beforeMint!=='function'||typeof beforeCommit!=='function')fail('journal_ack_required');
      const parentGrant = await request(`/applications/${c.clientId}/token`, null, { basic: true, body: { access_token: p.token } });
      grant(parentGrant, p.token, false);
      // The documented mint endpoint requires a non-scoped parent; do not infer
      // that property from optional authorization response fields. No fallback.
      await authorize(p.token, false);
      stage = 'mint';
      const minted = await request(`/applications/${c.clientId}/token/scoped`, null, { basic: true, effect: 'mint', body: {
        access_token: p.token, target_id: c.ownerId, repository_ids: [i.repoId], permissions: { contents: 'write', metadata: 'read' },
      } });
      if (!credential(minted?.token) || minted.token === p.token || minted.token === c.clientSecret) fail('child_token_unverified');
      child = minted.token;
      // Null expiry is schema-valid but unsupported here. This local deadline
      // does not revoke or shorten any credential issued by the provider.
      childExpiry = grant(minted, child, true);
      const installation = minted.installation;
      if (!installation || installation.account?.id !== c.ownerId || installation.repository_selection !== 'selected' || !permissions(installation.permissions)
        || installation.single_file_name != null && installation.single_file_name !== '' || installation.has_multiple_single_files === true
        || installation.single_file_paths != null && (!Array.isArray(installation.single_file_paths) || installation.single_file_paths.length)) fail('child_scope_unverified');
      mint = 'received'; stage = 'child';
      const childGrant = await request(`/applications/${c.clientId}/token`, null, { basic: true, body: { access_token: child } });
      if (grant(childGrant, child, true) !== childExpiry) fail('child_expiry_changed');
      // Re-observe the scoped grant itself, not only its token and expiration.
      const verified = childGrant.installation;
      const scope = value => value && ({ owner: value.account?.id, selection: value.repository_selection,
        permissions: value.permissions, file: value.single_file_name ?? null,
        multipleFiles: value.has_multiple_single_files ?? false, paths: value.single_file_paths ?? [] });
      if (!verified || canonical(scope(verified)) !== canonical(scope(installation))) fail('child_scope_changed');
      await authorize(child, true);
      active(); stage = 'commit';
      const published = await request(`/repos/${i.repo.split('/').map(encodeURIComponent).join('/')}/git/commits`, child, { body: i.payload, status: 201, effect: 'commit' });
      if (published?.sha !== i.commit || published.message !== i.payload.message || published.tree?.sha !== i.tree
        || published.parents?.length !== 1 || published.parents[0]?.sha !== i.parent
        || !['author', 'committer'].every(k => ['name', 'email', 'date'].every(f => published[k]?.[f] === i.payload[k][f]))) fail('commit_result_unverified');
      stage = 'verify';
      const inspected = await createAttachGitHub(child, { fetcher: boundedFetch, signal: controller.signal, timeoutMs }).inspectCommit(i);
      active(); if (inspected.state !== 'published') fail('commit_readback_unverified');
      committed = 'verified'; return result('published', stage, null, mint, committed);
    }
    try {
      if (signal?.aborted) stop();
      return await Promise.race([deadline, Promise.resolve().then(work)]);
    } catch (error) {
      const reason = error instanceof Refusal ? error.message : 'provider_unavailable';
      return result(mint === 'uncertain' || committed === 'uncertain' ? 'uncertain' : 'unavailable', stage, reason, mint, committed);
    } finally {
      stopped = true; clearTimeout(timer); signal?.removeEventListener('abort', stop); controller.abort();
      for (const cleanup of cleanups) cleanup(); cleanups.clear(); child = null;
    }
  } };
}
