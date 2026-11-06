// Home's answers on the hosted workspace (plates phase 173): POST
// /api/home/answer through the session, origin and CSRF rule walks and
// decisions use, and Not now kept in the store SQL017 makes (run here on
// PGlite). Synthetic Acme sources through the fake App API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { projectHarness } from './helpers/web-projects.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionHarness } from './helpers/web-decisions.mjs';
import { phaseFile } from './helpers/web-projects.mjs';
import { run } from './helpers/run.mjs';

async function notNowDatabase(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(await readFile(new URL('../lib/web/migrations/017-not-now.sql', import.meta.url), 'utf8'));
  const handle = async (url, options) => {
    const p = JSON.parse(options.body), entries = Object.entries(p);
    await db.exec('SET ROLE service_role');
    try {
      const result = await db.query(`SELECT public.plates_not_now_rpc(${entries.map(([key], i) => `${key} => $${i + 1}${key === 'p_until' ? '::date' : ''}`).join(',')}) value`, entries.map(([, value]) => value));
      return Response.json(result.rows[0].value);
    } finally { await db.exec('RESET ROLE'); }
  };
  return { db, handle };
}

function service(t, h, { database = null, decisionWrites = false } = {}) {
  const fetcher = async (url, options) => {
    if (new URL(url).pathname === '/rest/v1/rpc/plates_not_now_rpc') return database ? database.handle(url, options) : new Response('{"message":"function not found"}', { status: 404 });
    return h.fetcher(url, options);
  };
  return createWebService({ ...h.config, decisionWrites }, { fetcher, now: () => h.state.now });
}

// A JSON POST from the page, as the walk and decision clients send theirs.
const json = (h, body, cookie) => new Request(`${h.config.origin}/api/home/answer`, { method: 'POST',
  headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json', origin: h.config.origin }, body: JSON.stringify(body) });
const day = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test('an owner answers a home item on the web, and Not now keeps it put off until its date', async t => {
  const h = projectHarness(), database = await notNowDatabase(t), web = service(t, h, { database });
  const signed = await h.login();
  const home = async () => { const r = await web(h.request('/api/home', { cookie: signed.cookie })); assert.equal(r.status, 200); return r.json(); };
  const first = await home();
  const walk = first.walks.find(w => w.key === 'studio:walk:2');
  assert.ok(walk, 'the walk is in Needs you');
  // The web lists the walk's writer it cannot run, with why and the terminal command; Not now it writes.
  const choice = walk.answers.find(a => a.writer === 'walk done');
  assert.match(choice.unavailable.reason, /decision writes/, 'without decisionWrites the walk writer is off'); assert.match(choice.unavailable.command, /^plates home --answer studio:walk:2 /);
  assert.ok(!walk.answers.find(a => a.id === 'not-now').unavailable);
  assert.equal(first.putOff.count, 0);

  const post = (body, cookie = signed.cookie) => web(json(h, body, cookie));
  // The CSRF rule: no token, or someone else's, is refused and writes nothing.
  assert.equal((await post({ key: walk.key, answer: 'not-now' })).status, 403);
  assert.equal((await post({ key: walk.key, answer: 'not-now', csrf: 'x'.repeat(43) })).status, 403);
  assert.equal((await post({ key: walk.key, answer: 'not-now', csrf: signed.session.csrf }, null)).status, 401, 'no session');
  // An answer the web cannot run, one the item does not have, and an item that is not waiting.
  assert.equal((await post({ key: walk.key, answer: choice.id, csrf: signed.session.csrf })).status, 409);
  assert.equal((await post({ key: walk.key, answer: 'merge', csrf: signed.session.csrf })).status, 404);
  assert.equal((await post({ key: 'studio:walk:99', answer: 'not-now', csrf: signed.session.csrf })).status, 404);
  assert.equal((await post({ key: walk.key, answer: 'not-now', until: day(0), csrf: signed.session.csrf })).status, 400, 'a date of today is refused');
  assert.equal((await database.db.query('SELECT count(*)::int n FROM plates_home.not_now')).rows[0].n, 0, 'nothing was written');

  // Not now, with a date and a reason: written, and Home moves the walk to putOff, counted.
  const until = day(7);
  const put = await post({ key: walk.key, answer: 'not-now', until, why: 'after the Acme trip', csrf: signed.session.csrf });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { schema: 1, state: 'written', key: walk.key, answer: 'not-now', writer: 'not now', until, reason: 'after the Acme trip' });
  const second = await home();
  assert.ok(!second.walks.some(w => w.key === walk.key), 'the walk left Needs you');
  assert.deepEqual(second.putOff.items.map(p => [p.key, p.until, p.reason]), [[walk.key, until, 'after the Acme trip']]);
  // The store holds ciphertext and a date: never the item's key or the owner's words.
  const rows = (await database.db.query('SELECT key, value, until::text FROM plates_home.not_now')).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].until, until);
  assert.ok(!rows[0].value.includes('studio') && !rows[0].value.includes('Acme trip') && /^[a-f0-9]{64}$/.test(rows[0].key));
  // On its date it returns: the store no longer lists a record whose date has come.
  await database.db.exec(`UPDATE plates_home.not_now SET until = (clock_timestamp() at time zone 'UTC')::date`);
  const back = await home();
  assert.ok(back.walks.some(w => w.key === walk.key), 'back in Needs you on its date');
  assert.equal(back.putOff.count, 0);
});

