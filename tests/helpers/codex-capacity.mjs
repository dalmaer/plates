// Synthetic protocol peer only. Never starts Codex or reads account files.
import { mkdtemp,writeFile,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { codexLaunchDigest } from '../../lib/capacity/codex-app-server.mjs';
export const NOW=Date.parse('2026-10-30T12:00:00.000Z');
export const usage=()=>({accountId:'acme-account',ordinaryUsageAllowed:true,rateLimits:{},rateLimitsByLimitId:{'acme-limit':{limitId:'acme-limit',normalModelSlug:'not-entitlement',primary:{usedPercent:25,windowDurationMins:300,resetsAt:Math.floor(NOW/1000)+18000},secondary:{usedPercent:40,windowDurationMins:10080,resetsAt:Math.floor(NOW/1000)+604800},spendControlReached:false,rateLimitReachedType:null}},rateLimitResetCredits:{credits:[{id:'PRIVATE-CREDIT'}]},rateLimitUpsell:{text:'PRIVATE-BANNER'}});
export const binding=()=>({actorId:'1',hostId:'acme-host',expectedAccountId:'acme-account',sourceId:'acme-codex',checkedAt:new Date(NOW).toISOString(),expiresAt:new Date(NOW+240000).toISOString(),pools:[{limitId:'acme-limit',poolId:'acme-pool',models:['acme-model'],windows:[{slot:'primary',durationMinutes:300},{slot:'secondary',durationMinutes:10080}]}]});
export async function protocolFixture(t,{mode='normal',response=usage()}={}) {
 const root=await mkdtemp(join(tmpdir(),'plates-acme-protocol-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const script=join(root,'peer.mjs'),log=join(root,'requests.jsonl');
 await writeFile(script,`import {createInterface} from 'node:readline';import{appendFileSync}from'node:fs';import{spawn}from'node:child_process';const mode=${JSON.stringify(mode)},response=${JSON.stringify(response)},log=${JSON.stringify(log)};
 if(mode==='descendant'){const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.send('ready')"],{stdio:['ignore',1,2,'ipc']});c.once('message',()=>{appendFileSync(log,JSON.stringify({descendant:c.pid})+'\\n');process.exit(0);});}
 if(mode==='hang'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);}
 const send=v=>{const text=JSON.stringify(v)+'\\n';if(mode==='utf8'){const b=Buffer.from(text);for(const byte of b)process.stdout.write(Buffer.from([byte]));}else process.stdout.write(text);};
 createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);appendFileSync(log,line+'\\n');if(['hang','descendant'].includes(mode))return;if(mode==='stderr'){process.stderr.write('PRIVATE'.repeat(20000));return;}if(mode==='oversize'){process.stdout.write('x'.repeat(300000));return;}if(mode==='invalid-utf8'){process.stdout.write(Buffer.from([0xc3,0x28,10]));return;}if(mode==='request'){send({id:99,method:'account/chatgptAuthTokens/refresh',params:{secret:'PRIVATE'}});return;}if(mode==='notification'){send({method:'thread/started',params:{text:'PRIVATE'}});return;}if(m.method==='initialized')return;let result;if(m.method==='initialize')result={codexHome:process.env.CODEX_HOME,platformFamily:'unix',platformOs:'acme',userAgent:'Codex/0.164.0 🧪'};else if(m.method==='account/read')result={requiresOpenaiAuth:true,account:{type:'chatgpt',email:'PRIVATE-EMAIL@acme.test',planType:'pro'}};else result=response;if(mode==='error'){send({id:m.id,error:{code:123,message:'PRIVATE ERROR'}});return;}send({id:mode==='wrong-id'?99:m.id,result});if(mode==='duplicate')send({id:m.id,result});});`);
 const launch={executable:join(root,'codex'),args:['app-server','--listen','stdio://'],cwd:root,codexHome:join(root,'explicit-home')};
 const grant={launchDigest:codexLaunchDigest(launch),actorId:'1',hostId:'acme-host',expectedAccountId:'acme-account',checkedAt:new Date(NOW).toISOString(),expiresAt:new Date(NOW+240000).toISOString()};
 let starts=0;
 const dependencies={now:()=>NOW,authorizeStart:async()=>({...grant}),spawnProcess:(_exe,_args,options)=>{starts++;return spawn(process.execPath,[script],options);}};
 return{launch,grant,dependencies,starts:()=>starts,requests:async()=> (await readFile(log,'utf8')).trim().split('\n').map(JSON.parse)};
}
