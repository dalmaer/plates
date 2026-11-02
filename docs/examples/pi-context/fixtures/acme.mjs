import { bytesDigest, INPUT_KEYS, manifestDigest } from '../../../../lib/validation-evidence.mjs';
import { decisionContext } from '../../../../scripts/plates/decision-context.mjs';
import { captureContext } from '../src/context.mjs';

export const DEMO_COMMIT = 'a'.repeat(40);
export function evidenceFixture() {
  const candidate = { repo: 'acme/app', head: DEMO_COMMIT, tree: 'b'.repeat(40), dirty: false,
    gateSource: 'configured-check', inputs: Object.fromEntries(INPUT_KEYS.map(k => [k, bytesDigest(Buffer.from(`acme:${k}`))])) };
  const manifest = { schema: 1, repo: candidate.repo, gateCommandDigest: candidate.inputs.command,
    stages: ['context-capture', 'identity-check', 'ui-check'].map(id => ({ id, commandDigest: bytesDigest(Buffer.from(id)) })) };
  const expected = { schema: 1, candidate, manifest, evaluatedAt: '2026-10-28T12:00:00.000Z', freshness: { mode: 'until-change' } };
  const source = { provider: 'github-actions', repo: candidate.repo, workflow: '.github/workflows/check.yml', runId: '123', attempt: 1 };
  const artifact = { schema: 1, candidate: structuredClone(candidate), manifestDigest: manifestDigest(manifest), invocationId: 'acme-demo', source,
    startedAt: '2026-10-28T11:00:00.000Z', endedAt: '2026-10-28T11:01:00.000Z', completed: true, status: 1,
    stages: manifest.stages.slice(0, 2).map((s, index) => ({ ...s, candidate: structuredClone(candidate), manifestDigest: manifestDigest(manifest),
      invocationId: `acme-child-${index}`, parentInvocationId: 'acme-demo', source: { ...source },
      startedAt: '2026-10-28T11:00:01.000Z', endedAt: '2026-10-28T11:00:30.000Z', completed: true, status: index })) };
  return { expected, source: { ...source, artifactId: '456', expiresAt: '2026-11-01T00:00:00.000Z' }, artifact,
    planned: [{ id: 'live-provider-check', status: 'not-run', reason: 'No live model calls authorized for this experiment.' }] };
}
export function fixtureInput(fixture = evidenceFixture()) {
  const artifactBytes = Buffer.from(JSON.stringify(fixture.artifact));
  return { ...fixture, source: { ...fixture.source, sha256: bytesDigest(artifactBytes) }, artifactBytes };
}
export function contextFixture() {
  const contextFiles = [
    { path: '/acme/app/AGENTS.md', content: '# Acme instructions\nKeep evidence tied to the exact revision.\nUnknown checks remain unknown.' },
    { path: '/acme/app/.pi/AGENTS.md', content: '# Acme local guidance\nDo not mistake a plan for completed validation.' },
  ];
  return captureContext({ cwd: '/acme/app', getSystemPromptOptions: () => ({ contextFiles, skills: [{ name: 'acme-review', filePath: '/acme/skills/review/SKILL.md' }] }),
    getSystemPrompt: () => contextFiles.slice(0, 1).map(f => `<project_instructions path="${f.path}">\n${f.content}\n</project_instructions>`).join('\n') },
  { now: '2026-10-28T12:00:00.000Z', demo: true });
}

export async function decisionFixture() {
  const files = {
    'docs/phases/00-acme.md': '# Acme\n## Reconciliation\n```keel-reconciliation\n{"version":1,"decisions":["docs/decisions/acme.md#acme"]}\n```\n',
    'docs/decisions/acme.md': '<a id="acme"></a>\n# Acme evidence\n```keel-decision\n' + JSON.stringify({ version: 1, id: 'acme', status: 'accepted', scope: ['evidence'], decided_by: 'Acme owner', decided_at: '2026-10-28', supersedes: [], superseded_by: [] }) + '\n```\n',
  };
  const dirs = { docs: ['phases', 'decisions'], 'docs/phases': ['00-acme.md'], 'docs/decisions': ['acme.md'] };
  const missing = () => { throw Object.assign(new Error('Fixture path missing'), { code: 'ENOENT' }); };
  const reader = { revision: DEMO_COMMIT, complete: true,
    async stat(path) { return files[path] !== undefined ? { type: 'file', size: Buffer.byteLength(files[path]) } : dirs[path] ? { type: 'directory' } : missing(); },
    async readdir(path) { return dirs[path] ?? missing(); },
    async readFile(path) { return files[path] !== undefined ? Buffer.from(files[path]) : missing(); } };
  return decisionContext({ reader, phase: '0' });
}
