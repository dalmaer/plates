import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeView, projectView, renderHomeSnapshot, safeSourceLink, isLoadingOnly, signinView, errorView, styles } from '../lib/web/views.mjs';
import { homeSnapshot, homeSections } from '../lib/work-items.mjs';
const access = { workspace:{name:'Acme workspace'},projects:[{id:'studio',repo:'acme/studio'}],sourceRevision:'a'.repeat(40),csrf:'fake-csrf-acme' };
const TODAY = '2026-10-21';
const action = (id,kind,projectId='studio',more={}) => ({id,projectId,projectName:projectId === 'studio' ? 'Acme Studio' : 'Acme API',kind,itemKind:kind === 'walk' ? 'walk' : kind === 'decision' ? 'step' : 'phase',ref:id,title:`Acme ${kind} ${id}`,why:'Source asks for an owner observation.',next:'Read the current source.',link:'https://github.com/acme/studio/blob/main/docs/phases/1.md',phase:'1',ready:true,details:{ask:'Does publishing work?',why:'A human uses the real surface.',look:'Open the preview.',then:'Record what happened.',takes:'About five minutes',choices:['Verified','Needs changes','Cannot check yet']},...more});
const plate = (more={}) => ({id:'studio',repoId:100,repo:'acme/studio',name:'Acme Studio',tagline:'Publishing, made reliable.',stack:['node','web'],version:'0.8.32',revision:'b'.repeat(40),readAt:'2026-10-21T15:59:00.000Z',state:'complete',gaps:[],
  planning:{source:'files',built:8,total:12,livedIn:3,headline:'Make publishing reliable on every screen',goals:[],next:'Review publishing on a phone'},
  decisions:[action('decision-one','decision',undefined,{since:'2026-10-02'})],walks:[action('walk-one','walk',undefined,{since:'2026-10-01'}),action('walk-later','walk',undefined,{ready:false})],waiting:[action('wait-one','waiting')],reviews:[],
  changes:[{id:'studio:phase-change:4',projectId:'studio',projectName:'Acme Studio',title:'Publish from a phone',date:'2026-10-20',revision:'b'.repeat(40),link:'https://github.com/acme/studio/blob/main/docs/phases/4.md',kind:'phase',media:null,previewUrl:null,acceptance:'source claim'},
    {id:'studio:phase-change:2',projectId:'studio',projectName:'Acme Studio',title:'An old Acme phase',date:'2026-09-01',revision:'b'.repeat(40),link:null,kind:'phase',media:null,previewUrl:null,acceptance:'source claim'}],
  daily:{state:'read',date:'2026-10-20',from:'docs/night/2026-10-20.json',counts:{planned:0,running:0,done:2,failed:1,skipped:0,'left-alone':0},readiness:{why:'every build item is terminal'}},...more});
