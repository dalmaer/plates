#!/usr/bin/env node
// The runner plates starts in a Rex tab (plates phase 193). Never imported by
// the CLI; plates runs it by path:
//
//   node lib/rex-run.mjs <brief file> -- <harness argv...>
//
// It reads the brief from the private file plates wrote (mode 600, under
// plates's state directory), deletes the file, then starts the harness in the
// tab's working directory (the checkout) with the brief on stdin and the tab's
// stdout and stderr, so the tab shows the agent. It exits with the harness's
// code. It prints one line naming what it runs and never the brief, its path's
// contents, or anything from it: Rex keeps the whole scrollback.
//
// The harness's environment is the basics only (the same keys as
// lib/attach.mjs's hostEnv): the tab's own Rex variables and anything else in
// the terminal's environment are not passed on.
import { spawn } from 'node:child_process';
import { lstatSync, readFileSync, unlinkSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const HOST_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM'];
const MAX_BRIEF = 1024 * 1024;
const stop = message => { process.stderr.write(`plates rex-run: ${message}\n`); process.exit(2); };

const [file, sep, ...harness] = process.argv.slice(2);
if (!file || !isAbsolute(file) || sep !== '--' || !harness.length || !isAbsolute(harness[0])) stop('usage: rex-run.mjs <absolute brief file> -- </abs/harness> [args...]');

let brief;
try {
  const st = lstatSync(file);
  if (!st.isFile() || st.size > MAX_BRIEF) stop('the brief is not a regular file of at most 1 MiB; nothing was started');
  brief = readFileSync(file);
} catch (error) {
  stop(`the brief could not be read (${error.code ?? 'unknown'}); nothing was started`);
} finally {
  try { unlinkSync(file); } catch { /* already gone */ }
}

process.stdout.write(`plates: running ${harness.join(' ')} in ${process.cwd()}, brief on stdin\n`);
const env = Object.fromEntries(HOST_ENV.filter(k => typeof process.env[k] === 'string').map(k => [k, process.env[k]]));
const child = spawn(harness[0], harness.slice(1), { cwd: process.cwd(), env, stdio: ['pipe', 'inherit', 'inherit'] });
child.on('error', error => stop(`${harness[0]} could not run: ${error.code ?? error.message}`));
child.stdin.on('error', () => {});
child.stdin.end(brief);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 128 + ({ SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 }[signal] ?? 0) : 1)));
