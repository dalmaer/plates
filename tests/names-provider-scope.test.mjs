import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fill} from '../lib/practices.mjs';
import {providerBindings,previewNames,applyNames} from '../lib/names-actions.mjs';
import {NAMES} from '../lib/names.mjs';
const repo='acme/anvils',revision='a'.repeat(40),configPath='.plates/plates.json';
const map=[['night','night'],['morning','night'],['climb','climb'],['tend','climb'],['robot','climb']];
const hash=text=>createHash('sha256').update(text).digest('hex');
const blob=text=>createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
const response=(path,text)=>({status:200,data:{type:'file',path,encoding:'base64',content:Buffer.from(text).toString('base64'),sha:blob(text)}});
async function fixture({name='night',config={repo,name:'Acme',practices:['night','climb']},change=text=>text,path}={}){
 const practice=map.find(([n])=>n===name)[1],target=`.github/workflows/plates-${name}.yml`;
 const template=await readFile(new URL(`../practices/${practice}/files/${target}`,import.meta.url),'utf8');
 const files=new Map([[path??target,change(fill(template,config,target))]]);
 const state={files,config:JSON.stringify(config),calls:[],secrets:[],variables:[],override:null};
 const github=async request=>{
  state.calls.push(request);const {method='GET',path}=request;assert.equal(method,'GET','fixture refuses remote writes');
  if(state.override){const overridden=state.override(request);if(overridden)return overridden;}
  if(path===`/repos/${repo}`)return {status:200,data:{id:7,full_name:repo,default_branch:'main'}};
  if(path===`/repos/${repo}/commits/main`)return {status:200,data:{sha:revision}};
  if(path.includes('/contents/')){
   assert.ok(path.endsWith(`?ref=${revision}`),'all sources use same immutable revision');
   const p=path.split('/contents/')[1].split('?')[0];
   if(p==='.github/workflows')return {status:200,data:[...files].map(([path,text])=>({type:'file',path,sha:blob(text)}))};
   if(p===configPath)return state.config===null?{status:404}:response(p,state.config);
   return files.has(p)?response(p,files.get(p)):{status:404};
  }
  if(path.includes('/labels?'))return {status:200,data:[]};
  if(path.includes('/actions/variables?'))return {status:200,data:{total_count:state.variables.length,variables:state.variables}};
  if(path.includes('/actions/secrets?'))return {status:200,data:{total_count:state.secrets.length,secrets:state.secrets}};
  assert.fail('unexpected Acme request '+path);
 };
 return {state,github,target,template,config};
}
for(const [name] of map)test(`canonical ${name} classifies absent setup secret with pinned provenance`,async()=>{
 const {state,github,target,template}=await fixture({name});const scope=await providerBindings(github,repo,revision);
 assert.deepEqual(scope.gaps,[]);assert.equal(scope.classifications.length,1);
 const e=scope.classifications[0];assert.equal(e.classification,'no-configured-setup-secret');assert.equal(e.revision,revision);
 assert.equal(e.workflow.path,target);assert.equal(e.workflow.blobSha,blob(state.files.get(target)));assert.equal(e.configuration.sha256,hash(state.config));assert.equal(e.template.sha256,hash(template));
 assert.deepEqual(e.implementation.map(i=>i.path),['lib/names-actions.mjs','lib/practices.mjs','practices/night/files/scripts/plates/lib.mjs']);
 for(const i of e.implementation)assert.equal(i.sha256,hash(await readFile(new URL('../'+i.path,import.meta.url))));
 assert.equal(state.calls.filter(c=>c.path.includes('/contents/.plates/plates.json')).length,1);
 assert.ok(state.calls.every(c=>c.method==='GET'));assert.equal(scope.secrets.size,0);
});
const mapped=NAMES.find(r=>r.providerScope==='binding-required'&&r.id==='web:KEEL_GITHUB_CLIENT_SECRET');
assert.ok(mapped,'existing mapped secret row');
for(const alias of ['keel','plates'])test(`mapped setup ${alias} uses existing secret authority only`,async()=>{
 const {state,github}=await fixture({config:{repo,name:'Acme',practices:['night'],setup:'echo Acme',setupToken:mapped[alias]}});
 state.secrets=[{name:mapped[alias]}];state.variables=[{name:mapped.keel,value:'Acme private variable sentinel'}];
 const {publicPlan}=await previewNames({repo,only:[mapped.id]},github);
 assert.deepEqual(publicPlan.providerScope.gaps,[]);assert.ok(publicPlan.providerScope.secrets.includes(mapped.id));assert.ok(!publicPlan.providerScope.variables.includes(mapped.id));
 assert.equal(publicPlan.secrets.length,1);assert.equal(publicPlan.secrets[0].row,mapped.id);assert.equal(publicPlan.secrets[0].state,alias==='keel'?'owner-action':'current-name-present-value-unverified');
 assert.equal(publicPlan.actions.length,0);assert.ok(!JSON.stringify(publicPlan).includes('Acme private variable sentinel'));
});
test('unmapped setup name remains outside migration and private config never exports',async()=>{
 const config={repo,name:'Acme',practices:['night'],setup:'Acme private setup sentinel',setupToken:'ACME_PRIVATE_SETUP',env:{ACME_PRIVATE_KEY:'Acme private env sentinel'}};
 const {github}=await fixture({config});const {publicPlan}=await previewNames({repo},github);
 assert.deepEqual(publicPlan.providerScope.gaps,[]);assert.equal(publicPlan.providerScope.classifications[0].classification,'outside-name-table-migration');
 const text=JSON.stringify(publicPlan);for(const s of [config.setup,config.setupToken,'ACME_PRIVATE_KEY',config.env.ACME_PRIVATE_KEY])assert.ok(!text.includes(s));
});
test('process-only setup name remains unestablished',async()=>{
 const row=NAMES.find(r=>r.environmentPolicy&&r.providerScope==='unestablished');assert.ok(row);
 const {github}=await fixture({config:{repo,name:'Acme',practices:['night'],setup:'echo Acme',setupToken:row.keel}});
 const s=await providerBindings(github,repo,revision);assert.ok(s.gaps.includes('provider-row-scope-unestablished'));assert.ok(!s.secrets.has(row.id));
});
for(const [label,config] of [
 ['missing',null],['json','{'],['null','null'],['array','[]'],['repo',JSON.stringify({repo:'acme/other',practices:[]})],['practices',JSON.stringify({repo,practices:{}})],
 ...[{setupToken:''},{setupToken:3},{setupToken:'ACME_INVALID-'},{setupToken:'GITHUB_RESERVED'},{setupToken:'ACME_SETUP'},{setup:' '},{env:[]},{env:{ACME:4}}].map((v,i)=>['fields-'+i,JSON.stringify({repo,name:'Acme',practices:['night'],...v})]),
])test(`invalid setup config ${label} stays unknown while static bindings survive`,async()=>{
 const {state,github}=await fixture();state.config=config;
 state.files.set('.github/workflows/acme.yml','env:\n  ACME: ${{ vars.KEEL_WEB_ORIGIN }}\n');
 const s=await providerBindings(github,repo,revision);assert.ok(s.gaps.includes('dynamic-provider-binding-unclassified'));assert.ok(s.variables.has('web:KEEL_WEB_ORIGIN'));assert.equal(s.classifications.length,0);
});
for(const change of ['comment','producer','expression','additional'])test(`changed workflow ${change} cannot classify setup`,async()=>{
 const {github}=await fixture({change:text=>change==='comment'?text+'\n# Acme changed\n':change==='producer'?text.replace('const tok = c.setupToken','const tok = c.otherToken'):change==='expression'?text.replaceAll('secrets[steps.config.outputs.setup_token]','secrets[inputs.token]'):text+'\nenv: { ACME: "${{ vars[inputs.key] }}" }\n'});
 const s=await providerBindings(github,repo,revision);assert.ok(s.gaps.includes('dynamic-provider-binding-unclassified'));assert.equal(s.classifications.length,0);
});
for(const path of ['.github/workflows/acme.yml','.github/workflows/plates-night.yaml','.github/workflows/plates-night-extra.yml'])test(`unsupported path ${path} never inherits setup authority`,async()=>{
 const {github}=await fixture({path});const s=await providerBindings(github,repo,revision);assert.ok(s.gaps.includes('dynamic-provider-binding-unclassified'));assert.equal(s.classifications.length,0);
});
test('canonical setup does not suppress arbitrary workflow gaps or static binding discovery',async()=>{
 const {state,github}=await fixture();state.files.set('.github/workflows/acme.yml','env:\n  ACME: ${{ vars[inputs.key] }}\n  STATIC: ${{ vars.KEEL_WEB_ORIGIN }}\n');
 const s=await providerBindings(github,repo,revision);assert.equal(s.classifications.length,1);assert.ok(s.gaps.includes('dynamic-provider-binding-unclassified'));assert.ok(s.variables.has('web:KEEL_WEB_ORIGIN'));
});
test('static and expression literal workflows do not need setup config',async()=>{
 const {state,github}=await fixture();state.config=null;state.files.clear();state.files.set('.github/workflows/acme.yml',`# \${{ secrets[steps.config.outputs.setup_token] }}\nenv:\n  STATIC: \${{ vars.KEEL_WEB_ORIGIN }}\n  QUOTED: \${{ 'secrets[steps.config.outputs.setup_token]' }}\n`);
 const s=await providerBindings(github,repo,revision);assert.deepEqual(s.gaps,[]);assert.ok(s.variables.has('web:KEEL_WEB_ORIGIN'));assert.equal(state.calls.filter(c=>c.path.includes(configPath)).length,0);
});
for(const kind of ['config-denied','config-blob','workflow-blob','directory-denied'])test(`unavailable ${kind} remains a coverage gap`,async()=>{
 const {state,github,target}=await fixture();state.override=({path})=>{
  if(kind==='directory-denied'&&path.includes('/contents/.github/workflows?'))return {status:403};
  if(kind==='config-denied'&&path.includes(configPath))return {status:403};
  const p=kind==='config-blob'?configPath:kind==='workflow-blob'?target:null;
  if(p&&path.includes(`/contents/${p}?`)){const res=response(p,p===configPath?state.config:state.files.get(p));res.data.sha='f'.repeat(40);return res;}
 };
 const s=await providerBindings(github,repo,revision);assert.ok(s.gaps.length);assert.equal(s.classifications.length,0);
});
test('config provenance changes public digest even without a setup binding and stale approval refuses writes',async t=>{
 const root=await mkdtemp(join(tmpdir(),'acme-setup-scope-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const {state,github}=await fixture();const first=(await previewNames({repo},github)).publicPlan;
 state.config=JSON.stringify({...JSON.parse(state.config),acmePrivateNote:'Acme private changed note'});
 const next=(await previewNames({repo},github)).publicPlan;assert.notEqual(next.digest,first.digest);assert.notEqual(next.providerScope.classifications[0].configuration.sha256,first.providerScope.classifications[0].configuration.sha256);
 assert.ok(!JSON.stringify(next).includes('Acme private changed note'));
 await assert.rejects(applyNames({root,repo,digest:first.digest},github),/Preview changed/);assert.ok(state.calls.every(c=>c.method==='GET'));
});
