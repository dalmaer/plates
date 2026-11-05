// Links an item may carry, checked once for every view that renders them
// (Home, and the review session of plates phase 174): a GitHub https source,
// and a health proposal's decision page. Browser-safe.
const projectPath = id => `/projects/${encodeURIComponent(id)}`;
export function safeSourceLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export function decisionHref(action) {
  const target=action.decisionTarget;
  if(!target || target.kind!=='health' || typeof target.path!=='string' || !target.path || target.path.length>512
    || target.path.startsWith('/') || target.path.includes('\\') || /[\x00-\x1f\x7f]/.test(target.path)
    || target.path.split('/').some(part=>!part || part==='.' || part==='..')
    || !/^[a-z][a-z0-9-]{0,63}$/.test(action.projectId)) return null;
  return `${projectPath(action.projectId)}/decisions?${new URLSearchParams({kind:target.kind,path:target.path})}`;
}
