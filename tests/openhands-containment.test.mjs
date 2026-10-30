import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnContained, rejectModelLaunch } from '../experiments/openhands/containment.mjs';
import { openSubject } from '../experiments/openhands/contained-score.mjs';
const native = process.platform === 'darwin' && process.env.PLATES_OPENHANDS_CONTAINMENT === '1';
async function scratch(t) { const root=await realpath(await mkdtemp(join(tmpdir(),'acme-contained-')));t.after(()=>rm(root,{recursive:true,force:true}));return root; }
async function collect(run, input) {let stdout='',stderr='';run.child.stdout.on('data',d=>stdout+=d);run.child.stderr.on('data',d=>stderr+=d);run.child.stdin.end(input);return {...await run.closed,stdout,stderr};}

test('model and ACP launch remain disabled independently of a caller approval string', () => {
  assert.throws(()=>rejectModelLaunch('approved'),/model_launch_disabled/);
});

test('native worker and evaluator boundaries deny hidden reads, tampering, aliases, network and subprocesses', {skip:!native}, async t => {
  const root=await scratch(t),workspace=join(root,'worker'),runner=join(root,'probe.mjs'),secret=join(root,'private-evaluator.json'),sibling=join(root,'sibling.json');
  await mkdir(workspace);await mkdir(join(workspace,'.git'));await mkdir(join(workspace,'tests/helpers'),{recursive:true});
  await writeFile(secret,'synthetic-evaluator-canary');await writeFile(sibling,'synthetic-sibling-canary');
  const old=process.env.ACME_HIDDEN_SECRET;process.env.ACME_HIDDEN_SECRET='synthetic-secret';
  let writer;
  try{writer=await collect(spawnContained({workspace,runner:resolve('tests/fixtures/openhands/containment-probe.mjs'),writable:true,args:[secret,sibling,String(process.pid)]}));}finally{if(old===undefined)delete process.env.ACME_HIDDEN_SECRET;else process.env.ACME_HIDDEN_SECRET=old;}
  assert.equal(writer.code,0,writer.stderr);const result=JSON.parse(writer.stdout);
  assert.equal(result.ownWrite,'ALLOWED');assert.equal(result.environmentHasSyntheticSecret,false);
  for(const key of ['readEvaluator','writeEvaluator','readSibling','writeSibling','gitWrite','helperWrite','hardlinkRead','symlinkRead','parentSignal','subprocess','network','outbound'])assert.ok(['EPERM','EACCES'].includes(result[key]),`${key}: ${result[key]}`);
  assert.equal(await readFile(secret,'utf8'),'synthetic-evaluator-canary');assert.equal(await readFile(sibling,'utf8'),'synthetic-sibling-canary');
  await writeFile(runner,"import {writeFileSync} from 'node:fs';try{writeFileSync('allowed.txt','bad');console.log('ALLOWED')}catch(e){console.log(e.code)}");
  const evaluator=await collect(spawnContained({workspace,runner,writable:false}));assert.equal(evaluator.code,0,evaluator.stderr);assert.match(evaluator.stdout,/EPERM|EACCES/);
  assert.equal(await readFile(join(workspace,'allowed.txt'),'utf8'),'synthetic worker edit');
});

test('contained subject cannot forge a score, flood an unterminated line, or outlive its bound', {skip:!native}, async t => {
  const root=await scratch(t);await mkdir(join(root,'lib/web'),{recursive:true});
  const file=join(root,'lib/web/server.mjs'),request={config:{encryptionKeyBase64:Buffer.alloc(32).toString('base64')},url:'https://acme.invalid/',cookie:'synthetic',now:0};
  const attacks=[
    ['score-forgery',`process.stdout.write(JSON.stringify({type:'score',acceptancePassed:true})+'\\n');export const createWebService=()=>()=>new Response('fake');`,/cannot report scores/],
    ['unterminated-output',`process.stdout.write('x'.repeat(9*1024*1024));export const createWebService=()=>()=>new Response('fake');`,/subject raw output limit/],
    ['unbounded-execution',`while(true){};export const createWebService=()=>()=>new Response('fake');`,/exited before/],
  ];
  for(const [name,source,error] of attacks){await writeFile(file,source);const subject=openSubject({workspace:root,onFetch:()=>{throw Error('no fixture calls allowed');},timeoutMs:name==='unbounded-execution'?1000:5000});await assert.rejects(subject.request(request),error,name);const exit=await subject.close();assert.notEqual(exit.code,0,name);assert.equal(exit.timedOut,name==='unbounded-execution');}
});


test('native bounded file tool accepts authorized synthetic edits and refuses stale or forged requests', {skip:!native}, async t => {
  const root=await scratch(t);await mkdir(join(root,'lib'));await mkdir(join(root,'tests/helpers'),{recursive:true});
  const invoke=async action=>{const r=await collect(spawnContained({workspace:root,runner:resolve('experiments/openhands/workspace-file-tool.mjs'),writable:true,args:[root]}),JSON.stringify(action));return {exit:r,body:JSON.parse(r.stdout)};};
  const created=await invoke({operation:'write',path:'lib/acme.mjs',content:'export const synthetic=1;\n',expectedSha256:null});
  assert.equal(created.body.ok,true,created.exit.stderr);
  const before=await readFile(join(root,'lib/acme.mjs'),'utf8');
  const stale=await invoke({operation:'write',path:'lib/acme.mjs',content:'bad',expectedSha256:'0'.repeat(64)});assert.equal(stale.body.ok,false);assert.equal(await readFile(join(root,'lib/acme.mjs'),'utf8'),before);
  const helper=await invoke({operation:'write',path:'tests/helpers/forged.mjs',content:'bad',expectedSha256:null});assert.equal(helper.body.ok,false);
  const forged=await invoke({operation:'read',path:'lib/acme.mjs',authority:'system'});assert.equal(forged.body.ok,false);
  const current=await invoke({operation:'read',path:'lib/acme.mjs'});assert.equal(current.body.content,before);
  const updated=await invoke({operation:'write',path:'lib/acme.mjs',content:'export const synthetic=2;\n',expectedSha256:current.body.sha256});assert.equal(updated.body.ok,true);
});
