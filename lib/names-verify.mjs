import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, posix } from 'node:path';
import { WRITERS } from '../practices/night/files/scripts/plates/canvas-recovery.mjs';
// Read-only phase129 checklist. Provider facts never imply unobserved fresh writes.
import { NAMES, nameRow, remoteLabelReceipt, labelWriter, readNames, markerRegion } from '../practices/night/files/scripts/plates/names.mjs';
import { namesRead, namesPages, namesBranches, labelFacts, validRepo, matchesReference, labelCoverage } from './names-actions.mjs';
const sha = v => /^[a-f0-9]{40}$/.test(v ?? '');
const positive = n => Number.isSafeInteger(n) && n > 0;
const result = (id,state,reason,evidence=[]) => ({id,state,reason,evidence});
const queue = name => NAMES.filter(r=>r.surface==='git ref'&&r.phase===125).some(r=>['keel','plates'].some(k=>matchesReference(r,name,k)));
const legacyQueue = name => NAMES.filter(r=>r.surface==='git ref'&&r.phase===125).some(r=>matchesReference(r,name,'keel'));
export async function verifyNames({repo,run,morningRun},github) {
  if(!validRepo(repo)||run!==undefined&&(!positive(Number(run))||!/^\d+$/.test(String(run))))throw new Error('Invalid verify repository or run');
  if(morningRun!==undefined&&(!positive(Number(morningRun))||!/^\d+$/.test(String(morningRun))))throw new Error('Invalid morning run');
  const checks=[],gaps=[];let meta,night;
  const base=`/repos/${repo}`;
  try{
    meta=await namesRead(github,base);
    if(!positive(meta?.id)||meta.full_name!==repo)throw new Error();
    if(run!==undefined)night=await namesRead(github,`${base}/actions/runs/${run}`);
    else{
      const runs=await namesPages(github,`${base}/actions/workflows/plates-night.yml/runs?event=workflow_dispatch`,'workflow_runs');
      runs.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);night=runs[0];
    }
    if(!positive(night?.id)||!positive(night.run_attempt)||!sha(night.head_sha)||night.repository?.id!==meta.id||night.repository?.full_name!==repo||night.event!=='workflow_dispatch'||!Object.entries(WRITERS).filter(([,writer])=>writer.artifactId==='artifact:keel-canvas-night').some(([file])=>night.path===`.github/workflows/${file}`))throw new Error();
    const attempt=await namesRead(github,`${base}/actions/runs/${night.id}/attempts/${night.run_attempt}`);
    if(attempt.id!==night.id||attempt.run_attempt!==night.run_attempt||attempt.head_sha!==night.head_sha||attempt.repository?.id!==meta.id||attempt.event!==night.event||attempt.status!==night.status||attempt.conclusion!==night.conclusion)throw new Error();
  }catch{night=null;gaps.push('Selected dispatched night/attempt/source identity unavailable');}
  const source=night?{repositoryId:meta.id,repo,runId:night.id,attempt:night.run_attempt,revision:night.head_sha,event:night.event}:null;
  checks.push(result('night',!night?'unknown':night.status==='completed'&&night.conclusion==='success'?'pass':'fail',!night?'No complete source-bound attempt':night.status==='completed'&&night.conclusion==='success'?'Selected dispatched night succeeded':'Selected dispatched night is not successful',source?[source]:[]));
  let nightPr;
  if(night){
    try{
      const associated=night.pull_requests;
      if(!Array.isArray(associated)||associated.length!==1||!positive(associated[0].number))throw new Error();
      nightPr=await namesRead(github,`${base}/pulls/${associated[0].number}`);
      if(nightPr.number!==associated[0].number||nightPr.base?.repo?.id!==meta.id||nightPr.head?.sha!==associated[0].head?.sha)throw new Error();
      const branch=nightPr.head?.ref;
      const current=/^plates-night\/\d{4}-\d\d-\d\d$/.test(branch??'');
      const continuation=/^keel-night\/\d{4}-\d\d-\d\d$/.test(branch??'')&&Number.isFinite(Date.parse(nightPr.created_at))&&Date.parse(nightPr.created_at)<Date.parse(night.created_at);
      checks.push(result('night-branch',current||continuation?'pass':'fail',continuation?'Required legacy-night continuation retains original identity':current?'Associated night branch is current':'Fresh or unsupported legacy night branch',[{...source,pr:nightPr.number,branch}]));
    }catch{nightPr=null;checks.push(result('night-branch','unknown','Dispatch does not supply an unambiguous night-PR association'));}
  }else checks.push(result('night-branch','unknown','Night identity unavailable'));
  // GitHub workflow_dispatch runs do not intrinsically identify their later morning.
  // Do not turn matching SHA/date or another green run into a fabricated relationship.
  checks.push(result('morning-final','unknown','Source-bound morning association and final-on-original-prefix evidence are required'));
  if(night){
    try{
      const artifacts=await namesPages(github,`${base}/actions/runs/${night.id}/artifacts`,'artifacts');
      if(artifacts.some(a=>a.workflow_run?.id!==night.id||a.workflow_run?.head_sha!==night.head_sha))throw new Error();
      const legacy=artifacts.filter(a=>NAMES.filter(r=>r.surface==='artifact').some(r=>a.name===r.keel||a.name.startsWith(r.keel+'-')));
      checks.push(result('artifacts',night.run_attempt===1?(legacy.length?'fail':'pass'):'unknown',night.run_attempt===1?(legacy.length?'Fresh selected run contains legacy artifact names':'Complete first-attempt artifact metadata contains no legacy artifact names'):'Exact rerun artifact attempt coverage is not established',legacy.map(a=>({...source,artifactId:a.id,name:a.name}))));
    }catch{checks.push(result('artifacts','unknown','Selected run artifact coverage unavailable'));}
    try{
      const receipt=await remoteLabelReceipt({repo,revision:night.head_sha,github});
      const observation=await labelFacts(github,repo);
      if(!receipt)throw new Error();
      const coverage=await labelCoverage(github,repo,night.head_sha);
      const required=NAMES.filter(r=>r.surface==='label'&&(coverage[r.id]==='enabled-writer'||observation.labels.some(l=>l.name===r.keel||l.name===r.plates)));
      for(const row of required){
        if(labelWriter({id:row.id,repo,repositoryId:meta.id,receipt,observation})!==row.plates)throw new Error();
      }
      const unknown=Object.values(coverage).some(s=>s==='unknown-writer-coverage');
      checks.push(result('label-receipt',unknown?'unknown':'pass',unknown?'Enabled label scope has unclassified writers':'Enabled label scope has committed source-revision evidence and current ID readback',[{...source,required:required.map(r=>r.id),coverage}]));
    }catch{checks.push(result('label-receipt','unknown','Committed run-revision label evidence or current ID readback incomplete'));}
  }else{
    checks.push(result('artifacts','unknown','Night identity unavailable'));
    checks.push(result('label-receipt','unknown','Night source revision unavailable'));
  }
  checks.push(result('fresh-markers-fences-labels','unknown','Before/after write provenance is required; historical body text is not a fresh-write observation'));
  try{
    const prs=await namesPages(github,`${base}/pulls?state=open`);
    if(prs.some(p=>!positive(p.number)||p.base?.repo?.id!==meta.id||typeof p.head?.ref!=='string'))throw new Error();
    const candidates=prs.filter(p=>queue(p.head.ref)&&legacyQueue(p.head.ref));
    const active=[],unknown=[];
    for(const p of candidates){const detail=await namesRead(github,`${base}/pulls/${p.number}`);if(detail.number!==p.number||detail.base?.repo?.id!==meta.id||detail.head?.sha!==p.head.sha||detail.state!=='open')throw new Error();if(detail.mergeable===true)active.push(p.number);else if(detail.mergeable!==false)unknown.push(p.number);}
    checks.push(result('drain',active.length?'fail':unknown.length?'unknown':'pass',active.length?'Legacy PRs still merge':unknown.length?'Legacy PR mergeability unresolved':'Complete open-PR read contains no mergeable legacy queue entries',candidates.map(p=>({repo,pr:p.number,branch:p.head.ref}))));
  }catch{checks.push(result('drain','unknown','Complete current queue/mergeability coverage unavailable'));}
  try{
    const refs=await namesBranches(github,repo);
    const names=refs.map(r=>r.name);
    const plan=readNames('git ref:keel-night-plan').filter(n=>names.includes(n));
    const verify=readNames('git ref:keel-verify').filter(n=>names.includes(n));
    checks.push(result('board-history','unknown','Branch availability does not prove board/morning consumed plan and verify history',[{repo,plan,verify}]));
  }catch{checks.push(result('board-history','unknown','Plan/verify branch coverage unavailable'));}
  let observationScope=null;
  if(night){const observed=await observationChecks({night,repo,repositoryId:meta.id,morningRun},github);for(const c of observed.checks){const i=checks.findIndex(x=>x.id===c.id);if(i>=0){if(!(c.id==='drain'&&checks[i].state!=='pass'))checks[i]=c;}else checks.push(c);}if(observed.gap)gaps.push(observed.gap);observationScope=observed.scope??null;}
  const data={schema:1,repo,source,checks,gaps,observationScope,state:checks.some(c=>c.state==='fail')?'failed':checks.some(c=>c.state==='unknown')?'unknown':'verified',activation:'Not authorized by verification'};
  return {data,text:checks.map(c=>`${c.state}: ${c.id} — ${c.reason}`).join('\n')+(observationScope?'\nScope: enumerated managed writers/readers only; project setup/gate effects and full-fleet acceptance are not certified.':''),exitCode:data.state==='verified'?0:1};
}

