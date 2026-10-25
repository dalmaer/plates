import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NAMES } from '../practices/night/files/scripts/plates/names.mjs';
import { namesGithub, previewNames, applyNames, recoverNames, namesPages, namesBranches, validRepo, matchesReference } from './names-actions.mjs';
import { verifyNames } from './names-verify.mjs';
import { concurrencyPreflight } from './name-concurrency.mjs';

export const NAMES_USAGE='plates names [--repo <owner/name>] [--only <row>]... [--yes --digest <sha256>] | --recover <operation> | --machine [--yes --digest <sha256> | --recover <operation>] | --verify <repo> [--run <id>] [--morning-run <id>] [--json]';
const usage=message=>{throw Object.assign(new Error(message),{exitCode:2});};
export function parseNamesArgs(args) {
  const o={only:[]};const seen=new Set();
  for(let i=0;i<args.length;i++){
    const flag=args[i];if(flag==='--json')continue;if(!['--repo','--only','--yes','--digest','--recover','--machine','--verify','--run','--morning-run'].includes(flag))usage('Unknown names argument');
    if(flag!=='--only'&&seen.has(flag))usage('Duplicate names argument');seen.add(flag);
    if(['--yes','--machine'].includes(flag)){o[flag.slice(2)]=true;continue;}
    const value=args[++i];if(!value||value.startsWith('--'))usage(`${flag} needs a value`);
    if(flag==='--only')o.only.push(value);else o[flag.slice(2)]=value;
  }
  if(new Set(o.only).size!==o.only.length)usage('Duplicate selected row');
  if(Boolean(o.yes)!==Boolean(o.digest)||o.digest&&!/^[a-f0-9]{64}$/.test(o.digest))usage('Apply requires --yes and exact --digest together');
  if(o.repo&&!validRepo(o.repo)||o.verify&&!validRepo(o.verify))usage('Expected owner/repository');
  if(o.yes&&!o.machine&&!o.repo)usage('Apply requires one explicit repository');
  if(o.verify&&(o.repo||o.machine||o.yes||o.recover||o.only.length)||(o.run||o['morning-run'])&&!o.verify)usage('Verification is a separate read-only mode');
  if(o.machine&&(o.repo||o.only.length)||o.recover&&(o.yes||o.repo||o.only.length))usage('Recovery and machine modes have separate scope');
  if([o.run,o['morning-run']].some(v=>v!==undefined&&!/^[1-9]\d*$/.test(v)))usage('Expected positive run ID');
  return o;
}
const consumers={
 'git ref:keel-claims/phase-':'lib/claim.mjs: local Git token/provider/session ownership',
 'variable:KEEL_AGENT_GIT':'night lib agentGitArgs; climb/tend environment; subprocess isolation',
 'variable:KEEL_GH':'CLI and standalone GitHub process adapters',
 'variable:KEEL_CANVAS_ISOCAN_HOME':'night/morning admitted runtime home preflight',
 'variable:KEEL_CANVAS_ISOCAN_VERSION':'night/morning exact isocan version preflight',
 'variable:KEEL_CANVAS_KEEL_VERSION':'night/morning exact Plates version preflight',
 'machine:keel.project':'canvas-sync remote project property AND practices/doctor internal symbol',
 'machine:keel.operation':'canvas-sync durable remote operation identity',
 'machine:keel.hash':'canvas-sync remote content hash and conditional metadata',
 'machine:keel.key':'canvas-sync remote projection key',
 'machine:keel-goodnight-loop':'goodnight/robot-issue original subject intent identity',
 'machine:.keel-time-proposals.lock':'time-proposals/hygiene-proposal-actions shared legacy lock',
 'machine:keel-night-plan-':'night-plan private alternate Git index',
 'machine:keel-canvas-night-':'canvas-night private scratch directory',
 'machine:keel-canvas-card-':'No active machine consumer identified; artifact overlap classification gap',
 'machine:~/.keel/night-card/run.sh':'Owner-installed script; inspect only through --machine',
 'machine:~/Library/LaunchAgents/com.keel.night-card.plist':'Owner launchd job; inspect only through --machine',
 'machine:~/.keel/tools/':'Owner tools directory; inspect only through --machine',
};
export function runtimeInventory(env={}) {
  return NAMES.filter(r=>r.phase===128).map(r=>({row:r.id,legacy:r.keel,current:r.plates,tableState:r.state,consumer:consumers[r.id]??(r.environmentScope ? `Historical ${r.environmentScope} binding; consumer validation required` : 'Consumer coverage unavailable'),
    activation:r.state==='held'?'held; source support is not activation':'source-enabled; installed state unverified',
    ...(r.surface==='variable'?{environmentPolicy:r.environmentPolicy,environmentScope:r.environmentScope,providerScope:r.providerScope==='binding-required'?'provider actions require a pinned workflow binding':'provider applicability unestablished; process alias only',selectedName:env[r.plates]!==undefined?r.plates:env[r.keel]!==undefined?r.keel : null,conflicting:r.environmentPolicy==='identity-conflict'&&env[r.plates]!==undefined&&env[r.keel]!==undefined&&env[r.plates]!==env[r.keel],ignoredLegacy:r.environmentPolicy==='current-presence'&&env[r.plates]!==undefined&&env[r.keel]!==undefined?r.keel : null}:{}),
    ...(r.id==='machine:keel.project'?{subuses:['remote metadata held pending explicit conditional migration','internal symbol is separate source compatibility']}:{}),
    ...(r.id==='machine:.keel-time-proposals.lock'?{reason:'Legacy coordination retained; bridge exception needs explicit owner choice'}:{})}));
}
async function repositories(root) {
  const own=JSON.parse(await readFile(join(root,'.plates/plates.json'),'utf8'));
  const result=validRepo(own.repo)?[own.repo]:[];
  try{const fleet=JSON.parse(await readFile(join(root,'plates.json'),'utf8'));for(const item of Array.isArray(fleet)?fleet:[])if(item.role==='managed'&&validRepo(item.repo))result.push(item.repo);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!result.length)throw new Error('No configured repository');return [...new Set(result)];
}
export async function namesCommand({root,env=process.env,...options},deps={}) {
  if(options.machine){const machine=deps.namesMachine??(await import('./names-machine.mjs')).namesMachine;return machine({root,env,yes:options.yes??false,digest:options.digest,recover:options.recover,...deps.machineAdapters});}
  const github=deps.github??namesGithub(env);
  if(options.verify)return verifyNames({repo:options.verify,run:options.run,morningRun:options['morning-run']},github);
  if(options.recover){const data=await recoverNames({root,operationId:options.recover,stateDir:deps.stateDir},github);return {data,text:`${data.state}: ${data.operationId}; no mutations retried`,exitCode:data.state==='verified-awaiting-publication'?0:1};}
  if(options.yes){const data=await applyNames({root,repo:options.repo,only:options.only,digest:options.digest,stateDir:deps.stateDir},github);return {data,text:`${data.state}: ${data.operationId}; receipt publication is separate`,exitCode:data.state==='verified-awaiting-publication'?0:1};}
  const repos=options.repo?[options.repo]:await repositories(root),projects=[];
  for(const repo of repos){
    try{
      const {publicPlan}=await previewNames({repo,only:options.only},github);
      const gaps=['Vercel metadata not observed; use exact owner environment commands','Owner machine not inspected; use --machine'],live=[];
      for(const [kind,path] of [['pull-request',`/repos/${repo}/pulls?state=open`],['branch',`/repos/${repo}/branches`]]){
        try{for(const item of await (kind==='branch'?namesBranches(github,repo):namesPages(github,path))){const name=kind==='branch'?item.name:item.head?.ref;if(typeof name!=='string'||/[\x00-\x1f\x7f]/.test(name))throw new Error();const row=NAMES.find(r=>r.surface==='git ref'&&r.phase===125&&matchesReference(r,name));if(row)live.push({row:row.id,kind,name,...(kind==='pull-request'?{number:item.number}:{})});}}catch{gaps.push(`${kind} inventory incomplete`);}
      }
      // A names listing cannot establish an owner-held installation barrier.
      const preflight=concurrencyPreflight(deps.concurrency?.[repo]??{repo});
      const vercel=NAMES.filter(r=>r.surface==='web'&&/^[A-Z](?=[A-Z0-9_]*_)[A-Z0-9_]+$/.test(r.keel)).map(r=>({row:r.id,state:'unknown',command:`vercel env add ${r.plates}`,scope:'Owner must choose exact project and environment; no values read'}));
      projects.push({...publicPlan,live,gaps,vercel,concurrency:preflight});
    }catch{projects.push({repo,state:'unavailable',gaps:['Complete repository/label/variable/secret-name/source facts unavailable; no empty inventory inferred']});}
  }
  const data={schema:1,mode:'preview',projects,runtime:runtimeInventory(env),activation:'No activation performed',readOnly:true};
  const projectText=projects.map(p=>p.state==='unavailable'?`${p.repo}: unavailable\n${p.gaps.join('\n')}`:[
    `${p.repo}: ${p.actions.length} proposed actions; digest ${p.digest}`,
    ...p.items.map(i=>`  ${i.row}: ${i.state}${i.selected?' (selected)':' (unselected)'}`),
    ...p.secrets.map(i=>`Owner secret command (no value read): ${i.command}`),
    ...p.vercel.map(i=>`Owner Vercel command: ${i.command} — ${i.scope}`),
    ...p.live.map(i=>`Live ${i.kind}: ${i.name}`),
    ...p.concurrency.gaps.map(g=>`Concurrency gap: ${g}`),
    ...p.concurrency.blocked.map(r=>`Concurrency blocked: run ${r.id}`),
    ...p.gaps.map(g=>`Gap: ${g}`),...p.providerScope.gaps.map(g=>`Provider scope gap: ${g}`),p.reminder,
  ].join('\n')).join('\n');
  const text=projectText+'\n'+data.runtime.map(r=>`${r.row}: ${r.activation}; ${r.consumer}${r.reason?' — '+r.reason:''}`).join('\n');
  return {data,text,exitCode:projects.some(p=>p.state==='unavailable'||p.problems?.length)?1:3};
}
