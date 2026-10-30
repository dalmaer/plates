import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './helpers/run.mjs';
import { qualityBaseline, qualityCommand, replayProposal } from '../lib/agent-quality.mjs';
import { initializeWorkspace } from '../lib/web/workspace.mjs';
import { qualityReport } from '../lib/agent-quality-report.mjs';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const BIN = join(appRoot, 'bin/plates.mjs');
const MARKER = 'ACME-PRIVATE-COMMIT-WORDS';
const git = (root, ...args) => {
  const r = run('git', ['-C', root, ...args]);
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
};
async function world(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-agent-quality-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repos = [];
  for (const name of ['widget', 'service']) {
    const repo = join(root, name); await mkdir(repo); await mkdir(join(repo, '.plates'));
    git(repo, 'init', '-q', '-b', 'main'); git(repo, 'remote', 'add', 'origin', `https://github.com/Acme/${name}.git`);
    await writeFile(join(repo, '.plates/plates.json'), JSON.stringify({ repo: `Acme/${name}` }));
    git(repo, 'add', '.plates/plates.json'); git(repo, 'commit', '-qm', MARKER);
    await writeFile(join(repo, 'private.txt'), MARKER); git(repo, 'add', 'private.txt'); git(repo, 'commit', '-qm', `${MARKER} second`);
    repos.push(repo);
  }
  await mkdir(join(root, 'inputs'));
  const manifest = join(root, 'inputs/workspace.json'), state = join(root, 'state');
  await writeFile(manifest, JSON.stringify({ version: 1, id: 'acme-quality', name: 'Acme', repo: 'Acme/private', projects: [{ id: 'widget', repo: 'Acme/widget' }, { id: 'service', repo: 'Acme/service' }] }));
  await initializeWorkspace({ manifest, state, appRoot });
  const call = args => qualityCommand({ args, appRoot, cwd: root });
  return { root, repos, manifest, state, call };
}

test('read-only baseline is bounded across projects and never imports private prose or acceptance', async t => {
  const w = await world(t), before = await readdir(w.state);
  const a = await qualityBaseline({ repositories: w.repos, limit: 3, now: '2026-10-30T00:00:00.000Z' });
  const b = await qualityBaseline({ repositories: w.repos, limit: 3, now: '2026-10-31T00:00:00.000Z' });
  assert.equal(a.coverage.candidates, 3); assert.equal(a.coverage.verifiedEpisodes, 0);
  assert.deepEqual(a.projects.map(p => p.observedCandidates), [2, 1]);
  assert.deepEqual(a.bundle, b.bundle, 'source records do not change merely because collection time changes');
  assert.ok(a.bundle.episodes.every(e => e.assignedAt === null && e.attempts.length === 0 && e.passport.timing === 'retrospective'));
  assert.ok(!JSON.stringify(a).includes(MARKER)); assert.ok(!JSON.stringify(a).includes(w.root));
  assert.deepEqual(await readdir(w.state), before);
  await assert.rejects(qualityBaseline({ repositories: [w.repos[0], w.repos[0]] }), /duplicate/);
  await assert.rejects(qualityBaseline({ repositories: w.repos, limit: 1 }), /slot/);
});

test('identity mismatch remains an unavailable source, not an empty successful baseline', async t => {
  const w = await world(t);
  git(w.repos[0], 'remote', 'set-url', 'origin', 'https://github.com/Acme/other.git');
  const r = await w.call(['baseline', '--repository', w.repos[0], '--repository', w.repos[1], '--limit', '4']);
  assert.equal(r.exitCode, 1); assert.equal(r.data.unavailable.length, 1); assert.equal(r.data.coverage.candidates, 2);
  assert.ok(!JSON.stringify(r.data).includes(w.repos[0]));
});