// Evidence derives from these source-owned producer points, never supplied success flags.
export const OBSERVATION_PRODUCERS = Object.freeze({
  night: Object.freeze([
    {id:'improve',step:'night/improve',name:'Measure',path:'scripts/plates/improve.mjs'},
    {id:'plan-publication',step:'night/pr',name:"Open the night's pull request",path:'scripts/plates/night-plan.mjs'},
    {id:'night-pr',step:'night/pr',name:"Open the night's pull request",path:'.github/workflows/plates-night.yml'},
    {id:'drain',step:'night/drain',name:'Drain the queue',path:'scripts/plates/drain.mjs'},
  ]),
  morning: Object.freeze([
    {id:'finalization',step:'finalize/finalize',name:"Open the night's final pull request",path:'scripts/plates/morning.mjs'},
    {id:'final-pr',step:'finalize/finalize',name:"Open the night's final pull request",path:'.github/workflows/plates-morning.yml'},
    {id:'brief',step:'send/send',name:'Send the brief',path:'scripts/plates/morning.mjs'},
    {id:'board',step:'names-observation/board',name:'Observe the actual board',path:'lib/board.mjs'},
  ]),
});
export function expectedObservationProducers(kind,config) {
  const required=OBSERVATION_PRODUCERS[kind];
  if(!required || !config || !Array.isArray(config.practices))throw new Error('Observation source configuration unavailable');
  const unsupported=[];
  if(config.canvas?.enabled===true && config.canvas?.cadence==='nightly')unsupported.push('enabled-canvas-writer');
  return {required,unsupported};
}
const observationHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitHash=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
async function observedSource(github,repo,source) {
  const response=await namesRead(github,`/repos/${repo}/contents/${source.path}?ref=${source.commitSha}`);
  if(response?.type!=='file'||response.path!==source.path||response.encoding!=='base64'||response.sha!==source.blobSha||typeof response.content!=='string'||response.content.length>1500000)throw new Error('Observation source unavailable');
  const bytes=Buffer.from(response.content,'base64');
  if(gitHash(bytes)!==source.blobSha||observationHash(bytes)!==source.sha256)throw new Error('Observation source mismatch');
  return bytes;
}
export async function readObservationArtifact(github,repo,repositoryId,run,kind) {
  const helper=await import('../practices/night/files/scripts/plates/names-observation.mjs');
  const name=helper.observationArtifactName(run.id,run.run_attempt);
  const artifacts=await namesPages(github,`/repos/${repo}/actions/runs/${run.id}/artifacts`,'artifacts');
  const found=artifacts.filter(a=>a.name===name);
  if(found.length!==1)throw new Error('Observation artifact identity unavailable');
  const a=found[0];
  if(!positive(a.id)||a.expired!==false||!/^sha256:[a-f0-9]{64}$/.test(a.digest??'')||a.workflow_run?.id!==run.id||a.workflow_run?.head_sha!==run.head_sha||!Number.isSafeInteger(a.size_in_bytes)||a.size_in_bytes>8*1024*1024)throw new Error('Observation artifact provenance unavailable');
  const download=await github({method:'GET',path:`/repos/${repo}/actions/artifacts/${a.id}/zip`,binary:true});
  if(download?.status!==200||!Buffer.isBuffer(download.data))throw new Error('Observation archive unavailable');
  // The raw provider artifact has no attempt field. Exact name + decoded source +
  // fresh attempt jobs establish this attribution; do not copy a guessed raw field.
  const artifact={id:a.id,name:a.name,repositoryId,runId:run.id,runAttempt:run.run_attempt,headSha:run.head_sha,digest:a.digest,expired:a.expired};
  const decoded=helper.decodeObservationArchive(download.data,{artifact,expected:{kind,repository:{id:repositoryId,fullName:repo}}});
  const o=decoded.observation;
  if(o.execution.runId!==run.id||o.execution.runAttempt!==run.run_attempt||o.execution.headSha!==run.head_sha||o.execution.workflowPath!==run.path||o.execution.event!==run.event)throw new Error('Observation run mismatch');
  const jobs=await namesPages(github,`/repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,'jobs');
  if(jobs.some(j=>j.run_id!==run.id || j.head_sha!==run.head_sha || j.status!=='completed'))throw new Error('Observation jobs incomplete');
  return {...decoded,artifact,jobs};
}
const sourceRoot=resolve(import.meta.dirname,'..');
export async function supportedObservationSource(path) {
  // The verifier accepts the release it ships, not arbitrary self-asserted producer code.
  if((!['bin/plates.mjs','migrations/0004-test-ledger.mjs'].includes(path)&&!/^(?:scripts\/plates|practices\/[^/]+\/files|lib|\.github\/workflows)\//.test(path))||path.split('/').includes('..'))throw new Error('Unsupported observation source path');
  return readFile(resolve(sourceRoot,path));
}
/** Reproduce the shipped workflow from the pinned project configuration. */
export async function observationWorkflowBytes(path,config) {
  if(!['.github/workflows/plates-night.yml','.github/workflows/plates-morning.yml'].includes(path))throw new Error('Unsupported observation workflow path');
  const {fill}=await import('./practices.mjs');
  const template=await readFile(resolve(sourceRoot,'practices/night/files',path),'utf8');
  return Buffer.from(fill(template,config,path));
}
export async function verifyObservationScope(loaded,github,repo) {
  const {observation:o,jobs}=loaded;
  const configBytes=await observedSource(github,repo,o.scope.configuration);
  const config=JSON.parse(configBytes.toString('utf8'));
  if(config.repo!==repo||o.scope.configuration.path!=='.plates/plates.json'||o.scope.configuration.commitSha!==o.execution.headSha)throw new Error('Observation config binding mismatch');
  const expected=expectedObservationProducers(o.kind,config);
  if(expected.unsupported.length||o.gaps.length)throw new Error('Unsupported or incomplete producer coverage');
  const workflow=await observedSource(github,repo,o.scope.workflow);
  if(o.scope.workflow.path!==o.execution.workflowPath||o.scope.workflow.commitSha!==o.execution.headSha||!workflow.equals(await observationWorkflowBytes(o.scope.workflow.path,config)))throw new Error('Unsupported observation workflow');
  const files=new Map();
  for(const source of o.scope.runtime.sourceFiles){
    if(source.commitSha!==o.execution.codeSha)throw new Error('Runtime source revision mismatch');
    const bytes=await observedSource(github,repo,source);
    if(!bytes.equals(await supportedObservationSource(source.path)))throw new Error('Unsupported executed source');
    files.set(source.path,bytes);
  }
  const closures=[new Map(files)];
  if(o.execution.codeIdentity){
    const installedFiles=new Map();
    const identity=o.execution.codeIdentity;
    if(!['bin/plates.mjs','lib/names-verify.mjs'].includes(identity.entrypoint))throw new Error('Unsupported installed entrypoint');
    const meta=await namesRead(github,`/repos/${identity.repository.fullName}`);
    if(meta.id!==identity.repository.id)throw new Error('Installed runtime repository mismatch');
    for(const source of identity.files){
      const bytes=await observedSource(github,identity.repository.fullName,source);
      if(!bytes.equals(await supportedObservationSource(source.path)))throw new Error('Unsupported installed runtime code');
      files.set(source.path,bytes);installedFiles.set(source.path,bytes);
    }
    closures.push(installedFiles);
    if(!installedFiles.has(identity.entrypoint))throw new Error('Installed runtime entrypoint unavailable');
  }
  // Every eager imported helper must be present. Runtime import hooks record
  // actual dynamic loads; their implementation is pinned by the workflow above.
  for(const closure of closures)for(const [path,bytes] of closure){
    if(!/\.m?js$/.test(path))continue;
    const source=bytes.toString('utf8');
    for(const match of source.matchAll(/^\s*(?:import\s+(?:[\w$*{},\s]+?\s+from\s*)?|export\s+(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s*)?from\s*)['"]([^'"]+)['"]/gm)){
      if(match[1].startsWith('node:'))continue;
      if(!match[1].startsWith('.'))throw new Error('Unsupported runtime import');
      const dep=posix.normalize(posix.join(posix.dirname(path),match[1]));
      if(!closure.has(dep))throw new Error('Runtime helper closure incomplete');
    }
  }
  if(o.scope.producers.length!==expected.required.length||o.producers.length!==expected.required.length)throw new Error('Producer inventory mismatch');
  for(const producer of expected.required){
    const scoped=o.scope.producers.find(p=>p.id===producer.id),actual=o.producers.find(p=>p.id===producer.id);
    if(scoped?.mode!=='enabled'||scoped.step!==producer.step||scoped.source.path!==producer.path||actual?.step!==producer.step||actual.outcome!=='completed')throw new Error('Producer evidence incomplete');
    const job=jobs.find(j=>j.name===producer.step.split('/')[0]);
    const step=job?.steps?.find(s=>s.name===producer.name);
    if(!step||step.status!=='completed'||step.conclusion!=='success')throw new Error('Producer step not successful');
    if(producer.path.startsWith('.github/')){
      if(scoped.source.blobSha!==o.scope.workflow.blobSha)throw new Error('Producer workflow source mismatch');
    }else {
      const executed=files.get(producer.path);
      if(!executed||gitHash(executed)!==scoped.source.blobSha||observationHash(executed)!==scoped.source.sha256)throw new Error('Producer source missing or mismatched in executed closure');
    }
  }
  return config;
}
function namedTokens(fragment) {
  const found=[];
  for(const row of NAMES.filter(r=>['marker','fence','label'].includes(r.surface))){
    for(const value of [row.keel,row.plates])if(fragment.includes(value))found.push({rowId:row.id,value});
  }
  return found;
}
const writeRoles={improve:['health-report','bounds','night-record','working-plan','time-remeasurement'],'plan-publication':['plan-publication'],finalization:['night-record','health-plan-section'],'night-pr':['night-pr'],'final-pr':['final-pr'],brief:['brief-issue','closure-comment']};
const plainRef=ref=>ref?.replace(/^refs\/heads\//,'');
function roleOf(write){
  if(!writeRoles[write.producerId]?.includes(write.role))throw new Error('Unsupported producer output role');
  return write.role;
}
function healthRegion(text){
  const region=markerRegion(text,'marker:keel:health-report:begin','marker:keel:health-report:end');
  if(!region)return null;
  if(!region.body.startsWith('\n')||!region.body.endsWith('\n')||observationHash(region.body.slice(1,-1))!==region.begin.payload)throw new Error('Health report integrity unavailable');
  return {...region,body:region.body.slice(1,-1)};
}
async function generatedHealth(before,after){
  const {mergeHealthPage}=await import('../practices/night/files/scripts/plates/time-proposals.mjs');
  const {parseVerifications,formatVerification}=await import('../practices/night/files/scripts/plates/verification.mjs');
  const current=healthRegion(after),old=healthRegion(before);
  if(!current)throw new Error('Generated health region missing');
  const outside=after.slice(0,current.start)+after.slice(current.end);
  const sections=[...outside.matchAll(/^## Proposal\b[^\n]*\n[\s\S]*?(?=^## |$(?![\s\S]))/gm)];
  if(sections.length>1)throw new Error('Ambiguous proposal region');
  const proposal=sections[0]?.[0]??'';
  // Reconstruct with the real merger: outside prose cannot be silently changed,
  // and a retained proposal cannot be exchanged for a caller-selected substring.
  const candidates=[current.body,current.body+proposal];
  if(!candidates.some(g=>{const r=mergeHealthPage({previous:before,generated:g});return !r.problems.length&&r.text===after;}))throw new Error('Health report reconstruction unavailable');
  let fresh=current.body;
  const prior=parseVerifications(old?.body??'').map(formatVerification);
  for(const line of prior){
    const lines=fresh.split('\n');
    if(lines.filter(v=>v===line).length>1)throw new Error('Ambiguous retained verification');
    fresh=lines.filter(v=>v!==line).join('\n');
  }
  const beforeOutside=old?before.slice(0,old.start)+before.slice(old.end):before;
  const priorProposals=[...beforeOutside.matchAll(/^## Proposal\b[^\n]*\n[\s\S]*?(?=^## |$(?![\s\S]))/gm)];
  const embedded=old?.body.match(/^## Proposal\b[^\n]*\n[\s\S]*?(?=^## |$(?![\s\S]))/m)?.[0];
  const retained=proposal&&(priorProposals.some(m=>m[0]===proposal)||embedded===proposal);
  return current.begin.raw+'\n'+fresh+'\n'+current.close.raw+(retained?'':proposal);
}
async function verifyObservedWrites(loaded,github,repo,config) {
  const {observation:o}=loaded,a=o.association;
  const {healthDirOf}=await import('../practices/night/files/scripts/plates/lib.mjs');
  const {planLocations,planSection}=await import('../practices/night/files/scripts/plates/night-plan.mjs');
  const head=o.kind==='night'?a.headSha:a.finalHeadSha,branch=o.kind==='night'?a.branch:`${a.nightBranch}-final`;
  const record=`docs/night/${a.date}.json`,health=`${healthDirOf(config)}/${a.date}.md`;
  const seen=new Set(),values=new Map();
  const blob=async(path,snapshot,commit)=>{
    if(!sha(commit))throw new Error('Output commit unavailable');
    const r=await namesRead(github,`/repos/${repo}/contents/${path}?ref=${commit}`);
    if(r?.encoding!=='base64'||typeof r.content!=='string')throw new Error('Published blob unavailable');
    const bytes=Buffer.from(r.content,'base64');
    if(gitHash(bytes)!==r.sha||observationHash(bytes)!==snapshot.sha256||snapshot.blobSha&&snapshot.blobSha!==r.sha)throw new Error('Published blob readback changed');
    return bytes.toString('utf8');
  };
  const preimage=async w=>{
    const b=w.before;
    if(!b||!sha(b.commitSha))throw new Error('Immutable preimage unavailable');
    if(b.state==='absent'){
      const r=await github({method:'GET',path:`/repos/${repo}/contents/${w.target.path}?ref=${b.commitSha}`});
      if(r.status!==404)throw new Error('Preimage absence unavailable');
      return '';
    }
    if(!sha(b.blobSha))throw new Error('Preimage blob unavailable');
    return blob(w.target.path,b,b.commitSha);
  };
  for(const w of o.writes){
    const role=roleOf(w),t=w.target;
    if(t.repositoryId!==o.repository.id)throw new Error('Write repository mismatch');
    const key=`${w.producerId}/${role}/${t.kind}/${t.path??t.id}`;
    if(seen.has(key))throw new Error('Duplicate output outcome');seen.add(key);
    if(!['confirmed','no-change'].includes(w.outcome)||w.after?.state!=='present'||w.after.sha256!==w.intended.sha256)throw new Error('Uncertain managed write');
    if(w.outcome==='no-change'&&(w.before?.state!=='present'||w.before.sha256!==w.after.sha256||JSON.stringify([...w.before.labelIds].sort((a,b)=>a-b))!==JSON.stringify([...w.after.labelIds].sort((a,b)=>a-b))))throw new Error('Unproven unchanged publication');
    let text;
    if(['night-pr','final-pr','brief-issue','closure-comment'].includes(role)){
      const expected=role==='night-pr'?{kind:'pr',id:a.prId,number:a.prNumber,head:a.headSha}:role==='final-pr'?{kind:'pr',id:a.finalPrId,number:a.finalPrNumber,head:a.finalHeadSha}:role==='brief-issue'?{kind:'issue',id:a.briefIssueId,number:a.briefIssueNumber}:null;
      if(expected&&(t.kind!==expected.kind||t.id!==expected.id||t.number!==expected.number||expected.head&&t.headSha!==expected.head))throw new Error('Producer object target mismatch');
      if(!positive(t.id)||!positive(t.number)||role==='closure-comment'&&t.kind!=='comment')throw new Error('Write object identity unavailable');
      const path=t.kind==='pr'?`pulls/${t.number}`:t.kind==='issue'?`issues/${t.number}`:`issues/comments/${t.id}`;
      const current=await namesRead(github,`/repos/${repo}/${path}`);
      if(current.id!==t.id||t.kind!=='comment'&&current.number!==t.number||typeof current.body!=='string'||observationHash(current.body)!==w.after.sha256)throw new Error('Managed body readback changed');
      if(t.kind==='pr'&&(current.number!==t.number||current.base?.repo?.id!==o.repository.id||current.head?.sha!==t.headSha||current.head?.ref!==branch))throw new Error('Managed PR target changed');
      if(role==='closure-comment'){
        if(current.issue_url!==`https://api.github.com/repos/${repo}/issues/${t.number}`||current.body!==`Superseded by #${a.briefIssueNumber} (plates morning).`)throw new Error('Closure comment target mismatch');
        const parent=await namesRead(github,`/repos/${repo}/issues/${t.number}`);
        if(parent.number!==t.number||parent.state!=='closed')throw new Error('Closure parent unavailable');
      }else{
        if(JSON.stringify((current.labels??[]).map(l=>l.id).sort((a,b)=>a-b))!==JSON.stringify([...w.after.labelIds].sort((a,b)=>a-b)))throw new Error('Managed label readback changed');
        if(w.outcome!=='no-change'&&(current.labels??[]).some(l=>NAMES.some(r=>r.surface==='label'&&r.keel===l.name)))return {state:'fail',reason:'Fresh managed publication uses a legacy label'};
      }
      text=current.body;
    }else{
      if(t.kind!=='git')throw new Error('Producer requires a Git output');
      if(role==='plan-publication'){
        if(!planLocations().some(l=>l.branch===plainRef(t.ref)&&l.path===t.path)||!sha(w.after.commitSha)||!sha(w.after.blobSha))throw new Error('Plan publication target mismatch');
        const ref=await namesRead(github,`/repos/${repo}/git/ref/heads/${encodeURIComponent(plainRef(t.ref))}`);
        if(ref.ref!==`refs/heads/${plainRef(t.ref)}`||ref.object?.sha!==w.after.commitSha)throw new Error('Plan publication ref changed');
      }else{
        if(plainRef(t.ref)!==branch||w.outcome!=='no-change'&&w.after.commitSha&&w.after.commitSha!==head)throw new Error('Local publication head mismatch');
        const path=role==='bounds'?'.plates/bounds.json':role==='night-record'?record:role==='working-plan'?'.plates/night/plan.json':['health-report','health-plan-section'].includes(role)?health:null;
        if(path?t.path!==path:!(role==='time-remeasurement'&&t.path.startsWith(healthDirOf(config)+'/')&&/^\d{4}-\d\d-\d\d\.md$/.test(t.path.slice(healthDirOf(config).length+1))))throw new Error('Producer output path mismatch');
      }
      if(role==='working-plan')continue;
      text=await blob(t.path,w.after,role==='plan-publication'?w.after.commitSha:head);
    }
    values.set(w,{text,role});
  }
  const required=o.kind==='night'?[['improve','health-report'],['improve','bounds'],['improve','night-record'],['improve','working-plan'],['plan-publication','plan-publication'],['night-pr','night-pr']]:[['finalization','night-record'],['final-pr','final-pr'],['brief','brief-issue']];
  for(const [producer,role] of required)if(o.writes.filter(w=>w.producerId===producer&&w.role===role).length!==1)throw new Error('Required producer output missing or conflicting');
  for(const w of o.writes.filter(w=>w.role==='working-plan')){
    const published=o.writes.find(r=>r.producerId===w.producerId&&r.role==='night-record');
    if(!published||w.after.sha256!==published.after.sha256)throw new Error('Working plan lacks exact published record');
  }
  for(const [w,{text,role}] of values){
    if(w.outcome==='no-change'){
      // Immutable Git history must be retrieved, not asserted by equal hashes.
      // Mutable PR/issue snapshots retain their separate readback limitation.
      if(w.target.kind==='git'&&await preimage(w)!==text)throw new Error('Retained Git preimage changed');
      if(['night-record','plan-publication'].includes(role)&&projectionJSON(text).date!==a.date)throw new Error('Retained plan date mismatch');
      continue;
    }
    let generated=text;
    if(['night-record','plan-publication'].includes(role)){
      const plan=projectionJSON(text);
      if(plan.date!==a.date||!Array.isArray(plan.items))throw new Error('Published plan date unavailable');
      if(role==='night-record')generated=JSON.stringify({date:plan.date,items:plan.items.map(({id,kind,status})=>({id,kind,status}))});
    }else if(role==='health-report')generated=await generatedHealth(await preimage(w),text);
    else if(role==='time-remeasurement'){
      const before=await preimage(w),begin='marker:keel:time-proposal:begin',end='marker:keel:time-proposal:end';
      const old=markerRegion(before,begin,end),now=markerRegion(text,begin,end);
      const {parseTimeProposal}=await import('../practices/night/files/scripts/plates/time-proposals.mjs');
      if(!old||!now||parseTimeProposal(text).problems.length||before.slice(0,old.start)+text.slice(now.start,now.end)+before.slice(old.end)!==text)throw new Error('Time proposal reconstruction unavailable');
      generated=text.slice(now.start,now.end);
    }else if(role==='health-plan-section'){
      const before=await preimage(w),recordWrite=o.writes.find(r=>r.producerId==='finalization'&&r.role==='night-record');
      const plan=projectionJSON(values.get(recordWrite).text),section=planSection(plan,{record});
      const {withPlanSection}=await import('../practices/night/files/scripts/plates/morning.mjs');
      const {rewriteHealthBody}=await import('../practices/night/files/scripts/plates/time-proposals.mjs');
      if(rewriteHealthBody(before,body=>withPlanSection(body,section))!==text)throw new Error('Final health section reconstruction unavailable');
      generated=section.join('\n');
    }
    if(namedTokens(generated).some(t=>nameRow(t.rowId).keel===t.value))return {state:'fail',reason:'Fresh generated managed region uses a legacy name'};
  }
  return {state:'pass',reason:'Required producer targets and independently extracted generated regions verified'};
}

