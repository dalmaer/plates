// A stub `unison` CLI for plates phase 200's tests: synthetic Acme workspaces
// kept in a JSON state file, every call logged. Never the real Unison.
//
// world(t, state) makes a git checkout of a plate "Acme Tools" (repo acme/tools)
// with phase files, a bin/ holding the stub, and an env whose PATH finds only
// that stub (and git, node). state: { workspaces, items, mode, signedIn }.
// mode: ok | fail | not-json | no-array | slow. A missing binary: env.PATH without bin/.
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const STUB = `#!${process.execPath}
const fs = require('node:fs');
const file = process.env.ACME_UNISON_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const argv = process.argv.slice(2).filter(a => a !== '--json');
fs.appendFileSync(process.env.ACME_UNISON_CALLS, JSON.stringify({ argv, server: process.env.UNISON_SERVER, cwd: process.cwd(), config: process.env.UNISON_CONFIG }) + '\\n');
const opt = flag => { const i = argv.indexOf(flag); return i < 0 ? undefined : argv[i + 1]; };
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const out = v => { process.stdout.write(JSON.stringify(v)); process.exit(0); };
if (state.mode === 'fail') { process.stderr.write('unison: server error 500\\n'); process.exit(1); }
if (state.mode === 'not-json') { process.stdout.write('Plates workspace\\n'); process.exit(0); }
if (state.mode === 'slow') { setTimeout(() => {}, 60000); return; }
if (state.signedIn === false) { process.stderr.write('unison: not signed in to ' + process.env.UNISON_SERVER + ': run \\'unison login\\' first\\n'); process.exit(1); }
const [a, b] = argv;
if (a === 'workspace' && b === 'list' && state.laterWs?.length) {
  if ((state.hiddenWsLists ?? 0) > 0) state.hiddenWsLists--; else { state.workspaces.push(...state.laterWs); state.laterWs = []; }
  save();
}
if (a === 'workspace' && b === 'list') out(state.mode === 'no-array' ? { workspaces: state.workspaces } : state.workspaces);
if (a === 'workspace' && b === 'create') {
  if (state.failCreate) { process.stderr.write('unison: workspace name taken\\n'); process.exit(1); }
  const id = 'ws_acme' + (state.workspaces.length + (state.laterWs?.length ?? 0) + 1);
  const ws = { id, name: argv[2], repo_url: opt('--repo'), repos: [{ id: 1, url: opt('--repo'), workspace_id: id }] };
  // delayedWorkspace: the create commits, the caller hears a timeout, and it lists only after hiddenWsLists more lists.
  if (state.delayedWorkspace) { state.delayedWorkspace = false; (state.laterWs ??= []).push(ws); save(); process.stderr.write('unison: request timed out\\n'); process.exit(1); }
  state.workspaces.push(ws); save(); out(ws);
}
if (a === 'whoami' && argv.includes('--user')) out({ id: 1, display_name: state.displayName ?? 'Acme Owner', identities: [] });
if (a === 'join') {
  // Joining as the account: one participant per workspace; the session (with its token) goes to UNISON_CONFIG.
  const id = String(argv[1] ?? '').split('/w/')[1];
  if (!state.workspaces.some(w => w.id === id)) { process.stderr.write('unison: workspace not found\\n'); process.exit(1); }
  state.participants ??= {};
  const p = state.participants[id] ??= { id: Object.keys(state.participants).length + 1, name: opt('--name') ?? 'Ada', token: 'acmetok_' + id + '_' + Date.now(), joins: 0 };
  p.joins++;
  fs.writeFileSync(process.env.UNISON_CONFIG, JSON.stringify({ server: process.env.UNISON_SERVER, workspace: id, token: p.token, participant_id: p.id, name: p.name, cursor: 0 }), { mode: 0o600 });
  save(); out({ participant: { id: p.id, name: p.name, workspace_id: id }, token: p.token });
}
const ws = opt('--workspace');
if (!state.workspaces.some(w => w.id === ws)) { process.stderr.write('unison: workspace not found\\n'); process.exit(1); }
if (a === 'backlog' && (b === undefined || b === '--workspace' || b === '--status') && state.later?.length) {
  if ((state.hiddenLists ?? 0) > 0) state.hiddenLists--; else { state.items.push(...state.later); state.later = []; }
  save();
}
if (a === 'backlog' && b === undefined || (a === 'backlog' && b === '--workspace') || (a === 'backlog' && b === '--status')) out(['no-array', 'backlog-no-array'].includes(state.mode) ? { items: state.items } : state.items.filter(i => i.workspace_id === ws));
if (a === 'backlog' && ['add', 'edit', 'close', 'reopen'].includes(b)) {
  // Writes need the participant's session for this workspace; reads work with the account.
  let session = null;
  try { session = JSON.parse(fs.readFileSync(process.env.UNISON_CONFIG, 'utf8')); } catch {}
  const p = state.participants?.[ws];
  if (!p || session?.workspace !== ws || session?.token !== p.token) { process.stderr.write('unison: you have not joined this workspace: run \`unison join <workspace-url> --pass <pass>\` (agents) or \`--account\` (humans)\\n'); process.exit(1); }
}
const item = id => { const it = state.items.find(i => i.id === Number(id) && i.workspace_id === ws); if (!it) { process.stderr.write('unison: no item\\n'); process.exit(1); } return it; };
if (a === 'backlog' && b === 'add') {
  if (state.failAdd) { process.stderr.write('unison: refused\\n'); process.exit(1); }
  const it = { id: state.next++, title: argv[2], body: opt('--body') ?? '', status: 'open', workspace_id: ws };
  // delayedCommit: the add commits server-side but the caller hears a timeout, and the item shows only after hiddenLists more lists.
  if (state.delayedCommit) { state.delayedCommit = false; (state.later ??= []).push(it); save(); process.stderr.write('unison: request timed out\\n'); process.exit(1); }
  state.items.push(it); save();
  // addDelayMs: the add lands, then the answer is slow (a second sync may start meanwhile).
  if (state.addDelayMs) { const until = Date.now() + state.addDelayMs; while (Date.now() < until) { /* hold */ } }
  out(it);
}
if (a === 'backlog' && b === 'edit') { const it = item(argv[2]); if (opt('--title') !== undefined) it.title = opt('--title'); if (opt('--body') !== undefined) it.body = opt('--body'); save(); out(it); }
// dieOnClose: Unison closes the item, but the caller never hears back (it died, or the line dropped).
if (a === 'backlog' && b === 'close') { const it = item(argv[2]); it.status = 'done'; it.close_note = opt('--note'); if (state.dieOnClose) { state.dieOnClose = false; save(); process.stderr.write('unison: connection reset by peer\\n'); process.exit(1); } save(); out(it); }
if (a === 'backlog' && b === 'reopen') { const it = item(argv[2]); it.status = 'open'; save(); out(it); }
process.stderr.write('unison: stub does not know ' + argv.join(' ') + '\\n'); process.exit(1);
`;

