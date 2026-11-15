// Main vs production (lib/production-release.mjs): one plate's default-branch head beside the commit production
// serves, from plates promote's deploy records. The model, its row, and the checkout reader over a real origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { releaseOf, withLead, servingOf } from '../lib/production-release.mjs';
import { releaseView, validRelease } from '../lib/work-items.mjs';
import { deployResults } from '../practices/night/files/scripts/plates/morning.mjs';
import { checkoutRelease } from '../lib/home.mjs';
import { releaseRow } from '../lib/web/plate-workspace.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
const record = (over = {}) => ({ schema: 1, project: 'acme', commit: A, action: 'deploy', at: '2026-11-14T10:00:00.000Z', ok: true, rolledBack: false, failed: null,
  checks: [{ check: 'revision', ok: true, detail: 'Acme' }], deployment: { id: 'dpl_acme', url: 'https://acme.example' }, serving: { id: 'dpl_acme', url: 'https://acme.example', commit: A }, ...over });
const text = (...records) => records.map(r => JSON.stringify(r)).join('\n') + '\n';
// The records as both readers hand them over: parsed by the morning brief's own parser.
const parsed = (...records) => deployResults(text(...records));
const failing = { ok: false, failed: 'smoke', checks: [{ check: 'smoke', ok: false, detail: null }] };

test('production serving main is current', () => {
  const r = releaseOf({ main: A, deploys: parsed(record()) });
  assert.deepEqual(r, { state: 'current', main: A, production: { sha: A, at: '2026-11-14T10:00:00.000Z', checkedAt: '2026-11-14T10:00:00.000Z', deployment: 'dpl_acme' }, ahead: 0, why: null });
  assert.equal(releaseView(r).line, 'production is main (aaaaaaa), deployed 2026-11-14');
});

test('unequal is unknown until main is shown to contain production, then behind by its lead', () => {
  const r = releaseOf({ main: B, deploys: parsed(record()) });
  assert.deepEqual([r.state, r.production.sha, r.ahead], ['unknown', A, null], 'never behind on inequality alone');
  assert.equal(releaseView(r).line, 'main bbbbbbb; production aaaaaaa unknown: main has not been shown to contain it');
  assert.equal(releaseView(withLead(r, { relation: 'ahead', ahead: 3 })).line, 'production aaaaaaa is 3 commits behind main bbbbbbb (deployed 2026-11-14)');
  assert.equal(releaseView(withLead(r, { relation: 'ahead', ahead: 1 })).line, 'production aaaaaaa is 1 commit behind main bbbbbbb (deployed 2026-11-14)');
  const diverged = withLead(r, { relation: 'diverged', ahead: 4, why: 'production aaaaaaa is not on main' });
  assert.deepEqual([diverged.state, diverged.why], ['unknown', 'production aaaaaaa is not on main']);
  assert.equal(withLead(r, { relation: 'ahead', ahead: 0 }).state, 'unknown', 'a zero lead is not behind');
  const current = releaseOf({ main: A, deploys: parsed(record()) });
  assert.equal(withLead(current, { relation: 'ahead', ahead: 5 }), current, 'a current release has no lead to count');
});

test('the newest record decides what serves; the deploy that put it there says when', () => {
  const older = record({ at: '2026-11-01T00:00:00.000Z', commit: C, serving: { id: 'dpl_old', url: null, commit: C } });
  assert.equal(releaseOf({ main: A, deploys: [...parsed(record()), ...parsed(older)] }).production.sha, A);
  // A later verify of the same deployment, and a failed build that left it serving, are checks, not deploys.
  const verify = record({ action: 'verify', at: '2026-11-15T09:00:00.000Z' });
  const failedBuild = record({ commit: B, at: '2026-11-15T10:00:00.000Z', ...failing, deployment: null, serving: { id: 'dpl_acme', url: null, commit: A } });
  const r = releaseOf({ main: A, deploys: parsed(record(), verify, failedBuild) });
  assert.deepEqual([r.production.at, r.production.checkedAt], ['2026-11-14T10:00:00.000Z', '2026-11-15T10:00:00.000Z']);
  assert.equal(releaseView(r).line, 'production is main (aaaaaaa), deployed 2026-11-14');
  // Only checks on record: when it began serving is not said, and the row says when it was last checked.
  const only = releaseOf({ main: A, deploys: parsed(verify) });
  assert.equal(releaseView(only).line, 'production is main (aaaaaaa), last checked 2026-11-15');
});

