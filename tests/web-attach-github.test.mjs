// Phase 181 dormant transport. Synthetic provider only; no real credentials/API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareClaimIntent, createAttachGitHub } from '../lib/web/attach-github.mjs';
import { claimFromRef } from '../lib/work-items.mjs';

const credential = 'fake-acme-transport-token';
const input = (overrides = {}) => ({ operationId: 'a'.repeat(64), repoId: 102, repositoryNodeId: 'R_acme_studio', repo: 'acme/studio', phase: 1,
  provider: 'codex', machine: 'acme-hosted', at: '2026-11-14T12:00:00Z', parent: 'b'.repeat(40), tree: 'c'.repeat(40),
  identity: { name: 'Acme Builder', email: 'builder@acme.example' }, ...overrides });
const intent = overrides => prepareClaimIntent(input(overrides));
const metadata = i => ({ id: i.repositoryNodeId, databaseId: i.repoId, nameWithOwner: i.repo });
const object = i => ({ oid: i.commit, message: i.payload.message, tree: { oid: i.tree }, parents: { totalCount: 1, nodes: [{ oid: i.parent }] },
  author: { ...i.payload.author }, committer: { ...i.payload.committer }, repository: metadata(i) });
function provider(i = intent(), options = {}) {
  const state = { calls: [], commits: new Map([[i.commit, object(i)]]), ref: null, repo: metadata(i), before: null, read: null, mutate: null };
  const ref = () => state.ref === null ? null : ({ prefix: 'refs/heads/', name: 'claims/phase-1', repository: { ...state.repo }, target: structuredClone(state.commits.get(state.ref)) });
  const fetcher = async (url, opts) => {
    assert.equal(url, 'https://api.github.com/graphql'); assert.equal(opts.method, 'POST'); assert.equal(opts.redirect, 'error');
    assert.equal(opts.headers.Authorization, `Bearer ${credential}`); assert.ok(opts.signal);
    const { query, variables } = JSON.parse(opts.body), mutation = query.startsWith('mutation ');
    state.calls.push({ query, variables, mutation, signal: opts.signal });
    if (state.before) { const intercepted = await state.before({ mutation, variables, opts }); if (intercepted) return intercepted; }
    if (mutation) {
      assert.equal(variables.input.repositoryId, i.repositoryNodeId, 'write destination is immutable, never a name');
      assert.equal(variables.input.name, i.ref);
      if (state.mutate) return state.mutate({ variables, opts, ref });
      if (state.ref !== null) return Response.json({ data: { createRef: null }, errors: [{ message: 'fake-existing-ref' }] });
      state.ref = variables.input.oid;
      return Response.json({ data: { createRef: { ref: ref() } } });
    }
    assert.equal(variables.repositoryId, i.repositoryNodeId, 'recovery is node-addressed');
    const node = { ...state.repo, source: { oid: i.parent, tree: { oid: i.tree }, repository: { ...state.repo } },
      candidate: structuredClone(state.commits.get(variables.commit) ?? null), ref: ref() };
    if (state.read) state.read(node);
    return Response.json({ data: { node } });
  };
  const transport = createAttachGitHub(credential, { fetcher, ...options });
  return { state, transport, i };
}
const mutations = s => s.calls.filter(c => c.mutation);

