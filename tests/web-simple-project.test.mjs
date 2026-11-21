// Phase 196 increment 2: actionable work, on-card Assign and shared quota advice.
// Acme fixtures exercise source projections; hosted apply and quota delivery are not activated.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assignmentRecommendation, readAssignmentQuota} from '../lib/project-assignment.mjs';
import {simpleProject, simpleProjectLines} from '../lib/web/simple-project-model.mjs';
import {renderSimpleProject} from '../lib/web/simple-project-views.mjs';
import {renderHomeSnapshot, projectView} from '../lib/web/views.mjs';
import {homeText} from '../lib/home.mjs';
import {homeSnapshot} from '../lib/work-items.mjs';
import {startCardAnswers, createPollState, transitionPoll} from '../lib/web/home-client.mjs';
import {snapshot, backlog, access} from './helpers/web-design-pages.mjs';
import {createHomeReader} from '../lib/web/home.mjs';
import {projectHarness} from './helpers/web-projects.mjs';

const now = Date.parse('2026-10-21T16:00:00.000Z');
const config = {agents:{claude:{},codex:{}},backlog:{routes:['session','local-host']}};
const provider = (id, usedPct, more = {}) => ({id,status:'green',fresh:true,windows:[{id:`${id}.weekly`,kind:'weekly',usedPct,pacePct:90}],...more});
const quota = (providers = [provider('claude',65),provider('codex',40)]) => ({snapshot:{v:1,generatedAt:now,providers}});
function data() {
  const value = {...snapshot(),backlog:backlog()};
  value.projectWorkspace = simpleProject(value,'studio',{config,recommendation:assignmentRecommendation(config,quota(),{now})});
  return value;
}

test('the project has one ordered backlog with four states, on-row Assign, and rendered source details', () => {
  const value=data(), model=value.projectWorkspace, before=JSON.stringify(value);
  assert.deepEqual([...new Set(model.items.map(i=>i.state))],['Agent working','Needs you','Ready','Done']);
  const keys=value.backlog.lanes.flatMap(l=>l.lane==='waiting'?[]:l.items.filter(i=>i.projectId==='studio').map(i=>i.key));
  assert.deepEqual(model.items.map(i=>i.key),keys);
  const html=renderHomeSnapshot(value,{projectId:'studio'}), cli=homeText(value,{projectId:'studio'});
  assert.equal((html.match(/<h2 id="backlog-title">Backlog<\/h2>/g)||[]).length,1);
  assert.equal((html.match(/class="simple-assign"/g)||[]).length,model.items.filter(i=>i.state==='Ready').length);
  assert.match(html,/<\/div><\/details><details class="simple-assign"/, 'Assign is outside the closed reading details');
  assert.match(html,/Done when<\/h3><p>Publish <strong>Acme work<\/strong>/);
  assert.match(html,/plates home --attach studio:phase:3 --route session --provider codex/);
  assert.doesNotMatch(html,/--yes|plate-release|main<\/span>|data-message-type/);
  for (const item of model.items) assert.ok(cli.includes(item.title));
  assert.match(cli,/codex: 60% of its week left/);
  assert.ok(cli.includes(simpleProjectLines(model).join('\n')));
  assert.equal(JSON.stringify(value),before);
  const full=projectView(value.projects[0],access,value);
  assert.doesNotMatch(full,/data-review-start-slot><section/);
  assert.match(full,/<link rel="stylesheet" href="\/assets\/home.css">/, 'project decision cards load the shared card styles');
});

test('waiting work remains behind its dependency or in source detail, never actionable', () => {
  const model=data().projectWorkspace;
  assert.equal(model.items.find(i=>i.ref==='9').blocked[0].ref,'5');
  assert.equal(model.waiting[0].ref,'4');
  const html=renderSimpleProject(model,{id:'studio',repo:'acme/studio'});
  assert.match(html,/Work waiting on this item \(1\)/);
  assert.match(html,/Other work, waiting \(1\)/);
  assert.match(html,/needs shaping/);
  for (const item of [...model.waiting,...model.items.flatMap(i=>i.blocked)]) assert.equal(item.canAssign,false);
});