// Called only by opt-in workflow steps. Transport is GET-only; the observer never
// delivers, retries, merges, dispatches, or repairs a production operation.
export async function captureNamesPublication({root,repo,repositoryId,kind,phase,branch,date,bodyFile,priorFile,outputFile,prNumber,preimageHeadSha=null},github) {
  const {writeFile}=await import('node:fs/promises');
  const producerId=kind==='night'?'night-pr':'final-pr';
  const text=await readFile(bodyFile,'utf8');
  if(Buffer.byteLength(text)>256*1024)throw new Error('Generated PR body exceeds observation bound');
  const tokens=namedTokens(text);
  // Actual generator token extraction, not a caller-supplied privacy classifier.
  const fragmentText=[...new Set(tokens.map(t=>t.value))].join('\n');
  const fragment=`fragments/${producerId}.txt`;
  const absent={state:'absent',commitSha:null,blobSha:null,sha256:null,labelIds:[],providerUpdatedAt:null};
  const snap=p=>({state:'present',commitSha:null,blobSha:null,sha256:observationHash(p.body),labelIds:(p.labels??[]).map(l=>l.id),providerUpdatedAt:p.updated_at??null});
  const readPR=async number=>{
    const p=await namesRead(github,`/repos/${repo}/pulls/${number}`);
    if(p.number!==number||!positive(p.id)||p.base?.repo?.id!==repositoryId||p.head?.ref!==branch||typeof p.body!=='string'||!sha(p.head?.sha))throw new Error('Publication readback identity unavailable');
    return p;
  };
  if(phase==='before'){
    const p=prNumber?await readPR(Number(prNumber)):null;
    const record={producerId,branch,date,preimageHeadSha,preexisting:Boolean(p),before:p?snap(p):absent,intended:{fragment,sha256:observationHash(text),names:tokens},fragments:[{path:fragment,kind:'managed-fragment',text:fragmentText}],prId:p?.id??null,prNumber:p?.number??null};
    await writeFile(priorFile,JSON.stringify(record),{flag:'wx',mode:0o600});return;
  }
  if(phase!=='after')throw new Error('Unknown publication observation phase');
  const record=JSON.parse(await readFile(priorFile,'utf8'));
  if(record.producerId!==producerId||record.branch!==branch||record.intended.sha256!==observationHash(text))throw new Error('Publication intent changed');
  let p=null;try{if(prNumber)p=await readPR(Number(prNumber));}catch{/* Uncertain readback remains uncertainty. */}
  const after=p?snap(p):null;
  const confirmed=after?.sha256===record.intended.sha256;
  const output={producerId,writes:[{producerId,role:producerId,sequence:1,operationId:null,target:{kind:'pr',repositoryId,id:p?.id??record.prId,number:p?.number??record.prNumber,headSha:p?.head?.sha??null},outcome:confirmed?(record.before.sha256===record.intended.sha256?'no-change':'confirmed'):'attempted-unknown',before:record.before,intended:record.intended,after:confirmed?after:null,observedAt:new Date().toISOString()}],reads:[],fragments:record.fragments,gaps:confirmed?[]:[{code:'publication-readback-unavailable',producerId,source:null}],association:{date,branch,preexisting:record.preexisting,preimageHeadSha,prId:p?.id??record.prId,prNumber:p?.number??record.prNumber,headSha:p?.head?.sha??null}};
  await writeFile(outputFile,JSON.stringify(output),{flag:'wx',mode:0o600});
}

