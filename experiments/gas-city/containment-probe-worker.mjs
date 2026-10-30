// Trusted attack probe, not a coding agent. All canaries are synthetic and pre-existing.
import fs from 'node:fs';
import net from 'node:net';
import dgram from 'node:dgram';
import {spawnSync} from 'node:child_process';
const spec=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),results={};
function denied(name,fn){try{fn();results[name]={denied:false};}catch(e){results[name]={denied:['EPERM','EACCES'].includes(e.code),code:e.code};}}
results.allowedRead=fs.readFileSync(spec.allowed,'utf8')==='acme-allowed';fs.writeFileSync(spec.allowedWrite,'acme-write');results.allowedWrite=fs.readFileSync(spec.allowedWrite,'utf8')==='acme-write';
for(const [name,path]of Object.entries(spec.protected))denied(name,()=>fs.readFileSync(path));
denied('scoreWrite',()=>fs.writeFileSync(spec.score,'FORGED-PASS'));
fs.symlinkSync(spec.protected.heldout,spec.symlink);denied('symlinkRead',()=>fs.readFileSync(spec.symlink));
denied('hardlinkCreate',()=>fs.linkSync(spec.protected.heldout,spec.hardlink));
denied('parentSignal',()=>process.kill(spec.parentPID,0));
const sub=spawnSync(process.execPath,['-e',`try{require('node:fs').readFileSync(${JSON.stringify(spec.protected.heldout)});console.log('LEAK')}catch(e){console.log(e.code)}`],{env:process.env,encoding:'utf8',timeout:2000});results.childInheritance={denied:sub.status===0&&['EPERM','EACCES'].includes(sub.stdout.trim()),status:sub.status,output:sub.stdout.trim()};
async function connect(name,address){await new Promise(resolve=>{const socket=net.createConnection(address);const timer=setTimeout(()=>{socket.destroy();results[name]={denied:false,code:'TIMEOUT'};resolve();},1000);socket.once('connect',()=>{clearTimeout(timer);socket.destroy();results[name]={denied:false,code:'CONNECTED'};resolve();});socket.once('error',e=>{clearTimeout(timer);results[name]={denied:['EPERM','EACCES'].includes(e.code),code:e.code};resolve();});});}
await connect('tcpNetwork',{host:'127.0.0.1',port:spec.tcpPort});await connect('unixNetwork',{path:spec.unixSocket});
await new Promise(resolve=>{const socket=dgram.createSocket('udp4');const done=e=>{results.udpNetwork={denied:['EPERM','EACCES'].includes(e?.code),code:e?.code??'SENT'};try{socket.close();}catch{}resolve();};socket.once('error',done);socket.send('acme',spec.udpPort,'127.0.0.1',done);});
results.sanitizedEnvironment=!['NODE_OPTIONS','NODE_PATH','OPENAI_API_KEY','ANTHROPIC_API_KEY','HOME','CODEX_HOME','DYLD_INSERT_LIBRARIES'].some(k=>Object.hasOwn(process.env,k));
console.log(JSON.stringify(results));
