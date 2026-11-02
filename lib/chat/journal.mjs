// Append-only JSON-lines journal: the durable store under the chat seam's directory.
// Every append is fsynced before the caller acts on it. A torn final line (a crash
// mid-write, no trailing newline) was never acknowledged, so it is cut on read;
// damage anywhere else is refused.
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, truncateSync, writeSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 16 * 1024 * 1024;

export class ChatStoreError extends Error {}

export function openJournal(dir, name) {
  if (typeof dir !== 'string' || !dir) throw new ChatStoreError('The chat store needs a directory.');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dirInfo = lstatSync(dir);
  if (!dirInfo.isDirectory()) throw new ChatStoreError('The chat store must be a directory, not a link.');
  const file = join(dir, name);
  return {
    file,
    read() {
      let info;
      try { info = lstatSync(file); } catch (e) { if (/** @type {any} */ (e).code === 'ENOENT') return []; throw e; }
      if (!info.isFile() || info.nlink !== 1) throw new ChatStoreError(`${name} must be a regular file without links.`);
      if (info.size > MAX_BYTES) throw new ChatStoreError(`${name} exceeds the size limit.`);
      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      const torn = !text.endsWith('\n') ? lines.pop() : (lines.pop(), undefined);
      const records = lines.map((line, i) => {
        try { return JSON.parse(line); } catch { throw new ChatStoreError(`${name} line ${i + 1} is damaged; refusing to guess.`); }
      });
      if (torn) {
        // A torn final write was never acknowledged: drop it from the file so the next append starts clean.
        truncateSync(file, Buffer.byteLength(text) - Buffer.byteLength(torn));
      }
      return records;
    },
    append(record) {
      const fd = openSync(file, 'a', 0o600);
      try { writeSync(fd, JSON.stringify(record) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    },
  };
}
