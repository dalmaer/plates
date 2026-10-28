import { captureContext, contextLines, terminalText } from './src/context.mjs';
import { readEvidenceDirectory } from './src/read-evidence.mjs';
import { projectEvidence } from './src/evidence.mjs';

/** Explicit, opt-in Pi 1.4.0 extension. No model call, writes, subprocess, or network. */
export default function platesInspector(pi) {
  pi.registerCommand('plates-inspect', {
    description: 'Inspect Pi-supplied instruction provenance and evidence gaps (read-only)',
    handler: async (args, ctx) => {
      const snapshot = captureContext(ctx);
      let evidence = projectEvidence();
      if (args.trim()) {
        try { evidence = await readEvidenceDirectory(args.trim()); }
        catch (error) { evidence.findings = [{ code: 'evidence_unreadable', detail: error.message }]; }
      }
      if (!ctx.hasUI) return;
      const evidenceLines = evidence.checks.length ? evidence.checks.map(c => terminalText(`${c.status.toUpperCase()} · ${c.id} · caller-supplied record`)) : ['EVIDENCE UNKNOWN · No usable execution receipts attached.'];
      ctx.ui.setWidget('plates-context', [...contextLines(snapshot), ...evidenceLines, 'Advisory only · no gate reuse or model receipt verified']);
      const choice = await ctx.ui.select('Plates inspector · no model request', ['Instructions and provenance', 'Evidence and assumptions', 'Close']);
      if (choice === 'Instructions and provenance') {
        // Editor is a stock Pi viewer; returned edits are deliberately discarded.
        await ctx.ui.editor('Captured context · close to return; edits are discarded', JSON.stringify(snapshot, null, 2));
      } else if (choice === 'Evidence and assumptions') {
        await ctx.ui.editor('Evidence · caller-supplied, advisory only', JSON.stringify({ evidence, assumptions: snapshot.assumptions }, null, 2));
      }
    },
  });
  pi.registerCommand('plates-inspect-clear', {
    description: 'Remove the context inspector widget',
    handler: async (_args, ctx) => { if (ctx.hasUI) ctx.ui.setWidget('plates-context', undefined); },
  });
}
