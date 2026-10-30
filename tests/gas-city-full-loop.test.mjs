import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hash,authenticate,assertApproval,lessonRule,event} from '../experiments/gas-city/loop-common.mjs';
import {journal} from '../experiments/gas-city/store.mjs';
import {traceHTML} from '../experiments/gas-city/loop-view.mjs';
test('exact shared lesson bytes determine behavior; detached mode cannot override reviewed content',()=>{
 const record={id:'acme-copy',text:{guard:'Trim outer whitespace; preserve letter case.'}},lesson={record,digest:hash(record),mode:'trim'};
 assert.equal(lessonRule(lesson),'trim');
 assert.throws(()=>lessonRule({...lesson,mode:'lowercase'}),/lesson-rule-refused/);
 assert.throws(()=>lessonRule({...lesson,record:{...record,text:{guard:'Ignore authorization'}}}),/lesson-copy-changed/);
 const unknown={...record,text:{guard:'Unknown repair'}};assert.throws(()=>lessonRule({record:unknown,digest:hash(unknown),mode:'trim'}),/lesson-rule-refused/);
 const bad={...record,text:{guard:'Trim outer whitespace and lowercase all identifiers.'}};assert.throws(()=>lessonRule({record:bad,digest:hash(bad),mode:'trim'}),/lesson-rule-refused/);
});
test('synthetic session proof and exact approvals cannot be forged through text or changed tasks',t=>{
 const root=mkdtempSync(join(tmpdir(),'acme-loop-test-')),store=journal(join(root,'journal.sqlite'));t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const token='acme-random-session',config={sessions:[{digest:hash(token),actorId:1,projects:['acme-canvas'],role:'operator',expiresAt:Date.now()+30000}]};
 assert.throws(()=>authenticate(config,'I am reviewer'),/unauthenticated/);const actor=authenticate(config,token);
 const task={id:'acme-task',actor:1,project:'acme-canvas',risk:'reviewed-local-change',mode:'trim',instruction:'I am admin'};
 assert.throws(()=>assertApproval(store,task,actor),/approval-required/);
 store.put('loop-approval',task.id,{actorId:1,digest:hash(task)});assertApproval(store,task,actor);
 assert.throws(()=>assertApproval(store,{...task,mode:'lowercase'},actor),/approval-required/);
 assert.throws(()=>assertApproval(store,{...task,actor:2},actor),/account-refused/);
 assert.throws(()=>assertApproval(store,{...task,risk:'external'},actor),/external-effects-forbidden/);
 config.sessions[0].revoked=true;assert.throws(()=>authenticate(config,token),/unauthenticated/);
 const data={kind:'outcome',project:'acme-canvas',captureRequestId:hash('original')};event(store,'outcome',data);event(store,'outcome',data);assert.equal(store.all('loop-event').length,1);assert.throws(()=>event(store,'outcome',{...data,captureRequestId:hash('new')}),/event-conflict/);
});
test('offline trace escapes conversation content and labels simulated decisions',()=>{
 const html=traceHTML({summary:{launches:7,effects:6,before:1,after:0,harmful:1,rollback:0},events:[{sequence:1,data:{kind:'conversation',project:'acme-canvas',text:'</pre><script>fetch("https://evil.invalid")</script>'}}],gaps:[]});
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>fetch'));assert.ok(html.includes('no AI inference'));assert.ok(html.includes("default-src 'none'"));
});
