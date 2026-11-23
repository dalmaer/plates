// plates eject --dry-run (phase 206, increment 1): the plan, on a synthetic
// project ("Acme"), and the proof that it writes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { run as exec } from './helpers/run.mjs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { planEject, workflowSteps, scheduledJob, movedTo, plannedTexts } from '../lib/eject.mjs';

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'plates.mjs');

const CHECK = `name: check
on:
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      # The workflow lint the project chose to keep.
      - name: Lint workflows
        run: node scripts/plates/workflows.mjs --check
      # The configured gate: scripts/plates/gate.mjs --ci, else npm run check.
      - name: Run the configured gate
        run: |
          if [ -f scripts/plates/gate.mjs ]; then
            node scripts/plates/gate.mjs --ci
          elif [ -f scripts/plates/test-ledger.mjs ]; then
            node scripts/plates/test-ledger.mjs --gate
          else
            npm run check
          fi
      # The test ledger's record (scripts/plates/test-ledger.mjs).
      - name: Keep the test ledger
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: plates-test-runs
          path: .plates/test-runs/
          if-no-files-found: ignore
      - name: Reconcile records (optional)
        run: |
          if node -e 'const c=JSON.parse(require("fs").readFileSync(".plates/plates.json","utf8"));process.exit(c.practices.includes("reconciliation")?0:1)'; then
            node scripts/plates/reconcile.mjs --json
          fi
`;

const NIGHT = `# The night shift (plates practice \`night\`; managed).
#
# Each night: measure the practice (scripts/plates/improve.mjs), and drain the queue. More.
name: plates-night
on:
  schedule:
    - cron: "23 7 * * *"
jobs:
  night:
    runs-on: ubuntu-latest
    steps:
      - run: node scripts/plates/drain.mjs
`;

const PACKAGE = JSON.stringify({
  name: 'acme', private: true, type: 'module',
  scripts: {
    test: 'node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/*.test.mjs',
    roadmap: 'node scripts/roadmap.mjs',
    'roadmap:check': 'node scripts/roadmap.mjs --check',
    check: 'npm test && npm run roadmap:check',
  },
}, null, 2) + '\n';

const AGENTS = `# Acme

Acme sells anvils. Run \`npm run check\` before a PR.

<!-- plates:begin agents-md -->
plates's files are listed in \`.plates/lock.json\`.
<!-- plates:end agents-md -->

<!-- plates:begin night -->
The night shift runs scripts/plates/drain.mjs.
<!-- plates:end night -->
`;

const MANAGED = {
  'CLAUDE.md': ['agents-md', 'Read AGENTS.md.\n'],
  '.agents/skills/plates/SKILL.md': ['agents-md', '# plates\n'],
  'AGENTS.md#agents-md': ['agents-md'],
  'AGENTS.md#night': ['night'],
  '.github/workflows/plates-night.yml': ['night', NIGHT],
  'scripts/plates/workflows.mjs': ['ci', "import { main } from './lib.mjs';\nmain();\n"],
  'tests/plates-workflows.test.mjs': ['ci', "import '../scripts/plates/workflows.mjs';\n"],
  'scripts/plates/lib.mjs': ['night', "export { name } from './names.mjs';\nexport const main = () => {};\n"],
  'scripts/plates/names.mjs': ['night', "export const name = 'acme';\n"],
  'scripts/plates/names.d.mts': ['night', 'export const name: string;\n'],
  'scripts/plates/drain.mjs': ['night', "import { main } from './lib.mjs';\nmain();\n"],
  'scripts/plates/gate.mjs': ['night', "import './test-ledger.mjs';\n"],
  'scripts/plates/test-ledger.mjs': ['night', 'export default async function* () {}\n'],
  'scripts/plates/improve.mjs': ['night', "export const improve = () => '.plates/health';\n"],
  'scripts/roadmap.mjs': ['phases', 'console.log("roadmap");\n'],
  'docs/templates/phase.md': ['phases', '# Phase\n'],
};

