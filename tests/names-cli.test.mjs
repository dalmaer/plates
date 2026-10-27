import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,writeFile,rm,symlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run} from './helpers/run.mjs';
import {createHash} from 'node:crypto';
import {previewNames,applyNames,recoverNames,namesPages,namesBranches,matchesReference} from '../lib/names-actions.mjs';
import {namesCommand,parseNamesArgs,runtimeInventory} from '../lib/names-cli.mjs';
import {NAMES,labelWriter,environmentValue,identityEnvironmentValue,scrubEnvironment} from '../practices/night/files/scripts/plates/names.mjs';
const repo='acme/anvils',revision='a'.repeat(40),id='label:keel:agent';
const source=(path,value)=>{const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value));return {status:200,data:{type:'file',path,encoding:'base64',content:bytes.toString('base64'),sha:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')}}};
function provider(options={}){
 const state={labels:[{id:7,name:'keel:agent'}],variables:[],secrets:[],receipt:null,config:{repo,practices:[]},workflow:'env:\n  ORIGIN: ${{ vars.KEEL_WEB_ORIGIN }}\n  CLIENT: ${{ secrets.KEEL_GITHUB_CLIENT_SECRET }}\n',calls:[],issueLabels:[7],...options};
 const github=async request=>{
  const {method='GET',path,body}=request;state.calls.push(structuredClone(request));
  if(state.before)await state.before(request,state);
  if(method==='GET'){
   if(path===`/repos/${repo}`)return {status:200,data:{id:31,full_name:repo,default_branch:'main'}};
   if(path===`/repos/${repo}/commits/main`)return {status:200,data:{sha:revision}};
   if(path.includes('/contents/')){const p=path.split('/contents/')[1].split('?')[0];if(p==='.github/workflows')return state.workflow===null?{status:404}:{status:200,data:[{type:'file',path:'.github/workflows/acme.yml',sha:source('.github/workflows/acme.yml',state.workflow).data.sha}]};if(p==='.github/workflows/acme.yml')return source(p,state.workflow);if(p==='.plates/plates.json')return source(p,state.config);return state.receipt?source(p,state.receipt):{status:404};}
   if(path.includes('/labels?'))return {status:200,data:structuredClone(state.labels)};
   if(path.includes('/actions/variables?'))return {status:200,data:{total_count:state.variables.length,variables:structuredClone(state.variables)}};
   if(path.includes('/actions/secrets?'))return {status:200,data:{total_count:state.secrets.length,secrets:structuredClone(state.secrets)}};
   if(path.includes('/pulls?')||path.includes('/branches?'))return {status:200,data:[]};
  }
  if(method==='PATCH'&&path.includes('/labels/')){const label=state.labels.find(l=>l.name===decodeURIComponent(path.split('/labels/')[1]));assert.ok(label);label.name=body.new_name;if(state.loseRename)throw new Error('response lost');return {status:200,data:structuredClone(label)};}
  if(method==='POST'&&path.endsWith('/labels')){const label={id:100+state.labels.length,name:body.name};state.labels.push(label);if(state.loseCreate)throw new Error('response lost');return {status:201,data:label};}
  if(method==='POST'&&path.endsWith('/actions/variables')){state.variables.push({name:body.name,value:body.value});return {status:201};}
  throw new Error('Unexpected fixture request '+method+' '+path);
 };
 return {state,github};
}
async function fixture(t,options){const root=await mkdtemp(join(tmpdir(),'acme-names-'));t.after(()=>rm(root,{recursive:true,force:true}));return {root,...provider(options)};}
const writes=state=>state.calls.filter(c=>c.method!=='GET');
test('the preview changes nothing and accounts for every held runtime row',async t=>{
 const {root,state,github}=await fixture(t);
 const out=await namesCommand({root,repo,only:[id],env:{KEEL_GH:'old',PLATES_GH:'new'}},{github});
 assert.equal(out.exitCode,3);assert.equal(writes(state).length,0);assert.deepEqual(await readdir(root),[]);
 assert.equal(out.data.runtime.length,NAMES.filter(r=>r.phase===128).length);
 assert.match(out.data.runtime.find(r=>r.row==='machine:.keel-time-proposals.lock').reason,/Legacy coordination/);
 assert.equal(out.data.runtime.find(r=>r.row==='variable:KEEL_GH').ignoredLegacy,'KEEL_GH');
 assert.ok(out.data.projects[0].gaps.length);assert.ok(out.data.projects[0].concurrency.gaps.length);
});
test('default latent label selection derives enabled writers at pinned source; unknown rows stay unselected',async t=>{
 const {github,state}=await fixture(t,{labels:[],config:{repo,practices:['night']}});
 const {publicPlan}=await previewNames({repo},github);
 assert.deepEqual(publicPlan.actions.map(a=>a.row),['label:keel:morning']);
 assert.equal(publicPlan.items.find(i=>i.row===id).selected,false);
 assert.equal(publicPlan.items.find(i=>i.row==='label:keel:owner').coverage,'manual-reader');
 assert.ok(state.calls.some(c=>c.path.includes(`.plates/plates.json?ref=${revision}`)));
 const chosen=await previewNames({repo,only:[id]},github);assert.deepEqual(chosen.publicPlan.actions.map(a=>a.row),[id]);
});
test('labels are renamed, never recreated; issue attachment ID survives and receipt publication is separate',async t=>{
 const {root,state,github}=await fixture(t);const plan=await previewNames({repo,only:[id]},github);
 const out=await applyNames({root,repo,only:[id],digest:plan.publicPlan.digest},github);
 assert.equal(out.state,'verified-awaiting-publication');assert.deepEqual(state.issueLabels,[7]);assert.equal(state.labels[0].id,7);assert.equal(state.labels[0].name,'plates:agent');
 assert.equal(writes(state).length,1);assert.equal(writes(state)[0].method,'PATCH');
 assert.equal(out.receipt.renames[0].labelId,7);assert.equal(out.receipt.version,2);
 await assert.rejects(readFile(join(root,'.plates/name-transition/label-renames.json')),{code:'ENOENT'});
 const again=await applyNames({root,repo,only:[id],digest:plan.publicPlan.digest},github);assert.equal(again.operationId,out.operationId);assert.equal(writes(state).length,1);
 await assert.rejects(applyNames({root,repo:'acme/other',digest:plan.publicPlan.digest},github),/another repository/);
});
test('initial absent labels carry typed creation evidence and never fabricate rename history',async t=>{
 const {root,state,github}=await fixture(t,{labels:[]});const {publicPlan}=await previewNames({repo,only:[id]},github);
 const out=await applyNames({root,repo,only:[id],digest:publicPlan.digest},github);
 assert.equal(out.receipt.renames.length,0);assert.equal(out.receipt.creations[0].kind,'created');assert.equal('oldName' in out.receipt.creations[0],false);
 const options={id,repo,repositoryId:31,receipt:out.receipt,observation:{repo,repositoryId:31,complete:true,observedAt:new Date().toISOString(),labels:state.labels}};
 assert.equal(labelWriter(options),'plates:agent');
 assert.throws(()=>labelWriter({...options,observation:{...options.observation,labels:[]}}),/refused/);
 state.receipt=out.receipt;const later=await previewNames({repo,only:[id]},github);assert.equal(later.publicPlan.actions.length,0);
});
test('both labels or current-only without provenance refuse; stale digest sends no mutation',async t=>{
 const {root,state,github}=await fixture(t);const plan=await previewNames({repo,only:[id]},github);
 state.labels.push({id:8,name:'plates:agent'});const bad=await previewNames({repo,only:[id]},github);assert.ok(bad.publicPlan.problems.length);
 await assert.rejects(applyNames({root,repo,only:[id],digest:plan.publicPlan.digest},github),/changed|unresolved/);assert.equal(writes(state).length,0);
 state.labels.shift();assert.ok((await previewNames({repo,only:[id]},github)).publicPlan.problems.length);
});
test('secrets are never read; variables copy memory-only and retain old aliases',async t=>{
 const value='synthetic-private-variable',secret='NEVER-PRINT-SYNTHETIC';
 const {root,state,github}=await fixture(t,{variables:[{name:'KEEL_WEB_ORIGIN',value}],secrets:[{name:'KEEL_GITHUB_CLIENT_SECRET',value:secret}]});
 const {publicPlan}=await previewNames({repo,only:['web:KEEL_WEB_ORIGIN']},github);
 assert.ok(!JSON.stringify(publicPlan).includes(value));assert.ok(!JSON.stringify(publicPlan).includes(secret));assert.match(publicPlan.secrets[0].command,/gh secret set PLATES_GITHUB_CLIENT_SECRET -R acme\/anvils/);
 const out=await applyNames({root,repo,only:['web:KEEL_WEB_ORIGIN'],digest:publicPlan.digest},github);
 assert.deepEqual(state.variables,[{name:'KEEL_WEB_ORIGIN',value},{name:'PLATES_WEB_ORIGIN',value}]);
 assert.ok(!JSON.stringify(out).includes(value));const journal=await readFile(join(root,'.plates/name-transition/private',`${out.operationId}.json`),'utf8');assert.ok(!journal.includes(value));assert.ok(!journal.includes(secret));
 const later=await previewNames({repo,only:['web:KEEL_WEB_ORIGIN']},github);assert.equal(later.publicPlan.items.find(i=>i.kind==='repository-variable'&&i.row==='web:KEEL_WEB_ORIGIN').state,'retained-verified-alias');
 assert.ok(state.calls.filter(c=>c.path.includes('/secrets')).every(c=>c.method==='GET'&&/\/secrets\?/.test(c.path)));
});
test('source or destination variable change invalidates approval',async t=>{
 const {root,state,github}=await fixture(t,{variables:[{name:'KEEL_WEB_ORIGIN',value:'one'}]});const plan=await previewNames({repo,only:['web:KEEL_WEB_ORIGIN']},github);
 state.variables[0].value='two';await assert.rejects(applyNames({root,repo,only:['web:KEEL_WEB_ORIGIN'],digest:plan.publicPlan.digest},github),/changed/);assert.equal(writes(state).length,0);
});
test('lost create ID stays pending: recovery and repeated apply never re-POST',async t=>{
 const {root,state,github}=await fixture(t,{labels:[],loseCreate:true});const plan=await previewNames({repo,only:[id]},github);
 const first=await applyNames({root,repo,only:[id],digest:plan.publicPlan.digest},github);assert.equal(first.state,'pending');
 const file=join(root,'.plates/name-transition/private',`${first.operationId}.json`),before=await readFile(file,'utf8');
 const recovered=await recoverNames({root,operationId:first.operationId},github);assert.equal(recovered.state,'pending');assert.equal(recovered.receipt.creations.length,0);assert.equal(await readFile(file,'utf8'),before);
 await applyNames({root,repo,only:[id],digest:plan.publicPlan.digest},github);assert.equal(writes(state).length,1);
});
test('lost rename response recovers original ID and approved original plan resumes only never-attempted actions',async t=>{
 const {root,state,github}=await fixture(t,{loseRename:true,variables:[{name:'KEEL_WEB_ORIGIN',value:'one'}]});const only=[id,'web:KEEL_WEB_ORIGIN'];const plan=await previewNames({repo,only},github);
 const first=await applyNames({root,repo,only,digest:plan.publicPlan.digest},github);assert.equal(first.state,'pending');assert.equal(writes(state).length,1);
 const readback=await recoverNames({root,operationId:first.operationId},github);assert.equal(readback.actions[1].state,'prepared');assert.equal(writes(state).length,1);
 const recovered=await applyNames({root,repo,only,digest:plan.publicPlan.digest},github);assert.equal(recovered.actions[0].state,'verified');assert.equal(recovered.actions[1].state,'verified');assert.equal(recovered.state,'verified-awaiting-publication');assert.equal(writes(state).length,2);assert.equal(writes(state).filter(c=>c.method==='PATCH').length,1);
});
test('repository lock excludes concurrent approved writers',async t=>{
 const {root,state,github}=await fixture(t);const plan=await previewNames({repo,only:[id]},github);
 let release,entered;const enteredPromise=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 state.before=async request=>{if(request.method==='PATCH'){entered();await hold;}};
 const first=applyNames({root,repo,only:[id],digest:plan.publicPlan.digest},github);await enteredPromise;
 const second=await applyNames({root,repo,only:[id],digest:plan.publicPlan.digest},github);assert.equal(second.state,'pending');release();await first;assert.equal(writes(state).length,1);
});
test('journal unexpected fields, altered receipt and unsafe symlink refuse before public output',async t=>{
 const {root,github}=await fixture(t);const plan=await previewNames({repo,only:[id]},github);const out=await applyNames({root,repo,only:[id],digest:plan.publicPlan.digest},github);
 const file=join(root,'.plates/name-transition/private',`${out.operationId}.json`),text=await readFile(file,'utf8');
 for(const mutate of [j=>j.privateKey='secret',j=>j.actions[0].privateKey='secret',j=>j.receipt={version:2,privateKey:'secret'}]){const j=JSON.parse(text);mutate(j);await writeFile(file,JSON.stringify(j));await assert.rejects(recoverNames({root,operationId:out.operationId},github));}
 await rm(file);await symlink(join(root,'missing'),file);await assert.rejects(recoverNames({root,operationId:out.operationId},github),/Unsafe/);
});
test('bounded provider pages and denied access stay gaps',async t=>{
 await assert.rejects(namesPages(async()=>({status:200,data:Array.from({length:100},(_,i)=>({id:i}))}),'/repos/acme/anvils/labels'),/capped/);
 const {root}=await fixture(t);const out=await namesCommand({root,repo},{github:async()=>({status:403})});assert.equal(out.exitCode,1);assert.equal(out.data.projects[0].state,'unavailable');
});
test('strict CLI grammar and injected machine interface',async()=>{
 for(const args of [['--yes'],['--yes','--digest','a'.repeat(64)],['--repo','acme/a','--repo','acme/b'],['--verify','acme/a','--yes','--digest','a'.repeat(64)],['--machine','--repo','acme/a'],['--run','1'],['--morning-run','1'],['--verify','acme/a','--morning-run','0'],['--unknown']])assert.throws(()=>parseNamesArgs(args),{exitCode:2});
 assert.equal(parseNamesArgs(['--verify','acme/a','--morning-run','42'])['morning-run'],'42');
 const args=parseNamesArgs(['--machine','--recover','original']);let called;
 const out=await namesCommand({root:'/scratch',...args},{namesMachine:async options=>{called=options;return {data:{state:'pending'},text:'pending',exitCode:1};}});assert.equal(called.recover,'original');assert.equal(out.exitCode,1);
});
test('ordinary environment helper selects presence without value disclosure',()=>{
 for(const row of NAMES.filter(r=>r.environmentPolicy==='current-presence')){
  assert.equal(environmentValue(row.id,{[row.keel]:'old'}),'old');assert.equal(environmentValue(row.id,{[row.plates]:'new'}),'new');
  assert.equal(environmentValue(row.id,{[row.plates]:'',[row.keel]:'old'}),'');assert.equal(environmentValue(row.id,{[row.plates]:null,[row.keel]:'old'}),null);
  assert.equal(environmentValue(row.id,{[row.plates]:'new',[row.keel]:'old'}),'new');
 }
 assert.throws(()=>environmentValue('web:KEEL_WEB_ORIGIN',{}));assert.ok(!JSON.stringify(runtimeInventory({PLATES_GH:'sensitive-path'})).includes('sensitive-path'));
});

test('partial apply revalidates original source and scope before later prepared actions',async t=>{
 const {root,state,github}=await fixture(t,{loseRename:true,variables:[{name:'KEEL_WEB_ORIGIN',value:'one'}]});const only=[id,'web:KEEL_WEB_ORIGIN'];const plan=await previewNames({repo,only},github);
 const first=await applyNames({root,repo,only,digest:plan.publicPlan.digest},github);
 await assert.rejects(applyNames({root,repo,only:[id],digest:plan.publicPlan.digest},github),/scope/);
 const changed=async request=>request.path.endsWith('/commits/main')?{status:200,data:{sha:'b'.repeat(40)}}:github(request);
 await assert.rejects(applyNames({root,repo,only,digest:plan.publicPlan.digest},changed),/source revision changed/);
 assert.equal(writes(state).length,1);assert.equal((await recoverNames({root,operationId:first.operationId},github)).actions[1].state,'prepared');
});
test('a committed receipt with unexpected private fields refuses even variable-only selection',async t=>{
 const {github}=await fixture(t,{receipt:{version:2,repo,repositoryId:31,renames:[],creations:[],privateKey:'synthetic'}});
 await assert.rejects(previewNames({repo,only:['web:KEEL_WEB_ORIGIN']},github),/receipt/);
});
test('ordinary JSON flag parses without changing operation scope',()=>{
 assert.deepEqual(parseNamesArgs(['--repo',repo,'--json']),{repo,only:[]});
});


test('reference rows distinguish exact refs from declared prefixes',()=>{
 for(const row of NAMES.filter(r=>r.surface==='git ref'&&r.phase===125)){
  assert.equal(matchesReference(row,row.keel),true);
  assert.equal(matchesReference(row,row.keel+'suffix'),/[/-]$/.test(row.keel),row.id);
 }
});
test('human preview prints owner secret and Vercel commands plus coverage gaps',async t=>{
 const {root,github}=await fixture(t,{secrets:[{name:'KEEL_GITHUB_CLIENT_SECRET'}]});
 const out=await namesCommand({root,repo,only:[id]},{github});
 assert.match(out.text,/gh secret set PLATES_GITHUB_CLIENT_SECRET -R acme\/anvils/);
 assert.match(out.text,/vercel env add PLATES_WEB_ORIGIN/);
 assert.match(out.text,/Concurrency gap:/);assert.match(out.text,/Gap:/);
});


test('default preview includes every observed legacy label but does not create unknown latent labels',async t=>{
 const {github}=await fixture(t,{labels:[{id:7,name:'keel:owner'},{id:8,name:'keel:wait-for-review'}]});
 const {publicPlan}=await previewNames({repo},github);
 assert.deepEqual(publicPlan.actions.map(a=>a.row).sort(),['label:keel:owner','label:keel:wait-for-review']);
 assert.ok(publicPlan.actions.every(a=>a.kind==='rename'));
});


test('actual crashed writer retains attempted identity and approved resume finishes only prepared work',async t=>{
 const {root}=await fixture(t),remote=join(root,'remote.json');
 const moduleURL=new URL('../lib/names-actions.mjs',import.meta.url).href;
 const child=`import {createHash} from 'node:crypto';import {writeFileSync} from 'node:fs';import {previewNames,applyNames} from ${JSON.stringify(moduleURL)};
 const repo=${JSON.stringify(repo)},revision=${JSON.stringify(revision)},source=${source.toString()};
 const {state,github}=(${provider.toString()})({variables:[{name:'KEEL_WEB_ORIGIN',value:'one'}]});
 const api=async request=>{const answer=await github(request);if(request.method==='PATCH'){writeFileSync(${JSON.stringify(remote)},JSON.stringify({labels:state.labels,variables:state.variables}));process.exit(23);}return answer;};
 const only=${JSON.stringify([id,'web:KEEL_WEB_ORIGIN'])},plan=await previewNames({repo,only},api);
 writeFileSync(${JSON.stringify(join(root,'digest'))},plan.publicPlan.digest);
 await applyNames({root:${JSON.stringify(root)},repo,only,digest:plan.publicPlan.digest},api);`;
 const childResult=run(process.execPath,['--input-type=module','-e',child],{timeout:15000});
 assert.equal(childResult.status,23,childResult.stderr);
 const digest=await readFile(join(root,'digest'),'utf8'),{state,github}=provider(JSON.parse(await readFile(remote,'utf8')));
 const out=await applyNames({root,repo,only:[id,'web:KEEL_WEB_ORIGIN'],digest},github);
 assert.equal(out.state,'verified-awaiting-publication');assert.deepEqual(writes(state).map(c=>c.method),['POST']);assert.ok(writes(state)[0].path.endsWith('/actions/variables'));
});


test('branch inventory uses paginated branches, includes later pages and validates exact identities',async t=>{
 const rows=Array.from({length:100},(_,i)=>({name:`feature-${i}`,commit:{sha:revision}}));
 rows.push({name:'keel-night/2026-10-24',commit:{sha:revision}});
 const pages=[]; const base=provider();
 const github=async request=>{
  if(request.path.includes('/branches?')){assert.equal(request.method,'GET');const url=new URL(request.path,'https://api.github.test');assert.equal(url.searchParams.get('per_page'),'100');const page=Number(url.searchParams.get('page'));pages.push(page);return {status:200,data:rows.slice((page-1)*100,page*100)};}
  return base.github(request);
 };
 assert.equal((await namesBranches(github,repo)).length,101);assert.deepEqual(pages,[1,2]);pages.length=0;
 const {root}=await fixture(t);const result=await namesCommand({root,repo,env:{}}, {github});
 assert.deepEqual(pages,[1,2]);assert.ok(result.data.projects[0].live.some(r=>r.kind==='branch'&&r.name==='keel-night/2026-10-24'));assert.ok(!result.data.projects[0].gaps.includes('branch inventory incomplete'));
 for(const bad of [{name:'okay',commit:{}},{name:'bad\nname',commit:{sha:revision}},{name:null,commit:{sha:revision}}])await assert.rejects(namesBranches(async()=>({status:200,data:[bad]}),repo),/identities invalid/);
 await assert.rejects(namesBranches(async()=>({status:200,data:[rows[0],rows[0]]}),repo),/identities invalid/);
});


test('process aliases do not authorize provider configuration without pinned workflow bindings',async t=>{
 const {root,github,state}=await fixture(t,{variables:[{name:'KEEL_GH',value:'synthetic'}],secrets:[{name:'KEEL_SESSION_ENCRYPTION_KEY'}]});
 const {publicPlan}=await previewNames({repo},github);assert.ok(!publicPlan.actions.some(a=>a.row==='variable:KEEL_GH'));assert.equal(publicPlan.secrets.length,0);
 const explicit=await previewNames({repo,only:['variable:KEEL_GH']},github);assert.match(explicit.publicPlan.problems.join(' '),/no pinned provider binding/);await assert.rejects(applyNames({root,repo,only:['variable:KEEL_GH'],digest:explicit.publicPlan.digest},github));assert.equal(writes(state).length,0);
 state.workflow='env: { TOOL: "${{ vars.KEEL_GH }}" }';const bound=await previewNames({repo,only:['variable:KEEL_GH']},github);assert.deepEqual(bound.publicPlan.actions.map(a=>a.row),['variable:KEEL_GH']);
 state.workflow='env: { TOOL: "${{ vars[inputs.selected] }}" }';const dynamic=await previewNames({repo},github);assert.ok(dynamic.publicPlan.providerScope.gaps.includes('dynamic-provider-binding-unclassified'));assert.ok(!dynamic.publicPlan.actions.some(a=>a.kind==='variable'));
});


test('exact identity bindings reject conflicts without disclosure and scrub only selected families',()=>{
 const identities=NAMES.filter(r=>r.environmentPolicy==='identity-conflict');
 assert.equal(identities.length,9);
 for(const row of identities){
  assert.equal(identityEnvironmentValue(row.id,{[row.keel]:'legacy-only'}),'legacy-only');
  assert.equal(identityEnvironmentValue(row.id,{[row.plates]:'current-only'}),'current-only');
  assert.equal(identityEnvironmentValue(row.id,{[row.plates]:'same',[row.keel]:'same'}),'same');
  assert.equal(identityEnvironmentValue(row.id,{}),undefined);
  assert.equal(identityEnvironmentValue(row.id,{[row.plates]:''}), '');
  for(const current of ['private-current','',null]) assert.throws(()=>identityEnvironmentValue(row.id,{[row.plates]:current,[row.keel]:'private-legacy'}),error=>error.code==='conflicting_names'&&!error.message.includes('private-')&&error.message.includes(row.plates)&&error.message.includes(row.keel));
  assert.throws(()=>environmentValue(row.id,{}));
  const original={[row.plates]:'current',[row.keel]:'legacy',ACME_UNKNOWN:'keep'};
  assert.deepEqual(scrubEnvironment([row.id],original),{ACME_UNKNOWN:'keep'});
  assert.equal(original[row.keel],'legacy');
 }
 assert.throws(()=>identityEnvironmentValue('variable:KEEL_GH',{}));
 assert.throws(()=>scrubEnvironment(['unknown'],{}));
 assert.equal(NAMES.filter(r=>r.environmentPolicy==='current-presence').length,28);
 const expanded=NAMES.filter(r=>r.environmentPolicy&&r.providerScope==='unestablished');
 assert.equal(expanded.length,32);
 const inventory=runtimeInventory({KEEL_PROVIDER:'private-legacy',PLATES_PROVIDER:'private-current'});
 assert.equal(inventory.find(r=>r.row==='variable:KEEL_PROVIDER').conflicting,true);
 assert.ok(!JSON.stringify(inventory).includes('private-'));
});


test('Loop installs the canonical names runtime without enabling night or duplicating its target',async()=>{
 const {load,targets}=await import('../lib/practices.mjs');
 const practices=await load();
 const config={name:'Acme',repo:'acme/anvils',practices:['base','agents-md','loop']};
 const files=targets(config,practices),names=files.filter(f=>f.path==='scripts/plates/names.mjs');
 assert.equal(names.length,1);assert.equal(names[0].practice,'night');assert.equal(names[0].runtimeImport,true);
 assert.equal(names[0].template,await readFile(new URL('../practices/night/files/scripts/plates/names.mjs',import.meta.url),'utf8'));
 assert.ok(!files.some(f=>f.path==='.github/workflows/plates-night.yml'));
 const night=practices.get('night');
 const enabled=new Set(config.practices);
 function include(name){enabled.add(name);for(const dep of practices.get(name).requires)if(!enabled.has(dep))include(dep);}
 include(night.name);
 assert.equal(targets({...config,practices:[...enabled]},practices).filter(f=>f.path==='scripts/plates/names.mjs').length,1);
});


test('provider discovery rejects comments and expression literals as binding authority',async t=>{
 for(const workflow of [
  '# ${{ vars.KEEL_GH }}\nenv: {}\n',
  'env: {} # ${{ vars.KEEL_GH }}\n',
  "env:\n  MESSAGE: ${{ 'vars.KEEL_GH' }}\n",
  "env:\n  MESSAGE: ${{ 'vars[''KEEL_GH'']' }}\n",
  '# ${{ vars.KEEL_CACHE }}\nenv: {}\n',
  "env:\n  MESSAGE: ${{ 'vars.KEEL_CACHE' }}\n",
 ]){
  const {root,state,github}=await fixture(t,{workflow,variables:[{name:'KEEL_GH',value:'private-tool'},{name:'KEEL_CACHE',value:'private-cache'}]});
  const preview=await previewNames({repo,only:['variable:KEEL_GH']},github);
  assert.deepEqual(preview.publicPlan.providerScope.variables,[]);
  assert.ok(preview.publicPlan.problems.length);
  await assert.rejects(applyNames({root,repo,only:['variable:KEEL_GH'],digest:preview.publicPlan.digest},github));
  assert.equal(writes(state).length,0);
 }
 const {root,state,github}=await fixture(t,{workflow:'env: { TOOL: "${{ vars[inputs.selected] }}" }'});
 const preview=await previewNames({repo},github);
 assert.match(preview.publicPlan.problems.join(' '),/Provider scope incomplete/);
 await assert.rejects(applyNames({root,repo,digest:preview.publicPlan.digest},github));
 assert.equal(writes(state).length,0);
 state.workflow="env:\n  TOOL: ${{ vars['KEEL_GH'] }}\n";
 assert.deepEqual((await previewNames({repo},github)).publicPlan.providerScope.variables,['variable:KEEL_GH']);
});


test('publisher bootstrap selects exact aliases before checking all fetched bytes without executing them',async t=>{
 const {shapeCrossReview}=await import('../lib/practices.mjs');
 const template=await readFile(new URL('../practices/cross-review/files/.github/workflows/plates-cross-review.yml',import.meta.url),'utf8');
 const rendered=shapeCrossReview(template,{});
 const match=/node -e '\n(            const fs = require\("fs"\), \{ createHash \}[\s\S]*?)\n          ' "\$out\/cross-review/.exec(rendered);
 assert.ok(match);const program=match[1];
 assert.ok(!/import\(/.test(program));
 const root=await mkdtemp(join(tmpdir(),'acme-publisher-names-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const files=[];for(const name of ['cross','lib','names']){const path=join(root,name+'.mjs');await writeFile(path,'throw new Error("must not execute");\n');files.push(path);}
 const pin=(await Promise.all(files.map(f=>readFile(f)))).map(b=>createHash('sha256').update(b).digest('hex')).join(' ');
 for(const env of [{PLATES_PUBLISHER:pin},{KEEL_PUBLISHER:pin},{PLATES_PUBLISHER:pin,KEEL_PUBLISHER:pin}])assert.equal(run(process.execPath,['-e',program,...files],{env}).status,0);
 for(const env of [{PLATES_PUBLISHER:'',KEEL_PUBLISHER:pin},{PLATES_PUBLISHER:'private-current',KEEL_PUBLISHER:'private-legacy'},{PLATES_PUBLISHER:'not-a-pin'},{}]){
  const out=run(process.execPath,['-e',program,...files],{env});assert.notEqual(out.status,0);assert.ok(!out.stderr.includes('private-current'));assert.ok(!out.stderr.includes('private-legacy'));
 }
 await writeFile(files[2],'changed bytes');assert.notEqual(run(process.execPath,['-e',program,...files],{env:{KEEL_PUBLISHER:pin}}).status,0);
});
