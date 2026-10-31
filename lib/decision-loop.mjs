// Phase 150: every decision says what evidence it used, and comes back to be
// checked (docs/phases/150-every-decision-names-its-evidence-and-is-checked-later.md).
//
// Where Plates records a decision today, and what each already stores:
//
//   decision fence    a `plates-decision` (or `keel-decision`) JSON fence in
//                     docs/decisions, or in an explicitly anchored section of
//                     docs/phases, docs/projects, docs/research, docs/design.md
//                     (read by decision-context.mjs): id, status, scope,
//                     decided_by, decided_at, supersedes, superseded_by.
//                     Structured: the loop's fields go in the fence itself.
//   health proposal   a health page's ## Proposal, settled by `plates walk
//                     decide`: a `**Decided <date>: accepted|declined** — why`
//                     line, or a structured time/hygiene proposal's lifecycle
//                     (state, decidedAt, reason, issue). The loop's fields go
//                     in a `plates-check` JSON fence in that same section.
//   lesson decided    a docs/inbox proposal, settled by `plates learn decide`:
//                     front matter status (accepted, declined, linked), outcome,
//                     note, and dated lines under ## Decision. The loop's fields
//                     go in a `plates-check` fence under that ## Decision.
//   walk choice       `plates walk done --choice`: a "Chose: …" line appended to
//                     the phase's evidence file. Prose only: no check.
//   open item settled a phase's Deliberately open item settled in place, dated,
//                     in prose (and its Trajectory). Prose only: no check.
//   private lesson    a private inbox issue's label and closing comment, on
//                     GitHub only. Not a local record: no check.
//
// The loop's fields, all optional and all together: evidence (paths, run URLs,
// measures the decision relied on), expects (one checkable sentence), checkBy
// (YYYY-MM-DD); door (reversible | windowed | irreversible) until phase 145's
// door classes exist; and, once checked, outcome: { outcome: held | adjust |
// reverse, observedIn: <evidence ref>, at: YYYY-MM-DD }. There is no verb for
// an outcome: it is written by editing the record, and the gate
// (tests/decision-loop.test.mjs reads plates's own records) refuses an outcome
// without observedIn, or a reverse of an irreversible decision.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { markdown, jsonFence } from '../practices/reconciliation/files/scripts/plates/reconcile.mjs';
import { parseTimeProposal } from '../practices/night/files/scripts/plates/time-proposals.mjs';
import { parseHygieneProposal } from '../practices/night/files/scripts/plates/hygiene-proposals.mjs';
import { healthDirOf } from '../practices/night/files/scripts/plates/lib.mjs';

export const OUTCOMES = Object.freeze(['held', 'adjust', 'reverse']);
export const DOORS = Object.freeze(['reversible', 'windowed', 'irreversible']);
/** A check recorded within this many days after checkBy is on time; past it, an unchecked decision is overdue. */
export const CHECK_GRACE_DAYS = 7;
export const DECISION_BOUND = 50;
export const DECISION_MONTHS = 3;
export const CHECK_FENCE = 'plates-check';
/** The kinds that are prose only: listed, never checked. */
export const PROSE_KINDS = Object.freeze([
  { kind: 'walk-choice', where: 'a phase evidence file ("Chose: …", plates walk done --choice)', check: 'no check: prose only' },
  { kind: 'open-settled', where: "a phase's Deliberately open item settled in place, and its Trajectory", check: 'no check: prose only' },
  { kind: 'private-lesson', where: "a private inbox issue's label and closing comment (GitHub)", check: 'no check: not a local record' },
]);
const ROOTS = ['docs/phases', 'docs/projects', 'docs/decisions', 'docs/research', 'docs/design.md'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;

export class DecisionLoopError extends Error {}

const isDate = s => typeof s === 'string' && DATE.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const text1 = s => typeof s === 'string' && s.trim() && !/[\r\n]/.test(s);
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Has the record any of the loop's fields? */
const tracked = d => ['evidence', 'expects', 'checkBy', 'outcome'].some(k => d[k] !== undefined && d[k] !== null);
/** Does it carry a complete check? */
export const hasCheck = d => Array.isArray(d.evidence) && d.evidence.length > 0 && text1(d.expects) && isDate(d.checkBy);

/**
 * The outcome's rule, alone: null when it may be recorded, else why not. A
 * reverse of an irreversible decision says what can still be done.
 */
export function outcomeProblem(decision, outcome) {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) return 'an outcome is { outcome, observedIn, at }';
  if (!OUTCOMES.includes(outcome.outcome)) return `outcome must be one of ${OUTCOMES.join(', ')}`;
  if (!text1(outcome.observedIn)) return 'an outcome needs observedIn: the evidence it was judged on (a path, a run URL or a measure)';
  if (!isDate(outcome.at)) return 'an outcome needs at: the date it was recorded (YYYY-MM-DD)';
  if (!hasCheck(decision)) return 'an outcome needs a check to judge: evidence, expects and checkBy on the decision';
  if (isDate(decision.decidedAt) && outcome.at < decision.decidedAt) return `an outcome cannot predate its decision (${decision.decidedAt})`;
  if (outcome.outcome === 'reverse' && decision.door === 'irreversible') {
    return `${decision.ref ?? 'this decision'} cannot be reversed: its door is irreversible. What can still be done: record adjust (with observedIn), and decide a successor that supersedes it or a compensating change that limits its effect`;
  }
  return null;
}

