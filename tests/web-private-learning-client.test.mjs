import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {startPrivateLearning} from '../lib/web/private-learning-client.mjs';
import {privateLearningView} from '../lib/web/private-learning-views.mjs';
const id=c=>c.repeat(64);
function world(fetcher) {
 const values=new Map(),events=new Map();
 const node=selector=>{if(!values.has(selector))values.set(selector,{value:'',textContent:'',innerHTML:'',checked:false});return values.get(selector);};
 const model={records:[{id:id('a'),sourceDigest:id('b')}],projects:[],destinations:[],recipients:[2]};
 node('[data-private-model]').value=JSON.stringify(model);node('[data-private-csrf]').value='csrf';node('[data-private-project]').value='studio';node('[data-private-selected]').value=id('a');node('[data-private-destination]').value='set:first';
 for(const kind of ['capture','promote'])for(const key of ['shape','cost','guard','where'])node(`[data-${kind}-${key}]`).value=kind==='capture'?'secret original':'reviewed copy';
 const root={innerHTML:'private page',querySelector:node,querySelectorAll:()=>[{value:'2'}],addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)};
 const document={querySelector:s=>s==='[data-private-learning]'?root:null};
 const window={crypto:webcrypto,location:{pathname:'/learning',search:'?catalogue=personal'}};
 const calls=[],client=startPrivateLearning({document,window,fetch:async(path,opts)=>{const body=JSON.parse(opts.body);calls.push({path,body});return fetcher(path,body);}});
 return {root,client,calls,node,events,model};
}
const preview=action=>({schema:1,kind:'private-lesson-preview',action,id:id('c'),digest:id('d'),operationId:id('e'),payload:{text:{shape:'reviewed'}},expiresAt:'2026-10-30T21:00:00.000Z'});

test('private Learning client submits explicit redacted bytes only after exact review and retains uncertain operation',async()=>{
 const w=world(async(path)=>path.endsWith('/preview')?Response.json(preview('promote')):Response.json({error:'unavailable'},{status:503}));
 await w.client.review('promote');assert.deepEqual(w.calls[0].body.source,{id:id('a'),digest:id('b')});
 assert.equal(w.calls[0].body.text.shape,'reviewed copy');assert.deepEqual(w.calls[0].body.recipients,[2]);assert.equal(JSON.stringify(w.calls[0]).includes('secret original'),false);
 await w.client.apply();assert.equal(w.calls.length,1);
 w.node('[data-private-approve]').checked=true;await w.client.apply();assert.equal(w.calls.length,2);
 assert.deepEqual(Object.keys(w.calls[1].body).sort(),['csrf','digest','previewId']);assert.match(w.node('[data-private-preview]').innerHTML,new RegExp(id('e')));
 w.client.changed();await w.client.review('capture');await w.client.apply();assert.equal(w.calls.length,2);assert.equal(w.client.getState().dispatched,true);
});

test('editing during preview invalidates approval, malformed identity cannot become a link, and access loss clears private DOM',async()=>{
 let resolve;const w=world(()=>new Promise(r=>{resolve=r;}));
 const pending=w.client.review('capture');w.client.changed();resolve(Response.json(preview('capture')));await pending;assert.equal(w.client.getState().preview,null);
 const malformed=world(()=>Response.json({...preview('capture'),operationId:'<script>'}));await malformed.client.review('capture');assert.equal(malformed.client.getState().preview,null);
 const denied=world(()=>Response.json({error:'access_denied'},{status:404}));await denied.client.review('capture');assert.match(denied.root.innerHTML,/Sign in again/);assert.doesNotMatch(denied.root.innerHTML,/secret original/);
});

test('private Learning renders escaped originals, explicit recipient and destination inputs without auto-filled promotion text',()=>{
 const m={kind:'private-learning',mode:'personal',records:[{id:id('a'),text:{shape:'<script>secret</script>',cost:'cost',guard:'guard',where:'where'},provenance:{kind:'authored'}}],workspace:{id:'acme'},projects:[{id:'studio',repo:'acme/studio'}],destinations:[{kind:'set',id:'first',label:'First'}],recipients:[1,2],notice:'Current access required.'};
 const html=privateLearningView(m,{userId:1,workspace:{id:'acme',name:'Acme'},projects:[],csrf:'safe'});
 assert.match(html,/&lt;script&gt;secret&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>secret/);
 assert.match(html,/<textarea data-promote-shape maxlength="8192"><\/textarea>/);assert.match(html,/set:first/);assert.match(html,/data-private-recipient value="2"/);assert.match(html,/\/learning\?catalogue=copies/);
});
