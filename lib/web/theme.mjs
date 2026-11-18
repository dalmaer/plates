// /assets/theme.mjs: a classic script, not a module. Modules are deferred, so
// only a plain <script src> in <head>, before the stylesheet, runs before the
// first paint; the CSP allows no inline script. It applies a remembered light
// or dark choice; with none, <html> carries no data-theme and the CSS media
// query follows the system. The navigation's toggle records the choice
// (navigation-client.mjs). Nothing here imports or exports.
(function () {
  var theme = null;
  try {
    var stored = window.localStorage.getItem('plates-theme');
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch (error) { /* Storage blocked: follow the system. */ }
  var root = document.documentElement;
  if (theme) root.setAttribute('data-theme', theme);
  // The two theme-color metas (one per scheme) come after this script. Once
  // the head is parsed, both take the chosen scheme's colour, so the title
  // bar follows the choice rather than the system. Any <time data-local-reset>
  // on an error page is also rewritten in the viewer's own time zone.
  document.addEventListener('DOMContentLoaded', function () {
    var i;
    if (theme && root.getAttribute('data-theme') === theme) {
      var metas = document.querySelectorAll('meta[name="theme-color"]'), colour = null;
      for (i = 0; i < metas.length; i++) if (/dark/.test(metas[i].getAttribute('media') || '') === (theme === 'dark')) colour = metas[i].getAttribute('content');
      if (colour) for (i = 0; i < metas.length; i++) metas[i].setAttribute('content', colour);
    }
    var times = document.querySelectorAll('time[data-local-reset]');
    for (i = 0; i < times.length; i++) {
      if (times[i].getAttribute('data-local-reset') === null) continue;
      var at = new Date(times[i].getAttribute('datetime') || '');
      if (Number.isFinite(at.getTime())) times[i].textContent = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(at).replace(/\s+/g, ' ');
    }
  });
})();
