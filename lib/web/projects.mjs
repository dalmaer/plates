import { parsePhase, validateGraph, DONE } from '../../practices/phases/files/scripts/roadmap.mjs';
import { planningConfig } from '../../practices/night/files/scripts/plates/planning-config.mjs';
import { healthDirOf } from '../../practices/night/files/scripts/plates/lib.mjs';
import { parseProject, nextOf } from '../phases-projects.mjs';
import { roadmapItems, proposalOf, homeAction, homeRoadmap, homeHealth, homeReviews, reviewSourceOf, SCOPE_GAPS } from '../work-items.mjs';
import { repoReviewQuery, prReviewQuery, readRepoReviews, unansweredPrs } from '../../practices/night/files/scripts/plates/lib.mjs';
import { requestJson, record, WebError } from './common.mjs';
import { quotaObservation } from './home-store.mjs';
import { collectChanges, createChangeRevisionReader } from './changes.mjs';
import { gitBlob } from './decision-github.mjs';
import { homeDaily } from './daily-model.mjs';
import { autonomyReport } from '../autonomy.mjs';
import { readObservations, waitsSourceOf, projectWaits } from '../integration-observations.mjs';

// Phase files are read newest first, up to phaseFiles; through the App, their texts come in GraphQL
// batches (blobBatch files, blobBatchBytes each), so a plate costs requests per batch, not per file.
export const PROJECT_LIMITS = Object.freeze({ files: 1200, bytes: 16 * 1024 * 1024, fileBytes: 128 * 1024, treeEntries: 20000, requests: 200, concurrent: 8,
  phaseFiles: 1000, blobBatch: 100, blobBatchBytes: 2 * 1024 * 1024 });
const sha = value => /^[a-f0-9]{40}$/.test(value ?? '');
const safePath = value => typeof value === 'string' && value.length <= 500 && value.split('/').every(part => part && !['.', '..'].includes(part) && !/[\x00-\x1f\\]/.test(part));
const text = (value, limit = 700) => typeof value === 'string' ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, limit) : null;
const link = (repo, revision, path) => `https://github.com/${repo}/blob/${revision}/${path.split('/').map(encodeURIComponent).join('/')}`;
const blankPlan = source => ({ source, built: null, total: null, livedIn: null, headline: 'Planning source unavailable', goals: [], next: null });
const action = homeAction;
export function unavailableProject(project, reason = 'Project source has not been read yet') {
  return { ...project, name: project.id, tagline: null, stack: [], version: null, revision: null, readAt: null, state: 'unavailable',
    autonomy: { status: 'unavailable', hostControl: 'unavailable' }, gaps: [{ source: 'project', reason }], planning: blankPlan('unknown'), decisions: [], walks: [], reviews: [], waiting: [], changes: [] };
}
/** Cached declarations must preserve their source identity and unavailable host state. */
export function validAutonomySnapshot(value, project, revision) {
  try {
    if (value?.status === 'unavailable') return JSON.stringify(value) === JSON.stringify({ status: 'unavailable', hostControl: 'unavailable' });
    if (typeof value?.configured !== 'boolean') return false;
    const report = autonomyReport(value.configured ? value.policy : undefined, project.repo);
    const expected = { ...report, status: report.configured ? 'declared' : 'default', hostControl: 'unavailable',
      selectionVerification: 'unverified', sourceRevision: revision,
      sourceUrl: report.configured ? link(project.repo, revision, '.plates/autonomy.json') : null };
    return JSON.stringify(value) === JSON.stringify(expected);
  } catch { return false; }
}
/** What a waits read needs from the App (GitHub's "Permissions required for GitHub Apps"), in words for its gap. */
export const waitsPermission = path => /\/activity\b/.test(path) ? 'repository activity: Contents read needed'
  : /\/check-runs\b/.test(path) ? 'check runs: Checks read needed' : /\/pulls\b/.test(path) ? 'pull requests: Pull requests read needed'
    : 'refs, commits and compares: Contents read needed';
