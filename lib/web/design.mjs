// The hosted workspace's design layer: tokens, then components. CSS only.
// Server code composes it into /assets/plates.css (assets.mjs); no browser
// module imports this file, so it is never shipped as script.
//
// Phase 168: blue and white, cobalt on porcelain, under Ledger's materials
// (wash, glass, radius, motion). The accent and focus ring are Ledger's amber,
// the colour the family shares. Translucency belongs to surfaces only: every
// text token is solid and clears 4.5:1 over the drawn wash in both themes
// (tests/web-design.test.mjs).
//
// Three themes, two written down. No data-theme follows the system through
// the media query; an explicit choice (/assets/theme.mjs) stamps light or
// dark on <html>. Each theme sets only primitives; the surface names
// (--surface, --field, ...) are derived once on the light :root, so a
// fallback below can make every surface opaque with one plain :root rule.
//
// Phase 169: --warn (text) on --warn-tint, --ok-tint and --sunken are Home's
// state tints, solid in both themes, with contrast pairs in the test.
//
// The two paper colours are mirrored as hex in pwa-icons.mjs THEME and in
// theme.mjs for <meta name="theme-color">; a test keeps them in step.
const dark = 'color-scheme:dark;--paper:oklch(0.21 0.055 262);--ink:oklch(0.95 0.012 250);--muted:oklch(0.79 0.03 252);--line:oklch(0.85 0.04 255 / 0.16);--line-strong:oklch(0.64 0.04 256);--action:oklch(0.8 0.1 258);--on-action:oklch(0.21 0.055 262);--accent:oklch(0.78 0.11 68);--ring:oklch(0.78 0.11 68);--danger:oklch(0.74 0.15 28);--ok:oklch(0.76 0.11 158);--warn:oklch(0.85 0.09 78);--warn-tint:oklch(0.3 0.045 70);--ok-tint:oklch(0.26 0.045 200);--sunken:oklch(0.19 0.045 262);--glass:oklch(0.3 0.05 262 / 0.5);--glass-raised:oklch(0.26 0.05 262 / 0.92);--glass-field:oklch(0.34 0.05 262 / 0.55);--glass-veil:oklch(0.28 0.05 262 / 0.97);--opaque:oklch(0.26 0.05 262);--wash-1:oklch(0.42 0.13 262 / 0.5);--wash-2:oklch(0.38 0.08 225 / 0.42);--wash-3:oklch(0.45 0.09 62 / 0.16);--glass-highlight:oklch(1 0 0 / 0.08);--glass-shadow:oklch(0 0 0 / 0.35)';

export const tokens = `
:root{color-scheme:light;--paper:oklch(0.975 0.008 250);--ink:oklch(0.27 0.07 262);--muted:oklch(0.47 0.045 258);--line:oklch(0.42 0.06 260 / 0.2);--line-strong:oklch(0.56 0.04 258);--action:oklch(0.42 0.15 263);--on-action:oklch(0.985 0.006 250);--accent:oklch(0.58 0.11 55);--ring:oklch(0.58 0.11 55);--danger:oklch(0.49 0.17 28);--ok:oklch(0.46 0.1 155);--warn:oklch(0.45 0.09 65);--warn-tint:oklch(0.96 0.04 82);--ok-tint:oklch(0.965 0.022 175);--sunken:oklch(0.945 0.014 250);--glass:oklch(1 0.003 250 / 0.6);--glass-raised:oklch(0.995 0.004 250 / 0.9);--glass-field:oklch(1 0.003 250 / 0.7);--glass-veil:oklch(0.995 0.004 250 / 0.97);--opaque:oklch(0.99 0.004 250);--wash-1:oklch(0.8 0.09 262 / 0.55);--wash-2:oklch(0.9 0.045 225 / 0.6);--wash-3:oklch(0.88 0.08 70 / 0.3);--glass-highlight:oklch(1 0 0 / 0.55);--glass-shadow:oklch(0.3 0.06 262 / 0.08);--surface:var(--glass);--surface-raised:var(--glass-raised);--surface-solid:var(--opaque);--field:var(--glass-field);--green:var(--action);--card:var(--surface);--glass-filter:blur(20px) saturate(1.6);--r-sm:10px;--r:14px;--r-lg:18px;--r-pill:999px;--shadow-xs:0 1px 2px -1px var(--glass-shadow);--shadow-glass:inset 0 1px 0 0 var(--glass-highlight),0 1px 2px -1px var(--glass-shadow),0 8px 24px -12px var(--glass-shadow);--s-1:4px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:20px;--s-6:24px;--s-7:28px;--s-8:32px;--t-xs:12px;--t-sm:14px;--t-md:16px;--t-lg:19px;--t-h1:clamp(32px,5vw,54px);--leading:1.6;--ease:ease-out;--dur-fast:120ms;--dur:150ms;font:16px/1.6 system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){${dark}}}
:root[data-theme=dark]{${dark}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){:root{--surface:var(--glass-veil);--surface-raised:var(--glass-veil);--field:var(--glass-veil)}}
@media(prefers-reduced-transparency:reduce){:root{--surface:var(--opaque);--surface-raised:var(--opaque);--field:var(--opaque);--glass-filter:none}}
@media(forced-colors:active){:root{--paper:Canvas;--ink:CanvasText;--muted:CanvasText;--line:CanvasText;--line-strong:CanvasText;--action:LinkText;--on-action:Canvas;--ring:Highlight;--surface:Canvas;--surface-raised:Canvas;--surface-solid:Canvas;--field:Field;--warn:CanvasText;--warn-tint:Canvas;--ok-tint:Canvas;--sunken:Canvas;--glass-filter:none;--glass-highlight:transparent;--glass-shadow:transparent}}
`;

