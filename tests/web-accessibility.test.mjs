// Regression interactions for the workspace accessibility audit. Synthetic Acme data only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokens,controls} from '../lib/web/design.mjs';
import {errorView} from '../lib/web/views.mjs';
import {clearPrivateView} from '../lib/web/safety-client.mjs';
import {startBacklogClient} from '../lib/web/backlog-client.mjs';
import {startJobClient} from '../lib/web/job-client.mjs';
import {backlogView,recurringView,agentsView,renderBacklog,backlogStyles} from '../lib/web/backlog-views.mjs';
import {navigation} from '../lib/web/navigation.mjs';
import {describeRoute,lensRoute} from '../lib/web/navigation-routes.mjs';
import {versionsView,fleetStyles} from '../lib/web/fleet-views.mjs';
import {jobStyles} from '../lib/web/job-views.mjs';
import {walkStyles} from '../lib/web/walk-views.mjs';
import {plateWorkspaceStyles} from '../lib/web/plate-workspace-styles.mjs';
import {startReviewClient,HOLD_MS} from '../lib/web/review-client.mjs';
import {renderReviewCard,docketItems} from '../lib/web/review-views.mjs';
import {reviewSnapshot} from './helpers/review-fixture.mjs';

const access={csrf:'fake-acme-csrf',workspace:{name:'Acme'},projects:[{id:'studio',name:'Acme Studio',repo:'acme/studio'}]};
const model={schema:1,plates:[],lanes:[],agents:{plates:[],providers:[],routes:[]},pending:{items:[],plates:[]}};
const rule=(css,selector)=>css.split(`${selector}{`)[1]?.split('}')[0]??'';

test('forced colours give status graphics system colours',()=>{
  const forced=tokens.split('@media(forced-colors:active)')[1];
  for(const name of ['ok','caution','danger','accent'])assert.match(forced,new RegExp(`--${name}:(CanvasText|LinkText|Highlight)[;}]`));
});

test('error recovery returns to the workspace unless sign-in is required',()=>{
  for(const status of [400,403,404,500,503]){
    const html=errorView(status,'acme_error');
    assert.match(html,/<a class="button" href="\/">Back to your workspace<\/a>/);
    assert.equal(html.includes('href="/signin"'),status===403);
  }
  assert.match(errorView(401,'sign_in_required',{signIn:'/signin?returnTo=%2Fbacklog'}),/class="button" href="\/signin\?returnTo=%2Fbacklog"/);
});

