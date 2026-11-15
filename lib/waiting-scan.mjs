// This machine's half of Sessions waiting on you (lib/waiting-sessions.mjs): the
// home sessions in its Claude transcripts that ended on a question to the owner.
import { readdir, open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { claudeDir, parseSession } from './looseends.mjs';
import { homePlateOf, validSnapshot, clipText, QUESTION_CHARS, SCAN_DAYS, SNAPSHOT_SCHEMA, SNAPSHOT_SESSIONS } from './waiting-sessions.mjs';

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
  return validSnapshot({ schema: SNAPSHOT_SCHEMA, machine: clipText(machine || 'this Mac', 60).replace(/[^A-Za-z0-9 ._-]/g, '-') || 'this Mac', scannedAt: new Date(now).toISOString(), sessions: sessions.slice(0, SNAPSHOT_SESSIONS) });
}

