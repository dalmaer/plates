// Request activity and received project states, never elapsed-time progress.
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
export function homeLoadingSummary(snapshot, { projectId = null } = {}) {
  const projects = (Array.isArray(snapshot?.projects) ? snapshot.projects : []).filter(p => p && (!projectId || p.id === projectId));
  const waiting = projects.filter(p => p.state === 'loading');
  const available = projects.filter(p => ['complete', 'partial', 'stale'].includes(p.state));
  const unavailable = projects.length - waiting.length - available.length;
  const limited = available.filter(p => p.state !== 'complete').length;
  const names = waiting.slice(0, 3).map(p => p.name || p.id).join(', ');
  const count = `${available.length} of ${projects.length} plates have data${limited ? ` · ${limited} partial or stale` : ''}${unavailable ? ` · ${unavailable} unavailable` : ''}`;
  return { waiting: waiting.length > 0, html: `<p class="loading-count">${escape(count)}</p>${waiting.length ? `<p class="meta loading-detail">Waiting for: ${escape(names)}${waiting.length > 3 ? ` and ${waiting.length - 3} more` : ''}.</p>` : ''}` };
}
export function homeLoadingStatus({ inFlight = false, visible = true, status = 'idle' } = {}) {
  if (!visible) return { active:false, title:'Source checks paused', detail:'Checks resume when this page is visible.' };
  if (inFlight) return { active:true, title:'Checking your plates…', detail:'Reading project plans, decisions and recent changes. Results arrive in batches.' };
  if (status === 'stale') return { active:false, title:'Source check interrupted', detail:'Keeping the data already received. We’ll retry automatically, or you can refresh now.' };
  return { active:false, title:'Waiting for more sources', detail:'The next check will continue loading your plates. You can refresh now.' };
}
export function renderHomeLoading(snapshot, options = {}) {
  const summary = homeLoadingSummary(snapshot, options), status = homeLoadingStatus();
  return `<div class="home-loading p-card" data-home-loading data-waiting="${summary.waiting}" data-active="false" role="status" aria-live="polite" aria-atomic="true"${summary.waiting ? '' : ' hidden'}><span class="loading-orbit" aria-hidden="true"></span><div class="loading-copy"><strong data-loading-title>${status.title}</strong><div data-loading-summary>${summary.html}</div><p class="meta loading-detail" data-loading-detail>${status.detail}</p></div></div>`;
}
export const homeLoadingStyles = `
.home-loading{display:flex;align-items:flex-start;gap:14px;padding:20px;margin:16px 0 24px}.home-loading[hidden]{display:none}.loading-copy{min-width:0}.loading-count{margin:6px 0;font-size:14px;font-weight:600}.loading-detail{margin:6px 0 0;overflow-wrap:anywhere}.loading-orbit{flex:none;width:20px;height:20px;margin-top:3px;border:2px solid var(--line);border-top-color:var(--action);border-radius:50%}.home-loading[data-active="true"] .loading-orbit{animation:home-source-spin 1.2s linear infinite}@keyframes home-source-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.home-loading[data-active="true"] .loading-orbit{animation:none}}
`;
