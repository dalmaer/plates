import {simpleProject} from './simple-project-model.mjs';
import {readAssignmentQuota, assignmentRecommendation} from '../project-assignment.mjs';
import { hash, random, WebError } from './common.mjs';
import { createHomeStore, GH_TTL } from './home-store.mjs';
import { createNotNowStore } from './not-now-store.mjs';
import { createWaitingStore } from './waiting-store.mjs';
import { createChannelStore } from './channel-store.mjs';
import { waitingRows, runmeRows } from '../waiting-sessions.mjs';
import { createLastLookedStore } from './last-looked-store.mjs';
import { createProjectReader, unavailableProject, validAutonomySnapshot } from './projects.mjs';
import { homeSnapshot, validRelease, homeSections, roadmapOf, backlogFor, withoutRoadmap, backlogReadable } from '../work-items.mjs';

const boundedGap = value => ['source_limit', 'quota_saving'].includes(value) ? value : 'source_unavailable';
const reasons = { source_limit: 'Source read reached its time, size or request bound.', quota_saving: 'Saving GitHub quota; optional source reads are paused.', source_unavailable: 'Source refresh is unavailable; the previous observation is retained.' };
// Increment when parsing semantics or collected capabilities change, even at an unchanged source HEAD.
export const HOME_MODEL_VERSION = 21; // 19: planning counts partial and not-started phases (the plate card's phase bar); 20: each plate's release; 21: item outcomes and assignment policy
async function parallel(items, limit, run) {
  let index = 0;
  const results = await Promise.allSettled(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) await run(items[index++]);
  }));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
}
function validProject(value, project) {
  const string = item => typeof item === 'string', nullable = item => item === null || string(item);
  const array = (items, check) => Array.isArray(items) && items.every(check);
  const action = item => item && string(item.id) && item.projectId === project.id && string(item.title) && string(item.link) && nullable(item.expectedSourceVersion);
  const plan = value?.planning;
  return !!(value && value.id === project.id && value.repoId === project.repoId && value.repo === project.repo
    && string(value.name) && nullable(value.tagline) && nullable(value.version) && nullable(value.revision) && nullable(value.readAt)
    && typeof value.sourceComplete === 'boolean' && ['complete','partial'].includes(value.state)
    && validAutonomySnapshot(value.autonomy, project, value.revision)
    && array(value.stack, string) && array(value.gaps, gap => gap && string(gap.source) && string(gap.reason))
    && plan && string(plan.source) && string(plan.headline) && nullable(plan.next)
    && ['built','total','livedIn'].every(key => plan[key] === null || Number.isSafeInteger(plan[key]) && plan[key] >= 0)
    && ['partial','notStarted'].every(key => plan[key] == null || Number.isSafeInteger(plan[key]) && plan[key] >= 0)
    && array(plan.goals, goal => goal && nullable(goal.id) && nullable(goal.title) && nullable(goal.outcome))
    && (value.release === undefined || validRelease(value.release))
    && ['decisions','walks','reviews','waiting','changes'].every(key => array(value[key], action)));
}
const digestProject = ({ readAt, refreshing, roadmap, ...value }) => value;
// notify(userId, project) receives each project this request read fresh from
// source; it is best-effort and never changes what Home returns.
// notifyDocket(userId, count, { complete }) (phase 175) receives the count in
// "Needs you" of the plates read successfully in a fleet read that was not
// cache-only, and whether every readable plate was; best-effort too.
export function createHomeReader(config, { fetcher = fetch, now = Date.now, enrichChanges = null, notify = null, notifyDocket = null, assignmentQuota = readAssignmentQuota } = {}) {
  const store = createHomeStore(config, fetcher), notNow = createNotNowStore(config, fetcher), looked = createLastLookedStore(config, fetcher), waiting = createWaitingStore(config, fetcher, { now });
  // visit (phase 166): this read is a load of the Home page, so it is recorded as one; /api/home's background
  // refreshes and a plate's page only read, so they never move "since". The server decides (lib/web/server.mjs).
  // backlog (phase 178): also read each plate's claims through the App and return the backlog with the snapshot.
  // recurring (phase 185): also read each plate's latest runs through the App and return every routine, with each plate's links.
  return async (access, token, { projectId = null, fresh = false, since = null, cacheOnly = false, visit = false, backlog = false, recurring = false, agents = false, channel = false, channelSince = null } = {}) => {
    if (since !== null && !/^[a-f0-9]{64}$/.test(since)) throw new WebError('invalid_cursor', 400);
    const selected = projectId === null ? access.projects : access.projects.filter(item => item.id === projectId);
    if (projectId !== null && !selected.length) throw new WebError('access_denied', 404);
    const assignmentRead = projectId && backlog ? Promise.resolve().then(() => assignmentQuota({fetchImpl:fetcher})).catch(() => ({snapshot:null})) : null;
    const scope = hash(JSON.stringify({ model: HOME_MODEL_VERSION, source: access.sourceRevision, projects: access.projects }));
    if (access.quota) await store.observe(access.userId, access.quota);
    const budget = { requests: 0 }, signal = AbortSignal.timeout(25000);
    const readProject = createProjectReader({ fetcher, store, userId: access.userId, token, now, budget, signal });
    const rows = selected.map(project => ({ project, key: store.keyFor(access.userId, project.repoId, scope), cached: null }));
    // Parallel bounded cache reads keep a large fleet's HTML shell responsive.
    await parallel(rows, 8, async row => { row.cached = await store.read(row.key); });
    const usable = row => validProject(row.cached?.value, row.project) ? row.cached.value : null;
    const due = row => fresh || !usable(row)?.sourceComplete || row.cached.value.classifiedOn !== new Date(now()).toISOString().slice(0, 10) || !row.cached?.readAt || now() - Date.parse(row.cached.readAt) >= GH_TTL;
    // nextAttempt records a claimed attempt even when no successful value exists.
    // Unattempted and oldest-attempt projects precede repeatedly failing projects.
    const candidates = rows.filter(due).sort((a, b) => (Date.parse(a.cached?.nextAttempt) || 0) - (Date.parse(b.cached?.nextAttempt) || 0));
    let refreshes = 0;
    if (!cacheOnly) await parallel(candidates, 1, async row => {
      if (refreshes >= 4 || budget.requests >= 200 || signal.aborted) return;
      refreshes++;
      const lease = hash(random()), claimed = await store.claim(row.key, lease);
      row.cached = claimed ?? row.cached;
      if (!claimed?.leaseAcquired) { refreshes--; return; }
      const value = usable(row);
      try {
        const updated = await readProject(row.project, value, { login: access.login ?? null, reviews: access.pullRequestsRead === true, waits: { pulls: access.pullRequestsRead === true, checks: access.checksRead === true } });
        if (value && updated.sourceComplete === false) throw new WebError('source_unavailable');
        row.cached = await store.finish(row.key, lease, updated) ?? await store.read(row.key);
        if (notify) try { await notify(access.userId, updated); } catch { /* Best effort: a push failure never fails the read. */ }
      } catch (error) {
        row.cached = await store.fail(row.key, lease, boundedGap(error.code)) ?? row.cached;
        if (error.status === 401) throw error;
      }
    });
    const projects = [];
    for (const row of rows) {
      const { project, cached } = row;
      let value = usable(row);
      if (!value) {
        value = unavailableProject(project, cached?.lastError ? reasons[cached.lastError] : cached?.refreshing
          ? 'A source refresh is already in progress. This view will update when it finishes.' : 'Project sources are loading within the bounded fleet refresh.');
        if (!cached?.lastError) { value.state = 'loading'; value.planning.headline = 'Loading source plan'; }
      }
      else {
        value = structuredClone(value);
        if (cached?.lastError) { value.state = 'stale'; value.gaps.push({ source: 'refresh', reason: reasons[cached.lastError] }); }
        else if (cached?.readAt && now() - Date.parse(cached.readAt) >= GH_TTL) { value.state = 'stale'; value.gaps.push({ source: 'refresh', reason: 'Last observed source is older than the ten-minute cache window.' }); }
      }
      projects.push(value);
    }
    // Plates in the manifest that this access cannot read are listed, never read.
    if (projectId === null) for (const item of access.unavailable ?? []) projects.push(unavailableProject({ id: item.id, repo: item.repo, repoId: null }, item.reason));
    // Private attachment observations are fresh independently of GitHub HEAD/cache age.
    // Bound to the same twenty recent items shown on Home; enrichment reads no image bytes.
    if(enrichChanges){
      const recent=projects.flatMap(project=>project.changes).sort((a,b)=>(b.date??'').localeCompare(a.date??'')||a.id.localeCompare(b.id)).slice(0,20);
      await parallel(projects,4,async value=>{
        const selected=recent.filter(change=>change.projectId===value.id&&change.kind==='change');if(!selected.length)return;
        const project=access.projects.find(p=>p.id===value.id);
        try{const enriched=await enrichChanges(access,project,selected);const byId=new Map(enriched.map(item=>[item.id,item]));value.changes=value.changes.map(item=>byId.get(item.id)||item);}
        catch{value.changes=value.changes.map(item=>selected.includes(item)?{...item,captures:(item.captures??[]).map(slot=>({...slot,capture:null,attachmentState:'unavailable'}))}:item);value.gaps.push({source:'private media',reason:'Private attachment observations are unavailable; source records remain visible.'});}
      });
    }
    // The independent reads overlap the quota RPC, but the visit is a write: it waits for quota, so
    // a failed quota records no visit (the boundary the serial version kept). Each store keeps its
    // existing failure policy below.
    const readsSettled = Promise.allSettled([notNow.list(access.userId), visit ? null : looked.read(access.userId), waiting.list(access.userId)]);
    const resultOf = result => { if (result.status === 'rejected') throw result.reason; return result.value; };
    const quota = await store.quota(access.userId);
    const [snoozedRead, lookedEarly, waitingRead] = await readsSettled;
    const lookedRead = visit ? (await Promise.allSettled([looked.visit(access.userId)]))[0] : lookedEarly;
    // The sections only the CLI reads, or neither form, are rows here too: never missing (phase 156).
    // Not now (phase 173): the owner's records in the store. A store that cannot be read hides nothing and is a gap.
    let snoozed = {}, notNowGap = null;
    try { snoozed = resultOf(snoozedRead); } catch (error) { if (error.status === 401) throw error; notNowGap = 'Not now records could not be read; nothing is hidden.'; }
    // Since you last looked (phase 166, SQL018): the last load of the owner's previous visit. Before 018 is applied, or
    // when the store cannot be read, Home uses the fixed window and says so; it never fails the page.
    let lastLooked = null, lookedGap = null;
    try { lastLooked = resultOf(lookedRead).previous; }
    catch (error) { if (error.status === 401) throw error; lookedGap = 'Visits are not stored yet'; }
    // Each plate's phases ride on its cached value (projectFromSource); claims change without the default branch moving, so they are read now.
    let roadmaps = null;
    // Claims are read once for the backlog, for Agents (phase 186) and for the channel (phase 194), for every plate any lists;
    // where open PRs are wanted too, one activity query per plate reads both.
    const claims = new Map(), prs = new Map(), wantsPrs = (agents || channel) && access.pullRequestsRead === true;
    if (backlog || agents || channel) await parallel(projects.filter(p => backlogReadable(p) && (agents || channel || p.roadmap)), 4, async value => {
      if (wantsPrs) {
        const activity = await readProject.activity(value, { pulls: true });
        claims.set(value.id, activity.claims); prs.set(value.id, activity.prs);
      } else claims.set(value.id, await readProject.claims(value, { pulls: access.pullRequestsRead === true }));
    });
    if (backlog) roadmaps = projects.map(p => roadmapOf(p, claims.get(p.id), { now: now() }));
    let routines = null, links = null, team = null;
    if (backlog || recurring || agents) {
      const { linksOf, recurringOf, recurringInputOf, wantsRuns } = await import('./recurring-model.mjs');
      links = projects.filter(p => p.state !== 'unavailable' || p.repo).map(p => linksOf(p, p.recurring?.config ?? {}));
      if (recurring) {
        const runs = new Map();
        await parallel(projects.filter(wantsRuns), 4, async value => { runs.set(value.id, await readProject.runs(value, { actions: ['read', 'write'].includes(access.actionsPermission) })); });
        routines = recurringOf(projects.map(p => recurringInputOf(p, runs.get(p.id))), { now: now() });
      }
    }
    // Agents and Pending review (phase 186): each plate's open PRs through the App, with the Pull requests read.
    if (agents || channel) await parallel(projects.filter(p => backlogReadable(p) && !prs.has(p.id)), 4, async value => { prs.set(value.id, await readProject.prs(value, { pulls: access.pullRequestsRead === true })); });
    if (agents) {
      const { agentsFor, agentsInputOf } = await import('./agents-model.mjs');
      team = agentsFor(projects.map(p => agentsInputOf(p, claims.get(p.id), prs.get(p.id))), { now: now() });
    }
    // The channel (phase 194): each plate's input while its phases' titles are still on its value; built once the waiting row is read.
    // Agents' own lines (plates say, SQL024), the owner's sealed posts per plate. Before 024 is applied, or when the store cannot be read, each plate's channel says so.
    const says = new Map();
    if (channel) {
      const { WINDOW_DAYS } = await import('../channel.mjs'), posts = createChannelStore(config, fetcher), floor = new Date(now() - WINDOW_DAYS * 86_400_000).toISOString();
      await parallel(projects.filter(backlogReadable), 4, async value => {
        // The whole window, never channelSince: since narrows only the feed shown (channelFor), never Here now or unread.
        try { says.set(value.id, { state: 'read', items: await posts.list(access.userId, value.id, { since: floor }) }); }
        catch (error) { if (error?.status === 401) throw error; says.set(value.id, { state: 'unavailable', why: error?.code === 'invalid_channel_project' ? 'this plate is not pinned in the workspace configuration' : 'the workspace\'s channel posts could not be read' }); }
      });
    }
    const channelInputs = channel ? await (async () => { const { channelInputOf } = await import('../channel.mjs'); return projects.map(p => channelInputOf(p, { claims: claims.get(p.id), prs: prs.get(p.id), says: says.get(p.id) ?? null })); })() : null;
    const selectedConfig = projects.find(p => p.id === projectId)?.recurring?.config ?? {};
    for (let i = 0; i < projects.length; i++) projects[i] = withoutRoadmap(projects[i]);
    // Sessions waiting on you: the snapshots the owner's devices pushed (SQL022). Before 022 is applied, or when the
    // store cannot be read, the row says so; it never fails the page.
    let sessions, runme, waitingUnread = false;
    try {
      const snapshots = resultOf(waitingRead), plates = access.projects.map(p => p.id);
      sessions = waitingRows(snapshots, { plates, now: now() });
      // The workspace's own plate is home: a script that names no plate is its.
      runme = runmeRows(snapshots, { plates, home: access.projects.find(p => p.repoId === config.workspace.repoId)?.id ?? plates[0] ?? null, now: now() });
      // Ownership is resolved against every plate the owner can read; a single plate's Home and Review keep only its own.
      const shown = new Set(projects.map(p => p.id)), only = row => (row.items ? { ...row, items: row.items.filter(i => shown.has(i.plate)) } : row);
      sessions = only(sessions); runme = only(runme);
    } catch (error) {
      if (error.status === 401) throw error;
      sessions = runme = { na: 'waiting sessions could not be read' };
      // Unread is not none: Home's coverage says so (on the workspace's own plate), and the docket's count is not complete.
      waitingUnread = true;
      const at = Math.max(0, projects.findIndex(p => p.repoId === config.workspace.repoId));
      if (projects[at]) projects[at] = { ...projects[at], gaps: [...projects[at].gaps, { source: 'waiting', reason: 'Sessions and scripts waiting on you could not be read; some may be missing.' }] };
    }
    const model = homeSnapshot(projects, { sections: homeSections({ sessions, runme }), can: { form: 'web', decisionWrites: config.decisionWrites === true, mergeWrites: access.pullRequestsPermission === 'write' && access.contentsPermission === 'write' }, snoozed, notNowGap, today: new Date(now()).toISOString().slice(0, 10),
      lastLooked, lookedFrom: 'last-visit', lookedGap });
    // Only plates read successfully this time are counted: a failed, stale or loading plate is not zero items. A lower
    // count is recorded only when every plate the App can read was read; a plate it can never read (access.unavailable) is not one of them.
    if (notifyDocket && projectId === null && !cacheOnly) {
      const read = new Set(projects.filter(p => ['complete', 'partial'].includes(p.state)).map(p => p.id));
      const count = model.docket.filter(entry => read.has(entry.key.split(':')[0])).length;
      const complete = !waitingUnread && selected.every(project => read.has(project.id));
      try { await notifyDocket(access.userId, count, { complete }); } catch { /* Best effort: a push failure never fails the read. */ }
    }
    const projectedBacklog = roadmaps ? backlogFor(model, roadmaps, { now: now() }) : null;
    const projectWorkspace = projectId && projectedBacklog ? simpleProject({...model, backlog:projectedBacklog}, projectId, {config:selectedConfig, recommendation:assignmentRecommendation(selectedConfig, await assignmentRead, {now:now()})}) : null;
    const channelModel = channelInputs ? (await import('../channel.mjs')).channelFor(channelInputs, { now: now(), since: channelSince, waiting: sessions }) : null;
    // Sessions waiting on you change without any project source moving, so the cursor covers them too; so do the channel's
    // lines (claims and PRs move on their own), its gaps without their time, which is the read's.
    const content = { projects: projects.map(digestProject), quotaState: quota.state, sessions, runme, ...(projectWorkspace ? {projectWorkspace} : {}), ...(projectedBacklog ? { backlog: projectedBacklog } : {}),
      ...(channelModel ? { channel: channelModel.lines.map(l => (l.kind === 'gap' || l.timeUnknown ? { ...l, at: null } : l)) } : {}) };
    const cursor = hash(JSON.stringify(content));
    const remembered = await store.cursor(store.keyFor(access.userId, `cursor:${projectId ?? 'fleet'}${backlog ? ':backlog' : ''}`, scope), cursor, since);
    if (!['initial','current','changed','gap'].includes(remembered?.state)) throw new WebError('invalid_cursor_response');
    const at = now();
    return { schema: 1, cursor, cursorState: remembered.state, generatedAt: new Date(at).toISOString(), ...model, quota, ...(projectWorkspace ? {projectWorkspace} : {}), ...(projectedBacklog ? { backlog: projectedBacklog } : {}),
      ...(routines ? { recurring: routines } : {}), ...(links ? { links } : {}), ...(team ? { agents: team } : {}), ...(channelModel ? { channel: channelModel } : {}) };
  };
}
