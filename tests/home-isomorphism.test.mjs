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
import { HOME_SECTIONS } from '../lib/work-items.mjs';

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
async function sources({ reviews = true, files = {} } = {}) {
  const h = projectHarness();
  Object.assign(h.source.files, files);
  h.source.files['.plates/plates.json'] = JSON.stringify({ name: 'Acme Studio', repo: 'acme/studio', tagline: 'Publish useful things.', practice: '0.8.32', stack: ['node'], phases: { shape: 'files' } });
  const dir = await mkdtemp(join(tmpdir(), 'plates-home-iso-')), root = join(dir, 'studio');
  for (const [path, content] of Object.entries(h.source.files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); }
  const git = args => execFileSync('git', ['-C', root, ...args], { env: gitEnv, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']); git(['add', '-A']); git(['commit', '-q', '-m', MESSAGE]);
  h.source.revision = git(['rev-parse', 'HEAD']);
  // The web: GraphQL through the App answers the review read.
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
      return Response.json({ data: { rateLimit: rate, ...(query.includes('PlatesReviewWindow') ? { repository: reviewRepository } : {}) } }, { headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } });
    }
    return h.fetcher(url, options);
  };
  // The CLI: a gh that answers the same review read, the viewer's login, and nothing else.
  const gh = join(dir, 'gh');
  await writeFile(gh, `#!${process.execPath}
const argv = process.argv.slice(2), q = (argv.find(a => a.startsWith('query=')) ?? '').slice(6);
if (argv[0] === 'api' && argv[1] === 'user') console.log('acme-owner');
else if (argv[0] === 'api' && argv[1] === 'graphql' && q.includes('PlatesReviewWindow')) console.log(JSON.stringify({ data: { rateLimit: ${JSON.stringify(rate)}, repository: ${JSON.stringify(reviewRepository)} } }));
else if (argv[0] === 'api' && argv[1] === 'graphql') console.log(JSON.stringify({ data: { rateLimit: ${JSON.stringify(rate)} } }));
else { console.error('fake gh: offline'); process.exit(1); }
`);
  await chmod(gh, 0o755);
  const web = await createHomeReader(h.config, { fetcher, now: () => Date.now() })({ ...h.access, login: 'acme-owner', pullRequestsRead: reviews }, token);
  const run = runNode(process.execPath, [bin, 'home', '--json'], { cwd: root, timeout: 120_000,
    env: { ...gitEnv, PLATES_GH: gh, PLATES_CACHE: join(dir, 'cache'), PLATES_STATE: join(dir, 'state'), XDG_STATE_HOME: join(dir, 'state') } });
  assert.equal(run.status, 0, run.stderr);
  return { web, cli: JSON.parse(run.stdout), dir, done: () => rm(dir, { recursive: true, force: true }) };
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
    // Same sections, same counts: the terminal says each count the HTML says.
    const html = renderHomeSnapshot(s.web), text = runNode(process.execPath, [bin, 'home'], { cwd: join(s.dir, 'studio'),
      env: { ...gitEnv, PLATES_GH: join(s.dir, 'gh'), PLATES_CACHE: join(s.dir, 'cache'), PLATES_STATE: join(s.dir, 'state'), XDG_STATE_HOME: join(s.dir, 'state') } }).stdout;
    for (const [title, n] of [['Decisions that need you', web.decisions.length], ['Ready to test', web.walks.filter(w => w.ready).length], ['Reviews waiting on you', web.reviews.length], ['In progress / waiting', web.waiting.length]]) {
      assert.match(html, new RegExp(`>${title}</h2>`)); assert.match(text, new RegExp(`^${title.replace('/', '\\/')} \\((at least )?${n}\\)$`, 'm'), `${title}: ${n} in the terminal`);
    }
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
    // Every item in Needs you is one card, in the model's order (decisions, ready walks, reviews).
    const needs = form => [...form.decisions, ...form.walks.filter(w => w.ready !== false), ...form.reviews].filter(i => i.key).map(i => i.key);
    assert.deepEqual(web.map(e => e.key), needs(s.web), 'the web session holds every item in Needs you, in order');
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
  // proposal: decline asks for a why, then yes; step: Not now, a date, no; walk: refused; claim: Keep, yes; the walk again: refused.
  const lines = ['2', 'not this quarter', 'y', 'n', '2026-11-20', 'n', '1', 'y', '2', 'y', '1', 'y'];
  const input = (async function* () { yield* lines; })();
  let out = '';
  const r = await homeReview({ root: '/acme', input, write: t => { out += t; } }, { home: async () => model, answer, now: () => Date.parse('2026-11-03T12:00:00Z') });
  assert.deepEqual(writes, [['studio:proposal:docs/health/2026-11-01.md', 'decline', 'not this quarter', null], ['studio:claim:claims/phase-7', 'not-now', null, null]], 'only what was confirmed is written');
  assert.ok(calls.filter(c => !c.yes).length >= 3, 'each answer is previewed first');
  assert.match(out, /why \(a decline says why\)> /); assert.match(out, /Not written; it stays in Needs you/);
  assert.match(out, /^\[5 of 5\] Acme Studio · Walk/m, 'the refused walk comes back at the end');
  assert.match(out, /Needs another look: studio:walk:3 is not open/);
  assert.deepEqual(r.data.docket, model.docket.map(e => e.key));
  assert.equal(r.data.settled.length, 1); assert.equal(r.data.putOff.length, 1); assert.equal(r.data.again.length, 1); assert.match(r.data.again[0].reason, /not open/);
  assert.match(r.text, /1 settled · 1 put off · 1 needs another look/); assert.match(r.text, /^Needs another look$/m);
});
