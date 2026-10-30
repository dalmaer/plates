// Independently implemented metadata readers informed by Switchboard src/launchd.ts,
// runs-launchd.ts, claude-desktop.ts, runs-claude.ts, declared.ts, vercel.ts and
// routines.ts at a6651db5. Source format evidence, not wholesale source vendoring.
import { join } from 'node:path';
import { attempt, routine, schedule, digest, check, object, nativeIdentity, iso } from '../model.mjs';
import { readBytes, readJson, readText, list, canonical, remaining } from './files.mjs';
const array = (value, max=500) => {check(Array.isArray(value)&&value.length<=max,'unsupported_format');return value;};
const activeState = value => value===true?'active':value===false?'disabled':'unknown';
const past = (context,value) => {const at=iso(value);return at&&at<=context.now?at:null;};
export async function readClaude(context) {
  const {source,bound}=context, data=await readJson(join(source.root,'scheduled-tasks.json'),bound);
  check(object(data));const tasks=array(data.scheduledTasks),byId=new Map(),seenSessions=new Map();
  const counts=new Map();for(const task of tasks)counts.set(task?.id,(counts.get(task?.id)||0)+1);
  for(const task of tasks) {
    if(!nativeIdentity(task?.id)||counts.get(task.id)>1){context.gap('invalid_definition');continue;}
    const item=routine(context,task.id,{revision:digest(JSON.stringify({id:task.id,enabled:task.enabled,cron:task.cronExpression})),status:activeState(task.enabled),trigger:schedule('cron',task.cronExpression),placement:'home',runner:'claude'});
    context.routines.push(item);byId.set(task.id,item);if(item.schedule.kind==='unknown')context.gap('unsupported_schedule');
  }
  for(const name of await list(source.root,bound)) {
    if(!/^local_[A-Za-z0-9_.-]+\.json$/.test(name))continue;
    try {
      const session=await readJson(join(source.root,name),bound);if(!object(session))throw Error();
      if(!session.scheduledTaskId)continue;
      const item=byId.get(session.scheduledTaskId);if(!item){context.gap('unmatched_attempt');continue;}
      const start=past(context,session.createdAt),end=past(context,session.lastActivityAt);check(start,'unsupported_format');
      seenSessions.set(session.scheduledTaskId,[...(seenSessions.get(session.scheduledTaskId)||[]),start]);
      if(start<context.since)continue;
      context.attempts.push(attempt(context,item.id,name,{state:session.interruptedAwaitingPerson===true?'waiting':'unknown',startedAt:start,completedAt:null,timeBasis:'session-created'}));
      // Activity time is not a completion, and the session carries no success fact.
      if(end&&end<start)context.gap('invalid_attempt_time');
    }catch(error){context.failure(error);}
  }
  for(const task of tasks) {
    const item=byId.get(task?.id);if(!item)continue;
    const last=past(context,task.lastRunAt);
    if(last&&last>=context.since&&!(seenSessions.get(task.id)||[]).some(start=>Math.abs(Date.parse(start)-Date.parse(last))<=900000)) {
      context.attempts.push(attempt(context,item.id,`${task.id}:last:${last}`,{startedAt:last,timeBasis:'definition-last-run'}));context.gap('session_missing');
    }
    const skips=data.recordedSkips?.[task.id];if(skips===undefined)continue;
    if(!Array.isArray(skips)||skips.length>500){context.gap('entry_limit');continue;}
    for(const skip of skips){const at=past(context,skip?.at);if(!at){context.gap('invalid_attempt_time');continue;}if(at>=context.since)context.attempts.push(attempt(context,item.id,`${task.id}:skip:${at}`,{state:'skipped',startedAt:at}));}
  }
  context.gap('session_outcomes_unavailable');
}
export async function readVercel(context) {
  const bytes=await readBytes(context.source.file,context.bound),data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));check(object(data));
  for(const cron of array(data.crons??[])) {
    if(!nativeIdentity(cron?.path)){context.gap('invalid_definition');continue;}
    const item=routine(context,cron.path,{revision:digest(bytes),trigger:schedule('cron',cron.schedule,'UTC'),placement:'cloud',runner:'vercel'});
    context.routines.push(item);if(item.schedule.kind==='unknown')context.gap('unsupported_schedule');
  }
  context.gap('deployment_and_history_unavailable');
}
export async function readDeclared(context) {
  const data=array(await readJson(context.source.file,context.bound));
  for(const entry of data) {
    if(!object(entry)||!nativeIdentity(entry.name)||!nativeIdentity(entry.where)||!/^\d{4}-\d\d-\d\d$/.test(entry.confirmedAt??'')||!iso(entry.confirmedAt)||iso(entry.confirmedAt).slice(0,10)!==entry.confirmedAt||iso(entry.confirmedAt)>context.now){context.gap('invalid_definition');continue;}
    // Unstructured declared schedule prose, links and notes stay at the source.
    context.routines.push(routine(context,`${entry.where}:${entry.name}`,{revision:digest(JSON.stringify(entry)),confirmedAt:entry.confirmedAt,placement:'cloud'}));
  }
  context.gap('declared_not_observed');
}
export async function readSwitchboard(context) {
  const byId=new Map();
  for(const name of await list(context.source.dir,context.bound)) {
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)){context.gap('unsupported_entry');continue;}
    try {
      await canonical(join(context.source.dir,name),true);
      const data=await readJson(join(context.source.dir,name,'routine.json'),context.bound);check(object(data)&&object(data.trigger),'unsupported_format');
      const keys=Object.keys(data.trigger);check(keys.length===1,'unsupported_format');
      const trigger=keys[0]==='schedule'?schedule('cron',data.trigger.schedule):keys[0]==='manual'&&data.trigger.manual===true?schedule('manual'):keys[0]==='event'&&object(data.trigger.event)?schedule('event'):schedule('unknown');
      const item=routine(context,name,{revision:digest(JSON.stringify(data)),trigger,placement:data.placement?.where,runner:Array.isArray(data.runners)?data.runners[0]:'unknown'});
      context.routines.push(item);byId.set(`switchboard:${name}`,item);byId.set(name,item);
      if(trigger.kind==='unknown')context.gap('unsupported_schedule');
      // This is declaration inspection, not policy approval; task.md is never read.
    }catch(error){context.failure(error);}
  }
  const text=await readText(context.source.runFile,context.bound);
  const lines=text.split('\n').filter(line=>line.trim());check(lines.length<=500,'entry_limit');
  for(const line of lines) {
    try {
      const data=JSON.parse(line);check(object(data));if(data.kind==='approval'){context.gap('effects_not_projected');continue;}
      const item=byId.get(data.routineId);if(!item){context.gap('unmatched_attempt');continue;}
      const start=past(context,data.startedAt);check(start);if(start<context.since)continue;
      const state={ok:'succeeded',failed:'failed',unknown:'unknown',queued:'queued',refused:'unknown'}[data.outcome];check(state);
      context.attempts.push(attempt(context,item.id,`${data.routineId}:${start}`,{state,startedAt:start,completedAt:past(context,data.endedAt),revision:digest(line)}));
      if(data.effects?.length)context.gap('effects_not_projected');
      if(data.tokens!==undefined||data.costUsd!==undefined)context.gap('usage_requires_ledger_attribution');
    }catch(error){context.failure(error);}
  }
}
export async function readLaunchd(context,run) {
  for(const name of await list(context.source.dir,context.bound)) {
    if(!name.endsWith('.plist'))continue;
    try {
      const bytes=await readBytes(join(context.source.dir,name),context.bound);
      const converted=await run('plutil',['-convert','json','-o','-','-'],{input:bytes,timeout:Math.min(10000,remaining(context.bound)),maxBuffer:4*1024*1024});
      check(converted.status===0&&typeof converted.stdout==='string'&&Buffer.byteLength(converted.stdout)<=4*1024*1024,'command_unavailable');
      const plist=JSON.parse(converted.stdout);check(object(plist)&&typeof plist.Label==='string'&&/^[A-Za-z0-9_.-]{1,200}$/.test(plist.Label),'unsupported_format');
      if(!context.source.prefixes.some(prefix=>plist.Label.startsWith(prefix)))continue;
      let trigger=plist.StartInterval!==undefined?schedule('interval',plist.StartInterval):plist.StartCalendarInterval!==undefined?schedule('unknown'):plist.KeepAlive?schedule('continuous'):plist.RunAtLoad===true?schedule('at-load'):schedule('none');
      if(plist.StartCalendarInterval!==undefined){trigger=schedule('calendar',plist.StartCalendarInterval);context.gap('calendar_timezone_unverified');}
      const item=routine(context,plist.Label,{revision:digest(bytes),status:plist.Disabled===true?'disabled':'unknown',trigger,placement:'home',runner:'shell'});
      const observed=await run('launchctl',['print',`gui/${context.source.uid}/${plist.Label}`],{timeout:Math.min(10000,remaining(context.bound)),maxBuffer:4*1024*1024});
      if(observed.status===0&&typeof observed.stdout==='string'&&Buffer.byteLength(observed.stdout)<=4*1024*1024) {
        const fields=new Map();for(const line of observed.stdout.split('\n')){const m=/^\t([^\t=]+) = ([^\n]*)$/.exec(line);if(m&&!fields.has(m[1]))fields.set(m[1],m[2]);}
        if(item.status!=='disabled')item.status='active';
        const count=Number(fields.get('runs'));const running=fields.get('state')==='running';const exit=fields.get('last exit code');
        if(running||Number.isSafeInteger(count)&&count>0) {
          // No log mtime is promoted to a start time. launchd only retains last state.
          context.attempts.push(attempt(context,item.id,`${plist.Label}:last:${Number.isSafeInteger(count)?count:'unknown'}`,{state:running?'running':exit==='0'?'succeeded':/^-?\d+$/.test(exit??'')?'failed':'unknown',timeBasis:'undated-last-state'}));
        }
      }else context.gap('launchctl_state_unavailable');
      context.routines.push(item);
    }catch(error){context.failure(error);}
  }
  context.gap('last_state_only');
}
