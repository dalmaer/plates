import { readFileSync } from 'node:fs';
import { inspectHostConfig } from '../../lib/discord-pilot/host-config.mjs';
try {
  const [hostPath, deploymentPath, ...flags] = process.argv.slice(2);
  if (!hostPath || !deploymentPath || flags.some(flag => !['--json', '--probe'].includes(flag))) throw new Error();
  const read = path => { const value = readFileSync(path, 'utf8'); if (value.length > 65536) throw new Error(); return JSON.parse(value); };
  console.log(JSON.stringify(inspectHostConfig(read(hostPath), read(deploymentPath), { probeOnly: flags.includes('--probe') }), null, 2));
} catch { console.error(JSON.stringify({ error: 'invalid_host_plan', credentialReads: 0, processesStarted: 0 })); process.exitCode = 2; }
