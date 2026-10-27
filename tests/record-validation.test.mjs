import './helpers/hermetic.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from './helpers/run.mjs';
import { fill } from '../lib/practices.mjs';
import { runBlocks } from './helpers/workflows.mjs';
import { inspectRecordPolicy, recordChange, RECORD_POLICY } from '../lib/record-validation.mjs';
import { runRecordChecks, recordStages } from '../scripts/check-records.mjs';

const inspectFixture = input => inspectRecordPolicy(input, { sourceRoot: input.root });
const phase = '---\nstatus: planned\nsince: 2026-10-01\nnote: "Acme"\nevidence: []\ngoal: G1\n---\n# Acme\n\n## Scope\nKeep scope.\n\n## Acceptance\n- [ ] Acme result\n\n## Proof\nnode test.mjs\n\n## Next action\nCheck Acme.\n';
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'plates-acme-records-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (path, text) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), text); };
  await write('.plates/plates.json', JSON.stringify({ plates: 'self', repo: 'acme/source' }));
  await write('docs/phases/01-acme.md', phase);
  await write('docs/evidence/acme.md', '# Acme observations\n');
  await write('lib/acme.mjs', '// Acme\n');
  const git = (...args) => { const r = run('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: root }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git('init', '-q'); git('add', '.'); git('commit', '-qm', 'Acme baseline');
  const base = git('rev-parse', 'HEAD');
  const input = () => ({ root, base, head: git('rev-parse', 'HEAD'), policy: RECORD_POLICY });
  return { root, write, git, input };
}
test('semantic allowlist preserves requirements, proof, decisions and historical observations', () => {
  const path = 'docs/phases/01-acme.md';
  for (const after of [phase.replace('status: planned', 'status: partial'), phase.replace('[ ]', '[x]')]) assert.equal(recordChange(path, phase, after), true);
  for (const after of [phase.replace('Acme result', 'Different requirement'), phase.replace('Keep scope.', 'New scope.'), phase.replace('node test.mjs', 'node other.mjs'), phase + '\n## Decision\nNew authority.\n', phase.replace('Check Acme.', 'Approve all deployments.'), phase.replace('Check Acme.', '```sh\nship --yes\n```')]) assert.equal(recordChange(path, phase, after), false);
  assert.equal(recordChange(path, null, phase), false);
  const cited = phase.replace('Check Acme.', 'Inspect acme/app#12 and ../evidence/acme.md.');
  assert.equal(recordChange(path, cited, cited.replace('acme/app#12', 'acme/other#13')), true);
  assert.equal(recordChange(path, cited, cited.replace('Inspect', 'Approve')), false);
  const proofRef = phase.replace('node test.mjs', 'Inspect acme/app#12');
  assert.equal(recordChange(path, proofRef, proofRef.replace('acme/app#12', 'acme/other#13')), false);
  assert.equal(recordChange('docs/evidence/acme.md', '# Acme\n', '# Acme\n\nObserved success.\n'), true);
  assert.equal(recordChange('docs/evidence/acme.md', '# Acme\n', '# Rewritten\n'), false);
  assert.equal(recordChange('docs/evidence/acme.md', '# Acme\n```json\n', '# Acme\n```json\nnew policy field\n'), false);
  assert.equal(recordChange('docs/evidence/acme.md', null, '```plates-proof\n{}\n```\n'), false);
});
test('complete committed, staged, dirty and untracked inventory fails broad for code or acceptance', async t => {
  const f = await fixture(t);
  await f.write('docs/phases/01-acme.md', phase.replace('planned', 'partial'));
  assert.equal((await inspectRecordPolicy(f.input())).mode, 'full-gate', 'unrelated self-labelled fixture is not the runtime source checkout');
  assert.equal((await inspectFixture(f.input())).mode, 'record-checks');
  f.git('add', '.'); f.git('commit', '-qm', 'Acme attribution');
  assert.equal((await inspectFixture(f.input())).mode, 'record-checks');
  await f.write('lib/acme.mjs', '// changed code\n'); f.git('add', 'lib/acme.mjs');
  await f.write('lib/acme.mjs', '// Acme\n');
  assert.equal((await inspectFixture(f.input())).mode, 'full-gate', 'staged code hidden by worktree revert');
  f.git('reset', '--hard', 'HEAD');
  await f.write('docs/phases/01-acme.md', phase.replace('Acme result', 'Changed requirement'));
  assert.equal((await inspectFixture(f.input())).mode, 'full-gate');
  f.git('reset', '--hard', 'HEAD');
  await f.write('unknown.txt', 'Acme\n');
  assert.equal((await inspectFixture(f.input())).mode, 'full-gate');
});
test('new phases, renames, symlinks, missing base and consumers never inherit exemption', async t => {
  for (const scenario of ['new', 'rename', 'symlink', 'base', 'consumer', 'policy']) {
    const f = await fixture(t);
    await f.write('docs/phases/01-acme.md', phase.replace('planned', 'partial'));
    const input = f.input();
    if (scenario === 'new') await f.write('docs/phases/02-acme.md', phase);
    if (scenario === 'rename') f.git('mv', 'docs/evidence/acme.md', 'docs/evidence/renamed.md');
    if (scenario === 'symlink') { await rm(join(f.root, 'docs/phases/01-acme.md')); await symlink('../evidence/acme.md', join(f.root, 'docs/phases/01-acme.md')); }
    if (scenario === 'base') input.base = 'a'.repeat(40);
    if (scenario === 'consumer') await f.write('.plates/plates.json', '{"repo":"acme/app"}');
    if (scenario === 'policy') delete input.policy;
    assert.equal((await inspectFixture(input)).mode, 'full-gate', scenario);
  }
});
test('record execution runs all required stages and never manufactures full-gate provenance', async t => {
  const f = await fixture(t);
  await f.write('docs/phases/01-acme.md', phase.replace('planned', 'partial'));
  const called = [];
  const report = await runRecordChecks(f.input(), { inspect: inspectFixture, reconcileRecords: async o => { assert.equal(o.github, true); return { findings: [], unknown: [] }; }, execute: (command, args) => { called.push([command, args]); return { status: 0 }; } });
  assert.equal(report.status, 0, JSON.stringify(report));
  assert.deepEqual(report.stages.map(s => s.id), ['references', 'reconciliation', 'roadmap', 'render', 'inbox', 'whitespace']);
  assert.equal(called.length, 4);
  assert.equal(report.provenance, 'record-checks'); assert.equal(report.fullGatePassed, false);
  const failure = await runRecordChecks(f.input(), { inspect: inspectFixture, reconcileRecords: async () => ({ findings: [], unknown: ['missing fact'] }), execute: () => { throw Error('must stop'); } });
  assert.equal(failure.status, 1);
  assert.deepEqual(recordStages(f.input().base).at(-1).args, ['-c', 'core.fsmonitor=false', 'diff', '--check', f.input().base]);
});
test('local integration and source CI call the same explicit evaluator and executable bundle', async () => {
  const local = await readFile(resolve('lib/integrate.mjs'), 'utf8');
  const ci = await readFile(resolve('.github/workflows/check.yml'), 'utf8');
  const script = await readFile(resolve('scripts/check-records.mjs'), 'utf8');
  assert.match(local, /inspectRecordPolicy\(\{ root: dir, base: origin, head: sha, policy: RECORD_POLICY \}\)/);
  assert.match(local, /node scripts\/check-records.mjs --records-only --policy/);
  assert.match(ci, /node scripts\/check-records.mjs --policy plates-source-records-v1 --base "\$RECORD_BASE" --head "\$RECORD_HEAD" --json/);
  assert.match(script, /inspectRecordPolicy\(input\)/);
  const template = await readFile(resolve('practices/ci/files/.github/workflows/check.yml'), 'utf8');
  assert.doesNotMatch(template, /check-records/);
});

test('unchanged private and public PR history is not reread; new unavailable reference fails', async t => {
  const f = await fixture(t);
  const historical = phase.replace('Check Acme.', 'Inspect acme/private-ledger#12 and https://github.com/acme/public/pull/13.');
  await f.write('docs/phases/01-acme.md', historical);
  f.git('add', '.'); f.git('commit', '-qm', 'Acme prior reference history');
  const base = f.git('rev-parse', 'HEAD');
  await f.write('docs/phases/01-acme.md', historical.replace('planned', 'partial'));
  const input = { ...f.input(), base };
  const calls = [];
  const deps = { inspect: inspectFixture, reconcileRecords: async options => {
    assert.equal(options.github, true);
    return { findings: [], unknown: [{ rule: 'github-unavailable', path: 'acme/private-ledger#12' }], snapshot: { prs: options.prFacts }, notes: [{ rule: 'github-skipped', message: 'Existing private history not refreshed' }] };
  }, execute: (command, args) => { calls.push([command, args]); return command === 'gh' ? { status: 1 } : { status: 0 }; } };
  const unchanged = await runRecordChecks(input, deps);
  assert.equal(unchanged.status, 0, JSON.stringify(unchanged));
  assert.equal(calls.some(([command]) => command === 'gh'), false);
  assert.equal(unchanged.stages[1].unchangedRemote, 'not-refreshed');
  await f.write('docs/phases/01-acme.md', historical.replace('acme/private-ledger#12', 'acme/private-ledger#14'));
  const changed = await runRecordChecks(input, deps);
  assert.deepEqual(changed.requiredPRs, ['acme/private-ledger/pulls/14']);
  assert.equal(changed.status, 1);
  assert.equal(changed.fullGatePassed, false);
  assert.ok(calls.some(([command, args]) => command === 'gh' && args[1] === 'repos/acme/private-ledger/pulls/14'));
  const fresh = await runRecordChecks(input, { ...deps, execute: command => command === 'gh' ? { status: 0, stdout: JSON.stringify({ number: 14, state: 'open', draft: false, merged_at: null, head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40), repo: { full_name: 'acme/private-ledger' } } }) } : { status: 0 } });
  assert.equal(fresh.status, 0, JSON.stringify(fresh));
  assert.equal(fresh.stages[1].snapshot.prs['acme/private-ledger#14'].state, 'open');
});

