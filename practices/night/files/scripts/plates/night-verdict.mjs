// The quiet night's verdict (plates practice `night`; managed: plates render
// rewrites it). plates phase 207: the night speaks up only when something is
// wrong, and three things are:
//
//   main    CI on main is red: ci_red_streak (the gate workflow's newest
//           verdicts on the default branch) counts a failed run, or the gate
//           measure fails on main's tree (CI's result for the exact commit,
//           reused, or the local check when there is none)
//   flaky   a test is flaky: flaky_tests (a test that both passed and failed
//           on one clean tree, in the newest window of the test ledger)
//   empty   the gate ran no tests: the gate measure passed having run none
//           (lesson 14), or the test ledger's own no-tests rule failed it
//           (its "no tests ran" line in the gate's retained output)
//
// Each is one of improve.mjs's own measures, run here alone: no health page,
// no bounds, no plan, no proposal, nothing written but the --out file. A
// measure that cannot answer (n/a, or broken) is said in the summary, never
// red: only the three causes are.
//
//   node scripts/plates/night-verdict.mjs ask --out <file>
//   node scripts/plates/night-verdict.mjs verdict --in <file> [--summary <file>]
//
// ask runs the three measures and writes their results (exit 0, or 2 when it
// cannot run at all). verdict reads them, writes one `::error::` line per
// cause to stdout and the same to --summary (the run's $GITHUB_STEP_SUMMARY),
// and exits 1 when any cause holds; otherwise one quiet summary line, exit 0.
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isMain, rootOf } from './lib.mjs';
import { LABEL } from './test-ledger.mjs';

/** The measures the night runs, in improve's order (the gate first, so its run is in the ledger flaky reads). */
export const NIGHT_MEASURES = Object.freeze(['gate', 'flaky_tests', 'ci_red_streak']);
/** The causes, in the order the summary names them. */
export const CAUSES = Object.freeze({
  main: 'CI on main is red',
  flaky: 'A test is flaky',
  empty: 'The gate ran no tests',
});

export class VerdictError extends Error {
  constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; }
}

/**
 * The causes that hold, from the three measures' results (improve.mjs
 * measure()'s shape: { id, state, value, detail, facts }). Each is
 * { cause, title, detail }. Pure.
 */
export function nightCauses(results) {
  const by = Object.fromEntries((results ?? []).map(r => [r?.id, r]));
  const causes = [];
  const gate = by.gate, red = by.ci_red_streak, flaky = by.flaky_tests;
  const gateRan = gate && gate.state !== 'broken' && gate.state !== 'n/a';
  const said = [gate?.facts?.diagnostics?.stdout?.text, gate?.facts?.diagnostics?.stderr?.text];
  const ledgerEmpty = gateRan && Number(gate.value) > 0 && said.some(t => typeof t === 'string' && t.includes(`${LABEL}: no tests ran.`));
  const empty = gateRan && (gate.facts?.empty === true || ledgerEmpty);
  const main = [];
  if (red && red.state !== 'broken' && red.state !== 'n/a' && Number(red.value) > 0) main.push(red.detail);
  if (gateRan && Number(gate.value) > 0 && !empty) main.push(`the gate fails on main's tree: ${gate.detail}`);
  if (main.length) causes.push({ cause: 'main', title: CAUSES.main, detail: main.join('; ') });
  if (flaky && flaky.state !== 'broken' && flaky.state !== 'n/a' && Number(flaky.value) > 0) causes.push({ cause: 'flaky', title: CAUSES.flaky, detail: flaky.detail });
  if (empty) causes.push({ cause: 'empty', title: CAUSES.empty, detail: ledgerEmpty ? `the test ledger failed the gate: no tests ran; ${gate.detail}` : gate.detail });
  return causes;
}

/** The measures that could not answer tonight: said, never red. */
export function unanswered(results) {
  const by = Object.fromEntries((results ?? []).map(r => [r?.id, r]));
  return NIGHT_MEASURES.map(id => by[id] ? by[id] : { id, state: 'missing', detail: 'not run' })
    .filter(r => r.state === 'broken' || r.state === 'n/a' || r.state === 'missing')
    .map(r => ({ id: r.id, state: r.state, detail: r.detail }));
}

/**
 * The verdict as the run shows it: `lines` for stdout (GitHub's ::error:: and
 * ::warning:: commands), `summary` for $GITHUB_STEP_SUMMARY, and the exit code.
 */
