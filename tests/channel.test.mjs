// Phase 194, increment 1: each plate's channel, read only. lib/channel.mjs builds the lines and Here now from the
// sources plates already reads; `plates channel --json` and /channel render that one model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { run as runNode } from './helpers/run.mjs';
import { projectHarness } from './helpers/web-projects.mjs';
import { channelFor, channelInputOf, channelText, foldRoutine, KINDS, WINDOW_DAYS, FOLD, lineTime } from '../lib/channel.mjs';
import { channelView, channelSection } from '../lib/web/channel-views.mjs';
import { claimMessage } from '../lib/claim.mjs';

const NOW = Date.parse('2026-11-15T18:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString(), MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const MAIN = 'a'.repeat(40);

/** One Acme plate's Home value, as both forms read it: phases with titles, changes in flight and main vs production. */
const studio = (over = {}) => ({ id: 'studio', name: 'Acme Studio', repo: 'acme/studio', state: 'complete', gaps: [],
  roadmap: { phases: [{ id: 1, title: 'Acme anvils' }, { id: 2, title: 'Acme bellows' }, { id: 3, title: 'Acme crates' }] },
  waits: { state: 'read', more: 0, items: [
    { branch: 'claude/phase-1-anvils', phase: 1, state: 'active', since: ago(50 * MIN), next: 'keep going' },
    { branch: 'codex/phase-2-bellows', phase: 2, state: 'ci', since: ago(30 * MIN), next: 'wait for PR #21\'s checks' },
    { branch: 'claude/tidy', phase: null, state: 'deploy', since: ago(20 * MIN), next: 'promote it' },
    { branch: 'claude/old', phase: null, state: 'done', since: ago(10 * MIN), next: 'nothing' },
  ] },
  release: { state: 'current', main: MAIN, production: { sha: MAIN, at: ago(15 * MIN), checkedAt: ago(15 * MIN), deployment: 'dpl_acme' }, ahead: 0, why: null },
  ...over });
const claims = (over = {}) => ({ state: 'read', claims: [{ phase: 1, branch: 'claims/phase-1', provider: 'claude', machine: 'acme-mac', at: ago(2 * HOUR) }],
  prs: [{ phase: 2, number: 21, url: 'https://github.com/acme/studio/pull/21', branch: 'codex/phase-2-bellows', author: 'acme-codex', at: ago(90 * MIN) }], ...over });
const prs = (over = {}) => ({ state: 'read', items: [
  { number: 21, title: 'Acme bellows', url: 'https://github.com/acme/studio/pull/21', createdAt: ago(90 * MIN), isDraft: false, author: 'acme-codex' },
  { number: 22, title: 'Acme bump', url: 'https://github.com/acme/studio/pull/22', createdAt: ago(70 * MIN), isDraft: true, author: 'renovate' },
], ...over });
const waiting = (over = {}) => ({ items: [{ kind: 'session', title: '🏠 [studio] Remote Control is waiting on you', why: 'Ship the anvils?', read: 'claude --resume acme-1', plate: 'studio', ref: 'acme-1', since: ago(5 * MIN).slice(0, 10), at: ago(5 * MIN) },
  { kind: 'session', title: '🏠 [anvils] Remote Control is waiting on you', why: 'Elsewhere?', read: 'claude --resume acme-2', plate: 'anvils', ref: 'acme-2', at: ago(4 * MIN) }], why: 'from acme-mac', ...over });
const model = ({ project = studio(), c = claims(), p = prs(), w = waiting(), since = null } = {}) => channelFor([channelInputOf(project, { claims: c, prs: p })], { now: NOW, since, waiting: w });

test('the feed is built from what plates already reads', () => {
  const m = model();
  // Time order, newest last, each line with its plate, kind, actor and link.
  assert.deepEqual(m.lines.map(l => [l.kind, l.actor]), [
    ['joined', 'studio#1'], ['joined', 'studio#2'], ['pr', 'studio#2'], ['pr', 'studio#22'], ['pushed', 'studio#1'], ['ci', 'studio#2'], ['deploy', 'studio'], ['deploy', 'studio'], ['waiting', 'studio'],
  ]);
  for (const l of m.lines) {
    assert.ok(KINDS.includes(l.kind), l.kind);
    assert.equal(l.plate, 'studio');
    assert.ok(l.ref, `${l.kind} ${l.text} has a link`);
  }
  assert.deepEqual([...m.lines].sort((a, b) => a.at.localeCompare(b.at)).map(l => l.at), m.lines.map(l => l.at), 'newest last');
  assert.deepEqual(new Set(m.lines.map(l => l.source)), new Set(['claims', 'prs', 'waits', 'deploys', 'waiting']), 'claims, PRs, CI, deploys and waiting sessions each give lines');
  const byKind = Object.groupBy(m.lines, l => l.kind);
  assert.equal(byKind.joined[0].text, 'claude claimed phase 1: Acme anvils on acme-mac');
  assert.equal(byKind.joined[0].ref, 'https://github.com/acme/studio/tree/claims/phase-1');
  assert.equal(byKind.joined[1].text, 'acme-codex joined phase 2: Acme bellows with #21', 'an open PR naming an unclaimed phase is its agent joining');
  assert.equal(byKind.pr[1].text, 'opened #22: Acme bump (draft) by renovate', 'a PR naming no phase is its own actor');
  assert.equal(byKind.ci[0].text, 'checks: wait for PR #21\'s checks');
  assert.equal(byKind.deploy.find(l => l.source === 'deploys').text, `deployed ${MAIN.slice(0, 7)} to production`);
  assert.equal(byKind.waiting[0].ref, 'claude --resume acme-1');
  assert.ok(!m.lines.some(l => l.text.includes('claude/old')), 'a change that is done is not in flight');
  assert.ok(!m.lines.some(l => l.text.includes('Elsewhere')), 'a session for a plate not shown is not on this channel');
  assert.deepEqual(m.plates, [{ projectId: 'studio', name: 'Acme Studio', state: 'read', count: m.lines.length }]);
  // The same input gives the same lines, whatever order the readers listed them in.
  const shuffled = model({ c: claims({ prs: [...claims().prs].reverse() }), p: prs({ items: [...prs().items].reverse() }), project: studio({ waits: { ...studio().waits, items: [...studio().waits.items].reverse() } }) });
  assert.deepEqual(shuffled, m);
  assert.deepEqual(model(), m);
});

test('an unread source is a gap, never quiet', () => {
  const unread = model({ c: { state: 'unavailable', why: 'the claim branches could not be read within the source bounds' }, p: { state: 'unavailable', why: 'the App has no Pull requests read' },
    project: studio({ waits: { state: 'unavailable', reason: 'Saving GitHub quota; waits are not read.' }, release: { state: 'unknown', main: MAIN, production: null, ahead: null, why: 'the deploy records could not be read whole' } }),
    w: { na: 'no device has sent waiting sessions yet (plates sessions push)' } });
  assert.deepEqual(unread.lines.map(l => [l.kind, l.source, l.text]), [
    ['gap', 'waiting', 'sessions waiting on you unread: no device has sent waiting sessions yet (plates sessions push)'],
    ['gap', 'claims', 'claims unread: the claim branches could not be read within the source bounds'],
    ['gap', 'deploys', 'deploys unread: the deploy records could not be read whole'],
    ['gap', 'prs', 'open pull requests unread: the App has no Pull requests read'],
    ['gap', 'waits', 'pushes and CI unread: Saving GitHub quota; waits are not read.'],
  ]);
  for (const source of ['claims', 'prs', 'waits', 'deploys', 'waiting']) assert.ok(unread.lines.some(l => l.kind === 'gap' && l.source === source), `${source} unread is a gap`);
  assert.ok(unread.lines.every(l => l.at === new Date(NOW).toISOString()), 'a gap is dated at the read, the newest end');
  // Sources read and empty are quiet, and say so: no gap, no line.
  const quiet = model({ c: { state: 'read', claims: [], prs: [] }, p: { state: 'read', items: [] }, project: studio({ waits: { state: 'read', items: [], more: 0 }, release: { state: 'none', main: MAIN, production: null, ahead: null, why: 'no production deploy recorded' } }), w: { items: [], why: 'from acme-mac' } });
  assert.deepEqual(quiet.lines, [], 'read and empty is quiet');
  assert.match(channelText(quiet), /^ {2}none in the window$/m);
  // A plate that could not be read, a source no reader returned, a practice that is off: each says so.
  const none = channelFor([channelInputOf({ id: 'anvils', name: 'Acme Anvils', repo: 'acme/anvils', state: 'unavailable', gaps: [{ source: 'project', reason: 'The App cannot read acme/anvils.' }] })], { now: NOW, waiting: null });
  assert.deepEqual(none.lines.map(l => l.text), ['sessions waiting on you unread', 'Acme Anvils was not read: The App cannot read acme/anvils.']);
  assert.deepEqual(none.plates, [{ projectId: 'anvils', name: 'Acme Anvils', state: 'not read', count: 1 }]);
  const missing = channelFor([channelInputOf(studio({ waits: { state: 'off', reason: 'The delivery practice is off on this plate.' }, release: undefined }))], { now: NOW, waiting: { items: [] } });
  assert.deepEqual(missing.lines.filter(l => l.kind === 'gap').map(l => l.text), ['claims unread: not read', 'deploys unread: the deploy records were not read', 'open pull requests unread: not read', 'pushes and CI are not read here: The delivery practice is off on this plate.']);
  // No remote is no claim, not an unread one.
  assert.ok(!model({ c: { state: 'none', why: 'no git remote here' } }).lines.some(l => l.source === 'claims'));
  // A bounded read says what it left out.
  assert.ok(model({ project: studio({ waits: { ...studio().waits, more: 2 } }) }).lines.some(l => l.kind === 'gap' && l.text === '2 more changes in flight not listed: the read keeps the newest'));
});

test('here now is the agents holding work', () => {
  const m = model();
  // Most recent activity first: phase 2's CI line (30m) before phase 1's push (50m).
  assert.deepEqual(m.hereNow.map(h => [h.actor, h.title, h.provider, h.via, h.last?.kind, h.last?.age, h.unread, h.caughtUp]), [
    ['studio#2', 'Acme bellows', 'acme-codex', '#21', 'ci', '30m', 3, false],
    ['studio#1', 'Acme anvils', 'claude', 'claim', 'pushed', '50m', 2, false],
  ]);
  assert.equal(m.hereIdle, null);
  assert.equal(m.hereNow[1].words, 'Acme anvils · claude · last line 50m ago · 2 unread');
  // Unread counts lines in the last 24 hours (no read position is kept yet): an agent whose lines are older is Caught up.
  const old = model({ c: claims({ claims: [{ phase: 3, provider: 'codex', machine: null, at: ago(3 * DAY) }], prs: [] }), p: prs({ items: [] }), project: studio({ waits: { state: 'read', items: [], more: 0 } }) });
  assert.deepEqual(old.hereNow.map(h => [h.actor, h.unread, h.caughtUp, h.words]), [['studio#3', 0, true, 'Acme crates · codex · last line 3d ago · Caught up']]);
  // With no line in the window, its claim's age; ordered by that claim against the others' lines.
  const quietClaim = model({ c: claims({ claims: [...claims().claims, { phase: 3, provider: 'codex', at: ago(40 * MIN) }] }) });
  assert.deepEqual(quietClaim.hereNow.map(h => h.actor), ['studio#2', 'studio#3', 'studio#1']);
  assert.equal(quietClaim.hereNow[1].words, 'Acme crates · codex · last line 40m ago · 1 unread', 'its own joined line is its last line');
  assert.equal(old.readFrom, ago(DAY));
  // Holders with no activity past the window still hold the work: one trailing row, oldest first named, never drowning the active ones.
  const stale = model({ c: claims({ claims: [...claims().claims, { phase: 3, provider: 'codex', at: ago(10 * DAY) }, { phase: 4, provider: 'codex', at: ago(12 * DAY) }] }) });
  assert.deepEqual(stale.hereNow.map(h => h.actor), ['studio#2', 'studio#1']);
  assert.deepEqual(stale.hereIdle, { count: 2, oldest: ago(12 * DAY), actors: ['studio#3', 'studio#4'], words: '2 idle claims, oldest 12d' });
  assert.match(channelText(stale), /^ {2}2 idle claims, oldest 12d: studio#3, studio#4$/m);
  assert.match(channelView({ workspace: { name: 'Acme' }, csrf: '' }, stale), /<details data-here-idle><summary>2 idle claims, oldest 12d<\/summary><ul class="source-list"><li>studio#3<\/li><li>studio#4<\/li><\/ul><\/details>/);
  // A claim inside the window with no line (windowed out by --since) shows its claim's age.
  const claimed = model({ c: claims({ claims: [{ phase: 3, provider: 'codex', at: ago(2 * DAY) }], prs: [] }), p: prs({ items: [] }), project: studio({ waits: { state: 'read', items: [], more: 0 } }), since: ago(DAY) });
  assert.deepEqual(claimed.hereNow.map(h => h.words), ['Acme crates · codex · claimed 2d ago · Caught up']);
  // Nobody holds work, and the claims could not be read: neither is shown as an agent.
  assert.deepEqual(model({ c: { state: 'read', claims: [], prs: [] } }).hereNow, []);
  assert.deepEqual(model({ c: { state: 'unavailable', why: 'x' } }).hereNow, []);
  assert.match(channelText(m), /^Here now \(2\)\n {2}studio#2 {2}Acme bellows · acme-codex · last line 30m ago · 3 unread\n {2}studio#1 {2}Acme anvils · claude · last line 50m ago · 2 unread$/m);
});

test('routine lines fold and the window holds', () => {
  const claim = (phase, minutes) => ({ phase, provider: 'claude', machine: null, at: ago(minutes * MIN) });
  const base = { p: prs({ items: [] }), project: studio({ waits: { state: 'read', items: [], more: 0 }, release: { state: 'none', main: MAIN, production: null, ahead: null } }), w: { items: [] } };
  // Five claims within ten minutes on one plate: one line. Three: routine, but no burst.
  const burst = model({ ...base, c: claims({ claims: [claim(1, 60), claim(2, 58), claim(3, 56), claim(4, 54), claim(5, 52)], prs: [] }) });
  assert.deepEqual(burst.lines.map(l => [l.kind, l.actor, l.text, l.folded]), [['joined', 'studio', '5 agents rotated: studio#1, studio#2, studio#3, studio#4, studio#5', 5]]);
  assert.equal(burst.lines[0].at, ago(52 * MIN), 'the folded line is the run\'s last');
  assert.equal(burst.hereNow.length, 5, 'folding a line never hides an agent');
  const three = model({ ...base, c: claims({ claims: [claim(1, 60), claim(2, 58), claim(3, 56)], prs: [] }) });
  assert.equal(three.lines.length, FOLD.more, 'three in ten minutes stay three lines');
  const spread = model({ ...base, c: claims({ claims: [claim(1, 60), claim(2, 55), claim(3, 49), claim(4, 40)], prs: [] }) });
  assert.equal(spread.lines.length, 4, 'four spread past ten minutes do not fold');
  // A burst on another plate, or other kinds between, do not join the run.
  const lines = [0, 1, 2, 3].map(i => ({ at: ago((60 - i) * MIN), plate: i % 2 ? 'anvils' : 'studio', kind: 'joined', actor: `x#${i}`, text: `t${i}`, ref: null, source: 'claims' }));
  assert.equal(foldRoutine(lines).length, 4);
  // The window: seven days by default; --since narrows it, never widens it; a gap is never windowed out.
  const window = model({ ...base, c: claims({ claims: [claim(1, (WINDOW_DAYS + 1) * 24 * 60), claim(2, 3 * 24 * 60), claim(3, 60)], prs: [] }), p: { state: 'unavailable', why: 'x' } });
  assert.equal(window.window.from, ago(WINDOW_DAYS * DAY));
  assert.deepEqual(window.lines.map(l => l.actor), ['studio#2', 'studio#3', 'studio'], 'a line older than the window is gone; the gap stays');
  const since = model({ ...base, c: claims({ claims: [claim(2, 3 * 24 * 60), claim(3, 60)], prs: [] }), since: ago(DAY) });
  assert.deepEqual([since.window.from, since.lines.map(l => l.actor)], [ago(DAY), ['studio#3']]);
  const wider = model({ ...base, c: claims({ claims: [claim(1, (WINDOW_DAYS + 1) * 24 * 60)], prs: [] }), since: ago(30 * DAY) });
  assert.deepEqual([wider.window.from, wider.lines], [ago(WINDOW_DAYS * DAY), []], '--since past the window stops at the window');
});

// ---- one channel, two forms -------------------------------------------------
// The same sources, twice: a git checkout whose origin holds a claim and a deploy record, with a fake gh listing the open PRs
// (`plates channel --json`), and the web's fake App answering the same claims, PRs and deploy record (/channel's read).
const bin = fileURLToPath(new URL('../bin/plates.mjs', import.meta.url));
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Acme', GIT_AUTHOR_EMAIL: 'acme@example.com',
  GIT_COMMITTER_NAME: 'Acme', GIT_COMMITTER_EMAIL: 'acme@example.com', GIT_AUTHOR_DATE: '2026-10-20T12:00:00Z', GIT_COMMITTER_DATE: '2026-10-20T12:00:00Z' };
const rate = { cost: 1, remaining: 4000, resetAt: new Date(Date.now() + 3600_000).toISOString() };
const noReviews = { open: { pageInfo: { hasNextPage: false }, nodes: [] }, merged: { pageInfo: { hasNextPage: false }, nodes: [] } };

async function bothForms() {
  const h = projectHarness(), real = Date.now(), at = ms => new Date(Math.floor((real - ms) / 1000) * 1000).toISOString();
  h.source.files['.plates/plates.json'] = JSON.stringify({ name: 'Acme Studio', repo: 'acme/studio', tagline: 'Publish useful things.', practice: '0.8.32', stack: ['node'], phases: { shape: 'files' } });
  const dir = await mkdtemp(join(tmpdir(), 'plates-channel-')), root = join(dir, 'studio'), remote = join(dir, 'remote.git');
  for (const [path, content] of Object.entries(h.source.files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); }
  const git = (args, env = gitEnv) => execFileSync('git', ['-C', root, ...args], { env, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']); git(['add', '-A']); git(['commit', '-q', '-m', 'Improve the Acme experience']);
  h.source.revision = git(['rev-parse', 'HEAD']);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { env: gitEnv });
  git(['remote', 'add', 'origin', remote]); git(['push', '-q', 'origin', 'main']);
  // Claude claims phase 1 two hours ago.
  const claimedAt = at(2 * 3600_000), message = claimMessage({ phase: 1, provider: 'claude', machine: 'acme-mac', at: claimedAt, token: 'acme-token' });
  const claimSha = git(['commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', message], { ...gitEnv, GIT_COMMITTER_DATE: claimedAt, GIT_AUTHOR_DATE: claimedAt });
  git(['push', '-q', 'origin', `${claimSha}:refs/heads/claims/phase-1`]);
  const claimRefs = [{ name: 'phase-1', target: { oid: claimSha, message, committedDate: claimedAt } }];
  // Production began serving main an hour ago.
  const main = h.source.revision, deploys = `${JSON.stringify({ schema: 1, project: 'studio', commit: main, action: 'deploy', at: at(3600_000), ok: true, rolledBack: false, failed: null,
    checks: [], deployment: { id: 'dpl_acme1', url: 'https://acme.example' }, serving: { id: 'dpl_acme1', url: 'https://acme.example', commit: main } })}\n`;
  await writeFile(join(dir, 'deploys.jsonl'), deploys);
  const blob = git(['hash-object', '-w', join(dir, 'deploys.jsonl')]);
  const tree = execFileSync('git', ['-C', root, 'mktree'], { input: `100644 blob ${blob}\tdeploys.jsonl\n`, env: gitEnv, encoding: 'utf8' }).trim();
  git(['push', '-q', 'origin', `${git(['commit-tree', tree, '-m', 'deploy'])}:refs/heads/plates-verify`]);
  // Two open PRs: codex's on phase 2 (unclaimed), and a bump naming no phase.
  const PRS = [
    { number: 21, title: 'Acme bellows', url: 'https://github.com/acme/studio/pull/21', createdAt: at(90 * 60_000), isDraft: false, reviewDecision: null, autoMergeRequest: null, author: { login: 'acme-codex' }, headRefName: 'codex/phase-2-bellows', state: 'OPEN' },
    { number: 22, title: 'Acme bump', url: 'https://github.com/acme/studio/pull/22', createdAt: at(70 * 60_000), isDraft: true, reviewDecision: null, autoMergeRequest: null, author: { login: 'renovate' }, headRefName: 'renovate/bump', state: 'OPEN' },
  ];
  const answer = data => Response.json({ data: { rateLimit: rate, ...data } }, { headers: { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } });
  const fetcher = async (url, options) => {
    if (new URL(url).pathname !== '/graphql') return h.fetcher(url, options);
    const { query, variables } = JSON.parse(options.body);
    const blobs = [...query.matchAll(/(\w+): object\(oid: "([0-9a-f]{40})"\)/g)];
    if (blobs.length) {
      const byOid = new Map(Object.values(h.source.files).map(text => [createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex'), text]));
      return answer({ repository: Object.fromEntries(blobs.map(([, alias, oid]) => { const text = byOid.get(oid); return [alias, text === undefined ? null : { oid, byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text }]; })) });
    }
    if (query.includes('object(expression:')) return answer({ repository: Object.fromEntries(Object.entries(variables).filter(([k]) => /^e\d+$/.test(k)).map(([k, e]) => [`d${k.slice(1)}`, e === 'plates-verify:deploys.jsonl' ? { isBinary: false, isTruncated: false, text: deploys } : null])) });
    if (query.includes('PlatesPending')) return answer({ repository: { pullRequests: { totalCount: PRS.length, nodes: PRS } } });
    if (query.includes('PlatesClaims')) return answer({ repository: { refs: { totalCount: claimRefs.length, nodes: claimRefs }, pullRequests: { totalCount: PRS.length, nodes: PRS } } });
    return answer(query.includes('PlatesReviewWindow') ? { repository: noReviews } : {});
  };
  const gh = join(dir, 'gh');
  await writeFile(gh, `#!${process.execPath}
const argv = process.argv.slice(2), q = (argv.find(a => a.startsWith('query=')) ?? '').slice(6);
if (argv[0] === 'api' && argv[1] === 'user') console.log('acme-owner');
else if (argv[0] === 'api' && argv[1] === 'graphql' && q.includes('PlatesReviewWindow')) console.log(JSON.stringify({ data: { rateLimit: ${JSON.stringify(rate)}, repository: ${JSON.stringify(noReviews)} } }));
else if (argv[0] === 'api' && argv[1] === 'graphql') console.log(JSON.stringify({ data: { rateLimit: ${JSON.stringify(rate)} } }));
else if (argv[0] === 'pr' && argv[1] === 'list') console.log(${JSON.stringify(JSON.stringify(PRS))});
else { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
`);
  await chmod(gh, 0o755);
  const { createHomeReader } = await import('../lib/web/home.mjs');
  const access = { ...h.access, login: 'acme-owner', pullRequestsRead: true, checksRead: false };
  const readWeb = createHomeReader(h.config, { fetcher, now: () => Date.now() });
  const cli = args => runNode(process.execPath, [bin, 'channel', ...args], { cwd: root, timeout: 120_000, env: { ...gitEnv, PLATES_GH: gh, PLATES_CACHE: join(dir, 'cache'), PLATES_STATE: join(dir, 'state'), XDG_STATE_HOME: join(dir, 'state') } });
  return { access, cli, web: async options => (await readWeb(access, 'fake-user-access-token-for-tests', { channel: true, ...options })), done: () => rm(dir, { recursive: true, force: true }) };
}

// What a reader adds about its own read, not the sources: when it read (and so the window's start and each gap's time and each age).
const readless = m => ({ ...m, generatedAt: null, window: { ...m.window, from: null }, readFrom: null,
  lines: m.lines.filter(l => l.source !== 'waiting').map(l => (l.kind === 'gap' ? { ...l, at: null } : l)),
  hereNow: m.hereNow.map(({ words, last, sinceAge, ...h }) => ({ ...h, last: last && { ...last, age: null } })), hereIdle: m.hereIdle && { ...m.hereIdle, words: null } });

test('the CLI and the web show one channel', async () => {
  const s = await bothForms();
  try {
    const run = s.cli(['--json']);
    assert.equal(run.status, 0, run.stderr);
    const cli = JSON.parse(run.stdout), web = (await s.web()).channel;
    // The fixture exercises claims, PRs and deploys, so equality is not two empty readers agreeing.
    assert.deepEqual(cli.lines.map(l => [l.kind, l.actor]), [['joined', 'studio#1'], ['joined', 'studio#2'], ['pr', 'studio#2'], ['pr', 'studio#22'], ['deploy', 'studio'], ['gap', 'studio']]);
    assert.equal(cli.lines.at(-1).text, 'pushes and CI are not read here: The delivery practice is off on this plate: ready and integrate, the tested ref and deploy records are its, so its waits are not read.');
    assert.deepEqual(readless(web), readless(cli), 'the same lines and the same Here now in both forms');
    assert.deepEqual(cli.hereNow.map(h => [h.actor, h.title, h.provider, h.unread]), [['studio#2', 'Acme phase 2', 'acme-codex', 2], ['studio#1', 'Acme phase 1', 'claude', 1]]);
    // Sessions waiting on you are each form's own source, as on Home: this machine's scan (none here) and the devices' pushes (none yet, a gap).
    assert.deepEqual(cli.lines.filter(l => l.source === 'waiting'), []);
    assert.deepEqual(web.lines.filter(l => l.source === 'waiting').map(l => [l.kind, l.plate, l.text]), [['gap', null, 'sessions waiting on you unread: no device has sent waiting sessions yet (plates sessions push)']]);
    // The page, the plate's section and the terminal each say every line and every Here now row.
    const page = channelView(s.access, web), section = channelSection(web), text = s.cli([]).stdout;
    const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    for (const l of web.lines) {
      for (const html of [page, section]) assert.ok(html.includes(`<time datetime="${l.at}">${lineTime(l.at)}</time> <strong>${esc(l.actor ?? 'all plates')}</strong> <span class="p-badge">${l.kind}</span> ${esc(l.text)}`), l.text);
    }
    for (const l of cli.lines) assert.ok(text.split('\n').includes(`  ${lineTime(l.at)}  ${l.actor ?? 'all plates'}  ${l.kind}  ${l.text}`), l.text);
    for (const h of web.hereNow) assert.ok(page.includes(`<strong>${h.actor}</strong> ${esc(h.words)}`) && section.includes(`<strong>${h.actor}</strong> ${esc(h.words)}`), h.actor);
    for (const h of cli.hereNow) assert.ok(text.split('\n').includes(`  ${h.actor}  ${h.words}`), h.actor);
    assert.match(page, /<a class="plate-chip p-card" href="\/channel" aria-current="page"><strong>All<\/strong><span>7 lines<\/span><\/a>/);
    assert.match(page, /data-channel-plate="studio" href="\/projects\/studio#channel"><strong>Acme Studio<\/strong><span>6 lines<\/span>/);
    // The plate's page carries its Channel section, from the same read; every page's footer links the channel.
    const plate = await s.web({ projectId: 'studio', backlog: true });
    const { renderHomeSnapshot } = await import('../lib/web/views.mjs');
    assert.match(renderHomeSnapshot(plate, { projectId: 'studio' }), /<section class="home-section" id="channel" aria-labelledby="channel-title" data-channel><div class="section-heading"><h2 id="channel-title">Channel<\/h2>/);
    assert.match(page, /<footer class="plates-footer" data-page-footer>[^]*<a href="\/channel">Channel<\/a>/);
    assert.doesNotMatch(/<main[^]*<\/main>/.exec(page)[0] + section, /<form|<input|<textarea|method=/i, 'read only: nothing to post');
    // One plate, by name; a plate that is not here is refused.
    const one = s.cli(['studio', '--json', '--since', '30m']);
    assert.equal(one.status, 0, one.stderr);
    assert.deepEqual(JSON.parse(one.stdout).lines.map(l => l.kind), ['gap'], '--since narrows the window');
    assert.equal(s.cli(['anvils', '--json']).status, 2);
    assert.equal(s.cli(['--since', 'yesterday-ish']).status, 2);
  } finally { await s.done(); }
});