test('Assign remains visible with an explanation when providers or attachment routes are absent', () => {
  for (const [settings,reason] of [[{agents:{}},'No agents are configured'],[{agents:{codex:{}},backlog:{routes:[]}},'No attachment route is enabled']]) {
    const value=data(), model=simpleProject(value,'studio',{config:settings}), html=renderSimpleProject(model,value.projects[0]);
    assert.match(html,/>Assign<\/summary>/);
    assert.ok(html.includes(reason));
    assert.doesNotMatch(html,/plates home --attach/);
    assert.ok(simpleProjectLines(model).join('\n').includes(reason));
  }
});

test('project decisions reuse Home answer cards; equal releases and empty sections stay hidden', () => {
  const value=data(), card=value.home.glance.cards.find(c=>c.projectId==='studio');
  const html=renderHomeSnapshot(value,{projectId:'studio'});
  assert.ok(html.includes(`data-card="${card.key}"`));
  assert.match(html,/data-answer=/);
  value.home.glance.cards=[];
  value.backlog={plates:[{projectId:'studio',state:'read',coverage:'complete'}],lanes:[]};
  value.projectWorkspace=simpleProject(value,'studio',{config});
  const empty=renderHomeSnapshot(value,{projectId:'studio'});
  assert.doesNotMatch(empty,/Needs you|Backlog|Nothing|plate-release|Other work/);
  value.projects[0].state='unavailable'; value.projects[0].gaps=[{reason:'Acme source not read'}];
  value.projectWorkspace=simpleProject(value,'studio',{config});
  assert.match(renderHomeSnapshot(value,{projectId:'studio'}),/Acme source not read/);
});

test('Assign recommends the most remaining capacity only among eligible configured agents', () => {
  const result=assignmentRecommendation(config,quota(),{now});
  assert.equal(result.provider,'codex');
  assert.match(result.why,/codex: 60% of its week left; the most room/);
  const pace=quota([provider('claude',10,{windows:[{id:'week',kind:'weekly',usedPct:10,pacePct:15}]}),provider('codex',40)]);
  assert.equal(assignmentRecommendation(config,pace,{now}).provider,'codex','more unused quota does not bypass pace eligibility');
  const configured=assignmentRecommendation({agents:{claude:{}}},quota(),{now});
  assert.equal(configured.provider,'claude','unconfigured agents cannot be offered');
  const exhausted=quota([provider('claude',99),provider('codex',98)]);
  assert.equal(assignmentRecommendation(config,exhausted,{now}).provider,null);
});

test('stale, unknown, future and malformed capacity never wins or throws', () => {
  const bad=[null,{snapshot:null},quota([]),{snapshot:{...quota().snapshot,generatedAt:now-86400000}},
    {snapshot:{...quota().snapshot,generatedAt:now+1}}, {snapshot:{...quota().snapshot,generatedAt:'yesterday'}},
    quota([provider('claude',40,{fresh:false}),provider('codex',30)]),
    quota([provider('claude',40,{status:'unknown'}),provider('codex',30)]),
    quota([provider('claude',40,{windows:{}}),provider('codex',30)]),
    quota([provider('claude',NaN),provider('codex',30)]),quota([provider('claude',101),provider('codex',30)])];
  for (const observation of bad) assert.equal(assignmentRecommendation(config,observation,{now}).provider,null,JSON.stringify(observation));
});

test('the default quota adapter is a bounded credential-free loopback read, not an invented model field', async () => {
  const calls=[];
  const result=await readAssignmentQuota({env:{},fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return Response.json(quota().snapshot);}});
  assert.equal(assignmentRecommendation(config,result,{now}).provider,'codex');
  assert.match(calls[0].url,/^http:\/\/127\.0\.0\.1:/);
  assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers.authorization,undefined);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  const remote=await readAssignmentQuota({url:'https://acme.example/quota',fetchImpl:()=>{throw Error('must not fetch remote');}});
  assert.equal(remote.snapshot,null);
});

