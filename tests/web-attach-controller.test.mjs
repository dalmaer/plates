// Actual HTTP service and PostgreSQL migrations; synthetic Acme auth/provider only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { projectHarness, phaseFile } from './helpers/web-projects.mjs';
import { restoreMigratedPGlite } from './helpers/web-pglite.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { createOperationStore } from '../lib/web/operation-store.mjs';
import { prepareClaimIntent } from '../lib/web/attach-github.mjs';
import { unseal, seal, hash } from '../lib/web/common.mjs';
import { canonical } from '../lib/attach.mjs';
import { describeRoute } from '../lib/web/navigation-routes.mjs';
const api = '/api/projects/studio/attach', query = '?key=studio:phase:1&route=session&provider=codex';
async function hosted(t) {
  const h = projectHarness(), db = await restoreMigratedPGlite();
  t.after(() => db.close());
  h.source.files['.plates/plates.json'] = JSON.stringify({ name: 'Acme Studio', agents: { codex: {}, claude: {} } });
  h.source.files['docs/phases/01-first.md'] = phaseFile(1).replace('status: planned', 'status: planned\nspec: 2');
  const state = { calls: [], lose: false, afterClaims: null, afterIdentity: null, private: true, node: 'R_acme', tree: 'c'.repeat(40), quarantine: false };
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    state.calls.push({ path, options });
    if (path.endsWith('/plates_decision_rpc')) {
      const p = JSON.parse(options.body);
      await db.exec('SET ROLE service_role');
      let row;
      try { row = (await db.query('SELECT public.plates_decision_rpc($1,$2,$3,$4,$5,$6,$7) value', [p.p_operation,p.p_id,p.p_scope,p.p_project,p.p_preview,p.p_fence,p.p_value])).rows[0].value; }
      finally { await db.exec('RESET ROLE'); }
      if (state.lose && p.p_operation === 'preview-create') { state.lose = false; throw Error('Acme lost acknowledgement'); }
      return Response.json(row);
    }
    if (path === '/user/installations') {
      const body = await (await h.fetcher(url, options)).json();
      body.installations[0].permissions.pull_requests = 'read';
      return Response.json(body);
    }
    if (path === '/user/installations/21/repositories') {
      const body = await (await h.fetcher(url, options)).json();
      body.repositories.push({ id: 103, full_name: 'acme/garden' }); body.total_count++;
      return Response.json(body);
    }
    if (path === '/repos/acme/plates-private/contents/workspace.json') {
      const body = await (await h.fetcher(url, options)).json();
      const manifest = JSON.parse(Buffer.from(body.content, 'base64').toString());
      manifest.projects.push({ id: 'garden', repo: 'acme/garden' });
      const text = JSON.stringify(manifest); body.content = Buffer.from(text).toString('base64'); body.size = Buffer.byteLength(text);
      return Response.json(body);
    }
    if (path === '/repositories/102') return Response.json({ id: 102, node_id: state.node, full_name: 'acme/studio', private: state.private, default_branch: 'main' });
    if (path === '/graphql') {
      const q = JSON.parse(options.body).query;
      assert.doesNotMatch(q, /\bmutation\b/);
      if (q.includes('PlatesClaims')) {
        state.afterClaims?.();
        return Response.json({ data: { repository: { refs: { totalCount: 0, nodes: [] }, pullRequests: { totalCount: 0, nodes: [] } } } });
      }
      if (q.includes('AttachPreviewIdentity')) {
        state.afterIdentity?.();
        return Response.json({ data: { node: { id: state.node, databaseId: 102, nameWithOwner: 'acme/studio', isPrivate: state.private,
          defaultBranchRef: { name: 'main', target: { oid: h.source.revision, tree: { oid: state.tree } } } } } });
      }
    }
    return h.fetcher(url, options);
  };
  const config = { ...h.config, ownerIds: [1, 2], projectRepoIds: { studio: 102, garden: 103 }, decisionWrites: false };
  const service = () => createWebService({ ...config, ...(state.quarantine ? { recovery: { epoch: 'acme-recovery', startedAt: new Date(h.state.now).toISOString(), reconciledAt: null } } : {}) }, { fetcher, now: () => h.state.now });
  // Bridge the production Fetch handler through a real loopback HTTP listener.
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const response = await service()(new Request(config.origin + req.url, { method: req.method, headers: { ...req.headers, host: new URL(config.origin).host },
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) }));
      res.setHeader('set-cookie', response.headers.getSetCookie());
      res.writeHead(response.status, Object.fromEntries([...response.headers].filter(([k]) => k !== 'set-cookie')));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  let signed;
  const call = (path, { body, cookie = signed?.cookie ?? null, origin = config.origin, headers = {} } = {}) => fetch(base + path, {
    method: body ? 'POST' : 'GET', redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin, 'content-type': body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json' } : {}), ...headers }, ...(body ? { body: body instanceof URLSearchParams ? body.toString() : JSON.stringify(body) } : {}) });
  async function login() {
    const page = await call('/signin', { cookie: null }), cookie = h.cookieHeader(page), csrf = cookie.split('=')[1];
    const started = await call('/api/auth/start', { cookie, body: new URLSearchParams({ csrf, returnTo: '/' }) });
    assert.equal(started.status, 303, await started.clone().text());
    const target = new URL(started.headers.get('location'));
    h.state.challenges.add(target.searchParams.get('code_challenge'));
    const completed = await call(`/api/auth/callback?code=fake-code&state=${target.searchParams.get('state')}`, { cookie: h.cookieHeader(started) });
    assert.equal(completed.status, 303, await completed.clone().text());
    const signedCookie = h.cookieHeader(completed), session = await call('/api/session', { cookie: signedCookie });
    assert.equal(session.status, 200, await session.clone().text());
    return { cookie: signedCookie, session: await session.json() };
  }
  signed = await login();
  const offer = async () => { const response = await call(api + query); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
  const input = model => ({ csrf: signed.session.csrf, key: model.key, provider: model.preview.effect.provider, requestId: model.preparation.requestId });
  const prepare = model => call(api + '/prepare', { body: input(model) });
  const saved = async id => {
    const row = (await db.query('SELECT * FROM keel_private.decision_previews WHERE id=$1', [id])).rows[0];
    return { row, value: unseal(row.value, config.encryptionKey, `decision:${row.scope}:${id}`) };
  };
  return { h, db, state, config, fetcher, signed, call, login, offer, input, prepare, saved };
}
const apiPath = url => '/api' + url;
const operations = s => s.state.calls.filter(c => c.path.endsWith('/plates_decision_rpc')).map(c => JSON.parse(c.options.body).p_operation);
function noEffects(s) {
  for (const call of s.state.calls) {
    assert.doesNotMatch(call.path, /access_tokens|git\/refs|git\/commits|dispatches/);
    if (call.path === '/graphql') assert.doesNotMatch(JSON.parse(call.options.body).query, /\bmutation\b/);
  }
}

test('HTTP prepares, reloads and repeats the exact encrypted preview without a claim or provider effect', async t => {
  const s = await hosted(t), model = await s.offer();
  assert.deepEqual(operations(s), [], 'GET does not access the decision store');
  const response = await s.prepare(model);
  assert.equal(response.status, 200, await response.clone().text());
  const prepared = await response.json(), id = prepared.previewId;
  assert.equal(prepared.state, 'prepared-preview');
  assert.equal(prepared.operationId, id);
  assert.deepEqual(prepared.preview, model.preview);
  assert.equal(prepared.source.repositoryNodeId, 'R_acme');
  assert.equal(prepared.source.parent, 'b'.repeat(40));
  assert.equal(prepared.source.tree, 'c'.repeat(40));
  assert.equal(prepared.source.visibility, 'private');
  assert.equal(prepared.running, false);
  assert.deepEqual(prepared.capabilities, { apply: false, dispatch: false, recover: false });
  const { row, value } = await s.saved(id);
  assert.ok(!row.value.includes(model.preview.effect.brief.text));
  assert.equal(value.actorId, 1);
  assert.equal(value.digest, hash(canonical(value.model)));
  assert.match(value.fence, /^[a-f0-9]{64}$/);
  assert.deepEqual(await (await s.call(apiPath(prepared.previewUrl))).json(), prepared);
  assert.deepEqual(await (await s.prepare(model)).json(), prepared);
  assert.equal(operations(s).filter(op => op === 'preview-create').length, 1);
  assert.equal((await s.db.query('SELECT count(*)::int n FROM keel_private.decision_operations')).rows[0].n, 0);
  assert.equal((await s.call(apiPath(prepared.operationUrl))).status, 404);
  const html = await (await s.call(prepared.previewUrl)).text();
  assert.ok(html.includes(id)); assert.ok(html.includes(value.digest)); assert.match(html, /Inspect original attach receipt/);
  assert.doesNotMatch(/<main[\s\S]*?<\/main>/.exec(html)[0], /method="post"/);
  for (const path of [prepared.previewUrl, prepared.operationUrl]) assert.equal(describeRoute(path)?.path, path);
  // The owner-facing form uses the same bounded API contract and redirects so
  // normal reloads never resend preparation.
  const offeredHtml = await (await s.call('/projects/studio/attach' + query)).text();
  const form = /<form method="post" action="(\/projects\/studio\/attach\/prepare)">([\s\S]*?)<\/form>/.exec(offeredHtml);
  assert.ok(form);
  const fields = Object.fromEntries([...form[2].matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const submitted = await s.call(form[1], { body: new URLSearchParams(fields) });
  assert.equal(submitted.status, 303, await submitted.clone().text());
  assert.match(submitted.headers.get('location'), /\/attach\/previews\/[a-f0-9]{64}$/);
  assert.equal((await s.call(submitted.headers.get('location'))).status, 200);
  noEffects(s);
});

test('HTTP preparation rejects authority fields, auth, CSRF, foreign origin, changed source and revoked access', async t => {
  const s = await hosted(t), model = await s.offer(), data = s.input(model);
  for (const extra of ['actorId','scope','fence','intent','route','operationId']) {
    assert.equal((await s.call(api + '/prepare', { body: { ...data, [extra]: 'forged' } })).status, 400);
  }
  assert.equal((await s.call(api + '/prepare', { body: data, cookie: null })).status, 401);
  assert.equal((await s.call(api + '/prepare', { body: { ...data, csrf: 'forged' } })).status, 403);
  assert.equal((await s.call(api + '/prepare', { body: data, origin: 'https://foreign.acme.test' })).status, 403);
  assert.equal((await s.call(api + '/prepare', { body: { ...data, provider: 'claude' } })).status, 400);
  assert.equal((await s.call(api.replace('studio', 'other') + '/prepare', { body: data })).status, 404);
  assert.equal((await s.call(api.replace('studio', 'garden') + '/prepare', { body: data })).status, 400, 'authorized other project cannot reuse request identity');
  s.h.source.revision = 'd'.repeat(40);
  assert.equal((await s.prepare(model)).status, 409);
  s.h.source.revision = 'b'.repeat(40);
  s.state.afterClaims = () => { s.h.source.revision = 'd'.repeat(40); };
  assert.equal((await s.prepare(model)).status, 409, 'source changes after exact brief read');
  s.state.afterClaims = null; s.h.source.revision = 'b'.repeat(40);
  s.state.afterIdentity = () => { s.state.node = 'R_other'; };
  assert.equal((await s.prepare(model)).status, 409, 'immutable repository identity changes');
  s.state.node = 'R_acme';
  s.state.afterIdentity = () => { s.state.private = false; };
  assert.equal((await s.prepare(model)).status, 409, 'visibility changes during binding');
  s.state.private = true;
  s.state.afterIdentity = () => { s.h.state.members = []; };
  assert.equal((await s.prepare(model)).status, 404);
  assert.ok(!operations(s).includes('preview-create'));
  noEffects(s);
});

test('HTTP lost preparation acknowledgement retains original identity and never repeats its write', async t => {
  const s = await hosted(t), model = await s.offer(); s.state.lose = true;
  const response = await s.prepare(model);
  assert.equal(response.status, 200, await response.clone().text());
  const uncertain = await response.json();
  assert.equal(uncertain.state, 'preparation-uncertain');
  assert.equal(uncertain.previewUrl, model.preparation.previewUrl);
  assert.equal(uncertain.operationUrl, model.preparation.operationUrl);
  const recovered = await (await s.call(apiPath(uncertain.previewUrl))).json();
  assert.equal(recovered.state, 'prepared-preview');
  assert.deepEqual(recovered.preview, model.preview);
  assert.deepEqual(await (await s.prepare(model)).json(), recovered);
  assert.equal(operations(s).filter(op => op === 'preview-create').length, 1);
  s.h.state.now += 16 * 60000;
  assert.equal((await s.prepare(model)).status, 410);
  assert.equal((await (await s.call(apiPath(uncertain.previewUrl))).json()).state, 'preview-expired');
  assert.equal(operations(s).filter(op => op === 'preview-create').length, 1);
  noEffects(s);
});

test('HTTP receipt validates original journal independently of preview expiry and disabled writes; quarantine blocks both', async t => {
  const s = await hosted(t), model = await s.offer(), prepared = await (await s.prepare(model)).json();
  const { value } = await s.saved(prepared.previewId), store = createOperationStore(s.config, s.fetcher);
  const originalId = hash('Acme original operation with a distinct preview');
  prepared.operationUrl = `/projects/studio/attach/operations/${originalId}`;
  const identity = { id: originalId, scope: value.scope, project: value.projectScope, previewId: value.id, fence: value.fence };
  const intent = prepareClaimIntent({ operationId: identity.id, repoId: 102, repositoryNodeId: 'R_acme', repo: 'acme/studio', phase: 1, provider: 'codex', machine: 'acme-hosted',
    at: new Date(s.h.state.now).toISOString().replace(/\.\d{3}Z$/, 'Z'), parent: 'b'.repeat(40), tree: 'c'.repeat(40), identity: { name: 'Acme', email: 'builder@acme.example' } });
  // Synthetic original journal only, not a controller mutation or provider call.
  await store.attachReserve(identity, intent, value.model.preview.effect.brief);
  for (const stage of ['mint','commit','ref']) {
    await store.attachTransition(stage + '-begin', identity);
    await store.attachTransition(stage + '-record', identity, { stage: stage + '-recorded', at: new Date(s.h.state.now).toISOString() });
  }
  await s.db.query("UPDATE keel_private.decision_previews SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [value.id]);
  s.state.calls.length = 0;
  assert.equal((await (await s.call(apiPath(prepared.previewUrl))).json()).state, 'preview-unavailable');
  const response = await s.call(apiPath(prepared.operationUrl));
  assert.equal(response.status, 200, await response.clone().text());
  const receipt = await response.json();
  assert.equal(receipt.previewUrl, prepared.previewUrl); assert.equal(receipt.operationUrl, prepared.operationUrl);
  assert.notEqual(receipt.previewId, receipt.operationId);
  assert.equal(receipt.stage, 'ref-recorded'); assert.equal(receipt.journalState, 'committed');
  assert.equal(receipt.running, false); assert.equal(receipt.claimVerified, false); assert.equal(receipt.dispatch, false);
  assert.deepEqual(operations(s), ['preview-read','read','attach-read']);
  assert.equal((await s.call(apiPath(prepared.operationUrl).replace('studio', 'other'))).status, 404);
  assert.equal((await s.call(apiPath(prepared.operationUrl).replace('studio', 'garden'))).status, 404, 'authorized other project cannot inspect original receipt');
  assert.equal((await (await s.call(apiPath(prepared.previewUrl).replace('studio', 'garden'))).json()).state, 'preview-unavailable');
  s.h.state.userId = 2; s.h.state.members = [1, 2];
  assert.equal((await s.call(apiPath(prepared.operationUrl))).status, 404, 'session cannot change its actor');
  const other = await s.login();
  assert.equal((await s.call(apiPath(prepared.operationUrl), { cookie: other.cookie })).status, 404, 'authorized other actor cannot read original receipt');
  assert.equal((await (await s.call(apiPath(prepared.previewUrl), { cookie: other.cookie })).json()).state, 'preview-unavailable');
  assert.equal((await s.call(api + '/prepare', { cookie: other.cookie, body: { ...s.input(model), csrf: other.session.csrf } })).status, 400, 'request identity is bound to original actor');
  s.h.state.userId = 1;
  const restored = await s.login(); Object.assign(s.signed, restored);
  // Corrupt the original encrypted observation: read must use strict journal validation.
  await s.db.query("UPDATE keel_private.decision_operations SET attach_observations='{}'::jsonb WHERE id=$1", [originalId]);
  assert.equal((await s.call(apiPath(prepared.operationUrl))).status, 503);
  s.state.quarantine = true;
  for (const path of [apiPath(prepared.previewUrl), apiPath(prepared.operationUrl)]) assert.equal((await s.call(path)).status, 503);
  assert.equal((await s.prepare(model)).status, 503);
  noEffects(s);
});

test('HTTP persisted retrieval rejects malformed decrypted records even with a matching model digest', async t => {
  const s = await hosted(t), model = await s.offer(), prepared = await (await s.prepare(model)).json();
  const { row, value } = await s.saved(prepared.previewId);
  for (const mutate of [v => { v.actorId = 2; }, v => { v.model.source.parent = 'd'.repeat(40); }, v => { v.model.preview.effect.brief.text = 'forged'; },
    v => { v.extra = true; }, v => { v.model.running = true; }, v => { v.model.source.repositoryNodeId = null; }]) {
    const changed = structuredClone(value); mutate(changed); changed.digest = hash(canonical(changed.model));
    await s.db.query('UPDATE keel_private.decision_previews SET value=$1 WHERE id=$2', [seal(changed, s.config.encryptionKey, `decision:${row.scope}:${value.id}`), value.id]);
    assert.equal((await s.call(apiPath(prepared.previewUrl))).status, 503);
  }
  noEffects(s);
});
