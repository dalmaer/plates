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
    const shapes = crons.map(c => ({ ...cronShape(c), next: cronNext(c, now) })), nexts = shapes.map(x => x.next).filter(Boolean).sort();
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

/** A plate Recurring lists: read, or read before and now stale; never loading or unavailable (as the backlog's backlogReadable). */
const readable = project => ['complete', 'partial', 'stale'].includes(project?.state);
/**
 * One plate's routinesOf input from its Home value (its `recurring`, from the
 * same default-branch read in both forms, and its `daily`) and its runs as the
 * form could read them. A plate not read, or read without its workflows, is { na }.
 */
export function recurringInputOf(project, runs) {
  const base = { projectId: project?.id ?? null, projectName: project?.name ?? project?.id ?? null };
  if (!readable(project)) return { ...base, state: project?.state === 'loading' ? 'loading' : 'not read', na: project?.gaps?.[0]?.reason ?? 'the plate was not read' };
  if (!record(project.recurring) || !Array.isArray(project.recurring.workflows)) return { ...base, state: 'not read', na: 'its workflows were not read' };
  return { ...base, state: project.state === 'stale' ? 'stale' : 'read', config: project.recurring.config ?? {}, workflows: project.recurring.workflows, daily: project.daily ?? null,
    runs: runs ?? { state: 'unavailable', why: 'not read' } };
}
/** Whether Recurring should read a plate's runs: it is listed and one of its routines has no night journal to answer for it. */
export const wantsRuns = project => readable(project) && record(project.recurring) && Array.isArray(project.recurring.workflows) && project.recurring.workflows.length > 0;

/**
 * A time as a reader sees it, in a time zone: 'time' (14:05 PDT), 'weekday-time'
 * (Mon, 14:05 PDT) or 'datetime' (Mon, Nov 9, 14:05 PDT). The CLI passes its own
 * zone; the hosted page renders UTC and its client says it in the viewer's.
 */
export function timeText(iso, kind, { timeZone = 'UTC', locale = 'en-US' } = {}) {
  const d = new Date(iso ?? '');
  if (!Number.isFinite(d.getTime())) return 'unknown';
  return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
    ...(kind !== 'time' ? { weekday: 'short' } : {}), ...(kind === 'datetime' ? { day: 'numeric', month: 'short' } : {}) }).format(d);
}
/** A routine's schedule as words and times, one part per cron: [{ words, iso?, kind? }]; a renderer formats each time in its zone. */
export function scheduleParts(routine) {
  if (!routine.crons?.length) return [{ words: routine.triggers?.length ? `on ${routine.triggers.filter(t => t !== 'workflow_dispatch').join(', ') || 'request'}` : 'not scheduled' }];
  return routine.shapes.map(x => x.cadence === 'daily' && x.next ? { words: 'daily at', iso: x.next, kind: 'time' }
    : x.cadence === 'weekly' && x.days?.length === 1 && x.next ? { words: 'weekly on', iso: x.next, kind: 'weekday-time' }
    : { words: `cron "${x.cron}" (UTC)` });
}
/** The schedule, next run, last result and budget of a routine, as text in one time zone (the CLI's line; the web's cells say the same). */
export function routineWords(r, zone = {}) {
  const at = p => p.iso ? `${p.words} ${timeText(p.iso, p.kind, zone)}` : p.words;
  const schedule = scheduleParts(r).map(at).join('; ');
  const config = r.config ? `${r.config.key}: ${r.config.value}${r.disagrees ? ' (the workflow\'s cron says otherwise; both shown)' : ''}` : null;
  const next = r.state === 'off' ? `off: ${r.off.why} (${r.off.key})` : r.nextRun ? `next ${timeText(r.nextRun, 'datetime', zone)}` : r.crons.length ? 'next run unknown' : null;
  const last = r.last.result ? `last ${r.last.result}${r.last.at ? ` (${String(r.last.at).slice(0, 16).replace('T', ' ')}${r.last.at.length > 10 ? ' UTC' : ''})` : ''}` : r.last.none;
  const budget = r.budget ? `budget ${r.budget.minutes} min${r.budget.per ? ` a ${r.budget.per}` : ''} (${r.budget.key})` : null;
  return { schedule, config, next, last, budget };
}

/** Recurring in a terminal (plates home --recurring): each plate, then one line per routine, in the reader's time zone. */
export function recurringText(data, { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) {
  const zone = { timeZone }, out = [`plates home --recurring — ${data.plates.length === 1 ? data.plates[0].projectName : 'all plates'} (${String(data.generatedAt).slice(0, 10)}, times in ${timeZone})`, ''];
  for (const plate of data.plates) {
    if (!plate.routines) { out.push(`${plate.projectName}: ${plate.state === 'loading' ? 'loading' : 'not read'}${plate.reason ? ` — ${plate.reason}` : ''}`, ''); continue; }
    out.push(`${plate.projectName}${plate.state === 'stale' ? ' (stale)' : ''} — ${plate.routines.length} routine${plate.routines.length === 1 ? '' : 's'}`);
    if (!plate.routines.length) out.push('  none');
    for (const r of plate.routines) {
      const w = routineWords(r, zone);
      out.push(`  ${r.name}: ${[w.schedule, w.next].filter(Boolean).join(' · ')}`, `      ${[w.last, w.budget, w.config].filter(Boolean).join(' · ')}`);
    }
    for (const g of plate.gaps ?? []) out.push(`  ${g.routine}: ${g.reason}`);
    out.push('');
  }
  const links = (data.links ?? []).filter(l => l.repo || l.canvas || l.production);
  if (links.length) out.push('Links', ...links.map(l => `  ${l.projectName}: ${[l.repo, l.canvas && `canvas ${l.canvas}`, l.production && `production ${l.production}`].filter(Boolean).join(' · ')}`));
  return out.join('\n').replace(/\n+$/, '');
}
