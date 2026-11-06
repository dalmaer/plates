// macOS-only default-deny process boundary. No provider/ACP launch path.
import { spawn } from 'node:child_process';
import { realpathSync, readFileSync, lstatSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = path => { if (!isAbsolute(path) || /[\x00-\x1f]/.test(path)) throw Error('invalid sandbox path'); return JSON.stringify(path); };
export function profile({ workspace, runner, writable = false, scratch = null }) {
  if (process.platform !== 'darwin') throw Error('containment_requires_macos');
  workspace = realpathSync(workspace); runner = realpathSync(runner);
  if (workspace === '/' || workspace === realpathSync(tmpdir()) || runner.startsWith(workspace + '/') || dirname(workspace) === '/' || !lstatSync(workspace).isDirectory()) throw Error('bounded_workspace_required');
  const node = realpathSync(process.execPath);
  if (scratch !== null) {
    scratch = realpathSync(scratch);
    const within = (child, parent) => child === parent || child.startsWith(parent + '/');
    if (!lstatSync(scratch).isDirectory() || dirname(scratch) === '/' || ['/tmp','/private/tmp','/var/tmp','/private/var/tmp',realpathSync(tmpdir())].includes(scratch) || within(scratch, workspace) || within(workspace, scratch) || within(runner, scratch) || within(scratch, runner)) throw Error('separate_bounded_scratch_required');
  }
  // No process-fork, network, Mach lookup, signal-other-process, arbitrary executable,
  // host-file contents or inherited service handles are admitted. Initial stdio is pipes only.
  return `(version 1)\n(deny default)\n(import "dyld-support.sb")\n(allow syscall*)\n(allow mach-bootstrap)\n(allow sysctl-read)\n(allow process-exec (literal ${quote(node)}))\n(allow file-read* file-map-executable (subpath "/System") (subpath "/usr/lib") (literal ${quote(node)}))\n(allow file-read-metadata (path-ancestors ${quote(node)}) (path-ancestors ${quote(workspace)}) (path-ancestors ${quote(runner)}))\n(allow file-read* (subpath ${quote(workspace)}) (literal ${quote(runner)}))\n(allow file-read-data file-write-data (subpath "/dev/fd") (literal "/dev/null"))\n(allow file-read-data (literal "/dev/urandom") (literal "/dev/random"))\n${scratch ? `(allow file-read-metadata (path-ancestors ${quote(scratch)}))\n(allow file-read* file-write* (subpath ${quote(scratch)}))\n` : ''}${writable ? `(allow file-write* (subpath ${quote(workspace)}))\n(deny file-write* (subpath ${quote(join(workspace, '.git'))}) (subpath ${quote(join(workspace, 'tests/helpers'))}) (literal ${quote(join(workspace, '.plates-openhands-owner'))}))\n` : ''}`;
}
export function spawnContained({ workspace, runner, writable = false, scratch = null, args = [], timeoutMs = 10000 }) {
  const policy = profile({ workspace, runner, writable, scratch }), node = realpathSync(process.execPath);
  const child = spawn('/usr/bin/sandbox-exec', ['-p', policy, node, '--disable-proto=throw', '--no-addons', runner, ...args], {
    cwd: realpathSync(workspace), env: { PATH: '/usr/bin:/bin', TMPDIR: realpathSync(scratch ?? workspace), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0' },
    stdio: ['pipe', 'pipe', 'pipe'], detached: true,
  });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeoutMs);
  const closed = new Promise(resolve => {
    child.once('error', error => { clearTimeout(timer); resolve({ error: error.message, code: null, signal: null, timedOut }); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, timedOut }); });
  });
  return { child, closed, policy, policySHA256: digest(policy), nodeSHA256: digest(readFileSync(node)), dyldSupportSHA256: digest(readFileSync('/System/Library/Sandbox/Profiles/dyld-support.sb')) };
}
export function rejectModelLaunch() { throw Error('model_launch_disabled: ACP auto-approval/full-access paths are not admitted; no provider/account/budget is configured'); }
