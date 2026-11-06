// Recurring (plates phase 185; docs/specs/web-backlog.md, the sidebar's
// Recurring row): every routine a plate runs, from records that already
// exist. Pure: no reads here. The readers hand it each workflow's schedule
// (lib/web/routines.mjs routineDefinition, over the same default-branch read
// Home makes), the plate's .plates/plates.json, its newest night record
// (project.daily) and, where they could be read, its latest workflow runs.
// Nothing here starts, stops or reschedules anything: a schedule changes in
// its workflow file, through lib/web/job-schedules.mjs.
//
// Next run is computed from the cron in UTC and never guessed: a cron this
// reader cannot evaluate has no next run, and says so. A schedule in
// .plates/plates.json that disagrees with its workflow's cron shows both. An
// off routine says which key turns it off.

/** The routines plates ships, in the order a reader sees them: its workflow, its practice, and its config key. */
export const ROUTINES = Object.freeze([
  { id: 'night', name: 'Night', workflow: '.github/workflows/plates-night.yml', practice: 'night' },
  { id: 'climb', name: 'Climb', workflow: '.github/workflows/plates-climb.yml', practice: 'climb', config: 'climb' },
  { id: 'tend', name: 'Tend', workflow: '.github/workflows/plates-tend.yml', practice: 'climb', config: 'tend' },
  { id: 'morning', name: 'Morning', workflow: '.github/workflows/plates-morning.yml', practice: 'night' },
  { id: 'robot', name: 'Robot', workflow: '.github/workflows/plates-robot.yml', practice: 'climb', config: 'robot' },
  { id: 'cross-review', name: 'Cross-review', workflow: '.github/workflows/plates-cross-review.yml', practice: 'cross-review', config: 'crossReview' },
  { id: 'publish', name: 'Publish', workflow: '.github/workflows/plates-publish.yml', practice: 'delivery' },
]);
/** Budgets plates applies when the config names none (climb.mjs DEFAULTS, tend.mjs TEND_DEFAULTS). */
export const BUDGET_DEFAULTS = Object.freeze({ climb: 45, tend: 30 });
/** The day a weekly climb or tend runs (climb.mjs WEEKLY_DAY): Monday, UTC. */
export const WEEKLY_DAY = 1;
const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const record = v => !!v && typeof v === 'object' && !Array.isArray(v);
const clip = (v, n = 200) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, n) : null;

/** One cron field as the set of values it allows, or null when it is not one this reader evaluates. */
function field(text, min, max) {
  const out = new Set();
  for (const part of String(text).split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    let [lo, hi] = m[1] === '*' ? [min, max] : m[1].split('-').map(Number);
    if (hi === undefined) hi = m[2] ? max : lo;
    const step = m[2] ? Number(m[2]) : 1;
    if (!(lo >= min && hi <= max && lo <= hi && step >= 1)) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}
/** A five-field cron (GitHub's: UTC; Sunday 0 or 7) parsed, or null. */
export function parseCron(cron) {
  const parts = String(cron ?? '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dow] = [field(parts[0], 0, 59), field(parts[1], 0, 23), field(parts[2], 1, 31), field(parts[3], 1, 12), field(parts[4], 0, 7)];
  if (!minute || !hour || !dom || !month || !dow) return null;
  if (dow.has(7)) dow.add(0);
  return { minute, hour, dom, month, dow, domAny: parts[2] === '*', dowAny: parts[4] === '*', parts };
}
/** The first time after `now` a cron fires, as an ISO time in UTC, or null when it cannot be evaluated or never fires within a year. */
export function cronNext(cron, now) {
  const c = typeof cron === 'string' ? parseCron(cron) : cron;
  const at = typeof now === 'number' ? now : Date.parse(now);
  if (!c || !Number.isFinite(at)) return null;
  const start = new Date(Math.floor(at / 60_000) * 60_000 + 60_000);
  const minutes = [...c.minute].sort((a, b) => a - b), hours = [...c.hour].sort((a, b) => a - b);
  for (let d = 0; d <= 366; d++) {
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + d));
    const domOk = c.dom.has(day.getUTCDate()), dowOk = c.dow.has(day.getUTCDay());
    // Standard cron: when both day fields are restricted, either one matching is enough.
    const dayOk = c.month.has(day.getUTCMonth() + 1) && (c.domAny && c.dowAny ? true : c.domAny ? dowOk : c.dowAny ? domOk : domOk || dowOk);
    if (!dayOk) continue;
    for (const h of hours) for (const m of minutes) {
      const t = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m);
      if (t >= start.getTime()) return new Date(t).toISOString();
    }
  }
  return null;
}
/**
 * A cron in words, for the renderers: { cadence: 'daily' | 'weekly' | 'other',
 * days?, at? } where `at` is the UTC "HH:MM" of a cron with one fixed time;
 * the renderer says it in the owner's time zone from the next run.
 */
