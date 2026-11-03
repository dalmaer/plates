// The owner releases a stale claim from home (plates phase 173): another
// session's claim, which plates phase claim --release never deletes, once it is
// stale by the rule plates home lists it by (no push for seven days). One bare
// Acme origin and two clones, on this machine's disk; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { claim, claimItems, releaseStale, claimMessage, STALE_DAYS } from '../lib/claim.mjs';
import { recordTrajectory } from '../lib/work-items.mjs';
import { run } from './helpers/run.mjs';

const NOW = Date.parse('2026-10-20T10:00:00.000Z'), DAY = 86_400_000;
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const phase = (id, title) => `---\nstatus: planned\nsince: 2026-10-01\ngoal: G0\ndepends: [0]\nnote: "Acme."\nevidence: []\n---\n\n# ${title}\n\n## Done when\n\nThe anvil lands.\n\n## Scope\n\nSmall.\n\n## Acceptance\n\n- [ ] Lands. \`tests/anvil.test.mjs\`\n\n## Proof\n\nA command.\n\n## Deliberately open\n\nNothing yet.\n\n## Next action\n\nBuild the anvil.\n`;

async function acme(t) {
  const dir = await mkdtemp(join(tmpdir(), 'plates-claims-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const seed = join(dir, 'seed'), origin = join(dir, 'origin.git');
  const w = async (p, text) => { await mkdir(dirname(join(seed, p)), { recursive: true }); await writeFile(join(seed, p), text); };
  await w('.plates/plates.json', JSON.stringify({ name: 'Acme', repo: 'acme/app', practices: ['phases'] }));
  await w('docs/goals.json', JSON.stringify([{ id: 'G0', title: 'Anvils', outcome: 'They land.' }]));
  await w('docs/evidence/acme-0.md', '# Evidence: phase 0\n');
  await w('docs/phases/00-start.md', phase(0, 'Start').replace('status: planned', 'status: built').replace('depends: [0]', 'depends: []').replace('evidence: []', 'evidence: ["evidence/acme-0.md"]').replace('- [ ]', '- [x]'));
  await w('docs/phases/01-anvil.md', phase(1, 'Build the anvil'));
  execFileSync('git', ['init', '-q', '-b', 'main', seed]);
  assert.equal(run(process.execPath, [join(dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'roadmap.mjs'), '--write'], { cwd: seed }).status, 0);
  git(seed, 'add', '-A'); git(seed, 'commit', '-q', '-m', 'acme');
  execFileSync('git', ['clone', '-q', '--bare', seed, origin]);
  const a = join(dir, 'a'), b = join(dir, 'b');
  for (const clone of [a, b]) execFileSync('git', ['clone', '-q', origin, clone]);
  // gh: no open PRs, and nothing else (the release itself reads no PRs).
  const gh = join(dir, 'gh');
  await writeFile(gh, `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (a[0] === 'pr' && a[1] === 'list') process.stdout.write('[]'); else { console.error('gh: offline'); process.exit(1); }\n`, { mode: 0o755 });
  const env = (machine, provider) => {
    const e = { ...process.env, PLATES_GH: gh, PLATES_MACHINE: machine, PLATES_PROVIDER: provider, PLATES_SESSION: '' };
    for (const k of Object.keys(e)) if (/^(CLAUDE|CODEX_)/.test(k)) delete e[k];
    return e;
  };
  return { dir, origin, a, b, env };
}
const remoteClaim = (origin, n) => { try { return git(origin, 'rev-parse', '--verify', '--quiet', `refs/heads/claims/phase-${n}`); } catch { return null; } };

test('the owner releases a stale claim from home', async t => {
  const x = await acme(t);
  // Codex claims phase 1 from checkout b, and pushes nothing after.
  const made = await claim({ root: x.b, phase: 1 }, { env: x.env('acme-old', 'codex'), now: NOW });
  assert.equal(made.data.claimed, true, made.text);
  const sha = remoteClaim(x.origin, 1);
  const owner = x.env('acme-laptop', 'claude');
  let records = 0;
  const record = async facts => {
    records++;
    const r = await recordTrajectory({ root: x.a, phase: 1, today: '2026-10-29',
      line: `- **2026-10-29** — The owner (Acme) released the stale claim ${facts.branch} (${facts.holder.provider} on ${facts.holder.machine}, no push for ${facts.holder.idle} days) from plates home: codex stopped on it.` });
    return r.undo;
  };

  // Not stale (two days): refused, exit 1, nothing recorded, the claim still there.
  const early = await releaseStale({ root: x.a, phase: 1, yes: true, record }, { env: owner, now: NOW + 2 * DAY });
  assert.deepEqual([early.exitCode, early.data.state], [1, 'refused']);
  assert.match(early.text, /is not stale: its last push was 2 days ago.*after 7 days with no push/);
  assert.equal(records, 0); assert.equal(remoteClaim(x.origin, 1), sha);
  // Day six still refused; the rule is plates home's own.
  assert.equal((await releaseStale({ root: x.a, phase: 1, yes: true, record }, { env: owner, now: NOW + (STALE_DAYS - 1) * DAY + 3600_000 })).exitCode, 1);
  assert.deepEqual((await claimItems(x.a, { env: owner, fresh: true, now: NOW + 2 * DAY })).items, [], 'home does not list it either');

  // Stale (nine days): home lists it; a preview changes nothing.
  const at = NOW + 9 * DAY;
  assert.equal((await claimItems(x.a, { env: owner, fresh: true, now: at })).items.length, 1, 'home lists the stale claim');
  const preview = await releaseStale({ root: x.a, phase: 1, record }, { env: owner, now: at });
  assert.deepEqual([preview.exitCode, preview.data.state, records], [3, 'preview', 0]);
  assert.match(preview.text, /Would delete claims\/phase-1 on origin \(codex on acme-old, no push for 9 days\)/);
  assert.equal(remoteClaim(x.origin, 1), sha);

  // The failure path: the holder pushes to its claim between the read and the delete. The delete is refused, and the record is put back.
  const before = await readFile(join(x.a, 'docs/phases/01-anvil.md'), 'utf8');
  const racing = async facts => {
    const undo = await record(facts);
    git(x.b, 'fetch', '-q', 'origin');
    git(x.b, 'push', '-q', 'origin', `${git(x.b, 'commit-tree', `${sha}^{tree}`, '-p', sha, '-m', claimMessage({ phase: 1, provider: 'codex', machine: 'acme-old', at: new Date().toISOString(), token: 'f'.repeat(32) }))}:refs/heads/claims/phase-1`);
    return undo;
  };
  await assert.rejects(releaseStale({ root: x.a, phase: 1, yes: true, record: racing }, { env: owner, now: at }), /could not be released.*The record was put back; nothing was released/);
  assert.equal(await readFile(join(x.a, 'docs/phases/01-anvil.md'), 'utf8'), before, 'the Trajectory record was undone');
  assert.notEqual(remoteClaim(x.origin, 1), null, 'the claim is still there');
  assert.notEqual(remoteClaim(x.origin, 1), sha, 'with the holder\'s new push');
  // That push made it fresh again: refused.
  assert.equal((await releaseStale({ root: x.a, phase: 1, yes: true, record }, { env: owner, now: at })).exitCode, 1, 'a claim that was just pushed is not stale');

  // Nine days after that push: released, and who released it and why is in the phase's Trajectory.
  const later = Date.now() + 9 * DAY;
  records = 0;
  const done = await releaseStale({ root: x.a, phase: 1, yes: true, record }, { env: owner, now: later });
  assert.deepEqual([done.exitCode, done.data.state, done.data.released, records], [0, 'released', true, 1], done.text);
  assert.equal(remoteClaim(x.origin, 1), null, 'claims/phase-1 is gone from the origin');
  const text = await readFile(join(x.a, 'docs/phases/01-anvil.md'), 'utf8');
  assert.match(text, /## Next action\n\nBuild the anvil\.\n\n## Trajectory\n\n- \*\*2026-10-29\*\* — The owner \(Acme\) released the stale claim claims\/phase-1 \(codex on acme-old, no push for 9 days\) from plates home: codex stopped on it\.\n$/);
  // Nothing left to release.
  assert.match((await releaseStale({ root: x.a, phase: 1, yes: true, record }, { env: owner, now: later })).text, /has no claim to release/);
});
