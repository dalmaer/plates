// What the delivery practice's configuration says, and the concurrency rule
// every project's workflows keep (plates phase 80; plates practice `delivery`;
// managed: plates render rewrites it). The design is plates's
// docs/research/2026-10-16-delivery.md, items 1, 2 and 6.
//
// Zero imports beyond Node: plates's doctor reads this file in plates's own
// tree, where the night's scripts are not beside it.
//
//   deliveryOf(config)        .plates/plates.json "delivery": { tested, gateWorkflow,
//                             workflows, site, version, smoke, promote, vercel,
//                             migrations, grant }, validated, each error naming its
//                             key (workflows: plates doctor workflow-concurrency; site,
//                             version and smoke: phase 81's verifier,
//                             scripts/plates/verify.mjs; promote: phase 82's plates
//                             promote, scripts/plates/promote.mjs; vercel,
//                             migrations and grant: phase 177's Vercel target,
//                             scripts/plates/vercel.mjs)
//   concurrencyOf(text)       a workflow's concurrency blocks, read as text
//   workflowKind(file, text, { gate, check, workflows })  'test', 'publish' or null
//   concurrencyProblems(file, text, kind)  the rule, broken: [string]
//
// The rule (design item 6; isocan's test/workflows.test.ts is the model):
// a test or gate workflow cancels a superseded run on the same ref (a group
// per ref, cancel-in-progress: true); a publish or deploy workflow is queued
// and never cancelled (one fixed group, cancel-in-progress: false), since a
// deploy stopped midway is worse than a late one.

/** The tested ref when .plates/plates.json names none. */
export const TESTED = 'green';

/** Words in a workflow's file name or `name:` that make it a publish or deploy workflow. */
export const PUBLISH_WORDS = Object.freeze(['publish', 'deploy', 'deployment', 'release', 'promote']);
/** Words that make it a test or gate workflow (when not a publish one). */
export const TEST_WORDS = Object.freeze(['test', 'tests', 'check', 'checks', 'ci', 'gate']);
/** Words that name a verifier, smoke check or alerter rather than a deploy or test suite (#212). */
export const OBSERVER_WORDS = Object.freeze(['verify', 'verification', 'verifier', 'smoke', 'alert', 'alerts', 'alerter', 'notify', 'notifier', 'notification', 'notifications']);
const CODE_TRIGGERS = ['push', 'pull_request', 'pull_request_target', 'merge_group'];
const WORKFLOW_KINDS = ['test', 'publish', 'deploy', 'none'];

/**
 * A group expression that names the ref or the commit: two runs of different
 * refs (or commits) land in different groups. A test group wants one; a
 * publish group must have none.
 */
const PER_REF = /\bgithub\.(ref|ref_name|head_ref)\b|\bpull_request\.number\b|\bissue\.number\b|\bhead_branch\b/;
const PER_COMMIT = /\bgithub\.sha\b|\bhead_sha\b|\bpull_request\.head\.sha\b/;
/** A group expression that names the run: every run lands in a group of its own (#179). */
const PER_RUN = /\bgithub\.(run_id|run_number|run_attempt|job)\b/;
/** Contexts that are the same for every run of a workflow: a group made of these and literals is fixed. */
const FIXED_CONTEXTS = new Set(['github.workflow', 'github.repository', 'github.repository_owner', 'github.event.repository.name', 'github.event.repository.full_name', 'github.event.repository.default_branch']);

/** The context paths an expression reads (literals, operators and function names aside). */
function contextsOf(expr) {
  const src = expr.replace(/'(?:[^']|'')*'/g, "''");
  const out = [];
  for (const m of src.matchAll(/[A-Za-z_][\w-]*(?:\.[A-Za-z_*][\w-]*|\[[^\]]*\])*(\s*\()?/g)) {
    if (m[1] || ['true', 'false', 'null'].includes(m[0])) continue;
    out.push(m[0]);
  }
  return out;
}

/**
 * Whether a publish or deploy group is one fixed group: { fixed: true } or
 * { fixed: false, kind: 'ref' | 'commit' | 'run' | 'unknown', reads }. A
 * literal name is fixed; so is one made of contexts every run shares
 * (github.workflow, github.repository). `${{ <condition> && '<name>' || <any> }}`
 * is fixed only when `gated(<condition>)` says no run outside the condition
 * publishes (concurrencyProblems: every publishing job's `if:` is that
 * condition, plates-publish.yml's form); otherwise its fallback group can
 * publish beside `<name>` (a retry's own group, say), and it is not
 * established (PR #182 review). A group naming the ref, the commit or the run
 * is not fixed; anything else plates cannot establish, and says so rather than
 * guess (#179).
 */
export function groupFixity(group, { gated = () => false } = {}) {
  if (!group) return { fixed: false, kind: 'unknown', reads: [] };
  const exprs = [...group.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map(m => m[1].trim());
  if (!exprs.length) return { fixed: true };
  const cond = /^\$\{\{\s*([\s\S]+)&&\s*'((?:[^']|'')+)'\s*\|\|\s*([\s\S]+?)\s*\}\}$/.exec(group.trim());
  if (cond && balanced(cond[1])) {
    if (gated(cond[1])) return { fixed: true };
    return { fixed: false, kind: 'unknown', reads: [], why: `runs outside ${JSON.stringify(normExpr(cond[1]))} get another group, and no job's if: keeps them from publishing` };
  }
  const reads = exprs.flatMap(contextsOf);
  if (exprs.some(e => PER_RUN.test(e))) return { fixed: false, kind: 'run', reads };
  if (exprs.some(e => PER_COMMIT.test(e))) return { fixed: false, kind: 'commit', reads };
  if (exprs.some(e => PER_REF.test(e))) return { fixed: false, kind: 'ref', reads };
  const unknown = reads.filter(r => !FIXED_CONTEXTS.has(r) && !/^vars\.[A-Za-z_]\w*$/.test(r));
  return unknown.length ? { fixed: false, kind: 'unknown', reads: unknown } : { fixed: true };
}

