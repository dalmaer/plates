// Official wire contracts: gastownhall/gascity @ 3f3224faaeff2da774417293e4a847aa421365a5
// internal/api/huma_types_sessions.go, huma_types_extmsg.go, docs/reference/api.md (MIT).
// Independently written experimental client; no provider credentials or scheduler.
export const UPSTREAM = '3f3224faaeff2da774417293e4a847aa421365a5';
export function loopback(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('loopback-only');
  return url.origin;
}
export function gasCityClient({ base, city, fetcher = fetch }) {
  const root = `${loopback(base)}/v0/city/${encodeURIComponent(city)}`;
  async function request(path, body, key) {
    const response = await fetcher(`${root}${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', ...(body === undefined ? {} : { 'X-GC-Request': '1' }), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`gas-city-http-${response.status}`);
    return response.json();
  }
  return {
    create: (id, project, agent) => request('/sessions', {kind:'agent', name:agent, async:true, project_id:project, metadata:{real_world_app_plates_operation:id}}, id),
    inspect: id => request(`/session/${encodeURIComponent(id)}?exact_id=true`),
    // Snapshot only; cursor-based recovery requires /events/stream (SSE), not this route.
    events: () => request('/events'),
    register: callback => request('/extmsg/adapters', {provider:'plates', account_id:'plates-experiment', name:'Plates local experiment', callback_url:loopback(callback)}),
    bind: (conversation, session) => request('/extmsg/bind', {conversation, session_id:session}),
    inbound: message => request('/extmsg/inbound', {message}),
    transcript: conversation => request(`/extmsg/transcript?${new URLSearchParams(conversation)}`),
    // /stop interrupts a turn; /kill stops a session. Neither response alone is termination proof here.
    kill: (session, key) => request(`/session/${encodeURIComponent(session)}/kill`, {}, key),
  };
}