async function acme({ extra = {}, lock: lockExtra = {}, links = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'plates-eject-'));
  const files = {
    '.plates/plates.json': JSON.stringify({ name: 'acme', repo: 'acme/anvils', practice: '0.9.0', practices: ['base', 'agents-md', 'phases', 'ci', 'night'], ejected: ['.github/workflows/check.yml'] }, null, 2),
    '.github/workflows/check.yml': CHECK,
    'package.json': PACKAGE,
    'AGENTS.md': AGENTS,
    'src/anvil.mjs': 'export const weight = 100;\n',
    ...Object.fromEntries(Object.entries(MANAGED).filter(([k, [, body]]) => !k.includes('#') && body !== undefined).map(([k, [, body]]) => [k, body])),
    ...extra,
  };
  const lock = { practice: '0.9.0', files: { ...Object.fromEntries(Object.entries(MANAGED).map(([k, [practice]]) => [k, { practice, sha256: 'x' }])), ...lockExtra } };
  files['.plates/lock.json'] = JSON.stringify(lock, null, 2);
  for (const [path, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    if (links[path]) await symlink(links[path], join(root, path));
    else await writeFile(join(root, path), body);
  }
  const g = (...args) => { const r = exec('git', args, { cwd: root }); if (r.status !== 0) throw new Error(r.stderr); };
  g('init', '-q'); g('config', 'user.email', 'acme@example.invalid'); g('config', 'user.name', 'Acme'); g('config', 'commit.gpgsign', 'false');
  g('add', '-A'); g('commit', '-q', '-m', 'acme');
  return root;
}