test('a rollback serves its target, or the deployment its serving id names; a failed rollback is unknown', () => {
  assert.equal(servingOf(record({ ...failing, rolledBack: true, serving: null, target: { id: 'dpl_prev', url: null, commit: C } })), C);
  // plates promote --back moved production, then its smoke check failed: serving names only the deployment's id.
  const before = record({ commit: C, at: '2026-11-10T00:00:00.000Z', deployment: { id: 'dpl_prev', url: null }, serving: { id: 'dpl_prev', url: null, commit: C } });
  const back = record({ action: 'back', commit: A, at: '2026-11-14T12:00:00.000Z', ...failing, deployment: null, serving: { id: 'dpl_prev', url: null } });
  const between = record({ at: '2026-11-12T00:00:00.000Z' });
  const r = releaseOf({ main: C, deploys: parsed(before, between, back) });
  assert.deepEqual([r.state, r.production.sha, r.production.at], ['current', C, '2026-11-14T12:00:00.000Z']);
  const failed = releaseOf({ main: A, deploys: parsed(record({ ...failing, rolledBack: 'failed', serving: null })) });
  assert.equal(failed.state, 'unknown');
  assert.match(failed.why, /rollback after aaaaaaa failed/);
});

test('no record is none; an unread source is unknown, with why', () => {
  assert.equal(releaseOf({ main: A, deploys: [] }).state, 'none');
  assert.equal(releaseView(releaseOf({ main: A })).line, 'main aaaaaaa; no production deploy recorded');
  const unread = releaseOf({ main: A, unread: 'no origin to read verification history' });
  assert.deepEqual([unread.state, releaseView(unread).line], ['unknown', 'main aaaaaaa; production unknown: no origin to read verification history']);
  assert.equal(releaseOf({ main: 'nope', deploys: parsed(record()) }).state, 'unknown');
});

test('only a valid release is kept or drawn', () => {
  assert.ok(validRelease(releaseOf({ main: A, deploys: parsed(record()) })));
  assert.ok(validRelease(releaseOf({ main: B, deploys: parsed(record()) })));
  assert.equal(validRelease({ state: 'current', main: A, production: { sha: 'x' }, ahead: 0, why: null }), false);
  assert.equal(releaseView(undefined), null);
});

