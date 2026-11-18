// Home is projects that say why and decisions you answer in place (plates phase
// 196, increment 1). Acceptance 1: a chip per project; a green one says nothing
// beyond its name, a yellow or red one its most urgent reason, then +N; red sorts
// before yellow before green. Acceptance 2: every Needs-you card answers in place
// through the docket's answer path (POST /api/home/answer, with its session, origin
// and CSRF rule), and production behind main is a card whose Deploy is the checked
// promote's command only. Both forms render the one model (lib/work-items.mjs
// homeGlance): the site from home.glance, plates home from the same object.
// Synthetic Acme fixtures throughout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { homeSnapshot, homeSections, GLANCE_TONES, DEPLOY_WHERE } from '../lib/work-items.mjs';
import { homeView, renderHomeSnapshot, renderGlance } from '../lib/web/views.mjs';
import { glanceLines, homeText } from '../lib/home.mjs';
import { createCardAnswers, cardStatus, leaveGuard } from '../lib/web/home-client.mjs';
import { createWebSender } from '../lib/web/review-client.mjs';
import { projectHarness } from './helpers/web-projects.mjs';
import { createWebService } from '../lib/web/server.mjs';

const TODAY = '2026-11-17', SHA = n => String(n).repeat(40).slice(0, 40);
const access = { workspace: { name: 'Acme workspace' }, projects: [], sourceRevision: 'a'.repeat(40), csrf: 'fake-csrf-acme' };
const base = (id, name, more = {}) => ({ id, repo: `acme/${id}`, name, state: 'complete', gaps: [], changes: [], decisions: [], walks: [], reviews: [], waiting: [], ...more });
const walk = (projectId, projectName, ref, more = {}) => ({ id: `${projectId}:walk:${ref}`, projectId, projectName, kind: 'walk', itemKind: 'walk', ref, phase: ref, ready: true, since: '2026-11-01',
  title: `Acme walk ${ref}`, why: 'A person uses the **real** surface.', link: `https://github.com/acme/${projectId}/blob/main/docs/phases/${ref}.md`,
  details: { ask: `Does the Acme ${ref} flow work?`, why: 'Only a person can see it.', look: 'Open the preview.', takes: 'About 2 minutes', choices: ['Works', 'Needs changes'], recommend: 'Works' }, ...more });
const step = (projectId, projectName, ref) => ({ id: `${projectId}:step:${ref}`, projectId, projectName, kind: 'decision', itemKind: 'step', ref, phase: ref, title: `Acme step ${ref}: grant the deploy key`, why: 'An agent stopped on a ⚑ step.' });
const behind = (ahead = 2) => ({ state: 'behind', main: SHA(1), production: { sha: SHA(2), at: '2026-11-15T10:00:00.000Z', checkedAt: '2026-11-17T09:00:00.000Z', deployment: 'dpl_acme' }, ahead, why: null });
const current = () => ({ state: 'current', main: SHA(1), production: { sha: SHA(1), at: '2026-11-15T10:00:00.000Z', checkedAt: '2026-11-17T09:00:00.000Z', deployment: 'dpl_acme' }, ahead: 0, why: null });
const redMain = { state: 'read', items: [{ state: 'ci', next: 'main is red: Acme CI failed on main', since: '2026-11-16T00:00:00Z', branch: 'main', stale: false, gaps: 0 }], more: 0, tested: null, wip: [], gaps: { count: 0 }, source: { readAt: '2026-11-17T00:00:00Z', revision: SHA(3) } };

