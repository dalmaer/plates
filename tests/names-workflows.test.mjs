import {fill} from '../lib/practices.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {run} from './helpers/run.mjs';
import {runBlocks,shellProblems} from './helpers/workflows.mjs';
import {NAMES_OBSERVATION_LOADER} from '../lib/names-verify.mjs';
const ROOT=resolve(import.meta.dirname,'..');
const canonical=name=>join(ROOT,'practices/night/files/.github/workflows',`plates-${name}.yml`);
const block=async(name,step)=>runBlocks(await readFile(canonical(name),'utf8')).find(b=>b.step===step)?.script??assert.fail(`missing ${step}`);
async function scratch(t){const root=await mkdtemp(join(tmpdir(),'plates-names-workflow-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'temp'));return root;}

for(const kind of ['night','morning'])for(const operation of ['edit','create','lost-create-id','failed-create'])test(`${kind} actual publication shell observes ${operation} without replay and excludes private prose`,async t=>{
 const root=await scratch(t),temp=join(root,'temp'),gh=join(root,'gh');
 const source=await block(kind,kind==='night'?"Open the night's pull request":"Open the night's final pull request");
 const start=source.indexOf('names_publication() {');assert.ok(start>=0);
 // The actual publication block is the tail of each owning workflow step.
 const script=source.slice(start);
 await writeFile(join(temp,'body.md'),'Acme private prose\n<!-- plates:health-report:begin -->\n');
 await writeFile(join(temp,'names-loader.mjs'),NAMES_OBSERVATION_LOADER);
 const branch=`keel-night/2026-10-24${kind==='morning'?'-final':''}`;
 const state={number:7,id:70,base:{repo:{id:10}},head:{ref:branch,sha:'a'.repeat(40)},body:'Acme prior prose',labels:[],updated_at:'2026-10-24T10:00:00Z'};
 await writeFile(join(root,'state.json'),JSON.stringify(state));await writeFile(join(root,'calls.json'),'[]');
 await writeFile(gh,`#!${process.execPath}
import{readFileSync,writeFileSync}from'node:fs';
const root=process.env.ACME_ROOT,args=process.argv.slice(2),calls=JSON.parse(readFileSync(root+'/calls.json'));
calls.push(args);writeFileSync(root+'/calls.json',JSON.stringify(calls));
const state=JSON.parse(readFileSync(root+'/state.json')),mode=process.env.ACME_MODE;
if(args[0]==='api'){process.stdout.write('HTTP/2 200 OK\\nContent-Type: application/json\\n\\n'+JSON.stringify(state));}
else if(args[0]==='pr'&&args[1]==='list'){if(mode==='edit')console.log('7');}
else if(args[0]==='pr'&&['edit','create'].includes(args[1])){
 state.body=readFileSync(args[args.indexOf('--body-file')+1],'utf8');writeFileSync(root+'/state.json',JSON.stringify(state));
 if(mode==='failed-create'){console.log('Acme uncertain transport');process.exitCode=9;}
 else if(mode==='lost-create-id')console.log('Acme response had no object URL');
 else console.log('https://github.com/Acme/project/pull/7');
}else process.exitCode=99;
`);await chmod(gh,0o755);
 const env={...process.env,PATH:`${root}:${process.env.PATH}`,ACME_ROOT:root,ACME_MODE:operation,NAMES_EVIDENCE:'true',DAY:'2026-10-24',BASE:'main',BRANCH:branch,EXPECTED:'',RUNNER_TEMP:temp,GITHUB_WORKSPACE:root,GITHUB_REPOSITORY:'Acme/project',GITHUB_REPOSITORY_ID:'10',PLATES_NAMES_RUNTIME_ROOT:ROOT,PLATES_GH:gh};
 const result=run('bash',['-e','-o','pipefail','-c',script],{cwd:root,env});
 assert.equal(result.status,operation==='failed-create'?9:0,result.stderr);
 const output=JSON.parse(await readFile(join(temp,`names-${kind}-pr.json`),'utf8'));
 assert.equal(output.writes[0].outcome,['failed-create','lost-create-id'].includes(operation)?'attempted-unknown':'confirmed');
 assert.equal(output.association.branch,branch);
 assert.ok(!JSON.stringify(output).includes('Acme private prose'));
 assert.ok(!JSON.stringify(output).includes('Acme prior prose'));
 const calls=JSON.parse(await readFile(join(root,'calls.json'),'utf8'));
 assert.equal(calls.filter(a=>a[0]==='pr'&&['edit','create'].includes(a[1])).length,1);
 assert.ok(calls.filter(a=>a[0]==='api').every(a=>a.includes('GET')));
});

import {symlink,realpath} from 'node:fs/promises';
import {decodeNamesProducerTransfer} from '../lib/names-verify.mjs';

async function environment(t){
 const root=await scratch(t),real=await realpath(root),temp=join(real,'temp');
 return {root:real,temp,env:{...process.env,GITHUB_WORKSPACE:real,RUNNER_TEMP:temp,NAMES_SOURCE_SHA:'a'.repeat(40),GITHUB_ENV:join(temp,'env'),GITHUB_OUTPUT:join(temp,'output'),PLATES_NAMES_RUNTIME_ROOT:ROOT,PLATES_GH:join(real,'no-live-gh')}};
}
const shell=(script,e)=>run('bash',['-e','-o','pipefail','-c',script],{cwd:e.root,env:e.env});
for(const shape of ['valid','invalid-sha','workspace-collision','temp-collision','dangling-symlink'])test(`actual source preflight: ${shape}`,async t=>{
 const e=await environment(t);
 if(shape==='invalid-sha')e.env.NAMES_SOURCE_SHA='main';
 if(shape==='workspace-collision')await mkdir(join(e.root,'.plates-names-runtime'));
 if(shape==='temp-collision')await mkdir(join(e.temp,'plates-names-runtime'));
 if(shape==='dangling-symlink')await symlink(join(e.root,'absent'),join(e.root,'.plates-names-runtime'));
 const r=shell(await block('night','Validate observation source'),e);
 assert.equal(r.status,shape==='valid'?0:1,r.stderr);
});
for(const shape of ['valid','wrong-head','existing-destination'])test(`actual runtime move checks Git identity: ${shape}`,async t=>{
 const e=await environment(t),stage=join(e.root,'.plates-names-runtime');await mkdir(join(stage,'lib'),{recursive:true});
 await writeFile(join(stage,'lib/names-verify.mjs'),`export const NAMES_OBSERVATION_LOADER=${JSON.stringify(NAMES_OBSERVATION_LOADER)};\n`);
 for(const args of [['init','-q'],['add','.'],['commit','-qm','Acme source']]){const r=run('git',args,{cwd:stage});assert.equal(r.status,0,r.stderr);}
 e.env.NAMES_SOURCE_SHA=run('git',['rev-parse','HEAD'],{cwd:stage}).stdout.trim();
 if(shape==='wrong-head')e.env.NAMES_SOURCE_SHA='b'.repeat(40);
 if(shape==='existing-destination')await mkdir(join(e.temp,'plates-names-runtime'));
 const r=shell(await block('night','Prepare observation runtime'),e);
 assert.equal(r.status,shape==='valid'?0:1,r.stderr);
 if(shape==='valid'){
  assert.equal(await readFile(join(e.temp,'names-loader.mjs'),'utf8'),NAMES_OBSERVATION_LOADER);
  assert.equal(await readFile(e.env.GITHUB_ENV,'utf8'),`PLATES_NAMES_RUNTIME_ROOT=${e.temp}/plates-names-runtime\n`);
  assert.equal(run('git',['rev-parse','HEAD'],{cwd:join(e.temp,'plates-names-runtime')}).stdout.trim(),e.env.NAMES_SOURCE_SHA);
  await assert.rejects(readFile(join(stage,'lib/names-verify.mjs')),{code:'ENOENT'});
 }else assert.ok(await readFile(join(stage,'lib/names-verify.mjs')));
});

test('actual cross-job transfer preserves unavailable outcomes and manifest gaps',async t=>{
 const e=await environment(t),source=await block('morning','Transfer bounded producer observations');
 const r=shell(source,e);assert.equal(r.status,0,r.stderr);
 const lines=(await readFile(e.env.GITHUB_OUTPUT,'utf8')).trim().split('\n');assert.equal(lines.length,2);
 for(const line of lines){const encoded=line.slice(line.indexOf('=')+1),decoded=decodeNamesProducerTransfer(encoded);assert.ok(decoded.value.gaps.some(g=>g.code==='producer-output-unavailable'));assert.deepEqual(decoded.loadGaps,['runtime-load-manifest-missing']);assert.ok(encoded.length<=131072);}
});

// Execute the workflow's binding logic with a synthetic data-only provider boundary.
// Full real archive/source validation belongs to the core verifier integration tests.
for(const shape of ['valid','wrong-attempt','wrong-source','invalid-id'])test(`morning actual origin shell: ${shape}`,async t=>{
 const e=await environment(t),runtime=join(e.root,'runtime');await mkdir(join(runtime,'lib'),{recursive:true});
 e.env={...e.env,PLATES_NAMES_RUNTIME_ROOT:runtime,GITHUB_REPOSITORY:'Acme/project',GITHUB_REPOSITORY_ID:'10',NIGHT_RUN_ID:shape==='invalid-id'?'latest':'70',NIGHT_RUN_ATTEMPT:'2',ACME_SHAPE:shape};
 await writeFile(join(runtime,'lib/names-actions.mjs'),`export const namesGithub=()=>null;export async function namesRead(g,path){if(path!=='/repos/Acme/project/actions/runs/70/attempts/2')throw Error('wrong attempt GET');return {id:70,run_attempt:process.env.ACME_SHAPE==='wrong-attempt'?1:2,repository:{id:10},path:'.github/workflows/plates-night.yml',event:'workflow_dispatch',status:'completed',head_sha:'b'.repeat(40)}}`);
 await writeFile(join(runtime,'lib/names-verify.mjs'),`import{writeFile}from'node:fs/promises';export async function readObservationArtifact(g,repo,id,run,kind){if(repo!=='Acme/project'||id!==10||run.id!==70||kind!=='night')throw Error('wrong artifact binding');return {observation:{execution:{codeIdentity:{repository:{fullName:'dalmaer/plates'},commitSha:(process.env.ACME_SHAPE==='wrong-source'?'c':'a').repeat(40)}},association:{kind:'night',date:'2026-10-24',branch:'keel-night/2026-10-24'}},artifact:{id:90,digest:'sha256:'+ 'd'.repeat(64)}}}export async function verifyObservationScope(){await writeFile(process.env.RUNNER_TEMP+'/scope-checked','yes')}`);
 const r=shell(await block('morning','Resolve the exact originating night'),e);assert.equal(r.status,shape==='valid'?0:1,r.stderr);
 if(shape==='valid'){
  assert.equal(await readFile(join(e.temp,'scope-checked'),'utf8'),'yes');
  const output=await readFile(e.env.GITHUB_OUTPUT,'utf8');assert.match(output,/branch=keel-night\/2026-10-24\n/);
  const origin=JSON.parse(Buffer.from(output.split('origin=')[1].trim(),'base64'));assert.equal(origin.runAttempt,2);assert.equal(origin.artifactId,90);
 }else await assert.rejects(readFile(e.env.GITHUB_OUTPUT),{code:'ENOENT'});
});

test('both templates parse every actual shell block and keep observation opt-in and after both writers',async()=>{
 for(const name of ['night','morning']){
  const text=await readFile(canonical(name),'utf8');assert.deepEqual(await shellProblems(name,text),[]);
  assert.match(text,/names_evidence:\n[^\n]*\n        type: boolean\n        default: false/);
  assert.ok(!text.includes('NODE_OPTIONS'));
  assert.match(text,/repository: dalmaer\/plates\n          ref: \$\{\{ inputs.names_source_sha \}\}/);
  assert.match(text,/persist-credentials: false\n          submodules: false\n          lfs: false/);
  assert.match(text,/path: \$\{\{ steps.names_collect.outputs.paths \}\}/);
  const path=`.github/workflows/plates-${name}.yml`,selfConfig=JSON.parse(await readFile(join(ROOT,'.plates/plates.json'),'utf8'));
  assert.equal(await readFile(join(ROOT,path),'utf8'),fill(text,selfConfig,path));
  for(const enabled of [false,true]) {
   const config={name:'Acme',repo:'acme/app',practices:['night','reconciliation'],...(enabled?{reconciliation:{githubAccess:{enabled:true,repositories:['acme/app']}}}:{})};
   const rendered=fill(text,config,path);assert.deepEqual(await shellProblems(name,rendered),[]);
   assert.equal(rendered.includes('  reconciliation:\n'),name==='night'&&enabled);
   assert.match(rendered,/names_evidence:\n[^\n]*\n        type: boolean\n        default: false/);
   assert.ok(!rendered.includes('NODE_OPTIONS'));
   assert.match(rendered,/repository: dalmaer\/plates\n          ref: \$\{\{ inputs.names_source_sha \}\}/);
   assert.match(rendered,/persist-credentials: false\n          submodules: false\n          lfs: false/);
   assert.match(rendered,/path: \$\{\{ steps.names_collect.outputs.paths \}\}/);
  }
 }
 const text=await readFile(canonical('morning'),'utf8');
 assert.match(text,/needs: \[names-origin, decide, finalize, send\]/);
 assert.match(text,/NIGHT="\$ORIGIN_BRANCH"/);
 assert.match(await block('morning','Observe the actual board'),/board --names-evidence --fresh --json/);
 assert.match(text,/needs\.decide\.outputs\.sent != 'true' \|\| \(github.event_name == 'workflow_dispatch' && inputs.names_evidence == true\)/);
});

for(const enabled of [false,true])test(`actual send shell preserves failure and flags (evidence ${enabled})`,async t=>{
 const e=await environment(t);e.env={...e.env,NAMES_EVIDENCE:String(enabled),DAY:'2026-10-24',GITHUB_REPOSITORY_ID:'10'};
 await mkdir(join(e.root,'scripts/plates'),{recursive:true});
 await writeFile(join(e.root,'scripts/plates/morning.mjs'),`import{writeFileSync}from'node:fs';writeFileSync(process.env.RUNNER_TEMP+'/called.json',JSON.stringify({args:process.argv.slice(2),nodeOptions:process.env.NODE_OPTIONS??null}));process.exitCode=13;`);
 if(enabled)await writeFile(join(e.temp,'names-loader.mjs'),NAMES_OBSERVATION_LOADER);
 const r=shell(await block('morning','Send the brief'),e);assert.equal(r.status,13,r.stderr);
 const called=JSON.parse(await readFile(join(e.temp,'called.json'),'utf8'));assert.deepEqual(called.args,['send','--date','2026-10-24',...(enabled?['--names-evidence','--json']:[])]);assert.equal(called.nodeOptions,null);
 if(enabled){const manifest=JSON.parse(await readFile(join(e.temp,'names-imports-brief.json'),'utf8'));assert.ok(manifest.files.some(f=>f.kind==='checkout'&&f.path==='scripts/plates/morning.mjs'));}
 else await assert.rejects(readFile(join(e.temp,'names-imports-brief.json')),{code:'ENOENT'});
});
for(const kind of ['night','morning'])for(const prefix of ['keel-night/','plates-night/'])test(`actual ${kind} no-change shell retains ${prefix} without writes`,async t=>{
 const e=await environment(t),branch=prefix+'2026-10-24'+(kind==='morning'?'-final':''),gh=join(e.root,'gh');
 e.env={...e.env,NAMES_EVIDENCE:'true',DAY:'2026-10-24',BRANCH:branch,GITHUB_REPOSITORY:'Acme/project',GITHUB_REPOSITORY_ID:'10',PLATES_GH:gh};
 await writeFile(join(e.temp,'names-loader.mjs'),NAMES_OBSERVATION_LOADER);
 await writeFile(join(e.temp,'improve.json'),JSON.stringify({nightRecovery:{branch}}));
 const state={number:7,id:70,base:{repo:{id:10}},head:{ref:branch,sha:'a'.repeat(40)},body:'Acme retained private keel text',labels:[],updated_at:'2026-10-24T10:00:00Z'};
 await writeFile(gh,`#!${process.execPath}\nimport{appendFileSync}from'node:fs';const args=process.argv.slice(2);if(args[0]!=='api'||!args.includes('GET'))process.exit(98);appendFileSync(process.env.RUNNER_TEMP+'/gets','GET\\n');const data=args.at(-1).includes('?')?[${JSON.stringify(state)}]:${JSON.stringify(state)};process.stdout.write('HTTP/2 200 OK\\nContent-Type: application/json\\n\\n'+JSON.stringify(data));`);await chmod(gh,0o755);
 const source=await block(kind,kind==='night'?"Open the night's pull request":"Open the night's final pull request"),at=source.indexOf('const {captureRetainedNamesPublication}'),start=source.lastIndexOf('if [ "$NAMES_EVIDENCE" = true ]; then',at),rest=source.slice(start),end=rest.search(/\n\s+exit 0/);
 assert.ok(at>0&&start>0&&end>0);const r=shell(rest.slice(0,end),e);assert.equal(r.status,0,r.stderr);
 const result=JSON.parse(await readFile(join(e.temp,`names-${kind}-pr.json`),'utf8'));assert.equal(result.writes[0].outcome,'no-change');assert.equal(result.association.branch,branch);assert.ok(!JSON.stringify(result).includes(state.body));assert.equal((await readFile(join(e.temp,'gets'),'utf8')).trim().split('\n').length,3);
});
