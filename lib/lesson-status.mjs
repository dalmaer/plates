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
// The session trial finish carries `lessonStatus`. So do two end-of-attempt
// records added for the robot and the conductor:
// - robot: the robot-state marker it writes on the issue when an attempt ends
//   (published, failed or question) says verified and rework, and carries the
//   lesson status the agent's final report ends with (scripts/plates/robot.mjs).
// - conductor: the evidence file's front matter, `attempt: {...}` with the same
//   fields as a finish (accepted, verified, rework, lessonStatus).
// Each is checked by attemptProblem. The field is optional on every record; the
// rule (a failed or reworked attempt names it) applies to records written from
// LESSON_STATUS_SINCE. From then on, a record that does not say how its attempt
// ended (an evidence file without the front matter) stays valid and is listed as
// without a status; earlier ones are not attempts this reader can judge.
import { readdir, readFile } from 'node:fs/promises';
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

const ATTEMPT_KEYS = ['accepted', 'verified', 'rework', 'lessonStatus'];
const ATTEMPT_SHAPE = 'an evidence attempt must be front matter `attempt: {"accepted":true|false,"verified":true|false,"rework":<count>,"lessonStatus":{...}}`';
/**
 * The conductor's end-of-attempt record in an evidence file: its front matter's
 * `attempt:` line, as { record }, or { problem } when malformed; null when the file
 * has no front matter or no attempt in it.
 */
export function evidenceAttempt(text) {
  const lines = String(text).split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return { problem: 'evidence front matter is not closed with ---' };
  const found = lines.slice(1, end).filter(l => /^attempt:/.test(l));
  if (!found.length) return null;
  if (found.length > 1) return { problem: 'evidence front matter names attempt more than once' };
  let record;
  try { record = JSON.parse(found[0].slice('attempt:'.length)); } catch { return { problem: ATTEMPT_SHAPE }; }
  if (!object(record) || Object.keys(record).some(k => !ATTEMPT_KEYS.includes(k))
    || ['accepted', 'verified'].some(k => record[k] !== undefined && typeof record[k] !== 'boolean')
    || (record.rework !== undefined && !(Number.isSafeInteger(record.rework) && record.rework >= 0))) return { problem: ATTEMPT_SHAPE };
  return { record };
}

const since = () => Date.parse(LESSON_STATUS_SINCE);
/** One attempt from a record that says how it ended, or doesn't (outcome unknown). */
function attemptOf(source, id, at, record) {
  const said = ['accepted', 'verified', 'rework'].some(k => Object.hasOwn(record, k));
  const outcome = said ? attemptOutcome(record) : 'unknown';
  const problem = record.lessonStatus !== undefined ? lessonStatusProblem(record.lessonStatus) : said && since() <= Date.parse(at) ? attemptProblem(record) : null;
  return { source, id, at, outcome, status: object(record.lessonStatus) ? record.lessonStatus.status ?? null : null, problem };
}