/** Five Acme plates, one per kind of reason, plus one in step: given out of order, so the sort is the model's. */
function plates() {
  return [
    base('docs', 'Acme Docs', { release: current() }),
    base('api', 'Acme API', { release: behind(2), decisions: [step('api', 'Acme API', '7')], walks: [walk('api', 'Acme API', '8')] }),
    base('studio', 'Acme Studio', { waits: redMain, release: behind(1), walks: [walk('studio', 'Acme Studio', '3')] }),
    base('anvils', 'Acme Anvils', { reviews: [{ id: 'anvils:review:12', projectId: 'anvils', projectName: 'Acme Anvils', kind: 'review', itemKind: 'review', ref: '12', title: 'Acme anvils PR #12', why: 'Round 3 of 3.', link: 'https://github.com/acme/anvils/pull/12', review: { number: 12, rounds: 3, limit: 3, verdict: 'stopped: repeating' } }] }),
    base('lab', 'Acme Lab', { state: 'unavailable', gaps: [{ source: 'project', reason: 'The App cannot read acme/lab.' }] }),
  ];
}
const checks = { checks: { items: [{ plate: 'docs', kind: 'check', ref: 'D-4', title: 'Acme decision D-4 is past its check date', why: 'checkBy 2026-11-10 passed.', waits: 'owner', since: '2026-11-10' }] } };
function snapshot(projects = plates(), { sections = homeSections(), can = { form: 'web' } } = {}) {
  return { schema: 1, cursor: 'c'.repeat(64), cursorState: 'initial', generatedAt: `${TODAY}T12:00:00.000Z`, ...homeSnapshot(projects, { sections, can, today: TODAY }), quota: { state: 'unknown' } };
}

// ---- Acceptance 1: chips --------------------------------------------------------------
test('a chip per project: green says nothing, yellow and red say the most urgent reason then +N, trouble first', () => {
  const data = snapshot(plates(), { sections: homeSections(checks), can: { form: 'cli' } }), { chips } = data.home.glance;
  // Within a tone, the projects keep their order.
  assert.deepEqual(chips.map(c => [c.projectId, c.tone]), [['studio', 'red'], ['docs', 'yellow'], ['api', 'yellow'], ['anvils', 'yellow'], ['lab', 'yellow']]);
  for (let i = 1; i < chips.length; i++) assert.ok(GLANCE_TONES.indexOf(chips[i - 1].tone) <= GLANCE_TONES.indexOf(chips[i].tone), 'red, then yellow, then green');
  const by = Object.fromEntries(chips.map(c => [c.projectId, c]));
  // Main's checks failing outranks production behind main and the walk; the rest are counted.
  assert.deepEqual([by.studio.reason, by.studio.more], ['Main\'s checks are failing', 2]);
  assert.deepEqual(by.studio.reasons.map(r => r.text), ['Main\'s checks are failing', 'Production 1 behind main', 'A decision waits on you']);
  // An agent waiting on you (a ⚑ step) outranks production behind main.
  assert.deepEqual(by.api.reasons.map(r => r.text), ['An agent is waiting on you', 'Production 2 behind main', 'A decision waits on you']);
  assert.equal(by.anvils.reason, 'A review is at its limit');
  assert.equal(by.docs.reason, 'A decision is past its check date', 'production at main says nothing; the late check does');
  // A plate that could not be read says so: never green.
  assert.equal(by.lab.reason, 'Not read: its sources');
  // In step: green, no reason, nothing counted.
  const calm = snapshot([base('docs', 'Acme Docs', { release: current() })]).home.glance;
  assert.deepEqual(calm.chips, [{ projectId: 'docs', name: 'Acme Docs', tone: 'green', reason: null, more: 0, reasons: [] }]);
  assert.deepEqual(calm.cards, []);
});

