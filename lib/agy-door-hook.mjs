// Source-only AGY 1.5.10 observation adapter. Never an approval adapter.
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, realpath, mkdir, open, readdir, link, unlink } from 'node:fs/promises';
import { isAbsolute, resolve, dirname, join, relative, sep } from 'node:path';
import { assessDoor } from './night-door-policy.mjs';

export const MAX_INPUT_BYTES = 256 * 1024;
export const MAX_RECEIPTS = 1024;
export const MAX_STATE_BYTES = 2 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 2048;
const tools = ['read_file', 'edit_file', 'write_file', 'view_file', 'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'run_command', 'send_message', 'generate_image', 'invoke_subagent'];
const mutations = ['edit_file', 'write_file', 'write_to_file', 'replace_file_content', 'multi_replace_file_content'];
const hash = value => createHash('sha256').update(value).digest('hex');
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 4096;
const inside = (root, p) => { const r = relative(root, p); return r === '' || (r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r)); };
const invalid = () => { throw new TypeError('Malformed hook input.'); };

// Parsed JSON only; bounded depth also bounds canonicalization recursion.
function canonical(value, depth = 0) {
  if (depth > 48) invalid();
  if (Array.isArray(value)) return `[${value.map(v => canonical(v, depth + 1)).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k], depth + 1)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function parseHookInput(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_INPUT_BYTES) invalid();
  let input;
  try { input = JSON.parse(raw); } catch { invalid(); }
  if (!object(input) || !Object.hasOwn(input, 'conversationId') || !text(input.conversationId)
    || !Object.hasOwn(input, 'workspacePaths') || !Array.isArray(input.workspacePaths) || input.workspacePaths.length > 32
    || !input.workspacePaths.every(p => text(p) && isAbsolute(p) && !p.includes('\0'))
    || !Object.hasOwn(input, 'stepIdx') || !Number.isSafeInteger(input.stepIdx) || input.stepIdx < 0
    || !Object.hasOwn(input, 'toolCall') || !object(input.toolCall)
    || !Object.hasOwn(input.toolCall, 'name') || !text(input.toolCall.name)
    || !Object.hasOwn(input.toolCall, 'args') || !object(input.toolCall.args)
    || (Object.hasOwn(input.toolCall, 'id') && !text(input.toolCall.id))
    || (Object.hasOwn(input, 'error') && typeof input.error !== 'string')) invalid();
  canonical(input); // Check nesting before doing any filesystem work.
  return input;
}

// Observation failure never changes native permissions or another hook's decision.
export function hookProtocol(event) {
  return event === 'PostToolUse' ? {} : { decision: 'allow' };
}

function receiptFor(input, event) {
  const call = input.toolCall;
  const tool = tools.includes(call.name) ? call.name : 'unknown';
  let kind = 'unknown', coverage = 'unsupported-or-opaque-tool';
  if (tool === 'run_command') coverage = 'opaque-shell-effects';
  if (mutations.includes(tool)) {
    const key = ['edit_file', 'write_file'].includes(tool) ? 'Path' : 'TargetFile';
    if (Object.hasOwn(call.args, key) && text(call.args[key])) {
      kind = 'local-change'; coverage = 'described-file-change-recovery-unavailable';
    }
  }
  if (tool === 'send_message' && text(call.args.Recipient) && text(call.args.Message)) {
    kind = 'message'; coverage = 'described-irreversible-message';
  }
  // These observed tool names alone do not prove that paid capacity was used.
  // generate_image/invoke_subagent therefore remain unknown, never zero-cost.
  const inputDigest = hash(canonical({ name: call.name, args: call.args }));
  const session = hash(input.conversationId);
  const callIdentity = hash(canonical([input.conversationId, input.stepIdx, call.id ?? null]));
  const identity = hash(canonical([event, session, callIdentity, inputDigest]));
  const assessment = assessDoor({ intent: 'Observe described tool effects', effectsComplete: false,
    effects: [{ kind, description: 'Hook-described effect; no recovery evidence collected' }],
    operation: { id: callIdentity, state: event === 'PreToolUse' ? 'not-started' : 'unknown', receipts: [] } });
  return { schema: 1, identity, session, callIdentity, event, tool, inputDigest,
    door: assessment.door, recommendation: assessment.recommendation, coverage,
    outcome: event === 'PreToolUse' ? 'execution-unobserved' : input.error ? 'reported-error' : 'observed-completion',
    authorizesExecution: false };
}

async function privateState(state, workspaces) {
  if (!isAbsolute(state) || resolve(state) !== state) throw new Error('state');
  // Parent must exist; do not create an arbitrary ancestry. Reject symlink aliases
  // and group/world-writable non-sticky ancestors. Same-owner hostile races are
  // outside this observer's boundary (Node has no portable openat interface).
  const parent = dirname(state);
  if (await realpath(parent) !== parent) throw new Error('state');
  for (let p = parent; ; p = dirname(p)) {
    const s = await lstat(p);
    if (!s.isDirectory() || s.isSymbolicLink() || ((s.mode & 0o022) && !(s.mode & 0o1000)) || ![0, process.getuid()].includes(s.uid)) throw new Error('state');
    if (dirname(p) === p) break;
  }
  if (workspaces.some(w => inside(w, state))) throw new Error('state');
  try { await mkdir(state, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const s = await lstat(state);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o077) || await realpath(state) !== state) throw new Error('state');
}

async function storeReceipt(state, receipt, workspaces) {
  await privateState(state, workspaces);
  // Non-waiting lock: contention is a monitoring gap, never an execution block.
  // A retained lock is never stolen; uncertain writes are not retried here.
  const lockPath = join(state, '.writer');
  const lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let temporary;
  try {
    const entries = await readdir(state);
    if (entries.length > MAX_RECEIPTS + 1) throw new Error('capacity');
    let bytes = 0, count = 0;
    for (const name of entries) {
      if (name === '.writer') continue;
      if (!/^[a-f0-9]{64}\.json$/.test(name)) throw new Error('state');
      const s = await lstat(join(state, name));
      if (!s.isFile() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o077) || s.nlink !== 1 || s.size > MAX_RECEIPT_BYTES) throw new Error('state');
      bytes += s.size; count++;
    }
    const target = join(state, `${receipt.identity}.json`);
    if (entries.includes(`${receipt.identity}.json`)) {
      const existing = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const s = await existing.stat();
        if (s.size > MAX_RECEIPT_BYTES) throw new Error('state');
        // Preserve conflicting Post observations instead of rewriting evidence.
        if (await existing.readFile('utf8') !== `${JSON.stringify(receipt)}\n`) throw new Error('conflicting-observation');
      } finally { await existing.close(); }
      return 'duplicate';
    }
    const body = `${JSON.stringify(receipt)}\n`;
    if (count >= MAX_RECEIPTS || Buffer.byteLength(body) > MAX_RECEIPT_BYTES || bytes + Buffer.byteLength(body) > MAX_STATE_BYTES) throw new Error('capacity');
    temporary = join(state, `.pending-${randomUUID()}`);
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(body); await file.sync(); } finally { await file.close(); }
    await link(temporary, target); // atomic no-replace publication, then remove temp
    await unlink(temporary); temporary = undefined;
    return 'recorded';
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}

/** Raw JSON boundary. Returns protocol plus fixed diagnostic; never raw payloads. */
export async function observeHook({ raw, event, root, state }) {
  if (!['PreToolUse', 'PostToolUse'].includes(event) || !text(root) || !isAbsolute(root) || !text(state) || !isAbsolute(state)) {
    return { protocol: hookProtocol(event), status: 'malformed', diagnostic: 'Invalid observer configuration.' };
  }
  let input;
  try { input = parseHookInput(raw); }
  catch { return { protocol: hookProtocol(event), status: 'malformed', diagnostic: 'Malformed or oversized hook input.' }; }
  const protocol = hookProtocol(event);
  try {
    const rootStat = await lstat(root);
    const selected = await realpath(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || selected !== root || resolve(root) !== root) throw new Error('root');
    const workspaces = await Promise.all(input.workspacePaths.map(p => realpath(p)));
    if (!workspaces.includes(selected)) return { protocol, status: 'outside-scope', diagnostic: 'Selected workspace absent; observation coverage gap.' };
    const status = await storeReceipt(state, receiptFor(input, event), [...workspaces, selected]);
    return { protocol, status, diagnostic: null };
  } catch {
    return { protocol, status: 'unavailable', diagnostic: 'Observation unavailable; native policy remains in control.' };
  }
}
