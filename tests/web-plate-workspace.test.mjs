import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plateMessages, messageType, renderPlateWorkspace, renderPlateCards} from '../lib/web/plate-workspace.mjs';
import {snapshot, backlog} from './helpers/web-design-pages.mjs';

test('messages preserve source kinds and identities, scope a plate, and never infer bugs from titles', () => {
  const model = {...snapshot(),backlog:backlog()}, before=JSON.stringify(model);
  const rows=plateMessages(model,'studio');
  assert.ok(rows.some(r=>r.type==='phase' && r.lane==='in-flight'));
  assert.ok(rows.some(r=>r.type==='decision'));
  assert.ok(rows.some(r=>r.type==='change'));
  assert.ok(rows.every(r=>r.projectId==='studio'));
  assert.deepEqual(plateMessages(model,'missing'),[]);
  assert.equal(messageType({kind:'phase',title:'Fix a bug in issues'}),'phase');
  assert.equal(messageType({kind:'issue',labels:[{name:'bug'}]}),'bug');
  assert.equal(messageType({kind:'issue'}),'issue');
  assert.equal(messageType({kind:'decision',itemKind:'step'}),'decision');
  assert.equal(JSON.stringify(model),before);
  const duplicate={...model.decisions[0],key:'studio:decision:one'};
  assert.equal(plateMessages({...model,decisions:[duplicate,duplicate]},'studio').filter(r=>r.key===duplicate.key).length,1);
});

test('a plate offers source actions and native reading targets without enabling writes', () => {
  const model={...snapshot(),backlog:backlog()}, html=renderPlateWorkspace(model,'studio');
  assert.match(html,/href="#message-0"/);
  assert.match(html,/id="message-0"/);
  assert.match(html,/data-message-prev aria-label="Previous message"/);
  assert.match(html,/href="\/projects\/studio\/walks"/);
  assert.match(html,/https:\/\/github.com\/acme\/studio\/blob\/b{40}\/docs\/phases\/1-acme.md/);
  assert.match(html,/Issues and bugs appear when supplied/);
  assert.doesNotMatch(html,/method="post"|onclick=|localStorage/);
  const attack='<img src=x onerror=alert(1)>';
  model.decisions[0]={...model.decisions[0],title:attack,link:'javascript:alert(1)'};
  const escaped=renderPlateWorkspace(model,'studio');
  assert.match(escaped,/&lt;img/);assert.doesNotMatch(escaped,/<img|href="javascript:/);
});

test('home cards retain incomplete coverage and unavailable activity instead of claiming an empty plate', () => {
  const model=snapshot();model.projects[0].state='unavailable';model.home.sections=[];
  const html=renderPlateCards(model);
  assert.match(html,/href="\/projects\/studio"/);
  assert.match(html,/Sources unavailable/);assert.match(html,/Owner actions may be incomplete/);
  assert.match(html,/Activity unavailable/);assert.doesNotMatch(html,/No owner actions|No changes in flight/);
});


test('a home card shows its phases as one bar: done, partial, not started', async () => {
  const { phaseBar } = await import('../lib/work-items.mjs');
  const { phaseBarText } = await import('../lib/home.mjs');
  const phases = phaseBar({ built: 6, partial: 3, notStarted: 1 });
  assert.deepEqual(phases, { done: 6, partial: 3, notStarted: 1, total: 10, line: '6 done · 3 partial · 1 not started' });
  for (const missing of [null, { built: null, partial: null, notStarted: null }, { built: 4 }, { built: 0, partial: 0, notStarted: 0 }]) assert.equal(phaseBar(missing), null);
  assert.equal(phaseBarText(phases), '████████████▒▒▒▒▒▒░░');
  assert.equal(phaseBarText(phaseBar({ built: 200, partial: 0, notStarted: 1 })), '███████████████████░', 'a sliver still gets its cell');
  const model=snapshot();
  model.home.sections=[{id:'plates',items:[{projectId:'studio',status:'all clear',phases}]}];
  const html=renderPlateCards(model);
  assert.match(html,/class="plate-phase-bar" role="img" aria-label="Phases: 6 done · 3 partial · 1 not started"/);
  assert.match(html,/<svg class="phase-bar-track" viewBox="0 0 10 1"[^>]*><rect data-phase="done" x="0" width="6" height="1"\/><rect data-phase="partial" x="6" width="3" height="1"\/><rect data-phase="not-started" x="9" width="1" height="1"\/><\/svg>/);
  assert.doesNotMatch(html,/style="/,'no inline style: the hosted policy (style-src \'self\') would drop it and every segment would be equal');
  model.home.sections=[{id:'plates',items:[{projectId:'studio',status:'all clear',phases:phaseBar({ built: 200, partial: 0, notStarted: 1 })}]}];
  assert.match(renderPlateCards(model),/<rect data-phase="done" x="0" width="200" height="1"\/><rect data-phase="not-started" x="200" width="4.02" height="1"\/>/,'a sliver keeps 2% so it shows');
  model.home.sections=[{id:'plates',items:[{projectId:'studio',status:'all clear',phases:null}]}];
  assert.doesNotMatch(renderPlateCards(model),/plate-phase-bar/,'no bar where the phases were not counted');
});

test('a backlog projection is enriched with its original decision workflow and context', () => {
  const model=snapshot(), original={...model.decisions[0],key:'studio:proposal:health',decisionTarget:{kind:'health',path:'docs/health/proposal.md'}};
  model.decisions=[original];
  model.backlog={lanes:[{lane:'yours',items:[{key:original.key,projectId:'studio',kind:'proposal',title:original.title,source:{url:original.link}}]}]};
  const rows=plateMessages(model,'studio').filter(r=>r.key===original.key);
  assert.equal(rows.length,1);
  assert.equal(rows[0].type,'decision');
  assert.deepEqual(rows[0].details,original.details);
  assert.match(renderPlateWorkspace(model,'studio'),/href="\/projects\/studio\/decisions\?kind=health&amp;path=docs%2Fhealth%2Fproposal.md"/);
});
