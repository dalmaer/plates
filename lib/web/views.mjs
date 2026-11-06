import {navigation,navigationFooter,navigationScripts} from './navigation.mjs';
import {inlineMarkdown} from './markdown.mjs';
import {safeSourceLink,decisionHref} from './source-links.mjs';
import {renderReviewStart} from './review-views.mjs';
export {safeSourceLink,decisionHref,renderReviewStart};
import {journalPreference} from './change-views.mjs';
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
// Phase 174: the link colour skips a link styled as a button, so an a.button
// keeps the design layer's label colour (it was the fill's, so unreadable).
// The shell layer of /assets/plates.css. Tokens, components, journal and
// navigation styles are composed around it in assets.mjs (phase 167).
export const styles = `
#autonomy pre{white-space:pre-wrap;overflow-wrap:anywhere}#autonomy button{max-width:100%;white-space:normal}
*{box-sizing:border-box}html{background-color:var(--paper);-webkit-text-size-adjust:100%}body{margin:0;min-height:100dvh;background:transparent;color:var(--ink)}body::before{content:"";position:fixed;top:calc(-25% - env(safe-area-inset-top,0px));right:-25%;bottom:calc(-25% - env(safe-area-inset-bottom,0px));left:-25%;z-index:-1;pointer-events:none;background-color:var(--paper);background-image:radial-gradient(42rem 42rem at 12% 8%,var(--wash-1),transparent 62%),radial-gradient(38rem 38rem at 88% 22%,var(--wash-2),transparent 60%),radial-gradient(34rem 34rem at 50% 96%,var(--wash-3),transparent 58%)}a:where(:not([class~=button],[class~=p-button])){color:var(--action);text-underline-offset:4px}a:hover{text-decoration-thickness:2px}:focus-visible{outline:3px solid var(--ring);outline-offset:4px}
header{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:20px max(24px,calc((100vw - 1120px)/2));border-bottom:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow-glass);-webkit-backdrop-filter:var(--glass-filter);backdrop-filter:var(--glass-filter)}.brand{font-size:23px;font-weight:750;text-decoration:none;letter-spacing:-1px;color:var(--action)}.brand span{color:var(--muted);font-weight:400;letter-spacing:0;font-size:14px;margin-left:16px}main{max-width:1120px;padding:56px 24px;margin:auto}h1{font-size:clamp(32px,5vw,54px);line-height:1.12;letter-spacing:-1.8px;margin:12px 0 20px}h2{font-size:22px;line-height:1.3;margin:0 0 8px}p{max-width:66ch}.eyebrow{text-transform:uppercase;letter-spacing:.13em;font-size:12px;font-weight:750;color:var(--green)}.intro{font-size:19px;color:var(--muted)}.panel{padding:32px;border:1px solid var(--line);border-radius:var(--r-lg);background:var(--surface);box-shadow:var(--shadow-glass);-webkit-backdrop-filter:var(--glass-filter);backdrop-filter:var(--glass-filter);margin:32px 0}.signin{max-width:620px;margin:36px auto}.cards{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px}.cards li{padding:24px;background:var(--surface-solid);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow-xs);overflow-wrap:anywhere}.meta{color:var(--muted);font-size:14px}.badge{display:inline-block;background:var(--surface-raised);border:1px solid var(--line);padding:3px 10px;border-radius:var(--r-pill);font-size:12px;color:var(--action);font-weight:650}nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}nav form{margin:0}header nav a{display:inline-flex;align-items:center;min-height:44px}.empty{color:var(--muted)}footer{padding:24px 0;border-top:1px solid var(--line);color:var(--muted);font-size:14px;margin-top:48px}code{font-size:13px;overflow-wrap:anywhere}.skip{position:absolute;top:-100px}.skip:focus{top:8px;left:8px;background:var(--surface-solid);padding:8px;z-index:30}@media(max-width:600px){main{padding-top:28px}.panel{padding:24px}header{padding:12px 16px}.brand span{display:block;margin:0}.signin{margin:12px auto}}

[hidden]{display:none!important}.review-start{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:16px 0 0;max-width:none}.home-heading{display:flex;justify-content:space-between;align-items:center;gap:20px}.home-heading h1{font-size:36px;margin:6px 0 10px;letter-spacing:-1px}.home-intro{margin:0;color:var(--muted);font-size:16px}.home-toolbar{display:flex;gap:18px;align-items:end;flex-wrap:wrap;margin:24px 0 14px}.home-toolbar label{display:grid;gap:5px;font-size:12px;font-weight:650}.home-toolbar input{width:240px}.home-toolbar>.meta{margin-left:auto;font-size:12px}.refresh-notice{display:flex;align-items:center;gap:14px;justify-content:space-between;font-size:12px;color:var(--muted);min-height:32px}.coverage{padding:12px 16px;border:1px solid var(--line);border-radius:var(--r-sm);margin-top:16px;font-size:13px}.coverage>div{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.coverage .meta{font-size:12px}.coverage-warning{background:var(--warn-tint);border-color:var(--accent)}.coverage-warning strong{color:var(--warn)}.source-list{font-size:13px;padding-left:20px;margin:10px 0 0;overflow-wrap:anywhere}.home-section{margin-top:26px;min-width:0}.section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:11px}.section-heading h2{font-size:18px;letter-spacing:-.3px;margin:0}.section-heading .meta{font-size:12px}.action-list{display:grid;gap:12px}.attention-card{border-top:3px solid var(--accent);padding:18px}.attention-card.walk{border-top-color:var(--green)}.attention-card.waiting{border-top-color:var(--line-strong)}.attention-card .eyebrow{font-size:10px;letter-spacing:.08em}.attention-card h3{font-size:16px;line-height:1.4;letter-spacing:-.2px;margin:8px 0}.attention-card p{font-size:13px;line-height:1.55;margin:8px 0;color:var(--muted)}.attention-card .next-line{font-size:12px}.card-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-top:10px;font-size:12px}.card-foot .meta{font-size:12px}.attention-card details{border-top:1px solid var(--line);padding-top:10px;margin-top:14px;font-size:12px}summary{cursor:pointer;min-height:30px;font-weight:600}summary:hover{color:var(--green)}.detail-list{margin:12px 0}.detail-list>div{margin-bottom:12px}.detail-list dt{font-weight:700}.detail-list dd{margin:3px 0 0;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere}.detail-list ul{margin:0;padding-left:20px}.empty-card{padding:18px;background:var(--sunken);border:1px dashed var(--line-strong);border-radius:var(--r);margin:0;font-size:13px}.warning{background:var(--warn-tint);color:var(--warn)}.back-link{font-size:13px;display:inline-block;margin-bottom:18px}.project-intro .intro{font-size:16px;margin-bottom:6px}.refresh-notice[data-stale=true]{color:var(--warn)}summary:focus-visible{outline:3px solid var(--ring);outline-offset:3px}@media(max-width:760px){.home-heading{align-items:start}.home-heading h1{font-size:30px}.home-toolbar>.meta{margin-left:0;width:100%}.home-toolbar input{width:min(210px,100%)}.home-toolbar{gap:12px}.section-heading{align-items:start}.section-heading .meta{max-width:45%;text-align:right}}@media(max-width:400px){main{padding-left:16px;padding-right:16px}header{padding-left:16px;padding-right:16px}.home-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto}.home-toolbar>.meta{grid-column:1/-1}.home-toolbar input{width:100%}.refresh-notice{align-items:start;flex-wrap:wrap}.home-heading{gap:8px}.home-heading .eyebrow{font-size:10px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}




@media(prefers-reduced-transparency:reduce){body::before{background-image:none}header{-webkit-backdrop-filter:none;backdrop-filter:none}}@media(forced-colors:active){body::before{display:none}header,.panel,.cards li{box-shadow:none}}

.need-list,.since-lines,.queue-list,.plate-strip{list-style:none;margin:0;padding:0}.need-list{display:grid;gap:10px}.need{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;align-items:start;padding:14px 16px}.need h3{font-size:16px;margin:0;line-height:1.35;overflow-wrap:anywhere}.need p{margin:4px 0 0}.need-body{min-width:0}.need-links{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:14px}.verb{justify-content:center;min-width:5em;color:var(--action)}.verb-fix{background:var(--warn-tint);color:var(--warn);border-color:currentColor}.verb-try{background:var(--ok-tint);color:var(--ok)}
.since-plates{display:grid;gap:10px}.since-plate{padding:14px 16px}.since-plate h3{font-size:15px;margin:0 0 6px}.since-lines li{display:flex;gap:10px;font-size:14px;padding:3px 0;overflow-wrap:anywhere}.since-lines time{color:var(--muted);font-size:12px;flex:none;min-width:5.5em;padding-top:2px}
.queue-list{display:grid;gap:8px}.queue-list li{padding:12px 16px;overflow-wrap:anywhere}.quiet-line{margin:8px 0 0;overflow-wrap:anywhere}
.plate-strip{display:flex;flex-wrap:wrap;gap:8px}.plate-chip{display:flex;flex-direction:column;gap:2px;padding:10px 14px;text-decoration:none;min-width:8.5em}.plate-chip strong{color:var(--ink);font-size:14px}.plate-chip span{font-size:12px;color:var(--muted)}.plate-chip[data-status="broken"] span{color:var(--warn);font-weight:700}.plate-chip[data-status="yours"] span{color:var(--action);font-weight:700}.source-problems{margin-top:12px}
.ask-form{display:grid;gap:10px;padding:16px;margin-bottom:12px}.ask-form h3,.ask-form p{margin:0}.ask-form>label{display:grid;gap:4px;font-weight:650}.ask-form fieldset{border:0;padding:0;display:grid;gap:6px}.ask-code,.ask-command{white-space:pre-wrap;overflow-wrap:anywhere}
.home-footer{margin-top:32px;padding-top:14px;border-top:1px solid var(--line)}.home-footer p{margin:0 0 8px}
@media(max-width:600px){.need{grid-template-columns:minmax(0,1fr)}.need .verb{justify-self:start}.plate-chip{flex:1 1 calc(50% - 8px);min-width:0}.home-toolbar input{width:100%}.home-toolbar label{flex:1 1 100%}}
`;
function page(title, content, csrf, dynamic = false, access = null, project = null) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Plates</title><link rel="stylesheet" href="/assets/plates.css"></head><body><a class="skip" href="#main">Skip to content</a>${access ? navigation(access,{path:project?projectPath(project.id):'/',project}) : '<header><a class="brand" href="/">Plates</a><span class="badge">Private workspace</span></header>'}<main id="main">${content}<footer>Plates keeps project records with their source. Access is checked on every request.</footer></main>${navigationFooter(access)}${access ? navigationScripts : ''}${dynamic ? '<script type="module" src="/assets/home-client.mjs"></script>' : ''}</body></html>`;
}
// Phase 154: why a sign-in ended, in plain words. Keys are the only reasons a
// URL may carry (?ended=); nothing else from the session reaches the page.
export const SIGN_IN_REASONS = Object.freeze({
  ended: 'It ended after 30 days without use, or because you signed out.',
  year: 'It has been a year since you signed in on this device.',
  github: 'GitHub ended it: the Plates app’s access to your GitHub account was revoked or has expired.',
  access: 'Your access to this workspace or its projects changed.',
  'signed-out': 'You signed out.',
});
const signInStory = reason => !Object.hasOwn(SIGN_IN_REASONS, reason)
  ? { title: 'You’re not signed in.', body: 'Please sign in with your approved GitHub account to open your private workspace.' }
  : reason === 'signed-out' ? { title: 'You’re signed out.', body: 'Please sign in again whenever you want to come back.' }
  : { title: 'Your sign-in ended.', body: `${SIGN_IN_REASONS[reason]} Please sign in again to carry on.` };
export const signinView = (csrf,returnTo='/',ended=null) => page('Sign in', `<section class="signin">${ended ? `<div class="eyebrow">Sign in</div><h1>${escape(signInStory(ended).title)}</h1><p class="intro">${escape(signInStory(ended).body)}</p>` : '<div class="eyebrow">Welcome to Plates</div><h1>Keep your projects<br>moving.</h1><p class="intro">Sign in to open your private workspace and see the projects you can access.</p>'}<div class="panel"><h2>Your workspace, your access</h2><p>Use the GitHub account approved for this Plates instance. Only explicitly connected repositories are available.</p><form method="post" action="/api/auth/start"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="returnTo" value="${escape(returnTo)}"><button>Continue with GitHub</button></form></div><p class="meta">Access is private. There is no public signup.</p></section>`);
const projectPath = id => `/projects/${encodeURIComponent(id)}`;
const sourceLink = (value, label = 'Open source ↗') => { const href = safeSourceLink(value); return href ? `<a data-focus="source-${escape(href)}" href="${escape(href)}" rel="noreferrer">${escape(label)}</a>` : '<span class="meta">Source link unavailable</span>'; };
const list = value => Array.isArray(value) ? value : [];
const stamp = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace(/:\d\d\.\d{3}Z$/, ' UTC') : 'Not read'; };
const number = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const progress = project => { if (project.state === 'loading') return 'Progress loading'; const p = project.planning ?? {}; return number(p.built) !== null && number(p.total) !== null ? `${p.built} / ${p.total} built${number(p.livedIn) !== null ? ` · ${p.livedIn} lived-in` : ' · lived-in unknown'}` : 'Progress unavailable'; };
const projectLabel = project => project.name || project.id;
const filterAttributes = (item, group = '') => `data-filterable data-project="${escape(item.projectId ?? item.id)}" data-groups="${escape(group)}" data-search="${escape([item.projectName, item.name, item.repo, item.title, item.tagline].filter(Boolean).join(' ').toLowerCase())}"`;
// Phase 133's verdict on a review at its round limit, and the merge rule's counts (phase 156).
function reviewFacts(review) {
  if (!review || typeof review !== 'object') return '';
  const rule = review.mergeRule && typeof review.mergeRule === 'object' ? review.mergeRule : null, count = value => number(value) === null ? '?' : value;
  const facts = [number(review.rounds) !== null && number(review.limit) !== null ? `Round ${review.rounds} of ${review.limit}` : null,
    typeof review.verdict === 'string' ? review.verdict.charAt(0).toUpperCase() + review.verdict.slice(1) : null,
    rule ? `${count(rule.fixFirst)} fix first · ${count(rule.track)} track · ${count(rule.unsorted)} unsorted` : null].filter(Boolean);
  return facts.length ? `<p class="meta" data-review-facts>${facts.map(escape).join(' · ')}</p>` : '';
}
// A section only one form reads, or neither: named with its reason and the command that reads it.
function sectionRow(row) {
  const read = row.state === 'read';
  return `<li class="p-card" data-home-section="${escape(row.id)}"><strong>${escape(row.title)}</strong> <span class="meta">${read ? `${number(row.count) ?? 0} read` : 'Unavailable here'}${row.reason ? ` · ${escape(row.reason)}` : ''}</span><p class="meta">Read it with <code>${escape(row.command)}</code></p></li>`;
}
function actionCard(action, kind) {
  const details = action.details, key = `action-${action.id}`, decision = kind === 'decision' ? decisionHref(action) : null;
  return `<article class="attention-card ${kind} p-card" data-record="${escape(key)}" ${filterAttributes(action, kind === 'waiting' ? 'waiting' : 'attention')}><div class="eyebrow">${escape(action.projectName)} · ${kind === 'walk' ? 'Human walk' : kind === 'decision' ? 'Decision' : kind === 'review' ? 'Review' : 'Waiting'}</div>${kind === 'review' ? reviewFacts(action.review) : ''}<h3>${escape(action.title)}</h3><p>${action.why ? inlineMarkdown(action.why) : 'Read the source record for context.'}</p>${action.next ? `<p class="next-line"><strong>Next</strong> ${inlineMarkdown(action.next)}</p>` : ''}<div class="card-foot">${details?.takes ? `<span class="meta">${escape(details.takes)}</span>` : '<span class="meta">Source-backed request</span>'}${kind === 'walk' ? `<a data-focus="walk-index-${escape(action.id)}" href="${projectPath(action.projectId)}/walks">Guided walks →</a>` : ''}${decision ? `<a data-focus="decision-${escape(action.id)}" href="${escape(decision)}">Review decision →</a>` : sourceLink(action.link, kind === 'walk' ? 'Open walk instructions ↗' : kind === 'decision' ? 'Review source ↗' : kind === 'review' ? 'Open the pull request ↗' : 'Inspect condition ↗')}</div>${details ? `<details data-detail="${escape(key)}"><summary data-focus="${escape(key)}">${kind === 'walk' ? 'What to check' : 'Question and context'}</summary><dl class="detail-list">${[['ask','Ask'],['why','Why you'],['look','Look at'],['then','Then']].filter(([key]) => details[key]).map(([key,label]) => `<div><dt>${label}</dt><dd>${escape(details[key])}</dd></div>`).join('')}${list(details.choices).length ? `<div><dt>Choices in the source</dt><dd><ul>${details.choices.map(choice => `<li>${escape(typeof choice === 'string' ? choice : choice?.label ?? choice?.text ?? 'See source')}</li>`).join('')}</ul></dd></div>` : ''}</dl><p class="meta">${decision ? 'Review the exact outbound source preview before recording a decision.' : kind === 'walk' ? 'Open the project’s guided walks to find authored steps. A source request without a matching definition remains inspect-only.' : 'Inspect this request in its source workflow.'}</p></details>` : ''}</article>`;
}
function section(id, title, content, meta = '') { return `<section class="home-section" id="${id}" aria-labelledby="${id}-title"><div class="section-heading"><h2 id="${id}-title">${title}</h2>${meta ? `<span class="meta">${escape(meta)}</span>` : ''}</div>${content}</section>`; }
/** Only an entirely empty loading shell may be hydrated without an apply click. */
export function isLoadingOnly(snapshot, { projectId = null } = {}) {
  const projects = list(snapshot.projects).filter(project => !projectId || project.id === projectId);
  return projects.length > 0 && projects.every(project => project.state === 'loading')
    && ['decisions','walks','reviews','waiting','changes'].every(key => !list(snapshot[key]).some(item => !projectId || item.projectId === projectId))
    && projects.every(project => ['decisions','walks','reviews','waiting','changes'].every(key => !list(project[key]).length));
}
/** Source-declared preference only: the web service has no host permission adapter. */
export function autonomyPanel(project) {
  const setting = project.autonomy;
  const known = ['declared', 'default'].includes(setting?.status);
  const selected = known ? setting.policy?.mode : null;
  const rows = known && Array.isArray(setting.scopes) ? setting.scopes : [];
  const modes = { default: 'Low', local: 'Medium', delivery: 'High' };
  const scopeLabels = { 'local-edits': 'Local edits', tests: 'Tests', push: 'Push', merge: 'Merge', deployment: 'Deployment', security: 'Security changes' };
  const authorityLabels = { 'existing-policy': 'Existing rules', 'within-authorized-task': 'Within authorized tasks', 'specific-approval': 'Separate approval', 'selected-destinations': 'Selected branches', 'selected-destinations-and-namespaces': 'Selected branches and namespaces' };
  return `<section id="autonomy" class="panel" aria-label="Autonomy settings"><h2>Autonomy and approvals</h2>
    <p><strong>${escape(selected ? `Source risk tolerance: ${modes[selected] || selected}` : 'Source setting unavailable')}</strong></p>
    <p>This is the repository's declared preference, not verified user consent or current host permission. Unsaved local selections are not visible here.</p>
    ${rows.length ? `<ul>${rows.map(row => `<li>${escape(scopeLabels[row.scope] || row.scope)}: ${escape(authorityLabels[row.authority] || row.authority)}${row.branches?.length ? ` · ${escape(row.branches.join(', '))}` : ''}${row.namespaces?.length ? ` · namespaces ${escape(row.namespaces.join(', '))} (protected/default excluded)` : ''}</li>`).join('')}</ul>` : ''}
    <p>Low keeps existing rules. Medium covers routine authorized edits and tests. High also covers selected push destinations or namespaces and separately selected, gated merge destinations. No level expands host permissions or approves deployment or security changes.</p>
    <details><summary>Change the local project setting</summary><p>In the project checkout, inspect the setting and preview your preferred scope. Apply only after reviewing and explicitly confirming the returned digest.</p>
    <pre><code>plates autonomy --json
