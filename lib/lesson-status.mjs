// Phase 148: every agent attempt says whether it taught something.
//
// The attempt records Plates keeps, and where each ends (settled 2026-10-30):
// - robot: a GitHub issue comment and PR (scripts/plates/robot.mjs); no local record.
// - conductor phase: docs/evidence/<phase>.md, prose the conductor writes.
// - climb: .plates/climb/night.json `tried` (keep/revert), one night, kept as a
//   CI artifact; the script decides the verdict, not the agent.
// - cross-review: PR review comments answered fixed/tracked/not valid.
// - evaluation records (117-123): sealed, digest-frozen schema-2 records.
// - session trials: .plates/session-trials/<id>/state.json `finish` events,
//   written by the agent with accepted, verified and rework observed.
// - phase 146's executor journal: not on main.
// Only the session trial finish is an agent-written attempt with an outcome that
// can carry a field without a migration, so it carries `lessonStatus`. The field
// is optional on the record; the rule (a failed or reworked attempt names it)
// applies to finishes written from LESSON_STATUS_SINCE.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { safePath, readJson } from './session-ledger-io.mjs';

export const LESSON_STATUSES = Object.freeze(['captured', 'known', 'none']);
/** Finish records written before this carry no lesson status; the rule applies after. */
export const LESSON_STATUS_SINCE = '2026-10-30T00:00:00.000Z';
export const LESSON_WEEKS = 4;
export const LESSON_BOUND = 50;
const STATE_LIMIT = 4 * 1024 * 1024;
const DAY = 86400000;
const EXAMPLE = '{"status":"captured","link":"<lesson, proposal or inbox item>"}, {"status":"known","lesson":"<the lesson applied>"} or {"status":"none"}';

