// Runs in a read-only OS sandbox. Never executes candidate modules.
import { readdirSync, lstatSync, openSync, closeSync, readSync, fstatSync, constants, realpathSync } from 'node:fs';
import { join } from 'node:path';
const files=[];let bytes=0,entries=0;
function walk(relative,depth=0) {
  if(depth>20||++entries>4096)throw Error('capture entry limit');
  const path=join(process.cwd(),relative),info=lstatSync(path);
  if(info.isSymbolicLink()||realpathSync(path)!==path)throw Error('capture alias refused');
  if(info.isDirectory()){for(const name of readdirSync(path).sort())walk(join(relative,name),depth+1);return;}
  if(!info.isFile()||info.nlink!==1||info.size>4*1024*1024)throw Error('capture file bound');
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let data;try{
    const before=fstatSync(fd,{bigint:true});if(!before.isFile()||before.nlink!==1n||before.size>4n*1024n*1024n)throw Error('opened capture file bound');
    const buffer=Buffer.alloc(4*1024*1024+1);let used=0,n;
    while(used<buffer.length&&(n=readSync(fd,buffer,used,buffer.length-used,null))>0)used+=n;
    const after=fstatSync(fd,{bigint:true});
    if(used>4*1024*1024||BigInt(used)!==before.size||after.size!==before.size||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs)throw Error('capture file changed');
    data=buffer.subarray(0,used);
  }finally{closeSync(fd);}
  bytes+=data.length;if(bytes>20*1024*1024)throw Error('capture byte bound');
  files.push({path:relative,bytes:data.toString('base64')});
}
walk('lib');walk('tests/helpers');
const [regression,...extra]=process.argv.slice(2);if(extra.length||regression&&!/^tests\/[A-Za-z0-9_-]+\.test\.mjs$/.test(regression))throw Error('explicit regression path');if(regression)walk(regression);
process.stdout.write(JSON.stringify({schema:1,files}));
