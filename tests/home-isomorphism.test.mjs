// The CLI and the web are isomorphic (plates phase 156): `plates home --json`
// and /api/home are two renderers of one read model. These tests run both real
// readers over the same synthetic Acme sources (the web through a fake GitHub
// App API, the CLI from a git checkout of the same files and a fake gh) and
// compare what each renders. Neither side is compared with itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { run as runNode } from './helpers/run.mjs';
import { fileURLToPath } from 'node:url';
import { projectHarness, phaseFile } from './helpers/web-projects.mjs';
import { createHash } from 'node:crypto';
import { createHomeReader } from '../lib/web/home.mjs';
import { renderHomeSnapshot } from '../lib/web/views.mjs';
import { HOME_SECTIONS, BACKLOG_LANES } from '../lib/work-items.mjs';
import { backlogView, START_UNAVAILABLE } from '../lib/web/backlog-views.mjs';
import { claimMessage } from '../lib/claim.mjs';
import { waitsFixture } from './helpers/waits.mjs';

const bin = fileURLToPath(new URL('../bin/plates.mjs', import.meta.url));
const token = 'fake-user-access-token-for-tests';
const MESSAGE = 'Improve the Acme experience', DATE = '2026-10-20T12:00:00Z';
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Acme', GIT_AUTHOR_EMAIL: 'acme@example.com',
  GIT_COMMITTER_NAME: 'Acme', GIT_COMMITTER_EMAIL: 'acme@example.com', GIT_AUTHOR_DATE: DATE, GIT_COMMITTER_DATE: DATE };

// One open Acme PR whose reviewer's comment is unanswered: the night's repo-wide review read answers it.
const reviewRepository = { open: { pageInfo: { hasNextPage: false }, nodes: [{ keelWindow: 'PullRequest', number: 7, title: 'Acme anvils', url: 'https://github.com/acme/studio/pull/7',
  state: 'OPEN', mergedAt: null, updatedAt: '2026-10-07T00:00:00Z', author: { login: 'acme-owner' },
  reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'T1', isResolved: false, tail: { totalCount: 1, nodes: [{ databaseId: 1, author: { login: 'acme-reviewer' }, body: 'Brakes.', createdAt: '2026-10-01T09:00:00Z', url: 'https://github.com/acme/studio/pull/7#c1' }] } }] },
  comments: { pageInfo: { hasPreviousPage: false }, nodes: [] }, reviews: { pageInfo: { hasPreviousPage: false }, nodes: [] } }] },
  merged: { pageInfo: { hasNextPage: false }, nodes: [] } };
const rate = { cost: 1, remaining: 4000, resetAt: new Date(Date.now() + 3600_000).toISOString() };

/** The same sources, twice: the web's fake App API and a git checkout with a fake gh. */
async function sources({ reviews = true, files = {}, issues = null, waits = null, runs = null, prs = null, config = {} } = {}) {
  const h = projectHarness();
  Object.assign(h.source.files, files);
  h.source.files['.plates/plates.json'] = JSON.stringify({ name: 'Acme Studio', repo: 'acme/studio', tagline: 'Publish useful things.', practice: '0.8.32', stack: ['node'], phases: { shape: 'files' },
    ...(waits ? { practices: ['phases', 'delivery'], delivery: { tested: 'green', promote: 'vercel:studio' } } : {}), ...config });
  const dir = await mkdtemp(join(tmpdir(), 'plates-home-iso-')), root = join(dir, 'studio');
  for (const [path, content] of Object.entries(h.source.files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); }
  const git = args => execFileSync('git', ['-C', root, ...args], { env: gitEnv, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']); git(['add', '-A']); git(['commit', '-q', '-m', MESSAGE]);
  h.source.revision = git(['rev-parse', 'HEAD']);
  // The web: GraphQL through the App answers the review read.
  const claimRefs = [];
  const fetcher = async (url, options) => {
    if (new URL(url).pathname === '/graphql') {
      h.source.requests.push({ url, options });
      const { query } = JSON.parse(options.body);
      // Blob texts by oid, batched under aliases: answered from the same files the tree lists.
      const blobs = [...query.matchAll(/(\w+): object\(oid: "([0-9a-f]{40})"\)/g)];
      if (blobs.length) {
        const byOid = new Map(Object.values(h.source.files).map(text => [createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex'), text]));
        const repository = Object.fromEntries(blobs.map(([, alias, oid]) => { const text = byOid.get(oid); return [alias, text === undefined ? null : { oid, byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text }]; }));
        return Response.json({ data: { rateLimit: rate, repository } }, { headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } });
      }
      // The backlog's claims read (phase 178): the claim branches the test pushed to the checkout's remote, and no open PRs.
      // Pending review's read (phase 186): the same open PRs the fake gh lists.
      if (query.includes('PlatesPending')) return Response.json({ data: { rateLimit: rate, repository: { pullRequests: { totalCount: (prs ?? []).length, nodes: prs ?? [] } } } }, { headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } });
      if (query.includes('PlatesClaims')) return Response.json({ data: { rateLimit: rate, repository: { refs: { totalCount: claimRefs.length, nodes: claimRefs }, pullRequests: { totalCount: 0, nodes: [] } } } }, { headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } });
      return Response.json({ data: { rateLimit: rate, ...(query.includes('PlatesReviewWindow') ? { repository: reviewRepository } : {}) } }, { headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } });
    }
    // The waits' REST reads (phase 158): the same answers the fake gh gives.
    const u = new URL(url), key = `${u.pathname}${u.search}`;
    // Recurring's runs read (phase 185): the same runs the fake gh lists, for both of the App's lists.
    if (runs && u.pathname === '/repos/acme/studio/actions/runs') { h.source.requests.push({ url, options }); return Response.json({ workflow_runs: runs.map(r => ({ path: r.path, name: r.workflowName, status: r.status, conclusion: r.conclusion, created_at: r.createdAt, html_url: r.url })) }, { headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } }); }
    if (waits && Object.hasOwn(waits, key)) { h.source.requests.push({ url, options }); return Response.json(waits[key], { headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } }); }
    return h.fetcher(url, options);
  };
  // The CLI: a gh that answers the same review read, the viewer's login, and nothing else.
  const gh = join(dir, 'gh');
  await writeFile(gh, `#!${process.execPath}
const argv = process.argv.slice(2), q = (argv.find(a => a.startsWith('query=')) ?? '').slice(6);
if (argv[0] === 'api' && argv[1] === 'user') console.log('acme-owner');
else if (argv[0] === 'api' && argv[1] === 'graphql' && q.includes('PlatesReviewWindow')) console.log(JSON.stringify({ data: { rateLimit: ${JSON.stringify(rate)}, repository: ${JSON.stringify(reviewRepository)} } }));
else if (argv[0] === 'api' && argv[1] === 'graphql') console.log(JSON.stringify({ data: { rateLimit: ${JSON.stringify(rate)} } }));
else if (argv[0] === 'api' && argv[1] === '-X' && argv[2] === 'GET' && Object.hasOwn(${JSON.stringify(waits ?? {})}, '/' + argv[3])) console.log(JSON.stringify(${JSON.stringify(waits ?? {})}['/' + argv[3]]));
else if (argv[0] === 'api' && argv[1] === '-X') { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
else if (argv[0] === 'pr' && argv[1] === 'list' && process.env.ACME_GH_PRS) console.log(process.env.ACME_GH_PRS);
else if (argv[0] === 'run' && argv[1] === 'list' && ${JSON.stringify(!!runs)}) console.log(JSON.stringify(${JSON.stringify((runs ?? []).map(({ path, ...r }) => r))}));
else if (argv[0] === 'issue' && argv[1] === 'list' && ${JSON.stringify(!!issues)}) console.log(JSON.stringify(argv.includes('plates:agent') ? ${JSON.stringify(issues ?? [])} : []));
else { console.error('fake gh: offline'); process.exit(1); }
`);
  await chmod(gh, 0o755);
  const readWeb = createHomeReader(h.config, { fetcher, now: () => Date.now() }), webAccess = { ...h.access, login: 'acme-owner', pullRequestsRead: reviews, checksRead: !!waits, ...(runs ? { actionsPermission: 'read' } : {}) };
  const web = await readWeb(webAccess, token);
  const cliEnv = (state = 'state') => ({ ...gitEnv, PLATES_GH: gh, PLATES_CACHE: join(dir, 'cache'), PLATES_STATE: join(dir, state), XDG_STATE_HOME: join(dir, state) });
  const run = runNode(process.execPath, [bin, 'home', '--json'], { cwd: root, timeout: 120_000, env: cliEnv() });
  assert.equal(run.status, 0, run.stderr);
  // More plates home runs in the same checkout; `state` keeps their last-looked time apart from the first run's.
  const again = (args, { state = 'state-again', env = {} } = {}) => runNode(process.execPath, [bin, 'home', ...args], { cwd: root, timeout: 120_000, env: { ...cliEnv(state), ...env } });
  return { web, cli: JSON.parse(run.stdout), dir, root, git, gitEnv, claimRefs, again, access: webAccess, readWeb: options => readWeb(webAccess, token, options), done: () => rm(dir, { recursive: true, force: true }) };
}