const text = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 1024 && !/[\x00-\x1f\x7f]/.test(x);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
/** A link a reader can follow: an https URL, owner/repo#n, or a relative path with an optional #anchor. */
export function lessonLink(x) {
  if (!text(x) || /\s/.test(x)) return false;
  if (/^https:\/\/[^/]+\/\S*$/.test(x)) return true;
  if (/^[\w.-]+\/[\w.-]+#[1-9]\d*$/.test(x)) return true;
  const [path, anchor, ...rest] = x.split('#');
  return !rest.length && (anchor === undefined || /^[\w.-]+$/.test(anchor)) && !path.startsWith('/') && !path.includes('\\') && !path.includes(':')
    && path.split('/').every(s => s && s !== '.' && s !== '..');
}

/** Why a lessonStatus value is malformed, or null. */
export function lessonStatusProblem(value) {
  if (!object(value) || !LESSON_STATUSES.includes(value.status)) return `lessonStatus must be ${EXAMPLE}`;
  const keys = Object.keys(value).sort().join(',');
  if (value.status === 'captured') {
    if (!Object.hasOwn(value, 'link') || !lessonLink(value.link)) return 'lessonStatus captured needs a link to the lesson, proposal or inbox item it captured (a URL, owner/repo#n or a path)';
    if (keys !== 'link,status') return 'lessonStatus captured takes status and link only';
  } else if (value.status === 'known') {
    if (!text(value.lesson)) return 'lessonStatus known needs the lesson it applied, named';
    if (keys !== 'lesson,status') return 'lessonStatus known takes status and lesson only';
  } else if (keys !== 'status') return 'lessonStatus none takes status only';
  return null;
}

/** A session trial finish's outcome: failed (not accepted or not verified), reworked, or ok. */
export function attemptOutcome(finish) {
  if (finish?.accepted === false || finish?.verified === false) return 'failed';
  if (Number.isSafeInteger(finish?.rework) && finish.rework > 0) return 'reworked';
  return 'ok';
}

/** Why an attempt's lesson status fails the rule, or null: a failed or reworked attempt names one; any given is well formed. */
export function attemptProblem(finish) {
  if (finish?.lessonStatus !== undefined) return lessonStatusProblem(finish.lessonStatus);
  const outcome = attemptOutcome(finish);
  return outcome === 'ok' ? null : `a ${outcome} attempt needs lessonStatus: ${EXAMPLE}`;
}

/** Every session trial finish under root, as attempts. Unreadable ledgers are gaps, never empty. */
export async function readAttempts(root) {
  const base = join(root, '.plates', 'session-trials'), attempts = [], gaps = [];
  if (!await safePath(base)) return { attempts, gaps, experiments: 0 };
  let experiments = 0;
  for (const entry of (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.lock') continue;
    if (!entry.isDirectory()) { gaps.push({ source: entry.name, reason: 'unexpected storage entry' }); continue; }
    let ledger;
    try { ledger = await readJson(join(base, entry.name, 'state.json'), STATE_LIMIT); }
    catch (e) { gaps.push({ source: entry.name, reason: e.code === 'ENOENT' ? 'incomplete experiment' : 'unreadable ledger' }); continue; }
    if (!object(ledger) || !Array.isArray(ledger.events)) { gaps.push({ source: entry.name, reason: 'corrupt ledger' }); continue; }
    experiments++;
    for (const event of ledger.events) {
      if (event?.action !== 'finish') continue;
      const record = event.record ?? {}, at = Date.parse(event.at);
      if (!Number.isFinite(at)) { gaps.push({ source: entry.name, reason: 'finish without a timestamp' }); continue; }
      attempts.push({ source: 'session-trials', id: `${entry.name}/${record.runId}`, at: new Date(at).toISOString(), outcome: attemptOutcome(record),
        status: object(record.lessonStatus) ? record.lessonStatus.status ?? null : null, problem: Date.parse(LESSON_STATUS_SINCE) <= at ? attemptProblem(record) : record.lessonStatus === undefined ? null : lessonStatusProblem(record.lessonStatus) });
    }
  }
  return { attempts, gaps, experiments };
}

/** The gate's reading: every attempt record under root that breaks the rule. */
export async function checkLessonStatuses(root) {
  const { attempts, gaps } = await readAttempts(root);
  return { findings: attempts.filter(a => a.problem).map(({ source, id, at, outcome, problem }) => ({ source, id, at, outcome, problem })), gaps };
}

/** ISO 8601 week of a time, as 2026-W44. */
export function isoWeek(ms) {
  const d = new Date(ms), day = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const year = thursday.getUTCFullYear();
  return `${year}-W${String(Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7)).padStart(2, '0')}`;
}

/**
 * Counts by ISO week of the failed or reworked attempts in the window (this
 * week and the ones before it): captured, known, none, and missing (written
 * before the rule). The share is none among those with a status.
 */
export function captureByWeek(attempts, { now, weeks = LESSON_WEEKS }) {
  const labels = Array.from({ length: weeks }, (_, i) => isoWeek(now - (weeks - 1 - i) * 7 * DAY));
  const rows = labels.map(week => ({ week, failed: 0, captured: 0, known: 0, none: 0, missing: 0, share: null, untaught: [] }));
  for (const a of attempts) {
    if (a.outcome === 'ok' || Date.parse(a.at) > now) continue;
    const row = rows.find(r => r.week === isoWeek(Date.parse(a.at)));
    if (!row) continue;
    row.failed++;
    const status = LESSON_STATUSES.includes(a.status) ? a.status : 'missing';
    row[status]++;
    if (status === 'none') row.untaught.push(a.id);
  }
  for (const r of rows) { const n = r.captured + r.known + r.none; r.share = n ? Math.round((100 * r.none) / n) : null; }
  return rows;
}

/** The health reading: the worst week's share of failures that taught nothing; n/a when no week has one with a status. */
export function captureReading(attempts, { now, bound = LESSON_BOUND, weeks = LESSON_WEEKS, gaps = [], experiments = null }) {
  const rows = captureByWeek(attempts, { now, weeks });
  const span = `ISO weeks ${rows[0].week} to ${rows.at(-1).week}`;
  const missing = rows.reduce((n, r) => n + r.missing, 0);
  const gapNote = gaps.length ? `; ${gaps.length} unreadable: ${gaps.map(g => `${g.source} (${g.reason})`).join(', ')}` : '';
  const missingNote = missing ? `; ${missing} without a status (written before phase 148)` : '';
  const facts = { weeks: rows, window: weeks, bound, flagged: rows.filter(r => r.share !== null && r.share > bound).map(r => r.week), gaps, ...(experiments === null ? {} : { experiments }) };
  const judged = rows.filter(r => r.share !== null);
  if (!judged.length) return { na: `no failed or reworked agent attempt with a lesson status in ${span}${missingNote}${gapNote}`, facts };
  const worst = judged.reduce((a, b) => (b.share > a.share ? b : a));
  facts.worst = worst.week;
  return {
    value: worst.share,
    detail: `${judged.map(r => `${r.week}: ${r.none} of ${r.captured + r.known + r.none} failed or reworked attempts taught nothing (${r.share}%; captured ${r.captured}, known ${r.known})`).join('; ')}; ${span}${missingNote}${gapNote}`,
    facts,
  };
}

/** The instrument plates improve hands the failures_untaught measure. */
export async function lessonCapture({ root, now = Date.now(), bound = LESSON_BOUND }) {
  const { attempts, gaps, experiments } = await readAttempts(root);
  if (!experiments && !gaps.length) return { na: 'no agent attempt records: .plates/session-trials holds no experiment' };
  return captureReading(attempts, { now, bound, gaps, experiments });
}
