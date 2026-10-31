// Phase 144: a project's risk level (phase 132) rendered into the controls its
// hosts already enforce, and the places a host allows more than the level.
// Pure: no file, network or GitHub API access. Rendering is a preview; applying
// a ruleset is the owner's (⚑). Callers read the workflows and rulesets.
//
// The table, per level and phase 132 scope (headless hosts have nobody to ask,
// so a scope the level does not grant is closed, not "ask"):
//
//   scope        Low                Medium              High
//   local-edits  closed (read-only) open                open
//   tests        closed             open                open
//   push         closed             closed              selected branches and namespaces; never force/delete
//   merge        closed             closed              selected bases, through the PR rule's checks
//   deployment   closed             closed              closed (specific approval)
//   security     closed             closed              closed (specific approval)
//
// Claude Code headless runs do not use the interactive auto-mode classifier, so
// the mapping is explicit --allowedTools/--disallowedTools and --permission-mode.
// Codex: sandbox_mode, approval_policy (never: a headless run cannot be asked)
// and network. GitHub: one ruleset on the default branch; no level renders a
// bypass actor, and drift reports a bot bypass except, at High, on a ruleset
// that covers only the selected task namespaces.
import { autonomyReport } from './autonomy.mjs';

export const HOST_RENDERER = 'plates-autonomy-hosts-v1';
const READ_TOOLS = ['Read', 'Glob', 'Grep'];
const EDIT_TOOLS = ['Edit', 'Write'];
const TEST_TOOLS = ['Bash(npm test*)', 'Bash(npm run *)', 'Bash(node --test*)'];
const LOCAL_GIT = ['Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git show*)', 'Bash(git add *)', 'Bash(git commit *)'];
// Denied at every level: force pushes, deletion, deployment, security, CI and policy files.
const ALWAYS_DENIED = [
  'Bash(git push --force*)', 'Bash(git push -f*)', 'Bash(git push * --force*)', 'Bash(git push * -f*)', 'Bash(git push --delete*)', 'Bash(git push * --delete*)',
  'Bash(git push *:*)', 'Bash(git push * +*)', 'Bash(git push --mirror*)',
  'Bash(npm publish*)', 'Bash(gh release*)', 'Bash(gh workflow run*)', 'Bash(gh secret*)', 'Bash(gh variable*)', 'Bash(gh auth*)', 'Bash(gh api*)', 'Bash(gh ruleset*)', 'Bash(gh repo edit*)', 'Bash(sudo *)',
  'Edit(.github/workflows/**)', 'Write(.github/workflows/**)', 'Edit(.plates/autonomy.json)', 'Write(.plates/autonomy.json)', 'Edit(.claude/settings*.json)', 'Write(.claude/settings*.json)',
];
const PUSH_DENIED = ['Bash(git push*)', 'Bash(gh pr create*)'];
const MERGE_DENIED = ['Bash(gh pr merge*)'];

const policyOf = (policy, repository) => autonomyReport(policy, repository);
const grantsOf = report => {
  const { mode, push, merge, pushPrefixes = [] } = report.policy;
  return {
    'local-edits': mode !== 'default', tests: mode !== 'default',
    push: mode === 'delivery' && (push.length + pushPrefixes.length) > 0,
    merge: mode === 'delivery' && merge.length > 0,
    deployment: false, security: false,
  };
};

