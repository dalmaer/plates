// This machine's half of Sessions waiting on you (lib/waiting-sessions.mjs): the
// home sessions in its Claude transcripts that ended on a question to the owner,
// the scripts waiting in its runme queue, and the Rex panes whose program says it
// is blocked on the owner (phase 199).
import { readdir, open, stat, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { claudeDir, parseSession } from './looseends.mjs';
import { homePlateOf, validSnapshot, clipText, paneLabel, PANE_KINDS, QUESTION_CHARS, SCAN_DAYS, SNAPSHOT_SCHEMA, SNAPSHOT_SESSIONS } from './waiting-sessions.mjs';

const ID = /^[A-Za-z0-9._-]{1,100}$/;
/** Transcripts grow to hundreds of megabytes: the title is read from the head and the tail, the ending from the tail. */
export const HEAD_BYTES = 64 * 1024, TAIL_BYTES = 1024 * 1024;
async function slices(path, size) {
  const handle = await open(path, 'r');
  try {
    const read = async (position, length) => { const buffer = Buffer.alloc(length); const { bytesRead } = await handle.read(buffer, 0, length, position); return buffer.subarray(0, bytesRead).toString('utf8'); };
    if (size <= HEAD_BYTES + TAIL_BYTES) return { head: '', tail: await read(0, size) };
    const head = await read(0, HEAD_BYTES), tail = await read(size - TAIL_BYTES, TAIL_BYTES);
    // Whole lines only: the head's last line and the tail's first may be cut.
    return { head: head.slice(0, head.lastIndexOf('\n') + 1), tail: tail.slice(tail.indexOf('\n') + 1) };
  } finally { await handle.close(); }
}
const titleIn = text => { let title = null; for (const m of text.matchAll(/"customTitle":("(?:[^"\\]|\\.)*")/g)) { try { title = JSON.parse(m[1]); } catch { /* a cut entry */ } } return title; };
const iso = ms => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

/**
 * This machine's home sessions waiting on the owner, as a snapshot:
 * { schema, machine, scannedAt, sessions: [{ id, plate, title, question, since }] }, the oldest wait first.
 */
export async function scanWaitingSessions({ env = process.env, machine, now = Date.now() } = {}) {
  const base = join(claudeDir(env), 'projects'), sessions = [];
  // Only "not there" is nothing: a directory or file that cannot be read stops the scan, so a push never replaces a
  // device's snapshot with one that silently lost sessions (a dir, file or transcript removed mid-scan is gone, not unread).
  const gone = fallback => error => { if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return fallback; throw new Error(`the transcripts could not all be read (${error?.code ?? 'error'}); nothing was sent`); };
  for (const dir of await readdir(base).catch(gone([]))) {
    for (const file of (await readdir(join(base, dir)).catch(gone([]))).filter(n => n.endsWith('.jsonl'))) {
      const path = join(base, dir, file), info = await stat(path).catch(gone(null));
      if (!info?.isFile() || now - info.mtimeMs > SCAN_DAYS * 86_400_000) continue;
      const { head, tail } = await slices(path, info.size).catch(gone({ head: '', tail: '' }));
      // Only a home session is parsed: its title is in the tail (the app appends it again) or the head.
      const title = titleIn(tail) ?? titleIn(head);
      if (!homePlateOf(title)) continue;
      const s = parseSession(tail, file.replace(/\.jsonl$/, ''));
      if (s) s.title = title;
      const plate = homePlateOf(s?.title);
      if (!s || !plate || s.ending !== 'question' || !ID.test(s.id ?? '')) continue;
      sessions.push({ id: s.id, plate, title: clipText(s.title, 120), question: s.question ? clipText(s.question, QUESTION_CHARS) : null, since: iso(s.lastAt) });
    }
  }
  sessions.sort((a, b) => (a.since ?? '').localeCompare(b.since ?? '') || a.id.localeCompare(b.id));
  const panes = await scanRexPanes({ env });
  return validSnapshot({ schema: SNAPSHOT_SCHEMA, machine: clipText(machine || 'this Mac', 60).replace(/[^A-Za-z0-9 ._-]/g, '-') || 'this Mac', scannedAt: new Date(now).toISOString(), sessions: sessions.slice(0, SNAPSHOT_SESSIONS), scripts: await scanRunme({ env }),
    ...(panes ? { panes } : {}) });
}


/**
 * The scripts waiting in this machine's runme queue (RUNME_DIR, else ~/.runme): each *.sh at its top, its
 * name, its "# why:" line, and whether it is checked (its .ok holds the script's SHA-256, as runme decides).
 * The script's contents never leave this machine. No queue is no scripts; a queue that cannot be read refuses.
 */
export async function scanRunme({ env = process.env } = {}) {
  const dir = env.RUNME_DIR || join(env.HOME || homedir(), '.runme');
  const gone = fallback => error => { if (error?.code === 'ENOENT') return fallback; throw new Error(`the runme queue could not be read (${error?.code ?? 'error'}); nothing was sent`); };
  const out = [];
  for (const file of (await readdir(dir).catch(gone([]))).filter(n => n.endsWith('.sh')).sort()) {
    const text = await readFile(join(dir, file), 'utf8').catch(gone(null));
    if (text === null) continue;
    const ok = await readFile(join(dir, `${file}.ok`), 'utf8').catch(gone(''));
    const info = await stat(join(dir, file)).catch(gone(null));
    const why = /^# why: (.*)$/m.exec(text)?.[1] ?? '';
    const name = file.replace(/\.sh$/, '');
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) continue;
    out.push({ name, why: clipText(why || 'runme script', 300), checked: ok.trim() === createHash('sha256').update(text).digest('hex'),
      since: info ? new Date(info.mtimeMs).toISOString() : null });
  }
  return out.slice(0, SNAPSHOT_SESSIONS);
}

/** Each Rex call is bounded, and the whole read too: a slow Rex is not read, never waited on. */
export const REX_CALL_MS = 3_000, REX_READ_MS = 15_000;

/** The absolute path of `rex` on env's PATH, or null (as lib/attach.mjs rexBin; not imported, to keep this scan small). */
async function rexOnPath(env) {
  for (const dir of String(env.PATH ?? '').split(delimiter)) {
    if (!isAbsolute(dir)) continue;
    try { await access(join(dir, 'rex'), constants.X_OK); return join(dir, 'rex'); } catch { /* not here */ }
  }
  return null;
}

/**
 * The panes in this machine's Rex whose program reported, with OSC 7501, that it is blocked on the person
 * (`block.method` `program_status`, its root record): [{ block, sid, session, tab, app, kind, since }], oldest first.
 * `sid` is Rex's session id, which commands use; `session` is its label, for reading only.
 * Only the root record's state, kind, app and time are read: never a record's title or message, never a pane's
 * contents. Rex not on PATH, an error, a refusal or a slow answer: null (not read), never [] (read, none).
 */
export async function scanRexPanes({ env = process.env, callMs = REX_CALL_MS, readMs = REX_READ_MS } = {}) {
  const bin = await rexOnPath(env);
  if (!bin) return null;
  const deadline = Date.now() + readMs;
  const call = args => new Promise((done, fail) => {
    const left = Math.min(callMs, deadline - Date.now());
    if (left <= 0) return fail(new Error('rex read timed out'));
    execFile(bin, args, { cwd: env.HOME || homedir(), env: { PATH: env.PATH ?? '', HOME: env.HOME ?? homedir() }, timeout: left, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => { if (error) return fail(error); try { done(JSON.parse(stdout)); } catch (e) { fail(e); } });
  });
  try {
    const ls = await call(['ls', '--json']);
    // Each answer must have the shape Rex documents: anything else is the whole read unread (the catch), never none.
    const list = (v, key) => { if (!Array.isArray(v?.[key])) throw new Error(`rex answered without ${key}`); return v[key]; };
    const sessions = list(ls, 'sessions').filter(s => typeof s?.session_id === 'string' && /^session:[A-Za-z0-9-]{1,100}$/.test(s.session_id));
    const out = [];
    for (const s of sessions) {
      const label = paneLabel(s.label, 128);
      if (!label) continue;
      for (const b of list(await call(['block', 'ls', '-s', s.session_id, '--json']), 'blocks')) {
        if (typeof b?.block_id !== 'string' || !/^block:[A-Za-z0-9-]{1,100}$/.test(b.block_id) || !/\.terminal(\.|$)/.test(String(b.flavor ?? ''))) continue;
        const status = await call(['api', 'call', '-s', s.session_id, 'block.method', JSON.stringify({ block_id: b.block_id, method: 'program_status' })]);
        // The root record holds the reports that gave no id; a child record (build/test) is a program's own detail.
        const root = list(status, 'records').find(r => r && typeof r === 'object' && r.id === undefined);
        if (root?.state !== 'blocked') continue;
        const since = Number.isFinite(Date.parse(root.updated_at)) ? new Date(Date.parse(root.updated_at)).toISOString() : null;
        const app = typeof root.app === 'string' && /^[A-Za-z0-9._-]{1,40}$/.test(root.app) ? root.app : null;
        out.push({ block: b.block_id, sid: s.session_id, session: label, tab: paneLabel(b.label) ?? 'tab', app, kind: PANE_KINDS.includes(root.kind) ? root.kind : null, since });
        if (out.length >= SNAPSHOT_SESSIONS) break;
      }
      if (out.length >= SNAPSHOT_SESSIONS) break;
    }
    return out.sort((a, b) => (a.since ?? '').localeCompare(b.since ?? '') || a.block.localeCompare(b.block));
  } catch { return null; }
}
