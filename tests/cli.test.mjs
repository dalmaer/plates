// The CLI's surface: every verb is announced to agents, every verb speaks JSON,
// and plates installs from a checkout with no build step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { run } from './helpers/run.mjs';
import { mkdtemp, readFile, rm, cp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verbs, FLAGS, GUIDE, COLD_START_LIMIT, parseGuide, surfaceGaps, announced } from '../lib/cli.mjs';
import { acmeRepo } from './helpers/prove.mjs';
import { nightOf } from '../lib/night-plan.mjs';
import { phaseFile } from './helpers/web-projects.mjs';

const PLATES = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(PLATES, 'bin', 'plates.mjs');
const plates = (args, cwd = PLATES, bin = BIN, env = process.env) => {
  const r = bin === BIN
    ? run(process.execPath, [bin, ...args], { cwd, env })
    : run(bin, args, { cwd, env });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const names = () => [...verbs.keys(), ...FLAGS.map(f => f.name)];

/** plates's working tree (tracked and untracked, minus ignored), copied to `dir`. */
async function copyTree(dir) {
  const files = execFileSync('git', ['-C', PLATES, 'ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  for (const f of files) {
    await mkdir(dirname(join(dir, f)), { recursive: true });
    await cp(join(PLATES, f), join(dir, f), { verbatimSymlinks: true }).catch(e => {
      if (e.code !== 'ENOENT') throw e; // deleted in the working tree but still tracked
    });
  }
  return dir;
}

test('plates next --json: its next equals the roadmap script\'s next, and is the first of the free list', async () => {
  // A copy with no git remote: plates next fetches the claims where there is one (phase 70), and no test reads the live origin.
  const dir = await copyTree(await mkdtemp(join(tmpdir(), 'plates-next-')));
  try {
    const ours = plates(['next', '--json'], dir);
    assert.equal(ours.code, 0, ours.err);
    const script = run(process.execPath, ['scripts/roadmap.mjs', '--json'], { cwd: dir });
    assert.equal(script.status, 0, script.stderr);
    const data = JSON.parse(ours.out);
    assert.deepEqual(data.next, JSON.parse(script.stdout).next);
    assert.deepEqual(data.next, data.free[0] ?? null);
    assert.deepEqual([data.claimed, data.claims.read], [[], false]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('every registered verb and flag is announced in the cold start', async () => {
  assert.deepEqual(surfaceGaps(names(), await readFile(GUIDE, 'utf8')), []);
});

test('a verb registered without a guide line fails the surface check', async () => {
  const guide = await readFile(GUIDE, 'utf8');
  verbs.set('frobnicate', { summary: 'temp', usage: 'plates frobnicate', run: async () => ({ data: null, text: '' }) });
  try {
    assert.deepEqual(surfaceGaps(names(), guide), ['frobnicate']);
    // A prefix of an announced verb does not count as announced.
    verbs.set('stat', verbs.get('frobnicate'));
    assert.deepEqual(surfaceGaps(names(), guide), ['frobnicate', 'stat']);
  } finally {
    verbs.delete('frobnicate');
    verbs.delete('stat');
  }
  assert.deepEqual(surfaceGaps(names(), guide), []);
});

test('the guide lists only registered verbs, and names every topic', async () => {
  const { coldStart, topics } = parseGuide(await readFile(GUIDE, 'utf8'));
  for (const line of announced(coldStart)) assert.ok(names().some(n => line === n || line.startsWith(`${n} `)), `unregistered: plates ${line}`);
  assert.ok(topics.length >= 1);
  for (const t of topics) assert.match(coldStart, new RegExp(`\`${t.slug}\``), `cold start does not name topic ${t.slug}`);
});

test('a word list announces one command per word', () => {
  assert.deepEqual(announced('- `plates goal list|show` — goals\n- `plates next` — n\n- `plates doctor --fix <path> restore|eject`'),
    ['goal list', 'goal show', 'next', 'doctor --fix <path> restore', 'doctor --fix <path> eject']);
  assert.deepEqual(surfaceGaps(['goal list', 'goal show', 'goal add'], '- `plates goal list|show` — goals'), ['goal add']);
});

// The cap is "one screen". It was 2,500 at seven verbs; at sixteen (phase 9),
// with each verb family on one line and details in topics, it is 3,200.
// Near the cap is said before it is a failure (phase 40's retro): above 95%
// the test still passes, but prints the size and what to trim. Over the cap
// stays red. A function of two numbers, so it is deterministic.
export function coldStartHeadroom(length, limit = COLD_START_LIMIT) {
  if (length < limit * 0.95) return null;
  return `cold start is ${length}/${limit} characters (${(length / limit * 100).toFixed(1)}%, ${limit - length} left): `
    + 'before adding to lib/agent-guide.md, trim it — move a detail into a topic, or fold a verb family onto one line';
}

test('the cold start\'s headroom: silent under 95% of the cap, said from 95%', () => {
  assert.equal(coldStartHeadroom(3039, 3200), null);
  assert.match(coldStartHeadroom(3040, 3200), /^cold start is 3040\/3200 characters \(95\.0%, 160 left\): .*trim/);
  assert.match(coldStartHeadroom(3188, 3200), /12 left/);
});

test(`the cold start stays under ${COLD_START_LIMIT} characters`, async t => {
  const { coldStart } = parseGuide(await readFile(GUIDE, 'utf8'));
  assert.equal(COLD_START_LIMIT, 3200);
  assert.ok(coldStart.length < COLD_START_LIMIT, `cold start is ${coldStart.length} characters`);
  const near = coldStartHeadroom(coldStart.length);
  if (near) t.diagnostic(near);
  // A configured source checkout may append its project preference. Check the
  // unchanged generic cold start in an explicit projectless fixture.
  const root = await mkdtemp(join(tmpdir(), 'plates-cold-start-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const r = plates(['--agent-help'], root);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.trim(), coldStart);
});

test('agent-help opens a topic, and all', () => {
  const t = plates(['--agent-help', 'render', '--json']);
  assert.equal(t.code, 0, t.err);
  assert.equal(JSON.parse(t.out).slug, 'render');
  const all = plates(['--agent-help', 'all']);
  assert.equal(all.code, 0);
  assert.match(all.out, /## coming/);
  const bad = plates(['--agent-help', 'nope', '--json']);
  assert.equal(bad.code, 2);
  assert.match(JSON.parse(bad.out).error, /no agent-help topic/);
});

test('--json parses for every verb and flag; human text never mixes in', async t => {
  const dir = await copyTree(await mkdtemp(join(tmpdir(), 'plates-json-')));
  try {
    // A verb that cannot run bare gets the least it needs; init makes a commit,
    // so it gets a git identity (CI has none).
    // learn bare reads GitHub; its JSON is covered by tests/learn.test.mjs against a stub gh.
    // goal add runs before goal retire, which retires the goal it added.
    // improve bare would run plates's own check from inside it; its --selftest runs on its fixture.
    const added = `G${Math.max(...JSON.parse(await readFile(join(dir, 'docs/goals.json'), 'utf8')).map(g => Number(g.id.slice(1)))) + 1}`;
    // No verb here reads the live world (lesson 17's shape: a test that reads it goes red when
    // the world changes, as fleet update did once ledger was adopted). Every verb runs with a gh
    // that prints [], and plates.json is a synthetic, empty fleet; tests/night.test.mjs,
    // tests/fleet.test.mjs and tests/learn.test.mjs cover those verbs against a stub gh; loose-ends
    // and retro read no one's transcripts (tests/loose-ends.test.mjs and tests/retro.test.mjs cover them).
    const emptyGh = join(dir, 'empty-gh');
    // GraphQL (plates review, loose-ends' review read) gets an answer with no PRs and no threads.
    const noThreads = { pageInfo: { hasNextPage: false }, nodes: [] };
    const graphql = JSON.stringify({ data: { repository: { pullRequest: { number: 1, title: 'Acme', url: 'https://github.com/acme/app/pull/1', state: 'OPEN', headRefOid: 'abc1234', reviewThreads: noThreads, comments: noThreads }, open: noThreads, merged: noThreads } } });
    // plates review reads the PR's repo's own .plates/plates.json for its round limit, with --reviewer too (plates#118): acme/app has none.
    await writeFile(emptyGh, `#!${process.execPath}\nif (process.argv.some(a => a.endsWith('/contents/.plates/plates.json') || a.endsWith('/contents/.keel/keel.json'))) { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }\nconsole.log(process.argv.includes('graphql') ? ${JSON.stringify(graphql)} : '[]');\n`, { mode: 0o755 });
    await writeFile(join(dir, 'plates.json'), '[]\n');
    // walk decide records a decision on a health page's proposal: a synthetic one, outside the health directory.
    await writeFile(join(dir, 'acme-health.md'), '# Acme health\n\n## Proposal\n\n**`acme_measure`** (outside) — Acme proposes.\n');
    // plates test runs a file with stalls: a synthetic one-test file, not one of plates's own suites.
    await writeFile(join(dir, 'acme-stalls.test.mjs'), "import { test } from 'node:test';\ntest('an anvil is ordered', () => {});\n");
    await writeFile(join(dir, 'acme-rubric.json'), JSON.stringify({ version: 1, problem: 'Acme loses rows.', reproduction: 'Run Acme regression.', acceptance: 'Both rows remain.', change: 'Fix equality.', prerequisites: [], ownerBlockers: [] }));
    const needs = { feedback: ['list'], decision: ['context', '--phase', '0'], issue: ['new', '--agent', '--title', 'Fix Acme rows', '--rubric', 'acme-rubric.json'], walk: ['decide', '--proposal', 'acme-health.md', '--decline', 'Acme test'], canvas: ['status'], init: ['fresh', '--description', 'Acme is a test project.'], learn: ['render'], improve: ['--selftest'], drain: ['keel-night/'], test: ['acme-stalls.test.mjs', '--stalls'],
      review: ['acme/app#1', '--reviewer', 'acme-reviewer'], 'goal show': ['G0'], 'goal add': ['Acme works', '--outcome', 'Acme works.'],
      'goal retire': [added, '--reason', 'Acme test'], 'phase new': ['Acme phase', '--goal', 'G0'], 'phase claim': ['0'],
      prove: ['tests/add.test.mjs', '--fix', 'lib/add.mjs'], 'evidence rederive': ['1'], 'persona run': ['--all'],
      // night tick runs after night plan (the registry's order), which wrote the copy's plan (tests/night-plan.test.mjs covers both).
      'night tick': ['measures', '--status', 'running'],
      // morning reads that plan's night, which night plan dated (tests/morning.test.mjs covers the verb).
      morning: ['--date', nightOf()] };
    // prove needs a repository with a fix to prove: a tiny Acme one (tests/prove.test.mjs covers the verb).
    const proving = await acmeRepo(join(await mkdtemp(join(tmpdir(), 'plates-json-prove-')), 'acme'));
    // Evidence previews a synthetic record, independent of this checkout's historical measurements.
    const measuring = await mkdtemp(join(tmpdir(), 'plates-json-evidence-'));
    t.after(() => rm(measuring, { recursive: true, force: true }));
    for (const path of ['.plates', 'docs/phases', 'docs/evidence']) await mkdir(join(measuring, path), { recursive: true });
    await writeFile(join(measuring, '.plates/plates.json'), JSON.stringify({ name: 'Acme', practices: ['phases'] }));
    await writeFile(join(measuring, 'docs/phases/1-acme.md'), `---
status: planned
since: 2026-10-11
goal: G0
note: "Acme measurement"
evidence: ["evidence/acme.md"]
---
# Acme measurement
## Done when
The Acme count is measured.
## Scope
Acme only.
## Acceptance
- [ ] Measure the Acme count.
## Proof
Run the recorded measurement.
## Deliberately open
None.
## Next action
Measure the count.
`);
    const measurement = { id: 'acme-count', argv: [process.execPath, '-e', 'console.log(12)'], cwd: '.', value: 10, unit: 'characters', date: '2026-10-11' };
    await writeFile(join(measuring, 'docs/evidence/acme.md'), '\n```plates-measurements\n' + JSON.stringify([measurement]) + '\n```\n');
    // persona run measures a synthetic Acme persona whose goal is met (tests/persona.test.mjs covers the verb).
    await mkdir(join(measuring, '.agents/personas'), { recursive: true });
    await writeFile(join(measuring, '.agents/personas/acme.md'), '---\ngoal:\n  - name: anvils\n    at most: 3\n    measured by: echo 2\n---\n');
    const cwdOf = name => ['prove','migrate'].includes(name) ? proving : ['evidence rederive', 'persona run'].includes(name) ? measuring : dir;
    const env = { ...process.env, GIT_AUTHOR_NAME: 'Acme', GIT_AUTHOR_EMAIL: 'acme@acme.test',
      GIT_COMMITTER_NAME: 'Acme', GIT_COMMITTER_EMAIL: 'acme@acme.test' };
    // canvas status reads local binding/receipts only; any accidental transport call
    // hits a nonexistent synthetic executable instead of the installed isocan.
    // phase new runs last: its draft fails the roadmap check (and doctor) until it is written (phase 32).
    for (const name of names().sort((a, b) => (a === 'phase new') - (b === 'phase new'))) {
      const r = plates([...name.split(' '), ...(needs[name] ?? []), '--json'], cwdOf(name), BIN, { ...env, PLATES_GH: emptyGh, PLATES_ISOCAN: join(dir, 'no-isocan'), PLATES_CLAUDE_DIR: join(dir, 'no-transcripts'), PLATES_CACHE: join(dir, 'cache') });
      // feedback requires a verified Git boundary; this copied tree has no Git history.
      // shape needs an explicit record; its packed lifecycle is covered separately.
      // decision needs a source revision; this copied tree has no git history.
      // phase claim, ready and integrate need a remote to push to, and this copy has none: exit 2, as JSON
      // (tests/claim.test.mjs and tests/integrate.test.mjs cover the verbs). promote reads plates's own Vercel
      // target and needs git history, which this copy has not: exit 1, as JSON (tests/promote.test.mjs and
      // tests/promote-vercel.test.mjs cover the verb).
      // board is retired: it names plates home and exits 2, as JSON.
      assert.equal(r.code, ['names', 'promote'].includes(name) ? 1 : name === 'issue' ? 3 : ['migrate', 'phase claim', 'ready', 'integrate', 'decision', 'shape', 'workspace', 'feedback', 'board'].includes(name) ? 2 : 0, `${name}: ${r.err}${r.out}`);
      assert.doesNotThrow(() => JSON.parse(r.out), `${name} --json did not parse: ${r.out}`);
      assert.equal(r.err, '', `${name} wrote to stderr`);
      if (name === 'names') { const data = JSON.parse(r.out); assert.equal(data.mode, 'preview'); assert.ok(data.projects.some(project => project.state === 'unavailable')); assert.equal(data.readOnly, true); }
      if (name === 'feedback') { const data = JSON.parse(r.out); assert.equal(data.error, 'git_unavailable'); assert.equal(data.coverage[0].state, 'unavailable'); }
      if (name === 'evidence rederive') {
        const receipt = JSON.parse(r.out);
        assert.equal(receipt.mode, 'preview');
        assert.equal(receipt.records[0].id, measurement.id);
        assert.equal(receipt.records[0].new, null);
      }
    }
    // render onto an unchanged copy rewrites nothing.
    await rm(join(dir, 'fresh'), { recursive: true, force: true });
    const rendered = plates(['render', '--check', '--json'], dir);
    assert.equal(JSON.parse(rendered.out).ok, true, rendered.out + rendered.err);
    await rm(dirname(proving), { recursive: true, force: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an error under --json is JSON, with a non-zero exit', () => {
  for (const args of [['frobnicate', '--json'], ['goal', '--json'], ['next', 'extra', '--json'], ['render', '--into', '--json']]) {
    const r = plates(args);
    assert.notEqual(r.code, 0, args.join(' '));
    assert.equal(typeof JSON.parse(r.out).error, 'string', args.join(' '));
  }
  const text = plates(['frobnicate']);
  assert.equal(text.code, 2);
  assert.equal(text.out, '');
  assert.match(text.err, /^plates: unknown verb/);
});

test('render --check exits 1 and names the drift', async () => {
  const dir = await copyTree(await mkdtemp(join(tmpdir(), 'plates-drift-')));
  try {
    await writeFile(join(dir, 'scripts/roadmap.mjs'), '// drifted\n');
    const r = plates(['render', '--check', '--json'], dir);
    assert.equal(r.code, 1);
    const out = JSON.parse(r.out);
    assert.equal(out.ok, false);
    assert.ok(out.differs.includes('scripts/roadmap.mjs'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('outside any project: a clear error, exit 2', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-none-'));
  try {
    for (const verb of ['status', 'next', 'goal list', 'render']) {
      const r = plates([...verb.split(' ')], dir);
      assert.equal(r.code, 2, verb);
      assert.match(r.err, /not in a plates project: no \.plates\/plates\.json/);
      const j = plates([...verb.split(' '), '--json'], dir);
      assert.equal(j.code, 2);
      assert.match(JSON.parse(j.out).error, /not in a plates project/);
    }
    // Verbs that need no project still work there.
    assert.equal(plates(['--version'], dir).code, 0);
    assert.equal(plates(['help'], dir).code, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('--version reports the CLI, its commit and the practice version, each from its own source', async () => {
  const pkg = JSON.parse(await readFile(join(PLATES, 'package.json'), 'utf8'));
  const j = JSON.parse(plates(['--version', '--json']).out);
  assert.equal(j.cli, pkg.version);
  assert.equal(j.practice, (await readFile(join(PLATES, 'practices', 'VERSION'), 'utf8')).trim());
  assert.equal(JSON.parse(await readFile(join(PLATES, '.plates', 'plates.json'), 'utf8')).practice, j.practice, 'plates is self: its own practice is the one it ships');
  assert.match(j.commit ?? '', /^[0-9a-f]{4,}$/);
  assert.match(plates(['--version']).out, /^plates \S+ \([0-9a-f]+\) practice \S+\n$/);
});

test('installs from a checkout with no build step, on a machine that has never seen plates', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'plates-install-'));
  try {
    // The working tree, not HEAD: an uncommitted bin/ would be missing from a clone.
    const src = await copyTree(join(tmp, 'src'));
    const prefix = join(tmp, 'prefix'), home = join(tmp, 'home');
    await mkdir(home);
    const env = { ...process.env, HOME: home, npm_config_cache: join(tmp, 'npm-cache'), npm_config_userconfig: join(home, '.npmrc') };
    const install = run('npm', ['install', '-g', src, '--prefix', prefix, '--no-audit', '--no-fund', '--offline'], { env });
    assert.equal(install.status, 0, install.stderr);
    const bin = join(prefix, 'bin', 'plates');
    const project = await copyTree(join(tmp, 'project')); // a copy of plates, run from the installed bin
    const v = plates(['--version'], project, bin, env);
    assert.equal(v.code, 0, v.err);
    assert.match(v.out, /^plates \S+ practice \S+\n$/, 'no commit known: just the two versions');
    assert.doesNotMatch(v.out, /no git/);
    const help = plates(['--agent-help'], project, bin, env);
    assert.equal(help.code, 0, help.err);
    assert.match(help.out, /plates --agent-help/);
    const next = plates(['next', '--json'], project, bin, env);
    assert.equal(next.code, 0, next.err);
    assert.deepEqual(JSON.parse(next.out), JSON.parse(plates(['next', '--json'], project).out), 'the installed bin and the checkout\'s agree');
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('issue new agent CLI previews all rubric fields with OFF policy and requires explicit grammar', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-issue-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, '.plates'));
  await writeFile(join(dir, '.plates/plates.json'), JSON.stringify({ name: 'Acme', repo: 'acme/app' }));
  const rubric = { version: 1, problem: 'Acme loses rows.', reproduction: 'Run Acme test.', acceptance: 'Retain both rows.', change: 'Fix equality.', prerequisites: [], ownerBlockers: [] };
  await writeFile(join(dir, 'rubric.json'), JSON.stringify(rubric));
  const args = ['issue', 'new', '--agent', '--title', 'Fix Acme rows', '--rubric', 'rubric.json', '--json'];
  const r = plates(args, dir); assert.equal(r.code, 3, r.err + r.out);
  const data = JSON.parse(r.out); assert.equal(data.state, 'preview'); assert.deepEqual(data.preview.labels, []);
  for (const heading of ['Problem', 'Reproduction', 'Acceptance', 'One change', 'Prerequisites', 'Owner blockers']) assert.ok(data.preview.body.includes(`### ${heading}`));
  for (const bad of [args.filter(x => x !== '--agent'), [...args, '--title', 'Duplicate'], ['issue', 'new', '--agent', '--json']]) assert.equal(plates(bad, dir).code, 2);
});

test('legacy executable path and preexisting global symlink forward arguments and exit codes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-legacy-bin-'));t.after(() => rm(dir, { recursive: true, force: true }));
  const legacy = join(PLATES, 'bin', 'keel.mjs'), link = join(dir, 'keel');
  await symlink(legacy, link);
  const expected = plates(['--version', '--json']);assert.equal(expected.code, 0, expected.err);
  // This is the old updater's re-exec contract: node <checkout>/bin/keel.mjs.
  const reexec = run(process.execPath, [legacy, '--version', '--json'], { cwd: dir, env: { ...process.env, KEEL_SELF_UPDATED: '1' } });
  assert.equal(reexec.status, 0, reexec.stderr);assert.deepEqual(JSON.parse(reexec.stdout), JSON.parse(expected.out));
  const linked = run(link, ['--version', '--json'], { cwd: dir });assert.equal(linked.status, 0, linked.stderr);assert.deepEqual(JSON.parse(linked.stdout), JSON.parse(expected.out));
  const invalid = run(link, ['acme-unknown-command', '--json'], { cwd: dir });assert.equal(invalid.status, 2);assert.match(JSON.parse(invalid.stdout).error, /unknown verb/);
});

test('npm package includes the legacy executable compatibility entry', () => {
  const packed = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--offline'], { cwd: PLATES });
  assert.equal(packed.status, 0, packed.stderr);
  const files = JSON.parse(packed.stdout)[0].files;
  assert.ok(files.some(file => file.path === 'bin/keel.mjs' && (file.mode & 0o111) !== 0));
  assert.ok(files.some(file => file.path === 'bin/plates.mjs'));
});

test('migrate rejects unpaired malformed and duplicate approval flags before resolving its root', async () => {
  const digest = 'a'.repeat(64);
  for (const args of [['--yes'], ['--digest', digest], ['--yes', '--digest', 'abc'], ['--yes', '--digest', 'A'.repeat(64)], ['--yes', '--yes', '--digest', digest], ['--yes', '--digest', digest, '--digest', digest], ['--yes', '--digest']]) {
    let touched = false;
    await assert.rejects(verbs.get('migrate').run(args, { get cwd() { touched = true; throw new Error('migration context must not be accessed'); } }), error => error.exitCode === 2, args.join(' '));
    assert.equal(touched, false, args.join(' '));
  }
});

test('plates home without a network names each GitHub source unavailable and still renders the local ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-home-offline-'));
  try {
    const root = join(dir, 'studio');
    await mkdir(join(root, '.plates'), { recursive: true }); await mkdir(join(root, 'docs', 'phases'), { recursive: true });
    await writeFile(join(root, '.plates', 'plates.json'), JSON.stringify({ name: 'Acme Studio', repo: 'acme/studio' }));
    await writeFile(join(root, 'docs', 'goals.json'), JSON.stringify([{ id: 'G1', title: 'Acme', outcome: 'Acme works.' }]));
    await writeFile(join(root, 'docs', 'phases', '01-acme.md'), phaseFile(1, { next: '⚑ Choose the Acme policy.' }));
    const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Acme', GIT_AUTHOR_EMAIL: 'a@example.com', GIT_COMMITTER_NAME: 'Acme', GIT_COMMITTER_EMAIL: 'a@example.com',
      PLATES_GH: join(dir, 'no-gh-here'), PLATES_CACHE: join(dir, 'cache'), PLATES_STATE: join(dir, 'state'), XDG_STATE_HOME: join(dir, 'state') };
    for (const args of [['init', '-q', '-b', 'main'], ['add', '-A'], ['commit', '-q', '-m', 'Acme']]) execFileSync('git', ['-C', root, ...args], { env });
    const r = plates(['home', '--json'], root, BIN, env);
    assert.equal(r.code, 0, r.err);
    const data = JSON.parse(r.out);
    assert.equal(data.decisions.length, 1, 'the checkout\'s own sources render');
    assert.match(data.coverage.gaps.find(g => g.source === 'reviews').reason, /could not be read|not read/);
    assert.equal(data.sections.find(s => s.id === 'local').command, 'plates loose-ends');
    const text = plates(['home'], root, BIN, env);
    assert.equal(text.code, 0); assert.match(text.out, /^Needs you \(1 known\)$/m); assert.match(text.out, /^ {2}1 source problem: studio/m);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('plates home --answer settles one item', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-home-answer-'));
  try {
    // One Acme plate on a bare origin: a walk with choices, a health proposal, and codex's claim on phase 3, idle ten days.
    const seed = join(dir, 'seed'), origin = join(dir, 'origin.git'), root = join(dir, 'studio');
    const files = {
      '.plates/plates.json': JSON.stringify({ name: 'Acme Studio', repo: 'acme/studio', practices: ['phases'] }),
      'docs/goals.json': JSON.stringify([{ id: 'G1', title: 'Acme', outcome: 'Acme works.' }]),
      'docs/phases/02-walk.md': phaseFile(2, { status: 'partial', owes: true }),
      'docs/phases/03-anvil.md': phaseFile(3),
      'docs/phases/04-policy.md': phaseFile(4, { status: 'partial', next: '⚑ Choose the Acme policy.' }),
      'docs/health/2026-11-01.md': '# Acme health, 2026-11-01\n\n## Proposal\n\n**`dependency_age`** — Update the Acme anvil library.\n',
    };
    for (const [path, text] of Object.entries(files)) { await mkdir(dirname(join(seed, path)), { recursive: true }); await writeFile(join(seed, path), text); }
    const gh = join(dir, 'gh');
    await writeFile(gh, `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (a[0] === 'pr' && a[1] === 'list') process.stdout.write('[]'); else { console.error('gh: offline'); process.exit(1); }\n`, { mode: 0o755 });
    const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Acme', GIT_AUTHOR_EMAIL: 'a@example.com', GIT_COMMITTER_NAME: 'Acme', GIT_COMMITTER_EMAIL: 'a@example.com',
      PLATES_GH: gh, PLATES_CACHE: join(dir, 'cache'), XDG_STATE_HOME: join(dir, 'state'), PLATES_MACHINE: 'acme-laptop', PLATES_PROVIDER: 'claude', PLATES_SESSION: '' };
    for (const k of Object.keys(env)) if (/^(CLAUDE|CODEX_)/.test(k)) delete env[k];
    const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8' }).trim();
    execFileSync('git', ['init', '-q', '-b', 'main', seed], { env });
    assert.equal(run(process.execPath, [join(PLATES, 'scripts', 'roadmap.mjs'), '--write'], { cwd: seed, env }).status, 0);
    git(seed, 'add', '-A'); git(seed, 'commit', '-q', '-m', 'Acme');
    execFileSync('git', ['clone', '-q', '--bare', seed, origin], { env }); execFileSync('git', ['clone', '-q', origin, root], { env });
    const { claimMessage } = await import('../lib/claim.mjs');
    const at = new Date(Date.now() - 10 * 86_400_000).toISOString(), dated = { ...env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at };
    const claimSha = execFileSync('git', ['-C', root, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', claimMessage({ phase: 3, provider: 'codex', machine: 'acme-old', at, token: 'c'.repeat(32) })], { env: dated, encoding: 'utf8' }).trim();
    git(root, 'push', '-q', 'origin', `${claimSha}:refs/heads/claims/phase-3`);
    const json = args => { const r = plates([...args, '--json'], root, BIN, env); return { code: r.code, data: r.out ? JSON.parse(r.out) : null, err: r.err }; };
    const home = json(['home', '--fresh']);
    assert.equal(home.code, 0, home.err);
    const walk = home.data.walks.find(w => w.phase === '2'), proposal = home.data.decisions.find(d => d.itemKind === 'proposal');
    const stale = home.data.sections.find(s => s.id === 'claims').items[0];
    assert.deepEqual([walk.key, proposal.key, stale.key], ['studio:walk:2', 'studio:proposal:docs/health/2026-11-01.md', 'studio:claim:claims/phase-3']);
    const clean = () => git(root, 'status', '--porcelain');

    // A walk: the preview writes nothing (exit 3); --yes records the choice through walk done.
    const choice = walk.answers.find(a => a.id.startsWith('choice-'));
    const preview = json(['home', '--answer', walk.key, choice.id]);
    assert.deepEqual([preview.code, preview.data.state, preview.data.writer], [3, 'preview', 'walk done'], preview.err);
    assert.equal(clean(), '', 'a preview writes nothing');
    const walked = json(['home', '--answer', walk.key, choice.id, '--why', 'Tried it on the Acme phone.', '--yes']);
    assert.deepEqual([walked.code, walked.data.state], [0, 'written'], walked.err);
    assert.equal(walked.data.result.choice, choice.label);
    assert.match(await readFile(join(root, walked.data.result.evidence), 'utf8'), new RegExp(`Chose: ${choice.label}\\. Tried it on the Acme phone\\.`));

    // A proposal: declining needs a why (exit 2, nothing written); with one, walk decide records it.
    const bare = json(['home', '--answer', proposal.key, 'decline', '--yes']);
    assert.equal(bare.code, 2); assert.match(bare.data.error, /Decline needs a why/);
    assert.doesNotMatch(await readFile(join(root, 'docs/health/2026-11-01.md'), 'utf8'), /Decided/);
    const declined = json(['home', '--answer', proposal.key, 'decline', '--why', 'Renovate takes it', '--yes']);
    assert.equal(declined.code, 0, declined.err);
    assert.match(await readFile(join(root, 'docs/health/2026-11-01.md'), 'utf8'), /\*\*Decided \d{4}-\d\d-\d\d: declined\*\* — Renovate takes it/);

    // A stale claim: released on the owner's behalf, recorded with who and why in the phase's Trajectory.
    assert.equal(json(['home', '--answer', stale.key, 'release', '--yes']).code, 2, 'a release says why');
    const released = json(['home', '--answer', stale.key, 'release', '--why', 'codex stopped on it', '--yes']);
    assert.deepEqual([released.code, released.data.state, released.data.by], [0, 'released', 'Acme'], released.err);
    assert.equal(git(origin, 'branch', '--list', 'claims/*'), '', 'the claim branch is gone');
    assert.match(await readFile(join(root, 'docs/phases/03-anvil.md'), 'utf8'), /## Trajectory\n\n- \*\*\d{4}-\d\d-\d\d\*\* — The owner \(Acme\) released the stale claim claims\/phase-3 \(codex on acme-old, no push for 10 days\) from plates home: codex stopped on it\./);

    // Not now: the proposal (still listed: home reads the default branch) leaves Needs you, counted, until its date.
    const off = json(['home', '--answer', proposal.key, 'not-now', '--until', '2099-01-01', '--yes']);
    assert.deepEqual([off.code, off.data.until], [0, '2099-01-01'], off.err);
    const after = json(['home']);
    assert.ok(!after.data.decisions.some(d => d.key === proposal.key), 'put off');
    assert.deepEqual(after.data.putOff.items.map(p => [p.key, p.until]), [[proposal.key, '2099-01-01']]);
    assert.match(plates(['home'], root, BIN, env).out, /^ {2}Put off \(1\): /m);
    // A step: Hand to an agent goes through plates issue new --agent's preview (robot OFF: unlabelled), and nothing is filed without --yes.
    const step = after.data.decisions.find(d => d.itemKind === 'step');
    assert.equal(step.key, 'studio:step:4');
    const hand = json(['home', '--answer', step.key, 'hand', '--why', 'Pick the stricter Acme policy and record it.']);
    assert.deepEqual([hand.code, hand.data.state, hand.data.writer], [3, 'preview', 'agent issue'], hand.err);
    assert.match(hand.data.result.preview.title, /^Owner's answer: phase 4/);
    assert.match(hand.data.result.preview.body, /Pick the stricter Acme policy and record it\./);
    assert.deepEqual(hand.data.result.preview.labels, [], 'robot OFF: no queue label');
    // Its failure path: GitHub cannot be reached, so no issue is confirmed and the answer says so (exit 2), never a guess.
    const offline = json(['home', '--answer', step.key, 'hand', '--why', 'Pick the stricter Acme policy and record it.', '--yes']);
    assert.equal(offline.code, 2, offline.err); assert.equal(offline.data.result.issue ?? null, null);
    // Done: the step's loose end is marked drop with the why; once that mark is on the default branch, home stops listing the step.
    const done = json(['home', '--answer', step.key, 'done', '--why', 'Chose the stricter policy.', '--yes']);
    assert.equal(done.code, 0, JSON.stringify(done.data));
    assert.match(await readFile(join(root, '.plates', 'loose-ends.json'), 'utf8'), /"fingerprint": "phase:4"[\s\S]*"move": "drop"[\s\S]*"reason": "Chose the stricter policy\."/);
    git(root, 'add', '.plates/loose-ends.json'); git(root, 'commit', '-q', '-m', 'Acme: the policy step is done'); git(root, 'push', '-q', 'origin', 'HEAD:main');
    assert.ok(!json(['home']).data.decisions.some(d => d.key === step.key), 'the marked step is not listed');
    // An item that is not waiting, and an answer it does not have, write nothing (exit 2).
    assert.equal(json(['home', '--answer', 'studio:walk:99', 'done']).code, 2);
    assert.match(json(['home', '--answer', walk.key, 'merge']).data.error, /has no answer "merge"/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('plates board is retired and names plates home', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-board-retired-'));
  try {
    const env = { ...process.env, PLATES_GH: join(dir, 'no-gh-here'), PLATES_CACHE: join(dir, 'cache') };
    // A server would hold the process open until the timeout: the verb returns at once, having read and served nothing.
    for (const args of [['board'], ['board', '--open'], ['board', '--port', '0']]) {
      const r = run(process.execPath, [BIN, ...args], { cwd: PLATES, env, timeout: 20_000 });
      assert.equal(r.status, 2, `${args.join(' ')} exits 2`);
      assert.match(r.stdout + r.stderr, /plates board is retired: run plates home/);
      assert.doesNotMatch(r.stdout + r.stderr, /127\.0\.0\.1|Serving on/);
    }
    const json = run(process.execPath, [BIN, 'board', '--json'], { cwd: PLATES, env, timeout: 20_000 });
    assert.equal(json.status, 2);
    assert.deepEqual([JSON.parse(json.stdout).ok, JSON.parse(json.stdout).replacement], [false, 'plates home']);
    // The board's renderer and server are gone; the item model stays.
    await assert.rejects(readFile(join(PLATES, 'lib', 'board.mjs')), /ENOENT/);
    assert.match(await readFile(join(PLATES, 'lib', 'work-items.mjs'), 'utf8'), /export async function workItems/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
