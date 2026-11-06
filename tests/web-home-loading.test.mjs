import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeLoadingSummary, renderHomeLoading } from '../lib/web/home-loading.mjs';
import { startHomeClient, POLL_INTERVAL } from '../lib/web/home-client.mjs';
import { homeView } from '../lib/web/views.mjs';
import { access, snapshot } from './helpers/web-design-pages.mjs';

test('loading status counts observed data, separates gaps, bounds names and escapes source text', () => {
  const projects = ['complete','partial','stale','unavailable',...Array(4).fill('loading')].map((state,i) => ({id:`acme-${i}`,name:`Acme ${i}`,state}));
  projects[4].name = '<img src=x onerror=alert(1)>';
  const summary = homeLoadingSummary({projects});
  assert.equal(summary.waiting, true);
  assert.match(summary.html, /3 of 8 plates have data · 2 partial or stale · 1 unavailable/);
  assert.match(summary.html, /Waiting for: &lt;img src=x onerror=alert\(1\)&gt;, Acme 5, Acme 6 and 1 more/);
  assert.doesNotMatch(summary.html, /<img|Acme 7|100%|progressbar/);
  const selected = homeLoadingSummary({projects},{projectId:'acme-5'});
  assert.match(selected.html, /0 of 1 plates have data/);
  assert.match(selected.html, /Waiting for: Acme 5/);
  assert.doesNotMatch(selected.html, /Acme 6|unavailable/);
  for (const projects of [[], [{id:'studio',state:'complete'}], [{id:'studio',state:'unavailable'}]]) {
    assert.match(renderHomeLoading({projects}), /aria-atomic="true" hidden>/);
  }
  const html = homeView(access, {...snapshot(),projects});
  assert.ok(html.indexOf('data-home-loading') < html.indexOf('data-home-search'), 'status is above the filters');
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
});

test('source status follows real requests and batches while reviewed content remains queued', async () => {
  const scheduled = [], requests = [], events = {}, renders = [];
  const element = (props = {}) => ({dataset:{},hidden:false,addEventListener(){},removeEventListener(){},closest(){return null;},...props});
  const first = {...snapshot(),projects:[{id:'studio',name:'Acme Studio',state:'loading'},{id:'lab',name:'Acme Lab',state:'loading'}]};
  const root = element({dataset:{endpoint:'/api/home',cursor:first.cursor,initialLoading:'false'},querySelectorAll(){return [];},contains(){return false;},set innerHTML(value){renders.push(value);}});
  const loading = element({dataset:{waiting:'true'}}), summary = element({innerHTML:homeLoadingSummary(first).html});
  const title = element(), detail = element(), refresh = element(), apply = element();
  const elements = {'[data-home-root]':root,'[data-home-loading]':loading,'[data-loading-title]':title,'[data-loading-detail]':detail,'[data-loading-summary]':summary,'[data-refresh]':refresh,'[data-apply-updates]':apply};
  const document = {hidden:false,querySelector:s=>elements[s]??null,addEventListener(type,fn){events[type]=fn;},removeEventListener(){}};
  const window = {location:{origin:'https://acme.test'},setTimeout(callback,delay){scheduled.push({callback,delay});return scheduled.length;},clearTimeout(){}};
  const client = startHomeClient({document,window,fetch:(_url,{signal})=>new Promise(resolve=>requests.push({resolve,signal})),renderHomeSnapshot:()=> 'updated'});
  const respond = (request, status, value) => request.resolve({status,json:async()=>value});
  try {
    assert.equal(loading.dataset.active,'false');
    const partial = scheduled[0].callback();
    assert.equal(loading.dataset.active,'true'); assert.equal(refresh.disabled,true);
    assert.match(title.textContent,/Checking your plates/); assert.match(detail.textContent,/plans, decisions and recent changes/);
    assert.match(summary.innerHTML,/0 of 2/,'starting a request does not invent progress');
    const batch = {...first,cursor:'b'.repeat(64),projects:[{id:'studio',name:'Acme Studio',state:'complete'},first.projects[1]]};
    respond(requests.at(-1),200,batch); await partial;
    assert.equal(loading.dataset.active,'false'); assert.equal(loading.hidden,false);
    assert.match(summary.innerHTML,/1 of 2 plates have data/); assert.match(summary.innerHTML,/Waiting for: Acme Lab/);
    assert.equal(apply.hidden,false); assert.deepEqual(renders,[]); assert.equal(scheduled.at(-1).delay,POLL_INTERVAL);
    const unchanged = client.poll(); respond(requests.at(-1),304); await unchanged;
    assert.match(summary.innerHTML,/1 of 2/);
    const failed = client.poll(); respond(requests.at(-1),503); await failed;
    assert.equal(loading.dataset.active,'false'); assert.match(title.textContent,/interrupted/);
    assert.match(summary.innerHTML,/1 of 2/); assert.equal(scheduled.at(-1).delay,120000);
    document.hidden=true; events.visibilitychange();
    assert.match(title.textContent,/paused/); assert.equal(loading.dataset.active,'false');
    document.hidden=false; events.visibilitychange();
    assert.equal(scheduled.at(-1).delay,0);
    const complete=client.poll();
    respond(requests.at(-1),200,{...batch,cursor:'c'.repeat(64),projects:batch.projects.map(p=>({...p,state:'complete'}))}); await complete;
    assert.match(summary.innerHTML,/2 of 2/); assert.equal(loading.hidden,true); assert.deepEqual(renders,[]);
    const denied=client.poll(); assert.equal(loading.hidden,true,'routine checks after loading do not insert a card and shift reviewed content'); root.replaceChildren=()=>renders.push('cleared');
    respond(requests.at(-1),403); await denied;
    assert.deepEqual(renders,['cleared']);
    const count=requests.length; await client.poll(); assert.equal(requests.length,count,'access loss is terminal');
  } finally {client.stop();}
});