/** The three hosts' controls for a level, plus the ruleset payload GitHub's rulesets API takes. */
export function renderHostControls({ policy, repository, checks = ['check'], defaultBranch = 'main' }) {
  const report = policyOf(policy, repository);
  const grants = grantsOf(report);
  const { push, merge, pushPrefixes = [] } = report.policy;
  const pushTools = grants.push ? [...push.map(b => `Bash(git push origin ${b})`), ...pushPrefixes.map(p => `Bash(git push origin ${p}*)`)] : [];
  const allowedTools = [...READ_TOOLS, ...(grants['local-edits'] ? [...EDIT_TOOLS, ...LOCAL_GIT] : []), ...(grants.tests ? TEST_TOOLS : []),
    ...pushTools, ...(grants.merge ? ['Bash(gh pr merge --auto *)'] : [])];
  const disallowedTools = [...(grants.push ? [] : PUSH_DENIED), ...(grants.merge ? [] : MERGE_DENIED), ...ALWAYS_DENIED];
  const permissionMode = grants['local-edits'] ? 'acceptEdits' : 'default';
  const quote = list => `"${list.join(',')}"`;
  const mergesDefault = grants.merge && merge.includes(defaultBranch);
  const ruleset = {
    name: `plates risk ${report.level}: default branch`,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      { type: 'pull_request', parameters: {
        // High's selected merge into the default branch is gated by checks, not a human per merge.
        required_approving_review_count: mergesDefault ? 0 : 1,
        dismiss_stale_reviews_on_push: true, require_code_owner_review: false,
        require_last_push_approval: !mergesDefault, required_review_thread_resolution: false,
      } },
      { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: checks.map(context => ({ context })) } },
    ],
  };
  return {
    renderer: HOST_RENDERER, level: report.level, repository: report.policy.repository, policyDigest: report.policyDigest, preview: true,
    scopes: Object.fromEntries(Object.entries(grants).map(([scope, open]) => [scope, open])),
    claude: { permissionMode, allowedTools, disallowedTools,
      args: ['--permission-mode', permissionMode, '--allowedTools', quote(allowedTools), '--disallowedTools', quote(disallowedTools)].join(' ') },
    codex: { sandbox_mode: grants['local-edits'] ? 'workspace-write' : 'read-only', approval_policy: 'never',
      sandbox_workspace_write: { network_access: grants.push } },
    ruleset,
    notes: [
      'A preview: applying the ruleset to GitHub is the owner\'s step.',
      ...(grants.merge ? [`gh pr merge cannot name its base in a tool rule; merges outside ${merge.join(', ')} are held by GitHub rules, not the tool list.`] : []),
      'Tool lists bound commands, not what a test or script runs; credentials, network and the ruleset bound the rest.',
    ],
  };
}

// ---- reading workflows -------------------------------------------------------

const indentOf = line => line.length - line.trimStart().length;
const blank = line => !line.trim() || line.trim().startsWith('#');
const unquote = v => { v = v.replace(/\s+#.*$/, '').trim(); return /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v; };

/** Every claude-code-action and codex-action step: { action, path, line, name, inputs }. YAML read by indentation only. */
export function actionSteps(path, text) {
  const lines = text.split('\n'), out = [];
  lines.forEach((line, i) => {
    const m = /^(\s*)(-\s+)?uses:\s*['"]?(anthropics\/claude-code-action|openai\/codex-action)@/.exec(line);
    if (!m) return;
    let start = i;
    if (!m[2]) while (start > 0 && !(/^\s*-\s/.test(lines[start]) && indentOf(lines[start]) < indentOf(line))) start--;
    const dash = indentOf(lines[start]);
    let end = start + 1;
    while (end < lines.length && (blank(lines[end]) || indentOf(lines[end]) > dash)) end++;
    const body = [lines[start].replace(/^(\s*)-/, '$1 '), ...lines.slice(start + 1, end)];
    const name = body.map(l => /^\s*name:\s*(.+)$/.exec(l)?.[1]).find(Boolean);
    const inputs = {};
    const w = body.findIndex(l => /^\s*with:\s*$/.test(l));
    if (w >= 0) {
      const wi = indentOf(body[w]);
      for (let j = w + 1; j < body.length && (blank(body[j]) || indentOf(body[j]) > wi); j++) {
        const kv = /^(\s*)([\w-]+):\s*(.*)$/.exec(body[j]);
        if (!kv || blank(body[j])) continue;
        const ki = kv[1].length;
        if (/^[|>][-+]?$/.test(kv[3].trim())) {
          const block = [];
          while (j + 1 < body.length && (!body[j + 1].trim() || indentOf(body[j + 1]) > ki)) block.push(body[++j].trim());
          inputs[kv[2]] = block.join(kv[3].startsWith('>') ? ' ' : '\n').trim();
        } else inputs[kv[2]] = unquote(kv[3]);
      }
    }
    out.push({ action: m[3].startsWith('anthropics') ? 'claude' : 'codex', path, line: i + 1, name: name ? unquote(name) : null, inputs });
  });
  return out;
}

/** Shell-like words: quotes kept together, a backslash-newline joins lines. */
export function words(text) {
  const out = []; let cur = '', quote = null, has = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = null; else if (c === '\\' && quote === '"' && i + 1 < text.length && '"\\$`'.includes(text[i + 1])) cur += text[++i]; else cur += c; continue; }
    if (c === "'" || c === '"') { quote = c; has = true; continue; }
    if (c === '\\' && text[i + 1] === '\n') { i++; continue; }
    if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ''; has = false; continue; }
    cur += c; has = true;
  }
  if (cur || has) out.push(cur);
  return out;
}

