import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectSets, authorizedProjectSets, resolveProjectSet } from '../lib/web/project-sets.mjs';
import { describeRoute, setRoute, lensRoute, signInPath } from '../lib/web/navigation-routes.mjs';
import { navigation } from '../lib/web/navigation.mjs';
import { runLocation } from '../lib/web/run-views.mjs';
import { createHomeReader } from '../lib/web/home.mjs';
import { homeView } from '../lib/web/views.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { startHomeClient } from '../lib/web/home-client.mjs';
import { webConfig } from '../lib/web/config.mjs';
import { harness } from './helpers/web-http.mjs';
import { projectHarness } from './helpers/web-projects.mjs';
import { runsUiHarness } from './helpers/web-runs-ui.mjs';

const sets = [{ id: 'active', name: 'Acme active', projects: ['studio','lab'] }, { id: 'research', name: 'Acme research', projects: ['studio'] }];
const config = { projectRepoIds: { studio:102,lab:103 }, projectSets:sets };
const access = { userId:1, workspace:{id:'acme',name:'Acme'}, sourceRevision:'a'.repeat(40), projects:[{id:'studio',repoId:102,repo:'acme/studio'}] };

test('set registry is bounded and explicitly pinned; it grants no project access or pooled allowance', () => {
  const before=JSON.stringify(access), allowed=authorizedProjectSets(config,access);
  assert.deepEqual(allowed.map(s=>s.projectIds),[['studio'],['studio']]);
  assert.deepEqual(resolveProjectSet(config,access,'active').projects,access.projects);
  assert.equal(JSON.stringify(access),before);
  assert.equal(JSON.stringify(allowed).includes('lab'),false);
  assert.deepEqual(authorizedProjectSets(config,{...access,projects:[]}),[]);
  assert.throws(()=>resolveProjectSet(config,access,'missing'),/project_set_unavailable/);
  assert.throws(()=>resolveProjectSet(config,{...access,projects:[]},'active'),/project_set_unavailable/);
  for(const value of [[...sets,sets[0]],[{...sets[0],projects:['unknown']}],[{...sets[0],projects:['studio','studio']}],[{...sets[0],quota:100}],[{...sets[0],name:'bad\nname'}],Array(51).fill(sets[0])]) assert.throws(()=>validateProjectSets(value,config.projectRepoIds),/invalid_project_sets/);
  const expanded={...access,projects:[...access.projects,{id:'lab',repoId:103,repo:'acme/lab'}]};
  assert.notEqual(authorizedProjectSets(config,expanded)[0].version,allowed[0].version);
  const wrongPin={...access,projects:[{...access.projects[0],repoId:999}]};
  assert.deepEqual(authorizedProjectSets(config,wrongPin),[]);
  const h=harness();
  assert.deepEqual(webConfig({...h.input,projectSets:[sets[1]]},h.secrets).projectSets,[sets[1]]);
  assert.throws(()=>webConfig({...h.input,projectSets:sets},h.secrets),/invalid_service_configuration/);
});

test('set routes preserve index filters and login context but never transplant a receipt or project identity', () => {
  for(const path of ['/?set=active','/activity?set=active&days=7&status=failed','/routines?set=active&projectPage=2&setVersion='+'a'.repeat(64)]) {
    assert.equal(describeRoute(path)?.path,path);
    assert.equal(new URL(signInPath(path),'https://acme.test').searchParams.get('returnTo'),path);
  }
  for(const path of ['/?set=../secret','/?set=active&set=research','/projects/studio?set=active','/connections?set=active','/activity?setVersion='+'a'.repeat(64),'/projects/studio/jobs/'+'a'.repeat(64)+'?set=active'])assert.equal(describeRoute(path),null,path);
  assert.equal(setRoute('/activity?days=7&status=failed&page=3&routine=night','research').path,'/activity?set=research&days=7&status=failed');
  assert.equal(lensRoute('/activity?set=active&days=7','studio').path,'/projects/studio/activity?days=7');
  assert.equal(runLocation('activity','studio',{set:'active',setVersion:'a'.repeat(64),days:7}),'/projects/studio/activity?days=7');
  assert.equal(setRoute('/projects/studio/jobs/'+'a'.repeat(64),'active').path,'/?set=active');
  const html=navigation({...access,projectSets:authorizedProjectSets(config,access)},{path:'/?set=active'});
  assert.doesNotMatch(html,/data-project-lens=""[^>]+aria-current/);assert.match(html,/Choose project set/);assert.match(html,/href="\/activity\?set=active"/);
  assert.match(html,/href="\/routines\?set=active"/);assert.match(html,/href="\/connections"/);
  assert.doesNotMatch(html,/quota|allowance|>lab</);
});

