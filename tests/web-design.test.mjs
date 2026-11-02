// Phase 167: the design layer. Tokens and components come from one CSS-only
// module, the shell stylesheet includes each layer once, the palette meets
// contrast in both themes, and markup changes only on purpose.
// Phase 168: the blue and white palette over a drawn wash, glass surfaces
// with solid fallbacks, and a theme applied before paint with no inline code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { homeView, projectView, signinView } from '../lib/web/views.mjs';
import { decisionView } from '../lib/web/decision-views.mjs';
import { changeIndexView } from '../lib/web/change-views.mjs';
import { changesHarness, token } from './helpers/web-changes.mjs';
// Only modules that exist before the design layer are imported statically, so
// each test loads at the phase's base and fails there by assertion.
import * as assets from '../lib/web/assets.mjs';
import { createPwa, SHELL } from '../lib/web/pwa.mjs';
import { THEME } from '../lib/web/pwa-icons.mjs';
import * as navigationClient from '../lib/web/navigation-client.mjs';

// ---- the design layer changes no page markup --------------------------------
// Representative pages rendered from fixed Acme inputs. The golden file was
// rendered from the views before the design layer existed (its own commit, on
// the phase's base), so any unintended markup change fails here. A phase
// that changes markup on purpose regenerates it with
// PLATES_WRITE_MARKUP_GOLDEN=1 and the diff shows in review (phase 168: the
// navigation's theme toggle).
const GOLDEN = new URL('./fixtures/web-design/markup.json', import.meta.url);
const access = { workspace: { id: 'acme', name: 'Acme workspace' }, userId: 1, projects: [{ id: 'studio', repo: 'acme/studio', name: 'Acme Studio' }], sourceRevision: 'a'.repeat(40), csrf: 'fake-csrf-acme' };
const project = { id: 'studio', repo: 'acme/studio', name: 'Acme Studio' };
const action = (id, kind) => ({ id, projectId: 'studio', projectName: 'Acme Studio', kind, title: `Acme ${kind} ${id}`, why: 'Source asks for an owner observation.', next: 'Read the current source.', link: 'https://github.com/acme/studio/blob/main/docs/phases/1.md', phase: '1', ready: true, details: { ask: 'Does publishing work?', why: 'A human uses the real surface.', look: 'Open the preview.', then: 'Record what happened.', takes: 'About five minutes', choices: ['Verified', 'Needs changes', 'Cannot check yet'] } });
function snapshot() {
  const decision = action('decision-one', 'decision'), walk = action('walk-one', 'walk'), waiting = action('wait-one', 'waiting');
  const change = { id: 'change-one', projectId: 'studio', projectName: 'Acme Studio', title: 'Publish from a phone', date: '2026-10-21', revision: 'b'.repeat(40), link: 'https://github.com/acme/studio/commit/abc', kind: 'commit', media: null, previewUrl: null, acceptance: 'not established' };
  return { schema: 1, cursor: 'a'.repeat(64), cursorState: 'initial', generatedAt: '2026-10-21T16:00:00.000Z', coverage: { state: 'complete', gaps: [] },
    projects: [{ id: 'studio', repoId: 100, repo: 'acme/studio', name: 'Acme Studio', tagline: 'Publishing, made reliable.', stack: ['node', 'web'], version: '0.8.32', revision: 'b'.repeat(40), readAt: '2026-10-21T15:59:00.000Z', state: 'complete', gaps: [], planning: { source: 'files', built: 8, total: 12, livedIn: 3, headline: 'Make publishing reliable on every screen', goals: [], next: 'Review publishing on a phone' }, decisions: [decision], walks: [walk], waiting: [waiting], changes: [change] }],
    decisions: [decision], walks: [walk], waiting: [waiting], changes: [change], quota: { remaining: 150, resetAt: '2026-10-21T17:00:00.000Z', state: 'known' } };
}
const decision = () => ({ schema: 1, project, source: { path: 'docs/reviews/2026-10-21.md', head: 'c'.repeat(40), blob: 'd'.repeat(40), branch: 'main', visibility: 'public', link: 'https://github.com/acme/studio/blob/main/docs/reviews/2026-10-21.md' }, target: { kind: 'shaping', path: 'docs/shaping/next.json', question: 'scope' },
  question: { title: 'Which Acme scope should we build?', body: 'The owner chooses.', choices: [], recommendation: { text: 'Build the broader scope.', evidence: ['docs/evidence/acme.md'], alternatives: ['Keep this release small.'] } } });
