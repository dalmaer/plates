// The default-deny child sandbox the executor trials ran candidate and tool
// processes under (phase 146): a macOS Seatbelt (sandbox-exec) profile, kept
// here as data and a pure builder. Nothing in this module runs sandbox-exec,
// resolves paths or changes a system setting; a host on macOS resolves real
// paths first, then passes the argv from sandboxArgs to /usr/bin/sandbox-exec
// with sandboxEnvironment as the whole environment, and owns the deadline.
//
// Ported from codex/openhands-evaluation@9d891e96 experiments/openhands/containment.mjs
// (the profile text, bounded-workspace and separate-scratch rules, clean
// environment, --disable-proto=throw --no-addons). The Gas City profile
// (codex/gas-city-evaluation@1f9b083d experiments/gas-city/containment.mjs)
// admits process-fork and any executable; this stricter one does not.
//
// UNVERIFIED COVERAGE: both trials' adversarial fork-path and forced-timeout
// descendant-cleanup test batches never ran (an automated safety filter stopped
// them; see docs/research/2026-10-30-own-judgment-rent-the-rest.md and phase
// 146 "Deliberately open"). Earlier probes covered denied evaluator and sibling
// reads and writes, symlink and hardlink escapes, signals to other processes,
// sockets and subprocess creation; they are not coverage of those batches. The
// profile carries that gap until a macOS test of its own covers it.

/** What the profile admits, and what it never does. */
export const SANDBOX_POLICY = Object.freeze({
  default: 'deny',
  admits: Object.freeze(['the exact Node executable (exec and read)', 'system runtime reads under /System and /usr/lib', 'the exact runner file', 'reads in the workspace', 'writes in the workspace only when writable, never to its protected paths', 'reads and writes in a separate scratch directory', 'stdio pipes, /dev/null and the random devices']),
  denies: Object.freeze(['process-fork', 'network', 'Mach service lookup beyond bootstrap', 'signals to other processes', 'any other executable', 'host file contents outside the admitted paths', 'inherited service handles']),
  protected: Object.freeze(['.git', 'tests/helpers']),
  nodeFlags: Object.freeze(['--disable-proto=throw', '--no-addons']),
});

const fail = code => { throw Object.assign(new Error(`sandbox policy: ${code}`), { code }); };
const absolute = p => typeof p === 'string' && p.startsWith('/') && !/[\x00-\x1f\x7f]/.test(p) && !p.split('/').some(s => s === '.' || s === '..');
const parent = p => p.slice(0, p.lastIndexOf('/')) || '/';
const within = (child, root) => child === root || child.startsWith(root + '/');
const quote = p => { if (!absolute(p)) fail('invalid-path'); return JSON.stringify(p); };
const TEMP_ROOTS = ['/tmp', '/private/tmp', '/var/tmp', '/private/var/tmp'];

/**
 * Build the profile text. Every path must already be a resolved real path.
 * @param {{ node: string, workspace: string, runner: string, writable?: boolean, scratch?: string | null, tmpdir?: string, protect?: string[] }} input
 * @returns {string}
 */
export function sandboxProfile({ node, workspace, runner, writable = false, scratch = null, tmpdir = '/private/tmp', protect = [] }) {
  for (const p of [node, workspace, runner, tmpdir, ...(scratch === null ? [] : [scratch])]) if (!absolute(p)) fail('invalid-path');
  if (workspace === '/' || parent(workspace) === '/' || workspace === tmpdir || TEMP_ROOTS.includes(workspace) || within(runner, workspace)) fail('bounded-workspace-required');
  if (scratch !== null && (parent(scratch) === '/' || [...TEMP_ROOTS, tmpdir].includes(scratch) || within(scratch, workspace) || within(workspace, scratch) || within(runner, scratch) || within(scratch, runner))) fail('separate-bounded-scratch-required');
  const protectedPaths = [...SANDBOX_POLICY.protected, ...protect].map(rel => {
    if (typeof rel !== 'string' || !rel || rel.startsWith('/') || !absolute(`${workspace}/${rel}`)) fail('invalid-protected-path');
    return `${workspace}/${rel}`;
  });
  return [
    '(version 1)',
    '(deny default)',
    '(import "dyld-support.sb")',
    '(allow syscall*)',
    '(allow mach-bootstrap)',
    '(allow sysctl-read)',
    `(allow process-exec (literal ${quote(node)}))`,
    `(allow file-read* file-map-executable (subpath "/System") (subpath "/usr/lib") (literal ${quote(node)}))`,
    `(allow file-read-metadata (path-ancestors ${quote(node)}) (path-ancestors ${quote(workspace)}) (path-ancestors ${quote(runner)}))`,
    `(allow file-read* (subpath ${quote(workspace)}) (literal ${quote(runner)}))`,
    '(allow file-read-data file-write-data (subpath "/dev/fd") (literal "/dev/null"))',
    '(allow file-read-data (literal "/dev/urandom") (literal "/dev/random"))',
    ...(scratch === null ? [] : [`(allow file-read-metadata (path-ancestors ${quote(scratch)}))`, `(allow file-read* file-write* (subpath ${quote(scratch)}))`]),
    ...(writable ? [`(allow file-write* (subpath ${quote(workspace)}))`, `(deny file-write* ${protectedPaths.map(p => `(subpath ${quote(p)})`).join(' ')})`] : []),
    '',
  ].join('\n');
}

/** The sandbox-exec argv (after /usr/bin/sandbox-exec). @param {Parameters<typeof sandboxProfile>[0] & { args?: string[] }} input */
export function sandboxArgs({ args = [], ...input }) {
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string' || a.includes('\0'))) fail('explicit-argv-required');
  return ['-p', sandboxProfile(input), input.node, ...SANDBOX_POLICY.nodeFlags, input.runner, ...args];
}

/** The child's whole environment: nothing inherited from the caller. @param {{ tmp: string }} input */
export function sandboxEnvironment({ tmp }) {
  if (!absolute(tmp)) fail('invalid-path');
  return { PATH: '/usr/bin:/bin', TMPDIR: tmp, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0' };
}