test('Home filters before reading and binds polling/cursors to the set while reusing project caches', async () => {
  const h=projectHarness();
  h.config.projectSets=[{id:'active',name:'Acme active',projects:['studio']},{id:'research',name:'Acme research',projects:['studio']}];
  const read=createHomeReader(h.config,{fetcher:h.fetcher,now:()=>h.state.now});
  const a=await read(h.access,'fake-user-access-token',{setId:'active'});
  const b=await read(h.access,'fake-user-access-token',{setId:'research',since:a.cursor,cacheOnly:true});
  assert.equal(a.projectSet.id,'active');assert.notEqual(a.cursor,b.cursor);
  assert.equal(b.cursorState,'gap');
  assert.deepEqual(a.projects.map(p=>p.id),['studio']);
  const html=homeView({...h.access,projectSets:authorizedProjectSets(h.config,h.access)},a);
  assert.match(html,/data-endpoint="\/api\/home\?set=active"/);
  assert.match(html,/<h1 data-set-name="active">Acme active<\/h1>/);
  assert.match(html,/GitHub allowance/);assert.doesNotMatch(html,/model allowance|pooled/);
  await assert.rejects(read(h.access,'fake-user-access-token',{setId:'missing'}),/project_set_unavailable/);
  await assert.rejects(read(h.access,'fake-user-access-token',{projectId:'studio',setId:'active'}),/invalid_project_set/);
});