/** What /api/home returns for these plates: the model's own snapshot, built as the server builds it. */
function snapshot(projects=[plate()],options={}) {
  return {schema:1,cursor:'a'.repeat(64),cursorState:'initial',generatedAt:'2026-10-21T16:00:00.000Z',...homeSnapshot(projects,{sections:homeSections(),can:{form:'web'},today:TODAY,...options}),quota:{remaining:150,resetAt:'2026-10-21T17:00:00.000Z',state:'known'}};
}
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
const headings = html => [...html.matchAll(/<h2 id="[^"]+">([^<]+)<\/h2>/g)].map(m => m[1]);

// Phase 166, increment 2: the hosted page is the model's four sections, in order, with its items and counts.
test('the page shows the four sections in order with the model\'s items and counts', () => {
  const data=freeze(snapshot()), before=JSON.stringify(data), html=homeView(access,data), four=data.home.sections, sec=id=>four.find(s=>s.id===id);
  assert.deepEqual(headings(html), ['Needs you','Since you last looked','What should happen next?','Your plates']);
  // Needs you: one row per model row, in the model's order, each with its one verb.
  const rows=[...html.matchAll(/<li class="need p-card" data-record="([^"]+)" data-verb="([^"]+)"[\s\S]*?<span class="verb[^"]*">([^<]+)<\/span>[\s\S]*?<h3>([^<]+)<\/h3>/g)].map(m=>[m[2],m[3],m[4]]);
  assert.deepEqual(rows, sec('needs-you').items.map(r=>[r.verb,r.label,r.title]));
  assert.deepEqual(rows.map(r=>r[0]), ['fix','decide','try'], 'the fixture has one of each, in rank');
  assert.match(html, new RegExp(`id="needs-you-title">Needs you</h2><span class="meta">${sec('needs-you').count}</span>`));
  // The Start panel counts what Needs you counts, the Fix with no answers too; its minutes and session cover the answerable ones.
  assert.ok(sec('needs-you').count > data.docket.length, 'the fixture has a row with no answers');
  assert.equal(Number(/<p class="review-start p-card"><strong>(\d+) need/.exec(html)[1]), sec('needs-you').count);
  // Phase 173's answers are kept: each answerable row names them and opens the review session.
  assert.match(html,/data-answers>Answers: Verified · Needs changes · Cannot check yet · Not yet|data-answers>Answers: [^<]*Not now/);
  assert.match(html,/<a href="\/review" data-focus="answer-need-studio:walk:walk-one">Answer →<\/a>/);
  assert.match(html,/Guided walks →/); assert.match(html,/What to check/);
  // Nothing waiting on time or agents is on home: it is on the plate's page.
  assert.doesNotMatch(html,/Acme waiting wait-one|Acme walk walk-later/);
  // Since you last looked: grouped by plate, only inside the window, with the count.
  assert.match(html,new RegExp(`id="since-title">Since you last looked</h2><span class="meta">${sec('since').count} · the last 7 days</span>`));
  assert.match(html,/<h3>Acme Studio<\/h3><ul class="since-lines"><li><time>2026-10-20<\/time><span>Phase 4 built: Publish from a phone/);
  assert.match(html,/The night of 2026-10-20: 2 done, 1 failed/); assert.doesNotMatch(html,/An old Acme phase/);
  // What should happen next?: the web cannot read what is queued yet; each source is one quiet line with its command.
  assert.match(html,/<p class="meta quiet-line" data-queue="night">Tonight&#39;s plan: not read here · <code>plates goodnight<\/code><\/p>/);
  assert.match(html,/data-queue="agent">Open agent issues: not read here · <code>plates home<\/code>/);
  assert.match(html,/id="next-title">What should happen next\?<\/h2><span class="meta">0 known queued<\/span>/);
  // Your plates: one compact chip each, with the model's status.
  assert.match(html,/<a class="plate-chip p-card" data-status="broken" data-focus="project-studio" href="\/projects\/studio"><strong>Acme Studio<\/strong><span>broken · 2 waiting<\/span><\/a>/);
  // The hedges are one footer line, after the four.
  assert.ok(html.indexOf('data-home-footer') > html.indexOf('id="plates"'));
  assert.doesNotMatch(html,/At least|in this source read|Inspection only/);
  assert.equal(JSON.stringify(data),before,'rendering never mutates the snapshot');
  assert.match(html,/data-cursor="a{64}"/); assert.match(html,/data-endpoint="\/api\/home"/);
  assert.match(html,/<script type="module" src="\/assets\/home-client.mjs"><\/script>/);
  assert.doesNotMatch(html,/<script(?![^>]*src=)|\sonclick=|\soninput=/);
});
test('source problems sit under Your plates, never above Needs you, and never mean no work', () => {
  const unread={...plate(),state:'unavailable',gaps:[{source:'project',reason:'Read unavailable'}],decisions:[],walks:[],waiting:[],changes:[],daily:null,planning:{source:'unknown',built:null,total:null,livedIn:null}};
  const html=renderHomeSnapshot(snapshot([unread]));
  assert.match(html,/Nothing known needs you\./); assert.doesNotMatch(html,/Nothing needs you\./);
  assert.match(html,/id="needs-you-title">Needs you<\/h2><span class="meta">0 known<\/span>/);
  const problems=html.match(/<details class="source-problems"[\s\S]*?<\/details>/)[0];
  assert.match(problems,/1 source problem: Acme Studio/); assert.match(problems,/<strong>Acme Studio<\/strong> · project: Read unavailable/);
  assert.ok(html.indexOf('source-problems') > html.indexOf('id="plates"'), 'under Your plates');
  assert.match(html,/data-status="unread"[^>]*><strong>Acme Studio<\/strong><span>not read<\/span>/);
  assert.match(html,/Counts marked &quot;known&quot; are what was read/);
});
test('all source text is escaped and only explicit HTTPS GitHub links become anchors', () => {
  const attack='<img src=x onerror="alert(1)">', p=plate();
  p.decisions[0]={...p.decisions[0],title:attack,id:'bad" onclick="alert(1)',ref:'bad" onclick="alert(1)',link:'javascript:alert(1)',details:{...p.decisions[0].details,ask:attack}};
  p.changes[0].link='https://github.com.evil.test/acme'; p.name=attack; p.repo='evil.test/repo'; p.gaps=[{source:attack,reason:attack}]; p.state='partial';
  const html=homeView({...access,workspace:{name:attack}},snapshot([p]));
  assert.doesNotMatch(html,/<img|href="javascript:|href="https:\/\/github\.com\.evil| onclick="/);
  assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html,/Source link unavailable/);
  for(const value of ['javascript:alert(1)','http://github.com/acme','https://github.com.evil.test/acme','https://fake:secret@github.com/acme','https://github.com:123/acme','//github.com/acme']) assert.equal(safeSourceLink(value),null);
  assert.equal(safeSourceLink('https://github.com/acme/studio/blob/main/README.md'),'https://github.com/acme/studio/blob/main/README.md');
});
test('a plate\'s page keeps what waits on time or agents, and only that plate\'s rows', () => {
  const api={...plate({id:'api',repo:'acme/api',name:'Acme API'}),decisions:[action('api-decision','decision','api')],walks:[],waiting:[],changes:[],daily:null};
  const html=projectView({id:'studio',repo:'acme/studio'},access,snapshot([plate(),api]));
  assert.match(html,/data-endpoint="\/api\/projects\/studio\/home"/); assert.match(html,/>Plate context<\/h2>/);
  assert.match(html,/>Waiting on time or agents<\/h2>/); assert.match(html,/Acme waiting wait-one/); assert.match(html,/Acme walk walk-later/);
  assert.doesNotMatch(html,/Acme decision api-decision/); assert.match(html,/Acme decision decision-one/);
  assert.match(html,/href="\/projects\/studio\/review" data-focus="answer-/);
});
test('empty/fallback pages, account controls, keyboard affordances and reduced-motion styles remain usable', () => {
  assert.match(homeView(access),/Plates you can access/); assert.match(projectView(access.projects[0],access),/Project connected/);
  assert.match(signinView('fake-csrf-acme'),/Continue with GitHub/); assert.match(errorView(401,'acme'),/Please sign in/);
  const html=homeView(access,snapshot()); assert.match(html,/aria-live="polite"/); assert.match(html,/Skip to content/);
  assert.match(html,/<label>Search this view<input type="search"/); assert.match(html,/<summary data-focus=/);
  assert.match(html,/<option value="fix">Fix<\/option><option value="decide">Decide<\/option><option value="try">Try it<\/option>/);
  assert.equal((html.match(/fake-csrf-acme/g)||[]).length,1); assert.match(html,/method="post" action="\/api\/auth\/logout"/);
  assert.match(styles,/@media\(max-width:400px\)/); assert.match(styles,/@media\(max-width:600px\)\{\.need\{grid-template-columns:minmax\(0,1fr\)\}/); assert.match(styles,/prefers-reduced-motion:reduce/);
});

// Palette contrast, in both themes and over the wash, is tests/web-design.test.mjs.

test('uncached projects show loading, never empty counts', () => {
  const loading={...plate(),state:'loading',planning:{source:'unknown',built:null,total:null,livedIn:null},readAt:null,revision:null,decisions:[],walks:[],waiting:[],changes:[],daily:null,gaps:[{source:'project',reason:'Project sources are loading within the bounded fleet refresh.'}]};
  const html=homeView(access,snapshot([loading]));
  assert.match(html,/Reading what needs you…/); assert.match(html,/0 known · more loading/);
  assert.match(html,/data-status="loading"[^>]*><strong>Acme Studio<\/strong><span>loading<\/span>/);
  assert.doesNotMatch(html,/Nothing needs you\.|Progress unavailable/);
  // Without the model (an older cached response), the page says it is reading, never empty work.
  assert.match(renderHomeSnapshot({projects:[loading]}),/Reading your plates…/);
});
test('a mixed cached and loading view keeps known human work', () => {
  const html=renderHomeSnapshot(snapshot([plate(),{id:'api',repo:'acme/api',name:'Acme API',state:'loading',planning:{},decisions:[],walks:[],waiting:[],changes:[],gaps:[]}]));
  assert.match(html,/Acme decision decision-one/); assert.match(html,/ known · more loading<\/span>/);
});

test('automatic first-render eligibility excludes partial data and any real card in a loading view', () => {
  const data=snapshot();
  assert.equal(isLoadingOnly(data),false); assert.match(homeView(access,data),/data-initial-loading="false"/);
  data.decisions=[]; data.walks=[]; data.waiting=[]; data.changes=[];
  Object.assign(data.projects[0],{state:'loading',decisions:[],walks:[],waiting:[],changes:[]});
  assert.equal(isLoadingOnly(data),true); assert.match(homeView(access,data),/data-initial-loading="true"/);
  data.projects[0].state='partial'; assert.equal(isLoadingOnly(data),false);
  data.projects[0].state='loading'; data.decisions=[action('first','decision')]; assert.equal(isLoadingOnly(data),false);
  data.decisions=[]; data.projects[0].walks=[action('first-walk','walk')]; assert.equal(isLoadingOnly(data),false);
  data.projects=[]; assert.equal(isLoadingOnly(data),false);
});
test('row text renders source markdown, never raw markers or markup', () => {
  const p=plate();
  p.decisions[0].why='**`phases_stuck`** (outside) — move *phase 0* and set `since:`. <img src=x onerror=alert(1)> **`a<b`**';
  p.decisions[0].next='Inspect **the source** first.';
  const html=renderHomeSnapshot(snapshot([p])), card=html.match(/<li class="need p-card" data-record="need-studio:step:decision-one"[\s\S]*?<\/li>(?=<li class="need|<\/ol>)/)[0];
  assert.match(card,/<strong><code>phases_stuck<\/code><\/strong> \(outside\)/);
  assert.match(card,/<em>phase 0<\/em>/); assert.match(card,/<code>since:<\/code>/);
  assert.match(card,/<strong><code>a&lt;b<\/code><\/strong>/); assert.match(card,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(card,/<strong>Next<\/strong> Inspect <strong>the source<\/strong> first\./);
  assert.doesNotMatch(card.replace(/<[^>]+>/g,''),/\*\*|`/);
});

test('lessons waiting are named and reviews at their limit are a fix', async () => {
  const { projectReviews } = await import('../lib/web/projects.mjs');
  const platesOf = (id, name) => ({ ...plate(), id, repo: `acme/${id}`, name, reviewSource: { repo: `acme/${id}`, reviewers: [], rounds: 3 }, decisions: [], walks: [], waiting: [], changes: [], reviews: [], daily: null });
  // Phase 133's verdicts and the merge rule's counts, read once per plate.
  const reads = {
    'acme/studio': { prs: [], rounds: [{ number: 12, title: 'Acme glue', url: 'https://github.com/acme/studio/pull/12', author: 'acme-owner', rounds: 3, open: 3, fixFirst: 1, track: 1, unsorted: 1,
      findings: [{ round: 1, path: 'a.js', line: 1, severity: 2 }, { round: 2, path: 'a.js', line: 3, severity: 2 }, { round: 3, path: 'b.js', line: 1, severity: 3 }] }] },
    'acme/api': { prs: [{ number: 4, title: 'Acme hooks', state: 'open', url: 'https://github.com/acme/api/pull/4', author: 'app/claude', unanswered: 2, oldest: '2026-10-01' }], rounds: [{ number: 13, title: 'Acme tunnel', url: 'https://github.com/acme/api/pull/13', author: 'acme-owner', rounds: 6, open: 0, fixFirst: 0, track: 2, unsorted: 0,
      findings: [{ round: 1, path: 'a.js', line: 1, severity: 1 }, { round: 1, path: 'b.js', line: 1, severity: 2 }, { round: 2, path: 'c.js', line: 1, severity: 2 }, { round: 3, path: 'd.js', line: 1, severity: 3 },
        { round: 4, path: 'a.js', line: 1, severity: 3 }, { round: 5, path: 'a.js', line: 1, severity: 3 }, { round: 6, path: 'a.js', line: 1, severity: 3 }] }] },
  };
  const read = async source => reads[source.repo];
  const projects = [await projectReviews(platesOf('studio', 'Acme Studio'), { login: 'acme-owner', read }), await projectReviews(platesOf('api', 'Acme API'), { login: 'acme-owner', read })];
  const data = snapshot(projects);
  assert.deepEqual(data.reviews.map(r => [r.projectId, r.review.number, r.review.verdict]), [['api', 13, 'extended: progress'], ['api', 4, null], ['studio', 12, 'stopped: repeating']]);
  assert.deepEqual(data.reviews.find(r => r.review.number === 12).review.mergeRule, { fixFirst: 1, track: 1, unsorted: 1 });
  // Fleet-wide: every plate's reviews, with the verdict and the counts; and the lessons row with its reason and command.
  const fleet = renderHomeSnapshot(data);
  // Phase 166: reviews are Needs you rows; one at its round limit is a Fix, one with findings unanswered a Decide.
  assert.match(fleet, /data-verb="fix"[\s\S]*?Round 3 of 3 · Stopped: repeating/);
  assert.match(fleet, /Round 3 of 3 · Stopped: repeating · 1 fix first · 1 track · 1 unsorted/);
  assert.match(fleet, /Round 6 of 6 · Extended: progress · 0 fix first · 2 track · 0 unsorted/);
  assert.match(fleet, /data-home-section="lessons"><strong>Lessons waiting<\/strong> <span class="meta">Unavailable here · plates-inbox is not readable by the App yet<\/span><p class="meta">Read it with <code>plates learn<\/code>/);
  // Per plate: only that plate's reviews, and the lessons row still named.
  const studio = renderHomeSnapshot(data, { projectId: 'studio' });
  assert.match(studio, /Stopped: repeating/); assert.doesNotMatch(studio, /Extended: progress|Acme hooks/);
  assert.match(studio, /data-home-section="lessons"/);
  // Without the App's Pull requests read, reviews are a named gap, never an empty "nothing waiting".
  const unread = await projectReviews(platesOf('studio', 'Acme Studio'), { read: null, unavailable: 'The Plates GitHub App has no Pull requests read permission on this plate.' });
  assert.deepEqual(unread.reviews, []); assert.equal(unread.state, 'partial');
  assert.match(renderHomeSnapshot(snapshot([unread])), /reviews: The Plates GitHub App has no Pull requests read permission on this plate\./);
});
