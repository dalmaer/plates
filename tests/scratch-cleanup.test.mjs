// Exercise scratch's registered after callback in a fresh process: Node's
// recursive remover captures fs.rmdir on first use. Late entries cause a real
// filesystem ENOTEMPTY, not a mocked cleanup result or a timing-based race.
import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from './helpers/run.mjs';

const child = String.raw`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import operations from 'node:fs/promises';
import timers from 'node:timers/promises';
import {syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
const mode=process.argv[2], realRmdir=fs.rmdir, realRm=operations.rm, realDelay=timers.setTimeout;
let root, after, active=true, attempts=0, inserted=0, lastError;
const delays=[], sentinel=Object.assign(new Error('Acme cleanup failure'),{code:'EIO'});
fs.rmdir=function(path,...args){
  // Insert only after traversal has emptied the target, immediately before
  // the actual kernel rmdir. Repeat on every attempt only in the bound test.
  if(active && String(path)===root && fs.readdirSync(root).length===0 &&
     (mode==='persistent'||(mode==='transient'&&inserted===0))){
    fs.writeFileSync(join(root,'late-acme-entry'),'Acme');inserted++;
  }
  return realRmdir.call(this,path,...args);
};
operations.rm=async function(path,options){
  if(path!==root)return realRm(path,options);
  attempts++;
  assert.deepEqual(options,{recursive:true,force:true});
  if(mode==='other')throw sentinel;
  try{return await realRm(path,options);}catch(error){lastError=error;throw error;}
};
timers.setTimeout=async function(ms,...args){delays.push(ms);return realDelay(ms,...args);};
syncBuiltinESMExports();
try{
  const {scratch}=await import(process.argv[1]);
  root=await scratch({after(callback){assert.equal(after,undefined);after=callback;}},'plates-acme-cleanup-');
  fs.writeFileSync(join(root,'initial-acme-entry'),'Acme');
  assert.equal(typeof after,'function');
  if(mode==='transient'){
    await after();
    assert.equal(fs.existsSync(root),false,'awaited cleanup removes the whole scratch directory');
    assert.equal(inserted,1);assert.equal(attempts,2);assert.deepEqual(delays,[25]);
  }else if(mode==='persistent'){
    await assert.rejects(after(),error=>{assert.equal(error,lastError);assert.equal(error.code,'ENOTEMPTY');return true;});
    assert.equal(inserted,4);assert.equal(attempts,4);assert.deepEqual(delays,[25,50,100]);
    assert.equal(fs.existsSync(join(root,'late-acme-entry')),true,'exhaustion remains a failure');
  }else{
    await assert.rejects(after(),error=>{assert.equal(error,sentinel);return true;});
    assert.equal(attempts,1);assert.deepEqual(delays,[]);assert.equal(inserted,0);
  }
}finally{
  active=false;fs.rmdir=realRmdir;operations.rm=realRm;timers.setTimeout=realDelay;syncBuiltinESMExports();
  if(root)await realRm(root,{recursive:true,force:true});
}
`;

for(const mode of ['transient','persistent','other'])test(`scratch after callback: ${mode} cleanup error`,()=>{
  const result=run(process.execPath,['--input-type=module','-e',child,new URL('./helpers/improve.mjs',import.meta.url).href,mode],{timeout:10000});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
