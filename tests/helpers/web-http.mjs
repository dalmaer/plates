// Synthetic shared HTTP service. This is adapter/concurrency coverage, not PostgreSQL proof.
import assert from 'node:assert/strict';
import { homeDatabase } from './web-home-store.mjs';
import { createHash } from 'node:crypto';
import { webConfig } from '../../lib/web/config.mjs';
import { createWebService } from '../../lib/web/server.mjs';

// createService selects the release under test (a rollback-baseline copy, for example).
export function harness({ createService: create = createWebService } = {}) {
  const state = { now: Date.now(), records: new Map(), requests: [], unavailable: false, userId: 1, members: [1],
    private: true, appId: 11, installationId: 21, suspended: null, selection: 'selected', repoId: 102,
    repoName: 'acme/studio', repoAccess: true, partial: false, failGitHub: false, challenges: new Set(),
    // Phase 154 opt-in: expiring tokens with single-use rotating refresh tokens.
    // tokens maps each synthetic access token to its expiry; refreshMode is
    // 'ok', 'refused' (GitHub's error body), 'down' (a 502) or null (no refresh tokens).
    refreshMode: null, tokens: new Map([['fake-user-access-token-for-tests', Infinity]]), refreshTokens: new Set(), refreshCalls: [], grants: 0 };
  const input = { version: 1, origin: 'https://plates.acme.test', ownerIds: [1], appId: 11, clientId: 'fake-client', installationId: 21,
    workspace: { id: 'acme', repoId: 101, manifestPath: 'workspace.json', membersPath: 'members.json' }, projectRepoIds: { studio: 102 } };
  const secrets = { clientSecret: 'fake-client-secret-only-for-tests', storageUrl: 'https://acme.supabase.co',
    storageKey: 'fake-service-key-only-for-tests', encryptionKey: Buffer.alloc(32, 7).toString('base64') };
  const config = webConfig(input, secrets);
  state.homeDatabase = homeDatabase(() => state.now);
  const grant = (access = `fake-user-access-token-for-tests-${++state.grants}`) => {
    const refresh = `fake-refresh-token-for-tests-${state.grants}-${state.refreshTokens.size}`;
    state.tokens.set(access, state.now + 28800000); state.refreshTokens.add(refresh);
    return { access_token: access, token_type: 'bearer', expires_in: 28800, refresh_token: refresh, refresh_token_expires_in: 15897600, scope: '' };
  };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const fetcher = async (url, options) => {
    state.requests.push({ url, options });
    if (state.unavailable) throw new Error('fake-secret-must-not-leak');
    const parsed = new URL(url);
    const home = state.homeDatabase.handle(url, options);
    if (home) return home;
    if (parsed.hostname === 'acme.supabase.co') {
      assert.equal(options.headers.apikey, secrets.storageKey);
      const p = JSON.parse(options.body), key = `${p.p_kind}:${p.p_key}`;
      const row = state.records.get(key), active = row && row.expires > state.now;
      let result = null;
      const output = row => ({ version: row.version, value: row.value });
      if (p.p_operation === 'create' && !row) {
        const created = { version: 1, value: p.p_value, binding: p.p_binding, actor: p.p_actor, expires: state.now + p.p_seconds * 1000 };
        state.records.set(key, created); result = output(created);
      } else if (p.p_operation === 'read' && active) result = output(row);
      else if (p.p_operation === 'consume' && active && row.binding === p.p_binding) { result = output(row); state.records.delete(key); }
      else if (['renew', 'cas'].includes(p.p_operation) && active && row.version === p.p_version) {
        if (p.p_operation === 'cas') { row.version++; row.value = p.p_value; }
        row.expires = state.now + p.p_seconds * 1000; result = output(row);
      } else if (p.p_operation === 'revoke') state.records.delete(key);
      else if (p.p_operation === 'revoke_actor') {
        for (const [k, row] of state.records) if (k.startsWith('session:') && row.actor === p.p_actor) state.records.delete(k);
      }
      return json(result);
    }
    if (state.failGitHub) return json({ message: 'fake-provider-private-detail' }, 401);
    if (url === 'https://github.com/login/oauth/access_token') {
      const body = JSON.parse(options.body);
      assert.equal(body.client_secret, secrets.clientSecret);
      if (body.grant_type === 'refresh_token') {
        state.refreshCalls.push(body.refresh_token);
        if (state.refreshMode === 'down') return json({ message: 'fake-provider-private-detail' }, 502);
        if (state.refreshMode !== 'ok' || !state.refreshTokens.delete(body.refresh_token)) return json({ error: 'bad_refresh_token', error_description: 'The refresh token passed is incorrect or expired.' });
        return json(grant());
      }
      const challenge = createHash('sha256').update(body.code_verifier).digest('base64url');
      if (!state.challenges.has(challenge)) return json({ error: 'bad_verifier' }, 400);
      state.challenges.delete(challenge);
      if (state.refreshMode) return json(grant('fake-user-access-token-for-tests'));
      return json({ access_token: 'fake-user-access-token-for-tests', token_type: 'bearer', expires_in: 28800 });
    }
    assert.equal(parsed.hostname, 'api.github.com');
    const token = options.headers.Authorization.replace(/^Bearer /, '');
    assert.ok(state.tokens.has(token), 'a synthetic access token');
    if (state.tokens.get(token) <= state.now) return json({ message: 'Bad credentials' }, 401);
    const path = parsed.pathname;
    if (path === '/user') return json({ id: state.userId });
    if (path === '/user/installations') return json({ total_count: 1, installations: [{ id: state.installationId, app_id: state.appId,
      suspended_at: state.suspended, repository_selection: state.selection, permissions: { contents: state.contentsPermission ?? 'read', metadata: 'read' } }] });
    if (path === '/user/installations/21/repositories') {
      const repositories = [{ id: 101, full_name: 'acme/plates-private' }, ...(state.repoAccess ? [{ id: state.repoId, full_name: state.repoName }] : [])];
      return json({ total_count: repositories.length + (state.partial ? 1 : 0), repositories });
    }
    if (path === '/repositories/101') return json({ id: 101, full_name: 'acme/plates-private', private: state.private, default_branch: 'main' });
    if (path === '/repos/acme/plates-private/commits/main') return json({ sha: 'a'.repeat(40) });
    if (path.startsWith('/repos/acme/plates-private/contents/')) {
      assert.equal(parsed.searchParams.get('ref'), 'a'.repeat(40));
      const manifest = { version: 1, id: 'acme', name: 'Acme workspace', repo: 'acme/plates-private', projects: [{ id: 'studio', repo: 'acme/studio' }] };
      const content = JSON.stringify(path.endsWith('/workspace.json') ? manifest : { version: 1, workspaceId: 'acme', memberIds: state.members });
      return json({ type: 'file', encoding: 'base64', size: Buffer.byteLength(content), content: Buffer.from(content).toString('base64') });
    }
    throw new Error(`Unexpected synthetic path ${path}`);
  };
  const makeService = () => create(config, { fetcher, now: () => state.now });
  const service = makeService();
  const request = (path, { cookie, body, origin = config.origin, method = body ? 'POST' : 'GET', headers = {} } = {}) => new Request(`${config.origin}${path}`, {
    method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/x-www-form-urlencoded', origin } : {}), ...headers },
    ...(body ? { body: new URLSearchParams(body) } : {}),
  });
  const cookieHeader = response => response.headers.getSetCookie().filter(value => !value.includes('Max-Age=0')).map(value => value.split(';')[0]).join('; ');
  async function begin(returnTo = '/') {
    const page = await service(request('/signin'));
    const cookie = cookieHeader(page), csrf = cookie.split('=')[1];
    const started = await service(request('/api/auth/start', { cookie, body: { csrf, returnTo } }));
    if (started.status !== 303) return { started };
    const target = new URL(started.headers.get('location'));
    state.challenges.add(target.searchParams.get('code_challenge'));
    return { started, cookie: cookieHeader(started), path: `/api/auth/callback?code=fake-code&state=${target.searchParams.get('state')}` };
  }
  async function login(oldCookie) {
    const attempt = await begin();
    const completed = await service(request(attempt.path, { cookie: [attempt.cookie, oldCookie].filter(Boolean).join('; ') }));
    assert.equal(completed.status, 303, await completed.clone().text());
    const cookie = cookieHeader(completed);
    const session = await service(request('/api/session', { cookie }));
    assert.equal(session.status, 200, await session.clone().text());
    return { cookie, session: await session.json(), completed };
  }
  return { state, config, input, secrets, fetcher, makeService, service, request, cookieHeader, begin, login };
}
