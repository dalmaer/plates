// Phase 145: every change Plates proposes or performs says whether it can be
// undone. One vocabulary, three door classes, the same words the owner's
// personal-data approvals and phase 150's decision `door` field use:
//
//   reversible    undone at any time, completely (a revert, closing a PR)
//   windowed      undone only for a stated time (each type's window is below)
//   irreversible  nothing undoes it (a message sent, a secret replaced, a
//                 version published, what was built on rewritten files)
//
// OPERATIONS is the one table: every operation type Plates performs or
// proposes, with exactly one class and, for windowed types, the window.
// VERB_OPERATIONS says which types each CLI verb performs or proposes, and
// WORKFLOW_COMMANDS which types a managed workflow's shell commands perform;
// tests/door-class.test.mjs fails when a verb or a workflow command has no
// type, or a type has no door. Pure: no file, network or GitHub access.
//
// The Merge danger line on Plates' PRs (scripts/plates/pr-body.mjs, phase 39)
// is derived from the class: mergeDanger(op, …) is the body's danger input.
// Autonomy (phase 144) gains a rule per class: doorAllowed(level, op).

export const DOORS = Object.freeze(['reversible', 'windowed', 'irreversible']);

/** Phase 39's door words, derived from the class: windowed is two-way inside its window. */
export const MERGE_DOOR = Object.freeze({ reversible: 'two-way', windowed: 'two-way', irreversible: 'one-way' });

const op = (door, why, scope, window) => Object.freeze({ door, why, scope, ...(window ? { window } : {}) });

/**
 * Every operation type, its one class and why. scope is the phase 132 autonomy
 * scope the operation falls under (the level's grants are a second ceiling).
 */
export const OPERATIONS = Object.freeze({
  'local edit': op('reversible', 'files in the working tree or the owner\'s private state; git or the previous file restores them', 'local-edits'),
  commit: op('reversible', 'a local commit; reset or revert restores the tree', 'local-edits'),
  push: op('reversible', 'new commits on a work branch; pushing the previous tip restores it', 'push'),
  'force push': op('irreversible', 'the replaced commits leave the remote; nothing there keeps them', 'push'),
  'pull request': op('reversible', 'opening, editing or closing a PR; nothing lands until a merge, and a closed PR reopens', 'push'),
  merge: op('reversible', 'a revert restores the merged bytes at any time', 'merge'),
  'fleet update': op('reversible', "a fleet update PR re-renders plates's own files; reverting the merge restores them", 'push'),
  migration: op('irreversible', "a migration rewrites the project's own files; a revert restores their bytes, not what is built on them after the merge", 'merge'),
  deploy: op('windowed', 'production moves to a new version (plates promote, the publisher advancing the tested ref); what users did on it stays', 'deployment',
    'until the next deploy: plates promote --back <previous commit> moves production back while that commit is still on the tested ref'),
  'promote --back': op('windowed', 'production moves back to an earlier version; what users did on the newer one stays', 'deployment',
    'until the next deploy: plates promote <commit> moves production forward again'),
  publish: op('irreversible', 'a published version or release leaves the repo; its number cannot be reused and others may already have it', 'deployment'),
  delete: op('irreversible', 'a branch, an untracked file or a stored record; nothing keeps a copy', 'push'),
  'secret change': op('irreversible', 'the old value is not recoverable, and an exposure cannot be withdrawn', 'security'),
  'schedule change': op('windowed', 'a workflow schedule (and the model spend it starts); restoring the old schedule undoes it', 'security',
    'until the next scheduled run: a run that started has spent its minutes and budget'),
  'ruleset change': op('windowed', 'a branch ruleset; restoring the previous rules undoes it', 'security',
    'until a push or merge lands under the changed rules'),
  'label or issue edit': op('reversible', 'a label, an issue\'s state or text; editing it back restores it, and the history keeps the old value', 'push'),
  issue: op('irreversible', 'creating an issue notifies people; closing it does not unsend it', 'push'),
  comment: op('irreversible', 'a comment or review notifies people; editing or deleting it does not unsend it', 'push'),
  rename: op('reversible', 'an approved name change; its receipt records the old name and renaming back restores it', 'security'),
  'repository create': op('reversible', 'a new, empty repository; nothing depends on it until work lands there', 'security'),
  'canvas update': op('reversible', 'the owner-only canvas page; it is rewritten from the local snapshot each time', 'push'),
});

/**
 * What each CLI verb (lib/cli.mjs `verbs`) performs or proposes; [] is read-only.
 * A verb missing here fails tests/door-class.test.mjs.
 */
