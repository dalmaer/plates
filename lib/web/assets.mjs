// The workspace's public assets, built once per process: each logical path
// (/assets/home-client.mjs) maps to its exact served bytes, type and content
// digest. The digest URL (/assets/home-client.<digest12>.mjs) is immutable and
// cacheable for a year; the logical path keeps answering private, no-store for
// open pages and older service workers (phase 165).
//
// A browser module is served with its imports rewritten to digest URLs, so a
// page loads each module under exactly one URL: a module loaded under two URLs
// is two instances, and safety-client keeps per-document guard state. Digests
// are computed bottom-up, so a module's digest covers its rewritten imports.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { iconSvg, iconPng } from './pwa-icons.mjs';
import { tokens, components, controls, parts } from './design.mjs';
import { styles } from './views.mjs';
import { navigationStyles } from './navigation.mjs';
import { capabilityStyles } from './capability-views.mjs';
import { modelStyles } from './model-views.mjs';
import { recoveryStyles } from './recovery-view.mjs';
import { nightStyles } from './night-views.mjs';
import { fleetStyles } from './fleet-views.mjs';
import { decisionStyles } from './decision-views.mjs';
import { walkStyles } from './walk-views.mjs';
import { journalStyles } from './change-views.mjs';
import { dailyStyles } from './daily-views.mjs';
import { runStyles } from './run-views.mjs';
import { connectionStyles } from './connection-views.mjs';
import { jobStyles } from './job-views.mjs';
import { reviewStyles } from './review-views.mjs';
import { backlogStyles } from './backlog-views.mjs';