export function cronShape(cron) {
  const c = parseCron(cron);
  if (!c) return { cadence: 'other', cron };
  const fixed = c.minute.size === 1 && c.hour.size === 1 && c.domAny && c.month.size === 12;
  const at = fixed ? `${String([...c.hour][0]).padStart(2, '0')}:${String([...c.minute][0]).padStart(2, '0')}` : null;
  if (fixed && c.dowAny) return { cadence: 'daily', at, cron };
  if (fixed && c.dow.size >= 1 && c.dow.size < 7) return { cadence: 'weekly', days: [...c.dow].filter(d => d !== 7).sort().map(d => DAYS[d]), at, cron };
  return { cadence: 'other', cron };
}

/** The config's say on a routine: { key, value } for its schedule, or null. Climb and tend take "nightly" or "weekly". */
function configSchedule(def, config) {
  const v = def.config && record(config?.[def.config]) ? config[def.config].schedule : undefined;
  return typeof v === 'string' ? { key: `${def.config}.schedule`, value: clip(v, 40) } : null;
}
/** Whether a cron and a config schedule say the same: nightly is a daily cron, weekly a cron on WEEKLY_DAY. */
function agrees(value, shapes) {
  if (!shapes.length) return false;
  if (value === 'nightly') return shapes.every(s => s.cadence === 'daily');
  if (value === 'weekly') return shapes.every(s => s.cadence === 'weekly' && s.days?.length === 1 && s.days[0] === DAYS[WEEKLY_DAY]);
  return false;
}
/** Why a routine is off, as the key that says so, or null when it is on. */
function offBy(def, config) {
  if (Array.isArray(config?.practices) && !config.practices.includes(def.practice)) return { key: 'practices', why: `"practices" does not include ${def.practice}` };
  if (def.id === 'robot' && config?.robot?.on !== true) return { key: 'robot.on', why: record(config?.robot) && config.robot.on === false ? 'robot.on is false' : 'robot.on is not true (the robot stays off until the owner turns it on)' };
  return null;
}
/** The budget a routine runs under, with the key it comes from, or null when none is set. */
function budgetOf(def, config, daily) {
  const minutes = v => Number.isFinite(v) && v >= 0 ? v : null;
  if (def.id === 'climb' || def.id === 'tend') {
    const set = minutes(config?.[def.id]?.budget?.minutes);
    return set !== null ? { minutes: set, key: `${def.id}.budget.minutes` } : { minutes: BUDGET_DEFAULTS[def.id], key: `${def.id}.budget.minutes (default)` };
  }
  if (def.id === 'robot') { const set = minutes(config?.robot?.budgetMinutes); return set !== null ? { minutes: set, key: 'robot.budgetMinutes', per: 'week' } : null; }
  if (def.id === 'night' && daily?.state === 'read' && minutes(daily.allocatedMinutes) !== null) return { minutes: daily.allocatedMinutes, key: `night record ${daily.date}` };
  return null;
}
/** A workflow run as a last result: { result, at, url, from }. */
const runResult = run => ({ result: run.status === 'completed' ? clip(run.conclusion, 40) ?? 'unknown' : clip(run.status, 40) ?? 'unknown', at: clip(run.at, 40), url: typeof run.url === 'string' && run.url.startsWith('https://github.com/') ? run.url : null, from: 'workflow run' });

/**
 * One plate's routines. plate: { projectId, projectName, config, workflows:
 * [{ path, name, crons, triggers }], daily, runs: { state: 'read', items:
 * [{ path, name, status, conclusion, at, url }] } | { state: 'unavailable',
 * why } }, now. Returns { projectId, projectName, routines, gaps }: each
 * routine { id, name, workflow, triggers, crons, shapes, nextRun, state:
 * 'on' | 'off', off?, config?, disagrees, budget, last }. Each workflow with
 * a schedule appears once; plates's own routines appear when their workflow
 * is there, scheduled or not.
 */
