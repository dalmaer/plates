// Local output stays out of the checkout (docs/guide/local-output.md): the root .gitignore catches the folder names
// that keep turning up inside .plates/, and never hides a .plates/ file plates tracks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stateDir } from '../lib/not-now.mjs';
import { run } from './helpers/run.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const git = args => run('git', args, { cwd: ROOT });
/** The paths git would ignore, read against the .gitignore rules alone (--no-index: tracked or not). */
const ignored = paths => {
  const out = run('git', ['check-ignore', '--no-index', '--stdin', '-z'], { cwd: ROOT, input: paths.join('\0') });
  assert.ok([0, 1].includes(out.status), out.stderr);
  return new Set(out.stdout.split('\0').filter(Boolean));
};

test('local output: the stray folders inside .plates/ are ignored, wherever their files sit', () => {
  const stray = [
    '.plates/morning-reports/2026-11-08.json',
    '.plates/morning-reports/2026-11-08-email.html',
    '.plates/production-diagnostics/2026-11-06/acme.md',
    '.plates/loop-reports/editions/one.json',
    '.plates/run-logs/acme.log',
  ];
  const hit = ignored(stray);
  for (const p of stray) assert.ok(hit.has(p), `${p} is not ignored`);
});

test('local output: no file plates tracks under .plates/ is hidden, and a file merely named like a folder is not', () => {
  const tracked = git(['ls-files', '-z', '--', '.plates']).stdout.split('\0').filter(Boolean);
  assert.ok(tracked.includes('.plates/plates.json') && tracked.includes('.plates/lock.json'), 'the tracked .plates/ files are listed');
  const kept = [...tracked, '.plates/plates.json', '.plates/lock.json', '.plates/climb.json', '.plates/name-transition/label-renames.json',
    '.plates/morning-reports.json', '.plates/run-logs', 'docs/morning-reports/a.md', 'web/.plates/morning-reports.md'];
  const hit = ignored(kept);
  assert.deepEqual(kept.filter(p => hit.has(p)), [], 'tracked or ordinary files stay visible');
});

test('local output: the guide, the agent guide and the README name one home, the plates state directory', async () => {
  const guide = await readFile(new URL('../docs/guide/local-output.md', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const rule = '$XDG_STATE_HOME/plates/<kind>/<owner>/<repo>/';
  assert.ok(guide.includes(rule) && agents.includes(rule), 'the rule is written the same way in both');
  assert.ok(agents.includes('docs/guide/local-output.md') && readme.includes('docs/guide/local-output.md'), 'both link the guide');
  // The rule's root is the one plates already uses for per-user state.
  assert.equal(stateDir({ XDG_STATE_HOME: '/acme/state', HOME: '/home/acme' }), '/acme/state/plates');
  assert.equal(stateDir({ HOME: '/home/acme' }), '/home/acme/.local/state/plates');
  assert.ok(guide.includes('~/.local/state') && guide.includes('stateDir'));
});
