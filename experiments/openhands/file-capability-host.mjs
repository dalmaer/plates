// Trusted host bridge for an SDK ToolExecutor. Workspace is host configuration,
// never a model action field. No model/provider, auth, or approval decisions here.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnContained } from './containment.mjs';
const args=process.argv.slice(2);if(args.length!==1)throw Error('Usage: node file-capability-host.mjs TRUSTED_WORKSPACE');
const inputChunks=[];let bytes=0;
for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>2*1024*1024)throw Error('input bound');inputChunks.push(chunk);}
const input=Buffer.concat(inputChunks).toString('utf8');
JSON.parse(input); // tool process performs exact schema validation
const run=spawnContained({workspace:resolve(args[0]),runner:resolve(dirname(fileURLToPath(import.meta.url)),'workspace-file-tool.mjs'),writable:true,args:[resolve(args[0])]});
const outputChunks=[],errorChunks=[];let outputBytes=0,errorBytes=0,overflow=false;
const kill=()=>{try{process.kill(-run.child.pid,'SIGKILL');}catch{}};
run.child.stdout.on('data',chunk=>{outputBytes+=chunk.length;if(outputBytes>2*1024*1024){overflow=true;kill();return;}outputChunks.push(chunk);});
run.child.stderr.on('data',chunk=>{errorBytes+=chunk.length;if(errorBytes>65536){overflow=true;kill();return;}errorChunks.push(chunk);});
run.child.stdin.on('error',()=>kill());run.child.stdin.end(input);
const exit=await run.closed;
if(overflow)throw Error('output bound');
const stdout=Buffer.concat(outputChunks).toString('utf8'),stderr=Buffer.concat(errorChunks).toString('utf8');
const body=stdout?JSON.parse(stdout):{ok:false,error:'tool-did-not-return-json'};
console.log(JSON.stringify({exit,body,policySHA256:run.policySHA256,nodeSHA256:run.nodeSHA256,stderr}));
process.exitCode=exit.code===0&&body.ok?0:1;
