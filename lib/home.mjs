// plates home: the hosted home's read model, read from the local checkout and
// gh (plates phase 156). The CLI and the web are isomorphic: each plate is
// built by the same reader as the hosted home (lib/web/projects.mjs
// projectFromSource), from the default branch's git objects instead of the
// GitHub App's tree, and the plates are put together by the same model
// (lib/work-items.mjs homeSnapshot). So the two forms show the same items,
// sections and counts for the same sources.
//
//   plates home [--project <id>] [--fresh] [--json]
//
// --json gives /api/home's shape without its transport fields (cursor,
// cursorState, quota: the web's cache and allowance). The sections only the
// CLI can read (loose ends, feedback, the fleet's CI, claims, verify, robot,
// decision checks, earlier health pages) are read here and shown as rows on
// the web, unavailable, with the reason and this command. A source that
// cannot be read (no network, no gh) is a gap with its reason; the local
// sources still render. --names-evidence (the morning workflow's managed-name
// observation, JSON only) reads the local sections and their plan and verify
// history, and no plate.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homeSnapshot, homeSections, homeQueues, HOME_SECTIONS, workItems, viewerLogin, plateIdOf } from './work-items.mjs';
import { githubRead, readRepoReviewState, quotaGuard } from './quota.mjs';
import { rateSpend } from '../practices/night/files/scripts/plates/lib.mjs';
import { planningConfig } from '../practices/night/files/scripts/plates/planning-config.mjs';
import { checkouts, repoOf } from './looseends.mjs';
import { readNotNow, readLastLooked, writeLastLooked } from './not-now.mjs';

export class HomeError extends Error { constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; } }

