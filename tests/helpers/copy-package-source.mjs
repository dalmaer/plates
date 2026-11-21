// Source fixtures need npm's declared inputs plus explicit project records.
// Keep source symlinks and ignored templates: extracting a tarball would change
// the checkout-install contract and drop practice .gitignore inputs.
import { glob, cp, mkdir, readFile } from 'node:fs/promises';
import { join, dirname, relative, matchesGlob } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// The .plates/ files Git tracks, or null when the source is not a Git checkout.
// Anything else under .plates/ is a checkout's private state (feedback, the Unison map,
// Try it intents, test runs), and a fixture never copies it.
async function trackedPlates(source) {
  try {
    const { stdout } = await promisify(execFile)('git', ['-C', source, 'ls-files', '-z', '--', '.plates'], { maxBuffer: 1 << 24 });
    return new Set(stdout.split('\0').filter(Boolean));
  } catch { return null; }
}

export async function copyPackageSource(source, destination, extra = []) {
  const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  const included = pkg.files.filter(path => !path.startsWith('!'));
  const excluded = pkg.files.filter(path => path.startsWith('!')).map(path => path.slice(1).replace(/\/$/, ''));
  const tracked = await trackedPlates(source);
  const privateState = local => {
    if (!/^\.plates(?:\/|$)/.test(local)) return false;
    if (!tracked) return /^\.plates\/(?:test-runs|unison|try-it|feedback)(?:\/|$)/.test(local);
    return local !== '.plates' && !tracked.has(local) && ![...tracked].some(path => path.startsWith(local + '/'));
  };
  const paths = new Set(['package.json']);
  for await (const path of glob([...included, 'README*', 'LICENSE*', 'NOTICE', ...extra], { cwd: source })) paths.add(path);
  // Copy a directory once, instead of mkdir/cp for every tracked file.
  const roots = [...paths].sort().filter((path, _, all) => !all.some(parent => path !== parent && path.startsWith(parent + '/')));
  for (const path of roots) {
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await cp(join(source, path), join(destination, path), { recursive: true, verbatimSymlinks: true,
      filter: input => {
        const local = relative(source, input);
        return !excluded.some(pattern => local === pattern || local.startsWith(pattern + '/') || matchesGlob(local, pattern))
          && !privateState(local)
          && !/(?:^|\/)\.plates\/test-runs(?:\/|$)/.test(local);
      },
    });
  }
  return destination;
}
