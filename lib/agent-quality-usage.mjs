// Read-side lifecycle accounting on the existing quality ledger. No provider calls,
// account selection, quota calculation, reservation or execution.
import { fingerprint, sealRecord, checkEvaluation as check } from './evaluation-records.mjs';
import { validateQualityBundle } from './agent-quality-records.mjs';
import { validateUsageObservation, validateEpisodeUsage, USAGE_METRICS } from './agent-quality-usage-records.mjs';
import { qualityOperation } from './agent-quality-ledger.mjs';

const sum = values => values.reduce((n,v) => n + v,0);
const metric = (values, complete = true) => {
  const known = values.filter(v => v !== null);
  const covered = complete && values.length > 0 && known.length === values.length;
  return { knownSubtotal: sum(known), total: covered ? sum(known) : null, observed:known.length,expected:values.length,complete:covered };
};
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const semanticDigest = r => fingerprint({ ...r, digest:null,revision:null,previousDigest:null,observedAt:null,source:null });
const sameAccount = (a,b) => a.provider === b.provider && a.funding.accountId !== null && a.funding.accountId === b.funding.accountId;
const touches = (a,b) => sameAccount(a,b) && a.counter.requestIds.some(id => b.counter.requestIds.includes(id));
const contains = (a,b) => b.counter.requestIds.length > 0 && b.counter.requestIds.every(id => a.counter.requestIds.includes(id));

/** Project scope is supplied by the caller's authorization boundary, never inferred
 * from set membership. Shared projection is deliberately a separate allowlist. */
