import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeHealthReport} from '../practices/night/files/scripts/plates/time-proposals.mjs';
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'acme-health-observation-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
for(const previous of [null,'','Acme owner bytes\r\n'])test(`health locked observer captures exact ${previous===null?'absent':previous===''?'empty':'existing'} input and next bytes before write`,async t=>{
 const root=await fixture(t),path='docs/health/2026-10-24.md';await mkdir(join(root,'docs/health'),{recursive:true});
 if(previous!==null)await writeFile(join(root,path),previous);
 let calls=0,next;
 const result=await writeHealthReport({root,path,generated:'# Acme measurements\n',observeBefore:async(before,intended)=>{
  calls++;assert.equal(before,previous);assert.equal(await readFile(join(root,path),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;}),previous);next=intended;
 }});
 assert.equal(calls,1);assert.equal(await readFile(join(root,path),'utf8'),next);assert.equal(result.text,next);assert.equal(Object.hasOwn(result,'previous'),false);
});
test('health locked observer sees recovered input and refuses collision before observation',async t=>{
 const root=await fixture(t),path='docs/health/2026-10-24.md',recovered='Acme recovered owner text\r\n';let seen;
 await writeHealthReport({root,path,recovered,generated:'# Acme measurements\n',observeBefore:(before,next)=>{seen={before,next};}});
 assert.equal(seen?.before,recovered);assert.equal(await readFile(join(root,path),'utf8'),seen.next);
 await assert.rejects(writeHealthReport({root,path,recovered:'Conflicting Acme bytes',generated:'# Acme measurements\n',observeBefore:()=>assert.fail('collision must precede observer')}),/differ/);
});
test('health observer holds the existing lock through capture and atomic publication',async t=>{
 const root=await fixture(t),path='docs/health/2026-10-24.md';let release,entered;
 const held=new Promise(r=>release=r),arrived=new Promise(r=>entered=r);let firstNext,secondBefore;
 const first=writeHealthReport({root,path,generated:'# Acme first\n',observeBefore:async(before,next)=>{assert.equal(before,null);firstNext=next;entered();await held;}});
 // Old implementations omit the callback; fail an assertion rather than hang.
 await Promise.race([arrived,first.then(()=>assert.fail('writer skipped locked observation'))]);
 const second=writeHealthReport({root,path,generated:'# Acme second\n',observeBefore:before=>{secondBefore=before;}});
 release();await Promise.all([first,second]);assert.equal(secondBefore,firstNext);
});
test('health observer failure leaves previous bytes intact and releases the lock',async t=>{
 const root=await fixture(t),path='docs/health/2026-10-24.md';await mkdir(join(root,'docs/health'),{recursive:true});await writeFile(join(root,path),'Acme owner text');
 await assert.rejects(writeHealthReport({root,path,generated:'# Acme measurements\n',observeBefore:()=>{throw new Error('Acme observation unavailable');}}),/observation unavailable/);
 assert.equal(await readFile(join(root,path),'utf8'),'Acme owner text');await writeHealthReport({root,path,generated:'# Acme measurements\n'});
});
