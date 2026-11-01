// Exact owner-machine migration. This deliberately does not edit shell source,
// discover tool behavior, migrate worktrees, or infer authority from a name.
import { constants } from 'node:fs';
import { lstat, realpath, readdir, open, mkdir, chmod, link, unlink, rmdir, rename } from 'node:fs/promises';
import { resolve, join, dirname, basename, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { nameRow } from './names.mjs';

const execute = promisify(execFile), LIMIT = 16 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ids = ['machine:~/.keel/night-card/run.sh', 'machine:~/Library/LaunchAgents/com.keel.night-card.plist', 'machine:~/.keel/tools/'];
function result(data, exitCode) {
  const lines = [`Machine names: ${data.state}${data.reason ? ` (${data.reason})` : ''}${data.digest ? `; digest ${data.digest}` : ''}${data.operation ? `; operation ${data.operation}` : ''}.`];
  for (const action of data.actions ?? []) {
    lines.push(`Move ${JSON.stringify(action.from)} -> ${JSON.stringify(action.to)}; mode ${action.mode.toString(8)}.`);
    for (const entry of action.entries) lines.push(`  ${JSON.stringify(entry.path || '.')} ${entry.kind}; mode ${entry.mode.toString(8)}${entry.hash ? `; source SHA-256 ${entry.hash}` : ''}.`);
    if (action.targetHash) lines.push(`  Structured plist label/script edit; target SHA-256 ${action.targetHash}.`);
  }
  if (data.job) lines.push(data.originalJob === 'loaded'
    ? `Stop and confirm ${data.job.domain}/${data.job.oldLabel}; after moves, bootstrap ${data.job.domain}/${data.job.newLabel} from ${JSON.stringify(data.job.newPlist)}.`
    : `Keep ${data.job.domain}/${data.job.oldLabel} and ${data.job.domain}/${data.job.newLabel} unloaded; no bootstrap.`);
  if (data.worktrees) { lines.push('Worktrees (inventory only; never moved):'); lines.push(...(data.worktrees.length ? data.worktrees.map(p => `  ${JSON.stringify(p)}`) : ['  none named with the legacy project path'])); }
  if (data.stage) lines.push(`Original stage: ${data.stage}. Recovery is read-only; no stop, move or bootstrap is retried. Partial moves may need owner recovery.`);
  return { data, text: lines.join('\n'), exitCode };
}

async function command(file, args, env) {
  try { const r = await execute(file, args, { env, timeout: 10000, maxBuffer: 256 * 1024 }); return { status: 0, stdout: r.stdout, stderr: r.stderr }; }
  catch (e) { return { status: e.code, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }; }
}
/** Failure/permission denial is unknown, never evidence that a service is absent. */
export function machineLaunchctl(env = process.env, runner = command) {
  return async ({ action, domain, label, plist, args }) => {
    const target = `${domain}/${label}`;
    const r = await runner('/bin/launchctl', action === 'inspect' ? ['print', target] : action === 'stop' ? ['bootout', target] : ['bootstrap', domain, plist], env);
    if (action !== 'inspect') return { ok: r.status === 0 };
    if (r.status === 113 && r.stderr.includes(`Could not find service "${label}"`)) return { state: 'unloaded' };
    if (r.status !== 0) return { state: 'unknown' };
    const path = /^\s*path = (.+)$/m.exec(r.stdout)?.[1];
    const section = /^\s*arguments = \{\r?\n([\s\S]*?)^\s*\}/m.exec(r.stdout)?.[1];
    const observed = section?.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return { state: 'loaded', matches: path === plist && same(observed, args) };
  };
}
async function machineWorktrees({ root, env }) {
  if (!root) return [];
  const r = await command('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, 'worktree', 'list', '--porcelain', '-z'], env);
  if (r.status !== 0) fail('worktree_inventory_unavailable');
  return r.stdout.split('\0').filter(s => s.startsWith('worktree ')).map(s => s.slice(9));
}

function layout(home) {
  const rows = ids.map(id => nameRow(id));
  const expand = value => { if (!value.startsWith('~/')) fail('unsupported_table_path'); return resolve(home, value.slice(2)); };
  const paths = rows.map(row => ({ id: row.id, from: expand(row.keel), to: expand(row.plates) }));
  return { rows, paths, oldLabel: basename(paths[1].from, '.plist'), newLabel: basename(paths[1].to, '.plist'), journal: join(dirname(dirname(paths[0].to)), 'names-machine') };
}
async function safe(path, home, uid, absent = true) {
  if (path !== home && (!path.startsWith(home + '/') || !isAbsolute(path))) fail('path_outside_home');
  const parts = relative(home, path).split('/').filter(Boolean); let at = home, value;
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) at = join(at, parts[i]);
    try { value = await lstat(at); }
    catch (e) { if (e.code === 'ENOENT' && absent) return null; throw e; }
    if (value.isSymbolicLink() || value.uid !== uid || (!value.isDirectory() && !value.isFile())) fail('unsafe_path');
    if (!(value.isDirectory() ? [0o700, 0o755] : [0o600, 0o644, 0o700, 0o755]).includes(value.mode & 0o7777)) fail('unsupported_mode');
    if (value.isFile() && (i < parts.length - 1 || value.nlink !== 1)) fail('unsafe_file');
    if (i < parts.length - 1 && !value.isDirectory()) fail('unsafe_parent');
  }
  return value;
}
async function bytes(path, home, uid, limit = LIMIT) {
  const before = await safe(path, home, uid, false);
  if (!before?.isFile() || before.size > limit) fail('unsupported_file');
  const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await f.stat();
    if (s.dev !== before.dev || s.ino !== before.ino || s.nlink !== 1 || s.size > limit) fail('source_changed');
    const b = await f.readFile(); const end = await f.stat();
    if (b.length > limit || s.size !== end.size || s.mtimeMs !== end.mtimeMs || end.nlink !== 1) fail('source_changed');
    return b;
  } finally { await f.close(); }
}
async function snapshot(path, home, uid) {
  const found = await safe(path, home, uid); if (!found) return null;
  const entries = []; let total = 0;
  async function walk(at, depth) {
    if (depth > 12 || entries.length >= 512) fail('inventory_bound');
    if (depth > 0 && /^(?:\.env(?:[.-].*)?|\.(?:ssh|aws|npmrc|netrc)|credentials?(?:[.-].*)?|secrets?(?:[.-].*)?|tokens?(?:[.-].*)?|id_(?:rsa|ed25519)(?:[.-].*)?)$|\.(?:pem|key|p12|pfx)$/i.test(basename(at))) fail('sensitive_tool_entry_manual_review');
    const s = await safe(at, home, uid, false); if (!s) fail('source_changed');
    const row = { path: relative(path, at), mode: s.mode & 0o7777, kind: s.isDirectory() ? 'directory' : 'file' };
    if (s.isFile()) { total += s.size; if (total > 64 * 1024 * 1024) fail('inventory_bound'); row.hash = hash(await bytes(at, home, uid)); }
    entries.push(row);
    if (s.isDirectory()) for (const p of (await readdir(at)).sort()) await walk(join(at, p), depth + 1);
  }
  await walk(path, 0); return entries;
}

