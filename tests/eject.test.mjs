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
import { planEject, workflowSteps, scheduledJob, movedTo, plannedTexts, resourcesOf, dedentTo, substituteOnce } from '../lib/eject.mjs';

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
  assert.match(refs('.github/workflows/check.yml', 'guarded-call')[0].rewrite, /plain branch, byte for byte:\n {10}npm run check$/);
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

test('a relative require() in a kept CommonJS module keeps, moves and rewrites the plates file', async t => {
  const root = await acme({
    extra: { 'scripts/check.cjs': "const helper = require('./plates/helper.cjs');\nhelper();\n", 'scripts/plates/helper.cjs': 'module.exports = () => {};\n' },
    lock: { 'scripts/plates/helper.cjs': { practice: 'night', sha256: 'x' } },
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'scripts/plates/helper.cjs').fate, 'keep');
  assert.equal(fate(plan, 'scripts/plates/helper.cjs').to, 'scripts/helper.cjs');
  assert.deepEqual(plan.references.filter(r => r.path === 'scripts/check.cjs').map(r => r.rewrite), ["import './plates/helper.cjs' → './helper.cjs' (scripts/plates/helper.cjs → scripts/helper.cjs)"]);
});

test('npm scripts are removed only for files that stay dropped after the dependency closure', async t => {
  const root = await acme({ extra: { 'scripts/use.mjs': "import '../scripts/roadmap.mjs';\n" } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'scripts/roadmap.mjs').fate, 'keep');
  assert.deepEqual(plan.references.filter(r => r.path === 'package.json' && r.kind === 'npm-script'), []);
  assert.deepEqual(plan.refusals, []);
});

const gateWith = (fallback, extra = '') => CHECK.replace('          else\n            npm run check\n          fi\n', `          else\n${fallback.map(l => `            ${l}`).join('\n')}\n          fi\n${extra}`);

