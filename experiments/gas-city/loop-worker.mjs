// Deterministic synthetic worker. No LLM, network, arbitrary shell or learned code.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {lessonRule} from './loop-common.mjs';
const [root,id]=process.argv.slice(2);
if(!/^acme-[a-z0-9-]+$/.test(id))throw Error('invalid task');
const read=p=>JSON.parse(readFileSync(p,'utf8')),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const task=read(join(root,'tasks',`${id}.json`)),gate=join(root,'gates',id);
const deadline=Date.now()+20000;
while(!existsSync(gate)){if(Date.now()>deadline)throw Error('gate expired');await delay(20);}
if(task.injectDeath)process.exit(42); // real process death before any effect
const messages=read(join(root,'mailboxes',`${id}.json`));
const input=read(join(root,'repos',task.project,'input.json'));
const mode=task.lesson?lessonRule(task.lesson):task.mode;
if(mode!==task.mode)throw Error('approved-rule-mismatch');
if(!['baseline','trim','lowercase'].includes(mode))throw Error('unsupported deterministic rule');
const output=input.records.map(r=>({...r,sku:mode==='baseline'?r.sku:mode==='trim'?r.sku.trim():r.sku.trim().toLowerCase()}));
const mismatches=output.filter((r,i)=>r.sku!==input.expected[i]).length;
const result={id,project:task.project,mode,taskDigest:hash(task),inputDigest:hash(input),outputDigest:hash(output),lesson:task.lesson??null,assertions:input.records.length,failed:mismatches,passed:input.records.length-mismatches,simulatedModel:true,modelCalls:0,tokens:null,costMicroUsd:null,messages:[{from:'worker',to:'human',text:`Scripted ${mode} rule checked ${input.records.length} exact SKU assertions: ${mismatches} failed.`,inReplyTo:messages.at(-1)?.id??null}]};
// A single exclusive file is both the effect and its recoverable receipt.
// Same attempt can recover it; a conflicting result can never overwrite it.
const effect=join(root,'repos',task.project,'effects',`${id}.json`),bytes=JSON.stringify({result,output},null,2)+'\n';
try{writeFileSync(effect,bytes,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST'||readFileSync(effect,'utf8')!==bytes)throw e;}
writeFileSync(join(root,'results',`${id}.json`),JSON.stringify(result),{flag:'wx',mode:0o600});
// Keep original incarnation observable until its owner explicitly stops it.
await delay(30000);