/** Every problem with a record's loop fields: [] when valid, or when it has none. */
export function loopProblems(d) {
  if (!tracked(d)) return d.door !== undefined && !DOORS.includes(d.door) ? [`door must be one of ${DOORS.join(', ')}`] : [];
  const out = [];
  const given = ['evidence', 'expects', 'checkBy'].filter(k => d[k] !== undefined && d[k] !== null);
  if (given.length && given.length < 3) out.push('evidence, expects and checkBy go together');
  if (d.evidence !== undefined && (!Array.isArray(d.evidence) || !d.evidence.length || !d.evidence.every(text1))) out.push('evidence is a list of paths, run URLs or measures');
  if (d.expects !== undefined && !text1(d.expects)) out.push('expects is one checkable sentence');
  if (d.checkBy !== undefined && !isDate(d.checkBy)) out.push('checkBy is a date, YYYY-MM-DD');
  if (isDate(d.checkBy) && isDate(d.decidedAt) && d.checkBy < d.decidedAt) out.push(`checkBy predates the decision (${d.decidedAt})`);
  if (d.door !== undefined && !DOORS.includes(d.door)) out.push(`door must be one of ${DOORS.join(', ')}`);
  if (d.outcome !== undefined && d.outcome !== null && !out.length) { const p = outcomeProblem(d, d.outcome); if (p) out.push(p); }
  return out;
}

/** The pure write: the decision with its outcome, or refused (DecisionLoopError) with why. */
export function recordOutcome(decision, outcome) {
  if (decision.outcome) throw new DecisionLoopError(`${decision.ref} already has an outcome (${decision.outcome.outcome}, ${decision.outcome.at})`);
  const problem = outcomeProblem(decision, outcome);
  if (problem) throw new DecisionLoopError(problem);
  return { ...decision, outcome: { outcome: outcome.outcome, observedIn: outcome.observedIn.trim(), at: outcome.at } };
}

const loopFields = v => Object.fromEntries(['evidence', 'expects', 'checkBy', 'door', 'outcome'].filter(k => v[k] !== undefined).map(k => [k, v[k]]));

// ---- reading the records -------------------------------------------------------

/** Accepted (or superseded) decision fences in one markdown file. */
export function fenceDecisions(path, text) {
  const out = [], gaps = [];
  for (const f of markdown(text).fences.filter(f => f.identity === 'fence:keel-decision' && (path.startsWith('docs/decisions/') || f.section.explicit))) {
    let v;
    try { v = jsonFence(f); } catch (e) { gaps.push({ path, reason: e.message }); continue; }
    if (!['accepted', 'superseded'].includes(v.status)) continue;
    out.push({ kind: 'decision-fence', ref: `${path}#${v.id}`, path, title: f.section.title || String(v.id), decision: v.status, decidedAt: v.decided_at ?? null, ...loopFields(v) });
  }
  return { decisions: out, gaps };
}

function checkFence(section, path, gaps) {
  const fences = markdown(section).fences.filter(f => f.type === CHECK_FENCE);
  if (fences.length > 1) { gaps.push({ path, reason: `more than one ${CHECK_FENCE} fence` }); return null; }
  if (!fences.length) return {};
  try { return loopFields(jsonFence(fences[0])); } catch (e) { gaps.push({ path, reason: `${CHECK_FENCE}: ${e.message}` }); return null; }
}
const sectionOf = (text, name) => {
  const head = new RegExp(`^## ${name}[ \\t]*\\r?\\n`, 'm').exec(text);
  if (!head) return null;
  const rest = text.slice(head.index + head[0].length), next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
};

