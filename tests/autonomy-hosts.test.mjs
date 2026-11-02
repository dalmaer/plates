import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderHostControls, hostDrift, ruleReach } from '../lib/autonomy-hosts.mjs';
import { autonomyHostLints, diagnose } from '../lib/doctor.mjs';

const repository = 'acme/app';
const FIX = new URL('./fixtures/autonomy-hosts/', import.meta.url);
const fixture = name => readFile(new URL(name, FIX), 'utf8');
const LEVELS = {
  low: { schema: 1, repository, mode: 'default', push: [], merge: [] },
  medium: { schema: 1, repository, mode: 'local', push: [], merge: [] },
  high: { schema: 1, repository, mode: 'delivery', push: ['acme-release'], merge: ['main'], pushPrefixes: ['claude/', 'codex/'] },
};
const reaches = (tools, scope) => tools.filter(t => ruleReach(t).scopes.includes(scope));
const rule = (ruleset, type) => ruleset.rules.find(r => r.type === type);
const kinds = drift => drift.findings.map(f => `${f.host}:${f.scope}`).sort();
// A workflow carrying exactly the rendered controls, and the rendered ruleset as GitHub returns it.
const asWorkflow = r => ({ path: '.github/workflows/acme.yml', text: [
  'jobs:', '  agent:', '    steps:',
  '      - name: Acme Claude', '        uses: anthropics/claude-code-action@v1', '        with:', '          claude_args: |', `            ${r.claude.args}`,
  '      - name: Acme Codex', '        uses: openai/codex-action@v1', '        with:', `          sandbox: ${r.codex.sandbox_mode}`,
  ...(r.codex.sandbox_workspace_write.network_access ? ['          codex-args: -c sandbox_workspace_write.network_access=true'] : []), ''].join('\n') });
const asApplied = r => [{ id: 7, source: repository, ...r.ruleset }];

