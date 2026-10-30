// Shared local demo contracts. Random synthetic sessions are not production login.
import {createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const projects=[{id:'acme-canvas',repoId:102,repo:'acme/canvas'},{id:'acme-garden',repoId:103,repo:'acme/garden'}];
export const readJSON=path=>JSON.parse(readFileSync(path,'utf8'));
export function authenticate(config,token){
 if(typeof token!=='string')throw Error('unauthenticated');
 const digest=Buffer.from(hash(token),'hex');
 const session=config.sessions.find(s=>timingSafeEqual(Buffer.from(s.digest,'hex'),digest));
 if(!session||session.revoked||session.expiresAt<=Date.now())throw Error('unauthenticated');
 return {actorId:session.actorId,role:session.role,projects:session.projects};
}
export function event(store,id,data){
 return store.atomic(()=>{const old=store.read('loop-event',id);if(old){if(hash(old.data)!==hash(data))throw Error('event-conflict');return old;}
 const record={id,sequence:store.all('loop-event').length+1,data};store.put('loop-event',id,record);return record;});
}
export function taskOf(root,id){if(!/^acme-[a-z0-9-]{1,60}$/.test(id))throw Error('invalid-task');return readJSON(join(root,'tasks',`${id}.json`));}
export function assertApproval(store,task,actor){
 if(!actor.projects.includes(task.project)||actor.actorId!==task.actor)throw Error('worker-account-refused');
 if(task.lesson&&lessonRule(task.lesson)!==task.mode)throw Error('approved-rule-mismatch');
 if(task.risk==='external')throw Error('external-effects-forbidden');
 if(task.risk!=='low'){
 const p=store.read('loop-approval',task.id);
 if(!p||p.digest!==hash(task)||p.actorId!==actor.actorId)throw Error('exact-human-approval-required');
 }
}
// Finite interpreter for this fixture, not a model or arbitrary executable lesson.
export function lessonRule(lesson){
 if(!lesson?.record||lesson.digest!==hash(lesson.record))throw Error('lesson-copy-changed');
 const rules={'Trim outer whitespace; preserve letter case.':'trim','Trim outer whitespace and lowercase all identifiers.':'lowercase'};
 const mode=rules[lesson.record.text?.guard];
 if(!mode||lesson.mode!==mode)throw Error('lesson-rule-refused');return mode;
}