export const VERB_OPERATIONS = Object.freeze({
  autonomy: ['local edit'],
  names: ['rename'],
  migrate: ['migration'],
  'evidence rederive': ['local edit'],
  status: [],
  next: [],
  'goal list': [],
  'goal show': [],
  'goal add': ['local edit'],
  'goal retire': ['local edit'],
  'phase new': ['local edit'],
  'phase claim': ['push', 'delete'],
  ready: ['push'],
  integrate: ['merge', 'push'],
  'phase list': [],
  render: ['local edit'],
  init: ['local edit', 'commit', 'repository create'],
  adopt: ['local edit'],
  doctor: ['local edit'],
  update: ['migration', 'local edit', 'commit', 'push', 'pull request', 'fleet update'],
  lessons: ['issue'],
  learn: ['local edit', 'label or issue edit'],
  improve: ['local edit'],
  'persona run': ['local edit'],
  time: [],
  test: [],
  drain: ['merge', 'pull request', 'comment'],
  'night plan': ['local edit'],
  'night tick': ['local edit'],
  morning: ['issue', 'canvas update'],
  goodnight: ['local edit', 'push'],
  fleet: [],
  'fleet update': ['fleet update', 'migration', 'push', 'pull request', 'merge'],
  'loose-ends': ['local edit'],
  feedback: ['local edit'],
  issue: ['issue', 'label or issue edit'],
  review: ['comment', 'issue'],
  board: [],
  promote: ['deploy', 'promote --back'],
  walk: ['local edit'],
  canvas: ['canvas update', 'local edit'],
  retro: ['local edit'],
  workspace: ['local edit'],
  shape: ['local edit'],
  decision: [],
  production: ['local edit'],
  prove: [],
  release: ['local edit', 'commit'],
  help: [],
});

/**
 * Shell commands in managed workflows that act outside the runner, and their
 * type (null: a read). First match wins; EFFECT finds the commands to classify.
 */