test('strict PR metadata snapshots retain open and merged candidates without scoring either', async t => {
  const w = await world(t), path = join(w.root, 'inputs/prs.json');
  const revision = git(w.repos[0], 'rev-parse', 'HEAD');
  const rows = [1, 2].map(number => ({ number, state: number === 1 ? 'OPEN' : 'MERGED', createdAt: '2026-10-29T00:00:00Z',
    closedAt: number === 1 ? null : '2026-10-30T00:00:00Z', mergedAt: number === 1 ? null : '2026-10-30T00:00:00Z',
    headRefOid: revision, baseRefOid: revision, url: `https://github.com/Acme/widget/pull/${number}` }));
  await writeFile(path, JSON.stringify(rows));
  const r = await qualityBaseline({ repositories: [w.repos[0]], prMetadata: [path] });
  assert.equal(r.coverage.candidates, 2); assert.equal(r.coverage.comparableEpisodes, 0);
  assert.deepEqual(r.projects[0].states, { OPEN: 1, CLOSED: 0, MERGED: 1 });
  assert.deepEqual(r.bundle.episodes.map(e => e.links), [['Acme/widget#1'], ['Acme/widget#2']]);
  assert.ok(r.bundle.episodes.every(e => e.attempts.length === 0));
  await writeFile(path, JSON.stringify(rows.map(row => ({ ...row, state: 'MERGED', headRefOid: 'a'.repeat(40), closedAt: '2026-10-30T00:00:00Z', mergedAt: '2026-10-30T00:00:00Z' }))));
  const changed = await qualityBaseline({ repositories: [w.repos[0]], prMetadata: [path] });
  assert.deepEqual(changed.bundle, r.bundle, 'PR pushes and merges do not create another candidate');
  await writeFile(path, JSON.stringify([{ ...rows[0], body: MARKER }]));
  const bad = await qualityBaseline({ repositories: [w.repos[0]], prMetadata: [path] });
  assert.equal(bad.unavailable.length, 1); assert.equal(bad.bundle.episodes.length, 0);
});

test('real CLI collects exact preview, reports unknowns and refuses irrelevant options', async t => {
  const w = await world(t), bundle = join(w.root, 'inputs/bundle.json');
  await writeFile(bundle, JSON.stringify((await qualityBaseline({ repositories: w.repos })).bundle));
  const args = ['--manifest', w.manifest, '--state', w.state];
  const preview = await w.call(['collect', ...args, '--bundle', bundle]); assert.equal(preview.exitCode, 3);
  await w.call(['collect', ...args, '--bundle', bundle, '--yes', '--digest', preview.data.digest]);
  const result = run(process.execPath, [BIN, 'retro', 'quality', 'report', ...args, '--json'], { cwd: w.root, env: { ...process.env, PLATES_CLAUDE_DIR: join(w.root, 'synthetic-transcripts') } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout); assert.equal(report.coverage.comparableEpisodes, 0); assert.equal(report.recommendation.winner, null);
  assert.equal(report.workload.completion.accepted, 0);
  const help = run(process.execPath, [BIN, '--agent-help', 'retro']); assert.match(help.stdout, /retro quality/);
  for (const invalid of [ ['report', ...args, '--yes'], ['baseline', '--yes'], ['baseline', '--limit', 'NaN'], ['inspect', ...args, '--repository', w.repos[0]], ['report', ...args, '--limit', '3'] ]) {
    await assert.rejects(w.call(invalid), /evaluations:/);
  }
});

test('weekly reporting reads existing observations and exposes collection as a separate exact approval', async t => {
  const w = await world(t), before = await readdir(w.state);
  const r = await w.call(['weekly', '--manifest', w.manifest, '--state', w.state, '--repository', w.repos[0]]);
  assert.equal(r.data.readOnly, true); assert.equal(r.data.baseline.coverage.candidates, 2);
  assert.equal(r.data.collection.status, 'preview-only'); assert.equal(r.data.modelRuns, 0);
  assert.equal(r.data.report.coverage.episodes, 0); assert.deepEqual(await readdir(w.state), before);
  const path = join(w.root, 'inputs/previous.json'); await writeFile(path, JSON.stringify(r.data.report));
  const report = await w.call(['report', '--manifest', w.manifest, '--state', w.state, '--previous', path]);
  assert.ok(Array.isArray(report.data.materialChanges));
});

test('replay proposal binds evidence but cannot dispatch or reserve a budget', async t => {
  const w = await world(t), baseline = await qualityBaseline({ repositories: w.repos });
  const report = qualityReport(baseline.bundle);
  const proposal = replayProposal({ bundle: baseline.bundle, report });
  assert.equal(proposal.enabled, false); assert.equal(proposal.budgetReserved, false); assert.equal(proposal.dispatchAvailable, false);
  assert.equal(proposal.budget.total, null); assert.equal(proposal.crossover.equalBudgetSelfRevisionControl, true);
  assert.deepEqual(proposal.workflows.map(x => [x.implementer, x.reviewer, x.reviser]), [['claude', 'codex', 'claude'], ['codex', 'claude', 'codex']]);
  assert.match(proposal.inputDigest, /^[a-f0-9]{64}$/);
});
