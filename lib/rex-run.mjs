#!/usr/bin/env node
// The runner plates starts in a Rex tab (plates phase 193). Never imported by
// the CLI; plates runs it by path:
//
//   node lib/rex-run.mjs [--prompt=arg] <brief file> -- <harness argv...>
//
// It reads the brief from the private file plates wrote (mode 600, under
// plates's state directory) and starts the harness in the tab's working
// directory (the checkout) with the tab's stdout and stderr, so the tab shows
// the agent. How the brief reaches the harness:
//
// - stdin (the default): the file is deleted once read and the brief is the
//   harness's stdin, for a headless agent (`claude -p`, `codex exec`).
// - --prompt=arg: an interactive agent (the claude and codex TUIs) keeps the
//   tab's terminal as its stdin and takes its first prompt from its last
//   argument. The brief is never that argument (argv is visible in `ps`, and a
//   brief holds decision context): it stays in its private file, and the
//   argument is a short prompt naming that file, which is removed when the
//   harness exits or the tab is closed or stopped (SIGHUP, SIGTERM), never
//   before. Ctrl-C in the tab reaches the harness as the terminal sends it;
//   the runner leaves it to the harness (a TUI uses it to interrupt a turn).
//
// It exits with the harness's code. It prints one line naming what it runs
// and never the brief, the file's contents, or anything from it: Rex keeps
// the whole scrollback.
//
// The harness's environment is the basics only (the same keys as
// lib/attach.mjs's hostEnv): the tab's own Rex variables and anything else in
// the terminal's environment are not passed on.
import { spawn } from 'node:child_process';
import { lstatSync, readFileSync, unlinkSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const HOST_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM'];
const MAX_BRIEF = 1024 * 1024;
const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };
const stop = message => { process.stderr.write(`plates rex-run: ${message}\n`); process.exit(2); };
const remove = file => { try { unlinkSync(file); } catch { /* already gone */ } };

let args = process.argv.slice(2), prompt = 'stdin';
if (args[0] === '--prompt=arg' || args[0] === '--prompt=stdin') { prompt = args[0].slice('--prompt='.length); args = args.slice(1); }
const [file, sep, ...harness] = args;
if (!file || !isAbsolute(file) || sep !== '--' || !harness.length || !isAbsolute(harness[0])) stop('usage: rex-run.mjs [--prompt=arg] <absolute brief file> -- </abs/harness> [args...]');

let brief, keep = false;
try {
  const st = lstatSync(file);
  if (!st.isFile() || st.size > MAX_BRIEF) stop('the brief is not a regular file of at most 1 MiB; nothing was started');
  brief = readFileSync(file);
  keep = prompt === 'arg';
} catch (error) {
  stop(`the brief could not be read (${error.code ?? 'unknown'}); nothing was started`);
} finally {
  if (!keep) remove(file);
}

const env = Object.fromEntries(HOST_ENV.filter(k => typeof process.env[k] === 'string').map(k => [k, process.env[k]]));
if (prompt === 'stdin') {
  process.stdout.write(`plates: running ${harness.join(' ')} in ${process.cwd()}, brief on stdin\n`);
} else {
  process.stdout.write(`plates: running ${harness.join(' ')} in ${process.cwd()}, brief as its startup prompt (a private file it is pointed to)\n`);
}
const first = `Your brief from plates is in the private file ${file} . Read it now and follow it. Plates removes the file when this run ends.`;
const child = spawn(harness[0], prompt === 'arg' ? [...harness.slice(1), first] : harness.slice(1), { cwd: process.cwd(), env, stdio: [prompt === 'arg' ? 'inherit' : 'pipe', 'inherit', 'inherit'] });
const done = code => { if (keep) remove(file); process.exit(code); };
process.on('SIGINT', () => { /* the terminal sent it to the harness too; its exit ends this run */ });
for (const signal of ['SIGHUP', 'SIGTERM']) {
  process.on(signal, () => { if (keep) remove(file); try { child.kill(signal); } catch { /* gone */ } setTimeout(() => process.exit(128 + SIGNALS[signal]), 2000).unref(); });
}
child.on('error', error => { if (keep) remove(file); stop(`${harness[0]} could not run: ${error.code ?? error.message}`); });
if (prompt === 'stdin') { child.stdin.on('error', () => {}); child.stdin.end(brief); }
child.on('exit', (code, signal) => done(code ?? (signal ? 128 + (SIGNALS[signal] ?? 0) : 1)));