test('a plain fallback keeps its lines: a comment never swallows the command', async t => {
  const root = await acme({ extra: { '.github/workflows/check.yml': gateWith(['# Run the project gate', 'printf acme-checked']) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const gate = plan.references.find(r => r.kind === 'guarded-call');
  assert.match(gate.rewrite, /byte for byte:\n {10}# Run the project gate\n {10}printf acme-checked$/);
  assert.doesNotMatch(gate.rewrite, /gate; printf/);
  // Applied, the step's run block still runs the project's command.
  const text = plannedTexts(root, plan).get('.github/workflows/check.yml');
  const step = workflowSteps(text).find(s => s.lines.some(l => /name: Run the configured gate/.test(l)));
  const at = step.lines.findIndex(l => /run: \|/.test(l));
  const script = step.lines.slice(at + 1).filter(l => l.trim()).map(l => l.trim()).join('\n');
  assert.equal(script, '# Run the project gate\nprintf acme-checked');
  const ran = exec('sh', ['-c', script]);
  assert.equal(ran.status, 0);
  assert.equal(ran.stdout, 'acme-checked');
});

test('a step with a live fallback and a dead block is kept, not dropped', async t => {
  const dead = `          if node -e 'const c=JSON.parse(require("fs").readFileSync(".plates/plates.json","utf8"));process.exit(c.practices.includes("reconciliation")?0:1)'; then\n            node scripts/plates/reconcile.mjs --json\n          fi\n`;
  const root = await acme({ extra: { '.github/workflows/check.yml': gateWith(['npm run check'], dead) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === '.github/workflows/check.yml' && r.text === 'Run the configured gate');
  assert.deepEqual(refs.map(r => r.kind).sort(), ['dead-block', 'guarded-call']);
  assert.deepEqual(plan.refusals, []);
  const text = plannedTexts(root, plan).get('.github/workflows/check.yml');
  assert.match(text, /- name: Run the configured gate\n {8}run: \|\n {10}npm run check\n/);
  assert.doesNotMatch(text, /reconcile\.mjs/);
});

test('a kept step or check script left with nothing to run is refused, never dropped silently', async t => {
  const root = await acme({ extra: { '.github/workflows/check.yml': gateWith(['# nothing else to do']) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.deepEqual(plan.refusals.map(r => r.code), ['empty-step']);
  assert.match(plan.refusals[0].detail, /step "Run the configured gate" would be left with no command/);
  const scripts = await acme({ extra: { 'package.json': withScripts({ check: 'npm run roadmap:check', test: 'node scripts/roadmap.mjs' }) } });
  t.after(() => rm(scripts, { recursive: true, force: true }));
  const second = await planEject({ root: scripts });
  assert.deepEqual(second.refusals.map(r => r.code).sort(), ['empty-script', 'empty-script']);
  assert.ok(second.refusals.some(r => /"check" would be left empty/.test(r.detail)));
  assert.ok(second.refusals.some(r => /"test" only runs scripts\/roadmap\.mjs/.test(r.detail)));
});

test('a kept line naming several managed files keeps every one', async t => {
  const flow = 'name: docs\non:\n  push:\njobs:\n  d:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/roadmap.mjs --check && cat docs/templates/phase.md\n      - run: node scripts/plates/drain.mjs && node scripts/roadmap.mjs\n';
  const root = await acme({ extra: { '.github/workflows/docs.yml': flow } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  for (const path of ['scripts/roadmap.mjs', 'docs/templates/phase.md', 'scripts/plates/drain.mjs']) assert.equal(fate(plan, path).fate, 'keep', path);
  assert.match(fate(plan, 'docs/templates/phase.md').reason, /needed by \.github\/workflows\/docs\.yml/);
  assert.match(fate(plan, 'scripts/roadmap.mjs').reason, /needed by \.github\/workflows\/docs\.yml/);
  // Kept, so its npm scripts stay too.
  assert.deepEqual(plan.references.filter(r => r.path === 'package.json' && r.kind === 'npm-script'), []);
});

test('a moved file that finds paths from its own location needs a person', async t => {
  const lib = "import { fileURLToPath } from 'node:url';\nexport { name } from './names.mjs';\nexport const root = fileURLToPath(new URL('../..', import.meta.url));\nexport const main = () => {};\n";
  const root = await acme({ extra: { 'scripts/plates/lib.mjs': lib } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'scripts/plates/lib.mjs').to, 'scripts/lib.mjs', 'the move stays planned');
  const flagged = plan.references.filter(r => r.kind === 'location');
  assert.deepEqual(flagged.map(r => r.path), ['scripts/plates/lib.mjs']);
  assert.match(flagged[0].needsPerson, /moving it to scripts\/lib\.mjs may change them/);
});

test('a kept symlink to a managed file keeps its target, and never dangles', async t => {
  const root = await acme({
    extra: { 'scripts/lint.mjs': '', 'tools/roadmap.mjs': '' },
    links: { 'scripts/lint.mjs': 'plates/workflows.mjs', 'tools/roadmap.mjs': '../scripts/roadmap.mjs' },
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'scripts/roadmap.mjs').fate, 'keep');
  assert.match(plan.references.find(r => r.kind === 'link' && r.path === 'tools/roadmap.mjs').needsPerson, /a symlink to scripts\/roadmap\.mjs/);
  // A link whose target would move is refused: the link would dangle.
  assert.deepEqual(plan.refusals.map(r => `${r.code} ${r.path}`), ['link-to-moved scripts/lint.mjs']);
});

test('a plain fallback is swept like any kept line: what it calls is kept, what it names is reported', async t => {
  const root = await acme({ extra: { '.github/workflows/check.yml': gateWith(['npm run roadmap', 'cat docs/templates/phase.md']) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'docs/templates/phase.md').fate, 'keep');
  const roadmap = plan.references.find(r => r.path === '.github/workflows/check.yml' && r.targets.includes('npm run roadmap'));
  assert.ok(roadmap?.needsPerson, 'npm run roadmap in the fallback needs a person');
});

test('the recheck reads every planned result against the final fates', async t => {
  const root = await acme({ extra: { 'package.json': withScripts({
    test: 'node --test --test-reporter=./scripts/plates/test-ledger.mjs tests/*.test.mjs && cat docs/templates/phase.md && npm run roadmap',
  }) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  // The reporter's rewrite still calls a dropped file: kept. It still runs a removed script: a person's call.
  assert.equal(fate(plan, 'docs/templates/phase.md').fate, 'keep');
  assert.match(fate(plan, 'docs/templates/phase.md').reason, /a planned rewrite calls it/);
  const again = plan.references.filter(r => r.kind === 'recheck');
  assert.deepEqual(again.map(r => [r.path, r.targets[0]]), [['package.json', 'npm run roadmap']]);
  // Read once: no second rewrite of "test" fights the reporter's.
  assert.equal(plan.references.filter(r => r.path === 'package.json' && r.text.startsWith('"test"') && r.rewrite).length, 1);
});

test('extensionless and directory requires resolve as Node resolves them', async t => {
  const root = await acme({
    extra: {
      'scripts/check.cjs': "const helper = require('./plates/helper');\nconst kit = require('./plates/kit');\nconst gone = require('./plates/missing');\n",
      'scripts/plates/helper.js': 'module.exports = () => {};\n',
      'scripts/plates/kit/index.js': 'module.exports = {};\n',
    },
    lock: { 'scripts/plates/helper.js': { practice: 'night', sha256: 'x' }, 'scripts/plates/kit/index.js': { practice: 'night', sha256: 'x' } },
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'scripts/plates/helper.js').to, 'scripts/helper.js');
  assert.equal(fate(plan, 'scripts/plates/kit/index.js').to, 'scripts/kit/index.js');
  const refs = plan.references.filter(r => r.path === 'scripts/check.cjs');
  assert.deepEqual(refs.filter(r => r.rewrite).map(r => r.rewrite).sort(), [
    "import './plates/helper' → './helper' (scripts/plates/helper.js → scripts/helper.js)",
    "import './plates/kit' → './kit' (scripts/plates/kit/index.js → scripts/kit/index.js)",
  ]);
  assert.match(refs.find(r => r.text === './plates/missing').needsPerson, /does not resolve/);
  // Applied: the resolved requires are rewritten, the unresolved one is left for a person.
  assert.equal(plannedTexts(root, plan).get('scripts/check.cjs'), "const helper = require('./helper');\nconst kit = require('./kit');\nconst gone = require('./plates/missing');\n");
});

test('removing the test reporter leaves every other byte of the script as it was', async t => {
  const root = await acme({ extra: { 'package.json': withScripts({ test: 'node --test --test-name-pattern="Acme  anvils" --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout tests/*.test.mjs' }) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const reporter = plan.references.find(r => r.kind === 'reporter');
  assert.equal(reporter.results[0].text, 'node --test --test-name-pattern="Acme  anvils" tests/*.test.mjs');
  assert.equal(JSON.parse(plannedTexts(root, plan).get('package.json')).scripts.test, 'node --test --test-name-pattern="Acme  anvils" tests/*.test.mjs');
});

test('a moved module reading a sibling resource keeps it, moves it alongside, and is flagged', async t => {
  const lib = "export { name } from './names.mjs';\nexport const defaults = new URL('./defaults.json', import.meta.url);\nexport const main = () => {};\n";
  const root = await acme({ extra: { 'scripts/plates/lib.mjs': lib, 'scripts/plates/defaults.json': '{}\n' }, lock: { 'scripts/plates/defaults.json': { practice: 'night', sha256: 'x' } } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'scripts/plates/defaults.json').fate, 'keep');
  assert.equal(fate(plan, 'scripts/plates/defaults.json').to, 'scripts/defaults.json');
  assert.deepEqual(plan.references.filter(r => r.kind === 'location').map(r => r.path), ['scripts/plates/lib.mjs']);
  assert.deepEqual(resourcesOf("const a = join(__dirname, 'data', 'x.json');\nconst b = new URL('https://acme.invalid/', import.meta.url);\n"), ['data/x.json']);
});

// A fallback whose output depends on its indentation: a heredoc with a nested, indented line and a blank one.
const HEREDOC = ["cat <<'ACME'", 'def check():', '    return "anvils"', '', 'ACME'];

test('a plain fallback keeps its relative indentation and blank lines byte for byte', async t => {
  const root = await acme({ extra: { '.github/workflows/check.yml': gateWith(HEREDOC) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const gate = plan.references.find(r => r.kind === 'guarded-call');
  assert.deepEqual(gate.lines, ["          cat <<'ACME'", '          def check():', '              return "anvils"', '            ', '          ACME'], 'a blank line stays as it was');
  assert.deepEqual(dedentTo(['\t\tx', '\t\t\ty'], '  '), ['  x', '  \ty']);
  // Applied, the step's run block (read as YAML reads a literal block) prints the heredoc with its indentation.
  const text = plannedTexts(root, plan).get('.github/workflows/check.yml');
  const step = workflowSteps(text).find(s => s.lines.some(l => /name: Run the configured gate/.test(l)));
  const block = step.lines.slice(step.lines.findIndex(l => /run: \|/.test(l)) + 1);
  const indent = block.find(l => l.trim()).match(/^ */)[0].length;
  const script = block.map(l => l.trim() ? l.slice(indent) : '').join('\n').replace(/\n+$/, '\n');
  const ran = exec('sh', ['-c', script]);
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(ran.stdout, 'def check():\n    return "anvils"\n\n');
});

test('a plain fallback that cannot be dedented safely needs a person', async t => {
  assert.equal(dedentTo(['  x', '\ty'], ''), null, 'tabs and spaces mixed');
  const root = await acme({ extra: { '.github/workflows/check.yml': gateWith(['printf one', '\tprintf two']) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const gate = plan.references.find(r => r.kind === 'guarded-call');
  assert.equal(gate.rewrite, null);
  assert.match(gate.needsPerson, /mixes tabs and spaces/);
  assert.deepEqual(plan.refusals, []);
});

test('a block whose if/else/fi line also runs a command is a person\'s, never deleted or rewritten', async t => {
  const deadWithTail = CHECK.replace(/^( *)fi\n$/m, '$1fi; printf acme-required\n');
  const fallbackWithTail = gateWith(['npm run check']).replace('          fi\n      # The test ledger', '          fi && printf acme-gated\n      # The test ledger');
  assert.notEqual(deadWithTail, CHECK);
  assert.match(fallbackWithTail, /fi && printf acme-gated/);
  for (const [file, kind] of [[deadWithTail, 'dead-block'], [fallbackWithTail, 'guarded-call']]) {
    const root = await acme({ extra: { '.github/workflows/check.yml': file } });
    t.after(() => rm(root, { recursive: true, force: true }));
    const plan = await planEject({ root });
    const refs = plan.references.filter(r => r.path === '.github/workflows/check.yml' && r.kind === kind);
    assert.equal(refs.length, 1, kind);
    assert.equal(refs[0].rewrite, null);
    assert.match(refs[0].needsPerson, /a command shares a line with if\/elif\/else\/fi/);
    if (kind === 'dead-block') assert.ok(!plan.references.some(r => r.kind === 'step' && /reconciliation/.test(r.rewrite ?? '')), 'the step is not dropped');
    assert.deepEqual(plan.refusals, []);
  }
});

test('an else/elif/then/fi line in a block that is not the bare keyword makes the block a person\'s', async t => {
  // `else printf …` is not a branch to the parser, so the dead block would swallow it: it must not be deleted.
  const withElse = CHECK.replace(/^( *)node scripts\/plates\/reconcile\.mjs --json\n/m, '$1node scripts/plates/reconcile.mjs --json\n$1else printf acme-required\n');
  assert.match(withElse, /else printf acme-required/);
  const root = await acme({ extra: { '.github/workflows/check.yml': withElse } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const dead = plan.references.filter(r => r.path === '.github/workflows/check.yml' && r.kind === 'dead-block');
  assert.equal(dead.length, 1);
  assert.equal(dead[0].rewrite, null);
  assert.ok(!plan.references.some(r => r.kind === 'step' && /reconciliation/.test(r.rewrite ?? '')), 'the step is not dropped');
});

test('an npm run inside quotes or $( ) is never cut out', async t => {
  const root = await acme({ extra: { 'package.json': withScripts({
    check: 'npm test && node -e \'console.log("acme && npm run roadmap && anvils")\' && npm run roadmap',
    verify: 'npm test && echo $(npm run roadmap)',
  }) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  for (const name of ['check', 'verify']) {
    const ref = plan.references.find(r => r.path === 'package.json' && r.kind === 'npm-script' && r.text.startsWith(`"${name}"`));
    assert.equal(ref.rewrite, null, name);
    assert.match(ref.needsPerson, /quotes or \$\(/);
  }
});

test('a reader that stays while the resource it reads moves needs a person on that line', async t => {
  const root = await acme({
    extra: { 'scripts/read.mjs': "export const defaults = new URL('./plates/defaults.json', import.meta.url);\n", 'scripts/plates/defaults.json': '{}\n' },
    lock: { 'scripts/plates/defaults.json': { practice: 'night', sha256: 'x' } },
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'scripts/plates/defaults.json').to, 'scripts/defaults.json');
  const refs = plan.references.filter(r => r.path === 'scripts/read.mjs' && r.kind === 'resource');
  assert.deepEqual(refs.map(r => r.line), [1]);
  assert.match(refs[0].needsPerson, /after eject it is at scripts\/defaults\.json/);
});

test('requires resolve in Node\'s own order; two candidates, or an extension Node would not add, need a person', async t => {
  const root = await acme({
    extra: {
      'scripts/check.cjs': "const conf = require('./plates/conf');\nconst only = require('./plates/only');\n",
      'scripts/plates/conf.js': 'module.exports = 1;\n', 'scripts/plates/conf.json': '{}\n', 'scripts/plates/only.cjs': 'module.exports = 2;\n',
    },
    lock: Object.fromEntries(['scripts/plates/conf.js', 'scripts/plates/conf.json', 'scripts/plates/only.cjs'].map(p => [p, { practice: 'night', sha256: 'x' }])),
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === 'scripts/check.cjs');
  assert.ok(refs.every(r => r.rewrite === null), 'nothing is rewritten');
  assert.match(refs.find(r => r.text === './plates/conf').needsPerson, /could be scripts\/plates\/conf\.js or scripts\/plates\/conf\.json/);
  assert.match(refs.find(r => r.text === './plates/only').needsPerson, /does not resolve/);
});

test('the plates reporter goes only beside its own destination; any other order is a person\'s', async t => {
  const grouped = 'node --test --test-reporter=spec --test-reporter=./scripts/plates/test-ledger.mjs --test-reporter-destination=stdout --test-reporter-destination=stdout tests/*.test.mjs';
  const root = await acme({ extra: { 'package.json': withScripts({ test: grouped }) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === 'package.json' && r.text.startsWith('"test"'));
  assert.deepEqual(refs.map(r => [r.kind, r.rewrite]), [['reporter', null]]);
  assert.match(refs[0].needsPerson, /not followed by its own --test-reporter-destination/);
});

test('a path in both the lock and "ejected" is one row, the ejected one', async t => {
  const root = await acme({ lock: { '.github/workflows/check.yml': { practice: 'ci', sha256: 'x' } } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const rows = plan.files.filter(r => r.path === '.github/workflows/check.yml');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'ejected');
  assert.equal(rows[0].fate, 'rewrite');
});

test('a dynamic import() is never a hard dependency: no keep, no refusal, a person checks the guard', async t => {
  const root = await acme({ extra: { 'scripts/run.mjs': "if (process.env.ACME) await import('./plates/drain.mjs');\nif (process.env.CLIMB) await import('./plates/climb.mjs');\n" } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'scripts/plates/drain.mjs').fate, 'drop');
  assert.deepEqual(plan.refusals, []);
  const refs = plan.references.filter(r => r.path === 'scripts/run.mjs');
  assert.deepEqual(refs.map(r => r.text).sort(), ['./plates/climb.mjs', './plates/drain.mjs']);
  assert.ok(refs.every(r => /on demand \(import\(\)\)/.test(r.needsPerson)));
});

test('--drop-night drops every plates workflow, whatever names it, and what only it reaches', async t => {
  const flow = 'name: audit\non:\n  push:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: grep -c cron .github/workflows/plates-night.yml\n';
  const root = await acme({ extra: { '.github/workflows/audit.yml': flow } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const kept = await planEject({ root });
  assert.notEqual(fate(kept, '.github/workflows/plates-night.yml').fate, 'drop', 'without the flag, a kept file that names it keeps it');
  assert.notEqual(fate(kept, 'scripts/plates/drain.mjs').fate, 'drop', 'and what it calls');
  const plan = await planEject({ root, dropNight: true });
  assert.equal(plan.dropNight, true);
  assert.equal(fate(plan, '.github/workflows/plates-night.yml').fate, 'drop');
  assert.equal(fate(plan, 'scripts/plates/drain.mjs').fate, 'drop');
  const night = plan.references.find(r => r.kind === 'night');
  assert.equal(night.path, '.github/workflows/audit.yml');
  assert.match(night.needsPerson, /--drop-night drops/);
  assert.deepEqual(plan.refusals, []);
});

// The ci practice's check.yml as plates renders it: plates's self-install, the guarded gate, the ledger.
const CI_CHECK = `name: check
on:
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Install source test tooling
        run: |
          SELF=$(node -e 'const c=JSON.parse(require("fs").readFileSync(".plates/plates.json","utf8"));console.log(c.plates === "self" ? "true" : "false")')
          if [ "$SELF" = true ]; then
            npm ci --ignore-scripts
          fi
      - name: Run the configured gate
        run: |
          if [ -f scripts/plates/gate.mjs ]; then
            node scripts/plates/gate.mjs --ci
          elif [ -f scripts/plates/test-ledger.mjs ]; then
            node scripts/plates/test-ledger.mjs --gate
          else
            npm run check
          fi
`;
const managedCi = extra => ({
  extra: { '.plates/plates.json': JSON.stringify({ name: 'acme', repo: 'acme/anvils', practice: '0.9.0', practices: ['base', 'agents-md', 'phases', 'ci', 'night'] }, null, 2), '.github/workflows/check.yml': CI_CHECK, 'package-lock.json': '{}\n', ...extra },
  lock: { '.github/workflows/check.yml': { practice: 'ci', sha256: 'x' } },
});

test("the ci practice's check.yml is always kept as the project's pull-request CI, rewritten to install and npm run check", async t => {
  const root = await acme(managedCi());
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, '.github/workflows/check.yml').fate, 'rewrite');
  const refs = plan.references.filter(r => r.path === '.github/workflows/check.yml');
  assert.deepEqual(refs.filter(r => r.rewrite).map(r => r.kind).sort(), ['guarded-call', 'install']);
  assert.deepEqual(refs.find(r => r.kind === 'install').lines, ['          npm ci']);
  assert.ok(!refs.some(r => r.needsPerson), refs.filter(r => r.needsPerson).map(r => r.needsPerson).join('\n'));
  // Even beside another workflow that runs the check on pull requests, check.yml is kept: two PR checks are harmless.
  const other = await acme(managedCi({ '.github/workflows/test.yml': 'name: test\non:\n  pull_request:\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run check\n' }));
  t.after(() => rm(other, { recursive: true, force: true }));
  assert.equal(fate(await planEject({ root: other }), '.github/workflows/check.yml').fate, 'rewrite');
  // Applied: install, then the project's own check, and nothing of plates.
  const applied = plannedTexts(root, plan).get('.github/workflows/check.yml');
  assert.match(applied, /- name: Install source test tooling\n {8}run: \|\n {10}npm ci\n {6}- name: Run the configured gate\n {8}run: \|\n {10}npm run check\n$/);
  assert.doesNotMatch(applied, /plates/);
});

test('a require of a package directory needs a person, and keeps everything in it', async t => {
  const root = await acme({
    extra: { 'scripts/check.cjs': "const kit = require('./plates/kit');\n", 'scripts/plates/kit/package.json': '{"main":"main.js"}\n', 'scripts/plates/kit/main.js': 'module.exports = 1;\n', 'scripts/plates/kit/index.js': 'module.exports = 2;\n' },
    lock: Object.fromEntries(['scripts/plates/kit/package.json', 'scripts/plates/kit/main.js', 'scripts/plates/kit/index.js'].map(p => [p, { practice: 'night', sha256: 'x' }])),
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  for (const p of ['scripts/plates/kit/package.json', 'scripts/plates/kit/main.js', 'scripts/plates/kit/index.js']) assert.notEqual(fate(plan, p).fate, 'drop', p);
  const refs = plan.references.filter(r => r.path === 'scripts/check.cjs');
  assert.deepEqual(refs.map(r => [r.kind, r.rewrite]), [['import', null]]);
  assert.match(refs[0].needsPerson, /package directory scripts\/plates\/kit/);
});

test('the self-install step becomes npm ci only when it is nothing but the install conditional', async t => {
  const more = CI_CHECK.replace('            npm ci --ignore-scripts\n          fi\n', '            npm ci --ignore-scripts\n          fi\n          node src/generate.mjs\n');
  assert.match(more, /fi\n {10}node src\/generate\.mjs\n/);
  const root = await acme(managedCi({ '.github/workflows/check.yml': more }));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const install = plan.references.find(r => r.path === '.github/workflows/check.yml' && r.kind === 'install');
  assert.equal(install.rewrite, null);
  assert.match(install.needsPerson, /other commands in the step/);
  assert.equal(install.lines, undefined, 'the body is left as it is');
});

test('a kept workflow calling the test ledger --gate runs npm run check instead', async t => {
  const pages = 'name: pages\non:\n  push:\njobs:\n  p:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Gate\n        run: node scripts/plates/test-ledger.mjs --gate\n';
  const root = await acme({ extra: { '.github/workflows/pages.yml': pages } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const gate = plan.references.find(r => r.path === '.github/workflows/pages.yml' && r.kind === 'gate');
  assert.deepEqual(gate.lines, ['        run: npm run check']);
  assert.equal(fate(plan, 'scripts/plates/test-ledger.mjs').fate, 'drop');
  assert.deepEqual(plan.refusals, []);
  assert.match(plannedTexts(root, plan).get('.github/workflows/pages.yml'), /- name: Gate\n {8}run: npm run check\n$/);
});

test('a path in both the lock and "ejected" applies cleanly', async t => {
  const root = await acme({ extra: ownCheck(), lock: { '.github/workflows/check.yml': { practice: 'ci', sha256: 'x' } } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const r = run(root, 'eject', '--apply', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.check, { ran: true, passed: true });
  assert.ok(tracked(root).includes('.github/workflows/check.yml'));
});

test('no root lockfile: the clean check is skipped and said so; --check-cmd runs the owner\'s command; --drop-night applies', async t => {
  const root = await acme({ extra: { 'tests/anvil.test.mjs': "import { test } from 'node:test';\ntest('an anvil', () => {});\n" } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const skipped = run(root, 'eject', '--apply', '--json');
  assert.equal(skipped.status, 0, skipped.stdout + skipped.stderr);
  assert.deepEqual(JSON.parse(skipped.stdout).check, { ran: false, skipped: 'clean check skipped: no root lockfile; run with --check-cmd' });
  const other = await acme();
  t.after(() => rm(other, { recursive: true, force: true }));
  const owned = run(other, 'eject', '--apply', '--drop-night', '--branch', 'leave', '--check-cmd', 'test -f package.json && test ! -e .plates', '--json');
  assert.equal(owned.status, 0, owned.stdout + owned.stderr);
  const out = JSON.parse(owned.stdout);
  assert.equal(out.check.passed, true);
  assert.equal(out.check.checkCmd, 'test -f package.json && test ! -e .plates');
  assert.ok(!tracked(other).includes('.github/workflows/plates-night.yml'));
  const failing = await acme();
  t.after(() => rm(failing, { recursive: true, force: true }));
  const bad = run(failing, 'eject', '--apply', '--check-cmd', 'exit 3', '--json');
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).check.step, '--check-cmd exit 3');
  assert.equal(run(failing, 'eject', '--dry-run', '--check-cmd', 'true').status, 2, '--check-cmd goes with --apply');
});

const configWith = more => JSON.stringify({ name: 'acme', repo: 'acme/anvils', practice: '0.9.0', practices: ['base', 'agents-md', 'phases', 'ci', 'night'], ejected: ['.github/workflows/check.yml'], ...more }, null, 2);

test('an ejected section on a guide alias is one row at the destination, and its text stays', async t => {
  const root = await acme({ extra: { 'docs/team.md': AGENTS, 'AGENTS.md': '', '.plates/plates.json': configWith({ ejected: ['.github/workflows/check.yml', 'AGENTS.md#night'] }) }, links: { 'AGENTS.md': 'docs/team.md' } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const rows = plan.files.filter(r => r.block === 'night');
  assert.deepEqual(rows.map(r => [r.path, r.kind, r.fate]), [['docs/team.md', 'ejected', 'keep']]);
  assert.match(plannedTexts(root, plan).get('docs/team.md'), /The night shift runs scripts\/plates\/drain\.mjs\./);
});

test("an ejected section's paragraphs are never deleted; their plates references need a person", async t => {
  const root = await acme({ extra: { '.plates/plates.json': configWith({ ejected: ['.github/workflows/check.yml', 'AGENTS.md#agents-md'] }) } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === 'AGENTS.md');
  assert.ok(!refs.some(r => r.kind === 'plates-text'), 'no paragraph deletion in an ejected section');
  assert.ok(refs.some(r => r.line === 6 && /\.plates\//.test(r.needsPerson ?? '')));
  assert.match(plannedTexts(root, plan).get('AGENTS.md'), /plates's files are listed in `\.plates\/lock\.json`\./);
});

test('same-line rewrites apply once, by span, never to each other\'s results', () => {
  const line = "import a from './plates/a.mjs'; import b from './a.mjs';";
  assert.equal(substituteOnce(line, [["'./plates/a.mjs'", "'./a.mjs'"], ["'./a.mjs'", "'../a.mjs'"]]), "import a from './a.mjs'; import b from '../a.mjs';");
});

test('open phases are found with CRLF front matter and in the projects shape', async t => {
  const crlf = await acme({ extra: { 'docs/phases/1-anvils.md': '---\r\nstatus: planned\r\n---\r\n# Anvils\r\n' } });
  t.after(() => rm(crlf, { recursive: true, force: true }));
  assert.deepEqual((await planEject({ root: crlf })).refusals.map(r => r.code), ['open-phases']);
  const projects = await acme({ extra: {
    '.plates/plates.json': configWith({ phases: { shape: 'projects' } }),
    'docs/projects/forge/phases.md': '# Forge\n\n## 1. Anvils ship\n\n**Status: NOT STARTED**\n\n## 2. Anvils exist\n\n**Status: CLOSED**\n',
  } });
  t.after(() => rm(projects, { recursive: true, force: true }));
  const plan = await planEject({ root: projects });
  assert.deepEqual(plan.openPhases, [{ file: 'docs/projects/forge/phases.md#1', status: 'planned' }]);
  assert.deepEqual(plan.refusals.map(r => r.code), ['open-phases']);
});

test('a step whose only commands are two dead blocks is one deletion of the whole step', async t => {
  const guard = p => `          if node -e 'const c=JSON.parse(require("fs").readFileSync(".plates/plates.json","utf8"));process.exit(c.practices.includes("${p}")?0:1)'; then\n            node scripts/plates/${p}.mjs\n          fi\n`;
  const flow = `name: extras\non:\n  push:\njobs:\n  e:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v7\n      - name: Optional records\n        run: |\n${guard('reconciliation')}${guard('climb')}      - run: npm run check\n`;
  const root = await acme({ extra: { '.github/workflows/extras.yml': flow } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  const refs = plan.references.filter(r => r.path === '.github/workflows/extras.yml' && r.edit);
  assert.deepEqual(refs.map(r => r.kind), ['step']);
  const text = plannedTexts(root, plan).get('.github/workflows/extras.yml');
  assert.doesNotMatch(text, /Optional records|scripts\/plates/);
  assert.match(text, /- run: npm run check\n$/);
});

test('a kept file moves onto a path the plan drops', async t => {
  const root = await acme({ extra: { ...ownCheck(), 'scripts/lib.mjs': 'export const old = 1;\n' }, lock: { 'scripts/lib.mjs': { practice: 'night', sha256: 'x' } } });
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await planEject({ root });
  assert.equal(fate(plan, 'scripts/plates/lib.mjs').to, 'scripts/lib.mjs');
  const r = run(root, 'eject', '--apply', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(await readFile(join(root, 'scripts/lib.mjs'), 'utf8'), /export const main/);
});

test('a failed apply from a detached HEAD goes back to that detached commit', async t => {
  const root = await acme();
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = exec('git', ['rev-parse', 'HEAD'], { cwd: root }).stdout.trim();
  exec('git', ['switch', '-q', '--detach', base], { cwd: root });
  // A commit hook that refuses makes the apply fail after it has changed files.
  await writeFile(join(root, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const r = run(root, 'eject', '--apply', '--json');
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).error, /eject stopped and undid itself/);
  assert.equal(head(root), 'HEAD', 'still detached');
  assert.equal(exec('git', ['rev-parse', 'HEAD'], { cwd: root }).stdout.trim(), base);
  assert.equal(exec('git', ['branch', '--list', 'plates-eject'], { cwd: root }).stdout.trim(), '');
  assert.equal(exec('git', ['status', '--porcelain'], { cwd: root }).stdout, '');
});
