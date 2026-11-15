// .plates/lock.json: what plates wrote, so a later difference can be told apart
// from plates moving on (design §1; lesson 7, store a copy of a fact).
//
//   { "practice": "<version>",
//     "files": { "<path>" | "<path>#<block>": { "practice": "<name>", "sha256": "<hex>" } } }
//
// The sha is of the bytes plates wrote for that target: a managed file's whole
// text, a block's inside (blocks are hashed one by one, so a project's own lines
// around them never count), a symlink's target string. Seeded files are the
// project's and are never locked. Keys are sorted and nothing time-dependent is
// stored, so a render that changes nothing leaves the lock byte-identical.
import { guideDestination, guideBlock } from './guide.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, lstat, realpath, readlink, mkdir, open, rename, rm, symlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, relative, dirname, isAbsolute, sep } from 'node:path';

export const LOCK = '.plates/lock.json';

export const sha256 = text => createHash('sha256').update(text).digest('hex');
export const lockKey = e => e.block ? `${e.path}#${e.block}` : e.path;

/**
 * Drift of one target from the project's bytes now (null if absent), the sha
 * plates wrote, and plates's template today:
 *   clean   now = lock = template, or the project already took the template
 *   behind  now = lock ≠ template   plates moved on (update's job)
 *   edited  now ≠ lock = template   the project changed it
 *   both    now ≠ lock ≠ template
 */
export function driftState(now, locked, template) {
  const n = now === null || now === undefined ? null : sha256(now), t = sha256(template);
  if (n === locked) return locked === t ? 'clean' : 'behind';
  if (n === t) return 'clean';
  return locked === t ? 'edited' : 'both';
}

/** The project's lock, or null when it has none. */
export async function readLock(root) {
  const text = await readFile(join(root, LOCK), 'utf8').catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
  if (text === null) return null;
  const lock = JSON.parse(text);
  if (!lock || typeof lock.files !== 'object') throw new Error(`${LOCK}: needs "files"`);
  const files = {};
  for (const [key, row] of Object.entries(lock.files)) {
    const [path, block] = key.split('#');
    const canonical = guideBlock(key, row) ? `${guideDestination(root, path)}#${block}` : key;
    if (files[canonical] && (files[canonical].sha256 !== row.sha256 || files[canonical].practice !== row.practice)) throw new Error(`conflicting guide locks: ${canonical}`);
    files[canonical] = row;
  }
  return { ...lock, files };
}

export const formatLock = lock => {
  const files = Object.fromEntries(Object.keys(lock.files).sort().map(k => [k, { practice: lock.files[k].practice, sha256: lock.files[k].sha256 }]));
  return `${JSON.stringify({ practice: lock.practice, files }, null, 2)}\n`;
};

/** Write the lock if its bytes would change. Returns true when it wrote. */
export async function writeLock(root, lock, writer = null) {
  writer ??= await managedWriter(root);
  const text = formatLock(lock);
  const path = await writer.check(LOCK);
  if ((await readFile(path, 'utf8').catch(() => null)) === text) return false;
  await writer.write(LOCK, text);
  return true;
}

// Managed writes stay inside the checkout, including their lock and config:
// every ancestor and the target resolve inside it, never into .git, and file
// contents land through a no-follow temporary file and a rename.
const info = path => lstat(path).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));

export async function managedWriter(root) {
  const base = await realpath(root);
  const refuse = (path, reason) => { throw new Error(`${path}: ${reason}; managed writes must stay inside the checkout`); };
  function within(target, path) {
    const rel = relative(base, target);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) refuse(path, 'resolves outside the checkout');
    if (rel.split(sep).some(part => part.toLowerCase() === '.git')) refuse(path, "resolves inside the checkout's .git");
    return rel;
  }
  async function check(path, { link = false, guide = false } = {}) {
    const full = resolve(base, path), rel = within(full, path);
    if (!rel || isAbsolute(path)) refuse(path, 'is not a project-relative file path');
    let at = base;
    const parts = rel.split(sep);
    for (const [index, part] of parts.entries()) {
      at = join(at, part);
      within(at, path);
      const stat = await info(at), final = index === parts.length - 1;
      if (stat?.isSymbolicLink()) {
        // Doorways replace the link itself; guide aliases retain their target.
        if (final && link) continue;
        within(resolve(dirname(at), await readlink(at)), path);
        const physical = await realpath(at).catch(e => {
          if (e.code === 'ENOENT' || e.code === 'ELOOP') refuse(path, 'has an unresolved symlink');
          throw e;
        });
        within(physical, path);
        if (final && !guide) refuse(path, 'is a symlink, not a managed file');
        at = physical;
      }
    }
    return at;
  }
  async function write(path, content, options = {}) {
    const target = await check(path, options);
    await mkdir(dirname(target), { recursive: true });
    await check(relative(base, target), { link: options.link });
    const stat = await info(target);
    const temp = join(dirname(target), `.plates-${randomUUID()}.tmp`);
    let handle;
    try {
      if (options.link) await symlink(content, temp);
      else {
        handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, stat?.mode ?? 0o666);
        await handle.writeFile(content);
        if (stat) await handle.chmod(stat.mode & 0o777);
        await handle.close(); handle = null;
      }
      await check(relative(base, target), { link: options.link });
      await rename(temp, target);
    } finally {
      await handle?.close();
      await rm(temp, { force: true });
    }
  }
  return { check, write };
}