test('before 017 is applied, Home hides nothing and says Not now is unavailable', async t => {
  const h = projectHarness(), web = service(t, h);
  const signed = await h.login();
  const model = await (await web(h.request('/api/home', { cookie: signed.cookie }))).json();
  assert.ok(model.walks.some(w => w.key === 'studio:walk:2'));
  assert.match(model.putOff.unavailable, /could not be read; nothing is hidden/);
  assert.equal(model.coverage.gaps.some(g => g.source === 'not now'), false, 'the owner\'s records are not a project source');
  const r = await web(json(h, { key: 'studio:walk:2', answer: 'not-now', csrf: signed.session.csrf }, signed.cookie));
  assert.equal(r.status, 503, 'a Not now answer is refused, bounded');
});

// The same Acme plate twice: the web's fake App (with its commit API) and a git checkout for the CLI.
const WALK_FILES = {
  '.plates/plates.json': JSON.stringify({ name: 'Acme Studio', repo: 'acme/studio', practices: ['phases'] }),
  'docs/goals.json': JSON.stringify([{ id: 'G1', title: 'A dependable studio', outcome: 'People publish confidently.' }]),
  'docs/phases/01-first.md': phaseFile(1, { status: 'built' }),
  'docs/phases/02-walk.md': phaseFile(2, { status: 'partial', owes: true }),
  'docs/evidence/acme.md': '# Acme evidence\nA dated observation.\n',
};
const PLATES = fileURLToPath(new URL('..', import.meta.url));

