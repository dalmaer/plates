import '../helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../helpers/run.mjs';
import { credentialPipeSources, syntheticSocket } from '../helpers/evaluation-credential-pipe.mjs';
import { mkdtemp, writeFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCredentialPipe } from '../../lib/evaluation-credential-pipe.mjs';

const moduleUrl = new URL('../../lib/evaluation-credential-pipe.mjs', import.meta.url).href;
async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'plates-acme-pipe-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const js=join(dir,'reader.mjs'), py=join(dir,'pipe.py');
  const { child, bootstrap }=credentialPipeSources(moduleUrl);
  await writeFile(js,child);await writeFile(py,bootstrap);return {js,py,dir};
}
test('credential pipe supported host: EOF, nonblocking cancellation, closure and child noninheritance before consumption', {skip:process.platform!=='darwin'}, async t=>{
  const f=await fixture(t);
  for(const [mode,code] of [['valid','ok'],['exact-limit','ok'],['no-eof','credential_pipe_timeout'],['extra','credential_pipe_invalid'],['timeout','credential_pipe_timeout'],['abort','credential_pipe_aborted'],
    ['already-aborted','credential_pipe_aborted'],['oversize','credential_pipe_limit'],['duplicate','credential_pipe_invalid'],
    ['surrogate','credential_pipe_invalid'],['utf8','credential_pipe_invalid'],['mismatch','credential_pipe_invalid']]) {
    await t.test(mode,()=>{
      const r=run('python3',[f.py,process.execPath,f.js,mode],{cwd:f.dir,timeout:10000});
      assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);
      assert.equal(result.code,code);assert.equal(result.matches,code==='ok');assert.equal(result.closed,true);
      assert.equal(result.inherited,false);assert.equal(result.gitInherited,false);assert.equal(result.control,true);
      if(mode==='timeout'||mode==='abort'||mode==='no-eof')assert.equal(result.ticked,true,'pending pipe read must not block event loop');
    });
  }
});
test('credential reader refuses stdio and unsupported hosts before ownership',async()=>{
  await assert.rejects(readCredentialPipe({fd:0,expected:{ref:'acme-key',generation:1},deadline:Date.now()+1000}),
    {code:process.platform==='darwin'?'credential_pipe_input':'credential_pipe_platform_unsupported'});
});

test('regular files, sockets and invalid metadata refuse without taking descriptor ownership', {skip:process.platform!=='darwin'},async t=>{
  const f=await fixture(t), file=await open(f.js,'r');t.after(()=>file.close());
  await assert.rejects(readCredentialPipe({fd:file.fd,expected:{ref:'acme-key',generation:1},deadline:Date.now()+1000}),{code:'credential_pipe_input'});
  assert.equal((await file.stat()).isFile(),true);
  // Actual child-process stdio pipes are socketpairs here; they are forbidden.
  const socket=await syntheticSocket();
  t.after(()=>socket.close());
  const fd=socket.fd;
  await assert.rejects(readCredentialPipe({fd,expected:{ref:'acme-key',generation:1},deadline:Date.now()+1000}),{code:'credential_pipe_input'});
  await assert.rejects(readCredentialPipe({fd,expected:{ref:'acme-key',generation:0},deadline:Date.now()+1000}),{code:'credential_pipe_input'});
});
