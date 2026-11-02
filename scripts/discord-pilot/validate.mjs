import { runEntrypoint } from '../../lib/discord-pilot/entrypoint.mjs';

// Dry-run has no host import or external effects. Start needs two explicit digests.
try {
  const { report, service } = await runEntrypoint(process.argv.slice(2));
  console.log(JSON.stringify(report, null, 2));
  if (service) {
    let stopping;
    const stop = () => stopping ??= service.stop().then(() => { process.exitCode = 0; }, () => {
      console.error(JSON.stringify({ error: 'shutdown_uncertain' })); process.exitCode = 1;
    });
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    void service.done.then(result => {
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      console.log(JSON.stringify({ trial: result }));
      if (result.cleanup !== 'confirmed') process.exitCode = 1;
    });
  }
} catch { console.error(JSON.stringify({ error: 'deployment_start_or_validation_failed' })); process.exitCode = 2; }
