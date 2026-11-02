import { constants } from 'node:fs';
import { lstat, open, realpath, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LIMITS, check, ObservationError } from '../model.mjs';
const signature = stat => [stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs,stat.mode,stat.nlink].join(':');
export function budget() {return {started:Date.now(),bytes:0,files:0};}
export function remaining(bound) {const ms=LIMITS.milliseconds-(Date.now()-bound.started);check(ms>0,'read_timeout');return ms;}
export async function canonical(path,directory=false) {
  check(typeof path==='string'&&path.startsWith('/')&&!path.split('/').includes('..'),'unsafe_path');
  const resolved=resolve(path);check(await realpath(path)===resolved,'unsafe_path');
  const stat=await lstat(resolved);check(directory?stat.isDirectory():stat.isFile()&&stat.nlink===1,'unsafe_path');return {path:resolved,stat};
}
export async function readBytes(path,bound,max=LIMITS.fileBytes) {
  remaining(bound);check(++bound.files<=LIMITS.entries*4,'entry_limit');
  const before=await canonical(path);check(before.stat.size<=max&&bound.bytes+before.stat.size<=LIMITS.totalBytes,'byte_limit');
  const fd=await open(before.path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const opened=await fd.stat();check(signature(opened)===signature(before.stat),'source_changed');
    const bytes=Buffer.alloc(opened.size+1);let offset=0;
    while(offset<bytes.length){remaining(bound);const got=await fd.read(bytes,offset,bytes.length-offset,null);if(!got.bytesRead)break;offset+=got.bytesRead;}
    check(offset===opened.size&&signature(await fd.stat())===signature(opened)&&signature((await canonical(path)).stat)===signature(opened),'source_changed');
    bound.bytes+=offset;return bytes.subarray(0,offset);
  } finally {await fd.close();}
}
export async function readText(path,bound,max) {return new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(path,bound,max));}
export async function readJson(path,bound) {return JSON.parse(await readText(path,bound));}
export async function list(path,bound) {remaining(bound);await canonical(path,true);const names=await readdir(path);check(names.length<=LIMITS.entries,'entry_limit');return names.sort();}
export async function contained(root,path) {const base=(await canonical(root,true)).path;const target=resolve(path);check(target.startsWith(base+sep),'unsafe_path');await canonical(target);return target;}
async function sqliteFiles(path) {
  const out=[];
  for(const suffix of ['','-wal','-shm']) {
    try {const item=await canonical(path+suffix);out.push({suffix,signature:signature(item.stat)});}
    catch(error){if(suffix&&error.code==='ENOENT')out.push({suffix,signature:null});else throw error;}
  }
  return out;
}
async function querySnapshot(path,query,timeout,onQueryStarted) {
  return new Promise((resolve,reject)=>{
    // Native SQLite cannot be interrupted by Worker.terminate. A separate process
    // lets the deadline kill native work; cleanup waits for actual child closure.
    const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
    const child=spawn(process.execPath,['--max-old-space-size=128',fileURLToPath(new URL('./sqlite-reader.mjs',import.meta.url))],{env,stdio:['ignore','pipe','ignore','ipc'],shell:false});
    let failure=null,size=0;const chunks=[];
    const stop=code=>{failure??=new ObservationError(code);child.kill('SIGKILL');};
    const timer=setTimeout(()=>stop('read_timeout'),timeout);
    // Source paths and native identities stay off process command lines.
    child.once('spawn',()=>child.send({path,query},error=>{if(error)stop('source_unavailable');}));
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>LIMITS.commandBytes)stop('byte_limit');else if(!failure)chunks.push(chunk);});
    child.on('message',message=>{if(message==='query-started'&&onQueryStarted)onQueryStarted({argv:[...child.spawnargs]});});
    child.once('error',()=>{failure??=new ObservationError('source_unavailable');});
    child.once('close',code=>{
      clearTimeout(timer);
      if(failure)return reject(failure);
      if(code!==0)return reject(new ObservationError('unsupported_format'));
      try {
        const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(result.error)return reject(new ObservationError(['entry_limit','byte_limit','unsupported_format'].includes(result.error)?result.error:'unsupported_format'));
        check(Array.isArray(result.rows)&&result.rows.length<=LIMITS.entries,'unsupported_format');resolve(result.rows);
      }catch{reject(new ObservationError('unsupported_format'));}
    });
  });
}
export async function sqliteSnapshot(path,bound,query,{snapshotHook,sqliteTimeoutMs,sqliteQueryStarted}={}) {
  const before=await sqliteFiles(path);const temp=await mkdtemp(join(await realpath(tmpdir()),'plates-routine-db-'));
  try {
    for(const entry of before)if(entry.signature!==null)await writeFile(join(temp,'snapshot.db'+entry.suffix),await readBytes(path+entry.suffix,bound,LIMITS.databaseBytes),{mode:0o600});
    if(snapshotHook)await snapshotHook(path);
    check(JSON.stringify(await sqliteFiles(path))===JSON.stringify(before),'source_changed');remaining(bound);
    const timeout=sqliteTimeoutMs===undefined?remaining(bound):Math.min(sqliteTimeoutMs,remaining(bound));
    check(typeof timeout==='number'&&Number.isFinite(timeout)&&timeout>0,'read_timeout');
    const rows=await querySnapshot(join(temp,'snapshot.db'),query,timeout,sqliteQueryStarted);remaining(bound);return rows;
  }finally{await rm(temp,{recursive:true,force:true});}
}
export const safeCode = error => error instanceof ObservationError ? error.code : ['ENOENT','EACCES','EPERM'].includes(error?.code)?'source_unavailable':'unsupported_format';