export const WORKFLOW_COMMANDS = Object.freeze([
  [/^git push\b.*(--force|\s-f\b|\s\+)/, 'force push'],
  [/^git push\b.*--delete\b/, 'delete'],
  [/^git push\b/, 'push'],
  [/^npm publish\b/, 'publish'],
  [/^gh pr (list|view|diff|checks|status)\b/, null],
  [/^gh pr (create|edit|close|ready|reopen)\b/, 'pull request'],
  [/^gh pr merge\b/, 'merge'],
  [/^gh pr (comment|review)\b/, 'comment'],
  [/^gh issue (list|view|status)\b/, null],
  [/^gh issue create\b/, 'issue'],
  [/^gh issue comment\b/, 'comment'],
  [/^gh issue (edit|close|reopen)\b/, 'label or issue edit'],
  [/^gh label (list)\b/, null],
  [/^gh label (create|edit|delete)\b/, 'label or issue edit'],
  [/^gh (release (create|upload|edit))\b/, 'publish'],
  [/^gh (secret|variable) (set|delete)\b/, 'secret change'],
  [/^gh api\b.*--method (POST|PATCH|PUT|DELETE)\b.*\/pulls\/[^/\s"]+\/reviews\b/, 'comment'],
  [/^gh api\b.*--method (POST|PATCH|PUT|DELETE)\b.*\/(issues|pulls)\/[^/\s"]+\/comments\b/, 'comment'],
  [/^gh api\b.*--method POST\b.*\/issues["\s]/, 'issue'],
  [/^gh api\b.*--method (PATCH|PUT)\b.*\/issues\//, 'label or issue edit'],
  [/^gh api\b.*--method (POST|PATCH|PUT|DELETE)\b.*\/rulesets\b/, 'ruleset change'],
  [/^gh api\b.*--method DELETE\b/, 'delete'],
  [/^gh api\b(?!.*--method\b)(?!.*\s-X\b)(?!.*\s-[fF]\s)/, null],
  [/^gh api\b.*--method GET\b/, null],
  [/^node scripts\/plates\/publish\.mjs\b.*--advance\b/, 'deploy'],
  [/^node scripts\/plates\/publish\.mjs\b/, null],
  [/^node scripts\/plates\/promote\.mjs\b.*--back\b/, 'promote --back'],
  [/^node scripts\/plates\/promote\.mjs\b/, 'deploy'],
]);
const EFFECT = /\b(git push\b|npm publish\b|gh [a-z]+(?: [a-z-]+)?|node scripts\/plates\/(?:publish|promote)\.mjs\b)[^\n;|&)]*/g;

/** The operations in a workflow's text: [{ line, command, op }], op undefined when nothing classifies it. */
export function workflowOperations(text) {
  const out = [];
  String(text).split('\n').forEach((raw, i) => {
    const line = raw.replace(/^\s*#.*$/, '');
    for (const m of line.matchAll(EFFECT)) {
      const command = m[0].trim();
      const hit = WORKFLOW_COMMANDS.find(([re]) => re.test(command));
      out.push({ line: i + 1, command, op: hit ? hit[1] : undefined });
    }
  });
  return out;
}

/**
 * What has no door: verbs without an entry, entries naming unknown types,
 * workflow commands nothing classifies, types without exactly one class.
 * verbs: the dispatcher's keys; workflows: [{ path, text }].
 */
export function unclassified({ verbs = [], workflows = [], operations = OPERATIONS, verbOperations = VERB_OPERATIONS } = {}) {
  const out = [];
  for (const [name, o] of Object.entries(operations)) {
    if (!o || !DOORS.includes(o.door)) out.push({ kind: 'operation', name, problem: `has no door (${o?.door ?? 'none'}); use one of ${DOORS.join(', ')}` });
    else if ((o.door === 'windowed') !== (typeof o.window === 'string' && o.window.trim() !== '')) out.push({ kind: 'operation', name, problem: o.door === 'windowed' ? 'is windowed without a stated window' : 'states a window but is not windowed' });
  }
  for (const verb of verbs) {
    if (!Object.hasOwn(verbOperations, verb)) out.push({ kind: 'verb', name: verb, problem: 'has no operation types (lib/doors.mjs VERB_OPERATIONS)' });
    else for (const name of verbOperations[verb]) if (!Object.hasOwn(operations, name)) out.push({ kind: 'verb', name: verb, problem: `names "${name}", which has no door` });
  }
  for (const verb of Object.keys(verbOperations)) if (!verbs.includes(verb)) out.push({ kind: 'verb', name: verb, problem: 'is not a CLI verb' });
  for (const { path, text } of workflows) {
    for (const w of workflowOperations(text)) {
      if (w.op === undefined) out.push({ kind: 'workflow', name: `${path}:${w.line}`, problem: `\`${w.command}\` has no operation type (lib/doors.mjs WORKFLOW_COMMANDS)` });
      else if (w.op !== null && !Object.hasOwn(operations, w.op)) out.push({ kind: 'workflow', name: `${path}:${w.line}`, problem: `names "${w.op}", which has no door` });
    }
  }
  return out;
}

/** An operation's door: { op, door, window?, why, scope }. An unknown type throws: nothing goes unclassified. */
export function doorOf(name) {
  if (!Object.hasOwn(OPERATIONS, name)) throw new Error(`"${name}" has no door: add it to lib/doors.mjs OPERATIONS with one of ${DOORS.join(', ')}`);
  return { op: name, ...OPERATIONS[name] };
}

/** pr-body's danger input, derived from the operation's class: { class, window?, why, surfaces }. */
export function mergeDanger(name, { why, surfaces = [], within } = {}) {
  const d = doorOf(name);
  return { class: d.door, ...(d.window ? { window: d.window } : {}), why, surfaces, ...(within ? { within } : {}) };
}

// ---- autonomy ----------------------------------------------------------------

/**
 * Which classes a level lets an agent do without the owner. Irreversible
 * always waits for the owner. Low grants nothing (phase 144: read-only).
 */
export const LEVEL_DOORS = Object.freeze({
  low: Object.freeze([]),
  medium: Object.freeze(['reversible']),
  high: Object.freeze(['reversible', 'windowed']),
});

/**
 * The scopes a level can open at most (phase 144's table, lib/autonomy-hosts.mjs);
 * a test holds them equal to what renderHostControls opens. Deployment and
 * security need specific approval at every level.
 */
export const LEVEL_SCOPES = Object.freeze({
  low: Object.freeze([]),
  medium: Object.freeze(['local-edits', 'tests']),
  high: Object.freeze(['local-edits', 'tests', 'push', 'merge']),
});

/** The rule per class at a level: { reversible, windowed, irreversible } as booleans. */
export function doorRule(level) {
  if (!Object.hasOwn(LEVEL_DOORS, level)) throw new Error(`unknown autonomy level "${level}"; use ${Object.keys(LEVEL_DOORS).join(', ')}`);
  return Object.fromEntries(DOORS.map(door => [door, LEVEL_DOORS[level].includes(door)]));
}

/**
 * May an agent at this level do the operation without the owner? Both the
 * class rule and the level's scopes must allow it; neither establishes
 * authority (the task, the selected destinations and command gates still do).
 * Returns { allowed, reason, canStillDo, door, window? }.
 */
export function doorAllowed(level, name) {
  const rule = doorRule(level);
  const d = doorOf(name);
  const window = d.window ? { window: d.window } : {};
  const prepare = ['local edit', 'pull request'].filter(p => p !== name && rule[OPERATIONS[p].door] && LEVEL_SCOPES[level].includes(OPERATIONS[p].scope));
  const still = [
    ...(prepare.length ? [`prepare it as a ${prepare.join(' or a ')} and show the preview`] : ['describe it and show the preview; change nothing']),
    `ask the owner for this ${name}, naming its door (${d.door}${d.window ? `, ${d.window}` : ''})`,
  ];
  if (!rule[d.door]) {
    const reason = d.door === 'irreversible'
      ? `${name} is irreversible (${d.why}): it waits for the owner at every level, ${level} included`
      : `${name} is ${d.door}${d.window ? ` (${d.window})` : ''}: ${level} allows ${LEVEL_DOORS[level].length ? LEVEL_DOORS[level].join(' and ') : 'no'} doors without the owner`;
    return { allowed: false, reason, canStillDo: still, door: d.door, ...window };
  }
  if (!LEVEL_SCOPES[level].includes(d.scope)) {
    return { allowed: false, reason: `${name} is ${d.door}, but its scope (${d.scope}) is not open at ${level}: it needs the owner's specific approval`, canStillDo: still, door: d.door, ...window };
  }
  return { allowed: true, reason: `${name} is ${d.door} and ${d.scope} is open at ${level}; the task, the selected destinations and command gates still decide`, canStillDo: [], door: d.door, ...window };
}
