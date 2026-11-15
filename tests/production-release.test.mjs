// Main vs production (lib/production-release.mjs): one plate's default-branch head beside the commit production
// serves, from plates promote's deploy records. The model, its row, and the checkout reader over a real origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { releaseOf, withAhead, releaseView, validRelease, servingOf } from '../lib/production-release.mjs';
import { checkoutRelease } from '../lib/home.mjs';
import { releaseRow } from '../lib/web/plate-workspace.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
const record = (over = {}) => ({ schema: 1, project: 'acme', commit: A, action: 'deploy', at: '2026-11-14T10:00:00.000Z', ok: true, rolledBack: false, failed: null,
  checks: [{ check: 'revision', ok: true, detail: 'Acme' }], deployment: { id: 'dpl_acme', url: 'https://acme.example' }, serving: { id: 'dpl_acme', url: 'https://acme.example', commit: A }, ...over });
const text = (...records) => records.map(r => JSON.stringify(r)).join('\n') + '\n';

test('production serving main is current', () => {
  const r = releaseOf({ main: A, texts: [text(record())] });
  assert.deepEqual(r, { state: 'current', main: A, production: { sha: A, at: '2026-11-14T10:00:00.000Z', deployment: 'dpl_acme' }, ahead: 0, why: null });
  assert.equal(releaseView(r).line, 'production is main (aaaaaaa), deployed 2026-11-14');
});

test('production on an older commit is behind, with main\'s lead when counted', () => {
  const r = releaseOf({ main: B, texts: [text(record())] });
  assert.equal(r.state, 'behind');
  assert.equal(releaseView(r).line, 'production aaaaaaa is behind main bbbbbbb (deployed 2026-11-14)');
  assert.equal(releaseView(withAhead(r, 3)).line, 'production aaaaaaa is 3 commits behind main bbbbbbb (deployed 2026-11-14)');
  assert.equal(releaseView(withAhead(r, 1)).line, 'production aaaaaaa is 1 commit behind main bbbbbbb (deployed 2026-11-14)');
  assert.equal(withAhead(r, null), r, 'an uncounted lead stays unsaid');
  assert.equal(withAhead(releaseOf({ main: A, texts: [text(record())] }), 5).ahead, 0, 'a current release has no lead to count');
});

test('the newest record across both verify branches decides', () => {
  const older = record({ at: '2026-11-01T00:00:00.000Z', commit: C, serving: { id: 'dpl_old', url: null, commit: C } });
  const r = releaseOf({ main: A, texts: [text(record()), null, text(older)] });
  assert.equal(r.production.sha, A);
});

test('a rollback serves its target; a failed rollback is unknown, never current', () => {
  assert.equal(servingOf(record({ ok: false, rolledBack: true, failed: 'smoke', checks: [{ check: 'smoke', ok: false, detail: null }], serving: null, target: { id: 'dpl_prev', url: null, commit: C } })), C);
  const failed = releaseOf({ main: A, texts: [text(record({ ok: false, rolledBack: 'failed', failed: 'smoke', checks: [{ check: 'smoke', ok: false, detail: null }], serving: null }))] });
  assert.equal(failed.state, 'unknown');
  assert.match(failed.why, /rollback after aaaaaaa failed/);
});

test('no record is none; an unread source or a malformed record is unknown, with why', () => {
  assert.equal(releaseOf({ main: A, texts: [null, null] }).state, 'none');
  assert.equal(releaseView(releaseOf({ main: A, texts: [] })).line, 'main aaaaaaa; no production deploy recorded');
  const unread = releaseOf({ main: A, unread: 'no origin to read verification history' });
  assert.deepEqual([unread.state, releaseView(unread).line], ['unknown', 'main aaaaaaa; production unknown: no origin to read verification history']);
  assert.equal(releaseOf({ main: A, texts: ['{"schema":2}\n'] }).state, 'unknown');
  assert.equal(releaseOf({ main: 'nope', texts: [text(record())] }).state, 'unknown');
});

test('only a valid release is kept or drawn', () => {
  assert.ok(validRelease(releaseOf({ main: A, texts: [text(record())] })));
  assert.equal(validRelease({ state: 'current', main: A, production: { sha: 'x' }, ahead: 0, why: null }), false);
  assert.equal(releaseView(undefined), null);
});

test('the card row says the state in words and colours it from its data attribute', () => {
  const html = releaseRow(releaseView(withAhead(releaseOf({ main: B, texts: [text(record())] }), 2)));
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
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the hosted reader reads the deploy records through the App and counts main\'s lead from both histories', async () => {
  const { projectHarness } = await import('./helpers/web-projects.mjs');
  const { createHomeReader } = await import('../lib/web/home.mjs');
  const h = projectHarness(), main = h.source.revision, asked = [];
  const fetcher = async (url, options) => {
    if (new URL(url).pathname === '/graphql') {
      const { query, variables } = JSON.parse(options.body), reply = repository => new Response(JSON.stringify({ data: { repository } }), { headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '5000', 'x-ratelimit-reset': String(Math.floor(h.state.now / 1000) + 3600) } });
      if (query.includes('object(expression:')) { asked.push(variables.e0, variables.e1); return reply({ d0: { isBinary: false, isTruncated: false, text: text(record({ commit: C, serving: { id: 'dpl_acme', url: null, commit: C } })) }, d1: null }); }
      if (query.includes('history(first: 0)')) { asked.push([variables.main, variables.prod]); return reply({ main: { history: { totalCount: 40 } }, prod: { history: { totalCount: 37 } } }); }
    }
    return h.fetcher(url, options);
  };
  const result = await createHomeReader(h.config, { fetcher, now: () => h.state.now })(h.access, 'fake-user-access-token-for-tests');
  assert.deepEqual(asked, ['plates-verify:deploys.jsonl', 'keel-verify:deploys.jsonl', [main, C]], 'both verify branches, then the two histories');
  assert.deepEqual([result.projects[0].release.state, result.projects[0].release.ahead], ['behind', 3]);
  const row = result.home.sections.find(s => s.id === 'plates').items[0].release;
  assert.equal(row.line, `production ccccccc is 3 commits behind main ${main.slice(0, 7)} (deployed 2026-11-14)`);
});