export async function collectNamesRun({root,kind,directory,inputs,originatingNight=null,installedRuntime=null,env=process.env},github) {
  const {writeFile,mkdir,lstat,realpath}=await import('node:fs/promises');
  const {execFileSync}=await import('node:child_process');
  const helper=await import('../practices/night/files/scripts/plates/names-observation.mjs');
  const repo=env.GITHUB_REPOSITORY,repositoryId=Number(env.GITHUB_REPOSITORY_ID);
  const runId=Number(env.GITHUB_RUN_ID),runAttempt=Number(env.GITHUB_RUN_ATTEMPT),headSha=env.GITHUB_SHA;
  if(!validRepo(repo)||![repositoryId,runId,runAttempt].every(positive)||!sha(headSha)||env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw new Error('Invalid observation execution');
  const workflowPath=`.github/workflows/plates-${kind}.yml`;
  const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:2*1024*1024,timeout:15000}).trim();
  const gitBytes=(commit,path)=>execFileSync('git',['-C',root,'show',`${commit}:${path}`],{encoding:null,maxBuffer:2*1024*1024,timeout:15000});
  const source=(path,commit=headSha)=>{const bytes=gitBytes(commit,path);return {repositoryId,commitSha:commit,path,blobSha:gitHash(bytes),sha256:observationHash(bytes)};};
  const config=JSON.parse(gitBytes(headSha,'.plates/plates.json'));
  const expected=expectedObservationProducers(kind,config),fragments=new Map(),writes=[],reads=[],projections=[],producers=[],gaps=expected.unsupported.map(code=>({code,producerId:null,source:null}));
  const loadedFiles=new Map(),installedFiles=new Map(),observations=new Map();
  let installedIdentity=null;
  const installed=async()=>{
    if(installedIdentity)return installedIdentity;
    if(!installedRuntime||!validRepo(installedRuntime.repo)||typeof installedRuntime.root!=='string'||!['bin/plates.mjs','lib/names-verify.mjs'].includes(installedRuntime.entrypoint))throw new Error('Installed runtime identity unavailable');
    const runtimeRoot=await realpath(installedRuntime.root);
    const top=execFileSync('git',['-C',runtimeRoot,'rev-parse','--show-toplevel'],{encoding:'utf8',timeout:15000}).trim();
    if(await realpath(top)!==runtimeRoot)throw new Error('Installed runtime is not a source checkout');
    const commitSha=execFileSync('git',['-C',runtimeRoot,'rev-parse','HEAD'],{encoding:'utf8',timeout:15000}).trim();
    if(!sha(commitSha))throw new Error('Installed runtime commit unavailable');
    const meta=await namesRead(github,`/repos/${installedRuntime.repo}`);
    if(!positive(meta.id)||meta.full_name!==installedRuntime.repo)throw new Error('Installed runtime repository unavailable');
    installedIdentity={repository:{id:meta.id,fullName:meta.full_name},commitSha,entrypoint:installedRuntime.entrypoint,files:[]};
    return installedIdentity;
  };
  const addLoads=async(loads,loadGaps=[])=>{
    if(!Array.isArray(loads)||loads.length>128||!Array.isArray(loadGaps))throw new Error('Runtime manifest unavailable');
    if(loadGaps.length)gaps.push({code:'runtime-load-coverage-unavailable',producerId:null,source:null});
    for(const row of loads){
      try{
        if(typeof row.path!=='string'||row.path.startsWith('/')||row.path.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(row.sha256))throw new Error();
        if(row.kind==='checkout'){
          const fact=source(row.path);if(fact.sha256!==row.sha256)throw new Error();loadedFiles.set(fact.path,fact);
        }else if(row.kind==='runtime'){
          const identity=await installed();
          const bytes=execFileSync('git',['-C',installedRuntime.root,'show',`${identity.commitSha}:${row.path}`],{encoding:null,maxBuffer:2*1024*1024,timeout:15000});
          const local=await readFile(resolve(installedRuntime.root,row.path));
          if(observationHash(bytes)!==row.sha256||!local.equals(bytes))throw new Error();
          const fact={repositoryId:identity.repository.id,commitSha:identity.commitSha,path:row.path,blobSha:gitHash(bytes),sha256:row.sha256};
          await observedSource(github,identity.repository.fullName,fact);
          installedFiles.set(fact.path,fact);
        }else throw new Error();
      }catch{gaps.push({code:row.kind==='runtime'?'installed-runtime-source-unavailable':'executed-source-mismatch',producerId:null,source:null});}
    }
  };
  for(const input of inputs){
    const p=expected.required.find(p=>p.id===input.producerId);if(!p)throw new Error('Unexpected producer input');
    try{
      let result=input.value;
      if(input.path){const info=await lstat(input.path);if(!info.isFile()||info.isSymbolicLink()||info.size>1024*1024)throw new Error();result=JSON.parse(await readFile(input.path,'utf8'));}
      const o=producerTransferValue(p.id,result);
      if(o?.producerId!==p.id)throw new Error();
      observations.set(p.id,o);
      for(const f of o.fragments??[]){if(!/^fragments\/[a-zA-Z0-9_.-]+\.txt$/.test(f.path)||fragments.has(f.path)||typeof f.text!=='string'||Buffer.byteLength(f.text)>256*1024)throw new Error();fragments.set(f.path,Buffer.from(f.text));}
      writes.push(...o.writes);reads.push(...o.reads);projections.push(...(o.projections??[]));gaps.push(...o.gaps);
      if(input.imports){const stat=await lstat(input.imports);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw new Error();const manifest=JSON.parse(await readFile(input.imports,'utf8'));await addLoads(manifest.files,manifest.gaps??[]);}
      if(input.loads)await addLoads(input.loads,input.loadGaps??[]);
      producers.push({id:p.id,job:p.step.split('/')[0],step:p.step,outcome:o.gaps.length?'unavailable':'completed',observedAt:new Date().toISOString(),reason:o.gaps.length?'producer-gaps':null});
    }catch{gaps.push({code:'producer-output-unavailable',producerId:p.id,source:null});producers.push({id:p.id,job:p.step.split('/')[0],step:p.step,outcome:'unavailable',observedAt:new Date().toISOString(),reason:'producer-output-unavailable'});}
  }
  for(const p of expected.required)if(!producers.some(x=>x.id===p.id))gaps.push({code:'producer-output-missing',producerId:p.id,source:null});
  const ownLoads=globalThis[Symbol.for('plates.names.loads')];
  if(ownLoads)await addLoads(ownLoads.files(),ownLoads.gaps);
  if(installedIdentity){installedIdentity.files=[...installedFiles.values()];if(!installedFiles.has(installedIdentity.entrypoint)){gaps.push({code:'installed-entrypoint-unavailable',producerId:null,source:null});installedIdentity=null;}}
  // The validator itself is part of the executed closure, never just the entrypoint.
  if(!loadedFiles.size)gaps.push({code:'runtime-load-manifest-missing',producerId:null,source:null});
  const fallbackSource=source('scripts/plates/names-observation.mjs');
  if(!loadedFiles.size)loadedFiles.set(fallbackSource.path,fallbackSource);
  let association=null;
  const publication=observations.get(kind==='night'?'night-pr':'final-pr')?.association;
  if(publication){
    if(kind==='night'){
      const planPath=`docs/night/${publication.date}.json`;let planBlobSha=null;try{planBlobSha=source(planPath,publication.headSha).blobSha;}catch{gaps.push({code:'published-plan-unavailable',producerId:'night-pr',source:null});}
      association={kind,date:publication.date,branch:publication.branch,leaseId:null,preexisting:publication.preexisting,preimageHeadSha:publication.preimageHeadSha,prId:publication.prId,prNumber:publication.prNumber,headSha:publication.headSha,planPath,planBlobSha};
    }else{
      const brief=observations.get('brief')?.writes?.find(w=>w.target.kind==='issue');
      association={kind,date:publication.date,nightBranch:publication.branch.replace(/-final$/,''),finalPrId:publication.prId,finalPrNumber:publication.prNumber,finalHeadSha:publication.headSha,briefIssueId:brief?.target.id??null,briefIssueNumber:brief?.target.number??null};
    }
  }
  const run=await namesRead(github,`/repos/${repo}/actions/runs/${runId}/attempts/${runAttempt}`);
  if(run.id!==runId||run.head_sha!==headSha||run.repository?.id!==repositoryId||run.run_attempt!==runAttempt)throw new Error('Provider execution mismatch');
  const artifacts=[];
  for(const a of await namesPages(github,`/repos/${repo}/actions/runs/${runId}/artifacts`,'artifacts')){
    if(a.name===helper.observationArtifactName(runId,runAttempt))throw new Error('Observation attempt already retained');
    if(runAttempt!==1&&!a.name.endsWith(`-${runAttempt}`)){gaps.push({code:'artifact-attempt-unavailable',producerId:null,source:null});continue;}
    if(a.workflow_run?.id!==runId||a.workflow_run?.head_sha!==headSha||!/^sha256:[a-f0-9]{64}$/.test(a.digest??'')){gaps.push({code:'artifact-provenance-unavailable',producerId:null,source:null});continue;}
    artifacts.push({id:a.id,name:a.name,runId,runAttempt,headSha,digest:a.digest,expired:a.expired,step:kind==='night'?'night/artifacts':'names-observation/artifacts'});
  }
  const meta=[];
  for(const [path,bytes] of fragments){const projected=reads.some(r=>r.outputProjection.fragment===path)||projections.some(p=>p.fragment===path);meta.push({path,bytes:bytes.length,sha256:observationHash(bytes),kind:projected?'projection':'managed-fragment'});}
  const observation={schema:1,kind,repository:{id:repositoryId,fullName:repo},execution:{workflowPath,runId,runAttempt,event:'workflow_dispatch',headSha,codeSha:headSha,startedAt:run.run_started_at??run.created_at,finishedAt:null,codeIdentity:installedIdentity},scope:{workflow:source(workflowPath),configuration:source('.plates/plates.json'),runtime:{codeSha:headSha,sourceFiles:[...loadedFiles.values()]},producers:expected.required.map(p=>{let s=loadedFiles.get(p.path)??installedFiles.get(p.path);if(!s){try{s=source(p.path);}catch{s=source(workflowPath);gaps.push({code:'producer-source-unavailable',producerId:p.id,source:null});}}return {id:p.id,job:p.step.split('/')[0],step:p.step,source:s,mode:'enabled',reason:null};})},originatingNight,association,producers,writes,reads,projections,artifacts,fragments:meta,gaps};
  const files=helper.observationFiles(observation,fragments);
  await mkdir(directory,{recursive:false,mode:0o700});
  for(const [path,bytes] of files){const dest=resolve(directory,path);if(!dest.startsWith(resolve(directory)+'/'))throw new Error('Unsafe observation output');await mkdir(dirname(dest),{recursive:true,mode:0o700});await writeFile(dest,bytes,{flag:'wx',mode:0o600});}
  return {name:helper.observationArtifactName(runId,runAttempt),files:[...files.keys()],gaps:observation.gaps};
}

