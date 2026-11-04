#!/usr/bin/env node
// Phase 172: the look is captured for review. Renders each workspace page type
// from the markup golden's Acme fixtures (tests/helpers/web-design-pages.mjs),
// serves it with the real asset table on 127.0.0.1, and captures PNGs in light
// and dark at phone and laptop widths through an installed Chrome or Chromium
// over the DevTools protocol (Node's own fetch and WebSocket; no dependencies).
// Images go to a new temporary folder outside the repository and never into
// git. Nothing is compared: a person looks at the pictures. Never run against
// the hosted instance or a real project; it reads only fixtures.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const THEMES = Object.freeze(['light', 'dark']);
export const WIDTHS = Object.freeze([{ label: 'phone', width: 390, height: 844 }, { label: 'laptop', width: 1280, height: 800 }]);
const MAX_HEIGHT = 8000;
const usage = 'Usage: npm run look [-- --plan] [-- --json]\nCaptures each workspace page type from Acme fixture data in light and dark at phone (390 px) and laptop (1280 px) widths, writing PNGs to a new temporary folder and printing each path.\n--plan prints what would be captured without starting a browser. Set PLATES_CHROME to a Chrome or Chromium executable; exit 2 when none is found.';

/** Every page × theme × width, each with its file name. Pure: no browser, no files. */
export function capturePlan(pageNames) {
  return pageNames.flatMap(page => THEMES.flatMap(theme => WIDTHS.map(({ label, width, height }) => ({ page, theme, width, height, label, file: `${page}-${theme}-${label}.png` }))));
}

/** The browser to drive: PLATES_CHROME, else the usual macOS and Linux places. null when none is found. */
export function findChrome(env = process.env) {
  if (env.PLATES_CHROME) return existsSync(env.PLATES_CHROME) ? env.PLATES_CHROME : null;
  const mac = ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Chromium.app/Contents/MacOS/Chromium', 'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary']
    .flatMap(app => ['/Applications', join(env.HOME ?? '', 'Applications')].map(dir => join(dir, app)));
  const linux = String(env.PATH ?? '').split(delimiter).filter(Boolean).flatMap(dir => ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].map(name => join(dir, name)));
  return [...mac, ...linux].find(path => existsSync(path)) ?? null;
}

// The pages as the server sends them: decorated (manifest, theme script) and
// with asset references rewritten to digest URLs; each page's client reads
// back the same fixture snapshot it was rendered from.
function serve(pwa, state) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1'), send = (status, body = '', type = 'text/plain; charset=utf-8', headers = {}) => { response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers }); response.end(body); };
    if (request.method !== 'GET') return send(405);
    const page = state.pages[url.pathname.slice(1)];
    if (page) return send(200, pwa.assets.rewrite(pwa.decorate(page.html)), 'text/html; charset=utf-8');
    const api = state.current?.api?.[url.pathname];
    if (api) return send(200, JSON.stringify(api), 'application/json', { etag: `"${api.cursor ?? 'acme'}"` });
    const asset = pwa.assets.lookup(url.pathname);
    if (asset && asset !== 'stale') return send(200, asset.entry.body, asset.entry.type);
    // No service worker: a capture shows the page, not an installed shell.
    if (url.pathname !== '/sw.js') { const route = pwa.asset(url.pathname); if (route) return send(200, route.body, route.type); }
    return send(404, JSON.stringify({ error: 'not_found' }), 'application/json');
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server)); });
}