/** The conductor's attempts: docs/evidence/<date>-<slug>.md front matter. */
export async function readEvidenceAttempts(root) {
  const base = join(root, 'docs', 'evidence'), attempts = [], gaps = [];
  if (!await safePath(base)) return { attempts, gaps };
  for (const entry of (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const id = `evidence/${entry.name}`, day = /^(\d{4}-\d{2}-\d{2})-/.exec(entry.name)?.[1];
    let text;
    try { text = await readFile(join(base, entry.name), 'utf8'); } catch { gaps.push({ source: id, reason: 'unreadable evidence' }); continue; }
    const read = evidenceAttempt(text), at = day && Number.isFinite(Date.parse(day)) ? new Date(`${day}T00:00:00.000Z`).toISOString() : null;
    if (!at) { if (read) gaps.push({ source: id, reason: 'evidence attempt without a dated file name' }); continue; }
    if (read?.problem) attempts.push({ source: 'conductor', id, at, outcome: 'unknown', status: null, problem: read.problem });
    else if (read) attempts.push(attemptOf('conductor', id, at, read.record));
    else if (since() <= Date.parse(at)) attempts.push({ source: 'conductor', id, at, outcome: 'unknown', status: null, problem: null });
  }
  return { attempts, gaps };
}

/**
 * The robot's attempts: the robot-state markers it wrote on the repository's issues
 * in the window (written by scripts/plates/robot.mjs robotComment). An unread history is a gap.
 */
/** Every end-of-attempt record the robot (github-actions[bot]) wrote in these issue comments, as written; a state that does not parse is null. */
export function robotAttempts(comments, markerHeader) {
  const attempts = [];
  for (const c of comments ?? []) {
    if (c?.user?.type !== 'Bot' || c.user.login !== 'github-actions[bot]') continue;
    const header = markerHeader(String(c.body ?? ''), ['marker:keel:robot-note', 'marker:keel:robot-state']);
    if (!header || !/^[a-f0-9]{64}$/.test(header.marks['marker:keel:robot-note'].payload)) continue;
    let state = null;
    try { const s = JSON.parse(header.marks['marker:keel:robot-state'].payload); if (object(s)) state = s; } catch { state = null; }
    attempts.push({ commentId: c.id, state });
  }
  return attempts;
}

export async function readRobotAttempts({ repo, github, now = Date.now(), weeks = LESSON_WEEKS }) {
  const { markerHeader } = await import('../practices/night/files/scripts/plates/names.mjs');
  const { robotPages, robotGithub, robotRepo } = await import('../practices/night/files/scripts/plates/robot-delivery.mjs');
  const attempts = [], gaps = [];
  if (!robotRepo(repo)) return { attempts, gaps: [{ source: 'robot', reason: 'no repository to read robot attempts from' }] };
  const from = new Date(now - weeks * 7 * DAY).toISOString();
  let comments;
  try { comments = await robotPages(github ?? robotGithub, `/repos/${repo}/issues/comments?since=${from}`, 10); }
  catch (e) { return { attempts, gaps: [{ source: 'robot', reason: `robot attempt records unread: ${e.message}` }] }; }
  for (const { commentId, state } of robotAttempts(comments, markerHeader)) {
    const at = Date.parse(state?.completedAt);
    if (!state || !Number.isSafeInteger(state.issueNumber) || !Number.isFinite(at)) { gaps.push({ source: `robot comment ${commentId}`, reason: 'malformed robot state' }); continue; }
    const attempt = attemptOf('robot', `${repo}#${state.issueNumber}@${commentId}`, new Date(at).toISOString(), state);
    if (attempt.outcome === 'unknown' && at < since() && attempt.status === null) continue;
    attempts.push(attempt);
  }
  return { attempts, gaps };
}

/** Every attempt Plates can read for root: session trials and evidence; robot states when given a repository. */
export async function readAllAttempts(root, { robot } = {}) {
  const trials = await readAttempts(root), evidence = await readEvidenceAttempts(root);
  const robots = robot ? await readRobotAttempts(robot) : { attempts: [], gaps: [] };
  return { attempts: [...trials.attempts, ...evidence.attempts, ...robots.attempts], gaps: [...trials.gaps, ...evidence.gaps, ...robots.gaps], experiments: trials.experiments, robot: Boolean(robot) };
}

/** The gate's reading: every attempt record under root (and the robot's, when given) that breaks the rule. */
export async function checkLessonStatuses(root, { robot } = {}) {
  const { attempts, gaps } = await readAllAttempts(root, { robot });
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
  const rows = labels.map(week => ({ week, failed: 0, captured: 0, known: 0, none: 0, missing: 0, share: null, untaught: [], unstated: [] }));
  for (const a of attempts) {
    if (a.outcome === 'ok' || Date.parse(a.at) > now) continue;
    const row = rows.find(r => r.week === isoWeek(Date.parse(a.at)));
    if (!row) continue;
    const status = LESSON_STATUSES.includes(a.status) ? a.status : 'missing';
    // An attempt whose record does not say how it ended is not a failure; without a status it is listed, not judged.
    if (a.outcome === 'unknown' && status !== 'missing') continue;
    if (a.outcome !== 'unknown') row.failed++;
    row[status]++;
    if (status === 'none') row.untaught.push(a.id);
    if (status === 'missing') row.unstated.push(a.id);
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
  const unstated = rows.flatMap(r => r.unstated);
  const missingNote = missing ? `; ${missing} without a status, listed as untaught (written before phase 148, or a record that does not say): ${unstated.slice(0, 4).join(', ')}${unstated.length > 4 ? ', …' : ''}` : '';
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

/** The robot's records are read when the project configures the robot and names its repository. */
async function robotSource(root, github, now) {
  let config;
  try { config = JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8')); } catch { return undefined; }
  return object(config) && object(config.robot) && typeof config.repo === 'string' ? { repo: config.repo, github, now } : undefined;
}

/** The instrument plates improve hands the failures_untaught measure. */
export async function lessonCapture({ root, now = Date.now(), bound = LESSON_BOUND, github }) {
  const robot = await robotSource(root, github, now);
  const { attempts, gaps, experiments } = await readAllAttempts(root, { robot });
  if (!experiments && !attempts.length && !gaps.length && !robot) return { na: 'no agent attempt records: no session trial experiment, evidence attempt or robot' };
  return captureReading(attempts, { now, bound, gaps, experiments });
}
