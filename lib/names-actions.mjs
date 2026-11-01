// Exact approved name changes. Private intents precede writes; recovery never resends.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, lstat, realpath, rm } from 'node:fs/promises';
import { dirname, join, resolve, parse } from 'node:path';
import { NAMES, environmentValue, labelWriter, remoteLabelReceipt } from '../practices/night/files/scripts/plates/names.mjs';
import { hostname } from 'node:os';
import { fill } from './practices.mjs';
import { setupEnvProblems } from '../practices/night/files/scripts/plates/lib.mjs';
import { spawnSync } from 'node:child_process';

export const digestOf = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const matchesReference = (row,name,spelling='keel') => row.surface==='git ref' && typeof name==='string' && (name===row[spelling] || (/[/-]$/.test(row[spelling]) && name.startsWith(row[spelling])));
export const validRepo = value => typeof value === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value) && !value.split('/').some(p => p === '.' || p === '..');
const positive = n => Number.isSafeInteger(n) && n > 0;
const fail = message => { throw new Error(message); };
export function namesGithub(env = process.env) {
  const binaryExecutable = environmentValue('variable:KEEL_GH', env) ?? 'gh';
  if (typeof binaryExecutable !== 'string' || !binaryExecutable.trim() || /[\x00-\x1f]/.test(binaryExecutable)) fail('Invalid selected GitHub executable');
  return async ({method = 'GET', path, body, binary = false}) => {
    if (!['GET','POST','PATCH'].includes(method) || !/^\/repos\/[\w.-]+\/[\w.-]+(?:[/?]|$)/.test(path) || /[\r\n#]/.test(path)) fail('Invalid names API request');
    if (binary) {
      if (method !== 'GET' || body !== undefined || !/^\/repos\/[\w.-]+\/[\w.-]+\/actions\/artifacts\/[1-9]\d*\/zip$/.test(path)) fail('Invalid observation archive request');
      const r = spawnSync(binaryExecutable,['api','--method','GET',path],{env,encoding:null,timeout:30000,maxBuffer:8*1024*1024});
      if (r.error || r.status !== 0 || !Buffer.isBuffer(r.stdout)) fail('Observation archive unavailable');
      return {status:200,data:r.stdout};
    }
    const args = ['api','--include','--method',method,path];
    if (body !== undefined) args.push('--input','-');
    const r = spawnSync(binaryExecutable,args,{env,input:body === undefined ? undefined : JSON.stringify(body),encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
    const m = /^HTTP\/[\d.]+ (\d+)[^\n]*\r?\n[\s\S]*?\r?\n\r?\n([\s\S]*)$/.exec(r.stdout ?? '');
    if (r.error || !m) fail('Names provider response unavailable');
    try { return {status:Number(m[1]),data:m[2].trim() ? JSON.parse(m[2]) : null}; }
    catch { fail('Names provider response invalid'); }
  };
}
export async function namesRead(github,path) {
  const r = await github({method:'GET',path});
  if (r?.status !== 200) fail('Names provider read unavailable');
  return r.data;
}
export async function namesPages(github,path,key = null) {
  const rows = [];
  for (let page=1;page<=20;page++) {
    const data = await namesRead(github,`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const items = key === null ? data : data?.[key];
    if (!Array.isArray(items) || items.length > 100) fail('Names provider page invalid');
    rows.push(...items);
    if (items.length < 100) {
      if (key !== null && (!Number.isSafeInteger(data.total_count) || data.total_count !== rows.length)) fail('Names provider coverage incomplete');
      return rows;
    }
  }
  fail('Names provider coverage capped');
}
function unique(rows,key,validate) {
  const seen = new Set();
  for (const row of rows) { if (!validate(row) || seen.has(row[key])) fail('Names provider identities invalid'); seen.add(row[key]); }
  return rows;
}
// List branches supports page/per_page; matching-refs does not provide this contract.
export async function namesBranches(github,repo) {
  if (!validRepo(repo)) fail('Invalid branch repository');
  return unique(await namesPages(github,`/repos/${repo}/branches`),'name',r=>typeof r?.name==='string' && r.name.length>0 && r.name.length<=1024 && !/[\x00-\x20\x7f]/.test(r.name) && /^[a-f0-9]{40}$/.test(r.commit?.sha ?? ''));
}
export async function labelFacts(github,repo) {
  const meta = await namesRead(github,`/repos/${repo}`);
  if (!positive(meta?.id) || meta.full_name !== repo) fail('Repository identity unavailable');
  const labels = unique(await namesPages(github,`/repos/${repo}/labels`),'name',r=>positive(r.id) && typeof r.name === 'string' && r.name.length <= 100);
  unique(labels,'id',()=>true);
  return {repo,repositoryId:meta.id,labels,complete:true,observedAt:new Date().toISOString(),defaultBranch:meta.default_branch};
}
// Provider scope is separate from process compatibility. Table expansion cannot
// silently enlarge the mutation surface; these candidates still require a real
// direct binding in a workflow at the exact approved source revision.
const mappedSettings=NAMES.filter(r=>r.providerScope==='binding-required');
// This finite exception trusts the shipped producer as a whole, never a filename alone.
const setupWorkflows = new Map([
  ['.github/workflows/plates-night.yml','night'], ['.github/workflows/plates-morning.yml','night'],
  ['.github/workflows/plates-climb.yml','climb'], ['.github/workflows/plates-tend.yml','climb'],
  ['.github/workflows/plates-robot.yml','climb'],
].map(([path,practice])=>[path,`practices/${practice}/files/${path}`]));
const setupLookup = 'secrets[steps.config.outputs.setup_token]';
const sourceHash = text => createHash('sha256').update(text).digest('hex');
const sourceIdentity = (path,text) => ({path,blobSha:createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex'),sha256:sourceHash(text)});
async function setupBinding(github,repo,revision,path,text,configSource) {
  const templatePath=setupWorkflows.get(path);
  if(!templatePath)throw new Error('unsupported setup workflow');
  const configText=await configSource();
  if(configText===null)throw new Error('setup config unavailable');
  const config=JSON.parse(configText);
  if(!config || Array.isArray(config) || config.repo!==repo || !Array.isArray(config.practices) || config.practices.some(p=>typeof p!=='string') || setupEnvProblems(config).length)throw new Error('invalid setup config');
  const template=await readFile(new URL(`../${templatePath}`,import.meta.url),'utf8');
  if(text!==fill(template,config,path))throw new Error('changed setup workflow');
  const identities=await Promise.all(['lib/names-actions.mjs','lib/practices.mjs','practices/night/files/scripts/plates/lib.mjs'].map(async path=>({path,sha256:sourceHash(await readFile(new URL(`../${path}`,import.meta.url)))})));
  const name=config.setupToken;
  const row=mappedSettings.find(r=>r.keel===name||r.plates===name);
  const unestablished=!row && NAMES.some(r=>r.environmentPolicy&&(r.keel===name||r.plates===name));
  return {row,unestablished,evidence:{revision,workflow:sourceIdentity(path,text),configuration:sourceIdentity('.plates/plates.json',configText),template:sourceIdentity(templatePath,template),implementation:identities,
    classification:name===undefined?'no-configured-setup-secret':row?'mapped-secret':unestablished?'provider-row-scope-unestablished':'outside-name-table-migration',...(row?{row:row.id}:{})}};
}
// Conservative executable-expression census, not a general YAML interpreter.
// Skip YAML comments and quoted expression literals. Unsupported multiline or
// dynamic expressions are gaps rather than configuration authority.
function providerExpressions(text, gaps) {
  const expressions=[];
  for(const line of text.split(/\r?\n/)){
    if(/^\s*#/.test(line))continue;
    let quote=null;
    for(let i=0;i<line.length;i++){
      if(line.startsWith('${{',i)){
        const end=line.indexOf('}}',i+3);
        if(end<0){gaps.push('multiline-provider-expression-unsupported');break;}
        expressions.push(line.slice(i+3,end));i=end+1;continue;
      }
      const ch=line[i];
      if(quote){if(ch===quote){if(quote==="'"&&line[i+1]==="'")i++;else quote=null;}else if(quote==='"'&&ch==='\\')i++;}
      else if(ch==='#'&&(i===0||/\s/.test(line[i-1])))break;
      else if(ch==='"'||ch==="'")quote=ch;
    }
  }
  return expressions;
}
function directProviderBindings(expression,gaps){
  const bindings=[];
  for(let i=0;i<expression.length;){
    const ch=expression[i];
    if(ch==="'"||ch==='"'){
      const quote=ch;i++;
      while(i<expression.length){if(expression[i]===quote){if(expression[i+1]===quote){i+=2;continue;}i++;break;}if(expression[i]==='\\')i++;i++;}
      continue;
    }
    if(expression.startsWith(setupLookup,i)&&(i===0||!/[\w.]/.test(expression[i-1]))){bindings.push({kind:'setup'});i+=setupLookup.length;continue;}
    const match=/^(vars|secrets)(?:\.([A-Z][A-Z0-9_]*)|\[\s*(['"])([A-Z][A-Z0-9_]*)\3\s*\])/.exec(expression.slice(i));
    if(match&&(i===0||!/[\w.]/.test(expression[i-1]))){bindings.push({kind:match[1],name:match[2]??match[4]});i+=match[0].length;continue;}
    if(/^(?:vars|secrets)\s*\[/.test(expression.slice(i)))gaps.push('dynamic-provider-binding-unclassified');
    i++;
  }
  return bindings;
}
export async function providerBindings(github,repo,revision) {
  const variables=new Set(),secrets=new Set(),sources=[],gaps=[],classifications=[];
  let configRead;
  const configSource=()=>configRead??=namesSource(github,repo,revision,'.plates/plates.json');
  try{
    const response=await github({method:'GET',path:`/repos/${repo}/contents/.github/workflows?ref=${revision}`});
    if(response.status===404)return {variables,secrets,sources,gaps,classifications};
    const files=response.data;
    if(response.status!==200||!Array.isArray(files)||files.length>100)throw new Error();
    const seen=new Set();
    for(const f of files){
      if(f.type!=='file'||!/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(f.path??''))continue;
      if(seen.has(f.path)||!/^[a-f0-9]{40}$/.test(f.sha??''))throw new Error();seen.add(f.path);
      const text=await namesSource(github,repo,revision,f.path);
      if(text===null)throw new Error();const bytes=Buffer.from(text);
      if(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==f.sha)throw new Error();
      sources.push({path:f.path,blobSha:f.sha});
      let setup;
      for(const expression of providerExpressions(text,gaps)){
        for(const binding of directProviderBindings(expression,gaps)){
          if(binding.kind==='setup'){
            if(setup===undefined){
              try{setup=await setupBinding(github,repo,revision,f.path,text,configSource);classifications.push(setup.evidence);}
              catch{setup=null;gaps.push('dynamic-provider-binding-unclassified');}
            }
            if(setup?.row)secrets.add(setup.row.id);
            if(setup?.unestablished)gaps.push('provider-row-scope-unestablished');
            continue;
          }
          const row=mappedSettings.find(r=>r.keel===binding.name||r.plates===binding.name);
          if(row)(binding.kind==='vars'?variables:secrets).add(row.id);
          else if(NAMES.some(r=>r.environmentPolicy&&(r.keel===binding.name||r.plates===binding.name)))gaps.push('provider-row-scope-unestablished');
        }
      }
    }
  }catch{variables.clear();secrets.clear();gaps.push('provider-binding-source-unavailable');}
  return {variables,secrets,sources:sources.sort((a,b)=>a.path.localeCompare(b.path)),classifications:classifications.sort((a,b)=>a.workflow.path.localeCompare(b.workflow.path)),gaps:[...new Set(gaps)]};
}
export async function namesSource(github,repo,revision,path) {
  const response=await github({method:'GET',path:`/repos/${repo}/contents/${path}?ref=${revision}`});
  if(response?.status===404)return null;
  const f=response?.data;
  if(response?.status!==200||f?.type!=='file'||f.path!==path||f.encoding!=='base64'||typeof f.content!=='string'||f.content.length>350000||! /^[a-f0-9]{40}$/.test(f.sha??''))fail('Pinned source unavailable');
  const bytes=Buffer.from(f.content,'base64');
  if(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==f.sha)fail('Pinned source digest mismatch');
  return bytes.toString('utf8');
}
export async function labelCoverage(github,repo,revision) {
  const result=Object.fromEntries(NAMES.filter(r=>r.surface==='label').map(r=>[r.id,'unknown-writer-coverage']));
  try{
    const text=await namesSource(github,repo,revision,'.plates/plates.json');
    const config=JSON.parse(text);
    if(config?.repo!==repo||!Array.isArray(config.practices)||config.practices.some(p=>typeof p!=='string'))return result;
    result['label:keel:owner']='manual-reader';
    result['label:keel:wait-for-review']='manual-reader';
    result['label:keel:review-after-pending']='no-label-consumer';
    const known=[['label:keel:agent','climb',config.robot?.on===true],['label:keel:review-after','cross-review',Boolean(config.crossReview)],['label:keel:morning','night',true]];
    for(const [id,practice,enabled] of known)result[id]=config.practices.includes(practice)&&enabled?'enabled-writer':'disabled-writer';
  }catch{/* Unknown config is not permission to create every possible label. */}
  return result;
}
const receiptEntries = receipt => [...(receipt?.renames ?? []),...(receipt?.creations ?? [])];
function validateReceipt(receipt,repo,repositoryId) {
  if(receipt===null)return;
  const entries=receiptEntries(receipt);
  const observation={repo,repositoryId,complete:true,observedAt:new Date().toISOString(),labels:entries.map(e=>({id:e.labelId,name:e.newName}))};
  labelWriter({id:NAMES.find(r=>r.surface==='label').id,repo,repositoryId,receipt,observation});
}

/** Values remain in this private in-memory plan, never in the public preview. */
export async function previewNames({repo,only = []},github) {
  if (!validRepo(repo)) fail('Expected one owner/repository');
  const allowed = NAMES.filter(r=>r.surface === 'label' || mappedSettings.includes(r));
  if (new Set(only).size !== only.length || only.some(id=>!allowed.some(r=>r.id===id))) fail('Unknown or duplicate actionable row');
  const facts = await labelFacts(github,repo), base=`/repos/${repo}`;
  const head = await namesRead(github,`${base}/commits/${encodeURIComponent(facts.defaultBranch)}`);
  if (!/^[a-f0-9]{40}$/.test(head?.sha ?? '')) fail('Repository source revision unavailable');
  const receipt = await remoteLabelReceipt({repo,revision:head.sha,github});
  validateReceipt(receipt,repo,facts.repositoryId);
  const variables = unique(await namesPages(github,`${base}/actions/variables`,'variables'),'name',r=>typeof r.name==='string' && typeof r.value==='string');
  const secretRows = unique(await namesPages(github,`${base}/actions/secrets`,'secrets'),'name',r=>typeof r.name==='string');
  const actions=[],items=[],problems=[];
  const providerScope=await providerBindings(github,repo,head.sha);
  problems.push(...providerScope.gaps.map(gap=>`Provider scope incomplete: ${gap}`));
  const coverage=await labelCoverage(github,repo,head.sha);
  const selected = r => only.length ? only.includes(r.id) : r.surface!=='label' || facts.labels.some(l=>l.name===r.keel||l.name===r.plates) || coverage[r.id]==='enabled-writer';
  // All exact label rows are listed, including latent consumers. The plan explicitly
  // asks for every creation; no generic namespace permission is inferred.
  for (const row of NAMES.filter(r=>r.surface==='label')) {
    const old=facts.labels.find(l=>l.name===row.keel), current=facts.labels.find(l=>l.name===row.plates);
    let state='absent',action=null;
    try {
      labelWriter({id:row.id,repo,repositoryId:facts.repositoryId,receipt,observation:facts});
      if (old && current) fail('Both label names exist');
      if (current) state='verified-current';
      else if (old) {state='legacy';action={kind:'rename',row:row.id,labelId:old.id,oldName:row.keel,newName:row.plates};}
      else action={kind:'create',row:row.id,newName:row.plates,color:'ededed',description:'Plates automation'};
    } catch {state='conflict-or-unproven';if(selected(row))problems.push(`${row.id}: label identity or committed provenance unavailable`);}
    items.push({row:row.id,kind:'label',state,coverage:coverage[row.id],selected:selected(row),action:selected(row)?action:null});
    if(action && selected(row))actions.push(action);
  }
  for(const row of mappedSettings) {
    const providerSelected=selected(row)&&providerScope.variables.has(row.id);
    if(only.includes(row.id)&&!providerScope.variables.has(row.id)&&!providerScope.secrets.has(row.id))problems.push(`${row.id}: no pinned provider binding; process aliases do not authorize repository configuration`);
    const old=variables.find(v=>v.name===row.keel),current=variables.find(v=>v.name===row.plates);
    let state=old ? current ? old.value===current.value ? 'retained-verified-alias' : 'conflict' : 'legacy' : current ? 'current' : 'absent';
    if(state==='conflict' && providerSelected)problems.push(`${row.id}: variable destination differs`);
    const action=old && !current ? {kind:'variable',row:row.id,oldName:row.keel,newName:row.plates} : null;
    items.push({row:row.id,kind:'repository-variable',state,providerScope:providerScope.variables.has(row.id)?'pinned-workflow-binding':'no-supported-workflow-binding',selected:providerSelected,action:providerSelected?action:null});
    if(action && providerSelected)actions.push({...action,value:old.value});
  }
  const secrets=secretRows.flatMap(s=>mappedSettings.filter(r=>providerScope.secrets.has(r.id)&&(r.keel===s.name || r.plates===s.name)).map(r=>({row:r.id,name:s.name,command:`gh secret set ${r.plates} -R ${repo}`,state:s.name===r.keel?'owner-action':'current-name-present-value-unverified'})));
  const publicActions=actions.map(({value,...a})=>a);
  const publicPlan={schema:1,repo,repositoryId:facts.repositoryId,revision:head.sha,only,coverage,providerScope:{variables:[...providerScope.variables],secrets:[...providerScope.secrets],sources:providerScope.sources,classifications:providerScope.classifications,gaps:providerScope.gaps},items,actions:publicActions,secrets,problems,
    receiptPublication:'separate approval; committed evidence must reach workflow source revision',
    reminder:'Review saved label searches and notification filters separately.'};
  // One opaque approval digest binds private variable bytes without disclosing them.
  publicPlan.digest=digestOf({publicPlan,actions,receipt});
  return {publicPlan,actions,receipt,facts};
}

async function safeDirectory(path,create=false) {
  path=resolve(path);
  if(process.platform==='darwin')for(const alias of ['/tmp','var'].map(x=>x==='var'?'/var':x))if(path===alias||path.startsWith(alias+'/')){const target=await realpath(alias);if(target!==`/private${alias}`)fail('Unsafe state path');path=target+path.slice(alias.length);break;}
  let current=parse(path).root;
  for(const part of path.slice(current.length).split('/').filter(Boolean)) {
    current=join(current,part);
    let st;try{st=await lstat(current);}catch(e){if(e.code!=='ENOENT'||!create)throw e;await mkdir(current,{mode:0o700});st=await lstat(current);}
    if(!st.isDirectory()||st.isSymbolicLink())fail('Unsafe state directory');
  }
  return path;
}
const exact=(o,keys)=>o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).sort().join(',')===keys.slice().sort().join(',');
async function readJournal(file) {
  const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||st.size>524288)fail('Unsafe names journal');
  const j=JSON.parse(await readFile(file,'utf8'));
  if(!exact(j,['version','operationId','digest','repo','repositoryId','revision','receipt','only','actions']) || !/^[a-f0-9]{40}$/.test(j.revision??'') || !Array.isArray(j.only) || j.only.some(id=>typeof id!=='string') || new Set(j.only).size!==j.only.length || j.version!==1 || !validRepo(j.repo)||!positive(j.repositoryId)||!Array.isArray(j.actions)||j.actions.length>100 || !/^[a-f0-9]{64}$/.test(j.digest??'')||!/^names-[a-f0-9]{64}$/.test(j.operationId??'')||j.operationId!==`names-${j.digest}`)fail('Invalid names journal');
  validateReceipt(j.receipt,j.repo,j.repositoryId);
  const seen=new Set();
  for(const a of j.actions){
    const keys=['kind','row','newName','operationId','state',...(a.kind==='create'?['color','description',...(a.labelId!==undefined?['labelId']:[])]:['oldName',...(a.kind==='rename'?['labelId']:['commitment'])]),...(a.verifiedAt!==undefined?['verifiedAt']:[])];
    if(!exact(a,keys)||a.verifiedAt!==undefined&&(typeof a.verifiedAt!=='string'||!Number.isFinite(Date.parse(a.verifiedAt))||Date.parse(a.verifiedAt)>Date.now())||a.state==='verified'&&!a.verifiedAt)fail('Invalid names action fields');
    const row=NAMES.find(r=>r.id===a.row);if(!row||seen.has(a.row)||!['prepared','attempted','verified'].includes(a.state)||!['rename','create','variable'].includes(a.kind)||a.newName!==row.plates||('value' in a)||a.operationId!==`${j.operationId}:${j.actions.indexOf(a)}`)fail('Invalid names action');seen.add(a.row);
    if(a.kind==='create'?(row.surface!=='label'||a.oldName!==undefined||(a.labelId!==undefined&&!positive(a.labelId))||a.color!=='ededed'||a.description!=='Plates automation'):(a.oldName!==row.keel || (a.kind==='rename' ? row.surface!=='label'||!positive(a.labelId) : !mappedSettings.includes(row)||!/^[a-f0-9]{64}$/.test(a.commitment??''))))fail('Invalid names action identity');
  }
  return j;
}
async function save(file,j) {
  const temporary=`${file}.${randomUUID()}.tmp`;const h=await open(temporary,'wx',0o600);
  try{await h.writeFile(JSON.stringify(j));await h.sync();}finally{await h.close();}
  await rename(temporary,file);
  if(process.platform!=='win32'){const dir=await open(dirname(file),'r');try{await dir.sync();}finally{await dir.close();}}
}
const commitment=(repo,a,value)=>digestOf([repo,a.row,value]);
function publicResult(j,receipt) {
  return {schema:1,repo:j.repo,operationId:j.operationId,state:j.actions.every(a=>a.state==='verified')?'verified-awaiting-publication':'pending',
    actions:j.actions.map(({commitment,...a})=>a),receipt,publication:'Not committed or published. Review exact public receipt separately.'};
}
async function observeAction(j,a,github) {
  if(a.state==='prepared')return false;
  const facts=await labelFacts(github,j.repo);
  if(facts.repositoryId!==j.repositoryId)fail('Repository identity changed');
  if(a.kind==='variable'){
    const variables=await namesPages(github,`/repos/${j.repo}/actions/variables`,'variables');
    const old=variables.filter(v=>v.name===a.oldName),current=variables.filter(v=>v.name===a.newName);
    return old.length===1&&current.length===1&&typeof old[0].value==='string'&&old[0].value===current[0].value&&commitment(j.repo,a,current[0].value)===a.commitment;
  }
  if(!positive(a.labelId))return false;
  return !facts.labels.some(l=>l.name===NAMES.find(r=>r.id===a.row).keel)&&facts.labels.some(l=>l.id===a.labelId&&l.name===a.newName);
}
function receiptFor(j) {
  const receipt=j.receipt?structuredClone(j.receipt):{version:2,repo:j.repo,repositoryId:j.repositoryId,renames:[],creations:[]};
  receipt.version=2;receipt.creations??=[];
  for(const a of j.actions.filter(a=>a.state==='verified'&&a.kind!=='variable')){
    if(receiptEntries(receipt).some(e=>e.row===a.row))continue;
    const entry={row:a.row,labelId:a.labelId,newName:a.newName,operationId:a.operationId,verifiedAt:a.verifiedAt,readback:{repositoryId:j.repositoryId,labelId:a.labelId,name:a.newName}};
    if(a.kind==='rename')receipt.renames.push({...entry,oldName:a.oldName});else receipt.creations.push({kind:'created',...entry});
  }
  return receipt;
}
export async function recoverNames({root,operationId,stateDir=join(root,'.plates/name-transition/private')},github) {
  if(!/^names-[a-f0-9]{64}$/.test(operationId??''))fail('Invalid original operation identity');
  const dir=await safeDirectory(stateDir),j=await readJournal(join(dir,`${operationId}.json`));
  for(const a of j.actions){if(await observeAction(j,a,github)){a.state='verified';a.verifiedAt??=new Date().toISOString();}else if(a.state==='verified')a.state='attempted';}
  // Read-only recovery: report observed original outcomes; never persist, publish or resend.
  return publicResult(j,receiptFor(j));
}
async function takeNamesLock(lock) {
  const token=randomUUID();
  try{await mkdir(lock,{mode:0o700});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const readOwner=async()=>{const st=await lstat(lock);if(!st.isDirectory()||st.isSymbolicLink())fail('Unsafe names lock');const f=join(lock,'owner.json'),fs=await lstat(f);if(!fs.isFile()||fs.isSymbolicLink()||fs.size>4096)fail('Unknown names lock owner');const owner=JSON.parse(await readFile(f,'utf8'));if(!exact(owner,['pid','host','token'])||!positive(owner.pid)||owner.host!==hostname()||typeof owner.token!=='string')fail('Unknown names lock owner');return owner;};
    let owner;try{owner=await readOwner();}catch{return null;}
    try{process.kill(owner.pid,0);return null;}catch(e){if(e.code!=='ESRCH')return null;}
    const guard=`${lock}.reaper`;
    try{await mkdir(guard,{mode:0o700});}catch(e){if(e.code==='EEXIST')return null;throw e;}
    try{
      const current=await readOwner();if(current.token!==owner.token)return null;
      try{process.kill(current.pid,0);return null;}catch(e){if(e.code!=='ESRCH')return null;}
      const orphan=`${lock}.orphan-${randomUUID()}`;await rename(lock,orphan);await rm(orphan,{recursive:true});
    }finally{await rm(guard,{recursive:true});}
    try{await mkdir(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')return null;throw e;}
  }
  await save(join(lock,'owner.json'),{pid:process.pid,host:hostname(),token});
  return token;
}
async function releaseNamesLock(lock,token) {
  const owner=JSON.parse(await readFile(join(lock,'owner.json'),'utf8'));
  if(owner.token===token)await rm(lock,{recursive:true});
}

export async function applyNames({root,repo,only=[],digest,stateDir=join(root,'.plates/name-transition/private')},github) {
  if(!/^[a-f0-9]{64}$/.test(digest??''))fail('Expected reviewed preview digest');
  const dir=await safeDirectory(stateDir,true),operationId=`names-${digest}`,file=join(dir,`${operationId}.json`);
  let prior=null;
  try{prior=await readJournal(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(prior&&(prior.repo!==repo||JSON.stringify(prior.only)!==JSON.stringify(only)))fail('Original operation belongs to another repository or scope');
  const lock=join(dir,`repo-${digestOf(repo)}.lock`);
  const lockToken=await takeNamesLock(lock);
  if(!lockToken){if(prior)return recoverNames({root,operationId,stateDir},github);fail('Names writer busy or ownership unknown');}
  try{
    let j;
    if(prior){
      j=await readJournal(file);
      for(const a of j.actions.filter(a=>a.state!=='prepared')){
        if(await observeAction(j,a,github)){a.state='verified';a.verifiedAt??=new Date().toISOString();}
        else {a.state='attempted';await save(file,j);return publicResult(j,receiptFor(j));}
      }
      await save(file,j);
      if(j.actions.every(a=>a.state==='verified'))return publicResult(j,receiptFor(j));
      const meta=await namesRead(github,`/repos/${repo}`);
      if(meta.id!==j.repositoryId||meta.full_name!==repo)fail('Repository identity changed');
      const head=await namesRead(github,`/repos/${repo}/commits/${encodeURIComponent(meta.default_branch)}`);
      if(head.sha!==j.revision)fail('Original source revision changed; remaining actions need a new reviewed plan');
    }else{
      const plan=await previewNames({repo,only},github);
      if(plan.publicPlan.digest!==digest||plan.publicPlan.problems.length)fail('Preview changed or contains unresolved actions');
      // Explicitly ignore private journals. Never add a public receipt automatically.
      const ignore=join(dir,'.gitignore');try{const h=await open(ignore,'wx',0o600);await h.writeFile('*\n');await h.close();}catch(e){if(e.code!=='EEXIST')throw e;const st=await lstat(ignore);if(!st.isFile()||st.isSymbolicLink()||await readFile(ignore,'utf8')!=='*\n')fail('Private journal ignore differs');}
      j={version:1,operationId,digest,repo,repositoryId:plan.facts.repositoryId,revision:plan.publicPlan.revision,receipt:plan.receipt,only,actions:plan.actions.map(({value,...a},i)=>({...a,operationId:`${operationId}:${i}`,state:'prepared',...(a.kind==='variable'?{commitment:commitment(repo,a,value)}:{})}))};
      await save(file,j);
    }
    if(j.actions.some(a=>a.state==='prepared')&&(await providerBindings(github,repo,j.revision)).gaps.length)fail('Original provider scope incomplete; remaining actions not attempted');
    for(const a of j.actions){
      if(a.state!=='prepared')continue;
      if(a.kind==='variable'&&!(await providerBindings(github,repo,j.revision)).variables.has(a.row))fail('Original provider binding unavailable; no variable mutation');
      const facts=await labelFacts(github,repo);if(facts.repositoryId!==j.repositoryId)fail('Repository identity changed');
      let body,path,method;
      if(a.kind==='rename'){
        if(!facts.labels.some(l=>l.id===a.labelId&&l.name===a.oldName)||facts.labels.some(l=>l.name===a.newName))fail('Label changed since approval');
        body={new_name:a.newName};path=`/repos/${repo}/labels/${encodeURIComponent(a.oldName)}`;method='PATCH';
      }else if(a.kind==='create'){
        const row=NAMES.find(r=>r.id===a.row);if(facts.labels.some(l=>[row.keel,row.plates].includes(l.name)))fail('Label changed since approval');
        body={name:a.newName,color:a.color,description:a.description};path=`/repos/${repo}/labels`;method='POST';
      }else{
        const variables=await namesPages(github,`/repos/${repo}/actions/variables`,'variables');
        const old=variables.filter(v=>v.name===a.oldName),current=variables.filter(v=>v.name===a.newName);
        if(old.length!==1||typeof old[0].value!=='string'||commitment(repo,a,old[0].value)!==a.commitment||current.length)fail('Variable changed since approval');
        body={name:a.newName,value:old[0].value};path=`/repos/${repo}/actions/variables`;method='POST';
      }
      a.state='attempted';await save(file,j);
      try{
        const answer=await github({method,path,body});
        if(a.kind==='create'&&answer?.status===201&&positive(answer.data?.id)&&answer.data.name===a.newName){a.labelId=answer.data.id;await save(file,j);}
        if(await observeAction(j,a,github)){a.state='verified';a.verifiedAt=new Date().toISOString();await save(file,j);}else break;
      }catch{break;}
    }
    return publicResult(j,receiptFor(j));
  }finally{await releaseNamesLock(lock,lockToken);}
}