test('the chips render as the model says, and the terminal prints the same chips', () => {
  const data = snapshot(), html = renderGlance(data), chips = data.home.glance.chips;
  const drawn = [...html.matchAll(/<a class="glance-chip" data-tone="(\w+)" data-chip="([^"]+)"[^>]*><span class="glance-dot" aria-hidden="true"><\/span><span class="glance-chip-text"><strong>([^<]+)<\/strong>(?:<span class="glance-reason">([^<]+?)(?: <span class="glance-more">\+(\d+)<\/span>)?<\/span>)?/g)]
    .map(m => [m[2], m[1], m[3], m[4]?.replaceAll('&#39;', "'") ?? null, Number(m[5] ?? 0)]);
  assert.deepEqual(drawn, chips.map(c => [c.projectId, c.tone, c.name, c.reason, c.more]));
  // A green chip carries its name and nothing visible beyond it.
  const green = snapshot([base('docs', 'Acme Docs', { release: current() })]);
  assert.match(renderGlance(green), /<a class="glance-chip" data-tone="green" data-chip="docs" data-focus="chip-docs" href="\/projects\/docs"><span class="glance-dot" aria-hidden="true"><\/span><span class="glance-chip-text"><strong>Acme Docs<\/strong><span class="sr-only">In step<\/span><\/span><\/a>/);
  // Each chip opens its project.
  for (const c of chips) assert.match(html, new RegExp(`data-chip="${c.projectId}" data-focus="chip-${c.projectId}" href="/projects/${c.projectId}"`));
  // The terminal: one line per chip, in the same order, with the same words.
  const lines = glanceLines(data.home.glance, data);
  assert.deepEqual(lines.slice(1, 1 + chips.length), chips.map(c => `  ${c.tone.padEnd(6)} ${c.name}${c.reason ? `: ${c.reason}${c.more ? ` +${c.more}` : ''}` : ''}`));
  assert.equal(lines[1], '  red    Acme Studio: Main\'s checks are failing +2');
  assert.match(homeText(data), /^ {2}green {2}Acme Docs$|^ {2}yellow Acme Docs/m);
});