// What a reader adds about its own read, not the sources: when it read, and the App's numeric repository id.
// Which writers a form can run (an answer's `unavailable`) is that form's, not the sources' (phase 173).
const formless = item => item.answers ? { ...item, answers: item.answers.map(({ unavailable, ...a }) => a) } : item;
const content = snapshot => ({
  coverage: snapshot.coverage,
  projects: snapshot.projects.map(({ readAt, repoId, ...project }) => project),
  ...Object.fromEntries(['decisions', 'walks', 'reviews', 'waiting', 'changes'].map(key => [key, snapshot[key].map(formless)])),
});

test('the CLI and the web render one read model', async () => {
  const s = await sources();
  try {
    const web = content(s.web), cli = content(s.cli);
    // The fixture exercises every shared list, so equality is not two empty readers agreeing.
    for (const key of ['decisions', 'walks', 'reviews', 'waiting', 'changes']) assert.ok(web[key].length, `the fixture has ${key}`);
    assert.equal(web.reviews[0].review.number, 7);
    for (const key of ['decisions', 'walks', 'reviews', 'waiting', 'changes']) assert.deepEqual(cli[key], web[key], `${key}: the same items in both forms`);
    assert.deepEqual(cli.projects, web.projects, 'the same plate, planning and gaps');
    assert.deepEqual(cli.coverage, web.coverage, 'the same coverage');
    // The hosted page renders the model's four sections (phase 166), and the terminal the same headings.
    const html = renderHomeSnapshot(s.web);
    for (const title of ['Needs you', 'Since you last looked', 'What should happen next?', 'Your plates']) assert.ok(html.includes(`>${title}</h2>`), title);
  } finally { await s.done(); }
});

const HEALTH = { 'docs/health/2026-11-01.md': '# Acme health, 2026-11-01\n\n## Proposal\n\n**`dependency_age`** — Update the Acme anvil library.\n' };

test('answers are one model', async () => {
  const s = await sources({ files: HEALTH });
  try {
    const needs = form => ['decisions', 'walks', 'reviews'].flatMap(key => form[key]);
    assert.ok(needs(s.web).some(i => i.itemKind === 'walk') && needs(s.web).some(i => i.itemKind === 'proposal') && needs(s.web).some(i => i.itemKind === 'review'), 'the fixture has walks, a proposal and a review');
    assert.deepEqual(needs(s.cli).map(formless), needs(s.web).map(formless), 'the same keys and answers, item by item');
    for (const form of [s.web, s.cli]) for (const item of needs(form)) {
      assert.match(item.key, /^studio:(walk|proposal|review|step):\S/, `${item.id}: a stable key`);
      assert.ok(item.answers.length > 1, `${item.key}: answers beyond Not now`);
      assert.ok(item.answers.some(a => a.writer === 'not now'), `${item.key}: Not now`);
      for (const a of item.answers) {
        assert.ok(['always', 'decline', 'never'].includes(a.needsWhy), `${item.key} ${a.id}: needsWhy`);
        if (a.unavailable) { assert.ok(a.unavailable.reason); assert.match(a.unavailable.command, /^(plates home --answer \S+ \S+|gh |plates feedback)/); }
      }
    }
    // The terminal runs every writer it has; the web lists the ones it cannot run, with the reason and the command.
    const walk = form => needs(form).find(i => i.itemKind === 'walk');
    assert.ok(walk(s.cli).answers.every(a => !a.unavailable), 'the CLI writes a walk');
    assert.ok(walk(s.web).answers.filter(a => a.writer === 'walk done').every(a => a.unavailable?.command.startsWith(`plates home --answer ${walk(s.web).key} `)));
    assert.ok(!walk(s.web).answers.find(a => a.writer === 'not now').unavailable, 'Not now has a store on the web');
    const decline = needs(s.cli).find(i => i.itemKind === 'proposal').answers.find(a => a.id === 'decline');
    assert.deepEqual([decline.needsWhy, decline.writer], ['decline', 'walk decide']);
    assert.deepEqual([s.cli.putOff.count, s.web.putOff.count], [0, 0]);
  } finally { await s.done(); }
});