test('authenticated history selects only set members and refuses stale or unbound continuation', async () => {
  const h=await runsUiHarness({projectCount:5});
  h.config.projectSets=[{id:'active',name:'Acme active',projects:['studio','project-3','project-4','project-5']}];
  const signed=await h.login();
  const get=path=>h.service(h.request(path,{cookie:signed.cookie}));
  const first=await get('/api/activity?set=active&days=7');assert.equal(first.status,200);
  const model=await first.json();
  assert.deepEqual(model.projects.map(p=>p.project.id),['studio','project-3','project-4','project-5']);
  assert.equal(model.pagination.nextProjectPage,2);
  assert.equal(h.providers[1].actions.requests.length,0);
  assert.ok(model.coverage.gaps.some(g=>g.code==='set-scope'));
  assert.ok(model.items.every(item=>item.projectId!=='project-2'));
  assert.equal((await get('/api/activity?set=active&projectPage=2')).status,409);
  const query='?set=active&projectPage=2&setVersion='+model.projectSet.version;
  const next=await get('/api/activity'+query);assert.equal(next.status,200);
  const html=await (await get('/activity?set=active&days=7')).text();
  assert.match(html,/name="set" value="active"/);
  assert.match(html,/setVersion=/);assert.match(html,/Project set/);
  assert.doesNotMatch(html,/acme\/project-2/);
  const attemptLinks=[...html.matchAll(/href="([^"]+\/activity\/actions\/[^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
  assert.ok(attemptLinks.length);for(const path of attemptLinks) {
    assert.doesNotMatch(path,/set=/);assert.equal((await get(path)).status,200,path);
  }
  h.config.projectSets[0].projects=['studio'];
  assert.equal((await get('/api/activity'+query)).status,409);
  assert.equal((await get('/api/activity?set=unknown')).status,404);
  assert.equal((await get('/api/activity?set=active&set=active')).status,400);
  assert.equal((await get('/api/projects/studio/activity?set=active')).status,400);
  // An existing original project/attempt URL remains scoped and usable.
  assert.equal((await get('/api/projects/studio/activity/actions/9001/attempts/2')).status,200);
});


test('Home authenticates set reads and denies a revoked actor even after sources were read', async () => {
  const h=harness();h.config.projectSets=[{id:'active',name:'Acme active',projects:['studio']}];
  const signed=await h.login();
  const get=path=>h.service(h.request(path,{cookie:signed.cookie}));
  assert.equal((await get('/?set=active')).status,200);
  const snapshot=await (await get('/api/home?set=active')).json();assert.equal(snapshot.projectSet.id,'active');
  for(const path of ['/api/home?set=missing','/api/home?set=active&set=active','/api/projects/studio/home?set=active'])assert.ok((await get(path)).status>=400,path);
  const anonymous=await h.service(h.request('/?set=active'));assert.notEqual(anonymous.status,200);
  assert.doesNotMatch(await anonymous.text(),/Acme active/);
  let armed=true;
  const service=createWebService(h.config,{now:()=>h.state.now,fetcher:async(url,options)=>{
    const response=await h.fetcher(url,options);
    if(armed&&url.includes('home_cursor')){armed=false;h.state.members=[];}
    return response;
  }});
  const denied=await service(h.request('/api/home?set=active',{cookie:signed.cookie}));
  assert.equal(armed,false,'revoke after source/cache reads, before final authorization');
  assert.equal(denied.status,404);assert.doesNotMatch(await denied.text(),/Acme active|projectSet|studio/);
});

test('Home browser polling retains the set on conditional and forced refresh', async () => {
  const requests=[],root={dataset:{endpoint:'/api/home?set=active',cursor:'a'.repeat(64)},querySelectorAll:()=>[]};
  const document={hidden:false,querySelector:selector=>selector==='[data-home-root]'?root:null,addEventListener(){},removeEventListener(){}};
  const window={location:{origin:'https://acme.test'},setTimeout(){return 1;},clearTimeout(){}};
  const client=startHomeClient({document,window,fetch:async(url,options)=>{requests.push({url,options});return {status:304};},renderHomeSnapshot:()=>''});
  assert.ok(client);await client.poll();await client.poll(true);client.stop();
  for(const request of requests)assert.equal(new URL(request.url).searchParams.get('set'),'active');
  assert.equal(requests[0].options.headers['If-None-Match'],'"'+'a'.repeat(64)+'"');
  assert.equal(new URL(requests[1].url).searchParams.get('fresh'),'1');
  for(const endpoint of ['/api/home?set=../secret','/api/home?set=active&set=research']){
    root.dataset.endpoint=endpoint;assert.equal(startHomeClient({document,window}),null);
  }
});


test('applying a renamed set updates existing shell labels and keeps another set unchanged', async () => {
  const labels=[{dataset:{setName:'active'},textContent:'Old name'},{dataset:{setName:'research'},textContent:'Research'}];
  const handlers={},apply={addEventListener(name,fn){handlers[name]=fn;},removeEventListener(){}},root={dataset:{endpoint:'/api/home?set=active',cursor:'a'.repeat(64)},querySelectorAll:()=>[],contains:()=>false};
  const document={hidden:false,querySelector:selector=>({'[data-home-root]':root,'[data-apply-updates]':apply}[selector]??null),querySelectorAll:()=>labels,addEventListener(){},removeEventListener(){}};
  const window={location:{origin:'https://acme.test'},setTimeout(){return 1;},clearTimeout(){},scrollTo(){}};
  const client=startHomeClient({document,window,fetch:async()=>({status:200,json:async()=>({schema:1,cursor:'b'.repeat(64),projects:[],projectSet:{id:'active',name:'New name'}})}),renderHomeSnapshot:()=>'<p>New view</p>'});
  await client.poll();assert.equal(labels[0].textContent,'Old name');
  handlers.click();assert.equal(labels[0].textContent,'New name');assert.equal(labels[1].textContent,'Research');client.stop();
});
