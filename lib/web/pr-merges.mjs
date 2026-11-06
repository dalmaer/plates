// A ready pull request merged from the docket through the GitHub App (plates
// phase 176), on the operation path decisions use (phase 97): a preview the
// owner sees first, then an apply bound to it by a digest of the PR, its head
// SHA and the merge method. The apply journals the operation before any
// outward call (reserve, then dispatched), re-reads the PR and refuses when
// its head moved, it closed, became a draft or its checks are no longer
// green, rechecks the owner's access, and then asks GitHub to merge only at
// that head (the merge endpoint's `sha`). An answer that never came back is
// uncertain: recovery reads the PR and settles it, and nothing is sent again.
//
// Gated twice: decisionWrites (the instance's write setting; operations.apply
// refuses without it) and the App installation's "Pull requests: Read and
// write" with "Contents: Read and write" (access.pullRequestsPermission and
// contentsPermission), which the owner grants in GitHub.
import { hash, random, WebError, boundedJson } from './common.mjs';
import { createOperationStore } from './operation-store.mjs';
import { mergeMethodOf, notReady, readyChecksOf, readyChecksQuery } from '../pr-ready.mjs';
import { MERGE_PERMISSION } from '../work-items.mjs';

const SHA = /^[0-9a-f]{40}$/;
const idValid = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
export const mergeDigest = ({ repoId, number, head, method, operationId }) => hash(JSON.stringify(['plates-merge', repoId, number, head, method, operationId]));
const canMerge = access => access?.pullRequestsPermission === 'write' && access?.contentsPermission === 'write';

