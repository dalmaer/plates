// A workflow's trigger events, on its own so the hosted service (lib/web/routines.mjs) reads them without
// loading lib/adopt.mjs and the practice scripts it imports. lib/adopt.mjs re-exports it for its other readers.
/**
 * A workflow's trigger events, read from its top-level `on:` without a YAML
 * parser: `on: push`, `on: [a, b]`, or a block of keys or list items.
 */
export function workflowTriggers(text) {
  const lines = text.split('\n');
  const at = lines.findIndex(l => /^(on|"on"|'on'):(\s|$)/.test(l));
  if (at < 0) return [];
  const inline = lines[at].replace(/^[^:]*:/, '').replace(/\s#.*$/, '').trim();
  if (inline) return inline.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const out = [];
  let indent = null;
  for (const l of lines.slice(at + 1)) {
    if (!l.trim() || /^\s*#/.test(l)) continue;
    const m = /^(\s+)(?:-\s+)?["']?([A-Za-z_]+)["']?\s*(:|$)/.exec(l);
    if (!/^\s/.test(l)) break;
    if (!m) continue;
    indent ??= m[1].length;
    if (m[1].length === indent) out.push(m[2]);
  }
  return out;
}