test('each level renders its host controls', () => {
  const low = renderHostControls({ policy: LEVELS.low, repository });
  const medium = renderHostControls({ policy: LEVELS.medium, repository });
  const high = renderHostControls({ policy: LEVELS.high, repository, checks: ['check', 'typecheck'] });
  assert.deepEqual([low.level, medium.level, high.level], ['low', 'medium', 'high']);
  for (const r of [low, medium, high]) assert.equal(r.preview, true, 'rendering is a preview; applying is the owner\'s');

  // Low: read-only everywhere, and never push or merge.
  assert.equal(low.claude.permissionMode, 'default');
  assert.deepEqual(low.claude.allowedTools, ['Read', 'Glob', 'Grep']);
  for (const scope of ['local-edits', 'tests', 'push', 'merge', 'deployment', 'security']) assert.deepEqual(reaches(low.claude.allowedTools, scope), [], `Low reaches ${scope}`);
  for (const denied of ['Bash(git push*)', 'Bash(gh pr merge*)', 'Bash(gh pr create*)']) assert.ok(low.claude.disallowedTools.includes(denied), denied);
  assert.deepEqual(low.codex, { sandbox_mode: 'read-only', approval_policy: 'never', sandbox_workspace_write: { network_access: false } });
  assert.equal(low.scopes.push, false); assert.equal(low.scopes.merge, false);
  assert.match(low.claude.args, /^--permission-mode default --allowedTools "Read,Glob,Grep" --disallowedTools "/);

  // Medium: routine edits and tests; nothing leaves the runner.
  assert.equal(medium.claude.permissionMode, 'acceptEdits');
  assert.ok(['Edit', 'Write', 'Bash(npm test*)', 'Bash(git commit *)'].every(t => medium.claude.allowedTools.includes(t)));
  assert.deepEqual([...reaches(medium.claude.allowedTools, 'push'), ...reaches(medium.claude.allowedTools, 'merge')], []);
  assert.ok(medium.claude.disallowedTools.includes('Bash(git push*)') && medium.claude.disallowedTools.includes('Bash(gh pr merge*)'));
  assert.deepEqual(medium.codex, { sandbox_mode: 'workspace-write', approval_policy: 'never', sandbox_workspace_write: { network_access: false } });

  // High: pushes only to the selected branch and namespaces, gated merges, never force, deletion, deployment or security.
  assert.deepEqual(reaches(high.claude.allowedTools, 'push'), ['Bash(git push origin acme-release)', 'Bash(git push origin claude/*)', 'Bash(git push origin codex/*)']);
  assert.deepEqual(reaches(high.claude.allowedTools, 'merge'), ['Bash(gh pr merge --auto *)']);
  assert.ok(!high.claude.disallowedTools.includes('Bash(git push*)'));
  for (const denied of ['Bash(git push --force*)', 'Bash(git push *:*)', 'Bash(git push --delete*)', 'Bash(npm publish*)', 'Bash(gh secret*)', 'Edit(.github/workflows/**)']) {
    for (const r of [low, medium, high]) assert.ok(r.claude.disallowedTools.includes(denied), `${r.level} denies ${denied}`);
  }
  assert.deepEqual(high.codex, { sandbox_mode: 'workspace-write', approval_policy: 'never', sandbox_workspace_write: { network_access: true } });
  for (const r of [low, medium, high]) {
    assert.equal(r.scopes.deployment, false); assert.equal(r.scopes.security, false);
    assert.ok(r.claude.permissionMode !== 'bypassPermissions' && !r.claude.args.includes('dangerously'));
  }

  // GitHub: one default-branch ruleset; no bot bypasses it at any level.
  for (const r of [low, medium, high]) {
    assert.equal(r.ruleset.target, 'branch'); assert.equal(r.ruleset.enforcement, 'active');
    assert.deepEqual(r.ruleset.conditions, { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } });
    assert.deepEqual(r.ruleset.bypass_actors, []);
    assert.ok(rule(r.ruleset, 'deletion') && rule(r.ruleset, 'non_fast_forward') && rule(r.ruleset, 'pull_request'));
  }
  assert.equal(rule(low.ruleset, 'pull_request').parameters.required_approving_review_count, 1);
  assert.equal(rule(medium.ruleset, 'pull_request').parameters.required_approving_review_count, 1);
  assert.deepEqual(rule(low.ruleset, 'required_status_checks').parameters.required_status_checks, [{ context: 'check' }]);
  // High's selected merge into main is gated by checks, not a human per merge; another base keeps the review.
  assert.equal(rule(high.ruleset, 'pull_request').parameters.required_approving_review_count, 0);
  assert.deepEqual(rule(high.ruleset, 'required_status_checks').parameters.required_status_checks, [{ context: 'check' }, { context: 'typecheck' }]);
  assert.equal(rule(renderHostControls({ policy: { ...LEVELS.high, merge: ['acme-release'] }, repository }).ruleset, 'pull_request').parameters.required_approving_review_count, 1);

  // What is rendered is what drift holds a host to: each level's own controls show no drift.
  for (const [name, policy] of Object.entries(LEVELS)) {
    const r = renderHostControls({ policy, repository });
    assert.deepEqual(hostDrift({ policy, repository, workflows: [asWorkflow(r)], rulesets: asApplied(r) }).findings, [], name);
  }
  // Unknown or ambiguous settings render nothing.
  assert.throws(() => renderHostControls({ policy: { ...LEVELS.medium, push: ['main'] }, repository }));
  assert.throws(() => renderHostControls({ policy: LEVELS.medium, repository: 'other/app' }));
});

