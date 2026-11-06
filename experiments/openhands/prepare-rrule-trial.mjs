// Preparation only. This program cannot launch an agent or access a provider.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const BASELINE = '037e13b4f78c061405cef899b528badb536584ad';
const MODEL_BLOB = '831fff6973aaf1001725407fde341f964c90e1c4';
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), value = flag => args[args.indexOf(flag) + 1];
if (!args.includes('--output') || args.some((a, i) => i % 2 === 0 && !['--output', '--repo'].includes(a))) throw new Error('Usage: node prepare-real-trial.mjs --output NEW_DIRECTORY [--repo LOCAL_PLATES_CHECKOUT]');
const root = resolve(value('--output')), repo = realpathSync(resolve(args.includes('--repo') ? value('--repo') : join(HERE, '../..')));
const git = (...gitArgs) => {
  const r = spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', repo, ...gitArgs], { encoding: 'utf8', env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' }, timeout: 60000 });
  if (r.error || r.status !== 0) throw new Error(`git ${gitArgs[0]} failed: ${r.error?.message ?? r.stderr}`);
  return r.stdout.trim();
};
if (git('rev-parse', `${BASELINE}^{commit}`) !== BASELINE || git('rev-parse', `${BASELINE}:lib/routines/model.mjs`) !== MODEL_BLOB) throw new Error('frozen baseline unavailable or changed');
mkdirSync(root); // Refuse any existing destination rather than removing user data.
const manifest = { version: 1, status: 'preparation-in-progress', createdAt: new Date().toISOString(), baseline: BASELINE, targetBlob: MODEL_BLOB, backend: 'OpenHands SDK 1.59.0', taskSelection: 'candidate-awaiting-parent-reconciliation', modelAccess: 'not-configured-or-invoked', account: null, budget: null, runs: [], oracleSha256: createHash('sha256').update(readFileSync(join(HERE, 'real-trial-check.mjs'))).digest('hex') };
const save = () => writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
save();
for (const [name, task, lessonMode] of [['primary', 'primary', 'capture'], ['followup-control', 'followup', 'none'], ['followup-lesson', 'followup', 'reviewed-exact-digest']]) {
  const worktree = join(root, name);
  git('worktree', 'add', '--detach', worktree, BASELINE);
  const result = spawnSync(process.execPath, [join(HERE, 'real-trial-check.mjs'), worktree, task], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' }, timeout: 10000 });
  if (result.error || ![0, 1].includes(result.status)) throw new Error(`oracle failed to run: ${result.error?.message ?? result.stderr}`);
  const before = JSON.parse(result.stdout);
  if (before.pass || result.status !== 1) throw new Error('candidate is already fixed; choose a new real task instead of seeding a defect');
  const request = task === 'primary' ? 'Correct the routine metadata validator so an RRULE cannot contain both COUNT and UNTIL. Preserve each valid alternative. Add focused regression tests and explain evidence. Do not implement recurrence expansion or change schedulers.' : 'Audit recurrence scalar multiplicity in the routine metadata validator. Correct invalid repeated scalar values while preserving legitimate list-valued BY fields. Add focused tests and explain evidence. Do not implement recurrence expansion or change schedulers.';
  const record = { name, task, worktree, lessonMode, before, request, status: 'prepared-not-launched', allowedChanges: ['lib/routines/model.mjs', 'tests/routine-model.test.mjs', 'tests/routine-sources.test.mjs'], requiredChecks: ['node --import ./tests/helpers/hermetic.mjs --test tests/routine-model.test.mjs tests/routine-sources.test.mjs'], independentReview: 'required after agent patch; reviewer does not change patch', noRemoteWrites: true };
  manifest.runs.push(record); save();
  // Task prompt stays outside the baseline worktree until the parent selects the task.
  writeFileSync(join(root, `${name}-request.md`), `# Candidate ${name}\n\n${request}\n\nScope: ${record.allowedChanges.join(', ')}.\nNo network, publication, credentials, grants, global settings or edits outside this worktree.\n`);
}
manifest.status = 'prepared-not-launched'; save();
console.log(JSON.stringify({ manifest: join(root, 'manifest.json'), status: manifest.status, baseline: BASELINE, worktrees: manifest.runs.map(r => r.worktree), modelCalls: 0 }, null, 2));