export function createProjectReader({ fetcher = fetch, store, userId, token, now = Date.now, budget = { requests: 0 }, signal = AbortSignal.timeout(25000) }) {
  // missing: a 404 is null (the waits' compare of a branch deleted since its ref was listed), not a sign-in.
  // forbidden: a 403 that is plainly a permission refusal (quota left, no Retry-After, no rate-limit message:
  // GitHub's "Resource not accessible by integration") is not_permitted, with no pause and no deferral.
  // Every other 403 is a limit, as for every other caller.
  async function get(path, limit = 2 * 1024 * 1024, body = null, { missing = false, forbidden = false } = {}) {
    if (budget.blockedUntil > now()) throw new WebError('quota_saving');
    if (++budget.requests > PROJECT_LIMITS.requests || signal.aborted) throw new WebError('source_limit');
    const reservation = await store.reserve(userId);
    if (!reservation.allowed) { budget.blockedUntil = Date.parse(reservation.blockedUntil) || 0; throw new WebError('quota_saving'); }
    return requestJson(async (url, options) => {
      const response = await fetcher(url, options), observation = quotaObservation(response.headers);
      const retry = response.headers.get('retry-after'), retrySeconds = /^\d{1,8}$/.test(retry ?? '') ? Number(retry) : null;
      // Access was freshly validated before source reading. An ambiguous 403 may
      // be a secondary limit without Retry-After; preserve the view and pause.
      let read = false;
      if (forbidden && response.status === 403 && retry === null && observation && observation.remaining > 0) {
        const text = await response.text().catch(() => ''); read = true;
        if (!/rate limit/i.test(text)) { await store.observe(userId, observation); throw new WebError('not_permitted', 403); }
        // A secondary limit says so in its message: it pauses like any other limit, below.
      }
      const limited = response.status === 429 || response.status === 403;
      if (limited) {
        const requested = retrySeconds !== null ? now() + retrySeconds * 1000 : Date.parse(retry);
        const until = Math.max(now() + 60000, Number.isFinite(requested) ? requested : observation?.remaining === 0 ? observation.reset * 1000 : 0);
        budget.blockedUntil = Math.min(now() + 7 * 86400000, until);
        if (!read) await response.body?.cancel();
        if (observation) await store.observe(userId, observation);
        await store.defer(userId, Math.ceil(budget.blockedUntil / 1000));
        throw new WebError('quota_saving');
      }
      if (missing && response.status === 404) { await response.body?.cancel(); throw new WebError('not_found', 404); }
      if ([401, 404].includes(response.status)) { await response.body?.cancel(); throw new WebError('sign_in_required', 401); }
      if (observation) await store.observe(userId, observation);
      return response;
    }, `https://api.github.com${path}`, { signal, ...(body?{method:'POST',body:JSON.stringify(body)}:{}), headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body?{'Content-Type':'application/json'}:{}) } }, limit);
  }
  // The waits' reads (phase 158): REST GETs only, within this reader's bounds; a 404 asked for as missing is null.
  // A permission refusal is that read's named gap ("the App cannot read …: … read needed"), never a pause of every read.
  const waitsRead = can => (repo, source) => readObservations({ repo, now: now(), source, can,
    api: async (path, { missing = false } = {}) => {
      try { return await get(path, 2 * 1024 * 1024, null, { missing, forbidden: true }); }
      catch (error) {
        if (missing && error.code === 'not_found') return null;
        if (error.code === 'not_permitted') throw Object.assign(new Error(`the App cannot read ${waitsPermission(path)}`), { code: 'not_permitted' });
        throw error;
      }
    } });
  return async function readProject(project, previous, { login = null, reviews = false, waits = {} } = {}) {
    const metadata = await get(`/repositories/${project.repoId}`, 65536);
    if (metadata.id !== project.repoId || metadata.full_name !== project.repo || typeof metadata.default_branch !== 'string' || metadata.default_branch.length > 200) throw new WebError('source_unavailable');
    const base = `/repos/${project.repo.split('/').map(encodeURIComponent).join('/')}`;
    const commits = await get(`${base}/commits?sha=${encodeURIComponent(metadata.default_branch)}&per_page=1`, 65536);
    const head = commits?.[0];
    if (!Array.isArray(commits) || commits.length !== 1 || !sha(head?.sha) || !sha(head?.commit?.tree?.sha)) throw new WebError('source_unavailable');
    const query = async (query, variables, limit = 65536) => {
      const response = await get('/graphql', limit, { query, variables });
      if (response.errors?.length) throw new WebError('identity_unavailable');
      return response.data;
    };
    // Reviews change without the default branch moving, so they are read on every refresh (phase 156).
    // Waits (phase 158) change without the default branch moving too; each read the App is not permitted is the waits' gap.
    const can = { activity: true, pulls: waits.pulls === true, pullsWhy: 'The Plates GitHub App has no Pull requests read permission on this plate.',
      checks: waits.checks === true, checksWhy: 'The Plates GitHub App has no Checks read permission on this plate.' };
    const withReviews = async value => projectWaits(await projectReviews(value, { login, read: reviews ? reviewReader(query) : null,
      unavailable: 'The Plates GitHub App has no Pull requests read permission on this plate.', now }), { read: waitsRead(can), now });
    // A fresh request revalidates the serving source revision before reusing parsed records.
    if (previous?.sourceComplete === true && validAutonomySnapshot(previous.autonomy, project, head.sha) && previous.revision === head.sha && previous.classifiedOn === new Date(now()).toISOString().slice(0, 10)) return withReviews({ ...previous, state: previous.gaps.length ? 'partial' : 'complete', readAt: new Date(now()).toISOString() });
    const tree = await get(`${base}/git/trees/${head.commit.tree.sha}?recursive=1`, 5 * 1024 * 1024);
    if (!record(tree) || tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > PROJECT_LIMITS.treeEntries) throw new WebError('source_limit');
    const blob = async (oid, size) => {
      const got = await get(`${base}/git/blobs/${oid}`, PROJECT_LIMITS.fileBytes * 2);
      if (got.sha !== oid || got.encoding !== 'base64' || got.size !== size || typeof got.content !== 'string') throw new WebError('source_unavailable');
      const buffer = Buffer.from(got.content, 'base64');
      if (buffer.length !== size) throw new WebError('source_unavailable');
      return buffer;
    };
    // Many blobs per request: each alias is one blob by oid, checked against its tree entry and its git hash.
    const readBlobs = async list => {
      const [owner, name] = project.repo.split('/'), out = new Map();
      for (let i = 0; i < list.length;) {
        const batch = []; let size = 0;
        while (i < list.length && batch.length < PROJECT_LIMITS.blobBatch && (!batch.length || size + list[i].size <= PROJECT_LIMITS.blobBatchBytes)) { size += list[i].size; batch.push(list[i++]); }
        const data = await query(`query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${batch.map((entry, k) => `b${k}: object(oid: "${entry.sha}") { ... on Blob { oid byteSize isBinary isTruncated text } }`).join(' ')} } }`,
          { owner, name }, PROJECT_LIMITS.blobBatchBytes * 2 + 65536);
        batch.forEach((entry, k) => {
          const got = data?.repository?.[`b${k}`];
          if (!got || got.oid !== entry.sha || got.isBinary !== false || got.isTruncated !== false || got.byteSize !== entry.size || typeof got.text !== 'string') return;
          const buffer = Buffer.from(got.text, 'utf8');
          if (buffer.length === entry.size && gitBlob(buffer) === entry.sha) out.set(entry.sha, buffer);
        });
      }
      return out;
    };
    const value = await projectFromSource({ project, now, head: { sha: head.sha, message: head.commit?.message, date: head.commit?.committer?.date },
      tree: tree.tree, readBlob: entry => blob(entry.sha, entry.size), readBlobs,
      changes: { query, nodeId: metadata.node_id, defaultBranch: metadata.default_branch, readHistorical: async (entry, charge) => {
        const got = await get(`${base}/git/blobs/${entry.oid}`, PROJECT_LIMITS.fileBytes * 2);
        if (!Number.isSafeInteger(got.size) || got.size < 0 || got.size > PROJECT_LIMITS.fileBytes || !charge(got.size)
          || got.sha !== entry.oid || got.encoding !== 'base64' || typeof got.content !== 'string') throw new WebError('source_limit');
        const buffer = Buffer.from(got.content, 'base64');
        if (buffer.length !== got.size || gitBlob(buffer) !== entry.oid) throw new WebError('source_unavailable');
        return buffer;
      } } });
    return withReviews(value);
  };
}