const git = (dir, args, { encoding = 'utf8' } = {}) => new Promise((done, fail) => {
  execFile('git', ['-C', dir, ...args], { encoding, maxBuffer: 64 * 1024 * 1024, timeout: 30_000 }, (error, stdout) => error ? fail(error) : done(stdout));
});
const isoSecond = value => { const t = Date.parse(value ?? ''); return Number.isFinite(t) ? new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z') : null; };

/** The default branch a checkout last fetched (origin/HEAD), else its HEAD: what the hosted home reads on GitHub. */
async function defaultRevision(dir) {
  for (const ref of ['refs/remotes/origin/HEAD', 'HEAD']) {
    try { return (await git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).trim(); } catch { /* next */ }
  }
  throw new HomeError(`${dir} has no commit to read`);
}

/** One checkout's default-branch tree, as the GitHub App's tree reads: [{ path, type, mode, sha, size }]. */
async function treeOf(dir, rev) {
  const out = await git(dir, ['ls-tree', '-r', '-l', '-z', rev]);
  return out.split('\0').filter(Boolean).map(line => {
    const [meta, path] = line.split('\t');
    const [mode, type, sha, size] = meta.split(/\s+/);
    return { path, mode, type, sha, size: type === 'blob' ? Number(size) : undefined };
  });
}

/** Each plate the lens holds: { project: { id, repoId, repo }, dir } or { project, unavailable }. */
export async function platesOf(root, config, projectId) {
  const repoHere = /^[\w.-]+\/[\w.-]+$/.test(config.repo ?? '') ? config.repo : repoOf((await git(root, ['config', '--get', 'remote.origin.url']).catch(() => '')).trim());
  const idOf = plateIdOf;
  const plates = [{ project: { id: idOf(repoHere ?? config.name), repoId: null, repo: repoHere ?? config.name ?? 'local' }, dir: root }];
  if (config.plates === 'self') {
    const fleet = await readFile(join(root, 'plates.json'), 'utf8').then(JSON.parse).catch(() => []);
    const managed = (Array.isArray(fleet) ? fleet : []).filter(r => r?.role === 'managed' && /^[\w.-]+\/[\w.-]+$/.test(r.repo ?? '') && r.repo.toLowerCase() !== String(repoHere).toLowerCase());
    const found = managed.length ? await checkouts(dirname(root)) : new Map();
    for (const r of managed) {
      const dir = found.get(r.repo.toLowerCase()) ?? found.get(r.repo);
      plates.push({ project: { id: idOf(r.repo), repoId: null, repo: r.repo }, ...(dir ? { dir } : { unavailable: `There is no checkout of ${r.repo} beside this one. Clone it there to read it here.` }) });
    }
  }
  if (projectId === undefined) return plates;
  const chosen = plates.filter(p => p.project.id === projectId);
  if (!chosen.length) throw new HomeError(`no plate "${projectId}" here: ${plates.map(p => p.project.id).join(', ')}`);
  return chosen;
}

/** One plate from its checkout: the hosted home's reader over local git objects, and its reviews through gh. */
async function readPlate({ project, dir, unavailable }, { now, reviews }) {
  // Loaded here, not at the top: the morning's names observation (--names-evidence) never reads plates, and keeps its runtime closure small.
  const { projectFromSource, projectReviews, unavailableProject } = await import('./web/projects.mjs');
  if (unavailable) return unavailableProject(project, unavailable);
  let value;
  try {
    const rev = await defaultRevision(dir);
    const [message, date] = (await git(dir, ['log', '-1', '--format=%B%x00%cI', rev])).split('\0');
    value = await projectFromSource({ project, now, head: { sha: rev, message: message.replace(/\n+$/, '\n').trimEnd(), date: isoSecond(date.trim()) },
      tree: await treeOf(dir, rev), readBlob: entry => git(dir, ['cat-file', 'blob', entry.sha], { encoding: 'buffer' }) });
  } catch (error) {
    return unavailableProject(project, error instanceof HomeError ? error.message : `The checkout at ${dir} could not be read: ${String(error?.code ?? error?.message ?? error).split('\n')[0].slice(0, 160)}`);
  }
  return projectReviews(value, { login: reviews.me, read: reviews.read, unavailable: reviews.unavailable, now });
}

/** Private feedback as rows: the item model's bounded metadata only (feedbackSummary), never its words or paths. */
export const feedbackRows = feedback => (feedback?.items ?? []).map(f => ({ kind: 'feedback', waits: ['pending', 'unavailable'].includes(f.state) ? 'owner' : 'external',
  title: f.id, why: f.state, read: 'plates feedback list', link: f.resolution?.reference ?? null }));

/** The sections only this form reads, from the item model's local sources. */
async function localSections(root, deps, { namesEvidence, shared = new Set(), plate }) {
  const only = ['loose-ends', 'feedback', 'fleet', 'claims', 'verify', 'robot', 'decisions', 'health'];
  const data = await (deps.workItems ?? workItems)({ root, namesEvidence }, { ...deps, only });
  // Each row names its plate and its own id (phase 173's itemKey), and what its answers' writers need.
  const refOf = it => it.source === 'loose-ends' ? it.id : it.source === 'claims' ? `claims/phase-${it.phase}` : it.source === 'health' ? `${it.read}${it.instanceId ? `#${it.instanceId}` : ''}`
    : it.source === 'feedback' ? it.title : createHash('sha1').update(`${it.title}\0${it.read ?? ''}`).digest('hex').slice(0, 10);
  const plain = it => ({ kind: it.kind, waits: it.waits, title: it.title, why: it.why ?? null, read: it.read ?? null, link: it.link ?? null,
    plate: it.repo ? plateIdOf(it.repo) : plate, ref: refOf(it),
    ...Object.fromEntries(['id', 'repo', 'dir', 'phase', 'instanceId', 'since', 'urgent'].filter(k => it[k] !== undefined && it[k] !== null).map(k => [k, it[k]])) });
  const latest = await (async () => { try { return (await import('./work-items.mjs')).healthProposal(root); } catch { return null; } })();
  const read = {};
  const by = name => data.sources.find(s => s.source === name);
  for (const def of HOME_SECTIONS.filter(d => d.reads === 'local')) {
    const name = def.sources[0], src = by(name);
    if (!src) { read[def.id] = { na: name === 'claims' ? 'there is no remote to hold a claim' : name === 'verify' ? 'the delivery practice is off here' : name === 'fleet' ? 'plates fleet runs at home, on plates' : `${name} was not read` }; continue; }
    if (src.state === 'n/a') { read[def.id] = { na: src.why }; continue; }
    if (name === 'feedback') { read[def.id] = { items: feedbackRows(data.feedback).map(it => plain({ ...it, source: 'feedback' })), count: data.feedback?.pending ?? 0, why: src.why }; continue; }
    // The newest health page's proposal is a decision in the shared model; only earlier pages' are here.
    // A plate the shared model read has its newest health proposal there, so loose ends' copy of it is not listed again.
    const dup = it => name === 'loose-ends' && it.kind === 'health' && [...shared].some(repo => it.title.startsWith(`${repo}:`));
    const items = data.items.filter(it => it.source === name && !dup(it) && !(name === 'health' && latest && it.read === latest.path)).map(plain);
    read[def.id] = { items, why: src.why };
  }
  return { sections: homeSections(read), observation: data.observation, nightPlan: data.nightPlan };
}

const clip = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const ghRun = (gh, args, env) => new Promise(done => {
  execFile(gh, args, { env, encoding: 'utf8', timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
    done(error ? { ok: false, why: error.code === 'ENOENT' ? `${gh} is not installed` : clip(String(stderr || error.message).trim().split('\n')[0]) } : { ok: true, stdout }));
});

/**
 * What is already queued (phase 166's "What should happen next?"): tonight's
 * plan as each checkout said it (plates goodnight --yes wrote .plates/night/plan.json),
 * its items not yet finished; and each plate's open agent issues, through gh.
 * Read only. { night, agent } for homeQueues.
 */
export async function readQueues(plates, { env, now }) {
  const { validatePlan, nightOf, PLAN } = await import('../practices/night/files/scripts/plates/night-plan.mjs');
  const { labelNames, environmentValue } = await import('../practices/night/files/scripts/plates/names.mjs');
  const night = nightOf(new Date(now())), read = {};
  const local = plates.filter(p => p.dir);
  if (!local.length) read.night = { na: 'no plate has a checkout here' };
  else {
    const items = [], bad = [];
    for (const { project, dir } of local) {
      let plan;
      try { plan = JSON.parse(await readFile(join(dir, PLAN), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') bad.push(`${project.id}: ${PLAN} is not readable JSON`); continue; }
      if (!validatePlan(plan).ok) { bad.push(`${project.id}: ${PLAN} is not a valid plan`); continue; }
      if (plan.date !== night) continue;
      for (const item of plan.items.filter(i => ['planned', 'running'].includes(i.status)).slice(0, 20))
        items.push({ projectId: project.id, id: item.id, title: clip(item.title, 180), kind: item.kind, lane: item.lane, night: plan.date, link: null });
    }
    read.night = { items, ...(bad.length ? { why: bad.join('; ') } : {}) };
  }
  const repos = plates.filter(p => /^[\w.-]+\/[\w.-]+$/.test(p.project.repo ?? '')).slice(0, 12);
  if (!repos.length) read.agent = { na: 'no plate names a GitHub repository' };
  else {
    const gh = environmentValue('variable:KEEL_GH', env) ?? 'gh', items = [], failed = [];
    await Promise.all(repos.map(async ({ project }) => {
      const seen = new Set();
      for (const label of labelNames('label:keel:agent')) {
        const r = await ghRun(gh, ['issue', 'list', '-R', project.repo, '--state', 'open', '--label', label, '--limit', '50', '--json', 'number,title,url,createdAt'], env);
        let rows = null;
        if (r.ok) try { rows = JSON.parse(r.stdout); } catch { /* below */ }
        if (!Array.isArray(rows)) { failed.push(`${project.repo}: ${r.ok ? 'gh did not print a JSON list' : r.why}`); return; }
        for (const i of rows) if (Number.isSafeInteger(i?.number) && !seen.has(i.number)) {
          seen.add(i.number);
          items.push({ projectId: project.id, id: `#${i.number}`, title: clip(i.title, 180), kind: 'agent issue', since: typeof i.createdAt === 'string' ? i.createdAt.slice(0, 10) : null,
            link: typeof i.url === 'string' && i.url.startsWith('https://github.com/') ? i.url : null });
        }
      }
    }));
    items.sort((a, b) => a.projectId.localeCompare(b.projectId) || (a.since ?? '').localeCompare(b.since ?? '') || a.id.localeCompare(b.id));
    read.agent = failed.length === repos.length ? { na: `gh could not read them: ${failed[0]}` } : { items, ...(failed.length ? { why: `not read: ${failed.join('; ')}` } : {}) };
  }
  return read;
}

/** plates home: the same read model as /api/home, from this checkout. */
export async function home({ root, projectId, fresh = false, namesEvidence = false }, deps = {}) {
  const env = deps.env ?? process.env, now = deps.now ?? Date.now;
  const config = JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8'));
  planningConfig(config); // an unsupported planning source is refused before anything is read, as every CLI consumer does
  const plates = await platesOf(resolve(root), config, projectId);
  const spend = rateSpend();
  const me = deps.me !== undefined ? deps.me : await viewerLogin(env).catch(() => null);
  const reviews = { me, unavailable: 'gh could not be asked; reviews are not read.',
    read: deps.reviews ?? ((source, today) => githubRead(env, `review-state-${source.repo}-${(source.reviewers ?? []).join('+')}-${today}`,
      () => readRepoReviewState(source, { env, today, spend }), { fresh, guard: () => quotaGuard(env, spend) }).then(got => got.value)) };
  // --names-evidence is the morning's observation of the plan and verify reads (the local sections): no plate is read.
  const projects = [];
  if (!namesEvidence) for (const plate of plates) projects.push(await readPlate(plate, { now, reviews }));
  const shared = new Set(projects.filter(p => p.state !== 'unavailable').map(p => p.repo));
  const local = await localSections(root, { ...deps, env, fresh }, { namesEvidence, shared, plate: plates[0].project.id }).catch(error => ({ sections: homeSections(Object.fromEntries(HOME_SECTIONS.filter(d => d.reads === 'local').map(d => [d.id, { na: `could not be read: ${String(error?.message ?? error).slice(0, 160)}` }]))) }));
  // Not now (phase 173): the owner's records, outside every project. One that cannot be read hides nothing and is a gap.
  let snoozed = {}, notNowGap = null;
  try { snoozed = await readNotNow(env); } catch (error) { notNowGap = error.message; }
  // Since you last looked (phase 166): from this CLI's own last run, a time kept in the plates state directory. The names
  // observation is the morning workflow's, not the owner looking: it neither reads nor moves the time.
  const lastLooked = namesEvidence ? null : await readLastLooked(env);
  const queues = homeQueues(namesEvidence ? {} : await (deps.queues ?? readQueues)(plates, { env, now }).catch(error => ({ night: { na: clip(error?.message ?? error) }, agent: { na: clip(error?.message ?? error) } })));
  const model = homeSnapshot(projects, { sections: local.sections, can: { form: 'cli' }, snoozed, notNowGap, today: new Date(now()).toISOString().slice(0, 10), lastLooked, queues });
  if (!namesEvidence) {
    const unwritten = await writeLastLooked(env, new Date(now()).toISOString());
    if (unwritten) model.home.footer = `${model.home.footer} The time of this look was not kept: ${unwritten}.`;
  }
  return { schema: 1, generatedAt: new Date(now()).toISOString(), ...model, ...(namesEvidence ? { nightPlan: local.nightPlan ?? null, observation: local.observation } : {}) };
}

/**
 * The terminal's rendering of the four sections (phase 166), in their order,
 * with the model's counts: Needs you, Since you last looked, What should happen
 * next?, Your plates, and the one footer line. --project <id> is that plate's
 * lens, and adds what waits on time or agents, which home itself does not list.
 */
export function homeText(data, { projectId } = {}) {
  const four = data.home?.sections ?? [], sec = id => four.find(s => s.id === id) ?? {};
  const mine = item => !projectId || (item.projectId ?? item.plate) === projectId;
  const counted = (n, known) => `${n}${known ? ' known' : ''}`;
  const out = [`plates home — ${projectId ?? 'all plates'} (${data.generatedAt.slice(0, 10)})`, ''];
  // Each item in Needs you names its answers and the command that gives one (phase 173).
  const answers = item => item.answers?.length ? [`      answer: plates home --answer ${item.key} <${item.answers.map(a => `${a.id}${a.needsWhy === 'never' ? '' : '*'}${a.unavailable ? '?' : ''}`).join('|')}>${item.answers.some(a => a.needsWhy !== 'never') ? '  (* needs --why; ? not from here)' : item.answers.some(a => a.unavailable) ? '  (? not from here)' : ''}`] : [];

  const needs = sec('needs-you'), items = (needs.items ?? []).filter(mine);
  out.push(`${needs.title ?? 'Needs you'} (${counted(items.length, needs.known)})`);
  // The Start panel's numbers, as the web's says them (phase 175): how many to answer, about how long, and the quick ones.
  // Read from the model's docket here, not through lib/web/review-views.mjs: plates home's import graph is
  // what the morning's names observation records, and it is bounded (scripts/plates/names-observation.mjs).
  const shown = (data.docket ?? []).filter(e => !projectId || e.key.startsWith(`${projectId}:`));
  const start = { count: shown.length, minutes: shown.reduce((n, e) => n + (Number.isSafeInteger(e.minutes) ? e.minutes : 0), 0), quick: shown.filter(e => e.quick === true).length };
  if (start.count) out.push(`  ${start.count} to answer · about ${start.minutes} min — plates home --review${start.quick && start.quick < start.count ? ` (--quick: the ${start.quick} quick one${start.quick === 1 ? '' : 's'})` : ''}`);
  if (!items.length) out.push(needs.known ? '  nothing known' : '  nothing needs you');
  for (const item of items) {
    out.push(`  ${item.label} · ${item.projectName}: ${item.title}`);
    if (item.review) out.push(`      ${[item.review.rounds !== null ? `round ${item.review.rounds} of ${item.review.limit}` : null, item.review.verdict].filter(Boolean).join(' · ')}`);
    if (item.why) out.push(`      ${String(item.why).split('\n')[0].slice(0, 200)}`);
    if (item.link) out.push(`      ${item.link}`);
    else if (item.command && !item.answers?.length) out.push(`      ${item.command}`);
    out.push(...answers(item));
  }
  const off = (data.putOff?.items ?? []).filter(p => mine(p.item));
  if (data.putOff?.unavailable) out.push(`  Put off: unavailable — ${data.putOff.unavailable}`);
  if (off.length) out.push(`  Put off (${off.length}): ${off.map(p => `${p.item.title} — until ${p.until}`).join('; ')}`);
  out.push('');

  const since = sec('since'), groups = (since.plates ?? []).filter(mine), lines = groups.reduce((n, g) => n + g.lines.length, 0);
  out.push(`${since.title ?? 'Since you last looked'} (${counted(lines, since.known)}) — ${since.window === 'last-run' ? `since ${String(since.from).slice(0, 16).replace('T', ' ')} UTC, your last plates home` : `the last ${since.days} days`}`);
  if (!groups.length) out.push('  nothing recorded');
  for (const g of groups) out.push(`  ${g.projectName}`, ...g.lines.map(l => `    ${l.date ? `${String(l.date).slice(0, 10)} ` : ''}${l.text}`));
  out.push('');

  const next = sec('next'), queued = (next.queued ?? []).filter(mine);
  out.push(`${next.title ?? 'What should happen next?'} (${counted(queued.length, next.known)} queued)`);
  for (const q of queued) out.push(`  ${q.queue === 'night' ? `tonight (${q.night})` : 'agent'} · ${q.projectName}: ${q.title}${q.link ? `  ${q.link}` : ''}`);
  for (const r of (next.sources ?? []).filter(r => r.state !== 'read')) out.push(`  ${r.title}: not read — ${r.reason} (${r.command})`);
  out.push('  Ask for work: plates goodnight add --title "<ask>" (tonight) · plates issue new --agent (now); each previews before it writes');
  out.push('');

  const plates = sec('plates'), strip = (plates.items ?? []).filter(p => !projectId || p.projectId === projectId);
  out.push(`${plates.title ?? 'Your plates'} (${strip.length})`);
  for (const p of strip) out.push(`  ${p.name}: ${p.status}${p.waiting ? ` · ${p.waiting} waiting on time or agents (plates home --project ${p.projectId})` : ''}`);
  const problems = (plates.problems?.details ?? []).filter(mine);
  if (problems.length) out.push(`  ${problems.length} source problem${problems.length === 1 ? '' : 's'}: ${[...new Set(problems.map(p => p.projectId))].join(', ')}${projectId ? '' : ' (plates home --project <id> for the details)'}`);
  if (projectId) {
    for (const g of problems) out.push(`      ${g.source}: ${g.reason}`);
    const waiting = [...(data.waiting ?? []), ...(data.walks ?? []).filter(w => w.ready === false)].filter(mine);
    out.push('', `Waiting on time or agents (${waiting.length})`, ...(waiting.length ? waiting.map(w => `  ${w.title}${w.why ? ` — ${String(w.why).split('\n')[0].slice(0, 160)}` : ''}`) : ['  nothing']));
    // What only this machine reads (phase 156's rows), every item in it: the owner's are in Needs you too.
    out.push('', 'Read on this machine');
    for (const row of data.sections ?? []) {
      out.push(`  ${row.title}: ${row.state === 'read' ? `${row.count ?? row.items.length} read here` : 'unavailable'}${row.reason ? ` — ${row.reason}` : ''} (${row.command})`);
      for (const item of (row.items ?? []).filter(item => !item.plate || item.plate === projectId)) out.push(`      ${item.title}${item.why ? ` — ${String(item.why).split('\n')[0].slice(0, 200)}` : ''}${item.link ? ` ${item.link}` : ''}`);
    }
  }
  if (data.home?.footer) out.push('', data.home.footer);
  return out.join('\n');
}