plates autonomy --level medium --json
plates autonomy --level high --push-prefix work/ --merge main --json</code></pre>
    <p>A namespace can cover future task branches without selecting each name again. It requires current evidence that the exact target is not protected or the default branch. Merge destinations need a separate exact selection, current protection evidence and all required checks. Deployment and security changes need specific approval.</p></details>
    <p><strong>Host approval controls unavailable.</strong> Plates has no connected authenticated adapter that supplies current effective tool permissions or applies scoped host consent. Host prompts and existing command approvals remain in force.</p>
    <button type="button" disabled aria-disabled="true">Host approval settings unavailable</button>
    ${known && setting.sourceUrl ? sourceLink(setting.sourceUrl, 'Inspect source declaration ↗') : ''}
    ${known ? `<p class="meta">Source revision: ${escape(setting.sourceRevision || 'unknown')} · selection provenance unverified</p>` : ''}
  </section>`;
}
// ---- home's four sections (plates phase 166) ----------------------------------------
// Rendered from the model's `home` (lib/work-items.mjs homeFour), the same object
// plates home renders in a terminal: Needs you, Since you last looked, What should
// happen next?, Your plates, then the one footer line. Source problems sit under
// Your plates, never above Needs you.
const VERB_CLASS = { fix: 'verb-fix', decide: 'verb-decide', try: 'verb-try' };
function needRow(row, original, reviewHref) {
  const kind = original?.kind, decision = kind === 'decision' ? decisionHref(original) : null, details = original?.details;
  const key = `need-${row.key ?? `${row.projectId}:${row.kind}:${row.title}`}`;
  const primary = decision ? `<a data-focus="decision-${escape(original.id)}" href="${escape(decision)}">Review decision →</a>`
    : kind === 'walk' ? `<a data-focus="walk-index-${escape(original.id)}" href="${projectPath(original.projectId)}/walks">Guided walks →</a>${sourceLink(row.link, 'Open walk instructions ↗')}`
    : row.link ? sourceLink(row.link, kind === 'review' ? 'Open the pull request ↗' : 'Open source ↗')
    : row.command ? `<span class="meta">Read it with <code>${escape(row.command)}</code></span>` : '';
  const answers = list(row.answers);
  return `<li class="need p-card" data-record="${escape(key)}" data-verb="${escape(row.verb)}" ${filterAttributes(row, row.verb)}><span class="verb p-badge ${VERB_CLASS[row.verb] ?? ''}">${escape(row.label)}</span><div class="need-body"><p class="eyebrow">${escape(row.projectName ?? row.projectId ?? 'Workspace')}</p><h3>${escape(row.title)}</h3>${kind === 'review' ? reviewFacts(original.review) : ''}${row.why ? `<p class="meta">${inlineMarkdown(String(row.why).split('\n')[0])}</p>` : ''}${original?.next && !String(row.why ?? '').includes(original.next) ? `<p class="next-line"><strong>Next</strong> ${inlineMarkdown(original.next)}</p>` : ''}<p class="need-links">${primary}${answers.length ? `<a href="${escape(reviewHref)}" data-focus="answer-${escape(key)}">Answer →</a>` : ''}</p>${answers.length ? `<p class="meta" data-answers>Answers: ${answers.map(a => escape(a.label)).join(' · ')}</p>` : ''}${details ? `<details data-detail="${escape(key)}"><summary data-focus="${escape(key)}">${kind === 'walk' ? 'What to check' : 'Question and context'}</summary><dl class="detail-list">${[['ask','Ask'],['why','Why you'],['look','Look at'],['then','Then'],['takes','Takes']].filter(([k]) => details[k]).map(([k,label]) => `<div><dt>${label}</dt><dd>${escape(details[k])}</dd></div>`).join('')}${list(details.choices).length ? `<div><dt>Choices in the source</dt><dd><ul>${details.choices.map(choice => `<li>${escape(typeof choice === 'string' ? choice : choice?.label ?? choice?.text ?? 'See source')}</li>`).join('')}</ul></dd></div>` : ''}</dl></details>` : ''}</div></li>`;
}
const countLabel = (n, known, unit = '') => `${n}${known ? ' known' : ''}${unit ? ` ${unit}` : ''}`;
function needsYouView(sec, snapshot, { projectId, loading }) {
  const rows = list(sec?.items).filter(r => !projectId || r.projectId === projectId);
  const byKey = new Map(['decisions','walks','reviews'].flatMap(key => list(snapshot[key])).filter(i => i?.key).map(i => [i.key, i]));
  const reviewHref = projectId ? `${projectPath(projectId)}/review` : '/review';
  const body = rows.length ? `<ol class="need-list">${rows.map(r => needRow(r, r.key ? byKey.get(r.key) : null, reviewHref)).join('')}</ol>`
    : `<p class="empty empty-card">${loading ? 'Reading what needs you…' : sec?.known ? 'Nothing known needs you.' : 'Nothing needs you.'}</p>`;
  return section('needs-you', 'Needs you', body, `${countLabel(rows.length, sec?.known)}${loading ? ' · more loading' : ''}`);
}
function sinceView(sec, { projectId }) {
  const groups = list(sec?.plates).filter(g => !projectId || g.projectId === projectId);
  const window = sec?.window === 'last-visit' ? `since your last visit, ${stamp(sec.from)}` : sec?.window === 'last-run' ? `since ${stamp(sec.from)}` : `the last ${number(sec?.days) ?? 7} days`;
  const lines = groups.reduce((n, g) => n + list(g.lines).length, 0);
  const body = groups.length ? `<div class="since-plates">${groups.map(g => `<article class="since-plate p-card"><h3>${escape(g.projectName ?? g.projectId)}</h3><ul class="since-lines">${list(g.lines).map(l => `<li><time>${escape(String(l.date ?? '').slice(0, 10) || '—')}</time><span>${escape(l.text)}${typeof l.detail === 'string' && /^\/projects\/[a-z][a-z0-9-]{0,63}\/changes\/[a-z][a-z0-9-]{0,63}$/.test(l.detail) ? ` <a href="${escape(l.detail)}">See the change →</a>` : l.link && safeSourceLink(l.link) ? ` ${sourceLink(l.link, '↗')}` : ''}</span></li>`).join('')}</ul></article>`).join('')}</div>`
    : `<p class="empty empty-card">Nothing recorded in ${escape(window)}.</p>`;
  return section('since', 'Since you last looked', body, `${countLabel(lines, sec?.known)} · ${window}`);
}
// The ask box (phase 166, increment 3): a plate, the ask, and where it goes. The
// form previews through POST /api/projects/<id>/ask/preview; tonight's plan is
// then published only through the night-plan writer's own approval. A
// destination with no hosted writer answers with the CLI command, filled in.
const shellAsk = (command, ask) => String(command).replace('{ask}', ask ? `'${String(ask).replace(/'/g, `'\\''`)}'` : '"<ask>"');
function askForm(ask, { projectId }) {
  if (!ask || !list(ask.destinations).length) return '';
  const plates = list(ask.plates).filter(p => !projectId || p.id === projectId);
  if (!plates.length) return '<p class="meta quiet-line" data-ask-unavailable>No plate was read, so there is nothing to send an ask to yet.</p>';
  const chosen = list(ask.destinations).find(d => d.default) ?? ask.destinations[0];
  const plate = plates.length === 1 ? `<input type="hidden" name="plate" value="${escape(plates[0].id)}"><p class="meta">For ${escape(plates[0].name)}</p>`
    : `<label>Plate<select class="p-field" name="plate">${plates.map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('')}</select></label>`;
  const options = list(ask.destinations).map(d => `<label class="ask-choice"><input type="radio" name="destination" value="${escape(d.id)}" data-command="${escape(d.command)}"${d === chosen ? ' checked' : ''}> ${escape(d.title)}${d.hosted ? '' : ' <span class="meta">(a command to run)</span>'}</label>`).join('');
  return `<form class="ask-form p-card" data-ask-form novalidate><h3>Ask for something</h3>${plate}<label>Your ask<textarea class="p-field" name="ask" rows="2" maxlength="${number(ask.limit) ?? 200}" required placeholder="What should happen next?"></textarea></label><fieldset><legend>Send it to</legend>${options}</fieldset><p class="meta ask-command">In the plate&#39;s checkout: <code data-ask-command>${escape(shellAsk(chosen.command, ''))}</code></p><button type="submit" data-ask-preview-button>Preview</button><p class="meta">Nothing is queued until you approve its preview.</p><div data-ask-result role="status" aria-live="polite"></div></form>`;
}
/** The ask's preview or command, rendered by the browser from the preview response. */
export function renderAskResult(result) {
  if (!result || typeof result !== 'object') return '<p class="meta">The preview could not be read. Nothing was queued.</p>';
  const command = `<pre class="ask-code" tabindex="0"><code>${escape(result.command ?? '')}</code></pre>`;
  if (result.state === 'command') return `<div class="ask-result" data-ask-state="command"><p><strong>Run this in ${escape(result.project?.repo ?? 'the plate')}&#39;s checkout.</strong> ${escape(result.reason ?? '')}</p>${command}<p class="meta">Nothing was queued from here.</p></div>`;
  const p = result.preview ?? {}, item = result.item ?? {};
  return `<div class="ask-result" data-ask-state="preview" data-preview-id="${escape(p.id ?? '')}" data-digest="${escape(p.digest ?? '')}" data-public="${p.visibility === 'public'}"><p><strong>Adds to tonight&#39;s plan (${escape(p.date ?? '')})</strong> on <code>${escape(p.source?.branch ?? '')}</code>:</p><p class="ask-item">${escape(item.title ?? '')} <span class="meta">· ${escape(item.kind ?? '')} · lane ${escape(item.lane ?? '')} · id ${escape(item.id ?? '')}</span></p><details><summary>The exact plan file</summary><pre class="ask-code" tabindex="0"><code>${escape(p.content ?? '')}</code></pre><p class="meta">Commit: ${escape(String(p.commitMessage ?? '').split('\n')[0])} · digest <code>${escape(String(p.digest ?? '').slice(0, 12))}</code> · expires ${escape(stamp(p.expiresAt))}</p></details>${p.canSubmit === false ? `<p class="meta">Publishing tonight&#39;s plan is not enabled on this workspace. Run it in the checkout instead:</p>${command}` : `<label class="ask-approve"><input type="checkbox" data-ask-approve> I approve this exact plan${p.visibility === 'public' ? ' (this repository is public)' : ''}.</label><button type="button" data-ask-apply disabled>Publish to tonight&#39;s plan</button>`}<p class="meta">Or in the checkout: <code>${escape(result.command ?? '')}</code></p></div>`;
}
/** What became of an approved ask: the night-plan writer's own receipt. */
export function renderAskOperation(op) {
  const state = typeof op?.state === 'string' ? op.state : 'unconfirmed';
  const url = typeof op?.id === 'string' && /^[a-f0-9]{64}$/.test(op.id) && /^[a-z][a-z0-9-]{0,63}$/.test(op?.projectId ?? '') ? `/projects/${op.projectId}/night-plan/operations/${op.id}` : null;
  return `<p data-ask-operation="${escape(state)}"><strong>${state === 'committed' ? 'Queued for tonight.' : state === 'refused' ? 'Not queued.' : 'Not confirmed yet.'}</strong> ${escape(op?.reason ?? (state === 'committed' ? 'The plan branch has the new item; the night has not run it yet.' : ''))}${url ? ` <a href="${escape(url)}">See the receipt →</a>` : ''}</p>`;
}
function nextView(sec, { projectId }) {
  const queued = list(sec?.queued).filter(q => !projectId || q.projectId === projectId);
  const items = queued.length ? `<ul class="queue-list">${queued.map(q => `<li class="p-card"><span class="eyebrow">${q.queue === 'night' ? `Tonight${q.night ? ` · ${escape(q.night)}` : ''}` : 'Agent issue'} · ${escape(q.projectName ?? q.projectId)}</span><br>${escape(q.title)}${q.link && safeSourceLink(q.link) ? ` ${sourceLink(q.link, '↗')}` : ''}</li>`).join('')}</ul>` : '';
  const quiet = list(sec?.sources).filter(r => r.state !== 'read').map(r => `<p class="meta quiet-line" data-queue="${escape(r.id)}">${escape(r.title)}: not read here · <code>${escape(r.command)}</code></p>`).join('');
  return section('next', 'What should happen next?', `${askForm(sec?.ask, { projectId })}${items}${!queued.length && !quiet ? '<p class="empty empty-card">Nothing is queued.</p>' : ''}${quiet}`, countLabel(queued.length, sec?.known, 'queued'));
}
function platesView(sec, snapshot, { projectId }) {
  const strip = list(sec?.items).filter(p => !projectId || p.projectId === projectId);
  const state = id => list(snapshot.projects).find(p => p.id === id)?.state;
  const chip = p => { const loading = state(p.projectId) === 'loading', status = loading ? 'loading' : p.status, kind = loading ? 'loading' : /for you$/.test(p.status) ? 'yours' : p.status === 'broken' ? 'broken' : p.status === 'all clear' ? 'clear' : 'unread';
    return `<li><a class="plate-chip p-card" data-status="${kind}" data-focus="project-${escape(p.projectId)}" href="${escape(projectPath(p.projectId))}"><strong>${escape(p.name ?? p.projectId)}</strong><span>${escape(status)}${p.waiting ? ` · ${number(p.waiting) ?? 0} waiting` : ''}${p.inFlight ? ` · ${number(p.inFlight) ?? 0} in flight` : ''}</span></a></li>`; };
  const problems = list(sec?.problems?.details).filter(d => !projectId || d.projectId === projectId);
  const name = id => list(snapshot.projects).find(p => p.id === id)?.name || id || 'Workspace';
  const line = problems.length ? `<details class="source-problems" data-source-problems data-detail="source-problems"><summary data-focus="source-problems">${problems.length} source problem${problems.length === 1 ? '' : 's'}: ${escape([...new Set(problems.map(d => name(d.projectId)))].join(', '))}</summary><ul class="source-list">${problems.map(d => `<li><strong>${escape(name(d.projectId))}</strong> · ${escape(d.source)}: ${escape(d.reason)}</li>`).join('')}</ul></details>` : '';
  return section('plates', projectId ? 'Plate context' : 'Your plates', `${strip.length ? `<ul class="plate-strip">${strip.map(chip).join('')}</ul>` : '<p class="empty empty-card">No plates are available in this view.</p>'}${line}`, `${strip.length} ${strip.length === 1 ? 'plate' : 'plates'}`);
}
function footerView(snapshot) {
  const quota = snapshot.quota?.state === 'saving' ? 'Refresh is conserving the remaining GitHub allowance.' : snapshot.quota?.state === 'known' && number(snapshot.quota.remaining) !== null ? `GitHub allowance: ${snapshot.quota.remaining} requests remaining${snapshot.quota.resetAt ? ` · resets ${stamp(snapshot.quota.resetAt)}` : ''}.` : 'GitHub allowance unavailable.';
  const rows = list(snapshot.sections).filter(row => row && typeof row.id === 'string');
  return `<div class="home-footer meta" data-home-footer><p>${escape([snapshot.home?.footer, quota].filter(Boolean).join(' '))}</p>${rows.length ? `<details data-detail="read-elsewhere"><summary data-focus="read-elsewhere">Read elsewhere</summary><ul class="source-list" data-home-sections>${rows.map(sectionRow).join('')}</ul></details>` : ''}</div>`;
}
/** Pure, browser-safe rendering shared by initial HTML and explicit queued updates. */
export function renderHomeSnapshot(snapshot, { projectId = null } = {}) {
  const projects = list(snapshot.projects).filter(p => !projectId || p.id === projectId);
  const loading = projects.some(project => project.state === 'loading'), sec = id => list(snapshot.home?.sections).find(x => x?.id === id);
  const project = projectId ? projects[0] : null;
  if (!snapshot.home) return `<p class="empty empty-card">${loading ? 'Reading your plates…' : 'Home is reading its sources.'}</p>`;
  // A plate's own page also lists what waits on time or agents: home leaves it here (phase 166).
  const waiting = project ? [...list(snapshot.waiting), ...list(snapshot.walks).filter(w => w.ready === false)].filter(item => item.projectId === projectId) : [];
  return `${project ? `<div class="project-intro"><p class="intro">${escape(project.tagline || project.planning?.headline || project.repo)}</p><p class="meta">${escape(project.repo)} · ${escape(progress(project))}</p></div>` : ''}${needsYouView(sec('needs-you'), snapshot, { projectId, loading })}${sinceView(sec('since'), { projectId })}${nextView(sec('next'), { projectId })}${platesView(sec('plates'), snapshot, { projectId })}${project ? section('waiting', 'Waiting on time or agents', waiting.length ? `<div class="action-list">${waiting.map(item => actionCard(item, 'waiting')).join('')}</div>` : '<p class="empty empty-card">Nothing waits on time or agents.</p>', `${waiting.length}`) : ''}${project ? inFlightView(list(sec('plates')?.items).find(p => p?.projectId === projectId)?.waits) : ''}${project ? autonomyPanel(project) : ''}${footerView(snapshot)}`;
}
/** A plate's changes in flight (phase 158): the model's view (Your plates' row), as plates home --project prints it. */
function inFlightView(view) {
  if (!view) return '';
  const body = view.line ? `<p class="meta">${escape(view.line)}</p>` : !view.rows.length ? '<p class="empty empty-card">Nothing in flight.</p>'
    : `<div class="action-list">${view.rows.map(r => `<article class="attention-card waiting p-card" data-wait="${escape(r.state)}"><div class="eyebrow">${escape(r.words)} · ${escape(r.age)}${r.stale ? ' · past its target' : ''}${r.gaps ? ` · ${r.gaps} gap${r.gaps === 1 ? '' : 's'}` : ''}</div><h3>${escape(r.branch)}</h3><p class="next-line"><strong>Next</strong> ${escape(r.next)}</p></article>`).join('')}</div>`;
  return section('in-flight', escape(view.heading), `${body}${view.notes.length ? `<ul class="source-list">${view.notes.map(n => `<li>${escape(n)}</li>`).join('')}</ul>` : ''}`, view.count === null ? 'not read' : `${view.count}`);
}
function board(access, snapshot, project = null) {
  const projectId = project?.id, endpoint = projectId ? `/api/projects/${encodeURIComponent(projectId)}/home` : '/api/home';
  return `${projectId ? '<a class="back-link" href="/">← All plates</a>' : ''}<div class="home-heading"><div><div class="eyebrow">${escape(access.workspace.name)} · private workspace</div><h1>${project ? escape(project.name || project.id) : 'Home'}</h1><p class="home-intro">${project ? 'What needs you on this plate, and what it waits on.' : 'What needs you, what happened, and what is next.'}${project ? '' : ' <a href="/backlog" data-backlog-link>Every plate\'s work, in lanes →</a>'}</p></div><button class="quiet" type="button" data-refresh>Refresh sources</button></div><div data-review-start-slot>${renderReviewStart(snapshot,{projectId})}</div><div class="home-toolbar"><label>Search this view<input type="search" class="p-field" data-home-search placeholder="Plate or action" autocomplete="off"></label><label>Show<select class="p-field" data-home-filter><option value="all">Everything</option><option value="fix">Fix</option><option value="decide">Decide</option><option value="try">Try it</option></select></label></div><div class="refresh-notice" role="status" aria-live="polite"><span data-refresh-status>Updates are checked while this page is visible.</span><button type="button" data-apply-updates hidden>Show new updates</button></div><p class="meta" data-filter-status hidden></p><div id="home-snapshot" data-journal-scope="${escape(journalPreference(access,projectId||'fleet'))}" data-home-root data-initial-loading="${isLoadingOnly(snapshot,{projectId})}" data-cursor="${escape(snapshot.cursor)}" data-endpoint="${escape(endpoint)}" data-project-id="${escape(projectId || '')}">${renderHomeSnapshot(snapshot,{projectId})}</div><noscript><p>Live source reads and filters require JavaScript. Cached records and source links remain available above; enable JavaScript to load uncached project summaries.</p></noscript>`;
}
export const homeView = (access, snapshot) => snapshot ? page(access.workspace.name, board(access,snapshot), access.csrf, true, access) : page(access.workspace.name, `<div class="eyebrow">Workspace connected</div><h1>${escape(access.workspace.name)}</h1><p class="intro">Open a connected project. Its source summary is not available in this view yet.</p><h2>Plates you can access</h2>${access.projects.length ? `<ul class="cards">${access.projects.map(project => `<li><span class="badge">Access verified</span><h2><a href="${escape(projectPath(project.id))}">${escape(project.id)}</a></h2><p class="meta">${escape(project.repo)}</p></li>`).join('')}</ul>` : '<div class="panel empty">No plates are currently available for your account. Ask the workspace owner to check project access.</div>'}<p class="meta">Workspace source <code>${escape(access.sourceRevision?.slice(0,12) || 'unavailable')}</code></p>`, access.csrf, false, access);
export const projectView = (project, access, snapshot) => snapshot ? page(project.name || project.id, board(access,snapshot,project), access.csrf, true, access, project) : page(project.id, `<a href="/">← All plates</a><div class="panel"><div class="eyebrow">Project connected</div><h1>${escape(project.id)}</h1><p class="intro">${escape(project.repo)}</p><p>Your account, workspace membership and GitHub App all permit this project.</p>${sourceLink(`https://github.com/${project.repo}`, 'Open repository ↗')}</div>`, access.csrf, false, access, project);
// A source file over the workspace's per-file read bound is too large to open, not a failed connection (phase 153).
const tooLargeView = code => page('Too large to open', `<section class="signin"><div class="eyebrow">Source file</div><h1>This file is too large to open here.</h1><p>The workspace opens source files up to 256 KiB, and this one is over that limit. Nothing is wrong with your connection or your access. Open it on GitHub instead, or make the file smaller.</p><a class="button" href="/">Back to your workspace</a><p class="meta">Reference: ${escape(code)}</p></section>`);
// A page that needs a session says what happened and shows no reference code;
// its Sign in button returns to the page that was asked for (signIn is built by
// the server through the return-path check). Other errors keep their reference.
const signInRequiredView = (reason, signIn) => page('Sign in', `<section class="signin"><div class="eyebrow">Sign in</div><h1>${escape(signInStory(reason).title)}</h1><p>${escape(signInStory(reason).body)}</p><a class="button" href="${escape(signIn)}">Sign in</a></section>`);
export const errorView = (status, code, { reason = null, signIn = '/signin' } = {}) => status === 401 ? signInRequiredView(reason, signIn) : code === 'source_too_large' ? tooLargeView(code) : page(status === 404 ? 'Unavailable' : 'Unable to continue', `<section class="signin"><div class="eyebrow">${status === 404 ? 'Unavailable' : 'Access check'}</div><h1>${status === 404 ? 'This page is unavailable.' : 'We couldn’t complete that request.'}</h1><p>${status === 503 ? 'A required connection is unavailable. Your private workspace stays protected. Try again when the connection is restored.' : 'Return to your workspace or sign in with an approved account.'}</p><a class="button" href="/signin">Sign in</a><p class="meta">Reference: ${escape(code)}</p></section>`);