// Small, bounded XML plist parser retaining byte offsets. No DTD expansion,
// arbitrary XML attributes, duplicate dictionary keys, or shell interpretation.
function plistDocument(b) {
  const text = b.toString('utf8'); if (!Buffer.from(text).equals(b) || b.length > 256 * 1024) fail('unsupported_plist');
  const tokens = []; const re = /<\?xml[^?]*\?>|<!DOCTYPE plist PUBLIC "-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN" "http:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd">|<!--[\s\S]*?-->|<[^>]*>|[^<]+/g;
  let declaration = false, doctype = false;
  for (const m of text.matchAll(re)) {
    if (m[0].startsWith('<!--')) continue;
    if (m[0].startsWith('<?xml')) {
      if (declaration || tokens.some(t => t.text.trim()) || !/^<\?xml version="1\.0"(?: encoding="UTF-8")?\?>$/.test(m[0])) fail('unsupported_plist');
      declaration = true; continue;
    }
    if (m[0].startsWith('<!DOCTYPE')) {
      if (doctype || tokens.some(t => t.text.trim()) || m[0] !== '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">') fail('unsupported_plist');
      doctype = true; continue;
    }
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  let i = 0, nodes = 0;
  const ws = () => { while (tokens[i] && /^\s+$/.test(tokens[i].text)) i++; };
  const take = value => { ws(); if (tokens[i++]?.text !== value) fail('unsupported_plist'); };
  const decode = s => {
    if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(s)) fail('unsupported_xml_entity');
    return s.replace(/&(amp|lt|gt|quot|apos);/g, (_, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k]));
  };
  function node(depth = 0) {
    if (++nodes > 4096 || depth > 20) fail('unsupported_plist'); ws(); const t = tokens[i++]; if (!t) fail('unsupported_plist');
    if (['<true/>', '<false/>', '<true />', '<false />'].includes(t.text)) return { type: 'boolean' };
    const tag = /^<(dict|array|string|key|integer|real|date|data)>$/.exec(t.text)?.[1]; if (!tag) fail('unsupported_plist');
    if (tag === 'dict' || tag === 'array') {
      const values = []; ws(); while (tokens[i]?.text !== `</${tag}>`) { values.push(node(depth + 1)); ws(); } take(`</${tag}>`);
      if (tag === 'array') { if (values.some(v => v.type === 'key')) fail('unsupported_plist'); return { type: tag, values }; }
      const entries = Object.create(null);
      for (let j = 0; j < values.length; j += 2) { const k = values[j]; if (k.type !== 'key' || !values[j + 1] || values[j + 1].type === 'key' || Object.hasOwn(entries, k.value)) fail('ambiguous_plist'); entries[k.value] = values[j + 1]; }
      return { type: tag, entries };
    }
    const start = t.end; let raw = '';
    if (tokens[i] && !tokens[i].text.startsWith('<')) raw = tokens[i++].text;
    const end = start + raw.length; take(`</${tag}>`); return { type: tag, value: decode(raw), start, end };
  }
  take('<plist version="1.0">'); const value = node(); take('</plist>'); ws(); if (i !== tokens.length || value.type !== 'dict') fail('unsupported_plist');
  return { text, entries: value.entries };
}
const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function editPlist(b, shape) {
  const { text, entries } = plistDocument(b); const label = entries.Label, list = entries.ProgramArguments;
  if (label?.type !== 'string' || label.value !== shape.oldLabel || list?.type !== 'array' || list.values.some(x => x.type !== 'string')) fail('unsupported_job');
  // Alternative launch authority or a login/user override needs a separate contract.
  if (['Program', 'BundleProgram', 'RootDirectory', 'UserName', 'GroupName'].some(k => Object.hasOwn(entries, k))) fail('unsupported_job');
  const args = list.values.map(x => x.value), index = args[0] === shape.paths[0].from ? 0 : ['/bin/sh', '/bin/bash', '/bin/zsh'].includes(args[0]) && args[1] === shape.paths[0].from ? 1 : -1;
  if (index < 0 || args.length !== index + 1) fail('unsupported_job_arguments');
  const changes = [{ ...label, value: shape.newLabel }, { ...list.values[index], value: shape.paths[0].to }].sort((a, b) => b.start - a.start);
  let output = text; for (const c of changes) output = output.slice(0, c.start) + xml(c.value) + output.slice(c.end);
  // Unrelated embedded old paths require manual attention, never broad replacement.
  if (output.includes(dirname(shape.paths[0].from)) || output.includes(shape.paths[2].from)) fail('manual_plist_path_edit_required');
  const nextArgs = [...args]; nextArgs[index] = shape.paths[0].to;
  return { bytes: Buffer.from(output), args, nextArgs };
}
async function observation(launchctl, req) {
  let value; try { value = await launchctl({ action: 'inspect', ...req }); } catch { fail('job_observation_unknown'); }
  if (!['loaded', 'unloaded'].includes(value?.state) || (value.state === 'loaded' && value.matches !== true)) fail('job_observation_unknown');
  return value.state;
}
async function plan({ home, uid, root, env, launchctl, worktrees }) {
  const shape = layout(home), domain = `gui/${uid}`, files = [];
  for (const p of shape.paths) {
    const source = await snapshot(p.from, home, uid), destination = await snapshot(p.to, home, uid);
    if (source && destination) fail('source_destination_collision');
    if (destination) fail('current_path_requires_original_receipt');
    files.push({ ...p, source, destination });
  }
  if (Boolean(files[0].source) !== Boolean(files[1].source)) fail('incomplete_job_source');
  let edited;
  if (files[0].source) {
    if (files[0].source[0].kind !== 'file' || files[1].source[0].kind !== 'file') fail('unsupported_job_source');
    const script = await bytes(files[0].from, home, uid, 256 * 1024);
    // Conservatively block references to either exact legacy directory family.
    const legacyRoot = basename(dirname(dirname(files[0].from)));
    if (script.includes(Buffer.from(legacyRoot)) || script.includes(Buffer.from(shape.oldLabel))) fail('manual_script_path_edit_required');
    edited = editPlist(await bytes(files[1].from, home, uid, 256 * 1024), shape);
    if (edited.args[0] === files[0].from && !(files[0].source[0].mode & 0o111)) fail('script_not_executable');
  }
  if (files[2].source && files[2].source[0].kind !== 'directory') fail('unsupported_tools_source');
  const old = { domain, label: shape.oldLabel, plist: files[1].from, args: edited?.args ?? [] };
  const next = { domain, label: shape.newLabel, plist: files[1].to, args: edited?.nextArgs ?? [] };
  const oldState = await observation(launchctl, old), newState = await observation(launchctl, next);
  if (newState !== 'unloaded' || (oldState === 'loaded' && !edited)) fail('job_collision');
  const paths = await worktrees({ root, env }); if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string')) fail('worktree_inventory_unknown');
  const legacyName = basename(dirname(dirname(files[0].from))).slice(1);
  const inventory = paths.filter(p => p.split('/').includes(legacyName));
  const approved = { version: 1, home, uid, domain, files, old, next, oldState, newState, plistHash: edited ? hash(edited.bytes) : null, rows: shape.rows, worktrees: inventory };
  return { approved, digest: hash(JSON.stringify(approved)), edited, shape };
}
async function ensureDirectory(path, home, uid, mode = 0o700) {
  const s = await safe(path, home, uid); if (s) { if (!s.isDirectory()) fail('unsafe_directory'); return; }
  if (path === home) fail('home_missing'); await ensureDirectory(dirname(path), home, uid); await mkdir(path, { mode }); await syncDirectory(dirname(path));
}
async function syncDirectory(path) {
  const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await f.sync(); } finally { await f.close(); }
}
async function exclusive(path, data, mode, home, uid) {
  await safe(dirname(path), home, uid, false);
  const f = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try { await f.chmod(mode); await f.writeFile(data); await f.sync(); } finally { await f.close(); }
  await syncDirectory(dirname(path));
}
async function moveTree(from, to, expected, home, uid) {
  if (!same(await snapshot(from, home, uid), expected) || await safe(to, home, uid)) fail('source_changed');
  for (const entry of expected) {
    const source = join(from, entry.path), target = join(to, entry.path);
    if (entry.kind === 'directory') { await mkdir(target, { mode: entry.mode }); await chmod(target, entry.mode); }
    else { await link(source, target); }
  }
  for (const entry of [...expected].reverse()) if (entry.kind === 'directory') await syncDirectory(join(to, entry.path));
  await syncDirectory(dirname(to));
  // Publish every destination before removing any original. Interrupted partial
  // moves stay owned by the original journal and require explicit recovery.
  for (const entry of [...expected].reverse()) {
    const source = join(from, entry.path);
    if (entry.kind === 'directory') await rmdir(source); else await unlink(source);
  }
}
async function journalRead(path, home, uid) {
  const s = await safe(path, home, uid); if (!s) return null;
  if ((s.mode & 0o777) !== 0o600) fail('unsafe_journal');
  try { return JSON.parse((await bytes(path, home, uid, 1024 * 1024)).toString()); } catch { fail('invalid_journal'); }
}
async function recoverOperation({ operation, home, uid, launchctl, shape }) {
  const path = join(shape.journal, `${operation}.json`), j = await journalRead(path, home, uid);
  if (!j || j.operation !== operation || hash(JSON.stringify(j.plan)) !== operation || j.plan.home !== home || j.plan.uid !== uid || !same(j.plan.rows, shape.rows)) fail('invalid_original_operation');
  if (!same(j.plan.files.map(({ id, from, to }) => ({ id, from, to })), shape.paths)) fail('invalid_original_operation');
  const states = [];
  for (const f of j.plan.files) {
    const from = await snapshot(f.from, home, uid), to = await snapshot(f.to, home, uid);
    const expected = f.id === shape.paths[1].id && f.source ? [{ ...f.source[0], hash: j.plan.plistHash }] : f.source;
    states.push({ id: f.id, settled: f.source ? from === null && same(to, expected) : from === null && to === null });
  }
  const old = await observation(launchctl, j.plan.old), next = await observation(launchctl, j.plan.next);
  const complete = states.every(s => s.settled) && old === 'unloaded' && next === (j.plan.oldState === 'loaded' ? 'loaded' : 'unloaded');
  // Readback can establish desired state, never authorship of an uncertain start.
  return result({ state: complete ? 'observed-complete' : 'recovery-required', operation, stage: j.stage, originalState: j.plan.oldState, files: states, oldJob: old, newJob: next, redispatched: false }, complete ? 0 : 1);
}

