// Synthetic packed Acme CLI world. Production JS is copied unchanged; only
// curated fixture data and external transport processes are synthetic.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { run, cleanEnv } from './run.mjs';
import { manifestFor, bundle, ref } from './evaluation-input-partition.mjs';
import { sealRecord, byteDigest } from '../../lib/evaluation-records.mjs';
const source = resolve(import.meta.dirname, '../..');
export const PRIVATE = 'Acme-private-oracle-canary';
export const KEY = 'acme-synthetic-cli-credential-only';
export const model = { requested: 'acme-alias', resolved: 'acme-resolved' };
const probe = `// Acme private provenance canary\nconst fs=require('node:fs');const correct=fs.readFileSync('/work/acme.txt','utf8')==='Acme repaired\\n';const input=fs.readFileSync(0,'utf8');console.log(correct&&input==='${PRIVATE}'?'${PRIVATE}':'Acme rejected');`;
const header = '// Acme private provenance canary\n';
const load = (app, path) => import(pathToFileURL(join(app, 'lib', path)));
async function temporary(t, prefix) { const root = await realpath(await mkdtemp(join(tmpdir(), prefix))); t.after(() => rm(root, {recursive:true,force:true})); return root; }
export async function installLiveCli(t) {
  const root = await temporary(t, 'acme-installed-live-'), stage = join(root,'stage'), repository = join(root,'repository');
  await mkdir(stage); await mkdir(join(repository,'.plates'),{recursive:true});
  await writeFile(join(repository,'acme.txt'),'Acme original\n');
  await writeFile(join(repository,'.plates/plates.json'),JSON.stringify({repo:'Acme/widget'}));
  const git = args => { const r=run('git',['-C',repository,...args]); assert.equal(r.status,0,r.stderr); return r.stdout.trim(); };
  git(['init','-q']);git(['add','.']);git(['commit','-qm','Acme synthetic source']);git(['remote','add','origin','https://github.com/Acme/widget.git']);
  const revision=git(['rev-parse','HEAD']), blob=git(['rev-parse','HEAD:acme.txt']);
  const pkg=JSON.parse(await readFile(join(source,'package.json')));
  // Exclude the real corpus before traversing/copying it. No private answers
  // are used by this synthetic integration proof.
  for(const name of ['package.json','bin','lib','api','vercel.json','practices','scripts/plates','docs/lessons.md','migrations','tests/fixtures/improve','.plates/plates.json','WHATSNEW.md','NOTICE']) {
    await mkdir(dirname(join(stage,name)),{recursive:true});
    await cp(join(source,name),join(stage,name),{recursive:true,filter:p=>p!==join(source,'lib/evaluation-corpus')});
  }
  const corpusRoot=join(stage,'lib/evaluation-corpus');await mkdir(join(corpusRoot,'probes'),{recursive:true});await mkdir(join(corpusRoot,'private'));
  const provenance=await readFile(join(stage,'lib/evaluation-provenance.mjs'),'utf8');
  const paths=[...provenance.matchAll(/'evaluation-corpus\/(probes\/[^']+|private\/[^']+)'/g)].map(m=>m[1]);
  for(const path of paths) await writeFile(join(corpusRoot,path),path.endsWith('.mjs')?probe:path.endsWith('.json')?'{}':'Acme synthetic support');
  await writeFile(join(corpusRoot,'private/acme.json'),PRIVATE);
  const names=['package-entry.mjs','canvas-retirement.mjs','consumer-options.mjs','coordinator-guidance.mjs','rename-ownership.mjs','workspace-command-doc.mjs'];
  const catalog={schemaVersion:1,createdAt:'2026-10-23T00:00:00.000Z',repository:'Acme/widget',license:'Apache-2.0',image:'sha256:'+'a'.repeat(64),platform:'linux/arm64',
    cases:names.map((name,i)=>({id:i===0?'acme-control':i===1?'acme-target':`acme-unused-${i}`,version:1,taskClass:i===0?'control':'compatibility',start:revision,fix:'b'.repeat(40),
      sources:[{path:'acme.txt',blob,sha256:byteDigest('Acme original\n'),bytes:14}],writable:['acme.txt'],brief:'Repair Acme text',requirements:['Write Acme repaired followed by a newline.'],probe:name,support:[],acceptanceInput:'acme.json',stdout:PRIVATE+'\n',coverageLimits:[],closure:'Acme synthetic machinery'})),
    probeHeaders:Object.fromEntries(names.map(n=>[n,header]))};
  const catalogBytes=JSON.stringify(catalog);await writeFile(join(corpusRoot,'catalog.json'),catalogBytes);
  const corpus=await load(stage,'evaluation-corpus.mjs'), definitions=await Promise.all(['acme-control','acme-target'].map(id=>corpus.corpusDefinition(id)));
  await writeFile(join(corpusRoot,'input-classification-v1.json'),JSON.stringify(manifestFor(definitions,byteDigest(catalogBytes))));
  const env=cleanEnv({...process.env,npm_config_cache:join(root,'npm-cache'),npm_config_userconfig:join(root,'npmrc'),npm_config_offline:'true'});
  await writeFile(env.npm_config_userconfig,'');
  const packed=run('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',root],{cwd:stage,env,timeout:60000});assert.equal(packed.status,0,packed.stderr);
  const [{filename,files}]=JSON.parse(packed.stdout);assert.ok(files.some(f=>f.path==='lib/evaluation-live.mjs'));
  const consumer=join(root,'consumer'),installed=run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--prefix',consumer,join(root,filename)],{env,timeout:60000});assert.equal(installed.status,0,installed.stderr);
  const app=join(consumer,'node_modules',pkg.name);
  for(const f of files.filter(f=>f.path.endsWith('.mjs'))) assert.equal(byteDigest(await readFile(join(app,f.path))),byteDigest(await readFile(join(stage,f.path))),f.path+' installed exact bytes');
  const b=bundle(definitions);
  b.cases=b.cases.map(c=>sealRecord({...c,limits:{...c.limits,currencyUsd:1}}));
  b.configurations=b.configurations.map(c=>sealRecord({...c,provider:'openai',routing:{...c.routing,provider:'openai'},model:{...model,unresolvedReason:null},runtime:{name:'single-generation-container-v1',version:'1.0.0',settings:{temperature:null,maxTokens:1000}},policy:{...c.policy,execution:'host-gateway-v1'},environments:[...b.cases].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>({case:ref(c),environment:c.environment}))}));
  b.comparison=sealRecord({...b.comparison,baseline:ref(b.configurations[0]),candidate:ref(b.configurations[1]),cases:b.cases.map(ref),pairs:b.comparison.pairs.map(p=>({...p,case:ref(b.cases.find(c=>c.id===p.case.id))})),allowance:{minutes:1000,currencyUsd:20},retention:{days:30,maxBytes:67108864,maxEvents:20000}});
  return {root,app,repository,b};
}
// Count includes durable receipt/spend I/O, not only the synthetic fetch. Keep
// generous authored slack inside the unchanged two-minute case ceiling.
export const COUNT_TIMEOUT_MS = 20000;
export async function liveCliWorld(t, installation, scenario='success', {countTimeoutMs=COUNT_TIMEOUT_MS, writeStallMs=0}={}) {
  assert.ok(Number.isInteger(countTimeoutMs)&&countTimeoutMs>0&&countTimeoutMs<=COUNT_TIMEOUT_MS);
  assert.ok(Number.isInteger(writeStallMs)&&writeStallMs>=0&&writeStallMs<=5500);
  const root=await temporary(t,'acme-live-cli-world-'), {app,repository,b}=installation, bin=join(root,'bin');await mkdir(bin);
  const log=join(root,'events.jsonl'), preload=join(root,'preload.mjs'), bootstrap=join(root,'pipe.py');
  const {LIVE_BUILDER_BRIDGE}=await load(app,'evaluation-docker.mjs');
  await writeFile(join(bin,'docker'),dockerSource(root,log,LIVE_BUILDER_BRIDGE.digest),{mode:0o700});
  await writeFile(preload,fetchSource(log,scenario,writeStallMs));
  await writeFile(bootstrap,`import os,subprocess,sys\nr,w=os.pipe()\nos.dup2(r,50,inheritable=True)\np=subprocess.Popen(sys.argv[1:],pass_fds=(50,))\nos.close(r);os.close(50)\ntry:\n os.write(w,${JSON.stringify(JSON.stringify({schemaVersion:1,ref:'acme-key',generation:1,key:KEY}))}.encode())\nexcept BrokenPipeError: pass\nfinally: os.close(w)\ntry: sys.exit(p.wait(timeout=90))\nexcept subprocess.TimeoutExpired:\n p.kill();p.wait();sys.exit(124)\n`);
  const allowed=Object.fromEntries(Object.entries(cleanEnv()).filter(([k])=> /^(PATH|TMPDIR|GIT_|PLATES_CI_OFFLINE|PLATES_MILESTONES_OFFLINE)/.test(k)));
  const env={...allowed,HOME:root,PATH:bin+':'+process.env.PATH};
  const cli=(args,{credential=false}={})=>{
    const argv=['--import',preload,join(app,'bin/plates.mjs'),...args,'--json'];
    const result=credential?run('python3',[bootstrap,process.execPath,...argv],{env,cwd:repository,timeout:95000}):run(process.execPath,argv,{env,cwd:repository,timeout:95000});
    assert.equal((result.stdout+result.stderr).includes(KEY),false,'credential excluded from CLI output');return result;
  };
  const json=(result,code=0)=>{assert.equal(result.status,code,result.stdout+'\n'+result.stderr);return JSON.parse(result.stdout);};
  const inputs=join(root,'inputs');await mkdir(inputs,{mode:0o700});
  const manifest=join(inputs,'workspace.json'),managed=join(inputs,'managed.json'),bundlePath=join(inputs,'bundle.json'),state=join(root,'state');
  await writeFile(manifest,JSON.stringify({version:1,id:'acme',name:'Acme',repo:'Acme/private',projects:[{id:'widget',repo:'Acme/widget'}]}));
  await writeFile(managed,JSON.stringify([{repo:'Acme/widget',role:'managed'}]));await writeFile(bundlePath,JSON.stringify(b));
  json(cli(['workspace','init','--manifest',manifest,'--state',state,'--yes']));
  const base=['retro','evaluations'],flags=['--manifest',manifest,'--state',state];
  const frozen=json(cli([...base,'freeze',...flags,'--bundle',bundlePath]),3);const applied=json(cli([...base,'freeze',...flags,'--bundle',bundlePath,'--yes','--digest',frozen.digest]));
  const plan=applied.receipt.plan, experiment=b.comparison.id, dir=join(state,'session-trials',experiment);
  const pairId=b.comparison.pairs[0].id,arm='baseline',slot=pairId+'-'+arm;
  const corpus=await load(app,'evaluation-corpus.mjs'),partition=await load(app,'evaluation-input-partition.mjs'),packetApi=await load(app,'evaluation-public-packet.mjs');
  const handle=await corpus.prepareCorpusInputPartition({plan,caseRef:ref(b.cases[0]),configurationRef:ref(b.configurations[0]),repository,sourcePaths:['acme.txt']});
  const packet=packetApi.preparePublicPacket({view:partition.publicInputView(handle),model}),controller=await(await load(app,'evaluation-provenance.mjs')).controllerIdentity();
  const scope={organization:'org-acme',project:'proj-acme'},unit={microUsd:1,units:1},zero={microUsd:0,units:1};
  const live={provider:'openai',credential:{ref:'acme-key',generation:1},scope,model,serviceTier:'default',retention:{store:true},priceEvidence:{schemaVersion:1,sourceHash:'c'.repeat(64),observedAt:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString(),model:model.resolved,serviceTier:'default',scope,rates:{count:{inputTokens:zero,outputTokens:zero,requests:unit},generation:{inputTokens:unit,outputTokens:unit,requests:unit},recovery:{inputTokens:zero,outputTokens:zero,requests:unit}}}};
  const common={schemaVersion:2,planDigest:plan.digest,pairId,arm,repository,sourcePaths:['acme.txt'],admission:{stateDir:join(root,'budget'),manifest:managed,capacity:1,weight:1,repo:'Acme/widget'},live,
    packet:{format:packet.templateVersion,templateDigest:packet.templateDigest,packetDigest:packet.packetDigest,responseFormat:packet.responseFormat,converterVersion:packet.converterVersion,controllerDigest:controller.digest,bridgeDigest:LIVE_BUILDER_BRIDGE.digest}};
  const write=async(name,value)=>{const path=join(root,name+'.json');await writeFile(path,JSON.stringify(value));return path;};
  const inspect=()=>json(cli([...base,'inspect',...flags,'--experiment',experiment]));
  const count=await write('count',{...common,stage:'count',billing:{schemaVersion:1,basis:'fixed-request-v1'},limits:{timeoutMs:countTimeoutMs,maxCountedInputTokens:1000}});
  const call=(action,path,extra=[],credential=false)=>cli([...base,action,...flags,'--experiment',experiment,'--execution',path,...extra],{credential});
  const approve=(action,path,preview,credential=true)=>json(call(action,path,['--yes','--digest',preview.digest,...(credential?['--credential-fd','50']:[])],credential));
  const receipt=async path=>JSON.parse(await readFile(join(dir,path),'utf8'));
  const events=async()=>{try{return(await readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code==='ENOENT')return [];throw e;}};
  const generation=async()=>{const r=await receipt(`execution/preparations/${slot}/count-result.json`);return write('generation',{...common,stage:'generation',count:{operationId:r.operationId,resultDigest:r.digest},limits:{timeoutMs:1000,maxOutputTokens:1000}});};
  const compare=()=>json(cli([...base,'compare',...flags,'--experiment',experiment]));
  const occupyHost=async()=>{
    const budget=await load(app,'validation-budget.mjs'),provider=await load(app,'evaluation-provider.mjs');
    const {stateDir,capacity,weight,repo}=common.admission;
    const target=await budget.inspectBudgetTarget({manifest:managed,root:repository,repo});
    const operationId='acme-busy-local-request',deadline=()=>Date.now()+60000;
    const lease=await budget.reserveRequestBudget({stateDir,capacity,weight,target,id:'e'.repeat(32),commandDigest:'f'.repeat(64),operationId,requestKind:'count',deadline:deadline()});
    let released=false;
    const release=async()=>{
      if(released)return;
      // Validation refusal supplies an actual opaque not-started witness. This
      // fixture request never has credentials or dispatches a provider call.
      let calls=0;
      const adapter=provider.createEvaluationProvider({fetcher:async()=>{calls++;throw Error('Acme forbidden busy-host transport');},timeoutMs:1000});
      const request=adapter.beginEvaluationRequest({operationId,operation:'count',input:{},timeoutMs:1000});
      await request.result.catch(()=>{});
      const completion=await request.localCompletion;
      const receipt=await budget.settleRequestBudget({stateDir,capacity,lease,completion,deadline:deadline()});
      assert.equal(calls,0);assert.equal(receipt.released,true);assert.equal(receipt.observation.state,'not-started');released=true;
    };
    return {lease,release,inspect:()=>budget.inspectBudget({stateDir,capacity})};
  };
  return {root,dir,cli,json,call,approve,receipt,events,write,count,generation,live,plan,pairId,arm,slot,log,inspect,compare,occupyHost};
}
function fetchSource(log,scenario,writeStallMs) { return `import {appendFileSync,constants} from 'node:fs';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
// Test-only asynchronous I/O stall. Clocks/timers and production deadlines stay
// real and unchanged; only the first durable count intent write is delayed.
const writeStallMs=${writeStallMs}, originalOpen=fs.open;let stalled=false;
if(writeStallMs) {
 fs.open=async(...args)=>{
  const handle=await originalOpen(...args);
  if(!stalled&&String(args[0]).endsWith('/count-intent.json')&&(args[1]&constants.O_CREAT)) {
   stalled=true;const write=handle.writeFile.bind(handle);
   handle.writeFile=async(...values)=>{
    appendFileSync(${JSON.stringify(log)},JSON.stringify({event:'count-write-stall',milliseconds:writeStallMs})+'\\n');
    await new Promise(resolve=>setTimeout(resolve,writeStallMs));
    const result=await write(...values);
    appendFileSync(${JSON.stringify(log)},JSON.stringify({event:'count-write-resumed'})+'\\n');return result;
   };
  }
  return handle;
 };
 syncBuiltinESMExports();
}
const log=${JSON.stringify(log)},scenario=${JSON.stringify(scenario)};
globalThis.fetch=async(url,options)=>{
 const count=url==='https://api.openai.com/v1/responses/input_tokens',start=url==='https://api.openai.com/v1/responses',get=url==='https://api.openai.com/v1/responses/resp_acme';
 if(!count&&!start&&!get)throw Error('Acme unexpected transport');
 appendFileSync(log,JSON.stringify({event:'provider',url,method:options.method,body:options.body?JSON.parse(options.body):null,credentialMatches:options.headers.Authorization==='Bearer ${KEY}'})+'\\n');
 if(count&&scenario==='count-uncertain')return await new Promise(()=>{});
 if(count&&scenario==='count-closed')throw Error('Acme synthetic transport uncertainty');
 if(start&&scenario==='no-id')throw Error('Acme synthetic transport uncertainty');
 if(count)return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:100}));
 const pending=start&&scenario==='pending';
 const text=JSON.stringify({schemaVersion:1,format:'utf8-file-replacements-v1',files:[{path:'acme.txt',mode:'100644',content:scenario==='wrong'?'Acme wrong\\n':'Acme repaired\\n'}]});
 return new Response(JSON.stringify({object:'response',id:'resp_acme',model:'acme-resolved',service_tier:'default',status:pending?'in_progress':'completed',created_at:Math.floor(Date.now()/1000),output:pending?[]:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}],usage:pending?null:{input_tokens:100,output_tokens:30,total_tokens:130}}));
};`; }
function dockerSource(root,log,bridgeDigest) { return `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),{Readable}=require('node:stream');
const root=${JSON.stringify(root)},log=${JSON.stringify(log)},args=process.argv.slice(2),code=args[args.indexOf('-e')+1];
const note=(event,extra={})=>fs.appendFileSync(log,JSON.stringify({event,...extra})+'\\n');
let name=args[0]==='create'?args[args.indexOf('--name')+1]:args.find(x=>/^plates-eval-/.test(x));
const requestedId=args.find(x=>/^[a-f0-9]{64}$/.test(x));
if(!name&&requestedId)name=fs.readFileSync(path.join(root,'container-'+requestedId+'.name'),'utf8');
const statePath=name&&path.join(root,name+'.json'),work=name&&path.join(root,name);
let state=statePath&&fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):null;
const save=()=>fs.writeFileSync(statePath,JSON.stringify(state));
const input=fn=>{const chunks=[];process.stdin.on('data',b=>chunks.push(b));process.stdin.on('end',()=>fn(Buffer.concat(chunks)));};
if(Object.values(process.env).some(v=>v.includes(${JSON.stringify(KEY)}))||args.some(v=>v.includes(${JSON.stringify(KEY)})))process.exit(99);
if(args[0]==='image')console.log(JSON.stringify([{Id:'sha256:'+'a'.repeat(64),Os:'linux',Architecture:'arm64',Config:{Env:['NODE_VERSION=24.22.1']}}]));
else if(args[0]==='create'){
 if(args[args.indexOf('--network')+1]!=='none'||!args.includes('--read-only')||args[args.indexOf('--pull')+1]!=='never'||args.some(x=>['--mount','--volume','-v','--privileged'].includes(x)))process.exit(98);
 fs.mkdirSync(work);state={Id:crypto.createHash('sha256').update(name).digest('hex'),Name:'/'+name,Image:'sha256:'+'a'.repeat(64),State:{Running:false,Paused:false}};save();fs.writeFileSync(path.join(root,'container-'+state.Id+'.name'),name);note('create',{name});console.log(state.Id);
}else if(args[0]==='start'){state.State.Running=true;save();}
else if(args[0]==='kill'){state.State.Running=false;save();note('kill',{name});}
else if(args[0]==='inspect'){if(!state)process.exit(1);console.log(args.includes('{{json .}}')?JSON.stringify(state):String(state.State.Running));}
else if(args[0]==='exec'&&args.includes('--version'))console.log('v24.22.1');
else if(args[0]==='exec'&&code==='console.log(Date.now())')console.log(Date.now());
else if(args[0]==='exec'&&code?.startsWith("const fs=require('node:fs'),p=require('node:path');"))input(bytes=>{
 const files=JSON.parse(bytes);for(const f of files){const p=path.join(work,f.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,Buffer.from(f.base64,'base64'),{flag:'wx',mode:f.mode==='100755'?493:420});}
 note('populate',{name,files});
});
else if(args[0]==='exec'&&typeof code==='string'&&crypto.createHash('sha256').update(code).digest('hex')===${JSON.stringify(bridgeDigest)})input(bytes=>{
 const mode=args.at(-1);note(mode,{name});process.chdir(work);
 const fake=Object.create(process);Object.defineProperties(fake,{stdin:{value:Readable.from([bytes])},argv:{value:['node',mode]},exitCode:{get:()=>process.exitCode,set:v=>process.exitCode=v}});
 vm.runInNewContext(code.replace("root === '/work'",'root === '+JSON.stringify(work)),{require,process:fake,Buffer,TextDecoder});
});
else if(args[0]==='exec'&&args.at(-1).startsWith('/work/probes/'))input(bytes=>{
 const probePath=path.join(work,args.at(-1).slice(6)),actual=fs.readFileSync(probePath,'utf8');
 // Run the protected, authored synthetic oracle. Generated acme.txt is data;
 // neither model text nor repository code is evaluated on the host.
 if(actual!==${JSON.stringify('// Protected Acme behavior probe. Curator retains source provenance; Apache-2.0.\n'+probe.slice(header.length))})throw Error('Acme unexpected evaluator');
 const readFileSync=(p,encoding)=>p===0?bytes.toString():fs.readFileSync(path.join(work,p.slice(6)),encoding);
 note('oracle',{name});vm.runInNewContext(actual,{require:n=>{if(n!=='node:fs')throw Error('Acme unexpected import');return{readFileSync};},console});
});
else {note('unexpected-command',{args});process.exitCode=96;}
`; }
