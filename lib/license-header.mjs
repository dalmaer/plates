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
// one blank line. A header that belongs on only some of plates's files (a
// copyright holder's notice is not true of files someone else wrote) takes
// the object form, which names them:
//
//   "licenseHeader": { "lines": ["Copyright 2026 Acme Widgets"],
//                      "paths": [".github/workflows/plates-*.yml"] }
//
// where * matches within one path segment and ** across segments. An empty entry is a bare comment marker. Files without line
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

const WHERE = '.plates/plates.json: "licenseHeader"';

function checkLines(lines, where) {
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_LINES) fail(`${where} must be a list of 1 to ${MAX_LINES} lines`);
  for (const [i, line] of lines.entries()) {
    if (typeof line !== 'string') fail(`${where}[${i}] must be a string`);
    if (line.length > MAX_LINE) fail(`${where}[${i}] is longer than ${MAX_LINE} characters`);
    if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(line)) fail(`${where}[${i}] must be one line of plain text`);
  }
  if (!lines[0].trim()) fail(`${where} must not start with an empty line`);
  return lines;
}

/** A path pattern as a whole-path regular expression: * within a segment, ** across segments. */
export function pathPattern(pattern) {
  const source = pattern.split(/(\*\*|\*)/).map(part => part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('');
  return new RegExp(`^${source}$`);
}

/**
 * The configured header, or null when the project sets none: its lines, and
 * the patterns of the paths it is limited to (null: every file that takes one).
 * Throws on a malformed setting.
 */
export function licenseHeaderOf(config = {}) {
  const value = config.licenseHeader;
  if (value === undefined) return null;
  if (Array.isArray(value)) return { lines: checkLines(value, WHERE), paths: null };
  if (!value || typeof value !== 'object' || Object.keys(value).some(k => k !== 'lines' && k !== 'paths')) fail(`${WHERE} must be a list of lines, or {"lines": [...], "paths": [...]}`);
  const lines = checkLines(value.lines, `${WHERE}.lines`);
  if (value.paths === undefined) return { lines, paths: null };
  if (!Array.isArray(value.paths) || !value.paths.length || value.paths.length > 100) fail(`${WHERE}.paths must be a list of 1 to 100 project paths`);
  const paths = value.paths.map((p, i) => {
    if (typeof p !== 'string' || !p || p.length > 200 || p.startsWith('/') || p.includes('\\') || p.split('/').some(s => !s || s === '.' || s === '..')) fail(`${WHERE}.paths[${i}] must be a path inside the project, like .github/workflows/plates-*.yml`);
    return pathPattern(p);
  });
  return { lines, paths };
}

/** The configured header's lines, or null when the project sets none. */
export const licenseHeaderLines = config => licenseHeaderOf(config)?.lines ?? null;

/** `text` (the rendered bytes of the file at `path`) with the project's header, when it has one and the file takes it. */
export function shapeLicenseHeader(text, config, path) {
  const header = licenseHeaderOf(config);
  const mark = header && COMMENT[extname(path).toLowerCase()];
  if (!mark || (header.paths && !header.paths.some(p => p.test(path)))) return text;
  const { lines } = header;
  const block = `${lines.map(line => line ? `${mark} ${line}`.trimEnd() : mark).join('\n')}\n\n`;
  if (!text.startsWith('#!')) return block + text;
  const end = text.indexOf('\n');
  return end === -1 ? `${text}\n${block}` : text.slice(0, end + 1) + block + text.slice(end + 1);
}
