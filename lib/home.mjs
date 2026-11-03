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
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homeSnapshot, homeSections, HOME_SECTIONS, workItems, viewerLogin } from './work-items.mjs';
import { githubRead, readRepoReviewState, quotaGuard } from './quota.mjs';
import { rateSpend } from '../practices/night/files/scripts/plates/lib.mjs';
import { planningConfig } from '../practices/night/files/scripts/plates/planning-config.mjs';
import { checkouts, repoOf } from './looseends.mjs';

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
async function platesOf(root, config, projectId) {
  const repoHere = /^[\w.-]+\/[\w.-]+$/.test(config.repo ?? '') ? config.repo : repoOf((await git(root, ['config', '--get', 'remote.origin.url']).catch(() => '')).trim());
  const idOf = repo => String(repo ?? '').split('/').at(-1).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^[^a-z]+/, '') || 'project';
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
async function localSections(root, deps, { namesEvidence, shared = new Set() }) {
  const only = ['loose-ends', 'feedback', 'fleet', 'claims', 'verify', 'robot', 'decisions', 'health'];
  const data = await (deps.workItems ?? workItems)({ root, namesEvidence }, { ...deps, only });
  const plain = it => ({ kind: it.kind, waits: it.waits, title: it.title, why: it.why ?? null, read: it.read ?? null, link: it.link ?? null });
  const latest = await (async () => { try { return (await import('./work-items.mjs')).healthProposal(root); } catch { return null; } })();
  const read = {};
  const by = name => data.sources.find(s => s.source === name);
  for (const def of HOME_SECTIONS.filter(d => d.reads === 'local')) {
    const name = def.sources[0], src = by(name);
    if (!src) { read[def.id] = { na: name === 'claims' ? 'there is no remote to hold a claim' : name === 'verify' ? 'the delivery practice is off here' : name === 'fleet' ? 'plates fleet runs at home, on plates' : `${name} was not read` }; continue; }
    if (src.state === 'n/a') { read[def.id] = { na: src.why }; continue; }
    if (name === 'feedback') { read[def.id] = { items: feedbackRows(data.feedback), count: data.feedback?.pending ?? 0, why: src.why }; continue; }
    // The newest health page's proposal is a decision in the shared model; only earlier pages' are here.
    // A plate the shared model read has its newest health proposal there, so loose ends' copy of it is not listed again.
    const dup = it => name === 'loose-ends' && it.kind === 'health' && [...shared].some(repo => it.title.startsWith(`${repo}:`));
    const items = data.items.filter(it => it.source === name && !dup(it) && !(name === 'health' && latest && it.read === latest.path)).map(plain);
    read[def.id] = { items, why: src.why };
  }
  return { sections: homeSections(read), observation: data.observation, nightPlan: data.nightPlan };
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
  const local = await localSections(root, { ...deps, env, fresh }, { namesEvidence, shared }).catch(error => ({ sections: homeSections(Object.fromEntries(HOME_SECTIONS.filter(d => d.reads === 'local').map(d => [d.id, { na: `could not be read: ${String(error?.message ?? error).slice(0, 160)}` }]))) }));
  const model = homeSnapshot(projects, { sections: local.sections });
  return { schema: 1, generatedAt: new Date(now()).toISOString(), ...model, ...(namesEvidence ? { nightPlan: local.nightPlan ?? null, observation: local.observation } : {}) };
}

const SECTIONS = [['decisions', 'Decisions that need you'], ['walks', 'Ready to test'], ['reviews', 'Reviews waiting on you'], ['changes', 'Recently added'], ['waiting', 'In progress / waiting']];

/** The terminal's rendering: the web's sections, in its order, with the same counts. */
export function homeText(data, { projectId } = {}) {
  const sel = key => (data[key] ?? []).filter(item => !projectId || item.projectId === projectId);
  const complete = data.coverage.state === 'complete';
  const out = [`plates home — ${projectId ?? 'all plates'} (${data.generatedAt.slice(0, 10)})`, ''];
  if (data.coverage.gaps.length) out.push(`Sources: ${data.coverage.state} coverage`, ...data.coverage.gaps.map(g => `  ${g.projectId}: ${g.source}: ${g.reason}`), '');
  for (const [key, title] of SECTIONS) {
    const items = key === 'walks' ? sel(key).filter(item => item.ready) : sel(key);
    out.push(`${title} (${complete ? '' : 'at least '}${items.length})`);
    if (!items.length) out.push('  nothing known');
    for (const item of items) {
      out.push(`  ${item.projectName}: ${item.title}`);
      if (item.review) out.push(`      ${[item.review.rounds !== null ? `round ${item.review.rounds} of ${item.review.limit}` : null, item.review.verdict, item.review.mergeRule ? `${item.review.mergeRule.fixFirst} fix first · ${item.review.mergeRule.track} track · ${item.review.mergeRule.unsorted} unsorted` : null].filter(Boolean).join(' · ')}`);
      if (item.why) out.push(`      ${item.why.split('\n')[0]}`);
      if (item.next) out.push(`      next: ${item.next.split('\n')[0]}`);
      if (item.link) out.push(`      ${item.link}`);
    }
    out.push('');
  }
  out.push(`Your plates (${data.projects.filter(p => !projectId || p.id === projectId).length})`);
  for (const p of data.projects.filter(p => !projectId || p.id === projectId)) out.push(`  ${p.name} (${p.repo}): ${p.state}${p.planning?.headline ? ` — ${p.planning.headline}` : ''}`);
  out.push('', 'Read elsewhere');
  for (const row of data.sections) {
    out.push(`  ${row.title}: ${row.state === 'read' ? `${row.count ?? row.items.length} read here` : 'unavailable'}${row.reason ? ` — ${row.reason}` : ''} (${row.command})`);
    for (const item of row.items) out.push(`      ${item.title}${item.why ? ` — ${String(item.why).split('\n')[0].slice(0, 200)}` : ''}${item.link ? ` ${item.link}` : ''}`);
  }
  return out.join('\n');
}