async function pages() {
  const h = changesHarness(), model = await h.changes.detail(h.access, token, h.project, 'acme-search');
  return {
    home: homeView(access, snapshot()),
    project: projectView(project, access, snapshot()),
    signin: signinView('fake-csrf-acme', '/projects/studio'),
    decision: decisionView(decision(), access),
    changes: changeIndexView({ ...model, items: [model.change] }, access),
  };
}

test('the design layer changes no page markup', async () => {
  const rendered = await pages();
  assert.deepEqual(await pages(), rendered, 'the representative pages render deterministically');
  if (process.env.PLATES_WRITE_MARKUP_GOLDEN === '1') writeFileSync(GOLDEN, `${JSON.stringify(rendered, null, 1)}\n`);
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(Object.keys(rendered), Object.keys(golden));
  for (const [name, html] of Object.entries(golden)) assert.equal(rendered[name], html, `${name} renders byte-identical markup`);
});

// ---- the shell stylesheet includes each layer once --------------------------
// Rules flattened with their at-rule context ("@media(...)|selector").
function rules(css, context = '') {
  const out = [], re = /([^{}]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  for (const [, head, body] of css.matchAll(re)) {
    const selector = head.trim();
    if (selector.startsWith('@')) out.push(...rules(body, context + selector));
    else out.push({ key: `${context}|${selector}`, context, selector, body });
  }
  return out;
}

test('the shell stylesheet includes each layer once', async () => {
  const table = assets.buildAssetTable(assets.defaultSources()), plates = table.entries.get('/assets/plates.css').body;
  const seen = new Map();
  for (const rule of rules(plates)) seen.set(rule.key, (seen.get(rule.key) ?? 0) + 1);
  assert.deepEqual([...seen].filter(([, count]) => count > 1), [], 'every selector appears once in its at-rule context');
  const design = await import('../lib/web/design.mjs').catch(() => null);
  assert.ok(design, 'lib/web/design.mjs exists'); assert.equal(typeof assets.shellLayers, 'function', 'assets.mjs names its shell layers');
  const { tokens, components } = design, shellLayers = assets.shellLayers;
  const layers = shellLayers().filter(([, css]) => css.length);
  assert.deepEqual(layers.slice(0, 2).map(([name]) => name), ['tokens', 'components'], 'tokens, then components, then the shell');
  assert.equal(layers[0][1], tokens); assert.equal(layers[1][1], components);
  assert.equal(plates, shellLayers().map(([, css]) => css).join(''), 'plates.css is exactly its layers');
  for (const [name, css] of layers) {
    assert.equal(plates.split(css).length - 1, 1, `${name} appears once in plates.css`);
    for (const [path, entry] of table.entries) if (entry.type.startsWith('text/css') && !['/assets/plates.css', '/assets/keel.css'].includes(path)) assert.ok(!entry.body.includes(css), `${name} is not repeated in ${path}`);
  }
  // Components are defined but adopted by no view yet: every selector is a .p- class.
  for (const rule of rules(components)) for (const part of rule.selector.split(',')) assert.match(part.trim(), /^(?:[a-z]+)?\.p-[a-z]/, `${part} only matches opted-in markup`);
  // CSS only: no browser module imports the design layer, and it is not served.
  for (const [path, entry] of table.entries) {
    assert.ok(!/design\.[0-9a-f]{12}\.mjs|design\.mjs/.test(entry.type.startsWith('text/javascript') ? entry.body : ''), `${path} does not import design.mjs`);
    assert.ok(!path.includes('design'), `${path} is not the design module`);
  }
  assert.doesNotMatch(readFileSync(new URL('../lib/web/views.mjs', import.meta.url), 'utf8'), /design\.mjs/, 'views.mjs ships to the browser and must not import design.mjs');
  assert.doesNotMatch(plates, /@font-face|@import|url\(\s*["']?(?:https?:)?\/\//, 'everything stays on self');
});

// ---- tokens meet contrast over the wash in both themes ----------------------
// sRGB colours as [r, g, b, a] in 0..1, from hex or oklch.
function parseColor(value) {
  const text = value.trim();
  let hex = /^#([0-9a-f]{3,8})$/i.exec(text)?.[1];
  if (hex) {
    if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
    const bytes = hex.match(/../g).map(byte => parseInt(byte, 16) / 255);
    return [bytes[0], bytes[1], bytes[2], bytes[3] ?? 1];
  }
  const oklch = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/i.exec(text);
  if (!oklch) throw new Error(`unsupported colour ${text}`);
  const L = Number(oklch[1]) / (oklch[2] ? 100 : 1), C = Number(oklch[3]), h = Number(oklch[4]) * Math.PI / 180;
  const alpha = oklch[5] === undefined ? 1 : Number(oklch[5]) / (oklch[6] ? 100 : 1);
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const linear = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  const encode = c => { const v = Math.min(1, Math.max(0, c)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; };
  return [...linear.map(encode), alpha];
}
const over = (top, bottom) => { const a = top[3] + bottom[3] * (1 - top[3]); return [0, 1, 2].map(i => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a); };
const luminance = ([r, g, b]) => [r, g, b].map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (x, y) => { const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };

// The served shell stylesheet: its light :root block, and the dark one layered
// over it. Dark is written twice with the same body: under the dark media
// query unless light is chosen, and for an explicit dark choice (phase 168).
const served = () => assets.buildAssetTable(assets.defaultSources()).entries.get('/assets/plates.css').body;
const declarations = body => Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):([^;]+)/g)].map(([, name, value]) => [name, value.trim()]));
const resolver = theme => { const value = name => { const raw = theme[name]; assert.ok(raw, `--${name} is defined`); const ref = /^var\(--([a-z0-9-]+)\)$/.exec(raw); return ref ? value(ref[1]) : raw; }; return value; };
function themeTokens(css = served()) {
  const all = rules(css).filter(rule => rule.selector.startsWith(':root'));
  const light = all.filter(rule => rule.context === '' && rule.selector === ':root');
  const system = all.filter(rule => rule.context === '@media(prefers-color-scheme:dark)' && rule.selector === ':root:not([data-theme=light])');
  const chosen = all.filter(rule => rule.context === '' && rule.selector === ':root[data-theme=dark]');
  assert.equal(light.length, 1, 'one light :root token block');
  assert.equal(system.length, 1, 'one dark block for the system'); assert.equal(chosen.length, 1, 'one dark block for a chosen dark theme');
  assert.equal(system[0].body, chosen[0].body, 'the system and chosen dark themes are the same palette');
  const lightTokens = declarations(light[0].body);
  return { light: lightTokens, dark: { ...lightTokens, ...declarations(chosen[0].body) } };
}
function themes(css = served()) {
  const { light, dark } = themeTokens(css);
  return { light: resolver(light), dark: resolver(dark) };
}

test('tokens meet contrast over the wash in both themes', () => {
  const failures = [];
  for (const [themeName, token] of Object.entries(themes())) {
    const color = name => parseColor(token(name));
    const paper = color('paper');
    assert.equal(paper[3], 1, `${themeName} paper is opaque`);
    // Everything sits on paper or on paper under a wash stop.
    const grounds = [['paper', paper], ...['wash-1', 'wash-2', 'wash-3'].map(stop => [`paper+${stop}`, over(color(stop), paper)])];
    const on = name => grounds.map(([ground, rgb]) => [name === 'paper' ? ground : `${name} over ${ground}`, name === 'paper' ? rgb : over(color(name), rgb)]);
    const check = (fg, surfaces, minimum) => {
      for (const surface of surfaces) for (const [label, bg] of on(surface)) {
        const ratio = contrast(over(color(fg), bg), bg);
        if (ratio < minimum) failures.push(`${themeName}: --${fg} on ${label} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`);
      }
    };
    const textSurfaces = ['paper', 'surface', 'surface-raised', 'surface-solid', 'field'];
    for (const text of ['ink', 'muted', 'action', 'green', 'danger', 'ok']) check(text, textSurfaces, 4.5);
    for (const edge of ['line-strong', 'ring']) check(edge, ['field', 'surface'], 3);
    // Button text sits on the solid action colour (and on danger).
    for (const fill of ['action', 'danger']) {
      const ratio = contrast(color('on-action'), color(fill));
      if (color(fill)[3] !== 1 || ratio < 4.5) failures.push(`${themeName}: --on-action on --${fill} is ${ratio.toFixed(2)}:1, needs 4.5:1 on a solid fill`);
    }
    // Text is never translucent; only surfaces are.
    for (const text of ['ink', 'muted', 'action', 'on-action', 'danger', 'ok']) if (color(text)[3] !== 1) failures.push(`${themeName}: --${text} is translucent`);
    assert.equal(token('green'), token('action')); assert.equal(token('card'), token('surface'));
  }
  // Phase 167 held two light pairs short over the wash until it was drawn.
  // The wash is drawn now (body::before), and nothing is held.
  assert.match(served(), /body::before\{[^}]*var\(--wash-1\)[^}]*var\(--wash-2\)[^}]*var\(--wash-3\)/, 'the wash is drawn behind every page');
  assert.deepEqual(failures, []);
});

