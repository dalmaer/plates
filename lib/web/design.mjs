// The hosted workspace's design layer (phase 167): tokens, then components.
// CSS only. Server code composes it into /assets/plates.css (assets.mjs);
// no browser module imports this file, so it is never shipped as script.
//
// Phase 167 changes nothing visible. The six original names (--ink, --muted,
// --line, --paper, --green, --card) keep their exact light and dark values;
// --green and --card are now aliases of --action and --surface. Tokens with
// no existing equivalent take Ledger's material values (wash, glass, shadow,
// motion) or a value chosen to pass the contrast test (--line-strong). The
// blue and white palette and the glass surfaces arrive in phase 168.

export const tokens = `
:root{color-scheme:light;--paper:#f5f5ef;--ink:#183632;--muted:#52655e;--line:#d8dfd7;--line-strong:#7b8a82;--surface:#fff;--surface-raised:#fff;--surface-solid:#fff;--field:#fff;--action:#245c48;--accent:#d27d26;--ring:#d27d26;--danger:oklch(0.49 0.17 28);--ok:oklch(0.46 0.1 155);--green:var(--action);--card:var(--surface);--wash-1:oklch(0.85 0.115 62 / 0.72);--wash-2:oklch(0.83 0.1 215 / 0.62);--wash-3:oklch(0.86 0.095 330 / 0.48);--glass-highlight:oklch(1 0 0 / 0.5);--glass-shadow:oklch(0.3 0.02 70 / 0.07);--glass-filter:blur(20px) saturate(1.6);--r-sm:10px;--r:14px;--r-lg:18px;--r-pill:999px;--shadow-xs:0 1px 2px -1px var(--glass-shadow);--shadow-glass:inset 0 1px 0 0 var(--glass-highlight),0 1px 2px -1px var(--glass-shadow),0 8px 24px -12px var(--glass-shadow);--s-1:4px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:20px;--s-6:24px;--s-7:28px;--s-8:32px;--t-xs:12px;--t-sm:14px;--t-md:16px;--t-lg:19px;--t-h1:clamp(32px,5vw,54px);--leading:1.6;--ease:ease-out;--dur-fast:120ms;--dur:150ms;font:16px/1.6 system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--paper:#171e19;--ink:#e7ede3;--muted:#b3bdae;--line:#3b453b;--line-strong:#7f8c7c;--surface:#222b23;--surface-raised:#222b23;--surface-solid:#222b23;--field:#222b23;--action:#a7ceb7;--danger:oklch(0.72 0.15 28);--ok:oklch(0.74 0.11 158);--wash-1:oklch(0.45 0.13 285 / 0.5);--wash-2:oklch(0.42 0.1 200 / 0.42);--wash-3:oklch(0.42 0.11 20 / 0.3);--glass-highlight:oklch(1 0 0 / 0.1);--glass-shadow:oklch(0 0 0 / 0.3)}}
`;

// Defined here, adopted by views from phase 168 on. Every selector starts with
// a .p- class, so nothing renders differently until markup opts in.
export const components = `
.p-card{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:var(--r);padding:var(--s-5);box-shadow:var(--shadow-xs);min-width:0;overflow-wrap:anywhere}
.p-panel{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:var(--r-lg);padding:var(--s-8);box-shadow:var(--shadow-glass);-webkit-backdrop-filter:var(--glass-filter);backdrop-filter:var(--glass-filter)}
.p-button{display:inline-flex;align-items:center;justify-content:center;gap:var(--s-2);min-height:44px;padding:10px 20px;border:1px solid transparent;border-radius:var(--r-sm);background:var(--action);color:var(--surface-solid);font:inherit;font-weight:600;text-decoration:none;cursor:pointer;transition:background-color var(--dur-fast) var(--ease),border-color var(--dur-fast) var(--ease)}.p-button:disabled{opacity:.5;cursor:not-allowed}.p-button.p-quiet{background:var(--surface-raised);color:var(--action);border-color:var(--line)}.p-button.p-ghost{background:transparent;color:var(--action)}.p-button.p-danger{background:var(--danger);color:var(--surface-solid)}
.p-field{box-sizing:border-box;min-height:44px;max-width:100%;padding:10px 12px;font:inherit;font-size:var(--t-sm);color:var(--ink);background:var(--field);border:1px solid var(--line-strong);border-radius:var(--r-sm)}textarea.p-field{min-height:90px;resize:vertical}.p-field:focus-visible{outline:3px solid var(--ring);outline-offset:2px}@media(max-width:700px){.p-field{font-size:var(--t-md)}}
.p-badge{display:inline-flex;align-items:center;gap:var(--s-1);padding:2px 10px;border-radius:var(--r-pill);border:1px solid var(--line);background:var(--surface-raised);color:var(--ink);font-size:var(--t-xs);font-weight:650;white-space:nowrap}
.p-table{width:100%;border-collapse:collapse;background:var(--surface-solid);font-size:var(--t-sm)}.p-table th,.p-table td{padding:var(--s-2) var(--s-3);border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.p-table th{color:var(--muted);font-size:var(--t-xs);font-weight:650}
.p-dialog{width:min(720px,96vw);max-height:94vh;padding:var(--s-6);border:1px solid var(--line);border-radius:var(--r-lg);background:var(--surface-solid);color:var(--ink);box-shadow:inset 0 1px 0 0 var(--glass-highlight),0 24px 48px -16px oklch(0 0 0 / 0.35)}.p-dialog::backdrop{background:rgb(0 0 0/.5)}
@media(prefers-reduced-transparency:reduce){.p-panel{-webkit-backdrop-filter:none;backdrop-filter:none}}@media(forced-colors:active){.p-card,.p-panel,.p-dialog,.p-button{box-shadow:none}}@media(prefers-reduced-motion:reduce){.p-button{transition:none}}
`;