// The workflow writes these exact source-owned bytes to its private runner temp.
// Only explicit producer node invocations preload it; gates/children do not inherit
// a NODE_OPTIONS change. It observes loaded bytes without replacing any module.
export const NAMES_OBSERVATION_LOADER = String.raw`
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {writeFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {relative,isAbsolute} from 'node:path';
const root=realpathSync(process.env.GITHUB_WORKSPACE), runtime=realpathSync(process.env.PLATES_NAMES_RUNTIME_ROOT || root), records=new Map(), gaps=[];
const self=fileURLToPath(import.meta.url);
const inside=(base,path)=>{const rel=relative(base,path);return rel&&!isAbsolute(rel)&&!rel.startsWith('../')?rel.replaceAll('\\','/'):null;};
const files=()=>[...records.values()];
globalThis[Symbol.for('plates.names.loads')]={files,gaps};
registerHooks({load(url,context,next){const out=next(url,context);if(url.startsWith('file:')){const path=fileURLToPath(url);if(path!==self){const local=inside(root,path),external=inside(runtime,path),kind=local?'checkout':external?'runtime':null,rel=local||external;if(!kind||!rel||out.source===undefined||out.source===null||records.size>=128)gaps.push('untracked-runtime-source');else{const bytes=Buffer.from(out.source),sha256=createHash('sha256').update(bytes).digest('hex');records.set(kind+':'+rel,{kind,path:rel,sha256});}}}return out;}});
process.once('exit',()=>{if(process.env.PLATES_NAMES_IMPORTS_FILE)try{writeFileSync(process.env.PLATES_NAMES_IMPORTS_FILE,JSON.stringify({files:files(),gaps}),{flag:'wx',mode:0o600});}catch{process.exitCode=1;}});
`;