function walkWeb(files = WALK_FILES) {
  const h = decisionHarness();
  for (const key of Object.keys(h.source.files)) delete h.source.files[key];
  Object.assign(h.source.files, files);
  h.source.commits.push({ sha: h.source.head, parents: [], commit: { tree: { sha: 'c'.repeat(40) }, message: 'Acme', committer: { date: '2026-10-20T12:00:00Z' } }, files: [] });
  return h;
}
async function walkCli(t, files = WALK_FILES) {
  const dir = await mkdtemp(join(tmpdir(), 'plates-walk-answer-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'studio');
  for (const [path, text] of Object.entries(files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); }
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Acme', GIT_AUTHOR_EMAIL: 'a@example.com', GIT_COMMITTER_NAME: 'Acme', GIT_COMMITTER_EMAIL: 'a@example.com',
    PLATES_GH: join(dir, 'no-gh'), PLATES_CACHE: join(dir, 'cache'), XDG_STATE_HOME: join(dir, 'state') };
  assert.equal(run(process.execPath, [join(PLATES, 'scripts', 'roadmap.mjs'), '--write'], { cwd: root, env }).status, 0);
  for (const args of [['init', '-q', '-b', 'main'], ['add', '-A'], ['commit', '-q', '-m', 'Acme']]) execFileSync('git', ['-C', root, ...args], { env });
  return { root, env };
}
const postJson = (h, path, body, cookie) => new Request(`${h.config.origin}${path}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', origin: h.config.origin }, body: JSON.stringify(body) });

test('a walk answered on the web writes what plates home --answer writes in the CLI', async t => {
  const h = walkWeb(), web = createWebService(h.config, { fetcher: h.fetcher, now: () => h.state.now }), signed = await h.login();
  const home = await (await web(h.request('/api/home', { cookie: signed.cookie }))).json();
  const walk = home.walks.find(w => w.key === 'studio:walk:2');
  const choice = walk.answers.find(a => a.id.startsWith('choice-'));
  assert.ok(!choice.unavailable, 'with decisionWrites the web writes a walk');
  const answered = await web(postJson(h, '/api/home/answer', { key: walk.key, answer: choice.id, why: 'Tried it on the Acme phone.', csrf: signed.session.csrf }, signed.cookie));
  assert.equal(answered.status, 200);
  const { state, preview } = await answered.json();
  assert.equal(state, 'preview');
  assert.deepEqual(preview.files.map(f => f.path).sort(), ['docs/ROADMAP.md', 'docs/phases/02-walk.md', `docs/evidence/${new Date(h.state.now).toISOString().slice(0, 10)}-phase-2-walk.md`].sort());
  assert.equal(h.source.writes.filter(Boolean).length, 0, 'a preview writes nothing');
  const applied = await web(postJson(h, '/api/projects/studio/decisions/apply', { previewId: preview.id, publicAcknowledgement: preview.digest, csrf: signed.session.csrf }, signed.cookie));
  assert.equal((await applied.json()).state, 'committed');
  // The CLI, on the same files: the same phase and evidence bytes.
  const cli = await walkCli(t);
  const r = run(process.execPath, [join(PLATES, 'bin', 'plates.mjs'), 'home', '--answer', walk.key, choice.id, '--why', 'Tried it on the Acme phone.', '--yes', '--json'], { cwd: cli.root, env: cli.env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { readFile: readText } = await import('node:fs/promises');
  for (const path of preview.files.map(f => f.path).filter(p => p !== 'docs/ROADMAP.md')) assert.equal(h.source.files[path], await readText(join(cli.root, path), 'utf8'), `${path}: the same bytes in both forms`);
  assert.match(h.source.files['docs/phases/02-walk.md'], /^- \[x\]/m, 'the box is checked');
});

test('a web walk answer is refused at apply when the box text changed since its preview', async () => {
  const h = walkWeb(), web = createWebService(h.config, { fetcher: h.fetcher, now: () => h.state.now }), signed = await h.login();
  const home = await (await web(h.request('/api/home', { cookie: signed.cookie }))).json();
  const walk = home.walks.find(w => w.key === 'studio:walk:2'), choice = walk.answers.find(a => a.id.startsWith('choice-'));
  const { preview } = await (await web(postJson(h, '/api/home/answer', { key: walk.key, answer: choice.id, csrf: signed.session.csrf }, signed.cookie))).json();
  // Someone edits the walk box's text on the default branch.
  h.source.files['docs/phases/02-walk.md'] = h.source.files['docs/phases/02-walk.md'].replace(/^(- \[ \] .*)$/m, '$1 Also on a tablet.');
  h.source.head = 'e'.repeat(40);
  const applied = await (await web(postJson(h, '/api/projects/studio/decisions/apply', { previewId: preview.id, publicAcknowledgement: preview.digest, csrf: signed.session.csrf }, signed.cookie))).json();
  assert.equal(applied.state, 'refused');
  assert.equal(h.source.writes.filter(Boolean).length, 0, 'nothing written');
  // A choice the walk does not list is refused like the CLI's.
  const bad = await web(postJson(h, '/api/home/answer', { key: walk.key, answer: 'choice-nope', csrf: signed.session.csrf }, signed.cookie));
  assert.equal(bad.status, 404);
});

// Phase 187: a plate with 190 phases (plates itself passed 180). The walk's
// preview and its apply read the whole inventory; one blob GET at a time ran
// past the 25s source deadline in production (upstream_unavailable). Reads run
// at most READ_CONCURRENCY at a time, within the call budget, and the
// inventory bound fits. Counted, never timed.
test('a 190-phase plate previews and applies a walk answer, reading its blobs a bounded few at a time', async () => {
  const READ_CONCURRENCY = 8, CALL_BUDGET = 600; // lib/web/decision-github.mjs READ_CONCURRENCY, SOURCE_CALL_LIMIT
  const h = walkWeb();
  let inFlight = 0, most = 0, blobs = 0, counting = false;
  const fetcher = async (url, options) => {
    if (!counting || !String(url).includes('/git/blobs/')) return h.fetcher(url, options);
    blobs++; inFlight++; most = Math.max(most, inFlight);
    try { await new Promise(r => setImmediate(r)); return await h.fetcher(url, options); } finally { inFlight--; }
  };
  const web = createWebService(h.config, { fetcher, now: () => h.state.now }), signed = await h.login();
  const home = await (await web(h.request('/api/home', { cookie: signed.cookie }))).json();
  const walk = home.walks.find(w => w.key === 'studio:walk:2'), choice = walk.answers.find(a => a.id.startsWith('choice-'));
  // Home's own reader is not under test: the inventory grows after it read the plate (the walk is still waiting).
  for (let n = 3; n <= 190; n++) h.source.files[`docs/phases/${String(n).padStart(3, '0')}-acme-${n}.md`] = phaseFile(n, { status: 'built' });
  counting = true;
  const answered = await web(postJson(h, '/api/home/answer', { key: walk.key, answer: choice.id, why: 'Tried it on the Acme phone.', csrf: signed.session.csrf }, signed.cookie));
  assert.equal(answered.status, 200, await answered.clone().text());
  const { preview } = await answered.json();
  assert.ok(most > 1 && most <= READ_CONCURRENCY, `at most ${READ_CONCURRENCY} blob reads in flight (saw ${most})`);
  assert.ok(blobs >= 190 && blobs <= CALL_BUDGET, `the preview's ${blobs} blob reads fit the call budget`);
  const applied = await web(postJson(h, '/api/projects/studio/decisions/apply', { previewId: preview.id, publicAcknowledgement: preview.digest, csrf: signed.session.csrf }, signed.cookie));
  assert.equal((await applied.json()).state, 'committed', 'its apply re-reads the same inventory and writes');
  assert.ok(most <= READ_CONCURRENCY);
});

