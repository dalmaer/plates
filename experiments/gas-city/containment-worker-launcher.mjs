// Fixed offline-only worker launcher. No model command, account or approval override.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {containmentArgs,cleanEnvironment,SANDBOX_EXEC} from './containment.mjs';
const [root,id]=process.argv.slice(2);if(id!=='acme-containment-probe')throw Error('only the non-model probe may launch');
const config=JSON.parse(readFileSync(join(root,'probe-launch.json'),'utf8'));
if(config.kind!=='offline-containment-probe'||config.modelExecution!=='not-authorized')throw Error('model launch unavailable');
if(config.probe!==fileURLToPath(new URL('./containment-probe-worker.mjs',import.meta.url))||resolve(config.worktree)!==join(resolve(root),'worker')||resolve(config.scratch)!==join(resolve(root),'scratch')||resolve(config.input)!==join(resolve(root),'worker','probe-input.json'))throw Error('fixed probe paths required');
const gate=join(root,'gates',id),deadline=Date.now()+15000;
while(!existsSync(gate)){if(Date.now()>deadline)throw Error('probe gate timeout');await delay(20);}
const args=containmentArgs({command:process.execPath,args:[config.probe,config.input],readRoots:[config.worktree],writeRoots:[config.worktree,config.scratch],readFiles:[config.probe]});
const result=spawnSync(SANDBOX_EXEC,args,{cwd:config.worktree,env:cleanEnvironment({scratch:config.scratch}),encoding:'utf8',timeout:10000,maxBuffer:65536});
writeFileSync(join(root,'results',`${id}.json`),JSON.stringify({status:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr,error:result.error?.message??null}),{flag:'wx',mode:0o600});
await delay(30000); // owned provider stops and verifies this incarnation
