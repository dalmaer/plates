// One browser-safe source renderer. Escape all source bytes before admitting
// emphasis, code and HTTPS links; raw HTML and other URL schemes stay text.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const https = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !/[\s\x00-\x1f\x7f]/.test(value) ? url.href : null; }
  catch { return null; }
};
export function inlineMarkdown(text, { links = true } = {}) {
  const codeSources = new Map();
  const saved = [], hold = html => `\0${saved.push(html) - 1}\0`;
  // Placeholders cannot be supplied by source text. Code is opaque to emphasis
  // and links, including literal markdown examples inside a code span.
  const marked = String(text ?? '').replace(/\0/g, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/`([^`\n]+)`/g, (_, body) => { const index = saved.length; codeSources.set(index, body); return hold(`<code>${escape(body)}</code>`); })
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_, label, target) => {
      const href = links ? https(target) : null;
      label = label.replace(/\0(\d+)\0/g, (_, index) => '`' + (codeSources.get(Number(index)) ?? '') + '`');
      return hold(href ? `<a href="${escape(href)}" rel="noreferrer">${inlineMarkdown(label, {links:false})}</a>` : inlineMarkdown(label, {links:false}));
    });
  return escape(marked)
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?=\S)([^_\n]*?\S)_(?![_\w])/g, '$1<em>$2</em>')
    .replace(/\*\*|`/g, '')
    .replace(/\0(\d+)\0/g, (_, index) => saved[Number(index)] ?? '');
}
export function markdownView(text) {
  const blocks = [], paragraph = [];
  let items = [], ordered = false;
  const flushParagraph = () => { if (paragraph.length) blocks.push(`<p>${paragraph.splice(0).map(line => inlineMarkdown(line)).join('<br>')}</p>`); };
  const flushList = () => { if (items.length) { const tag = ordered ? 'ol' : 'ul'; blocks.push(`<${tag}>${items.map(line => `<li>${inlineMarkdown(line)}</li>`).join('')}</${tag}>`); items = []; } };
  for (const raw of String(text ?? '').replace(/<!--[\s\S]*?-->/g,'').replace(/\r/g,'').split('\n')) {
    const line = raw.trim(), item = /^(?:([-*])|\d+\.)\s+(.+)$/.exec(line);
    if (!line) { flushParagraph(); flushList(); continue; }
    if (item) { flushParagraph(); const nextOrdered = !item[1]; if (items.length && ordered !== nextOrdered) flushList(); ordered = nextOrdered; items.push(item[2]); }
    else { flushList(); paragraph.push(line.replace(/^#{1,6} /, '')); }
  }
  flushParagraph(); flushList();
  return blocks.join('');
}
