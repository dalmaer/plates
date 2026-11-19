// Phase 196 increment 4: presentation keeps source identity and protected forms,
// hides empty project sections, and renders source prose with one safe renderer.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inlineMarkdown,markdownView} from '../lib/web/markdown.mjs';
import {renderSimpleProject} from '../lib/web/simple-project-views.mjs';
import {renderHomeSnapshot,projectView,styles} from '../lib/web/views.mjs';
import {channelLines,ownerForm} from '../lib/web/channel-views.mjs';
import {renderBacklog,backlogView} from '../lib/web/backlog-views.mjs';
import {navigation} from '../lib/web/navigation.mjs';
import {simpleProject} from '../lib/web/simple-project-model.mjs';
import {changeModel} from '../lib/web/changes-model.mjs';
import {changeDefinition} from './helpers/web-changes.mjs';
import {snapshot,backlog,access} from './helpers/web-design-pages.mjs';

const text = '**Acme** uses `tools` and *care*';
const markup = '<strong>Acme</strong> uses <code>tools</code> and <em>care</em>';
const project = {id:'studio',name:'Acme Studio',repo:'acme/studio',changes:[]};
const item = {key:'studio:phase:2',kind:'phase',ref:'2',title:text,state:'Ready',done:'',next:'',blocked:[],canAssign:false,source:null};
const model = (items=[]) => ({items,waiting:[],cards:[],gaps:[],recommendation:{why:'No recommendation.'}});

