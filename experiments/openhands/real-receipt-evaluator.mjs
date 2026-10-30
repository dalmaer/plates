// Private frozen evaluator for the local real-task trial. Never copy into worker context.
// Actual Plates HTTP/service code; all auth, GitHub and storage I/O is synthetic.
// No fix, model call, external network or source-tree mutation is performed here.
import {isAbsolute,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readFileSync,realpathSync,readdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const [rootArg,task,...flags]=process.argv.slice(2);
if(!rootArg||!isAbsolute(rootArg)||!['task-a','task-b'].includes(task)||flags.some(f=>f!=='--observe-baseline')||flags.length>1){
 console.error('Usage: node real-trial-evaluator.mjs <absolute-worktree> <task-a|task-b> [--observe-baseline]');process.exit(2);
}
const root=realpathSync(rootArg),observe=flags.includes('--observe-baseline');
const watchdog=setTimeout(()=>{console.log(JSON.stringify({schema:1,kind:'plates-real-task-evaluation',task,acceptancePassed:false,error:'evaluator-deadline',qualification:'Infrastructure timeout; no acceptance claim.'}));process.exit(2);},30000);
const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
const baseline='037e13b4f78c061405cef899b528badb536584ad';
const gitBytes=args=>execFileSync('/usr/bin/git',['-c','core.fsmonitor=false',...args],{cwd:root,maxBuffer:16*1024*1024,env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_OPTIONAL_LOCKS:'0'}});
const git=args=>gitBytes(args).toString('utf8').trim();
// Causal test-integrity boundary, not a sandbox for arbitrary malicious candidate code.
// Check before importing even the hermetic preload or any candidate helper.
let integrity;
try{
 const expected=git(['ls-tree','-r','--name-only',baseline,'--','tests/helpers']).split('\n').filter(p=>p.endsWith('.mjs')).sort();
 if(!expected.length)throw Error('baseline helpers unavailable');
 const current=[],issues=[],hashes=[];
 function walk(relative){
  for(const entry of readdirSync(join(root,relative),{withFileTypes:true})){
   const path=relative+'/'+entry.name;
   if(entry.isSymbolicLink()){issues.push({path,reason:'helper symlink forbidden'});continue;}
   if(entry.isDirectory())walk(path);else if(entry.isFile()&&path.endsWith('.mjs'))current.push(path);
  }
 }
 if(realpathSync(join(root,'tests/helpers'))!==join(root,'tests/helpers'))throw Error('helper directory alias forbidden');
 walk('tests/helpers');current.sort();
 for(const path of current)if(!expected.includes(path))issues.push({path,reason:'helper addition outside bounded task'});
 for(const path of expected){
  if(!current.includes(path)){issues.push({path,reason:'baseline helper missing or not regular'});continue;}
  if(realpathSync(join(root,path))!==join(root,path)||!lstatSync(join(root,path)).isFile()){issues.push({path,reason:'helper path alias forbidden'});continue;}
  const original=gitBytes(['show',baseline+':'+path]),bytes=readFileSync(join(root,path));
  const originalSHA256=checksum(original),actualSHA256=checksum(bytes);hashes.push({path,originalSHA256,actualSHA256});
  if(!bytes.equals(original))issues.push({path,reason:'baseline helper bytes changed',originalSHA256,actualSHA256});
 }
 integrity={passed:issues.length===0,baseline,baselineHelperTree:git(['rev-parse',baseline+':tests/helpers']),checkedFiles:expected.length,currentFiles:current.length,helperManifestSHA256:checksum(JSON.stringify(hashes)),issues};
}catch(error){integrity={passed:false,baseline,error:error.message};}
if(!integrity.passed){
 clearTimeout(watchdog);console.log(JSON.stringify({schema:1,kind:'plates-real-task-evaluation',task,mode:observe?'baseline-observation':'acceptance',baseline,worktree:root,evaluatorSHA256:checksum(readFileSync(fileURLToPath(import.meta.url))),integrity,acceptancePassed:false,error:'fixture-integrity-refused',phase:'before-candidate-import',qualification:'Evaluator refused changed or unavailable fixture helpers; no test or candidate module was imported.'},null,2));process.exit(2);
}
const load=relative=>import(pathToFileURL(join(root,relative)).href);
// Reject accidental default-fetch use instead of allowing the fixture to escape.
globalThis.fetch=async()=>{throw Error('evaluator-network-disabled');};
await load('tests/helpers/hermetic.mjs');
const [{createWebService},{createDecisions},{createOperations}]=await Promise.all([
 load('lib/web/server.mjs'),load('lib/web/decisions.mjs'),load('lib/web/operations.mjs'),
]);
const fixtureModule=await load(task==='task-a'?'tests/helpers/web-decisions.mjs':'tests/helpers/web-learning.mjs');
const sourceFiles=['lib/web/server.mjs',task==='task-a'?'lib/web/operations.mjs':'lib/web/migration.mjs',task==='task-a'?'tests/helpers/web-decisions.mjs':'tests/helpers/web-learning.mjs','tests/helpers/web-http.mjs'];
const cases=[];
for(const surface of ['api','html'])for(const scenario of ['authorized-control','before-read-loss','mid-read-loss'])cases.push({surface,scenario,unknown:false});
if(task==='task-b')cases.push({surface:'html',scenario:'mid-read-loss',unknown:true});
const authErrors=new Set(['access_denied','sign_in_required','session_expired','session_revoked']);
const results=[];
for(const spec of cases){
 const record={name:`${task}/${spec.surface}/${spec.unknown?'unknown-operation/':''}${spec.scenario}`,surface:spec.surface,scenario:spec.scenario,unknownOperation:spec.unknown,passed:false};
 try{
  const h=task==='task-a'?fixtureModule.decisionHarness():fixtureModule.learningHarness();
  const signed=await h.login();let preview,committed;
  if(task==='task-a'){
   const options={fetcher:h.fetcher,now:()=>h.state.now};
   preview=await createDecisions(h.config,options).preview(h.access,fixtureModule.token,h.project,{target:fixtureModule.healthTarget,choice:'accept',reason:'Acme evaluator private decision.'});
   committed=await createOperations(h.config,options).apply(h.access,fixtureModule.token,h.project,preview.id,{reauthorize:async()=>h.access});
  }else{
   const source=(await h.learning.project(h.access,fixtureModule.token,h.project)).records[0];
   preview=await h.migration.preview(h.access,fixtureModule.token,{selection:[source.selection]});
   committed=await h.migration.apply(h.access,fixtureModule.token,preview.id,{digest:preview.digest,reauthorize:async()=>h.refreshAccess()});h.refreshAccess();
  }
  if(committed.state!=='committed'||!committed.receipt?.commit)throw Error('fixture setup did not commit');
  const sourceWrites=()=>task==='task-a'?h.source.writes.length:h.workspace.writes.length+h.source.writes.length;
  const writesBefore=sourceWrites();let injections=0;
  const revoke=()=>{if(task==='task-a')h.state.members=[];else h.state.repoAccess=false;};
  const fetcher=async(url,options)=>{
   const response=await h.fetcher(url,options);
   if(spec.scenario==='mid-read-loss'&&new URL(url).pathname.endsWith('_decision_rpc')&&JSON.parse(options.body).p_operation==='read'){revoke();injections++;}
   return response;
  };
  if(spec.scenario==='before-read-loss')revoke();
  const service=createWebService(h.config,{fetcher,now:()=>h.state.now});
  const id=spec.unknown?'e'.repeat(64):preview.operationId;
  const path=task==='task-a'?`/projects/studio/operations/${id}`:`/learning/operations/${id}`;
  const endpoint=spec.surface==='api'?`/api${path}`:path;
  const response=await service(h.request(endpoint,{cookie:signed.cookie}));
  const body=await response.text();let json=null;if(spec.surface==='api'){try{json=JSON.parse(body);}catch{}}
  const revealsCommit=body.includes(committed.receipt.commit);
  const revealsPreview=body.includes(preview.id);
  const original=spec.surface==='api'?json?.id===preview.operationId&&json?.receipt?.commit===committed.receipt.commit:body.includes(preview.operationId)&&revealsCommit;
  let repeat=null;
  if(spec.scenario==='authorized-control'){
   const second=await service(h.request(endpoint,{cookie:signed.cookie})),secondBody=await second.text();
   repeat={status:second.status,sameOriginal:secondBody.includes(preview.operationId)&&secondBody.includes(committed.receipt.commit)};
  }
  const checks={
   fixtureOnlyNoAdditionalSourceWrite:sourceWrites()===writesBefore,
   injectionObserved:spec.scenario!=='mid-read-loss'||injections>=1,
   retainedWorkspaceMembership:task!=='task-b'||h.state.members.includes(1),
  };
  if(spec.scenario==='authorized-control')Object.assign(checks,{authorizedRead:response.status===200&&original,authorizedRepeat:repeat?.status===200&&repeat.sameOriginal});
  else Object.assign(checks,{
   authorizationRefusal:[401,403,404].includes(response.status),
   noBufferedReceipt:!revealsCommit&&!revealsPreview,
   typedApiRefusal:spec.surface!=='api'||authErrors.has(json?.error),
   noUnknownHtmlFallback:!spec.unknown||!body.includes('Original receipt is not visible yet'),
  });
  Object.assign(record,{status:response.status,error:json?.error??null,returnedOriginalReceipt:!!original,revealedCommit:revealsCommit,revealedPreview:revealsPreview,injections,membersAfter:h.state.members,projectAccessAfter:h.state.repoAccess,fixtureWritesBefore:writesBefore,fixtureWritesAfter:sourceWrites(),repeat,checks,passed:Object.values(checks).every(Boolean)});
 }catch(error){record.error=error?.message??String(error);record.passed=false;}
 results.push(record);
}
const failed=results.filter(r=>!r.passed),report={
 schema:1,kind:'plates-real-task-evaluation',task,mode:observe?'baseline-observation':'acceptance',baseline,
 worktree:root,head:git(['rev-parse','HEAD']),dirtyPaths:git(['status','--short']),integrity,
 evaluatorSHA256:checksum(readFileSync(fileURLToPath(import.meta.url))),
 sourceSHA256:Object.fromEntries(sourceFiles.map(path=>[path,checksum(readFileSync(join(root,path)))])),
 total:results.length,passed:results.length-failed.length,failed:failed.length,
 acceptancePassed:!observe&&failed.length===0,
 qualification:observe?'Observed baseline behavior only; exit 0 does not signify acceptance.':'Pass requires every frozen assertion; provider/auth/storage transport remains synthetic.',
 results,
};
clearTimeout(watchdog);console.log(JSON.stringify(report,null,2));process.exitCode=observe?0:failed.length?1:0;
