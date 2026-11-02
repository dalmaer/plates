import { readFileSync } from 'node:fs';
import { inspectHostConfig } from '../../lib/discord-pilot/host-config.mjs';
import { createDockerHost } from '../../lib/discord-pilot/docker-host.mjs';

// This is an EFFECTFUL, separately approved container probe. It never resolves a secret.
let host;
try {
  const [hostPath, manifestPath, approval, ...flags] = process.argv.slice(2);
  if (!hostPath || !manifestPath || !approval || !flags.includes('--yes') || flags.some(flag => !['--yes', '--json'].includes(flag))) throw new Error();
  const read = path => { const raw = readFileSync(path, 'utf8'); if (raw.length > 65536) throw new Error(); return JSON.parse(raw); };
  const config = read(hostPath), manifest = read(manifestPath), report = inspectHostConfig(config, manifest, { probeOnly: true });
  if (!report.ready || approval !== report.digest) throw new Error();
  host = createDockerHost({ config, configDigest: report.digest });
  await host.inspect({ manifest, probeOnly: true });
  const result = await host.probe(); await host.close(); host = undefined;
  console.log(JSON.stringify({ status: 'passed', ...result }, null, 2));
} catch {
  let cleanup = 'not-started';
  if (host) { try { await host.close(); cleanup = 'confirmed'; } catch { cleanup = 'uncertain'; } }
  console.error(JSON.stringify({ error: 'host_verification_failed', cleanup })); process.exitCode = 2;
}
