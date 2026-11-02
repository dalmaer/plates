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
  if (!theme) return;
  var root = document.documentElement;
  root.setAttribute('data-theme', theme);
  // The two theme-color metas (one per scheme) come after this script. Once
  // the head is parsed, both take the chosen scheme's colour, so the title
  // bar follows the choice rather than the system.
  document.addEventListener('DOMContentLoaded', function () {
    if (root.getAttribute('data-theme') !== theme) return;
    var metas = document.querySelectorAll('meta[name="theme-color"]'), colour = null, i;
    for (i = 0; i < metas.length; i++) if (/dark/.test(metas[i].getAttribute('media') || '') === (theme === 'dark')) colour = metas[i].getAttribute('content');
    if (colour) for (i = 0; i < metas.length; i++) metas[i].setAttribute('content', colour);
  });
})();
