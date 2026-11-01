import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { reconcile, checkImpact } from '../practices/reconciliation/files/scripts/plates/reconcile.mjs';
import { decisionContext } from '../practices/reconciliation/files/scripts/plates/decision-context.mjs';
import { rederive } from '../lib/evidence.mjs';
const phasePath='docs/phases/01-acme.md', decisionsPath='docs/decisions/acme.md', proofPath='docs/evidence/acme.md';
const fence=(name,value)=>'```'+name+'\n'+JSON.stringify(value)+'\n```\n';
const decision=(name,id,anchor=id)=>`<a id="${anchor}"></a>\n## ${id}\n`+fence(name,{version:1,id,status:'accepted',scope:[id],decided_by:'Acme owner',decided_at:'2026-01-01'});
const proof=(name,id)=>`<a id="${id}"></a>\n## ${id}\n`+fence(name,{version:1,kind:'implementation',acceptance:id,sha:'a'.repeat(40),environment:'Acme fixture',observed_at:'2026-01-01',observer:'Acme',claim:id,result:'pass'});
const measurement=id=>({id,argv:[process.execPath,'-e','require("node:fs").writeFileSync("should-not-run","Acme")'],cwd:'.',value:1,unit:'count',date:'2026-01-01'});
const phase=metadata=>`---\nstatus: planned\nsince: 2026-01-01\ngoal: G0\nnote: "Acme"\nevidence: ["evidence/acme.md"]\n---\n# Acme\n## Done when\nAcme records remain readable.\n## Scope\nAcme only.\n## Proof\nRead the records.\n## Deliberately open\nNone.\n## Next action\nReview records.\n## Acceptance\n- [ ] Old <!-- acceptance: old -->\n- [ ] New <!-- acceptance: new -->\n## Reconciliation\n`+fence('plates-reconciliation',{version:1,...metadata});
async function world(t,files){
 const root=await mkdtemp(join(tmpdir(),'plates-fence-records-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const put=async(path,text)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),text);};
 await put('.plates/plates.json',JSON.stringify({name:'Acme',repo:'acme/app',practices:['phases']}));
 for(const [path,text] of Object.entries(files))await put(path,text);
 return {root,put};
}

test('independent historical and current decisions and proofs coexist without rewriting source',async t=>{
 const metadata={decisions:[decisionsPath+'#old',decisionsPath+'#new'],implementation:['old','new'].map(acceptance=>({acceptance,evidence:proofPath+'#'+acceptance}))};
 const files={[phasePath]:phase(metadata),[decisionsPath]:decision('keel-decision','old')+decision('plates-decision','new'),[proofPath]:proof('keel-proof','old')+proof('plates-proof','new')};
 const w=await world(t,files);
 const out=await reconcile({root:w.root});
 assert.deepEqual(out.unknown,[]);assert.deepEqual(out.findings,[]);
 for(const [path,text] of Object.entries(files))assert.equal(await readFile(join(w.root,path),'utf8'),text);
 execFileSync('git',['init','-q'],{cwd:w.root});execFileSync('git',['add','.'],{cwd:w.root});execFileSync('git',['commit','-qm','Acme'],{cwd:w.root});
 const context=await decisionContext({root:w.root,phase:'1'});
 assert.equal(context.state,'complete',JSON.stringify(context.gaps));
 assert.deepEqual(context.decisions.map(d=>d.ref).sort(),metadata.decisions.sort());
});

test('mixed decision duplicates and ambiguous proof anchors retain source diagnostics',async t=>{
 const w=await world(t,{[phasePath]:phase({decisions:[decisionsPath+'#old'],implementation:[{acceptance:'old',evidence:proofPath+'#old'}]}),[decisionsPath]:decision('keel-decision','old')+decision('plates-decision','old'),[proofPath]:proof('keel-proof','old')+proof('plates-proof','old')});
 const out=await reconcile({root:w.root});
 assert.ok(out.findings.some(f=>f.path===decisionsPath && /duplicate decision/.test(f.message)),JSON.stringify(out));
 assert.ok(out.findings.some(f=>f.rule==='proof-scope-mismatch' && f.message.includes(proofPath+'#old') && /ambiguous anchor/.test(f.message)),JSON.stringify(out));
 execFileSync('git',['init','-q'],{cwd:w.root});execFileSync('git',['add','.'],{cwd:w.root});execFileSync('git',['commit','-qm','Acme'],{cwd:w.root});
 assert.ok((await decisionContext({root:w.root,phase:'1'})).gaps.some(g=>g.code==='duplicate-anchor' && g.ref===decisionsPath+'#old'));
 await w.put(decisionsPath,decision('keel-decision','old')+decision('plates-decision','old','other').replace('"scope":["old"]','"scope":["conflicting"]'));
 assert.ok((await decisionContext({root:w.root,phase:'1'})).gaps.some(g=>g.code==='duplicate-id' && g.ref===decisionsPath+'#old'));
});

test('independent historical and current measurements preview together without execution or rewriting',async t=>{
 const w=await world(t,{[phasePath]:phase({}),[proofPath]:''});
 for(const names of [['keel-measurements','plates-measurements'],['plates-measurements','keel-measurements']]){
  const text='# Old\n'+fence(names[0],[measurement('old')])+'# New\n'+fence(names[1],[measurement('new')]);await w.put(proofPath,text);
  let out; await assert.doesNotReject(async()=>{out=await rederive({root:w.root,phase:'1'});});
  assert.deepEqual(out.data.records.map(r=>r.id),['old','new']);assert.ok(out.data.records.every(r=>r.source===proofPath && r.new===null));
  assert.equal(await readFile(join(w.root,proofPath),'utf8'),text);
  await assert.rejects(readFile(join(w.root,'should-not-run')),{code:'ENOENT'});
 }
});

test('mixed measurement duplicate and malformed records refuse with source path before execution',async t=>{
 const w=await world(t,{[phasePath]:phase({}),[proofPath]:''});
 for(const later of [fence('plates-measurements',[{...measurement('old'),value:99}]),'```plates-measurements\ninvalid JSON\n```\n','```plates-measurements\n[]\n']){
  await w.put(proofPath,fence('keel-measurements',[measurement('old')])+later);
  await assert.rejects(rederive({root:w.root,phase:'1',yes:true}),e=>e.exitCode===2 && e.message.includes(proofPath) && /duplicate measurement id|invalid plates-measurements JSON|unclosed/.test(e.message));
  await assert.rejects(readFile(join(w.root,'should-not-run')),{code:'ENOENT'});
 }
});

test('singleton impact rejects both mixed and same-name duplicate declarations across sections',async t=>{
 const w=await world(t,{});const data={version:1,reconciliation:'none',reason:'Acme'};
 for(const names of [['keel-impact','plates-impact'],['plates-impact','keel-impact'],['plates-impact','plates-impact'],['keel-impact','keel-impact']]){
  const out=await checkImpact({root:w.root,body:'# Old\n'+fence(names[0],data)+'# New\n'+fence(names[1],data),changedFiles:[]});
  assert.ok(out.findings.some(f=>f.rule==='pr-impact-missing' && /plates-impact/.test(f.message) && /keel-impact/.test(f.message)));
 }
});