test('drift from the level is reported', async t => {
  const workflows = [
    { path: '.github/workflows/acme-wide.yml', text: await fixture('acme-wide.yml') },
    { path: '.github/workflows/acme-narrow.yml', text: await fixture('acme-narrow.yml') },
  ];
  const weak = JSON.parse(await fixture('rulesets-weak.json'));
  const listed = JSON.parse(await fixture('rulesets-listed.json'));

  // Workflows: every place a host allows more than the level, with the scope it exceeds.
  const low = hostDrift({ policy: LEVELS.low, repository, workflows });
  assert.deepEqual(kinds(low), ['claude:local-edits', 'claude:local-edits', 'claude:merge', 'claude:push', 'claude:tests', 'claude:tests',
    'codex:local-edits', 'codex:local-edits', 'codex:push', 'codex:tests', 'codex:tests']);
  assert.equal(low.findings.find(f => f.path.endsWith('acme-narrow.yml') && f.host === 'claude' && f.scope === 'local-edits').reason,
    '--permission-mode acceptEdits; allows Edit; allows Write', 'one finding per step and scope, every reason named');
  const medium = hostDrift({ policy: LEVELS.medium, repository, workflows });
  assert.deepEqual(kinds(medium), ['claude:merge', 'claude:push', 'codex:push']);
  assert.ok(medium.findings.every(f => f.path === '.github/workflows/acme-wide.yml'), 'the narrow workflow, whose push is denied, holds to Medium');
  assert.deepEqual(medium.findings.map(f => f.message), [
    '.github/workflows/acme-wide.yml (Acme Claude, line 10): allows Bash(git push*) (no bounded destination), beyond medium (push)',
    '.github/workflows/acme-wide.yml (Acme Claude, line 10): allows Bash(gh pr merge:*), beyond medium (merge)',
    '.github/workflows/acme-wide.yml (Acme Codex, line 17): sandbox network access, beyond medium (push)',
  ]);
  // High grants push only to bounded destinations: `git push*` still exceeds it; the selected merge does not.
  assert.deepEqual(kinds(hostDrift({ policy: LEVELS.high, repository, workflows })), ['claude:push']);
  // Wider hosts exceed every scope the level leaves closed, at every level.
  const yolo = { path: '.github/workflows/acme-yolo.yml', text: 'jobs:\n  a:\n    steps:\n      - uses: anthropics/claude-code-action@v1\n        with:\n          claude_args: --dangerously-skip-permissions\n      - uses: openai/codex-action@v1\n        with:\n          sandbox: danger-full-access\n          safety-strategy: unsafe\n' };
  const wide = hostDrift({ policy: LEVELS.high, repository, workflows: [yolo] });
  assert.deepEqual(kinds(wide), ['claude:deployment', 'claude:security', 'codex:deployment', 'codex:security']);
  for (const tool of ['Bash', 'Bash(git *)', 'Bash(gh *)', 'Bash(git push origin main)', 'Bash(git push origin claude/x:main)', 'Bash(git push --force origin claude/x)']) {
    const step = { path: '.github/workflows/acme-tool.yml', text: `jobs:\n  a:\n    steps:\n      - uses: anthropics/claude-code-action@v1\n        with:\n          claude_args: --allowedTools "${tool}"\n` };
    assert.ok(kinds(hostDrift({ policy: LEVELS.high, repository, workflows: [step] })).includes('claude:push'), `${tool} exceeds High's bounded push`);
  }
  // Claude's sandbox with no network: Bash cannot push, merge or deploy whatever its words; any allowed host reopens it.
  const sandboxed = network => ({ path: '.github/workflows/acme-sandbox.yml', text: `jobs:\n  a:\n    steps:\n      - uses: anthropics/claude-code-action@v1\n        with:\n          claude_args: |\n            --settings '${JSON.stringify({ sandbox: { enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false, enableWeakerNetworkIsolation: false, excludedCommands: [], ...network } })}'\n            --allowedTools "Read,Edit,Bash(git --git-dir=.plates/agent-git --work-tree=. *),Bash(node *)"\n` });
  assert.deepEqual(kinds(hostDrift({ policy: LEVELS.medium, repository, workflows: [sandboxed({})] })), []);
  assert.deepEqual(kinds(hostDrift({ policy: LEVELS.medium, repository, workflows: [sandboxed({ network: { allowedDomains: ['github.com'] } })] })), ['claude:push']);

  // Rulesets as GitHub returns them.
  const atMedium = hostDrift({ policy: LEVELS.medium, repository, rulesets: weak });
  assert.deepEqual(atMedium.findings.map(f => f.detail), [
    'ruleset Acme task branches: a bot (Integration 4242) can bypass it, beyond medium (push)',
    'default branch: main needs 0 approving reviews; the level needs 1, beyond medium (merge)',
    'default branch: main allows force pushes, beyond medium (push)',
    'default branch: main merges without the required check check, beyond medium (merge)',
  ]);
  // High may let the bot push to its bounded task namespace; the rest still holds.
  assert.deepEqual(hostDrift({ policy: LEVELS.high, repository, rulesets: weak }).findings.map(f => f.detail), [
    'default branch: main allows force pushes, beyond high (push)',
    'default branch: main merges without the required check check, beyond high (merge)',
  ]);
  // No ruleset at all: main takes direct pushes, even at Low.
  assert.deepEqual(kinds(hostDrift({ policy: LEVELS.low, repository, rulesets: [] })), ['github:merge', 'github:push', 'github:push', 'github:push']);
  // A bot that can bypass the default branch's only ruleset leaves it unheld.
  const bypassed = [{ ...weak[0], bypass_actors: [{ actor_id: 9, actor_type: 'Integration', bypass_mode: 'always' }] }];
  assert.ok(hostDrift({ policy: LEVELS.medium, repository, rulesets: bypassed }).findings.some(f => /direct pushes/.test(f.reason)));
  // A listing without rules is unknown, never clean.
  const unread = hostDrift({ policy: LEVELS.medium, repository, rulesets: listed });
  assert.deepEqual(unread.findings, []);
  assert.match(unread.unknown[0].message, /listed without its rules/);

  // Doctor: the same findings, as autonomy-host lint, from the project's own files.
  const root = await mkdtemp(join(tmpdir(), 'plates-autonomy-hosts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.plates'));
  await mkdir(join(root, '.github/workflows'), { recursive: true });
  const cfg = { name: 'Acme', repo: repository, practices: ['claude'] };
  await writeFile(join(root, '.plates/plates.json'), `${JSON.stringify(cfg)}\n`);
  await writeFile(join(root, '.github/workflows/acme-wide.yml'), workflows[0].text);
  assert.deepEqual(await autonomyHostLints(root, cfg), { lint: [], notes: [] }, 'no declared level, nothing held to');
  await writeFile(join(root, '.plates/autonomy.json'), `${JSON.stringify(LEVELS.medium)}\n`);
  const lint = (await diagnose(root)).lint.filter(l => l.rule === 'autonomy-host');
  assert.deepEqual(lint.map(l => l.message.match(/\((push|merge)\);/)?.[1]), ['push', 'merge', 'push']);
  assert.ok(lint.every(l => l.path === '.github/workflows/acme-wide.yml' && /beyond medium/.test(l.message)));
  // With --github, the rulesets are read (gh injected here) and held to the same level.
  const calls = [];
  const gh = async ([path]) => { calls.push(path); return path === `repos/${repository}` ? { default_branch: 'main' } : path.includes('rulesets?') ? weak.map(({ id, name }) => ({ id, name })) : weak.find(r => path.endsWith(`/${r.id}`)); };
  const remote = await autonomyHostLints(root, cfg, { github: true, gh });
  assert.deepEqual(calls, [`repos/${repository}`, `repos/${repository}/rulesets?includes_parents=true`, ...weak.map(r => `repos/${repository}/rulesets/${r.id}`)]);
  assert.equal(remote.lint.filter(l => l.path === 'GitHub rulesets').length, 4);
  const failing = await autonomyHostLints(root, cfg, { github: true, gh: async () => { throw new Error('HTTP 403'); } });
  assert.deepEqual(failing.notes.map(n => n.message), ['not read (HTTP 403); ruleset drift is unknown']);
});
