// Synthetic authentication and GitHub snapshots; actual Plates private-learning
// service, AES-GCM store and unchanged migration 016 executed by persistent PGlite.
// No network fallback, provider credentials, GitHub writes or production activation.
import { PGlite } from '@electric-sql/pglite';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createPrivateLearning } from '../../lib/web/private-learning.mjs';
import { gitBlob } from '../../lib/web/decision-github.mjs';
import { WebError } from '../../lib/web/common.mjs';

const revision='a'.repeat(40),tree='c'.repeat(40),workspaceRepo='acme/loop-private';
const projects=[{id:'acme-canvas',repoId:102,repo:'acme/canvas'},{id:'acme-garden',repoId:103,repo:'acme/garden'}];
const syntheticToken='acme-synthetic-github-read-only';
const repositoryQuery='query DecisionRepository($id:ID!){node(id:$id){... on Repository{id databaseId nameWithOwner isPrivate viewerPermission defaultBranchRef{id name repository{id databaseId} target{... on Commit{oid tree{oid}}}}}}}';
const fail=code=>{throw new WebError(code,403);};

async function localKey(directory) {
 if(typeof directory!=='string'||!isAbsolute(directory))fail('explicit_learning_directory_required');
 try {await mkdir(directory,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 const stat=await lstat(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))fail('private_learning_directory_required');
 const marker=join(directory,'loop-learning.json');
 let bytes;
 try {
  const markerStat=await lstat(marker);
  if(!markerStat.isFile()||markerStat.isSymbolicLink()||markerStat.nlink!==1||markerStat.size>4096||(markerStat.mode&0o077))fail('invalid_learning_marker');
  bytes=await readFile(marker,'utf8');
 } catch(error) {
  if(error.code!=='ENOENT')throw error;
  if((await readdir(directory)).length)fail('unowned_learning_directory');
  bytes=JSON.stringify({schema:1,kind:'acme-loop-learning-fixture',key:randomBytes(32).toString('base64')});
  await writeFile(marker,bytes,{flag:'wx',mode:0o600});
 }
 const markerValue=JSON.parse(bytes);
 if(markerValue.schema!==1||markerValue.kind!=='acme-loop-learning-fixture'||typeof markerValue.key!=='string')fail('invalid_learning_marker');
 const key=Buffer.from(markerValue.key,'base64');
 if(key.length!==32||key.toString('base64')!==markerValue.key)fail('invalid_learning_marker');
 return key;
}

/** One owner per directory; close before reopening. No live auth or SQL service. */
export async function createLoopLearning({directory,authenticate,now=Date.now}) {
 if(typeof authenticate!=='function'||typeof now!=='function')fail('learning_dependencies_required');
 const encryptionKey=await localKey(directory),db=new PGlite(join(directory,'postgres'));
 let closed=false;
 try {
  await db.waitReady;
  const existing=await db.query("SELECT to_regprocedure('public.plates_private_lesson_rpc(text,text,text,text,jsonb)') AS rpc");
  if(!existing.rows[0].rpc) {
   await db.exec("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;");
   await db.exec(await readFile(new URL('../../lib/web/migrations/016-private-lessons.sql',import.meta.url),'utf8'));
  }
  const config={appId:11,installationId:21,ownerIds:[1,2],workspace:{id:'acme',repoId:101,manifestPath:'workspace.json',membersPath:'members.json'},projectRepoIds:Object.fromEntries(projects.map(p=>[p.id,p.repoId])),encryptionKey,storageUrl:'https://acme-loop.invalid',storageKey:'acme-synthetic-local-sql',lessons:{enabled:true,verifiedAt:'2026-10-20T00:00:00.000Z',restoreReconciledAt:'2026-10-20T00:00:00.000Z'}};
  const files={
   'workspace.json':JSON.stringify({version:1,id:'acme',name:'Acme synthetic loop',repo:workspaceRepo,projects:projects.map(({id,repo})=>({id,repo}))}),
   'members.json':JSON.stringify({version:1,workspaceId:'acme',memberIds:[1,2]}),
  };
  const repository={id:'R_acme_101',databaseId:101,nameWithOwner:workspaceRepo,isPrivate:true,viewerPermission:'READ'};
  // Exhaustive in-process allowlist. Even an unknown GitHub read is refused.
  async function fetcher(url,options={}) {
   const u=new URL(url),method=options.method??'GET';
   if(u.href==='https://acme-loop.invalid/rest/v1/rpc/plates_private_lesson_rpc'&&method==='POST') {
    if(options.headers?.apikey!==config.storageKey||options.headers?.Authorization!==`Bearer ${config.storageKey}`)fail('synthetic_sql_auth_refused');
    const p=JSON.parse(options.body);
    const result=await db.query('SELECT public.plates_private_lesson_rpc($1,$2,$3,$4,$5::jsonb) value',[p.p_operation,p.p_instance,p.p_actor,p.p_id,JSON.stringify(p.p_data)]);
    return Response.json(result.rows[0].value);
   }
   if(u.origin!=='https://api.github.com'||options.headers?.Authorization!==`Bearer ${syntheticToken}`)fail('synthetic_transport_refused');
   if(method==='GET'&&u.pathname==='/repositories/101'&&!u.search)return Response.json({id:101,node_id:repository.id,full_name:workspaceRepo,private:true,default_branch:'main',permissions:{push:false}});
   if(method==='POST'&&u.pathname==='/graphql'&&!u.search) {
    const body=JSON.parse(options.body);
    if(body.query!==repositoryQuery||Object.keys(body.variables??{}).length!==1||body.variables?.id!==repository.id)fail('synthetic_graphql_refused');
    return Response.json({data:{node:{...repository,defaultBranchRef:{id:'REF_acme_101_main',name:'main',repository,target:{oid:revision,tree:{oid:tree}}}}}});
   }
   if(method==='GET'&&u.pathname===`/repos/${workspaceRepo}/git/trees/${tree}`&&u.search==='?recursive=1')return Response.json({sha:tree,truncated:false,tree:Object.entries(files).map(([path,content])=>({path,type:'blob',mode:'100644',sha:gitBlob(content),size:Buffer.byteLength(content)}))});
   if(method==='GET'&&!u.search)for(const content of Object.values(files))if(u.pathname===`/repos/${workspaceRepo}/git/blobs/${gitBlob(content)}`)return Response.json({sha:gitBlob(content),encoding:'base64',size:Buffer.byteLength(content),content:Buffer.from(content).toString('base64')});
   fail('synthetic_transport_refused');
  }
  const service=createPrivateLearning(config,{fetcher,now});
  async function access(token,review=false) {
   if(closed)fail('learning_closed');
   const who=await authenticate(token);
   if(!who||![1,2].includes(who.actorId)||!Array.isArray(who.projects)||new Set(who.projects).size!==who.projects.length||who.projects.some(id=>!projects.some(p=>p.id===id)))fail('learning_identity_refused');
   if(review&&who.role!=='reviewer')fail('learning_reviewer_required');
   return {userId:who.actorId,workspace:{id:'acme',name:'Acme synthetic loop'},sourceRevision:revision,contentsPermission:'read',projects:projects.filter(p=>who.projects.includes(p.id)).map(p=>({...p}))};
  }
  const reauthorize=(token,review)=>()=>access(token,review);
  async function apply(token,preview,action) {
   return service.apply(await access(token,true),syntheticToken,preview,{action,reauthorize:reauthorize(token,true)});
  }
  return {
   provenance:{auth:'synthetic authenticate callback',github:'allowlisted synthetic private workspace',learning:'production createPrivateLearning and encrypted store',sql:'unchanged migration 016 in persistent local PGlite',keyManagement:'local fixture key; not production key custody'},
   async capture(token,input) {
    const preview=await service.preview(await access(token,true),syntheticToken,'capture',input);
    const receipt=await apply(token,{previewId:preview.id,digest:preview.digest},'capture');
    const catalogue=await service.catalogue(await access(token,true),syntheticToken,{mode:'personal',projectId:input.projectId},{reauthorize:reauthorize(token,true)});
    const source=catalogue.records.find(r=>r.id===receipt.recordId);
    if(!source)fail('captured_source_unavailable');
    return {preview,receipt,source};
   },
   async previewPromotion(token,input) {return service.preview(await access(token,true),syntheticToken,'promote',input);},
   async applyPromotion(token,input) {return apply(token,input,'promote');},
   async catalogue(token,projectId) {
    const current=await access(token);
    if(!current.projects.some(p=>p.id===projectId))fail('learning_project_refused');
    return service.catalogue(current,syntheticToken,{mode:'copies',projectId},{reauthorize:reauthorize(token,false)});
   },
   async revoke(token,input) {
    const preview=await service.preview(await access(token,true),syntheticToken,'revoke',input);
    return apply(token,{previewId:preview.id,digest:preview.digest},'revoke');
   },
   async recover(token,id) {return service.recover(await access(token),syntheticToken,id,{reauthorize:reauthorize(token,false)});},
   async close() {if(!closed){closed=true;await db.close();}},
  };
 } catch(error) {closed=true;await db.close();throw error;}
}
