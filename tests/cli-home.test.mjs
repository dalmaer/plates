// CLI home interactions split from cli.test.mjs so independent processes can run them alongside the surface checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { run } from './helpers/run.mjs';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { phaseFile } from './helpers/web-projects.mjs';

const PLATES = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(PLATES, 'bin', 'plates.mjs');
const plates = (args, cwd = PLATES, bin = BIN, env = process.env) => {
  const r = bin === BIN
    ? run(process.execPath, [bin, ...args], { cwd, env })
    : run(bin, args, { cwd, env });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

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

    // A walk is a Try it (phase 204): the preview writes nothing (exit 3); --yes records Works through walk done --tried.
    assert.deepEqual(walk.answers.map(a => a.id), ['works', 'off', 'skip']);
    assert.deepEqual(home.data.tryIt.map(t => t.key), [walk.key], 'listed as an optional Try it');
    const choice = walk.answers.find(a => a.id === 'works');
    const preview = json(['home', '--answer', walk.key, choice.id]);
    assert.deepEqual([preview.code, preview.data.state, preview.data.writer], [3, 'preview', 'try it'], preview.err);
    assert.equal(clean(), '', 'a preview writes nothing');
    const walked = json(['home', '--answer', walk.key, choice.id, '--why', 'Tried it on the Acme phone.', '--yes']);
    assert.deepEqual([walked.code, walked.data.state], [0, 'written'], walked.err);
    assert.equal(walked.data.result.tried, 'works');
    assert.match(await readFile(join(root, walked.data.result.evidence), 'utf8'), /Tried it: works\. Tried it on the Acme phone\./);

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

