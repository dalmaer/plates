// PREPARATION ONLY. Creates local disposable worktrees; never invokes an agent/model.
import {mkdirSync,writeFileSync,readFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,join,isAbsolute,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export function validateSpec(spec){
 if(spec?.schema!==1||!/^[a-f0-9]{40}$/.test(spec.baseline)||!Array.isArray(spec.tasks)||spec.tasks.length!==2)throw Error('invalid frozen trial specification');
 for(const [i,task]of spec.tasks.entries())if(task.id!==['task-a','task-b'][i]||typeof task.prompt!=='string'||!task.prompt.trim()||!Array.isArray(task.tests)||!task.tests.length||task.tests.some(p=>!/^tests\/[a-z0-9-]+\.test\.mjs$/.test(p)))throw Error('explicit task prompts and repository tests required');
 if(spec.modelExecution!=='not-authorized'||spec.selection!=='pending-parent-reconciliation')throw Error('preparation cannot authorize execution');return spec;
}
export function preparationPlan(spec,root){validateSpec(spec);if(!isAbsolute(root))throw Error('absolute destination required');return {schema:1,mode:'preparation-only',baseline:spec.baseline,modelExecution:'not-authorized',selection:spec.selection,arms:[{id:'task-a',task:'task-a',lesson:false},{id:'task-b-control',task:'task-b',lesson:false},{id:'task-b-treatment',task:'task-b',lesson:true}].map(a=>({...a,path:join(root,a.id),initialHead:spec.baseline})),backend:'Gas City pinned subprocess component',agent:null,account:null,budget:null,permission:'Future explicit account/model/cost/data/sandbox approval required; no agent command is implemented here.'};}
export function assertDestination(repo,dest){
 if(!isAbsolute(dest))throw Error('absolute destination required');
 let parent=dest;while(!existsSync(parent))parent=dirname(parent);
 const physical=resolve(realpathSync(parent),relative(parent,dest)),inside=relative(realpathSync(repo),physical);
 if(!inside||inside!== '..'&&!inside.startsWith('../')&&!isAbsolute(inside))throw Error('destination must be outside source checkout');
 return physical;
}
export function verifyArm(git,arm,baseline){
 assertLocalCommit(git(['rev-parse','HEAD'],arm.path),baseline);
 if(git(['status','--porcelain'],arm.path))throw Error('prepared worktree is not clean');
}
async function main(){
 const [repoArg,specArg,destArg,...extras]=process.argv.slice(2);if(!repoArg||!specArg||!destArg||extras.length)throw Error('Usage: node experiments/gas-city/prepare-real-trial.mjs <local-repo> <frozen-spec.json> <new-absolute-output-root>');
 const repo=realpathSync(repoArg),specBytes=readFileSync(specArg),spec=validateSpec(JSON.parse(specBytes)),dest=assertDestination(repo,destArg);if(existsSync(dest))throw Error('destination exists: never reset or reuse uncertain trials');
 const plan=preparationPlan(spec,dest);mkdirSync(dest,{recursive:true,mode:0o700});
 const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'};
 function git(args,cwd=dest){const r=spawnSync('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',...args],{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});if(r.error||r.status!==0)throw Error(`local git preparation failed: ${r.error?.message??r.stderr}`);return r.stdout.trim();}
 const log={...plan,sourceRepo:repo,specSHA256:createHash('sha256').update(specBytes).digest('hex'),startedAt:new Date().toISOString(),status:'preparing',checks:[]};
 try{
  assertLocalCommit(git(['rev-parse',`${spec.baseline}^{commit}`],repo),spec.baseline);
  git(['clone','--no-checkout','--no-hardlinks',repo,join(dest,'object-store')]);
  git(['remote','remove','origin'],join(dest,'object-store'));
  for(const arm of plan.arms){git(['worktree','add','--detach',arm.path,spec.baseline],join(dest,'object-store'));verifyArm(git,arm,spec.baseline);}
  writeFileSync(join(dest,'spec.json'),specBytes,{mode:0o600,flag:'wx'});
  // Held-out prompt stays outside all agent worktrees until its arm is authorized.
  mkdirSync(join(dest,'held-out'),{mode:0o700});
  writeFileSync(join(dest,'task-a-request.md'),spec.tasks[0].prompt+'\n',{mode:0o600,flag:'wx'});
  writeFileSync(join(dest,'held-out','task-b-request.md'),spec.tasks[1].prompt+'\n',{mode:0o600,flag:'wx'});
  for(const task of spec.tasks){const arm=plan.arms.find(a=>a.task===task.id),args=['--import','./tests/helpers/hermetic.mjs','--test',...task.tests];const r=spawnSync(process.execPath,args,{cwd:arm.path,env:{...env,TMPDIR:dest},encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});const out=(r.stdout??'')+(r.stderr??'');writeFileSync(join(dest,`${task.id}-baseline.log`),out,{mode:0o600});log.checks.push({task:task.id,command:[process.execPath,...args],exitCode:r.status,signal:r.signal,error:r.error?.message??null,logSHA256:createHash('sha256').update(out).digest('hex')});if(r.error||r.status!==0)throw Error(`baseline gate failed for ${task.id}; evidence retained`);}
  for(const arm of plan.arms)verifyArm(git,arm,spec.baseline);
  if(existsSync(join(dest,'object-store','.git','objects','info','alternates')))throw Error('source object dependency remains');
  log.independentObjects=true;log.postTestArmsVerified=true;log.status='prepared';
 }catch(error){log.status='failed';log.error=error.message;process.exitCode=1;}
 writeFileSync(join(dest,'preparation.json'),JSON.stringify(log,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(log,null,2));
}
function assertLocalCommit(actual,expected){if(actual!==expected)throw Error('baseline mismatch');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