test('CLI actually executes the narrow bundle; stale roadmap and code both refuse a record pass', async t => {
  const f = await fixture(t);
  // Copy production evaluator/runner into an independent synthetic source runtime.
  for (const path of ['lib/record-validation.mjs', 'lib/validation-capabilities.mjs', 'lib/web/capability-source-data.mjs', 'scripts/check-records.mjs', 'scripts/roadmap.mjs', 'scripts/plates/reconcile.mjs', 'scripts/plates/names.mjs']) await f.write(path, await readFile(resolve(path), 'utf8'));
  await f.write('.gitignore', '.plates/test-runs/\n');
  await f.write('docs/goals.json', JSON.stringify([{ id: 'G1', title: 'Acme', outcome: 'Acme outcome' }]));
  const valid = phase.replace('## Scope', '## Done when\nAcme has a result.\n\n## Scope').replace('## Next action', '## Deliberately open\nNone.\n\n## Next action');
  await f.write('docs/phases/01-acme.md', valid);
  // Boundary probes stand in for render/inbox in this tiny source fixture;
  // roadmap, reference/reconciliation and whitespace are the real production checks.
  await f.write('scripts/render.mjs', 'console.log("Acme render executed");\n');
  await f.write('bin/plates.mjs', 'console.log("Acme inbox executed");\n');
  const generate = () => run(process.execPath, ['scripts/roadmap.mjs'], { cwd: f.root });
  const generated = generate(); assert.equal(generated.status, 0, generated.stderr);
  f.git('add', '.'); f.git('commit', '-qm', 'Acme source runtime');
  const base = f.git('rev-parse', 'HEAD');
  await f.write('docs/phases/01-acme.md', valid.replace('planned', 'partial'));
  assert.equal(generate().status, 0);
  const cli = extra => run(process.execPath, ['scripts/check-records.mjs', '--records-only', '--policy', RECORD_POLICY, '--base', base, '--head', base, '--json', ...extra], { cwd: f.root });
  const passed = cli([]); assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  const report = JSON.parse(passed.stdout);
  assert.deepEqual(report.stages.map(s => s.id), ['references', 'reconciliation', 'roadmap', 'render', 'inbox', 'whitespace']);
  assert.match(report.stages[3].stdout, /Acme render executed/);
  assert.match(report.stages[4].stdout, /Acme inbox executed/);
  const workflow = await readFile(resolve('.github/workflows/check.yml'), 'utf8');
  const block = runBlocks(workflow).find(b => b.step === 'Run the configured gate');
  assert.ok(block);
  const ci = run('bash', ['-e', '-c', block.script], { cwd: f.root, env: { ...process.env, RECORD_BASE: base, RECORD_HEAD: base } });
  assert.equal(ci.status, 0, ci.stdout + ci.stderr);
  const ciReport = JSON.parse(ci.stdout);
  assert.equal(ciReport.inputDigest, report.inputDigest);
  assert.equal(ciReport.policy, report.policy);
  assert.deepEqual(ciReport.stages.map(s => s.id), report.stages.map(s => s.id));
  await f.write('docs/ROADMAP.md', 'stale\n');
  const stale = cli([]); assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.equal(JSON.parse(stale.stdout).stages.at(-1).id, 'roadmap');
  await f.write('lib/acme.mjs', '// changed executable\n');
  const code = cli([]); assert.equal(code.status, 3, code.stdout + code.stderr);
  assert.equal(JSON.parse(code.stdout).mode, 'full-gate');
});