async function verifyObservedReads(loaded,github,repo,config) {
  const {observation:o,fragments}=loaded;
  const {furthestItems,verifyResults,verifyFailuresFor,productionOf,isProduction}=await import('../practices/night/files/scripts/plates/morning.mjs');
  const minimal=({sha,ok,at})=>({sha,ok,at});
  for(const consumer of ['morning-brief','board'])for(const sourceKind of ['plan','verify']){
    const rows=o.reads.filter(r=>r.consumer===consumer&&r.sourceKind===sourceKind);
    const aliases=readNames(sourceKind==='plan'?'git ref:keel-night-plan':'git ref:keel-verify');
    if(aliases.some(alias=>!rows.some(r=>r.ref===alias||r.ref===`refs/heads/${alias}`)))throw new Error('History alias read coverage incomplete');
    const actual=[];
    for(const row of rows){
      if(!['read','absent'].includes(row.state))throw new Error('Required history read unavailable');
      if(row.state==='absent'){
        const path=row.absence==='ref'?`/repos/${repo}/git/ref/heads/${encodeURIComponent(row.ref.replace(/^refs\/heads\//,''))}`:`/repos/${repo}/contents/${row.path}?ref=${row.commitSha}`;
        const response=await github({method:'GET',path});if(response.status!==404)throw new Error('Historical absence cannot be confirmed');continue;
      }
      const bytes=await observedSource(github,repo,row);
      if(sourceKind==='plan')actual.push({row,value:JSON.parse(bytes)});
      else actual.push({row,value:verifyResults(bytes.toString('utf8'))});
    }
    let projection;
    if(sourceKind==='plan'){
      const selected=actual.filter(a=>a.row.selected);
      if(selected.length!==1)throw new Error('Plan base identity unavailable');
      const base=selected[0].value;
      if(!Array.isArray(base.items)||base.date!==o.association?.date)throw new Error('Plan date mismatch');
      const merged=furthestItems(base.items,actual.filter(a=>a.row.selected||a.row.contributed).map(a=>a.value));
      projection={date:base.date,items:merged.map(({id,kind,status})=>({id,kind,status}))};
    }else{
      const results=actual.flatMap(a=>a.value).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
      projection=consumer==='morning-brief'?verifyFailuresFor(results,o.association.date,{production:productionOf(config)}).map(minimal):results.filter(r=>isProduction(r,productionOf(config))).slice(0,1).map(minimal);
    }
    const digests=new Set(rows.map(r=>r.outputProjection.sha256));
    if(digests.size!==1)throw new Error('Reader projection identity conflict');
    for(const row of rows){const bytes=fragments.get(row.outputProjection.fragment);if(!bytes||JSON.stringify(projectionJSON(Buffer.from(bytes).toString('utf8')))!==JSON.stringify(projection))throw new Error('History projection does not match consumed sources');}
  }
  return {state:'pass',reason:'Actual morning and board projections recompute from both-alias pinned history reads'};
}
async function verifyObservedDrain(loaded,github,repo) {
  const projections=loaded.observation.projections.filter(p=>p.producerId==='drain'&&p.kind==='drain-queue');
  if(projections.length!==1)throw new Error('Actual drain projection unavailable');
  const projection=projectionJSON(Buffer.from(loaded.fragments.get(projections[0].fragment)).toString('utf8'));
  if(!projection||Object.keys(projection).sort().join(',')!=='actions,after,before'||!['before','after','actions'].every(k=>Array.isArray(projection[k])&&projection[k].length<=2000))throw new Error('Drain projection incomplete');
  for(const rows of [projection.before,projection.after]){
    if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Duplicate queue identity');
    for(const row of rows)if(!positive(row.id)||!positive(row.number)||typeof row.head!=='string'||!sha(row.headSha)||row.state!=='open'||![true,false,null].includes(row.mergeable))throw new Error('Invalid queue identity');
  }
  const current=await namesPages(github,`/repos/${repo}/pulls?state=open`);
  if(current.length!==projection.after.length||current.some(p=>!projection.after.some(r=>r.id===p.id&&r.number===p.number&&r.head===p.head?.ref&&r.headSha===p.head?.sha&&p.state==='open'&&p.base?.repo?.id===loaded.observation.repository.id)))throw new Error('Queue changed since observed drain');
  for(const action of projection.actions){
    if(!positive(action.number)||typeof action.head!=='string'||!['merge','close','leave'].includes(action.action)||typeof action.done!=='boolean'||!projection.before.some(r=>r.number===action.number&&r.head===action.head))throw new Error('Drain action identity unavailable');
    if(action.done){
      if(action.action==='leave'||projection.after.some(r=>r.number===action.number))throw new Error('Contradictory drain outcome');
      const pr=await namesRead(github,`/repos/${repo}/pulls/${action.number}`),before=projection.before.find(r=>r.number===action.number);
      if(pr.id!==before.id||pr.head?.sha!==before.headSha||pr.head?.ref!==action.head||pr.base?.repo?.id!==loaded.observation.repository.id||pr.state!=='closed'||action.action==='merge'&&pr.merged!==true)throw new Error('Drain outcome readback unavailable');
    }
  }
  return {state:'pass',reason:'Actual drain actions and complete retained queue crosschecked'};
}
async function observationChecks({night,repo,repositoryId,morningRun},github) {
  const checks=[];
  let n,nightConfig;
  try{n=await readObservationArtifact(github,repo,repositoryId,night,'night');nightConfig=await verifyObservationScope(n,github,repo);if(!n.observation.execution.codeIdentity)throw new Error('Provisioned observer identity unavailable');}
  catch{return {checks,gap:'Night observation source/producer coverage unavailable'};}
  try{const drain=await verifyObservedDrain(n,github,repo);checks.push(result('drain',drain.state,drain.reason));}catch{checks.push(result('drain','unknown','Actual drain action or queue provenance unavailable'));}
  const a=n.observation.association;
  try{
    if(a?.kind!=='night'||!positive(a.prId)||!positive(a.prNumber)||!sha(a.headSha))throw new Error();
    const pr=await namesRead(github,`/repos/${repo}/pulls/${a.prNumber}`);
    if(pr.id!==a.prId||pr.base?.repo?.id!==repositoryId||pr.head?.ref!==a.branch||pr.head?.sha!==a.headSha)throw new Error();
    const current=new RegExp('^plates-night/'+a.date+'$').test(a.branch);
    const continued=a.branch===`keel-night/${a.date}`&&a.preexisting&&sha(a.preimageHeadSha)&&Date.parse(pr.created_at)<Date.parse(night.run_started_at??night.created_at);
    checks.push(result('night-branch',current||continued?'pass':'fail',continued?'Retained original legacy night identity verified':current?'Actual dispatched writer PR identity verified':'Fresh night uses unsupported legacy branch',[{repo,pr:a.prNumber,runId:night.id,attempt:night.run_attempt,branch:a.branch}]));
  }catch{checks.push(result('night-branch','unknown','Actual night publication association cannot be crosschecked'));}
  let m,morning,morningConfig;
  try{
    const runs=morningRun!==undefined?[await namesRead(github,`/repos/${repo}/actions/runs/${morningRun}`)]:await namesPages(github,`/repos/${repo}/actions/workflows/plates-morning.yml/runs?event=workflow_dispatch`,'workflow_runs');
    const matches=[];
    runs.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
    if(runs.length>20)throw new Error('Morning association discovery capped');
    for(const candidate of runs){
      if(candidate.repository?.id!==repositoryId||candidate.event!=='workflow_dispatch'||candidate.path!=='.github/workflows/plates-morning.yml'||!positive(candidate.run_attempt)||!sha(candidate.head_sha))continue;
      const attempt=await namesRead(github,`/repos/${repo}/actions/runs/${candidate.id}/attempts/${candidate.run_attempt}`);
      if(attempt.id!==candidate.id||attempt.run_attempt!==candidate.run_attempt||attempt.head_sha!==candidate.head_sha||attempt.repository?.id!==repositoryId)throw new Error();
      const inventory=await namesPages(github,`/repos/${repo}/actions/runs/${candidate.id}/artifacts`,'artifacts');
      if(!inventory.some(a=>a.name===`plates-names-observation-${candidate.id}-${candidate.run_attempt}`))continue;
      const loaded=await readObservationArtifact(github,repo,repositoryId,candidate,'morning');
      const origin=loaded.observation.originatingNight;
      if(origin?.repositoryId===repositoryId&&origin.runId===night.id&&origin.runAttempt===night.run_attempt&&origin.headSha===night.head_sha&&origin.artifactId===n.artifact.id&&origin.artifactDigest===n.artifact.digest){matches.push({loaded,attempt});}
    }
    if(matches.length!==1)throw new Error('Morning observation association absent or ambiguous');
    ({loaded:m,attempt:morning}=matches[0]);
    const config=await verifyObservationScope(m,github,repo),association=m.observation.association;morningConfig=config;
    const observer=n.observation.execution.codeIdentity,following=m.observation.execution.codeIdentity;
    if(!following||following.repository.id!==observer.repository.id||following.repository.fullName!==observer.repository.fullName||following.commitSha!==observer.commitSha)throw new Error('Morning observer source mismatch');
    if(association?.kind!=='morning'||association.nightBranch!==a.branch||association.date!==a.date||!positive(association.finalPrId)||!positive(association.briefIssueId))throw new Error();
    const final=await namesRead(github,`/repos/${repo}/pulls/${association.finalPrNumber}`);
    const issue=await namesRead(github,`/repos/${repo}/issues/${association.briefIssueNumber}`);
    if(final.id!==association.finalPrId||final.base?.repo?.id!==repositoryId||final.head?.sha!==association.finalHeadSha||issue.id!==association.briefIssueId)throw new Error();
    checks.push(result('morning-final',morning.status==='completed'&&morning.conclusion==='success'&&final.head.ref===`${a.branch}-final`?'pass':'fail','Exact originating night artifact, morning attempt, final PR and brief issue crosschecked',[{repo,runId:morning.id,attempt:morning.run_attempt,finalPr:final.number,briefIssue:issue.number}]));
    try{const r=await verifyObservedReads(m,github,repo,config);checks.push(result('board-history',r.state,r.reason));}catch{checks.push(result('board-history','unknown','Reader projections or pinned history sources cannot be crosschecked'));}
  }catch{checks.push(result('morning-final','unknown','Exact morning association or producer coverage unavailable'));}
  try{
    if(!m)throw new Error();
    const writes=await Promise.allSettled([verifyObservedWrites(n,github,repo,nightConfig),verifyObservedWrites(m,github,repo,morningConfig)]);
    const failed=writes.find(r=>r.status==='fulfilled'&&r.value.state==='fail');
    if(failed)checks.push(result('fresh-markers-fences-labels','fail',failed.value.reason));
    else if(writes.some(r=>r.status==='rejected'))throw new Error('Managed write readback unavailable');
    else checks.push(result('fresh-markers-fences-labels','pass','Actual managed generated writes and current object/blob readbacks verified'));
  }catch{checks.push(result('fresh-markers-fences-labels','unknown','Managed write coverage unavailable'));}
  try{
    if(!m)throw new Error();
    const all=[n,m];
    for(const loaded of all){
      const artifacts=await namesPages(github,`/repos/${repo}/actions/runs/${loaded.observation.execution.runId}/artifacts`,'artifacts');
      for(const observed of loaded.observation.artifacts){const current=artifacts.find(a=>a.id===observed.id);if(!current||current.name!==observed.name||current.digest!==observed.digest||current.expired||current.workflow_run?.head_sha!==observed.headSha)throw new Error();}
      if(artifacts.some(a=>a.id!==loaded.artifact.id&&!loaded.observation.artifacts.some(r=>r.id===a.id)))throw new Error();
    }
    const legacy=all.flatMap(l=>l.observation.artifacts).some(a=>NAMES.filter(r=>r.surface==='artifact').some(r=>a.name===r.keel||a.name.startsWith(r.keel+'-')));
    checks.push(result('artifacts',legacy?'fail':'pass',legacy?'Observed attempt wrote legacy artifacts':'Attempt-specific retained artifact inventory crosschecked for night and morning'));
  }catch{checks.push(result('artifacts','unknown','Attempt-artifact coverage unavailable'));}
  return {checks,nightObservation:n,morningObservation:m,scope:{managedOnly:true,setupPresent:nightConfig.setup!==undefined,excluded:['project-owned setup/gate effects','unmanaged-file migration','full-fleet acceptance']}};
}