// ---- Acceptance 2: cards answer in place ----------------------------------------------
test('Needs you: one card per decision, the recommended answer filled, a one-line why and More; nothing when nothing waits', () => {
  const data = snapshot(plates(), { can: { form: 'web', decisionWrites: true } }), { cards } = data.home.glance, html = renderHomeSnapshot(data);
  // What agents wait on first, then production behind main, then the rest of the docket.
  // (A review at its round limit is one an agent waits on.)
  assert.deepEqual(cards.map(c => c.key), ['api:step:7', 'anvils:review:12', `api:deploy:${SHA(1)}`, `studio:deploy:${SHA(1)}`, 'api:walk:8', 'studio:walk:3']);
  const card = cards.find(c => c.key === 'api:walk:8');
  assert.equal(card.question, 'Does the Acme 8 flow work?'); assert.equal(card.why, 'A person uses the **real** surface.'); assert.equal(card.recommended, 'choice-works');
  const li = html.match(/<li class="glance-card p-card" data-card="api:walk:8"[\s\S]*?<\/li>(?=<li class="glance-card|<\/ol>)/)[0];
  assert.match(li, /<p class="glance-project">Acme API<\/p><h3 class="glance-question">Does the Acme 8 flow work\?<\/h3><p class="glance-why">A person uses the <strong>real<\/strong> surface\.<\/p>/, 'markdown renders, no raw **');
  assert.match(li, /<summary data-focus="more-api:walk:8">More<\/summary><dl class="detail-list"><div><dt>Item<\/dt><dd>Acme walk 8<\/dd><\/div><div><dt>Why you<\/dt><dd>Only a person can see it\.<\/dd>/);
  assert.match(li, /<button type="button" class="glance-answer" data-recommended="true" data-answer="choice-works" data-label="Works"/);
  assert.match(li, /<button type="button" class="glance-answer" data-answer="choice-needs-changes" data-label="Needs changes"/);
  assert.match(li, /data-answer="not-now" data-label="Not now" data-needs-why="never" data-writer="not now"/);
  assert.match(li, /<div class="glance-status" data-card-status role="status" aria-live="polite"><\/div>/);
  assert.match(homeView(access, data), new RegExp(`data-needs-count>${cards.length} need you</a>`));
  // Nothing waiting: the empty sentence, no list, the header count hidden.
  const calm = snapshot([base('docs', 'Acme Docs', { release: current() })]), page = homeView(access, calm);
  assert.doesNotMatch(page, /id="needs-you"|glance-empty/); assert.doesNotMatch(page, /glance-cards|glance-card /);
  assert.match(page, /<a class="nav-needs" href="#needs-you" data-needs-count hidden>0 need you<\/a>/);
  // The terminal prints the same cards, with the command that answers each.
  const text = glanceLines(data.home.glance, data).join('\n');
  assert.match(text, /^ {2}Acme API · Does the Acme 8 flow work\?\n {6}A person uses the real surface\.\n {6}Works \(recommended\) \| Needs changes \| Not now\n {6}answer: plates home --answer api:walk:8 <choice-works\|choice-needs-changes\|not-now>/m);
});

test('Deploy runs the checked promote only: the card is its command, in no write route, and only while production is behind main', () => {
  const data = snapshot(), deploy = data.home.glance.cards.find(c => c.key === `studio:deploy:${SHA(1)}`);
  assert.deepEqual(deploy, { key: `studio:deploy:${SHA(1)}`, kind: 'deploy', label: 'Deploy', projectId: 'studio', projectName: 'Acme Studio', question: 'Production is 1 commit behind main',
    why: `production ${SHA(2).slice(0, 7)} is 1 commit behind main ${SHA(1).slice(0, 7)} (deployed 2026-11-15)`, answers: [], recommended: null,
    more: [{ label: 'Where it runs', text: DEPLOY_WHERE }], link: null, deploy: { command: `plates promote ${SHA(1)}`, sha: SHA(1), where: DEPLOY_WHERE }, minutes: null });
  // Not an answer: the docket never holds it, so /api/home/answer can never be asked to deploy.
  assert.ok(!data.docket.some(e => e.key === deploy.key));
  const li = renderHomeSnapshot(data).match(new RegExp(`<li class="glance-card p-card" data-card="studio:deploy:${SHA(1)}"[\\s\\S]*?</li>(?=<li class="glance-card|</ol>)`))[0];
  assert.match(li, new RegExp(`<code class="glance-command" data-deploy-command>plates promote ${SHA(1)}</code><button type="button" class="glance-answer" data-recommended="true" data-copy="plates promote ${SHA(1)}" data-focus="copy-studio:deploy:${SHA(1)}">Copy command</button>`));
  assert.match(li, /Runs on your Mac, in the project&#39;s checkout\. plates promote deploys only a commit on the tested ref whose checks passed/);
  assert.doesNotMatch(li, /<form|data-answer=|\/api\//);
  // At main, unknown or never deployed: no card and no main → production row on Home.
  for (const release of [current(), { state: 'none', main: SHA(1), production: null, ahead: null, why: 'no production deploy recorded' }, { state: 'unknown', main: SHA(1), production: null, ahead: null, why: 'the deploy records could not be read' }]) {
    const one = snapshot([base('studio', 'Acme Studio', { release })]);
    assert.deepEqual(one.home.glance.cards, []);
    assert.doesNotMatch(renderHomeSnapshot(one), /plate-release|data-deploy-command/);
  }
  assert.equal(snapshot([base('studio', 'Acme Studio', { release: { state: 'unknown', main: SHA(1), production: null, ahead: null, why: 'x' } })]).home.glance.chips[0].reason, 'Not read: production');
  // The terminal prints the same command.
  assert.match(glanceLines(data.home.glance, data).join('\n'), new RegExp(`^ {6}deploy: plates promote ${SHA(1)}$`, 'm'));
});

test('a card\'s answer is held with Undo, then sent through the docket\'s answer path with the page\'s CSRF token', async () => {
  const sent = [], timers = [], fetch = async (url, options) => {
    const body = JSON.parse(options.body); sent.push([url, body]);
    if (url === '/api/home/answer' && body.answer === 'choice-works') return Response.json({ schema: 1, state: 'preview', preview: { id: 'p'.repeat(64), canSubmit: true, digest: null, consequence: 'Records Works on Acme walk 3.', operationUrl: '/projects/api/operations/o1' } });
    if (url === '/api/home/answer') return Response.json({ schema: 1, state: 'written', until: '2026-11-24' });
    if (/^\/api\/projects\/[a-z]+\/decisions\/apply$/.test(url)) return Response.json({ state: 'committed', receipt: { url: 'https://github.com/acme/api/commit/abc' } });
    return new Response('{}', { status: 404 });
  };
  const sender = createWebSender({ fetch, csrf: 'fake-csrf-acme' }), changes = [];
  const answers = createCardAnswers({ send: sender.send, prepare: sender.prepare, holdMs: 5000, timers: { setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {} }, onChange: key => changes.push(key) });
  const data = snapshot(plates(), { can: { form: 'web', decisionWrites: true } }), card = data.home.glance.cards.find(c => c.key === 'api:walk:8');
  const notNow = card.answers.find(a => a.id === 'not-now'), works = card.answers.find(a => a.id === 'choice-works');
  // A tap holds it: nothing is sent, the card says what you answered with Undo; Undo sends nothing.
  assert.ok(answers.choose(card.key, notNow).held);
  assert.match(cardStatus(answers.state(card.key)), /^<p>You answered: <strong>Not now<\/strong> <button type="button" class="quiet" data-undo>Undo<\/button><\/p>$/);
  assert.equal(answers.undo(card.key), true); assert.equal(answers.state(card.key), null); assert.deepEqual(sent, []);
  // Held again, the hold ends: one POST to /api/home/answer with the key, the answer and the CSRF token.
  answers.choose(card.key, notNow); await timers.at(-1).f();
  assert.deepEqual(sent, [['/api/home/answer', { csrf: 'fake-csrf-acme', key: 'api:walk:8', answer: 'not-now' }]]);
  assert.deepEqual([answers.state(card.key).state, answers.state(card.key).until], ['put-off', '2026-11-24']);
  assert.match(cardStatus(answers.state(card.key)), /You answered: <strong>Not now<\/strong>\. It comes back on 2026-11-24\./);
  assert.equal(answers.choose(card.key, notNow).error, 'busy', 'an answered card is not answered twice');
  // A walk's choice (PR #497 review): its preview is asked for at the tap and writes nothing; its consequence is shown on
  // the card, and only then does the hold (with Undo) start; that exact preview is applied when the hold ends.
  const other = data.home.glance.cards.find(c => c.key === 'studio:walk:3');
  sent.length = 0; const before = timers.length;
  const { preparing } = answers.choose(other.key, other.answers.find(a => a.id === 'choice-works'));
  assert.equal(answers.state(other.key).state, 'preparing'); assert.equal(timers.length, before, 'no hold before the consequence is shown');
  assert.match(cardStatus(answers.state(other.key)), /Checking what <strong>Works<\/strong> will do…/);
  assert.ok((await preparing).held);
  assert.deepEqual(sent, [['/api/home/answer', { csrf: 'fake-csrf-acme', key: 'studio:walk:3', answer: 'choice-works' }]], 'the preview, at the tap');
  assert.match(cardStatus(answers.state(other.key)), /You answered: <strong>Works<\/strong> — Records Works on Acme walk 3\. <button type="button" class="quiet" data-undo>Undo<\/button>/);
  assert.equal(timers.length, before + 1, 'the hold starts after the consequence is shown');
  await timers.at(-1).f();
  assert.deepEqual(sent[1], ['/api/projects/studio/decisions/apply', { csrf: 'fake-csrf-acme', previewId: 'p'.repeat(64) }]);
  assert.equal(answers.state(other.key).state, 'settled');
  assert.match(cardStatus(answers.state(other.key)), /See the receipt →/);
  assert.ok(works && changes.length >= 4);
  // An answer that needs a why is not held without one; one the web cannot run is not held at all.
  const stepCard = snapshot(plates(), { can: { form: 'cli' } }).home.glance.cards.find(c => c.key === 'api:step:7');
  const done = stepCard.answers.find(a => a.id === 'done');
  assert.equal(answers.choose(stepCard.key, done).error, 'why_required');
  const unavailable = data.home.glance.cards.find(c => c.key === 'api:step:7').answers.find(a => a.unavailable);
  assert.equal(answers.choose('api:step:7', unavailable).error, 'unavailable');
  assert.equal(sent.length, 2, 'neither was sent');
  // A refusal comes back on the card, with its reason, and the answers return.
  const refusing = createCardAnswers({ send: async () => ({ state: 'failed', reason: 'It no longer waits on you.' }), timers: { setTimeout: f => { timers.push({ f }); return 1; }, clearTimeout: () => {} } });
  refusing.choose(card.key, notNow); await timers.at(-1).f();
  assert.match(cardStatus(refusing.state(card.key)), /<p data-error>Not answered: It no longer waits on you\.<\/p>/);
  assert.ok(refusing.choose(card.key, notNow).held, 'a failed answer can be given again');
});

// The whole route, as the page uses it: Home's own HTML names the card and its answer and carries the CSRF token;
// POST /api/home/answer keeps its session, origin and CSRF rule, and the answered card leaves Home.
async function notNowDatabase(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(await readFile(new URL('../lib/web/migrations/017-not-now.sql', import.meta.url), 'utf8'));
  return { db, handle: async (url, options) => {
    const entries = Object.entries(JSON.parse(options.body));
    await db.exec('SET ROLE service_role');
    try { return Response.json((await db.query(`SELECT public.plates_not_now_rpc(${entries.map(([key], i) => `${key} => $${i + 1}${key === 'p_until' ? '::date' : ''}`).join(',')}) value`, entries.map(([, value]) => value))).rows[0].value); }
    finally { await db.exec('RESET ROLE'); }
  } };
}
test('every card answers through the existing answer route and its protections, from Home\'s own markup', async t => {
  const h = projectHarness(), database = await notNowDatabase(t);
  const web = createWebService(h.config, { fetcher: async (url, options) => new URL(url).pathname === '/rest/v1/rpc/plates_not_now_rpc' ? database.handle(url, options) : h.fetcher(url, options), now: () => h.state.now });
  const signed = await h.login();
  const page = async () => { const r = await web(h.request('/', { cookie: signed.cookie })); assert.equal(r.status, 200); return r.text(); };
  // The first look reads the sources (the page itself renders what was read), as the page's own refresh does.
  assert.equal((await web(h.request('/api/home', { cookie: signed.cookie }))).status, 200);
  const html = await page();
  const cards = [...html.matchAll(/<li class="glance-card p-card" data-card="([^"]+)"[\s\S]*?<\/li>(?=<li class="glance-card|<\/ol>)/g)];
  assert.ok(cards.length, 'Home draws cards');
  const [li, key] = cards.find(([text]) => text.includes('data-answer="not-now"'));
  assert.doesNotMatch(html, /plate-release/, 'no main → production row');
  const csrf = /<form method="post" action="\/api\/auth\/logout"><input type="hidden" name="csrf" value="([^"]+)">/.exec(html)[1];
  assert.equal(csrf, signed.session.csrf, 'the page carries the session\'s token, as every answer form does');
  const post = (body, cookie = signed.cookie, origin = h.config.origin) => web(new Request(`${h.config.origin}/api/home/answer`, { method: 'POST', headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json', origin }, body: JSON.stringify(body) }));
  // The same protections as before: no token, another token, no session, another origin.
  assert.equal((await post({ key, answer: 'not-now' })).status, 403);
  assert.equal((await post({ key, answer: 'not-now', csrf: 'x'.repeat(43) })).status, 403);
  assert.equal((await post({ key, answer: 'not-now', csrf }, null)).status, 401);
  assert.ok((await post({ key, answer: 'not-now', csrf }, signed.cookie, 'https://evil.example')).status >= 400);
  assert.equal((await database.db.query('SELECT count(*)::int n FROM plates_home.not_now')).rows[0].n, 0, 'nothing was written');
  // An answer the card marks unavailable is refused by the route too.
  const off = /data-answer="([^"]+)"[^>]*aria-disabled="true"/.exec(li);
  assert.ok(off, 'the fixture\'s card has an answer the web cannot run (decision writes are off)');
  assert.equal((await post({ key, answer: off[1], csrf })).status, 409);
  // The card's own answer, with the page's token: written, and the card leaves Home.
  const r = await post({ key, answer: 'not-now', csrf });
  assert.equal(r.status, 200); assert.equal((await r.json()).state, 'written');
  assert.ok(!(await page()).includes(`data-card="${key}"`), 'the answered card is gone');
});

