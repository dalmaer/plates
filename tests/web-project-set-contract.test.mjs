import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectSets, authorizedProjectSets, resolveProjectSet } from '../lib/web/project-sets.mjs';
import { webConfig, instanceConfig } from '../lib/web/config.mjs';
import { harness } from './helpers/web-http.mjs';
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

test('optional registry is inert by default and survives instance config readback without aliasing', () => {
  const h = harness(), original = webConfig(h.input, h.secrets);
  assert.equal(Object.hasOwn(instanceConfig(original), 'projectSets'), false);
  const input = { ...h.input, projectSets: [sets[1]] };
  const parsed = webConfig(input, h.secrets), snapshot = instanceConfig(parsed);
  assert.deepEqual(snapshot.projectSets, input.projectSets);
  snapshot.projectSets[0].projects.length = 0;
  assert.equal(parsed.projectSets[0].projects.length, 1);
  input.projectSets[0].name = 'Changed later';
  assert.equal(parsed.projectSets[0].name, 'Acme research');
  assert.deepEqual(resolveProjectSet(config, access).projects, access.projects);
});