test('claim intent hash agrees with native git commit-tree and retains original bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'acme-claim-transport-'));
  try {
    const env = { ...process.env, GIT_AUTHOR_NAME: 'Acme Builder', GIT_AUTHOR_EMAIL: 'builder@acme.example', GIT_COMMITTER_NAME: 'Acme Builder',
      GIT_COMMITTER_EMAIL: 'builder@acme.example', GIT_AUTHOR_DATE: input().at, GIT_COMMITTER_DATE: input().at };
    const git = (args, stdin) => execFileSync('git', args, { cwd: root, env, input: stdin, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    git(['init', '--quiet']);
    const tree = git(['mktree'], ''), parent = git(['commit-tree', tree, '-m', 'Acme source']);
    const i = intent({ tree, parent }), actual = git(['commit-tree', tree, '-p', parent, '-F', '-'], i.payload.message);
    assert.equal(i.commit, actual);
    assert.equal(JSON.parse(JSON.stringify(i)).payload.message, i.payload.message);
    assert.equal(i.payload.author.date, i.at); assert.deepEqual(i.payload.author, i.payload.committer);
    const holder = claimFromRef('claims/phase-1', i.payload.message, i.at);
    assert.equal(holder.provider, 'codex'); assert.equal(holder.machine, 'acme-hosted');
    assert.notEqual(intent({ tree, parent, operationId: 'd'.repeat(64) }).commit, i.commit);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('commit publication is explicitly unsupported with zero IO', async () => {
  let calls = 0;
  const transport = createAttachGitHub(credential, { fetcher: async () => { calls++; throw Error('must not run'); } });
  const result = await transport.publishCommit(intent());
  assert.equal(result.state, 'unsupported'); assert.equal(result.reason, 'immutable_commit_publication_unavailable');
  assert.equal(result.retryAuthorized, false); assert.equal(calls, 0);
});

test('commit existence is not ownership and inspection never mutates', async () => {
  const { i, state, transport } = provider();
  assert.equal((await transport.inspectCommit(i)).state, 'published');
  assert.equal((await transport.inspectClaim(i)).state, 'pending');
  state.commits.clear();
  assert.equal((await transport.inspectCommit(i)).state, 'pending');
  assert.equal((await transport.publishRef(i)).stage, 'commit');
  assert.equal(mutations(state).length, 0);
  state.commits.set(i.commit, object(i)); state.ref = i.commit;
  assert.equal((await transport.inspectClaim(i)).state, 'claimed');
  assert.equal(mutations(state).length, 0);
});

test('two competing original intents create one ref and report its holder', async () => {
  const { i, state, transport } = provider(), other = intent({ operationId: 'd'.repeat(64), provider: 'claude' });
  state.commits.set(other.commit, object(other));
  const results = await Promise.all([transport.publishRef(i), transport.publishRef(other)]);
  assert.deepEqual(results.map(r => r.state).sort(), ['claimed', 'taken']);
  assert.equal(state.ref, i.commit); assert.equal(results[1].holder.provider, 'codex');
  assert.equal(mutations(state).length, 2, 'one attempt per fenced intent; neither retries');
  const before = state.calls.length;
  assert.equal((await transport.inspectClaim(other)).state, 'taken');
  assert.ok(state.calls.slice(before).every(c => !c.mutation));
  assert.equal(results.every(r => !r.retryAuthorized), true);
});

test('lost ref response recovers original ownership without repeating the mutation', async () => {
  const { i, state, transport } = provider();
  state.mutate = () => { state.ref = i.commit; throw Error(credential); };
  const uncertain = await transport.publishRef(i);
  assert.equal(uncertain.state, 'uncertain'); assert.doesNotMatch(JSON.stringify(uncertain), new RegExp(credential));
  assert.equal((await transport.inspectClaim(JSON.parse(JSON.stringify(i)))).state, 'claimed');
  assert.equal(mutations(state).length, 1);
});

test('after mutation starts missing ref is uncertain for success errors and null responses', async () => {
  for (const reply of ['success', 'errors', 'null']) {
    const { i, state, transport } = provider();
    state.mutate = () => Response.json(reply === 'errors' ? { data: { createRef: null }, errors: [{ message: credential }] }
      : reply === 'null' ? { data: { createRef: null } } : { data: { createRef: { ref: { prefix: 'refs/heads/', name: 'claims/phase-1', repository: metadata(i), target: { oid: i.commit } } } } });
    const result = await transport.publishRef(i);
    assert.equal(result.state, 'uncertain', reply); assert.equal(result.retryAuthorized, false);
    assert.equal((await transport.inspectClaim(i)).state, 'pending', 'later absence grants no retry authority');
    assert.equal(mutations(state).length, 1);
  }
});

test('wrong repository source commit and ref observations fail closed', async () => {
  const corruptions = [n => n.databaseId++, n => n.id = 'R_other', n => n.nameWithOwner = 'acme/other', n => n.source.tree.oid = 'e'.repeat(40),
    n => n.source.oid = 'e'.repeat(40), n => n.candidate.repository.databaseId++, n => n.candidate.oid = 'e'.repeat(40),
    n => n.candidate.message += 'changed', n => n.candidate.tree.oid = 'e'.repeat(40), n => n.candidate.parents.nodes[0].oid = 'e'.repeat(40),
    n => n.candidate.parents.totalCount = 2, n => n.candidate.author.date = '2026-11-15T12:00:00Z', n => n.candidate.committer.email = 'other@acme.example',
    n => n.ref.name = 'main', n => n.ref.repository.databaseId++, n => n.ref.target.message += 'changed', n => delete n.ref];
  for (const corrupt of corruptions) {
    const { i, state, transport } = provider(); state.ref = i.commit; state.read = corrupt;
    assert.equal((await transport.inspectClaim(i)).state, 'unavailable');
    assert.equal((await transport.publishRef(i)).state, 'unavailable');
    assert.equal(mutations(state).length, 0);
  }
});

test('repository rename and name reuse cannot redirect writes or recovery', async () => {
  const { i, state, transport } = provider();
  state.before = ({ mutation, variables }) => {
    if (mutation) {
      // Original node renamed after the check; old owner/name now means another repo.
      state.repo = { ...metadata(i), nameWithOwner: 'acme/renamed' };
      assert.equal(variables.input.repositoryId, i.repositoryNodeId);
      assert.equal(Object.hasOwn(variables.input, 'repositoryNameWithOwner'), false);
    }
  };
  assert.equal((await transport.publishRef(i)).state, 'uncertain');
  assert.equal(state.ref, i.commit, 'only original node was targeted');
  state.repo = { id: 'R_replacement', databaseId: 999, nameWithOwner: i.repo };
  const calls = mutations(state).length;
  assert.equal((await transport.inspectClaim(i)).state, 'unavailable');
  assert.equal((await transport.publishRef(i)).state, 'unavailable');
  assert.equal(mutations(state).length, calls, 'name match cannot authorize another write');
});

test('holder metadata never reflects credentials or arbitrary message dates', async () => {
  const { i, state, transport } = provider(), other = intent({ operationId: 'd'.repeat(64) }), record = object(other);
  record.message = `Provider: ${credential}\nMachine: ${credential}\nAt: ${credential}\n`;
  state.commits.set(other.commit, record); state.ref = other.commit;
  const result = await transport.inspectClaim(i);
  assert.equal(result.state, 'taken'); assert.equal(result.holder.provider, 'unknown'); assert.equal(result.holder.machine, 'unknown');
  assert.equal(result.holder.at, '2026-11-14T12:00:00.000Z'); assert.ok(!JSON.stringify(result).includes(credential));
});

test('invalid or edited intents fail before IO', async () => {
  let calls = 0;
  const transport = createAttachGitHub(credential, { fetcher: async () => { calls++; } });
  for (const edit of [i => i.repo = '../other', i => i.repoId = -1, i => i.ref = 'refs/heads/main', i => i.commit = 'e'.repeat(40),
    i => i.payload.message += 'changed', i => i.at = '2026-02-30T12:00:00Z', i => i.identity.name = 'Acme\nInjected', i => i.tree = 'bad',
    i => i.operationId = 'bad', i => i.repositoryNodeId = 'bad\nnode']) {
    const value = intent(); edit(value);
    for (const method of Object.values(transport)) await assert.rejects(method(value), { code: 'invalid_claim_intent' });
  }
  assert.equal(calls, 0);
});

const never = () => new Promise(() => {});
test('stage deadline bounds nonsettling fetch body and cancel; late work cannot mutate', { timeout: 5000 }, async () => {
  for (const mode of ['fetch', 'body', 'cancel']) {
    let late, cancelled = 0;
    const { i, state, transport } = provider(intent(), { timeoutMs: 20 });
    state.before = () => {
      if (mode === 'fetch') return new Promise(resolve => { late = resolve; });
      if (mode === 'body') return new Response(new ReadableStream({ cancel() { cancelled++; return never(); } }));
      let read = false;
      const body = { data: { node: { ...metadata(i), source: { oid: i.parent, tree: { oid: i.tree }, repository: metadata(i) }, candidate: object(i), ref: null } } };
      return { status: 200, body: { getReader: () => ({
        read: async () => read ? { done: true } : (read = true, { done: false, value: Buffer.from(JSON.stringify(body)) }),
        cancel() { cancelled++; return never(); },
      }) } };
    };
    const result = await transport.inspectClaim(i);
    assert.equal(result.state, mode === 'cancel' ? 'pending' : 'unavailable', mode); assert.equal(mutations(state).length, 0);
    if (late) { late(Response.json({ data: {} })); await new Promise(resolve => setImmediate(resolve)); }
    assert.equal(state.calls.length, 1, 'late continuation cannot perform another outward call');
    if (mode !== 'fetch') assert.equal(cancelled, 1);
  }
});

test('timeouts and cancellation after mutation starts stay uncertain', { timeout: 5000 }, async () => {
  for (const mode of ['fetch', 'body', 'abort']) {
    const controller = new AbortController();
    const { i, state, transport } = provider(intent(), { timeoutMs: 20, signal: controller.signal });
    state.mutate = () => {
      state.ref = i.commit;
      if (mode === 'abort') { controller.abort(); return never(); }
      if (mode === 'fetch') return never();
      return new Response(new ReadableStream({ cancel: never }));
    };
    assert.equal((await transport.publishRef(i)).state, 'uncertain', mode);
    assert.equal(mutations(state).length, 1); assert.equal(state.calls.length, 2);
  }
});

test('redirects oversized bodies provider failures and pre-aborts are bounded and redacted', async () => {
  for (const response of [() => new Response(credential, { status: 302, headers: { location: 'https://other.acme.example' } }),
    () => new Response(credential.repeat(4000)), () => { throw Error(credential); }]) {
    const { i, state, transport } = provider(); state.before = response;
    const result = await transport.inspectClaim(i);
    assert.equal(result.state, 'unavailable'); assert.ok(!JSON.stringify(result).includes(credential)); assert.equal(state.calls.length, 1);
  }
  const controller = new AbortController(); controller.abort();
  const { i, state, transport } = provider(intent(), { signal: controller.signal });
  assert.equal((await transport.publishRef(i)).state, 'unavailable'); assert.equal(state.calls.length, 0);
});