function privatePage(path){
  const removed=[],focused=[];
  const heading={focus:()=>focused.push('heading')};
  const main={innerHTML:'Acme private content',querySelector:s=>s==='h1'?heading:null};
  const root={dataset:{loading:'true'},closest:()=>main,querySelector:()=>null,addEventListener(){},removeEventListener(){}};
  const document={querySelector:s=>s==='[data-backlog-root]'||s==='[data-job-root]'?root:['[data-navigation]','[data-page-footer]'].includes(s)?{remove:()=>removed.push(s)}:null};
  const timers=[];
  const window={location:{pathname:path,search:''},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
  return {root,main,document,window,removed,focused,timers};
}
function cleared(p,path){
  assert.doesNotMatch(p.main.innerHTML,/Acme private content/);
  assert.match(p.main.innerHTML,new RegExp(`href="/signin\\?returnTo=${encodeURIComponent(path)}"`));
  assert.deepEqual(p.removed,['[data-navigation]','[data-page-footer]']);
  assert.deepEqual(p.focused,['heading']);
  assert.equal(p.document.title,'Sign in again · Plates');
}
test('shared cleanup removes the live footer and focuses the return action screen',()=>{
  const p=privatePage('/backlog');clearPrivateView(p);cleared(p,'/backlog');
});
test('Backlog, Recurring and Agents clear private content on access loss and stop polling',async()=>{
  for(const view of ['backlog','goals','recurring','agents'])for(const status of [401,403,404]){
    const path=view==='goals'?'/backlog/goals':`/${view}`,p=privatePage(path);p.root.dataset.view=view;
    const render=()=>assert.fail('a denied response must never render private data');
    const client=startBacklogClient({...p,fetch:async()=>({status}),renderBacklog:render,renderByGoal:render,renderSidebar:render,renderRecurring:render,renderAgents:render});
    await p.timers.shift()();await client.done;cleared(p,path);assert.equal(p.timers.length,0);
  }
});
test('Jobs clears access loss but retains a missing original receipt',async()=>{
  for(const status of [401,403,404])for(const missing of [false,true]){
    if(missing&&status!==404)continue;
    const path='/projects/studio/jobs',p=privatePage(path),output={innerHTML:''},notice={textContent:''};
    p.root.querySelector=s=>({'[data-job-model]':{value:JSON.stringify({project:access.projects[0],routineId:'night'})},'[data-job-output]':output,'[data-job-status]':notice})[s]??null;
    const client=startJobClient({...p,fetch:async()=>Response.json({error:missing?'job_not_found':'access_denied'},{status})});
    await client.review();
    if(missing){assert.equal(p.main.innerHTML,'Acme private content');assert.match(notice.textContent,/No receipt is visible/);}
    else cleared(p,path);
  }
});

test('sticky walk navigation clears the header and approval bars cover content',()=>{
  assert.match(rule(walkStyles,'.walk-nav'),/top:90px/);
  for(const [css,selector] of [[jobStyles,'.job-approval'],[fleetStyles,'.fleet-approval']]){
    const bar=rule(css,selector);assert.match(bar,/background:var\(--surface-solid\)/);assert.match(bar,/z-index:5/);
    assert.match(bar,/padding(?:-bottom)?:[^;]*max\(16px,env\(safe-area-inset-bottom\)\)/);
  }
});
test('Versions exposes independent project articles and labelled facts at every width',()=>{
  const html=versionsView({projects:[{project:access.projects[0],versions:{practice:'1',lock:'1'}}]},access);
  assert.doesNotMatch(html,/role="(?:table|row)"/);
  assert.match(html,/<article class="fleet-row"><div><h3><a[^>]*>Acme Studio<\/a><\/h3>/);
  assert.match(html,/<dt>Practice<\/dt><dd>1<\/dd>/);
});

test('global destinations stay reachable with one current page and main content first',()=>{
  for(const [view,path] of [[backlogView,'/backlog'],[recurringView,'/recurring'],[agentsView,'/agents']]){
    const html=view(access,model),destination=path.slice(1);
    assert.equal(describeRoute(path).destination,destination);
    assert.match(html,new RegExp(`data-nav-destination="${destination}" href="${path}" aria-current="page"`));
    assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
    assert.ok(html.indexOf('<h1>')<html.indexOf('class="backlog-side"'));
    assert.ok(html.indexOf('<h1>')<html.indexOf('<h2>'));
    assert.equal(lensRoute(path,'studio').path,path,'workspace-only views must not invent project routes');
  }
  for(const arrangement of ['goals','history']){
    const html=backlogView(access,model,{arrangement});
    assert.equal(describeRoute(`/backlog/${arrangement}`).destination,'backlog');
    assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  }
  const project= navigation(access,{path:'/projects/studio'});
  for(const destination of ['backlog','recurring','agents'])assert.match(project,new RegExp(`data-nav-destination="${destination}" href="/${destination}"`));
  assert.match(rule(backlogStyles,'.backlog-side'),/order:-1/);
  assert.match(backlogStyles.split('@media(max-width:600px)')[1],/\.backlog-side\{order:0/);
  assert.doesNotMatch(plateWorkspaceStyles,/\.message-sidebar-links\{display:none/);
});

test('answer choices stay links to where Home answers, each a full touch target',()=>{
  const html=renderBacklog({...model,lanes:[{lane:'yours',title:'Yours',items:[{key:'studio:phase:1',projectId:'studio',title:'Acme choice',question:{ask:'Ship?',choices:['Yes','No'],recommend:'Yes'},answers:[{id:'yes'}]}]}]});
  assert.match(html,/<a class="p-badge" href="\/review" data-recommended>Yes · Recommended<\/a><a class="p-badge" href="\/review">No<\/a>/);
  assert.match(backlogStyles,/\.backlog-row a\{[^}]*min-height:44px/, 'row links (choices and actions, both inline-flex) are full touch targets');
});

// A minimal event-driven review surface: rendering is captured, and handlers use
// the same controls as the real card. The clock advances only when asked.
function reviewPage(){
  const events={},documentEvents={},timers=new Map(),sent=[];let id=0;
  const button={focus(){},setAttribute(){}};
  const panel={hidden:true,querySelector:()=>button};
  const toast={hidden:true,innerHTML:'',contains:node=>node?.inToast===true};
  const nodes={'[data-review-csrf]':{value:'fake-acme-csrf'},'[data-review-toast]':toast,'[data-review-later]':panel,'[data-review-choose-date]':button,'[data-review-reason]':{value:'Acme needs another observation'},'[data-review-until-date]':{value:'2099-01-01'}};
  const root={dataset:{endpoint:'/api/home'},querySelector:s=>nodes[s]??null,querySelectorAll:()=>[],contains:()=>true,insertAdjacentHTML(){},addEventListener:(type,fn)=>events[type]=fn,removeEventListener(){}};
  const document={querySelector:()=>root,activeElement:null,addEventListener:(type,fn)=>documentEvents[type]=fn,removeEventListener(){}};
  const window={setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),scrollTo(){},addEventListener(){},removeEventListener(){}};
  const fetch=async(url,options)=>{if(url==='/api/home')return Response.json(reviewSnapshot());sent.push(JSON.parse(options.body));return Response.json({state:'written',until:'2099-01-01'});};
  const target=selector=>({dataset:{reviewUntil:'date'},inToast:selector==='[data-review-undo]',matches:s=>s===selector,closest:s=>s==='button,a'?target(selector):s==='[data-review-toast]'&&selector==='[data-review-undo]'?toast:null});
  const click=selector=>events.click({target:target(selector)});
  const tick=async()=>{const due=[...timers.values()];timers.clear();for(const t of due)t.fn();await new Promise(r=>setImmediate(r));};
  return {root,document,window,fetch,events,documentEvents,panel,toast,sent,target,click,tick,timers};
}
test('Choose date opens without deferring; toast hover and focus keep Undo available',async()=>{
  const card=renderReviewCard(docketItems(reviewSnapshot())[0]);
  assert.match(card,/data-review-choose-date[^>]*aria-keyshortcuts="Shift\+N"[^>]*>Choose date…<\/button>/);
  for(const mode of ['focus','pointer']){
    const p=reviewPage(),client=startReviewClient(p);await new Promise(r=>setImmediate(r));
    p.click('[data-review-choose-date]');assert.equal(p.panel.hidden,false);assert.equal(client.session.holds.length,0);assert.equal(p.sent.length,0);
    p.click('[data-review-not-now]');assert.equal(client.session.holds.length,1);
    const target=p.target('[data-review-undo]');
    if(mode==='focus'){p.document.activeElement=target;p.events.focusin({target});}
    else p.events.pointerover({target});
    await p.tick();assert.equal(p.sent.length,0);assert.equal(p.toast.hidden,false);assert.equal(client.session.holds.length,1);
    if(mode==='focus'){p.document.activeElement=null;p.events.focusout({target,relatedTarget:null});}
    else p.events.pointerout({target,relatedTarget:null});
    assert.ok([...p.timers.values()].some(t=>t.ms===HOLD_MS));
    await p.tick();assert.equal(p.sent.length,1);client.stop();
  }
});
test('the explicit date action sends the selected date and reason through the existing writer',async()=>{
  const p=reviewPage(),client=startReviewClient(p);await new Promise(r=>setImmediate(r));
  p.click('[data-review-choose-date]');p.click('[data-review-until]');
  assert.equal(p.sent.length,0,'the Undo window still precedes the write');
  await p.tick();assert.equal(p.sent.length,1);assert.equal(p.sent[0].until,'2099-01-01');assert.equal(p.sent[0].why,'Acme needs another observation');client.stop();
});
test('finishing an earlier answer does not restart a focused final Undo timer',async()=>{
  const p=reviewPage();p.root.dataset.order=JSON.stringify(docketItems(reviewSnapshot()).slice(0,2).map(e=>e.key));
  const client=startReviewClient(p);await new Promise(r=>setImmediate(r));
  p.click('[data-review-not-now]');p.click('[data-review-not-now]');
  const target=p.target('[data-review-undo]');p.events.focusin({target});
  await p.tick();assert.equal(p.sent.length,1,'only the earlier answer is sent');
  await p.tick();assert.equal(p.sent.length,1,'the final answer stays held while Undo is focused');
  p.click('[data-review-undo]');await p.tick();assert.equal(p.sent.length,1,'Undo remains usable after the earlier answer finishes');client.stop();
});
