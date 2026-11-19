// The phone app (app/, an Exact app) is the third renderer of the simple view
// (phase 196): it draws the values `plates home` and the hosted site draw. Its
// first increment reads a bundled sample, app/fixture/acme.json. This file
// holds that sample to the modules that own the model, so a change to a
// model's vocabulary, order or answers fails here before the app drifts.
// The app's own tests (app/app.test.contract, `npm run exact:check` in app/)
// prove its screens draw the sample; they need Exact and are not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLANCE_TONES, DEPLOY_WHERE, answersFor } from '../lib/work-items.mjs';
import { PROJECT_STATES, UNKNOWN_ASSIGNMENT, simpleProjectLines } from '../lib/web/simple-project-model.mjs';
import { KINDS } from '../lib/channel.mjs';
import { tokens } from '../lib/web/design.mjs';

const read = path => readFile(new URL(`../app/${path}`, import.meta.url), 'utf8');
const sample = JSON.parse(await read('fixture/acme.json'));
const { chips, cards } = sample.home.glance, projects = Object.values(sample.projects), lines = sample.channel.lines;

test('the sample is synthetic: every project is Acme\'s and no link leaves it', () => {
  for (const id of [...chips.map(c => c.projectId), ...cards.map(c => c.projectId), ...Object.keys(sample.projects), ...lines.map(l => l.plate)]) assert.match(id, /^acme-[a-z]+$/);
  assert.deepEqual(Object.keys(sample.projects).sort(), chips.map(c => c.projectId).sort(), 'a chip per project and a project per chip');
  for (const url of JSON.stringify(sample).match(/https?:\/\/[^"\\ ]+/g) ?? []) assert.match(url, /^https:\/\/github\.com\/acme\//);
});

test('chips keep homeGlance\'s shape: trouble first, a green chip says nothing', () => {
  assert.deepEqual(chips.map(c => c.tone), [...chips].sort((a, b) => GLANCE_TONES.indexOf(a.tone) - GLANCE_TONES.indexOf(b.tone)).map(c => c.tone));
  assert.deepEqual([...new Set(chips.map(c => c.tone))], [...GLANCE_TONES], 'the sample shows every tone');
  for (const chip of chips) {
    assert.ok(GLANCE_TONES.includes(chip.tone));
    assert.equal(chip.tone, chip.reasons[0]?.tone ?? 'green');
    assert.equal(chip.reason, chip.reasons[0]?.text ?? null);
    assert.equal(chip.more, Math.max(0, chip.reasons.length - 1));
  }
});

test('cards carry the answers the shared model gives the hosted form', () => {
  const can = { form: 'web', decisionWrites: true, mergeWrites: true };
  const walk = cards.find(c => c.kind === 'walk'), merge = cards.find(c => c.kind === 'merge'), deploy = cards.find(c => c.kind === 'deploy');
  const choices = walk.answers.filter(a => a.writer === 'walk done').map(a => a.label);
  assert.deepEqual(walk.answers, answersFor({ kind: 'walk', details: { choices, recommend: choices[0] } }, can));
  const command = a => (a.unavailable ? { ...a, unavailable: { reason: a.unavailable.reason } } : a);
  assert.deepEqual(merge.answers.map(command), answersFor({ kind: 'merge' }, can).map(command));
  for (const card of cards) assert.equal(card.recommended, card.answers.find(a => a.recommended)?.id ?? null);
  // Deploy is the checked promote, run where plates promote runs: a command, never an answer.
  assert.deepEqual(deploy.answers, []);
  assert.equal(deploy.deploy.where, DEPLOY_WHERE);
  assert.equal(deploy.deploy.command, `plates promote ${deploy.deploy.sha}`);
  assert.equal(deploy.key, `${deploy.projectId}:deploy:${deploy.deploy.sha}`);
});

test('backlog items use the four states, and the terminal renders the same sample', () => {
  const states = Object.values(PROJECT_STATES);
  assert.deepEqual([...new Set(projects.flatMap(p => p.items.map(i => i.state)))].sort(), [...states].sort(), 'the sample shows every state');
  for (const project of projects) {
    for (const item of project.items) {
      assert.ok(item.key.startsWith(`${project.projectId}:`));
      assert.equal(item.canAssign, item.state === PROJECT_STATES['agent-ready']);
      if (item.state === PROJECT_STATES['in-flight']) assert.ok(item.holder?.provider, 'an item an agent is on names the agent');
      for (const route of item.assign) assert.equal(route.command, `plates home --attach ${item.key} --route ${route.route} --provider ${route.provider}`);
      assert.deepEqual(item.assign.filter(a => a.recommended).map(a => a.provider), item.assign.length && project.recommendation.provider ? [project.recommendation.provider] : []);
    }
    if (project.recommendation.provider === null) assert.deepEqual(project.recommendation, UNKNOWN_ASSIGNMENT);
    const text = simpleProjectLines({ ...project, cards: [] });
    assert.equal(text.includes('Backlog'), project.items.length > 0, 'empty means hidden in the terminal too');
    for (const item of project.items) assert.ok(text.some(line => line.includes(`${item.state} · `)));
  }
});

test('channel lines are the channel model\'s kinds, oldest first', () => {
  assert.deepEqual(lines.map(l => l.at), lines.map(l => l.at).sort());
  for (const line of lines) {
    assert.ok(KINDS.includes(line.kind), line.kind);
    assert.equal(new Date(line.at).toISOString(), line.at);
    assert.ok(line.actor.startsWith(line.plate));
  }
  // The chat needs each of the three voices: an agent's own line, what plates saw, and the owner's.
  for (const kind of ['say', 'owner', 'checkpoint']) assert.ok(lines.some(l => l.kind === kind), kind);
  assert.ok(lines.some(l => !['say', 'owner', 'checkpoint'].includes(l.kind)));
});

test('shown text keeps the one vocabulary: item, agent, decision', () => {
  const shown = [...chips.flatMap(c => [c.name, ...c.reasons.map(r => r.text)]),
    ...cards.flatMap(c => [c.question, c.why, ...c.answers.map(a => a.label), ...c.more.filter(m => m.label !== 'Where it runs').map(m => m.text)]),
    ...projects.flatMap(p => [p.recommendation.why, ...p.gaps, ...p.items.flatMap(i => [i.title, i.state, i.done, i.next])]),
    ...lines.map(l => l.text)].filter(Boolean);
  for (const text of shown) assert.doesNotMatch(text, /\b(?:phases?|increments?|claims?|envelopes?|lanes?)\b/i, text);
});

test('the app\'s screens say only item, agent and decision, and its colours are the workspace\'s tokens', async () => {
  const contract = await read('app.contract');
  const literals = [...contract.matchAll(/(?:\btext|title=|message=)\s*\(?[`"]([^`"]+)[`"]/g)].map(m => m[1]);
  assert.ok(literals.includes('Needs you') && literals.includes('Backlog'));
  for (const text of literals) assert.doesNotMatch(text, /\b(?:phases?|increments?|claims?|envelopes?|lanes?)\b/i, text);
  assert.doesNotMatch(contract.replace(/^\s*\/\/.*$/gm, ''), /#[0-9a-f]{3,8}\b|\brgba?\(|\boklch\(/i, 'no colour literal in the view');
  const forma = await read('app.forma');
  const pairs = [...forma.matchAll(/^\s*([a-z-]+) = light-dark\((oklch\([^)]+\)), (oklch\([^)]+\))\)$/gm)];
  assert.deepEqual(pairs.map(p => p[1]), ['danger', 'warn', 'ok']);
  for (const [, name, lightValue, darkValue] of pairs) {
    assert.notEqual(lightValue, darkValue);
    for (const value of [lightValue, darkValue]) assert.ok(tokens.includes(`--${name}:${value};`), `${name} is ${value} in lib/web/design.mjs`);
  }
});