export function qualityUsageReport(bundle, { projects, pr = null, actorId = null, shared = true, now = new Date().toISOString(), ledgerCoverage = null, repositoryBindings = [] } = {}) {
  validateQualityBundle(bundle);
  check(Array.isArray(projects) && projects.length <= 100 && projects.every(p => typeof p === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(p)) && new Set(projects.map(p => p.toLowerCase())).size === projects.length, 'explicit authorized usage projects required');
  check(typeof shared === 'boolean' && (shared || typeof actorId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(actorId)) && iso(now), 'invalid usage report scope');
  check(pr === null || pr && Object.keys(pr).length === 2 && Number.isSafeInteger(pr.repositoryId) && pr.repositoryId > 0 && Number.isSafeInteger(pr.number) && pr.number > 0, 'invalid usage PR scope');
  check(Array.isArray(repositoryBindings) && repositoryBindings.every(b => b && Object.keys(b).length === 2 && typeof b.project === 'string' && projects.some(p => p.toLowerCase() === b.project.toLowerCase()) && Number.isSafeInteger(b.repositoryId) && b.repositoryId > 0) && new Set(repositoryBindings.map(b => b.project.toLowerCase())).size === repositoryBindings.length && new Set(repositoryBindings.map(b => b.repositoryId)).size === repositoryBindings.length, 'invalid authorized repository bindings');
  // Bindings are trusted adapter context, never evidence taken from a receipt.
  const bindings = new Map(repositoryBindings.map(b => [b.project.toLowerCase(), b.repositoryId]));
  const permitted = new Set(projects.map(p => p.toLowerCase())), gaps = [], candidates = [], attempts = [], issues = [];
  let unknownAttemptCoverage = false;
  const gap = code => { if (!gaps.some(g => g.code === code)) gaps.push({code}); };
  const issue = (code, items) => issues.push({code,ids:new Set(items.map(x => x.record.measurementId))});
  const matches = r => !pr || r.attribution.repositoryId === pr.repositoryId && r.attribution.prs.some(p => p.number === pr.number);
  if (ledgerCoverage?.expired > 0) gap('expired-episodes');
  if (ledgerCoverage?.sourceIssues?.length) gap('collector-source-incomplete');
  // Collect all authorized, audience-visible measurements before filtering a PR:
  // overlap and incompatible allocations are properties of the whole ledger.
  for (const episode of bundle.episodes) {
    if (!permitted.has(episode.project.toLowerCase())) continue;
    const latest = [...validateEpisodeUsage(episode).values()], episodeMatches = latest.some(matches);
    if (pr && !episodeMatches && episode.links.some(link => link.toLowerCase() === `${episode.project.toLowerCase()}#${pr.number}`)) gap('legacy-pr-binding-unverified');
    for (const a of episode.attempts) {
      const observations = latest.filter(r => r.attemptId === a.id);
      const inScope = !pr || observations.some(matches) || observations.length === 0 && episodeMatches;
      const visible = observations.filter(r => (shared ? r.visibility === 'project' : r.actorId === actorId));
      if (inScope && visible.length !== observations.length) {unknownAttemptCoverage=true;gap('restricted-usage');}
      if (!observations.length) {if(inScope){unknownAttemptCoverage=true;gap('usage-missing');}continue;}
      if (!visible.length) continue;
      const first = visible[0];
      // Project visibility is the explicit permission to expose this attempt's
      // status/stage. No private agent/source metadata is copied from the episode.
      const ref = {episodeId:episode.id,project:episode.project.toLowerCase(),id:a.id,stage:a.stage,status:a.status,provider:first.provider,model:first.model,modelVersion:first.modelVersion,usageState:visible.length===observations.length?'observed':'partial',inScope};
      attempts.push(ref);
      if (inScope && episode.passport.timing !== 'prospective') gap('retrospective-lifecycle');
      if (inScope && ['running','unknown'].includes(a.status)) gap('attempt-still-open');
      for (const record of visible) {
        if (record.observedAt > now) {if(inScope)gap('future-observation');continue;}
        const item = {record,refs:[ref],excluded:false,unbound:record.funding.accountId===null||record.funding.kind==='unknown',weight:1};
        if (item.unbound) issue('funding-identity-unknown',[item]);
        if (record.source.kind === 'declared') issue('declared-usage',[item]);
        if (record.counter.includesChildren === 'unknown') issue('child-inclusion-unknown',[item]);
        candidates.push(item);
      }
    }
  }
  const repositoryProjects = new Map();
  for (const item of candidates) {
    const id = item.record.attribution.repositoryId;
    if (!repositoryProjects.has(id)) repositoryProjects.set(id, new Set());
    repositoryProjects.get(id).add(item.refs[0].project);
  }
  const canonical = new Map();
  for (const item of candidates) {
    const prior = canonical.get(item.record.measurementId);
    if (!prior) {canonical.set(item.record.measurementId,item);continue;}
    prior.refs.push(...item.refs);
    if (semanticDigest(prior.record) !== semanticDigest(item.record)) {prior.excluded=true;issue('conflicting-measurement',[prior,item]);}
  }
  const rows = [...canonical.values()];
  const allocationKey = r => fingerprint({repositoryId:r.attribution.repositoryId,prs:[...r.attribution.prs].sort((a,b)=>a.number-b.number)});
  const parents = rows.filter(x => x.record.counter.mode !== 'request').sort((a,b)=>b.record.counter.requestIds.length-a.record.counter.requestIds.length);
  for (const parent of parents) {
    if(parent.excluded)continue;
    const overlaps = rows.filter(x => x !== parent && !x.excluded && touches(parent.record,x.record));
    if (overlaps.some(x => allocationKey(parent.record) !== allocationKey(x.record))) {
      const group=[parent,...overlaps];for(const item of group)item.excluded=true;issue('overlap-allocation-conflict',group);continue;
    }
    const leaves = overlaps.filter(x => x.record.counter.mode === 'request'), leafIds = new Set(leaves.flatMap(x => x.record.counter.requestIds));
    if (parent.record.counter.requestIds.length && parent.record.counter.requestIds.every(id => leafIds.has(id))) {
      parent.excluded=true;
      for (const key of USAGE_METRICS) if (parent.record.tokens[key] !== null && leaves.every(x => x.record.tokens[key] !== null) && sum(leaves.map(x => x.record.tokens[key])) !== parent.record.tokens[key]) issue('aggregate-reconciliation',[parent,...leaves]);
      const comparableCosts = parent.record.cost.amount !== null && leaves.every(x => x.record.cost.currency === parent.record.cost.currency && x.record.cost.kind === parent.record.cost.kind && x.record.cost.amount !== null);
      if (!comparableCosts) issue('aggregate-cost-coverage',[parent,...leaves]);
      else if (Math.abs(sum(leaves.map(x => x.record.cost.amount))-parent.record.cost.amount)>1e-8) issue('aggregate-cost-reconciliation',[parent,...leaves]);
      continue;
    }
    if (overlaps.length && overlaps.every(x => contains(parent.record,x.record))) {
      // Even incomplete leaf coverage provides a lower bound. Canonical request
      // leaves are disjoint; absent counters contribute no bound, never zero usage.
      // Also compare each contained aggregate on its own without adding overlaps.
      const lowerBounds = [leaves, ...overlaps.filter(x => x.record.counter.mode !== 'request').map(x => [x])];
      for (const children of lowerBounds) {
        for (const key of USAGE_METRICS) {
          const compatible = children.filter(x => fingerprint(x.record.semantics) === fingerprint(parent.record.semantics) && x.record.tokens[key] !== null);
          if (parent.record.tokens[key] !== null && sum(compatible.map(x => x.record.tokens[key])) > parent.record.tokens[key]) issue('aggregate-reconciliation',[parent,...children]);
        }
        const compatibleCosts = children.filter(x => x.record.cost.currency === parent.record.cost.currency && x.record.cost.kind === parent.record.cost.kind && x.record.cost.amount !== null);
        if (parent.record.cost.amount !== null && sum(compatibleCosts.map(x => x.record.cost.amount)) - parent.record.cost.amount > 1e-8) issue('aggregate-cost-reconciliation',[parent,...children]);
      }
      for(const child of overlaps){child.excluded=true;parent.refs.push(...child.refs);}
    } else if(overlaps.length){parent.excluded=true;issue('unresolved-counter-overlap',[parent,...overlaps]);}
    const sameSession=rows.filter(x => x !== parent && !x.excluded && sameAccount(parent.record,x.record) && parent.record.counter.sessionId===x.record.counter.sessionId && (x.record.counter.mode==='request'||x.record.counter.segmentId===parent.record.counter.segmentId));
    if (!parent.record.counter.requestIds.length && sameSession.length) {parent.excluded=true;issue('unresolved-counter-overlap',[parent,...sameSession]);}
  }
  const scopedRows=rows.filter(x=>matches(x.record)), scopedIds=new Set(scopedRows.map(x=>x.record.measurementId));
  for(const item of issues)if([...item.ids].some(id=>scopedIds.has(id)))gap(item.code);
  for(const item of scopedRows){
    item.weight=pr?item.record.attribution.prs.find(p=>p.number===pr.number).weight:1;
    if(item.weight===null)gap('shared-unallocated');
    item.binding='project-associated';
    if(pr){
      if(repositoryProjects.get(pr.repositoryId)?.size>1){item.excluded=true;item.binding='conflicting';gap('repository-binding-conflict');}
      else if(item.refs.some(ref=>bindings.has(ref.project)&&bindings.get(ref.project)!==pr.repositoryId)){item.excluded=true;item.binding='mismatched';gap('repository-binding-mismatch');}
      else if(item.refs.some(ref=>!bindings.has(ref.project))){item.mappingUnverified=true;item.binding='unverified';gap('repository-binding-unverified');}
      else item.binding='adapter-bound';
    }
  }
  // Unknown funding identity means disjointness cannot be established: even a
  // subtotal must not add aliased observations or claim a known independent sum.
  const selected=scopedRows.filter(x=>!x.excluded&&!x.unbound&&!x.mappingUnverified&&x.weight!==null);
  const visibleAttempts=attempts.filter(a=>a.inScope).map(({inScope,...a})=>a);
  const complete=gaps.length===0&&visibleAttempts.length>0;
  const totals=Object.fromEntries(USAGE_METRICS.map(key=>[key,metric(selected.map(x=>x.record.tokens[key]===null?null:x.record.tokens[key]*x.weight),complete)]));
  const costKinds=[...new Set(selected.map(x=>`${x.record.cost.currency}:${x.record.cost.kind}`))].sort();
  totals.costs=costKinds.map(key=>{const [currency,kind]=key.split(':'),values=selected.filter(x=>x.record.cost.currency===currency&&x.record.cost.kind===kind);return {currency,kind,...metric(values.map(x=>x.record.cost.amount===null?null:x.record.cost.amount*x.weight),complete&&values.length===selected.length&&kind!=='unknown')};});
  const measurements=scopedRows.filter(x=>!x.excluded).map(({record:r,refs,weight,unbound,binding,mappingUnverified})=>({
    id:r.measurementId,episodeId:refs.find(r=>r.inScope)?.episodeId??refs[0].episodeId,attemptId:r.attemptId,stage:refs[0].stage,provider:r.provider,model:r.model,modelVersion:r.modelVersion,
    repositoryBinding:binding,tokens:{...r.tokens},cost:{currency:r.cost.currency,kind:r.cost.kind,amount:r.cost.amount},attribution:mappingUnverified?'unverified-pr-association':unbound?'unbound-nonadditive':weight===null?'shared-unallocated':pr?'allocated':'deduplicated-associated',weight:unbound||mappingUnverified?null:weight,
    ...(!shared?{actorId:r.actorId,funding:{...r.funding}}:{}),
  }));
  return {schemaVersion:1,kind:'quality-usage-report',scope:{projects:[...permitted].sort(),pr,visibility:shared?'project':'personal'},
    coverage:{state:visibleAttempts.length===0&&!gaps.length?'empty':complete&&USAGE_METRICS.every(k=>totals[k].complete)&&totals.costs.length>0&&totals.costs.every(c=>c.complete)?'complete':'partial',basis:'recorded visible lifecycle; not provider billing completeness',provenance:'supplied observation metadata; not independently authenticated by this report',billingVerified:false,repositoryBinding:pr?'trusted caller binding required; receipt attribution alone is unverified':'project scope supplied by caller',expectedAttempts:unknownAttemptCoverage?null:visibleAttempts.length,observedAttempts:visibleAttempts.filter(a=>a.usageState==='observed').length,gaps},totals,attempts:visibleAttempts,measurements};
}

