import './helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, realpath } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { run } from './helpers/run.mjs';
import { LIVE_BUILDER_BRIDGE, preflightDocker, runLiveBuilder, runDockerStage } from '../lib/evaluation-docker.mjs';
import { submittedArtifact } from '../lib/evaluation-artifacts.mjs';
const moduleUrl = new URL('../lib/evaluation-docker.mjs', import.meta.url).href;
const imageId = 'sha256:' + 'a'.repeat(64), id = 'b'.repeat(64);
const canary = 'acme-synthetic-live-builder-secret-only';
const file = (path, text, mode = '100644') => ({ path, mode, base64: Buffer.from(text).toString('base64') });
const initial = [file('answer.mjs', 'export default "Acme original";'), file('policy.txt', 'Acme protected')];
const envelope = files => JSON.stringify({ schemaVersion: 1, files });

async function fixture(t, scenario = '') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-live-builder-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin'), work = join(root, 'work'), log = join(root, 'calls.jsonl');
  await mkdir(bin); await mkdir(work); await writeFile(join(root, 'private'), 'Acme private');
  // Only fixed bridge code with the pinned hash is evaluated by this fake,
  // against a temporary filesystem. Model/source bytes remain data. This proves
  // bridge behavior, not a real container's isolation boundary.
  await writeFile(join(bin, 'docker'), `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),{Readable}=require('node:stream');
const root=${JSON.stringify(root)},work=${JSON.stringify(work)},log=${JSON.stringify(log)},scenario=${JSON.stringify(scenario)};
const args=process.argv.slice(2),statePath=path.join(root,'state.json'),code=args[args.indexOf('-e')+1];
const note=(event,extra={})=>fs.appendFileSync(log,JSON.stringify({event,...extra})+'\\n');
const secret=${JSON.stringify(canary)};
if(Object.values(process.env).some(v=>v.includes(secret))||args.some(v=>v.includes(secret))) {note('credential-leak');process.exit(99);}
const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):null;
const save=s=>fs.writeFileSync(statePath,JSON.stringify(s));
const input=fn=>{const chunks=[];process.stdin.on('data',b=>chunks.push(b));process.stdin.on('end',()=>fn(Buffer.concat(chunks)));};
if(args[0]==='image')console.log(JSON.stringify([{Id:${JSON.stringify(imageId)},Os:'linux',Architecture:'arm64',Config:{Env:['NODE_VERSION=24.22.1']}}]));
else if(args[0]==='create'){
 const safe=args.includes('--read-only')&&args[args.indexOf('--network')+1]==='none'&&args[args.indexOf('--pull')+1]==='never'&&!args.some(x=>['--mount','--volume','-v','--privileged'].includes(x));
 note('create',{safe});if(!safe)process.exit(98);
 save({Id:${JSON.stringify(id)},State:{Running:false,Paused:false}});console.log(${JSON.stringify(id)});
}else if(args[0]==='start'){state.State.Running=true;save(state);note('start');}
else if(args[0]==='kill'){state.State.Running=false;save(state);note('kill');}
else if(args[0]==='inspect'){note('inspect');if(scenario==='unknown-stop')process.exit(97);console.log(args.includes('{{json .}}')?JSON.stringify(state):String(state.State.Running));}
else if(args[0]==='exec'&&args.includes('--version'))console.log('v24.22.1');
else if(args[0]==='exec'&&code==='console.log(Date.now())')console.log(Date.now());
else if(args[0]==='exec'&&code?.startsWith("const fs=require('node:fs'),p=require('node:path');"))input(bytes=>{
 for(const f of JSON.parse(bytes)){const p=path.join(work,f.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,Buffer.from(f.base64,'base64'),{flag:'wx',mode:f.mode==='100755'?493:420});}
 if(scenario==='symlink'){fs.unlinkSync(path.join(work,'answer.mjs'));fs.symlinkSync(path.join(root,'private'),path.join(work,'answer.mjs'));}
 if(scenario==='corrupt')fs.writeFileSync(path.join(work,'answer.mjs'),'Acme changed');
 note('populate');
});
else if(args[0]==='exec'&&typeof code==='string'&&crypto.createHash('sha256').update(code).digest('hex')===${JSON.stringify(LIVE_BUILDER_BRIDGE.digest)})input(bytes=>{
 const mode=args.at(-1);note(mode);
 if(mode==='apply'&&scenario.startsWith('tamper-')){
  const value=JSON.parse(bytes);
  const path=scenario==='tamper-protected'?'policy.txt':'../escape';
  value.submission=JSON.stringify({schemaVersion:1,files:[{path,mode:'100644',base64:Buffer.from('Acme forbidden').toString('base64')}]});bytes=Buffer.from(JSON.stringify(value));
 }
 process.chdir(work);
 const bridgeProcess=Object.create(process);
 Object.defineProperties(bridgeProcess,{stdin:{value:Readable.from([bytes])},argv:{value:['node',mode]},exitCode:{get:()=>process.exitCode,set:v=>{process.exitCode=v;}}});
 vm.runInNewContext(code.replace("root === '/work'",'root === '+JSON.stringify(work)),{require,process:bridgeProcess,Buffer,TextDecoder});
});
else {note('unexpected-command');process.exitCode=96;}
`, { mode: 0o700 });
  const execute = (callback, { timeout = 10000, controlledDeadline = false, source = initial } = {}) => {
    const script = join(root, 'controller.mjs');
    writeFileSync(script, `
    import {runLiveBuilder,preflightDocker} from ${JSON.stringify(moduleUrl)};
    import {readFileSync,appendFileSync} from 'node:fs';
    const log=${JSON.stringify(log)}, work=${JSON.stringify(work)};
    const image=await preflightDocker({image:${JSON.stringify(imageId)},platform:'linux/arm64'});
    let calls=0;
    // Keep setup on the real clock. Only after readiness can the test advance
    // the host clock and deliver the actual timeout callback registered by the
    // production Promise.race. Native AbortSignal timers remain independent.
    const realNow=Date.now, realSetTimeout=globalThis.setTimeout, realClearTimeout=globalThis.clearTimeout;
    const timers=[]; let clock=null;
    if(${controlledDeadline}) {
      Date.now=()=>clock??realNow();
      globalThis.setTimeout=(callback,delay,...args)=>{
        const handle=realSetTimeout(callback,delay,...args);
        timers.push({callback,delay,args,handle}); return handle;
      };
    }
    const expire=(context,fire)=>{
      const events=readFileSync(log,'utf8').trim().split('\\n').map(JSON.parse);
      if(events.at(-1).event!=='ready'||!Object.isFrozen(context.ready)||context.signal.aborted)
        throw Error('deadline test did not reach live readiness');
      if(timers.length!==1||timers[0].delay<=0||timers[0].delay>${timeout})
        throw Error('expected the production host deadline timer');
      clock=context.deadline+1;
      appendFileSync(log,JSON.stringify({event:'callback-expired',fire})+'\\n');
      if(fire) {realClearTimeout(timers[0].handle);timers[0].callback(...timers[0].args);}
    };
    const result=await runLiveBuilder({name:'plates-eval-${'c'.repeat(32)}-builder',image,files:${JSON.stringify(source)},
      allowlist:['answer.mjs'],protectedPaths:['policy.txt'],deadline:Date.now()+${timeout},
      generate:async context=>{calls++;${callback}}});
    Date.now=realNow; globalThis.setTimeout=realSetTimeout;
    for(const timer of timers)realClearTimeout(timer.handle);
    console.log(JSON.stringify({result,calls}));
  `);
    return run(process.execPath, [script], { env: { PATH: bin, HOME: root, OPENAI_API_KEY: canary, ACTIONS_RUNTIME_TOKEN: canary }, timeout: timeout + 15000 });
  };
  return { root, work, log, execute, events: async () => (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse) };
}
function receipt(r) {
  assert.equal((r.stdout + r.stderr).includes(canary), false, 'callback error or environment leaked');
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); return JSON.parse(r.stdout);
}