export function verdict(results, { date } = {}) {
  const causes = nightCauses(results), gaps = unanswered(results);
  const on = date ? ` on ${date}` : '';
  const lines = [], summary = [];
  if (causes.length) {
    summary.push(`## The night${on}: ${causes.length === 1 ? 'one thing is' : `${causes.length} things are`} wrong`, '');
    for (const c of causes) {
      lines.push(`::error title=${c.title}::${c.title}: ${c.detail}`);
      summary.push(`- **${c.title}**: ${c.detail}`);
    }
  } else {
    summary.push(`The night${on}: main is green, no test is flaky, and the gate ran tests.`);
  }
  for (const g of gaps) {
    const said = `${g.id} could not answer tonight (${g.state}): ${g.detail}`;
    if (g.state === 'broken') lines.push(`::warning title=${g.id}::${said}`);
    summary.push(`${causes.length ? '- ' : ''}${said}`);
  }
  if (!causes.length && !gaps.length) lines.push(summary[0]);
  return { causes, gaps, lines, summary: `${summary.join('\n')}\n`, exitCode: causes.length ? 1 : 0 };
}

/** Run the three measures through improve.mjs's own instruments; nothing is written. */
export async function ask({ root, env = process.env, date, measure, measures } = {}) {
  const improve = (measure && measures) ? null : await import('./improve.mjs');
  const run = measure ?? improve.measure, all = measures ?? improve.MEASURES;
  const chosen = NIGHT_MEASURES.map(id => all.find(m => m.id === id)).filter(Boolean);
  if (chosen.length !== NIGHT_MEASURES.length) throw new VerdictError(`improve.mjs lacks a night measure: ${NIGHT_MEASURES.filter(id => !all.some(m => m.id === id)).join(', ')}`);
  let config;
  try { config = JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8')); }
  catch (e) { throw new VerdictError(`.plates/plates.json could not be read: ${e.message}`); }
  const results = await run({ root, config, env, ...(date ? { date } : {}), measures: chosen });
  return results.map(({ timeCandidates, ...r }) => r);
}

export function parseArgs(argv) {
  const [verb, ...rest] = argv;
  if (!['ask', 'verdict'].includes(verb)) throw new VerdictError('usage: night-verdict.mjs ask --out <file> | verdict --in <file> [--summary <file>]');
  const out = { verb };
  const valued = { '--out': 'out', '--in': 'in', '--summary': 'summary', '--date': 'date' };
  for (let i = 0; i < rest.length; i++) {
    const key = valued[rest[i]];
    if (!key || rest[i + 1] === undefined || rest[i + 1].startsWith('--')) throw new VerdictError(`unexpected argument: ${rest[i]}`);
    out[key] = key === 'date' ? rest[++i] : resolve(rest[++i]);
  }
  if (verb === 'ask' && !out.out) throw new VerdictError('ask needs --out <file>');
  if (verb === 'verdict' && !out.in) throw new VerdictError('verdict needs --in <file>');
  return out;
}

export async function cli(argv, { root, env = process.env, write = s => process.stdout.write(s) } = {}) {
  const opts = parseArgs(argv);
  if (opts.verb === 'ask') {
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    const results = await ask({ root, env, date });
    await writeFile(opts.out, `${JSON.stringify({ date, results }, null, 2)}\n`);
    for (const r of results) write(`${r.id.padEnd(14)} ${String(r.value ?? '-').padStart(4)}  ${r.state.padEnd(8)} ${r.detail}\n`);
    return 0;
  }
  let data;
  try { data = JSON.parse(await readFile(opts.in, 'utf8')); }
  catch (e) { throw new VerdictError(`the night's answers could not be read (${e.message}): the ask step did not finish`); }
  const v = verdict(data.results, { date: data.date });
  for (const line of v.lines) write(`${line}\n`);
  if (opts.summary) await appendFile(opts.summary, v.summary);
  return v.exitCode;
}

if (isMain(import.meta)) {
  try { process.exitCode = await cli(process.argv.slice(2), { root: rootOf(import.meta) }); }
  catch (e) { process.stderr.write(`::error::${String(e?.message ?? e).split('\n')[0]}\n`); process.exitCode = e?.exitCode ?? 2; }
}
