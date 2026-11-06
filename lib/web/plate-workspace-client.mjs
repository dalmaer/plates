// Delegated events survive explicit Home updates. Selection/filter state stays
// in memory; no private records or previews enter browser storage.
export function startPlateWorkspace({root, document}) {
  if (!root?.addEventListener || !root?.querySelector) return null;
  let type = 'all', query = '', selected = null, reading = false;
  const workspace = () => root.querySelector('[data-plate-workspace]');
  const rows = () => [...(workspace()?.querySelectorAll('[data-message-row]') ?? [])];
  const visible = () => rows().filter(row => !row.hidden);
  function select(key, {focus = false, showReader = true} = {}) {
    const box = workspace(); if (!box) return;
    const available = visible(); selected = available.some(r=>r.dataset.messageKey===key) ? key : null;
    for (const row of rows()) {
      const link = row.querySelector('[data-message-open]'), active = row.dataset.messageKey === selected;
      if (active) link.setAttribute('aria-current','true'); else link.removeAttribute('aria-current');
      if (active && focus) { link.focus({preventScroll:true}); row.scrollIntoView({block:'nearest'}); }
    }
    for (const detail of box.querySelectorAll('[data-message-detail]')) detail.hidden = detail.dataset.messageDetail !== selected;
    box.querySelector('[data-message-placeholder]').hidden = Boolean(selected);
    box.querySelector('.message-reader-tools').hidden = !selected;
    reading = Boolean(selected) && showReader;
    box.dataset.reading = String(reading);
    const index = available.findIndex(r=>r.dataset.messageKey===selected);
    box.querySelector('[data-message-position]').textContent = selected ? `${index+1} of ${available.length}` : '';
    box.querySelector('[data-message-prev]').disabled = index <= 0;
    box.querySelector('[data-message-next]').disabled = index < 0 || index >= available.length-1;
  }
  function sync() {
    const box = workspace(); if (!box) return;
    box.dataset.enhanced = 'true';
    const field = box.querySelector('[data-message-search]'); if (field.value !== query) field.value = query;
    for (const row of rows()) row.hidden = (type !== 'all' && row.dataset.messageKind !== type) || !row.dataset.messageSearch.includes(query.trim().toLowerCase());
    for (const group of box.querySelectorAll('[data-message-group]')) group.hidden = ![...group.querySelectorAll('[data-message-row]')].some(r=>!r.hidden);
    for (const button of box.querySelectorAll('[data-message-type]')) {
      button.setAttribute('aria-pressed',String(button.dataset.messageType===type));
      if (button.dataset.messageType===type) box.querySelector('.message-toolbar h2').textContent=button.firstElementChild.textContent;
    }
    box.querySelector('[data-message-empty]').hidden = visible().length>0;
    select(selected,{showReader:reading});
  }
  function move(delta, focus = false) {
    const available=visible(), index=available.findIndex(r=>r.dataset.messageKey===selected);
    const next=index<0 ? 0 : Math.min(available.length-1,Math.max(0,index+delta));
    if (available[next]) select(available[next].dataset.messageKey,{focus,showReader:!focus || !document.defaultView?.matchMedia('(max-width:950px)').matches});
  }
  function click(event) {
    const box=workspace(); if (!box?.contains(event.target)) return;
    const filter=event.target.closest('[data-message-type]'), link=event.target.closest('[data-message-open]');
    if (filter) { type=filter.dataset.messageType; sync(); }
    else if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); select(link.dataset.messageOpen); if (document.defaultView?.matchMedia('(max-width:950px)').matches) box.querySelector('[data-message-detail]:not([hidden])')?.focus({preventScroll:true}); }
    else if (event.target.closest('[data-message-prev]')) move(-1);
    else if (event.target.closest('[data-message-next]')) move(1);
    else if (event.target.closest('[data-message-back]')) { reading=false; box.dataset.reading='false'; const row=visible().find(r=>r.dataset.messageKey===selected); row?.querySelector('a').focus(); }
  }
  function input(event) { if (event.target.matches('[data-message-search]')) { query=event.target.value; sync(); } }
  function keydown(event) {
    if (!event.target.closest('[data-plate-workspace]') || event.target.closest('input,textarea,select,[contenteditable]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest('[data-message-open]') && ['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); selected=event.target.closest('[data-message-open]').dataset.messageOpen; move(event.key==='ArrowDown'?1:-1,true); }
    if (event.key==='Escape') { const box=workspace(); reading=false; box.dataset.reading='false'; visible().find(r=>r.dataset.messageKey===selected)?.querySelector('a').focus(); }
  }
  root.addEventListener('click',click); root.addEventListener('input',input); root.addEventListener('keydown',keydown); sync();
  return {sync, stop(){root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('keydown',keydown);}};
}
