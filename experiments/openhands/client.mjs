// Experimental REST seam for OpenHands software-agent-sdk c048a1eb82353b0586f3ce600708394a68ebb246 (MIT).
// No environment credentials, auto-retries, redirects, automation scheduler or model defaults.
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
export class OpenHandsClient {
  constructor({ baseURL, sessionKey, timeout = 2000 }) {
    const url = new URL(baseURL);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('local_endpoint_required');
    if (typeof sessionKey !== 'string' || !sessionKey) throw new Error('explicit_session_key_required');
    this.baseURL = url.origin; this.sessionKey = sessionKey; this.timeout = timeout;
  }
  async request(method, path, body) {
    const response = await fetch(`${this.baseURL}/api/conversations${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(this.timeout),
      headers: { 'X-Session-API-Key': this.sessionKey, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw Object.assign(new Error('upstream_http'), { status: response.status });
    return response.json();
  }
  path(id) { if (!uuid(id)) throw new Error('conversation_id'); return `/${id}`; }
  create({ id, profile, project, operation, workspace }) {
    if (!uuid(profile)) throw new Error('profile_id');
    this.path(id);
    if (typeof workspace !== 'string' || !workspace.startsWith('/')) throw new Error('trusted_workspace_required');
    return this.request('POST', '', { conversation_id: id, agent_profile_id: profile, workspace: { kind: 'LocalWorkspace', working_dir: workspace },
      confirmation_policy: { kind: 'AlwaysConfirm' }, max_iterations: 1,
      max_budget_per_run: 0.01, autotitle: false,
      tags: { platesproject: project, platesoperation: operation },
      // Intentionally omit initial_message: the pinned server starts it even if run=false.
    });
  }
  inspect(id) { return this.request('GET', this.path(id)); }
  message(id, text) {
    return this.request('POST', `${this.path(id)}/events`, { role: 'user', content: [{ type: 'text', text }], run: false });
  }
  run(id) { return this.request('POST', `${this.path(id)}/run`); }
  interrupt(id) { return this.request('POST', `${this.path(id)}/interrupt`); }
  events(id, page = null) {
    const query = new URLSearchParams({ limit: '100', sort_order: 'TIMESTAMP' });
    if (page !== null) query.set('page_id', page);
    return this.request('GET', `${this.path(id)}/events/search?${query}`);
  }
}
