import { createHash } from 'node:crypto';
const hash = text => createHash('sha256').update(text).digest('hex');

/** Observe only Pi-supplied values. Never infer loaded files from a disk scan. */
export function captureContext(ctx, { now = new Date().toISOString(), demo = false } = {}) {
  const gaps = [];
  let prompt, options;
  try { prompt = ctx.getSystemPrompt?.(); } catch { gaps.push('Effective prompt unavailable.'); }
  try { options = ctx.getSystemPromptOptions?.(); } catch { gaps.push('Base construction options unavailable.'); }
  if (typeof prompt !== 'string') gaps.push('No effective prompt supplied by Pi.');
  const supplied = Array.isArray(options?.contextFiles);
  if (!supplied) gaps.push('Loaded-file provenance unknown: this context has no contextFiles API value.');
  const instructions = (supplied ? options.contextFiles : []).map((file, index) => {
    if (typeof file?.path !== 'string' || typeof file?.content !== 'string') {
      gaps.push(`Invalid context file at index ${index}.`);
      return { path: '(unknown)', status: 'unknown', sha256: null, content: null, provenance: 'invalid API entry' };
    }
    // Pi 1.4.0 wraps each source in this exact project_instructions element.
    // An occurrence is evidence of bytes, not a guarantee of causal origin.
    const wrapped = `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>`;
    const present = typeof prompt === 'string' && prompt.includes(wrapped);
    return {
      path: file.path, content: file.content, sha256: hash(file.content),
      status: present ? 'captured' : 'unknown',
      provenance: 'Pi command getSystemPromptOptions().contextFiles (base construction inputs)',
      effectivePromptMatch: present,
      detail: present ? 'Exact wrapped bytes occur in the captured effective prompt.' : 'Supplied as base input; inclusion in the effective prompt is unverified.',
    };
  });
  return {
    schema: 1, demo, capturedAt: now, cwd: ctx.cwd ?? null,
    boundary: 'Command-time observation; no provider request or model receipt verified.',
    promptSha256: typeof prompt === 'string' ? hash(prompt) : null,
    instructions, gaps,
    skills: (options?.skills ?? []).map(s => ({ name: s.name, path: s.filePath ?? null, status: 'available; full instructions not verified loaded' })),
    assumptions: [
      'Pi-supplied paths are attribution, not an authenticated filesystem origin.',
      'The command exposes base inputs; run hooks and later request transformations can change prompt content.',
      'Skill discovery does not prove the skill body was loaded. No recursive instruction discovery is performed.',
      'Captured prompt bytes do not prove the model received or obeyed them.',
    ],
  };
}

// Remove terminal control characters before passing untrusted text to Pi TUI widgets.
export const terminalText = text => String(text).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');

export function contextLines(snapshot) {
  return [
    `${snapshot.demo ? 'DEMO · ' : ''}Plates context · ${snapshot.instructions.length} API context files`,
    snapshot.boundary,
    ...snapshot.instructions.map(i => `${i.status.toUpperCase()} · ${i.path} · ${i.sha256 ?? 'unknown digest'}`),
    ...snapshot.gaps.map(g => `UNKNOWN · ${g}`),
  ].map(terminalText);
}