test('a local-only source is named in both forms, never missing from one', async () => {
  const s = await sources({ reviews: false });
  try {
    const ids = HOME_SECTIONS.map(d => d.id);
    for (const form of [s.web, s.cli]) assert.deepEqual(form.sections.map(r => r.id), ids, 'every section is a row in both forms');
    const row = (form, id) => form.sections.find(r => r.id === id);
    // Local work: read on the owner's machine, named on the web with the reason and the command that reads it.
    assert.deepEqual([row(s.web, 'local').state, row(s.web, 'local').reason, row(s.web, 'local').command], ['unavailable', 'on your machine', 'plates loose-ends']);
    assert.equal(row(s.cli, 'local').state, 'read'); assert.equal(row(s.cli, 'local').command, 'plates loose-ends');
    // Lessons: neither form reads plates-inbox yet; both say why and name plates learn.
    for (const form of [s.web, s.cli]) assert.deepEqual([row(form, 'lessons').state, row(form, 'lessons').reason, row(form, 'lessons').command], ['unavailable', 'plates-inbox is not readable by the App yet', 'plates learn']);
    // Every web row the CLI reads names the same command.
    for (const id of ids) assert.equal(row(s.cli, id).command, row(s.web, id).command);
    // A shared source one form cannot read (reviews, without the App's Pull requests read) is a gap in that form, with its reason.
    assert.deepEqual(s.web.reviews, []);
    assert.match(s.web.coverage.gaps.find(g => g.source === 'reviews').reason, /Pull requests read permission/);
    assert.equal(s.cli.reviews.length, 1, 'the CLI reads reviews through gh');
    const html = renderHomeSnapshot(s.web);
    assert.match(html, /data-home-section="local"[\s\S]*?on your machine[\s\S]*?plates loose-ends/);
    assert.match(html, /data-home-section="lessons"[\s\S]*?plates-inbox is not readable by the App yet[\s\S]*?plates learn/);
  } finally { await s.done(); }
});

test('a plate past 160 phase files shows its newest phase\'s walk in both forms', async () => {
  // Phases 5–170 built and the newest, 171, owing a walk: the walks a 160-file read bound used to drop.
  const files = {};
  for (let id = 5; id <= 170; id++) files[`docs/phases/${String(id).padStart(3, '0')}-acme.md`] = phaseFile(id, { status: 'built' });
  files['docs/phases/171-acme-newest.md'] = phaseFile(171, { status: 'partial', owes: true });
  const s = await sources({ files });
  try {
    for (const form of [s.web, s.cli]) {
      assert.ok(form.walks.some(walk => walk.phase === '171' && walk.ready), 'the newest phase\'s walk is shown');
      assert.equal(form.projects[0].planning.total, 171, 'every phase file is read');
      assert.ok(!form.coverage.gaps.some(gap => gap.source === 'planning'), 'no planning gap');
    }
    assert.deepEqual(content(s.cli).walks, content(s.web).walks);
  } finally { await s.done(); }
});

test('past the phase-file bound, the newest phases are read and the gap says so', async () => {
  const { projectFromSource, PROJECT_LIMITS } = await import('../lib/web/projects.mjs');
  const files = { ...projectHarness().source.files };
  for (let id = 5; id <= 12; id++) files[`docs/phases/${String(id).padStart(2, '0')}-acme.md`] = phaseFile(id, { status: id === 12 ? 'partial' : 'built', owes: id === 12 });
  const oid = text => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
  const tree = Object.entries(files).map(([path, text]) => ({ path, type: 'blob', mode: '100644', sha: oid(text), size: Buffer.byteLength(text) }));
  const byOid = new Map(Object.values(files).map(text => [oid(text), Buffer.from(text)]));
  const value = await projectFromSource({ project: { id: 'studio', repoId: 102, repo: 'acme/studio' }, head: { sha: 'b'.repeat(40), message: MESSAGE, date: DATE },
    tree, readBlob: entry => byOid.get(entry.sha), limits: { ...PROJECT_LIMITS, phaseFiles: 5 } });
  assert.match(value.gaps.find(g => g.source === 'planning').reason, /exceeds the 5-file read bound; the newest 5 of 12 are read/);
  assert.equal(value.planning.total, 5, 'phases 8–12 read, 1–7 not');
  assert.ok(value.walks.some(walk => walk.phase === '12'), 'the newest phase\'s walk survives the bound');
});

// Phase 174: the review session walks the docket, one card at a time. The web's
// /review reads it from /api/home (docketItems, the browser's own reader); the
// terminal's plates home --review walks it from plates home's model. Here every
// card is put off and the write declined, so the CLI shows every card and writes nothing.
test('a review session walks one docket in both forms', async () => {
  const s = await sources({ files: HEALTH });
  try {
    const { docketItems } = await import('../lib/web/review-views.mjs');
    const web = docketItems(s.web), cli = docketItems(s.cli);
    assert.ok(web.length >= 3 && new Set(web.map(e => e.kind)).size >= 3, 'the fixture docket has several kinds');
    // Every item in Needs you is one card, in the model's order (phase 175: what an agent waits on, quick decisions, walks).
    const needs = form => [...form.decisions, ...form.walks.filter(w => w.ready !== false), ...form.reviews].filter(i => i.key).map(i => i.key);
    assert.deepEqual(web.map(e => e.key).sort(), needs(s.web).sort(), 'the web session holds every item in Needs you');
    const rank = { unblock: 0, decide: 1, walk: 2 };
    assert.ok(web.every((e, i) => i === 0 || rank[web[i - 1].group] <= rank[e.group]), 'grouped in the model\'s order');
    // The web reads no section rows; the terminal's local sections follow the shared lists.
    assert.ok(web.every(e => e.list !== 'sections'));
    assert.deepEqual(cli.filter(e => e.list !== 'sections').map(e => [e.key, e.kind, e.label]), web.map(e => [e.key, e.kind, e.label]), 'the same items in the same order');
    const html = (await import('../lib/web/review-views.mjs')).reviewView({ workspace: { name: 'Acme' }, csrf: 'x' }, s.web);
    assert.match(html, new RegExp(`data-review-card="${web[0].key}"`), 'the web\'s first card is the docket\'s first');
    const lines = cli.flatMap(() => ['n', '', 'n']).join('\n') + '\n';
    const run = runNode(process.execPath, [bin, 'home', '--review', '--json'], { cwd: join(s.dir, 'studio'), input: lines, timeout: 240_000,
      env: { ...gitEnv, PLATES_GH: join(s.dir, 'gh'), PLATES_CACHE: join(s.dir, 'cache'), PLATES_STATE: join(s.dir, 'state'), XDG_STATE_HOME: join(s.dir, 'state') } });
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout);
    assert.deepEqual(out.docket, cli.map(e => e.key), 'the terminal walks the model\'s docket');
    const shown = [...run.stderr.matchAll(/^\[(\d+) of (\d+)\]/gm)].map(m => Number(m[1]));
    assert.deepEqual(shown, cli.map((_, i) => i + 1), 'one card each, in order');
    assert.equal((run.stderr.match(/Write it\? \[y\/N\]/g) ?? []).length, cli.length, 'it asks before each write');
    assert.deepEqual([out.settled, out.putOff, out.again], [[], [], []], 'declined: nothing written');
  } finally { await s.done(); }
});

