// Image entrypoint, not an operator CLI. Only the fixed agent binary can be launched.
// A single private setup frame precedes the normal SDK/app-server stdin stream.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { normalize } from 'node:path';
import { prepareRuntimeHome } from './runtime-home.mjs';

const runtime = process.argv[2];
let buffer = Buffer.alloc(0), child;
function fail() { process.stderr.write('pilot_worker_unavailable\n'); process.exit(1); }
function start(frame) {
  if (!['codex', 'claude'].includes(runtime) || frame.runtime !== runtime || frame.version !== 1
    || typeof frame.cwd !== 'string' || normalize(frame.cwd) !== frame.cwd || !frame.cwd.startsWith('/')
    || !frame.cwd.endsWith(`/runtimes/${runtime}/workspace`) || !/^\d+\.\d+\.\d+$/.test(frame.runtimeVersion)
    || !Array.isArray(frame.args) || frame.args.length > 100 || !frame.args.every(v => typeof v === 'string' && v.length < 65536)
    || !frame.env || typeof frame.env !== 'object' || process.getuid() !== 1000) throw new Error();
  const allowed = runtime === 'codex' ? [] : ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_MAX_RETRIES', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'MAX_STRUCTURED_OUTPUT_RETRIES'];
  if (Object.keys(frame.env).some(k => !allowed.includes(k)) || Object.values(frame.env).some(v => typeof v !== 'string' || /[\r\n\0]/.test(v))) throw new Error();
  if (runtime === 'codex' && JSON.stringify(frame.args) !== '["app-server"]') throw new Error();
  if (readdirSync(frame.cwd).length || statSync('/home/agent').uid !== 1000) throw new Error();
  prepareRuntimeHome('/home/agent', runtime);
  for (const path of ['/home/agent/.codex/config.toml', '/home/agent/.codex/AGENTS.md', '/home/agent/.claude/settings.json', '/home/agent/.claude/CLAUDE.md']) if (existsSync(path)) throw new Error();
  // The directory is image-owned but writable by uid 1000 before --read-only is applied.
  let readonly = false;
  try { writeFileSync('/opt/pilot/read-only-probe/probe', 'probe', { flag: 'wx' }); unlinkSync('/opt/pilot/read-only-probe/probe'); }
  catch (error) { readonly = error.code === 'EROFS'; }
  if (!readonly) throw new Error();
  const baseEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/agent',
    ...(runtime === 'codex' ? { CODEX_HOME: '/home/agent/.codex' } : { CLAUDE_CONFIG_DIR: '/home/agent/.claude' }) };
  const command = `/usr/local/bin/${runtime === 'codex' ? 'codex' : 'claude'}`;
  const version = spawnSync(command, ['--version'], { env: baseEnv, encoding: 'utf8', timeout: 10000, maxBuffer: 8192 });
  if (version.status !== 0 || version.stdout.match(/(?:^|\s)(\d+\.\d+\.\d+)(?:\s|$)/)?.[1] !== frame.runtimeVersion) throw new Error();
  const ready = JSON.stringify({ pilotReady: { runtime, version: frame.runtimeVersion, readOnlyRoot: true, emptyWorkspace: true } }) + '\n';
  if (frame.probe === true) { process.stdout.write(ready, () => process.exit(0)); return null; }
  process.stdout.write(ready);
  child = spawn(command, frame.args, { cwd: frame.cwd, env: { ...baseEnv, ...frame.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.pipe(process.stdout); child.stderr.resume(); // Never forward raw provider/credential diagnostics.
  child.on('error', fail); child.on('exit', code => process.exit(code ?? 1));
  return child;
}
function data(chunk) {
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length > 256 * 1024) fail();
  const newline = buffer.indexOf(10); if (newline < 0) return;
  process.stdin.pause(); process.stdin.off('data', data);
  try {
    const frame = JSON.parse(buffer.subarray(0, newline).toString('utf8'));
    const processChild = start(frame);
    if (!processChild) return;
    if (buffer.length > newline + 1) processChild.stdin.write(buffer.subarray(newline + 1));
    buffer = Buffer.alloc(0); process.stdin.pipe(processChild.stdin); process.stdin.resume();
  } catch { fail(); }
}
process.stdin.on('data', data); process.stdin.on('error', fail);
process.once('SIGTERM', () => { child?.kill('SIGTERM'); setTimeout(() => process.exit(1), 1500).unref(); });
