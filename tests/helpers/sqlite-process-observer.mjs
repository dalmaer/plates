// Test-only observation of the real SQLite subprocess; production deadlines stay intact.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync } from 'node:fs';
import { once } from 'node:events';

export function observeSqliteProcess(t, { worker, suppressInput = false } = {}) {
  const original = childProcess.spawn, records = [];
  t.mock.method(childProcess, 'spawn', function (command, args, options) {
    const sqlite = args.some(arg => String(arg).endsWith('/sqlite-reader.mjs'));
    const actualArgs = sqlite && worker ? args.map(arg => String(arg).endsWith('/sqlite-reader.mjs') ? worker : arg) : args;
    const child = original.call(this, command, actualArgs, options);
    if (!sqlite) return child;
    const record = { child, snapshot: null, existedAtClose: null, signal: null, watchdog: false };
    records.push(record);
    const send = child.send.bind(child);
    child.send = (message, ...rest) => {
      record.snapshot = message.path;
      if (suppressInput) return true;
      return send(message, ...rest);
    };
    record.closed = new Promise(resolve => child.once('close', (code, signal) => {
      record.signal = signal; record.code = code;
      record.existedAtClose = existsSync(record.snapshot);
      resolve();
    }));
    // Independent real-time backstop: mock timers must never strand native work.
    AbortSignal.timeout(5000).addEventListener('abort', () => {
      if (child.exitCode === null && child.signalCode === null) { record.watchdog = true; child.kill('SIGKILL'); }
    }, { once: true });
    return child;
  });
  syncBuiltinESMExports();
  t.after(async () => {
    t.mock.restoreAll(); syncBuiltinESMExports();
    await Promise.all(records.map(async ({ child }) => {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'close'); child.kill('SIGKILL'); await closed;
      }
    }));
  });
  return records;
}
