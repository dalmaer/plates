// Independently implemented from format evidence in Switchboard src/codex.ts and
// src/runs-codex.ts at a6651db5; no original database is opened or modified.
import { routine, attempt, schedule, nativeIdentity, digest, check, iso } from '../model.mjs';
import { sqliteSnapshot, contained, readBytes, remaining } from './files.mjs';
const terminal = new Set(['task_complete','turn_aborted']);
async function rollout(context,path,thread,definitions) {
  const bytes=await readBytes(await contained(context.source.rolloutRoot,path),context.bound);
  const lines=[];let from=0;
  for(let at=bytes.indexOf(10);at!==-1;at=bytes.indexOf(10,from)){lines.push(bytes.subarray(from,at));from=at+1;}
  if(from<bytes.length)lines.push(bytes.subarray(from));check(lines.length<=10000,'entry_limit');
  check(lines.length&&/"type"\s*:\s*"session_meta"/.test(lines[0].subarray(0,300).toString('utf8')),'unsupported_format');
  const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(lines[0]));
  check(metadata.type==='session_meta'&&metadata.payload?.id===thread,'source_identity_mismatch');
  const turns=new Map();let current=null;
  for(const line of lines.slice(1)) {
    remaining(context.bound);const head=line.subarray(0,300).toString('utf8');
    if(/"type"\s*:\s*"response_item"/.test(head)) {
      if(!current||current.replied)continue;
      if(/"role"\s*:\s*"assistant"/.test(head)){current.replied=true;continue;}
      if(/"role"\s*:\s*"user"/.test(head)&&line.includes(Buffer.from('<heartbeat'))) {
        current.heartbeat=true;
        const matching=[...definitions].filter(([id,value])=>value.thread===thread&&line.includes(Buffer.from(`<automation_id>${id}</automation_id>`)));
        if(matching.length===1)current.routine=matching[0][1].routine;else context.gap('unmatched_heartbeat');
      }
      continue;
    }
    if(!/"type"\s*:\s*"event_msg"/.test(head))continue;
    if(!/"type"\s*:\s*"(?:task_started|task_complete|turn_aborted)"/.test(head))continue;
    let event;try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(line));}catch{context.gap('unsupported_rollout_event');continue;}
    const payload=event.payload;check(payload&&nativeIdentity(payload.turn_id),'unsupported_rollout_event');
    if(payload.type==='task_started') {
      const at=typeof payload.started_at==='number'?iso(payload.started_at*1000):null;
      if(!at||at>context.now){context.gap('invalid_attempt_time');continue;}
      if(turns.has(payload.turn_id)){turns.get(payload.turn_id).conflict=true;context.gap('conflicting_attempt');continue;}
      current={id:payload.turn_id,start:at,routine:null,replied:false,heartbeat:false,state:'unknown',end:null};turns.set(current.id,current);
    }else if(terminal.has(payload.type)) {
      const turn=turns.get(payload.turn_id);if(!turn){context.gap('unmatched_attempt');continue;}
      if(turn.terminal){turn.conflict=true;context.gap('conflicting_attempt');continue;}
      turn.terminal=true;turn.state=payload.type==='task_complete'?'succeeded':'cancelled';
      const end=typeof payload.completed_at==='number'?iso(payload.completed_at*1000):null;
      if(end&&end>=turn.start&&end<=context.now)turn.end=end;
    }
  }
  for(const turn of turns.values()) {
    if(turn.conflict||turn.start<context.since)continue;
    if(!turn.routine){if(turn.heartbeat)context.gap('unmatched_heartbeat');continue;}
    context.attempts.push(attempt(context,turn.routine.id,`${thread}:${turn.id}`,{state:turn.state,startedAt:turn.start,completedAt:turn.end,timeBasis:'provider-turn'}));
    if(!turn.terminal)context.gap('completion_unobserved');
  }
}
export async function readCodex(context,dependencies) {
  const definitions=new Map(),threads=new Set();
  const rows=await sqliteSnapshot(context.source.dbPath,context.bound,{kind:'automations'},dependencies);
  check(rows.length<=500,'entry_limit');
  const counts=new Map();for(const row of rows)counts.set(row.id,(counts.get(row.id)||0)+1);
  for(const row of rows) {
    if(!nativeIdentity(row.id)||counts.get(row.id)>1){context.gap('invalid_definition');continue;}
    const item=routine(context,row.id,{revision:digest(JSON.stringify(row)),status:{ACTIVE:'active',PAUSED:'paused'}[row.status],trigger:schedule('rrule',row.rrule),placement:'home',runner:'codex'});
    definitions.set(row.id,{routine:item,thread:row.target_thread_id});context.routines.push(item);
    if(item.schedule.kind==='unknown')context.gap('unsupported_schedule');
    if(nativeIdentity(row.target_thread_id))threads.add(row.target_thread_id);else context.gap('thread_unavailable');
  }
  if(!threads.size)return;
  // A separate copied state database resolves only the explicitly observed threads.
  const threadRows=await sqliteSnapshot(context.source.statePath,context.bound,{kind:'threads',ids:[...threads]},dependencies);
  const byThread=new Map(),conflicts=new Set();
  for(const row of threadRows){if(byThread.has(row.id))conflicts.add(row.id);else byThread.set(row.id,row.rollout_path);}
  for(const id of conflicts){byThread.delete(id);context.gap('source_identity_mismatch');}
  for(const thread of threads) {
    const path=byThread.get(thread);if(typeof path!=='string'){context.gap('thread_unavailable');continue;}
    try {await rollout(context,path,thread,definitions);}catch(error){context.failure(error);}
  }
  context.gap('usage_requires_ledger_attribution');
}