/** A plate's review-state read through the App's GraphQL (the night's repo-wide read): read(source) → { prs, rounds }. */
export const reviewReader = query => async ({ repo, reviewers = [] }, today) => {
  const [owner, name] = repo.split('/');
  const read = async vars => (await query(repoReviewQuery(), { owner, name, ...vars }, 2 * 1024 * 1024))?.repository;
  const readPr = async number => (await query(prReviewQuery(), { owner, name, number }, 2 * 1024 * 1024))?.repository?.pullRequest;
  const { prs, rounds } = unansweredPrs(await readRepoReviews(read, today, { readPr, reviewers }), reviewers, today);
  return { prs, rounds };
};

/**
 * A plate's reviews waiting on the owner (homeReviews), put in place of any
 * read before: `reviews`, someone else's in `waiting`, a gap when unread.
 * read(source, today) → { prs, rounds }, or null where this form cannot read them.
 */
export async function projectReviews(value, { login = null, read = null, unavailable, now = Date.now }) {
  const out = structuredClone(value);
  out.reviews = []; out.waiting = (out.waiting ?? []).filter(item => item.kind !== 'review'); out.gaps = out.gaps.filter(gap => gap.source !== 'reviews');
  if (out.state === 'unavailable' || !out.reviewSource) return out;
  const today = new Date(now()).toISOString().slice(0, 10);
  let got;
  try { got = await homeReviews(out, out.reviewSource, { read: read && (source => read(source, today)), me: login, today, unavailable }); }
  catch (error) { if (error.status === 401) throw error; got = { reviews: [], waiting: [], gap: { source: 'reviews', reason: error.code === 'quota_saving' ? 'Saving GitHub quota; reviews are not read.' : 'Reviews could not be read within the authorized source bounds.' } }; }
  out.reviews = got.reviews; out.waiting.push(...got.waiting);
  if (got.gap) { out.gaps.push(got.gap); out.gaps.sort((a,b) => a.source.localeCompare(b.source) || a.reason.localeCompare(b.reason)); if (out.state === 'complete') out.state = 'partial'; }
  else if (out.state === 'partial' && !out.gaps.length) out.state = 'complete';
  return out;
}

