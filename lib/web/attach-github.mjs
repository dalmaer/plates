// Dormant hosted claim transport (phase 181). Not an authorization/controller.
// A caller must persist the original intent and fence EACH publication before
// calling it. The existing operation store does not yet provide those fences.
// Inspection never authorizes a retry: a missing ref/object remains pending.
import { createHash } from 'node:crypto';
import { claimMessage } from '../claim.mjs';
import { canonical } from '../attach.mjs';
import { claimFromRef } from '../work-items.mjs';
import { exact, hash, WebError } from './common.mjs';

const sha = v => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v);
const id = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const slug = v => typeof v === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(v);
const fields = ['operationId', 'repoId', 'repositoryNodeId', 'repo', 'phase', 'provider', 'machine', 'at', 'parent', 'tree', 'identity'];
const invalid = () => { throw new WebError('invalid_claim_intent', 400); };
const date = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v) && Number.isFinite(Date.parse(v))
  && Date.parse(v) >= 0 && new Date(v).toISOString() === v.replace('Z', '.000Z');

/** Pure preparation; persist these exact inputs before either publication. */
export function prepareClaimIntent(input) {
  if (!exact(input, fields) || !id(input.operationId) || !Number.isSafeInteger(input.repoId) || input.repoId <= 0
    || typeof input.repositoryNodeId !== 'string' || !/^[A-Za-z0-9_=-]{1,200}$/.test(input.repositoryNodeId)
    || typeof input.repo !== 'string' || !/^[A-Za-z0-9-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(input.repo) || input.repo.split('/').some(p => ['.', '..'].includes(p))
    || !Number.isSafeInteger(input.phase) || input.phase <= 0 || !slug(input.provider)
    || typeof input.machine !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(input.machine)
    || !date(input.at) || !sha(input.parent) || !sha(input.tree) || !exact(input.identity, ['name', 'email'])
    || typeof input.identity.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(input.identity.name) || input.identity.name.trim() !== input.identity.name
    || typeof input.identity.email !== 'string' || !/^[A-Za-z0-9._+-]{1,80}@[A-Za-z0-9.-]{1,100}$/.test(input.identity.email)) invalid();
  const saved = { ...input, identity: { ...input.identity } };
  const message = claimMessage({ ...saved, token: hash(`hosted-claim:${input.repoId}:${input.operationId}`) });
  const person = { ...saved.identity, date: saved.at };
  const payload = { message, tree: saved.tree, parents: [saved.parent], author: { ...person }, committer: { ...person } };
  const line = `${person.name} <${person.email}> ${Date.parse(saved.at) / 1000} +0000`;
  const bytes = `tree ${saved.tree}\nparent ${saved.parent}\nauthor ${line}\ncommitter ${line}\n\n${message}`;
  const commit = createHash('sha1').update(`commit ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
  return { ...saved, ref: `refs/heads/claims/phase-${saved.phase}`, commit, payload };
}
function checked(value) {
  if (!exact(value, [...fields, 'ref', 'commit', 'payload'])) invalid();
  const rebuilt = prepareClaimIntent(Object.fromEntries(fields.map(k => [k, value[k]])));
  if (canonical(value) !== canonical(rebuilt)) invalid();
  return rebuilt; // detached from the caller while awaiting IO
}
const repositoryFields = 'id databaseId nameWithOwner';
const commitFields = `oid message tree { oid } parents(first: 2) { totalCount nodes { oid } } author { name email date } committer { name email date } repository { ${repositoryFields} }`;
const inspectQuery = `query HostedClaimInspect($repositoryId: ID!, $commit: GitObjectID!, $parent: GitObjectID!, $ref: String!) {
  node(id: $repositoryId) { ... on Repository { ${repositoryFields}
    source: object(oid: $parent) { ... on Commit { oid tree { oid } repository { ${repositoryFields} } } }
    candidate: object(oid: $commit) { ... on Commit { ${commitFields} } }
    ref(qualifiedName: $ref) { name prefix repository { ${repositoryFields} } target { ... on Commit { ${commitFields} } } }
  } }
}`;
const createRefMutation = `mutation HostedClaimCreateRef($input: CreateRefInput!) {
  createRef(input: $input) { ref { name prefix repository { ${repositoryFields} } target { ... on Commit { oid } } } }
}`;
const sameRepository = (repo, intent) => repo?.id === intent.repositoryNodeId && repo.databaseId === intent.repoId && repo.nameWithOwner === intent.repo;
function verifiedCommit(value, intent) {
  const p = intent.payload;
  return sameRepository(value?.repository, intent) && value.oid === intent.commit && value.message === p.message && value.tree?.oid === p.tree
    && value.parents?.totalCount === 1 && value.parents.nodes?.length === 1 && value.parents.nodes[0]?.oid === p.parents[0]
    && ['author', 'committer'].every(k => value[k]?.name === p[k].name && value[k]?.email === p[k].email && value[k]?.date === p[k].date);
}
const result = (intent, state, stage, more = {}) => ({ state, stage, operationId: intent.operationId, repoId: intent.repoId,
  ref: intent.ref, commit: intent.commit, retryAuthorized: false, ...more });
const unavailable = () => { throw new WebError('claim_transport_unavailable'); };
// Cleanup cannot hold the stage open, even if a custom stream ignores abort.
function cancel(value) { try { Promise.resolve(value?.cancel()).catch(() => {}); } catch {} }

/** Dormant; inspection is mutation-free GraphQL, bound to immutable node IDs.
 * Caller must fence publication separately. No automatic resumption exists.
 */
export function createAttachGitHub(token, { fetcher = fetch, signal, timeoutMs = 25000 } = {}) {
  if (typeof token !== 'string' || !token || /[\x00-\x20\x7f]/.test(token) || token.length > 4096
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 25000) throw new WebError('invalid_claim_transport', 400);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  async function run(intent, stage, work) {
    const controller = new AbortController(), cleanups = new Set();
    let stopped = false, started = false, calls = 0, rejectDeadline;
    const active = () => { if (stopped || controller.signal.aborted) unavailable(); };
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
    const stop = () => { stopped = true; controller.abort(); for (const cleanup of cleanups) cleanup(); cleanups.clear(); rejectDeadline(new WebError('claim_transport_unavailable')); };
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    async function graph(query, variables, mutation = false) {
      active(); if (++calls > 3) unavailable();
      // Mark before calling the fetcher: a throw or timeout may follow acceptance.
      if (mutation) started = true;
      const response = await fetcher('https://api.github.com/graphql', { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { ...headers }, body: JSON.stringify({ query, variables }) });
      if (stopped || controller.signal.aborted) { cancel(response.body); unavailable(); }
      if (response.status !== 200) { cancel(response.body); unavailable(); }
      const reader = response.body?.getReader(); if (!reader) unavailable();
      const cleanup = () => cancel(reader); cleanups.add(cleanup);
      const chunks = []; let size = 0;
      try {
        for (;;) {
          active(); const { done, value } = await reader.read(); active();
          if (done) break;
          size += value.length; if (size > 65536) unavailable(); chunks.push(value);
        }
        const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        active(); return data;
      } finally { cleanups.delete(cleanup); cleanup(); }
    }
    try {
      if (signal?.aborted) stop();
      return await Promise.race([deadline, Promise.resolve().then(() => { active(); return work(graph); })]);
    } catch {
      return result(intent, started ? 'uncertain' : 'unavailable', stage, { reason: 'claim_transport_unavailable' });
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      stopped = true; controller.abort(); for (const cleanup of cleanups) cleanup(); cleanups.clear();
    }
  }
  async function inspect(graph, intent) {
    const response = await graph(inspectQuery, { repositoryId: intent.repositoryNodeId, commit: intent.commit, parent: intent.parent, ref: intent.ref });
    const repo = response?.data?.node;
    if (response.errors?.length || !sameRepository(repo, intent)) unavailable();
    // Missing fields are not a documented null (not found).
    if (!Object.hasOwn(repo, 'candidate') || !Object.hasOwn(repo, 'ref')) unavailable();
    if (!sameRepository(repo.source?.repository, intent) || repo.source.oid !== intent.parent || repo.source.tree?.oid !== intent.tree) unavailable();
    if (repo.candidate !== null && !verifiedCommit(repo.candidate, intent)) unavailable();
    return repo;
  }
  function ownership(repo, intent) {
    const ref = repo.ref;
    if (ref === null) return result(intent, 'pending', 'ref');
    if (!sameRepository(ref.repository, intent) || `${ref.prefix}${ref.name}` !== intent.ref) unavailable();
    const found = ref.target;
    if (!sameRepository(found?.repository, intent) || !sha(found.oid) || typeof found.message !== 'string' || !date(found.committer?.date)) unavailable();
    if (found.oid === intent.commit) {
      if (!verifiedCommit(found, intent)) unavailable();
      return result(intent, 'claimed', 'ref');
    }
    const holder = claimFromRef(`claims/phase-${intent.phase}`, found.message, found.committer.date);
    return result(intent, 'taken', 'ref', { observedCommit: found.oid, holder: {
      provider: slug(holder.provider) && !holder.provider.includes(token) ? holder.provider : 'unknown',
      machine: /^[A-Za-z0-9._-]{1,80}$/.test(holder.machine) && !holder.machine.includes(token)
        && !holder.machine.includes(hash(`hosted-claim:${intent.repoId}:${intent.operationId}`)) ? holder.machine : 'unknown',
      at: date(found.committer.date) ? new Date(found.committer.date).toISOString() : null,
    } });
  }
  async function inspectCommit(value) {
    const intent = checked(value);
    return run(intent, 'commit', async graph => result(intent, (await inspect(graph, intent)).candidate ? 'published' : 'pending', 'commit'));
  }
  async function inspectClaim(value) {
    const intent = checked(value);
    return run(intent, 'ref', async graph => ownership(await inspect(graph, intent), intent));
  }
  async function publishCommit(value) {
    const intent = checked(value);
    // REST create-commit addresses a mutable owner/name, not a repository ID.
    // Before/after identity checks cannot make that write safe against name reuse.
    // createCommitOnBranch would also update a branch and cannot pin these bytes.
    return result(intent, 'unsupported', 'commit', { reason: 'immutable_commit_publication_unavailable' });
  }
  async function publishRef(value) {
    const intent = checked(value);
    return run(intent, 'ref', async graph => {
      const repo = await inspect(graph, intent), before = ownership(repo, intent);
      if (before.state !== 'pending') return before;
      if (!repo.candidate) return result(intent, 'pending', 'commit');
      const response = await graph(createRefMutation, { input: { repositoryId: intent.repositoryNodeId, name: intent.ref, oid: intent.commit, clientMutationId: intent.operationId } }, true);
      const ref = response?.data?.createRef?.ref;
      if (!response.errors?.length && (!sameRepository(ref?.repository, intent) || `${ref.prefix}${ref.name}` !== intent.ref || ref.target?.oid !== intent.commit)) unavailable();
      // Even a conflict/error may be a lost race: read the original ref, never retry.
      const observed = ownership(await inspect(graph, intent), intent);
      return observed.state === 'pending' ? result(intent, 'uncertain', 'ref') : observed;
    });
  }
  return { publishCommit, publishRef, inspectCommit, inspectClaim };
}
