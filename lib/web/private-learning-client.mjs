import {clearPrivateView} from './safety-client.mjs';
import {privateLearningPreviewView,privateLearningResult} from './private-learning-views.mjs';
export function startPrivateLearning({document,window,fetch}) {
 const root=document.querySelector('[data-private-learning]');if(!root)return null;
 let model;try{model=JSON.parse(root.querySelector('[data-private-model]').value);}catch{return null;}
 const csrf=root.querySelector('[data-private-csrf]').value,status=root.querySelector('[data-private-status]'),output=root.querySelector('[data-private-preview]');
 let preview=null,busy=false,dispatched=false,generation=0;
 const say=t=>{status.textContent=t;};
 const validId=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const identity=()=>Array.from(window.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 async function request(path,body) {
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),58000);
  try{const r=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf,...body})});if([401,403,404].includes(r.status)){clearPrivateView({root,document,window});return null;}return {ok:r.ok,data:await r.json()};}catch{return null;}finally{clearTimeout(timer);}
 }
 function changed(){generation++;if(dispatched)return;preview=null;output.innerHTML='';}
 async function review(action) {
  if(busy||dispatched)return;
  const input={requestId:identity()},version=generation;
  if(action==='capture'){input.projectId=root.querySelector('[data-private-project]').value;input.text=Object.fromEntries(['shape','cost','guard','where'].map(k=>[k,root.querySelector(`[data-capture-${k}]`).value]));}
  else if(action==='promote') {
   const record=model.records.find(r=>r.id===root.querySelector('[data-private-selected]').value);if(!record)return;
   input.source={id:record.id,digest:record.sourceDigest};const [kind,id]=root.querySelector('[data-private-destination]').value.split(':');input.destination={kind,id};
   input.recipients=[...root.querySelectorAll('[data-private-recipient]:checked')].map(e=>Number(e.value));input.text=Object.fromEntries(['shape','cost','guard','where'].map(k=>[k,root.querySelector(`[data-promote-${k}]`).value]));
  } else input.operationId=root.querySelector('[data-private-revoke]').value;
  busy=true;say('Checking current source and audience…');const result=await request(`/api/learning/catalogue/${action}/preview`,input);busy=false;
  if(version!==generation)return say('Inputs changed. Review again.');
  if(!result?.ok||result.data?.kind!=='private-lesson-preview'||result.data.action!==action||!['id','digest','operationId'].every(k=>validId(result.data[k])))return say('Preview unavailable or input refused. No lesson was copied.');
  preview=result.data;output.innerHTML=privateLearningPreviewView(preview);say('Review exact content, destination and recipients.');
 }
 async function apply() {
  if(busy||dispatched||!preview||!root.querySelector('[data-private-approve]')?.checked)return;
  const p=preview;dispatched=true;busy=true;output.innerHTML=`<p>Keep original operation <a href="/learning/catalogue/operations/${p.operationId}">${p.operationId}</a>. Do not submit again after uncertainty.</p>`;
  const r=await request(`/api/learning/catalogue/${p.action}/apply`,{previewId:p.id,digest:p.digest});busy=false;
  if(r?.ok&&r.data?.id===p.operationId&&['committed','revoked'].includes(r.data.state)){output.innerHTML=privateLearningResult(r.data);say('Original operation verified. Reload the catalogue for another action.');}
  else say('Response not confirmed. Recheck the original operation link; do not create another copy.');
 }
 const click=e=>{const b=e.target.closest?.('button');if(!b)return;if(b.dataset.privateSource){if(dispatched)return;changed();root.querySelector('[data-private-selected]').value=b.dataset.privateSource;root.querySelector('[data-private-promotion]').hidden=false;}if(b.dataset.privateReview)review(b.dataset.privateReview);if(b.matches('[data-private-apply]'))apply();};
 const input=e=>{if(e.target.matches('[data-private-approve]'))root.querySelector('[data-private-apply]').disabled=!e.target.checked;else changed();};
 root.addEventListener('click',click);root.addEventListener('input',input);
 return {review,apply,changed,getState:()=>({preview,busy,dispatched}),stop(){root.removeEventListener('click',click);root.removeEventListener('input',input);}};
}
if(typeof document!=='undefined'&&typeof window!=='undefined')startPrivateLearning({document,window,fetch:window.fetch.bind(window)});
