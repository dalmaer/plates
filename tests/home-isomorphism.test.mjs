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
    env: { ...gitEnv, PLATES_GH: gh, PLATES_CACHE: join(dir, 'cache'), PLATES_STATE: join(dir, 'state') } });
  assert.equal(run.status, 0, run.stderr);
  return { web, cli: JSON.parse(run.stdout), dir, done: () => rm(dir, { recursive: true, force: true }) };
}

// What a reader adds about its own read, not the sources: when it read, and the App's numeric repository id.
const content = snapshot => ({
  coverage: snapshot.coverage,
  projects: snapshot.projects.map(({ readAt, repoId, ...project }) => project),
  ...Object.fromEntries(['decisions', 'walks', 'reviews', 'waiting', 'changes'].map(key => [key, snapshot[key]])),
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
      env: { ...gitEnv, PLATES_GH: join(s.dir, 'gh'), PLATES_CACHE: join(s.dir, 'cache'), PLATES_STATE: join(s.dir, 'state') } }).stdout;
    for (const [title, n] of [['Decisions that need you', web.decisions.length], ['Ready to test', web.walks.filter(w => w.ready).length], ['Reviews waiting on you', web.reviews.length], ['In progress / waiting', web.waiting.length]]) {
      assert.match(html, new RegExp(`>${title}</h2>`)); assert.match(text, new RegExp(`^${title.replace('/', '\\/')} \\((at least )?${n}\\)$`, 'm'), `${title}: ${n} in the terminal`);
    }
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