test('the old names resolve to the new palette', () => {
  const { light, dark } = themes();
  for (const theme of [light, dark]) {
    assert.equal(theme('green'), theme('action')); assert.equal(theme('card'), theme('surface'));
    assert.equal(theme('ring'), theme('accent'), 'the ring is the family amber');
    assert.match(theme('action'), /^oklch\(0\.\d+ 0\.\d+ 2[56]\d\)$/, 'action is cobalt');
  }
  assert.notEqual(light('ink'), '#183632'); assert.notEqual(dark('paper'), '#171e19');
  // theme-color and the icons want literal colours: THEME mirrors the tokens.
  const hex = value => `#${parseColor(value).slice(0, 3).map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
  assert.deepEqual({ ...THEME }, { action: hex(light('action')), paper: hex(light('paper')), darkPaper: hex(dark('paper')) });
});

// ---- the theme applies before paint without inline code --------------------
// Pages as served: the server decorates every HTML response and rewrites its
// asset references to digest URLs (server.mjs).
async function servedPages() {
  const pwa = createPwa(), rendered = await pages();
  const decorated = Object.fromEntries(Object.entries(rendered).map(([name, html]) => [name, pwa.assets.rewrite(pwa.decorate(html))]));
  return { pwa, pages: { ...decorated, offline: pwa.asset('/offline').body } };
}
const metaPair = () => [['(prefers-color-scheme: light)', THEME.paper], ['(prefers-color-scheme: dark)', THEME.darkPaper]]
  .map(([media, content]) => ({ attrs: { media, content }, getAttribute(key) { return this.attrs[key] ?? null; }, setAttribute(key, value) { this.attrs[key] = value; } }));

test('the theme applies before paint without inline code', async () => {
  const { pwa, pages: served } = await servedPages(), entry = pwa.assets.entries.get('/assets/theme.mjs');
  assert.ok(entry, 'theme.mjs is a served asset');
  for (const [name, html] of Object.entries(served)) {
    for (const [, attributes] of html.matchAll(/<script\b([^>]*)>/g)) assert.match(attributes, /\ssrc="\/assets\//, `${name}: every script is a same-origin file`);
    assert.doesNotMatch(html, /<style\b/i, `${name}: no style element`);
    assert.doesNotMatch(html, /<[a-z][^>]*\sstyle\s*=/i, `${name}: no style attribute`);
    assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i, `${name}: no inline event handler`);
    const head = html.slice(0, html.indexOf('</head>')), theme = head.indexOf(`<script src="${entry.url}"></script>`), sheet = head.indexOf('<link rel="stylesheet"');
    assert.ok(theme >= 0, `${name}: the theme script is a plain script in <head>`);
    assert.ok(sheet > theme, `${name}: the theme script comes before the first stylesheet`);
    assert.equal(html.split('/assets/theme.').length - 1, 1, `${name}: the theme script loads once`);
    assert.ok(head.includes(`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME.paper}"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME.darkPaper}">`), `${name}: one theme-color per scheme`);
  }
  // A classic blocking script, served by digest URL and precached by the worker.
  assert.match(entry.type, /^text\/javascript/);
  assert.doesNotMatch(entry.body, /^\s*(?:import|export)\b/m, 'theme.mjs is a classic script, not a module');
  assert.ok(SHELL.includes('/assets/theme.mjs') && pwa.shell.includes(entry.url), 'the worker precaches theme.mjs');
  // It applies a stored light or dark choice; system and blocked storage leave <html> to the media query.
  const run = stored => {
    const attributes = {}, listeners = {}, metas = metaPair();
    const document = { documentElement: { setAttribute: (key, value) => { attributes[key] = value; }, getAttribute: key => attributes[key] ?? null }, addEventListener: (type, fn) => { listeners[type] = fn; }, querySelectorAll: () => metas };
    const localStorage = { getItem: key => { if (stored instanceof Error) throw stored; return key === 'plates-theme' ? stored : null; } };
    runInNewContext(entry.body, { window: { localStorage }, document });
    listeners.DOMContentLoaded?.();
    return { theme: attributes['data-theme'] ?? null, metas: metas.map(meta => meta.attrs.content) };
  };
  assert.deepEqual(run('dark'), { theme: 'dark', metas: [THEME.darkPaper, THEME.darkPaper] });
  assert.deepEqual(run('light'), { theme: 'light', metas: [THEME.paper, THEME.paper] });
  for (const stored of [null, 'system', 'sepia', new Error('storage blocked')]) assert.deepEqual(run(stored), { theme: null, metas: [THEME.paper, THEME.darkPaper] }, String(stored));
  // The toggle: a real button in the navigation, labelled with its state, wired by the navigation client.
  const button = /<button type="button"[^>]*data-theme-toggle[^>]*>[^<]+<\/button>/.exec(served.home)?.[0];
  assert.ok(button, 'the navigation carries the theme toggle'); assert.match(button, /aria-label="Theme: System\. Switch to Light"/);
  assert.equal(typeof navigationClient.startThemeToggle, 'function', 'the navigation client wires the toggle');
  const store = new Map(), attrs = {}, handlers = {}, metas = metaPair();
  const control = { dataset: {}, textContent: 'System', attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, addEventListener: (type, fn) => { handlers[type] = fn; }, removeEventListener() {} };
  const document = { documentElement: { setAttribute: (key, value) => { attrs[key] = value; }, removeAttribute: key => { delete attrs[key]; } }, querySelectorAll: () => metas };
  const window = { localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) } };
  navigationClient.startThemeToggle({ document, window, button: control });
  const seen = [];
  for (let i = 0; i < 3; i++) { handlers.click(); seen.push([control.textContent, attrs['data-theme'] ?? null, store.get('plates-theme') ?? null, control.attrs['aria-label'], metas.map(meta => meta.attrs.content).join(' ')]); }
  assert.deepEqual(seen, [
    ['Light', 'light', 'light', 'Theme: Light. Switch to Dark', `${THEME.paper} ${THEME.paper}`],
    ['Dark', 'dark', 'dark', 'Theme: Dark. Switch to System', `${THEME.darkPaper} ${THEME.darkPaper}`],
    ['System', null, null, 'Theme: System. Switch to Light', `${THEME.paper} ${THEME.darkPaper}`],
  ]);
});

// ---- glass falls back to solid surfaces --------------------------------------
const SYSTEM_COLOURS = /^(?:Canvas|CanvasText|Field|FieldText|LinkText|Highlight|HighlightText|ButtonFace|ButtonText)$/;
test('glass falls back to solid surfaces', () => {
  const css = served(), { light, dark } = themeTokens(css), all = rules(css);
  const override = (label, matches) => {
    const found = all.filter(rule => matches(rule.context) && rule.selector === ':root');
    assert.equal(found.length, 1, `${label}: one :root override`);
    return declarations(found[0].body);
  };
  const fallbacks = {
    'no backdrop-filter': override('no backdrop-filter', context => /^@supports not \(\(backdrop-filter:blur\(1px\)\) or \(-webkit-backdrop-filter:blur\(1px\)\)\)$/.test(context)),
    'reduced transparency': override('reduced transparency', context => context === '@media(prefers-reduced-transparency:reduce)'),
    'forced colours': override('forced colours', context => context === '@media(forced-colors:active)'),
  };
  // Surfaces are glass by default, so each fallback has work to do.
  for (const theme of [light, dark]) assert.ok(parseColor(resolver(theme)('surface'))[3] < 0.97, 'surfaces are translucent by default');
  for (const [name, overrides] of Object.entries(fallbacks)) for (const [themeName, theme] of Object.entries({ light, dark })) {
    const token = resolver({ ...theme, ...overrides });
    for (const surface of ['surface', 'surface-raised', 'surface-solid', 'field', 'card']) {
      const value = token(surface), alpha = SYSTEM_COLOURS.test(value) ? 1 : parseColor(value)[3];
      assert.ok(name === 'no backdrop-filter' ? alpha >= 0.97 : alpha === 1, `${name}, ${themeName}: --${surface} is opaque (${value})`);
    }
    if (name !== 'no backdrop-filter') assert.equal(token('glass-filter'), 'none', `${name}: no blur`);
  }
  const forced = fallbacks['forced colours'];
  assert.equal(forced.ink, 'CanvasText'); assert.equal(forced.surface, 'Canvas');
  for (const shadow of ['glass-shadow', 'glass-highlight']) assert.equal(forced[shadow], 'transparent', `forced colours: --${shadow} drops the shadows`);
  // The wash goes flat with reduced transparency and away with forced colours.
  assert.ok(all.some(rule => rule.context === '@media(prefers-reduced-transparency:reduce)' && rule.selector === 'body::before' && /background-image:none/.test(rule.body)), 'reduced transparency: a flat wash');
  assert.ok(all.some(rule => rule.context === '@media(forced-colors:active)' && rule.selector === 'body::before' && /display:none/.test(rule.body)), 'forced colours: no wash');
  // Glass reaches the shell only through tokens.
  for (const selector of ['header', '.panel']) assert.ok(all.some(rule => rule.context === '' && rule.selector === selector && /background:var\(--surface\)/.test(rule.body) && /backdrop-filter:var\(--glass-filter\)/.test(rule.body)), `${selector} is glass`);
});
