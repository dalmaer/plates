// Browser: registers the shell worker, refreshes a stale shell on reconnect and
// offers notifications on signed-in pages. It stores nothing on the device.

// A page refreshes only when online and a worker reports a different shell.
export const shellRefresh = ({ pageVersion, workerVersion, online }) => online === true
  && typeof workerVersion === 'string' && /^[a-f0-9]{32}$/.test(workerVersion) && workerVersion !== pageVersion;

const keyBytes = value => {
  const base = value.replace(/-/g, '+').replace(/_/g, '/'), raw = atob(base + '='.repeat((4 - base.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

export function startPwa({ window, document, navigator }) {
  const worker = navigator.serviceWorker;
  if (!worker) return null;
  const pageVersion = document.querySelector('meta[name="plates-shell"]')?.getAttribute('content') ?? null;
  let reloading = false;
  const reload = () => { if (!reloading) { reloading = true; window.location.reload(); } };
  worker.addEventListener('message', event => {
    if (event.data?.type === 'plates-shell' && shellRefresh({ pageVersion, workerVersion: event.data.version, online: navigator.onLine })) reload();
  });
  const ready = worker.register('/sw.js', { scope: '/' }).catch(() => null);
  const ask = () => worker.controller?.postMessage({ type: 'plates-shell?' });
  window.addEventListener('online', () => {
    if (document.body?.hasAttribute('data-offline')) return reload();
    ready.then(registration => registration?.update()).catch(() => {}).then(ask);
  });
  ask();
  offerNotifications({ window, document, navigator, ready });
  return { pageVersion, ready };
}

// iOS offers push only to the installed app; elsewhere the browser decides.
function offerNotifications({ window, document, navigator, ready }) {
  const nav = document.querySelector('[data-navigation] nav');
  const csrf = document.querySelector('[data-navigation] input[name="csrf"]')?.value;
  if (!nav || !csrf || !('PushManager' in window) || !('Notification' in window)) return;
  const button = document.createElement('button'), status = document.createElement('span');
  button.type = 'button'; button.className = 'quiet'; button.setAttribute('data-push-toggle', '');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('data-push-status', '');
  nav.append(button, status);
  const send = (method, body) => window.fetch('/api/push/subscription', { method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csrf, ...body }) }).then(response => {
    if (!response.ok) throw new Error('push_unavailable');
    return response.json();
  });
  const current = () => ready.then(registration => registration?.pushManager.getSubscription() ?? null);
  let known = null;
  const show = subscription => {
    known = subscription;
    button.textContent = subscription ? 'Turn off notifications' : 'Turn on notifications';
    button.disabled = window.Notification.permission === 'denied';
    if (button.disabled) status.textContent = 'Notifications are blocked for this site in your settings.';
  };
  current().then(show, () => show(null));
  button.addEventListener('click', async () => {
    // Safari keeps the tap's permission only for a call made before any other await.
    const permission = known ? null : window.Notification.requestPermission();
    button.disabled = true;
    try {
      if (known) {
        await send('DELETE', { endpoint: known.endpoint });
        await known.unsubscribe();
        status.textContent = 'Notifications are off on this device.';
        return show(null);
      }
      if (await permission !== 'granted') { status.textContent = 'Notifications were not allowed.'; return show(null); }
      const key = await window.fetch('/api/push/subscription', { credentials: 'same-origin' }).then(response => {
        if (!response.ok) throw new Error('push_unavailable');
        return response.json();
      });
      const registration = await ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key.publicKey) });
      await send('POST', { subscription: subscription.toJSON() });
      status.textContent = 'Notifications are on. Plates tells you when something waits on you.';
      show(subscription);
    } catch {
      status.textContent = 'Notifications are not available on this workspace yet.';
      current().then(show, () => show(null));
    }
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof navigator !== 'undefined') startPwa({ window, document, navigator });
