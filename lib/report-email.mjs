// Visual reference: dalmaer/ledger jobs/morning-brief.ts, STYLE,
// eeb975ab0be6f1690606f5821566e77d5d52f409 (no license file declared).
// Independent implementation of the owner's requested visual treatment;
// no Ledger implementation or private report data is copied.
// A deliberately small Markdown dialect for authored fleet digests, not a
// general Markdown engine. Raw HTML and unsupported syntax stay visible text.

const escape = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif";
const MONO = "ui-monospace,Menlo,Consolas,'Courier New',monospace";
const INK = '#1a1a1a', MUTED = '#666666', URGENT = '#b3261e';
const P = 'margin:10px 0;';
// Exact authored labels only: this does not infer severity from report prose.
const ATTENTION = new Set(['needs attention', 'failures and decisions needing attention']);

function safeLink(value) {
  try { return /^https?:\/\//i.test(value) && ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}

/** Render only authored emphasis, code and HTTP(S) links; never execute HTML. */
function inline(source, depth = 0) {
  if (depth > 12) return escape(source);
  let html = '', i = 0;
  while (i < source.length) {
    if (source[i] === '\\' && /[\\`*_[\]()!]/.test(source[i + 1] ?? '')) {
      html += escape(source[i + 1]); i += 2; continue;
    }
    if (source[i] === '`') {
      const ticks = source.slice(i).match(/^`+/)[0];
      const end = source.indexOf(ticks, i + ticks.length);
      if (end >= 0) {
        html += `<code style="font-family:${MONO};font-size:13px;font-weight:400;color:${MUTED};background-color:#f3f4f6;overflow-wrap:anywhere;word-break:break-word;">${escape(source.slice(i + ticks.length, end))}</code>`;
        i = end + ticks.length; continue;
      }
    }
    // Images are not fetched; keep their Markdown visible, including the URL.
    if (source[i] === '[' && source[i - 1] !== '!') {
      const labelEnd = source.indexOf('](', i + 1);
      if (labelEnd >= 0) {
        let end = labelEnd + 2, nesting = 1;
        for (; end < source.length && nesting; end++) {
          if (source[end] === '(') nesting++;
          else if (source[end] === ')') nesting--;
        }
        if (!nesting) {
          const url = source.slice(labelEnd + 2, end - 1);
          if (safeLink(url)) {
            html += `<a href="${escape(url)}" style="color:#175c83;text-decoration:underline;overflow-wrap:anywhere;word-break:break-word;">${inline(source.slice(i + 1, labelEnd), depth + 1)}</a>`;
            i = end; continue;
          }
          // Preserve rejected link syntax and destination as inert text.
          html += escape(source.slice(i, end)); i = end; continue;
        }
      }
    }
    const marker = source.startsWith('**', i) ? '**' : source[i] === '*' ? '*' : null;
    if (marker) {
      const end = source.indexOf(marker, i + marker.length);
      if (end > i + marker.length) {
        const tag = marker === '**' ? 'strong' : 'em';
        html += `<${tag}${tag === 'strong' ? ' style="font-weight:600;"' : ''}>${inline(source.slice(i + marker.length, end), depth + 1)}</${tag}>`;
        i = end + marker.length; continue;
      }
    }
    html += escape(source[i++]);
  }
  return html;
}

/** Pure formatting: no files, clocks, report collection, delivery or state. */
export function renderReportEmail(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('report Markdown must be a string');
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const title = lines.find(line => /^# /.test(line))?.slice(2) ?? 'Fleet report';
  const out = [];
  let paragraph = [], list = null, firstParagraph = true;
  function flush() {
    if (paragraph.length) {
      const text = paragraph.join('\n');
      const metadata = (firstParagraph && /^\*\*Window:\*\*/.test(text)) || /^Report identity:/.test(text);
      out.push(`<p style="${P}${metadata ? `color:${MUTED};font-size:13px;` : ''}">${inline(text)}</p>`);
      firstParagraph = false; paragraph = [];
    }
    if (list) { out.push(`</${list}>`); list = null; }
  }
  for (const line of lines) {
    const heading = /^(#{1,6}) (.+)$/.exec(line);
    const item = /^(?:([-*]) |(\d+)\. )(.+)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (heading) {
      flush();
      const level = heading[1].length, label = heading[2];
      const style = level === 1
        ? `font-size:18px;line-height:1.35;margin:0 0 6px;color:${INK};font-weight:700;`
        : `font-size:12px;line-height:1.5;text-transform:uppercase;letter-spacing:.07em;color:${ATTENTION.has(label.toLowerCase()) ? URGENT : MUTED};margin:26px 0 8px;font-weight:600;`;
      out.push(`<h${level} style="${style}">${inline(label)}</h${level}>`);
    } else if (item) {
      const kind = item[2] ? 'ol' : 'ul';
      if (paragraph.length || (list && list !== kind)) flush();
      if (!list) {
        list = kind;
        out.push(`<${kind} style="margin:0;padding-left:22px;"${kind === 'ol' ? ` start="${Number(item[2])}"` : ''}>`);
      }
      out.push(`<li${kind === 'ol' ? ` value="${Number(item[2])}"` : ''} style="margin:8px 0;padding-left:2px;">${inline(item[3])}</li>`);
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  // Layout tables and inline styling survive clients that strip head CSS.
  // A fixed Outlook wrapper bounds desktop width; other clients stay fluid.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background-color:#edf2f7;color:${INK};font-family:${FONT};font-size:15px;line-height:1.55;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;background-color:#edf2f7;"><tr><td align="center" style="padding:16px 8px;">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;table-layout:fixed;background-color:#ffffff;"><tr><td style="padding:24px 20px 30px;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK};overflow-wrap:anywhere;word-wrap:break-word;">
${out.join('\n')}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>\n`;
}