/** A tool list ("Read,Bash(npm run *) Edit") split on commas and spaces outside parentheses. */
export function toolList(text) {
  const out = []; let cur = '', depth = 0;
  for (const c of text) {
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (c === ',' || /\s/.test(c))) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** What a Claude step grants: { allowed, denied, permissionMode, skip }. */
export function claudeGrant(inputs) {
  const allowed = [], denied = [];
  let permissionMode = null, skip = false, sandbox = null;
  const settings = text => {
    let s; try { s = JSON.parse(text); } catch { return; }
    if (s?.sandbox && typeof s.sandbox === 'object') sandbox = s.sandbox;
    if (Array.isArray(s?.permissions?.allow)) allowed.push(...s.permissions.allow.filter(x => typeof x === 'string'));
    if (Array.isArray(s?.permissions?.deny)) denied.push(...s.permissions.deny.filter(x => typeof x === 'string'));
    if (typeof s?.permissions?.defaultMode === 'string') permissionMode = s.permissions.defaultMode;
  };
  for (const key of ['allowed_tools', 'allowed-tools']) if (inputs[key]) allowed.push(...toolList(inputs[key]));
  for (const key of ['disallowed_tools', 'disallowed-tools']) if (inputs[key]) denied.push(...toolList(inputs[key]));
  if (inputs.settings) settings(inputs.settings);
  const w = words(inputs.claude_args ?? '');
  for (let i = 0; i < w.length; i++) {
    const flag = w[i].split('=')[0], inline = w[i].includes('=') ? w[i].slice(w[i].indexOf('=') + 1) : null;
    const values = () => { if (inline !== null) return [inline]; const v = []; while (i + 1 < w.length && !w[i + 1].startsWith('-')) v.push(w[++i]); return v; };
    if (['--allowedTools', '--allowed-tools'].includes(flag)) allowed.push(...values().flatMap(toolList));
    else if (['--disallowedTools', '--disallowed-tools'].includes(flag)) denied.push(...values().flatMap(toolList));
    else if (flag === '--permission-mode') permissionMode = values()[0] ?? null;
    else if (flag === '--dangerously-skip-permissions') skip = true;
    else if (flag === '--settings') settings(values()[0] ?? '');
  }
  return { allowed, denied, permissionMode, skip, offline: offline(sandbox, allowed) };
}

/**
 * Bash that cannot reach any host: Claude Code's sandbox on, no unsandboxed
 * escape or excluded command, no weaker network isolation, no allowed domain or
 * proxy, and no WebFetch(domain:…) rule. Its documented meaning: sandboxed
 * commands reach no host, and a headless run has nobody to approve a new one.
 * Then a Bash rule cannot push, merge or deploy, whatever its words.
 */
function offline(sandbox, allowed) {
  if (!sandbox || sandbox.enabled !== true || sandbox.allowUnsandboxedCommands !== false || sandbox.enableWeakerNetworkIsolation === true) return false;
  if (Array.isArray(sandbox.excludedCommands) ? sandbox.excludedCommands.length : sandbox.excludedCommands !== undefined) return false;
  const net = sandbox.network ?? {};
  if ((Array.isArray(net.allowedDomains) ? net.allowedDomains.length : net.allowedDomains !== undefined) || net.httpProxyPort != null || net.socksProxyPort != null) return false;
  return !allowed.some(rule => /^WebFetch\(domain:/.test(rule));
}
const NETWORK_SCOPES = ['push', 'merge', 'deployment'];

// ---- what a tool rule reaches ------------------------------------------------

const ALL = ['local-edits', 'tests', 'push', 'merge', 'deployment', 'security'];
const SENSITIVE_PATH = /(^|\/)(\.github\/workflows|\.plates\/autonomy\.json|\.claude\/settings)/;
const DEPLOY = /^(npm|yarn|pnpm) publish\b|^(vercel|netlify|wrangler|flyctl|fly|firebase|kubectl|helm|terraform|pulumi|gcloud|aws|az|docker push|heroku)\b|^gh (release|workflow run|run rerun)\b/;
const command = spec => spec.replace(/:\*$/, ' *').trim();
const literal = rule => { const m = /^([\w-]+)(?:\((.*)\))?$/.exec(rule.trim()); return m ? { tool: m[1], spec: m[2] === undefined ? null : command(m[2]) } : { tool: rule.trim(), spec: null }; };
const prefix = spec => spec.split('*')[0].trimEnd();

/** The git push destination a rule names, or null when it is unbounded. */
function pushTarget(args) {
  const rest = args.filter(a => !a.startsWith('-'));
  if (args.some(a => /^(-f|--force.*|--delete|-d|--mirror|--all|--prune)$/.test(a)) || rest.some(a => a.startsWith('+') || a.includes(':'))) return { forced: true };
  if (rest.length < 2) return null; // no refspec: wherever the upstream points
  return { ref: rest[rest.length - 1] };
}

/** The scopes a rule reaches; `push` is { bounded } when a High namespace could hold it. */
export function ruleReach(rule) {
  const { tool, spec } = literal(rule);
  if (/^(Read|Glob|Grep|LS|WebSearch|WebFetch|TodoWrite|Task|Agent|NotebookRead)$/.test(tool)) return { scopes: [] };
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return { scopes: spec && SENSITIVE_PATH.test(spec) ? ['security'] : ['local-edits'] };
  if (tool.startsWith('mcp__')) {
    const n = tool.toLowerCase();
    return { scopes: [...(/merge/.test(n) ? ['merge'] : []), ...(/push|create_or_update_file|create_branch|delete_file/.test(n) ? ['push'] : []), ...(/deploy|release/.test(n) ? ['deployment'] : []), ...(/secret/.test(n) ? ['security'] : [])] };
  }
  if (tool !== 'Bash') return { scopes: ['tests'] };
  if (spec === null || spec === '*' || spec === '') return { scopes: ALL, why: 'any shell command' };
  const w = spec.split(/\s+/);
  if (w[0] === 'sudo') return { scopes: ['security'] };
  if (w[0] === 'git') {
    let i = 1;
    while (i < w.length && w[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree'].includes(w[i]) ? 2 : 1;
    // `git status*` is git status; `git *` or `git pu*` could be git push.
    const sub = w[i]?.replace(/\*$/, '');
    if (sub === undefined || sub.includes('*') || (w[i] !== sub && 'push'.startsWith(sub) && sub !== 'push')) return { scopes: ['local-edits', 'push'], why: 'git with any subcommand, push included' };
    if (sub === 'push') {
      const target = pushTarget(w.slice(i + 1));
      if (target?.forced) return { scopes: ['push'], forced: true, why: 'force push, deletion or a refspec' };
      return { scopes: ['push'], target: target?.ref ?? null };
    }
    return { scopes: ['status', 'diff', 'log', 'show', 'blame', 'rev-parse', 'ls-files', 'fetch', 'pull', 'grep'].includes(sub) ? [] : ['local-edits'] };
  }
  if (w[0] === 'gh') {
    const sub = w.slice(1, 3).join(' ');
    if (w[1] === undefined || w[1].includes('*')) return { scopes: ['push', 'merge', 'deployment', 'security'], why: 'gh with any subcommand' };
    if (/^pr merge\b/.test(sub)) return { scopes: ['merge'] };
    if (/^pr create\b/.test(sub)) return { scopes: ['push'] };
    if (w[1] === 'api') return { scopes: ['push', 'merge', 'security'], why: 'gh api can write anything the token can' };
    if (DEPLOY.test(spec)) return { scopes: ['deployment'] };
    if (/^(secret|variable|auth|ruleset)\b|^repo (edit|delete)\b/.test(sub)) return { scopes: ['security'] };
    return { scopes: [] };
  }
  if (DEPLOY.test(spec)) return { scopes: ['deployment'] };
  return { scopes: ['tests'] }; // running code: tests, scripts, interpreters
}

// ---- drift -------------------------------------------------------------------

const where = step => `${step.name ? `${step.name}, ` : ''}line ${step.line}`;

/** The scopes a reach exceeds under a level's grants. */
function exceeds(reach, grants, policy) {
  return reach.scopes.filter(scope => {
    if (scope !== 'push') return !grants[scope];
    if (!grants.push || reach.forced || reach.why) return true;
    const t = reach.target;
    if (!t) return true;
    const bounded = (policy.pushPrefixes ?? []).some(p => t.startsWith(p) && t.length > p.length) || policy.push.includes(t);
    return !bounded;
  });
}

/** Rules a broader deny already covers (Claude: deny wins over allow). */
function deniedBy(rule, denied) {
  const a = literal(rule);
  return denied.some(d => {
    const b = literal(d);
    if (b.tool !== a.tool) return false;
    if (b.spec === null || b.spec === '*') return true;
    if (a.spec === null) return false;
    // Only a plain prefix deny (one trailing *) is read as covering; anything finer is not subtracted.
    const star = b.spec.indexOf('*');
    if (star === -1) return a.spec === b.spec;
    return star === b.spec.length - 1 && prefix(a.spec).startsWith(prefix(b.spec));
  });
}

function claudeDrift(step, grants, policy) {
  const g = claudeGrant(step.inputs);
  const out = [];
  const add = (scope, reason) => out.push({ host: 'claude', scope, path: step.path, line: step.line, reason });
  if (g.skip || g.permissionMode === 'bypassPermissions') {
    for (const scope of ALL) if (!grants[scope]) add(scope, g.skip ? '--dangerously-skip-permissions' : '--permission-mode bypassPermissions');
  } else if (g.permissionMode === 'acceptEdits' && !grants['local-edits']) add('local-edits', '--permission-mode acceptEdits');
  for (const rule of g.allowed) {
    if (deniedBy(rule, g.denied)) continue;
    let reach = ruleReach(rule);
    if (g.offline && literal(rule).tool === 'Bash') reach = { ...reach, scopes: reach.scopes.filter(s => !NETWORK_SCOPES.includes(s)) };
    for (const scope of exceeds(reach, grants, policy)) add(scope, `allows ${rule}${reach.why ? ` (${reach.why})` : scope === 'push' && reach.target === null ? ' (no bounded destination)' : ''}`);
  }
  return merged(out, step);
}

/** One finding per step and scope, its reasons joined. */
function merged(out, step) {
  const by = new Map();
  for (const f of out) { const g = by.get(f.scope); if (g) g.reason += `; ${f.reason}`; else by.set(f.scope, { ...f, where: where(step) }); }
  return [...by.values()];
}

function codexDrift(step, grants) {
  const out = [];
  const add = (scope, reason) => out.push({ host: 'codex', scope, path: step.path, line: step.line, reason });
  const args = words(step.inputs['codex-args'] ?? step.inputs.codex_args ?? '');
  let sandbox = step.inputs.sandbox || 'workspace-write'; // codex-action's documented default
  let network = false;
  for (let i = 0; i < args.length; i++) {
    if (['-s', '--sandbox'].includes(args[i])) sandbox = args[i + 1] ?? sandbox;
    else if (args[i].startsWith('--sandbox=')) sandbox = args[i].slice(10);
    else if (args[i] === '--full-auto') sandbox = 'workspace-write';
    else if (['--dangerously-bypass-approvals-and-sandbox', '--yolo'].includes(args[i])) sandbox = 'danger-full-access';
    else if (['-c', '--config'].includes(args[i]) && /^sandbox_workspace_write\.network_access\s*=\s*true$/.test(args[i + 1] ?? '')) network = true;
  }
  if (sandbox === 'danger-full-access') for (const scope of ALL) { if (!grants[scope]) add(scope, `sandbox ${sandbox}`); }
  else if (sandbox !== 'read-only') for (const scope of ['local-edits', 'tests']) { if (!grants[scope]) add(scope, `sandbox ${sandbox}`); }
  if (network && sandbox !== 'danger-full-access' && !grants.push) add('push', 'sandbox network access');
  if (step.inputs['safety-strategy'] === 'unsafe') add('security', 'safety-strategy unsafe');
  return merged(out, step);
}

// GitHub ref globs: * within a path segment, ** across.
const globRe = g => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*')}$`);
const BOT_ACTORS = new Set(['Integration', 'DeployKey']);
function covers(ruleset, ref, defaultBranch) {
  const { include = [], exclude = [] } = ruleset.conditions?.ref_name ?? {};
  const hit = p => p === '~ALL' || (p === '~DEFAULT_BRANCH' && ref === `refs/heads/${defaultBranch}`) || (!p.startsWith('~') && globRe(p).test(ref));
  return include.some(hit) && !exclude.some(hit);
}
const insideNamespaces = (ruleset, policy, defaultBranch) => {
  const { include = [] } = ruleset.conditions?.ref_name ?? {};
  return include.length > 0 && !covers(ruleset, `refs/heads/${defaultBranch}`, defaultBranch)
    && include.every(p => (policy.pushPrefixes ?? []).some(n => p.startsWith(`refs/heads/${n}`)) || policy.push.some(b => p === `refs/heads/${b}`));
};

function rulesetDrift(rulesets, grants, policy, expected, defaultBranch) {
  const findings = [], unknown = [];
  const path = 'GitHub rulesets';
  const add = (scope, reason, name) => findings.push({ host: 'github', scope, path, where: name ? `ruleset ${name}` : 'default branch', reason });
  const branchSets = rulesets.filter(r => (r.target ?? 'branch') === 'branch' && r.enforcement === 'active');
  for (const r of branchSets) if (!Array.isArray(r.rules) || !r.conditions) unknown.push({ path, message: `ruleset ${r.name ?? r.id} was listed without its rules; read repos/{owner}/{repo}/rulesets/${r.id} to check it` });
  const read = branchSets.filter(r => Array.isArray(r.rules) && r.conditions);
  const ref = `refs/heads/${defaultBranch}`;
  for (const r of read) {
    const bots = (r.bypass_actors ?? []).filter(a => BOT_ACTORS.has(a.actor_type));
    if (!bots.length) continue;
    if (grants.push && insideNamespaces(r, policy, defaultBranch)) continue;
    for (const scope of covers(r, ref, defaultBranch) ? ['push', 'merge'] : ['push']) add(scope, `a bot (${bots.map(a => `${a.actor_type} ${a.actor_id ?? ''}`.trim()).join(', ')}) can bypass it`, r.name ?? r.id);
  }
  // What holds the default branch: active rulesets on it that no bot can bypass.
  const holding = read.filter(r => covers(r, ref, defaultBranch) && !(r.bypass_actors ?? []).some(a => BOT_ACTORS.has(a.actor_type)));
  if (unknown.length && !holding.length) return { findings, unknown };
  const rules = holding.flatMap(r => r.rules);
  const pr = rules.filter(x => x.type === 'pull_request');
  const approvals = Math.max(-1, ...pr.map(x => x.parameters?.required_approving_review_count ?? 0));
  const checks = new Set(rules.filter(x => x.type === 'required_status_checks').flatMap(x => (x.parameters?.required_status_checks ?? []).map(c => c.context)));
  if (!pr.length) add('push', `${defaultBranch} accepts direct pushes (no pull request rule)`);
  else if (approvals < expected.approvals) add('merge', `${defaultBranch} needs ${approvals} approving review${approvals === 1 ? '' : 's'}; the level needs ${expected.approvals}`);
  if (!rules.some(x => x.type === 'non_fast_forward')) add('push', `${defaultBranch} allows force pushes`);
  if (!rules.some(x => x.type === 'deletion')) add('push', `${defaultBranch} can be deleted`);
  const missing = expected.checks.filter(c => !checks.has(c));
  if (missing.length) add('merge', `${defaultBranch} merges without the required check${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`);
  return { findings, unknown };
}

/**
 * Where a host allows more than the level. workflows: [{ path, text }];
 * rulesets: an array as GitHub returns ruleset details (repos/{o}/{r}/rulesets/{id});
 * a listed ruleset without its rules is unknown, never clean. Omit rulesets to skip GitHub.
 */
export function hostDrift({ policy, repository, workflows = [], rulesets, checks = ['check'], defaultBranch = 'main' }) {
  const report = policyOf(policy, repository);
  const grants = grantsOf(report);
  const rendered = renderHostControls({ policy, repository, checks, defaultBranch });
  const pr = rendered.ruleset.rules.find(r => r.type === 'pull_request');
  const findings = [], unknown = [];
  for (const { path, text } of workflows) {
    for (const step of actionSteps(path, text)) findings.push(...(step.action === 'claude' ? claudeDrift(step, grants, report.policy) : codexDrift(step, grants)));
  }
  if (rulesets !== undefined) {
    if (!Array.isArray(rulesets)) unknown.push({ path: 'GitHub rulesets', message: 'the ruleset reading is not a list' });
    else {
      const r = rulesetDrift(rulesets, grants, report.policy, { approvals: pr.parameters.required_approving_review_count, checks }, defaultBranch);
      findings.push(...r.findings); unknown.push(...r.unknown);
    }
  }
  return {
    level: report.level, policyDigest: report.policyDigest,
    findings: findings.map(f => ({ ...f, detail: `${f.where}: ${f.reason}, beyond ${report.level} (${f.scope})`, message: `${f.path} (${f.where}): ${f.reason}, beyond ${report.level} (${f.scope})` })),
    unknown,
  };
}
