import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { contextFixture, decisionFixture, evidenceFixture, fixtureInput } from '../fixtures/acme.mjs';
import { projectEvidence } from './evidence.mjs';
import { renderPage } from './render.mjs';

const context = contextFixture(), decision = await decisionFixture();
const mixed = fixtureInput();
const stale = evidenceFixture();
stale.expected.candidate.head = 'c'.repeat(40);
const scenarios = [
  { id: 'mixed', title: 'Evidence has gaps', context, decision, evidence: projectEvidence(mixed) },
  { id: 'stale', title: 'The tested and expected commits differ', context, decision, evidence: projectEvidence(fixtureInput(stale)) },
  { id: 'missing', title: 'No execution evidence available', context, decision, evidence: projectEvidence({ expected: mixed.expected }) },
];
await mkdir('output/acme-evidence', { recursive: true });
await writeFile('output/index.html', renderPage(scenarios));
await writeFile('output/demo.json', JSON.stringify({ label: 'SYNTHETIC ACME DEMO', scenarios }, null, 2));
await writeFile('output/acme-evidence/expected.json', JSON.stringify(mixed.expected));
await writeFile('output/acme-evidence/source.json', JSON.stringify(mixed.source));
await writeFile('output/acme-evidence/artifact.json', mixed.artifactBytes);
console.log(JSON.stringify({ demo: true, html: resolve('output/index.html'), decisionState: decision.state }));
