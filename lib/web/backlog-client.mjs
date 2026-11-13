// The backlog, Recurring and Agents pages' refresh (plates phases 178, 185, 186). /backlog renders from Home's
// cache; while any plate is still loading or stale, this reads /api/backlog (which
// refreshes a bounded few plates per call) with backoff and renders the list
// and sidebar again with the server's own view functions, until none is
// loading or stale. Read only; nothing is stored in the browser.
/** Waits between reads: quick while plates are arriving, longer after a failed read. */
export const BACKLOG_DELAYS = Object.freeze([1500, 3000, 6000, 12000, 30000]);
/** Reads before the page stops and says to reload. */
export const MAX_READS = 30;
export const REQUEST_TIMEOUT = 58_000;
export const nextDelay = failures => BACKLOG_DELAYS[Math.min(Math.max(0, failures), BACKLOG_DELAYS.length - 1)];
export const validBacklog = (model, view = 'backlog') => model?.schema === 1 && (view === 'agents' ? Array.isArray(model.agents?.plates) && Array.isArray(model.pending?.items) : Array.isArray(model.plates) && (view !== 'backlog' || Array.isArray(model.lanes)));
/** The pages this client serves: Backlog and Recurring (phase 185), each its own endpoint. */
const ENDPOINTS = Object.freeze({ backlog: '/api/backlog', goals: '/api/backlog', recurring: '/api/recurring', agents: '/api/agents' });
/** The kinds of time the views write in UTC, as the viewer's time zone says them. */
export function localTime(iso, kind, timeZone) {
  const d = new Date(iso ?? '');
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { ...(timeZone ? { timeZone } : {}), hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
    ...(kind !== 'time' ? { weekday: 'short' } : {}), ...(kind === 'datetime' ? { day: 'numeric', month: 'short' } : {}) }).format(d);
}
/** Every <time data-local> in the page, said in the viewer's time zone. */
export function localizeTimes(root, timeZone) {
  for (const el of root.querySelectorAll?.('time[data-local]') ?? []) { const text = localTime(el.getAttribute('datetime'), el.dataset.local, timeZone); if (text) el.textContent = text; }
}
/** A plate not yet read, or read more than Home's ten minutes ago: read again. */
export const stillLoading = model => (model.plates ?? model.agents?.plates ?? []).some(p => p?.state === 'loading' || p?.state === 'stale');

/** One read of /api/backlog, with a deadline: { status, model }. */
export async function readBacklog({ fetch, url = '/api/backlog', controller = new AbortController(), timeout = REQUEST_TIMEOUT }) {
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' }, signal: controller.signal });
    return { status: response.status, model: response.status === 200 ? await response.json() : null };
  } catch { return { status: 503, model: null }; }
  finally { clearTimeout(timer); }
}

/** Says the page's times in the viewer's zone, then reads while it says a plate is loading or stale; returns { stop, done } or null. */
export function startBacklogClient({ document, window, fetch, renderBacklog, renderSidebar, renderRecurring = null, renderAgents = null, renderByGoal = null, timeZone }) {
  const root = document.querySelector('[data-backlog-root]');
  if (root) localizeTimes(root, timeZone);
  const view = ['recurring', 'agents', 'goals'].includes(root?.dataset.view) ? root.dataset.view : 'backlog', render = { backlog: renderBacklog, goals: renderByGoal, recurring: renderRecurring, agents: renderAgents }[view];
  if (!root || root.dataset.loading !== 'true' || typeof render !== 'function') return null;
  const status = document.querySelector('[data-backlog-status]');
  let failures = 0, reads = 0, timer = null, stopped = false, finish;
  const done = new Promise(resolve => { finish = resolve; });
  const end = text => { stopped = true; if (status) status.textContent = text; finish(); };
  async function poll() {
    timer = null;
    if (stopped) return;
    const { status: code, model } = await readBacklog({ fetch, url: ENDPOINTS[view] });
    reads++;
    if ([401, 403, 404].includes(code)) return end('Access changed. Sign in again to continue.');
    if (code === 200 && validBacklog(model, view === 'goals' ? 'backlog' : view)) {
      failures = 0;
      const list = root.querySelector('[data-backlog-list]'), side = root.querySelector('[data-backlog-side]');
      if (list) list.innerHTML = render(model);
      if (side) side.outerHTML = renderSidebar(model, { active: view === 'goals' ? 'backlog' : view });
      localizeTimes(root, timeZone);
      if (!stillLoading(model)) { root.dataset.loading = 'false'; return end('Every plate is read.'); }
    } else failures++;
    if (reads >= MAX_READS) return end('Some plates are still loading or stale. Reload this page to try again.');
    timer = window.setTimeout(poll, nextDelay(failures));
  }
  timer = window.setTimeout(poll, 0);
  return { done, stop() { stopped = true; if (timer) window.clearTimeout(timer); finish(); } };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  import('/assets/backlog-views.mjs').then(({ renderBacklog, renderSidebar, renderRecurring, renderAgents, renderByGoal }) => startBacklogClient({ document, window, fetch: window.fetch.bind(window), renderBacklog, renderSidebar, renderRecurring, renderAgents, renderByGoal })).catch(() => {
    const status = document.querySelector('[data-backlog-status]');
    if (status) status.textContent = 'Live updates could not start. Reload this page to refresh it.';
  });
}