export const PHASES = {
  '1-acme-reads-anvils.md': { status: 'built', title: 'Acme reads anvils' },
  '2-acme-counts-anvils.md': { status: 'planned', title: 'Acme counts anvils' },
  '3-acme-orders-anvils.md': { status: 'partial', title: 'Acme orders anvils' },
};

export function phaseText(title, status) {
  return `---\nstatus: ${status}\nsince: 2026-11-01\ngoal: G1\nnote: "Acme"\nevidence: ${status === 'built' ? '["evidence/acme.md"]' : '[]'}\n---\n# ${title}\n## Done when\n${title}, measured.\nPhase: https://github.com/acme/other/blob/main/docs/phases/9-x.md\n## Scope\nAcme only.\n## Acceptance\n- [${status === 'built' ? 'x' : ' '}] ${title}.\n## Proof\nRun it.\n## Deliberately open\nNone.\n## Next action\nDo it.\n`;
}

export async function world(t, state = {}, { config = {}, phases = PHASES } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'plates-unison-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plate = join(root, 'acme-tools'), bin = join(root, 'bin');
  await mkdir(join(plate, '.plates'), { recursive: true });
  await mkdir(join(plate, 'docs/phases'), { recursive: true });
  await mkdir(bin);
  await writeFile(join(plate, '.plates/plates.json'), JSON.stringify({ name: 'Acme Tools', repo: 'acme/tools', practices: ['phases'], ...config }));
  await writeFile(join(plate, 'docs/goals.json'), JSON.stringify([{ id: 'G1', title: 'Acme works', outcome: 'Acme works.' }]));
  await mkdir(join(plate, 'docs/evidence'), { recursive: true });
  await writeFile(join(plate, 'docs/evidence/acme.md'), '# Acme evidence\n\nAcme reads anvils: measured.\n');
  for (const [file, p] of Object.entries(phases)) await writeFile(join(plate, 'docs/phases', file), phaseText(p.title, p.status));
  execFileSync('git', ['init', '-q'], { cwd: plate });
  await writeFile(join(bin, 'unison'), STUB, { mode: 0o755 });
  const stateFile = join(root, 'unison-state.json'), calls = join(root, 'unison-calls.jsonl');
  await writeFile(stateFile, JSON.stringify({ workspaces: [], items: [], next: 1, mode: 'ok', ...state }));
  await writeFile(calls, '');
  const systemPath = [dirname(process.execPath), '/usr/bin', '/bin'].join(':');
  const env = { HOME: root, PATH: `${bin}:${systemPath}`, ACME_UNISON_STATE: stateFile, ACME_UNISON_CALLS: calls, UNISON_SERVER: 'http://127.0.0.1:4600',
    GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL ?? '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  return {
    root, plate, bin, env, systemPath,
    state: async () => JSON.parse(await readFile(stateFile, 'utf8')),
    setState: async patch => writeFile(stateFile, JSON.stringify({ ...JSON.parse(await readFile(stateFile, 'utf8')), ...patch })),
    calls: async () => (await readFile(calls, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l)),
  };
}

/** A workspace the stub serves. */
export const workspace = (id, url, name = 'Acme Tools') => ({ id, name, repo_url: url, repos: [{ id: 1, position: 1, url, workspace_id: id }] });
