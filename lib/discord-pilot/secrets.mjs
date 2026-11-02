import { constants, openSync, closeSync, fstatSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

// Reads only operator-mapped files. No environment fallback, keychain scan or personal auth import.
export function privateDirectory(path) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || realpathSync(path) !== path || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw new Error('private_directory_required');
  return path;
}
export function createSecretResolver({ directory, handles, enabled = false }) {
  const selected = structuredClone(handles);
  return async reference => {
    if (!enabled || !Object.hasOwn(selected, reference) || !/^[a-z][a-z0-9_.-]{2,79}$/.test(selected[reference])) throw new Error('secret_handle_denied');
    let fd;
    try {
      privateDirectory(directory);
      fd = openSync(join(directory, selected[reference]), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.nlink !== 1 || stat.size < 1 || stat.size > 8192) throw new Error();
      const value = readFileSync(fd, 'utf8').replace(/\r?\n$/, '');
      if (!value || value.length > 4096 || /[\s\x00-\x1f]/.test(value)) throw new Error();
      return value;
    } catch { throw new Error('secret_unavailable'); }
    finally { if (fd !== undefined) closeSync(fd); }
  };
}