test('the terminal session writes only after a yes, asks for a why, and brings a refusal back', async () => {
  const { homeReview } = await import('../lib/home-review.mjs');
  const { reviewSnapshot } = await import('./helpers/review-fixture.mjs');
  const model = reviewSnapshot({ decisionWrites: true });
  const calls = [], writes = [];
  let refusals = 0;
  const answer = async (args) => {
    calls.push(args);
    if (args.answerId === 'choice-verified' && args.yes && refusals++ < 2) throw new Error('studio:walk:3 is not open: nothing written');
    if (args.yes) writes.push([args.key, args.answerId, args.why ?? null, args.until ?? null]);
    return args.yes ? { data: { until: args.until ?? '2026-11-10' }, text: `wrote ${args.answerId}`, exitCode: 0 } : { text: `would write ${args.answerId}`, exitCode: 3 };
  };
  // step: Not now, a date, no; claim: Keep, yes; proposal: decline asks for a why, then yes; walk: refused; the walk again: refused.
  // The docket's order (phase 175): the step, the claim, the proposal, the walk.
  const lines = ['n', '2026-11-20', 'n', '2', 'y', '2', 'not this quarter', 'y', '1', 'y', '1', 'y'];
  const input = (async function* () { yield* lines; })();
  let out = '';
  const r = await homeReview({ root: '/acme', input, write: t => { out += t; } }, { home: async () => model, answer, now: () => Date.parse('2026-11-03T12:00:00Z') });
  assert.deepEqual(writes, [['studio:claim:claims/phase-7', 'not-now', null, null], ['studio:proposal:docs/health/2026-11-01.md', 'decline', 'not this quarter', null]], 'only what was confirmed is written');
  assert.ok(calls.filter(c => !c.yes).length >= 3, 'each answer is previewed first');
  assert.match(out, /why \(a decline says why\)> /); assert.match(out, /Not written; it stays in Needs you/);
  assert.match(out, /^\[5 of 5\] Acme Studio · Walk/m, 'the refused walk comes back at the end');
  assert.match(out, /Needs another look: studio:walk:3 is not open/);
  assert.deepEqual(r.data.docket, model.docket.map(e => e.key));
  assert.equal(r.data.settled.length, 1); assert.equal(r.data.putOff.length, 1); assert.equal(r.data.again.length, 1); assert.match(r.data.again[0].reason, /not open/);
  assert.match(r.text, /1 settled · 1 put off · 1 needs another look/); assert.match(r.text, /^Needs another look$/m);
});

// Phase 166: home is four sections, in order, from one model. The web's /api/home and plates home --json carry the
// same sections, items and counts for the same sources; the terminal says each count. What one form cannot read yet
// (tonight's plan, agent issues) is a row in both, with its reason and command, as phase 156's sections are.
test('the four home sections are one model', async () => {
  const today = new Date().toISOString().slice(0, 10), day = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const { nightOf } = await import('../practices/night/files/scripts/plates/night-plan.mjs');
  const item = (id, title, status) => ({ id, title, kind: 'triage', source: 'owner', number: null, lane: 'night', budget: null, status, result: null });
  const plan = (date, items) => `${JSON.stringify({ schema: 1, date, shapedBy: 'owner', readyBy: null, willNotTouch: [], settledToday: [], leftOpen: [], items }, null, 2)}\n`;
  const files = { ...HEALTH,
    // Built today: it happened since any window. Last night's record has a failed item: a Fix, and a line under Since.
    'docs/phases/05-today.md': phaseFile(5, { status: 'built' }).replace('since: 2026-10-20', `since: ${today}`),
    [`docs/night/${day(-1)}.json`]: plan(day(-1), [item('acme-measure', 'Measure the Acme anvil', 'failed'), item('acme-triage', 'Triage Acme', 'done')]),
    // Tonight's plan as plates goodnight --yes left it in the checkout: the CLI reads it, the App does not.
    '.plates/night/plan.json': plan(nightOf(new Date()), [item('acme-sort', 'Sort the Acme findings', 'planned')]) };
  const issues = [{ number: 12, title: 'Acme: shorten the anvil page', url: 'https://github.com/acme/studio/issues/12', createdAt: '2026-11-01T00:00:00Z' }];
  const s = await sources({ files, issues });
  try {
    const four = form => form.home.sections, sec = (form, id) => four(form).find(x => x.id === id);
    for (const form of [s.web, s.cli]) assert.deepEqual(four(form).map(x => x.title), ['Needs you', 'Since you last looked', 'What should happen next?', 'Your plates'], 'the four, in order');
    // Needs you: the same ranked rows (fix, decide, try), only what the shared sources hold; answers less what a form can run.
    const shared = form => sec(form, 'needs-you').items.filter(i => !i.section).map(i => ({ ...i, answers: i.answers.map(({ unavailable, ...a }) => a) }));
    const web = shared(s.web);
    assert.deepEqual(web.map(i => i.verb), ['fix', 'decide', 'decide', 'decide', 'try'], 'the fixture has a fix, decisions and a walk, in rank');
    assert.deepEqual(web.map(i => i.kind), ['night', 'step', 'proposal', 'review', 'walk']);
    assert.deepEqual(shared(s.cli), web, 'the same rows in both forms');
    assert.equal(sec(s.cli, 'needs-you').count, sec(s.cli, 'needs-you').items.length);
    assert.equal(sec(s.web, 'needs-you').count, web.length);
    assert.equal(sec(s.cli, 'needs-you').known, sec(s.web, 'needs-you').known);
    // Since you last looked: neither form has a stored visit here, so both use the fixed window and say so.
    // (Phase 166 increment 4: the fixture's web has no visit store, SQL018, so it says so; the lines are the same.)
    const { unavailable, ...webSince } = sec(s.web, 'since');
    assert.equal(unavailable, 'Visits are not stored yet');
    assert.deepEqual(sec(s.cli, 'since'), webSince);
    assert.equal(sec(s.web, 'since').window, 'fixed');
    const lines = sec(s.web, 'since').plates.flatMap(p => p.lines.map(l => l.text));
    assert.ok(lines.includes('Phase 5 built: Acme phase 5'), lines.join(' | '));
    assert.ok(lines.includes(`The night of ${day(-1)}: 1 done, 1 failed`), lines.join(' | '));
    assert.ok(!lines.some(l => l.includes('Phase 4 built')), 'phase 4 was built before the window');
    // Your plates: one status each, the same in both forms.
    assert.deepEqual(sec(s.cli, 'plates'), sec(s.web, 'plates'));
    assert.equal(sec(s.web, 'plates').items[0].status, 'broken');
    // What should happen next?: the same rows in both; the CLI reads what is queued, the web names why it cannot and the command that can.
    assert.deepEqual(sec(s.cli, 'next').sources.map(r => [r.id, r.command]), sec(s.web, 'next').sources.map(r => [r.id, r.command]));
    assert.ok(sec(s.web, 'next').sources.every(r => r.state === 'unavailable' && r.reason));
    assert.equal(sec(s.web, 'next').known, true);
    assert.deepEqual(sec(s.cli, 'next').queued.map(q => [q.queue, q.title]), [['night', 'Sort the Acme findings'], ['agent', 'Acme: shorten the anvil page']]);
    assert.equal(sec(s.cli, 'next').count, 2);
    // The terminal says the four headings in order, with the model's counts, and the hedges once, in the footer.
    const text = runNode(process.execPath, [bin, 'home'], { cwd: join(s.dir, 'studio'),
      env: { ...gitEnv, PLATES_GH: join(s.dir, 'gh'), PLATES_CACHE: join(s.dir, 'cache'), PLATES_STATE: join(s.dir, 'other-state'), XDG_STATE_HOME: join(s.dir, 'other-state') } }).stdout;
    const at = ['Needs you', 'Since you last looked', 'What should happen next', 'Your plates'].map(t => text.search(new RegExp(`^${t.replace('?', '\\?')}`, 'm')));
    assert.ok(at.every((n, i) => n >= 0 && (i === 0 || n > at[i - 1])), text);
    assert.match(text, new RegExp(`^Needs you \\(${sec(s.cli, 'needs-you').count}\\)$`, 'm'));
    // The start line and the web's Start panel count what Needs you counts, the failed night's Fix (no answers) too.
    assert.ok(sec(s.web, 'needs-you').count > s.web.docket.length, 'the fixture has a row with no answers');
    assert.match(text, new RegExp(`^ {2}${sec(s.cli, 'needs-you').count} need you · about \\d+ min — plates home --review`, 'm'));
    const { renderReviewStart } = await import('../lib/web/review-views.mjs');
    assert.match(renderReviewStart(s.web), new RegExp(`<strong>${sec(s.web, 'needs-you').count} need you · `));
    assert.match(text, new RegExp(`^Since you last looked \\(${sec(s.web, 'since').count}\\) — the last 7 days$`, 'm'));
    assert.match(text, /^What should happen next\? \(2 queued\)$/m);
    assert.match(text, /^ {2}Fix · Acme Studio: The night of/m);
    assert.match(text, /^ {2}Acme Studio: broken\b/m);
    assert.doesNotMatch(text, /at least|At least|in this source read|Inspection only/);
  } finally { await s.done(); }
});