export function routinesOf(plate, { now }) {
  const config = record(plate?.config) ? plate.config : {}, workflows = Array.isArray(plate?.workflows) ? plate.workflows : [];
  const runs = plate?.runs, gaps = [];
  const byPath = new Map(workflows.map(w => [w.path, w]));
  const latest = path => runs?.state === 'read' ? runs.items.filter(r => r.path === path).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] ?? null : null;
  const lastOf = (def, path) => {
    const d = plate?.daily;
    if (def?.id === 'night' && d?.state === 'read' && d.date) return { result: d.counts?.failed > 0 ? `${d.counts.failed} failed` : 'done', at: d.date, url: null, from: 'night journal' };
    const run = latest(path);
    if (run) return runResult(run);
    if (runs?.state === 'read') return { result: null, at: null, url: null, from: 'workflow run', none: 'no run in the latest runs read' };
    return { result: null, at: null, url: null, from: 'workflow run', none: `last run not read: ${clip(runs?.why ?? 'the Actions read is not available here', 160)}` };
  };
  const one = (def, w) => {
    const crons = Array.isArray(w.crons) ? w.crons.filter(c => typeof c === 'string') : [];
    const shapes = crons.map(cronShape), nexts = crons.map(c => cronNext(c, now)).filter(Boolean).sort();
    const cfg = def ? configSchedule(def, config) : null, off = def ? offBy(def, config) : null;
    if (crons.length && nexts.length < crons.length) gaps.push({ projectId: plate?.projectId ?? null, routine: def?.id ?? w.path, reason: 'a cron this reader cannot evaluate: no next run is given for it' });
    return { id: def?.id ?? w.path, name: def?.name ?? clip(w.name, 80) ?? w.path, workflow: w.path, triggers: Array.isArray(w.triggers) ? w.triggers.slice(0, 10) : [], crons, shapes,
      nextRun: off ? null : nexts[0] ?? null, state: off ? 'off' : 'on', ...(off ? { off } : {}), ...(cfg ? { config: cfg } : {}), disagrees: !!cfg && crons.length > 0 && !agrees(cfg.value, shapes),
      budget: def ? budgetOf(def, config, plate?.daily) : null, last: lastOf(def, w.path) };
  };
  const routines = [];
  for (const def of ROUTINES) if (byPath.has(def.workflow)) routines.push(one(def, byPath.get(def.workflow)));
  const known = new Set(ROUTINES.map(d => d.workflow));
  for (const w of [...workflows].sort((a, b) => a.path.localeCompare(b.path))) if (!known.has(w.path) && Array.isArray(w.crons) && w.crons.length) routines.push(one(null, w));
  return { projectId: plate?.projectId ?? null, projectName: plate?.projectName ?? plate?.projectId ?? null, routines, gaps };
}

/** A plate's links from .plates/plates.json: its repo, its canvas and its production site. Only https URLs. */
export function linksOf(project, config) {
  const https = v => typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v) && v.length <= 300 ? v : null;
  const repo = typeof project?.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(project.repo) ? project.repo : null;
  return { projectId: project?.id ?? null, projectName: project?.name ?? project?.id ?? null,
    repo: repo ? `https://github.com/${repo}` : null, canvas: https(config?.canvas?.home), production: https(config?.production?.url) ?? https(config?.delivery?.site) };
}

/** The config fields Recurring and Links read, so a plate's cached value carries only those. */
export function recurringConfig(config) {
  if (!record(config)) return {};
  const pick = (v, keys) => record(v) ? Object.fromEntries(keys.filter(k => v[k] !== undefined).map(k => [k, record(v[k]) ? { ...v[k] } : v[k]])) : undefined;
  const out = { practices: Array.isArray(config.practices) ? config.practices.filter(p => typeof p === 'string').slice(0, 40) : undefined,
    climb: pick(config.climb, ['schedule', 'budget']), tend: pick(config.tend, ['schedule', 'budget']), robot: pick(config.robot, ['on', 'budgetMinutes']),
    crossReview: record(config.crossReview) ? {} : undefined, morning: record(config.morning) ? {} : undefined,
    canvas: record(config.canvas) && typeof config.canvas.home === 'string' ? { home: config.canvas.home } : undefined,
    production: record(config.production) && typeof config.production.url === 'string' ? { url: config.production.url } : undefined,
    delivery: record(config.delivery) && typeof config.delivery.site === 'string' ? { site: config.delivery.site } : undefined };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

/** Every plate's routines and links, the model both forms render (plates home --recurring --json, /api/recurring). */
export function recurringOf(plates, { now }) {
  const at = typeof now === 'number' ? now : Date.parse(now);
  return { schema: 1, generatedAt: new Date(at).toISOString(), plates: plates.map(p => p.na ? { projectId: p.projectId, projectName: p.projectName ?? p.projectId, state: p.state ?? 'not read', reason: p.na, routines: null, gaps: [] }
    : { ...routinesOf(p, { now: at }), state: p.state ?? 'read' }) };
}