// Every selector starts with a .p- class, so nothing renders differently
// until markup opts in. Text on a surface stays solid; only the surface is
// translucent. Phase 169 caps blur: a .p-card is solid and never blurs, so a
// long list scrolls smoothly on a phone; .p-card.p-glass opts one card in.
export const components = `
.p-glass{background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-glass);-webkit-backdrop-filter:var(--glass-filter);backdrop-filter:var(--glass-filter)}
.p-card{background:var(--surface-solid);color:var(--ink);border:1px solid var(--line);border-radius:var(--r);padding:var(--s-5);box-shadow:var(--shadow-xs);min-width:0;overflow-wrap:anywhere}.p-card.p-glass{background:var(--surface);box-shadow:var(--shadow-glass)}
.p-panel{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:var(--r-lg);padding:var(--s-8);box-shadow:var(--shadow-glass);-webkit-backdrop-filter:var(--glass-filter);backdrop-filter:var(--glass-filter)}
.p-button{display:inline-flex;align-items:center;justify-content:center;gap:var(--s-2);min-height:44px;padding:10px 20px;border:1px solid transparent;border-radius:var(--r-sm);background:var(--action);color:var(--on-action);font:inherit;font-weight:600;text-decoration:none;cursor:pointer;transition:background-color var(--dur) var(--ease),border-color var(--dur) var(--ease),color var(--dur) var(--ease),transform var(--dur-fast) var(--ease)}.p-button:active:not(:disabled){transform:scale(.985)}.p-button:disabled{opacity:.5;cursor:not-allowed}.p-button.p-quiet{background:var(--surface-raised);color:var(--action);border-color:var(--line)}.p-button.p-ghost{background:transparent;color:var(--action)}.p-button.p-danger{background:var(--danger);color:var(--on-action)}
.p-field{box-sizing:border-box;min-height:44px;max-width:100%;padding:10px 12px;font:inherit;font-size:var(--t-sm);color:var(--ink);background:var(--field);border:1px solid var(--line-strong);border-radius:var(--r-sm)}textarea.p-field{min-height:90px;resize:vertical}.p-field:focus-visible{outline:3px solid var(--ring);outline-offset:2px}@media(max-width:700px){.p-field{font-size:var(--t-md)}}
.p-badge{display:inline-flex;align-items:center;gap:var(--s-1);padding:2px 10px;border-radius:var(--r-pill);border:1px solid var(--line);background:var(--surface-raised);color:var(--ink);font-size:var(--t-xs);font-weight:650;white-space:nowrap}
.p-table{width:100%;border-collapse:collapse;background:var(--surface-solid);font-size:var(--t-sm)}.p-table th,.p-table td{padding:var(--s-2) var(--s-3);border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.p-table th{color:var(--muted);font-size:var(--t-xs);font-weight:650}
.p-dialog{width:min(720px,96vw);max-height:94vh;padding:var(--s-6);border:1px solid var(--line);border-radius:var(--r-lg);background:var(--surface-solid);color:var(--ink);box-shadow:inset 0 1px 0 0 var(--glass-highlight),0 24px 48px -16px oklch(0 0 0 / 0.35)}.p-dialog::backdrop{background:rgb(0 0 0/.5)}
@media(prefers-reduced-transparency:reduce){.p-panel,.p-glass{-webkit-backdrop-filter:none;backdrop-filter:none}}@media(forced-colors:active){.p-card,.p-panel,.p-dialog,.p-button,.p-glass{box-shadow:none}}@media(prefers-reduced-motion:reduce){.p-button{transition:none}.p-button:active:not(:disabled){transform:none}}
`;
