// One request per process. Trusted host supplies root and serializes workspace calls.
// Run only under spawnContained({ writable: true }); this is not an OS sandbox.
import { constants as C, lstatSync, realpathSync, openSync, closeSync, fstatSync, readSync, writeSync, ftruncateSync, fsyncSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const MAX = 256 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const hidden = parts => parts.some(p => p.startsWith('.') || ['experiments', 'harness', 'node_modules'].includes(p)) || (parts[0] === 'tests' && parts[1] === 'helpers');
const pathParts = (path, operation) => {
  if (operation === 'list' && path === '.') return [];
  if (typeof path !== 'string' || !path || path.length > 1024 || /[\\\x00-\x1f\x7f]/.test(path)) fail('invalid_path');
  const parts = path.split('/');
  if (parts.some(p => !p || p === '.' || p === '..') || hidden(parts)) fail('path_denied');
  return parts;
};
const inspect = (root, parts, allowMissing = false) => {
  let path = root;
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i]);
    let stat;
    try { stat = lstatSync(path); } catch (error) {
      if (allowMissing && i === parts.length - 1 && error.code === 'ENOENT') return null;
      throw error;
    }
    if (stat.isSymbolicLink()) fail('symlink_denied');
    if (i < parts.length - 1 && !stat.isDirectory()) fail('invalid_parent');
    if (i === parts.length - 1) return stat;
  }
  return lstatSync(root);
};
const readBytes = fd => {
  const stat = fstatSync(fd);
  if (!stat.isFile() || stat.nlink !== 1) fail('file_type_denied');
  if (stat.size > MAX) fail('file_too_large');
  const data = Buffer.alloc(MAX + 1);
  let size = 0;
  for (;;) {
    const got = readSync(fd, data, size, data.length - size, size);
    size += got;
    if (size > MAX) fail('file_too_large');
    if (!got) break;
  }
  return data.subarray(0, size);
};
function execute(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || !['read', 'write', 'list'].includes(request.operation)) fail('invalid_request');
  const fields = request.operation === 'write' ? ['operation', 'path', 'content', 'expectedSha256'] : ['operation', 'path'];
  if (Object.keys(request).length !== fields.length || fields.some(k => !Object.hasOwn(request, k))) fail('invalid_request');
  if (process.argv.length !== 3 || !process.argv[2].startsWith('/')) fail('invalid_root');
  const root = resolve(process.argv[2]);
  if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) fail('invalid_root');
  const parts = pathParts(request.path, request.operation), target = join(root, ...parts);
  const initial = inspect(root, parts, request.operation === 'write');
  if (request.operation === 'list') {
    if (!initial.isDirectory()) fail('not_directory');
    const entries = readdirSync(target, { withFileTypes: true }).filter(e => !hidden([...parts, e.name]) && !e.isSymbolicLink()).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other' })).sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length > 512 || Buffer.byteLength(JSON.stringify(entries)) > MAX) fail('directory_too_large');
    return { ok: true, operation: 'list', path: request.path, entries };
  }
  if (request.operation === 'write') {
    if (!(parts[0] === 'lib' && parts.length > 1) && !(parts[0] === 'tests' && parts.length === 2 && parts[1].endsWith('.test.mjs'))) fail('write_denied');
    if (typeof request.content !== 'string' || Buffer.byteLength(request.content) > MAX) fail('content_too_large');
    if (request.expectedSha256 !== null && (typeof request.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(request.expectedSha256))) fail('invalid_digest');
    if (!initial && request.expectedSha256 !== null) return { ok: false, error: 'conflict', path: request.path, actualSha256: null };
    if (initial && request.expectedSha256 === null) return { ok: false, error: 'conflict', path: request.path };
  }
  if (initial && (!initial.isFile() || initial.nlink !== 1)) fail('file_type_denied');
  let fd;
  try {
    const flags = request.operation === 'read' ? C.O_RDONLY : initial ? C.O_RDWR : C.O_RDWR | C.O_CREAT | C.O_EXCL;
    fd = openSync(target, flags | C.O_NOFOLLOW, 0o600);
    const opened = fstatSync(fd), current = inspect(root, parts);
    if (!current || !same(opened, current) || (initial && !same(opened, initial))) fail('path_changed');
    const previous = readBytes(fd), previousSha = digest(previous);
    if (request.operation === 'read') return { ok: true, operation: 'read', path: request.path, content: new TextDecoder('utf-8', { fatal: true }).decode(previous), sha256: previousSha, bytes: previous.length };
    if (initial && previousSha !== request.expectedSha256) return { ok: false, error: 'conflict', path: request.path, actualSha256: previousSha };
    const next = Buffer.from(request.content);
    // Recheck path ancestry and opened identity immediately before the bounded write.
    if (!same(opened, inspect(root, parts)) || realpathSync(dirname(target)) !== dirname(target)) fail('path_changed');
    let offset = 0;
    while (offset < next.length) offset += writeSync(fd, next, offset, next.length - offset, offset);
    ftruncateSync(fd, next.length); fsyncSync(fd);
    if (!same(opened, inspect(root, parts)) || digest(readBytes(fd)) !== digest(next)) fail('write_verification_failed');
    return { ok: true, operation: 'write', path: request.path, sha256: digest(next), bytes: next.length, created: !initial };
  } finally { if (fd !== undefined) closeSync(fd); }
}
try {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX * 6 + 4096) fail('request_too_large');
    chunks.push(chunk);
  }
  const input = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  process.stdout.write(JSON.stringify(execute(JSON.parse(input))) + '\n');
} catch (error) {
  const known = new Set(['invalid_request','invalid_root','invalid_path','path_denied','symlink_denied','invalid_parent','file_type_denied','file_too_large','not_directory','directory_too_large','write_denied','content_too_large','invalid_digest','path_changed','write_verification_failed','request_too_large']);
  const code = known.has(error.code) ? error.code : error.code === 'ENOENT' ? 'not_found' : error.code === 'EEXIST' ? 'conflict' : error.code === 'ELOOP' ? 'symlink_denied' : 'request_failed';
  process.stdout.write(JSON.stringify({ ok: false, error: code }) + '\n');
  process.exitCode = 1;
}