// Phase 187: Done on a step writes from the card. A partial phase whose next
// action is the owner's is a step; its Done is the drop mark plates home
// --answer writes in a checkout, previewed and applied like a walk answer.
const STEP_FILES = { ...WALK_FILES, 'docs/phases/03-step.md': phaseFile(3, { status: 'partial', next: '⚑ Approve the Acme night lane.' }) };
const freshHome = async (web, h, signed) => (await web(h.request('/api/home?fresh=1', { cookie: signed.cookie }))).json();

test('a step\'s Done on the web previews and writes a drop mark to .plates/loose-ends.json, and the step leaves Home', async t => {
  const h = walkWeb(STEP_FILES), web = createWebService(h.config, { fetcher: h.fetcher, now: () => h.state.now }), signed = await h.login();
  const step = (await (await web(h.request('/api/home', { cookie: signed.cookie }))).json()).decisions.find(d => d.key === 'studio:step:3');
  const done = step.answers.find(a => a.id === 'done');
  assert.equal(done.writer, 'loose-ends mark'); assert.ok(!done.unavailable, 'with decisionWrites the web writes a step\'s Done');
  assert.equal((await web(postJson(h, '/api/home/answer', { key: step.key, answer: 'done', csrf: signed.session.csrf }, signed.cookie))).status, 400, 'Done needs a why');
  const answered = await web(postJson(h, '/api/home/answer', { key: step.key, answer: 'done', why: 'Approved the Acme lane.', csrf: signed.session.csrf }, signed.cookie));
  assert.equal(answered.status, 200, await answered.clone().text());
  const { state, writer, preview } = await answered.json();
  assert.equal(state, 'preview'); assert.equal(writer, 'loose-ends mark');
  assert.deepEqual(preview.files.map(f => f.path), ['.plates/loose-ends.json']);
  const date = new Date(h.state.now).toISOString().slice(0, 10);
  assert.deepEqual(JSON.parse(preview.files[0].content), { marks: [{ fingerprint: 'phase:3', kind: 'phase', move: 'drop', date, reason: 'Approved the Acme lane.' }] });
  assert.match(preview.consequence, /phase 3 .*drop mark .*Approved the Acme lane/);
  assert.equal(h.source.writes.filter(Boolean).length, 0, 'a preview writes nothing');
  const applied = await (await web(postJson(h, '/api/projects/studio/decisions/apply', { previewId: preview.id, publicAcknowledgement: preview.digest, csrf: signed.session.csrf }, signed.cookie))).json();
  assert.equal(applied.state, 'committed', JSON.stringify(applied));
  assert.equal(h.source.files['.plates/loose-ends.json'], preview.files[0].content, 'the previewed bytes, on the default branch');
  // Home reads the plate again past its refresh interval; the fake App's commit list carries the new head as GitHub's would.
  Object.assign(h.source.commits[0].commit, { tree: { sha: 'c'.repeat(40) }, committer: { date: new Date(h.state.now).toISOString() } });
  h.source.commits.splice(1);
  h.state.now += 120_000;
  assert.ok(!(await freshHome(web, h, signed)).decisions.some(d => d.key === step.key), 'and the step leaves Home');
  // The CLI, on the same files, writes the same mark (its date is its own today).
  const cli = await walkCli(t, STEP_FILES);
  const r = run(process.execPath, [join(PLATES, 'bin', 'plates.mjs'), 'home', '--answer', step.key, 'done', '--why', 'Approved the Acme lane.', '--yes', '--json'], { cwd: cli.root, env: cli.env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { readFile: readText } = await import('node:fs/promises');
  const local = await readText(join(cli.root, '.plates/loose-ends.json'), 'utf8');
  assert.equal(local.replace(/"date": "[^"]+"/, `"date": "${date}"`), preview.files[0].content, 'the same bytes in both forms');
});

test('a Done whose step changed since its preview writes nothing', async () => {
  const h = walkWeb(STEP_FILES), web = createWebService(h.config, { fetcher: h.fetcher, now: () => h.state.now }), signed = await h.login();
  await web(h.request('/api/home', { cookie: signed.cookie }));
  const ask = () => web(postJson(h, '/api/home/answer', { key: 'studio:step:3', answer: 'done', why: 'Approved it.', csrf: signed.session.csrf }, signed.cookie));
  const { preview } = await (await ask()).json();
  // Someone edits the step on the default branch.
  h.source.files['docs/phases/03-step.md'] = h.source.files['docs/phases/03-step.md'].replace('⚑ Approve the Acme night lane.', '⚑ Approve the Acme night and day lanes.');
  h.source.head = 'e'.repeat(40);
  const applied = await (await web(postJson(h, '/api/projects/studio/decisions/apply', { previewId: preview.id, publicAcknowledgement: preview.digest, csrf: signed.session.csrf }, signed.cookie))).json();
  assert.equal(applied.state, 'refused');
  assert.equal(h.source.writes.filter(Boolean).length, 0, 'nothing written');
  assert.ok(!('.plates/loose-ends.json' in h.source.files));
  // A marks file that is not JSON is refused at preview, never overwritten.
  h.source.files['.plates/loose-ends.json'] = '{ not json';
  const bad = await ask();
  assert.equal(bad.status, 409); assert.equal((await bad.json()).error, 'invalid_marks_file');
});