// PR #497 review: a refused preview comes back on the card and starts no hold.
test('a refused preview is shown on the card and nothing is held or applied', async () => {
  const timers = [], answers = createCardAnswers({ send: async () => assert.fail('nothing is sent'), prepare: async () => ({ refusal: 'Submission is disabled until the owner enables decision writes.' }), timers: { setTimeout: f => { timers.push(f); return 1; }, clearTimeout: () => {} } });
  const r = answers.choose('studio:walk:3', { id: 'choice-works', label: 'Works', needsWhy: 'never', writer: 'walk done' });
  assert.deepEqual(await r.preparing, { error: 'refused' }); assert.equal(timers.length, 0);
  assert.match(cardStatus(answers.state('studio:walk:3')), /Not answered: Submission is disabled/);
});

// PR #497 review: a walk card keeps its way into the guided walks; a guided one leads with it.
test('a walk card keeps its guided-walk action', () => {
  const html = renderHomeSnapshot(snapshot()), li = html.match(/<li class="glance-card p-card" data-card="api:walk:8"[\s\S]*?<\/li>(?=<li class="glance-card|<\/ol>)/)[0];
  assert.match(li, /<a class="button glance-answer" data-walk-link data-focus="walk-api:walk:8" href="\/projects\/api\/walks">Guided walks<\/a>/);
  const guided = snapshot([base('api', 'Acme API', { walks: [walk('api', 'Acme API', '8', { guided: true })] })], { can: { form: 'web', decisionWrites: true } });
  const g = renderHomeSnapshot(guided);
  assert.match(g, /<a class="button glance-answer" data-recommended="true" data-walk-link data-focus="walk-api:walk:8" href="\/projects\/api\/walks">Start the guided walk<\/a>/);
  assert.doesNotMatch(g, /data-recommended="true" data-answer="choice-works"/, 'its unavailable choice is not the filled one');
  assert.doesNotMatch(renderHomeSnapshot(snapshot([base('api', 'Acme API', { decisions: [step('api', 'Acme API', '7')] })])), /data-walk-link/, 'only walks');
});

// PR #497 review: leaving with an answer pending sends it (keepalive) and asks the browser to confirm; nothing pending, nothing asked.
test('leaving the page never drops a held answer', async () => {
  const sent = [], timers = [], answers = createCardAnswers({ send: async hold => { sent.push(hold.entry.key); return { state: 'put-off', until: '2026-11-24' }; }, timers: { setTimeout: f => { timers.push(f); return 1; }, clearTimeout: () => {} } });
  const guard = leaveGuard(answers), event = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
  const idle = event(); assert.equal(guard(idle), false); assert.equal(idle.prevented, false);
  answers.choose('api:walk:8', { id: 'not-now', label: 'Not now', needsWhy: 'never', writer: 'not now' });
  assert.equal(answers.pending(), true);
  const leaving = event(); assert.equal(guard(leaving), true);
  assert.equal(leaving.prevented, true); assert.equal(leaving.returnValue, '');
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(sent, ['api:walk:8'], 'flushed, not dropped'); assert.equal(answers.pending(), false);
  // The page's sender keeps the request alive as the page unloads.
  const source = await readFile(new URL('../lib/web/home-client.mjs', import.meta.url), 'utf8');
  assert.match(source, /fetch\(url, \{ \.\.\.options, keepalive: true \}\)/); assert.match(source, /addEventListener\?\.\('beforeunload', guard\)/);
});

// PR #497 review: after a refresh, an answered card stays answered while its source is unchanged, and shows fresh once it changed.
test('settled answers are reconciled against refreshed cards', async () => {
  const timers = [], answers = createCardAnswers({ send: async () => ({ state: 'settled', link: null }), timers: { setTimeout: f => { timers.push(f); return 1; }, clearTimeout: () => {} } });
  const nn = { id: 'not-now', label: 'Not now', needsWhy: 'never', writer: 'not now' };
  for (const key of ['a:walk:1', 'b:walk:2', 'c:walk:3']) { answers.choose(key, nn, { source: `${key}@1` }); await timers.at(-1)(); }
  answers.choose('d:walk:4', nn, { source: 'd@1' });
  answers.reconcile(new Map([['a:walk:1', 'a:walk:1@1'], ['b:walk:2', 'b:walk:2@2'], ['d:walk:4', 'd@2']]));
  assert.equal(answers.state('a:walk:1').state, 'settled', 'unchanged and still drawn: stays answered, its answers hidden');
  assert.equal(answers.state('b:walk:2'), null, 'its source changed: shown fresh');
  assert.equal(answers.state('c:walk:3'), null, 'gone from Home: forgotten');
  assert.equal(answers.state('d:walk:4').state, 'held', 'a held answer is never dropped by a refresh');
  // The fingerprint is drawn on every card from its question, why and answers.
  const html = renderHomeSnapshot(snapshot());
  assert.match(html, /data-card="api:walk:8" data-kind="walk" data-source="Does the Acme 8 flow work\?\u001fA person uses the \*\*real\*\* surface\.\u001fchoice-works\u001fchoice-needs-changes\u001fnot-now"/);
});

// PR #497 review: a preview that returns for an attempt since undone or replaced is ignored, never applied to the newer one.
test('a preview completes only the attempt that asked for it', async () => {
  const timers = [], pending = [], answers = createCardAnswers({ send: async () => ({ state: 'settled' }), prepare: hold => new Promise(r => pending.push({ hold, r })), timers: { setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout: () => {} } });
  const works = { id: 'choice-works', label: 'Works', needsWhy: 'never', writer: 'walk done' }, changes = { id: 'choice-needs-changes', label: 'Needs changes', needsWhy: 'never', writer: 'walk done' };
  const first = answers.choose('api:walk:8', works);
  assert.equal(answers.undo('api:walk:8'), true);
  const second = answers.choose('api:walk:8', changes);
  await new Promise(r => setTimeout(r, 0));
  pending[0].r({ preview: { id: 'old' }, summary: 'Records Works.' });
  assert.deepEqual(await first.preparing, { error: 'cancelled' });
  assert.equal(answers.state('api:walk:8').state, 'preparing', 'the stale preview did not start a hold');
  assert.equal(answers.state('api:walk:8').answer.id, 'choice-needs-changes'); assert.equal(timers.length, 0);
  pending[1].r({ preview: { id: 'new' }, summary: 'Records Needs changes.' });
  const held = (await second.preparing).held;
  assert.equal((await held.prepared).preview.id, 'new', 'the hold applies its own preview');
  assert.match(cardStatus(answers.state('api:walk:8')), /Needs changes<\/strong> — Records Needs changes\./);
});

// PR #497 review: an apply whose outcome is unknown survives a refresh, with its check link, and its answers stay hidden.
test('an uncertain answer is kept across a refresh', async () => {
  const timers = [], answers = createCardAnswers({ send: async () => ({ state: 'uncertain', reason: 'The write was sent but its outcome is not confirmed.', link: '/projects/api/operations/o1' }), timers: { setTimeout: f => { timers.push(f); return 1; }, clearTimeout: () => {} } });
  answers.choose('api:walk:8', { id: 'not-now', label: 'Not now', needsWhy: 'never', writer: 'not now' }, { source: 's@1' }); await timers.at(-1)();
  for (const present of [new Map([['api:walk:8', 's@2']]), new Map()]) {
    answers.reconcile(present);
    assert.equal(answers.state('api:walk:8')?.state, 'uncertain', 'neither a changed source nor a missing card forgets it');
  }
  assert.match(cardStatus(answers.state('api:walk:8')), /<p data-error>The write was sent but its outcome is not confirmed\. <a href="\/projects\/api\/operations\/o1">Check the operation →<\/a><\/p>/);
  assert.equal(answers.choose('api:walk:8', { id: 'not-now', label: 'Not now', needsWhy: 'never', writer: 'not now' }).error, 'busy', 'never silently re-enabled');
});