test('the card row says the state in words and colours it from its data attribute', () => {
  const html = releaseRow(releaseView(withLead(releaseOf({ main: B, deploys: parsed(record()) }), { relation: 'ahead', ahead: 2 })));
  assert.match(html, /data-release="behind" role="img" aria-label="production aaaaaaa is 2 commits behind main bbbbbbb/);
  assert.match(html, /<code>bbbbbbb<\/code>.*<code>aaaaaaa<\/code><\/span><strong>2 behind<\/strong>/);
  assert.ok(!html.includes('style='), 'no inline styles under the hosted policy');
  assert.equal(releaseRow(null), '');
});

test('a checkout reads its origin\'s deploy records and counts main\'s lead', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-release-'));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Acme', GIT_AUTHOR_EMAIL: 'acme@example.com', GIT_COMMITTER_NAME: 'Acme', GIT_COMMITTER_EMAIL: 'acme@example.com' };
  const root = join(dir, 'acme'), remote = join(dir, 'remote.git');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { env, encoding: 'utf8' }).trim();
  try {
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { env });
    execFileSync('git', ['init', '-q', '-b', 'main', root], { env });
    git('commit', '-q', '--allow-empty', '-m', 'one');
    const deployed = git('rev-parse', 'HEAD');
    git('commit', '-q', '--allow-empty', '-m', 'two'); git('commit', '-q', '--allow-empty', '-m', 'three');
    const main = git('rev-parse', 'HEAD');
    git('remote', 'add', 'origin', remote); git('push', '-q', 'origin', 'main');
    assert.equal((await checkoutRelease(root, main)).state, 'none', 'no verify branch yet');
    await writeFile(join(dir, 'deploys.jsonl'), text(record({ commit: deployed, serving: { id: 'dpl_acme', url: null, commit: deployed } })));
    const blob = git('hash-object', '-w', join(dir, 'deploys.jsonl'));
    const tree = execFileSync('git', ['-C', root, 'mktree'], { input: `100644 blob ${blob}\tdeploys.jsonl\n`, env, encoding: 'utf8' }).trim();
    git('push', '-q', 'origin', `${git('commit-tree', tree, '-m', 'deploy')}:refs/heads/plates-verify`);
    const r = await checkoutRelease(root, main);
    assert.deepEqual([r.state, r.production.sha, r.ahead], ['behind', deployed, 2]);
    assert.equal((await checkoutRelease(root, deployed)).state, 'current');
    // A checkout whose main is older than what production serves: unknown, never behind.
    await writeFile(join(dir, 'deploys.jsonl'), text(record({ commit: main, at: '2026-11-15T00:00:00.000Z', serving: { id: 'dpl_new', url: null, commit: main } })));
    const newer = git('hash-object', '-w', join(dir, 'deploys.jsonl'));
    const newerTree = execFileSync('git', ['-C', root, 'mktree'], { input: `100644 blob ${newer}\tdeploys.jsonl\n`, env, encoding: 'utf8' }).trim();
    git('push', '-q', '-f', 'origin', `${git('commit-tree', newerTree, '-m', 'deploy again')}:refs/heads/plates-verify`);
    const stale = await checkoutRelease(root, git('rev-parse', 'HEAD~1'));
    assert.equal(stale.state, 'unknown');
    assert.match(stale.why, /is not on this checkout's main/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the hosted reader reads the deploy records through the App and counts main\'s lead from GitHub\'s compare', async () => {
  const { projectHarness } = await import('./helpers/web-projects.mjs');
  const { createHomeReader } = await import('../lib/web/home.mjs');
  const h = projectHarness(), main = h.source.revision, asked = [];
  const fetcher = async (url, options) => {
    if (new URL(url).pathname === '/graphql') {
      const { query, variables } = JSON.parse(options.body), reply = repository => new Response(JSON.stringify({ data: { repository } }), { headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '5000', 'x-ratelimit-reset': String(Math.floor(h.state.now / 1000) + 3600) } });
      if (query.includes('object(expression:')) { asked.push(variables.e0, variables.e1); return reply({ d0: { isBinary: false, isTruncated: false, text: text(record({ commit: C, serving: { id: 'dpl_acme', url: null, commit: C } })) }, d1: null }); }
    }
    const u = new URL(url);
    if (u.pathname === `/repos/acme/studio/compare/${C}...${main}`) { asked.push('compare'); return new Response(JSON.stringify({ status: 'ahead', ahead_by: 3, behind_by: 0 }), { headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '5000', 'x-ratelimit-reset': String(Math.floor(h.state.now / 1000) + 3600) } }); }
    return h.fetcher(url, options);
  };
  const result = await createHomeReader(h.config, { fetcher, now: () => h.state.now })(h.access, 'fake-user-access-token-for-tests');
  assert.deepEqual(asked, ['plates-verify:deploys.jsonl', 'keel-verify:deploys.jsonl', 'compare'], 'both verify branches, then the compare');
  assert.deepEqual([result.projects[0].release.state, result.projects[0].release.ahead], ['behind', 3]);
  const row = result.home.sections.find(s => s.id === 'plates').items[0].release;
  assert.equal(row.line, `production ccccccc is 3 commits behind main ${main.slice(0, 7)} (deployed 2026-11-14)`);
});

test('a production commit gone from the repository leaves the release unknown, and Home still reads', async () => {
  const { projectHarness } = await import('./helpers/web-projects.mjs');
  const { createHomeReader } = await import('../lib/web/home.mjs');
  const h = projectHarness(), headers = { 'content-type': 'application/json', 'x-ratelimit-remaining': '5000', 'x-ratelimit-reset': String(Math.floor(h.state.now / 1000) + 3600) };
  const fetcher = async (url, options) => {
    const u = new URL(url);
    if (u.pathname === '/graphql' && JSON.parse(options.body).query.includes('object(expression:'))
      return new Response(JSON.stringify({ data: { repository: { d0: { isBinary: false, isTruncated: false, text: text(record({ commit: C, serving: { id: 'dpl_acme', url: null, commit: C } })) }, d1: null } } }), { headers });
    if (u.pathname.startsWith('/repos/acme/studio/compare/')) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers });
    return h.fetcher(url, options);
  };
  const result = await createHomeReader(h.config, { fetcher, now: () => h.state.now })(h.access, 'fake-user-access-token-for-tests');
  assert.ok(['complete', 'partial'].includes(result.projects[0].state), 'the optional release read never fails the plate');
  assert.deepEqual([result.projects[0].release.state, result.projects[0].release.why], ['unknown', 'production could not be compared with main']);
});
