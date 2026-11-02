import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// Single local writer; a stranded lock requires operator inspection, never PID/age stealing.
export function openStore(directory, binding) {
  const dir = resolve(directory);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (realpathSync(dir) !== dir || !lstatSync(dir).isDirectory() || (lstatSync(dir).mode & 0o077)) throw new Error('private_state_directory_required');
  const path = join(dir, 'state.json'), lock = join(dir, 'writer.lock');
  const fd = openSync(lock, 'wx', 0o600);
  let closed = false;
  const release = () => { if (!closed) { closed = true; closeSync(fd); unlinkSync(lock); } };
  try {
    let state;
    if (existsSync(path)) {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024 * 1024 || (info.mode & 0o077)) throw new Error('invalid_state');
      state = JSON.parse(readFileSync(path, 'utf8'));
      if (state.version !== 1 || state.binding !== binding || !state.tasks || !state.seen || !state.outbound || !Number.isSafeInteger(state.tokens) || !Number.isSafeInteger(state.micros)) throw new Error('state_binding_mismatch');
    } else state = { version: 1, binding, tasks: {}, seen: {}, outbound: {}, tokens: 0, micros: 0 };
    return {
      state,
      save() {
        if (closed) throw new Error('store_closed');
        const bytes = JSON.stringify(state);
        if (Buffer.byteLength(bytes) > 16 * 1024 * 1024) throw new Error('state_full');
        const tmp = join(dir, `state-${randomUUID()}.tmp`);
        const out = openSync(tmp, 'wx', 0o600);
        try { writeFileSync(out, bytes); fsyncSync(out); } finally { closeSync(out); }
        renameSync(tmp, path);
        const directoryFd = openSync(dir, 'r');
        try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
      },
      close: release,
    };
  } catch (error) { release(); throw error; }
}