/** Append a measurement as an episode revision through the existing preview,
 * shared lock, retention bounds, immutable receipts and readback path. */
export async function appendUsageObservation(options) {
  const {project,episodeId,observation,yes=false,digest}=options;
  validateUsageObservation(observation);
  const at = options.now ?? new Date().toISOString();
  check(iso(at) && observation.observedAt <= at, 'usage observation is in the future');
  const inspected = await qualityOperation({...options,action:'inspect',yes:false,digest:undefined,bundle:undefined,inputBundle:undefined});
  const sourceId = `usage-${observation.digest}`;
  const original = inspected.receipts.find(r => r.bundle.episodes.some(e => e.project.toLowerCase() === project?.toLowerCase() && e.id === episodeId && e.source.id === sourceId));
  if (original) return qualityOperation({...options,action:'collect',inputBundle:original.bundle,bundle:undefined,yes,digest});
  const episode = inspected.bundle.episodes.find(e => e.project.toLowerCase() === project?.toLowerCase() && e.id === episodeId);
  check(episode && at >= episode.createdAt, 'active usage episode missing or observation predates revision');
  // The reviewed input must not depend on the wall clock of preview vs apply.
  const revisionAt = episode.createdAt > observation.observedAt ? episode.createdAt : observation.observedAt;
  const updated = sealRecord({...episode,previousDigest:episode.digest,createdAt:revisionAt,source:{kind:'observer',id:sourceId,at:observation.observedAt,digest:observation.digest},usage:[...(episode.usage??[]),observation]});
  const inputBundle = {...inspected.bundle,episodes:[updated]};
  return qualityOperation({...options,action:'collect',inputBundle,bundle:undefined,yes,digest});
}