/**
 * One plate's home value from its default-branch tree, however that tree was
 * read: the GitHub App's tree and blobs (readProject, above), or a local
 * checkout's git objects (lib/home.mjs). tree: [{ path, type, mode, sha, size }];
 * readBlob(entry) → its bytes. The same bounds apply to both, so the same
 * source gives the same items, sections and gaps.
 */
export async function projectFromSource({ project, now = Date.now, head, tree, readBlob, readBlobs = null, changes = null, limits = PROJECT_LIMITS }) {
    const entries = new Map();
    for (const entry of tree) {
      if (!safePath(entry.path) || !sha(entry.sha) || entries.has(entry.path)) throw new WebError('source_unavailable');
      entries.set(entry.path, entry);
    }
    let bytes = 0, files = 0;
    const charge = size => ++files <= limits.files && (bytes += size) <= limits.bytes;
    const loaded = new Map(), fetched = new Map();
    // Prefetch many blobs in one go where the reader can (the App's GraphQL); what it does not return is read alone.
    async function prefetch(paths) {
      if (!readBlobs) return;
      const list = paths.map(path => entries.get(path)).filter(entry => entry?.type === 'blob' && Number.isSafeInteger(entry.size) && entry.size >= 0 && entry.size <= limits.fileBytes && !fetched.has(entry.sha));
      try { for (const [oid, buffer] of await readBlobs(list)) fetched.set(oid, buffer); }
      catch (error) { if (error.status === 401) throw error; }
    }
    async function read(path) {
      if (loaded.has(path)) return loaded.get(path);
      const entry = entries.get(path);
      if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw new WebError('source_unavailable');
      if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > limits.fileBytes || ++files > limits.files) throw new WebError('source_limit');
      bytes += entry.size; if (bytes > limits.bytes) throw new WebError('source_limit');
      const buffer = fetched.get(entry.sha) ?? await readBlob(entry);
      if (buffer.length !== entry.size) throw new WebError('source_unavailable');
      const value = new TextDecoder('utf-8', { fatal: true }).decode(buffer); loaded.set(path, value); return value;
    }
    let config;
    try { config = JSON.parse(await read(entries.has('.plates/plates.json') ? '.plates/plates.json' : '.keel/keel.json')); if (!record(config)) throw Error(); planningConfig(config); }
    catch (error) { if (error.status === 401) throw error; if (error.code === 'quota_saving' || error.code === 'source_limit') throw error; throw new WebError('source_unavailable'); }
    config = { ...config, repo: project.repo };
    const reviewSource = reviewSourceOf(config, project.repo), waitsSource = waitsSourceOf(config);
    const result = { ...unavailableProject(project), name: text(config.name, 120) || project.id, tagline: text(config.tagline),
      stack: Array.isArray(config.stack) ? config.stack.filter(x => typeof x === 'string').slice(0, 20).map(x => text(x, 40)) : [],
      version: text(config.practice, 40), revision: head.sha, readAt: new Date(now()).toISOString(), state: 'complete', gaps: [], sourceComplete: true, classifiedOn: new Date(now()).toISOString().slice(0, 10), reviewSource, waitsSource, reviews: [] };
    const gap = (source, reason) => { result.gaps.push({ source, reason }); result.state = 'partial';
      if (!SCOPE_GAPS.includes(source)) result.sourceComplete = false; };
    let autonomyUnavailable = false;
    try {
      const path = '.plates/autonomy.json';
      const value = entries.has(path) ? JSON.parse(await read(path)) : undefined;
      const report = autonomyReport(value, project.repo);
      result.autonomy = { ...report, status: report.configured ? 'declared' : 'default', hostControl: 'unavailable',
        selectionVerification: 'unverified', sourceRevision: head.sha,
        sourceUrl: report.configured ? link(project.repo, head.sha, path) : null };
    } catch (error) {
      if (error.status === 401 || ['quota_saving', 'source_limit'].includes(error.code)) throw error;
      result.autonomy = { status: 'unavailable', hostControl: 'unavailable' };
      autonomyUnavailable = true;
    }
    const source = planningConfig(config).source;
    if (source === 'milestones') {
      result.planning = blankPlan('milestones');
      gap('milestones', 'GitHub milestones own this plan. The approved App has no Issues permission; archived local phases are not substituted.');
    } else if (Array.isArray(config.practices) && !config.practices.includes('phases') && config.phases?.shape !== 'projects') {
      // As the CLI does: docs/phases is plates phases only under the phases practice.
      result.planning = { ...blankPlan('none'), headline: 'This plate does not use the phases practice; its plan is not tracked here.' };
    } else if (config.phases?.shape === 'projects') {
      const names = [...entries.keys()].filter(path => /^docs\/projects\/[^/]+\/phases\.md$/.test(path)).sort();
      if (!names.length) gap('planning', 'No projects-shaped phase records were found.');
      let all = [], next = [];
      for (const path of names.slice(0, 40)) {
        try {
          const parsed = parseProject(path.split('/')[2], await read(path)), chosen = nextOf(parsed);
          all.push(...parsed.phases); if (chosen.next) next.push(`${parsed.project}: ${chosen.next.title}`);
          if (parsed.lint.length) gap('planning', `${parsed.project}: ${parsed.lint.length} phase status declarations need review.`);
        } catch (error) { if (error.status === 401) throw error; gap('planning', `${path}: source could not be read completely.`); }
      }
      if (names.length > 40) gap('planning', 'Projects-shaped plan exceeds the 40-document read bound.');
      result.planning = { source: 'projects', built: all.filter(p => p.status === 'built').length, total: all.length, livedIn: all.filter(p => p.status === 'lived-in').length,
        headline: `${all.filter(p => p.status === 'built').length} of ${all.length} source phases built`, goals: [], next: next[0] ?? null };
      gap('human actions', 'Projects-shaped plans supply status and next work; they do not supply the local phase walk/decision contract.');
    } else {
      // Newest first: past the bound, the phases left unread are the oldest, never the ones most likely waiting on the owner.
      const number = path => Number(/^(\d+)/.exec(path.split('/').at(-1))?.[1] ?? -1);
      const all = [...entries.keys()].filter(path => /^docs\/phases\/[^/]+\.md$/.test(path) && !path.endsWith('/README.md')).sort((a, b) => number(b) - number(a) || b.localeCompare(a));
      const paths = all.slice(0, limits.phaseFiles), truncated = all.length > paths.length;
      const phases = [], raws = new Map(), failed = []; let goals = [];
      const bound = truncated ? { source: 'planning', reason: `Phase inventory exceeds the ${limits.phaseFiles}-file read bound; the newest ${paths.length} of ${all.length} are read, and totals and actions are incomplete.` } : null;
      if (bound) gap(bound.source, bound.reason);
      await prefetch([...paths, 'docs/goals.json']);
      let index = 0;
      const reads = await Promise.allSettled(Array.from({ length: limits.concurrent }, async () => {
        while (index < paths.length) {
          const path = paths[index++];
          try { const raw = await read(path), phase = parsePhase(path.split('/').at(-1), raw); phases.push(phase); raws.set(phase.file, raw); }
          catch (error) { if (error.status === 401) throw error; failed.push(path); }
        }
      }));
      const denied = reads.find(result => result.status === 'rejected');
      if (denied) throw denied.reason;
      if (failed.length) {
        failed.sort();
        gap('planning', `${failed.length} of ${paths.length} phase files could not be read or validated: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ` and ${failed.length - 3} more` : ''}.`);
      }
      phases.sort((a, b) => a.id - b.id);
      // The bound's own gap never hides what was read; any other gap does, as before.
      let valid = result.gaps.every(item => bound && item.source === bound.source && item.reason === bound.reason);
      try { goals = JSON.parse(await read('docs/goals.json')); validateGraph(phases, goals); }
      catch (error) {
        if (error.status === 401) throw error;
        // A truncated read can name dependencies it did not read; goals that parse still classify what was read.
        if (!truncated || !Array.isArray(goals) || !goals.length) { valid = false; gap('planning', 'Goals or phase dependencies could not be validated; next-action classification is unavailable.'); }
      }
      for (const phase of phases) for (const evidence of phase.evidence) {
        if (!entries.has(`docs/${evidence}`)) { valid = false; gap('evidence', `Phase ${phase.id} names evidence absent from this revision.`); }
      }
      result.planning = { source: 'files', built: phases.filter(p => DONE.includes(p.status)).length, total: phases.length,
        livedIn: phases.filter(p => p.status === 'lived-in').length, headline: `${phases.filter(p => DONE.includes(p.status)).length} of ${phases.length} source phases built`,
        goals: Array.isArray(goals) ? goals.filter(g => !g.retired).slice(0, 30).map(g => ({ id: text(g.id, 40), title: text(g.title, 120), outcome: text(g.outcome) })) : [], next: null };
      if (valid) {
        const board = await roadmapItems(null, { today: new Date(now()).toISOString().slice(0, 10), read: async () => ({ config, goals, phases }), readPhase: async file => raws.get(file) });
        const items = homeRoadmap(result, board, phases, path => link(project.repo, head.sha, path));
        // A walk whose phase has an authored guided walk (docs/walks/<id>.json, phase 98) is answered there on the web (phase 173).
        const guides = [...entries.keys()].filter(path => /^docs\/walks\/[a-z][a-z0-9-]{0,63}\.json$/.test(path)).slice(0, 20);
        if (guides.length) {
          const guided = new Set();
          for (const path of guides) {
            try { const target = JSON.parse(await read(path))?.target?.phase; if (typeof target === 'string') guided.add(target); }
            catch (error) { if (error.status === 401) throw error; }
          }
          for (const walk of items.walks) if (guided.has(`docs/phases/${phases.find(p => String(p.id) === walk.phase)?.file}`)) walk.guided = true;
        }
        // A step the owner marked done in the plate's loose-ends marks (plates home --answer <key> done, phase 173)
        // is not theirs any more: drop for good, park until its date, as plates loose-ends reads the file.
        if (entries.has('.plates/loose-ends.json')) {
          try {
            const marks = JSON.parse(await read('.plates/loose-ends.json'))?.marks;
            const today = new Date(now()).toISOString().slice(0, 10);
            const off = new Set((Array.isArray(marks) ? marks : []).filter(m => m?.move === 'drop' || (m?.move === 'park' && typeof m.until === 'string' && m.until > today)).map(m => m.fingerprint));
            items.decisions = items.decisions.filter(d => d.itemKind !== 'step' || !off.has(`phase:${d.phase}`));
          } catch (error) { if (error.status === 401) throw error; gap('loose-ends marks', 'The plate\'s .plates/loose-ends.json could not be read; marked steps are still listed.'); }
        }
        result.planning.goals.sort((a,b) => Number(b.id === items.activeGoal) - Number(a.id === items.activeGoal));
        result.decisions.push(...items.decisions); result.walks.push(...items.walks); result.waiting.push(...items.waiting);
        result.planning.next ??= items.next;
      }
      result.changes = phases.filter(p => DONE.includes(p.status)).sort((a, b) => b.since.localeCompare(a.since) || b.id - a.id).slice(0, 8).map(p => action(result, `phase-change:${p.id}`, {
        title: text(p.title, 180), date: p.since, revision: head.sha, link: link(project.repo, head.sha, `docs/phases/${p.file}`), kind: 'phase', media: null, previewUrl: null, acceptance: 'source claim',
      }));
    }
    try {
      const healthDir = healthDirOf(config), paths = [...entries.keys()].filter(path => path.startsWith(`${healthDir}/`) && /^\d{4}-\d{2}-\d{2}\.md$/.test(path.slice(healthDir.length + 1))).sort();
      if (paths.length) {
        const path = paths.at(-1), decision = homeHealth(result, path, proposalOf(await read(path)), link(project.repo, head.sha, path));
        if (decision) result.decisions.push(decision);
      }
    } catch (error) { if (error.status === 401) throw error; gap('health proposals', 'Latest recorded health proposal could not be read or validated.'); }
    if ([...entries.keys()].some(path=>path.startsWith('docs/changes/')&&path.endsWith('.json'))) {
      try {
        // The journal binds each package to the repository's GraphQL identity: only a reader with GraphQL can.
        if (!changes) throw new WebError('changes_unavailable');
        const { query, nodeId, defaultBranch } = changes;
        if (typeof nodeId !== 'string' || !nodeId) throw new WebError('identity_unavailable');
        const node = (await query('query ChangeSource($id:ID!){node(id:$id){... on Repository{id databaseId nameWithOwner isPrivate defaultBranchRef{id name repository{id databaseId} target{... on Commit{oid}}}}}}', { id: nodeId }))?.node;
        const ref = node?.defaultBranchRef;
        if (node?.id !== nodeId || node.databaseId !== project.repoId || node.nameWithOwner !== project.repo
          || typeof node.isPrivate !== 'boolean' || !ref?.id || ref.name !== defaultBranch
          || ref.repository?.id !== node.id || ref.repository.databaseId !== project.repoId || ref.target?.oid !== head.sha) {
          throw new WebError('identity_unavailable');
        }
        const source = {
          repoId: project.repoId, repositoryNodeId: node.id, branchNodeId: ref.id,
          head: head.sha, branch: ref.name, visibility: node.isPrivate ? 'private' : 'public',
        };
        const resolveRevision = createChangeRevisionReader(project, node.id, query);
        const readHistorical = async (revision, path) => changes.readHistorical((await resolveRevision(revision, [path]))[path], charge);
        const journal = await collectChanges({ project: { ...project, name: result.name }, source, paths: [...entries.keys()], read, resolveRevision, readHistorical });
        if (journal.items.length) {
          const recent = []; let summaryBytes = 0;
          for (const item of journal.items) {
            const size = Buffer.byteLength(JSON.stringify(item));
            if (recent.length >= 20 || summaryBytes + size > 200 * 1024) break;
            recent.push(item); summaryBytes += size;
          }
          result.changes = recent;
          result.changeJournal = { url: `/projects/${project.id}/changes`, total: journal.items.length, shown: recent.length };
          if (recent.length < journal.items.length) gap('journal window', `Home shows ${recent.length} recent changes within its size bound; explore all entries at /projects/${project.id}/changes.`);
        }
        for (const issue of journal.gaps) gap(issue.source, issue.reason);
      } catch (error) {
        if (error.status === 401 || error.status === 404) throw error;
        gap('changes', error.code === 'changes_unavailable' ? `Visual change packages are read on the hosted home: /projects/${project.id}/changes.`
          : 'Visual change packages could not be read within the authorized source bounds.');
      }
    }
    result.daily = await homeDaily({ project, revision: head.sha, paths: [...entries.keys()], read, now: now() });
    gap('daily coverage', result.daily.coverage);
    if (['invalid', 'unavailable'].includes(result.daily.state)) gap('daily', 'Latest default-branch daily record could not be read or validated.');
    gap('GitHub operations', 'Issues, checks and live routine/production outcomes are not covered by this read-only source view.');
    gap('decision records', 'Architecture decision context and private lesson proposals are not collected in this first Home reader.');
    if (!result.changes.length) result.changes.push(action(result, `commit:${head.sha}`, { title: text(head.message?.split('\n')[0], 180) || 'Latest source commit',
      date: text(head.date, 40), revision: head.sha, link: `https://github.com/${project.repo}/commit/${head.sha}`, kind: 'commit', media: null, previewUrl: null, acceptance: 'not established' }));
    if (autonomyUnavailable) gap('autonomy', 'Autonomy source could not be validated; no authority inferred.');
    result.gaps.sort((a,b) => a.source.localeCompare(b.source) || a.reason.localeCompare(b.reason));
    return result;
}