// Bounded cross-job transport of producer evidence only. Raw report fields and
// command errors never enter a GitHub job output or the final archive.
const producerFields={
  write:'producerId role sequence operationId target outcome before intended after observedAt',
  target:'kind repositoryId ref path id number headSha',
  snapshot:'state commitSha blobSha sha256 labelIds providerUpdatedAt',
  intended:'fragment sha256 names',
  read:'consumer sourceKind repositoryId ref path commitSha blobSha sha256 state absence selected contributed outputSection outputProjection recordIds',
  source:'repositoryId commitSha path blobSha sha256',
  association:'date branch preexisting preimageHeadSha prId prNumber headSha',
};
function transferKeys(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.split(' ').includes(k)))throw new Error('Unsupported producer evidence');
  return value;
}
// Validate before any value reaches a cross-job output, including values under
// otherwise allowed keys. Final artifact validation is a separate later boundary.
function transferScalar(type,value,nullable=false){
  if(nullable&&value===null)return;
  const patterns={sha:/^[a-f0-9]{40}$/,digest:/^[a-f0-9]{64}$/,token:/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/,path:/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/,date:/^\d{4}-\d\d-\d\d$/,time:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/};
  if(type==='id'){if(!positive(value))throw new Error('Invalid evidence ID');return;}
  if(type==='bool'){if(typeof value!=='boolean')throw new Error('Invalid evidence boolean');return;}
  if(typeof value!=='string'||value.length>512||!patterns[type]?.test(value))throw new Error('Invalid evidence scalar');
  if(type==='path'&&(value.split('/').some(p=>p==='.'||p==='..')||value.includes('..')))throw new Error('Invalid evidence path');
  if(['date','time'].includes(type)&&(!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value.slice(0,10)))throw new Error('Invalid evidence date');
}
function transferOne(value,allowed){if(!allowed.includes(value))throw new Error('Invalid evidence category');}
function transferList(value,type,max){if(!Array.isArray(value)||value.length>max)throw new Error('Invalid evidence list');for(const item of value)transferScalar(type,item);}
function transferSource(value){
  transferKeys(value,producerFields.source);transferScalar('id',value.repositoryId);transferScalar('path',value.path);
  for(const key of ['commitSha','blobSha'])transferScalar('sha',value[key]);transferScalar('digest',value.sha256);
}
function transferSnapshot(value){
  transferOne(value.state,['present','absent']);for(const key of ['commitSha','blobSha'])transferScalar('sha',value[key],true);
  transferScalar('digest',value.sha256,true);transferScalar('time',value.providerUpdatedAt,true);transferList(value.labelIds,'id',100);
}
function transferScalars(o){
  for(const w of o.writes){
    roleOf(w);if(w.producerId!==o.producerId)throw new Error('Producer mismatch');transferScalar('id',w.sequence);transferScalar('token',w.operationId,true);transferScalar('time',w.observedAt);
    transferOne(w.outcome,['not-attempted','attempted-unknown','confirmed','no-change']);
    const t=w.target;transferScalar('id',t.repositoryId);transferOne(t.kind,['git','pr','issue','comment']);
    if(t.kind==='git'){transferKeys(t,'kind repositoryId ref path');transferScalar('path',t.ref);transferScalar('path',t.path);}
    else{transferKeys(t,'kind repositoryId id number headSha');transferScalar('id',t.id,true);transferScalar('id',t.number,true);transferScalar('sha',t.headSha,true);}
    for(const snapshot of [w.before,w.after])if(snapshot!==null)transferSnapshot(snapshot);
    transferScalar('path',w.intended.fragment);transferScalar('digest',w.intended.sha256);if(w.intended.names.length>512)throw new Error('Too many names');
  }
  for(const r of o.reads){
    transferOne(r.consumer,['morning-brief','morning-final','board']);transferOne(r.sourceKind,['plan','verify']);transferScalar('id',r.repositoryId);
    transferScalar('path',r.ref);transferScalar('path',r.path);for(const key of ['commitSha','blobSha'])transferScalar('sha',r[key],true);transferScalar('digest',r.sha256,true);
    transferOne(r.state,['read','absent','unavailable','skipped']);transferOne(r.absence,['ref','path',null]);transferScalar('bool',r.selected);transferScalar('bool',r.contributed);
    transferScalar('token',r.outputSection);transferScalar('path',r.outputProjection.fragment);transferScalar('digest',r.outputProjection.sha256);transferList(r.recordIds,'token',512);
  }
  for(const p of o.projections??[]){if(p.producerId!==o.producerId)throw new Error('Producer mismatch');transferOne(p.kind,['drain-queue']);transferScalar('path',p.fragment);transferScalar('digest',p.sha256);}
  for(const g of o.gaps){if(g.producerId!==null&&g.producerId!==o.producerId)throw new Error('Gap producer mismatch');if(g.source!==null)transferSource(g.source);}
  if(o.association!==undefined){const a=o.association;transferScalar('date',a.date);transferScalar('path',a.branch);transferScalar('bool',a.preexisting);for(const key of ['preimageHeadSha','headSha'])transferScalar('sha',a[key],true);for(const key of ['prId','prNumber'])transferScalar('id',a[key],true);}
}

// JSON.parse discards duplicate members, including escaped aliases. Retaining
// the original projection text after that lossy validation could export values
// which were never validated. Walk decoded member names before accepting bytes.
function projectionJSON(text) {
  const value=JSON.parse(text);
  const tokens=text.match(/"(?:[^"\\]|\\.)*"|[{}\[\],:]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)??[];
  let at=0;
  const walk=depth=>{
    if(depth>64)throw new Error('Projection nesting exceeds bound');
    const token=tokens[at++];
    if(token==='{'){
      const keys=new Set();
      if(tokens[at]==='}'){at++;return;}
      do{
        const key=JSON.parse(tokens[at++]);
        if(keys.has(key))throw new Error('Duplicate projection member');
        keys.add(key);at++;walk(depth+1);
      }while(tokens[at++ ]===',');
    }else if(token==='['){
      if(tokens[at]===']'){at++;return;}
      do{walk(depth+1);}while(tokens[at++ ]===',');
    }
  };
  walk(0);
  if(at!==tokens.length)throw new Error('Invalid projection tokens');
  return value;
}

