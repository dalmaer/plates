// The backlog page's refresh (plates phase 178). /backlog renders from Home's
// cache; while any plate is still loading, this reads /api/backlog (which
// refreshes a bounded few plates per call) with backoff and renders the list
// and sidebar again with the server's own view functions, until none is
// loading. Read only; nothing is stored in the browser.
/** Waits between reads: quick while plates are arriving, longer after a failed read. */
export const BACKLOG_DELAYS = Object.freeze([1500, 3000, 6000, 12000, 30000]);
/** Reads before the page stops and says to reload. */
export const MAX_READS = 30;
export const REQUEST_TIMEOUT = 58_000;
export const nextDelay = failures => BACKLOG_DELAYS[Math.min(Math.max(0, failures), BACKLOG_DELAYS.length - 1)];
export const validBacklog = model => model?.schema === 1 && Array.isArray(model.lanes) && Array.isArray(model.plates);
export const stillLoading = model => model.plates.some(p => p?.state === 'loading');

/** One read of /api/backlog, with a deadline: { status, model }. */
export async function readBacklog({ fetch, controller = new AbortController(), timeout = REQUEST_TIMEOUT }) {
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch('/api/backlog', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' }, signal: controller.signal });
    return { status: response.status, model: response.status === 200 ? await response.json() : null };
  } catch { return { status: 503, model: null }; }
  finally { clearTimeout(timer); }
}

/** Starts reading while the page says a plate is loading; returns { stop, done } or null. */
export function startBacklogClient({ document, window, fetch, renderBacklog, renderSidebar }) {
  const root = document.querySelector('[data-backlog-root]');
  if (!root || root.dataset.loading !== 'true') return null;
  const status = document.querySelector('[data-backlog-status]');
  let failures = 0, reads = 0, timer = null, stopped = false, finish;
  const done = new Promise(resolve => { finish = resolve; });
  const end = text => { stopped = true; if (status) status.textContent = text; finish(); };
  async function poll() {
    timer = null;
    if (stopped) return;
    const { status: code, model } = await readBacklog({ fetch });
    reads++;
    if ([401, 403, 404].includes(code)) return end('Access changed. Sign in again to continue.');
    if (code === 200 && validBacklog(model)) {
      failures = 0;
      const list = root.querySelector('[data-backlog-list]'), side = root.querySelector('[data-backlog-side]');
      if (list) list.innerHTML = renderBacklog(model);
      if (side) side.outerHTML = renderSidebar(model);
      if (!stillLoading(model)) { root.dataset.loading = 'false'; return end('Every plate is read.'); }
    } else failures++;
    if (reads >= MAX_READS) return end('Some plates are still loading. Reload this page to try again.');
    timer = window.setTimeout(poll, nextDelay(failures));
  }
  timer = window.setTimeout(poll, 0);
  return { done, stop() { stopped = true; if (timer) window.clearTimeout(timer); finish(); } };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  import('/assets/backlog-views.mjs').then(({ renderBacklog, renderSidebar }) => startBacklogClient({ document, window, fetch: window.fetch.bind(window), renderBacklog, renderSidebar })).catch(() => {
    const status = document.querySelector('[data-backlog-status]');
    if (status) status.textContent = 'Live updates could not start. Reload this page to refresh it.';
  });
}
