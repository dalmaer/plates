// Source fixtures need npm's declared inputs plus explicit project records.
// Keep source symlinks and ignored templates: extracting a tarball would change
// the checkout-install contract and drop practice .gitignore inputs.
import { glob, cp, mkdir, readFile } from 'node:fs/promises';
import { join, dirname, relative, matchesGlob } from 'node:path';

export async function copyPackageSource(source, destination, extra = []) {
  const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  const included = pkg.files.filter(path => !path.startsWith('!'));
  const excluded = pkg.files.filter(path => path.startsWith('!')).map(path => path.slice(1).replace(/\/$/, ''));
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
          && !/(?:^|\/)\.plates\/test-runs(?:\/|$)/.test(local);
      },
    });
  }
  return destination;
}
