// A project's licence header on the files plates writes. Some projects must
// open every source file with one (an Apache-2.0 notice naming the copyright
// holder, say), and a header added by hand to a managed file is drift that
// stops plates update. The project names it once in .plates/plates.json:
//
//   "licenseHeader": [
//     "Copyright 2026 Acme Widgets",
//     "",
//     "Licensed under the Apache License, Version 2.0 (the \"License\");"
//   ]
//
// and render puts it, commented for the file's language, at the top of each
// managed or seeded file that has line comments (after a #! line), followed by
// one blank line. An empty entry is a bare comment marker. Files without line
// comments (JSON, Markdown) and symlinks are unchanged, as are blocks: a block
// lives inside a file that is the project's own. The header is part of the
// bytes plates writes, so the lock records it and drift reads past it. Without
// "licenseHeader", every file is the template's bytes.
import { extname } from 'node:path';

const fail = message => { throw new Error(message); };

/** The line-comment marker for a target, by extension; none: the file takes no header. */
export const COMMENT = Object.freeze({
  '.yml': '#', '.yaml': '#', '.sh': '#', '.py': '#', '.toml': '#',
  '.mjs': '//', '.js': '//', '.cjs': '//', '.ts': '//', '.mts': '//', '.cts': '//',
});
export const MAX_LINES = 40, MAX_LINE = 200;

/** The configured header's lines, or null when the project sets none. Throws on a malformed one. */
export function licenseHeaderLines(config = {}) {
  const lines = config.licenseHeader;
  if (lines === undefined) return null;
  const where = '.plates/plates.json: "licenseHeader"';
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_LINES) fail(`${where} must be a list of 1 to ${MAX_LINES} lines`);
  for (const [i, line] of lines.entries()) {
    if (typeof line !== 'string') fail(`${where}[${i}] must be a string`);
    if (line.length > MAX_LINE) fail(`${where}[${i}] is longer than ${MAX_LINE} characters`);
    if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(line)) fail(`${where}[${i}] must be one line of plain text`);
  }
  if (!lines[0].trim()) fail(`${where} must not start with an empty line`);
  return lines;
}

/** `text` (the rendered bytes of the file at `path`) with the project's header, when it has one and the file takes it. */
export function shapeLicenseHeader(text, config, path) {
  const lines = licenseHeaderLines(config);
  const mark = lines && COMMENT[extname(path).toLowerCase()];
  if (!mark) return text;
  const header = `${lines.map(line => line ? `${mark} ${line}`.trimEnd() : mark).join('\n')}\n\n`;
  if (!text.startsWith('#!')) return header + text;
  const end = text.indexOf('\n');
  return end === -1 ? `${text}\n${header}` : text.slice(0, end + 1) + header + text.slice(end + 1);
}
