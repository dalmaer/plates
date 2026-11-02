import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';

// Only the worker's own private home is writable. Never follow an existing link.
export function prepareRuntimeHome(home, runtime, uid = process.getuid()) {
  if (!['codex', 'claude'].includes(runtime) || !isAbsolute(home) || normalize(home) !== home) throw new Error('worker_home_scope');
  function privateDirectory(path) {
    const s = lstatSync(path);
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== uid || (s.mode & 0o077) || realpathSync(path) !== path) throw new Error('worker_home_permissions');
  }
  privateDirectory(home);
  const directory = join(home, runtime === 'codex' ? '.codex' : '.claude');
  try { mkdirSync(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw new Error('worker_home_create'); }
  privateDirectory(directory);
  return directory;
}
