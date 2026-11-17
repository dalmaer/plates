import {inlineMarkdown, markdownView} from './markdown.mjs';
import {safeSourceLink} from './source-links.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const list = v => Array.isArray(v) ? v : [];
const keyId = key => `item-${encodeURIComponent(key)}`;
function source(item, project) {
  const direct = safeSourceLink(item.source?.url);
  if (direct) return direct;
  const file = item.source?.file, revision = item.source?.revision;
  return /^[\w.-]+\/[\w.-]+$/.test(project?.repo ?? '') && /^[a-f0-9]{40}$/.test(revision ?? '') && typeof file === 'string' && !file.split('/').includes('..')
    ? safeSourceLink(`https://github.com/${project.repo}/blob/${revision}/${file.split('/').map(encodeURIComponent).join('/')}`) : null;
}
function assignment(item, recommendation) {
  if (!item.canAssign) return '';
  if (item.assignUnavailable) return `<details class="simple-assign" data-detail="assign-${esc(item.key)}"><summary data-focus="assign-${esc(item.key)}">Assign</summary><p>${esc(item.assignUnavailable)}</p></details>`;
  return `<details class="simple-assign" data-detail="assign-${esc(item.key)}"><summary data-focus="assign-${esc(item.key)}">Assign</summary><p>${esc(recommendation.why)}</p><p class="meta">Run a preview in this project’s checkout. Review it before approving the attachment. Assigning from this site is not available yet.</p><ul>${item.assign.map(a => `<li${a.recommended ? ' data-recommended="true"' : ''}><strong>${esc(a.provider)}${a.recommended ? ' · Recommended' : ''}</strong> · ${a.route === 'local-host' ? 'Agent on this Mac' : 'Session'}<code class="glance-command">${esc(a.command)}</code><button type="button" class="quiet" data-copy="${esc(a.command)}" data-focus="copy-${esc(item.key)}-${esc(a.route)}-${esc(a.provider)}">Copy preview command</button></li>`).join('')}</ul><p data-copy-status role="status" aria-live="polite"></p></details>`;
}
function itemRow(item, model, project) {
  const href = source(item, project);
  const decisionKeys = new Set([item.key, ...list(item.children)]);
  const cards = model.cards.filter(c => decisionKeys.has(c.key));
  const status = item.state ? `<span class="simple-state" data-state="${esc(item.state)}">${esc(item.state)}</span>` : '';
  const blocked = item.blocked.length ? `<details class="simple-blocked" data-detail="blocked-${esc(item.key)}"><summary>Work waiting on this item (${item.blocked.length})</summary><ol>${item.blocked.map(row => itemRow(row,model,project)).join('')}</ol></details>` : '';
  return `<li class="simple-item" data-item="${esc(item.key)}"><details id="${esc(keyId(item.key))}" data-detail="item-${esc(item.key)}"><summary data-focus="item-${esc(item.key)}">${status}<span class="simple-title">${inlineMarkdown(item.title)}</span>${item.holder?.provider ? `<span class="simple-agent">${esc(item.holder.provider)}</span>` : ''}</summary><div class="simple-item-body">${item.done ? `<h3>Done when</h3>${markdownView(item.done)}` : ''}${item.next ? `<h3>Next</h3>${markdownView(item.next)}` : ''}${!item.state && list(item.why ?? item.reasons).length ? `<p class="meta">${list(item.why ?? item.reasons).map(inlineMarkdown).join(' · ')}</p>` : ''}${item.holder ? `<p class="meta">Agent: ${esc(item.holder.provider ?? 'unknown')}${item.presence ? ` · ${esc(item.presence === 'claimed' ? 'assigned; activity not observed' : item.presence)}` : ''}</p>` : ''}${cards.map(c=>`<p><a href="#decision-${encodeURIComponent(c.key)}">Answer the decision above</a></p>`).join('')}${href ? `<p><a href="${esc(href)}" rel="noreferrer">Source details ↗</a></p>` : ''}${blocked}</div></details>${assignment(item,model.recommendation)}</li>`;
}
export function renderSimpleProject(model, project) {
  if (!model) return '';
  const items = model.items.length ? `<section class="home-section simple-backlog" aria-labelledby="backlog-title"><h2 id="backlog-title">Backlog</h2><ol>${model.items.map(item => itemRow(item,model,project)).join('')}</ol></section>` : '';
  const waiting = model.waiting.length ? `<details class="simple-blocked" data-detail="waiting-work"><summary>Other work, waiting (${model.waiting.length})</summary><ol>${model.waiting.map(item => itemRow(item,model,project)).join('')}</ol></details>` : '';
  const gaps = model.gaps.length ? `<ul class="simple-gaps" aria-label="Unavailable sources">${model.gaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul>` : '';
  return `${items}${waiting}${gaps}`;
}