async function treeHash(root, dir = '') {
  const h = createHash('sha256');
  const walk = async rel => {
    for (const e of (await readdir(join(root, rel), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      h.update(`${p}\0`);
      if (e.isDirectory()) await walk(p);
      else h.update(await readFile(join(root, p)));
    }
  };
  await walk(dir);
  return h.digest('hex');
}

const fate = (plan, key) => plan.files.find(r => (r.block ? `${r.path}#${r.block}` : r.path) === key);
const run = (cwd, ...args) => exec(process.execPath, [BIN, ...args], { cwd });

test('the plan finds every managed file and every reference to plates', async t => {
  const root = await acme();
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(plan.wrote, false);
  for (const key of Object.keys(MANAGED)) {
    const row = fate(plan, key);
    assert.ok(row, `${key} has no row`);
    assert.ok(['keep', 'drop', 'rewrite', 'person'].includes(row.fate), `${key}: ${row.fate}`);
  }
  // By practice: night, phases and ci drop; agents-md stays; the plates skill drops.
  assert.equal(fate(plan, 'scripts/plates/drain.mjs').fate, 'drop');
  assert.equal(fate(plan, 'scripts/plates/improve.mjs').fate, 'drop');
  assert.equal(fate(plan, 'scripts/roadmap.mjs').fate, 'drop');
  assert.equal(fate(plan, 'tests/plates-workflows.test.mjs').fate, 'drop');
  assert.equal(fate(plan, 'AGENTS.md#night').fate, 'drop');
  assert.equal(fate(plan, 'AGENTS.md#agents-md').fate, 'keep');
  assert.equal(fate(plan, 'CLAUDE.md').fate, 'keep');
  assert.equal(fate(plan, '.agents/skills/plates/SKILL.md').fate, 'drop');
  assert.equal(fate(plan, '.plates/').fate, 'drop');
  // The ejected workflow and package.json are kept, with their references rewritten.
  assert.equal(fate(plan, '.github/workflows/check.yml').fate, 'rewrite');
  assert.equal(fate(plan, 'package.json').fate, 'rewrite');
  const refs = (path, kind) => plan.references.filter(r => r.path === path && (!kind || r.kind === kind));
  assert.match(refs('.github/workflows/check.yml', 'call')[0].rewrite, /scripts\/plates\/workflows\.mjs → scripts\/workflows\.mjs/);
  assert.match(refs('.github/workflows/check.yml', 'guarded-call')[0].rewrite, /plain branch: npm run check$/);
  const steps = refs('.github/workflows/check.yml', 'step').map(r => r.rewrite);
  assert.ok(steps.some(s => /^drop the step: it keeps \.plates\/test-runs\//.test(s)), steps.join('\n'));
  assert.ok(steps.some(s => /^drop the step: it runs only with the reconciliation practice/.test(s)), steps.join('\n'));
  assert.match(refs('package.json', 'reporter')[0].rewrite, /^"test": "node --test --test-reporter=spec --test-reporter-destination=stdout tests\/\*\.test\.mjs"/);
  assert.deepEqual(refs('package.json', 'npm-script').map(r => r.rewrite), [
    'remove "roadmap": it runs scripts/roadmap.mjs, which eject drops (phases)',
    'remove "roadmap:check": it runs scripts/roadmap.mjs, which eject drops (phases)',
    '"check": "npm test"',
  ]);
  // A comment naming a plates script needs a person; plates's own paragraph in the kept section goes with plates.
  assert.ok(refs('.github/workflows/check.yml', 'prose').some(r => r.needsPerson));
  assert.deepEqual(refs('AGENTS.md').map(r => [r.kind, r.rewrite]), [['plates-text', "drop plates's own paragraph from the kept agents-md section"]]);
  // The dropped night section is not swept: its scripts/plates/drain.mjs is not a dependency.
  assert.ok(!refs('AGENTS.md').some(r => r.targets.includes('scripts/plates/drain.mjs')));
  // The night shift's jobs, with what each does.
  assert.deepEqual(plan.jobs.map(j => [j.name, j.cron, j.fate]), [['plates-night', ['23 7 * * *'], 'drop']]);
  assert.equal(plan.jobs[0].summary, 'The night shift: Each night: measure the practice, and drain the queue.');
  assert.deepEqual(plan.refusals, []);
});

test("a kept workflow's plates script and its imports are kept, and moved out of scripts/plates/", async t => {
  const root = await acme();
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  for (const path of ['scripts/plates/workflows.mjs', 'scripts/plates/lib.mjs', 'scripts/plates/names.mjs']) {
    const row = fate(plan, path);
    assert.notEqual(row.fate, 'drop', `${path} is needed, yet dropped`);
    assert.equal(row.to, movedTo(path));
  }
  assert.deepEqual(fate(plan, 'scripts/plates/workflows.mjs').neededBy, ['.github/workflows/check.yml']);
  assert.match(fate(plan, 'scripts/plates/names.mjs').reason, /needed by scripts\/plates\/lib\.mjs/);
  assert.equal(fate(plan, 'scripts/plates/names.d.mts').fate, 'keep', 'the types of a kept module stay with it');
  // Guarded with a plain fallback: not a dependency.
  assert.equal(fate(plan, 'scripts/plates/gate.mjs').fate, 'drop');
  assert.equal(fate(plan, 'scripts/plates/test-ledger.mjs').fate, 'drop');
});

test('the dry run writes nothing', async t => {
  const root = await acme();
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = await treeHash(root);
  const r = run(root, 'eject', '--dry-run', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.dryRun, true);
  assert.ok(plan.files.length > Object.keys(MANAGED).length);
  const text = run(root, 'eject', '--dry-run');
  assert.equal(text.status, 0);
  assert.match(text.stdout, /Nothing was written\./);
  assert.match(text.stdout, /Night-shift jobs \(1\)/);
  assert.equal(await treeHash(root), before, 'the tree (and .git) changed');
  // Without --dry-run there is nothing to apply yet.
  const apply = run(root, 'eject');
  assert.equal(apply.status, 2);
  assert.equal(await treeHash(root), before);
});

test('a dirty tree is refused', async t => {
  const root = await acme();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'src/anvil.mjs'), 'export const weight = 200;\n');
  const r = run(root, 'eject', '--dry-run', '--json');
  assert.equal(r.status, 1);
  const plan = JSON.parse(r.stdout);
  assert.deepEqual(plan.refusals.map(x => x.code), ['uncommitted']);
  assert.match(plan.refusals[0].detail, /src\/anvil\.mjs/);
});

test('an unknown managed file and a missing plates script are refused', async t => {
  const extra = {
    'scripts/plates/stray.mjs': 'export {};\n',
    '.github/workflows/deploy.yml': 'name: deploy\non:\n  push:\njobs:\n  d:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/plates/promote.mjs\n',
  };
  const root = await acme({ extra });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const codes = plan.refusals.map(r => `${r.code} ${r.path}`).sort();
  assert.deepEqual(codes, ['missing-script scripts/plates/promote.mjs', 'unknown-managed scripts/plates/stray.mjs']);
  assert.equal(fate(plan, 'scripts/plates/stray.mjs').fate, 'person');
});

test('a lock entry of a practice plates does not know is refused', async t => {
  const root = await acme({ extra: { 'tools/odd.mjs': 'export {};\n' }, lock: { 'tools/odd.mjs': { practice: 'mystery', sha256: 'x' } } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.deepEqual(plan.refusals.map(r => r.code), ['unknown-managed']);
  assert.equal(fate(plan, 'tools/odd.mjs').fate, 'person');
});

test('workflow steps carry their leading comments; scheduled jobs are found', () => {
  const steps = workflowSteps(CHECK);
  assert.equal(steps.length, 5);
  assert.match(steps[1].lines[0], /# The workflow lint/);
  assert.match(steps[3].lines[0], /# The test ledger's record/);
  assert.equal(scheduledJob('check.yml', CHECK), null);
  const morning = 'name: plates-morning\non:\n  workflow_run:\n    workflows: [plates-night]\n    types: [completed]\n';
  assert.deepEqual(scheduledJob('m.yml', morning).after, ['plates-night']);
});

const ledgerStep = paths => `name: ledger
on:
  pull_request:
jobs:
  keep:
    runs-on: ubuntu-latest
    steps:
      - name: Keep runs
        uses: actions/upload-artifact@v7
        with:
          name: runs
          path: |
${paths.map(p => `            ${p}`).join('\n')}
          if-no-files-found: ignore
`;

test('an upload with .plates/ and other paths is a person\'s call; a block list of only .plates/ paths is dropped', async t => {
  const root = await acme({ extra: {
    '.github/workflows/mixed.yml': ledgerStep(['.plates/test-runs/', 'coverage/']),
    '.github/workflows/ours.yml': ledgerStep(['.plates/test-runs/', '.plates/climb/']),
  } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const mixed = plan.references.filter(r => r.path === '.github/workflows/mixed.yml');
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].rewrite, null);
  assert.match(mixed[0].needsPerson, /beside coverage\//);
  const ours = plan.references.filter(r => r.path === '.github/workflows/ours.yml');
  assert.deepEqual(ours.map(r => r.kind), ['step']);
  assert.match(ours[0].rewrite, /^drop the step: it keeps \.plates\/test-runs\/, \.plates\/climb\/ only/);
});

test('a negated practice guard is not dead code', async t => {
  const negated = CHECK.replace('process.exit(c.practices.includes("reconciliation")?0:1)', 'process.exit(!c.practices.includes("reconciliation")?0:1)');
  const root = await acme({ extra: { '.github/workflows/check.yml': negated } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === '.github/workflows/check.yml');
  assert.ok(!refs.some(r => r.kind === 'step' && /reconciliation/.test(r.rewrite ?? '')));
  assert.ok(!refs.some(r => r.kind === 'dead-block'));
  assert.ok(plan.refusals.some(r => r.code === 'missing-script' && r.path === 'scripts/plates/reconcile.mjs'));
});

test('a compound npm script calling a dropped file is a person\'s call, never removed whole', async t => {
  const pkg = JSON.parse(PACKAGE);
  pkg.scripts['roadmap:check'] = 'node scripts/roadmap.mjs --check && npm run lint';
  pkg.scripts.lint = 'echo lint';
  const root = await acme({ extra: { 'package.json': JSON.stringify(pkg, null, 2) + '\n' } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === 'package.json' && r.kind === 'npm-script');
  const compound = refs.find(r => r.text.startsWith('"roadmap:check"'));
  assert.equal(compound.rewrite, null);
  assert.match(compound.needsPerson, /compound command/);
  assert.ok(!refs.some(r => r.text.startsWith('"check"')), 'check keeps its npm run roadmap:check');
});

test('the dry run never refreshes the Git index', async t => {
  const root = await acme();
  t.after(() => rm(root, { recursive: true, force: true }));
  const later = new Date(Date.now() + 60_000);
  const { utimes } = await import('node:fs/promises');
  await utimes(join(root, 'src/anvil.mjs'), later, later);
  const before = await readFile(join(root, '.git/index'));
  await planEject({ root });
  assert.ok(before.equals(await readFile(join(root, '.git/index'))), '.git/index was rewritten');
});

test('a guide under docs/ is swept like a root AGENTS.md', async t => {
  const config = { name: 'acme', repo: 'acme/anvils', practice: '0.9.0', guide: 'docs/team.md', practices: ['base', 'agents-md', 'phases', 'ci', 'night'], ejected: ['.github/workflows/check.yml'] };
  const team = "# Acme team\n\n<!-- plates:begin agents-md -->\nplates's files are listed in `.plates/lock.json`.\n<!-- plates:end agents-md -->\n";
  const root = await acme({ extra: { '.plates/plates.json': JSON.stringify(config, null, 2), 'docs/team.md': team }, lock: { 'docs/team.md#agents-md': { practice: 'agents-md', sha256: 'x' } } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === 'docs/team.md');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].line, 4);
  assert.deepEqual(refs[0].targets, ['.plates/']);
});

// An Acme whose own check is real: a test, and a lint that runs a plates script the project keeps.
function ownCheck() {
  const pkg = JSON.parse(PACKAGE);
  pkg.scripts.lint = 'node scripts/plates/workflows.mjs --check';
  pkg.scripts.check = 'npm test && npm run lint && npm run roadmap:check';
  return {
    'package.json': JSON.stringify(pkg, null, 2) + '\n',
    'package-lock.json': JSON.stringify({ name: 'acme', lockfileVersion: 3, requires: true, packages: { '': { name: 'acme' } } }, null, 2) + '\n',
    'tests/anvil.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { weight } from '../src/anvil.mjs';\ntest('an anvil is heavy', () => assert.equal(weight, 100));\n",
    // The ejected gate, without a comment that only a person can reword.
    '.github/workflows/check.yml': CHECK.replace(/^ *# The configured gate.*\n/m, ''),
  };
}
const tracked = root => { const r = exec('git', ['ls-files', '-z'], { cwd: root }); return r.stdout.split('\0').filter(Boolean); };
const head = root => exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }).stdout.trim();

test("an ejected project's own check passes without plates", async t => {
  const root = await acme({ extra: ownCheck() });
  t.after(() => rm(root, { recursive: true, force: true }));
  const r = run(root, 'eject', '--apply', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.applied, true);
  assert.equal(out.branch, 'plates-eject');
  assert.deepEqual(out.check, { ran: true, passed: true });
  assert.deepEqual(out.needsPerson, []);
  assert.equal(head(root), 'plates-eject');
  assert.equal(exec('git', ['status', '--porcelain'], { cwd: root }).stdout, '', 'eject commits everything it changes');
  assert.equal(exec('git', ['rev-list', '--count', 'HEAD^..HEAD'], { cwd: root }).stdout.trim(), '1');
  for (const path of tracked(root)) {
    const text = await readFile(join(root, path), 'utf8');
    assert.ok(!/scripts\/plates\/|(^|[^\w/.-])\.plates\//m.test(text), `${path} still names plates:\n${text}`);
  }
  const files = tracked(root);
  for (const path of ['scripts/workflows.mjs', 'scripts/lib.mjs', 'scripts/names.mjs', 'scripts/names.d.mts', '.github/workflows/check.yml', 'AGENTS.md', 'CLAUDE.md']) assert.ok(files.includes(path), `${path} is gone`);
  for (const path of ['.plates/plates.json', '.plates/lock.json', 'scripts/plates/drain.mjs', 'scripts/roadmap.mjs', '.github/workflows/plates-night.yml', '.agents/skills/plates/SKILL.md']) assert.ok(!files.includes(path), `${path} stayed`);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.check, 'npm test && npm run lint');
  assert.equal(pkg.scripts.lint, 'node scripts/workflows.mjs --check');
  const check = await readFile(join(root, '.github/workflows/check.yml'), 'utf8');
  assert.match(check, /\n {10}npm run check\n/);
  assert.doesNotMatch(check, /Keep the test ledger|Reconcile records/);
  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.equal(agents, '# Acme\n\nAcme sells anvils. Run `npm run check` before a PR.\n\n');
});

test('apply refuses on any refusal, and on an existing branch, changing nothing', async t => {
  const root = await acme({ extra: { 'scripts/plates/stray.mjs': 'export {};\n' } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = await treeHash(root);
  const r = run(root, 'eject', '--apply', '--json');
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).applied, false);
  assert.equal(await treeHash(root), before);
  const clean = await acme();
  t.after(() => rm(clean, { recursive: true, force: true }));
  exec('git', ['branch', 'plates-eject'], { cwd: clean });
  const again = await treeHash(clean);
  const b = run(clean, 'eject', '--apply', '--json');
  assert.equal(b.status, 1);
  assert.match(JSON.parse(b.stdout).why, /plates-eject exists/);
  assert.equal(await treeHash(clean), again);
});

test('eject refuses to strand open phases', async t => {
  const phase = '---\nstatus: planned\n---\n# Anvils ship\n';
  const done = '---\nstatus: built\n---\n# Anvils exist\n';
  const root = await acme({ extra: { ...ownCheck(), 'docs/phases/1-anvils-ship.md': phase, 'docs/phases/0-anvils-exist.md': done } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.deepEqual(plan.refusals.map(r => r.code), ['open-phases']);
  assert.match(plan.refusals[0].detail, /docs\/phases\/1-anvils-ship\.md planned/);
  assert.doesNotMatch(plan.refusals[0].detail, /0-anvils-exist/);
  const before = await treeHash(root);
  assert.equal(run(root, 'eject', '--apply').status, 1);
  assert.equal(await treeHash(root), before, 'a refused apply changed something');
  assert.deepEqual((await planEject({ root, keepPhases: true })).refusals, []);
  const r = run(root, 'eject', '--apply', '--keep-phases', '--branch', 'leave-plates', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).branch, 'leave-plates');
  assert.ok(tracked(root).includes('docs/phases/1-anvils-ship.md'), 'the open phase stays as history');
  assert.match(exec('git', ['log', '-1', '--format=%B'], { cwd: root }).stdout, /Open phases stay in docs\/phases as history \(--keep-phases\): docs\/phases\/1-anvils-ship\.md/);
});

const withScripts = scripts => { const pkg = JSON.parse(PACKAGE); Object.assign(pkg.scripts, scripts); return JSON.stringify(pkg, null, 2) + '\n'; };

test('what a test script calls beside the plates reporter is still a dependency', async t => {
  const root = await acme({ extra: {
    'package.json': withScripts({ test: 'node --test --test-reporter=./scripts/plates/test-ledger.mjs tests/*.test.mjs && node scripts/plates/drain.mjs' }),
  } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === 'package.json' && r.text.startsWith('"test"'));
  assert.match(refs.find(r => r.kind === 'reporter').rewrite, /^"test": "node --test tests\/\*\.test\.mjs && node scripts\/plates\/drain\.mjs"/);
  assert.match(refs.find(r => r.kind === 'call').rewrite, /scripts\/plates\/drain\.mjs → scripts\/drain\.mjs/);
  assert.equal(fate(plan, 'scripts/plates/drain.mjs').fate, 'keep');
  assert.equal(fate(plan, 'scripts/plates/lib.mjs').fate, 'keep', 'and what it imports');
  // Applied, the rewritten script calls the moved file.
  const pkg = JSON.parse(plannedTexts(root, plan).get('package.json'));
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs && node scripts/drain.mjs');
});

test('a removed npm run takes its -- arguments with it, or is a person\'s call', async t => {
  const root = await acme({ extra: { 'package.json': withScripts({
    check: 'node src/anvil.mjs && npm run roadmap -- --check',
    verify: 'npm run roadmap -- --check || echo stale',
  }) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === 'package.json' && r.kind === 'npm-script');
  assert.equal(refs.find(r => r.text.startsWith('"check"')).rewrite, '"check": "node src/anvil.mjs"');
  const verify = refs.find(r => r.text.startsWith('"verify"'));
  assert.equal(verify.rewrite, null);
  assert.match(verify.needsPerson, /cannot be cut out safely/);
});

test('a bare plates call in a workflow or an npm script needs a person', async t => {
  const doctor = 'name: doctor\non:\n  push:\njobs:\n  d:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Doctor\n        run: plates doctor --json\n      - name: plates-free\n        run: echo plates-are-round\n';
  const root = await acme({ extra: { '.github/workflows/doctor.yml': doctor, 'package.json': withScripts({ status: 'npm test && plates status' }) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const cli = plan.references.filter(r => r.kind === 'cli').map(r => [r.path, r.line, r.targets[0]]);
  assert.deepEqual(cli.sort(), [['.github/workflows/doctor.yml', 9, 'plates doctor'], ['package.json', 10, 'plates status']]);
});

test('a relative .plates/ path in kept code needs a person', async t => {
  const root = await acme({ extra: { 'src/config.mjs': "export const url = new URL('../.plates/plates.json', import.meta.url);\n" } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === 'src/config.mjs');
  assert.deepEqual(refs.map(r => [r.kind, r.targets[0], Boolean(r.needsPerson)]), [['config', '.plates/', true]]);
});

test('workflow_run sources are read inline, as a block list, and after other keys', () => {
  assert.deepEqual(scheduledJob('m.yml', 'name: m\non:\n  workflow_run:\n    types: [completed]\n    workflows:\n      - acme-night\n      - "acme-climb"\n    branches: [main]\n').after, ['acme-night', 'acme-climb']);
  assert.deepEqual(scheduledJob('m.yml', 'name: m\non:\n  workflow_run:\n    types: [completed]\n    workflows: [acme-night, acme-tend]\n').after, ['acme-night', 'acme-tend']);
  assert.deepEqual(scheduledJob('m.yml', 'name: m\non:\n  workflow_run:\n    workflows: acme-night\n').after, ['acme-night']);
});

test('a kept file naming a removed npm script: a lone fenced command line goes, prose needs a person', async t => {
  const readme = '# Acme\n\nRun `npm run roadmap` to see the plan.\n\n```bash\nnpm run roadmap   # the plan\nnpm test\n```\n';
  const root = await acme({ extra: { 'README.md': readme } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === 'README.md').map(r => [r.line, r.kind, r.rewrite, Boolean(r.needsPerson)]);
  assert.deepEqual(refs, [
    [3, 'npm-run', null, true],
    [6, 'npm-run', 'delete the line: eject removes npm run roadmap', false],
  ]);
});

test('a kept module importing a moved plates file gets its specifier rewritten', async t => {
  const root = await acme({ extra: { 'scripts/check.mjs': "import { main } from './plates/lib.mjs';\nmain();\n" } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'scripts/plates/lib.mjs').to, 'scripts/lib.mjs');
  const refs = plan.references.filter(r => r.path === 'scripts/check.mjs');
  assert.deepEqual(refs.map(r => [r.kind, r.line, r.rewrite]), [['import', 1, "import './plates/lib.mjs' → './lib.mjs' (scripts/plates/lib.mjs → scripts/lib.mjs)"]]);
  assert.equal(plannedTexts(root, plan).get('scripts/check.mjs'), "import { main } from './lib.mjs';\nmain();\n");
  // Siblings that move together keep their specifiers.
  assert.ok(!plan.references.some(r => r.kind === 'import' && r.path.startsWith('scripts/plates/')));
});

test('a guide reached through an AGENTS.md alias is swept at its destination', async t => {
  const root = await acme({ extra: { 'docs/team.md': AGENTS, 'AGENTS.md': '' }, links: { 'AGENTS.md': 'docs/team.md' } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'docs/team.md#night').fate, 'drop');
  assert.equal(fate(plan, 'docs/team.md#agents-md').alias, 'AGENTS.md');
  const refs = plan.references.filter(r => r.path === 'docs/team.md');
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0].targets, ['.plates/']);
  assert.ok(!refs.some(r => r.targets.includes('scripts/plates/drain.mjs')), 'the dropped section is not swept');
});