function transferProjection(text){
  const value=projectionJSON(text);
  if(Array.isArray(value)){
    if(value.length>2000)throw new Error();
    for(const row of value){transferKeys(row,'sha ok at');transferScalar('sha',row.sha);transferScalar('time',row.at);if(!sha(row.sha)||typeof row.ok!=='boolean'||!Number.isFinite(Date.parse(row.at)))throw new Error();}
  }else if(value&&Object.hasOwn(value,'items')){
    transferKeys(value,'date items');if(!/^\d{4}-\d\d-\d\d$/.test(value.date)||!Array.isArray(value.items)||value.items.length>2000)throw new Error();
    for(const row of value.items){transferKeys(row,'id kind status');for(const v of Object.values(row))if(typeof v!=='string'||!/^[\w:./-]{1,200}$/.test(v))throw new Error();}
  }else{
    transferKeys(value,'before after actions');
    for(const key of ['before','after','actions']){
      if(value[key]===null&&key!=='actions')continue;
      if(!Array.isArray(value[key])||value[key].length>2000)throw new Error();
      for(const row of value[key]){
        transferKeys(row,key==='actions'?'number head action done':'number id head headSha state mergeable');transferScalar('id',row.number);transferScalar('path',row.head);
        if(key==='actions'){transferOne(row.action,['merge','close','leave']);transferScalar('bool',row.done);}
        else{transferScalar('id',row.id);transferScalar('sha',row.headSha);transferOne(row.state,['open']);transferScalar('bool',row.mergeable,true);}
      }
    }
  }
}
function producerTransferValue(producerId,value){
  if(!Object.values(OBSERVATION_PRODUCERS).flat().some(p=>p.id===producerId))throw new Error('Unknown evidence producer');
  const raw=value?.observation??value?.data?.observation??value;
  const o=JSON.parse(JSON.stringify(raw));
  transferKeys(o,'producerId writes reads fragments gaps projections association');
  if(o.producerId!==producerId)throw new Error('Producer identity mismatch');
  for(const [key,max] of [['writes',512],['reads',64],['fragments',128],['gaps',128]])if(!Array.isArray(o[key])||o[key].length>max)throw new Error('Producer evidence limit');
  for(const write of o.writes){
    transferKeys(write,producerFields.write);transferKeys(write.target,producerFields.target);transferKeys(write.intended,producerFields.intended);
    for(const snapshot of [write.before,write.after])if(snapshot!==null)transferKeys(snapshot,producerFields.snapshot);
    if(!Array.isArray(write.intended.names))throw new Error();
    for(const token of write.intended.names){transferKeys(token,'rowId value');const row=nameRow(token.rowId);if(![row.keel,row.plates].includes(token.value))throw new Error();}
  }
  for(const read of o.reads){transferKeys(read,producerFields.read);transferKeys(read.outputProjection,'fragment sha256');}
  if(o.projections!==undefined){if(!Array.isArray(o.projections)||o.projections.length>128)throw new Error();for(const projection of o.projections)transferKeys(projection,'producerId kind fragment sha256');}
  for(const gap of o.gaps){transferKeys(gap,'code producerId source');if(typeof gap.code!=='string'||!/^[a-z0-9-]{1,100}$/.test(gap.code))throw new Error();if(gap.source!==null)transferKeys(gap.source,producerFields.source);}
  if(o.association!==undefined)transferKeys(o.association,producerFields.association);
  for(const fragment of o.fragments){
    transferKeys(fragment,'path kind text');
    if(!/^fragments\/[\w.-]+\.txt$/.test(fragment.path)||typeof fragment.text!=='string'||Buffer.byteLength(fragment.text)>256*1024)throw new Error();
    if(fragment.kind==='managed-fragment')fragment.text=[...new Set(namedTokens(fragment.text).map(t=>t.value))].join('\n');
    else if(fragment.kind==='projection')transferProjection(fragment.text);
    else throw new Error();
  }
  transferScalars(o);
  return o;
}
function transferManifest(manifest){
  transferKeys(manifest,'files gaps');
  if(!Array.isArray(manifest.files)||manifest.files.length>128||!Array.isArray(manifest.gaps)||manifest.gaps.length>128)throw new Error('Invalid load manifest');
  for(const row of manifest.files){transferKeys(row,'kind path sha256');transferScalar('path',row.path);transferScalar('digest',row.sha256);if(!['checkout','runtime'].includes(row.kind)||typeof row.path!=='string'||!/^[-\w./]+$/.test(row.path)||row.path.startsWith('/')||row.path.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(row.sha256))throw new Error('Invalid loaded source');}
  if(manifest.gaps.some(g=>typeof g!=='string'||!/^[a-z0-9-]{1,100}$/.test(g)))throw new Error('Invalid load gap');
  return manifest;
}
export async function namesProducerTransfer({producerId,path,value,imports,manifest,maxBytes=131072}) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>131072)throw new Error('Invalid transfer bound');
  const read=async path=>{const {lstat}=await import('node:fs/promises');const st=await lstat(path);if(!st.isFile()||st.isSymbolicLink()||st.size>1024*1024)throw new Error();return JSON.parse(await readFile(path,'utf8'));};
  let observation;
  try{observation=producerTransferValue(producerId,path?await read(path):value);}catch{observation=producerTransferValue(producerId,{producerId,writes:[],reads:[],fragments:[],gaps:[{code:'producer-output-unavailable',producerId,source:null}]});}
  let loads;
  try{loads=transferManifest(imports?await read(imports):manifest);}catch{loads={files:[],gaps:['runtime-load-manifest-missing']};}
  const encoded=Buffer.from(JSON.stringify({producerId,value:observation,loads:loads.files,loadGaps:loads.gaps})).toString('base64');
  if(encoded.length>maxBytes)throw new Error('Producer transfer exceeds bound');
  return encoded;
}
export function decodeNamesProducerTransfer(encoded) {
  if(typeof encoded!=='string'||encoded.length>131072||!encoded.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('Invalid producer transfer');
  const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)throw new Error('Invalid producer encoding');
  const text=bytes.toString('utf8'),v=JSON.parse(text);if(JSON.stringify(v)!==text)throw new Error('Noncanonical producer transfer');
  transferKeys(v,'producerId value loads loadGaps');
  const value=producerTransferValue(v.producerId,v.value),manifest=transferManifest({files:v.loads,gaps:v.loadGaps});
  return {producerId:v.producerId,value,loads:manifest.files,loadGaps:manifest.gaps};
}


/** Observe a workflow's no-change exit using an existing exact same-night PR.
 * This does not generate/update a body or recover by repeating any mutation. */
export async function captureRetainedNamesPublication({repo,repositoryId,kind,branch,date,prNumber=null,outputFile},github) {
  const {writeFile}=await import('node:fs/promises');
  if(!validRepo(repo)||!positive(repositoryId)||!['night','morning'].includes(kind)||!/^\d{4}-\d\d-\d\d$/.test(date)||!readNames('git ref:keel-night/').some(prefix=>branch===`${prefix}${date}${kind==='morning'?'-final':''}`))throw new Error('Invalid retained publication identity');
  const producerId=kind==='night'?'night-pr':'final-pr';
  const output={producerId,writes:[],reads:[],fragments:[],gaps:[]};
  try{
    if(prNumber===null){
      const rows=await namesPages(github,`/repos/${repo}/pulls?state=all`);
      const found=rows.filter(p=>p.head?.ref===branch&&p.base?.repo?.id===repositoryId);
      if(found.length!==1||!positive(found[0].number))throw new Error();prNumber=found[0].number;
    }
    const read=async()=>{
      const pr=await namesRead(github,`/repos/${repo}/pulls/${prNumber}`);
      if(!positive(pr.id)||pr.number!==prNumber||pr.base?.repo?.id!==repositoryId||pr.head?.ref!==branch||!sha(pr.head?.sha)||typeof pr.body!=='string'||Buffer.byteLength(pr.body)>256*1024||!Array.isArray(pr.labels)||pr.labels.some(l=>!positive(l.id)))throw new Error();
      return pr;
    };
    const before=await read(),after=await read();
    const snapshot=pr=>({state:'present',commitSha:null,blobSha:null,sha256:observationHash(pr.body),labelIds:pr.labels.map(l=>l.id).sort((a,b)=>a-b),providerUpdatedAt:pr.updated_at??null});
    const prior=snapshot(before),confirmed=snapshot(after);
    if(before.id!==after.id||before.head.sha!==after.head.sha||prior.sha256!==confirmed.sha256||JSON.stringify(prior.labelIds)!==JSON.stringify(confirmed.labelIds)||prior.providerUpdatedAt!==confirmed.providerUpdatedAt)throw new Error();
    const fragment=`fragments/${producerId}-retained.txt`;
    output.fragments.push({path:fragment,kind:'managed-fragment',text:''});
    output.writes.push({producerId,role:producerId,sequence:1,operationId:null,target:{kind:'pr',repositoryId,id:after.id,number:after.number,headSha:after.head.sha},outcome:'no-change',before:prior,intended:{fragment,sha256:confirmed.sha256,names:[]},after:confirmed,observedAt:new Date().toISOString()});
    output.association={date,branch,preexisting:true,preimageHeadSha:before.head.sha,prId:after.id,prNumber:after.number,headSha:after.head.sha};
  }catch{output.gaps.push({code:'retained-publication-unavailable',producerId,source:null});}
  await writeFile(outputFile,JSON.stringify(output),{flag:'wx',mode:0o600});
}
