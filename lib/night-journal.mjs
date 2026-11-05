// Phase 162, increment 2: the overnight decision journal
// (docs/phases/162-overnight-decisions-remain-bounded-and-reviewable.md;
// contract: docs/specs/night-decisions.md, "Journal").
//
// Envelopes (lib/night-decisions.mjs) are appended, one JSON line each, to
// .plates/night/decisions/<night>.jsonl: beside the working plan
// (.plates/night/plan.json), in the night's own working directory, which
// ignores itself and is never committed. Not the plan branch: plates goodnight
// force-pushes a one-file, parentless commit there, which would erase a
// journal beside it. Not phase 150's docs/ records: a model's choice is never
// promoted into a source decision. Not a branch of a possibly public repo:
// raw journals stay in private runtime state (design, "Raw journals belong to
// the existing configured private runtime state"). An explicit `dir` outside
// the checkout is accepted for an approved private destination; inside the
// checkout only the self-ignoring .plates/night/ is.
//
// Writes are append-only and keyed by the original operation identity. An
// identical revision is a no-op (a retry never duplicates). A later revision of
// the same decision may only advance its action, read from the original
// operation's receipts: an uncertain or running operation is inspected, never
// redispatched (no new attempt, no new operation id), and the earlier lines
// stay. The choice itself never changes in place; a correction is a new
// decision (increment 5). Nothing here routes a question, runs an effect or
// shows anything in the morning (increments 3 and 4), and no plan field changes.
import { readFile, mkdir, lstat, realpath, open, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname, relative, isAbsolute, sep } from 'node:path';
import { assertEnvelope, readEnvelope, isUnknown, EnvelopeError } from './night-decisions.mjs';
import { readPlan, safeWrite, PLAN_DIR } from './night-plan.mjs';
import { collectDecisions } from './decision-loop.mjs';

export const JOURNAL_SCHEMA = 1;
export const JOURNAL_DIR = `${PLAN_DIR}/decisions`;
export const journalOf = night => `${JOURNAL_DIR}/${night}.jsonl`;
export const MAX_LINE = 64 * 1024;
export const MAX_JOURNAL = 4 * 1024 * 1024;

export class JournalError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const known = v => v !== undefined && !isUnknown(v);
const opOf = e => (known(e.operation) ? e.operation.id : null);
const attemptsOf = e => (known(e.operation) ? e.operation.attempts : []);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const includesAll = (later, earlier) => earlier.every(x => later.includes(x));

/** The identity a line is keyed by: the original operation, or the decision when nothing was dispatched. */
export const keyOf = e => (opOf(e) ? `operation:${opOf(e)}` : `decision:${e.id}`);

/**
 * Pure: may `next` follow `prev` for the same decision? null when it may, else why not.
 * The choice is fixed; the action only advances, from the original operation's receipts.
 */
export function revisionProblem(prev, next) {
  if (prev.id !== next.id) return 'a revision is of the same decision';
  for (const k of ['night', 'planItem', 'sourceRevision', 'authority', 'dependsOn', 'choice', 'recovery']) {
    if (!same(prev[k], next[k])) return `${k} cannot change in place; a correction is a new decision linked by followUp`;
  }
  if (!same(prev.state.decision, next.state.decision) || !same(prev.state.parked, next.state.parked)) return 'the decision state cannot change in place; a parked choice resumed with new authority is a new decision';
  const was = prev.state.action, now = next.state.action;
  if (opOf(prev) && opOf(next) !== opOf(prev)) return `operation ${opOf(prev)} is the original identity; a resume inspects it, never dispatches ${opOf(next) ?? 'another'}`;
  if (!includesAll(next.state.receipts, prev.state.receipts)) return 'receipts are append-only: every earlier receipt stays';
  if (known(prev.change.effects) && (!known(next.change.effects) || !includesAll(next.change.effects, prev.change.effects))) return 'effects are append-only: every earlier effect receipt stays';
  if (known(prev.consequences.observations) && (!known(next.consequences.observations) || !includesAll(next.consequences.observations.map(o => JSON.stringify(o)), prev.consequences.observations.map(o => JSON.stringify(o))))) return 'observations are append-only';
  const a = attemptsOf(prev), b = attemptsOf(next);
  if (!includesAll(b, a)) return 'attempts are append-only';
  const newAttempts = b.length - a.length;
  if (['uncertain', 'running'].includes(was)) {
    if (newAttempts) return `operation ${opOf(prev)} is ${was}: inspect its original receipt (${prev.state.receipts.join(', ') || 'none named'}); never dispatch another attempt`;
    if (!['running', 'uncertain', 'completed', 'failed'].includes(now) || (was === 'uncertain' && now === 'running')) return `an ${was} operation resolves to completed or failed from its original receipt`;
  } else if (was === 'completed') {
    if (now !== 'completed' || newAttempts) return 'a completed action is final; only observations may be added';
  } else if (was === 'failed') {
    if (newAttempts > 1 || (now !== 'failed' && newAttempts !== 1)) return 'a failed operation is retried as exactly one new attempt of the same operation, within its plan item';
  } else if (was === 'not-started') {
    if (!opOf(next) && now !== 'not-started') return 'a started action names its original operation';
  }
  return null;
}