test('the shared renderer escapes source HTML and admits only safe Markdown', () => {
  assert.equal(inlineMarkdown(text),markup);
  assert.equal(inlineMarkdown('__Acme__ and _care_'),'<strong>Acme</strong> and <em>care</em>');
  assert.equal(inlineMarkdown('[**Acme** `tools`](https://acme.test/docs?a=1&b=2)'), '<a href="https://acme.test/docs?a=1&amp;b=2" rel="noreferrer"><strong>Acme</strong> <code>tools</code></a>');
  assert.equal(inlineMarkdown('`**literal**`'),'<code>**literal**</code>');
  for (const target of ['javascript:alert(1)','data:text/html,evil','http://acme.test','//acme.test','https://user:pass@acme.test','https://acme.test/\nattack']) {
    assert.doesNotMatch(inlineMarkdown(`[Acme](${target})`), /<a\b/, target);
  }
  assert.equal(inlineMarkdown('[Acme](https://acme.test)',{links:false}), 'Acme');
  const html=markdownView('<img src=x onerror=alert(1)>\n\n- **First**\n- `second`\n\n1. third\n2. *fourth*\n\n# Title');
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html,/<ul><li><strong>First<\/strong><\/li><li><code>second<\/code><\/li><\/ul>/);
  assert.match(html,/<ol><li>third<\/li><li><em>fourth<\/em><\/li><\/ol>/);
  assert.doesNotMatch(html,/<img|<script|<h[1-6]|\*\*|`/);
  assert.equal(inlineMarkdown('\0\u00000\0<script>'), '0&lt;script&gt;');
});

test('rejected Markdown link targets remain visible as escaped plain text', () => {
  const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  for (const target of ['http://acme.test/docs', '/docs/acme', 'not a URL', 'javascript:alert(1)', 'data:text/html,<img src=x onerror=alert(1)>', 'https://user:pass@acme.test', 'http://acme.test/**literal**/`code`?a=1&b="two"']) {
    const source = `[**Acme** tools](${target})`;
    const expected = `<strong>Acme</strong> tools (${escape(target)})`;
    assert.equal(inlineMarkdown(source), expected, target);
    assert.equal(inlineMarkdown(source, {links:false}), expected, `action label: ${target}`);
    assert.equal(markdownView(source), `<p>${expected}</p>`, `block: ${target}`);
    assert.doesNotMatch(inlineMarkdown(source), /<a\b|<img\b/);
  }
});

test('empty project sections and navigation entries disappear; source detail remains reachable', () => {
  assert.equal(renderSimpleProject(model(),project),'');
  const empty=renderSimpleProject(model([item]),project);
  assert.doesNotMatch(empty,/simple-evidence|Changes|Captures|Plan from/);
  const nav=navigation(access,{path:'/projects/studio',project});
  assert.doesNotMatch(nav,/data-nav-destination="(?:changes|media|model-tasks|phases|goals)"/);
  assert.doesNotMatch(backlogView(access,backlog()),/<a href="\/backlog\/goals"/);
  assert.equal(renderBacklog({lanes:[{lane:'done',title:'Done',items:[]}],plates:[],claims:[]}), '');
  const populated={...item,goal:'G1',source:{file:'docs/phases/2-acme.md',revision:'a'.repeat(40)},done:'The Acme result works.'};
  const html=renderSimpleProject(model([populated]),project);
  assert.match(html,/<details class="simple-evidence"><summary>Item details<\/summary>/);
  assert.match(html,/href="https:\/\/github.com\/acme\/studio\/blob\/a{40}\/docs\/phases\/2-acme.md"/);
  assert.match(html,/href="\/backlog\/goals"/);
  assert.match(html,/model-tasks\?phase=docs%2Fphases%2F2-acme.md/);
  assert.doesNotMatch(html,/>Changes|>Captures/);
});

test('changes and captures appear only behind the explicitly related item', () => {
  const definition={...changeDefinition(),paths:['docs/phases/2-acme.md']};
  const change=changeModel(project,{head:'a'.repeat(40)},definition,{walk:null,verifiedRevisions:[definition.revision]});
  change.captures[0].capture={id:'acme-capture'};
  const related={...item,source:{file:'docs/phases/2-acme.md',revision:'a'.repeat(40)}};
  const own={...project,changes:[change]}, html=renderSimpleProject(model([related]),own);
  assert.match(html,/<summary>Changes \(1\)<\/summary>/);
  assert.match(html,/<summary>Captures \(1\)<\/summary>/);
  assert.match(html,/href="\/projects\/studio\/changes\/acme-search"/);
  assert.doesNotMatch(renderSimpleProject(model([{...related,source:{...related.source,file:'docs/phases/3-other.md'}}]),own),/>Changes|>Captures/);
  change.captures[0].capture=null;
  assert.doesNotMatch(renderSimpleProject(model([related]),own),/>Captures/);
  change.projectId='other';
  assert.doesNotMatch(renderSimpleProject(model([related]),own),/>Changes/);
});

test('Home decisions, backlog, item details and chat render prose without altering input bytes', () => {
  const snap={...snapshot(),backlog:backlog()};
  snap.home.glance.cards[0].question=text;
  snap.backlog.lanes[0].items[0].title=text;
  snap.projectWorkspace=simpleProject(snap,'studio');
  for (const html of [renderHomeSnapshot(snap),renderHomeSnapshot(snap,{projectId:'studio'}),renderBacklog(snap.backlog),renderSimpleProject(model([item]),project),channelLines({lines:[{kind:'say',actor:'studio#2',text,at:'2026-11-17T12:00:00Z'}]})]) {
    assert.ok(html.includes(markup));
  }
  assert.equal(snap.home.glance.cards[0].question,text);
  const form=ownerForm(access,{plates:[{projectId:'studio'}]},{text});
  assert.ok(form.includes(`value="${text}"`), 'editable input is literal, not rendered markup');
  const html=projectView(project,access,snap);
  assert.match(html,/<a class="brand" href="\/">Plates<span>Keep your projects moving<\/span><\/a>/);
  assert.doesNotMatch(styles,/body::before|radial-gradient|font-family/);
  const labels=renderSimpleProject(model([item]),project).replace(/<[^>]+>/g,' ');
  assert.doesNotMatch(labels,/\b(?:phase|increment|claim|envelope|lane)s?\b/i);
});

test('Markdown links cannot create nested destinations inside decision buttons or project chips', () => {
  const snap=snapshot(), label='[Acme](https://acme.test/)';
  snap.home.glance.chips[0].name=label;
  const card=snap.home.glance.cards[0];
  card.answers=[{id:'acme',label}]; card.recommended='acme';
  const html=renderHomeSnapshot(snap);
  assert.doesNotMatch(html, /href="https:\/\/acme.test\//);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /\[Acme\]/);
  assert.match(html, /data-answer="acme"/);
});
