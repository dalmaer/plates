import { readFileSync } from 'node:fs';
import { createRecovery } from '../../lib/discord-pilot/recovery.mjs';

// Preview reads only explicit non-secret config/state and Docker metadata.
// Apply additionally archives exact approved lease files; it never resets a trial.
try {
  const [action, hostPath, manifestPath, exitEvidence, approval, ...extra] = process.argv.slice(2);
  if (!['plan', 'apply'].includes(action) || extra.length || action === 'apply' && !approval || action === 'plan' && approval) throw new Error('recovery_arguments');
  const read = path => { const raw = readFileSync(path, 'utf8'); if (raw.length > 65536) throw new Error('recovery_config_size'); return JSON.parse(raw); };
  const recovery = createRecovery({ config: read(hostPath), manifest: read(manifestPath), coordinatorExit: exitEvidence });
  console.log(JSON.stringify(action === 'plan' ? await recovery.plan() : await recovery.apply(approval), null, 2));
} catch { console.error(JSON.stringify({ error: 'recovery_refused_or_incomplete', liveStarted: false })); process.exitCode = 2; }