/**
 * Pure: what a resume may do next for a decision's latest revision. It never
 * says dispatch for an operation whose outcome is unknown.
 * { step: 'inspect' | 'retry-allowed' | 'start-allowed' | 'done' | 'parked', operation, attempts, receipts, why }
 */
export function resumeStep(envelope) {
  const s = envelope.state, base = { operation: opOf(envelope), attempts: attemptsOf(envelope), receipts: [...s.receipts] };
  if (s.decision === 'parked') return { step: 'parked', ...base, why: `parked: ${s.parked.missing.join('; ')}; next: ${s.parked.next}` };
  if (s.action === 'uncertain' || s.action === 'running') return { step: 'inspect', ...base, why: `operation ${base.operation ?? 'unknown'} is ${s.action}: inspect its original receipt before any effect; never redispatch` };
  if (s.action === 'failed') return { step: 'retry-allowed', ...base, why: 'failed from its receipt: one new attempt of the same operation, after rechecking scope, source and authority' };
  if (s.action === 'completed') return { step: 'done', ...base, why: 'completed from its receipt' };
  return { step: 'start-allowed', ...base, why: 'not started: recheck scope, source and authority first' };
}

/**
 * Pure: a journal's text as entries, latest revision per decision, and gaps.
 * Every line goes through readEnvelope, so older shapes read with their
 * unknowns listed. An unreadable line is a gap, never "no decision".
 */
export function parseJournal(text, { night = null } = {}) {
  const entries = [], gaps = [], byId = new Map();
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  lines.forEach((line, i) => {
    const at = `line ${i + 1}`;
    if (line.length > MAX_LINE) { gaps.push({ at, reason: `longer than ${MAX_LINE} bytes` }); return; }
    let v;
    try { v = JSON.parse(line); } catch { gaps.push({ at, reason: 'not JSON (a torn or foreign line)' }); return; }
    if (!v || v.journal !== JOURNAL_SCHEMA || typeof v.key !== 'string' || !v.envelope) { gaps.push({ at, reason: `not a journal ${JOURNAL_SCHEMA} line` }); return; }
    const r = readEnvelope(v.envelope);
    if (r.gap) { gaps.push({ at, reason: r.gap }); return; }
    if (r.problems.length) { gaps.push({ at, reason: r.problems.join('; ') }); return; }
    if (night && r.envelope.night !== night) { gaps.push({ at, reason: `an envelope for ${r.envelope.night} in the ${night} journal` }); return; }
    const entry = { line: i + 1, key: v.key, at: v.at ?? null, envelope: r.envelope, unknowns: r.unknowns };
    entries.push(entry);
    const history = byId.get(r.envelope.id) ?? [];
    if (history.length && same(history.at(-1).envelope, r.envelope)) return; // an identical retry: one fact, not two
    history.push(entry); byId.set(r.envelope.id, history);
  });
  const decisions = [...byId.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, history]) => ({ id, latest: history.at(-1).envelope, unknowns: history.at(-1).unknowns, revisions: history.length, history: history.map(h => h.line) }));
  return { entries, decisions, gaps };
}

async function journalPath(root, night, dir) {
  if (!DATE.test(night ?? '')) throw new JournalError(`the night is a date, YYYY-MM-DD (got ${JSON.stringify(night)})`);
  const top = await realpath(root);
  if (!dir) return { path: join(top, journalOf(night)), rel: journalOf(night), inside: true, top };
  if (!isAbsolute(dir)) throw new JournalError('a journal destination is an absolute directory');
  const rel = relative(top, dir);
  const inside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (inside && !(`${rel}${sep}`.startsWith(`${PLAN_DIR.split('/').join(sep)}${sep}`))) throw new JournalError(`refusing ${dir}: inside the checkout a journal lives only in the self-ignoring ${PLAN_DIR}/, never where it could be committed`);
  return { path: join(dir, `${night}.jsonl`), rel: inside ? `${rel.split(sep).join('/')}/${night}.jsonl` : null, inside, top };
}

/**
 * Read a night's journal: { state: 'absent' | 'read' | 'unreadable', path, decisions, entries, gaps }.
 * Absent is no journal; unreadable is missing coverage, never no decisions.
 */