test('since you last looked, in the terminal, starts at its last run', async () => {
  const s = await sources();
  try {
    const env = { ...gitEnv, PLATES_GH: join(s.dir, 'gh'), PLATES_CACHE: join(s.dir, 'cache'), PLATES_STATE: join(s.dir, 'state'), XDG_STATE_HOME: join(s.dir, 'state') };
    // sources() ran plates home --json once: the second run starts where it looked, and keeps only a time.
    const again = JSON.parse(runNode(process.execPath, [bin, 'home', '--json'], { cwd: join(s.dir, 'studio'), env }).stdout);
    const since = again.home.sections.find(x => x.id === 'since');
    assert.equal(since.window, 'last-run');
    assert.ok(Date.parse(since.from) >= Date.parse(s.cli.generatedAt) - 1000 && Date.parse(since.from) <= Date.parse(again.generatedAt), since.from);
    const { readFile } = await import('node:fs/promises');
    const kept = JSON.parse(await readFile(join(s.dir, 'state', 'plates', 'last-looked.json'), 'utf8'));
    assert.deepEqual(Object.keys(kept).sort(), ['at', 'schema']);
  } finally { await s.done(); }
});

// Phase 158: a plate's changes in flight are one model too. The same waits answers, through the CLI's gh and the
// web's App, give the same items, states, next actions and Fixes; only when each read is its own (readAt, ages).
test('the CLI and the web show the same changes in flight', async () => {
  const s = await sources({ waits: waitsFixture('acme/studio', Date.now()) });
  try {
    const timeless = form => {
      const w = structuredClone(form.projects[0].waits);
      for (const i of w.items) { delete i.ageMs; delete i.branchAgeMs; }
      delete w.now; delete w.source.readAt; delete w.source.window.to; delete w.tested.lagMs;
      return w;
    };
    assert.equal(s.web.projects[0].waits.state, 'read');
    assert.deepEqual(timeless(s.cli), timeless(s.web), 'the same waits in both forms');
    assert.deepEqual(s.cli.projects[0].waits.items.map(i => [i.branch, i.state]), [['claude/phase-7', 'integration'], ['claude/phase-4', 'deploy'], ['claude/phase-5', 'ci'], ['codex/phase-9', 'ci']]);
    const fixes = form => form.home.sections.find(x => x.id === 'needs-you').items.filter(n => n.kind === 'waits').map(n => [n.verb, n.key, n.title]);
    assert.deepEqual(fixes(s.cli), fixes(s.web));
    assert.deepEqual(fixes(s.web).map(f => f[1]), ['studio:waits:lock', 'studio:waits:main']);
    const rows = form => form.home.sections.find(x => x.id === 'plates').items[0].waits.rows.map(r => [r.branch, r.words, r.age, r.next]);
    assert.deepEqual(rows(s.cli), rows(s.web));
    // Each renderer prints the model's rows: the plate's page and plates home --project.
    const html = renderHomeSnapshot(s.web, { projectId: 'studio' });
    assert.match(html, />Changes in flight<\/h2>[\s\S]*waiting on integration · 2 h · past its target[\s\S]*claude\/phase-7/);
    const text = runNode(process.execPath, [bin, 'home', '--project', 'studio'], { cwd: join(s.dir, 'studio'), timeout: 120_000,
      env: { ...gitEnv, PLATES_GH: join(s.dir, 'gh'), PLATES_CACHE: join(s.dir, 'cache'), PLATES_STATE: join(s.dir, 'state'), XDG_STATE_HOME: join(s.dir, 'state') } });
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /Changes in flight \(4\)\n  waiting on integration · claude\/phase-7 · 2 h · past its target/);
    for (const r of rows(s.web)) assert.ok(text.stdout.includes(r[3]), `the terminal prints ${r[0]}'s next action`);
    assert.ok(!renderHomeSnapshot(s.web).includes('>Changes in flight</h2>'), 'home itself lists no waits: the plate\'s page does');
  } finally { await s.done(); }
});

