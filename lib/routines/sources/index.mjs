import { spawnSync } from 'node:child_process';
import { validateRegistry, sourceScope, iso, check, uniqueObservations, LIMITS } from '../model.mjs';
import { budget, safeCode, remaining } from './files.mjs';
import { readClaude, readDeclared, readLaunchd, readSwitchboard, readVercel } from './local.mjs';
import { readCodex } from './codex.mjs';
import { readGithub } from './github.mjs';
const nativeRead = (command,args,options) => {
  check(['plutil','launchctl'].includes(command),'unsupported_command');
  return spawnSync(command,args,{...options,encoding:'utf8',shell:false,stdio:['pipe','pipe','pipe']});
};
/** Explicit paths and scope only. No discovery, writes, execution or remote enrollment. */
export async function collectRoutineSources({registry,since=null,now=new Date().toISOString()},dependencies={}) {
  const input=validateRegistry(registry);
  check(typeof now==='string'&&iso(now)===now,'invalid_observation_time');
  since=since??new Date(Date.parse(now)-30*86400000).toISOString();
  check(typeof since==='string'&&iso(since)===since&&since<=now,'invalid_observation_time');
  const bound=budget(),reports=[],routines=[],attempts=[];
  for(const source of input.sources) {
    const gaps=new Set(),context={source,scope:sourceScope(input,source),now,since,bound,routines:[],attempts:[],gap:code=>gaps.add(code)};
    // Enforce both source and retained-result ceilings before constructing a row.
    // Hard resource failures escape adapter-local catches and stop this source.
    context.reserve=kind=>check(context[kind].length<Math.min(LIMITS.entries,LIMITS.entries-(kind==='routines'?routines:attempts).length),'entry_limit');
    context.failure=error=>{const code=safeCode(error);if(['entry_limit','byte_limit','read_timeout'].includes(code))throw error;gaps.add(code);};
    let read=true;
    try {
      remaining(bound);
      if(source.kind==='launchd')await readLaunchd(context,dependencies.run??nativeRead);
      else if(source.kind==='claude-desktop')await readClaude(context);
      else if(source.kind==='codex')await readCodex(context,dependencies);
      else if(source.kind==='vercel')await readVercel(context);
      else if(source.kind==='declared')await readDeclared(context);
      else if(source.kind==='switchboard')await readSwitchboard(context);
      else if(source.kind==='github-actions')read=(await readGithub(context,dependencies.githubReader))!==false;
      check(context.routines.length<=LIMITS.entries&&context.attempts.length<=LIMITS.entries,'entry_limit');
    }catch(error){gaps.add(safeCode(error));read=false;}
    // A failed source can retain established observations, explicitly incomplete.
    const defs=uniqueObservations(context.routines),runs=uniqueObservations(context.attempts);
    if(defs.conflicts||runs.conflicts)gaps.add('identity_conflict');
    const validIds=new Set(defs.values.map(item=>item.id));
    const validRuns=runs.values.filter(item=>validIds.has(item.routineId));
    if(validRuns.length!==runs.values.length)gaps.add('definition_conflict');
    routines.push(...defs.values);attempts.push(...validRuns);
    reports.push({id:source.id,kind:source.kind,readerVersion:1,label:source.label,scope:sourceScope(input,source),read,state:gaps.size?defs.values.length||validRuns.length?'partial':'unavailable':'complete-page',routineCount:defs.values.length,attemptCount:validRuns.length,gaps:[...gaps].sort().map(code=>({code})),observedAt:now});
  }
  const defs=uniqueObservations(routines),runs=uniqueObservations(attempts),gaps=reports.flatMap(report=>report.gaps.map(gap=>({sourceId:report.id,...gap})));
  if(defs.conflicts||runs.conflicts)gaps.push({sourceId:null,code:'cross_source_identity_conflict'});
  const ids=new Set(defs.values.map(item=>item.id));
  return {schema:1,observedAt:now,window:{since,until:now},reports,routines:defs.values,attempts:runs.values.filter(item=>ids.has(item.routineId)),coverage:{state:gaps.length?routines.length||attempts.length?'partial':'unavailable':'complete-page',gaps},authority:'observation-only'};
}
