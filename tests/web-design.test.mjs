// Phase 167: the design layer. Tokens and components come from one CSS-only
// module, the shell stylesheet includes each layer once, the palette meets
// contrast in both themes, and markup changes only on purpose.
// Phase 168: the blue and white palette over a drawn wash, glass surfaces
// with solid fallbacks, and a theme applied before paint with no inline code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { homeLoadingStyles } from '../lib/web/home-loading.mjs';
import { homeView } from '../lib/web/views.mjs';
import { recoveryView } from '../lib/web/recovery-view.mjs';
import { tokens as designTokens } from '../lib/web/design.mjs';
// Phase 171 reads design.controls through the namespace, so this file still
// loads (and fails by assertion) where the export does not exist yet.
import * as designLayer from '../lib/web/design.mjs';
// The page set and its Acme inputs, shared with the look capture (phase 172).
import { access, snapshot, pages } from './helpers/web-design-pages.mjs';
import { run } from './helpers/run.mjs';
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
// navigation's theme toggle, then its walk fix: the toggle and Sign out move
// to the page footer; phase 166: home and a plate's page are the four
// sections, and the Start panel says "N need you", Needs you's count).
const GOLDEN = new URL('./fixtures/web-design/markup.json', import.meta.url);

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
    // Phase 170: recovery.css inlines the tokens on purpose; it stands alone.
    for (const [path, entry] of table.entries) if (entry.type.startsWith('text/css') && !['/assets/plates.css', '/assets/keel.css'].includes(path) && !(name === 'tokens' && path === '/assets/recovery.css')) assert.ok(!entry.body.includes(css), `${name} is not repeated in ${path}`);
  }
  // Components match opted-in markup (a .p- class), or are phase 171's
  // control base and its named variants, all inside :where() so any page
  // rule outranks them.
  for (const rule of rules(components)) for (const part of rule.selector.split(/,(?![^()]*\))/)) assert.match(part.trim(), /^(?:(?:[a-z]+)?\.p-[a-z]|:where\()/, `${part} only matches opted-in markup or is a zero-specificity base`);
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
    // Phase 169: Home's state tints. Warning text reads on the page and on its
    // own tint; every tint carries ink and muted text.
    check('warn', [...textSurfaces, 'warn-tint'], 4.5);
    for (const text of ['ink', 'muted']) check(text, ['warn-tint', 'ok-tint', 'sunken'], 4.5);
    for (const tint of ['warn-tint', 'ok-tint', 'sunken']) if (color(tint)[3] !== 1) failures.push(`${themeName}: --${tint} is translucent`);
    // Phase 170: a solid dialog stands 3:1 off the scrimmed page, by its fill
    // or by its --line-strong edge.
    const dimmed = over(color('scrim'), paper), dialog = color('surface-solid');
    const standOff = Math.max(contrast(dialog, dimmed), contrast(over(color('line-strong'), dialog), dimmed));
    if (dialog[3] !== 1 || standOff < 3) failures.push(`${themeName}: a dialog stands ${standOff.toFixed(2)}:1 off --scrim, needs 3:1`);
    // Button text sits on the solid action colour (and on danger).
    for (const fill of ['action', 'danger']) {
      const ratio = contrast(color('on-action'), color(fill));
      if (color(fill)[3] !== 1 || ratio < 4.5) failures.push(`${themeName}: --on-action on --${fill} is ${ratio.toFixed(2)}:1, needs 4.5:1 on a solid fill`);
    }
    // Text is never translucent; only surfaces are.
    for (const text of ['ink', 'muted', 'action', 'on-action', 'danger', 'ok', 'warn']) if (color(text)[3] !== 1) failures.push(`${themeName}: --${text} is translucent`);
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

// ---- the phone header is one row ---------------------------------------------
// Phase 168 walk: brand and navigation share one row, and the theme toggle and
// Sign out sit in a quiet page footer instead of the header.
test('the phone header is one row and the theme toggle sits in the footer', async () => {
  const rendered = await pages();
  for (const name of ['home', 'project', 'decision']) {
    const html = rendered[name], header = /<header\b[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';
    assert.ok(header.includes('data-navigation'), `${name}: renders the navigation header`);
    assert.doesNotMatch(header, /data-theme-toggle/, `${name}: the theme toggle is not in the header`);
    const footers = [...html.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/g)].map(([footer]) => footer).filter(footer => footer.includes('data-theme-toggle'));
    assert.equal(footers.length, 1, `${name}: one footer carries the theme toggle`);
    assert.match(footers[0], /<button type="button"[^>]*data-theme-toggle[^>]*aria-label="Theme: System\. Switch to Light"[^>]*>System<\/button>/, `${name}: the same toggle button`);
    assert.match(footers[0], /action="\/api\/auth\/logout"/, `${name}: Sign out sits in the footer`);
  }
  const all = rules(assets.shellLayers().map(([, css]) => css).join(''));
  const phone = selector => all.filter(rule => rule.context === '@media(max-width:700px)' && rule.selector === selector).map(rule => rule.body).join(';');
  assert.match(phone('.plates-navigation .brand span'), /display:none/, 'under 700px the brand has no tagline');
  assert.match(phone('header.plates-navigation'), /flex-wrap:nowrap/, 'under 700px brand and strip stay on one row');
  assert.match(phone('.plates-navigation nav'), /flex-wrap:nowrap/, 'the strip does not wrap');
  assert.match(phone('.plates-navigation nav'), /overflow-x:auto/, 'the strip scrolls on its own');
  assert.doesNotMatch(phone('.plates-navigation nav'), /flex:1 1 100%|flex-basis:100%/, 'the strip does not take a row of its own');
  for (const rule of all.filter(rule => /^header\.plates-navigation$/.test(rule.selector))) assert.doesNotMatch(rule.body, /flex-wrap:wrap/, `${rule.context || 'base'}: brand and nav never wrap apart`);
  for (const selector of ['.plates-navigation nav>a,.plates-navigation summary']) assert.match(phone(selector), /min-height:(?:4[0-9])px/, 'phone pills keep a 40px touch target');
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

// ---- home uses only tokens ----------------------------------------------------
// Phase 169: Home, the project page and the shell styles in views.mjs take
// every colour from the design layer. No hex, rgb(a), hsl(a), oklch or other
// colour function in the source, and no named colour in a CSS value.
const NAMED_COLOURS = new Set('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' '));
// Colour literals in source text (hex, colour functions) and named colours
// read from the CSS values it ships (phase 169; phase 170 reuses it).
const declarationsOf = rule => [...rule.body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:([^;]*)/g)].map(([, property, value]) => [property, value.trim()]);
function colourLiterals(source, css = source) {
  const found = [];
  for (const [literal] of source.matchAll(/(?<![&\w-])#[0-9a-f]{3,8}(?![\w-])/gi)) found.push(literal);
  for (const [literal] of source.matchAll(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/gi)) found.push(literal);
  for (const rule of rules(css)) for (const [property, value] of declarationsOf(rule)) {
    for (const word of value.toLowerCase().replace(/--[a-z0-9-]+/g, '').match(/[a-z][a-z-]*/g) ?? []) if (NAMED_COLOURS.has(word)) found.push(`${rule.selector}{${property}:${value}}`);
  }
  return found;
}
test('home uses only tokens', async () => {
  const source = readFileSync(new URL('../lib/web/views.mjs', import.meta.url), 'utf8');
  const { styles } = await import('../lib/web/views.mjs');
  assert.deepEqual(colourLiterals(source, styles), [], 'views.mjs takes every colour from a token');
  // Home's long lists opt into the design layer's solid card; the blur is capped.
  const home = homeView(access, snapshot());
  // Phase 166: the four sections' rows, plate chips and verbs.
  for (const card of ['need', 'since-plate', 'plate-chip']) assert.match(home, new RegExp(`class="${card}\\b[^"]*\\bp-card\\b`), `${card} is a .p-card`);
  assert.match(home, /class="verb p-badge/, 'each row\'s verb is a .p-badge');
  assert.equal(home.match(/<(?:input|select)\b[^>]*\sclass="p-field"/g)?.length, 2, 'toolbar fields are .p-field');
  const { components } = await import('../lib/web/design.mjs');
  const card = rules(components).find(rule => rule.selector === '.p-card');
  assert.match(card.body, /background:var\(--surface-solid\)/, '.p-card is solid'); assert.doesNotMatch(card.body, /backdrop-filter/, '.p-card never blurs');
  for (const rule of rules(styles)) if (/attention-card|\.need\b|since-plate|plate-chip|\.cards li/.test(rule.selector)) assert.doesNotMatch(rule.body, /backdrop-filter/, `${rule.selector} does not blur`);
});

// ---- page stylesheets hold layout only ---------------------------------------
// Phase 170: every per-page sheet keeps layout only. Colours, backgrounds,
// radii and shadows come from the design layer, so no colour literal and no
// background, radius or box-shadow value other than a token (or none, 0,
// transparent, inherit). plates.css is the design layer and the shell; the
// recovery sheet's inlined token block is the design layer too.
const PAINT = /^(?:background(?:-color|-image)?|border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius|box-shadow)$/;
const PAINT_VALUE = /^(?:var\(--[a-z0-9-]+\)|none|transparent|inherit|0)$/;
function paintLiterals(css) {
  const found = colourLiterals(css);
  for (const rule of rules(css)) for (const [property, value] of declarationsOf(rule)) if (PAINT.test(property) && !PAINT_VALUE.test(value)) found.push(`${rule.selector}{${property}:${value}}`);
  return found;
}

test('page stylesheets hold layout only', () => {
  const table = assets.buildAssetTable(assets.defaultSources()), sheets = new Map();
  for (const [path, entry] of table.entries) {
    if (!entry.type.startsWith('text/css') || ['/assets/plates.css', '/assets/keel.css'].includes(path)) continue;
    if (path === '/assets/recovery.css') {
      // Phase 171: then the control base, which is the design layer too.
      const design = designTokens + (designLayer.controls ?? '');
      assert.ok(entry.body.startsWith(design), 'recovery.css opens with the design tokens and controls');
      sheets.set(path, entry.body.slice(design.length));
    } else sheets.set(path, entry.body);
  }
  // Page styles that ship inside plates.css (the journal, capabilities).
  for (const [name, css] of assets.shellLayers()) if (!['tokens', 'components', 'shell', 'navigation'].includes(name)) sheets.set(`plates.css ${name} layer`, css);
  for (const page of ['run', 'daily', 'fleet', 'job', 'connection', 'model', 'walk', 'decision', 'night', 'recovery']) assert.ok(sheets.get(`/assets/${page}.css`)?.length, `${page}.css is served`);
  assert.ok(sheets.get('plates.css journal layer')?.length, 'the journal styles are scanned');
  const failures = [...sheets].flatMap(([path, css]) => paintLiterals(css).map(literal => `${path}: ${literal}`));
  assert.deepEqual(failures, [], 'page stylesheets take every colour, background, radius and shadow from a token');
  // The journal cards match Home: the 14px radius and the solid card.
  const journal = rules(sheets.get('plates.css journal layer')).find(rule => rule.selector === '.journal-card');
  assert.match(journal.body, /border-radius:var\(--r\)/); assert.match(journal.body, /background:var\(--surface-solid\)/);
});

// ---- controls are styled once ----------------------------------------------
// Phase 171: inputs, selects, textareas and buttons take their look from the
// design layer alone. Every other served sheet may place a control (width,
// margin, grid, flex) but may not restate its font, colour, background,
// border, radius, padding or minimum height. Before this phase 45 such rules
// sat in 12 sheets and plates.css layers.
const CONTROL = /(?:^|[\s>+~(,])(?:input|select|textarea|button)(?![\w-])|\.button(?![\w-])/;
const LOOK = /^(?:font(?:-[a-z]+)?|color|background(?:-[a-z]+)?|border(?:-[a-z]+)*|padding(?:-[a-z]+)?|min-height)$/;
// Every served stylesheet with the design layer cut out: plates.css by its
// layers, recovery.css after its inlined tokens and control base.
function pageSheets() {
  const table = assets.buildAssetTable(assets.defaultSources()), sheets = new Map(), inlined = designTokens + (designLayer.controls ?? '');
  for (const [path, entry] of table.entries) {
    if (!entry.type.startsWith('text/css')) continue;
    if (['/assets/plates.css', '/assets/keel.css'].includes(path)) {
      assert.equal(entry.body, assets.shellLayers().map(([, css]) => css).join(''), `${path} is exactly its layers`);
      if (path === '/assets/plates.css') for (const [name, css] of assets.shellLayers()) if (!['tokens', 'components'].includes(name)) sheets.set(`plates.css ${name} layer`, css);
    } else sheets.set(path, path === '/assets/recovery.css' && entry.body.startsWith(inlined) ? entry.body.slice(inlined.length) : entry.body);
  }
  return sheets;
}
test('controls are styled once', () => {
  const sheets = pageSheets(), found = [];
  for (const page of ['shell', 'navigation', 'journal']) assert.ok(sheets.get(`plates.css ${page} layer`)?.length, `the ${page} layer is scanned`);
  for (const page of ['run', 'daily', 'fleet', 'job', 'connection', 'model', 'walk', 'decision', 'night', 'recovery']) assert.ok(sheets.get(`/assets/${page}.css`)?.length, `${page}.css is scanned`);
  for (const [path, css] of sheets) for (const rule of rules(css)) {
    if (!rule.selector.split(',').some(part => CONTROL.test(part.trim()))) continue;
    for (const [property] of declarationsOf(rule)) if (LOOK.test(property)) found.push(`${path}: ${rule.context}|${rule.selector}{${property}}`);
  }
  assert.deepEqual(found, [], 'outside design.mjs no rule restates a control\'s look');
  // The design layer carries the look: bare controls at zero specificity, the
  // select caret drawn without a data: image, and recovery gets the same base.
  const { components, controls } = designLayer, all = rules(components);
  assert.equal(typeof controls, 'string', 'design.mjs exports the control base'); assert.ok(components.includes(controls), 'components include the control base');
  const base = selector => all.find(rule => rule.selector.startsWith(':where(') && rule.selector.includes(selector));
  for (const selector of ['input', 'select', 'textarea', '.p-field']) assert.match(base(selector)?.body ?? '', /min-height:44px/, `${selector} gets the field look`);
  assert.match(base('input').body, /font-size:var\(--t-md\)/, 'fields are 16px, so a phone never zooms');
  for (const selector of ['button', '.button', '.p-button']) assert.match(base(selector)?.body ?? '', /min-height:44px/, `${selector} gets the button look`);
  const caret = all.find(rule => /^:where\(select:not\(\[multiple\],\[size\]\)\)$/.test(rule.selector));
  assert.match(caret?.body ?? '', /appearance:none/); assert.match(caret.body, /linear-gradient\(45deg,transparent 50%,currentColor 50%\)/, 'the caret is a currentColor gradient');
  assert.doesNotMatch(assets.shellLayers().map(([, css]) => css).join(''), /html body select/, 'the interim chevron rule is folded in');
  assert.ok(assets.buildAssetTable(assets.defaultSources()).entries.get('/assets/recovery.css').body.includes(controls), 'recovery.css inlines the control base');
  // Every variant still clears a touch target: 40px, 44px for the primary.
  for (const rule of all) for (const [, px] of rule.body.matchAll(/min-height:(\d+)px/g)) assert.ok(Number(px) >= 40 || /textarea/.test(rule.selector), `${rule.selector} keeps a 40px target`);
  // Leftovers from 170: the backdrop is the scrim, no 8px corner in the shell.
  assert.match(all.find(rule => rule.selector === '.p-dialog::backdrop').body, /background:var\(--scrim\)/);
  for (const name of ['shell', 'navigation']) assert.doesNotMatch(sheets.get(`plates.css ${name} layer`), /radius:8px/, `${name} corners take a token`);
});

// ---- the design layer does not grow the stylesheets --------------------------
// Phase 171: the bytes of every served stylesheet (plates.css and keel.css
// each count) at origin/main 54d67ac0, before controls moved into the design
// layer. Measured with the same sum; after this phase the total is 79063.
// Phase 178: a page added since has its own sheet and its own cap, counted
// apart, so the bound above still holds every sheet it was measured over.
// The backlog's cap rose by 300 bytes for its question rows (phase 178's owner questions),
// by 100 for Recurring's rows, which share its sheet (phase 185), and by 300 for
// By goal's toggle, nested members and "more" (phase 179). The review session's
// peek and running total (phase 180) are their own sheet, beside review.css.
const CSS_BYTES_BEFORE_171 = 81780, PAGE_SHEETS_SINCE = { '/assets/backlog.css': 3300, '/assets/review-session.css': 450 };
test('the design layer keeps its budget with a bounded Home loading addition', () => {
  const table = assets.buildAssetTable(assets.defaultSources());
  const css = [...table.entries].filter(([, entry]) => entry.type.startsWith('text/css'));
  const total = css.filter(([path]) => !Object.hasOwn(PAGE_SHEETS_SINCE, path)).reduce((sum, [, entry]) => sum + Buffer.byteLength(entry.body), 0);
  // Loading is new UI, shipped in plates.css and its keel.css alias. Keep the
  // historical layer budget and cap this addition separately (2026-11-06).
  const loadingBytes = Buffer.byteLength(homeLoadingStyles);
  assert.ok(loadingBytes <= 700, 'Home loading adds at most 700 bytes per shell stylesheet');
  assert.ok(total - 2 * loadingBytes < CSS_BYTES_BEFORE_171, `CSS excluding the bounded loading addition is ${total - 2 * loadingBytes} bytes, under ${CSS_BYTES_BEFORE_171}`);
  for (const [path, cap] of Object.entries(PAGE_SHEETS_SINCE)) {
    const size = Buffer.byteLength(table.entries.get(path)?.body ?? '');
    assert.ok(size > 0 && size <= cap, `${path} is ${size} bytes, within its ${cap}`);
  }
});

// ---- phone toolbars fit ------------------------------------------------------
// Phase 171: at 390px the Home "Show" select sat in a fixed 120px column and
// clipped "Everything"; the fleet comparison's header row lost to .fleet-row
// and ran its labels together. The select column now fits its content, and
// the header hides on a phone, where each row carries its own labels.
test('phone toolbars fit their controls', () => {
  const sheets = pageSheets(), shell = rules(sheets.get('plates.css shell layer')), fleet = rules(sheets.get('/assets/fleet.css'));
  const narrow = shell.filter(rule => rule.context === '@media(max-width:400px)' && rule.selector === '.home-toolbar').map(rule => rule.body).join(';');
  assert.match(narrow, /grid-template-columns:minmax\(0,1fr\) auto/, 'the select column fits its content');
  for (const rule of shell.filter(rule => /home-toolbar/.test(rule.selector))) assert.doesNotMatch(rule.body, /grid-template-columns:[^;]*\d+px\)?$|grid-template-columns:[^;]* \d+px/, `${rule.selector} has no fixed select column`);
  const phone = fleet.filter(rule => rule.context === '@media(max-width:800px)');
  const head = phone.findIndex(rule => /\.fleet-table-head/.test(rule.selector) && /display:none/.test(rule.body)), row = phone.findIndex(rule => rule.selector === '.fleet-row');
  assert.ok(head >= 0, 'the comparison header hides on a phone');
  const specificity = selector => (selector.match(/\.[\w-]+/g) ?? []).length;
  assert.ok(specificity(phone[head].selector) > specificity(phone[row].selector) || head > row, 'and .fleet-row does not show it again');
  assert.ok(fleet.some(rule => rule.context === '@media(max-width:800px)' && rule.selector === '.fleet-mobile-label' && /display:block/.test(rule.body)), 'each row labels its own facts');
});

// ---- recovery stands alone ------------------------------------------------------
// Phase 170: recovery is the page shown when the app is broken. It links only
// its own sheet, which inlines the tokens at build time, so it renders when
// plates.css is missing. No theme script: the system scheme decides.
test('recovery stands alone', () => {
  const pwa = createPwa(), model = { recovery: { state: 'quarantined', startedAt: '2026-10-21T16:00:00.000Z', reconciledAt: null, epoch: 'acme-epoch' }, revision: { value: 'a'.repeat(40) }, cliVersion: '0.8.35', nodeVersion: 'v22.0.0', observedAt: '2026-10-21T16:00:00.000Z' };
  const html = pwa.assets.rewrite(pwa.decorate(recoveryView(model, { csrf: 'fake-csrf-acme' })));
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(([, href]) => href);
  assert.deepEqual(sheets, [pwa.assets.url('/assets/recovery.css')], 'recovery links only its own sheet');
  assert.doesNotMatch(html, /\/assets\/(?:plates|keel)\./, 'recovery does not link plates.css');
  assert.doesNotMatch(html, /<script/, 'recovery runs no script');
  const css = pwa.assets.entries.get('/assets/recovery.css').body;
  assert.ok(css.startsWith(designTokens), 'recovery.css inlines the design tokens');
  const layout = css.slice(designTokens.length), { light, dark } = themeTokens(css);
  const used = new Set([...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map(([, name]) => name));
  for (const name of ['ink', 'paper', 'action', 'on-action', 'line-strong', 'ring', 'r-sm', 'r']) assert.ok(layout.includes(`var(--${name})`), `the recovery layout uses --${name}`);
  for (const [themeName, theme] of Object.entries({ light, dark })) for (const name of used) assert.ok(theme[name], `${themeName}: recovery.css defines --${name}`);
  for (const theme of [light, dark]) {
    const color = name => parseColor(resolver(theme)(name));
    assert.ok(contrast(color('ink'), color('paper')) >= 4.5 && contrast(color('on-action'), color('action')) >= 4.5, 'recovery text reads in both themes');
  }
});

// ---- the look is captured for review (phase 172) -----------------------------
// scripts/look.mjs captures every page type in the markup golden, in light and
// dark, at phone and laptop widths. The plan is tested, not Chrome: no browser
// starts here, and an absent browser is a clear exit 2.
test('captures cover every page type', async () => {
  const look = await import('../scripts/look.mjs').catch(() => null);
  assert.ok(look, 'scripts/look.mjs exists');
  const golden = Object.keys(JSON.parse(readFileSync(GOLDEN, 'utf8')));
  const script = new URL('../scripts/look.mjs', import.meta.url).pathname;
  const planned = run(process.execPath, [script, '--plan', '--json'], { env: { ...process.env, PLATES_CHROME: '/nonexistent/acme-chrome' } });
  assert.equal(planned.status, 0, planned.stderr);
  const { plan } = JSON.parse(planned.stdout);
  assert.deepEqual(plan, look.capturePlan(golden), 'the script plans from the golden page set');
  const want = golden.flatMap(page => ['light', 'dark'].flatMap(theme => [390, 1280].map(width => `${page}|${theme}|${width}`)));
  assert.deepEqual(plan.map(shot => `${shot.page}|${shot.theme}|${shot.width}`).sort(), want.sort(), 'one image per page type, theme and width');
  assert.equal(new Set(plan.map(shot => shot.file)).size, plan.length, 'each image has its own file');
  for (const shot of plan) assert.match(shot.file, /^[A-Za-z]+-(?:light|dark)-(?:phone|laptop)\.png$/);
  const missing = run(process.execPath, [script], { env: { ...process.env, PLATES_CHROME: '/nonexistent/acme-chrome' } });
  assert.equal(missing.status, 2, 'no browser is exit 2, not a crash');
  assert.match(missing.stderr, /PLATES_CHROME is \/nonexistent\/acme-chrome, which does not exist/);
  assert.equal(missing.stdout, '', 'nothing was captured');
  assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts.look, 'node scripts/look.mjs');
});
