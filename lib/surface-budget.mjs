// The CLI's surface budget (phase 142, goal G9): the verbs and flags the
// registry in lib/cli.mjs exposes, checked against a recorded budget
// (.plates/surface.json) and against the boundary in docs/design.md that says
// Plates owns each verb. Pure functions: callers pass the registry, the budget
// and the design text, so a test can add a verb without editing lib/cli.mjs.

export const BUDGET_FILE = '.plates/surface.json';
export const DESIGN_FILE = 'docs/design.md';
export const BOUNDARY = '## Own, adopt, watch';
export const OWNS = '### What Plates owns, verb by verb';
/** Flags every verb may take; each counts once for the whole CLI. */
export const SHARED = Object.freeze(['--json', '--yes', '--help']);
export const COUNTED = 'verbs: every key of `verbs` in lib/cli.mjs ("goal add" is one verb). flags: each distinct --flag a verb\'s usage string names counts once for that verb, so --dry-run on two verbs counts twice; the shared flags --json, --yes and --help count once for the whole CLI, and only when some usage string names them (--help is read by the dispatcher and named by none, so it does not count); each top-level flag in FLAGS (--agent-help, --version) counts once.';

const FLAG = /--[a-z][a-z0-9-]*/g;
const where = `${BOUNDARY.slice(3)} in ${DESIGN_FILE}`;

/** The surface a registry exposes: { verbs: {name: [own flags]}, shared, topLevel, counts }. */
export function surfaceOf({ verbs, flags = [] }) {
  const own = {};
  const shared = new Set();
  for (const [name, verb] of verbs) {
    const named = new Set(String(verb.usage ?? '').match(FLAG) ?? []);
    for (const f of named) if (SHARED.includes(f)) shared.add(f);
    own[name] = [...named].filter(f => !SHARED.includes(f)).sort();
  }
  const topLevel = flags.map(f => f.name).sort();
  const sharedList = SHARED.filter(f => shared.has(f));
  const flagCount = Object.values(own).reduce((n, f) => n + f.length, 0) + sharedList.length + topLevel.length;
  return { verbs: own, shared: sharedList, topLevel, counts: { verbs: Object.keys(own).length, flags: flagCount } };
}

/** The budget file's contents for a registry, as it would be written. */
export function budgetOf(registry) {
  const s = surfaceOf(registry);
  return { verbs: s.counts.verbs, flags: s.counts.flags, counted: COUNTED, surface: { shared: s.shared, topLevel: s.topLevel, verbs: s.verbs } };
}

/** The verbs named as `plates <verb>` under "What Plates owns, verb by verb", in order (duplicates kept), or null with no such section. */
export function ownedVerbs(designText) {
  const lines = designText.split('\n');
  const boundary = lines.findIndex(l => l.startsWith(BOUNDARY));
  if (boundary < 0) return null;
  const start = lines.findIndex((l, i) => i > boundary && l.trim() === OWNS);
  if (start < 0 || lines.slice(boundary + 1, start).some(l => /^## /.test(l))) return null;
  const end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
  return [...body.matchAll(/`plates ([a-z][a-z -]*?)`/g)].map(m => m[1]);
}

/**
 * Everything wrong between the registry, its budget and the boundary, as
 * messages; [] when they agree. New surface names itself, the budget file and
 * the boundary; removed surface says to lower the budget, so a removal holds.
 */
export function checkSurface(registry, budget, designText) {
  const problems = [];
  const now = surfaceOf(registry);
  const listed = budget?.surface ?? {};
  const listedVerbs = listed.verbs ?? {};
  const raise = (key, n) => `raise "${key}" to ${n} in ${BUDGET_FILE}`;

  for (const [name, flags] of Object.entries(now.verbs)) {
    if (!Object.hasOwn(listedVerbs, name)) {
      problems.push(`new verb \`plates ${name}\`${flags.length ? ` (flags ${flags.join(', ')})` : ''}: ${raise('verbs', now.counts.verbs)}${flags.length ? ` and "flags" to ${now.counts.flags}` : ''}, list it under surface.verbs there, and name it under "${OWNS.slice(4)}" in ${where}`);
      continue;
    }
    for (const flag of flags.filter(f => !listedVerbs[name].includes(f))) {
      problems.push(`new flag ${flag} on \`plates ${name}\`: ${raise('flags', now.counts.flags)} and list it under surface.verbs["${name}"] there; the boundary (${where}) must say Plates owns \`plates ${name}\``);
    }
  }
  for (const [kind, key] of [['shared', 'shared'], ['top-level', 'topLevel']]) {
    for (const flag of now[key].filter(f => !(listed[key] ?? []).includes(f))) {
      problems.push(`new ${kind} flag ${flag}: ${raise('flags', now.counts.flags)} and list it under surface.${key} there; say in the boundary (${where}) why Plates owns it`);
    }
  }

  const gone = Object.keys(listedVerbs).filter(name => !Object.hasOwn(now.verbs, name)).map(n => `\`plates ${n}\``);
  const goneFlags = [
    ...Object.entries(listedVerbs).filter(([name]) => Object.hasOwn(now.verbs, name))
      .flatMap(([name, flags]) => flags.filter(f => !now.verbs[name].includes(f)).map(f => `${f} on \`plates ${name}\``)),
    ...(listed.shared ?? []).filter(f => !now.shared.includes(f)),
    ...(listed.topLevel ?? []).filter(f => !now.topLevel.includes(f)),
  ];
  for (const [key, removed] of [['verbs', gone], ['flags', goneFlags]]) {
    const n = now.counts[key];
    if (n < budget?.[key]) problems.push(`surface removed (${key}: budget ${budget[key]}, registry ${n}): lower the budget to ${n} ("${key}" in ${BUDGET_FILE})${removed.length ? `; gone: ${removed.join(', ')}` : ''}`);
    else if (removed.length) problems.push(`gone from the registry: ${removed.join(', ')}; drop ${removed.length === 1 ? 'it' : 'them'} from surface in ${BUDGET_FILE}`);
    if (n > budget?.[key]) problems.push(`the registry has ${n} ${key}, the budget ${budget[key]}: ${raise(key, n)} only with the new surface named under ${where}`);
  }
  if (budget?.counted !== COUNTED) problems.push(`"counted" in ${BUDGET_FILE} does not state the rule lib/surface-budget.mjs counts by`);

  const owned = ownedVerbs(designText);
  if (owned === null) {
    problems.push(`${DESIGN_FILE} has no "${OWNS.slice(4)}" under "${BOUNDARY.slice(3)}"`);
    return problems;
  }
  for (const name of Object.keys(now.verbs).filter(n => !owned.includes(n))) {
    problems.push(`\`plates ${name}\` is not named under "${OWNS.slice(4)}" in ${where}`);
  }
  for (const name of [...new Set(owned)]) {
    if (!Object.hasOwn(now.verbs, name)) problems.push(`\`plates ${name}\` is named under "${OWNS.slice(4)}" in ${where} but is not a verb in lib/cli.mjs`);
    else if (owned.filter(n => n === name).length > 1) problems.push(`\`plates ${name}\` is named more than once under "${OWNS.slice(4)}" in ${where}`);
  }
  return problems;
}
