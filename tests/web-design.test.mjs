// Phase 167: the design layer. Tokens and components come from one CSS-only
// module, the shell stylesheet includes each layer once, the palette meets
// contrast in both themes, and none of it changes page markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { homeView, projectView, signinView } from '../lib/web/views.mjs';
import { decisionView } from '../lib/web/decision-views.mjs';
import { changeIndexView } from '../lib/web/change-views.mjs';
import { changesHarness, token } from './helpers/web-changes.mjs';
// Only modules that exist before the design layer are imported statically, so
// each test loads at the phase's base and fails there by assertion.
import * as assets from '../lib/web/assets.mjs';

// ---- the design layer changes no page markup --------------------------------
// Representative pages rendered from fixed Acme inputs. The golden file was
// rendered from the views before the design layer existed (its own commit, on
// the phase's base), so any markup change in this phase or later fails here.
// A phase that changes markup on purpose regenerates it with
// PLATES_WRITE_MARKUP_GOLDEN=1 and the diff shows in review.
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

// The served shell stylesheet: its light :root block, and the dark one layered over it.
const served = () => assets.buildAssetTable(assets.defaultSources()).entries.get('/assets/plates.css').body;
function themes(css = served()) {
  const declarations = body => Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):([^;]+)/g)].map(([, name, value]) => [name, value.trim()]));
  const all = rules(css).filter(rule => rule.selector === ':root');
  const light = all.filter(rule => rule.context === ''), dark = all.filter(rule => rule.context === '@media(prefers-color-scheme:dark)');
  assert.equal(light.length, 1, 'one light :root token block'); assert.equal(dark.length, 1, 'one dark :root token block');
  const lightTokens = declarations(light[0].body);
  const resolve = theme => { const value = name => { const raw = theme[name]; assert.ok(raw, `--${name} is defined`); const ref = /^var\(--([a-z0-9-]+)\)$/.exec(raw); return ref ? value(ref[1]) : raw; }; return value; };
  return { light: resolve(lightTokens), dark: resolve({ ...lightTokens, ...declarations(dark[0].body) }) };
}

// Today's --muted (#52655e, unchanged so phase 167 changes nothing visible)
// falls short over Ledger's two strongest light wash stops. The wash is not
// rendered until phase 168, which sets the new palette and must empty this
// list; the comparison is exact, so a new failure or a fixed one both fail.
const KNOWN_UNTIL_168 = [
  'light: --muted on paper+wash-1 is 4.23:1, needs 4.5:1',
  'light: --muted on paper+wash-2 is 4.39:1, needs 4.5:1',
];

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
    assert.equal(token('green'), token('action')); assert.equal(token('card'), token('surface'));
  }
  assert.deepEqual(failures, KNOWN_UNTIL_168);
});

test('the old names keep their exact light and dark values', () => {
  const { light, dark } = themes();
  assert.deepEqual(['ink', 'muted', 'line', 'paper', 'green', 'card'].map(light), ['#183632', '#52655e', '#d8dfd7', '#f5f5ef', '#245c48', '#fff']);
  assert.deepEqual(['ink', 'muted', 'line', 'paper', 'green', 'card'].map(dark), ['#e7ede3', '#b3bdae', '#3b453b', '#171e19', '#a7ceb7', '#222b23']);
  assert.equal(light('ring'), '#d27d26'); assert.equal(dark('ring'), '#d27d26');
});