export function createMerges(config, { fetcher = fetch, now = Date.now } = {}) {
  const store = createOperationStore(config, fetcher);
  const github = token => {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const call = (path, options = {}) => fetcher(`https://api.github.com${path}`, { ...options, redirect: 'error', headers: { ...headers, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(20000) });
    const get = async path => {
      let response;
      try { response = await call(path); } catch { throw new WebError('upstream_unavailable'); }
      if ([401, 403, 404].includes(response.status)) { await response.body?.cancel(); throw new WebError(response.status === 401 ? 'session_expired' : 'access_denied', response.status === 401 ? 401 : 404); }
      return boundedJson(response, 1024 * 1024);
    };
    return { call, get };
  };
  const base = project => `/repos/${project.repo.split('/').map(encodeURIComponent).join('/')}`;
  /** The PR as GitHub has it now: { number, open, merged, draft, head, title, url, mergeCommit }. */
  async function readPr(gh, project, number) {
    const pr = await gh.get(`${base(project)}/pulls/${number}`);
    if (pr?.number !== number || pr.base?.repo?.id !== project.repoId || !SHA.test(pr.head?.sha ?? '')) throw new WebError('source_unavailable');
    return { number, open: pr.state === 'open', merged: pr.merged === true, draft: pr.draft === true, head: pr.head.sha, title: String(pr.title ?? '').slice(0, 200), url: typeof pr.html_url === 'string' ? pr.html_url : `https://github.com/${project.repo}/pull/${number}`, mergeCommit: SHA.test(pr.merge_commit_sha ?? '') ? pr.merge_commit_sha : null };
  }
  async function readChecks(gh, project, number) {
    const [owner, name] = project.repo.split('/');
    let response;
    try { response = await gh.call('/graphql', { method: 'POST', body: JSON.stringify({ query: readyChecksQuery([number]), variables: { owner, name } }) }); } catch { throw new WebError('upstream_unavailable'); }
    const data = await boundedJson(response, 256 * 1024);
    if (data?.errors?.length) throw new WebError('checks_unavailable', 409);
    return readyChecksOf(data?.data?.repository, [number])[number] ?? null;
  }

  /** The preview of merging the item's PR at the head its card showed. Writes nothing on GitHub. */
  async function preview(access, token, project, item) {
    const card = item?.merge;
    if (!Number.isSafeInteger(card?.number) || !SHA.test(card?.head ?? '')) throw new WebError('invalid_answer', 400);
    const gh = github(token), pr = await readPr(gh, project, card.number);
    if (!pr.open || pr.draft) throw new WebError('item_not_waiting', 404);
    if (pr.head !== card.head) throw new WebError('stale_preview', 409);
    const method = mergeMethodOf(await gh.get(`/repositories/${project.repoId}`));
    const id = hash(random()), operationId = hash(`merge-operation:${id}`);
    const digest = method ? mergeDigest({ repoId: project.repoId, number: pr.number, head: pr.head, method, operationId }) : null;
    const refusal = !method ? 'The repository\'s merge settings could not be read, so no merge method is chosen.' : config.decisionWrites !== true ? 'Submission is disabled until the owner enables decision writes.' : !canMerge(access) ? MERGE_PERMISSION : null;
    const result = { schema: 1, id, operationId, operationUrl: `/projects/${project.id}/operations/${operationId}`, expiresAt: new Date(now() + 900000).toISOString(), kind: 'merge',
      project: { id: project.id, repo: project.repo }, pr: { repo: project.repo, number: pr.number, head: pr.head, title: pr.title, url: pr.url }, method, digest,
      consequence: `Merge ${project.repo}#${pr.number} (${pr.title}) by ${method ?? 'its merge method'}, only if its head is still ${pr.head.slice(0, 7)}.`, canSubmit: refusal === null, refusal };
    const stored = { ...result, project: { ...project }, actorId: access.userId, sourceRevision: access.sourceRevision };
    if (!await store.createPreview(id, store.scopeFor(access.userId, project), stored)) throw new WebError('preview_conflict', 409);
    return result;
  }

  const view = row => ({ schema: 1, id: row.id, previewId: row.value.previewId, projectId: row.value.projectId, kind: 'merge', state: row.state,
    reason: row.value.reason ?? (row.state === 'refused' ? 'This merge was not dispatched before its reservation expired.' : null), receipt: row.value.receipt ?? null });
  const receipt = (intent, actorId, commit) => ({ url: `https://github.com/${intent.repo}/pull/${intent.number}`, commit, pr: intent.number, head: intent.head, method: intent.method, actorId, recordedAt: new Date(now()).toISOString() });

  /** operations.apply's merge: `saved` is the stored preview it already checked for actor, project and expiry. */
  async function apply(access, token, project, saved, { reauthorize, publicAcknowledgement } = {}) {
    const p = saved.value;
    if (!p.digest || publicAcknowledgement !== p.digest || p.digest !== mergeDigest({ repoId: project.repoId, number: p.pr.number, head: p.pr.head, method: p.method, operationId: p.operationId })) throw new WebError('merge_acknowledgement_required', 400);
    const scope = store.scopeFor(access.userId, project), id = p.operationId, fence = hash(random());
    const intent = { repo: project.repo, repoId: project.repoId, number: p.pr.number, head: p.pr.head, method: p.method };
    let value = { previewId: p.id, projectId: project.id, actorId: access.userId, kind: 'merge', fence, intent, reason: null, receipt: null };
    // The journal first: a reserved operation is the one durable record of this merge, before anything is asked of GitHub.
    let row = await store.reserve(id, scope, store.projectFor(project), p.id, fence, value);
    if (row?.conflict) throw new WebError('project_busy', 409);
    if (!row) throw new WebError('preview_expired', 410);
    if (!row.created) return view(row);
    const gh = github(token);
    try {
      const pr = await readPr(gh, project, intent.number);
      if (!pr.open || pr.merged) throw new WebError('item_not_waiting', 409);
      if (pr.head !== intent.head) throw new WebError('stale_preview', 409);
      const checked = await readChecks(gh, project, intent.number);
      if (notReady({ head: intent.head }, checked)) throw new WebError('not_ready', 409);
      if (typeof reauthorize !== 'function') throw new WebError('authorization_recheck_required', 403);
      const fresh = await reauthorize();
      if (fresh.userId !== access.userId || !canMerge(fresh) || fresh.sourceRevision !== p.sourceRevision || !fresh.projects.some(x => x.id === project.id && x.repoId === project.repoId && x.repo === project.repo)) throw new WebError('access_changed', 409);
      if (Date.parse(p.expiresAt) <= now()) throw new WebError('preview_expired', 410);
    } catch (error) {
      if (error.status === 401) throw error;
      value = { ...value, reason: error instanceof WebError ? error.code : 'validation_unavailable' };
      row = await store.transition('refused', id, scope, fence, value);
      if (!row) throw new WebError('operation_conflict', 409);
      return view(row);
    }
    row = await store.transition('dispatched', id, scope, fence);
    if (!row) throw new WebError('operation_conflict', 409);
    let state = 'uncertain', reason = 'The merge outcome is uncertain. Recover this original operation; do not merge again.';
    try {
      const response = await gh.call(`${base(project)}/pulls/${intent.number}/merge`, { method: 'PUT', body: JSON.stringify({ sha: intent.head, merge_method: intent.method }) });
      if (response.ok) {
        const merged = await boundedJson(response, 65536).catch(() => null);
        if (merged?.merged === true && SHA.test(merged.sha ?? '')) { state = 'committed'; reason = null; value = { ...value, receipt: receipt(intent, access.userId, merged.sha) }; }
      } else if ([403, 404, 405, 409, 422].includes(response.status)) {
        await response.body?.cancel();
        state = 'refused'; reason = response.status === 409 ? 'GitHub refused the merge: the head moved since the preview. Nothing was merged.' : 'GitHub refused the merge (it is not mergeable as it stands). Nothing was merged.';
      } else await response.body?.cancel();
    } catch { /* uncertain: recovery reads the PR, never merges again */ }
    value = { ...value, reason };
    try { row = await store.transition(state, id, scope, fence, value) ?? row; } catch { /* The dispatched record still blocks a second merge. */ }
    return view(row);
  }

  /** A merge's operation, settled from the PR when it was left dispatched or uncertain. */
  async function recover(access, token, project, id, row, scope) {
    if (['dispatched', 'uncertain'].includes(row.state)) {
      const { intent } = row.value;
      try {
        const pr = await readPr(github(token), project, intent.number);
        let next = null;
        if (pr.merged && pr.head === intent.head && pr.mergeCommit) next = ['committed', { ...row.value, reason: null, receipt: receipt(intent, row.value.actorId, pr.mergeCommit) }];
        else if (!pr.merged && (!pr.open || pr.head !== intent.head)) next = ['refused', { ...row.value, reason: 'The pull request was not merged by this operation: it closed or its head moved.' }];
        if (next) row = await store.transition(next[0], id, scope, row.value.fence, next[1]) ?? row;
      } catch (error) { if ([401, 404].includes(error.status)) throw error; }
    }
    return view(row);
  }
  return { preview, apply, recover, idValid };
}