// Phase 178: the backlog is one model too. plates home --backlog --json and /api/backlog are both backlogFor over
// their own snapshot, with each plate's phases from the same read (projectFromSource) and its claims from where each
// form reads them: the checkout's remote through git and gh, and the App's GraphQL. Here both see one claim branch.
// What a read adds about itself: when it read (readAt, and the claim's days left to the tenth), and which writers a form runs.
const sourceless = backlog => ({ ...backlog, lanes: backlog.lanes.map(l => ({ ...l, items: l.items.map(({ source: { readAt, ...source }, answers, ageLeft, ...item }) => ({ ...item, source, answers: answers.map(({ unavailable, ...a }) => a) })) })) });
test('backlog matches in both forms', async () => {
  const s = await sources();
  try {
    // A remote for the checkout, and a claim on phase 1 pushed to it as plates phase claim writes one. The App lists the same branch.
    const remote = join(s.dir, 'remote.git'), at = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { env: s.gitEnv });
    s.git(['remote', 'add', 'origin', remote]); s.git(['push', '-q', 'origin', 'main']);
    const message = claimMessage({ phase: 1, provider: 'claude', machine: 'acme-mac', at, token: 'acme-token' });
    const sha = execFileSync('git', ['-C', s.root, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', message], { env: { ...s.gitEnv, GIT_COMMITTER_DATE: at, GIT_AUTHOR_DATE: at }, encoding: 'utf8' }).trim();
    s.git(['push', '-q', 'origin', `${sha}:refs/heads/claims/phase-1`]);
    s.claimRefs.push({ name: 'phase-1', target: { oid: sha, message, committedDate: at } });

    const run = s.again(['--backlog', '--json'], { env: { ACME_GH_PRS: '[]' } });
    assert.equal(run.status, 0, run.stderr);
    const cli = JSON.parse(run.stdout);
    const web = await s.readWeb({ backlog: true }), api = { schema: 1, generatedAt: web.generatedAt, lane: null, ...web.backlog };
    assert.deepEqual(cli.lanes.map(l => l.lane), BACKLOG_LANES.map(l => l.id), 'every lane, in order');
    assert.deepEqual(sourceless({ ...api, generatedAt: null }), sourceless({ ...cli, generatedAt: null }), 'the same lanes, items, why-keys, plates and claims in both forms');
    // The fixture puts something in three lanes, so equality is not two empty backlogs agreeing.
    const lanes = Object.fromEntries(cli.lanes.map(l => [l.lane, l.items.map(i => i.key)]));
    assert.deepEqual(lanes['in-flight'], ['studio:phase:1'], 'the claimed phase is in flight');
    assert.deepEqual(cli.lanes[0].items[0].holder, { by: 'branch', branch: 'claims/phase-1', provider: 'claude', machine: 'acme-mac', at, pr: null });
    assert.ok(Math.abs(cli.lanes[0].items[0].ageLeft - 7) <= 0.1 && Math.abs(api.lanes[0].items[0].ageLeft - 7) <= 0.1, 'a fresh claim has its seven days');
    assert.ok(lanes.yours.includes('studio:phase:2'), 'the walk nests under its phase');
    assert.deepEqual(lanes.waiting, ['studio:phase:3'], 'the walk that is not ready waits');
    assert.deepEqual(lanes.done, [], 'phase 4 was built before the seven-day window');
    assert.deepEqual(cli.claims, [{ projectId: 'studio', read: true }]);
    // The web page renders those items: every lane's header and count, one row per item, and Start off with its reason.
    const html = backlogView(s.access, api);
    for (const l of api.lanes) assert.match(html, new RegExp(`id="lane-${l.lane}">${l.title} <span class="meta">${l.items.length}</span>`));
    for (const item of api.lanes.flatMap(l => l.items)) assert.ok(html.includes(`data-backlog-item="${item.key}"`), item.key);
    assert.match(html, /claim 6d left|claim 7d left/);
    assert.match(html, /<span class="p-badge">claude · claimed<\/span>/);
    if (lanes['agent-ready'].length) assert.ok(html.includes(`title="${START_UNAVAILABLE.replace("'", "&#39;")}: plates home --attach `));
    // The terminal renders the same items, one line each, under its lane's header and count.
    const text = s.again(['--backlog'], { env: { ACME_GH_PRS: '[]' } });
    assert.equal(text.status, 0, text.stderr);
    for (const l of cli.lanes) assert.match(text.stdout, new RegExp(`^${l.title} ${l.count}$`, 'm'));
    for (const item of cli.lanes.flatMap(l => l.items)) assert.ok(text.stdout.split('\n').some(line => line.includes(item.title)), item.key);
    assert.match(text.stdout, /^ {2}1\. Acme Studio #1 {2}Acme phase 1 · G1 {2}\[claude · claimed\] {2}— claim [67]d left$/m);
    assert.match(text.stdout, /^ {2}\d\. Try the Acme preview on your phone\. {2}\[\+walk\] {2}— added \d+ days ago\n {7}Acme Studio #2 · Acme phase 2 · G1 · ~5 min\n {7}Works \| Needs changes$/m);
  } finally { await s.done(); }
});

// The owner's feedback (phase 178): a backlog of questions to work through. A Yours row with an Ask leads with it, its
// phase number and title as context, and its choices under it with the Your part's Recommend marked, in both forms.
test('a question leads its row in Yours', async () => {
  const walk = phaseFile(2, { status: 'partial', owes: true }).replace('- **Choices:** Works | Needs changes\n', '- **Choices:** Works | Needs changes\n- **Recommend:** Works\n');
  assert.match(walk, /\*\*Recommend:\*\* Works\n/);
  const s = await sources({ files: { 'docs/phases/02-walk.md': walk } });
  try {
    const run = s.again(['--backlog', '--json']);
    assert.equal(run.status, 0, run.stderr);
    const cli = JSON.parse(run.stdout), web = (await s.readWeb({ backlog: true })).backlog;
    const card = form => form.lanes.find(l => l.lane === 'yours').items.find(i => i.key === 'studio:phase:2');
    for (const [name, form] of [['cli', cli], ['web', web]]) {
      assert.deepEqual(card(form).question, { ask: 'Try the Acme preview on your phone.', choices: ['Works', 'Needs changes'], recommend: 'Works' }, `${name}: the question`);
      assert.equal(card(form).title, 'Acme phase 2', `${name}: the title stays, as context`);
      assert.deepEqual(card(form).answers.filter(a => a.recommended).map(a => a.label), ['Works'], `${name}: the recommended answer`);
    }
    assert.deepEqual(card(web).question, card(cli).question);
    // Items with no Ask keep their title as the headline: the review.
    for (const form of [cli, web]) assert.equal(form.lanes.find(l => l.lane === 'yours').items.find(i => i.kind === 'review').question, null);
    // The terminal: the question, then the context, then the choices with the recommendation marked.
    const text = s.again(['--backlog']).stdout;
    assert.match(text, /^ {2}\d\. Try the Acme preview on your phone\. {2}\[\+walk\] {2}— added \d+ days ago\n {7}Acme Studio #2 · Acme phase 2 · G1 · ~5 min\n {7}Works \(Recommended\) \| Needs changes$/m);
    // The web: the question as the row's headline, the context under it, the choices linking to where Home answers.
    const html = backlogView(s.access, { schema: 1, generatedAt: new Date().toISOString(), lane: null, ...web });
    assert.match(html, /<span class="backlog-what backlog-q"[^>]*><strong>Try the Acme preview on your phone\.<\/strong><span class="backlog-ref">Acme Studio #2 · Acme phase 2<\/span><span class="backlog-choices"><a class="p-badge" href="\/review" data-recommended>Works · Recommended<\/a><a class="p-badge" href="\/review">Needs changes<\/a><\/span><\/span>/);
    assert.match(html, /<span class="backlog-ref">Acme Studio PR #7<\/span>acme\/studio#7: 1 review comment unanswered/, 'a review keeps its title');
  } finally { await s.done(); }
});

// Phase 185: Recurring is one model too. plates home --recurring --json and /api/recurring are both recurringOf over
// the plate's workflows and plates.json from Home's own read, its night record, and its latest runs (gh, or the App).
const WORKFLOWS = {
  '.github/workflows/plates-night.yml': 'name: plates-night\non:\n  schedule:\n    - cron: "23 7 * * *"\n  workflow_dispatch:\njobs: {}\n',
  '.github/workflows/plates-robot.yml': 'name: plates-robot\non:\n  schedule:\n    - cron: "37 11 * * 1"\njobs: {}\n',
  '.github/workflows/plates-publish.yml': 'name: plates-publish\non:\n  workflow_run:\n    workflows: [check]\n    types: [completed]\njobs: {}\n',
  '.github/workflows/acme-sweep.yml': 'name: Acme sweep\non:\n  schedule:\n    - cron: "0 */6 * * *"\njobs: {}\n',
};
const RUNS = [
  { path: '.github/workflows/plates-night.yml', workflowName: 'plates-night', status: 'completed', conclusion: 'success', createdAt: '2026-11-05T07:31:00Z', url: 'https://github.com/acme/studio/actions/runs/11' },
  { path: '.github/workflows/plates-publish.yml', workflowName: 'plates-publish', status: 'completed', conclusion: 'failure', createdAt: '2026-11-05T09:00:00Z', url: 'https://github.com/acme/studio/actions/runs/12' },
];
test('recurring matches in both forms', async () => {
  const s = await sources({ files: WORKFLOWS, runs: RUNS });
  try {
    const run = s.again(['--recurring', '--json']);
    assert.equal(run.status, 0, run.stderr);
    const cli = JSON.parse(run.stdout), web = await s.readWeb({ recurring: true });
    const plates = form => form.plates.map(p => ({ ...p, routines: p.routines?.map(({ nextRun, shapes, ...r }) => ({ ...r, shapes: shapes.map(({ next, ...x }) => x) })) }));
    assert.deepEqual(plates(web.recurring), plates(cli), 'the same routines, schedules, states, budgets and last results');
    assert.deepEqual(web.links, cli.links, 'the same links');
    // Next runs come from the same crons; each form computed them at its own moment, so they agree to the minute's cron.
    for (const [a, b] of web.recurring.plates[0].routines.map((r, i) => [r.nextRun, cli.plates[0].routines[i].nextRun])) assert.ok(a === b || Math.abs(Date.parse(a) - Date.parse(b)) <= 6 * 3_600_000, `${a} ~ ${b}`);
    // The fixture exercises a scheduled routine, an off one, an event one and one plates does not ship, so equality is not two empty lists agreeing.
    const by = Object.fromEntries(cli.plates[0].routines.map(r => [r.id, r]));
    assert.deepEqual(cli.plates[0].routines.map(r => r.id), ['night', 'robot', 'publish', '.github/workflows/acme-sweep.yml']);
    assert.equal(by.night.last.from, 'workflow run', 'no night record in the fixture: the latest run answers');
    assert.equal(by.night.last.result, 'success');
    assert.deepEqual([by.robot.state, by.robot.off.key], ['off', 'robot.on']);
    assert.equal(by.publish.last.result, 'failure');
    assert.equal(by['.github/workflows/acme-sweep.yml'].last.none, 'no run in the latest runs read');
    assert.deepEqual(cli.links, [{ projectId: 'studio', projectName: 'Acme Studio', repo: 'https://github.com/acme/studio', canvas: null, production: null }]);
    // The page renders the same routines, and the terminal says each one.
    const { recurringView } = await import('../lib/web/backlog-views.mjs');
    const html = recurringView(s.access, { ...web.recurring, sidebar: { humans: [{ login: 'acme-owner', role: 'owner' }], links: web.links } });
    for (const r of web.recurring.plates[0].routines) assert.ok(html.includes(`data-routine="${r.id}"`), r.id);
    assert.match(html, /<strong>Robot<\/strong>[^]*?<strong>off<\/strong>: robot.on is not true[^<]*\(<code>robot.on<\/code>\)/);
    assert.match(html, /<li>acme-owner <small>owner<\/small><\/li>/);
    const text = s.again(['--recurring']).stdout;
    assert.match(text, /^Acme Studio — 4 routines$/m);
    assert.match(text, /^ {2}Night: daily at \d\d:23 \S+ · next /m);
    assert.match(text, /^ {2}Robot: weekly on \w{3}, \d\d:37 \S+ · off: robot\.on is not true/m);
    assert.match(text, /^ {6}last failure \(2026-11-05 09:00 UTC\)$/m);
  } finally { await s.done(); }
});

// Phase 186: Agents and Pending review are one model too. plates home --agents --json and /api/agents are both agentsFor
// over each plate's config and phases from Home's read, its claims (git and gh, or the App) and its open PRs (gh, or the App).
const PRS = [
  { number: 21, title: 'Acme anvils, sharper', url: 'https://github.com/acme/studio/pull/21', createdAt: '2026-11-01T10:00:00Z', isDraft: false, reviewDecision: 'REVIEW_REQUIRED', autoMergeRequest: null, author: { login: 'acme-owner' }, headRefName: 'claude/anvils', state: 'OPEN' },
  { number: 22, title: 'Acme bump', url: 'https://github.com/acme/studio/pull/22', createdAt: '2026-10-30T10:00:00Z', isDraft: false, reviewDecision: null, autoMergeRequest: { enabledAt: '2026-10-30T11:00:00Z' }, author: { login: 'renovate' }, headRefName: 'renovate/x', state: 'OPEN' },
];
test('agents match in both forms', async () => {
  const s = await sources({ prs: PRS, config: { agents: { claude: {}, codex: {} }, backlog: { routes: ['session', 'tonight'] } } });
  try {
    const remote = join(s.dir, 'remote.git'), at = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { env: s.gitEnv });
    s.git(['remote', 'add', 'origin', remote]); s.git(['push', '-q', 'origin', 'main']);
    const message = claimMessage({ phase: 1, provider: 'claude', machine: 'acme-mac', at, token: 'acme-token' });
    const sha = execFileSync('git', ['-C', s.root, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', message], { env: { ...s.gitEnv, GIT_COMMITTER_DATE: at, GIT_AUTHOR_DATE: at }, encoding: 'utf8' }).trim();
    s.git(['push', '-q', 'origin', `${sha}:refs/heads/claims/phase-1`]);
    s.claimRefs.push({ name: 'phase-1', target: { oid: sha, message, committedDate: at } });

    const run = s.again(['--agents', '--json'], { env: { ACME_GH_PRS: JSON.stringify(PRS) } });
    assert.equal(run.status, 0, run.stderr);
    const cli = JSON.parse(run.stdout), web = (await s.readWeb({ agents: true })).agents;
    const ageless = m => ({ ...m, generatedAt: null, pending: { ...m.pending, items: m.pending.items.map(({ ageDays, ...i }) => i) } });
    assert.deepEqual(ageless(web), ageless(cli), 'the same agents, routes and pending reviews in both forms');
    // The fixture: claude holds phase 1, codex is idle; session and tonight on, the robot off; one PR waits, the auto-merge one does not.
    const by = Object.fromEntries(cli.agents.providers.map(p => [p.id, p]));
    assert.deepEqual(by.claude.holds.map(h => [h.projectId, h.phase, h.title, h.presence]), [['studio', 1, 'Acme phase 1', 'claimed']]);
    assert.equal(by.codex.state, 'idle');
    assert.deepEqual(cli.agents.routes.filter(r => r.state === 'on').map(r => r.id), ['session', 'tonight']);
    assert.deepEqual(cli.pending.items.map(i => [i.number, i.review]), [[21, 'review required']]);
    // The page renders the same, and the terminal says it.
    const { agentsView } = await import('../lib/web/backlog-views.mjs');
    const html = agentsView(s.access, { ...web, sidebar: { humans: [], links: [], counts: {} } });
    assert.match(html, /data-agent="claude"[^]*?working on <strong>Acme Studio #1<\/strong> Acme phase 1/);
    assert.match(html, /data-agent="codex"[^]*?<p class="backlog-none">idle<\/p>/);
    assert.match(html, /data-pending="studio:review:21"/); assert.doesNotMatch(html, /studio:review:22/);
    assert.match(html, /<a href="\/agents" aria-current="page">Agents <span class="p-badge">1<\/span><\/a><a href="\/agents#pending">Pending review <span class="p-badge">1<\/span><\/a>/);
    const text = s.again(['--agents'], { env: { ACME_GH_PRS: JSON.stringify(PRS) } }).stdout;
    assert.match(text, /^ {2}claude: working on Acme Studio #1 Acme phase 1 · claimed on acme-mac$/m);
    assert.match(text, /^ {2}Acme Studio #21 {2}Acme anvils, sharper · review required {2}— \d+ days old$/m);
  } finally { await s.done(); }
});

// Phase 179: By goal is the same backlog arranged by the same pure rules, so both forms make the same cards and groups.
test('by goal matches in both forms', async () => {
  const s = await sources({ files: { 'docs/goals.json': JSON.stringify([{ id: 'G1', title: 'A dependable studio', outcome: 'People publish confidently.' }]) } });
  try {
    const run = s.again(['--backlog', '--by-goal', '--json']);
    assert.equal(run.status, 0, run.stderr);
    const cli = JSON.parse(run.stdout), web = (await s.readWeb({ backlog: true })).backlog;
    const { byGoal } = await import('../lib/web/backlog-grouping.mjs');
    const shape = groups => groups.map(g => ({ key: g.key, title: g.title, counts: g.counts, cards: g.cards.map(c => ({ key: c.key, lane: c.lane, keys: c.keys, members: c.members.map(m => m.identity) })) }));
    assert.equal(cli.arrangement, 'by-goal');
    assert.deepEqual(shape(byGoal(web).groups), shape(cli.groups));
    assert.deepEqual(cli.groups.map(g => [g.key, g.title]), [['studio:goal:G1', 'A dependable studio'], ['studio:goal:none', null]]);
    const walk = cli.groups[0].cards.find(c => c.key === 'studio:phase:2');
    assert.deepEqual(walk.members.map(m => m.kinds), [['walk']], 'the walk nests in its phase\'s one card');
    // The page arranges the same, and the terminal says it.
    const { backlogView } = await import('../lib/web/backlog-views.mjs');
    const html = backlogView(s.access, { schema: 1, generatedAt: new Date().toISOString(), lane: null, ...web }, { arrangement: 'goals' });
    assert.match(html, /<a href="\/backlog\/goals" aria-current="page">By goal<\/a>/);
    for (const g of cli.groups) assert.ok(html.includes(`data-goal="${g.key}"`), g.key);
    assert.match(s.again(['--backlog', '--by-goal']).stdout, /^Acme Studio · G1 — A dependable studio {2}\(/m);
    assert.equal(s.again(['--backlog', '--by-goal', '--lane', 'yours']).status, 2, '--by-goal takes no --lane');
  } finally { await s.done(); }
});

test('a plate with no remote holds no claims, in the terminal', async () => {
  const s = await sources({ reviews: false });
  try {
    const run = s.again(['--backlog', '--json']);
    assert.equal(run.status, 0, run.stderr);
    const cli = JSON.parse(run.stdout);
    assert.deepEqual(cli.claims, [{ projectId: 'studio', read: false, why: 'no git remote here, so there is nowhere to hold a claim' }]);
    assert.equal(cli.plates[0].state, 'read');
    assert.deepEqual(cli.lanes[0].items, [], 'nothing in flight');
    assert.match(s.again(['--backlog']).stdout, /^In flight 0\n {2}none$/m, 'an empty lane says none');
  } finally { await s.done(); }
});

test('the backlog keeps one lane, and refuses one it does not have', async () => {
  const s = await sources({ reviews: false });
  try {
    const one = s.again(['--backlog', '--lane', 'waiting', '--json']);
    assert.equal(one.status, 0, one.stderr);
    const data = JSON.parse(one.stdout);
    assert.deepEqual([data.lane, data.lanes.map(l => l.lane)], ['waiting', ['waiting']]);
    assert.deepEqual(data.lanes[0].items.map(i => i.key), ['studio:phase:3']);
    assert.ok(Object.values(data.plates[0].counts).reduce((a, b) => a + b) > 1, 'the plate\'s counts stay whole');
    const text = s.again(['--backlog', '--lane', 'waiting']);
    assert.match(text.stdout, /^Waiting 1$/m); assert.doesNotMatch(text.stdout, /^Yours /m);
    for (const args of [['--backlog', '--lane', 'someday'], ['--backlog', '--lane'], ['--backlog', '--answer', 'x']]) {
      const bad = s.again([...args, '--json']);
      assert.equal(bad.status, 2, `${args.join(' ')}: ${bad.stdout}${bad.stderr}`);
    }
    assert.match(s.again(['--backlog', '--lane', 'someday']).stderr, /--lane is one of in-flight, yours, agent-ready, waiting, done/);
  } finally { await s.done(); }
});
