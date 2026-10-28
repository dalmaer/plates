// Bounded execution evidence for climb. Advisory receipts never authorize a gate or publish.
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Only fixed vocabulary leaves the private provider file. This is classification,
// not a shell parser: arguments, paths, messages and identifiers are never copied.
function denialDetail(d) {
  const tool = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'].includes(d?.tool_name) ? d.tool_name : 'unknown';
  const input = d?.tool_input;
  const command = typeof input?.command === 'string' ? input.command : null;
  const path = typeof input?.file_path === 'string' ? input.file_path : typeof input?.path === 'string' ? input.path : null;
  let commandFamily = null;
  if (tool === 'Bash' && command !== null && command.length <= 8192) {
    const match = /^(git (?:status|diff|log|show|add|commit|switch|worktree)|npm (?:test|run)|node)(?=\s|$)/.exec(command.trimStart());
    commandFamily = match?.[1] ?? null;
  }
  let targetKind = null;
  if (path !== null && path.length > 0 && path.length <= 4096) {
    targetKind = /^(?:\.\/)?\.git(?:\/|$)/.test(path) ? 'repository-metadata'
      : /^(?:\.\/)?\.plates(?:\/|$)/.test(path) ? 'plates-state'
      : path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) ? 'absolute-path'
      : 'relative-path';
  }
  return { tool, reason: 'permission-denied', commandFamily, targetKind,
    commandDetail: command === null ? 'not-supplied' : commandFamily ? 'classified-prefix-only' : 'withheld',
    targetDetail: path === null ? 'not-supplied' : targetKind ? 'classified-path-only' : 'withheld' };
}

/** At most eight sanitized diagnostics; counts do not imply operation details. */
export function denialEvidence(result) {
  const entries = Array.isArray(result?.permission_denials) ? result.permission_denials : [];
  const reported = Number.isSafeInteger(result?.permission_denials_count) && result.permission_denials_count >= 0 ? result.permission_denials_count : 0;
  const count = Math.max(reported, entries.length);
  const retained = entries.slice(0, 8).map(denialDetail);
  return { count, detailsAvailable: retained.some(d => d.commandFamily !== null || d.targetKind !== null),
    omitted: Math.max(0, count - retained.length), entries: retained };
}

/** Runner capability only. The action's later model/tool permissions are explicitly unverified. */
export async function preflight(root, { execute = spawnSync } = {}) {
  const checks = [];
  let scratch;
  try {
    scratch = await mkdtemp(join(root, '.plates-climb-probe-'));
    await writeFile(join(scratch, 'probe'), 'acme\n');
    if (await readFile(join(scratch, 'probe'), 'utf8') !== 'acme\n') throw new Error('read');
    checks.push({ capability: 'repository-read-write', ok: true });
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' };
    for (const k of Object.keys(env)) if (k.startsWith('GIT_') && !['GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_TERMINAL_PROMPT'].includes(k)) delete env[k];
    const commands = [
      ['node', process.execPath, ['--version']], ['npm', 'npm', ['--version']],
      ['git-init', 'git', ['init', '-q']], ['git-add', 'git', ['add', 'probe']],
      ['git-commit', 'git', ['-c', 'user.name=Acme', '-c', 'user.email=acme@example.test', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'capability probe']],
    ];
    for (const [capability, command, args] of commands) {
      const r = execute(command, args, { cwd: scratch, env, timeout: 10000, maxBuffer: 16384, encoding: 'utf8', shell: false });
      checks.push({ capability, ok: !r.error && r.status === 0 });
      if (!checks.at(-1).ok) break;
    }
  } catch { checks.push({ capability: 'repository-read-write', ok: false }); }
  finally { if (scratch) await rm(scratch, { recursive: true, force: true }); }
  const runnerReady = checks.length === 6 && checks.every(c => c.ok);
  // This receipt establishes runner capability only. Do not turn declared
  // action settings into effective permission evidence, or disable every climb
  // until a provider-bound readiness adapter has been implemented and reviewed.
  return { schema: 1, ok: runnerReady, state: runnerReady ? 'runner-ready' : 'blocked', runnerReady, checks, agentPermissions: 'unverified',
    line: runnerReady ? 'runner capabilities verified; agent action permissions remain unverified' : 'blocked: runner capability preflight failed; baseline was not started' };
}

/** Wall seconds, not CPU. Total includes inter-job queue/transfer time; phases must not be summed as total. */
export function durations({ started, baselineStarted, baselineEnded, agentSeconds, judgeStarted, now = Date.now() / 1000 }) {
  const n = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
  const span = (a, b) => n(a) !== null && n(b) !== null && n(b) >= n(a) ? n(b) - n(a) : null;
  return { unit: 'seconds', clock: 'wall', setup: span(started, baselineStarted), baseline: span(baselineStarted, baselineEnded), agent: n(agentSeconds), judge: span(judgeStarted, now), total: span(started, now), cpu: null, totalIncludes: 'through this snapshot, including inter-job queue and transfer; starts after agent checkout', setupIncludes: 'agent runner setup before baseline; later setup remains unallocated', judgeIncludes: 'judge setup, gate and comparison through snapshot; publish excluded' };
}

export function completion({ kept }, night) {
  if (kept > 0) return 'candidate';
  if (night?.settlements?.length) return 'incomplete';
  const attempts = night?.tried ?? [];
  if (!attempts.length) return 'no-candidate';
  const evaluated = a => a.verdict === 'revert' && (
    (Array.isArray(a.rounds) && a.rounds.length >= 2 && a.rounds.every(r => Number.isFinite(r.base) && Number.isFinite(r.candidate) && Number.isFinite(r.change))) ||
    (Number.isInteger(a.runs) && a.runs > 0 && Number.isInteger(a.passed) && a.passed >= 0 && Number.isInteger(a.failed) && a.failed > 0 && a.passed + a.failed <= a.runs && typeof a.tree === 'string' && /^[0-9a-f]{40,64}$/.test(a.tree))
  );
  return attempts.every(evaluated) ? 'no-improvement' : 'incomplete';
}