/** A health page's decided proposal (walk decide), with its check fence. */
export function healthDecision(path, text) {
  const gaps = [], section = sectionOf(text, 'Proposal');
  if (!section) return { decision: null, gaps };
  let decided = null, measure = /^\s*\*\*`([a-z0-9_]+)`\*\*/.exec(section)?.[1] ?? null;
  const legacy = /^\*\*Decided (\d{4}-\d{2}-\d{2}): (accepted|declined)\*\*/m.exec(section);
  if (legacy) decided = { at: legacy[1], state: legacy[2] };
  for (const parse of [parseTimeProposal, parseHygieneProposal]) {
    const { proposal } = parse(text);
    if (proposal && ['accepted', 'declined'].includes(proposal.lifecycle?.state)) { decided = { at: proposal.lifecycle.decidedAt?.slice(0, 10) ?? null, state: proposal.lifecycle.state }; measure = proposal.measure ?? measure; }
  }
  const fields = checkFence(section, path, gaps);
  if (fields === null) return { decision: null, gaps };
  if (!decided) {
    if (tracked(fields)) gaps.push({ path, reason: `${CHECK_FENCE} on a proposal not yet decided` });
    return { decision: null, gaps };
  }
  const page = path.split('/').at(-1).slice(0, 10);
  return { decision: { kind: 'health-proposal', ref: `${path}#proposal`, path, title: `health proposal (${page})${measure ? `: ${measure}` : ''}`, decision: decided.state, decidedAt: decided.at, ...fields }, gaps };
}

/** A docs/inbox proposal decided by plates learn decide, with its check fence. */
export function lessonDecision(path, text) {
  const gaps = [], front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const status = front && /^status: (\S+)$/m.exec(front[1])?.[1];
  if (!['accepted', 'declined', 'linked'].includes(status)) return { decision: null, gaps };
  const section = sectionOf(text, 'Decision') ?? '';
  const fields = checkFence(section, path, gaps);
  if (fields === null) return { decision: null, gaps };
  const dates = [...section.matchAll(/^- (\d{4}-\d{2}-\d{2}):/gm)].map(m => m[1]);
  const title = /^# (.*)$/m.exec(text.slice(front[0].length))?.[1] ?? path;
  return { decision: { kind: 'lesson', ref: path, path, title: `lesson decided: ${clip(title, 100)}`, decision: status, decidedAt: dates.at(-1) ?? null, ...fields }, gaps };
}