/** An expression as compared: no `${{ }}`, whitespace collapsed, parentheses around the whole of it dropped. */
export function normExpr(e) {
  let s = String(e ?? '').trim().replace(/^\$\{\{([\s\S]*)\}\}$/, '$1').replace(/\s+/g, ' ').trim();
  for (;;) {
    if (!s.startsWith('(') || !s.endsWith(')') || !balanced(s.slice(1, -1))) return s;
    // The outer pair only when it encloses everything: "(a) || (b)" keeps its own.
    let depth = 0, whole = true;
    for (let k = 0; k < s.length - 1; k++) { if (s[k] === '(') depth++; else if (s[k] === ')' && --depth === 0) { whole = false; break; } }
    if (!whole) return s;
    s = s.slice(1, -1).trim();
  }
}

/**
 * Each job's own `if:` (normalized, null when unset or a form plates does not
 * read) and `needs:` (names), from a workflow's text: { [name]: { if, needs, line } }.
 */
export function jobKeys(text) {
  const lines = (text ?? '').split('\n');
  const out = {};
  for (const j of jobsOf(text)) {
    let indent = null;
    const keys = { if: null, needs: [], line: j.line };
    for (let i = j.line; i < j.end; i++) {
      const l = lines[i];
      if (!l.trim() || /^\s*#/.test(l)) continue;
      const at = l.search(/\S/);
      indent ??= at;
      if (at !== indent) continue;
      const m = /^\s*(if|needs):[ \t]*(.*?)[ \t]*$/.exec(l);
      if (!m) continue;
      if (m[1] === 'if') { const s = scalar(m[2]); keys.if = s.error || !s.value ? null : normExpr(s.value); continue; }
      const v = m[2].replace(/[ \t]+#.*$/, '');
      if (v.startsWith('[')) keys.needs = v.replace(/^\[|\]$/g, '').split(',').map(x => x.trim().replace(/^(["'])(.*)\1$/, '$2')).filter(Boolean);
      else if (v) keys.needs = [scalar(v).value].filter(Boolean);
      else for (let k = i + 1; k < j.end && /^\s*-\s/.test(lines[k]); k++) keys.needs.push(lines[k].replace(/^\s*-\s*/, '').replace(/[ \t]+#.*$/, '').trim().replace(/^(["'])(.*)\1$/, '$2'));
    }
    out[j.name] = keys;
  }
  return out;
}

/**
 * Whether a job runs only on `cond`: its own `if:` is `cond`, or it needs a
 * job that does and its `if:` (when set) has no always(), failure() or
 * cancelled(), so a skipped need skips it too.
 */
function jobOnlyOn(keys, name, cond, seen = new Set()) {
  const j = keys[name];
  if (!j || seen.has(name)) return false;
  seen.add(name);
  if (j.if === cond) return true;
  if (j.if && /\b(always|failure|cancelled)\s*\(/.test(j.if)) return false;
  return j.needs.some(n => jobOnlyOn(keys, n, cond, seen));
}

/** Whether an expression's parentheses balance (outside quotes). */
function balanced(s) {
  let depth = 0;
  for (const c of s.replace(/'(?:[^']|'')*'/g, '')) {
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

/** A workflow's jobs: [{ name, line, end }] (end: the last line of the job, 1-based), read from the lines under a top-level `jobs:`. */
export function jobsOf(text) {
  const lines = (text ?? '').split('\n');
  const start = lines.findIndex(l => /^jobs:[ \t]*(#.*)?$/.test(l));
  if (start < 0) return [];
  const out = [];
  let indent = null, i = start + 1;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || /^\s*#/.test(l)) continue;
    const at = l.search(/\S/);
    if (at === 0) break;
    indent ??= at;
    const m = at === indent ? /^\s*([A-Za-z_][\w-]*):/.exec(l) : null;
    if (m) { if (out.length) out.at(-1).end = i; out.push({ name: m[1], line: i + 1, end: null }); }
  }
  if (out.length) out.at(-1).end = i;
  return out;
}

/** A branch name plates will push the tested ref to: git's own rules, narrowed (no `..`, `@{`, control or glob characters). */
function branchProblem(name) {
  if (typeof name !== 'string' || !name) return 'must be a branch name, like "green"';
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) || name.includes('..') || name.includes('//') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock') || name.split('/').some(s => s.startsWith('.'))) return `must be a branch name, like "green" (got ${JSON.stringify(name)})`;
  if (name.startsWith('refs/') || name === 'HEAD') return `is a branch's short name, like "green", never a full ref or HEAD (got ${JSON.stringify(name)})`;
  if (['main', 'master'].includes(name)) return `cannot be ${name}: the publisher never writes the default branch`;
  return null;
}

/** Every problem with .plates/plates.json "delivery" as the publisher reads it: [string], each naming its key. */
export function deliveryProblems(config) {
  const d = config?.delivery;
  if (d === undefined) return [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['.plates/plates.json "delivery" must be an object'];
  const out = [];
  if (d.tested !== undefined) {
    const p = branchProblem(d.tested);
    if (p) out.push(`.plates/plates.json "delivery".tested ${p}`);
  }
  if (d.gateWorkflow !== undefined && (typeof d.gateWorkflow !== 'string' || !d.gateWorkflow.trim() || d.gateWorkflow !== d.gateWorkflow.trim() || /[\r\n\0"\\]/.test(d.gateWorkflow))) {
    out.push('.plates/plates.json "delivery".gateWorkflow must be the gate workflow\'s file (like "check.yml") or the name GitHub shows for it');
  }
  if (d.workflows !== undefined) {
    if (!d.workflows || typeof d.workflows !== 'object' || Array.isArray(d.workflows)) out.push('.plates/plates.json "delivery".workflows must be an object mapping a workflow\'s file or name to "test", "publish", "deploy" or "none"');
    else for (const [k, v] of Object.entries(d.workflows)) {
      if (!k.trim() || k !== k.trim() || /[\r\n\0"\\]/.test(k)) out.push(`.plates/plates.json "delivery".workflows key ${JSON.stringify(k)} must be a workflow's file (like "deploy.yml") or the name GitHub shows for it`);
      if (!WORKFLOW_KINDS.includes(v)) out.push(`.plates/plates.json "delivery".workflows[${JSON.stringify(k)}] must be "test", "publish", "deploy" or "none" (got ${JSON.stringify(v)})`);
    }
  }
  // The verifier's keys (phase 81): where production is, which path reports its commit, and what to smoke-test.
  if (d.site !== undefined) {
    const p = siteProblem(d.site);
    if (p) out.push(`.plates/plates.json "delivery".site ${p}`);
  }
  if (d.version !== undefined) {
    const p = pathProblem(d.version);
    if (p) out.push(`.plates/plates.json "delivery".version ${p}, the path that reports the commit production serves (like "/api/version")`);
  }
  if (d.smoke !== undefined) {
    if (!Array.isArray(d.smoke) || d.smoke.length > SMOKE_MAX) out.push(`.plates/plates.json "delivery".smoke must be a list of at most ${SMOKE_MAX} checks, each a path ("/") or { "path": "/", "status": 200 }`);
    else d.smoke.forEach((c, i) => { const p = smokeProblem(c); if (p) out.push(`.plates/plates.json "delivery".smoke[${i}] ${p}`); });
  }
  // plates promote's key (phase 82): the ref production deploys from, "tag:<name>" or "branch:<name>", or "none".
  if (d.promote !== undefined) {
    const p = promoteProblem(d.promote, d.tested ?? TESTED);
    if (p) out.push(`.plates/plates.json "delivery".promote ${p}`);
    else if (d.promote !== 'none' && (d.site === undefined || d.version === undefined)) out.push('.plates/plates.json "delivery".promote needs "delivery".site and "delivery".version: plates promote verifies that production serves the commit it moved to');
  }
  // Phase 177: a Vercel target's own keys (where it deploys from, and the scope), the migrations path, and the owner's grant.
  if (d.vercel !== undefined) out.push(...vercelProblems(d.vercel).map(p => `.plates/plates.json "delivery".vercel${p}`));
  const vercelTarget = typeof d.promote === 'string' && d.promote.startsWith('vercel:');
  if (vercelTarget && d.vercel === undefined) out.push('.plates/plates.json "delivery".promote is a Vercel target and needs "delivery".vercel: { "scope": "<team>", "checkout": "<an absolute directory outside every checkout>" }');
  if (d.vercel !== undefined && !vercelTarget) out.push('.plates/plates.json "delivery".vercel is read only with a Vercel target ("delivery".promote "vercel:<project>")');
  if (d.migrations !== undefined && (typeof d.migrations !== 'string' || !/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(d.migrations) || d.migrations.split('/').some(s => s === '..' || s === '.'))) out.push(`.plates/plates.json "delivery".migrations must be a directory in the repository, like "lib/web/migrations" (got ${JSON.stringify(d.migrations)})`);
  if (d.grant !== undefined) out.push(...grantProblems(d.grant).map(p => `.plates/plates.json "delivery".grant${p}`));
  if ((d.version !== undefined || d.smoke !== undefined) && d.site === undefined) out.push('.plates/plates.json "delivery".site is required with "delivery".version or "delivery".smoke: the production origin they are read from (like "https://anvils.acme.example")');
  return out;
}

/**
 * What is wrong with a "delivery".promote value, or null: "tag:<name>" or
 * "branch:<name>" (a ref name by git's rules, narrowed; a branch never the
 * default branch nor the tested ref), or "none".
 */
function promoteProblem(value, tested) {
  const like = 'must be "tag:<name>" or "branch:<name>", the ref production deploys from (like "tag:prod"), "vercel:<project>", or "none"';
  if (value === 'none') return null;
  if (typeof value === 'string' && value.startsWith('vercel:')) return VERCEL_PROJECT.test(value.slice(7)) ? null : `${like}: a Vercel project's name is lowercase letters, digits, ".", "_" and "-" (got ${JSON.stringify(value)})`;
  const m = typeof value === 'string' ? /^(tag|branch):(.+)$/.exec(value) : null;
  if (!m) return `${like} (got ${JSON.stringify(value)})`;
  const p = branchProblem(m[2]);
  const defaultBranch = p !== null && /^cannot be (main|master)\b/.test(p);
  if (p && !defaultBranch) return `${like} (got ${JSON.stringify(value)})`;
  if (m[1] === 'branch' && defaultBranch) return `cannot be branch:${m[2]}: plates promote never writes the default branch`;
  if (m[1] === 'branch' && m[2] === tested) return `cannot be branch:${m[2]}, the tested ref: the publisher moves that one, and production is promoted from it`;
  return null;
}

/** A Vercel project's name, as its CLI's --project takes it. */
const VERCEL_PROJECT = /^[a-z0-9][a-z0-9._-]{0,99}$/;

/**
 * "delivery".vercel, a Vercel target's keys (phase 177): { scope, checkout,
 * globalConfig? }. scope is the team the project is in; checkout the
 * directory the deploy runs from, an absolute path that plates fills with
 * exactly the tested commit, outside every checkout (never inside a git work
 * tree); globalConfig the Vercel CLI's own directory (-Q), when it is not the
 * default. Each problem names its key, after "delivery".vercel.
 */
function vercelProblems(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [' must be an object: { "scope": "<team>", "checkout": "<absolute directory>" }'];
  const out = [];
  const extra = Object.keys(v).filter(k => !['scope', 'checkout', 'globalConfig'].includes(k));
  if (extra.length) out.push(` takes scope, checkout and globalConfig only (got ${extra.join(', ')})`);
  if (typeof v.scope !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(v.scope)) out.push(`.scope must be the Vercel team (scope) the project is in, like "acme" (got ${JSON.stringify(v.scope)})`);
  for (const key of ['checkout', 'globalConfig']) {
    if (key === 'globalConfig' && v[key] === undefined) continue;
    const p = v[key];
    if (typeof p !== 'string' || !p.startsWith('/') || p.length > 1024 || /[\0\r\n]/.test(p) || p.split('/').some(s => s === '..' || s === '.') || p === '/') out.push(`.${key} must be an absolute directory${key === 'checkout' ? ' outside every checkout, where plates puts exactly the commit it deploys' : ', the Vercel CLI\'s own (-Q)'} (got ${JSON.stringify(p)})`);
  }
  return out;
}

/**
 * "delivery".grant, the owner's (phase 177): { agentPromote: true, since:
 * "YYYY-MM-DD" }. With it the autonomy renderer allows an agent exactly
 * plates promote --yes and plates promote --back in this project; nothing
 * else in production. Each problem names its key, after "delivery".grant.
 */
function grantProblems(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return [' must be an object: { "agentPromote": true, "since": "YYYY-MM-DD" }'];
  const out = [];
  const extra = Object.keys(g).filter(k => !['agentPromote', 'since'].includes(k));
  if (extra.length) out.push(` takes agentPromote and since only (got ${extra.join(', ')})`);
  if (typeof g.agentPromote !== 'boolean') out.push(`.agentPromote must be true or false (got ${JSON.stringify(g.agentPromote)})`);
  if (typeof g.since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(g.since) || new Date(`${g.since}T00:00:00Z`).toISOString().slice(0, 10) !== g.since) out.push(`.since must be the date the owner granted it, YYYY-MM-DD (got ${JSON.stringify(g.since)})`);
  return out;
}

/** The migrations directory a deploy is refused over when it adds one (phase 177), when .plates/plates.json names none. */
export const MIGRATIONS = 'lib/web/migrations';

/** "delivery".promote as a ref: { kind: 'tag' | 'branch', name, ref, spec } (a Vercel target: { kind: 'vercel', name: <project>, ref: null, spec }), or null for none (no promote). Validated by deliveryProblems. */
export function promoteRefOf(value) {
  if (value === undefined || value === null || value === 'none') return null;
  if (value.startsWith('vercel:')) return { kind: 'vercel', name: value.slice(7), ref: null, spec: value };
  const [, kind, name] = /^(tag|branch):(.+)$/.exec(value);
  return { kind, name, ref: `refs/${kind === 'tag' ? 'tags' : 'heads'}/${name}`, spec: value };
}

/** How many smoke checks a project may name. */
export const SMOKE_MAX = 50;

/** An origin plates reads production at: https, or http on this machine only (a local preview). */
export function siteProblem(site) {
  let u;
  try { if (typeof site !== 'string') throw new TypeError(); u = new URL(site); } catch { return `must be the production origin, like "https://anvils.acme.example" (got ${JSON.stringify(site)})`; }
  if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return `must be an origin alone, like "https://anvils.acme.example": no path, query, fragment or credentials (got ${JSON.stringify(site)})`;
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return null;
  return `must be https (http only on localhost or 127.0.0.1) (got ${JSON.stringify(site)})`;
}

function pathProblem(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\s#\\\0]/.test(path) || path.length > 512) return `must be a path starting with "/" (got ${JSON.stringify(path)})`;
  return null;
}

const statusOk = s => Number.isInteger(s) && s >= 100 && s <= 599;
function smokeProblem(c) {
  if (typeof c === 'string') return pathProblem(c) && `${pathProblem(c)}, or { "path": "/", "status": 200 }`;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'must be a path ("/") or { "path": "/", "status": 200 }';
  const extra = Object.keys(c).filter(k => !['path', 'status'].includes(k));
  if (extra.length) return `takes path and status only (got ${extra.join(', ')})`;
  const p = pathProblem(c.path);
  if (p) return `path ${p}`;
  if (c.status !== undefined && !statusOk(c.status) && !(Array.isArray(c.status) && c.status.length && c.status.every(statusOk))) return `status must be an HTTP status code (100-599) or a list of them (got ${JSON.stringify(c.status)})`;
  return null;
}

export class DeliveryError extends Error {
  constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; }
}

/**
 * { tested, gateWorkflow (null: the project's gate workflow), site, version,
 * smoke: [{ path, status: [code] }] } (site and version null when unset; a
 * smoke path alone expects 200), or a throw (exit 2) naming the key.
 */
export function deliveryOf(config) {
  const problems = deliveryProblems(config);
  if (problems.length) throw new DeliveryError(problems[0]);
  const d = config?.delivery ?? {};
  const smoke = (d.smoke ?? []).map(c => typeof c === 'string' ? { path: c, status: [200] } : { path: c.path, status: c.status === undefined ? [200] : [c.status].flat() });
  return { tested: d.tested ?? TESTED, gateWorkflow: d.gateWorkflow ?? null, site: d.site ? new URL(d.site).origin : null, version: d.version ?? null, smoke, promote: promoteRefOf(d.promote),
    // Explicit workflow roles (#212), a Vercel target's keys (phase 177), and the grant, only when set.
    ...(d.workflows ? { workflows: Object.fromEntries(Object.entries(d.workflows).map(([k, v]) => [k, v === 'deploy' ? 'publish' : v === 'none' ? null : v])) } : {}),
    ...(d.vercel ? { vercel: { scope: d.vercel.scope, checkout: d.vercel.checkout, globalConfig: d.vercel.globalConfig ?? null }, migrations: d.migrations ?? MIGRATIONS } : {}),
    ...(d.grant ? { grant: { agentPromote: d.grant.agentPromote, since: d.grant.since } } : {}) };
}

/** A workflow's top-level `name:`, unquoted, or null. */
export function workflowName(text) {
  const m = /^name:[ \t]*(.+?)[ \t]*$/m.exec(text ?? '');
  if (!m) return null;
  const v = m[1].replace(/[ \t]+#.*$/, '');
  return v.replace(/^(["'])(.*)\1$/, '$2') || null;
}

const bool = v => v === 'true' ? true : v === 'false' ? false : v;

/**
 * One YAML scalar as written after a key: { value } (a quoted value without
 * its quotes, a plain one without a trailing comment), or { error } for a
 * form this reader does not take (an anchor, alias, tag, block scalar, flow
 * collection, or an unclosed quote). Never a guess.
 */
/** A YAML double-quoted scalar's single-character escapes (§5.7); `\\x`, `\\u` and `\\U` take hex digits. */
const YAML_ESCAPES = { 0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', N: '\x85', _: '\xa0', L: '\u2028', P: '\u2029' };

export function scalar(raw) {
  const v = (raw ?? '').trim();
  if (!v) return { value: '' };
  const q = v[0];
  if (q === '"' || q === "'") {
    let k = 1, out = '';
    for (; k < v.length; k++) {
      if (q === "'" && v[k] === "'" && v[k + 1] === "'") { out += "'"; k++; continue; }
      if (q === '"' && v[k] === '\\' && k + 1 < v.length) {
        const e = v[++k], hex = { x: 2, u: 4, U: 8 }[e];
        if (hex && /^[0-9a-fA-F]+$/.test(v.slice(k + 1, k + 1 + hex)) && v.length > k + hex) { out += String.fromCodePoint(parseInt(v.slice(k + 1, k + 1 + hex), 16)); k += hex; continue; }
        out += YAML_ESCAPES[e] ?? e;
        continue;
      }
      if (v[k] === q) break;
      out += v[k];
    }
    if (k >= v.length) return { error: 'an unclosed quote' };
    const rest = v.slice(k + 1);
    if (rest.trim() && !/^[ \t]+#/.test(rest)) return { error: `text after a quoted value (${JSON.stringify(rest.trim())})` };
    return { value: out };
  }
  if (/^[&*!|>[{]/.test(v)) return { error: `the form ${JSON.stringify(v[0])} (an anchor, alias, tag, block scalar or flow collection)` };
  return { value: v.replace(/[ \t]+#.*$/, '').trim() };
}

/** Split a flow mapping's inside at its top-level commas: quotes and (), {}, [] (a `${{ … }}` expression too) nest. */
function topLevel(s, sep) {
  const parts = [];
  let depth = 0, quote = null, at = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (quote) { if (c === '\\' && quote === '"') k++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    else if (c === sep && depth === 0) { parts.push(s.slice(at, k)); at = k + 1; }
  }
  parts.push(s.slice(at));
  return parts;
}

/** Where a flow mapping that starts at v[0] (`{`) closes, or -1. */
function closing(v) {
  let depth = 0, quote = null;
  for (let k = 0; k < v.length; k++) {
    const c = v[k];
    if (quote) { if (c === '\\' && quote === '"') k++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c) && --depth === 0) return k;
  }
  return -1;
}

const KEYS = ['group', 'cancel-in-progress'];

/** Set one key of a block from its written value; an unreadable value marks the block unreadable. */
function setKey(block, key, raw) {
  const s = scalar(raw);
  if (s.error) { block.unreadable ??= `${key}: ${s.error}`; return; }
  if (key === 'group') block.group = s.value || null;
  else block.cancel = bool(s.value);
}

/**
 * The concurrency blocks of one workflow's text: [{ level: 'workflow'|'job',
 * line, group, cancel, unreadable? }]. Three forms: `concurrency: <group>` (a
 * group with no cancel-in-progress, GitHub's default: false); a flow mapping
 * `concurrency: { group: …, cancel-in-progress: … }`; and `group:` and
 * `cancel-in-progress:` lines under it. Values may be quoted. `cancel` is
 * true, false, undefined (not set), or the expression as written. Anything
 * else is `unreadable`, with why, and concurrencyProblems names it.
 */
export function concurrencyOf(text) {
  const lines = (text ?? '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)concurrency:[ \t]*(.*?)[ \t]*$/.exec(lines[i]);
    if (!m || /^\s*#/.test(lines[i])) continue;
    const indent = m[1].length;
    const block = { level: indent === 0 ? 'workflow' : 'job', line: i + 1, group: null, cancel: undefined };
    const inline = m[2];
    if (inline.startsWith('{')) {
      const end = closing(inline);
      const after = end < 0 ? '' : inline.slice(end + 1);
      if (end < 0) block.unreadable = 'an unclosed { mapping } (plates reads a flow mapping on one line)';
      else if (after.trim() && !/^[ \t]+#/.test(after)) block.unreadable = `text after the mapping (${JSON.stringify(after.trim())})`;
      else {
        const parts = topLevel(inline.slice(1, end), ',');
        for (const part of parts.filter(p => p.trim())) {
          const kv = /^\s*([\w-]+)\s*:(?:\s+|$)([\s\S]*)$/.exec(part);
          if (!kv) { block.unreadable ??= `the entry ${JSON.stringify(part.trim())}`; continue; }
          if (!KEYS.includes(kv[1])) { block.unreadable ??= `the key ${kv[1]} (concurrency takes group and cancel-in-progress)`; continue; }
          setKey(block, kv[1], kv[2]);
        }
      }
      out.push(block);
      continue;
    }
    if (inline && !/^#/.test(inline)) {
      const s = scalar(inline);
      if (s.error) block.unreadable = s.error; else block.group = s.value || null;
      out.push(block);
      continue;
    }
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || /^\s*#/.test(l)) continue;
      if (l.search(/\S/) <= indent) break;
      const kv = /^\s*(group|cancel-in-progress):[ \t]*(.*?)[ \t]*$/.exec(l);
      if (kv) setKey(block, kv[1], kv[2]);
    }
    out.push(block);
  }
  return out;
}

const words = s => (s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Strip an unquoted YAML `#` comment from one line. */
function stripYamlComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === "'") { if (c === "'" && line[i + 1] === "'") i++; else if (c === "'") quote = null; continue; }
    if (quote === '"') { if (c === '\\') i++; else if (c === '"') quote = null; continue; }
    if ((c === "'" || c === '"') && (!i || /[\s[{,:-]/.test(line[i - 1]))) { quote = c; continue; }
    if (c === '#' && (!i || /[ \t]/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/** Fold a YAML `>` block scalar's indent-stripped lines, keeping blank and more-indented breaks. */
function foldYaml(lines) {
  const first = lines.findIndex(Boolean);
  if (first < 0) return '';
  const normal = s => s[0] !== ' ' && s[0] !== '\t';
  let out = lines[first], prevNormal = normal(out), empties = 0;
  for (const l of lines.slice(first + 1)) {
    if (!l) { empties++; continue; }
    const curNormal = normal(l);
    out += (prevNormal && curNormal ? (empties ? '\n'.repeat(empties) : ' ') : '\n'.repeat(empties + 1)) + l;
    prevNormal = curNormal;
    empties = 0;
  }
  return out;
}

/** Strip unquoted POSIX-shell `#` comments (tracking words, quotes, `${…}` and `\` escapes). */
function stripShellComments(text) {
  let out = '', quote = null, word = false, dollar = false, param = 0;
  const heredocs = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    // A heredoc body is data, copied as is up to its delimiter line: no quote state, no comments.
    if (c === '\n' && !quote && heredocs.length) {
      while (heredocs.length && i < text.length) {
        const { delim, tabs } = heredocs.shift();
        for (;;) {
          out += text[i++];
          if (i >= text.length) break;
          const end = text.indexOf('\n', i), line = text.slice(i, end < 0 ? text.length : end);
          if ((tabs ? line.replace(/^\t+/, '') : line) === delim) { out += line; i += line.length; break; }
          out += line;
          i += line.length;
          if (i >= text.length) break;
        }
      }
      if (i >= text.length) break;
      out += text[i];
      word = false;
      dollar = false;
      continue;
    }
    const here = !quote && !param && c === '<' && text[i + 1] === '<' && text[i + 2] !== '<' && text[i - 1] !== '<'
      ? /^<<(-?)[ \t]*((?:[^\s;&|()<>'"\\]|\\.|'[^']*'|"[^"]*")+)/.exec(text.slice(i)) : null;
    if (here) {
      heredocs.push({ delim: here[2].replace(/'([^']*)'|"([^"]*)"|\\(.)/g, (_, a, b, e) => a ?? b ?? e), tabs: Boolean(here[1]) });
      out += here[0];
      i += here[0].length - 1;
      word = true;
      dollar = false;
      continue;
    }
    if (quote === "'") { out += c; if (c === "'") quote = null; continue; }
    if (c === '\\') {
      dollar = false;
      if (text[i + 1] === '\n') { i++; continue; }
      out += c + (text[++i] ?? '');
      word = true;
      continue;
    }
    if (quote) { out += c; if (c === quote.at(-1)) quote = null; continue; }
    if (c === "'" || c === '"') { quote = c === "'" && dollar ? "$'" : c; word = true; dollar = false; out += c; continue; }
    if ((dollar || param) && c === '{') { param++; word = true; dollar = false; out += c; continue; }
    if (param && c === '}') { param--; word = true; dollar = false; out += c; continue; }
    if (c === '#' && !word && !param) {
      while (text[i + 1] && text[i + 1] !== '\n') i++;
      continue;
    }
    out += c;
    dollar = c === '$';
    word = !/[\s;&|()<>]/.test(c);
  }
  return out;
}

/** A workflow's top-level `on:` event names, or null when `on:` is absent or unreadable. */
export function workflowTriggers(text) {
  const lines = (text ?? '').split('\n');
  const at = lines.findIndex(l => /^(on|"on"|'on'):([ \t]|$)/.test(l));
  if (at < 0) return null;
  let start = at;
  let inline = stripYamlComment(lines[at].replace(/^[^:]*:/, '')).trim();
  if (!inline) {
    const next = lines.findIndex((l, i) => i > at && Boolean(stripYamlComment(l).trim()));
    if (next > at && /^\s+[[{]/.test(lines[next])) {
      start = next;
      inline = stripYamlComment(lines[next]).trim();
    }
  }
  if (inline[0] === '[' || inline[0] === '{') {
    for (const l of lines.slice(start + 1)) {
      if (inline[closing(inline)]) break;
      const raw = stripYamlComment(l);
      const next = raw.trim();
      if (!next) continue;
      if (!/^\s/.test(raw) && next[0] !== ']' && next[0] !== '}') break;
      inline += ' ' + next;
    }
    const end = closing(inline);
    if (inline[end] !== (inline[0] === '[' ? ']' : '}') || inline.slice(end + 1).trim()) return null;
    const isMap = inline[0] === '{';
    const out = [];
    for (const part of topLevel(inline.slice(1, end), ',').map(p => p.trim()).filter(Boolean)) {
      const s = scalar(isMap ? topLevel(part, ':')[0] : part);
      if (s.error || !/^[A-Za-z_]\w*$/.test(s.value)) return null;
      out.push(s.value);
    }
    return out;
  }
  if (inline) {
    const s = scalar(inline);
    return s.error || !/^[A-Za-z_]\w*$/.test(s.value) ? null : [s.value];
  }
  const out = [];
  let indent = null;
  for (const l of lines.slice(at + 1)) {
    const clean = stripYamlComment(l);
    if (!clean.trim()) continue;
    if (!/^\s/.test(clean)) break;
    const m = /^(\s+)(?:-\s+)?["']?([A-Za-z_]\w*)["']?\s*(?::|$)/.exec(clean);
    if (!m) continue;
    indent ??= m[1].length;
    if (m[1].length === indent) out.push(m[2]);
  }
  return out.length ? out : null;
}

/** Every step's `uses:` and non-comment `run:` lines under `jobs:`: { uses: [string], runs: [string] }. */
export function workflowSteps(text) {
  const lines = (text ?? '').split('\n');
  const uses = [], runs = [];
  for (const job of jobsOf(text)) {
    for (let i = job.line; i < job.end; i++) {
      const l = lines[i];
      if (!l.trim() || /^\s*#/.test(l)) continue;
      const u = /^\s*(?:-\s+)?uses:[ \t]*(.+?)[ \t]*$/.exec(l);
      if (u) { const s = scalar(u[1]); if (s.value) uses.push(s.value); continue; }
      const r = /^(\s*)(-\s+)?run:[ \t]*(.*?)[ \t]*$/.exec(l);
      if (!r) continue;
      const keyIndent = r[1].length + (r[2] ? r[2].length : 0);
      const block = r[3].replace(/(?:^|[ \t]+)#.*$/, '').trim();
      if (/^[|>][-+]?\d*$/.test(block)) {
        const rawBlock = [];
        let j = i + 1;
        for (; j < job.end; j++) {
          const bl = lines[j];
          if (bl.trim() && bl.search(/\S/) <= keyIndent) break;
          rawBlock.push(bl);
        }
        while (rawBlock.length && !rawBlock.at(-1).trim()) rawBlock.pop();
        const indDigit = /[1-9]/.exec(block)?.[0];
        const firstNonEmpty = rawBlock.find(b => b.trim());
        const baseIndent = indDigit ? keyIndent + Number(indDigit) : (firstNonEmpty ? firstNonEmpty.search(/\S/) : keyIndent + 1);
        const sliced = rawBlock.map(b => b.slice(baseIndent));
        const script = block[0] === '>' ? foldYaml(sliced) : sliced.join('\n');
        for (const code of stripShellComments(script).split('\n')) {
          if (code.trim()) runs.push(code.trim());
        }
        i = j - 1;
      } else {
        const s = scalar(r[3]);
        const code = s.value ? stripShellComments(s.value).trim() : '';
        if (code) runs.push(code);
      }
    }
  }
  return { uses, runs };
}

const PUBLISH_USES = /(?:^|\/)(?:deploy-[\w-]+|[\w-]+-deploy|[\w-]*vercel-action|wrangler-action|action-gh-release|actions-gh-pages|changesets\/action)@/i;
const PUBLISH_RUN = /\bscripts\/(?:plates|keel)\/(?:publish|promote|vercel)\.mjs\b|\bvercel\b[^\n;|&]*\s(?:deploy|promote|--prod)\b|\b(?:wrangler|flyctl|railway|netlify|firebase)\s+deploy\b|\bgcloud\s+(?:run|app|functions)\s+deploy\b|\b(?:npm|pnpm|yarn|bun|cargo)\s+publish\b|\bgh\s+release\s+create\b|(?:^|[;&|]\s*|\bthen\s+|\belse\s+)(?:(?:\.\/|(?:ba)?sh\s+|node\s+)(?:scripts\/)?(?:deploy|publish|release|promote)(?:\.(?:sh|mjs|js|ts))?|scripts\/(?:deploy|publish|release|promote)\.(?:sh|mjs|js|ts))(?=\s|$)|\b(?:npm|pnpm|yarn|bun)\s+run\s+(?:deploy|publish|release|promote)(?::[\w-]+)?\b/;
const VERIFY_RUN = /\bscripts\/(?:plates|keel)\/verify\.mjs\b|\bverify-production\.(?:mjs|js|ts)\b/;
const TEST_RUN = /\bscripts\/(?:plates|keel)\/(?:gate|test-ledger)\.mjs\b|\b(?:npm|pnpm|yarn|bun)\s+(?:test|run\s+test(?::[\w-]+)?)\b|\bnode\s+(?:[^\n;|&]*\s)?--test\b|\b(?:npx\s+|pnpm\s+exec\s+|yarn\s+)?(?:vitest|jest|mocha)\b|\b(?:pytest|cargo\s+test|go\s+test)\b/;

/**
 * What the rule holds a workflow to (#212): `"delivery".workflows` when named;
 * else 'publish' when a step publishes/deploys or its file/`name:` says publish,
 * deploy, release or promote (and is not a verifier or alerter); else 'test'
 * on code refs (`push`, `pull_request`, `pull_request_target`, `merge_group`,
 * or unset `on:`) when it is the gate workflow, runs the gate/test suite, or
 * says test, check, ci or gate (and is not a verifier or alerter); else null.
 */
export function workflowKind(file, text, { gate = null, check = null, workflows = null } = {}) {
  const base = file.split('/').pop();
  const stem = base.replace(/\.ya?ml$/, '');
  const name = workflowName(text);
  if (workflows && typeof workflows === 'object' && !Array.isArray(workflows)) {
    for (const k of [file, base, stem, name]) {
      if (k && Object.hasOwn(workflows, k) && WORKFLOW_KINDS.includes(workflows[k])) {
        const v = workflows[k];
        return v === 'publish' || v === 'deploy' ? 'publish' : v === 'test' ? 'test' : null;
      }
    }
  }
  const said = [...words(stem), ...words(name)];
  const { uses, runs } = workflowSteps(text);
  if (uses.some(u => PUBLISH_USES.test(u)) || runs.some(r => PUBLISH_RUN.test(r))) return 'publish';
  const observer = said.some(w => OBSERVER_WORDS.includes(w));
  if (said.some(w => PUBLISH_WORDS.includes(w)) && !observer && !runs.some(r => VERIFY_RUN.test(r))) return 'publish';
  const triggers = workflowTriggers(text);
  if (triggers !== null && !triggers.some(t => CODE_TRIGGERS.includes(t))) return null;
  if (gate && [base, file, stem, name].includes(gate)) return 'test';
  const checkRe = typeof check === 'string' && check.trim() ? new RegExp(`(^|[^\\w:.-])${check.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w:.-])`) : null;
  if (runs.some(r => TEST_RUN.test(r) || (checkRe !== null && checkRe.test(r)))) return 'test';
  if (said.some(w => TEST_WORDS.includes(w)) && !observer) return 'test';
  return null;
}

/** The rule, broken by one workflow: [string], each naming the file and line. */
export function concurrencyProblems(file, text, kind) {
  if (!kind) return [];
  const blocks = concurrencyOf(text);
  const out = [];
  // A form this reader does not take is named, and never judged by a guess at what it says.
  const unread = blocks.filter(b => b.unreadable).map(b => `${file} (line ${b.line}): plates cannot read this concurrency (${b.unreadable}); write it as group: and cancel-in-progress: lines under concurrency:, or as { group: …, cancel-in-progress: … } on one line`);
  const readable = blocks.filter(b => !b.unreadable);
  out.push(...unread);
  if (kind === 'test') {
    if (!blocks.length) return [`${file}: a test workflow with no concurrency group: a superseded run is never cancelled; add concurrency: { group: <name>-\${{ github.ref }}, cancel-in-progress: true }`];
    const good = b => b.group && PER_REF.test(b.group) && b.cancel === true;
    const testProblems = b => [
      ...(!b.group || !PER_REF.test(b.group) ? [`${file} (line ${b.line}): a test workflow's concurrency group ${JSON.stringify(b.group)} is not per ref: runs of every branch share one queue; name the ref in it (\${{ github.ref }})`] : []),
      ...(b.cancel !== true ? [`${file} (line ${b.line}): a test workflow's cancel-in-progress is ${b.cancel === undefined ? 'not set (false)' : JSON.stringify(b.cancel)}: a superseded test run keeps running; set cancel-in-progress: true`] : []),
    ];
    // Only a workflow-level block covers the whole workflow; one job's block covers that job alone (#179).
    const top = readable.filter(b => b.level === 'workflow');
    if (top.some(good)) return out;
    const jobs = jobsOf(text);
    const jobBlocks = readable.filter(b => b.level === 'job');
    if (!jobBlocks.length || !jobs.length) {
      for (const b of readable) out.push(...testProblems(b));
      return out;
    }
    for (const b of top) out.push(...testProblems(b));
    for (const j of jobs) {
      const own = jobBlocks.filter(b => b.line > j.line && b.line <= j.end);
      if (own.some(good)) continue;
      if (own.length) for (const b of own) out.push(...testProblems(b).map(p => p.replace("a test workflow's", `a test workflow's job ${j.name}:`)));
      else if (!blocks.some(b => b.unreadable && b.line > j.line && b.line <= j.end)) out.push(`${file} (line ${j.line}): a test workflow's job ${j.name} has no concurrency of its own, and no workflow-level block covers it: a superseded run of it keeps running; put concurrency: { group: <name>-\${{ github.ref }}, cancel-in-progress: true } at the workflow's top level, or on every job`);
    }
    return out;
  }
  if (!blocks.length) return [`${file}: a publish or deploy workflow with no concurrency group: two can run at once; add concurrency: { group: <fixed name>, cancel-in-progress: false }`];
  const keys = jobKeys(text), jobs = jobsOf(text);
  for (const b of readable) {
    // A conditional group holds only where every job it covers runs on its condition alone (PR #182 review).
    const covered = b.level === 'workflow' ? jobs.map(j => j.name) : jobs.filter(j => b.line > j.line && b.line <= j.end).map(j => j.name);
    const gated = cond => covered.length > 0 && covered.every(n => jobOnlyOn(keys, n, normExpr(cond)));
    const f = groupFixity(b.group, { gated });
    if (!f.fixed && f.kind !== 'unknown') out.push(`${file} (line ${b.line}): a publish or deploy workflow's concurrency group ${JSON.stringify(b.group)} is not fixed: it names the ${f.kind}, so publishes of different ${f.kind}s can run at once; name one group for them all`);
    else if (!f.fixed) out.push(`${file} (line ${b.line}): plates cannot establish that a publish or deploy workflow's concurrency group ${JSON.stringify(b.group)} is fixed${f.why ? `: ${f.why}` : f.reads.length ? ` (it reads ${f.reads.join(', ')})` : ''}: two deploys could run at once; name one group for them all, or write \${{ <the condition it publishes on> && '<fixed name>' || format('<name>-skip-{0}', github.run_id) }} with that condition as every job's if:`);
    if (b.cancel !== false && b.cancel !== undefined) out.push(`${file} (line ${b.line}): a publish or deploy workflow's cancel-in-progress is ${JSON.stringify(b.cancel)}: a deploy can be cancelled midway; set cancel-in-progress: false`);
  }
  return out;
}