export async function readJournal({ root, night, dir } = {}) {
  const { path } = await journalPath(root, night, dir);
  let s;
  try { s = await lstat(path); } catch (e) { if (e.code === 'ENOENT') return { state: 'absent', path, decisions: [], entries: [], gaps: [] }; return { state: 'unreadable', path, decisions: [], entries: [], gaps: [{ at: path, reason: e.code ?? e.message }] }; }
  if (!s.isFile()) return { state: 'unreadable', path, decisions: [], entries: [], gaps: [{ at: path, reason: s.isSymbolicLink() ? 'a symlink' : 'not a regular file' }] };
  if (s.size > MAX_JOURNAL) return { state: 'unreadable', path, decisions: [], entries: [], gaps: [{ at: path, reason: `larger than ${MAX_JOURNAL} bytes` }] };
  const text = await readFile(path, 'utf8');
  return { state: 'read', path, ...parseJournal(text, { night }) };
}

async function ensureDir(path) {
  // Every directory on the way is a real directory, never a link.
  const parts = []; let at = path;
  while (true) { const s = await lstat(at).catch(e => (e.code === 'ENOENT' ? null : Promise.reject(e))); if (s) { if (s.isSymbolicLink() || !s.isDirectory()) throw new JournalError(`refusing ${at}: not a plain directory`); break; } parts.unshift(at); const up = dirname(at); if (up === at) break; at = up; }
  for (const p of parts) await mkdir(p).catch(e => (e.code === 'EEXIST' ? null : Promise.reject(e)));
  for (const p of parts) { const s = await lstat(p); if (s.isSymbolicLink() || !s.isDirectory()) throw new JournalError(`refusing ${p}: not a plain directory`); }
}

/**
 * Append one envelope revision. Validated against the night's working plan and
 * phase 150's current decision records (loaded from root unless given), and
 * against the journal's latest revision of the same decision. Returns
 * { written: true, line, key } or { written: false, why: 'duplicate', key };
 * refuses (JournalError) a broken envelope, an unbound plan item, or a
 * revision that would redispatch or rewrite the choice. `at` is the caller's
 * clock (ISO), recorded, never read.
 */
export async function appendEnvelope({ root, envelope, at, dir, plan, decisions } = {}) {
  if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) throw new JournalError('at is the time of the write, an ISO timestamp');
  const night = envelope?.night;
  const where = await journalPath(root, night, dir);
  if (plan === undefined) {
    try { plan = await readPlan(root); } catch (e) { throw new JournalError(`the working plan cannot be read: ${e.message}`); }
  }
  if (!plan || plan.date !== night) throw new JournalError(`no working plan for the night of ${night}: an envelope binds to an existing plan item`);
  if (decisions === undefined) {
    const found = await collectDecisions(root);
    if (found.gaps.length) throw new JournalError(`decision records are unreadable (${found.gaps.map(g => g.path).join(', ')}): a settled choice cannot be checked`);
    decisions = found.decisions;
  }
  try { assertEnvelope(envelope, { plan, decisions }); } catch (e) { if (e instanceof EnvelopeError) throw new JournalError(e.message); throw e; }
  const key = keyOf(envelope);
  const line = `${JSON.stringify({ journal: JOURNAL_SCHEMA, key, at, envelope })}\n`;
  if (Buffer.byteLength(line) > MAX_LINE) throw new JournalError(`an envelope line is at most ${MAX_LINE} bytes`);

  if (where.inside) { await ensureDir(join(where.top, PLAN_DIR)); await safeWrite(where.top, `${PLAN_DIR}/.gitignore`, '*\n'); }
  await ensureDir(dirname(where.path));
  const lock = `${where.path}.lock`;
  let held;
  try { held = await open(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch (e) { if (e.code === 'EEXIST') throw new JournalError(`another writer holds ${lock}; inspect it before writing (a stale lock is removed by hand, never assumed)`); throw e; }
  try {
    const current = await readJournal({ root, night, dir });
    if (current.state === 'unreadable') throw new JournalError(`the journal is unreadable (${current.gaps[0].reason}); it is preserved, never replaced`);
    if (current.gaps.length) throw new JournalError(`the journal has unreadable lines (${current.gaps.map(g => g.at).join(', ')}); inspect them before appending`);
    const prev = current.decisions.find(d => d.id === envelope.id)?.latest;
    if (prev && same(prev, envelope)) return { written: false, why: 'duplicate', key, path: where.path };
    if (prev) { const p = revisionProblem(prev, envelope); if (p) throw new JournalError(`${envelope.id}: ${p}`); }
    // Another decision already claims this operation: one operation, one decision.
    const claimed = current.decisions.find(d => d.id !== envelope.id && keyOf(d.latest) === key && key.startsWith('operation:'));
    if (claimed) throw new JournalError(`${key} is already the operation of ${claimed.id}`);
    let file;
    try { file = await open(where.path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600); }
    catch (e) { throw new JournalError(`refusing to write ${where.path}: ${e.code === 'ELOOP' ? 'it is a symlink' : e.code ?? e.message}`); }
    try { await file.write(line); } finally { await file.close(); }
    return { written: true, line: current.entries.length + 1, key, path: where.path };
  } finally {
    await held.close();
    await unlink(lock);
  }
}