test('mixed policy, goal, skill and configuration changes require the full gate', async t => {
  const f = await fixture(t);
  for (const path of ['lib/record-validation.mjs', 'scripts/check-records.mjs', 'docs/goals.json', '.agents/skills/acme/SKILL.md', '.github/workflows/check.yml']) {
    await f.write('docs/phases/01-acme.md', phase.replace('planned', 'partial'));
    await f.write(path, 'Acme changed policy\n');
    const result = await inspectFixture(f.input());
    assert.equal(result.mode, 'full-gate', path);
    assert.ok(result.reasons.some(reason => reason.includes(path)), JSON.stringify(result));
    await rm(join(f.root, path));
  }
});

test('real reconciliation rejects a newly changed draft reference whose fresh fact is merged', async t => {
  const f = await fixture(t);
  const historical = phase.replace('Check Acme.', 'Review the draft PR acme/private-ledger#12.');
  await f.write('docs/phases/01-acme.md', historical);
  await f.write('docs/phases/02-acme.md', historical.replace('acme/private-ledger#12', 'acme/other-private#20'));
  f.git('add', '.'); f.git('commit', '-qm', 'Acme prior draft references');
  const base = f.git('rev-parse', 'HEAD');
  await f.write('docs/phases/01-acme.md', historical.replace('acme/private-ledger#12', 'acme/private-ledger#14'));
  const result = await runRecordChecks({ ...f.input(), base }, { inspect: inspectFixture, execute: command => command === 'gh' ? {
    status: 0, stdout: JSON.stringify({ number: 14, state: 'closed', draft: false, merged_at: '2026-10-25T00:00:00Z', merge_commit_sha: 'c'.repeat(40), head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40), repo: { full_name: 'acme/private-ledger' } } }),
  } : { status: 0 } });
  assert.equal(result.status, 1, JSON.stringify(result));
  const stage = result.stages.find(s => s.id === 'reconciliation');
  assert.ok(stage.notes.some(n => n.rule === 'pr-state-contradiction' && n.source.pr === 'acme/private-ledger#14'));
  assert.ok(stage.unchangedGaps.some(g => g.path === 'acme/other-private#20'));
  assert.deepEqual(stage.requiredGaps, []);
  assert.equal(result.fullGatePassed, false);
});


test('managed source render preserves record policy while consumers keep their original gate', async () => {
  const path = '.github/workflows/check.yml';
  const template = await readFile(resolve('practices/ci/files', path), 'utf8');
  const source = JSON.parse(await readFile(resolve('.plates/plates.json'), 'utf8'));
  assert.equal(fill(template, source, path), await readFile(resolve(path), 'utf8'));
  const consumer = fill(template, { name: 'Acme', repo: 'acme/app', check: 'npm run acme-gate' }, path);
  assert.doesNotMatch(consumer, /check-records|RECORD_BASE|RECORD_HEAD/);
  assert.match(consumer, /npm run acme-gate/);
  assert.match(consumer, /node scripts\/plates\/gate.mjs --ci/);
});