async function devtools(chrome, profile) {
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 100 && port === null; i++) {
    if (child.exitCode !== null) throw new Error(`the browser exited (${child.exitCode}) before it opened DevTools`);
    await new Promise(r => setTimeout(r, 100));
    try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || null; } catch { port = null; }
  }
  if (!port) { child.kill(); throw new Error('the browser did not open DevTools within 10 seconds'); }
  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { target = null; }
    if (!target) await new Promise(r => setTimeout(r, 100));
  }
  if (!target) { child.kill(); throw new Error('the browser opened no page target'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('could not connect to the browser')); });
  let id = 0; const pending = new Map(), events = new Map();
  ws.onmessage = message => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) { const { resolve, reject } = pending.get(data.id); pending.delete(data.id); data.error ? reject(new Error(`${data.error.message}`)) : resolve(data.result); }
    else if (data.method && events.has(data.method)) { const waiters = events.get(data.method); events.delete(data.method); for (const w of waiters) w(data.params); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const once = method => new Promise(resolve => events.set(method, [...(events.get(method) ?? []), resolve]));
  const exited = new Promise(resolve => child.once('exit', resolve));
  return { send, once, close: async () => { try { ws.close(); } catch {} child.kill(); await exited; } };
}

/** Capture every planned image into `out`; returns the written paths. */
export async function capture({ chrome, out, log = () => {} }) {
  const { designPages } = await import('../tests/helpers/web-design-pages.mjs');
  const { createPwa } = await import('../lib/web/pwa.mjs');
  const pages = await designPages(), state = { pages, current: null };
  const server = await serve(createPwa(), state), origin = `http://127.0.0.1:${server.address().port}`;
  const profile = mkdtempSync(join(tmpdir(), 'plates-look-profile-'));
  const browser = await devtools(chrome, profile).catch(error => { server.close(); rmSync(profile, { recursive: true, force: true }); throw error; });
  const written = [];
  try {
    await browser.send('Page.enable');
    for (const shot of capturePlan(Object.keys(pages))) {
      state.current = pages[shot.page];
      await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: shot.theme }] });
      await browser.send('Emulation.setDeviceMetricsOverride', { width: shot.width, height: shot.height, deviceScaleFactor: shot.label === 'phone' ? 2 : 1, mobile: shot.label === 'phone' });
      const loaded = browser.once('Page.loadEventFired');
      await browser.send('Page.navigate', { url: `${origin}/${shot.page}` });
      await loaded;
      // Let module clients read their fixture snapshot and fonts settle.
      await new Promise(r => setTimeout(r, 500));
      const { cssContentSize } = await browser.send('Page.getLayoutMetrics');
      const height = Math.min(MAX_HEIGHT, Math.max(shot.height, Math.ceil(cssContentSize.height)));
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: shot.width, height, scale: 1 } });
      const path = join(out, shot.file);
      writeFileSync(path, Buffer.from(data, 'base64'));
      written.push(path); log(path);
    }
  } finally { await browser.close(); server.close(); rmSync(profile, { recursive: true, force: true }); }
  return written;
}

async function main(argv) {
  const json = argv.includes('--json');
  if (argv.includes('--help') || argv.includes('-h')) { console.log(usage); return 0; }
  const unknown = argv.filter(arg => !['--json', '--plan'].includes(arg));
  if (unknown.length) { console.error(`look: unknown argument ${unknown[0]}\n${usage}`); return 2; }
  if (argv.includes('--plan')) {
    const { designPages } = await import('../tests/helpers/web-design-pages.mjs');
    const plan = capturePlan(Object.keys(await designPages()));
    console.log(json ? JSON.stringify({ schema: 1, plan }, null, 1) : plan.map(shot => shot.file).join('\n'));
    return 0;
  }
  const chrome = findChrome();
  if (!chrome) {
    const message = process.env.PLATES_CHROME ? `look: PLATES_CHROME is ${process.env.PLATES_CHROME}, which does not exist.` : 'look: no Chrome or Chromium found. Install one, or set PLATES_CHROME to its executable.';
    if (json) console.log(JSON.stringify({ schema: 1, error: 'no_browser', message }));
    else console.error(message);
    return 2;
  }
  const out = mkdtempSync(join(tmpdir(), 'plates-look-'));
  if (!json) console.log(`Capturing into ${out}`);
  const images = await capture({ chrome, out, log: json ? () => {} : path => console.log(`  ${path}`) });
  console.log(json ? JSON.stringify({ schema: 1, folder: out, images }, null, 1) : `${images.length} images in ${out}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { console.error(`look: ${error.message}`); process.exitCode = 1; });
}
