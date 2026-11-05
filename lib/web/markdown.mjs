// Source markdown, read safely (phase 153), shared by server and browser views.
// Every character is escaped first; only `code`, **bold**, *italic*, paragraphs,
// headings and "- " lists become markup. HTML comments are dropped and stray
// ** and backticks are removed, so no raw markers show.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
export function inlineMarkdown(text) {
  const code = [];
  // Code spans become NUL-delimited placeholders, so **`name`** can wrap one.
  const marked = String(text ?? '').replace(/\0/g, '').replace(/`([^`\n]+)`/g, (_, body) => `\0${code.push(body) - 1}\0`);
  return escape(marked)
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/\*\*|`/g, '')
    .replace(/\0(\d+)\0/g, (_, index) => `<code>${escape(code[Number(index)])}</code>`);
}
export function markdownView(text) {
  return String(text ?? '').replace(/<!--[\s\S]*?-->/g,'').replace(/\r/g,'').split(/\n[ \t]*\n/).map(block => block.trim()).filter(Boolean).map(block => {
    const lines=block.split('\n');
    if(lines.every(line=>/^[-*] /.test(line)))return `<ul>${lines.map(line=>`<li>${inlineMarkdown(line.slice(2))}</li>`).join('')}</ul>`;
    if(/^#{1,6} /.test(block))return `<h3>${inlineMarkdown(block.replace(/^#{1,6} /,''))}</h3>`;
    return `<p>${lines.map(inlineMarkdown).join('<br>')}</p>`;
  }).join('');
}