test('the hosted reader checks access before quota and injects its transport into the bounded adapter', async () => {
  const h=projectHarness(), calls=[];
  const read=createHomeReader(h.config,{fetcher:h.fetcher,now:()=>h.state.now,assignmentQuota:async options=>{calls.push(options);return {snapshot:null};}});
  await assert.rejects(read(h.access,'fake-token',{projectId:'unknown',backlog:true}),/access_denied/);
  assert.equal(calls.length,0);
  const value=await read(h.access,'fake-token',{projectId:'studio',backlog:true,cacheOnly:true});
  assert.equal(calls[0].fetchImpl,h.fetcher);
  assert.ok(value.projectWorkspace);
});

test('Assign copy is delegated across refreshed rows and never invokes an attachment', async () => {
  let click, copied=[];
  const root={addEventListener:(type,f)=>{if(type==='click')click=f;},querySelectorAll:()=>[],contains:()=>true};
  const window={navigator:{clipboard:{writeText:async text=>copied.push(text)}},addEventListener:()=>{},setTimeout,clearTimeout};
  startCardAnswers({document:{querySelector:()=>null},window,root,fetch:()=>{throw Error('copy must not send a mutation');}});
  for (const command of ['plates home --attach studio:phase:3 --route session --provider codex','plates home --attach studio:phase:9 --route local-host --provider claude']) {
    const status={textContent:''}, assign={querySelector:()=>status}, button={dataset:{copy:command},closest:selector=>selector==='.simple-assign'?assign:button,matches:s=>s==='[data-copy]'};
    await click({target:button});
    assert.match(status.textContent,/Copied/);
  }
  assert.equal(copied.length,2);
  const first=data(), changed={...first,cursor:'d'.repeat(64),cursorState:'changed'};
  const state=transitionPoll(createPollState(first.cursor),{type:'response',status:200,snapshot:changed});
  assert.equal(state.pending.projectWorkspace,changed.projectWorkspace);
  assert.match(renderHomeSnapshot(state.pending,{projectId:'studio'}),/class="simple-assign"/);
});

test('source text and links remain escaped in item and assignment details', () => {
  const value=data(), item=value.projectWorkspace.items[0];
  item.title='<img src=x onerror=alert(1)> **Acme**'; item.done='<script>bad</script>';item.source={url:'javascript:alert(1)'};
  const html=renderSimpleProject(value.projectWorkspace,value.projects[0]);
  assert.match(html,/&lt;img/); assert.match(html,/<strong>Acme<\/strong>/);
  assert.doesNotMatch(html,/<img|<script|href="javascript:/);
});


test('equal production hides deployment controls and behind production uses only checked promote', () => {
  const sha='a'.repeat(40), old='b'.repeat(40);
  for (const behind of [false,true]) {
    const value=data(), project={...value.projects[0],release:{state:behind?'behind':'current',main:sha,production:{sha:behind?old:sha,at:'2026-10-20T12:00:00Z',checkedAt:'2026-10-21T12:00:00Z',deployment:'acme-deploy'},ahead:behind?2:0,why:null}};
    Object.assign(value,homeSnapshot([project],{can:{form:'web'},today:'2026-10-21'}));
    value.projectWorkspace=simpleProject(value,'studio',{config});
    const html=renderHomeSnapshot(value,{projectId:'studio'});
    assert.doesNotMatch(html,/plate-release/);
    if (behind) { assert.match(html,/data-deploy-command/); assert.match(html,/plates promote/); assert.doesNotMatch(html,/vercel deploy|--yes/); }
    else assert.doesNotMatch(html,/data-deploy-command/);
  }
});


test('an unread assignment source suppresses Assign commands and retains its coverage gap', () => {
  const value=data();
  value.backlog.claims=[{projectId:'studio',read:false,why:'Acme assignment source unavailable'},{projectId:'other',read:false,why:'Other project unavailable'}];
  const model=simpleProject(value,'studio',{config});
  assert.ok(model.items.some(i=>i.state==='Ready'));
  assert.ok(model.items.every(i=>i.assign.length===0));
  assert.deepEqual(model.gaps,['Agent assignments could not be read: Acme assignment source unavailable']);
  const html=renderSimpleProject(model,value.projects[0]);
  assert.match(html,/Agent assignments could not be read/);
  assert.doesNotMatch(html,/plates home --attach|Other project unavailable/);
});