export async function namesMachine({ root, env = process.env, yes = false, digest, recover, home = env.HOME, uid = process.getuid?.(), launchctl = machineLaunchctl(env), worktrees = machineWorktrees } = {}) {
  let lock, lockIdentity, operation;
  try {
    if (!home || !isAbsolute(home) || !Number.isSafeInteger(uid) || uid !== process.getuid?.() || (recover && (yes || digest)) || (!yes && digest) || (yes && !/^[a-f0-9]{64}$/.test(digest ?? '')) || (recover && !/^[a-f0-9]{64}$/.test(recover))) return result({ state: 'invalid-arguments' }, 2);
    home = resolve(home); if (await realpath(home) !== home) fail('unsafe_home'); await safe(home, home, uid, false);
    const shape = layout(home);
    if (recover) { operation = recover; return await recoverOperation({ operation, home, uid, launchctl, shape }); }
    if (yes && await journalRead(join(shape.journal, `${digest}.json`), home, uid)) { operation = digest; return await recoverOperation({ operation, home, uid, launchctl, shape }); }
    const p = await plan({ home, uid, root, env, launchctl, worktrees });
    const actions = p.approved.files.filter(f => f.source).map(f => ({ id: f.id, from: f.from, to: f.to, mode: f.source[0].mode, entries: f.source, targetHash: f.id === p.shape.paths[1].id ? p.approved.plistHash : null }));
    if (!yes) return result({ state: actions.length ? 'approval-required' : 'no-supported-actions', digest: p.digest, actions, worktrees: p.approved.worktrees, worktreeAction: 'inventory-only', job: {domain:p.approved.domain,oldLabel:shape.oldLabel,newLabel:shape.newLabel,newPlist:shape.paths[1].to}, originalJob: p.approved.oldState, supportedShape: 'portable-script/exact-XML-plist/gui-current-user' }, actions.length ? 3 : 0);
    if (digest !== p.digest) fail('stale_approval'); if (!actions.length) return result({ state: 'no-supported-actions' }, 0);
    await ensureDirectory(shape.journal, home, uid);
    if (((await safe(shape.journal, home, uid)).mode & 0o777) !== 0o700) fail('unsafe_journal_directory');
    lock = join(shape.journal, 'active'); try { await mkdir(lock, { mode: 0o700 }); lockIdentity = await lstat(lock); } catch { lock = null; fail('machine_operation_busy'); }
    const fresh = await plan({ home, uid, root, env, launchctl, worktrees }); if (fresh.digest !== digest) fail('stale_approval');
    operation = digest; const path = join(shape.journal, `${operation}.json`);
    const j = { version: 1, operation, plan: p.approved, stage: 'prepared' }; let saved;
    async function save(stage) {
      j.stage = stage; const b = Buffer.from(JSON.stringify(j));
      if (saved && hash(await bytes(path, home, uid)) !== saved) fail('journal_changed');
      if (!saved) await exclusive(path, b, 0o600, home, uid);
      else { const temp = `${path}.next`; await exclusive(temp, b, 0o600, home, uid); await rename(temp, path); await syncDirectory(dirname(path)); }
      saved = hash(b);
    }
    await save('prepared');
    if (p.approved.oldState === 'loaded') {
      await save('stop-attempted'); let stopped; try { stopped = await launchctl({ action: 'stop', ...p.approved.old }); } catch { fail('stop_uncertain'); }
      if (!stopped?.ok) fail('stop_uncertain');
    }
    if (await observation(launchctl, p.approved.old) !== 'unloaded' || await observation(launchctl, p.approved.next) !== 'unloaded') fail('old_job_not_stopped');
    await save('stopped');
    for (const f of p.approved.files) {
      if (!f.source) continue;
      await save(`move-attempted:${f.id}`);
      if (!same(await snapshot(f.from, home, uid), f.source) || await safe(f.to, home, uid)) fail('source_changed');
      await ensureDirectory(dirname(f.to), home, uid);
      if (f.id === shape.paths[1].id) {
        await exclusive(f.to, p.edited.bytes, f.source[0].mode, home, uid);
        if (!same(await snapshot(f.from, home, uid), f.source)) fail('source_changed'); await unlink(f.from);
      } else await moveTree(f.from, f.to, f.source, home, uid);
    }
    for (const f of p.approved.files.filter(f => f.source)) {
      await syncDirectory(dirname(f.from)); await syncDirectory(dirname(f.to));
    }
    await save('moved');
    if (p.approved.oldState === 'loaded') {
      if (await observation(launchctl, p.approved.old) !== 'unloaded' || await observation(launchctl, p.approved.next) !== 'unloaded') fail('job_state_changed');
      // Revalidate moved bytes and modes immediately before authorizing execution.
      for (const f of p.approved.files) {
        const expected = f.id === shape.paths[1].id && f.source ? [{ ...f.source[0], hash: p.approved.plistHash }] : f.source;
        if (await snapshot(f.from, home, uid) || !same(await snapshot(f.to, home, uid), expected)) fail('destination_changed');
      }
      await save('start-attempted'); let started; try { started = await launchctl({ action: 'start', ...p.approved.next }); } catch { fail('bootstrap_uncertain'); }
      if (!started?.ok) fail('bootstrap_uncertain');
    }
    const observed = await recoverOperation({ operation, home, uid, launchctl, shape });
    if (observed.exitCode !== 0) return observed; await save('complete');
    return result({ ...observed.data, state: 'complete' }, 0);
  } catch (e) { return result({ state: 'refused', reason: e.code ?? 'machine_unavailable', ...(operation ? { operation } : {}) }, 1); }
  finally {
    if (lock) {
      try { const s = await lstat(lock); if (s.dev === lockIdentity.dev && s.ino === lockIdentity.ino) await rmdir(lock); } catch {}
    }
  }
}