export const IMMUTABLE = 'public, max-age=31536000, immutable';
const CSS = 'text/css; charset=utf-8', JS = 'text/javascript; charset=utf-8';
const DIGEST_URL = /^\/assets\/([A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*)\.([0-9a-f]{12})\.([a-z0-9]+)$/;

const read = url => readFileSync(url, 'utf8');
let pngs = null;

// /assets/plates.css: tokens, then components, then the shell, each layer once
// (phase 167). Journal styles ship here, not in change.css, because Home
// renders journal cards with plates.css alone; they keep their place before
// the shell, and no shell or navigation rule ties a journal rule on the same
// element, so journal pages resolve every declaration as they did when
// change.css repeated them. Navigation keeps its old effective place after
// the shell: its first copy (before the shell) was always overridden by the
// second.
export const shellLayers = () => [['tokens', tokens], ['components', components], ['journal', journalStyles], ['shell', styles], ['navigation', navigationStyles], ['capabilities', capabilityStyles]];
const plates = () => shellLayers().map(([, css]) => css).join('');
// The journal pages still link change.css; its rules now live in plates.css.
const changeCss = '/* Journal styles ship in /assets/plates.css. */\n';

// Every public asset. Module sources are literal module-relative URLs so that
// deployment tracing includes each browser file. `strict` paths refuse a query
// string, as the shell assets always have.
export function defaultSources(overrides = {}) {
  // /assets/recovery.css stands alone: recovery is the page shown when the app
  // is broken, so it inlines the tokens instead of linking plates.css (phase 170), and the
  // control base, so its buttons come from the design layer (phase 171).
  const shellCss = plates(), recoveryCss = tokens + controls + recoveryStyles;
  pngs ??= { 192: iconPng(192), 512: iconPng(512), 180: iconPng(180) };
  const css = (path, body) => ({ path, type: CSS, body: () => body });
  const js = (path, url) => ({ path, type: JS, body: () => read(url) });
  const sources = [
    css('/assets/plates.css', shellCss), css('/assets/keel.css', shellCss),
    css('/assets/model.css', modelStyles), css('/assets/recovery.css', recoveryCss), css('/assets/night.css', nightStyles),
    css('/assets/fleet.css', fleetStyles), css('/assets/decision.css', decisionStyles), css('/assets/walk.css', walkStyles),
    css('/assets/change.css', changeCss), css('/assets/daily.css', dailyStyles), css('/assets/run.css', runStyles),
    css('/assets/connection.css', connectionStyles), css('/assets/job.css', jobStyles), css('/assets/review.css', parts + reviewStyles), css('/assets/backlog.css', backlogStyles),
    js('/assets/model-client.mjs', new URL('./model-client.mjs', import.meta.url)),
    js('/assets/model-views.mjs', new URL('./model-views.mjs', import.meta.url)),
    js('/assets/night-client.mjs', new URL('./night-client.mjs', import.meta.url)),
    js('/assets/night-views.mjs', new URL('./night-views.mjs', import.meta.url)),
    js('/assets/navigation.mjs', new URL('./navigation.mjs', import.meta.url)),
    js('/assets/markdown.mjs', new URL('./markdown.mjs', import.meta.url)),
    js('/assets/source-links.mjs', new URL('./source-links.mjs', import.meta.url)),
    js('/assets/navigation-client.mjs', new URL('./navigation-client.mjs', import.meta.url)),
    js('/assets/navigation-routes.mjs', new URL('./navigation-routes.mjs', import.meta.url)),
    js('/assets/safety-client.mjs', new URL('./safety-client.mjs', import.meta.url)),
    js('/assets/editor-draft-client.mjs', new URL('./editor-draft-client.mjs', import.meta.url)),
    js('/assets/home-client.mjs', new URL('./home-client.mjs', import.meta.url)),
    js('/assets/home-views.mjs', new URL('./views.mjs', import.meta.url)),
    js('/assets/review-client.mjs', new URL('./review-client.mjs', import.meta.url)),
    js('/assets/review-views.mjs', new URL('./review-views.mjs', import.meta.url)),
    js('/assets/backlog-client.mjs', new URL('./backlog-client.mjs', import.meta.url)),
    js('/assets/backlog-views.mjs', new URL('./backlog-views.mjs', import.meta.url)),
    js('/assets/recurring-model.mjs', new URL('./recurring-model.mjs', import.meta.url)),
    js('/assets/fleet-client.mjs', new URL('./fleet-client.mjs', import.meta.url)),
    js('/assets/fleet-views.mjs', new URL('./fleet-views.mjs', import.meta.url)),
    js('/assets/decision-client.mjs', new URL('./decision-client.mjs', import.meta.url)),
    js('/assets/decision-views.mjs', new URL('./decision-views.mjs', import.meta.url)),
    js('/assets/walk-client.mjs', new URL('./walk-client.mjs', import.meta.url)),
    js('/assets/walk-views.mjs', new URL('./walk-views.mjs', import.meta.url)),
    js('/assets/change-client.mjs', new URL('./change-client.mjs', import.meta.url)),
    js('/assets/change-views.mjs', new URL('./change-views.mjs', import.meta.url)),
    js('/assets/media-client.mjs', new URL('./media-client.mjs', import.meta.url)),
    js('/assets/media-views.mjs', new URL('./media-views.mjs', import.meta.url)),
    js('/assets/daily-client.mjs', new URL('./daily-client.mjs', import.meta.url)),
    js('/assets/daily-views.mjs', new URL('./daily-views.mjs', import.meta.url)),
    js('/assets/learning-client.mjs', new URL('./learning-client.mjs', import.meta.url)),
    js('/assets/learning-views.mjs', new URL('./learning-views.mjs', import.meta.url)),
    js('/assets/run-client.mjs', new URL('./run-client.mjs', import.meta.url)),
    js('/assets/run-views.mjs', new URL('./run-views.mjs', import.meta.url)),
    js('/assets/connection-client.mjs', new URL('./connection-client.mjs', import.meta.url)),
    js('/assets/connection-views.mjs', new URL('./connection-views.mjs', import.meta.url)),
    js('/assets/job-client.mjs', new URL('./job-client.mjs', import.meta.url)),
    js('/assets/job-views.mjs', new URL('./job-views.mjs', import.meta.url)),
    { ...js('/assets/pwa-client.mjs', new URL('./pwa-client.mjs', import.meta.url)), strict: true },
    // A classic script (no imports), loaded blocking in <head> (phase 168).
    { ...js('/assets/theme.mjs', new URL('./theme.mjs', import.meta.url)), strict: true },
    { path: '/assets/plates-icon.svg', type: 'image/svg+xml', body: () => iconSvg(), strict: true },
    { path: '/assets/plates-icon-maskable.svg', type: 'image/svg+xml', body: () => iconSvg({ maskable: true }), strict: true },
    { path: '/assets/plates-icon-192.png', type: 'image/png', body: () => pngs[192], strict: true },
    { path: '/assets/plates-icon-512.png', type: 'image/png', body: () => pngs[512], strict: true },
    { path: '/assets/apple-touch-icon.png', type: 'image/png', body: () => pngs[180], strict: true },
  ];
  return sources.map(source => Object.hasOwn(overrides, source.path) ? { ...source, body: () => overrides[source.path] } : source);
}

// Imports inside a module: static `from '…'`/`import '…'` and dynamic
// `import('…')`, relative or absolute under /assets/.
const IMPORTS = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])((?:\.{1,2}\/|\/assets\/)[^'"\s]*)\2/g;
const QUOTED = /(["'])\/assets\/([A-Za-z0-9][A-Za-z0-9._-]*)\1/g;

function digestUrl(path, digest) {
  const dot = path.lastIndexOf('.');
  return `${path.slice(0, dot)}.${digest}${path.slice(dot)}`;
}

/** Build the table from explicit sources: [{ path, type, body: () => string|Buffer, strict? }]. */
export function buildAssetTable(sources) {
  const byPath = new Map(sources.map(source => [source.path, source]));
  if (byPath.size !== sources.length) throw new Error('asset table: duplicate logical path');
  const entries = new Map(), visiting = [];
  const target = (from, specifier) => {
    if (specifier.startsWith('../') || specifier.slice(2).includes('/') && specifier.startsWith('./')) throw new Error(`asset table: ${from} imports ${specifier}, outside /assets/`);
    const path = specifier.startsWith('./') ? `/assets/${specifier.slice(2)}` : specifier;
    if (!byPath.has(path)) throw new Error(`asset table: ${from} imports ${specifier}, which is not a served asset`);
    return path;
  };
  const build = path => {
    if (entries.has(path)) return entries.get(path);
    if (visiting.includes(path)) throw new Error(`asset table: import cycle ${[...visiting.slice(visiting.indexOf(path)), path].join(' -> ')}`);
    visiting.push(path);
    const source = byPath.get(path);
    let body = source.body();
    if (source.type === JS) body = body.replace(IMPORTS, (_, lead, quote, specifier) => `${lead}${quote}${build(target(path, specifier)).url}${quote}`);
    const digest = createHash('sha256').update(body).digest('hex').slice(0, 12);
    const entry = Object.freeze({ path, url: digestUrl(path, digest), digest, type: source.type, body, strict: source.strict === true });
    visiting.pop();
    entries.set(path, entry);
    return entry;
  };
  for (const source of sources) build(source.path);
  const byUrl = new Map([...entries.values()].map(entry => [entry.url, entry]));
  return Object.freeze({
    entries,
    url: path => { const entry = entries.get(path); if (!entry) throw new Error(`asset table: no asset ${path}`); return entry.url; },
    // { entry, immutable } for a logical or current digest path; 'stale' for a
    // digest URL naming a known asset with other bytes; null when not an asset.
    lookup(pathname) {
      if (byUrl.has(pathname)) return { entry: byUrl.get(pathname), immutable: true };
      if (entries.has(pathname)) return { entry: entries.get(pathname), immutable: false };
      const stale = DIGEST_URL.exec(pathname);
      return stale && entries.has(`/assets/${stale[1]}.${stale[3]}`) ? 'stale' : null;
    },
    // Pages: every quoted /assets/ reference to a known asset becomes its digest URL.
    rewrite: html => typeof html === 'string' ? html.replace(QUOTED, (match, quote, name) => entries.has(`/assets/${name}`) ? `${quote}${entries.get(`/assets/${name}`).url}${quote}` : match) : html,
  });
}

let table = null;
/** The process's table, built on first use. */
export function assetTable() { return table ??= buildAssetTable(defaultSources()); }
