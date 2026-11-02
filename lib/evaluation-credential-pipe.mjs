// Approved-controller input only. No lookup, persistence, hashing or subprocess.
import { fstatSync, closeSync } from 'node:fs';
import { Socket } from 'node:net';
import { parsePartitionJson } from './evaluation-input-partition.mjs';

const active = new Set();
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const id = v => typeof v === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(v);
const error = code => Object.assign(new Error(code), { code });

export async function readCredentialPipe({ fd, expected, deadline, signal }) {
  // This channel is supported only on the host with retained inheritance proof.
  if (process.platform !== 'darwin') throw error('credential_pipe_platform_unsupported');
  if (!Number.isInteger(fd) || fd < 3 || fd > 2147483647 || active.has(fd)
    || !exact(expected, ['ref', 'generation']) || !id(expected.ref)
    || !Number.isSafeInteger(expected.generation) || expected.generation < 1
    || !Number.isSafeInteger(deadline) || deadline <= Date.now()
    || signal !== undefined && !(signal instanceof AbortSignal)) throw error('credential_pipe_input');
  const binding = { ...expected };
  try { if (!fstatSync(fd).isFIFO()) throw error('credential_pipe_input'); }
  catch { throw error('credential_pipe_input'); }
  // libuv's pipe wrapper uses nonblocking reads and owns the supplied descriptor.
  // Ownership transfers here, after type/metadata checks; even abort closes it.
  let socket;
  try { socket = new Socket({ fd, readable: true, writable: false }); }
  catch { try { closeSync(fd); } catch {} throw error('credential_pipe_unavailable'); }
  active.add(fd);
  return new Promise((resolve, reject) => {
    let chunks = [], bytes = 0, finished = false, key, failure, timer;
    const stop = code => {
      if (finished) return;
      finished = true; failure = code; chunks = [];
      clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      socket.destroy();
    };
    const onAbort = () => stop('credential_pipe_aborted');
    const onData = chunk => {
      if (finished) return;
      bytes += chunk.length;
      if (bytes > 8192) { stop('credential_pipe_limit'); return; }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (finished) return;
      try {
        const value = parsePartitionJson(Buffer.concat(chunks), 8192);
        if (!exact(value, ['schemaVersion', 'ref', 'generation', 'key']) || value.schemaVersion !== 1
          || value.ref !== binding.ref || value.generation !== binding.generation
          || typeof value.key !== 'string' || !/^[\x21-\x7e]{16,4096}$/.test(value.key)) throw error('credential_pipe_invalid');
        key = value.key; stop(null);
      } catch { stop('credential_pipe_invalid'); }
    };
    const onError = () => stop('credential_pipe_unavailable');
    socket.on('data', onData); socket.on('end', onEnd); socket.on('error', onError);
    socket.once('close', () => {
      active.delete(fd); clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      socket.removeListener('data', onData); socket.removeListener('end', onEnd); socket.removeListener('error', onError);
      chunks = [];
      if (!finished || failure) { key = undefined; reject(error(failure ?? 'credential_pipe_unavailable')); }
      else { resolve(key); key = undefined; }
    });
    timer = setTimeout(() => stop('credential_pipe_timeout'), Math.max(1, Math.min(1000, deadline - Date.now())));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
