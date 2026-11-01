// The installable shell: manifest, icons, offline page and a service worker
// that caches only these public assets. HTML routes, API responses and any
// private data never enter the worker's cache (web-operation-experience spec).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { THEME, iconSvg, iconPng } from './pwa-icons.mjs';

export const OFFLINE_PATH = '/offline';
// The complete precache list. Every entry is public, identical for every
// viewer and served without a session; nothing else is ever stored.
export const SHELL = Object.freeze(['/offline', '/manifest.webmanifest', '/assets/plates.css', '/assets/pwa-client.mjs',
  '/assets/plates-icon.svg', '/assets/plates-icon-maskable.svg', '/assets/plates-icon-192.png', '/assets/plates-icon-512.png',
  '/assets/apple-touch-icon.png']);

export const manifest = Object.freeze({
  name: 'Plates', short_name: 'Plates', description: 'Keep your projects moving.',
  id: '/', start_url: '/', scope: '/', display: 'standalone',
  theme_color: THEME.green, background_color: THEME.paper,
  icons: [
    { src: '/assets/plates-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: '/assets/plates-icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    { src: '/assets/plates-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/assets/plates-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/assets/plates-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});

const offlineView = () => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Plates</title><link rel="stylesheet" href="/assets/plates.css"></head><body data-offline><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/">Plates</a></header><main id="main"><section class="panel"><h1>You are offline</h1><p>Plates needs a connection to show your workspace. Nothing private is kept on this device, so there is nothing to show until you reconnect.</p><p>This page reloads by itself when the connection returns.</p><p><a href="/">Try again</a></p></section></main></body></html>';

/**
 * The service worker, written as one self-contained function so the served
 * /sw.js and the tests run the same code. It must not close over anything in
 * this module: it is serialized with Function.prototype.toString.
 */
export function shellWorker(scope, { version, shell, offline }) {
  const cache = `plates-shell-${version}`;
  const origin = scope.location.origin;
  const shellPaths = new Set(shell);
  const open = () => scope.caches.open(cache);
  // null means "not ours": the browser fetches it normally and nothing is stored.
  function route(request) {
    if (request.method !== 'GET') return null;
    const url = new URL(request.url);
    if (url.origin !== origin) return null;
    if (request.mode === 'navigate') {
      // Network first and never stored: an HTML route may carry private data.
      return scope.fetch(request).catch(() => open().then(store => store.match(offline)).then(hit => hit || Response.error()));
    }
    if (url.search || !shellPaths.has(url.pathname)) return null;
    return open().then(store => store.match(url.pathname)).then(hit => hit || scope.fetch(request));
  }
  scope.addEventListener('install', event => {
    // Fetched without credentials: the shell is public and identical for every viewer.
    event.waitUntil(open().then(store => store.addAll(shell.map(path => new Request(new URL(path, origin).href, { cache: 'reload', credentials: 'omit' }))))
      .then(() => scope.skipWaiting()));
  });
  scope.addEventListener('activate', event => {
    event.waitUntil(scope.caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== cache).map(key => scope.caches.delete(key))))
      .then(() => scope.clients.claim())
      .then(() => scope.clients.matchAll({ type: 'window' }))
      .then(windows => { for (const client of windows) client.postMessage({ type: 'plates-shell', version }); }));
  });
  scope.addEventListener('message', event => {
    if (event.data && event.data.type === 'plates-shell?' && event.source) event.source.postMessage({ type: 'plates-shell', version });
  });
  scope.addEventListener('fetch', event => {
    const response = route(event.request);
    if (response) event.respondWith(response);
  });
  const local = value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !/[\\\x00-\x20]/.test(value) ? value : '/';
  scope.addEventListener('push', event => {
    let data = null;
    try { data = event.data ? event.data.json() : null; } catch { data = null; }
    const text = (value, limit, fallback) => typeof value === 'string' && value ? value.slice(0, limit) : fallback;
    const options = { body: text(data && data.body, 200, 'Something in Plates needs you.'), data: { url: local(data && data.url) },
      icon: '/assets/plates-icon-192.png', badge: '/assets/plates-icon-192.png' };
    if (data && typeof data.tag === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(data.tag)) options.tag = data.tag;
    event.waitUntil(scope.registration.showNotification(text(data && data.title, 80, 'Plates'), options));
  });
  // Opening a notification only opens the item. It never approves or runs anything.
  scope.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = new URL(local(event.notification.data && event.notification.data.url), origin).href;
    event.waitUntil(scope.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      const same = windows.find(client => client.url === target && 'focus' in client);
      return same ? same.focus() : scope.clients.openWindow(target);
    }));
  });
  return { route, cache };
}

const pngTypes = { '/assets/plates-icon-192.png': 192, '/assets/plates-icon-512.png': 512, '/assets/apple-touch-icon.png': 180 };

export function createPwa({ css }) {
  const client = readFileSync(new URL('./pwa-client.mjs', import.meta.url), 'utf8');
  const manifestText = JSON.stringify(manifest), offline = offlineView();
  const svg = iconSvg(), maskable = iconSvg({ maskable: true });
  // One version string covers every shell byte and the worker's own code, so
  // any change installs a new worker, which deletes the old cache and tells
  // open pages built on the old shell to refresh.
  const version = createHash('sha256').update(JSON.stringify([shellWorker.toString(), iconPng.toString(), SHELL, manifestText, offline, css, client, svg, maskable])).digest('hex').slice(0, 32);
  const worker = `'use strict';\n(${shellWorker.toString()})(self, ${JSON.stringify({ version, shell: SHELL, offline: OFFLINE_PATH })});\n`;
  const head = `<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="${THEME.green}"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Plates"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><link rel="icon" href="/assets/plates-icon.svg" type="image/svg+xml"><meta name="plates-shell" content="${version}">`;
  const script = '<script type="module" src="/assets/pwa-client.mjs"></script>';
  const pngs = new Map();
  const png = path => { if (!pngs.has(path)) pngs.set(path, iconPng(pngTypes[path])); return pngs.get(path); };
  const assets = {
    '/manifest.webmanifest': () => ({ body: manifestText, type: 'application/manifest+json; charset=utf-8' }),
    '/sw.js': () => ({ body: worker, type: 'text/javascript; charset=utf-8' }),
    '/offline': () => ({ body: decorate(offline, { withClient: true }), type: 'text/html; charset=utf-8' }),
    '/assets/pwa-client.mjs': () => ({ body: client, type: 'text/javascript; charset=utf-8' }),
    '/assets/plates-icon.svg': () => ({ body: svg, type: 'image/svg+xml' }),
    '/assets/plates-icon-maskable.svg': () => ({ body: maskable, type: 'image/svg+xml' }),
    ...Object.fromEntries(Object.keys(pngTypes).map(path => [path, () => ({ body: png(path), type: 'image/png' })])),
  };
  // Every HTML page links the manifest and icons. Pages that already run
  // module scripts also load the shell client (the shell version in the page
  // lets it notice a newer worker); deliberately script-free pages such as
  // sign-in, errors and recovery stay script-free.
  function decorate(html, { withClient = /<script type="module" src="\/assets\//.test(html) } = {}) {
    if (typeof html !== 'string' || !html.includes('</head>') || html.includes('rel="manifest"')) return html;
    const withHead = html.replace('</head>', `${head}</head>`), end = withHead.lastIndexOf('</body>');
    return !withClient || end < 0 ? withHead : `${withHead.slice(0, end)}${script}${withHead.slice(end)}`;
  }
  return { version, worker, decorate, asset: path => Object.hasOwn(assets, path) ? assets[path]() : null };
}
