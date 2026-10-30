// Synthetic Acme fixtures only; no discovery of the developer's scheduler state.
import { mkdtemp, realpath, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
export const at='2026-10-30T12:00:00.000Z';
export async function fixture(t) {
  const root=await realpath(await mkdtemp(join(tmpdir(),'plates-routine-acme-')));t.after(()=>rm(root,{recursive:true,force:true}));
  const json=async(path,value)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),JSON.stringify(value));return join(root,path);};
  const source=(kind,fields={},scope={})=>({id:'acme-'+kind,kind,label:'Acme routine',scope:{projectId:'studio',hostId:'acme-host',accountId:'acme-account',...scope},...fields});
  const registry=sources=>({version:1,workspaceId:'acme',actorId:'alice',sources});
  return {root,json,source,registry};
}
export async function codexFixture(f) {
  const root=join(f.root,'rollouts');await mkdir(root);
  const dbPath=join(f.root,'codex.db'),statePath=join(f.root,'state.db'),path=join(root,'acme.jsonl');
  const db=new DatabaseSync(dbPath);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE automations(id TEXT, name TEXT, status TEXT, rrule TEXT, target_thread_id TEXT,prompt TEXT)');
  db.prepare('INSERT INTO automations VALUES (?,?,?,?,?,?)').run('daily','PRIVATE TITLE','ACTIVE','FREQ=DAILY;BYHOUR=9','thread-1','PRIVATE PROMPT');
  const state=new DatabaseSync(statePath);state.exec('CREATE TABLE threads(id TEXT,rollout_path TEXT)');state.prepare('INSERT INTO threads VALUES(?,?)').run('thread-1',path);state.close();
  const lines=[{type:'session_meta',payload:{id:'thread-1'}},{type:'event_msg',payload:{type:'task_started',turn_id:'turn-1',started_at:1793354400}},{type:'response_item',payload:{role:'user',content:[{text:'<heartbeat><automation_id>daily</automation_id>PRIVATE WORDS</heartbeat>'}]}},{type:'response_item',payload:{role:'assistant',content:[{text:'PRIVATE OUTPUT'}]}},{type:'event_msg',payload:{type:'task_complete',turn_id:'turn-1',completed_at:1793354460,last_agent_message:'PRIVATE LAST MESSAGE'}}];
  await writeFile(path,lines.map(line=>JSON.stringify(line)).join('\n'));
  return {db,dbPath,statePath,rolloutRoot:root,path,lines};
}