test('live builder populates and attests readiness before one callback, then materializes without executing source', async t => {
  const f = await fixture(t), marker = join(f.root, 'must-not-exist');
  const generated = file('answer.mjs', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'executed');`);
  const observed = receipt(f.execute(`
    const events=readFileSync(log,'utf8').trim().split('\\n').map(JSON.parse);
    if(!Object.isFrozen(context.ready)||events.at(-1).event!=='ready'||!events.some(e=>e.event==='populate'))throw Error('not ready');
    if(readFileSync(work+'/answer.mjs','utf8')!=='export default "Acme original";')throw Error('source missing');
    appendFileSync(log,JSON.stringify({event:'callback'})+'\\n');
    return ${JSON.stringify(envelope([generated]))};
  `));
  const r = observed.result;
  assert.equal(observed.calls, 1); assert.equal(r.setup, 'passed'); assert.equal(r.execution, 'passed');
  assert.equal(r.generation, 'returned'); assert.equal(r.termination.state, 'terminated');
  assert.equal(r.ready.containerId, id); assert.equal(r.ready.bridgeDigest, LIVE_BUILDER_BRIDGE.digest);
  assert.deepEqual(JSON.parse(r.output.stdout), { schemaVersion: 1, files: [generated] });
  assert.equal(await readFile(join(f.work, 'answer.mjs'), 'utf8'), Buffer.from(generated.base64, 'base64').toString());
  assert.equal(await readFile(join(f.work, 'policy.txt'), 'utf8'), 'Acme protected');
  await assert.rejects(access(marker), { code: 'ENOENT' });
  const events = await f.events(), names = events.map(e => e.event);
  assert.equal(events.find(e => e.event === 'create').safe, true);
  assert.ok(names.indexOf('populate') < names.indexOf('ready'));
  assert.ok(names.indexOf('ready') < names.indexOf('callback'));
  assert.ok(names.indexOf('callback') < names.indexOf('apply'));
  assert.ok(names.indexOf('apply') < names.indexOf('kill'));
  assert.equal(names.includes('credential-leak'), false);
});

test('live callback error is sanitized, attempted once and followed by confirmed stop or explicit uncertainty', async t => {
  for (const scenario of ['', 'unknown-stop']) {
    const f = await fixture(t, scenario), { result, calls } = receipt(f.execute(`throw Error(${JSON.stringify(canary)});`));
    assert.equal(calls, 1); assert.equal(result.setup, 'passed'); assert.equal(result.generation, 'unknown');
    assert.equal(result.error, 'provider-callback-failed'); assert.equal(result.output, null);
    assert.equal(result.termination.state, scenario ? 'unknown' : 'terminated');
    assert.equal((await f.events()).some(e => e.event === 'apply'), false);
  }
});

test('live host await bounds never-resolving and late callbacks; neither can dispatch bridge after deadline', async t => {
  for (const late of [false, true]) {
    const f = await fixture(t);
    // The never-resolving callback needs the host timeout itself. The late
    // callback returns after clock expiry BEFORE that timer fires, independently
    // exercising the post-await absolute deadline guard (signal still live).
    const callback = late
      ? `expire(context,false); return ${JSON.stringify(envelope([]))};`
      : 'expire(context,true); return await new Promise(()=>{});';
    const { result, calls } = receipt(f.execute(callback, { controlledDeadline: true }));
    assert.equal(calls, 1); assert.equal(result.setup, 'passed');
    assert.equal(result.error, 'deadline-exhausted');
    const events = await f.events();
    assert.equal(events.filter(e => e.event === 'callback-expired').length, 1);
    assert.equal(events.find(e => e.event === 'callback-expired').fire, !late);
    assert.equal(events.some(e => e.event === 'apply'), false, 'late callback dispatched the bridge');
    assert.equal(result.output, null);
    assert.equal(result.generation, 'unknown'); assert.equal(result.termination.state, 'terminated');
  }
});

test('live readiness rejects changed or symlinked initial source before provider callback', async t => {
  for (const scenario of ['corrupt', 'symlink']) {
    const f = await fixture(t, scenario), { result, calls } = receipt(f.execute(`return ${JSON.stringify(envelope([]))};`));
    assert.equal(calls, 0); assert.equal(result.ready, null); assert.equal(result.setup, 'failed');
    assert.equal(result.generation, 'not-run'); assert.equal(result.termination.state, 'terminated');
    assert.equal(result.error, 'live-builder-failed');
  }
});

test('live host and fixed bridge reject protected edits and path escapes; invalid modes and sizes never materialize', async t => {
  for (const generated of [envelope([file('policy.txt', 'changed')]), envelope([file('../escape', 'changed')]),
    envelope([file('answer.mjs', 'target', '120000')]), envelope([file('answer.mjs', 'x'.repeat(262145))])]) {
    const f = await fixture(t), { result } = receipt(f.execute(`return ${JSON.stringify(generated)};`));
    assert.equal(result.error, 'invalid-live-submission'); assert.equal(result.output, null);
    assert.equal(result.termination.state, 'terminated');
    assert.equal((await f.events()).some(e => e.event === 'apply'), false);
    assert.equal(await readFile(join(f.work, 'policy.txt'), 'utf8'), 'Acme protected');
  }
  for (const scenario of ['tamper-protected', 'tamper-traversal']) {
    const f = await fixture(t, scenario), { result } = receipt(f.execute(`return ${JSON.stringify(envelope([file('answer.mjs', 'Acme changed')]))};`));
    assert.equal(result.execution, 'failed'); assert.equal(result.output.stderr, 'live-bridge-refused');
    assert.equal(result.termination.state, 'terminated');
    assert.equal(await readFile(join(f.work, 'policy.txt'), 'utf8'), 'Acme protected');
    await assert.rejects(access(join(f.root, 'escape')), { code: 'ENOENT' });
  }
});

const real = process.env.PLATES_EVALUATION_LIVE_DOCKER === '1';
test('opt-in real live builder is ready and isolated before generation, then independently evaluates submitted bytes', { skip: !real }, async () => {
  const requested = process.env.PLATES_EVALUATION_LIVE_IMAGE, platform = process.env.PLATES_EVALUATION_LIVE_PLATFORM;
  assert.match(requested ?? '', /^sha256:[a-f0-9]{64}$/);
  assert.ok(['linux/arm64', 'linux/amd64'].includes(platform));
  const image = await preflightDocker({ image: requested, platform });
  const name = `plates-eval-${randomBytes(16).toString('hex')}-builder`;
  const probe = file('probe.mjs', `import answer from './answer.mjs';import fs from 'node:fs';import os from 'node:os';
    const safe=!fs.existsSync('/var/run/docker.sock')&&!Object.keys(process.env).some(k=>/TOKEN|KEY|SECRET/.test(k))
      &&Object.keys(os.networkInterfaces()).every(k=>k==='lo');console.log(safe?answer:'unsafe');`);
  const source = [...initial, probe]; let calls = 0;
  const result = await runLiveBuilder({ name, image, files: source, allowlist: ['answer.mjs'], protectedPaths: ['policy.txt', 'probe.mjs'], deadline: Date.now() + 15000,
    generate: async ({ ready }) => {
      calls++; assert.equal(Object.isFrozen(ready), true);
      const observed = run('docker', ['inspect', '--format', '{{json .}}', ready.containerId], { timeout: 2000 });
      assert.equal(observed.status, 0); const container = JSON.parse(observed.stdout);
      assert.equal(container.State.Running, true); assert.equal(container.HostConfig.NetworkMode, 'none');
      assert.equal(container.HostConfig.ReadonlyRootfs, true); assert.ok(!container.HostConfig.Binds?.length);
      assert.ok(container.Mounts.every(m => m.Type === 'tmpfs'));
      return envelope([file('answer.mjs', 'export default "Acme accepted";')]);
    } });
  assert.equal(calls, 1); assert.equal(result.execution, 'passed'); assert.equal(result.termination.state, 'terminated');
  const files = submittedArtifact(result.output.stdout, source, ['answer.mjs'], ['policy.txt', 'probe.mjs']);
  const check = await runDockerStage({ name: `plates-eval-${randomBytes(16).toString('hex')}-check-0`, image, files,
    argv: ['node', '/work/probe.mjs'], deadline: Date.now() + 10000 });
  assert.equal(check.execution, 'passed'); assert.equal(check.termination.state, 'terminated');
  assert.equal(check.output.stdout, 'Acme accepted\n');
});
