import { StringDecoder } from 'node:string_decoder';
import { rpcFailure } from './diagnostics.mjs';

// App-server JSONL over already-approved pipes. No process, login or socket is opened here.
export function createJsonRpc({ input, output, timeoutMs = 10_000 }) {
  let serial = 0, buffer = '', closed = false;
  const decoder = new StringDecoder('utf8');
  const pending = new Map(), listeners = new Set();
  const write = message => { if (closed) throw new Error('rpc_closed'); output.write(`${JSON.stringify(message)}\n`); };
  function close() {
    if (closed) return; closed = true;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('rpc_closed')); }
    pending.clear(); input.off('data', data); input.off('end', close); input.off('error', close); output.off('error', close);
    for (const listener of listeners) listener({ method: 'bridge/disconnected', params: {} });
    listeners.clear();
  }
  function data(chunk) {
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    if (Buffer.byteLength(buffer) > 1024 * 1024) return close();
    for (;;) {
      const end = buffer.indexOf('\n'); if (end < 0) return;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message; try { message = JSON.parse(line); } catch { close(); return; }
      if (!message || typeof message !== 'object') { close(); return; }
      if (message.method && message.id !== undefined) {
        // Never approve a server-requested tool, permission expansion, login or interaction.
        write({ id: message.id, error: { code: -32601, message: 'Conversation-only bridge refuses server requests' } });
        for (const listener of listeners) listener({ method: 'bridge/serverRequestDenied', params: {} });
      } else if (message.id !== undefined) {
        const p = pending.get(message.id); if (!p) continue;
        pending.delete(message.id); clearTimeout(p.timer);
        if (message.error) p.reject(rpcFailure(p.method, message.error.code)); else p.resolve(message.result);
      } else if (typeof message.method === 'string') {
        for (const listener of listeners) listener(message);
      }
    }
  }
  input.on('data', data); input.on('end', close); input.on('error', close); output.on('error', close);
  return {
    request(method, params = {}) {
      if (closed) return Promise.reject(new Error('rpc_closed'));
      if (pending.size >= 100) return Promise.reject(new Error('rpc_capacity'));
      return new Promise((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error('rpc_timeout')); }, timeoutMs);
        pending.set(id, { resolve, reject, timer, method });
        try { write({ id, method, params }); } catch { close(); }
      });
    },
    notify(method, params = {}) { write({ method, params }); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close,
  };
}
