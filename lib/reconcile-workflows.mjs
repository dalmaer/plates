import { accessConfig } from '../practices/reconciliation/files/scripts/plates/reconcile-actions.mjs';
// Rendering opts in only configured projects. The released observer is unchanged.
export function shapeReconciliation(text, config, night = false) {
  const access = accessConfig(config);
  if (!access || !(config.practices ?? []).includes('reconciliation')) return text;
  const expression = text => '${{ ' + text + ' }}';
  const metadata = `          PLATES_RECONCILE_DEFAULT_BRANCH: ${expression('github.event.repository.default_branch')}\n`;
  const snapshotEnv = `${metadata}          PLATES_RECONCILE_SNAPSHOT: ${expression('runner.temp')}/plates-reconciliation.json
          PLATES_RECONCILE_ARTIFACT_ID: ${expression('needs.reconciliation.outputs.artifact_id')}
          PLATES_RECONCILE_ARTIFACT_DIGEST: sha256:${expression('needs.reconciliation.outputs.artifact_digest')}
          PLATES_RECONCILE_RESULT_DIGEST: ${expression('needs.reconciliation.outputs.result_digest')}
`;
  const producer = `  reconciliation:
    name: Reconcile GitHub records
    if: ${expression("github.ref == format('refs/heads/{0}', github.event.repository.default_branch) && " + (night ? "(github.event_name == 'schedule' || github.event_name == 'workflow_dispatch')" : "github.event_name == 'push'"))}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      pull-requests: read
      actions: read
    outputs:
      artifact_id: ${expression('steps.archive.outputs.artifact-id')}
      artifact_digest: ${expression('steps.archive.outputs.artifact-digest')}
      result_digest: ${expression('steps.observe.outputs.digest')}
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${expression('github.sha')}
          fetch-depth: 1
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24.22.1
      - name: Observe pull requests
        id: observe
        env:
${metadata}          GH_TOKEN: ${expression('github.token')}
          PLATES_RECONCILE_TOKEN: ${expression('secrets.PLATES_RECONCILE_TOKEN')}
        run: node scripts/plates/reconcile-actions.mjs --produce
      - name: Keep reconciliation result
        id: archive
        uses: actions/upload-artifact@v7
        with:
          name: plates-reconciliation-${expression('github.run_id')}-${expression('github.run_attempt')}
          path: ${expression('runner.temp')}/result.json
          if-no-files-found: error
          retention-days: 1
${night ? '' : `      - name: Reconciliation verdict
        env:
          STATUS: ${expression('steps.observe.outputs.status')}
        run: exit "$STATUS"
`}
`;
  text = text.replace('jobs:\n', 'jobs:\n' + producer);
  if (!night) {
    text = text.replace(/            if \[ "\$EVENT" = push \][\s\S]*?            fi\n/, '');
    return text;
  }
  text = text.replace('  night:\n', `  night:\n    needs: [reconciliation]\n    if: ${expression('!cancelled()')}\n`);
  text = text.replace('      - name: Read the config\n', `      - name: Restore trusted reconciliation
        continue-on-error: true
        env:
${snapshotEnv}        run: node scripts/plates/reconcile-actions.mjs --restore
      - name: Read the config
`);
  text = text.replace('          PLATES_NIGHT_RECOVERY: "1"\n', `          PLATES_NIGHT_RECOVERY: "1"\n          PLATES_RECONCILE_REQUIRED: "1"\n${snapshotEnv}`);
  return text;
}