async function markdownFiles(root, rel, depth = 0) {
  if (depth > 8) return [];
  let names;
  try { names = await readdir(join(root, rel), { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOTDIR') return rel.endsWith('.md') ? [rel] : []; if (e.code === 'ENOENT') return []; throw e; }
  const out = [];
  for (const n of names.sort((a, b) => a.name.localeCompare(b.name))) {
    if (n.isDirectory()) out.push(...await markdownFiles(root, `${rel}/${n.name}`, depth + 1));
    else if (n.isFile() && n.name.endsWith('.md')) out.push(`${rel}/${n.name}`);
  }
  return out;
}
const healthDir = async root => {
  try { return healthDirOf(JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8'))); } catch { return 'docs/health'; }
};

/**
 * Every decision record under root, in the kinds that are structured:
 * { decisions: [{ kind, ref, path, title, decision, decidedAt, evidence?,
 * expects?, checkBy?, door?, outcome?, problems }], problems: [{ ref, problem }],
 * gaps: [{ path, reason }], prose: PROSE_KINDS }.
 */
export async function collectDecisions(root, { health } = {}) {
  const decisions = [], gaps = [];
  const files = [];
  for (const rel of ROOTS) files.push(...await markdownFiles(root, rel));
  for (const path of files) {
    const r = fenceDecisions(path, await readFile(join(root, path), 'utf8'));
    decisions.push(...r.decisions); gaps.push(...r.gaps);
  }
  const hdir = health ?? await healthDir(root);
  for (const path of (await markdownFiles(root, hdir)).filter(p => /\/\d{4}-\d{2}-\d{2}\.md$/.test(p))) {
    const r = healthDecision(path, await readFile(join(root, path), 'utf8'));
    if (r.decision) decisions.push(r.decision);
    gaps.push(...r.gaps);
  }
  for (const path of await markdownFiles(root, 'docs/inbox')) {
    const r = lessonDecision(path, await readFile(join(root, path), 'utf8'));
    if (r.decision) decisions.push(r.decision);
    gaps.push(...r.gaps);
  }
  for (const d of decisions) d.problems = loopProblems(d);
  return { decisions, problems: decisions.flatMap(d => d.problems.map(problem => ({ ref: d.ref, problem }))), gaps, prose: PROSE_KINDS };
}

/** What can arrive after a decision: dated evidence files and phases' status changes (their since:). */
export async function readArrivals(root) {
  const evidence = (await markdownFiles(root, 'docs/evidence')).map(path => ({ path, date: /\/(\d{4}-\d{2}-\d{2})-[^/]*\.md$/.exec(path)?.[1] })).filter(e => isDate(e.date));
  const phases = [];
  for (const path of await markdownFiles(root, 'docs/phases')) {
    const m = /^docs\/phases\/(\d+)-[^/]*\.md$/.exec(path);
    if (!m) continue;
    const text = await readFile(join(root, path), 'utf8');
    const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
    const status = /^status:\s*(\S+)/m.exec(front)?.[1], since = /^since:\s*(\d{4}-\d{2}-\d{2})/m.exec(front)?.[1];
    if (status && isDate(since)) phases.push({ phase: Number(m[1]), path, status, since, title: /^# (.*)$/m.exec(text)?.[1] ?? '' });
  }
  return { evidence, phases };
}

/** The evidence that arrived after the decision, up to date: { evidence, phases }. */
export function arrivedSince(arrivals, since, date) {
  const within = d => isDate(since) && d > since && d <= date;
  return {
    evidence: arrivals.evidence.filter(e => within(e.date)).sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path)),
    phases: arrivals.phases.filter(p => within(p.since)).sort((a, b) => a.since.localeCompare(b.since) || a.phase - b.phase),
  };
}

/**
 * Pure: the decisions sorted by where their check stands on `date`.
 * due (checkBy passed, no outcome; each with what arrived since and whether it
 * is overdue past the grace), upcoming, checked, and noCheck (no evidence,
 * expects and checkBy).
 */
export function checksFor(decisions, { date, arrivals = { evidence: [], phases: [] } }) {
  if (!isDate(date)) throw new DecisionLoopError('a date, YYYY-MM-DD');
  const out = { due: [], upcoming: [], checked: [], noCheck: [] };
  for (const d of decisions) {
    if (d.problems?.length) continue;
    if (!hasCheck(d)) { out.noCheck.push(d); continue; }
    if (d.outcome) { out.checked.push(d); continue; }
    if (d.checkBy > date) { out.upcoming.push(d); continue; }
    out.due.push({ ...d, overdue: addDays(d.checkBy, CHECK_GRACE_DAYS) < date, arrived: arrivedSince(arrivals, d.decidedAt, date) });
  }
  out.due.sort((a, b) => a.checkBy.localeCompare(b.checkBy) || a.ref.localeCompare(b.ref));
  return out;
}

const names = (xs, n, f) => (xs.length ? `${xs.slice(0, n).map(f).join(', ')}${xs.length > n ? ` and ${xs.length - n} more` : ''}` : 'none');

/** One due check as a board item: the owner's, kind check. */
export function checkItem(d) {
  const a = d.arrived;
  return {
    waits: 'owner', kind: 'check', source: 'decisions', title: `check decision: ${clip(d.title, 100)}`,
    why: `${d.overdue ? 'overdue' : 'due'} ${d.checkBy}; expected: ${clip(d.expects, 200)}. Since ${d.decidedAt ?? 'the decision'}: evidence ${names(a.evidence, 3, e => e.path)}; phases ${names(a.phases, 3, p => `${p.phase} ${p.status}`)}. Record held, adjust or reverse with observedIn in the record.`,
    read: d.path, link: null, ref: d.ref, checkBy: d.checkBy, expects: d.expects, evidence: d.evidence, door: d.door ?? null, arrived: a, actions: [],
  };
}

/**
 * The board's decisions source: { items, why, tracked }. A due check waits on
 * the owner; a record whose loop fields break the rule is broken. tracked is
 * how many records carry the loop's fields; the board lists the source only
 * when one does.
 */
export async function decisionItems(root, { today }) {
  const [found, arrivals] = await Promise.all([collectDecisions(root), readArrivals(root)]);
  const c = checksFor(found.decisions, { date: today, arrivals });
  const items = [
    ...c.due.map(checkItem),
    ...found.decisions.filter(d => d.problems.length).map(d => ({ waits: 'broken', kind: 'check', source: 'decisions', title: `decision record breaks the check rule: ${clip(d.ref, 120)}`, why: d.problems.join('; '), read: d.path, link: null, ref: d.ref, actions: [] })),
  ];
  const count = found.decisions.filter(tracked).length;
  const why = `${c.due.length} due, ${c.upcoming.length} upcoming, ${c.checked.length} checked; ${c.noCheck.length} with no check${found.gaps.length ? `; ${found.gaps.length} unreadable: ${names(found.gaps, 2, g => `${g.path} (${g.reason})`)}` : ''}`;
  return { items, why, tracked: count };
}

// ---- health ------------------------------------------------------------------

const monthOf = date => date.slice(0, 7);
const monthsBack = (date, n) => {
  const [y, m] = date.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => { const t = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)); return t.toISOString().slice(0, 7); });
};

/**
 * Pure: by month of checkBy, the decisions whose check came due: on time
 * (outcome within the grace), late (outcome after it), overdue (none, grace
 * passed), pending (none, within the grace); and of the checked, how many held,
 * needed adjusting, or were reversed.
 */
export function checksByMonth(decisions, { date, months = DECISION_MONTHS }) {
  const rows = monthsBack(date, months).map(month => ({ month, due: 0, onTime: 0, late: 0, overdue: 0, pending: 0, held: 0, adjust: 0, reverse: 0, lateShare: null, heldShare: null, unchecked: [] }));
  for (const d of decisions) {
    if (d.problems?.length || !hasCheck(d) || d.checkBy > date) continue;
    const row = rows.find(r => r.month === monthOf(d.checkBy));
    if (!row) continue;
    row.due++;
    const grace = addDays(d.checkBy, CHECK_GRACE_DAYS);
    if (d.outcome) { row[d.outcome.at <= grace ? 'onTime' : 'late']++; row[d.outcome.outcome]++; if (d.outcome.at > grace) row.unchecked.push(d.ref); }
    else if (grace < date) { row.overdue++; row.unchecked.push(d.ref); }
    else row.pending++;
  }
  for (const r of rows) {
    const judged = r.onTime + r.late + r.overdue, checked = r.onTime + r.late;
    r.lateShare = judged ? Math.round((100 * (r.late + r.overdue)) / judged) : null;
    r.heldShare = checked ? Math.round((100 * r.held) / checked) : null;
  }
  return rows;
}

/** The health reading: the worst month's share of due checks not made on time; n/a when no check has come due. */
export function checkReading(decisions, { date, bound = DECISION_BOUND, months = DECISION_MONTHS, gaps = [] }) {
  const rows = checksByMonth(decisions, { date, months });
  const span = `${rows[0].month} to ${rows.at(-1).month}`;
  const gapNote = gaps.length ? `; ${gaps.length} unreadable` : '';
  const facts = { months: rows, window: months, bound, grace: CHECK_GRACE_DAYS, flagged: rows.filter(r => r.lateShare !== null && r.lateShare > bound).map(r => r.month), gaps };
  const judged = rows.filter(r => r.lateShare !== null);
  if (!judged.length) return { na: `no decision check came due past its ${CHECK_GRACE_DAYS}-day grace in ${span}${gapNote}`, facts };
  const worst = judged.reduce((a, b) => (b.lateShare > a.lateShare ? b : a));
  facts.worst = worst.month;
  return {
    value: worst.lateShare,
    detail: `${judged.map(r => `${r.month}: ${r.onTime} of ${r.onTime + r.late + r.overdue} checked on time (${100 - r.lateShare}%; late ${r.late}, overdue ${r.overdue}); held ${r.held} of ${r.onTime + r.late} checked${r.heldShare === null ? '' : ` (${r.heldShare}%)`}, adjust ${r.adjust}, reverse ${r.reverse}`).join('; ')}; ${span}${gapNote}`,
    facts,
  };
}

/** The instrument plates improve hands the decisions_checked_late measure. */
export async function decisionChecks({ root, now = Date.now(), bound = DECISION_BOUND }) {
  const { decisions, gaps } = await collectDecisions(root);
  const date = new Date(now).toISOString().slice(0, 10);
  if (!decisions.some(hasCheck)) return { na: `no decision carries a check (evidence, expects, checkBy)${gaps.length ? `; ${gaps.length} unreadable` : ''}` };
  return checkReading(decisions, { date, bound, gaps });
}
